// Card farming paused for another job (hour boosting, sequential idling, Realistic Mode) and given back when it ends: the normal case, the job ending while the
// Steam connection is down (the farm used to stay paused for good and blocked the schedule and the resume of jobs), another job still running, and the
// connection coming back with nothing paused. And every connection status written to connection.log as one line.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const code = cut('function accountBoostRunning(s)', '// The kinds of job that run on an account')
  + cut('function delayFarm(steamID, reasonWhy)', '// Stops all jobs of an account')
  + cut('function bindConnectionState(eng, steamID)', '// The "Reconnect" button in the interface');

const started = [], events = [], conn = [];
const accounts = new Map();
const ctx = {
  accounts, activeSteamID: 'a', engineReady: false, log: () => {}, logger: { connection: (id, ev, fields) => conn.push([id, ev, fields || null]) }, accountName: (i) => i,
  accountEvent: (id, e) => events.push([id, e.typeName]),
  startCardFarm: (id, mode, games, durationMs, extra) => { started.push({ id, mode, games, extra }); accounts.get(id).farm = { running: true, mode, games, durationMs, location: () => ({}), stop() { this.running = false; } }; },
  keyChanged: (id) => events.push([id, 'keysChanged']),
  statsHour: () => {}, earning: (x) => !!(x && x.ready), holdCounters: () => {}, handleUninterruptedRun: () => {}, syncConnectionChanged: () => {}, sendRaw: () => {}, Date, console, Object,
};
vm.createContext(ctx);
vm.runInContext(code + '\n;this.api = { delayFarm, resumeFarm, bindConnectionState };', ctx);
const { delayFarm, resumeFarm, bindConnectionState } = ctx.api;

function account() {
  const eng = { reconnectLimit: 0 };
  const s = { ready: true, engine: eng, farm: { running: true, mode: 'fast', games: [{ appid: 1 }], durationMs: 5, location: () => ({ index: 0 }), stop() { this.running = false; } }, pendingFarm: null, boost: null, hoursFarm: null, realistic: null };
  accounts.set('a', s);
  bindConnectionState(eng, 'a');
  return { s, eng };
}

// normal: paused for a boost, the boost ends, the farm comes back
let { s, eng } = account();
s.boost = { runningFlag: true };
check('paused: the farm is stopped and kept to be given back', delayFarm('a', 'hour boosting') === true && s.farm.running === false && !!s.pendingFarm);
s.boost.runningFlag = false; resumeFarm('a');
check('the boost ends while connected: the farm starts again where it was', started.length === 1 && s.pendingFarm === null && s.farm.running === true);

// the boost ends while the connection is down
started.length = 0; ({ s, eng } = account());
s.boost = { runningFlag: true };
delayFarm('a', 'hour boosting');
eng.onStatus('dropped', { cause: 'x' });
s.boost.runningFlag = false; resumeFarm('a');      // the boost ended while down: nothing can start now
check('the boost ends while the connection is down: the farm is still kept, not lost', started.length === 0 && !!s.pendingFarm);
eng.onStatus('connected', { reconnected: true, gameEntries: 0 });
check('the connection comes back: the paused farm is given back by itself', started.length === 1 && s.pendingFarm === null, started.length + ' started, pending ' + !!s.pendingFarm);

// the connection comes back but the other job still runs: the farm stays paused
started.length = 0; ({ s, eng } = account());
s.realistic = { running: true };
delayFarm('a', 'realistic mode');
eng.onStatus('dropped', { cause: 'x' });
eng.onStatus('connected', { reconnected: true, gameEntries: 1 });
check('the connection comes back while Realistic Mode still runs: the farm stays paused', started.length === 0 && !!s.pendingFarm);
s.realistic = null;

// nothing paused: a reconnect starts nothing
started.length = 0; ({ s, eng } = account());
eng.onStatus('dropped', { cause: 'x' });
eng.onStatus('connected', { reconnected: true, gameEntries: 1 });
check('nothing was paused: a reconnect does not start card farming', started.length === 0);
// the key queue waits while the connection is down: when it is back the "Not connected" line goes at once and the queue wakes up
({ s, eng } = account());
let woke = false;
s.keys = { running: true, error: 'Bağlı değil.', cancelSleep: () => { woke = true; } };
events.length = 0;
eng.onStatus('dropped', { cause: 'x' });
eng.onStatus('connected', { reconnected: true, gameEntries: 0 });
check('keys: the connection is back -> the "Not connected" line goes at once and the queue is woken', s.keys.error === null && woke && events.some((e) => e[1] === 'keysChanged'));
// every status reaches connection.log as one line (src/core/logger.js): the drop with its cause, the wait, the attempt, the return with the attempts it took
({ s, eng } = account());
conn.length = 0;
eng.onStatus('dropped', { cause: 'NoConnection' });
eng.onStatus('connecting', { attemptCount: 1, waitMs: 5000, lastFailure: 'NoConnection' });
eng.onStatus('connecting', { trying: true, attemptCount: 1, deadlineMs: 60000 });
eng.onStatus('connecting', { trying: true, attemptCount: 2, deadlineMs: 60000 });
eng.onStatus('connected', { reconnected: true, gameEntries: 3 });
eng.onStatus('abandoned', { attemptCount: 10 });
check('connection.log: dropped, waiting, attempt, attempt, reconnected, abandoned', conn.map((c) => c[1]).join() === 'dropped,waiting,attempt,attempt,reconnected,abandoned', conn.map((c) => c[1]).join());
const back = conn.find((c) => c[1] === 'reconnected');
check('the return says how many attempts and games', back[2].attempts === 2 && back[2].games === 3 && back[2].downMs >= 0, JSON.stringify(back[2]));
check('the drop carries its cause', conn[0][2].cause === 'NoConnection' && conn[0][0] === 'a');
process.exit(failures ? 1 : 0);
