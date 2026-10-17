// Idle drawing: with nothing running no indicator animates and nothing flips, a running job makes its dots beat from ONE timer (not from CSS animations, which make Chromium
// draw the window 30 to 60 times a second: three quarters of a processor core when the processor composites the window), and an unfocused window or light mode
// stops the beat altogether, so a game running next to the app has nothing to compete with.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, perfMode: 'full', language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const calls = [];
const items = Array.from({ length: 450 }, (_, i) => ({ assetId: String(i + 1), order: i, dedupKey: 'k_' + i, name: i % 3 === 0 ? 'Some Rather Long Trading Card Name ' + i : 'Card ' + i, marketHashName: '440-Card ' + i, iconUrl: null, tradable: i % 2 === 0, marketable: true, type: i % 5 === 0 ? 'booster' : 'card', gameName: 'Game Number ' + (i % 7), appid: 440 + (i % 7), amount: 1 + (i % 4) }));
const games = ['Alpha Game', 'Beta Game With A Much Longer Name Than Usual', 'Gamma Game', 'Delta', 'Epsilon Game'].map((name, i) => ({ appid: 10 * (i + 1), name, remaining: 1 + i, playtimeMin: 500 - 20 * i }));
const answers = {
  'app:hardware': () => ({ cores: 2, memGB: 4, gpuCompositing: 'enabled' }),
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

  const anims = () => js("document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName).join()");
  // how many times the class of the body changed in 3 seconds (the beat flips body.e-beat)
  const flips = () => js("new Promise((res) => { let n = 0; const o = new MutationObserver(() => { n++; }); o.observe(document.body, { attributes: true, attributeFilter: ['class'] }); setTimeout(() => { o.disconnect(); res(n); }, 3000); })");
  const hasBeat = () => js("document.body.classList.contains('e-beat')");
  // a window that has not got the focus (this one never has) is calm from the start, with no blur event to calm it
  check('a window that starts without the focus is calm from the start', (await js("document.documentElement.classList.contains('e-idle')")) === true);
  check('and its dots do not beat', (await flips()) === 0);
  await js("document.documentElement.classList.remove('e-idle'); runBeat()");
  await wait(300);
  check('with nothing running no indicator animates and nothing flips (a page that animates forever is drawn 30 times a second for nothing)', (await anims()) === '' && (await flips()) === 0, await anims());
  await js("setSysStatus(true); setRunPill(true)");
  await wait(300);
  check('a running job puts the pulse class on its dot and its pill', (await js("document.getElementById('sysDot').classList.contains('e-pulse')")) === true && (await js("document.querySelectorAll('#gRunPill .e-pulse').length")) === 1);
  check('and the dots beat from one timer, not from CSS animations (about 4 flips in 3 seconds, no animation running)', (await anims()) === '' && (await flips()) >= 3, await anims());
  check('the dot follows the beat: bright on the beat, dim between', (await js("(() => { const d = document.getElementById('sysDot'); document.body.classList.add('e-beat'); const on = getComputedStyle(d).opacity; document.body.classList.remove('e-beat'); const off = getComputedStyle(d).opacity; return +on === 1 && +off < 0.5; })()")) === true);
  await js("setSysStatus(false); setRunPill(false)");
  await wait(300);
  check('when the job stops the dots stand still and the beat is quiet', (await js("document.getElementById('sysDot').classList.contains('e-pulse')")) === false && (await flips()) === 0);
  await js("openTab('card')");
  await wait(500);
  check('the card page indicator stands still while nothing runs', (await js("document.getElementById('cardPillDot').classList.contains('e-pulse')")) === false && (await flips()) === 0);
  await js("setCardPill(true)");
  await wait(300);
  check('and beats while cards are farmed', (await js("document.getElementById('cardPillDot').classList.contains('e-pulse')")) === true && (await flips()) >= 3);
  await js("document.documentElement.classList.add('e-idle'); runBeat()");
  await wait(300);
  check('an unfocused window stops the beat altogether (the timer is gone, so no frames are drawn)', (await flips()) === 0 && (await hasBeat()) === false);
  await js("document.documentElement.classList.remove('e-idle'); document.body.classList.add('e-light'); runBeat()");
  await wait(300);
  check('light mode does not beat either, and its dots are fully lit', (await flips()) === 0 && (await js("+getComputedStyle(document.getElementById('cardPillDot')).opacity")) === 1);
  await js("document.body.classList.remove('e-light'); runBeat()");
  await wait(300);
  check('and it beats again when light mode goes', (await flips()) >= 3);

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
