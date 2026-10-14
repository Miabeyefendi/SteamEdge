// Card farming options and settings page in a hidden window.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
// Part 1 smoke test: real main.html + real preload.js, IPC answered with fake data.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const block = src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1];
const DEFAULTS = vm.runInNewContext('(' + block + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester' };
const calls = [];
const games = [
  { appid: 1, name: 'Alpha', remaining: 3, playtimeMin: 600 },
  { appid: 2, name: 'Bravo', remaining: 1, playtimeMin: 0 },
  { appid: 3, name: 'Charlie', remaining: 5, playtimeMin: 30 },
  { appid: 4, name: 'Delta', remaining: 2, playtimeMin: 130 },
];
const answers = {
  'settings:get': () => settings,
  'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; },
  'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { calls.push(['settings:save', patch]); Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }),
  'engine:dropGames': () => ({ ok: true, games }),
  'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: [] }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }),
  'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }),
  'state:get': () => ({ value: null }),
  'stats:get': () => ({}),
  'accounts:list': () => [],
  'accounts:connectAll': () => [],
  'app:info': () => ({ versionStr: '1.4.1' }),
  'app:memory': () => null,
  'update:lastStatus': () => null,
  'realistic:noAchievementsList': () => ({ ok: true, appids: [] }),
};
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
const invokes = [...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]);
const sends = [...preload.matchAll(/send\('([^']+)'/g)].map((m) => m[1]);
invokes.forEach((ch) => { try { ipcMain.handle(ch, answers[ch] || (() => ({ ok: true }))); } catch (_) {} });
sends.forEach((ch) => ipcMain.on(ch, (_e, a) => { calls.push([ch, a]); }));

const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };
const consoleErr = [];
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1716, height: 1000, webPreferences: { preload: ROOT + '/preload.js', sandbox: false, contextIsolation: true } });
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) consoleErr.push(msg); });
  await w.loadFile(ROOT + '/src/main/main.html');
  const js = (k) => w.webContents.executeJavaScript(k).catch((e) => { log('[js error] ' + e.message); return null; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1500);

  // --- settings page
  await js("openSettingsPage('farming')");
  await wait(600);
  log('modeOptions', JSON.stringify(await js("[...document.querySelector('[data-set=cardPriorityMode]').options].map(o=>o.value+':'+o.textContent)")));
  log('thresholdRow', JSON.stringify(await js("(()=>{const e=document.querySelector('[data-set=fastMinPlaytimeMin]');return [e.value,e.min,e.max,e.closest('[data-setting-row]').innerText.replace(/\\s+/g,' ')]})()")));
  log('skipRow', JSON.stringify(await js("(()=>{const e=document.querySelector('[data-set=farmSkipUnplayed]');return [e.style.background,e.closest('[data-setting-row]').innerText.replace(/\\s+/g,' ')]})()")));
  log('finRow', JSON.stringify(await js("(()=>{const e=document.querySelector('[data-set=farmFinishedAction]');return [e.value,[...e.options].map(o=>o.value+':'+o.textContent),e.closest('[data-setting-row]').innerText.replace(/\\s+/g,' ').slice(0,60)]})()")));
  log('tips', JSON.stringify(await js("['fastMinPlaytimeMin','farmSkipUnplayed','farmFinishedAction'].map(k=>document.querySelector('[data-set='+k+']').closest('[data-setting-row]').querySelector('[data-tip]').getAttribute('data-tip').slice(0,70))")));
  // change values + save
  await js("(()=>{const e=document.querySelector('[data-set=fastMinPlaytimeMin]');e.value='0';e.dispatchEvent(new Event('change'));document.querySelector('[data-set=farmSkipUnplayed]').click();const s=document.querySelector('[data-set=farmFinishedAction]');s.value='exit';s.dispatchEvent(new Event('change'));})()");
  await js("document.getElementById('setSave').click()");
  await wait(600);
  log('savePatch', JSON.stringify(calls.filter((c) => c[0] === 'settings:save').map((c) => c[1])));

  // --- card page
  await js("document.querySelector('.nav a[data-tab=card]').click()");
  await wait(1200);
  const order = () => js("[...document.querySelectorAll('#cardQueue [data-row]')].map(r=>r.querySelector('span:nth-of-type(2)').textContent)");
  log('skipUnplayed on, default order', JSON.stringify(await order()));
  await js("document.querySelector('#modeList [data-mode=leastPlayed]').click()");
  await wait(200);
  log('leastPlayed', JSON.stringify(await order()), 'hint:', await js("document.getElementById('durNote').textContent"));
  await js("document.querySelector('#modeList [data-mode=mostPlayed]').click()");
  await wait(200);
  log('mostPlayed', JSON.stringify(await order()));
  await js("window.imu.settings.set({farmSkipUnplayed:false}).then(s=>{appSettings=s;renderCards();})");
  await wait(300);
  log('skip off, mostPlayed', JSON.stringify(await order()));
  await js("document.querySelector('#modeList [data-mode=fast]').click()");
  await wait(200);
  log('fast hint', await js("document.getElementById('durNote').textContent"));
  await js("document.getElementById('btnStart').click()");
  await wait(400);
  const startCall = calls.filter((c) => c[0] === 'engine:startFarm').pop();
  log('startFarm', JSON.stringify(startCall && { mode: startCall[1].mode, n: startCall[1].games.length }));
  log('feed (threshold 0)', JSON.stringify(await js("activityFeed.slice(0,1).map(f=>f.text)")));
  await js("window.imu.settings.set({fastMinPlaytimeMin:120}).then(s=>{appSettings=s;})");
  await js("document.getElementById('btnStart').click()");
  await wait(300);
  log('feed (threshold 120)', JSON.stringify(await js("activityFeed.slice(0,1).map(f=>f.text)")));
  log('console errors', JSON.stringify(consoleErr.filter((m) => !/Autofill|DevTools/.test(m))));
  app.exit(0);
});
