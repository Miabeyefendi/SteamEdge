// Favorites on the Hour Booster list, the refund window filter on the Card Farming page and the inventory CSV export button.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
// Part 2 smoke test: keys page, my listings sheet, booster unpack, Family View PIN row.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const calls = [];
let keyState = { queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null };
const items = [
  { assetId: '1', order: 0, dedupKey: 'a_1', name: 'Some Card', marketHashName: '440-Some Card', iconUrl: null, tradable: true, marketable: true, type: 'card', gameName: 'Game', appid: 440, amount: 1 },
  { assetId: '2', order: 1, dedupKey: 'b_1', name: 'Game Booster Pack', marketHashName: '440-Game Booster Pack', iconUrl: null, tradable: true, marketable: true, type: 'booster', gameName: 'Game', appid: 440, amount: 1 },
  { assetId: '3', order: 2, dedupKey: 'g_1', name: 'Gems', marketHashName: '753-Gems', iconUrl: null, tradable: true, marketable: true, type: 'gems', gameName: null, appid: 0, amount: 100 },
];
const listing = (id, n) => ({ listingId: id, name: n, marketHashName: n, iconUrl: null, appid: 753, assetId: 'x' + id, sellerCents: 28, buyerCents: 32, created: 1760000000000 });
const answers = {
  'settings:get': () => settings, 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { calls.push(['settings:save', patch]); Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games: [{appid:10,name:'Alpha Game',remaining:3,playtimeMin:500},{appid:20,name:'Beta Game',remaining:1,playtimeMin:10},{appid:30,name:'Gamma Game',remaining:5,playtimeMin:90}], refundIds: settings.farmSkipRecent ? [20] : [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: [{appid:1,name:'Alpha',playtimeForever:600,hasStats:true},{appid:2,name:'Beta',playtimeForever:120,hasStats:true},{appid:3,name:'Gamma',playtimeForever:0,hasStats:true},{appid:4,name:'Delta',playtimeForever:30,hasStats:true},{appid:5,name:'Epsilon',playtimeForever:60,hasStats:true}] }), 'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [], 'accounts:connectAll': () => [],
  'engine:inventory': () => ({ ok: true, items }), 'engine:pricesFor': () => ({ ok: true, prices: {}, queued: 0 }), 'engine:historyFor': () => ({ ok: true, history: {} }),
  'engine:itemOrders': () => ({ ok: true, orders: { error: 'x' } }), 'engine:priceHistory': () => ({ ok: true, history: null }), 'engine:saleFee': () => ({ ok: true, outcomeData: [] }),
  'engine:unpackBooster': (_e, a) => { calls.push(['unpack', a]); return { ok: true, items: [{ name: 'Card X', foil: true }, { name: 'Card Y', foil: false }] }; },
  'market:myListings': () => { calls.push(['myListings']); return { ok: true, data: { listings: [listing('11', 'Card A'), listing('12', 'Card B')], toConfirm: [listing('13', 'Pending card')], onHold: [], buyOrders: 0 } }; },
  'market:removeListing': (_e, id) => { calls.push(['remove', id]); return { ok: true }; },
  'keys:state': () => keyState,
  'keys:add': (_e, text) => { calls.push(['keys:add', text]); return { ok: true, added: 2, duplicates: 1, invalid: 1 }; },
  'keys:start': (_e, skip) => { calls.push(['keys:start', skip]); return { ok: true }; },
  'app:info': () => ({ versionStr: '1.4.2' }), 'app:memory': () => null, 'update:lastStatus': () => null, 'realistic:noAchievementsList': () => ({ ok: true, appids: [] }),
};
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
[...preload.matchAll(/invoke\('([^']+)'/g)].forEach((m) => { try { ipcMain.handle(m[1], answers[m[1]] || (() => ({ ok: true }))); } catch (_) {} });
[...preload.matchAll(/send\('([^']+)'/g)].forEach((m) => ipcMain.on(m[1], (_e, a) => calls.push([m[1], a])));
const consoleErr = [];
const log = console.log;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: process.env.SHOW === '1', width: 1716, height: 1000, webPreferences: { preload: ROOT + '/preload.js', sandbox: false, contextIsolation: true } });
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 && !/Electron Security Warning/.test(msg)) consoleErr.push(msg.slice(0, 200)); });
  await w.loadFile(ROOT + '/src/main/main.html');
  const js = (k) => w.webContents.executeJavaScript(k).catch((e) => { log('[js error] ' + e.message); return null; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => { if (process.env.SHOTS) fs.writeFileSync(process.env.SHOTS + '/' + name + '.png', (await w.webContents.capturePage()).toPNG()); };
  await wait(1500);
  let failures = 0;
  const check = (name, condition) => { if (!condition) failures++; log((condition ? 'PASS ' : 'FAIL ') + name); };
  const setCalls = [];
  ipcMain.removeHandler('settings:set'); ipcMain.handle('settings:set', (_e, patch) => { setCalls.push(patch); Object.assign(settings, patch); return settings; });
  const csvCalls = [];
  ipcMain.removeHandler('inventory:exportCsv'); ipcMain.handle('inventory:exportCsv', (_e, rows) => { csvCalls.push(rows); return { ok: true, count: rows.length - 1 }; });

  // ---- favorites on the Hour Booster list
  settings.boostSync = false;
  await js("document.querySelector('.nav a[data-tab=hours]').click()");
  await wait(2500);
  const order = () => js("[...document.querySelectorAll('#hoursListBody [data-appid]')].map(r=>r.getAttribute('data-appid')).join()");
  check('hours list starts in library order', (await order()) === '1,2,3,4,5');
  await js("document.querySelector('#hoursListBody [data-appid=\"4\"] [data-fav]').click()");
  await wait(500);
  check('starring a game saves it to the account settings', setCalls.some((p) => JSON.stringify(p.favoriteGames) === '[4]'));
  check('the starred game moves to the top', (await order()) === '4,1,2,3,5');
  check('starring does not select the game', (await js("document.querySelectorAll('#hoursListBody [data-appid=\"4\"] [data-fav]').length")) === 1 && (await js("document.getElementById('activeBoostBox').innerText.includes('Delta')")) === false);
  await js("document.querySelector('#hoursListBody [data-appid=\"4\"] [data-fav]').click()");
  await wait(500);
  check('a second click takes it off the favorites', JSON.stringify(setCalls.pop().favoriteGames) === '[]' && (await order()) === '1,2,3,4,5');
  await js("document.querySelector('#hoursListBody [data-appid=\"2\"] [data-fav]').click()"); await wait(400);
  await shot('p8-favorites');

  // ---- favorites on the Achievements list and in the Realistic Mode search (game 2 is still starred)
  await js("document.querySelector('.nav a[data-tab=achievements]').click()");
  await wait(2500);
  await js("(()=>{const i=document.getElementById('acGameInput'); i.focus(); i.dispatchEvent(new Event('focus'));})()");
  await wait(600);
  const acFirst = await js("(()=>{const r=document.querySelector('#acGameList [data-gid]'); return r ? r.getAttribute('data-gid') + ':' + !!r.querySelector('[data-fav]') : null})()");
  check('Achievements list: the starred game comes first and has a star', acFirst === '2:true');
  await js("document.querySelector('.nav a[data-tab=realistic]').click()");
  await wait(2500);
  await js("(()=>{const i=document.getElementById('grSearch'); i.focus(); i.dispatchEvent(new Event('focus'));})()");
  await wait(600);
  const grRows = await js("[...document.querySelectorAll('#grResults [data-gradd]')].map(r=>r.getAttribute('data-gradd')).join()");
  check('Realistic Mode: an empty search offers the starred games', grRows === '2');
  await shot('p8-realistic-favorites');

  // ---- refund window on the Card Farming page
  await js("document.querySelector('.nav a[data-tab=card]').click()");
  await wait(2500);
  const rows = () => js("[...document.querySelectorAll('#cardQueue [data-row]')].map(r=>r.getAttribute('data-row')).join()");
  check('without the filter all three games are queued', (await rows()) === '10,20,30');
  await js("document.querySelector('#tab-card .e-toggle[data-set=farmSkipRecent]').click()");
  await wait(2500);
  check('the filter switch is saved', setCalls.some((p) => p.farmSkipRecent === true));
  check('a game still in the refund window is left out of the queue', (await rows()) === '10,30');
  await shot('p8-refund');

  // ---- CSV export on the Inventory page
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(3000);
  await js("(()=>{const b=document.querySelector('.e-modal-back [data-no], .e-modal-back .cancel'); if (b) b.click();})()");
  await wait(500);
  await js("document.getElementById('invExportCsv').click()");
  await wait(800);
  const rowsSent = csvCalls[0];
  check('the export button sends a header and one line per item', !!rowsSent && rowsSent[0][0] === 'Name' && rowsSent[0].length === 10 && rowsSent.length >= 2);
  check('every line has the same number of columns', !!rowsSent && rowsSent.every((r) => r.length === rowsSent[0].length));
  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
