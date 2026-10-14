// Settings rows for token protection, proxy and the card farming schedule.
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
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
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
  await wait(1500);
  const row = (k) => "(()=>{const e=document.querySelector('[data-set=" + k + "]');return !!e})()";
  await js("openSettingsPage('privacy')");
  await wait(500);
  log('rows present', JSON.stringify([await js(row('protectTokens')), await js(row('proxyUrl')), await js(row('parentalPin'))]));
  await shot('p3-privacy');
  await js("document.querySelector('[data-set=protectTokens]').click()");
  await js("(()=>{const e=document.querySelector('[data-set=proxyUrl]');e.value='socks5://127.0.0.1:1080';e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));document.getElementById('setSave').click();})()");
  await wait(600);
  log('save patch', JSON.stringify(calls.filter((c) => c[0] === 'settings:save').pop()));
  log('proxy note toast', await js("document.body.innerText.includes('reconnects') || document.body.innerText.includes('yeniden')"));
  const cards = await js("[...document.querySelectorAll('.setpanel')].find(p=>p.querySelector('[data-set=farmScheduleEnabled]')).getAttribute('data-sec')");
  await js("openSettingsPage('" + cards + "')");
  await wait(500);
  log('schedule rows', JSON.stringify(await js("['farmScheduleEnabled','farmScheduleFrom','farmScheduleTo'].map(k=>{const e=document.querySelector('[data-set='+k+']');return [k,e.tagName,e.type||'',e.value||'']})")));
  await wait(900); await shot('p3-cards'); await wait(300);
  await js("document.querySelector('[data-set=farmScheduleEnabled]').click()");
  await js("(()=>{const e=document.querySelector('[data-set=farmScheduleFrom]');e.value='23:30';e.dispatchEvent(new Event('change'));document.getElementById('setSave').click();})()");
  await wait(600);
  log('save patch 2', JSON.stringify(calls.filter((c) => c[0] === 'settings:save').pop()));
  log('gate state', await js("(()=>{const e=document.querySelector('[data-set=farmScheduleTo]');return e.disabled+' '+(e.closest('[data-setting-row]').getAttribute('title')||'')+' '+e.style.opacity})()"));
  log('console errors', JSON.stringify(consoleErr));
  app.exit(0);
});
