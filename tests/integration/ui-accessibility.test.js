// Appearance and keyboard: the switches and the side menu can be reached and pressed with the keyboard and say what they are, the interface scale
// and the high contrast theme are in Settings and work.
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

  const key = (sel, k) => js("(() => { const el = document.querySelector('" + sel + "'); el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: '" + k + "', bubbles: true, cancelable: true })); })()");
  // the side menu
  check('every side menu item has a tab stop and a role', (await js("[...document.querySelectorAll('.nav a[data-tab]')].every((a) => a.tabIndex === 0 && a.getAttribute('role') === 'button')")) === true);
  check('the page that is open is marked as the current one', (await js("document.querySelector('.nav a[data-tab].active').getAttribute('aria-current')")) === 'page');
  await key(".nav a[data-tab=hours]", 'Enter');
  await wait(400);
  check('Enter on a menu item opens the page', (await js("document.querySelector('.nav a[data-tab=hours]').classList.contains('active')")) === true);
  check('and the mark moves with it', (await js("document.querySelector('.nav a[data-tab=hours]').getAttribute('aria-current')")) === 'page' && (await js("document.querySelector('.nav a[data-tab=overview]').hasAttribute('aria-current')")) === false);

  // the switches of a page
  check('a switch of a page is a switch with a tab stop', (await js("[...document.querySelectorAll('#tab-card .e-toggle')].length > 0 && [...document.querySelectorAll('#tab-card .e-toggle')].every((t) => t.tabIndex === 0 && t.getAttribute('role') === 'switch' && /^(true|false)$/.test(t.getAttribute('aria-checked')))")) === true);

  // Settings: switches, scale, theme
  await js("openSettingsPage('general')");
  await wait(500);
  check('a switch in Settings is a switch with a tab stop', (await js("(() => { const t = document.querySelector('#tab-settings [data-set=closeToTray]'); return t.tabIndex === 0 && t.getAttribute('role') === 'switch' && t.getAttribute('aria-checked') === 'false'; })()")) === true);
  await key("#tab-settings [data-set=closeToTray]", ' ');
  await wait(200);
  check('Space turns it on and aria-checked follows', (await js("document.querySelector('#tab-settings [data-set=closeToTray]').getAttribute('aria-checked')")) === 'true');
  await key("#tab-settings [data-set=closeToTray]", 'Enter');
  await wait(200);
  check('Enter turns it off again', (await js("document.querySelector('#tab-settings [data-set=closeToTray]').getAttribute('aria-checked')")) === 'false');
  check('the interface scale is a choice from 80 to 150 percent, 100 by default', (await js("[...document.querySelector('#tab-settings [data-set=uiScale]').options].map((o) => o.value).join()")) === '80,90,100,110,125,150' && (await js("document.querySelector('#tab-settings [data-set=uiScale]').value")) === '100');
  check('the theme choice has automatic and high contrast', (await js("[...document.querySelector('#tab-settings [data-set=theme]').options].map((o) => o.value).join()")) === 'auto,dark,midnight,white,contrast');
  await shot('settings-appearance');

  // the high contrast theme: the dim text turns light, the surfaces black, the border white
  const before = await js("getComputedStyle(document.querySelector('#tab-settings [data-set=language]')).color");
  await js("applyTheme('contrast')");
  await wait(500);
  check('the high contrast theme is applied', (await js("document.documentElement.getAttribute('data-theme')")) === 'contrast');
  const back = await js("getComputedStyle(document.querySelector('#tab-settings [data-set=language]')).backgroundColor + '|' + getComputedStyle(document.querySelector('#tab-settings [data-set=language]')).borderTopColor + '|' + getComputedStyle(document.querySelector('#tab-settings [data-set=language]')).color");
  check('a field is black with a white border and white text', back === 'rgb(0, 0, 0)|rgb(255, 255, 255)|rgb(255, 255, 255)', back + ' (was ' + before + ')');
  await shot('theme-contrast');
  check('the choice is kept for the login screen too', (await js("localStorage.getItem('se_theme')")) === 'contrast');

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
