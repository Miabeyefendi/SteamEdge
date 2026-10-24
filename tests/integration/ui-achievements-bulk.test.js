// Achievements page, a bulk unlock: picking another game (with the same achievement names) while it runs must not send the rest to that game or account.
// The page's clock is sped up so the unlock interval does not make the test slow.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, achDelay: '15', achSafeMode: false, achConfirmSingle: false, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const calls = [];
const items = Array.from({ length: 14 }, (_, i) => ({ assetId: String(i + 1), order: i, dedupKey: 'k_' + i, name: i % 3 === 0 ? 'Some Rather Long Trading Card Name ' + i : 'Card ' + i, marketHashName: '440-Card ' + i, iconUrl: null, tradable: i % 2 === 0, marketable: true, type: i % 5 === 0 ? 'booster' : 'card', gameName: 'Game Number ' + (i % 7), appid: 440 + (i % 7), amount: 1 + (i % 4) }));
const games = ['Alpha Game', 'Beta Game With A Much Longer Name Than Usual', 'Gamma Game', 'Delta', 'Epsilon Game'].map((name, i) => ({ appid: 10 * (i + 1), name, remaining: 1 + i, playtimeMin: 500 - 20 * i }));
const answers = {
  'settings:get': () => settings, 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games, refundIds: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: games.map((g, i) => ({ appid: g.appid, name: g.name, playtimeForever: 600 - 40 * i, hasStats: true })) }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [], 'accounts:connectAll': () => [],
  'engine:inventory': () => ({ ok: true, items }), 'engine:pricesFor': (_e, h) => { calls.push(['prices', h]); return { ok: true, prices: {}, queued: 0 }; }, 'engine:historyFor': (_e, h) => { calls.push(['history', h]); return { ok: true, history: {} }; },
  'engine:itemOrders': () => ({ ok: true, orders: { error: 'x' } }), 'engine:priceHistory': () => ({ ok: true, history: null }), 'engine:saleFee': () => ({ ok: true, outcomeData: [] }),
  'market:myListings': () => ({ ok: true, data: { listings: [], toConfirm: [], onHold: [], buyOrders: 0 } }),
  'keys:state': () => ({ queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null }),
  'app:info': () => ({ versionStr: '1.4.9' }), 'app:memory': () => null, 'update:lastStatus': () => null, 'realistic:noAchievementsList': () => ({ ok: true, appids: [] }),
};
const planner = require(ROOT + '/src/core/realisticPlan.js');
const hours = (n) => n * 3600000;
const ach = (total, open) => ({ ok: true, queueList: Array.from({ length: total - open }, (_, i) => ({ apiName: 'A' + i, name: 'Achievement ' + i, rarityPct: 80 - i })), suitableTotal: total - open, totalAchievements: total, unlockedState: open, protectedFlag: 0, ultraSkipped: 0, gameTitle: 'Game' });
Object.assign(answers, {
  'engine:ownedGames': () => ({ ok: true, games: [{ appid: 10, name: 'Alpha Game', playtimeForever: 0, hasStats: true }, { appid: 20, name: 'Beta Game', playtimeForever: 0, hasStats: true }] }),
  'realistic:plan': (_e, arg) => {
    calls.push(['plan', arg]);
    const pick = arg.optionList;
    const ids = arg.queueIds && arg.queueIds.length ? arg.queueIds : [arg.appid];
    const built = planner.planGames(ids.map((id) => ({ appid: id, h: id === 10 ? ach(50, 0) : ach(20, 0) })), pick, arg.spanMs, true);
    const head = built.games.find((g) => g.appid === arg.appid);
    const share = built.parallel ? built.spanMs : built.spanMs * (head.queueList.length / Math.max(1, built.games.reduce((t, g) => t + g.queueList.length, 0)));
    planner.placeRealisticTimes(head.queueList, share, pick.model, 0, planner.realisticTimeSetting(arg.appid, pick));
    return { ok: true, accumulation: 0, appid: arg.appid, gameTitle: 'Game', totalSum: head.queueList.length, suitableTotal: head.h.suitableTotal, totalAchievements: head.h.totalAchievements, unlockedState: 0,
      protectedFlag: 0, ultraSkipped: 0, parallel: built.parallel, suitableQueue: built.games.reduce((t, g) => t + g.h.suitableTotal, 0), spanMs: built.spanMs, autoSpan: built.auto, queueTotal: built.games.reduce((t, g) => t + g.queueList.length, 0), model: pick.model,
      averageIntervalMs: Math.round(share / Math.max(1, head.queueList.length)), firstUnlockMs: Math.min(...head.queueList.map((a) => a.timeValue)), unlockWindowMs: Math.max(...head.queueList.map((a) => a.timeValue)), unlockRatio: Math.min(1, Math.max(...head.queueList.map((a) => a.timeValue)) / share), queueList: head.queueList.map((a, i) => ({ appid: arg.appid, name: a.name, rarityPct: a.rarityPct, pos: i / head.queueList.length, timeValue: a.timeValue })) };
  },
  'realistic:start': (_e, arg) => { calls.push(['start', arg]); return { ok: true, totalSum: 50, gameCount: 2, gameTitle: 'Alpha Game' }; },
});
const schema = (appid) => ({ gameName: 'Game ' + appid, rarityOk: true, total: 6, unlocked: 0, achievements: Array.from({ length: 6 }, (_, i) => ({ apiName: 'ACH_WIN_' + i, name: 'Win ' + i, desc: '', achieved: !!(achievedBy[appid] && achievedBy[appid].has('ACH_WIN_' + i)), protectedFlag: false, rarityPct: 80 - i * 10, icon: null })) });
const achievedBy = {};
const sets = [], logs = [];
Object.assign(answers, {
  'engine:ownedGames': () => ({ ok: true, games: [{ appid: 10, name: 'First Game', playtimeForever: 60, hasStats: true }, { appid: 20, name: 'Second Game', playtimeForever: 60, hasStats: true }] }),
  'engine:achievements': (_e, arg) => ({ ok: true, data: schema(arg.appid) }),
  'engine:setAchievements': (_e, arg) => { sets.push([arg.appid, arg.steamID || null, arg.changes[0].apiName]); (achievedBy[arg.appid] = achievedBy[arg.appid] || new Set()).add(arg.changes[0].apiName); return { ok: true, result: {} }; },
  'state:achLog': (_e, entry) => { logs.push(entry); return { ok: true }; },
});
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
[...preload.matchAll(/invoke\('([^']+)'/g)].forEach((m) => { try { ipcMain.handle(m[1], answers[m[1]] || (() => ({ ok: true }))); } catch (_) {} });
[...preload.matchAll(/send\('([^']+)'/g)].forEach((m) => ipcMain.on(m[1], () => {}));
const consoleErr = [];
const log = console.log;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: process.env.SHOW === '1', width: 1600, height: 1000, useContentSize: true, webPreferences: { preload: ROOT + '/preload.js', sandbox: false, contextIsolation: true, backgroundThrottling: false } });
  const consoleErr = [];
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 && !/Electron Security Warning/.test(msg)) consoleErr.push(msg.slice(0, 200)); });
  await w.loadFile(ROOT + '/src/main/main.html');
  const js = (k) => w.webContents.executeJavaScript(k).catch((e) => { log('[js error] ' + e.message); return null; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let failures = 0;
  const check = (name, condition, extra) => { if (!condition) failures++; log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  await wait(1500);
  await js("document.querySelector('.nav a[data-tab=achievements]').click()");
  await wait(1500);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  const pick = async (id) => { await js("(() => { const i = document.getElementById('acGameInput'); i.dispatchEvent(new Event('focus')); })()"); await wait(300); await js("document.querySelector('#acGameList [data-gid=\"" + id + "\"]').click()"); };
  await pick(10);
  await wait(1200);
  check('the first game is open with its 6 locked achievements', (await js("document.getElementById('acBody').textContent.indexOf('Win 5') >= 0")) === true);
  // the page clock runs 100 times faster from here: the 15 s interval becomes 0.15 s
  await js("(() => { const r = Date.now.bind(Date); const t0 = r(); Date.now = () => t0 + (r() - t0) * 100; })()");
  await js("document.getElementById('acAllUnlock').click()");
  await wait(600);
  await js("document.querySelector('.e-modal-ft .ok').click()");
  for (let i = 0; i < 40 && sets.length < 2; i++) await wait(100);
  // in the middle of the run another game with the SAME achievement names is picked
  await pick(20);
  for (let i = 0; i < 80 && sets.length < 6; i++) await wait(150);
  await wait(1500);
  check('all six unlocks of the run were sent', sets.length === 6, JSON.stringify(sets));
  check('every unlock went to the FIRST game, none to the game picked in the middle', sets.every((x) => x[0] === 10), JSON.stringify(sets.map((x) => x[0])));
  check('every unlock names the account the run started on', sets.every((x) => x[1] === '76561198000000000'), JSON.stringify(sets.map((x) => x[1])));
  check('the log lines are for the first game and that account', logs.length === 6 && logs.every((l) => l.appid === 10 && l.steamID === '76561198000000000'), JSON.stringify(logs.map((l) => l.appid)));
  check('nothing of the second game was unlocked', !achievedBy[20]);
  log('console errors ' + JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
