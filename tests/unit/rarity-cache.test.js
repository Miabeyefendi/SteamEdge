// The rarity percentages Realistic Mode orders its queue by: kept for a day, retried, a stale answer used when Steam does not answer, and a queue that is refused
// (instead of built in the order of the schema) when there is nothing to go by. Also the order of the queue and the name of the game.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const root = path.resolve(__dirname, '..', '..');
const planner = require(path.join(root, 'src', 'core', 'realisticPlan.js'));
const rarityCache = require(path.join(root, 'src', 'core', 'rarityCache.js'));
const SteamEngine = require(path.join(root, 'src', 'core', 'steamEngine.js'));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rarity-'));
  const file = path.join(dir, 'achievement-rarity.json');
  rarityCache.setFile(file);

  // ---- the cache ----
  check('nothing kept at first', rarityCache.get(10, false) === null);
  rarityCache.set(10, { A: 50, B: 5 });
  check('what was set comes back, fresh', JSON.stringify(rarityCache.get(10, true).map) === '{"A":50,"B":5}');
  check('and is written to the file', JSON.parse(fs.readFileSync(file, 'utf8'))['10'].map.A === 50);
  rarityCache.setFile(file);
  check('a new start reads it back from the file', JSON.stringify(rarityCache.get(10, false).map) === '{"A":50,"B":5}');
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  written['10'].ts = Date.now() - 25 * 3600000;
  fs.writeFileSync(file, JSON.stringify(written));
  rarityCache.setFile(file);
  check('after a day it is no longer fresh, but is still there as a stale answer', rarityCache.get(10, true) === null && rarityCache.get(10, false) !== null);
  fs.writeFileSync(file, '{ not json');
  rarityCache.setFile(file);
  check('a damaged file is only a cache: it reads as empty', rarityCache.get(10, false) === null);

  // ---- the engine's request ----
  const eng = Object.create(SteamEngine.prototype);
  let calls = 0, mode = 'ok';
  eng._requestItem = async () => {
    calls++;
    if (mode === 'fail') throw new Error('HTTP 429');
    if (mode === 'garbage') return { json: async () => { throw new Error('bad'); } };
    if (mode === 'empty') return { json: async () => ({ achievementpercentages: { achievements: [] } }) };
    return { json: async () => ({ achievementpercentages: { achievements: [{ name: 'ACH_1', percent: '74.1' }, { name: 'ACH_2', percent: '2.5' }] } }) };
  };
  // the retry wait is two seconds; the test does not wait for it
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => realSetTimeout(fn, 0);
  rarityCache.setFile(path.join(dir, 'second.json'));
  let r = await eng.fetchAchievementRarity(7);
  check('an answer from Steam: percentages as numbers, ok, from steam', r.ok && r.source === 'steam' && r.map.ACH_1 === 74.1 && r.map.ACH_2 === 2.5, JSON.stringify(r));
  const before = calls;
  r = await eng.fetchAchievementRarity(7);
  check('the second time it comes from the cache and Steam is not asked', r.source === 'cache' && calls === before);
  mode = 'fail';
  calls = 0;
  r = await eng.fetchAchievementRarity(8);
  check('Steam does not answer and nothing is kept: not ok, an empty map, and it tried more than once', !r.ok && r.source === 'none' && Object.keys(r.map).length === 0 && calls === 2, JSON.stringify(r) + ' calls ' + calls);
  mode = 'garbage';
  r = await eng.fetchAchievementRarity(8);
  check('an answer that cannot be read counts as no answer', !r.ok);
  const stale = rarityCache.get(7, false);
  stale.ts = Date.now() - 48 * 3600000;
  mode = 'fail';
  r = await eng.fetchAchievementRarity(7);
  check('Steam does not answer but an old answer is kept: it is used', r.ok && r.source === 'stale' && r.map.ACH_1 === 74.1);
  mode = 'empty';
  r = await eng.fetchAchievementRarity(9);
  check('a game with no percentages is a valid, empty answer, not a failure', r.ok && Object.keys(r.map).length === 0 && r.source === 'steam');
  global.setTimeout = realSetTimeout;

  // ---- prepareRealisticQueue: the order and the refusal (cut out of main.js) ----
  const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const a = src.indexOf('// The engine\'s achievement call gives no game name');
  const b = src.indexOf('// The completed form of the incoming options.');
  check('the function is in main.js', a > 0 && b > a);
  const logs = [];
  const ctx = {
    log: (l, m) => logs.push(l + ' ' + m), markNoAchievements: () => {}, Number, Array, Object, Math, JSON,
    relativeRarity: planner.relativeRarity, isUltraRare: planner.isUltraRare,
    accounts: new Map(), accountData: () => ({ lists: { owned: [{ appid: 636150, name: 'Bullet Game' }, { appid: 5, name: 'Other' }] } }),
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + ';this.prepare = prepareRealisticQueue;', ctx);
  const motorOf = (achievements, extra) => { const m = { getAchievements: async () => Object.assign({ gameName: null, achievements }, extra || {}) }; ctx.accounts.set('1', { engine: m }); return m; };
  const ach = (apiName, pct, achieved) => ({ apiName, name: apiName, achieved: !!achieved, protectedFlag: false, rarityPct: pct });
  let m = motorOf([ach('rare', 1.2), ach('common', 70), ach('mid', 12), ach('unknown', null), ach('done', 30, true)], { rarityOk: true });
  let out = await ctx.prepare(m, 636150, {});
  check('the queue is ordered from the most common to the rarest, unknown last, unlocked ones left out', out.ok && out.queueList.map((x) => x.apiName).join() === 'common,mid,rare,unknown', out.queueList && out.queueList.map((x) => x.apiName).join());
  check('the game has its name from the library of the account, not "App 636150"', out.gameTitle === 'Bullet Game', out.gameTitle);
  out = await ctx.prepare(m, 99, {});
  check('a game that is not in the library keeps the App number as its name', out.gameTitle === 'App 99');
  out = await ctx.prepare(m, 636150, { ultraRareSkip: true });
  check('"skip ultra rare" leaves out what is under 5% and keeps the order', out.queueList.map((x) => x.apiName).join() === 'common,mid,unknown' && out.ultraSkipped === 1);
  m = motorOf([{ ...ach('first', null), isHidden: true }, ach('second', null), { ...ach('third', null), isHidden: true }, ach('fourth', null)], { rarityOk: false });
  out = await ctx.prepare(m, 636150, {});
  check('when the percentages could not be read the run still starts, with the flag', out.ok === true && out.rarityMissing === true, JSON.stringify(out).slice(0, 160));
  check('the guessed order is the schema order with the hidden achievements last', out.queueList.map((x) => x.apiName).join() === 'second,fourth,first,third', out.queueList.map((x) => x.apiName).join());
  check('and the guess is logged', logs.some((l) => /rarity percentages/.test(l)));
  m = motorOf([ach('a', 60), ach('b', 40), ach('c', 1.5), ach('d', 1)], { rarityOk: true });
  out = await ctx.prepare(m, 636150, {});
  check('rarity is judged against the best achievement of the game: 1.5% and 1% of a game whose best is 60% are ultra rare', out.queueList.map((x) => x.ultra).join() === 'false,false,true,true' && out.rarityMissing === false, JSON.stringify(out.queueList.map((x) => x.ultra)));
  m = motorOf([ach('a', 7), ach('b', 6), ach('c', 5), ach('d', 3)], { rarityOk: true });
  out = await ctx.prepare(m, 636150, {});
  check('a game whose achievements are all 3% to 7% has no ultra rare ones', out.queueList.every((x) => x.ultra === false));
  out = await ctx.prepare(m, 636150, { ultraRareSkip: true });
  check('and "skip ultra rare" then skips nothing in it', out.queueList.length === 4 && out.ultraSkipped === 0);
  m = motorOf([ach('t3', 4.93), ach('t1', 4.94), ach('t2', 4.91), ach('top', 7.02)], { rarityOk: true });
  out = await ctx.prepare(m, 636150, {});
  check('percentages that read the same at one decimal keep the schema order (tiers of one family do not shuffle between two reads)', out.queueList.map((x) => x.apiName).join() === 'top,t3,t1,t2', out.queueList.map((x) => x.apiName).join());
  m = motorOf([ach('a', 10), ach('b', 20)], { rarityOk: true, gameName: 'Named By Steam' });
  out = await ctx.prepare(m, 636150, {});
  check('a name that Steam gives wins', out.gameTitle === 'Named By Steam');

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
