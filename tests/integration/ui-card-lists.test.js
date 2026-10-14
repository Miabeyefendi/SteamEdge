// Card Farming page: blacklist, whitelist and "Whitelist only".
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
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games: [{appid:10,name:'Alpha Game',remaining:3,playtimeMin:500},{appid:20,name:'Beta Game',remaining:1,playtimeMin:0},{appid:30,name:'Gamma Game',remaining:5,playtimeMin:90}] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: [] }), 'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
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
  await wait(1500);  const settingsSetCalls = [];
  ipcMain.removeHandler('settings:set'); ipcMain.handle('settings:set', (_e, patch) => { settingsSetCalls.push(patch); Object.assign(settings, patch); return settings; });

  const txt = (sel) => js("document.querySelector('" + sel + "').innerText.split(String.fromCharCode(10)).join(' ').slice(0,400)");
  await js("document.querySelector('.nav a[data-tab=card]').click()");
  await wait(2500);
  log('queue text', await txt('#cardQueue')); log('tab visible', await js("!document.getElementById('tab-card').classList.contains('hidden')"));
  log('queue rows', await js("[...document.querySelectorAll('#cardQueue [data-row]')].map(r=>r.getAttribute('data-row')).join()"));
  log('filter labels', await js("[...document.querySelectorAll('#qFilter button')].map(b=>b.textContent).join(' | ')"));
  await shot('p5-queue');
  // blacklist game 20
  await js("document.querySelector('#cardQueue [data-row=\"20\"] [data-act=remove]').click()");
  await wait(500);
  log('after blacklist rows', await js("[...document.querySelectorAll('#cardQueue [data-row]')].map(r=>r.getAttribute('data-row')).join()"));
  log('settings.set patch', JSON.stringify(settingsSetCalls.slice(-1)));
  await js("document.querySelector('#qFilter button[data-qf=excl]').click()");
  await wait(400);
  log('blacklist tab', await txt('#cardQueue'));
  await shot('p5-blacklist');
  await js("document.querySelector('#cardQueue [data-act=unexclude]').click()");
  await wait(400);
  log('blacklist after restore', await txt('#cardQueue'));
  // whitelist: star 10, turn the mode on
  await js("document.querySelector('#qFilter button[data-qf=all]').click()");
  await wait(300);
  await js("document.querySelector('#cardQueue [data-row=\"10\"] [data-act=wl]').click()");
  await wait(300);
  await js("document.querySelector('#tab-card .e-toggle[data-set=farmWhitelistOnly]').click()");
  await wait(600);
  log('whitelist-only rows', await js("[...document.querySelectorAll('#cardQueue [data-row]')].map(r=>r.getAttribute('data-row')).join()"));
  log('banner', await txt('#cardQueue'));
  await shot('p5-whitelist');
  await js("document.querySelector('#qFilter button[data-qf=wl]').click()");
  await wait(300);
  log('whitelist tab', await txt('#cardQueue'));
  log('last set', JSON.stringify(settingsSetCalls.slice(-2)));
  // start: games sent
  await js("document.querySelector('#qFilter button[data-qf=all]').click()"); await wait(200);
  await js("document.getElementById('btnStart').click()"); await wait(400);
  log('startFarm games', JSON.stringify(calls.filter(c=>c[0]==='engine:startFarm').pop()));
  log('console errors', JSON.stringify(consoleErr));
  app.exit(0);
});
