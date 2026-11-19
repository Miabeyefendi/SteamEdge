// A game whose cards have all dropped but whose badge row has no "No card drops remaining" line (seen on a real account in 4.3.6: Arcade Spirits,
// 910630). The badge page simply stops listing it. Up to 4.3.6 the farm kept it for good ("the scrape may have been incomplete") and played it all
// night while the Card Farming page, fed from the same read, showed no cards for it; a Start with a page list read hours earlier put such a game in the
// queue as well. Checked here: the badge read says whether it was complete, the farm takes a game out after two complete reads without it (never after
// a read that was not complete), and a Start reads the badge page again first.
// Run with `npm test` (tests/run.js).
const path = require('path');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const root = path.resolve(__dirname, '..', '..');
const FarmController = require(path.join(root, 'src', 'core', 'farmController.js'));
const { createFakeSteam, loadEngine } = require('./fake-steam-user.js');

const ARCADE = { appid: 910630, name: 'Arcade Spirits', remaining: 2, playtimeMin: 300 };
const OTHER = { appid: 2, name: 'Other', remaining: 3, playtimeMin: 300 };
const fakeEngine = () => ({ played: [], play(ids) { this.played.push(ids.slice()); }, stop() {}, playingApps() { return []; } });

(async () => {
  // ---- the badge read says whether it was complete ----
  {
    const { FakeSteamUser } = createFakeSteam();
    const SteamEngine = loadEngine(FakeSteamUser);
    const row = (id, text) => '<div class="badge_row"><a href="steam://run/' + id + '"></a>' + text + '</div>';
    const page = (rows, pages) => 'g_steamID = "765"; ' + (pages || []).map((p) => '<a href="?p=' + p + '">' + p + '</a>').join('') + rows.join('');
    const read = async (pages) => {
      const eng = new SteamEngine();
      eng.cookies = ['x']; eng.steamID = '765';
      eng._requestItem = async (url) => { const p = +url.match(/[?&]p=(\d+)/)[1]; return { text: async () => pages[p - 1] || '' }; };
      return eng.getDropGames(true);
    };
    let r = await read([page([row(2, '3 card drops remaining')], [1, 2]), page([row(3, 'No card drops remaining')], [1, 2])]);
    check('every page read: complete', r.complete === true && r.gameEntries.length === 1 && r.finishedOnes.has(3));
    r = await read([page([row(2, '3 card drops remaining')], [1, 2, 3]), page([], [1, 2, 3]), page([row(4, '1 card drop remaining')], [1, 2, 3])]);
    check('a page in the middle came back empty: not complete', r.complete === false);
    r = await read([page([row(2, '3 card drops remaining')])]);
    check('one page: complete, and the game without a line is simply not listed', r.complete === true && !r.gameEntries.some((g) => g.appid === 910630));
  }

  // ---- the farm: two complete reads without the game take it out ----
  for (const mode of ['fast', 'sequential']) {
    const ticks = [];
    const fc = new FarmController(fakeEngine(), (ch, d) => ticks.push(d), 'card');
    fc.start(mode, [ARCADE, OTHER], 300000, { fastMinPlaytimeMin: 0 });
    fc.updateGames([OTHER], new Set(), { complete: false });
    fc.updateGames([OTHER], new Set(), { complete: false });
    fc.updateGames([OTHER], new Set(), { complete: false });
    check(mode + ': reads that were not complete never take a game out', fc.games.some((g) => g.appid === 910630));
    fc.updateGames([OTHER], new Set(), { complete: true });
    check(mode + ': one complete read without it is not enough', fc.games.some((g) => g.appid === 910630));
    fc.updateGames([ARCADE, OTHER], new Set(), { complete: true });
    fc.updateGames([OTHER], new Set(), { complete: true });
    check(mode + ': a read that lists it again starts the count over', fc.games.some((g) => g.appid === 910630));
    fc.updateGames([OTHER], new Set(), { complete: true });
    check(mode + ': the second complete read in a row without it takes it out', !fc.games.some((g) => g.appid === 910630) && fc.running);
    fc.updateGames([], new Set(), { complete: true });
    fc.updateGames([], new Set(), { complete: true });
    const last = ticks[ticks.length - 1];
    check(mode + ': the last game gone, the farm ends as finished', !fc.running && last && last.cause === 'finished' && last.wasRunning === true, JSON.stringify(last));
    fc.stop('user');
  }

  // ---- the card watcher of the main process, end to end (the case of 4.3.6) ----
  const intervals = [];
  const realSetInterval = global.setInterval;
  global.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return { unref() {} }; };
  global.clearInterval = () => {};
  const accounts = new Map();
  const sent = [], ticks = [], events = [];
  let badge = { gameEntries: [{ ...OTHER }], finishedOnes: new Set(), complete: true };
  let reads = 0, hold = null;
  const engine = Object.assign(fakeEngine(), { getDropGames: async () => { reads++; if (hold) await hold; return { ...badge, gameEntries: badge.gameEntries.map((g) => ({ ...g })) }; } });
  const slotOf = (id) => { if (!accounts.has(id)) accounts.set(id, { engine, ready: true, farm: null }); return accounts.get(id); };
  const ctx = {
    FarmController, accountBoostRunning: () => false, accountBroadcast: () => (ch, d) => ticks.push([ch, d]), accountEvent: (id, e) => events.push(e),
    accountName: () => 'tester', accountRunning: (s) => !!(s.farm && s.farm.running), accounts, addDailyCard() {}, addStat() {}, app: {}, log() {}, logger: { event() {} },
    sendRaw: (c, d) => sent.push([c, d]), slotOf, storeLists() {}, accountData: () => ({ lists: { drop: [] }, entries: {}, farmAchAt: 1 }), activeSteamID: 'A',
    settingFor: () => undefined, writeAccountDataDelayed() {},
  };
  const cf = require(path.join(root, 'src', 'backend', 'cardfarm.js'))(ctx);
  // the watcher started by a farm that the page started with an old list (no fresh read): the game is in the queue
  cf.startCardFarm('A', 'fast', [{ ...ARCADE }, { ...OTHER }], 300000);
  const s = accounts.get('A');
  const watch = intervals.find((i) => i.ms === 3 * 60 * 1000);
  check('the farm runs with the stale game in it', s.farm.running && s.farm.games.some((g) => g.appid === 910630) && !!watch);
  await watch.fn();
  check('first watcher read without it: still played', s.farm.games.some((g) => g.appid === 910630));
  check('the Card Farming page gets the same list the farm works from', sent.some((x) => x[0] === 'farm:list' && !x[1].games.some((g) => g.appid === 910630)));
  await watch.fn();
  check('second watcher read without it: out of the queue, the farm goes on with the rest', !s.farm.games.some((g) => g.appid === 910630) && s.farm.running);
  badge = { gameEntries: [], finishedOnes: new Set(), complete: true };
  await watch.fn(); await watch.fn();
  check('no game with cards left: card farming ends as finished', !s.farm.running && events.some((e) => e.typeName === 'cardsDone'));

  // ---- Start: the badge page is read again first ----
  badge = { gameEntries: [{ ...OTHER }], finishedOnes: new Set(), complete: true };
  reads = 0;
  let ok = await cf.startCardFarmFromPage('A', 'fast', [{ ...ARCADE }, { ...OTHER }], 300000);
  check('Start reads the badge page and leaves the game without cards out', ok && reads === 1 && s.farm.running && s.farm.games.map((g) => g.appid).join() === '2');
  s.farm.stop('user');
  badge = { gameEntries: [{ ...OTHER }], finishedOnes: new Set(), complete: false };
  ok = await cf.startCardFarmFromPage('A', 'fast', [{ ...ARCADE }, { ...OTHER }], 300000);
  check('a read that was not complete leaves the game in (only "No card drops remaining" takes it out then)', ok && s.farm.games.some((g) => g.appid === 910630));
  s.farm.stop('user');
  badge = { gameEntries: [], finishedOnes: new Set([910630]), complete: true };
  ticks.length = 0; events.length = 0;
  ok = await cf.startCardFarmFromPage('A', 'fast', [{ ...ARCADE }], 300000);
  check('no game with cards left: nothing starts, and the page is told why', !ok && !s.farm.running
    && ticks.some((t) => t[0] === 'farm:tick' && t[1].cause === 'noCards') && events.some((e) => e.feedEntry && e.feedEntry.text === 'Kartı kalan oyun yok.'));
  // a Stop pressed while the badge page is read wins
  badge = { gameEntries: [{ ...OTHER }], finishedOnes: new Set(), complete: true };
  let release; hold = new Promise((r) => { release = r; });
  const pending = cf.startCardFarmFromPage('A', 'fast', [{ ...OTHER }], 300000);
  s.farmStartSeq++;              // what engine:stopFarm does
  release(); hold = null;
  ok = await pending;
  check('Stop while the page is read: the farm does not start after it', !ok && !s.farm.running);
  // the read fails (no network): the page's own list is used, as before
  engine.getDropGames = async () => { throw new Error('offline'); };
  ok = await cf.startCardFarmFromPage('A', 'fast', [{ ...ARCADE }], 300000);
  check('the badge page cannot be read: the list of the page is used', ok && s.farm.running && s.farm.games.some((g) => g.appid === 910630));
  s.farm.stop('user');

  global.setInterval = realSetInterval;
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + (e && e.stack)); process.exit(1); });
