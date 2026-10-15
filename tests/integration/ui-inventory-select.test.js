// Inventory selection: the box at the top of the list ticks every row in view (dimmed ones too) and shows all / some / none, and Shift + click
// ticks or clears the whole range between the last ticked row and the clicked one.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const items = Array.from({ length: 14 }, (_, i) => ({ assetId: String(i + 1), order: i, dedupKey: 'k_' + i, name: i % 3 === 0 ? 'Some Rather Long Trading Card Name ' + i : 'Card ' + i, marketHashName: '440-Card ' + i, iconUrl: null, tradable: i % 2 === 0, marketable: true, type: i % 5 === 0 ? 'booster' : 'card', gameName: 'Game Number ' + (i % 7), appid: 440 + (i % 7), amount: 1 + (i % 4) }));
const games = ['Alpha Game', 'Beta Game With A Much Longer Name Than Usual', 'Gamma Game', 'Delta', 'Epsilon Game'].map((name, i) => ({ appid: 10 * (i + 1), name, remaining: 1 + i, playtimeMin: 500 - 20 * i }));
const answers = {
  'settings:get': () => settings, 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games, refundIds: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: games.map((g, i) => ({ appid: g.appid, name: g.name, playtimeForever: 600 - 40 * i, hasStats: true })) }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [], 'accounts:connectAll': () => [],
  'engine:inventory': () => ({ ok: true, items }), 'engine:pricesFor': () => ({ ok: true, prices: {}, queued: 0 }), 'engine:historyFor': () => ({ ok: true, history: {} }),
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
  const click = (sel, shift) => js("(() => { const e = " + sel + "; e.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: !!" + shift + " })); })()");
  const box = (n) => "document.querySelectorAll('#invRows [data-k]')[" + n + "].querySelector('[data-a=check]')";
  const count = async () => await js('selected.size');
  const total = await js("document.querySelectorAll('#invRows [data-k]').length");
  check('the list has rows', total === 14, String(total));
  await click("document.getElementById('selAll')");
  check('the box at the top ticks every row in view', (await count()) === total, String(await count()));
  const state = () => js("(() => { const b = document.getElementById('selAll'); return b.style.borderColor + '|' + b.style.background; })()");
  const full = await state();
  await click("document.getElementById('selAll')");
  check('a second click clears them', (await count()) === 0);
  await click(box(2));
  check('one row ticked: the header box is outlined, not filled', (await state()) !== full && (await js("document.getElementById('selAll').style.background")) === 'transparent', await state());
  await click(box(6), true);
  check('Shift + click ticks the range from the last ticked row', (await count()) === 5, String(await count()));
  await click(box(4), true);
  check('Shift + click on a ticked row clears the range up to it', (await count()) === 2, String(await count()));
  await click(box(10));
  await click(box(8), true);
  check('a range works upwards too', (await js("[...selected].length")) === 5, String(await count()));
  await click(box(0));
  await click(box(13), true);
  check('a range from the first to the last row ticks them all', (await count()) === total, String(await count()));
  check('the header box is filled when every row is ticked', (await state()) === full, await state());
  await click("document.getElementById('bulkClear')");
  check('Clear empties the selection and the header box', (await count()) === 0 && (await js("document.getElementById('selAll').style.background")) === 'transparent');
  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
