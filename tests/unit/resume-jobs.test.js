// Jobs that survive a restart: what is written down from the live jobs, how a file is read back (whatever is in it), what starts again and in what order,
// the file that is kept, and a real card farm that is written down and started again at its place.
// Run with `npm test` (tests/run.js).
const path = require('path');
const R = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'resumeJobs.js'));
const FarmController = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'farmController.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const MIN = 60000, HOUR = 3600000;
const NOW = 1760000000000;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  // ---- what is written down ----
  const farm = { running: true, mode: 'sequential', durationMs: 30 * MIN, games: [{ appid: 10, name: 'Alpha', remaining: 3, playtimeMin: 5, nested: { big: 1 }, list: [1, 2] }, { appid: 20, name: 'Beta', remaining: 1 }, { name: 'no id' }],
    location: () => ({ index: 1, passedMs: 12 * MIN, sessionStart: NOW - 90 * MIN }) };
  let e = R.describeJobs({ farm }, NOW);
  check('a running card farm: mode, plain games, place, time already run', e && e.farm.mode === 'sequential' && e.farm.games.length === 2 && !('nested' in e.farm.games[0]) && !('list' in e.farm.games[0])
    && e.farm.index === 1 && e.farm.passedMs === 12 * MIN && e.farm.sessionElapsedMs === 90 * MIN && e.farm.paused === false && e.savedAt === NOW, JSON.stringify(e));
  e = R.describeJobs({ farm: { running: false }, pendingFarm: { mode: 'fast', games: [{ appid: 5 }], durationMs: 0, location: { index: 0, passedMs: 0, sessionStart: NOW - 5 * MIN } } }, NOW);
  check('a card farm that is paused for a boost is written down as paused', e && e.farm.paused === true && e.farm.mode === 'fast' && e.farm.sessionElapsedMs === 5 * MIN);
  check('a farm the schedule started is left to the schedule', R.describeJobs({ farm, scheduleStarted: true }, NOW) === null);
  e = R.describeJobs({ boost: { runningFlag: true, startPoint: NOW - 2 * HOUR, sync: null, request: { appids: [1, 2], durationMs: 5 * HOUR, games: [{ appid: 1, playtimeMin: 10 }], allItems: null } } }, NOW);
  check('a plain boost: the games, the length and what has run (2 of 5 hours)', e && e.boost.appids.join() === '1,2' && e.boost.durationMs === 5 * HOUR && e.boost.elapsedMs === 2 * HOUR && e.boost.sync === false && e.boost.allItems === null);
  e = R.describeJobs({ boost: { runningFlag: true, startPoint: NOW - HOUR, sync: { strategyName: 'parallel' }, request: { appids: [1], durationMs: 0, games: [{ appid: 1, playtimeMin: 10 }, { appid: 2, playtimeMin: 99 }], allItems: null } } }, NOW);
  check('a synchronising boost is marked and carries no elapsed time (it plans its length again)', e && e.boost.sync === true && e.boost.elapsedMs === 0 && e.boost.games.length === 2);
  check('a boost that is not running is not written down', R.describeJobs({ boost: { runningFlag: false, request: { appids: [1] } } }, NOW) === null);
  e = R.describeJobs({ hoursFarm: { running: true, location: () => ({ index: 2, passedMs: 4 * MIN, sessionStart: NOW - 30 * MIN }) }, sequentialRequest: { games: [{ appid: 1 }, { appid: 2 }, { appid: 3 }], durationMs: 10 * MIN, loop: false } }, NOW);
  check('a sequential boost: games, place, loop flag', e && e.sequential.games.length === 3 && e.sequential.index === 2 && e.sequential.passedMs === 4 * MIN && e.sequential.loop === false && e.sequential.sessionElapsedMs === 30 * MIN);
  const realistic = { gameEntries: [{ appid: 1, name: 'Done' }, { appid: 2, name: 'Open' }, { appid: 3, name: 'Waiting' }, { appid: 4, name: 'Empty' }], gameIndex: 1,
    activeIds: { appid: 2, queueList: new Array(10).fill(0), indexNum: 4 }, preparing: { 3: { queueList: new Array(7).fill(0) }, 4: { queueList: [] } }, finishTime: NOW + 3 * HOUR, optionList: { model: 'exp', tcByGame: { 2: 60 } } };
  e = R.describeJobs({ realistic }, NOW);
  check('Realistic Mode: what is left of each game (6 of the open one, 7 of the waiting one, none of the finished and the empty one)', e && same(e.realistic.games.map((g) => [g.appid, g.left]), [[2, 6], [3, 7]]), JSON.stringify(e && e.realistic.games));
  check('Realistic Mode: the time that is left and the options', e.realistic.remainingMs === 3 * HOUR && e.realistic.options.model === 'exp' && e.realistic.options.tcByGame['2'] === 60);
  check('Realistic Mode started by the schedule is left to the schedule', R.describeJobs({ realistic, grScheduleStarted: true }, NOW) === null);
  check('Realistic Mode with nothing left to unlock is not written down', R.describeJobs({ realistic: Object.assign({}, realistic, { activeIds: { appid: 2, queueList: [1], indexNum: 1 }, preparing: {} }) }, NOW) === null);
  check('nothing running gives nothing', R.describeJobs({}, NOW) === null && R.describeJobs(null, NOW) === null);
  check('a job that throws while it is looked at gives nothing, not an error', R.describeJobs({ farm: { running: true, location: () => { throw new Error('x'); }, games: [] } }, NOW) === null);

  // ---- what is read back ----
  const good = { v: 1, accounts: { '76561198000000001': e = Object.assign({}, R.describeJobs({ farm, boost: { runningFlag: true, startPoint: NOW - HOUR, request: { appids: [7], durationMs: 3 * HOUR, games: null, allItems: null } } }, NOW)) } };
  let back = R.sanitizeFile(JSON.parse(JSON.stringify(good)), NOW + 5 * MIN);
  check('what was written comes back whole', back['76561198000000001'] && back['76561198000000001'].farm.games.length === 2 && back['76561198000000001'].boost.appids[0] === 7);
  check('not an object, another version, no accounts: nothing', same(R.sanitizeFile(null, NOW), {}) && same(R.sanitizeFile('x', NOW), {}) && same(R.sanitizeFile({ v: 2, accounts: good.accounts }, NOW), {}) && same(R.sanitizeFile({ v: 1 }, NOW), {}));
  check('an account id that is not a Steam id is dropped', same(R.sanitizeFile({ v: 1, accounts: { abc: good.accounts['76561198000000001'], '12': good.accounts['76561198000000001'] } }, NOW), {}));
  check('an entry older than a week is not taken', same(R.sanitizeFile(good, NOW + R.MAX_AGE_MS + 1000), {}) && R.sanitizeFile(good, NOW + R.MAX_AGE_MS - 1000)['76561198000000001']);
  const wild = { savedAt: NOW + 10 * HOUR, farm: { mode: 'fast', games: [{ appid: 'x' }, { appid: -4 }, { appid: 12, name: 'x'.repeat(500), deep: { a: 1 } }], durationMs: -5, index: -3, passedMs: 'abc', sessionElapsedMs: 1e30, paused: 1 } };
  let w = R.sanitizeEntry(wild, NOW);
  check('numbers are clamped, games without a real appid dropped, long names cut, nested values dropped', w && w.farm.games.length === 1 && w.farm.games[0].name.length === 120 && !('deep' in w.farm.games[0])
    && w.farm.durationMs === 0 && w.farm.index === 0 && w.farm.passedMs === 0 && w.farm.sessionElapsedMs <= 30 * 24 * HOUR && w.farm.paused === true && w.savedAt === NOW, JSON.stringify(w));
  check('a mode that is not a plain word is refused', R.sanitizeEntry({ savedAt: NOW, farm: { mode: 'fast; rm', games: [{ appid: 1 }] } }, NOW) === null);
  check('a farm without a game is nothing', R.sanitizeEntry({ savedAt: NOW, farm: { mode: 'fast', games: [] } }, NOW) === null);
  check('Realistic entries need a game and something left', R.sanitizeEntry({ savedAt: NOW, realistic: { games: [{ appid: 3, left: 0 }], remainingMs: 1 } }, NOW) === null
    && R.sanitizeEntry({ savedAt: NOW, realistic: { games: [{ appid: 3, left: 2 }], remainingMs: 5 } }, NOW).realistic.remainingMs === 60000);
  check('options that are too big are dropped, not kept', same(R.sanitizeEntry({ savedAt: NOW, realistic: { games: [{ appid: 3, left: 2 }], remainingMs: HOUR, options: { x: 'y'.repeat(30000) } } }, NOW).realistic.options, {}));
  check('a hundred accounts are not all taken', Object.keys(R.sanitizeFile({ v: 1, accounts: Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['7656119800000' + String(1000 + i), good.accounts['76561198000000001']])) }, NOW)).length <= 50);

  // ---- what starts again ----
  const entry = R.sanitizeEntry({ savedAt: NOW, farm: { mode: 'sequential', games: [{ appid: 10 }, { appid: 20 }], durationMs: 30 * MIN, index: 1, passedMs: 7 * MIN, sessionElapsedMs: 40 * MIN, paused: false },
    boost: { appids: [1, 2], durationMs: 5 * HOUR, games: [{ appid: 1, playtimeMin: 3 }], allItems: null, sync: false, elapsedMs: 2 * HOUR },
    sequential: { games: [{ appid: 4 }, { appid: 5 }], durationMs: 10 * MIN, loop: true, index: 1, passedMs: 2 * MIN, sessionElapsedMs: 20 * MIN },
    realistic: { games: [{ appid: 2, name: 'Open', left: 6 }, { appid: 3, name: 'Waiting', left: 7 }], remainingMs: 3 * HOUR, options: { model: 'exp', goalAuto: true, autoSpan: true, goalValue: 12 } } }, NOW);
  const LATER = NOW + 8 * HOUR;          // the PC was off for eight hours: they do not count
  let plan = R.buildPlan(entry, LATER);
  check('the card farm comes back at its game and its minute, the session clock as if it had never stopped', plan.farm.location.index === 1 && plan.farm.location.passedMs === 7 * MIN && plan.farm.location.sessionStart === LATER - 40 * MIN && plan.farm.mode === 'sequential');
  check('a boost with three hours left has three hours left, the eight hours the PC was off do not count', plan.boost.request.proceeding.startPoint === LATER - 2 * HOUR && plan.boost.request.durationMs === 5 * HOUR && plan.boost.refreshGames === false);
  check('a sequential boost continues at its place', plan.sequential.request.proceeding.index === 1 && plan.sequential.request.proceeding.passedMs === 2 * MIN && plan.sequential.request.proceeding.sessionStart === LATER - 20 * MIN);
  check('Realistic Mode: the games that are left, the time that is left, and the target of each game is what was left of it', same(plan.realistic.request.gameEntries, [2, 3]) && plan.realistic.request.spanMs === 3 * HOUR
    && same(plan.realistic.request.optionList.goalByGame, { 2: 6, 3: 7 }) && plan.realistic.request.optionList.goalAuto === false && plan.realistic.request.optionList.autoSpan === false
    && plan.realistic.request.optionList.goalValue === 0 && plan.realistic.request.optionList.model === 'exp');
  check('the plan holds copies: changing it leaves what was read alone', (plan.farm.games[0].appid = 99) && entry.farm.games[0].appid === 10);
  const syncEntry = R.sanitizeEntry({ savedAt: NOW, boost: { appids: [1], durationMs: 0, games: [{ appid: 1, playtimeMin: 3 }], sync: true, elapsedMs: 0 } }, NOW);
  plan = R.buildPlan(syncEntry, LATER);
  check('a synchronising boost starts again from fresh playtimes (it says so, and has no starting point)', plan.boost.refreshGames === true && plan.boost.request.proceeding === null);
  const spent = R.sanitizeEntry({ savedAt: NOW, boost: { appids: [1], durationMs: HOUR, elapsedMs: HOUR + 1000, sync: false } }, NOW);
  check('a boost whose time was used up is not started', R.buildPlan(spent, LATER).boost === null);
  check('nothing to start for an empty entry', same(R.buildPlan(null, LATER), { farm: null, boost: null, sequential: null, realistic: null }));

  // ---- the order they start in ----
  const calls = [];
  const mk = (name, result) => async (p) => { calls.push(name); if (result instanceof Error) throw result; return result; };
  plan = R.buildPlan(entry, LATER);
  let r = await R.run(plan, { startFarm: mk('farm', { ok: true }), holdFarm: mk('hold', { ok: true }), startBoost: mk('boost', { ok: true }), startSequential: mk('seq', { ok: true }), startRealistic: mk('realistic', { ok: true }), refreshBoostGames: async () => { calls.push('refresh'); } });
  check('the card farm first, then the others, in the order they were started', calls.join() === 'farm,boost,seq,realistic' && same(r.started, ['farm', 'boost', 'sequential', 'realistic']) && r.failed.length === 0, calls.join());
  calls.length = 0;
  const paused = R.buildPlan(R.sanitizeEntry({ savedAt: NOW, farm: { mode: 'fast', games: [{ appid: 1 }], paused: true }, boost: { appids: [1], durationMs: 0, sync: true } }, NOW), LATER);
  r = await R.run(paused, { startFarm: mk('farm', { ok: true }), holdFarm: mk('hold', { ok: true }), startBoost: mk('boost', { ok: true }), refreshBoostGames: async () => { calls.push('refresh'); } });
  check('a farm that was paused for a boost waits: the boost starts (after its playtimes are read again), then the farm is put back to wait', calls.join() === 'refresh,boost,hold', calls.join());
  calls.length = 0;
  r = await R.run(R.buildPlan(entry, LATER), { startFarm: mk('farm', { ok: false, error: 'no engine' }), startBoost: mk('boost', new Error('boom')), startSequential: mk('seq', { ok: true }), startRealistic: mk('realistic', { ok: true }) });
  check('a job that does not start, or throws, is reported and does not stop the others', same(r.started, ['sequential', 'realistic']) && r.failed.length === 2 && r.failed[0].kind === 'farm' && r.failed[1].error === 'boom', JSON.stringify(r));
  r = await R.run(R.buildPlan(syncEntry, LATER), { startBoost: async () => ({ ok: true }), refreshBoostGames: async () => { throw new Error('no answer'); } });
  check('playtimes that cannot be read again do not keep the boost from starting', same(r.started, ['boost']));

  // ---- the file ----
  const disk = new Map();
  const log = [];
  const deps = () => ({ file: 'resume.json', readText: (f) => { if (!disk.has(f)) { const x = new Error('none'); x.code = 'ENOENT'; throw x; } return disk.get(f); },
    write: (f, o) => { log.push('write'); disk.set(f, JSON.stringify(o)); return true; }, remove: (f) => { log.push('remove'); disk.delete(f); }, now: () => LATER });
  let store = R.createStore(deps());
  check('no file: nothing to resume, and an empty save does not touch the disk', store.load().length === 0 && store.save({}) === false && log.length === 0);
  const liveA = Object.assign({}, entry, { savedAt: LATER });
  check('running jobs are written, every time (the time they have run changes)', store.save({ '76561198000000001': liveA }) === true && store.save({ '76561198000000001': liveA }) === true && log.join() === 'write,write');
  log.length = 0;
  store = R.createStore(deps());
  check('a second run reads them back', same(store.load(), ['76561198000000001']) && !!store.peek('76561198000000001') && store.peek('76561198000000002') === null);
  check('what waits is not written again and again', store.save({}) === false && log.length === 0);
  check('an account that waits stays in the file while another one is running', store.save({ '76561198000000002': liveA }) === true && Object.keys(JSON.parse(disk.get('resume.json')).accounts).sort().join() === '76561198000000001,76561198000000002');
  check('once an account is running its own jobs, the old entry for it is gone', (store.save({ '76561198000000001': liveA, '76561198000000002': liveA }), store.peek('76561198000000001') === null));
  store = R.createStore(deps()); store.load();
  check('take gives the entry once', !!store.take('76561198000000001') && store.take('76561198000000001') === null && !!store.take('76561198000000002'));
  check('with nothing left the file is removed', (log.length = 0, store.save({}) === false) && log.join() === 'remove' && !disk.has('resume.json'));
  disk.set('resume.json', '{ half a file');
  store = R.createStore(deps());
  check('a file that cannot be read is no file, and it is cleaned away at the first save', store.load().length === 0 && (log.length = 0, store.save({})) === false && log.join() === 'remove' && !disk.has('resume.json'));
  store = R.createStore(deps()); disk.set('resume.json', JSON.stringify({ v: 1, accounts: { '76561198000000003': Object.assign({}, liveA, { savedAt: LATER - R.MAX_AGE_MS - 1000 }) } }));
  check('an old entry is dropped at load', store.load().length === 0);
  disk.set('resume.json', JSON.stringify({ v: 1, accounts: { '76561198000000004': liveA } }));
  store = R.createStore(deps()); store.load(); store.forget('76561198000000004'); log.length = 0;
  check('forget drops an account (it was deleted from the app)', store.save({}) === false && !disk.has('resume.json'));
  store = R.createStore(deps()); store.save({ '76561198000000005': liveA }); log.length = 0; store.clear();
  check('clear removes the file and what waits', log.join() === 'remove' && !disk.has('resume.json') && store.pendingIds().length === 0);

  // ---- a real card farm, written down and started again ----
  const played = []; const engine = { play: (ids) => played.push(ids.slice()), stop() {}, playingApps: () => played[played.length - 1] || [] };
  const farmA = new FarmController(engine, () => {}, 'card');
  const t0 = Date.now();
  farmA.start('sequential', [{ appid: 1, name: 'a', remaining: 2, playtimeMin: 0 }, { appid: 2, name: 'b', remaining: 2, playtimeMin: 0 }, { appid: 3, name: 'c', remaining: 2, playtimeMin: 0 }], 20 * MIN);
  farmA.index = 2; farmA.startedAt = t0 - 7 * MIN; farmA.sessionStart = t0 - 50 * MIN;
  const written = R.describeJobs({ farm: farmA }, t0);
  farmA.stop('user');
  const wrote = R.sanitizeEntry(JSON.parse(JSON.stringify(written)), t0);
  const plan2 = R.buildPlan(wrote, Date.now());
  const farmB = new FarmController(engine, () => {}, 'card');
  farmB.start(plan2.farm.mode, plan2.farm.games, plan2.farm.durationMs, { proceeding: plan2.farm.location });
  check('the real farm continues at the third game, 7 minutes into it, with the session clock where it was', farmB.running && farmB.index === 2 && Math.abs(farmB.startedAt - (Date.now() - 7 * MIN)) < 2000 && Math.abs(farmB.sessionStart - (Date.now() - 50 * MIN)) < 2000 && farmB.games.length === 3,
    'index ' + farmB.index + ' start ' + Math.round((Date.now() - farmB.startedAt) / MIN) + ' min session ' + Math.round((Date.now() - farmB.sessionStart) / MIN) + ' min');
  farmB.stop('user');

  process.exit(failures ? 1 : 0);
})();
