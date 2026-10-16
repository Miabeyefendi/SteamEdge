// Other games' inventories (Counter-Strike 2, Dota 2): the Inventory page lists the games the account has items in, a game's items load into
// the same table with their own market keys, the type and game filters step aside, prices and the sale carry the game, the Overview keeps showing the
// Steam inventory, and what was read comes back without a new request.
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

  const text = (id) => js("(document.getElementById('" + id + "') || { textContent: '' }).textContent");
  const rowsText = () => js("[...document.querySelectorAll('#invRows [data-k]')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()).join(' || ')");
  const visible = (id) => js("(() => { const e = document.getElementById('" + id + "'); return !!e && getComputedStyle(e).display !== 'none'; })()");
  const inventoryCalls = () => calls.filter((c) => c[0] === 'inventory').map((c) => c[1]);
  const pick = async (value) => { await js("(() => { const s = document.getElementById('efSource'); s.value = '" + value + "'; s.dispatchEvent(new Event('change')); })()"); };
  const CS = JSON.stringify({ appid: 730, contextId: '2', appName: 'Counter-Strike 2' });
  const DOTA = JSON.stringify({ appid: 570, contextId: '2', appName: 'Dota 2' });

  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(1400);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");

  // 1. the Steam inventory comes first, the games are offered once they are known
  check('the Steam inventory is what opens first', inventoryCalls().join() === 'community' && /Card 0/.test(await rowsText()), inventoryCalls().join());
  check('the list of games was asked for once', calls.filter((c) => c[0] === 'sources').length === 1);
  check('the source list shows up with the Steam inventory and the two games', (await visible('efSource')) && (await js("[...document.getElementById('efSource').options].map((o) => o.value + '=' + o.textContent).join('|')")) === '753:6=Steam (cards, backgrounds, emoticons)|730:2=Counter-Strike 2 (3)|570:2=Dota 2 (1)');
  check('the type and game filters are there for the Steam inventory', (await visible('efType')) && (await visible('efGame')) && (await visible('invGroup')));
  const steamTotal = await text('invStatTotal');
  await shot('sources-steam');
  check('the Steam inventory has its 5 items', steamTotal === '5', steamTotal);

  // 2. Counter-Strike 2
  await pick('730:2');
  await wait(1200);
  check('picking Counter-Strike 2 asks for its backpack with the game and context', inventoryCalls().slice(-1)[0] === CS, inventoryCalls().slice(-1)[0]);
  const csRows = await rowsText();
  check('its items are in the table, the cards are not', /AK-47 \| Redline/.test(csRows) && /Dreams & Nightmares Case/.test(csRows) && /Name Tag/.test(csRows) && !/Card 0/.test(csRows), csRows.slice(0, 140));
  check('the Game column says Counter-Strike 2', /Counter-Strike 2/.test(csRows));
  await shot('sources-cs2');
  check('the totals are those of the backpack', (await text('invStatTotal')) === '3' && (await text('invStatSellable')) === '2', (await text('invStatTotal')) + ' / ' + (await text('invStatSellable')));
  check('the type and game filters and the grouping step aside', !(await visible('efType')) && !(await visible('efGame')) && !(await visible('invGroup')));
  check('a part of a big backpack is said to be a part', /part of the inventory/i.test(await js("document.body.textContent")));

  // prices: the key carries the game; nothing is asked on its own (many kinds of item, Steam's limit)
  check('the prices of a game are not asked until the button is pressed', calls.filter((c) => c[0] === 'prices' && !c[2] && /730\|/.test(c[1])).length === 0);
  await js("document.getElementById('invFetchPrices').click()");
  await wait(700);
  const priceAsk = calls.filter((c) => c[0] === 'prices' && !c[2]).slice(-1)[0];
  check('the price request names the items with the game in front', !!priceAsk && JSON.parse(priceAsk[1]).sort().join('||') === '730|AK-47 | Redline (Field-Tested)||730|Dreams & Nightmares Case', priceAsk && priceAsk[1]);

  // the detail panel shows the type text of the game, a double click opens the market of the item's own game
  await js("document.querySelector('#invRows [data-k=x_1]').click()");
  await wait(300);
  check('the detail panel shows the item type of the game', /Classified Rifle/.test(await text('invDetail')), (await text('invDetail')).slice(0, 120));
  await js("document.querySelector('#invRows [data-k=x_1]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))");
  await wait(300);
  const opened = calls.filter((c) => c[0] === 'open').slice(-1)[0];
  check('a double click opens that game\'s market page with the plain name', !!opened && opened[1] === 'https://steamcommunity.com/market/listings/730/' + encodeURIComponent('AK-47 | Redline (Field-Tested)'), opened && opened[1]);

  // 3. selling: the request carries the game, the question warns about the price by name
  await js("document.querySelector('#invRows [data-k=x_1] [data-a=check]').click()");
  await wait(200);
  await js("document.getElementById('bulkSellNow').click()");
  await wait(800);
  const modal = await js("(document.querySelector('.e-modal-back') || { textContent: '' }).textContent");
  await shot('sources-sell-question');
  check('the sale question warns that a game\'s items are priced by name', /not Steam community items/.test(modal) && /wear/i.test(modal), modal.slice(0, 200));
  await js("document.querySelector('.e-modal-ft .ok').click()");
  await wait(2500);
  const sold = calls.filter((c) => c[0] === 'sell');
  check('the listing goes out with the game and the context of the item', sold.length === 1 && sold[0][1] === '9001' && sold[0][2] === 730 && sold[0][3] === '2', JSON.stringify(sold));
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  await js("(() => { const c = document.querySelector('#salePanel [data-sg=close]'); if (c) c.click(); })()");
  await wait(1500);
  check('after the sale the backpack was read again', inventoryCalls().filter((x) => x === CS).length === 2, inventoryCalls().join(' '));

  // 4. the Overview keeps showing the Steam inventory
  await js("document.querySelector('.nav a[data-tab=overview]').click()");
  await wait(600);
  await js("renderOverviewStats()");
  const ov = (await text('gStatValueSub')).trim();
  check('the Overview tile still counts the Steam inventory (5 items), not the backpack (3)', /^5 /.test(ov), ov);

  // 5. Dota 2: Steam refuses, then it works; Steam comes back without a request
  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(500);
  dotaFails = true;
  await pick('570:2');
  await wait(900);
  const failed = await js("document.getElementById('invRows').textContent");
  check('a refused read shows the reason and no old rows', /HTTP 429/.test(failed) && !/AK-47/.test(failed) && !/Card 0/.test(failed), failed.slice(0, 100));
  dotaFails = false;
  await pick('753:6');
  await wait(600);
  const before = inventoryCalls().length;
  check('back to Steam: the cards are there again', /Card 0/.test(await rowsText()) && (await text('invStatTotal')) === steamTotal);
  check('the filters are back with it', (await visible('efType')) && (await visible('efGame')) && (await visible('invGroup')));
  await pick('570:2');
  await wait(1000);
  check('Dota 2 loads its own backpack now (the failed read was not kept)', inventoryCalls().length === before + 1 && inventoryCalls().slice(-1)[0] === DOTA && /Inscribed Compendium/.test(await rowsText()), inventoryCalls().slice(-2).join(' '));
  const before2 = inventoryCalls().length;
  await pick('753:6');
  await wait(400);
  await pick('570:2');
  await wait(500);
  check('going back and forth costs no request', inventoryCalls().length === before2 && /Inscribed Compendium/.test(await rowsText()), inventoryCalls().length + ' vs ' + before2);

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
