// Keys page, my listings, booster unpack and the Family View PIN row.
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

  // --- nav + keys page
  log('nav items', JSON.stringify(await js("[...document.querySelectorAll('#mainNav a[data-tab]')].map(a=>a.getAttribute('data-tab')+':'+a.textContent.trim())")));
  await js("document.querySelector('.nav a[data-tab=keys]').click()");
  await wait(600);
  log('keys visible', await js("!document.getElementById('tab-keys').classList.contains('hidden')"), '| title', await js("document.querySelector('#tab-keys h1').textContent"),
    '| start disabled', await js("document.getElementById('kyStart').disabled"), '| queue text', await js("document.getElementById('kyQueue').innerText"));
  await js("document.getElementById('kyInput').value='AAAAA-BBBBB-CCCCC\\nDDDDD-EEEEE-FFFFF'; document.getElementById('kyAdd').click()");
  await wait(500);
  log('keys:add sent', JSON.stringify(calls.filter((c) => c[0] === 'keys:add').map((c) => c[1])), '| note:', await js("document.getElementById('kyAddNote').textContent"));
  keyState = { queue: [{ key: 'EEEEE-FFFFF-GGGGG', name: 'Some Game' }], usedCount: 1, resultCount: 3,
    results: [{ key: 'AAAAA-BBBBB-CCCCC', name: '', status: 'used', detail: 0, packages: ['Game One'], ts: Date.now() }, { key: 'DDDDD-EEEEE-FFFFF', name: '', status: 'owned', detail: 9, packages: [], ts: Date.now() }, { key: 'GGGGG-HHHHH-IIIII', name: '', status: 'other', detail: 77, packages: [], ts: Date.now() }],
    running: true, pausedUntil: Date.now() + 3000000, error: null };
  w.webContents.send('keys:changed', keyState);
  await wait(500);
  log('counters', await js("[kyPending,kyUsed,kyRefused].map(e=>document.getElementById(e.id).textContent).join('/')"), '| pill', await js("document.getElementById('kyRunPill').textContent"),
    '| banner', await js("document.getElementById('kyBanner').innerText.replace(/\\s+/g,' ')"));
  log('results', await js("document.getElementById('kyResults').innerText.replace(/\\s+/g,' ')"));
  await shot('keys');
  await js("document.getElementById('kyTryNow').click()"); await wait(200);
  log('try now ->', JSON.stringify(calls.filter((c) => c[0] === 'keys:start').pop()));

  // --- inventory: types, booster unpack, my listings
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(1200);
  await js("(()=>{const m=document.querySelector('.e-modal-back [data-no]'); if (m) m.click();})()");   // the price question of the inventory page
  await wait(300);
  log('type options', await js("[...document.getElementById('efType').options].map(o=>o.value).join()"));
  await js("(()=>{const s=document.getElementById('efType');s.value='booster';s.dispatchEvent(new Event('change'));})()");
  await wait(300);
  await js("document.querySelector('#invRows [data-k]').click()");
  await wait(400);
  log('unpack button', await js("!!document.querySelector('[data-unpack]')"), '| detail type', await js("document.getElementById('invDetail').innerText.replace(/\\s+/g,' ').slice(0,90)"));
  await js("document.querySelector('[data-unpack]').click()");
  await wait(400);
  log('confirm shown', await js("!!document.querySelector('.e-modal-back [data-yes]')"));
  await js("[...document.querySelectorAll('.e-modal-back')].pop().querySelector('[data-yes]').click()");
  await wait(900);
  log('unpack call', JSON.stringify(calls.filter((c) => c[0] === 'unpack')));
  await shot('inventory-booster');
  await js("document.getElementById('invMyListings').click()");
  await wait(700);
  log('listings rows', await js("document.querySelectorAll('[data-ml]').length"), '| text', await js("document.querySelector('.e-modal').innerText.replace(/\\s+/g,' ').slice(0,260)"));
  await shot('listings');
  await js("document.querySelector('[data-ml=\"11\"]').click(); document.querySelector('[data-ml=\"13\"]').click()");
  await wait(200);
  log('cancel btn', await js("document.querySelector('[data-mlcancel]').textContent"), '| disabled', await js("document.querySelector('[data-mlcancel]').disabled"));
  await js("document.querySelector('[data-mlcancel]').click()");
  await wait(400);
  log('confirm title', await js("[...document.querySelectorAll('.e-modal .h')].map(e=>e.textContent).join(' | ')"));
  await js("[...document.querySelectorAll('.e-modal-back')].pop().querySelector('[data-yes]').click()");
  await wait(1500);
  log('remove calls', JSON.stringify(calls.filter((c) => c[0] === 'remove')));

  // --- settings: PIN
  await js("openSettingsPage('privacy')");
  await wait(500);
  log('pin row', JSON.stringify(await js("(()=>{const e=document.querySelector('[data-set=parentalPin]');return [e.type,e.closest('[data-setting-row]').innerText.replace(/\\s+/g,' ').slice(0,40)]})()")));
  await js("(()=>{const e=document.querySelector('[data-set=parentalPin]');e.value='4321';e.dispatchEvent(new Event('change'));document.getElementById('setSave').click();})()");
  await wait(500);
  log('save patch', JSON.stringify(calls.filter((c) => c[0] === 'settings:save').pop()));
  await shot('settings-privacy');
  // 1.4.8: the "pass on owned keys" switch on the Keys page saves its setting, and a store link is accepted as a line
  let failures = consoleErr.length ? 1 : 0;
  const check = (name, condition) => { if (!condition) failures++; log((condition ? 'PASS ' : 'FAIL ') + name); };
  const setCalls = [];
  ipcMain.removeHandler('settings:set'); ipcMain.handle('settings:set', (_e, patch) => { setCalls.push(patch); Object.assign(settings, patch); return settings; });
  await js("document.querySelector('.nav a[data-tab=keys]').click()");
  await wait(800);
  check('the keys page has the pass-on switch', (await js("!!document.querySelector('#tab-keys .e-toggle[data-set=keyForwardOwned]')")) === true);
  await js("document.querySelector('#tab-keys .e-toggle[data-set=keyForwardOwned]').click()");
  await wait(400);
  check('switching it saves keyForwardOwned', setCalls.some((p) => p.keyForwardOwned === true));
  check('the box tells about store links', (await js("document.getElementById('kyInput').placeholder")).toLowerCase().includes('steam'));
  log('console errors', JSON.stringify(consoleErr));
  app.exit(failures ? 1 : 0);
});
