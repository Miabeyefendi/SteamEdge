// Realistic Mode run: the state machine of a real run (realisticStep, realisticNextGame, realisticFinish) driven with a fake clock and a fake engine.
// Scenarios: a clean run, the connection dropping in the middle and coming back, the time running out while it was down, the engine gone, a stop while a timer is
// pending, one failed unlock, a queue of games, "start the queue automatically" off, and "keep collecting hours". Every scenario checks what the page would be told
// (the ticks) and what is left behind in the account slot, not only that nothing threw.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('function realisticStatus(steamID)'), src.indexOf('// Prepares a game\'s unlockable achievement queue'));
const startCode = src.slice(src.indexOf('function realisticOptions(s)'), src.indexOf("ipcMain.handle('realistic:start'"));

// ---- fake clock and timers: time only moves when the test says so ----
let now = 1000000000000;
let timers = [];
let nextTimer = 1;
const fakeSetTimeout = (fn, ms) => { const id = nextTimer++; timers.push({ id, at: now + Math.max(0, ms || 0), fn }); return id; };
const fakeClearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
async function advance(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    now = Math.max(now, t.at);
    t.fn();
    await new Promise((r) => setImmediate(r));       // let the async step finish before the next timer
  }
  now = end;
}
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }

const accounts = new Map();
const ticks = [], logs = [], feeds = [], resumed = [];
const unlocks = [];
const accountsData = new Map();
const ctx = {
  accounts, activeSteamID: 'a',
  accountBroadcast: () => (channel, payload) => { if (channel === 'realistic:tick') ticks.push(payload); },
  log: (l, m) => logs.push(l + ' ' + m), accountName: (i) => i,
  accountData: (id) => { if (!accountsData.has(id)) accountsData.set(id, { achLog: [] }); return accountsData.get(id); },
  writeAccountDataDelayed: () => {}, addFeed: (id, e) => feeds.push([id, e]), resumeFarm: (id) => resumed.push(id),
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, Date: FakeDate,
  require: (p) => require(p.startsWith('.') ? path.resolve(__dirname, '..', '..', p) : p),
  console, Promise, Math: Object.assign(Object.create(Math), { random: () => 0.5 }), Number, String, Map, Set, Object, Array, JSON, RegExp, Error,
  ipcMain: { handle: () => {}, on: () => {} }, engineReady: true, engine: null, settingFor: () => false, delayFarm: () => {},
  // the schema of a game: 50 locked achievements, none open, common to rare
  prepareRealisticQueue: async (motor, id) => ({ ok: true, gameTitle: 'G' + id, queueList: Array.from({ length: 50 }, (_, i) => ({ apiName: 'A' + i, name: 'Ach ' + i, rarityPct: 80 - i, pos: i / 50 })),
    suitableTotal: 50, protectedFlag: 0, ultraSkipped: 0, totalAchievements: 50, unlockedState: 0 }),
};
vm.createContext(ctx);
vm.runInContext(code + '\n' + startCode + '\n;this.api = { realisticStep, realisticNextGame, realisticFinish, realisticNotify, realisticNextDelay, realisticStatus, realisticOptions, realisticStartFor };', ctx);
const api = ctx.api;
const HOUR = 3600000;

function fakeEngine(opts) {
  const o = opts || {};
  const e = { played: [], stopped: [], isConnected: true, setAchievements: async (appid, list) => {
    if (o.failOn && o.failOn.includes(list[0].apiName)) throw new Error('EResult 8');
    if (o.noAnswer && o.noAnswer[list[0].apiName] > 0) { o.noAnswer[list[0].apiName]--; throw new Error('Steam did not answer in time'); }
    unlocks.push([appid, list[0].apiName, now]);
  }, play: (ids, why) => e.played.push([ids.join(), why]), stop: (why) => e.stopped.push(why) };
  return e;
}
function list(n, startTime, step) { return Array.from({ length: n }, (_, i) => ({ apiName: 'A' + i, name: 'Ach ' + i, rarityPct: 80 - i, pos: i / n, timeValue: startTime + i * step })); }
function makeRun(account, games, optionList, spanMs) {
  const t0 = now;
  const prepared = {};
  games.forEach((g) => { prepared[g.appid] = { queueList: g.queueList }; });
  const first = games[0];
  const d = {
    gameEntries: games.map((g) => ({ appid: g.appid, name: g.name })), gameIndex: 0, preparing: prepared,
    optionList: Object.assign({ randomInterval: false, autoOrder: true, continueHours: true, model: 'linear', speedMultiplier: 1, ultraMultiplier: 3, compensationShare: 0.2, finishedRatio: 0.5, tcHours: 20, difficultyValue: 1, playtime: {}, accelerateDelayed: false }, optionList || {}),
    totalGoal: games.reduce((t, g) => t + g.queueList.length, 0), totalUnlocked: 0, totalErrors: 0, averageIntervalMs: 0,
    startPoint: t0, finishTime: t0 + spanMs, timer: null, upNextTime: 0,
    activeIds: { appid: first.appid, gameTitle: first.name, queueList: first.queueList, indexNum: 0, openedGames: 0, failure: 0, startPoint: t0, finishTime: t0 + spanMs },
  };
  account.realistic = d;
  d.timer = fakeSetTimeout(() => { if (api.realisticStatus(account.id) === d) api.realisticStep(account.id); }, api.realisticNextDelay(d));
  return d;
}
function account(id, opts) { const s = Object.assign({ id, ready: true, engine: fakeEngine(), realistic: null }, opts || {}); accounts.set(id, s); return s; }
function reset() { timers = []; ticks.length = 0; logs.length = 0; feeds.length = 0; resumed.length = 0; unlocks.length = 0; accounts.clear(); accountsData.clear(); }
const lastTick = () => ticks[ticks.length - 1];

(async () => {
  // ---- 1. a clean run: 3 achievements over 3 hours ----
  reset();
  let s = account('a');
  let d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], {}, 3 * HOUR);
  await advance(2 * HOUR);
  check('clean run: two unlocked after two hours', unlocks.length === 2, String(unlocks.length));
  check('the page was told how many (2 of 3) and that it is running', lastTick().runningFlag === true && lastTick().openedGames === 2 && lastTick().totalSum === 3, JSON.stringify(lastTick()).slice(0, 120));
  await advance(1.2 * HOUR);
  check('clean run: the third unlocked', unlocks.length === 3);
  check('the page was told the run is OVER (not still running) with the reason', lastTick().runningFlag === false && lastTick().isFinished === true, JSON.stringify(lastTick()).slice(0, 160));
  check('nothing is left in the account slot and no timer is left running', s.realistic === null && timers.length === 0, 'timers ' + timers.length);
  check('the engine was told to stop the game and card farming was given back', s.engine.stopped.length === 1 && resumed.join() === 'a');
  check('every unlock is in the achievement log', accountsData.get('a').achLog.length === 3);

  // ---- 2. the connection drops in the middle and comes back ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(4, 1 * HOUR, 1 * HOUR) }], { continueHours: false }, 8 * HOUR);
  await advance(1.5 * HOUR);
  check('drop: one unlocked before the drop', unlocks.length === 1);
  s.ready = false;                       // Steam connection lost
  await advance(2 * HOUR);
  check('drop: nothing is sent while the connection is down', unlocks.length === 1, String(unlocks.length));
  check('drop: the run is still alive and waiting (not finished, not stuck without a timer)', s.realistic === d && timers.length === 1);
  s.ready = true;                        // connection back
  await advance(40000);
  check('drop: after reconnecting the next unlock goes out', unlocks.length === 2, String(unlocks.length));
  await advance(5 * HOUR);
  check('drop: the run still finishes with all 4 (the missed ones are spread over what was left) and says it is over', unlocks.length === 4 && s.realistic === null && lastTick().runningFlag === false, unlocks.length + ' unlocks, slot ' + (s.realistic ? 'open' : 'null'));

  // ---- 3. the time runs out while the connection was down ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(5, 1 * HOUR, 1 * HOUR) }], { continueHours: false }, 6 * HOUR);
  await advance(1.5 * HOUR);
  s.ready = false;
  await advance(5.5 * HOUR);             // past the end of the run
  s.ready = true;
  await advance(40000);
  const t3 = lastTick();
  check('time out while down: the run ends, it does not hang on "running"', s.realistic === null && t3.runningFlag === false);
  check('time out while down: the page is told how many were NOT unlocked', /3/.test(String(t3.cause)) && t3.openedGames === 2, JSON.stringify(t3).slice(0, 200));

  // ---- 4. the engine is gone (account logged out) ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], {}, 4 * HOUR);
  s.engine = null;
  await advance(1.5 * HOUR);
  check('engine gone: the run ends with the "no connection" reason', s.realistic === null && lastTick().runningFlag === false && /bağlantı/i.test(String(lastTick().cause)), String(lastTick() && lastTick().cause));

  // ---- 5. stop while a timer is pending and while an unlock is in flight ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], {}, 4 * HOUR);
  await advance(0.5 * HOUR);
  api.realisticFinish('a', 'user stopped');
  check('stop: slot cleared, timer cleared, page told "stopped"', s.realistic === null && timers.length === 0 && lastTick().runningFlag === false && /Durduruldu/.test(String(lastTick().cause)));
  await advance(5 * HOUR);
  check('stop: nothing is unlocked after the stop', unlocks.length === 0, String(unlocks.length));
  // an unlock in flight when the stop comes
  reset();
  s = account('a');
  let release;
  s.engine.setAchievements = (appid, listing) => new Promise((resolve) => { release = () => { unlocks.push([appid, listing[0].apiName, now]); resolve(); }; });
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], {}, 4 * HOUR);
  await advance(1.1 * HOUR);             // the step started and waits for Steam
  api.realisticFinish('a', 'user stopped');
  release();
  await advance(3 * HOUR);
  check('stop during an unlock in flight: no new timer is started afterwards', timers.length === 0 && s.realistic === null);

  // ---- 6. one unlock fails, the run goes on ----
  reset();
  s = account('a', { engine: fakeEngine({ failOn: ['A1'] }) });
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], { continueHours: false }, 4 * HOUR);
  await advance(4.1 * HOUR);
  check('failed unlock: the others still go out (2 of 3) and the failure is counted for the page', unlocks.length === 2 && lastTick().failure === 1 && lastTick().openedGames === 2, JSON.stringify(lastTick()).slice(0, 160));
  check('failed unlock: the run does not stay open', s.realistic === null);

  // ---- 6b. a write that gets no answer (the connection dropped under it) is sent again, not skipped ----
  reset();
  s = account('a', { engine: fakeEngine({ noAnswer: { A1: 1 } }) });
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], { continueHours: false }, 4 * HOUR);
  await advance(4.1 * HOUR);
  check('no answer once: the same achievement goes out again 30 s later, all 3 unlocked, nothing counted as failed (1.7.7 skipped it for good)', unlocks.map((u) => u[1]).join() === 'A0,A1,A2' && lastTick().failure === 0, unlocks.map((u) => u[1]).join() + ' failure ' + lastTick().failure);
  reset();
  s = account('a', { engine: fakeEngine({ noAnswer: { A1: 5 } }) });
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], { continueHours: false }, 4 * HOUR);
  await advance(4.1 * HOUR);
  check('no answer three times while connected: then it counts as failed and the run goes on (no endless retry)', unlocks.map((u) => u[1]).join() === 'A0,A2' && lastTick().failure === 1, unlocks.map((u) => u[1]).join() + ' failure ' + lastTick().failure);
  reset();
  s = account('a', { engine: fakeEngine({ noAnswer: { A1: 1 } }) });
  s.engine.isConnected = true;
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 1 * HOUR, 1 * HOUR) }], { continueHours: false }, 4 * HOUR);
  await advance(1 * HOUR + 1000);
  s.ready = false; s.engine.isConnected = false;          // the drop is seen: waiting for the connection is not a try
  await advance(10 * 60000);
  s.ready = true; s.engine.isConnected = true;
  await advance(3.5 * HOUR);
  check('the connection is down while it waits: it keeps waiting and sends it when it is back', unlocks.map((u) => u[1]).join() === 'A0,A1,A2' && lastTick().failure === 0, unlocks.map((u) => u[1]).join());

  // ---- 7. a queue of two games ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'One', queueList: list(2, 0.5 * HOUR, 0.5 * HOUR) }, { appid: 20, name: 'Two', queueList: list(2, 0.5 * HOUR, 0.5 * HOUR) }], {}, 6 * HOUR);
  await advance(3 * HOUR);
  check('queue: the second game was started on the engine', s.engine.played.some((p) => p[0] === '20' && p[1] === 'realistic'), JSON.stringify(s.engine.played));
  check('queue: the page was told the game changed', ticks.some((t) => t.gameChanged === true && t.appid === 20));
  await advance(6 * HOUR);
  check('queue: all four unlocked and the run ended', unlocks.length === 4 && s.realistic === null && lastTick().runningFlag === false);
  check('queue: two unlocks went to each game, in the order of the queue', unlocks.map((u) => u[0]).join() === '10,10,20,20', unlocks.map((u) => u[0]).join());

  // ---- 8. "start the queue automatically" off ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'One', queueList: list(1, 0.5 * HOUR, 1) }, { appid: 20, name: 'Two', queueList: list(2, 0.5 * HOUR, 0.5 * HOUR) }], { autoOrder: false, continueHours: false }, 6 * HOUR);
  await advance(2 * HOUR);
  check('autoOrder off: stops after the first game, the second is never started', unlocks.length === 1 && s.realistic === null && !s.engine.played.length);

  // ---- 9. keep collecting hours after the unlocks ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(2, 0.5 * HOUR, 0.5 * HOUR) }], { continueHours: true }, 5 * HOUR);
  await advance(2 * HOUR);
  check('keep hours: both unlocked but the run is still open (collecting hours)', unlocks.length === 2 && s.realistic === d && lastTick().achievementsDone === true);
  await advance(3.1 * HOUR);
  check('keep hours: it ends when the time is up with the right reason', s.realistic === null && /Süre doldu/.test(String(lastTick().cause)) && !/açılmadı/.test(String(lastTick().cause)), String(lastTick().cause));

  // ---- 10. the first unlock of a backlog plan comes soon, not after an even share of the whole run ----
  reset();
  s = account('a');
  d = makeRun(s, [{ appid: 10, name: 'Game', queueList: list(3, 20000, 20000) }], { randomInterval: false }, 2 * HOUR);
  check('backlog plan: the first delay is the plan time (20 s), not a third of the run', api.realisticNextDelay(d) === 20000, String(api.realisticNextDelay(d)));
  await advance(70000);
  check('backlog plan: all three go out in order within the first minute', unlocks.map((u) => u[1]).join() === 'A0,A1,A2', unlocks.map((u) => u[1]).join());

  // ---- 11. the start and the resume of a game that was already played to its completion time ----
  const finishedOptions = { goalAuto: true, autoSpan: true, model: 'linear', tcHours: 26, difficultyValue: 1, playtime: { 10: 26 * 60 }, accelerateDelayed: true, continueHours: true, autoOrder: true, randomInterval: false, finishedRatio: 0.5 };
  reset();
  s = account('a', { ready: true });
  const startRes = await api.realisticStartFor('a', { appid: 10, gameEntries: [10], spanMs: 2 * HOUR, optionList: finishedOptions }, false);
  d = s.realistic;
  check('start: the automatic run of a finished game is a few hours, not another 26', startRes.ok && d && (d.finishTime - d.startPoint) <= 3 * HOUR + 1000, d ? String((d.finishTime - d.startPoint) / HOUR) : JSON.stringify(startRes));
  const lastPlaced = Math.max(...d.activeIds.queueList.map((x) => x.timeValue));
  check('start: its unlocks use the whole automatic duration (no second compression on top)', Math.abs(lastPlaced - (d.activeIds.finishTime - d.activeIds.startPoint)) < 60000, (lastPlaced / HOUR).toFixed(2) + ' h of ' + ((d.activeIds.finishTime - d.activeIds.startPoint) / HOUR).toFixed(2));
  check('start: the average gap the page shows while it runs is the one the plan has (last unlock / count)', Math.abs(d.averageIntervalMs - lastPlaced / d.totalGoal) < 2000, d.averageIntervalMs + ' vs ' + Math.round(lastPlaced / d.totalGoal));
  // the same game with a duration typed by hand: the unlocks end at half of it (the setting), and the page must say so while it runs
  const handDuration = 10 * HOUR;
  api.realisticFinish('a', 'user stopped'); reset(); s = account('a', { ready: true });
  await api.realisticStartFor('a', { appid: 10, gameEntries: [10], spanMs: handDuration, optionList: Object.assign({}, finishedOptions, { autoSpan: false }) }, false);
  const dHand = s.realistic;
  const endHand = Math.max(...dHand.activeIds.queueList.map((x) => x.timeValue));
  check('manual duration of a finished game: the unlocks end at the set ratio of it (5 of 10 hours)', Math.abs(endHand - 5 * HOUR) < 60000, (endHand / HOUR).toFixed(2) + ' h');
  check('manual duration of a finished game: the running average gap is the placed one, not 10 hours / count', Math.abs(dHand.averageIntervalMs - endHand / dHand.totalGoal) < 2000, dHand.averageIntervalMs + ' vs ' + Math.round(endHand / dHand.totalGoal));
  api.realisticFinish('a', 'user stopped'); reset(); s = account('a', { ready: true });
  await api.realisticStartFor('a', { appid: 10, gameEntries: [10], spanMs: 2 * HOUR, optionList: finishedOptions }, false);
  d = s.realistic;
  const saved = JSON.parse(JSON.stringify(d.optionList));      // what the resume file keeps (resumeJobs: jsonSafe(r.optionList))
  api.realisticFinish('a', 'user stopped');
  // the resume request (src/core/resumeJobs.js): what is left as the span, "goalAuto/autoSpan" off, the goals as they were
  const resumeOptions = Object.assign({}, saved, { goalAuto: false, autoSpan: false, goalValue: 0, goalByGame: { 10: 30 } });
  reset();
  s = account('a', { ready: true });
  await api.realisticStartFor('a', { gameEntries: [10], spanMs: 1 * HOUR, optionList: resumeOptions }, true);
  d = s.realistic;
  const lastResumed = Math.max(...d.activeIds.queueList.map((x) => x.timeValue));
  check('resume: the 30 that are left are planned over the whole hour that is left, not squeezed into half of it again', d && Math.abs(lastResumed - HOUR) < 60000, d ? (lastResumed / 60000).toFixed(1) + ' of 60 min' : 'no run');

  process.exit(failures ? 1 : 0);
})();
