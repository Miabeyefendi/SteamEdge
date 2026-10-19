// Accounts and jobs in the interface: what runs on each account is visible without opening that account (top bar chip, lines in the account list),
// switching shows that it is working and a second click on another row takes over, and Start / Stop are closed while their job runs / does not run.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: 'en', accountCurrency: 'USD', steamID: '76561198000000001', persona: 'first', parentalPin: '' };
const games = [{ appid: 10, name: 'Alpha Game', remaining: 2, playtimeMin: 500 }, { appid: 20, name: 'Beta Game', remaining: 1, playtimeMin: 30 }];
let accountRows = [
  { steamID: '76561198000000001', accountName: 'first', active: true, connected: true, running: false, jobs: [], finished: null },
  { steamID: '76561198000000002', accountName: 'second', active: false, connected: true, running: true, jobs: ['card', 'hours'], finished: null },
  { steamID: '76561198000000003', accountName: 'third', active: false, connected: false, running: false, jobs: [], finished: { jobs: ['realistic'], ts: Date.now() - 60000 } },
];
const calls = [];
let switchDelay = 0;
// each account's own values, as main.js gives them (accountSettingsAdded)
const own = {
  '76561198000000001': { grQueue: [10], grDurationSec: 3600 },
  '76561198000000002': { grQueue: [20], grDurationSec: 18000 },
  '76561198000000003': { grQueue: [], grDurationSec: 7200 },
};
const activeId = () => accountRows.find((a) => a.active).steamID;
const view = () => ({ ...settings, ...own[activeId()], settingsAccount: activeId() });
const answers = {
  'settings:get': () => view(), 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch, forAccount) => { calls.push(['settings:set', patch, forAccount]); return view(); },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games, refundIds: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: games.map((g) => ({ appid: g.appid, name: g.name, playtimeForever: g.playtimeMin, hasStats: true })) }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}),
  'accounts:list': () => accountRows.map((a) => ({ ...a })), 'accounts:connectAll': () => [],
  'accounts:switch': async (_e, id) => {
    calls.push(['switch', id]);
    const mine = ++switchSeq;
    await new Promise((r) => setTimeout(r, switchDelay));
    if (mine !== switchSeq) return { ok: true, superseded: true, steamID: id };
    accountRows = accountRows.map((a) => ({ ...a, active: a.steamID === id }));
    return { ok: true, persona: 'x', steamID: id, softSwitch: true };
  },
  'engine:startFarm': (_e) => { calls.push(['startFarm']); return { ok: true }; },
  'keys:state': () => ({ queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null }),
  'app:info': () => ({ versionStr: '1.6.0' }), 'app:memory': () => null, 'update:lastStatus': () => null, 'realistic:noAchievementsList': () => ({ ok: true, appids: [] }),
};
let switchSeq = 0;
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
[...preload.matchAll(/invoke\('([^']+)'/g)].forEach((m) => { try { ipcMain.handle(m[1], answers[m[1]] || (() => ({ ok: true }))); } catch (_) {} });
[...preload.matchAll(/send\('([^']+)'/g)].forEach((m) => ipcMain.on(m[1], (_e, ...a) => calls.push([m[1], ...a])));
const consoleErr = [];
const log = console.log;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: process.env.SHOW === '1', width: 1716, height: 1000, useContentSize: true, webPreferences: { preload: ROOT + '/preload.js', sandbox: false, contextIsolation: true, backgroundThrottling: false } });
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 && !/Electron Security Warning/.test(msg)) consoleErr.push(msg.slice(0, 200)); });
  await w.loadFile(ROOT + '/src/main/main.html');
  const js = (k) => w.webContents.executeJavaScript(k).catch((e) => { log('[js error] ' + e.message); return null; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => { if (!process.env.SHOTS) return; w.webContents.invalidate(); await w.webContents.capturePage(); await wait(350); w.webContents.invalidate(); fs.writeFileSync(process.env.SHOTS + '/' + name + '.png', (await w.webContents.capturePage()).toPNG()); };
  const send = (channel, data) => w.webContents.send(channel, data);
  let failures = 0;
  const check = (name, condition, extra) => { if (!condition) failures++; log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  await wait(1800);

  // ---- the chip in the top bar ----
  const chip = () => js("(() => { const c = document.getElementById('tbRunning'); return { shown: c.style.display !== 'none', text: document.getElementById('tbRunningText').textContent, done: c.classList.contains('done') }; })()");
  let c = await chip();
  check('the chip shows one account running and one finished, without opening the account list, in the interface language', c.shown && /^Accounts running: 1 · Finished: 1 accounts$/.test(c.text), JSON.stringify(c));
  send('accounts:activity', { steamID: '76561198000000002', running: false, jobs: [], finished: { jobs: ['card'], ts: Date.now() } });
  await wait(300);
  c = await chip();
  check('when the running account ends the chip turns into "finished" only', c.shown && c.done && !/running/i.test(c.text) && /2/.test(c.text), JSON.stringify(c));
  send('accounts:activity', { steamID: '76561198000000002', running: true, jobs: ['hours'], finished: null });
  await wait(300);
  c = await chip();
  check('and back to running when the account starts again', c.shown && !c.done, JSON.stringify(c));

  // ---- the list ----
  await js("document.getElementById('tbProfile').click()");
  await wait(500);
  const rows = await js("[...document.querySelectorAll('#acctList .acct-row')].map(r => ({ id: r.dataset.id, name: r.querySelector('.nm').textContent, sub: (r.querySelector('.sub') || { textContent: '' }).textContent, on: !!r.querySelector('.sub.on') }))");
  await shot('acct-list');
  check('three rows', rows && rows.length === 3, JSON.stringify(rows));
  check('the running account names its job in the row', rows && /Hour/i.test(rows[1].sub) && rows[1].on, rows && rows[1].sub);
  check('the finished account says when it ended', rows && /\d/.test(rows[2].sub) && !rows[2].on, rows && rows[2].sub);
  check('the account on screen has no job line', rows && rows[0].sub === '');

  // ---- switching ----
  switchDelay = 900;
  await js("document.querySelector('#acctList .acct-row[data-id=\"76561198000000002\"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))");
  await wait(250);
  await shot('acct-switching');
  check('while it connects the page says so and is closed to clicks', await js("document.body.classList.contains('e-switching')"));
  check('the notice names the account', /second/.test(await js("document.getElementById('toastBox').textContent")));
  await wait(1100);
  check('after it is connected the page is open again', (await js("document.body.classList.contains('e-switching')")) === false);
  check('one click was enough: one switch call and the row is marked active', calls.filter((x) => x[0] === 'switch').length === 1 && accountRows[1].active);

  // a second click on another row while the first is still connecting takes over
  calls.length = 0; switchDelay = 800;
  await js("document.getElementById('tbProfile').click()");
  await wait(300);
  await js("document.querySelector('#acctList .acct-row[data-id=\"76561198000000001\"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))");
  await wait(200);
  await js("document.getElementById('tbProfile').click()");
  await wait(300);
  await js("document.querySelector('#acctList .acct-row[data-id=\"76561198000000003\"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))");
  await wait(1800);
  check('the newer click wins and nothing stays dimmed', accountRows.find((a) => a.active).steamID === '76561198000000003' && (await js("document.body.classList.contains('e-switching')")) === false, JSON.stringify(accountRows.map((a) => a.active)));
  check('no notice is left spinning', (await js("document.querySelectorAll('#toastBox .tspin').length")) === 0);

  // ---- the settings of the account on screen ----
  check('after the switch the page holds the values of the account on screen, not the first one', (await js("appSettings.settingsAccount + '|' + JSON.stringify(appSettings.grQueue) + '|' + appSettings.grDurationSec")) === '76561198000000003|[]|7200', await js("appSettings.settingsAccount + '|' + JSON.stringify(appSettings.grQueue) + '|' + appSettings.grDurationSec"));
  calls.length = 0;
  await js("window.imu.settings.set({ grDurationSec: 900 })");
  await wait(150);
  const tagged = calls.find((c) => c[0] === 'settings:set');
  check('and a write from the page names that account', tagged && tagged[2] === '76561198000000003', JSON.stringify(tagged));
  switchDelay = 0;
  await js("document.getElementById('tbProfile').click()");
  await wait(300);
  await js("document.querySelector('#acctList .acct-row[data-id=\"76561198000000002\"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))");
  await wait(900);
  check('switching to the second account brings its own Realistic Mode queue and duration', (await js("JSON.stringify(appSettings.grQueue) + '|' + appSettings.grDurationSec")) === '[20]|18000', await js("JSON.stringify(appSettings.grQueue) + '|' + appSettings.grDurationSec"));
  check('and the Realistic Mode queue the page kept from the other account is gone', (await js("typeof grQueue !== 'undefined' && grQueue.every((g) => g.appid !== 10)")) === true);

  // ---- Start / Stop ----
  const state = (ids) => js("(" + JSON.stringify(ids) + ").map(id => { const b = document.getElementById(id); return b ? b.disabled : null; })");
  await js("document.querySelector('.nav a[data-tab=card]').click()");
  await wait(1200);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  send('farm:tick', { running: false, activeAppids: [] });
  await wait(200);
  check('nothing runs: Start is open, Stop is closed (cards)', JSON.stringify(await state(['btnStart', 'btnStop'])) === '[false,true]', JSON.stringify(await state(['btnStart', 'btnStop'])));
  send('farm:tick', { running: true, activeAppids: [10], currentAppid: 10, durationMs: 60000, elapsedMs: 1000, sessionStart: Date.now() });
  await wait(200);
  check('card farming runs: Start is closed, Stop is open', JSON.stringify(await state(['btnStart', 'btnStop'])) === '[true,false]', JSON.stringify(await state(['btnStart', 'btnStop'])));
  await js("document.getElementById('btnStart').click()");
  await wait(200);
  check('a closed Start does not start it a second time', calls.filter((x) => x[0] === 'engine:startFarm').length === 0, JSON.stringify(calls));
  send('farm:tick', { running: false, activeAppids: [] });
  await wait(200);
  check('it ends: Start is open again', JSON.stringify(await state(['btnStart', 'btnStop'])) === '[false,true]');
  await js("document.getElementById('btnStart').click(); document.getElementById('btnStart').click();");
  await wait(300);
  check('a double click starts once, and Start is closed before the first answer comes', calls.filter((x) => x[0] === 'engine:startFarm').length === 1 && (await state(['btnStart']))[0] === true, JSON.stringify(calls.filter((x) => x[0] === 'engine:startFarm')));
  await js("document.getElementById('btnStop').click()");
  send('farm:tick', { running: false, activeAppids: [] });
  await wait(200);

  // the other pages
  await js("document.querySelector('.nav a[data-tab=hours]').click()");
  await wait(900);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  send('boost:tick', { running: false });
  await wait(200);
  check('hours, nothing runs: Start open, Stop closed', JSON.stringify(await state(['btnBoostStart', 'btnBoostStop'])) === '[false,true]', JSON.stringify(await state(['btnBoostStart', 'btnBoostStop'])));
  send('boost:tick', { running: true, appids: [10], startedAt: Date.now(), durationMs: 60000 });
  await wait(200);
  check('hours run: Start closed, Stop open', JSON.stringify(await state(['btnBoostStart', 'btnBoostStop'])) === '[true,false]');
  send('boost:tick', { running: false });
  await js("document.querySelector('.nav a[data-tab=realistic]').click()");
  await wait(1200);
  await js("document.querySelectorAll('.e-modal-back').forEach(m=>m.remove())");
  send('realistic:tick', { runningFlag: false });
  await wait(200);
  check('realistic, nothing runs: Start open, Stop closed', JSON.stringify(await state(['grStart', 'grStop'])) === '[false,true]', JSON.stringify(await state(['grStart', 'grStop'])));
  send('realistic:tick', { runningFlag: true, appid: 10, finishTime: Date.now() + 60000, openedGames: 0, totalSum: 5 });
  await wait(200);
  check('realistic runs: Start closed, Stop open', JSON.stringify(await state(['grStart', 'grStop'])) === '[true,false]');
  send('realistic:tick', { runningFlag: false });

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
