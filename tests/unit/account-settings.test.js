// Settings per account (cut out of main.js): the job settings of one account never change another account, a page of one account can never write into
// another (the Realistic Mode queue of one account used to replace the other's after a switch), and a change reaches only the jobs of its own account.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

// a top level function of main.js, by name
function fn(name) {
  const a = src.indexOf('\nfunction ' + name + '(');
  if (a < 0) throw new Error('no function ' + name);
  const b = src.indexOf('\n}\n', a);
  return src.slice(a, b + 3);
}
const constant = (name) => { const m = src.match(new RegExp('const ' + name + ' = [\\s\\S]*?;\\n')); if (!m) throw new Error('no ' + name); return m[0]; };

const written = [];
const jobsTouched = [];
const ctx = {
  JSON, Object, Array, Set, String, Number, Math, console,
  settings: { theme: 'dark', grDurationSec: 7200, farmMaxMinutes: 15, pauseFarmOnBoost: true },
  saveSettings: () => true, applySettings: () => {}, log: () => {}, translation: { pickLang: () => {} }, setupTrayMenu: () => {},
  resumeSaveSoon: () => {}, pruneAccountRecords: () => 0, tokenProtectionAvailable: () => true, rewriteTokenFiles: () => {},
  cleanAppIds: (l) => l, windowFit: { normalizeScale: (x) => x }, parseProxy: () => ({ ok: true, empty: true }),
  applyParentalPin: () => {}, applyActiveProxy: () => {},
  writeAccountData: (id) => written.push(id),
  accountName: (id) => 'acct' + id,
  accountBoostRunning: () => false, delayFarm: () => false, resumeFarm: () => {},
  applyAndContinueCardFarm: (id) => { jobsTouched.push(id); return true; }, applyAndContinueBoost: () => false,
  CARD_JOB_SETTINGS: ['cardMaxGames', 'farmMaxMinutes', 'autoNextGame', 'fastMinPlaytimeMin', 'fastRotateMinSec', 'fastRotateMaxSec'],
  store: {},
};
vm.createContext(ctx);
vm.runInContext([
  constant('ACCOUNT_SETTING_KEYS'), constant('ACCOUNT_SCOPED_SETTINGS'), constant('ACCOUNT_SCOPED'), constant('SESSION_FIELDS'),
  'let activeSteamID = "A"; let settingSaveTime = 0;',
  'const accounts = new Map([["A", { farm: { running: true } }], ["B", { farm: { running: true } }]]);',
  'function accountData(id) { if (!store[id]) store[id] = { jobSettings: {}, grQueue: [] }; return store[id]; }',
  'function activeAccountData() { return accountData(activeSteamID); }',
  fn('settingFor'), fn('accountSettingsAdded'), fn('applySettingPatch'), fn('applySettingsToJobs'),
  'this.api = { settingFor, accountSettingsAdded, applySettingPatch, scoped: ACCOUNT_SCOPED, setActive: (id) => { activeSteamID = id; } };',
].join('\n'), ctx);
const { settingFor, accountSettingsAdded, applySettingPatch, setActive } = ctx.api;

check('an account that never changed a job setting reads the general value', settingFor('A', 'grDurationSec') === 7200 && settingFor('B', 'grDurationSec') === 7200);
let r = applySettingPatch({ grDurationSec: 3600 }, 'A');
check('a job setting changed on account A is kept with A', r.ok && settingFor('A', 'grDurationSec') === 3600 && ctx.store.A.jobSettings.grDurationSec === 3600 && written.includes('A'));
check('and changes nothing on account B or in the general settings', settingFor('B', 'grDurationSec') === 7200 && ctx.settings.grDurationSec === 7200);
setActive('B');
applySettingPatch({ grDurationSec: 18000 }, 'B');
check('B gets its own value, A keeps its own', settingFor('B', 'grDurationSec') === 18000 && settingFor('A', 'grDurationSec') === 3600);
check('the page sees the values of the account on screen, and which account that is', accountSettingsAdded({ ...ctx.settings }).grDurationSec === 18000 && accountSettingsAdded({}).settingsAccount === 'B');
setActive('A');
check('switching back shows A its own values again', accountSettingsAdded({ ...ctx.settings }).grDurationSec === 3600 && accountSettingsAdded({}).settingsAccount === 'A');

// a page of B writes after the switch to A: its account values are not written into A
ctx.store.A.grQueue = [636150];
applySettingPatch({ grQueue: [1486630], grDurationSec: 60, theme: 'light' }, 'B');
check('a write from a page of another account does not touch the account on screen (the queue that replaced the other one)', JSON.stringify(ctx.store.A.grQueue) === '[636150]' && settingFor('A', 'grDurationSec') === 3600);
check('its general settings still go through', ctx.settings.theme === 'light');
applySettingPatch({ grQueue: [10, 20] }, 'A');
check('a write from the page of the account on screen is written', JSON.stringify(ctx.store.A.grQueue) === '[10,20]');
applySettingPatch({ grQueue: [30] });
check('a write that names no account (before an account is known) is handled as before', JSON.stringify(ctx.store.A.grQueue) === '[30]');

// a change reaches only the jobs of its own account
jobsTouched.length = 0;
r = applySettingPatch({ farmMaxMinutes: 30 }, 'A');
check('a job setting changed on A restarts the card farm of A only', JSON.stringify(jobsTouched) === '["A"]' && r.changedOne.includes('farmMaxMinutes'), JSON.stringify(jobsTouched));
check('B keeps the general value', settingFor('B', 'farmMaxMinutes') === 15);
setActive(null);
jobsTouched.length = 0;
applySettingPatch({ farmMaxMinutes: 20 });
check('without an account the job setting goes to the general settings (the first start)', ctx.settings.farmMaxMinutes === 20 && settingFor('B', 'farmMaxMinutes') === 20 && settingFor('A', 'farmMaxMinutes') === 30);
check('and a general change does not restart a job of an account that has its own value', !jobsTouched.includes('A') && jobsTouched.includes('B'), JSON.stringify(jobsTouched));
check('every job setting of the card, hour, Realistic Mode and achievement pages is per account; the schedules too; the look is not', ['cardPriorityMode', 'farmMaxMinutes', 'boostMaxGames', 'grDurationSec', 'grDiff', 'grModel', 'achDelay'].every((k) => ctx.api.scoped.has(k)) && ['grScheduleEnabled', 'farmScheduleEnabled'].every((k) => ctx.api.scoped.has(k)) && !['theme', 'language', 'notifications'].some((k) => ctx.api.scoped.has(k)));
process.exit(failures ? 1 : 0);
