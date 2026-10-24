// Selling: the amounts are on screen at once (Steam's fee calculation does not answer here, nothing waits for it), Sell opens the one question without
// a calculation step, a second click does nothing while the flow runs, and the progress panel shows every item with its state.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const calls = [];
const items = Array.from({ length: 14 }, (_, i) => ({ assetId: String(i + 1), order: i, dedupKey: 'k_' + i, name: i % 3 === 0 ? 'Some Rather Long Trading Card Name ' + i : 'Card ' + i, marketHashName: '440-Card ' + i, iconUrl: null, tradable: i % 2 === 0, marketable: true, type: i % 5 === 0 ? 'booster' : 'card', gameName: 'Game Number ' + (i % 7), appid: 440 + (i % 7), amount: 1 + (i % 4) }));
const games = ['Alpha Game', 'Beta Game With A Much Longer Name Than Usual', 'Gamma Game', 'Delta', 'Epsilon Game'].map((name, i) => ({ appid: 10 * (i + 1), name, remaining: 1 + i, playtimeMin: 500 - 20 * i }));
const answers = {
  'engine:saleFee': () => new Promise(() => {}),
  'engine:sellItem': (_e, a) => { calls.push(['sell', a.assetId, Date.now(), a.steamID || null]); return a.assetId === '3' ? { ok: false, error: 'Steam said no', typeName: 'skip' } : { ok: true, result: { needs_mobile_confirmation: a.assetId === '2' } }; },
  'settings:get': () => settings, 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games, refundIds: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: games.map((g, i) => ({ appid: g.appid, name: g.name, playtimeForever: 600 - 40 * i, hasStats: true })) }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [], 'accounts:connectAll': () => [],
  'engine:inventory': () => ({ ok: true, items }), 'engine:pricesFor': (_e, h) => { calls.push(['prices', h]); const o = {}; (Array.isArray(h) ? h : (h && h.hashNames) || []).forEach((x) => { o[x] = { lowestValue: 0.10, medianValue: 0.12 }; }); return { ok: true, prices: o, queued: 0 }; }, 'engine:historyFor': (_e, h) => { calls.push(['history', h]); return { ok: true, history: {} }; },
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

  await js("document.querySelector('.nav a[data-tab=inventory]').click()");
  await wait(900);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  await js("document.getElementById('invFetchPrices').click()");
  await wait(600);
  await js("document.getElementById('selAll').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
  await wait(300);
  const net = await js("document.getElementById('bulkNet').textContent");
  check('the amount you receive is there at once, as a number', /\d/.test(net) && !/[…]/.test(net) && net !== '-', net);
  const gross = await js("document.getElementById('bulkGross').textContent");
  check('the buyer total is there too', /\d/.test(gross), gross);
  // each strategy changes the numbers on the spot
  await js("document.querySelector('#bulkStrat [data-bs=undercut]').click()");
  const net2 = await js("document.getElementById('bulkNet').textContent");
  check('choosing another strategy redraws the amount without waiting', /\d/.test(net2), net + ' -> ' + net2);

  // Sell: the question comes at once, twice pressed is still one question
  await js("document.getElementById('bulkSellNow').click(); document.getElementById('bulkSellNow').click();");
  await wait(500);
  const modals = await js("document.querySelectorAll('.e-modal-back').length");
  check('Sell opens one question at once (no calculation step), a second click opens nothing', modals === 1, String(modals));
  check('the button is locked while the flow runs', (await js("document.getElementById('bulkSellNow').disabled")) === true);
  const text = await js("document.querySelector('.e-modal-back').textContent");
  check('the question names the totals', /14/.test(text), text.slice(0, 80));
  check('the amounts are marked as estimates when Steam does not answer', /estimate/i.test(text), text.slice(-160));
  await js("document.querySelector('.e-modal-ft .ok').click()");
  await wait(2500);
  const rows = await js("document.querySelectorAll('#salePanel [data-r]').length");
  check('the progress panel lists every item', rows === 14, String(rows));
  const sells = calls.filter((c) => c[0] === 'sell').length;
  check('one request went out per item, no double sends', sells === 14, String(sells));
  const states = await js("[...document.querySelectorAll('#salePanel [data-c=st]')].map((e) => e.textContent).join('|')");
  check('rows show listed, awaiting confirmation and skipped', /Listed/.test(states) && /Awaiting confirmation/.test(states) && /Skipped/.test(states), states);
  const counts = await js("document.querySelector('#salePanel [data-sp=counts]').textContent");
  check('the counters add up', /13 listed/.test(counts) && /1 failed/.test(counts) && /0 left/.test(counts), counts);
  check('the button is free again after the job', (await js("document.getElementById('bulkSellNow').disabled")) === false);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  await shot('sell-panel');
  check('the panel stays until it is closed', (await js("!!document.getElementById('salePanel')")) === true);
  await js("document.querySelector('#salePanel [data-sg=close]').click()");
  check('Close removes the panel', (await js("!document.getElementById('salePanel')")) === true);
  const sellCalls = calls.filter((c) => c[0] === 'sell');
  check('every listing of the sale names the account it started on (a batch that waits must not go to another account)', sellCalls.length > 0 && sellCalls.every((c) => c[3] === '76561198000000000'), JSON.stringify(sellCalls.map((c) => c[3])));
  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
