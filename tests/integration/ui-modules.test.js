// Modules and performance: a switched-off page leaves the menu, the overview and the top bar and cannot be opened; the menu order follows the setting;
// light mode really stops the animations; automatic follows the machine; the welcome window asks on a first start; a long inventory is drawn in the background.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
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

  const visible = () => js("[...document.querySelectorAll('.nav a[data-tab]:not(.e-logout)')].filter((a) => a.style.display !== 'none').map((a) => a.getAttribute('data-tab')).join(',')");
  const click = (sel) => js("document.querySelector('" + sel + "').click()");
  const setSel = (v) => js("(() => { const s = document.querySelector('[data-set=perfMode]'); s.value = '" + v + "'; s.dispatchEvent(new Event('change')); })()");
  check('every page is in the menu to begin with', (await visible()) === 'overview,card,inventory,hours,realistic,achievements,keys', await visible());

  // Settings > Modules: switch hours and chat off, move inventory above card, save
  await js("openSettingsPage('modules')");
  await wait(500);
  await click("[data-set=moduleHours]");
  await click("[data-set=moduleChat]");
  await click("[data-mod-row=inventory] [data-mv=up]");
  await click("#setSave");
  await wait(700);
  check('a switched-off page leaves the menu and the order follows the setting', (await visible()) === 'overview,inventory,card,realistic,achievements,keys', await visible());
  check('the chat button leaves the top bar', (await js("getComputedStyle(document.getElementById('tbChat')).display")) === 'none');
  check('the overview tile of the page leaves too', (await js("getComputedStyle(document.getElementById('gNavBoost')).display")) === 'none' && (await js("getComputedStyle(document.getElementById('gNavHub')).display")) !== 'none');
  await js("openTab('hours')");
  await wait(500);
  check('a switched-off page cannot be opened, the overview opens instead', (await js("!document.getElementById('tab-overview').classList.contains('hidden') && document.getElementById('tab-hours').classList.contains('hidden')")) === true);
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(900);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  const aligned = await js("(() => { const b = document.getElementById('sideCollapseBtn').getBoundingClientRect(), a = document.querySelector('.nav a.active').getBoundingClientRect(); return Math.abs((b.top + b.height / 2) - (a.top + a.height / 2)) <= 2; })()");
  check('the edge tab of the menu stays beside the active item after the move', aligned === true);

  // an inventory with 450 rows is drawn in the background and rows are laid out lazily
  await wait(800);
  const rows = await js("document.querySelectorAll('#invRows [data-k]').length");
  check('a long inventory ends up fully drawn', rows === 450, String(rows));
  check('off-screen rows are not laid out', (await js("getComputedStyle(document.querySelector('#invRows .inv-row')).contentVisibility")) === 'auto');

  // performance
  await js("openSettingsPage('modules')"); await wait(400);
  await setSel('light');
  await click("#setSave"); await wait(600);
  check('light mode puts the class on the page', (await js("document.body.classList.contains('e-light')")) === true);
  await js('setSysStatus(true)');
  check('light mode keeps the dot of a running job fully lit and still (no beat)', (await js("+getComputedStyle(document.getElementById('sysDot')).opacity")) === 1 && (await js('beatWanted()')) === false);
  await setSel('full');
  await click("#setSave"); await wait(600);
  check('full mode takes it off', (await js("document.body.classList.contains('e-light')")) === false);
  check('full mode lets the dot of a running job beat (bright on the beat, dim between)', (await js("(() => { const d = document.getElementById('sysDot'); document.body.classList.add('e-beat'); const on = +getComputedStyle(d).opacity; document.body.classList.remove('e-beat'); return on === 1 && +getComputedStyle(d).opacity < 0.5; })()")) === true);
  await js('setSysStatus(false)');
  check('and the idle dot has no pulse in full mode', (await js("document.getElementById('sysDot').classList.contains('e-pulse')")) === false);
  await setSel('auto');
  await click("#setSave"); await wait(600);
  await js("Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 2 }); applyPerf()");
  check('automatic is light on a 2 core machine', (await js("document.body.classList.contains('e-light')")) === true);
  // the system setting is faked so the result does not depend on this computer
  await js("window.matchMedia = () => ({ matches: false, addEventListener() {} }); Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => 16 }); Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 16 }); applyPerf()");
  check('automatic is full on a strong machine', (await js("document.body.classList.contains('e-light')")) === false);
  await js("window.matchMedia = () => ({ matches: true, addEventListener() {} }); applyPerf()");
  check('automatic is light when the system asks for less motion', (await js("document.body.classList.contains('e-light')")) === true);
  await js("window.matchMedia = () => ({ matches: false, addEventListener() {} }); applyPerf()");
  await click("#perfDetect"); await wait(500);
  check('"Set up for this computer" picks light for a weak machine', (await js("document.querySelector('[data-set=perfMode]').value")) === 'light');
  const info = await js("document.getElementById('perfInfo').textContent");
  check('and shows what it found', /2 cores/.test(info), info);

  // first start: the welcome window
  settings.setupDone = false; settings.moduleKeys = true; settings.moduleHours = true; settings.moduleChat = true; settings.navOrder = 'overview,card,inventory,hours,realistic,achievements,keys'; settings.perfMode = 'auto';
  await w.loadFile(ROOT + '/src/main/main.html');
  await wait(1800);
  check('a first start opens the welcome window', (await js("!!document.getElementById('setupBack')")) === true);
  await click("#setupBack [data-sm=keys]");
  check('the welcome window asks for the interface scale, 100 percent preselected', (await js("document.getElementById('setupScale').value")) === '100' && (await js("document.getElementById('setupScale').options.length")) === 6);
  await js("document.getElementById('setupScale').value = '110'");
  await click("#setupBack [data-yes]");
  await wait(700);
  check('the chosen scale is saved with the rest', settings.uiScale === 110, String(settings.uiScale));
  check('the choice is saved and applied', settings.setupDone === true && settings.moduleKeys === false && (await visible()) === 'overview,card,inventory,hours,realistic,achievements', await visible());
  check('the window is gone', (await js("!document.getElementById('setupBack')")) === true);
  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
