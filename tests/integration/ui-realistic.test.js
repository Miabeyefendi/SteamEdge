// Realistic Mode page: the target and the duration shown are the ones the engine plans. A game that takes 60 hours gets 60 hours, a duration typed by hand
// is respected, and the switch for the automatic duration works on the first click.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, grQueue: [10, 20], grTcGame: { 10: 60, 20: 20 }, grParallel: false, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
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
  await shot('realistic-list');
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
  // ---- the page while a run goes, is stopped and ends: what the user sees must follow the engine, not stay on "running" ----
  const send = (ch, d) => w.webContents.send(ch, d);
  await js("window.__feed = []; window.__notes = []; (() => { const pf = window.pushFeed; window.pushFeed = (...a) => { window.__feed.push(a.slice(0, 2).join('|')); return pf && pf(...a); }; const nf = window.notify; window.notify = (...a) => { window.__notes.push(a[1]); return nf && nf(...a); }; })()");
  const running = { runningFlag: true, appid: 10, gameTitle: 'Alpha Game', totalSum: 50, openedGames: 3, failure: 0, startPoint: Date.now(), finishTime: Date.now() + 3600000, upNext: 'Achievement 3', upNextPct: 70, upNextPos: 0.1, upNextTime: Date.now() + 60000, gameCount: 1, gameIndex: 0, averageIntervalMs: 60000 };
  send('realistic:tick', running); await wait(500);
  check('a running tick: the clock counts down from about an hour and Stop is enabled, Start is closed', ['59', '00'].includes(await js("document.getElementById('grClockM').textContent")) && (await js("document.getElementById('grStop').disabled")) === false && (await js("document.getElementById('grStart').disabled")) === true, await js("document.getElementById('grClockH').textContent + ':' + document.getElementById('grClockM').textContent"));
  check('the progress shows 3 / 50', (await js("document.getElementById('grOpened').textContent")) === '3 / 50', await js("document.getElementById('grOpened').textContent"));
  // the user presses Stop, the engine answers with the finished tick
  await js("window.__feed.length = 0; window.__notes.length = 0; document.getElementById('grStop').click()");
  send('realistic:tick', { runningFlag: false, isFinished: true, openedGames: 3, failure: 0, totalSum: 50, cause: 'Durduruldu' }); await wait(500);
  check('after Stop: Start is open again, Stop is closed and the clock is back to zero', (await js("document.getElementById('grStart').disabled")) === false && (await js("document.getElementById('grStop').disabled")) === true && (await js("document.getElementById('grClockS').textContent")) === '00', await js("document.getElementById('grClockM').textContent"));
  const feedAfterStop = await js("window.__feed.filter((x) => x.indexOf('Gerçekçi Mod') >= 0).length");
  check('after Stop the feed gets ONE line, not two (the button and the engine both wrote one)', feedAfterStop === 1, String(feedAfterStop) + ' ' + JSON.stringify(await js('window.__feed')));
  check('after Stop there is no "finished" notification for something the user just stopped', (await js("window.__notes.filter((n) => n === 'Gerçekçi Mod Bitti').length")) === 0, JSON.stringify(await js('window.__notes')));
  // a run that ends by itself while the page is open
  send('realistic:tick', running); await wait(400);
  await js("window.__feed.length = 0; window.__notes.length = 0");
  send('realistic:tick', { runningFlag: false, isFinished: true, openedGames: 50, failure: 0, totalSum: 50, cause: 'Süre doldu' }); await wait(500);
  check('a run that ends by itself: one feed line and one "finished" notification, buttons back to idle', (await js("window.__feed.length")) === 1 && (await js("window.__notes.filter((n) => n === 'Gerçekçi Mod Bitti').length")) === 1 && (await js("document.getElementById('grStart').disabled")) === false && (await js("document.getElementById('grStop').disabled")) === true, JSON.stringify(await js('window.__feed')));
  // the connection dropped and the run died with the account: a finished tick with the reason, not a clock that keeps counting
  send('realistic:tick', running); await wait(400);
  send('realistic:tick', { runningFlag: false, isFinished: true, openedGames: 3, failure: 0, totalSum: 50, cause: 'Steam bağlantısı yok' }); await wait(500);
  await wait(1200);
  check('a run that died with the connection: the clock stays at zero (the old interval is gone)', (await js("document.getElementById('grClockM').textContent")) === '00' && (await js("document.getElementById('grClockS').textContent")) === '00');

  // A change of difficulty or game type rebuilds the plan (it used to repaint only: the unlock times on screen stayed as they were)
  const planCount = calls.filter((c) => c[0] === 'plan').length;
  await js("(() => { const d = document.getElementById('grDiff'); d.value = '0.8'; d.dispatchEvent(new Event('change')); })()");
  await wait(900);
  p = lastPlan();
  check('changing the difficulty asks the engine for a new plan with the new difficulty', calls.filter((c) => c[0] === 'plan').length > planCount && p.optionList.difficultyValue < 1, String(p.optionList.difficultyValue));
  const planCount2 = calls.filter((c) => c[0] === 'plan').length;
  await js("(() => { const d = document.getElementById('grCR'); d.value = '2.5'; d.dispatchEvent(new Event('change')); })()");
  await wait(900);
  check('changing the game type asks for a new plan too', calls.filter((c) => c[0] === 'plan').length > planCount2);
  // ---- the games at the same time ----
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  let before2 = calls.filter((c) => c[0] === 'plan').length;
  await js("document.querySelector('#tab-realistic [data-grset=grParallel]').click()");
  await wait(1200);
  p = lastPlan();
  check('the switch turns the games at the same time on and the plan is rebuilt with it', settings.grParallel === true && calls.filter((c) => c[0] === 'plan').length > before2 && p.optionList.parallel === true, String(settings.grParallel));
  // the difficulty was set to easy above: the longest game is 60 h x that factor; the sum would add the 20 hour game on top
  check('together the run is as long as the longest game (60 h x the difficulty), not the sum of the two', Math.abs(Number(await field('grRH')) - 60 * p.optionList.difficultyValue) <= 1, (await field('grRH')) + ' h, difficulty ' + p.optionList.difficultyValue);
  check('the target box counts the whole queue (50 + 20)', (await js("document.getElementById('grTargetTotal').textContent")) === '70', await js("document.getElementById('grTargetTotal').textContent"));
  // clicking a game SELECTS it: the order stays, its completion time is in the panel box with its name, its achievements are the list
  const orderBefore = JSON.stringify(settings.grQueue);
  before2 = calls.filter((c) => c[0] === 'plan').length;
  await js("document.querySelector('#grLibrary [data-grrow=\"20\"]').click()");
  await wait(1200);
  p = lastPlan();
  check('click on the second game: the order of the queue does not change', JSON.stringify(settings.grQueue) === orderBefore, JSON.stringify(settings.grQueue));
  check('click on the second game: the plan is asked for THAT game (the whole queue still planned)', p.appid === 20 && JSON.stringify(p.queueIds) === orderBefore && calls.filter((c) => c[0] === 'plan').length > before2, p.appid + ' ' + JSON.stringify(p.queueIds));
  check('click on the second game: it is the one framed in the list', (await js("[...document.querySelectorAll('#grLibrary [data-grsel]')].map((r) => r.getAttribute('data-grrow')).join()")) === '20');
  check('the completion time box shows the value and the name of THIS game', (await field('grTcMain')) === '20' && (await js("document.getElementById('grTcGameName').textContent")) === 'Beta Game', (await field('grTcMain')) + ' / ' + (await js("document.getElementById('grTcGameName').textContent")));
  await js("document.getElementById('grLvlAdv').click()"); await wait(400);
  check('the advanced panel has the same box: the value and the name of the selected game', (await field('grTc')) === '20' && (await js("document.getElementById('grTcGameName2').textContent")) === 'Beta Game', (await field('grTc')) + ' / ' + (await js("document.getElementById('grTcGameName2').textContent")));
  await js("document.getElementById('grLvlSimple').click()"); await wait(300);
  check('there is no hour box in the rows any more', (await js("document.querySelectorAll('#grLibrary input').length")) === 0);
  before2 = calls.filter((c) => c[0] === 'plan').length;
  await js("(() => { const b = document.getElementById('grTcMain'); b.value = '5'; b.dispatchEvent(new Event('change')); })()");
  await wait(1200);
  p = lastPlan();
  check('typing 5 hours in the panel box keeps it for the SELECTED game and rebuilds the plan', settings.grTcGame && settings.grTcGame['20'] === 5 && p.optionList.tcByGame['20'] === 5 && p.optionList.tcByGame['10'] === 60 && calls.filter((c) => c[0] === 'plan').length > before2, JSON.stringify(settings.grTcGame));
  await shot('realistic-parallel');
  check('and the queue order is still the same', JSON.stringify(settings.grQueue) === orderBefore, JSON.stringify(settings.grQueue));
  // while the games run together: every game is marked as playing and a click still selects
  send('realistic:tick', Object.assign({}, running, { parallel: true })); await wait(400);
  check('running together: every game of the list is marked as playing', (await js("document.querySelectorAll('#grLibrary [data-grplaying]').length")) === 2, String(await js("document.querySelectorAll('#grLibrary [data-grplaying]').length")));
  await js("document.querySelector('#grLibrary [data-grrow=\"10\"]').click()"); await wait(800);
  check('running: a click on a game still selects it (its achievements are shown)', lastPlan().appid === 10 && JSON.stringify(settings.grQueue) === orderBefore);
  send('realistic:tick', { runningFlag: false, isFinished: true, openedGames: 1, failure: 0, totalSum: 50, cause: 'Durduruldu' }); await wait(600);
  // the run ends: the page reads the plan again (it showed the list read before the first run)
  before2 = calls.filter((c) => c[0] === 'plan').length;
  send('realistic:tick', running); await wait(300);
  send('realistic:tick', { runningFlag: false, isFinished: true, openedGames: 50, failure: 0, totalSum: 50, cause: 'Süre doldu' }); await wait(1200);
  check('when a run ends the plan is read again from Steam (the next run shows only what is still locked)', calls.filter((c) => c[0] === 'plan').length > before2);

  // A real queue: games with thousands of achievements, some of them named with a bare number. The list draws a part of it and counts the rest, and a click
  // on another game of a plan of the games together takes that game's figures from the plan instead of reading every schema again.
  const big = await js(`(() => {
    const list = [];
    for (let k = 0; k < 2400; k++) list.push({ appid: 10, name: k % 7 === 0 ? k : 'Ach ' + k, rarityPct: 50, pos: k / 2400, timeValue: k * 1000 });
    for (let k = 0; k < 40; k++) list.push({ appid: 20, name: k, rarityPct: 50, pos: k / 40, timeValue: k * 1000 });
    grPlan = Object.assign({}, grPlan, { parallel: true, queueList: list, perGame: { 10: { appid: 10, suitableTotal: 2400, totalAchievements: 2500 }, 20: { appid: 20, suitableTotal: 40, totalAchievements: 41 } } });
    grSelectedId = 20; grPaintList();
    const t = performance.now(); grSelectedId = 10; grPaintList();
    return { ms: Math.round(performance.now() - t), rows: document.querySelectorAll('#grList > div').length, more: document.getElementById('grList').textContent.includes('2250') };
  })()`);
  check('2,400 achievements: the list draws a part and says how many more there are (numbers as names do not break it)', big && big.rows < 200 && big.more, JSON.stringify(big));
  before2 = calls.filter((c) => c[0] === 'plan').length;
  await js("document.querySelector('#grLibrary [data-grrow=\"20\"]').click()"); await wait(600);
  check('the games together: a click shows the game from the plan it already has, nothing is asked again', calls.filter((c) => c[0] === 'plan').length === before2 && (await js("grPlan.suitableTotal")) === 40 && (await js("document.querySelectorAll('#grList > div').length")) > 30);

  // The rarity label follows what the engine does: a proportion of the game's own achievements (very common 20%, common 30%, uncommon 20%, rare 20%, ultra rare 10%)
  const labels = await js("[0, 0.1, 0.2, 0.49, 0.5, 0.69, 0.7, 0.89, 0.9, 0.99].map((p) => grRarityLabel(4.9, p)).concat([grRarityLabel(4.9, undefined), grRarityLabel(60, null), grRarityLabel(null, undefined), grPctColor(4.9, 0.95) !== grPctColor(4.9, 0.1)])");
  check('by place in the game: 0 to 20% very common, 20 to 50% common, 50 to 70% uncommon, 70 to 90% rare, the last tenth ultra rare', labels && labels.slice(0, 10).join() === 'Çok yaygın,Çok yaygın,Yaygın,Yaygın,Az bulunur,Az bulunur,Nadir,Nadir,Ultra nadir,Ultra nadir', labels && labels.slice(0, 10).join());
  check('the same 4.9% is ultra rare at the end of a list and very common at its start (it depends on the game, not on the number)', labels && labels[9] === 'Ultra nadir' && labels[0] === 'Çok yaygın');
  check('without the place the raw percentage is read as before, unknown stays unknown', labels && labels[10] === 'Ultra nadir' && labels[11] === 'Çok yaygın' && labels[12] === 'Bilinmiyor');
  check('the colour follows the same band', labels && labels[13] === true);
  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
