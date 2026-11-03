// "Unlock achievements while farming": one achievement every 20 to 40 minutes, the first one not before that time has passed (it used to be one a minute).
// Run with `npm test` (tests/run.js).
const vm = require('vm');
const src = require('../main-source')();
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('async function openCardAchievements(steamID)'), src.indexOf('// "Pause farming while boosting hours"'));

(async () => {
  let clock = 1000000000000;
  const unlocked = [];
  const watcher = { lastAchievement: clock, achievementBusy: false };
  const s = { watcher, farm: { running: true, currentActiveAppid: 440 }, ready: true,
    engine: { getAchievements: async () => ({ gameName: 'G', achievements: [{ apiName: 'a', name: 'A', achieved: false }, { apiName: 'b', name: 'B', achieved: false }] }), setAchievements: async (_a, list) => { unlocked.push(list[0].apiName); } } };
  const ctx = { console, Math, Date: class { static now() { return clock; } }, accounts: new Map([['1', s]]), settingFor: () => true,
    accountData: () => ({ achLog: [] }), writeAccountDataDelayed: () => {}, accountEvent: () => {}, accountName: () => 'x', log: () => {} };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.run = openCardAchievements;', ctx);
  await ctx.run('1'); clock += 19 * 60000; await ctx.run('1');
  check('nothing is unlocked in the first 19 minutes', unlocked.length === 0, String(unlocked.length));
  clock += 22 * 60000; await ctx.run('1');
  check('one is unlocked once 41 minutes have passed (the wait is at most 40)', unlocked.length === 1, String(unlocked.length));
  await ctx.run('1'); clock += 60000; await ctx.run('1');
  check('and not a second one a minute later', unlocked.length === 1, String(unlocked.length));
  process.exit(failures ? 1 : 0);
})();
