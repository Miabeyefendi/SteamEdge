// Quick navigation: Ctrl+K opens the command palette (pages, settings, accounts, actions of the open page), Ctrl+1..9 open pages, ? lists the shortcuts,
// the box in Settings finds a single setting, and a save marks the sections it saved.
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
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [{ steamID: '76561198000000000', accountName: 'main', active: true, connected: true }, { steamID: '76561198000000001', accountName: 'alt', active: false, connected: true }], 'accounts:connectAll': () => [],
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

  const key = (k, opts) => js("document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: " + JSON.stringify(k) + ", bubbles: true, cancelable: true }, " + JSON.stringify(opts || {}) + ")))");
  const type = (sel, text) => js("(() => { const i = document.querySelector('" + sel + "'); i.focus(); i.value = " + JSON.stringify(text) + "; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
  const press = (sel, k) => js("document.querySelector('" + sel + "').dispatchEvent(new KeyboardEvent('keydown', { key: " + JSON.stringify(k) + ", bubbles: true, cancelable: true }))");
  const hidden = (tab) => js("document.getElementById('tab-" + tab + "').classList.contains('hidden')");
  const items = () => js("[...document.querySelectorAll('#palList .e-pal-item .l')].map((e) => e.textContent).join(' | ')");

  // the palette
  await key('k', { ctrlKey: true });
  await wait(300);
  check('Ctrl+K opens the command palette', (await js("!!document.getElementById('palBack')")) === true);
  check('the search box has the focus', (await js("document.activeElement && document.activeElement.id")) === 'palInput');
  check('it lists the pages first, with their shortcut', /Overview/.test(await items()) && (await js("document.querySelector('#palList .e-pal-item .k').textContent")) === 'Ctrl+1', await items());
  check('and the groups are named', /Pages/.test(await js("document.querySelector('#palList .e-pal-grp').textContent")));
  await shot('palette');
  check('single settings are not in the empty list', !/Prevent sleep/.test(await items()));
  await type('#palInput', 'realistic');
  await wait(100);
  await shot('palette-typed');
  check('typing narrows the list to what matches', /^Realistic Mode/.test(await items()), await items());
  await press('#palInput', 'Enter');
  await wait(500);
  check('Enter opens the first one and closes the palette', (await hidden('realistic')) === false && (await js("!document.getElementById('palBack')")) === true);

  await key('k', { ctrlKey: true });
  await wait(300);
  await type('#palInput', 'prevent sleep');
  await wait(100);
  check('a single setting is found by its name, with its section beside it', /Prevent sleep/.test(await items()) && /General/.test(await js("document.querySelector('#palList .e-pal-item .k').textContent")), await items());
  await press('#palInput', 'Enter');
  await wait(700);
  check('it opens Settings at the section and lights the row', (await hidden('settings')) === false && (await js("document.querySelector('#tab-settings .setpanel[data-sec=general]').style.display")) !== 'none' && (await js("document.querySelector('#tab-settings [data-set=preventSleep]').closest('[data-setting-row]').classList.contains('e-flash')")) === true);

  await key('k', { ctrlKey: true });
  await wait(300);
  await type('#palInput', 'alt');
  await wait(400);
  check('another account can be switched to, the active one is not offered', /Switch to account: alt/.test(await items()) && !/Switch to account: main/.test(await items()), await items());
  await press('#palInput', 'Escape');
  await wait(300);
  check('Esc closes the palette', (await js("!document.getElementById('palBack')")) === true);

  await key('k', { ctrlKey: true });
  await wait(300);
  await type('#palInput', 'zzzzqq');
  await wait(100);
  check('a query with no match says so', /No results/.test(await js("document.getElementById('palList').textContent")));
  await press('#palInput', 'Escape');
  await wait(300);
  await key('k', { ctrlKey: true });
  await wait(300);
  await key('k', { ctrlKey: true });
  await wait(300);
  check('Ctrl+K again closes it', (await js("!document.getElementById('palBack')")) === true);

  // Ctrl + number
  await key('1', { ctrlKey: true });
  await wait(400);
  check('Ctrl+1 opens the overview', (await hidden('overview')) === false);
  await key('3', { ctrlKey: true });
  await wait(400);
  check('Ctrl+3 opens the third page of the menu', (await hidden('inventory')) === false && (await hidden('overview')) === true);
  await key('Escape');      // the inventory asks whether to fetch 450 prices; a question in the way holds the shortcuts back, as it should
  await wait(300);
  await key('9', { ctrlKey: true });
  await wait(500);
  check('Ctrl+9 opens Settings', (await hidden('settings')) === false);
  await key('2', { ctrlKey: true });
  await wait(500);
  check('and Ctrl+2 leaves it for the card page', (await hidden('card')) === false);

  // the shortcut list
  await key('?', { shiftKey: true });
  await wait(300);
  check('? opens the list of shortcuts', (await js("!!document.getElementById('helpBack')")) === true);
  check('it shows the numbers as they are now', (await js("document.querySelectorAll('#helpBack .e-help-row').length")) >= 10 && /Ctrl\+3/.test(await js("document.getElementById('helpBack').textContent")));
  await shot('shortcuts');
  await key('Escape');
  await wait(300);
  check('Esc closes it', (await js("!document.getElementById('helpBack')")) === true);
  await key('/', { ctrlKey: true });
  await wait(300);
  check('Ctrl+/ opens it too', (await js("!!document.getElementById('helpBack')")) === true);
  await key('/', { ctrlKey: true });
  await wait(300);
  check('and closes it again', (await js("!document.getElementById('helpBack')")) === true);
  await js("openSettingsPage('general')");
  await wait(400);
  await js("document.getElementById('setSearch').focus()");
  await js("document.getElementById('setSearch').dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))");
  await wait(200);
  check('a ? typed in a box is just a letter', (await js("!document.getElementById('helpBack')")) === true);

  // the box in Settings
  await type('#setSearch', 'sleep');
  await wait(200);
  await shot('settings-search');
  check('the box in Settings lists the settings that match, each with its section', (await js("document.getElementById('setFound').style.display")) !== 'none' && /Prevent sleep/.test(await js("document.getElementById('setFound').textContent")) && /General/.test(await js("document.getElementById('setFound').textContent")));
  await js("document.querySelector('#tab-settings [data-secbtn=notif]').click()");
  await wait(300);
  await type('#setSearch', 'quiet hours');
  await wait(200);
  await press('#setSearch', 'Enter');
  await wait(700);
  check('Enter jumps to the setting: its section opens and the box is empty again', (await js("document.querySelector('#tab-settings .setpanel[data-sec=notif]').style.display")) !== 'none' && (await js("document.getElementById('setSearch').value")) === '' && (await js("document.getElementById('setFound').style.display")) === 'none');
  await type('#setSearch', 'qqzzxx');
  await wait(200);
  check('nothing found says so', /No results/.test(await js("document.getElementById('setFound').textContent")));
  await press('#setSearch', 'Escape');

  // marks on the sections
  await js("document.querySelector('#tab-settings [data-secbtn=general]').click()");
  await wait(300);
  check('no section is marked while nothing is changed', (await js("document.querySelectorAll('#tab-settings .e-secmark.dirty').length")) === 0);
  await js("document.querySelector('#tab-settings [data-set=closeToTray]').click()");
  await wait(200);
  check('a changed section carries a dot', (await js("document.querySelector('#tab-settings [data-secbtn=general] .e-secmark').classList.contains('dirty')")) === true && (await js("document.querySelectorAll('#tab-settings .e-secmark.dirty').length")) === 1);
  check('the label of the section is still its own text', (await js("[...document.querySelector('#tab-settings [data-secbtn=general]').childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()")) === 'General');
  await shot('section-dot');
  await js("document.getElementById('setSave').click()");
  await wait(800);
  check('after the save the section shows a tick and the dot is gone', (await js("document.querySelector('#tab-settings [data-secbtn=general] .e-secmark').classList.contains('saved')")) === true && (await js("document.querySelectorAll('#tab-settings .e-secmark.dirty').length")) === 0);
  await shot('section-saved');
  await wait(3800);
  check('the tick goes after a few seconds', (await js("document.querySelectorAll('#tab-settings .e-secmark.saved').length")) === 0);

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
