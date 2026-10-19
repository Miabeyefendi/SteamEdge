// Hour sync: the parallel strategy opens up to 32 games at once whatever "Max games at once" says, a single game with the
// "highest of the selected" target is not synced, and old unlock interval values move to the nearest new choice.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ledger = require('../../src/core/syncLedger.js');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name); };
const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

const code = [
  cut('function boostStatus(s) {', 'function boostClear(s) {'),
  "function boostClear(s) {}",
  cut('// Steam\'s limit of games open at once', 'function syncEmit('),
  cut('function boostStart(steamID, request) {', '// Time is up.'),
].join('\n');

function boot(settings) {
  const played = [];
  const sched = [];
  const engine = { play: (ids) => played.push(ids.slice()), playingApps: () => [] };
  const ctx = {
    settings, ledger, played, sched, console, setTimeout, clearTimeout, Date, Math, Promise,
    accounts: new Map([[1, { ready: true, engine }]]),
    accountName: () => 'acc', accountBroadcast: () => () => {}, delayFarm: () => {}, setupSyncHeartbeat: () => {},
    scheduleSync: (id) => sched.push(id), runSyncStep: () => {}, simulateSync: () => ({}), log: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext('function settingFor(id, k) { return settings[k]; }\n' + code + '\n;this.start = boostStart; this.state = () => ctx_state();', ctx);
  ctx.ctx_state = () => ctx.accounts.get(1).boost;
  return ctx;
}
const games = (n, base) => Array.from({ length: n }, (_, i) => ({ appid: 100 + i, name: 'G' + i, playtimeMin: (base || 0) + i * 60 }));

// 1) ten games, "Max games at once" left at 3 by an earlier choice: sync still opens them all
let ctx = boot({ boostSync: true, boostSyncMode: 'highest', boostSyncStrategy: 'parallel', boostMaxGames: 3 });
const ten = games(10);
ctx.start(1, { appids: ten.map((g) => g.appid), durationMs: 0, games: ten });
let b = ctx.state();
check('sync starts for ten games', !!b.sync && b.sync.strategyName === 'parallel');
check('sync limit is 32, not the leftover 3', b.sync.limit === 32);
check('all nine games behind the target are active together, not 3+3+3', ledger.nextActiveSet(b.sync).length === 9);

// 2) 40 games: Steam's 32 at once
ctx = boot({ boostSync: true, boostSyncMode: 'highest', boostSyncStrategy: 'parallel', boostMaxGames: 3 });
const forty = games(40);
ctx.start(1, { appids: forty.map((g) => g.appid), durationMs: 0, games: forty });
check('with 40 games 32 are active at once', ledger.nextActiveSet(ctx.state().sync).length === 32);

// 3) one game, "highest of the selected": no sync, a normal boost with the chosen duration
ctx = boot({ boostSync: true, boostSyncMode: 'highest', boostSyncStrategy: 'parallel', boostMaxGames: 32 });
const one = games(1);
ctx.start(1, { appids: [100], durationMs: 3600000, games: one });
b = ctx.state();
check('one game with the highest target is not synced', !b.sync && ctx.played.length === 1 && ctx.played[0].join() === '100');
check('the chosen duration is used', b.spanMs === 3600000);

// 4) one game with a manual target still syncs
ctx = boot({ boostSync: true, boostSyncMode: 'manual', boostSyncTargetHours: 50, boostSyncStrategy: 'parallel', boostMaxGames: 32 });
ctx.start(1, { appids: [100], durationMs: 0, games: one });
check('one game with a manual target is synced', !!ctx.state().sync && ctx.state().sync.targetMin === 3000);

// 5) the unlock interval choices
const migrate = vm.runInNewContext(cut('const ACH_DELAY_CHOICES', 'function migrateSettings(v) {') + '; nearestAchDelay');
const expected = { 1: 15, 15: 15, 30: 30, 45: 45, 60: 60, 120: 120, 180: 120, 300: 300, 480: 600, 780: 600, 1260: 1800, 2040: 1800, 3300: 3600, 5400: 3600 };
check('old interval values move to the nearest new choice', Object.entries(expected).every(([from, to]) => migrate(+from) === to));
check('a missing or invalid value becomes 15 seconds', migrate(0) === 15 && migrate(NaN) === 15);

process.exit(failures ? 1 : 0);
