// Card farming paused for another job (hour boosting, sequential idling, Realistic Mode) and given back when it ends: the normal case, the job ending while the
// Steam connection is down (the farm used to stay paused for good and blocked the schedule and the resume of jobs), another job still running, and the
// connection coming back with nothing paused.
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

const started = [], events = [];
const accounts = new Map();
const ctx = {
  accounts, activeSteamID: 'a', engineReady: false, log: () => {}, accountName: (i) => i,
  accountEvent: (id, e) => events.push([id, e.typeName]),
  startCardFarm: (id, mode, games, durationMs, extra) => { started.push({ id, mode, games, extra }); accounts.get(id).farm = { running: true, mode, games, durationMs, location: () => ({}), stop() { this.running = false; } }; },
  statsHour: () => {}, handleUninterruptedRun: () => {}, syncConnectionChanged: () => {}, sendRaw: () => {}, Date, console, Object,
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
process.exit(failures ? 1 : 0);
