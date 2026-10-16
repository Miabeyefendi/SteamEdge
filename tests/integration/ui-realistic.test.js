// Realistic Mode page: the target and the duration shown are the ones the engine plans. A game that takes 60 hours gets 60 hours, a duration typed by hand
// is respected, and the switch for the automatic duration works on the first click.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, grQueue: [10, 20], grTcGame: { 10: 60, 20: 20 }, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
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
    const share = built.spanMs * (head.queueList.length / Math.max(1, built.games.reduce((t, g) => t + g.queueList.length, 0)));
    planner.placeRealisticTimes(head.queueList, share, pick.model, 0, planner.realisticTimeSetting(arg.appid, pick));
    return { ok: true, accumulation: 0, appid: arg.appid, gameTitle: 'Game', totalSum: head.queueList.length, suitableTotal: head.h.suitableTotal, totalAchievements: head.h.totalAchievements, unlockedState: 0,
      protectedFlag: 0, ultraSkipped: 0, spanMs: built.spanMs, autoSpan: built.auto, queueTotal: built.games.reduce((t, g) => t + g.queueList.length, 0), model: pick.model,
      averageIntervalMs: Math.round(share / Math.max(1, head.queueList.length)), queueList: head.queueList.map((a) => ({ name: a.name, rarityPct: a.rarityPct, timeValue: a.timeValue })) };
  },
  'realistic:start': (_e, arg) => { calls.push(['start', arg]); return { ok: true, totalSum: 50, gameCount: 2, gameTitle: 'Alpha Game' }; },
});
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
[...preload.matchAll(/invoke\('([^']+)'/g)].forEach((m) => { try { ipcMain.handle(m[1], answers[m[1]] || (() => ({ ok: true }))); } catch (_) {} });
[...preload.matchAll(/send\('([^']+)'/g)].forEach((m) => ipcMain.on(m[1], () => {}));
const consoleErr = [];
const log = console.log;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: process.env.SHOW === '1', width: 1716, height: 1000, useContentSize: true, webPreferences: { preload: ROOT + '/preload.js', sandbox: false, contextIsolation: true, backgroundThrottling: false } });
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 && !/Electron Security Warning/.test(msg)) consoleErr.push(msg.slice(0, 200)); });
  await w.loadFile(ROOT + '/src/main/main.html');
  const js = (k) => w.webContents.executeJavaScript(k).catch((e) => { log('[js error] ' + e.message); return null; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => { if (!process.env.SHOTS) return; w.webContents.invalidate(); await w.webContents.capturePage(); await wait(350); w.webContents.invalidate(); fs.writeFileSync(process.env.SHOTS + '/' + name + '.png', (await w.webContents.capturePage()).toPNG()); };
  let failures = 0;
  const check = (name, condition, extra) => { if (!condition) failures++; log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  await wait(1500);

  const lastPlan = () => calls.filter((c) => c[0] === 'plan').slice(-1)[0][1];
  const field = (id) => js("document.getElementById('" + id + "').value");
  await js("document.querySelector('.nav a[data-tab=realistic]').click()");
  await wait(1500);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  let p = lastPlan();
  check('the plan is asked for the whole queue', JSON.stringify(p.queueIds) === '[10,20]', JSON.stringify(p.queueIds));
  check('the page asks the engine for the automatic target and duration', p.optionList.goalAuto === true && p.optionList.autoSpan === true);
  check('each game carries its own completion time, "normal" difficulty is 1', p.optionList.tcByGame['10'] === 60 && p.optionList.tcByGame['20'] === 20 && p.optionList.difficultyValue === 1, JSON.stringify(p.optionList.tcByGame) + ' ' + p.optionList.difficultyValue);
  check('the duration fields show what the engine planned: 60 + 20 = 80 hours', (await field('grRH')) === '80' && (await field('grRM')) === '00', (await field('grRH')) + ':' + (await field('grRM')));
  check('the target box shows the engine target (all 50), not a number worked out in the page', (await field('grTarget')) === '50', await field('grTarget'));
  check('the duration was remembered', settings.grDurationSec === 80 * 3600, String(settings.grDurationSec));

  // Start: the engine gets the flags and the confirm text names the real numbers
  await js("document.getElementById('grStart').click()");
  await wait(600);
  const text = await js("(document.querySelector('.e-modal-back') || { textContent: '' }).textContent");
  check('the question says 50 achievements over 80 hours', /50/.test(text) && /80/.test(text), text.slice(0, 120));
  await js("document.querySelector('.e-modal-ft .ok').click()");
  await wait(700);
  const start = calls.filter((c) => c[0] === 'start').slice(-1)[0][1];
  check('the start carries the automatic flags and the 80 hours', start.optionList.autoSpan === true && start.optionList.goalAuto === true && start.spanMs === 80 * 3600000, String(start.spanMs));
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");

  // A duration typed by hand wins
  const before = calls.filter((c) => c[0] === 'plan').length;
  await js("(() => { const h = document.getElementById('grRH'); h.value = '02'; h.dispatchEvent(new Event('change')); })()");
  await wait(900);
  p = lastPlan();
  check('after typing 2 hours the automatic duration is off', calls.filter((c) => c[0] === 'plan').length > before && p.optionList.autoSpan === false && p.spanMs === 2 * 3600000, String(p.spanMs));
  check('the target is now what 2 hours earn (about 2 + 1), not all 50', Number(await field('grTarget')) <= 5, await field('grTarget'));
  check('the typed duration stays', (await field('grRH')) === '02', await field('grRH'));

  // The switch: the first click turns it off, the second on and brings the automatic duration back
  settings.grAutoDuration = undefined; delete settings.grAutoDuration;
  await js("document.querySelector('#tab-realistic [data-grset=grAutoDuration]').click()");
  await wait(500);
  check('the first click on the automatic duration switch turns it off (it showed "on")', settings.grAutoDuration === false, String(settings.grAutoDuration));
  await js("document.querySelector('#tab-realistic [data-grset=grAutoDuration]').click()");
  await wait(1200);
  p = lastPlan();
  check('the second click turns it on and the 80 hours come back', settings.grAutoDuration === true && p.optionList.autoSpan === true && (await field('grRH')) === '80', (await field('grRH')));
  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
