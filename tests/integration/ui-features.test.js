// Small features and top bar items (Settings > Modules): each switch hides what it names and changes nothing else; the other games' inventories
// stop being asked for when theirs is off and come back when it is on again; switching them on restores everything.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const calls = [];
const community = Array.from({ length: 5 }, (_, i) => ({ assetId: String(100 + i), order: i, dedupKey: 'c_' + i, name: 'Card ' + i, marketHashName: '440-Card ' + i, iconUrl: null, tradable: true, marketable: true, type: 'card', gameName: 'Team Fortress 2', appid: 440, amount: 1, invApp: 753, invContext: '6' }));
const cs = [
  { assetId: '9001', order: 0, dedupKey: 'x_1', name: 'AK-47 | Redline (Field-Tested)', marketHashName: '730|AK-47 | Redline (Field-Tested)', hashName: 'AK-47 | Redline (Field-Tested)', iconUrl: null, tradable: true, marketable: true, type: 'other', typeText: 'Classified Rifle', gameName: 'Counter-Strike 2', appid: 730, amount: 1, invApp: 730, invContext: '2' },
  { assetId: '9002', order: 1, dedupKey: 'x_2', name: 'Dreams & Nightmares Case', marketHashName: '730|Dreams & Nightmares Case', hashName: 'Dreams & Nightmares Case', iconUrl: null, tradable: true, marketable: true, type: 'other', typeText: 'Base Grade Container', gameName: 'Counter-Strike 2', appid: 730, amount: 1, invApp: 730, invContext: '2' },
  { assetId: '9003', order: 2, dedupKey: 'x_3', name: 'Name Tag', marketHashName: null, hashName: null, iconUrl: null, tradable: false, marketable: false, type: 'other', typeText: 'Tool', gameName: 'Counter-Strike 2', appid: 730, amount: 1, invApp: 730, invContext: '2' },
];
const dota = [{ assetId: '7001', order: 0, dedupKey: 'd_1', name: 'Inscribed Compendium', marketHashName: '570|Inscribed Compendium', hashName: 'Inscribed Compendium', iconUrl: null, tradable: true, marketable: true, type: 'other', typeText: 'Compendium', gameName: 'Dota 2', appid: 570, amount: 1, invApp: 570, invContext: '2' }];
const sources = { ok: true, found: true, list: [
  { appid: 730, name: 'Counter-Strike 2', assetCount: 3, contexts: [{ id: '2', name: 'Backpack', assetCount: 3 }] },
  { appid: 570, name: 'Dota 2', assetCount: 1, contexts: [{ id: '2', name: 'Backpack', assetCount: 1 }] },
] };
let dotaFails = false;
const games = ['Alpha Game', 'Beta Game'].map((name, i) => ({ appid: 10 * (i + 1), name, remaining: 1 + i, playtimeMin: 500 - 20 * i }));
const pricesOf = (h) => { const o = {}; (Array.isArray(h) ? h : (h && h.hashNames) || []).forEach((x) => { o[x] = { lowestValue: 2.5, medianValue: 2.6, lowest: '$2.50', median: '$2.60' }; }); return o; };
const answers = {
  'engine:saleFee': () => ({ ok: true, outcomeData: [], fee: { pct: 0.05, pubPct: 0.10, min: 1, base: 0 } }),
  'engine:sellItem': (_e, a) => { calls.push(['sell', a.assetId, a.appid, a.contextId]); return { ok: true, result: {} }; },
  'engine:inventory': (_e, arg) => {
    calls.push(['inventory', arg ? JSON.stringify(arg) : 'community']);
    if (arg && arg.appid === 730) return { ok: true, items: cs, incomplete: true };
    if (arg && arg.appid === 570) return dotaFails ? { ok: false, error: 'HTTP 429' } : { ok: true, items: dota };
    return { ok: true, items: community };
  },
  'engine:inventorySources': () => { calls.push(['sources']); return sources; },
  'engine:pricesFor': (_e, h) => { calls.push(['prices', JSON.stringify(Array.isArray(h) ? h : (h && h.hashNames) || []), !!(h && h.cacheOnly)]); return { ok: true, prices: pricesOf(h), queued: 0 }; },
  'engine:historyFor': () => ({ ok: true, history: {}, lacking: 0, queueList: 0 }),
  'engine:itemOrders': () => ({ ok: true, orders: { error: 'x' } }), 'engine:priceHistory': () => ({ ok: true, history: null }),
  'settings:get': () => settings, 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games, refundIds: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: games.map((g, i) => ({ appid: g.appid, name: g.name, playtimeForever: 600 - 40 * i, hasStats: true })) }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [], 'accounts:connectAll': () => [],
  'market:myListings': () => ({ ok: true, data: { listings: [], toConfirm: [], onHold: [], buyOrders: 0 } }),
  'keys:state': () => ({ queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null }),
  'app:info': () => ({ versionStr: '1.5.2' }), 'app:memory': () => null, 'update:lastStatus': () => null, 'realistic:noAchievementsList': () => ({ ok: true, appids: [] }),
};
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
[...preload.matchAll(/invoke\('([^']+)'/g)].forEach((m) => { try { ipcMain.handle(m[1], answers[m[1]] || (() => ({ ok: true }))); } catch (_) {} });
[...preload.matchAll(/send\('([^']+)'/g)].forEach((m) => ipcMain.on(m[1], (_e, a) => { if (m[1] === 'open:external') calls.push(['open', a]); }));
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

  const css = (sel, prop) => js("(() => { const e = document.querySelector('" + sel + "'); return e ? getComputedStyle(e)['" + prop + "'] : 'missing'; })()");
  const shown = async (sel) => (await css(sel, 'display')) !== 'none' && (await css(sel, 'display')) !== 'missing';
  const sourceCalls = () => calls.filter((c) => c[0] === 'sources').length;
  const KEYS = ['featFeed', 'featFavorites', 'featListings', 'featCsv', 'featOtherGames', 'topSearch', 'topNotif', 'topUpdate'];
  const pick = async (value) => { await js("(() => { const s = document.getElementById('efSource'); s.value = '" + value + "'; s.dispatchEvent(new Event('change')); })()"); };
  const flip = async (keys) => {
    await js("openSettingsPage('modules')");
    await wait(500);
    for (const k of keys) await js("document.querySelector('[data-set=" + k + "]').click()");
    await js("document.getElementById('setSave').click()");
    await wait(800);
  };

  check('every switch is on to begin with', KEYS.every((k) => settings[k] === true), KEYS.map((k) => k + '=' + settings[k]).join(' '));
  // the inventory page, so that the select of the other games is there
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(1400);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  check('on: the select of the other games, My listings and Export CSV are there', (await shown('#efSource')) && (await shown('#invMyListings')) && (await shown('#invExportCsv')));
  check('on: the top bar has its search, notification and update buttons', (await shown('.e-search')) && (await shown('#tbNotif')) && (await shown('#tbUpdate')));
  check('on: the overview has its activity box', (await shown('.ov-left')) && (await js("(getComputedStyle(document.querySelector('.ov-grid')).gridTemplateColumns.match(/minmax/g) || []).length")) === 2);
  await js("(() => { const b = document.createElement('button'); b.id = 'probeStar'; b.setAttribute('data-fav', '1'); document.body.appendChild(b); })()");
  check('on: a star is visible and favorites come first', (await css('#probeStar', 'visibility')) === 'visible'
    && (await js("(() => { appSettings.favoriteGames = [20]; return favoritesFirst([{ appid: 10 }, { appid: 20 }]).map((g) => g.appid).join(); })()")) === '20,10');

  // Settings > Modules has the two cards
  await js("openSettingsPage('modules')");
  await wait(500);
  check('the Modules page has a switch for each small feature and top bar item', (await js("document.querySelectorAll('[data-set^=feat], [data-set^=top]').length")) === 8);
  check('the cards are called Small features and Top bar', /Small features/.test(await js("document.querySelector('[data-sec=modules]').textContent")) && /Top bar/.test(await js("document.querySelector('[data-sec=modules]').textContent")));

  await js("document.querySelector('[data-set=featFeed]').scrollIntoView({ block: 'start' })");
  await wait(300);
  await shot('features-settings');
  // switch all eight off
  const asked = sourceCalls();
  await flip(KEYS);
  check('the eight settings were saved as off', KEYS.every((k) => settings[k] === false), KEYS.map((k) => k + '=' + settings[k]).join(' '));
  check('off: the top bar loses the search box, the bell and the update button', !(await shown('.e-search')) && !(await shown('#tbNotif')) && !(await shown('#tbUpdate')) && (await shown('#tbSettings')) && (await shown('#tbProfile')));
  check('off: the overview loses its activity box and the rest takes the width', !(await shown('.ov-left')) && (await js("(getComputedStyle(document.querySelector('.ov-grid')).gridTemplateColumns.match(/minmax/g) || []).length")) === 1);
  check('off: the stars turn invisible and favorites no longer come first', (await css('#probeStar', 'visibility')) === 'hidden'
    && (await js("favoritesFirst([{ appid: 10 }, { appid: 20 }]).map((g) => g.appid).join()")) === '10,20');
  await js("document.querySelector('.nav a[data-tab=overview]').click()");
  await wait(700);
  await shot('features-off-overview');
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(800);
  check('off: the inventory page has no My listings, no Export CSV, no select of other games', !(await shown('#invMyListings')) && !(await shown('#invExportCsv')) && !(await shown('#efSource')));
  check('off: the page and the settings stay reachable', (await shown('#tbSettings')) && (await js("!!document.querySelector('.nav a[data-tab=overview]')")));

  // switch them on again
  await flip(KEYS);
  check('on again: the settings are saved as on', KEYS.every((k) => settings[k] === true));
  check('on again: the top bar and the overview have everything back', (await shown('.e-search')) && (await shown('#tbNotif')) && (await shown('#tbUpdate')) && (await shown('.ov-left')) && (await css('#probeStar', 'visibility')) === 'visible');
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(1000);
  check('on again: My listings, Export CSV and the select of the other games are back', (await shown('#invMyListings')) && (await shown('#invExportCsv')) && (await shown('#efSource')));
  check('the list of games was read once while the feature was on and not asked for again meanwhile', sourceCalls() >= asked && sourceCalls() <= asked + 1, asked + ' -> ' + sourceCalls());

  // turning the other games off while one of them is on screen: the Steam inventory comes back
  await pick('730:2');
  await wait(1200);
  check('Counter-Strike 2 is on screen', /AK-47/.test(await js("document.getElementById('invRows').textContent")));
  await flip(['featOtherGames']);
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(900);
  const rowsNow = await js("document.getElementById('invRows').textContent");
  check('switched off while on screen: the Steam inventory is back and the select is gone', /Card 0/.test(rowsNow) && !/AK-47/.test(rowsNow) && !(await shown('#efSource')), rowsNow.slice(0, 60));
  await flip(['featOtherGames']);
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(900);
  check('and on again: the select is back with the Steam inventory chosen', (await shown('#efSource')) && (await js("document.getElementById('efSource').value")) === '753:6');

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
