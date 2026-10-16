// The part of main.js that wires jobs that survive a restart to the real jobs: it writes what runs, reads it at startup, and when the account has connected
// and the page is up it starts the jobs again with the right arguments, once, and leaves an account alone that is busy already.
// main.js is cut at its markers and run against stand-ins (like sell-guard.test.js). Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
const resumeJobs = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'resumeJobs.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const a = src.indexOf('// ---- JOBS THAT SURVIVE A RESTART ----');
const b = src.indexOf('// ---- CARD FARMING SCHEDULE ----');
check('the block is in main.js between its markers', a > 0 && b > a);
const code = src.slice(a, b);
const MIN = 60000, HOUR = 3600000;
const ID = '76561198000000001';

function boot(over) {
  const disk = new Map();
  const calls = [];
  const events = [];
  const logs = [];
  const state = {
    disk, calls, events, logs,
    settings: { resumeJobs: true },
    accounts: new Map(),
    busy: false,
  };
  const ctx = Object.assign({
    path, resumeJobs, CONFIG_DIR: '/cfg', console, Date, Promise, JSON, Object, Map, Array, Number, Math, Error,
    fs: {
      readFileSync: (f) => { if (!disk.has(f)) { const e = new Error('none'); e.code = 'ENOENT'; throw e; } return disk.get(f); },
      unlinkSync: (f) => { calls.push(['unlink', path.basename(f)]); disk.delete(f); },
    },
    writeJson: (f, o) => { calls.push(['write', path.basename(f)]); disk.set(f, JSON.stringify(o)); return true; },
    settings: state.settings, accounts: state.accounts,
    log: (level, text) => logs.push(level + ' ' + text),
    // time is not waited for: the timers run at once, the interval never ticks
    setTimeout: (fn) => { setImmediate(fn); return 1; }, setInterval: () => 1,
    windowOpened: Promise.resolve(),
    win: { isDestroyed: () => false, webContents: { isLoading: () => false } },
    onPanelPage: () => true,
    accountRunning: () => state.busy, accountName: (id) => 'acct' + String(id).slice(-1),
    startCardFarm: (id, mode, games, durationMs, extra) => { calls.push(['farm', mode, games.length, durationMs, extra && extra.proceeding && extra.proceeding.index]); return true; },
    boostStart: (id, request) => { calls.push(['boost', request.appids.join(), request.durationMs, !!request.proceeding]); return { ok: true }; },
    startSequential: (id, request) => { calls.push(['seq', request.games.length]); return { ok: true }; },
    realisticStartFor: async (id, request, fromSchedule) => { calls.push(['realistic', request.gameEntries.join(), request.spanMs, fromSchedule, JSON.stringify(request.optionList.goalByGame)]); return { ok: true }; },
    translation: { tf: (key, n) => key.replace('#', n) },
    accountEvent: (id, evt) => events.push(evt),
    sendJobStatus: (id) => calls.push(['status', id]),
    activeSteamID: ID,
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(code + ';this.save = resumeSave; this.soon = resumeSaveSoon; this.startUp = resumeStartUp; this.after = resumeAfterConnect; this.store = resumeStore;', ctx);
  state.ctx = ctx;
  return state;
}
const slot = (extra) => Object.assign({ ready: true, engine: {}, farm: null, pendingFarm: null, boost: null, hoursFarm: null, realistic: null }, extra || {});
const runningFarm = () => ({ running: true, mode: 'sequential', durationMs: 20 * MIN, games: [{ appid: 1, name: 'a', remaining: 2 }, { appid: 2, name: 'b', remaining: 1 }], location: () => ({ index: 1, passedMs: 5 * MIN, sessionStart: Date.now() - 40 * MIN }) });
const tick = () => new Promise((r) => setTimeout(r, 30));

(async () => {
  // writing
  let t = boot();
  t.accounts.set(ID, slot({ farm: runningFarm() }));
  t.ctx.save();
  const file = JSON.parse(t.disk.get('/cfg/resume.json') || 'null') || JSON.parse(t.disk.get(path.join('/cfg', 'resume.json')) || 'null');
  check('what is running is written to settings/resume.json', !!file && file.v === 1 && file.accounts[ID] && file.accounts[ID].farm.index === 1 && file.accounts[ID].farm.games.length === 2, JSON.stringify(file).slice(0, 100));
  check('the file has the account and no secrets (only games, modes, times)', !/token|password|cookie|refresh/i.test(JSON.stringify(file)));
  t.calls.length = 0;
  t.accounts.set(ID, slot());
  t.ctx.save();
  check('when the job ends the file goes', t.calls.some((c) => c[0] === 'unlink') && !t.disk.has(path.join('/cfg', 'resume.json')));
  t = boot({ settings: { resumeJobs: false } });
  t.accounts.set(ID, slot({ farm: runningFarm() }));
  t.ctx.save();
  check('with the setting off nothing is written', !t.calls.some((c) => c[0] === 'write'));
  t = boot();
  t.accounts.set(ID, slot({ farm: runningFarm() }));
  t.ctx.save(true);
  const writes = t.calls.filter((c) => c[0] === 'write').length;
  t.accounts.set(ID, slot());
  t.ctx.save();
  check('after the last write at exit the file is left as it is (what happens while the app closes does not change it)', writes === 1 && t.calls.filter((c) => c[0] === 'write').length === 1 && !t.calls.some((c) => c[0] === 'unlink'));

  // reading at startup and resuming
  const entry = (extra) => Object.assign({ savedAt: Date.now() - 2 * MIN }, extra);
  const seed = (t2, entries) => t2.disk.set(path.join('/cfg', 'resume.json'), JSON.stringify({ v: 1, accounts: entries }));
  t = boot();
  seed(t, { [ID]: entry({
    farm: { mode: 'sequential', games: [{ appid: 1 }, { appid: 2 }], durationMs: 20 * MIN, index: 1, passedMs: 5 * MIN, sessionElapsedMs: 40 * MIN, paused: false },
    boost: { appids: [7, 8], durationMs: 5 * HOUR, games: null, allItems: null, sync: false, elapsedMs: 2 * HOUR },
    realistic: { games: [{ appid: 3, name: 'Waiting', left: 7 }], remainingMs: 3 * HOUR, options: { model: 'exp' } } }) });
  t.ctx.startUp();
  check('at startup the file is read and the log says who left jobs running', !!t.ctx.store.peek(ID) && t.logs.some((l) => /resume: 1 account/.test(l)));
  t.accounts.set(ID, slot());
  await t.ctx.after(ID);
  await tick();
  const farmCall = t.calls.find((c) => c[0] === 'farm'), boostCall = t.calls.find((c) => c[0] === 'boost'), realCall = t.calls.find((c) => c[0] === 'realistic');
  check('the card farm starts again at its place (second game)', !!farmCall && farmCall[1] === 'sequential' && farmCall[2] === 2 && farmCall[3] === 20 * MIN && farmCall[4] === 1, JSON.stringify(farmCall));
  check('the boost starts again with its starting point', !!boostCall && boostCall[1] === '7,8' && boostCall[2] === 5 * HOUR && boostCall[3] === true);
  check('Realistic Mode starts again as a run the schedule does not own, for what was left', !!realCall && realCall[1] === '3' && realCall[2] === 3 * HOUR && realCall[3] === true && realCall[4] === '{"3":7}', JSON.stringify(realCall));
  check('the jobs start in the order: card farm, boost, Realistic Mode', t.calls.filter((c) => ['farm', 'boost', 'realistic'].includes(c[0])).map((c) => c[0]).join() === 'farm,boost,realistic');
  check('the file was rewritten (the entry taken out) before the first job started, so a start that crashes the app is not repeated forever',
    t.calls.findIndex((c) => c[0] === 'unlink' || c[0] === 'write') >= 0 && t.calls.findIndex((c) => c[0] === 'unlink' || c[0] === 'write') < t.calls.findIndex((c) => c[0] === 'farm'), JSON.stringify(t.calls.slice(0, 4)));
  check('a line in the activity feed and a notification say three jobs were resumed', t.events.length === 1 && t.events[0].typeName === 'jobsResumed' && /3/.test(t.events[0].feedEntry.text), JSON.stringify(t.events[0]));
  check('the page is told how things stand once it is up', t.calls.some((c) => c[0] === 'status' && c[1] === ID));
  check('the entry is used up: a second connection does not start them twice', !t.ctx.store.peek(ID) && (t.calls.length = 0, await t.ctx.after(ID), t.calls.length === 0));

  // an account that is busy, not connected, or has the setting off
  t = boot(); seed(t, { [ID]: entry({ farm: { mode: 'fast', games: [{ appid: 1 }], durationMs: 0, index: 0, passedMs: 0, sessionElapsedMs: 0, paused: false } }) });
  t.ctx.startUp(); t.accounts.set(ID, slot()); t.state = t; t.busy = true;
  t.ctx.accountRunning = () => true;
  await t.ctx.after(ID); await tick();
  check('an account the user already started something on is left alone, and the old entry is dropped', !t.calls.some((c) => c[0] === 'farm') && !t.ctx.store.peek(ID) && t.logs.some((l) => /skipped/.test(l)));
  t = boot(); seed(t, { [ID]: entry({ farm: { mode: 'fast', games: [{ appid: 1 }], durationMs: 0, index: 0, passedMs: 0, sessionElapsedMs: 0, paused: false } }) });
  t.ctx.startUp(); t.accounts.set(ID, slot({ ready: false }));
  await t.ctx.after(ID); await tick();
  check('an account that is not connected yet keeps its entry for the next connection', !t.calls.some((c) => c[0] === 'farm') && !!t.ctx.store.peek(ID));
  t = boot({ settings: { resumeJobs: false } }); seed(t, { [ID]: entry({ farm: { mode: 'fast', games: [{ appid: 1 }], durationMs: 0, index: 0, passedMs: 0, sessionElapsedMs: 0, paused: false } }) });
  t.ctx.startUp(); t.accounts.set(ID, slot());
  await t.ctx.after(ID); await tick();
  check('with the setting off the file is removed at startup and nothing starts', !t.calls.some((c) => c[0] === 'farm') && !t.disk.has(path.join('/cfg', 'resume.json')));
  const removed = t.calls.filter((c) => c[0] === 'unlink').length;
  t.ctx.save(); t.ctx.save();
  check('and it is not removed again every half minute', removed > 0 && t.calls.filter((c) => c[0] === 'unlink').length === removed);

  // a job that cannot start
  t = boot({ startCardFarm: () => false, boostStart: () => ({ ok: false, error: 'x' }), realisticStartFor: async () => ({ ok: false, error: 'no achievements' }) });
  seed(t, { [ID]: entry({ farm: { mode: 'fast', games: [{ appid: 1 }], durationMs: 0, index: 0, passedMs: 0, sessionElapsedMs: 0, paused: false } }) });
  t.ctx.startUp(); t.accounts.set(ID, slot());
  await t.ctx.after(ID); await tick();
  check('when nothing could start, the feed says so (and does not claim a resume)', t.events.length === 1 && t.events[0].typeName === 'jobsResumeFailed' && t.logs.some((l) => /did not start/.test(l)));

  process.exit(failures ? 1 : 0);
})();
