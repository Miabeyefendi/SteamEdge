// The account visibility (the top bar: online, away, invisible) as the engine sends it to Steam: at logon, when a job opens a game, with "Hide the game
// name", after a drop and a reconnect, and nothing before the logon. Up to 1.8.0 "Appear offline" lived in two copies in the engine: a game opened by a job
// made an invisible account online, and a reconnect went back to the choice of the first logon.
// The main process side: the old offlineMode setting ("Appear offline") becomes the Invisible choice of every saved account, Turkish setting values are renamed.
// Run with `npm test` (tests/run.js).
let now = 1000000000000, timers = [], nextId = 1;
const add = (fn, ms, every) => { const id = nextId++; timers.push({ id, at: now + Math.max(0, ms || 0), fn, every }); return { id, unref() {}, ref() {} }; };
const clear = (h) => { const id = h && h.id != null ? h.id : h; timers = timers.filter((t) => t.id !== id); };
global.setTimeout = (fn, ms) => add(fn, ms, 0);
global.setInterval = (fn, ms) => add(fn, ms, ms);
global.clearTimeout = clear;
global.clearInterval = clear;
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } };
async function advance(ms) {
  const end = now + ms;
  for (let guard = 0; guard < 500000; guard++) {
    await new Promise((r) => setImmediate(r));
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    now = Math.max(now, t.at);
    if (t.every) t.at = now + t.every; else timers.shift();
    t.fn();
  }
  now = end;
  await new Promise((r) => setImmediate(r));
}
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const { createFakeSteam, loadEngine } = require('./fake-steam-user.js');
const S = require(path.resolve(__dirname, '..', '..', 'node_modules', 'steam-user')).EPersonaState;
const name = (v) => Object.keys(S).find((k) => S[k] === v && isNaN(+k)) || String(v);

async function setup(persona, hide) {
  timers = [];
  const { FakeSteamUser, net } = createFakeSteam();
  const SteamEngine = loadEngine(FakeSteamUser, process.env.ENGINE_FILE, net);
  const eng = new SteamEngine();
  eng.applyPrivacy(persona, hide);                 // what main does before the logon
  const p = eng.logOn('account', persona);
  await advance(2000);
  await p;
  const shown = () => name(eng.user.persona);
  return { eng, net, shown };
}

(async () => {
  // ---- invisible: a game opened by a job keeps it invisible ----
  let t = await setup('invisible', false);
  check('nothing is sent to Steam before the logon', t.net.personas.every((x) => x.loggedOn), JSON.stringify(t.net.personas));
  check('logon: invisible', t.shown() === 'Invisible', t.shown());
  t.eng.play([440], 'card');
  check('a job opens a game: still invisible (1.8.0: online)', t.shown() === 'Invisible', t.shown());
  t.eng.stop('card');
  check('the game closes: still invisible', t.shown() === 'Invisible', t.shown());

  // ---- away ----
  t = await setup('away', false);
  check('logon: away', t.shown() === 'Away', t.shown());
  t.eng.play([440], 'hours');
  check('playing while away: away', t.shown() === 'Away', t.shown());

  // ---- the choice changes live, then a drop and a reconnect ----
  t = await setup('online', false);
  check('logon: online', t.shown() === 'Online', t.shown());
  t.eng.applyPrivacy('invisible', false);
  check('chosen in the top bar while connected: invisible at once', t.shown() === 'Invisible', t.shown());
  t.net.drop(false);
  await advance(30000);
  t.net.restore();
  for (let i = 0; i < 120 && !t.eng.isConnected; i++) await advance(1000);
  check('reconnected', t.eng.isConnected);
  check('after the reconnect: still invisible (1.8.0: the choice of the first logon, online)', t.shown() === 'Invisible', t.shown());
  t.eng.applyPrivacy('away', false);
  t.net.drop(false);
  await advance(10000);
  t.net.restore();
  for (let i = 0; i < 120 && !t.eng.isConnected; i++) await advance(1000);
  check('away, a drop, a reconnect: away', t.eng.isConnected && t.shown() === 'Away', t.shown());

  // ---- "Hide the game name": invisible only while a game is open, then back to the choice ----
  t = await setup('away', true);
  check('hide the game name, nothing open: the choice (away)', t.shown() === 'Away', t.shown());
  t.eng.play([440, 570], 'card');
  check('a game opens: invisible', t.shown() === 'Invisible', t.shown());
  t.net.drop(false);
  await advance(10000);
  t.net.restore();
  for (let i = 0; i < 120 && !t.eng.isConnected; i++) await advance(1000);
  check('reconnected with the games reopened: still invisible (1.8.0: online)', t.eng.isConnected && t.shown() === 'Invisible', t.shown());
  t.eng.stop('card');
  check('the games close: back to away', t.shown() === 'Away', t.shown());

  // ---- an unknown value is online ----
  t = await setup(true, false);
  check('an old caller passing true/false: online, not a guess', t.shown() === 'Online', t.shown());

  // ---- main.js: the old setting and the account files ----
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
  const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
  const code = cut('const REMOVED_SETTINGS', '// The moment the settings were last saved')
    + cut('// ---- VISIBILITY ON STEAM (the top bar) ----', '// The value of a job setting for one account');
  const files = { a: { personaState: null }, b: { personaState: 'away' } };
  const written = [];
  const ctx = {
    OLD_SETTING_VALUES: require('../../src/core/keyMigration').OLD_SETTING_VALUES,
    nearestAchDelay: (x) => x, accounts: new Map(), settings: { hideGameName: false }, log: () => {}, accountName: (i) => i, ACCOUNTS_FILE: 'accounts.json',
    readJson: () => ({ ok: true, dataBlock: [{ steamID: 'a' }, { steamID: 'b' }, { accountName: 'no id' }] }),
    accountData: (id) => files[id] || (files[id] = { personaState: null }),
    writeAccountData: (id) => written.push(id), Object,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.api = { migrateSettings, personaName, personaOf, personaFromOfflineMode };', ctx);
  const { migrateSettings, personaName, personaOf, personaFromOfflineMode } = ctx.api;
  const old = { settingsVersion: 5, offlineMode: true, reconnectPolicy: 'sinirsiz', grShowNoAch: true };
  check('the old setting is dropped from the settings file', migrateSettings(old) === true && !('offlineMode' in old));
  check('a Turkish setting value from an old file is renamed', old.reconnectPolicy === 'unlimited');
  check('the removed "Show games without achievements" switch (1.8.2) leaves the file too', !('grShowNoAch' in old));
  personaFromOfflineMode();
  check('"appear offline" on: a saved account without a choice becomes invisible', files.a.personaState === 'invisible' && written.includes('a'));
  check('an account that chose already keeps it', files.b.personaState === 'away' && !written.includes('b'));
  check('the visibility names: unknown and empty are online', personaName('away') === 'away' && personaName('offline') === 'online' && personaName(undefined) === 'online' && personaOf(null) === 'online' && personaOf('b') === 'away');

  process.exit(failures ? 1 : 0);
})();
