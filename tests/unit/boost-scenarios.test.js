// Hour Booster, the run code of main.js (boostStart .. boostStopAccount, with the hour sync) driven with a fake clock and a fake engine: a run with a duration,
// unlimited, the game start interval and a stop in the middle of it, the automatic renewal (connected and not), a settings change in the middle (proceeding),
// the parallel sync (games drop out at the target, the connection drops and comes back, the end), the staged sync (steps, a drop extends the step, the games
// continue together after it) and a stop during a sync. What is checked: what the engine plays, what the page is told, the farm given back, no timer left.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('function boostStatus(s)'), src.indexOf('function boostStopAccount(steamID, cause)'))
  + 'function boostStopAccount(steamID, cause) { boostFinish(steamID, cause || \'user\'); }\n';

let now = 1000000000000, timers = [], nextId = 1;
const add = (fn, ms, every) => { const id = nextId++; timers.push({ id, at: now + Math.max(0, ms || 0), fn, every }); return id; };
const fakeSet = (fn, ms) => add(fn, ms, 0), fakeInterval = (fn, ms) => add(fn, ms, ms), fakeClear = (id) => { timers = timers.filter((t) => t.id !== id); };
async function advance(ms) {
  const end = now + ms;
  for (let guard = 0; guard < 200000; guard++) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    now = Math.max(now, t.at);
    if (t.every) t.at = now + t.every; else timers.shift();
    t.fn();
    await new Promise((r) => setImmediate(r));
  }
  now = end;
}
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }

function setup(settings) {
  timers = [];
  const plays = [], stops = [], ticks = [], syncs = [], events = [], resumed = [];
  const accounts = new Map();
  const engine = { playing: [], play(ids, owner) { this.playing = ids.slice(); plays.push({ ids: ids.slice(), owner, at: now }); }, stop(owner) { stops.push(owner); this.playing = []; }, playingApps() { return this.playing.slice(); } };
  const s = { ready: true, engine, boost: null, hoursFarm: null, farm: null, pendingFarm: null };
  accounts.set('a', s);
  const ctx = {
    accounts, settingFor: (id, k) => settings[k], log: () => {}, accountName: (i) => i,
    accountBroadcast: () => (ch, d) => { if (ch === 'boost:tick') ticks.push(d); if (ch === 'boost:sync') syncs.push(d); },
    statsHour: () => {}, earning: (x) => !!(x && x.ready && !(x.engine && x.engine.playingBlocked)), accountEvent: (id, e) => events.push(e.typeName), delayFarm: () => false, resumeFarm: (id) => resumed.push(id),
    ledger: require(path.join(ROOT, 'src', 'core', 'syncLedger.js')),
    setTimeout: fakeSet, clearTimeout: fakeClear, setInterval: fakeInterval, clearInterval: fakeClear, Date: FakeDate, Math, console, Object, Array, Map, Set, Number, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.api = { boostStart, boostFinish, boostTimeUp, syncConnectionChanged, boostStopAccount, holdCounters };', ctx);
  return { s, engine, plays, stops, ticks, syncs, events, resumed, api: ctx.api, last: () => ticks[ticks.length - 1], lastSync: () => syncs[syncs.length - 1] };
}
const H = 3600000, M = 60000;

(async () => {
  // ---- a run with a duration ----
  let t = setup({});
  t.api.boostStart('a', { appids: [1, 2, 3], durationMs: 2 * H });
  check('boost: all games open together at once', t.plays[0].ids.join() === '1,2,3' && t.plays[0].owner === 'hours' && t.last().running === true);
  await advance(2 * H + 1000);
  check('boost: when the time is up it stops, the page is told, the farm is given back', t.stops.join() === 'hours' && t.last().running === false && t.events.includes('boostFinished') && t.resumed.length === 1);
  check('boost: no timer left', timers.length === 0, String(timers.length));

  // ---- unlimited ----
  t = setup({});
  t.api.boostStart('a', { appids: [1], durationMs: 0 });
  await advance(100 * H);
  check('unlimited: still running after 100 hours, no end timer', t.s.boost.runningFlag === true && t.stops.length === 0);
  t.api.boostStopAccount('a');
  check('unlimited: a stop ends it and leaves nothing', t.s.boost.runningFlag === false && timers.length === 0 && t.last().running === false);

  // ---- game start interval, and a stop in the middle of it ----
  t = setup({ boostStagger: 30 });
  t.api.boostStart('a', { appids: [1, 2, 3, 4], durationMs: H });
  await advance(100);
  check('interval: the first game opens alone', t.plays[0] && t.plays[0].ids.join() === '1');
  await advance(65 * 1000);
  check('interval: after 60 s three are open, one at a time', t.plays.map((p) => p.ids.length).join() === '1,2,3', t.plays.map((p) => p.ids.length).join());
  t.api.boostStopAccount('a');
  await advance(5 * M);
  check('interval: a stop in the middle opens no more games afterwards', t.plays.length === 3 && t.engine.playing.length === 0, String(t.plays.length));

  // ---- automatic renewal ----
  t = setup({ boostAutoRestart: true });
  t.api.boostStart('a', { appids: [1, 2], durationMs: H });
  await advance(H + 1000);
  check('renewal: the time is up, the farm is NOT given back yet (it renews)', t.resumed.length === 0 && t.events.includes('boostRenewed'));
  await advance(2000);
  check('renewal: 1.5 s later it runs again with the same games', t.s.boost.runningFlag === true && t.plays[t.plays.length - 1].ids.join() === '1,2');
  await advance(H - 10000);
  t.s.ready = false;                     // the connection is down at the moment it would renew
  await advance(20000);
  check('renewal while disconnected: it does not start, the farm is offered back instead', t.s.boost.runningFlag === false && t.resumed.length === 1, 'running ' + t.s.boost.runningFlag + ' resumed ' + t.resumed.length);
  check('renewal while disconnected: no timer left', timers.length === 0, String(timers.length));

  // ---- a settings change in the middle: the same start and the same total ----
  t = setup({});
  const start = now;
  t.api.boostStart('a', { appids: [1], durationMs: 2 * H });
  await advance(30 * M);
  t.api.boostFinish('a', 'setting', true);
  t.api.boostStart('a', { appids: [1, 2], durationMs: 2 * H, proceeding: { startPoint: start } });
  await advance(90 * M - 1000);
  check('proceeding: the rebuilt run keeps going until the original end', t.s.boost.runningFlag === true);
  await advance(2000);
  check('proceeding: and ends at the original end (2 h after the first start), not 2 h after the change', t.s.boost.runningFlag === false && t.last().running === false);

  // ---- parallel sync ----
  t = setup({ boostSync: true, boostSyncMode: 'highest', boostSyncStrategy: 'parallel' });
  t.api.boostStart('a', { appids: [1, 2, 3], durationMs: 0, games: [{ appid: 1, name: 'A', playtimeMin: 60 }, { appid: 2, name: 'B', playtimeMin: 120 }, { appid: 3, name: 'C', playtimeMin: 300 }] });
  check('sync: the two behind the highest (300 min) run together, the one at the target does not', t.plays[0].ids.slice().sort().join() === '1,2', t.plays[0].ids.join());
  check('sync: the page gets the job total once (the game furthest behind: 4 h)', t.lastSync().jobTotalMs === 240 * M, String(t.lastSync().jobTotalMs / M));
  await advance(3 * H + 1000);
  check('sync: after 3 h the second game is at the target and leaves, the first goes on alone', t.plays[t.plays.length - 1].ids.join() === '1', t.plays.map((p) => p.ids.join()).join(' '));
  // the connection drops for an hour: that hour is not credited
  t.api.syncConnectionChanged('a', false); t.s.ready = false;
  await advance(H);
  t.api.syncConnectionChanged('a', true); t.s.ready = true;
  await advance(H - 2000);
  check('sync drop: an hour lost to a drop is not counted, the game is not at the target yet', t.s.boost.runningFlag === true, String(t.s.boost.runningFlag));
  await advance(H + 60000);
  check('sync drop: it reaches the target one hour later, then the job ends with "sync" and says so', t.s.boost.runningFlag === false && t.events.includes('syncFinished') && t.last().running === false);
  check('sync: no timer or heartbeat left', timers.length === 0, String(timers.length));

  // ---- staged sync ----
  t = setup({ boostSync: true, boostSyncMode: 'highest', boostSyncStrategy: 'staged' });
  t.api.boostStart('a', { appids: [1, 2, 3], durationMs: 2 * H, games: [{ appid: 1, name: 'A', playtimeMin: 60 }, { appid: 2, name: 'B', playtimeMin: 120 }, { appid: 3, name: 'C', playtimeMin: 180 }] });
  check('staged: step 1 raises only the game furthest behind', t.plays[0].ids.join() === '1');
  await advance(H + 1000);
  check('staged: step 2 raises the two together', t.plays[t.plays.length - 1].ids.slice().sort().join() === '1,2', t.plays.map((p) => p.ids.join()).join(' '));
  t.api.syncConnectionChanged('a', false); t.s.ready = false;
  await advance(30 * M);
  t.api.syncConnectionChanged('a', true); t.s.ready = true;
  await advance(55 * M);
  check('staged drop: the step is extended by the 30 minutes lost', t.plays[t.plays.length - 1].ids.length === 2, t.plays.map((p) => p.ids.join() + '@' + Math.round((p.at - t.plays[0].at) / M)).join(' ') + ' sync ' + JSON.stringify(t.s.boost.sync && { i: t.s.boost.sync.i, stepEnd: Math.round((t.s.boost.sync.stepEnd - t.plays[0].at) / M) }));
  await advance(10 * M);
  check('staged: after the steps all three run together for the chosen 2 hours', t.plays[t.plays.length - 1].ids.slice().sort().join() === '1,2,3' && t.events.includes('syncFinished'), t.plays.map((p) => p.ids.join()).join(' '));
  await advance(2 * H + 1000);
  check('staged: then it ends after those 2 hours', t.s.boost.runningFlag === false && t.last().running === false);

  // ---- a stop in the middle of a sync ----
  t = setup({ boostSync: true, boostSyncMode: 'highest', boostSyncStrategy: 'parallel' });
  t.api.boostStart('a', { appids: [1, 2], durationMs: 0, games: [{ appid: 1, name: 'A', playtimeMin: 0 }, { appid: 2, name: 'B', playtimeMin: 600 }] });
  await advance(H);
  t.api.boostStopAccount('a');
  await advance(20 * H);
  check('stop during a sync: nothing plays later, no step or heartbeat left', timers.length === 0 && t.engine.playing.length === 0 && t.s.boost.sync === null, String(timers.length));

  // ---- sync with every game already at the target: a normal boost ----
  t = setup({ boostSync: true, boostSyncMode: 'manual', boostSyncTargetHours: 1, boostSyncStrategy: 'parallel' });
  t.api.boostStart('a', { appids: [1, 2], durationMs: H, games: [{ appid: 1, name: 'A', playtimeMin: 120 }, { appid: 2, name: 'B', playtimeMin: 300 }] });
  check('sync with everything past the target: the games just run together for the duration', t.plays[0].ids.join() === '1,2' && !t.s.boost.sync);
  await advance(H + 1000);
  check('and stop at the end of it', t.s.boost.runningFlag === false);
  // ---- a game of the account is open on another device: the boost clock stands still and goes on from the same point ----
  t = setup({});
  t.api.boostStart('a', { appids: [1, 2], durationMs: 2 * H });
  await advance(1 * H);
  t.engine.playingBlocked = true; t.api.holdCounters('a', true);
  await advance(3 * H);
  check('held by another device: the time does not run out', t.stops.length === 0 && t.s.boost.runningFlag === true);
  t.engine.playingBlocked = false; t.api.holdCounters('a', false);
  await advance(30 * M);
  check('released: 1.5 h of 2 h used, still running', t.stops.length === 0 && t.s.boost.runningFlag === true);
  await advance(31 * M);
  check('and it ends after the rest of the time', t.stops.join() === 'hours' && t.events.includes('boostFinished'));

  process.exit(failures ? 1 : 0);
})();
