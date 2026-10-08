const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, powerSaveBlocker, Notification, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const FarmController = require('./src/core/farmController');
// steam-user takes ~0.8 s on first load, steam-session ~0.2 s (the protobuf schemas get compiled).
// When they were required at the top the window waited for this time. Now they are loaded when the first
// instance is created, and that first creation is left until after the window is on screen: creating the
// engine right away locks the main process, and the 'ready-to-show' event got stuck on that lock so the window opened late.
let SteamAuthClass = null, SteamEngineClass = null;
const steamAuthClass = () => SteamAuthClass || (SteamAuthClass = require('./src/services/steamAuth'));
const steamEngineClass = () => SteamEngineClass || (SteamEngineClass = require('./src/core/steamEngine'));
let resolveWindowOpened = null;
const windowOpened = new Promise((r) => { resolveWindowOpened = r; });
setTimeout(() => resolveWindowOpened(), 2500);   // start the connection even if the window never comes
const ledger = require('./src/core/syncLedger');
const update = require('./src/services/updater');
// The text the main process produces is in the interface language too: tray menu, file dialogs, desktop
// notifications and the error messages returned to the interface (the dictionary is shared with the interface).
const translation = require('./src/core/translation');
const { migrateKeys } = require('./src/core/keyMigration');
const ct = translation.t;
// The `error` and `hata` text in every reply returned to the interface is translated to the selected language. Instead of
// wrapping every return point one by one, it is done here: a newly added error message gets
// translated on its own (if the dictionary has an entry; otherwise it stays Turkish and `npm run lang` catches it).
{
  const realHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channelName, fn) => realHandle(channelName, async (...a) => {
    const r = await fn(...a);
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      if (typeof r.error === 'string') r.error = ct(r.error);
      if (typeof r.failure === 'string') r.failure = ct(r.failure);
    }
    return r;
  });
}
// The sale fee window is only created when a sale is made.
let steamFeeModule = null;
function steamFee() { if (!steamFeeModule) steamFeeModule = require('./src/services/steamFee'); return steamFeeModule; }

// The hwAccel setting, if it says 'turn off GPU acceleration', has to take effect BEFORE app.whenReady() -
// since the normal settings.json load (loadSettings) happens inside whenReady, we do a synchronous,
// early read here (only for this one flag).
let earlySettings = null;
try {
  // Settings are under DATA_ROOT/settings (set up below; needed here before the app is ready):
  // in the packaged version next to the exe, and AppData if it cannot be written there, and in development AppData. It used to
  // look in the 'config' folder in development; since the file was not there the graphics settings were never
  // applied in development.
  const earlyPaths = [path.join(app.getPath('userData'), 'settings', 'settings.json')];
  if (app.isPackaged) earlyPaths.unshift(path.join(path.dirname(app.getPath('exe')), 'settings', 'settings.json'));
  const earlyPath = earlyPaths.find((p) => fs.existsSync(p));
  const early = earlyPath ? migrateKeys(JSON.parse(fs.readFileSync(earlyPath, 'utf8'))) : null;
  earlySettings = early;
  if (early && early.hwAccel === false) app.disableHardwareAcceleration();

  // GRAPHICS COMPATIBILITY. All three switches have to be given BEFORE whenReady; if set
  // later Chromium does not see them. That is why Settings says "asks for a
  // restart".
  //
  // ANGLE backend: on Windows Chromium by default translates OpenGL/Vulkan calls
  // through D3D11. On some Intel and older AMD drivers this path stalls;
  // moving to D3D9 or OpenGL fixes it. Automatic = whatever Chromium picks.
  const angle = early && early.gpuBackend;
  if (angle && angle !== 'auto') app.commandLine.appendSwitch('use-angle', angle);

  // GPU compositing off: the processor composites the window's frames and the graphics card
  // is not touched at all. When running on the same desktop as a full screen game it frees the game's presentation
  // path. The cost is a few points on the processor side.
  if (early && early.gpuComposition === false) app.commandLine.appendSwitch('disable-gpu-compositing');
} catch (_) {}

// On Windows toast notifications are silently dropped without an AppUserModelID - the HTML5
// `new Notification(...)` showed nothing without giving any error. That is why the id is
// set here and notifications were moved to the Electron Notification in the main process.
const APP_ID = 'com.miabeyefendi.steamedge';
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// SINGLE INSTANCE LOCK. When a second SteamEdge was opened Steam dropped the first session of the same
// account (LogonSessionReplaced) - the engine was left disconnected, and pages like Achievements/Inventory
// opened empty with "Not connected.". Now the second instance closes right away and
// the existing window is brought to the front.
if (!app.requestSingleInstanceLock()) {
  // DO NOT EXIT SILENTLY. The previous version closed here without writing anything: the user typed `npm start`,
  // only Chromium's cache warnings showed in the console and the app ended immediately. Since the OLD
  // window stayed on screen it was not clear that the new code never ran.
  // Now the reason is written out clearly.
  console.log('\n============================================================');
  console.log(' SteamEdge is ALREADY OPEN - this second copy was closed.');
  console.log(' The open window was brought to the front; that window runs the OLD code.');
  console.log(' To see your changes CLOSE that window,');
  console.log(' then run the "npm start" command again.');
  console.log('============================================================\n');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

// Chromium's GPU/shader disk cache stays locked while another copy uses the same userData folder
// and it filled the console with "Unable to move the cache: Access is denied"
// lines. This cache is only a startup speed-up; turning it off does not affect
// how the app works, and in return the console stays clean.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

// As the Steam library grows game thumbnails pile up: on an account with 2500 games
// the cache can reach hundreds of megabytes and Chromium keeps part of it in memory.
// 50 MB is enough; when exceeded the oldest entries drop out and the image is downloaded again.
app.commandLine.appendSwitch('disk-cache-size', String(50 * 1024 * 1024));

let win = null;
// Multi-account parallel login: each (+) box on the login screen gets its own independent SteamAuth
// session (slotId -> instance). Slot "0" is always the main box; the "Panele Geç" navigation
// is triggered ONLY when slot 0 finishes successfully, the other boxes may keep working in the background.
const authSlots = new Map();
// Becomes true when we return to login.html through the "Add Account" flow - NO slot in that session
// (slot 0 included) overwrites the current active session.json.
let addingAccountMode = false;
function getAuthSlot(slotId) {
  const id = String(slotId == null ? '0' : slotId);
  if (!authSlots.has(id)) {
    const inst = new (steamAuthClass())(CONFIG_DIR, makeAuthSend(id));
    inst.addingAccount = addingAccountMode || id !== '0';
    authSlots.set(id, inst);
  }
  return authSlots.get(id);
}
function makeAuthSend(slotId) {
  return (event, data) => { if (win && !win.isDestroyed()) win.webContents.send('auth:' + event, { ...data, slotId }); };
}
let tray = null;
let isQuitting = false;
let psbId = null;

// ================== DATA FOLDERS (PORTABLE) ==================
// In the packaged version the app writes its data NEXT TO ITS OWN FOLDER, not to AppData.
// So wherever you extract the downloaded .zip, your settings and cache stay next to it:
//
//   SteamEdge/
//     SteamEdge.exe
//     settings/     settings, saved accounts, session, statistics, remembered data
//     cache/        price cache, log file, Chromium cache
//
// If it was installed in a read-only place (e.g. Program Files) the write attempt fails;
// in that case it silently falls back to AppData and the app still works.
// During development (unpackaged) AppData is always used so the repository does not get dirty.
function portableRoot() {
  if (!app.isPackaged) return null;
  const side = path.join(path.dirname(app.getPath('exe')));
  try {
    fs.mkdirSync(side, { recursive: true });
    const attemptNo = path.join(side, '.yazma-testi');
    fs.writeFileSync(attemptNo, 'x');
    fs.unlinkSync(attemptNo);
    return side;
  } catch (_) { return null; }
}
const PORTABLE_ROOT = portableRoot();
const DATA_ROOT = PORTABLE_ROOT || app.getPath('userData');
const CONFIG_DIR = path.join(DATA_ROOT, 'settings');
const CACHE_DIR = path.join(DATA_ROOT, 'cache');
try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
// Chromium's own cache is also moved under cache/; otherwise folders like
// "Cache", "GPUCache", "Local Storage" were scattered next to the exe.
try { app.setPath('userData', path.join(CACHE_DIR, 'chromium')); } catch (_) {}
try { app.setPath('sessionData', path.join(CACHE_DIR, 'chromium')); } catch (_) {}

// ---- RESILIENT JSON STORAGE ----
// In the old version every save was done with a plain fs.writeFileSync. That is not atomic: if the app is
// terminated in the middle of a write while Windows shuts down the file is left half written, JSON.parse
// blows up at startup and the settings silently return to the defaults. The first change after that
// would write the defaults over the intact file and destroy the data for good.
//
// The fix has three layers:
//   1. The write goes to a .tmp file first, is flushed to disk with fsync, then renamed.
//      rename is atomic at the file system level; a half file cannot come into being.
//   2. Before each write the existing intact file is kept as .bak.
//   3. If reading fails .bak is tried. If both are broken the file is marked "could not be read"
//      and is NOT OVERWRITTEN - the user is told. No silently destroying data.
const corruptFiles = new Set();   // files that could not be read and are therefore forbidden to write

function writeJson(fileEntry, payloadData, formatted) {
  if (corruptFiles.has(fileEntry)) {
    log('warn', 'write blocked (the file could not be read, data is being kept): ' + path.basename(fileEntry));
    return false;
  }
  const text = formatted ? JSON.stringify(payloadData, null, 2) : JSON.stringify(payloadData);
  const tmp = fileEntry + '.tmp';
  const look = fileEntry + '.bak';
  try {
    fs.mkdirSync(path.dirname(fileEntry), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, text, 'utf8');
      fs.fsyncSync(fd);              // flush the data to disk, do not leave it in the operating system cache
    } finally { fs.closeSync(fd); }
    try { if (fs.existsSync(fileEntry)) fs.copyFileSync(fileEntry, look); } catch (_) {}
    fs.renameSync(tmp, fileEntry);       // atomic replacement
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    log('warn', 'write error ' + path.basename(fileEntry) + ': ' + (e && e.message));
    return false;
  }
}

// Returns: { ok:true, veri } | { ok:true, veri, yedekten:true } | { ok:false, yok:true } | { ok:false, bozuk:true }
function readJson(fileEntry) {
  const attempt = (p) => {
    const rawText = fs.readFileSync(p, 'utf8');
    if (!rawText.trim()) throw new Error('bos dosya');
    return migrateKeys(JSON.parse(rawText));
  };
  try { return { ok: true, dataBlock: attempt(fileEntry) }; }
  catch (e1) {
    if (e1 && e1.code === 'ENOENT') return { ok: false, none: true };
    log('warn', path.basename(fileEntry) + ' could not be read (' + (e1 && e1.message) + '), trying the backup');
    try {
      const payloadData = attempt(fileEntry + '.bak');
      log('info', path.basename(fileEntry) + ' recovered from the backup');
      return { ok: true, dataBlock: payloadData, fromBackup: true };
    } catch (_) {
      // Do not delete the broken file, set it aside so it can be inspected, and forbid writing over it
      try { fs.copyFileSync(fileEntry, fileEntry + '.bozuk'); } catch (_) {}
      corruptFiles.add(fileEntry);
      log('warn', path.basename(fileEntry) + ' COULD NOT BE RECOVERED, it will not be overwritten');
      return { ok: false, corrupt: true };
    }
  }
}

// Files that could not be read at startup are collected here and shown to the user when the window is ready.
const readErrors = [];

// ---- persistent app settings ----
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const DEFAULT_SETTINGS = {
  // General
  autoLaunch: false,        // start with Windows
  closeToTray: false,       // minimise to the system tray on close
  preventSleep: false,      // prevent sleep while the app is open
  language: 'tr',
  // Card farming
  cardPriorityMode: 'sequential',
  cardMaxGames: 32,         // games open at once in fast mode (Steam's known upper limit is 32)
  notifyCardDrop: false,    // desktop notification as cards drop (Kart Düşür > Otomasyon)
  // Kart Düşür > Otomasyon. All three really work; two affect the account permanently so
  // the default is OFF and the sale flow follows the "Satış öncesi onay iste" setting.
  farmAutoSell: false,      // puts the dropped card on sale at the median price
  farmSilent: false,        // stops interface refreshes while the window is not visible
  farmAchUnlock: false,     // unlocks locked achievements at intervals during farming
  // Sale (inside Inventory - the separate Market tab was removed)
  saleMode: 'median',       // median | lowest
  confirmBeforeSell: true,  // ask for confirmation before selling
  // Sale batches. Steam limits listing by the age and trustworthiness of the account:
  // a new account can be stopped after 10-15 listings, an old account can list 80+ at once.
  bulkSellLimit: 50,        // batch size (0 = do not split, list until Steam stops it)
  sellBatchWaitMin: 0,      // wait between batches (min); 0 = ask when each batch is done
  priceDropThreshold: 10,   // warn if the lowest listing is this percent below the 24 hour average
  priceRefreshHours: 24,    // how many hours until the price cache goes stale
  historyRefreshHours: 72,  // how many hours until the sale history (average) cache goes stale
  // Should the average be fetched in the same round while an item's lowest price is fetched.
  // On: two requests per item, but no second round is waited for the average.
  fetchAvgWithPrice: true,
  // Hour Booster
  boostMaxGames: 32,
  rememberBoostList: true,
  pauseFarmOnBoost: false,  // automatically stop Kart Düşür when boosting starts
  // Achievements
  achConfirmSingle: true,   // ask for confirmation on a single unlock/lock (confirmation is ALWAYS asked for bulk operations)
  // Notifications
  notifications: true,      // master (the renderer reads it)
  notifyFarm: true,
  notifyBoost: true,
  notifyError: true,
  notifyAch: true,
  quietHoursEnabled: false, // show no notification at all in this range
  quietFrom: '23:00',
  quietTo: '08:00',
  // Privacy & Security
  offlineMode: false,       // appear "Offline" on Steam - friends cannot see what you are playing
  // Advanced & Data
  apiRequestDelayMs: 350,   // wait per price request (Steam's limit - lowering it raises the 429 risk)
  hwAccel: true,            // GPU hardware acceleration - turning it off asks for a restart
  lightMode: true,           // stop drawing and animations when the window is not focused
  gpuBackend: 'auto',        // ANGLE backend: auto | d3d11 | d3d9 | gl (asks for a restart)
  gpuComposition: true,     // false = let the processor composite the window (reduces clashes with a game)

  // ---- The rest of the fields on the Settings screen ----
  // All are written/read persistently. Those marked (*) are NOT tied to a behaviour YET -
  // either there is no real infrastructure (telemetry server, updater, logger) or Steam does not
  // provide the data (order book). Marked so we do not present anything made up as if it worked.
  // The currency key was REMOVED. There is no currency choice: amounts are fetched in the account's Steam MARKET currency
  // and shown exactly in that currency (steamEngine.detectMarketCurrency).
  dataRetentionDays: 90,    // how many days the remembered data (selected games, achievement log) is kept (0 = forever)
  // Steam chat - to be able to see/reply to messages that arrive while running headless
  notifyChat: true,         // desktop notification when a message arrives
  chatAutoReply: false,     // send an automatic reply
  chatReplyText: 'Şu an bilgisayarımın başında değilim, en kısa sürede döneceğim.',
  chatReplyCooldown: 60,    // an automatic reply to the same person at most once in this many minutes
  startPage: 'overview',
  theme: 'dark',            // dark | midnight | white (see src/main/js/theme.js)
  density: 'comfortable',   // (*)
  timeFormat: '24',
  sidebarCollapsed: false,
  queueSort: 'default',
  // minRemainCards was REMOVED - there is no card threshold any more, every game with cards left joins the queue
  farmMaxMinutes: 5,     // upper time per game (min) - fast mode overrides this with its own rhythm
  // Fast mode: Steam starts dropping cards once a game passes 2 hours. Those below are first
  // run in parallel and pulled to the threshold, then the featured game changes at this interval.
  fastMinPlaytimeMin: 120,
  fastRotateMinSec: 90,
  fastRotateMaxSec: 120,
  autoNextGame: true,
  // If the connection drops: 'unlimited' | '10' | '3' | 'off'. "Automatic reconnect"
  // and "retry" used to be two separate settings and both only affected the first logon.
  reconnectPolicy: 'unlimited',
  // feeMode was REMOVED: list prices are always the amount on the Steam market.
  // The amount you will get after commission is shown as a separate line in the sale flow.
  priceRefreshMin: 15,      // interval at which prices are refreshed in the background while Inventory is open
  bookDepth: 5,             // how many levels in the order book in the detail panel
  undercutCents: 1,
  autoRefreshPrices: false,
  hideAfterSell: true,
  invDefaultSort: 'value',
  dblAction: 'steam',       // double click behaviour in the inventory (inventory.js reads it)
  invLowValue: 1,
  hideUnsellable: false,
  groupByGame: false,       // the inventory "Grupla" button opens pressed
  compactRows: false,
  boostTarget: '2',
  boostStagger: 5,          // in simultaneous boosting the games are opened one after another at this interval (s)
  shuffleBoost: false,      // only in sequential idling: the game order is shuffled every round
  // The Behaviour/Privacy switches on the Hour Booster page and the preset
  // Hour sync - brings the total times of the selected games to the same point (default OFF)
  boostSync: false,
  boostSyncMode: 'highest',     // highest | manual | library
  boostSyncTargetHours: 100,    // target hours when 'manual' is selected
  boostSyncLibraryMaxMin: 0,    // the library's highest time last computed for 'library' (min)
  // parallel = all together, the one that reaches the target drops off the list (fast, default)
  // staged   = step by step, keeps the games level along the way (slow)
  boostSyncStrategy: 'parallel',
  boostAutoRestart: false,  // restart the session on its own when the time is up
  seqIdle: false,           // sequential idling (off = all simultaneous)
  loopQueue: true,          // in sequential mode start over when the queue ends
  boostDurationSec: 3600,
  boostGameIds: [],         // the selected games when "Oyun listesini hatırla" is on
  // Achievement unlock interval (SECONDS). 1 = fastest; the real wait is computed with a random
  // deviation on every unlock, so no fixed rhythm forms (achievements.js > acNextDelayMs).
  // Realistic Mode (G11: the page was renewed according to the template)
  grDurationSec: 7200,      // session duration (2 hours)
  grTargetAuto: true,       // let the app pick the target achievement count
  grTarget: 0,              // manual target (0 = all)
  grCR: '2.0',              // game length multiplier ('auto' = manual Tc)
  grDiff: '1.2',            // multiplier for the difficulty of the achievements left
  grTc: '',                 // 100% time (hours) - the old single-field value, for backwards
  grTcGame: {},             // appid -> 100% completion time (hours). Per game, entered by hand
  grModel: 'linear',        // distribution model: linear | exp | pareto
  grAuto: true,             // start the queue automatically (move on to the next game in the queue)
  grRandomGap: true,        // random deviation in unlock intervals
  grSkipUltraRare: false,   // skip achievements under 5%
  grKeepHours: true,        // when the achievements are done collect hours until the end of the time
  grCatchUp: true,          // squeeze the overdue achievement backlog into the start of the session
  grAutoDuration: true,          // assign the duration on its own according to the settings (left alone if typed by hand)
  grSpeed: 1,                 // speed multiplier: compresses/stretches the whole schedule
  grUltraMultiplier: 3,         // achievements under 5% wait this many times longer
  grCatchUpShare: 20,          // in what first percent of the time the ones left behind are unlocked
  grFinishedRatio: 50,          // if the game is finished the schedule drops to this ratio (percent)
  grShowNoAch: false,       // games without achievements show up in the game list
  grLevel: 'simple',        // right panel: simple | advanced
  achDelay: '1',
  achOrder: 'default',
  achSafeMode: true,
  achSpread: false,
  notifyPriceDrop: false,   // when an item in the inventory drops below the 24 hour average by the threshold
  notifSound: 'chime',      // 20 tones, produced with Web Audio (common.js > NOTIF_SOUNDS)
  sessionTimeout: 'never',  // idle time (min), does not apply while a job runs - 'never' = off
  hideGameName: false,      // become invisible while playing (so the game name does not show on the profile)
  logLevel: 'error',        // log file: off | error | warn | info | debug
  settingsVersion: 2,            // format of the settings file; migrations are in migrateSettings
};
let settings = { ...DEFAULT_SETTINGS };

// ---- levelled logging (Settings > Gelişmiş > "Kayıt dosyası") ----
// A single choice: off / errors / warnings / events / verbose. The level and "write to file"
// used to be two separate settings: when a level was chosen and the file stayed off nothing was recorded.
const LOG_FILE = path.join(CACHE_DIR, 'steamedge.log');   // the log file is on the cache side
const LOG_RANK = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, msg) {
  const levelNum = settings.logLevel;
  const want = LOG_RANK[levelNum] != null ? LOG_RANK[levelNum] : 0;
  if ((LOG_RANK[level] != null ? LOG_RANK[level] : 0) > want) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
  if (levelNum === 'off') return;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    // rotate when it goes over 2 MB (a single backup) - so the disk does not bloat
    try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch (_) {}
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}
// NOTE: Currency conversion was REMOVED ENTIRELY. Amounts are fetched from the Steam Community Market
// in the account's own market currency and shown exactly in that currency. Conversion caused the number
// the user saw on Steam and the number seen in the app to differ.

ipcMain.handle('log:write', (_e, { level, msg }) => { log(level || 'info', '[ui] ' + msg); return true; });
// Says so if the log file does not exist yet (logging off or no event written); the
// button used to silently do nothing.
ipcMain.handle('log:open', async () => {
  if (!fs.existsSync(LOG_FILE)) return { ok: false, error: 'Kayıt dosyası henüz oluşmadı.' };
  const errorInfo = await shell.openPath(LOG_FILE);
  return errorInfo ? { ok: false, error: errorInfo } : { ok: true };
});

// Desktop notification - sent from the main process instead of the HTML5 Notification in the renderer.
// The result returns to the renderer so the "Test bildirimi" button can really say what happened.
const NOTIF_ICON = path.join(__dirname, 'src', 'assets', 'icon.png');
ipcMain.handle('notify:show', (_e, { title, body }) => {
  if (!Notification.isSupported()) {
    log('warn', 'notifications not supported (isSupported=false)');
    return { ok: false, error: 'İşletim sistemi bildirimleri desteklemiyor.' };
  }
  try {
    const n = new Notification({
      title: title || 'SteamEdge',
      body: body || '',
      icon: fs.existsSync(NOTIF_ICON) ? NOTIF_ICON : undefined,
      silent: true,   // we play the sound ourselves (the tone chosen in the settings)
    });
    n.on('click', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
    n.show();
    log('debug', 'notification sent: ' + (title || ''));
    return { ok: true };
  } catch (e) {
    log('warn', 'notification error: ' + (e && e.message));
    return { ok: false, error: (e && e.message) || 'bilinmeyen hata' };
  }
});
// ---- SETTINGS MIGRATIONS ----
// Removed and merged settings are carried over from the old file to here: the user's old choice
// is not lost, and no dead key is left in the file. ayarSurumu is raised once.
const REMOVED_SETTINGS = ['autoReconnect', 'farmRetry', 'twoStepSell', 'autoStopBoost', 'dontAsk_achSingle', 'debugLogs'];
function migrateSettings(v) {
  if (!v || typeof v !== 'object') return false;
  let hasChanged = false;
  if ((+v.settingsVersion || 1) < 2) {
    // "Automatic reconnect" + "retry" became a single choice. Reconnecting while running was
    // already unlimited; if it was turned off it stays off.
    if (v.autoReconnect === false) v.reconnectPolicy = 'off';
    // "Do not ask again" and "ask for confirmation on a single operation" kept the same thing in two keys.
    if (v.dontAsk_achSingle === true) v.achConfirmSingle = false;
    // The old default was 10; Steam's known limit is 32 (the user can still lower it).
    if (+v.cardMaxGames === 10) v.cardMaxGames = 32;
    // Old values that have no counterpart in the choice list: the box looked empty.
    if (v.dblAction === 'open') v.dblAction = 'steam';
    if (v.saleMode === 'lowest') v.saleMode = 'match';
    // "Hata ayıklama kayıtlarını tut" was removed: the chosen level is now also written to the file.
    v.settingsVersion = 2;
    hasChanged = true;
  }
  // Values renamed from Turkish: 'sinirsiz' -> 'unlimited', 'kapali' -> 'off'.
  if (v.reconnectPolicy === 'sinirsiz') { v.reconnectPolicy = 'unlimited'; hasChanged = true; }
  if (v.reconnectPolicy === 'kapali') { v.reconnectPolicy = 'off'; hasChanged = true; }
  REMOVED_SETTINGS.forEach((k) => { if (k in v) { delete v[k]; hasChanged = true; } });
  return hasChanged;
}
// The moment the settings were last saved by the user (Ayarlar > Yapılandırma > Son kayıt).
let settingSaveTime = null;
function loadSettings() {
  const r = readJson(SETTINGS_FILE);
  if (r.ok) {
    const rawText = { ...r.dataBlock };
    const hasPassed = migrateSettings(rawText);
    settings = { ...DEFAULT_SETTINGS, ...rawText };
    if (r.fromBackup) readErrors.push({ displayName: 'Ayarlar', recoveredFlag: true });
    if (hasPassed) saveSettings();
    try { settingSaveTime = fs.statSync(SETTINGS_FILE).mtimeMs; } catch (_) {}
  } else {
    settings = { ...DEFAULT_SETTINGS };
    // yok = first run, normal. bozuk = a real problem, tell the user.
    if (r.corrupt) readErrors.push({ displayName: 'Ayarlar', recoveredFlag: false });
  }
  translation.pickLang(settings.language);
}
// Returns false if it fails: if the file could not be read (broken) writing is deliberately blocked and "Kaydet"
// must tell the user so, not say "saved".
function saveSettings() { return writeJson(SETTINGS_FILE, settings, true); }
// "Uyku modunu engelle": only while a job runs on an account. Previously when the setting was on the
// computer never slept even if the app was doing nothing.
function updateSleepBlocker() {
  let runningItem = false;
  accounts.forEach((s) => { if (accountRunning(s)) runningItem = true; });
  const iste = !!settings.preventSleep && runningItem;
  try {
    if (iste && psbId === null) psbId = powerSaveBlocker.start('prevent-app-suspension');
    else if (!iste && psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
  } catch (_) {}
}
// "Bağlantı koparsa yeniden bağlan". null = unlimited, 0 = off, n = at most n attempts.
function reconnectLimit() {
  const v = settings.reconnectPolicy;
  if (v === 'off') return 0;
  const n = parseInt(v, 10);
  return n > 0 ? n : null;
}
function applySettings() {
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autoLaunch }); } catch (_) {}
  updateSleepBlocker();
  // The reconnect limit to all engines. If an engine has run out of attempts and given up
  // and the new setting allows it, the attempts start over.
  const bound = reconnectLimit();
  accounts.forEach((s) => {
    if (!s.engine) return;
    s.engine.reconnectLimit = bound;
    if (s.engine.gaveUp && !s.engine.permanentDisconnect && bound !== 0) s.engine.tryReconnect();
  });
  // Appear offline / hide the game name - applied instantly while connected. To ALL connected accounts:
  // it used to apply only to the account on screen, a background account stayed visible.
  accounts.forEach((s) => { try { if (s.ready && s.engine) s.engine.applyPrivacy(settings.offlineMode, settings.hideGameName); } catch (_) {} });
  // Chat auto reply - applied to ALL connected accounts
  accounts.forEach((s) => { if (s.engine) applyChatSettings(s.engine); });
  if (typeof armIdleTimer === 'function') armIdleTimer();
}

// Notifications sent from the main process also follow the same rule as the interface: the master switch, the type's own
// switch and quiet hours. The chat notification used to look only at its own switch.
function isQuietHour() {
  if (!settings.quietHoursEnabled) return false;
  const [fh, fm] = String(settings.quietFrom || '23:00').split(':').map(Number);
  const [th, tm] = String(settings.quietTo || '08:00').split(':').map(Number);
  const d = new Date(), cur = d.getHours() * 60 + d.getMinutes();
  const f = fh * 60 + (fm || 0), t = th * 60 + (tm || 0);
  return f <= t ? (cur >= f && cur < t) : (cur >= f || cur < t);
}

// The automatic reply only kicks in when `chatAutoReply` is on and the text is filled;
// the same person is not written to a second time within `chatReplyCooldown` minutes (to avoid spam).
// If the default reply text was not changed it goes in the interface language; previously a Turkish
// text was sent to friends in every language. The user's own text is left alone.
function applyChatSettings(eng) {
  try {
    const text = settings.chatReplyText === DEFAULT_SETTINGS.chatReplyText ? ct(DEFAULT_SETTINGS.chatReplyText) : settings.chatReplyText;
    eng.setAutoReply(settings.chatAutoReply ? text : null, settings.chatReplyCooldown);
  } catch (_) {}
}

function ensureTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'icon.png'));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip('SteamEdge');
    setupTrayMenu();
    tray.on('click', () => { if (win) { win.isVisible() ? win.hide() : (win.show(), win.focus()); } });
  } catch (_) {}
}
// When the language changes the menu is rebuilt; it used to say "Göster / Çıkış" in every language.
function setupTrayMenu() {
  if (!tray) return;
  try {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: ct('Pencereyi göster'), click: () => { if (win) { win.show(); win.focus(); } } },
      { type: 'separator' },
      // the "Çıkış" key is translated in the sense of "sign out" in the navigation; this one closes the app.
      { label: ct("SteamEdge'i kapat"), click: () => { isQuitting = true; app.quit(); } },
    ]));
  } catch (_) {}
}

function send(event, data) {
  if (win && !win.isDestroyed()) win.webContents.send('auth:' + event, data);
}
function sendRaw(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// Safety net: some paths in steam-user throw asynchronously and if not caught the
// whole app crashes. Swallow it, log it, keep running.
//
// This trap once turned EVERYTHING it caught into a maFile notification: an error anywhere in the
// main process landed on the user's screen as "maFile atlandi: <raw error text>",
// even while a game was being played. The maFile feature was removed in 1.1.9; the rule that remains is
// one line: the user is NOT SHOWN a raw JavaScript error, the error goes to the log file.
// The log is kept independent of the debug setting; otherwise when someone says "an error showed up on screen"
// there is nothing to look at.

function writeCrash(category, e) {
  const rowEl = `[${new Date().toISOString()}] CRASH ${category} ${(e && e.stack) || (e && e.message) || e}`;
  console.error(rowEl);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch (_) {}
    fs.appendFileSync(LOG_FILE, rowEl + '\n');
  } catch (_) {}
}

process.on('uncaughtException', (e) => { writeCrash('uncaughtException', e); });
process.on('unhandledRejection', (e) => { writeCrash('unhandledRejection', e); });

function hasSession() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'session.json'), 'utf8'));
    return s && s.refreshToken ? s : null;
  } catch (_) { return null; }
}

// ---- multi-account store (accounts.json) - session.json always reflects the "active" account ----
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
function loadAccounts() {
  const r = readJson(ACCOUNTS_FILE);
  if (r.ok) {
    if (r.fromBackup) readErrors.push({ displayName: 'Kayitli hesaplar', recoveredFlag: true });
    return Array.isArray(r.dataBlock) ? r.dataBlock : [];
  }
  if (r.corrupt) readErrors.push({ displayName: 'Kayitli hesaplar', recoveredFlag: false });
  return [];
}
function saveAccounts(list) { writeJson(ACCOUNTS_FILE, list, true); }
// Makes this account the active session (session.json) and resets the engine - the next engine:connect
// reconnects with this account's refreshToken. The renderer, the caller will reload.
// session.json = "which account shows at app startup". It does NOT reset the engine - since accounts
// work independently of each other switching does not affect the others.
function makeActiveSession(entry) {
  writeJson(path.join(CONFIG_DIR, 'session.json'), {
    accountName: entry.accountName, steamID: entry.steamID, refreshToken: entry.refreshToken,
  }, true);
}

// Fixed startup size - the same for login and the panel (3:2 ratio). Every place that centres/resizes the window
// (logout, moving to the dashboard, deleting an account, deleting data) uses these constants so it
// changes from a single place.
const WIN_W = 1716;
const WIN_H = 1144;
// Centres the window on screen and makes it WIN_W x WIN_H. If the screen is small it fits it to the work area.
function centerDefaultSize() {
  if (!win) return;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(WIN_W, workAreaSize.width - 24);
  const height = Math.min(WIN_H, workAreaSize.height - 24);
  win.setBounds({ width, height, x: Math.round((workAreaSize.width - width) / 2), y: Math.round((workAreaSize.height - height) / 2) });
}

function createWindow() {
  const sess = hasSession();               // saved refresh token → auto-login straight to dashboard
  const size = sess
    ? { w: WIN_W, h: WIN_H, minW: 1120, minH: 700 }
    : { w: WIN_W, h: WIN_H, minW: 900, minH: 700 };

  win = new BrowserWindow({
    width: size.w, height: size.h, minWidth: size.minW, minHeight: size.minH,
    frame: false, backgroundColor: '#0f1720', show: false,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });

  win.loadFile(path.join(__dirname, ...(sess ? ['src', 'main', 'main.html'] : ['src', 'login', 'login.html'])));
  // After the window shows, wait one frame and then allow the engine to be set up (see windowOpened).
  win.once('ready-to-show', () => { win.center(); win.show(); setTimeout(() => resolveWindowOpened(), 50); });
  win.on('close', (e) => {
    if (!isQuitting && settings.closeToTray) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
}

// window controls
ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => win && win.close());
ipcMain.on('win:fit', (_e, h) => {
  if (!win || win.isMaximized()) return;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = win.getBounds().width;
  const height = Math.min(Math.ceil(h), workAreaSize.height - 24);
  win.setBounds({ x: Math.round((workAreaSize.width - width) / 2), y: Math.round((workAreaSize.height - height) / 2), width, height });
});
// Widens the window as (+) adds a new account box on the login screen (so they fit side by side).
ipcMain.on('win:setWidth', (_e, w) => {
  if (!win || win.isMaximized()) return;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(Math.ceil(w), workAreaSize.width - 24);
  const height = win.getBounds().height;
  win.setBounds({ x: Math.round((workAreaSize.width - width) / 2), y: Math.round((workAreaSize.height - height) / 2), width, height });
});

// auth - every call carries {slotId, ...}; each (+) box in login.html uses its own independent
// SteamAuth instance (see getAuthSlot).
// The login screen wants the QR as soon as it opens; so that loading steam-session does not hold the window,
// requests are handled after the window shows (order is kept: they all wait on the same promise).
ipcMain.on('auth:startQR', (_e, { slotId } = {}) => windowOpened.then(() => getAuthSlot(slotId).startQR()));
ipcMain.on('auth:startCredentials', (_e, { slotId, accountName, password }) => windowOpened.then(() => getAuthSlot(slotId).startCredentials(accountName, password)));
ipcMain.on('auth:submitGuard', (_e, { slotId, code }) => windowOpened.then(() => getAuthSlot(slotId).submitGuard(code)));
ipcMain.on('auth:cancel', (_e, { slotId } = {}) => windowOpened.then(() => getAuthSlot(slotId).cancel()));
ipcMain.on('auth:loginCookie', (_e, { slotId, sessionid, steamLoginSecure, steamparental }) => windowOpened.then(() => getAuthSlot(slotId).loginCookie(sessionid, steamLoginSecure, steamparental)));

// logout: clear saved session, back to login
ipcMain.on('auth:logout', () => {
  // "Tüm hesaplardan çık" - all of them close, including the ones running in the background
  disconnectAll();
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'web-session.json')); } catch (_) {}
  authSlots.clear(); addingAccountMode = false;
  if (!win) return;
  win.setMinimumSize(900, 700);
  centerDefaultSize();
  win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
});

// login -> dashboard (login.html calls this only when slot 0 finishes successfully)
ipcMain.on('go:dashboard', () => {
  if (!win) return;
  authSlots.clear(); addingAccountMode = false; // if the "Add Account" flow is over reset the flag
  win.setMinimumSize(900, 640);
  centerDefaultSize();
  win.loadFile(path.join(__dirname, 'src', 'main', 'main.html'));
});

// ---- multi-account management (the top bar account switcher in place of the removed profile on the left bar) ----
// Lists the saved accounts (the refreshToken is not leaked - only the main process uses it).
// If the active session is not in accounts.json (e.g. an old session.json logged in BEFORE the multi-account
// feature) it adds it here on its own - otherwise the account you logged in with would not show in the list.
ipcMain.handle('accounts:list', () => {
  const sess = hasSession();
  let list = loadAccounts();
  if (sess && !list.some((a) => a.steamID === sess.steamID)) {
    list = [...list, { accountName: sess.accountName, steamID: sess.steamID, refreshToken: sess.refreshToken, addedAt: Date.now() }];
    saveAccounts(list);
  }
  if (!activeSteamID && sess) { activeSteamID = sess.steamID; accountDataMigration(); }
  return list.map((a) => {
    const s = accounts.get(a.steamID);
    return {
      steamID: a.steamID,
      accountName: a.accountName,
      active: a.steamID === activeSteamID,        // the one shown in the interface
      connected: !!(s && s.ready),                // the Steam session is open
      running: accountRunning(s),                            // card/hour/realistic is running
    };
  });
});

// Switch account: NO RELOAD. Only the account the interface shows changes; the previous
// account's card farming/hour boosting job keeps running without interruption in the background.
ipcMain.handle('accounts:switch', async (_e, steamID) => {
  const entry = loadAccounts().find((a) => a.steamID === steamID);
  if (!entry) return { ok: false, error: 'Hesap bulunamadı.' };
  activeSteamID = steamID;
  // session.json always reflects the account "open in the interface" (that one opens on restart)
  makeActiveSession(entry);
  const r = await connectAccount(entry);
  syncActive();
  if (!r.ok) return r;
  // The renderer should see the LIVE state of all the jobs of the account it switched to right away; the
  // previous account's running job must not hang on screen.
  sendJobStatus(steamID);
  sendRaw('stats:changed', statsView(steamID));
  return { ok: true, persona: r.persona, steamID, softSwitch: true };
});

// Connects all saved accounts in the background (for parallel idling).
ipcMain.handle('accounts:connectAll', async () => {
  const list = loadAccounts();
  const out = [];
  for (const a of list) {
    const r = await connectAccount(a);
    out.push({ steamID: a.steamID, accountName: a.accountName, ok: r.ok, error: r.error });
  }
  syncActive();
  return out;
});

// Closes a given account's session (does not delete it from the list).
ipcMain.handle('accounts:disconnect', (_e, steamID) => {
  const s = accounts.get(steamID);
  if (!s) return { ok: false, error: 'Hesap bağlı değil.' };
  stopAccountJobs(s, steamID);
  try { if (s.engine) s.engine.logOff(); } catch (_) {}
  accounts.delete(steamID);
  syncActive();
  return { ok: true };
});
// Deletes a saved account from the list. If the active account was deleted: if there is another account it switches to it, if not
// it closes the session completely and returns to the login screen.
ipcMain.handle('accounts:remove', async (_e, steamID) => {
  const list = loadAccounts();
  const idx = list.findIndex((a) => a.steamID === steamID);
  if (idx < 0) return { ok: false, error: 'Hesap bulunamadı.' };
  const wasActive = steamID === activeSteamID;
  // Jobs stop first: stopping writes statistics and the feed, if it wrote AFTER the data was deleted
  // the file would come into being again.
  const s = accounts.get(steamID);
  if (s) {
    stopAccountJobs(s, steamID);
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
    accounts.delete(steamID);
  }
  const bek = pendingWrite.get(steamID);
  if (bek) { clearTimeout(bek); pendingWrite.delete(steamID); }
  // The account's own data should go too, otherwise when the same account is added again the old
  // queue/statistics come back and the user thinks they deleted it.
  accountDataAll.delete(steamID);
  ['', '.bak', '.bozuk', '.tmp'].forEach((extra) => {
    try { fs.unlinkSync(accountFile(steamID) + extra); } catch (_) {}
  });
  list.splice(idx, 1);
  saveAccounts(list);
  if (!wasActive) { syncActive(); return { ok: true, softSwitch: true }; }
  if (list.length) {
    activeSteamID = list[0].steamID;
    makeActiveSession(list[0]);
    await connectAccount(list[0]);
    syncActive();
    return { ok: true, softSwitch: true };
  }
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
  if (win) {
    win.setMinimumSize(900, 700);
    centerDefaultSize();
    win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
  }
  return { ok: true, loggedOut: true };
});
// "Add Account": goes to the login screen but does NOT CHANGE the active session - the new account is only added to the
// list, the user stays on the current account (the steamAuth.addingAccount flag).
ipcMain.on('accounts:startAdd', () => {
  if (!win) return;
  addingAccountMode = true; authSlots.clear();
  win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
});

// ================= MULTI-ACCOUNT ENGINE =================
// Every Steam account gets ITS OWN SteamEngine + FarmController instances and they work
// independently of each other: switching to B while A is farming cards does not stop A. The "active account" only decides
// which account's data the interface shows.
//
// For backwards compatibility the `engine`/`engineReady`/`farm`/`farmHours` variables point to the ACTIVE account's
// objects (updated with syncActive below), so the existing IPC
// handlers keep working as they are.
const accounts = new Map();      // steamID -> { engine, farm, farmHours, ready, accountName }
let activeSteamID = null;
let engine = null;
let engineReady = false;
let farm = null;
let farmHours = null;

function slotOf(steamID) {
  if (!accounts.has(steamID)) {
    accounts.set(steamID, {
      engine: null, farm: null, hoursFarm: null, ready: false, accountName: null,
      lastOne: {},             // channel -> last state; resent to the interface when the account changes
      boost: null,         // simultaneous hour boosting and sync
      realistic: null,      // Realistic Mode
      watcher: null,      // card drop watcher
      statHour: null,      // run time counter
      pendingFarm: null,  // card farming paused for the duration of hour boosting
    });
  }
  return accounts.get(steamID);
}

// ================== PER-ACCOUNT JOBS ==================
// Card farming, hour boosting, sync and Realistic Mode used to be tied to the engine of the account open on screen
// (the module level `engine`). The timers used the same variable too: if you switched to B
// while hour boosting was running on account A, when the time was up B's games
// were closed and A stayed open forever. Statistics were also counted from the interface, only
// for the account on screen. Now every job lives in its own account's slot.
const JOB_CHANNELS = ['farm:tick', 'boost:tick', 'hoursFarm:tick', 'boost:sync', 'realistic:tick'];
const EMPTY_STATE = {
  'farm:tick': { running: false }, 'boost:tick': { running: false }, 'hoursFarm:tick': { running: false },
  'boost:sync': { running: false }, 'realistic:tick': { runningFlag: false },
};
function accountName(steamID) {
  const s = accounts.get(steamID);
  return (s && s.accountName) || String(steamID || '');
}
function accountBoostRunning(s) {
  return !!(s && ((s.boost && s.boost.runningFlag) || (s.hoursFarm && s.hoursFarm.running)));
}
function accountRunning(s) {
  return !!(s && ((s.farm && s.farm.running) || accountBoostRunning(s) || s.realistic));
}
// A job event of an account. Only those of the account open on screen go to the interface; all are kept.
function accountBroadcast(steamID) {
  return (channelName, payloadData) => {
    const s = accounts.get(steamID);
    if (s) s.lastOne[channelName] = payloadData;
    if (steamID === activeSteamID) sendRaw(channelName, { ...payloadData, steamID });
    if (s) {
      const isRunning = accountRunning(s);
      if (isRunning !== s.lastRun) {
        s.lastRun = isRunning;
        sendRaw('accounts:activity', { steamID, running: isRunning });
        updateSleepBlocker();
        handleUninterruptedRun(steamID, isRunning);
      }
      updateStatsHour(steamID);
    }
  };
}
// When the account changes that account's LIVE state is sent to the interface. Stopped jobs go with an empty state;
// one-time flags like "finished" are not sent again, otherwise notifications would repeat.
function sendJobStatus(steamID) {
  const s = accounts.get(steamID);
  JOB_CHANNELS.forEach((k) => {
    const d = s && s.lastOne[k];
    const isRunning = d && (d.running || d.runningFlag);
    sendRaw(k, isRunning ? { ...d, steamID } : { ...EMPTY_STATE[k], steamID });
  });
}
// Events that belong to the user (card dropped, cards finished, achievement unlocked...). The interface
// shows the notification (quiet hours, sound and setting gates are there). The event of a background account is
// also written to that account's own activity feed; when you switch to the account the history is not missing.
function accountEvent(steamID, evt) {
  sendRaw('account:event', { steamID, accountRef: accountName(steamID), activeIds: steamID === activeSteamID, ...evt });
  if (steamID !== activeSteamID && evt.feedEntry) addFeed(steamID, evt.feedEntry);
}
const ACTIVITY_KEY = 'activityFeed';
function addFeed(steamID, record) {
  const v = accountData(steamID);
  const e = v.entries[ACTIVITY_KEY];
  const listing = (e && Array.isArray(e.v)) ? e.v : [];
  listing.unshift({ ...record, ts: Date.now() });
  if (listing.length > 30) listing.length = 30;
  v.entries[ACTIVITY_KEY] = { v: listing, ts: Date.now() };
  writeAccountDataDelayed(steamID);
}

// ---- Statistics (per account) ----
// Cards dropped day by day for "En Verimli Gün". Local date: the user's day, not by UTC.
function dayKey(t) {
  const d = new Date(t || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDailyCard(steamID, count) {
  const st = accountStats(steamID);
  if (!st.dailyCards || typeof st.dailyCards !== 'object') st.dailyCards = {};
  const day = dayKey();
  st.dailyCards[day] = (st.dailyCards[day] || 0) + count;
  const days = Object.keys(st.dailyCards).sort();
  while (days.length > 400) delete st.dailyCards[days.shift()];
}
// "Kesintisiz Çalışma": the longest time a job (card, hour, Realistic Mode) on an account ran without a
// break. Pauses shorter than a minute do not count as a break (like the job being paused a few
// seconds when a setting is saved, or a short connection drop).
function handleUninterruptedRun(steamID, isRunning) {
  const s = accounts.get(steamID);
  if (!s) return;
  const currentTime = Date.now();
  if (isRunning) {
    if (!s.uninterruptedStart || (s.uninterruptedEnd && currentTime - s.uninterruptedEnd > 60000)) s.uninterruptedStart = currentTime;
    s.uninterruptedEnd = null;
    return;
  }
  if (!s.uninterruptedStart || s.uninterruptedEnd) return;
  s.uninterruptedEnd = currentTime;
  const st = accountStats(steamID);
  const duration = currentTime - s.uninterruptedStart;
  if (duration > (+st.longestRunMs || 0)) { st.longestRunMs = duration; writeAccountDataDelayed(steamID); }
}
function accountStats(steamID) {
  const v = accountData(steamID);
  if (!v.stats) v.stats = { ...DEFAULT_STATS, since: Date.now() };
  return v.stats;
}
function addStat(steamID, patch) {
  if (!steamID) return;
  const st = accountStats(steamID);
  Object.keys(patch || {}).forEach((k) => {
    if (typeof st[k] !== 'number') st[k] = 0;
    st[k] += (+patch[k] || 0);
  });
  writeAccountDataDelayed(steamID);
  if (steamID === activeSteamID) sendRaw('stats:changed', statsView(steamID));
}
// Run time counter. Card farming time is `totalRuntimeMs`, hour boosting (simultaneous or
// sequential) is `boostRuntimeMs`. Hour boosting time used to be written only when Stop was pressed BY
// HAND: a job that ended on its own when the time was up or the job of a background account was never
// counted. It does not count while the connection is down; Steam does not count that time either.
function statsHour(steamID) {
  const s = accounts.get(steamID);
  if (!s) return;
  const currentTime = Date.now();
  const dt = s.statLast ? currentTime - s.statLast : 0;
  s.statLast = currentTime;
  const patch = {};
  if (dt > 0 && dt < 10 * 60000 && s.statReady) {
    if (s.statFarm) patch.totalRuntimeMs = dt;
    if (s.statBoost) patch.boostRuntimeMs = dt;
  }
  s.statFarm = !!(s.farm && s.farm.running);
  s.statBoost = accountBoostRunning(s);
  s.statReady = !!s.ready;
  if (Object.keys(patch).length) addStat(steamID, patch);
  if (!s.statFarm && !s.statBoost && s.statHour) { clearInterval(s.statHour); s.statHour = null; s.statLast = 0; }
}
// When the job's state changes the counter writes the time up to that moment to the old state, then moves to the new one.
function updateStatsHour(steamID) {
  const s = accounts.get(steamID);
  if (!s) return;
  const farmNow = !!(s.farm && s.farm.running);
  const boostNow = accountBoostRunning(s);
  if (farmNow === !!s.statFarm && boostNow === !!s.statBoost && (s.statHour || (!farmNow && !boostNow))) return;
  if (s.statHour) statsHour(steamID);
  else { s.statLast = Date.now(); s.statFarm = farmNow; s.statBoost = boostNow; s.statReady = !!s.ready; }
  if ((farmNow || boostNow) && !s.statHour) s.statHour = setInterval(() => statsHour(steamID), 30000);
}

// ---- Card farming (per account) ----
// The badge page is watched in the MAIN PROCESS and per account. The interface used to poll only
// the account on screen once a minute; a card dropped on a background account was not counted, and a game that ran
// out of cards never left the queue. The interval is deliberately 3 minutes: on a big library the badge page is
// several pages and several accounts may be running at the same time.
const CARD_WATCH_MS = 3 * 60 * 1000;
function cardFarmOptions() {
  return {
    autoNext: settings.autoNextGame !== false,
    maxGames: settings.cardMaxGames,
    fastMinPlaytimeMin: settings.fastMinPlaytimeMin,
    fastRotateMinSec: settings.fastRotateMinSec,
    fastRotateMaxSec: settings.fastRotateMaxSec,
  };
}
function farmBroadcast(steamID) {
  const broadcast = accountBroadcast(steamID);
  return (channelName, payloadData) => {
    broadcast(channelName, payloadData);
    if (channelName !== 'farm:tick' || !payloadData || payloadData.running) return;
    const s = accounts.get(steamID);
    stopCardWatcher(s);
    if (payloadData.cause === 'finished' && payloadData.wasRunning) {
      log('info', '[' + accountName(steamID) + '] card farming done: all cards collected');
      accountEvent(steamID, {
        typeName: 'cardsDone',
        feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Tüm kartlar toplandı.', status: 'Başarılı' },
      });
      resumeFarm(steamID);
    } else if ((payloadData.cause === 'duration' || payloadData.cause === 'gameFinished') && payloadData.wasRunning) {
      // "Oyun bitince sıradakine geç" is off: it says why it stopped, otherwise the user
      // thought the job had closed on its own.
      accountEvent(steamID, {
        typeName: 'cardStopped',
        feedEntry: { kind: 'card', title: 'Kart Düşürme', status: 'Durdu',
          text: payloadData.cause === 'duration'
            ? 'Oyunun süresi doldu; sıradakine geçme kapalı olduğu için durdu.'
            : 'Oyunun kartları bitti; sıradakine geçme kapalı olduğu için durdu.' },
      });
    }
  };
}
function startCardFarm(steamID, mode, games, durationMs, extra) {
  const s = slotOf(steamID);
  if (!s.engine || !s.ready) return false;
  if (!s.farm) s.farm = new FarmController(s.engine, farmBroadcast(steamID), 'card');
  s.farm.engine = s.engine;
  const proceed = !!(extra && extra.proceeding);
  log('info', `[${accountName(steamID)}] farm ${proceed ? 'resume' : 'start'}: mode=${mode} games=${(games || []).length} duration=${durationMs}ms`);
  s.farm.start(mode, games || [], durationMs, { ...cardFarmOptions(), ...(extra || {}) });
  if (!proceed && s.farm.running) addStat(steamID, { sessions: 1 });
  if (s.farm.running) startCardWatcher(steamID, games || []);
  return true;
}
function startCardWatcher(steamID, gameList) {
  const s = accounts.get(steamID);
  if (!s) return;
  const old = s.watcher;
  stopCardWatcher(s);
  s.watcher = {
    timer: null, achievementTimer: null, occupiedFlag: false, achievementBusy: false, failure: 0,
    // When continuing (a settings change) the previous measurement is kept, otherwise the drop in between would be lost.
    leftover: old && old.leftover ? old.leftover : new Map((gameList || []).map((g) => [g.appid, g.remaining])),
    nameList: new Map((gameList || []).map((g) => [g.appid, g.name])),
    sessionDropped: old ? old.sessionDropped || 0 : 0,
    lastAchievement: old ? old.lastAchievement || 0 : 0,
  };
  s.watcher.timer = setInterval(() => watchCards(steamID), CARD_WATCH_MS);
  s.watcher.achievementTimer = setInterval(() => openCardAchievements(steamID), 60000);
}
function stopCardWatcher(s) {
  if (!s || !s.watcher) return;
  if (s.watcher.timer) clearInterval(s.watcher.timer);
  if (s.watcher.achievementTimer) clearInterval(s.watcher.achievementTimer);
  s.watcher.timer = null; s.watcher.achievementTimer = null;
}
async function watchCards(steamID) {
  const s = accounts.get(steamID);
  if (!s || !s.watcher || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
  const trace = s.watcher;
  if (trace.occupiedFlag) return;
  trace.occupiedFlag = true;
  try {
    const { gameEntries: gameList, finishedOnes: finished } = await s.engine.getDropGames(true);
    trace.failure = 0;
    // Playtime is not on the badge page; it is carried over from the last known list (fast mode needs it).
    const dk = new Map();
    const v = accountData(steamID);
    ((v.lists && v.lists.drop) || []).forEach((g) => dk.set(g.appid, g.playtimeMin || 0));
    (s.farm.games || []).forEach((g) => dk.set(g.appid, g.playtimeMin || dk.get(g.appid) || 0));
    const current = gameList.map((g) => ({ ...g, playtimeMin: dk.get(g.appid) || 0 }));
    const newItem = new Map(current.map((g) => [g.appid, g]));
    let droppedNow = 0;
    trace.leftover.forEach((earlier, appid) => {
      let currentTime = newItem.has(appid) ? newItem.get(appid).remaining : null;
      if (currentTime == null && finished.has(appid)) currentTime = 0;
      if (currentTime == null || !(currentTime < earlier)) return;
      const count = earlier - currentTime;
      droppedNow += count;
      const name = (newItem.get(appid) && newItem.get(appid).name) || trace.nameList.get(appid) || ('App ' + appid);
      accountEvent(steamID, {
        typeName: 'cardDropped', appid, displayName: name, itemCount: count,
        feedEntry: { kind: 'card', title: '# kart düştü'.replace('#', count), text: name, status: 'Başarılı' },
      });
    });
    current.forEach((g) => { trace.leftover.set(g.appid, g.remaining); trace.nameList.set(g.appid, g.name); });
    finished.forEach((id) => trace.leftover.set(id, 0));
    if (droppedNow) {
      trace.sessionDropped += droppedNow;
      addDailyCard(steamID, droppedNow);
      addStat(steamID, { cardsDropped: droppedNow });
    }
    storeLists('drop', current, steamID);
    if (steamID === activeSteamID) sendRaw('farm:list', { steamID, games: current, sessionDropped: trace.sessionDropped, droppedItems: droppedNow });
    s.farm.updateGames(current, finished);
  } catch (e) {
    trace.failure++;
    log('warn', '[' + accountName(steamID) + '] badge watcher: ' + (e && e.message));
  } finally {
    trace.occupiedFlag = false;
  }
}
// "Kart düşerken başarımları aç" (farmAchUnlock). It was in the interface and only worked for the account on screen,
// while the window was open. Interval: the achievement unlock interval, at least one minute.
async function openCardAchievements(steamID) {
  if (!settings.farmAchUnlock) return;
  const s = accounts.get(steamID);
  if (!s || !s.watcher || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
  const trace = s.watcher;
  const intervalMs = Math.max(60, +settings.achDelay || 60) * 1000;
  if (trace.achievementBusy || Date.now() - (trace.lastAchievement || 0) < intervalMs) return;
  const appid = s.farm.currentActiveAppid;
  if (!appid) return;
  trace.achievementBusy = true;
  try {
    const data = await s.engine.getAchievements(appid);
    const locked = ((data && data.achievements) || []).filter((a) => !a.achieved && !a.protectedFlag);
    if (!locked.length) return;
    const picked = settings.achSpread ? locked[Math.floor(Math.random() * locked.length)] : locked[0];
    await s.engine.setAchievements(appid, [{ apiName: picked.apiName, unlock: true }]);
    trace.lastAchievement = Date.now();
    const v = accountData(steamID);
    v.achLog.unshift({ appid, game: data.gameName || null, apiName: picked.apiName, name: picked.name, unlock: true, ts: Date.now() });
    if (v.achLog.length > 2000) v.achLog.length = 2000;
    writeAccountDataDelayed(steamID);
    accountEvent(steamID, {
      typeName: 'achievementUnlocked', appid, displayName: picked.name,
      feedEntry: { kind: 'card', title: 'Başarım açıldı', text: picked.name, status: 'Başarılı' },
    });
  } catch (e) {
    log('warn', '[' + accountName(steamID) + '] could not unlock an achievement during farming: ' + (e && e.message));
  } finally {
    trace.achievementBusy = false;
  }
}
// "Saat yükseltirken kart düşürmeyi duraklat". The setting's description said "when hour boosting ends
// card farming continues where it left off" but the code only stopped it; it never
// started again. Now the paused job is kept and resumed when hour boosting ends.
function delayFarm(steamID, reasonWhy) {
  const s = accounts.get(steamID);
  if (!s || !s.farm || !s.farm.running) return false;
  const position = s.farm.location();          // first: credit the warm-up progress to the games in fast mode
  s.pendingFarm = {
    mode: s.farm.mode, games: s.farm.games.map((g) => ({ ...g })),
    durationMs: s.farm.durationMs, location: position,
  };
  s.farm.stop('boost');
  log('info', '[' + accountName(steamID) + '] card farming paused: ' + reasonWhy);
  accountEvent(steamID, {
    typeName: 'cardPaused',
    feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Saat yükseltme sürerken duraklatıldı.', status: 'Uyarı' },
  });
  return true;
}
// zorla: resume even if hour boosting continues (the "pause" setting was turned off).
function resumeFarm(steamID, forceIt) {
  const s = accounts.get(steamID);
  if (!s || !s.pendingFarm || s.realistic) return;
  if (!forceIt && accountBoostRunning(s)) return;
  if (!s.ready || !s.engine) return;
  const b = s.pendingFarm;
  s.pendingFarm = null;
  // Options come from the CURRENT settings (cardFarmOptions); the old options of the paused job
  // used to be restored, a setting that changed in between did not reach the resumed job.
  startCardFarm(steamID, b.mode, b.games, b.durationMs, { proceeding: b.location });
  accountEvent(steamID, {
    typeName: 'cardResumed',
    feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Kaldığı yerden sürüyor.', status: 'Çalışıyor' },
  });
}
// Stops all jobs of an account (exit, deleting an account, disconnecting).
function stopAccountJobs(s, steamID) {
  if (!s) return;
  s.pendingFarm = null;
  cancelSettingWaits(s);
  try { if (s.farm && s.farm.running) s.farm.stop('user'); } catch (_) {}
  try { if (s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('user'); } catch (_) {}
  stopCardWatcher(s);
  if (steamID) {
    try { boostStopAccount(steamID, 'user'); } catch (_) {}
    try { if (s.realistic) realisticFinish(steamID, 'kullanici durdurdu'); } catch (_) {}
    try { statsHour(steamID); } catch (_) {}
  }
  if (s.statHour) { clearInterval(s.statHour); s.statHour = null; }
}

// G3: Carries the engine's connection state to the interface. A connection that dropped at run time
// used to be reported nowhere; the user looked at "running" for hours and
// actually earned nothing.
function bindConnectionState(eng, steamID) {
  eng.onStatus = (status, extra) => {
    const s = accounts.get(steamID);
    if (s) {
      // The counters must not count the downtime: first the time up to that moment is written.
      if (status !== 'connected') statsHour(steamID);
      s.ready = (status === 'connected');
      if (s.ready) { s.lastConnection = Date.now(); s.statLast = Date.now(); s.statReady = true; }
      // A long drop splits the uninterrupted run; one shorter than a minute does not (see handleUninterruptedRun).
      if (accountRunning(s)) handleUninterruptedRun(steamID, s.ready);
      syncConnectionChanged(steamID, s.ready);
    }
    if (steamID === activeSteamID) { engineReady = (status === 'connected'); }
    // Log text. The interface builds the text in its own language from the fields (durum, sebep, deneme, bekleMs,
    // sinir, oyunlar); the text here is only for the log file.
    const message = status === 'dropped'
      ? ('Steam baglantisi koptu: ' + (extra.cause || '?'))
      : status === 'connecting'
        ? ('yeniden baglaniyor (deneme ' + extra.attemptCount + ', ' + Math.round((extra.waitMs || 0) / 1000) + ' sn sonra)')
        : status === 'abandoned'
          ? ('yeniden baglanma durdu' + (extra.permanent ? (' (kalici: ' + (extra.cause || '?') + ')') : (' (' + (extra.attemptCount || 0) + ' deneme)')))
          : status === 'connected' && extra.reconnected
            ? ('yeniden baglandi, ' + (extra.gameEntries || 0) + ' oyun geri acildi')
            : 'baglandi';
    log(status === 'dropped' || status === 'abandoned' ? 'warn' : 'info', '[' + steamID + '] ' + message);
    const s2 = accounts.get(steamID);
    if (s2) s2.connectionStatus = { condition: status, ts: Date.now(), ...extra };
    sendRaw('engine:status', { steamID, condition: status, messageText: message, activeIds: steamID === activeSteamID, limitValue: eng.reconnectLimit, ...extra });
    if (status === 'abandoned') {
      accountEvent(steamID, {
        typeName: 'connectionAbandoned', permanent: !!extra.permanent, attemptCount: extra.attemptCount || 0, cause: extra.cause || '',
        feedEntry: { kind: 'error', title: 'Steam Bağlantısı', text: extra.permanent ? 'Steam oturumu kapandı, yeniden bağlanılmıyor.' : 'Yeniden bağlanma denemeleri bitti.', status: 'Hata' },
      });
    }
  };
}
// The "Yeniden bağlan" button in the interface: restarts the attempts of an engine that gave up.
ipcMain.handle('engine:reconnect', () => {
  const s = accounts.get(activeSteamID);
  if (!s || !s.engine) return { ok: false, error: 'Bağlı değil.' };
  if (s.ready) return { ok: true, alreadyConnected: true };
  s.engine.tryReconnect(true);
  return { ok: true };
});
// The connection of the account on screen (Ayarlar > Hesap Statüsü). Not a guess, the last thing the engine reported.
ipcMain.handle('engine:connectionStatus', () => {
  const s = activeSteamID ? accounts.get(activeSteamID) : null;
  if (!s || !s.engine) return { condition: 'none' };
  if (s.ready) return { condition: 'connected', ts: s.lastConnection || null };
  return s.connectionStatus || { condition: 'connecting' };
});

// ================== PER-ACCOUNT DATA STORE ==================
// The hour booster game list, queue order, achievement log and statistics used to be kept
// in app-wide files. With multiple accounts this made the accounts see each other's data:
// User 1's selected games also showed up on User 2.
// Now each account has its own file: settings/accounts/<steamID>.json
const ACCOUNT_DIR = path.join(CONFIG_DIR, 'accounts');
// Keys that come through settings:set but actually belong to the account.
// We sort them out here so the renderer side does not change.
// 'profil': the last known name/avatar/level/custom address. It goes to the interface together with the settings,
// so it can be written to the screen at startup without waiting for the Steam session.
// 'grQueue' and 'grPresets': Realistic Mode's game queue and saved presets. Account
// specific, because the library and achievement state differ per account.
const ACCOUNT_SETTING_KEYS = ['boostGameIds', 'profileInfo', 'grQueue', 'grPresets'];
const DEFAULT_ACCOUNT_DATA = {
  boostGameIds: [], entries: {}, achLog: [], stats: null, profileInfo: null,
  grQueue: [], grPresets: [],
};

const accountDataAll = new Map();   // steamID -> data

function accountFile(steamID) { return path.join(ACCOUNT_DIR, String(steamID) + '.json'); }

function accountData(steamID) {
  if (!steamID) return { ...DEFAULT_ACCOUNT_DATA, entries: {}, achLog: [] };
  if (accountDataAll.has(steamID)) return accountDataAll.get(steamID);
  const r = readJson(accountFile(steamID));
  const v = r.ok
    ? { ...DEFAULT_ACCOUNT_DATA, ...r.dataBlock }
    : { ...DEFAULT_ACCOUNT_DATA, entries: {}, achLog: [] };
  if (r.ok && r.fromBackup) readErrors.push({ displayName: 'Hesap verisi (' + steamID + ')', recoveredFlag: true });
  if (r.corrupt) readErrors.push({ displayName: 'Hesap verisi (' + steamID + ')', recoveredFlag: false });
  accountDataAll.set(steamID, v);
  return v;
}
function writeAccountData(steamID) {
  if (!steamID) return;
  const t = pendingWrite.get(steamID);
  if (t) { clearTimeout(t); pendingWrite.delete(steamID); }
  writeJson(accountFile(steamID), accountData(steamID), false);
}
// SPEED: the account file is fully serialised on every write, forced to disk
// and its backup is taken. With a 5000 entry achievement log this is ~25 ms per write and it locks the main process;
// in bulk achievement unlocking it was written separately for every achievement. Frequently changing data
// (statistics, feed, state, log) is now gathered and written once every 1.5 seconds.
const pendingWrite = new Map();   // steamID -> timer
function writeAccountDataDelayed(steamID) {
  if (!steamID || pendingWrite.has(steamID)) return;
  pendingWrite.set(steamID, setTimeout(() => {
    pendingWrite.delete(steamID);
    writeAccountData(steamID);
  }, 1500));
}
function flushPendingWrites() {
  [...pendingWrite.keys()].forEach((id) => writeAccountData(id));
}
// The active account's data. If there is no account a temporary container is returned (not written to disk).
function activeAccountData() { return accountData(activeSteamID); }

// ---- One-time migration: move from the old global files to the active account's file ----
// So the user does not lose data when upgrading. After moving, the copies in the global
// files are not read; we do not delete them so they are at hand if a return is needed.
function accountDataMigration() {
  if (!activeSteamID) return;
  if (settings.accountDataMigrated) return;
  const v = accountData(activeSteamID);
  let moved = [];
  if (Array.isArray(settings.boostGameIds) && settings.boostGameIds.length && !v.boostGameIds.length) {
    v.boostGameIds = settings.boostGameIds.slice();
    moved.push(v.boostGameIds.length + ' saat yukseltici oyunu');
  }
  if (appState && appState.entries && Object.keys(appState.entries).length && !Object.keys(v.entries).length) {
    v.entries = JSON.parse(JSON.stringify(appState.entries));
    moved.push(Object.keys(v.entries).length + ' kayitli durum');
  }
  if (appState && Array.isArray(appState.achLog) && appState.achLog.length && !v.achLog.length) {
    v.achLog = appState.achLog.slice();
    moved.push(v.achLog.length + ' basarim kaydi');
  }
  if (!v.stats && lifeStats) { v.stats = { ...lifeStats }; moved.push('stats'); }
  writeAccountData(activeSteamID);
  settings.accountDataMigrated = true; saveSettings();
  if (moved.length) log('info', 'account data moved (' + activeSteamID + '): ' + moved.join(', '));
}
// Binds the module level shortcuts to the active account.
function syncActive() {
  const s = activeSteamID ? accounts.get(activeSteamID) : null;
  engine = s ? s.engine : null;
  engineReady = !!(s && s.ready);
  farm = s ? s.farm : null;
  farmHours = s ? s.hoursFarm : null;
}
// Stops all accounts' jobs and closes their sessions (exit / timeout / deleting data).
function disconnectAll() {
  accounts.forEach((s, id) => {
    stopAccountJobs(s, id);
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
  });
  flushPendingWrites();
  accounts.clear();
  activeSteamID = null;
  syncActive();
}

// Connects the account (if needed). If it is already connected it returns the existing engine.
async function connectAccount(entry) {
  const s = slotOf(entry.steamID);
  s.accountName = entry.accountName;
  if (s.ready && s.engine) return { ok: true, persona: s.engine.persona, steamID: s.engine.steamID };
  // DO NOT OPEN A SECOND LOGON FOR THE SAME ACCOUNT. The old code short-circuited only if the session was
  // COMPLETE; when `accounts:connectAll` at startup and the pages' `engine:connect`
  // call clashed, two SteamEngines logged on at once. When Steam sees a second client
  // session for an account it drops the first → LogonSessionReplaced, the engine was left disconnected
  // and the pages said "Not connected.". If a connection is in progress its result is shared.
  if (s.connecting) return s.connecting;
  s.connecting = (async () => {
  // First logon: one attempt if reconnecting is off, three if on (2 s, 4 s apart). Drops after the logon
  // is established are caught by the engine's own loop (with the limit in Settings).
  const tries = settings.reconnectPolicy === 'off' ? 1 : 3;
  let lastErr = null;
  await windowOpened;
  const SteamEngine = steamEngineClass();
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i - 1)));
    // The currency does NOT come from the SETTING but from the account's wallet (the 'wallet' event at logon fills it).
    // The currency is read from the Steam market session; it cannot be chosen in the settings.
    const eng = new SteamEngine();
    eng.reconnectLimit = reconnectLimit();
    // G3: carry drop/reconnect events to the interface
    bindConnectionState(eng, entry.steamID);
    applyChatSettings(eng);
    // Incoming chat message: it lands on the interface and the notification under the name of the account it arrived on.
    eng.onChatMessage = (m) => {
      log('info', `[${entry.accountName}] message: ${m.persona || m.from}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('chat:message', { ...m, account: entry.accountName, steamID: entry.steamID });
      }
      if (settings.notifications !== false && settings.notifyChat !== false && !isQuietHour()) {
        try {
          if (Notification.isSupported()) {
            new Notification({
              title: (m.persona || 'Steam') + (m.replied ? ' · ' + ct('otomatik yanıtlandı') : ''),
              body: m.message.slice(0, 220),
              icon: fs.existsSync(NOTIF_ICON) ? NOTIF_ICON : undefined,
            }).show();
          }
        } catch (_) {}
      }
    };
    try {
      const info = await eng.logOn(entry.refreshToken, settings.offlineMode);
      s.engine = eng; s.ready = true;
      log('info', `[${entry.accountName}] session opened`);
      syncActive();
      return { ok: true, persona: info.persona, steamID: info.steamID };
    } catch (e) {
      lastErr = e;
      log('error', `[${entry.accountName}] logOn error: ${e.message}`);
      // A failed attempt's socket must not stay open in the background - the next attempt should start clean
      try { eng.user.logOff(); } catch (_) {}
    }
  }
  s.ready = false;
  return { ok: false, error: lastErr ? lastErr.message : 'Bağlanılamadı.' };
  })();
  try { return await s.connecting; }
  finally { s.connecting = null; }
}

// Connects the active account. (Other accounts are connected with accounts:connectAll / account switching.)
ipcMain.handle('engine:connect', async () => {
  const sess = hasSession();
  if (!sess) return { ok: false, error: 'Oturum yok, tekrar giriş yap.' };
  if (!activeSteamID) { activeSteamID = sess.steamID; accountDataMigration(); }
  const entry = loadAccounts().find((a) => a.steamID === activeSteamID) || sess;
  const r = await connectAccount(entry);
  syncActive();
  return r;
});

// The last fetched lists are kept in the account's own file. The purpose: at startup the Overview should not
// wait empty. The badge page and the library call take a few seconds; during
// that time "Toplam Kart" and "Kütüphane" showed a dash. Now the last known values are
// drawn instantly and overwritten when the fresh data comes.
function storeLists(field, payloadData, steamID) {
  const id = steamID || activeSteamID;
  const v = accountData(id);
  v.lists = { ...(v.lists || {}), [field]: payloadData, [field + 'Ts']: Date.now() };
  writeAccountDataDelayed(id);
}
ipcMain.handle('engine:lastLists', () => {
  const v = activeAccountData();
  return { ok: true, ...(v.lists || {}) };
});

ipcMain.handle('engine:dropGames', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const games = await engine.getDropGames();
    // The badge page does not give the playtime; but fast mode needs it for the "2 hour" rule
    // (Steam only starts dropping cards once a game passes 2 hours). We merge the time from the owned game
    // list. If it cannot be obtained the games count as having no time (0 min).
    let mins = new Map();
    try {
      const owned = await engine.getOwnedGames();
      owned.forEach((o) => mins.set(o.appid, o.playtimeForever || 0));
    } catch (e) { log('warn', 'could not get the playtime: ' + e.message); }
    const output = games.map((g) => ({ ...g, playtimeMin: mins.get(g.appid) || 0 }));
    storeLists('drop', output);
    return { ok: true, games: output };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('engine:inventory', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, items: await engine.getInventory() }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ---- price cache + throttled fetcher ----
// MEASURED: Steam serves 20 priceoverview requests then 429s; the window clears after ~30s.
// So we fetch in batches of 18 (safety margin) with a 32s cooldown, and persist results to disk
// so a full library scan only happens once (prices are re-checked after settings.priceRefreshHours).
const PRICE_FILE = path.join(CACHE_DIR, 'prices.json');   // price cache
// G8: realised sale history cache (the average/median comes from here).
// Kept SEPARATE from the price: the pricehistory endpoint needs a separate request for every item and is much
// more expensive. It is never filled until the user says "ortalamaları getir".
const HISTORY_FILE = path.join(CACHE_DIR, 'history.json');
const BATCH_SIZE = 18;
const BATCH_COOLDOWN_MS = 32000;

// Two separate caches, ONE queue (see "BIRLESIK PAZAR KUYRUGU"). The caches stay separate
// because they go stale at different speeds: price 24 hours, the realised sale median 72 hours.
let priceCache = new Map();   // hashName -> { price, ts }
let historyCache = new Map();  // hashName -> { hist, ts, cur }
const historyTries = new Map();
const MAX_HISTORY_TRIES = 2;
const HISTORY_CACHE_VERSION = 1;

function loadPriceCache() {
  const r = readJson(PRICE_FILE);
  priceCache = (r.ok && r.dataBlock && typeof r.dataBlock === 'object') ? new Map(Object.entries(r.dataBlock)) : new Map();
}
// NOTE: the price cache lives under CACHE_DIR; it used to be created by mistake in CONFIG_DIR.
function savePriceCache() { writeJson(PRICE_FILE, Object.fromEntries(priceCache), false); }

function loadHistoryCache() {
  const r = readJson(HISTORY_FILE);
  historyCache = (r.ok && r.dataBlock && typeof r.dataBlock === 'object') ? new Map(Object.entries(r.dataBlock)) : new Map();
}
function saveHistoryCache() { writeJson(HISTORY_FILE, Object.fromEntries(historyCache), false); }

// History goes stale more slowly than price: the median of realised sales hardly moves
// during the day. Still, if the currency changes (the account moves to a different region) it is dropped.
function cachedHistory(h) {
  const e = historyCache.get(h);
  if (!e) return undefined;
  if (e.v !== HISTORY_CACHE_VERSION) return undefined;
  const cur = currentPriceCurrency();
  if (!cur || e.cur !== cur) return undefined;
  const ttl = (settings.historyRefreshHours || 72) * 60 * 60 * 1000;
  if (Date.now() - e.ts > ttl) return undefined;
  return e.hist;
}

// ================== UNIFIED MARKET QUEUE ==================
// There used to be two separate queues: first the lowest price of ALL items was fetched, then starting over
// the average of ALL items. Two problems:
//   1. Two separate waiting rounds for the same item - the user saw an item's price and
//      waited for the whole list to finish for its average.
//   2. Both eat from the SAME Steam quota (measured: ~20 requests / 30 s, priceoverview and
//      pricehistory shared). Two queues unaware of each other spent the quota in two places.
// Now there is a single queue and it works PER ITEM: an item's lowest price and its average are fetched
// in the same round, back to back, then it moves to the next item.
let marketQueue = [];        // [{ h, fiyat, gecmis }]
let marketRunning = false;
let marketCancel = false;

function addToMarketQueue(h, priceNum, pastEntries) {
  const v = marketQueue.find((x) => x.h === h);
  if (v) { v.priceValue = v.priceValue || priceNum; v.pastRecords = v.pastRecords || pastEntries; return; }
  marketQueue.push({ h, priceValue: !!priceNum, pastRecords: !!pastEntries });
}
function isInMarketQueue(h, field) {
  const v = marketQueue.find((x) => x.h === h);
  return !!(v && v[field]);
}

// A single price fetch request. If there is a transient error it returns true (the item will be pushed to the end).
async function fetchPrice(h) {
  const n = (priceTries.get(h) || 0) + 1;
  priceTries.set(h, n);
  let p = null;
  try { p = await marketGate(() => engine.getPrice(h)); } catch (_) { p = null; }
  const transientError = p && (p.rateLimited || p.noCurrency);
  if (transientError && n < MAX_PRICE_TRIES) {
    if (p.noCurrency) log('warn', 'market currency not read yet, price postponed: ' + h);
    return { repeatFlag: true, limit: !!p.rateLimited };
  }
  if (transientError) {
    // Give up: null is written to the cache, the interface shows "-" and the queue advances.
    log('warn', `could not get the price (${n} attempts): ${h} - ${p.rateLimited ? 'rate limit' : 'no currency'}`);
    p = null;
  }
  priceTries.delete(h);
  priceCache.set(h, { price: p, ts: Date.now(), cur: currentPriceCurrency(), v: PRICE_CACHE_VERSION });
  sendRaw('price:one', { hashName: h, price: p });
  return { repeatFlag: false, limit: false };
}

async function fetchHistory(h) {
  const n = (historyTries.get(h) || 0) + 1;
  historyTries.set(h, n);
  let hist = null;
  try { hist = await marketGate(() => engine.getPriceHistory(h)); } catch (_) { hist = null; }
  if (hist && hist.rateLimited && n < MAX_HISTORY_TRIES) return { repeatFlag: true, limit: true };
  if (hist && hist.rateLimited) { log('warn', 'could not get the sale history (rate limit): ' + h); hist = null; }
  historyTries.delete(h);
  historyCache.set(h, { hist, ts: Date.now(), cur: currentPriceCurrency(), v: HISTORY_CACHE_VERSION });
  sendRaw('history:one', { hashName: h, history: hist });
  return { repeatFlag: false, limit: false };
}

async function runMarketQueue() {
  if (marketRunning) return;
  marketRunning = true;
  marketCancel = false;
  const sumTotal = marketQueue.length;
  let doneItems = 0;
  // The quota is measured in REQUESTS, not items: an item can spend two requests.
  let requestCounter = 0;
  let limitHit = false;
  try {
    while (marketQueue.length) {
      if (marketCancel) { marketQueue.length = 0; break; }
      const is = marketQueue.shift();
      const h = is.h;
      let repeat = false;

      if (is.priceValue && cachedPrice(h) === undefined) {
        requestCounter++;
        const r = await fetchPrice(h);
        limitHit = limitHit || r.limit;
        repeat = r.repeatFlag;
      }
      // SAME ITEM, SAME ROUND: no waiting for the order to come round again for the average.
      if (!repeat && is.pastRecords && cachedHistory(h) === undefined) {
        requestCounter++;
        const r = await fetchHistory(h);
        limitHit = limitHit || r.limit;
        repeat = r.repeatFlag;
      }

      if (repeat) { marketQueue.push(is); }
      else doneItems++;

      const remaining = marketQueue.length;
      sendRaw('price:progress', { remaining: remaining, cooldown: remaining > 0 });
      sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: remaining, isWaiting: false });
      if (doneItems % 10 === 0) { savePriceCache(); saveHistoryCache(); }

      // The window is full: wait for the quota to reset.
      if (remaining && requestCounter >= BATCH_SIZE) {
        requestCounter = 0;
        sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: remaining, isWaiting: true });
        await new Promise((r) => setTimeout(r, limitHit ? BATCH_COOLDOWN_MS + 8000 : BATCH_COOLDOWN_MS));
        limitHit = false;
      }
    }
  } finally {
    marketRunning = false;
    priceTries.clear();
    historyTries.clear();
    savePriceCache();
    saveHistoryCache();
    sendRaw('price:progress', { remaining: 0, cooldown: false });
    sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: 0, isFinished: true, abandon: marketCancel });
    marketCancel = false;
  }
}

// cacheOnly=true: makes no request to Steam, returns the history on disk.
ipcMain.handle('engine:historyFor', (_e, arg) => {
  const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
  const cacheOnly = !Array.isArray(arg) && !!(arg && arg.cacheOnly);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const out = {};
  const lacking = [];
  [...new Set(hashNames || [])].forEach((h) => {
    if (!h) return;
    const c = cachedHistory(h);
    if (c !== undefined) out[h] = c;
    else if (!isInMarketQueue(h, 'pastRecords')) lacking.push(h);
  });
  if (cacheOnly) return { ok: true, history: out, lacking: lacking.length, queueList: 0 };
  lacking.forEach((h) => addToMarketQueue(h, false, true));
  if (marketQueue.length) runMarketQueue();
  return { ok: true, history: out, lacking: lacking.length, queueList: marketQueue.length };
});

ipcMain.on('engine:historyCancel', () => {
  if (marketRunning) { marketCancel = true; log('info', 'market fetch cancelled'); }
  marketQueue.length = 0;
});
// A cache entry is stamped with the CURRENCY it was fetched in. If an old entry in a different currency
// is used the amount looks completely wrong (e.g. if a TRY record is taken as USD a ~40x
// deviation) - so if the currency does not match the entry is ignored and fetched again.
// The ONLY source of the currency is the engine (the wallet event). null = not known yet → no price is fetched.
function currentPriceCurrency() {
  return (engine && engine.currencyCode && engine.currencyCode()) || null;
}
// Cache format version. Entries before v2 may have had their AMOUNTS fetched in the wrong
// currency even if the currency label is right (getPrice ignored the account's currency and always asked for TRY), so
// they are all dropped once and fetched again in the right currency.
const PRICE_CACHE_VERSION = 2;
function cachedPrice(h) {
  const e = priceCache.get(h);
  if (!e) return undefined;
  if (e.v !== PRICE_CACHE_VERSION) return undefined;
  const cur = currentPriceCurrency();
  if (!cur || e.cur !== cur) return undefined;
  const ttl = (settings.priceRefreshHours || 24) * 60 * 60 * 1000;
  if (Date.now() - e.ts > ttl) return undefined;
  return e.price;
}

// ---- SINGLE MARKET GATE ----
// Steam Community Market requests are limited to ~20 requests / 30 seconds per account. The price
// queue, the sale history and the order book share the SAME limit; when they sent requests
// unaware of each other all of them got 429 and "could not be fetched" boxes appeared. All market requests
// pass through here in order and spaced out.
let marketChain = Promise.resolve();
let lastMarketAt = 0;
function marketGate(fn) {
  const run = async () => {
    const gap = (settings.apiRequestDelayMs || 350);
    const wait = Math.max(0, lastMarketAt + gap - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastMarketAt = Date.now();
    return fn();
  };
  marketChain = marketChain.then(run, run);
  return marketChain;
}

const priceTries = new Map();     // hash -> how many times tried
const MAX_PRICE_TRIES = 3;

// Renderer sends every marketable hash it cares about; we answer instantly from cache and
// queue whatever is missing for background fetching.
// With cacheOnly=true NO request is made to Steam, only the cache on disk is read.
// The inventory page uses this when it opens: if the cache is full there is no need to ask the user
// "fetch prices now?", the prices come instantly anyway.
//
// THE AVERAGE IN THE SAME ROUND TOO: while an item's lowest price is fetched its average is also fetched
// (Ayarlar > "Fiyatla birlikte ortalamayı da çek"). If turned off the average only comes with the
// "Ortalama" button in Envanter - then a single request is made per item.
ipcMain.handle('engine:pricesFor', (_e, arg) => {
  const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
  const cacheOnly = !Array.isArray(arg) && !!(arg && arg.cacheOnly);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const atAverage = settings.fetchAvgWithPrice !== false;
  const out = {};
  const missing = [];
  [...new Set(hashNames || [])].forEach((h) => {
    if (!h) return;
    const c = cachedPrice(h);
    if (c !== undefined) out[h] = c;
    else if (!isInMarketQueue(h, 'priceValue')) missing.push(h);
  });
  if (cacheOnly) return { ok: true, prices: out, queued: 0, lacking: missing.length };
  missing.forEach((h) => addToMarketQueue(h, true, atAverage && cachedHistory(h) === undefined));
  if (marketQueue.length) runMarketQueue();
  return { ok: true, prices: out, queued: marketQueue.length };
});

// On-demand: only for the item currently open in the detail panel (see rate-limit note in engine).
ipcMain.handle('engine:priceHistory', async (_e, hashName) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  // Passes through the same market gate - does not race the price queue (see marketGate)
  try { return { ok: true, history: await marketGate(() => engine.getPriceHistory(hashName)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Order book: listings on sale + buy orders. Since it counts toward the market request limit
// it is called on request only for the single item the user selected.
ipcMain.handle('engine:itemOrders', async (_e, hashName) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, orders: await marketGate(() => engine.getItemOrders(hashName)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('engine:achievements', async (_e, arg) => {
  const appid = (arg && typeof arg === 'object') ? arg.appid : arg;
  const isFresh = !!(arg && typeof arg === 'object' && arg.freshFlag);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  // taze=true: throw away the schema/value cache, read again from Steam. The verification after a bulk
  // operation uses this; reading from the cache would give back our own guess.
  if (isFresh) { try { engine.invalidateStats(appid); } catch (_) {} }
  try { return { ok: true, data: await engine.getAchievements(appid) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Own Steam profile (avatar/name/level) via protocol.
ipcMain.handle('engine:profile', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const profileData = await engine.getProfile();
    // Write the last known profile to the account's own file. So that at the next startup the interface can show
    // the name, avatar and level without waiting for the Steam session to be established: logging
    // on takes seconds and during that time a dash sat on the screen.
    const v = activeAccountData();
    v.profileInfo = { ...(v.profileInfo || {}), ...profileData, ts: Date.now() };
    writeAccountData(activeSteamID);
    return { ok: true, profile: v.profileInfo };
  } catch (e) { return { ok: false, error: e.message }; }
});
// Custom profile address (steamcommunity.com/id/<name>). Separate from the profile call: it is not in the
// protocol, it is read from the web page and nobody should hold the name/avatar waiting for it.
ipcMain.handle('engine:vanity', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const vanity = await engine.getVanityURL();
    const v = activeAccountData();
    v.profileInfo = { ...(v.profileInfo || {}), vanity };
    writeAccountData(activeSteamID);
    return { ok: true, vanity };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---- persistent lifetime stats (survive app restarts) ----
const STATS_FILE = path.join(CONFIG_DIR, 'stats.json');
const DEFAULT_STATS = {
  totalRuntimeMs: 0, cardsDropped: 0, cardsSold: 0, boostRuntimeMs: 0, sessions: 0, since: Date.now(),
  dailyCards: {},        // 'YYYY-MM-DD' -> cards dropped that day (En Verimli Gün)
  saleAmount: 0,         // the total the seller keeps of the items put on sale (cents)
  pricedForSale: 0,       // number of listings whose amount is known (Ortalama Satış = satisTutar / satisFiyatli)
  longestRunMs: 0,    // uninterrupted run (Kesintisiz Çalışma)
};
let lifeStats = { ...DEFAULT_STATS };
function loadStats() {
  const r = readJson(STATS_FILE);
  if (r.ok) {
    lifeStats = { ...DEFAULT_STATS, ...r.dataBlock };
    if (r.fromBackup) readErrors.push({ displayName: 'İstatistikler', recoveredFlag: true });
  } else {
    lifeStats = { ...DEFAULT_STATS, since: Date.now() };
    if (r.corrupt) readErrors.push({ displayName: 'İstatistikler', recoveredFlag: false });
  }
}
// stats.json is no longer written: statistics are per account, in the account file. The old file is only read at
// first startup to be moved to the account on screen (accountDataMigration).
// Statistics are account specific and are counted in the MAIN PROCESS (see addStat): the cards dropped by two
// accounts are not added into a single counter, and a background account's job is counted too. The interface
// only reads; the adding used to be in the interface and only the account on screen was counted.
function statsView(steamID) {
  const st = { ...DEFAULT_STATS, ...accountStats(steamID) };
  // The uninterrupted time of the running job is taken into account too; otherwise the longest run would only show once the job ended.
  const s = accounts.get(steamID);
  if (s && s.uninterruptedStart && !s.uninterruptedEnd && accountRunning(s)) {
    st.longestRunMs = Math.max(+st.longestRunMs || 0, Date.now() - s.uninterruptedStart);
  }
  return { steamID, ...st };
}
ipcMain.handle('stats:get', () => {
  if (!activeSteamID) return { ...DEFAULT_STATS, since: null };
  statsHour(activeSteamID);          // so the last minute of the running job shows too
  return statsView(activeSteamID);
});
ipcMain.handle('stats:reset', () => {
  if (!activeSteamID) return { ...DEFAULT_STATS, since: null };
  const v = activeAccountData();
  v.stats = { ...DEFAULT_STATS, dailyCards: {}, since: Date.now() };
  const s = accounts.get(activeSteamID);
  if (s) { s.uninterruptedStart = accountRunning(s) ? Date.now() : null; s.uninterruptedEnd = null; }
  writeAccountData(activeSteamID);
  const view = statsView(activeSteamID);
  sendRaw('stats:changed', view);
  return view;
});

// ================== PERSISTENT STATE STORE (state.json) ==================
// Unlike the settings, the "remembered" data lives here: selected games, the last
// viewed game, the achievement unlock log. Each record is timestamped; those older than the period in the
// `dataRetentionDays` setting are cleaned at startup and on every write (0 = keep forever).
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const DEFAULT_STATE = { entries: {}, achLog: [] };
let appState = { ...DEFAULT_STATE };

function retentionMs() {
  const d = +(settings && settings.dataRetentionDays);
  return Number.isFinite(d) && d > 0 ? d * 24 * 60 * 60 * 1000 : 0;   // 0 = forever
}
function pruneState() {
  const ttl = retentionMs();
  if (!ttl) return 0;
  const cut = Date.now() - ttl;
  let n = 0;
  Object.keys(appState.entries).forEach((k) => {
    const e = appState.entries[k];
    if (!e || !(e.ts > cut)) { delete appState.entries[k]; n++; }
  });
  const before = appState.achLog.length;
  appState.achLog = appState.achLog.filter((r) => r && r.ts > cut);
  return n + (before - appState.achLog.length);
}
function loadState() {
  const r = readJson(STATE_FILE);
  if (r.ok) {
    const raw = r.dataBlock;
    appState = {
      entries: (raw && typeof raw.entries === 'object' && raw.entries) || {},
      achLog: Array.isArray(raw && raw.achLog) ? raw.achLog : [],
    };
    if (r.fromBackup) readErrors.push({ displayName: 'Kayitli durum', recoveredFlag: true });
  } else {
    appState = { entries: {}, achLog: [] };
    if (r.corrupt) readErrors.push({ displayName: 'Kayitli durum', recoveredFlag: false });
  }
  const dropped = pruneState();
  if (dropped) log('info', dropped + ' records past the retention period deleted');
}
function saveState() { writeJson(STATE_FILE, appState, false); }
// Cleans the records whose retention time has run out from the ACCOUNT data.
function pruneAccountRecords(v) {
  const ttl = retentionMs();
  if (!ttl || !v) return 0;
  const cut = Date.now() - ttl;
  let n = 0;
  Object.keys(v.entries || {}).forEach((k) => {
    const e = v.entries[k];
    if (!e || !(e.ts > cut)) { delete v.entries[k]; n++; }
  });
  const earlier = (v.achLog || []).length;
  v.achLog = (v.achLog || []).filter((r) => r && r.ts > cut);
  return n + (earlier - v.achLog.length);
}

// Read a key - if it has expired undefined is returned (the caller falls back to its default).
// Reads from the ACTIVE ACCOUNT's own store; accounts do not see each other's choices.
ipcMain.handle('state:get', (_e, key) => {
  const v = activeAccountData();
  pruneAccountRecords(v);
  const e = v.entries[key];
  return { ok: true, value: e ? e.v : undefined, ts: e ? e.ts : null };
});
ipcMain.handle('state:set', (_e, { key, value }) => {
  const v = activeAccountData();
  v.entries[key] = { v: value, ts: Date.now() };
  pruneAccountRecords(v); writeAccountDataDelayed(activeSteamID);
  return { ok: true };
});
// Unlocked/locked achievements: a permanent record of what we did, in which game and when.
ipcMain.handle('state:achLog', (_e, entry) => {
  const v = activeAccountData();
  v.achLog.unshift({ ...entry, ts: Date.now() });
  if (v.achLog.length > 2000) v.achLog.length = 2000;
  pruneAccountRecords(v); writeAccountDataDelayed(activeSteamID);
  return { ok: true };
});
ipcMain.handle('state:achLogGet', (_e, appid) => {
  const v = activeAccountData();
  pruneAccountRecords(v);
  const list = appid ? v.achLog.filter((r) => r.appid === appid) : v.achLog;
  return { ok: true, list };
});
ipcMain.handle('state:clear', () => {
  const v = activeAccountData();
  v.entries = {}; v.achLog = [];
  writeAccountData(activeSteamID);
  return { ok: true };
});

ipcMain.handle('engine:setAchievements', async (_e, { appid, changes }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, result: await engine.setAchievements(appid, changes) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ---- SALE ----
// Steam's fee calculation (see src/services/steamFee.js). toplamlar: the amounts the buyer pays,
// in cents. Returns: for each, the amount that will go to Steam and the real price at which the listing
// will appear on the market.
ipcMain.handle('engine:saleFee', async (_e, totals) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const wallet = await engine.walletInfo();
    const outcome = await steamFee().compute(wallet, Array.isArray(totals) ? totals.slice(0, 5000) : []);
    return { ok: true, outcomeData: outcome, rate: engine.currencyCode() };
  } catch (e) {
    log('warn', 'could not calculate the sale fee: ' + (e && e.message));
    return { ok: false, error: ct('Steam ücret hesabı yüklenemedi:') + ' ' + ct((e && e.message) || '') };
  }
});

// What Steam's listing error means. ACCOUNT TRUSTWORTHINESS decides Steam's listing limit:
// a new account can be stopped after 10-15 listings, an old account can list 80+ at
// once. Continuing after hitting the limit only piles up errors;
// the safest way is to stop and tell the user.
//   limit : Steam stopped listing (too many listings awaiting confirmation, too many requests, wallet cap)
//   atla  : this item cannot be listed (it already has a listing awaiting confirmation, not in the inventory); move on to the next
//   genel : reason unclear; if it happens twice in a row it is treated like a limit
function saleErrorType(e) {
  const m = String((e && (e.steamMessage || e.message)) || '');
  const http = e && e.httpStatus;
  if (/already have a listing|no longer in your inventory|not allowed to be traded|specified item/i.test(m)) return 'skip';
  if (http === 429 || http === 503 || http === 502
      || /too many|pending confirmation|previous action|wallet|maximum|exceed|rate limit|try again later/i.test(m)) return 'limit';
  return 'general';
}
ipcMain.handle('engine:sellItem', async (_e, { assetId, priceCents, amount }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.', typeName: 'limit' };
  const steamID = activeSteamID;
  try {
    const result = await engine.sellItem(assetId, priceCents, amount || 1);
    // The statistic is the number of items "put on sale": a listing was made, whether it sold is not known. The amount is
    // what the seller will keep (Steam's cut deducted); "Ortalama Satış" is computed from it.
    const count = amount || 1;
    addStat(steamID, { cardsSold: count, saleAmount: (+priceCents || 0) * count, pricedForSale: count });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Listeleme reddedildi', typeName: saleErrorType(e), http: (e && e.httpStatus) || null };
  }
});

// External links - only the expected domain names (so a random URL cannot be opened).
ipcMain.on('open:external', (_e, url) => {
  if (typeof url !== 'string') return;
  // The "Yayın Sayfasını Aç" button of the update window opens the release address; the allow
  // list used to recognise only the profile address and the button silently did nothing.
  if (/^https:\/\/steamcommunity\.com\//.test(url) || /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/?$/.test(url)
      || /^https:\/\/github\.com\/Miabeyefendi\/SteamEdge\/releases(\/[A-Za-z0-9_.\/-]*)?$/.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('engine:ownedGames', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const games = await engine.getOwnedGames();
    storeLists('owned', games);
    return { ok: true, games };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ================== HOUR BOOSTING (per account) ==================
// The state is in the account's slot (s.boost). Timers remember the account, NOT the engine; whichever
// account is open on screen, when the time is up the right account's games close.
function boostStatus(s) {
  if (!s.boost) {
    s.boost = { runningFlag: false, timer: null, stagger: [], sync: null, syncTimer: null, syncHeartbeat: null,
                request: null, startPoint: 0, spanMs: 0, appids: [] };
  }
  return s.boost;
}
function boostClear(s) {
  const b = s && s.boost;
  if (!b) return;
  if (b.timer) { clearTimeout(b.timer); b.timer = null; }
  b.stagger.forEach((t) => clearTimeout(t));
  b.stagger = [];
  if (b.syncTimer) { clearTimeout(b.syncTimer); b.syncTimer = null; }
  if (b.syncHeartbeat) { clearInterval(b.syncHeartbeat); b.syncHeartbeat = null; }
  b.sync = null;
}

// ================== HOUR SYNC ==================
// Purpose: to bring the TOTAL playtimes of the selected games to the same point.
// Since Steam credits time to every game that is open at once, running the group that is furthest
// behind together moves them up equally. That is why it proceeds in steps:
//   e.g. if 8h / 11h / 101h are selected → first only the 8h game is raised to 11h,
//   then the two together are raised to 101h, then all three continue together.
// Target: 'highest' (the highest of the selected) · 'manual' (hours typed by hand) ·
//        'library' (the highest time in the library).
// G13: HEARTBEAT. Sync takes hours and the interface used to be told only when a game reached the
// target: on a 47 hour job the percentages on screen stayed frozen at the starting value for 47 hours.
// Now the current state is sent at regular intervals.
const SYNC_HEARTBEAT_MS = 30000;
function setupSyncHeartbeat(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b) return;
  if (b.syncHeartbeat) clearInterval(b.syncHeartbeat);
  b.syncHeartbeat = setInterval(() => {
    const x = accounts.get(steamID);
    if (x && x.boost && x.boost.sync) syncEmit(steamID, true);
    else if (b.syncHeartbeat) { clearInterval(b.syncHeartbeat); b.syncHeartbeat = null; }
  }, SYNC_HEARTBEAT_MS);
}

// ---- PARALLEL SYNC (default) ----
// The stepped method keeps the games level along the way but is needlessly slow for going to a fixed target
// (e.g. 400 hours): with 12 games of different times it makes 12 steps, and in the first step
// a single game runs. Since Steam credits time to EVERY game that is open AT THE SAME TIME the right approach is
// to run all of them together and drop the one that reaches the target from the list. The total time falls to the time the
// game furthest behind needs to reach the target.
//
// If the simultaneous limit is exceeded the games with the most time left get priority (LPT); so the
// bottleneck games start early and the total time comes as close to the minimum as it can.
function simulateSync(games, targetMin, limit) {
  const remaining = new Map();
  (games || []).forEach((g) => {
    const lacking = targetMin - (g.playtimeMin || 0);
    if (lacking > 0) remaining.set(g.appid, lacking * 60000);
  });
  const stages = [];
  let totalMillis = 0;
  const container = Math.max(1, Math.min(32, limit || 32));
  let security = 0;
  while (remaining.size && security++ < 500) {
    const sequential = [...remaining.entries()].sort((a, b) => b[1] - a[1]);
    const active = sequential.slice(0, container);
    const dt = Math.min(...active.map((x) => x[1]));
    stages.push({ ids: active.map((x) => x[0]), spanMs: dt, activeTotal: active.length });
    active.forEach(([id, ms]) => {
      const newItem = ms - dt;
      if (newItem <= 0) remaining.delete(id); else remaining.set(id, newItem);
    });
    totalMillis += dt;
  }
  return { totalMillis: totalMillis, stages: stages };
}

// WHEN THE CONNECTION DROPS. Sync used to be silently abandoned the moment the connection dropped; even if the engine
// reconnected and reopened the games the sync was gone. Now the downtime
// is not credited to the ledger (Steam does not count it either), in the stepped strategy the step time is extended by that much.
function syncConnectionChanged(steamID, connected) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  const st = b && b.sync;
  if (!st) return;
  const currentTime = Date.now();
  if (!connected) {
    if (!st.isDropped) {
      ledger.applyLedger(st, currentTime);
      st.isDropped = true;
      st.dropMoment = currentTime;
    }
    return;
  }
  if (!st.isDropped) return;
  st.isDropped = false;
  const lost = Math.max(0, currentTime - (st.dropMoment || currentTime));
  st.lastAccount = currentTime;
  if (st.strategyName === 'staged' && st.stepEnd && b.syncTimer) {
    st.stepEnd += lost;
    st.startedAt += lost;
    clearTimeout(b.syncTimer);
    b.syncTimer = setTimeout(() => advanceTier(steamID), Math.max(1000, st.stepEnd - currentTime));
  }
}

// Plans one step of a running parallel sync: subtracts the elapsed time from the active games,
// removes the ones that reached the target from the list, builds a new active set from the rest.
function scheduleSync(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  const st = b && b.sync;
  if (!st || st.strategyName !== 'parallel') return;
  if (!s.engine) { boostFinish(steamID, 'connection'); return; }
  // If there is no connection wait; the engine reopens the games itself once it reconnects.
  if (!s.ready) { b.syncTimer = setTimeout(() => scheduleSync(steamID), 30000); return; }
  const newlyFinished = ledger.applyLedger(st, Date.now());
  newlyFinished.forEach((o) => log('info', '[' + accountName(steamID) + '] hour sync: ' + o.name + ' reached the target'));

  const remainders = [...st.gameEntries.values()].filter((o) => !o.isFinished);
  if (!remainders.length) {
    log('info', '[' + accountName(steamID) + '] hour sync done: all games reached the target');
    syncEmit(steamID, false, { done: true });
    accountEvent(steamID, {
      typeName: 'syncFinished',
      feedEntry: { kind: 'hours', title: 'Saat Eşitleme', text: 'Tüm oyunlar hedefe ulaştı.', status: 'Başarılı' },
    });
    boostFinish(steamID, 'sync');
    return;
  }
  st.activeIds = ledger.nextActiveSet(st);
  s.engine.play(st.activeIds, 'hours');

  const shortest = Math.min(...st.activeIds.map((id) => st.gameEntries.get(id).remainingMs));
  syncEmit(steamID, true);
  accountBroadcast(steamID)('boost:tick', {
    running: true, appids: st.activeIds, activeAppids: s.engine.playingApps('hours'),
    startedAt: st.startPoint, durationMs: 0, sync: true,
  });
  b.syncTimer = setTimeout(() => scheduleSync(steamID), Math.max(1000, shortest));
}

function buildSyncSteps(games, targetMin) {
  // games: [{appid, playtimeMin}] - those that are already past the target count as "ready" from the start
  const sorted = games.slice().sort((a, b) => (a.playtimeMin || 0) - (b.playtimeMin || 0));
  const levels = [...new Set(sorted.map((g) => g.playtimeMin || 0))].filter((v) => v < targetMin).sort((a, b) => a - b);
  const steps = [];
  for (let i = 0; i < levels.length; i++) {
    const from = levels[i];
    const to = Math.min(levels[i + 1] != null ? levels[i + 1] : targetMin, targetMin);
    if (to <= from) continue;
    const ids = sorted.filter((g) => (g.playtimeMin || 0) <= from).map((g) => g.appid);
    if (ids.length) steps.push({ ids, fromMin: from, toMin: to });
  }
  return steps;
}
function syncEmit(steamID, running, extra) {
  const s = accounts.get(steamID);
  const st = s && s.boost && s.boost.sync;
  const broadcast = accountBroadcast(steamID);
  if (st && st.strategyName === 'parallel') {
    const gameList = ledger.uiList(st, Date.now());
    const remainders = gameList.filter((o) => !o.isFinished);
    broadcast('boost:sync', Object.assign({
      running,
      strategyName: 'parallel',
      targetMin: st.targetMin,
      totalSum: gameList.length,
      finishedOne: gameList.length - remainders.length,
      activeTotal: (st.activeIds || []).length,
      ids: (st.activeIds || []).slice(),
      gameEntries: gameList,
      // The end of the game furthest behind = the end of the whole job (if the limit is enough)
      remainingMs: remainders.length ? Math.max(...remainders.map((o) => o.remainingMs)) : 0,
      startedAt: st.startPoint,
      jobTotalMs: st.jobTotalMs || 0,
    }, extra || {}));
    return;
  }
  // G13: the game list is sent in the stepped strategy too. Since it was not sent before the
  // interface wrote the SAME percentage on every game (how much of the session had passed); a game one
  // hour from the target and a game 47 hours from it showed the same bar.
  const step = st && st.steps[st.i];
  broadcast('boost:sync', Object.assign({
    running,
    strategyName: 'staged',
    step: st ? st.i + 1 : 0,
    steps: st ? st.steps.length : 0,
    targetMin: st ? st.targetMin : 0,
    ids: step ? step.ids : [],
    fromMin: step ? step.fromMin : 0,
    toMin: step ? step.toMin : 0,
    startedAt: st ? st.startedAt : 0,
    stepMs: st ? st.stepMs : 0,
    gameEntries: st ? ledger.uiList(st, Date.now()) : [],
    jobTotalMs: st ? (st.jobTotalMs || 0) : 0,
  }, extra || {}));
}
function advanceTier(steamID) {
  const s = accounts.get(steamID);
  const st = s && s.boost && s.boost.sync;
  if (!st) return;
  st.i++;
  runSyncStep(steamID);
}
function runSyncStep(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  const st = b && b.sync;
  if (!st || !s.engine) return;
  if (!s.ready) { b.syncTimer = setTimeout(() => runSyncStep(steamID), 30000); return; }
  // Credit the time that passed in the previous step to the ledger - otherwise the interface counts from zero at every step.
  ledger.applyLedger(st, Date.now()).forEach((o) => log('info', '[' + accountName(steamID) + '] hour sync: ' + o.name + ' reached the target'));
  const step = st.steps[st.i];
  if (!step) {
    // All steps are done → all are equal, now they continue together
    const allIds = st.everything;
    const nextDuration = st.nextDurationMs || 0;
    log('info', '[' + accountName(steamID) + '] hour sync done, all games are running together');
    syncEmit(steamID, false, { done: true });
    accountEvent(steamID, {
      typeName: 'syncFinished',
      feedEntry: { kind: 'hours', title: 'Saat Eşitleme', text: 'Tüm oyunlar hedefe ulaştı.', status: 'Başarılı' },
    });
    b.sync = null;
    if (b.syncHeartbeat) { clearInterval(b.syncHeartbeat); b.syncHeartbeat = null; }
    s.engine.play(allIds, 'hours');
    b.appids = allIds; b.startPoint = Date.now(); b.spanMs = nextDuration;
    accountBroadcast(steamID)('boost:tick', { running: true, appids: allIds, activeAppids: s.engine.playingApps('hours'), startedAt: b.startPoint, durationMs: b.spanMs });
    if (nextDuration) b.timer = setTimeout(() => boostTimeUp(steamID), nextDuration);
    return;
  }
  st.stepMs = (step.toMin - step.fromMin) * 60000;
  st.startedAt = Date.now();
  st.stepEnd = st.startedAt + st.stepMs;
  st.activeIds = step.ids.slice();      // the ledger credits time to this set
  st.lastAccount = Date.now();
  s.engine.play(step.ids, 'hours');
  log('info', `[${accountName(steamID)}] hour sync step ${st.i + 1}/${st.steps.length}: ${step.ids.length} games ${step.fromMin}min -> ${step.toMin}min`);
  syncEmit(steamID, true);
  accountBroadcast(steamID)('boost:tick', { running: true, appids: step.ids, activeAppids: s.engine.playingApps('hours'), startedAt: st.startedAt, durationMs: st.stepMs, sync: true });
  b.syncTimer = setTimeout(() => advanceTier(steamID), st.stepMs);
}

// Starts simultaneous hour boosting. istek: { appids, durationMs, games, devam }
// devam: { baslangic } - when a setting changes the job is resumed with the same start and total duration.
function boostStart(steamID, request) {
  const s = accounts.get(steamID);
  if (!s || !s.engine || !s.ready) return { ok: false, error: 'Bağlı değil.' };
  const b = boostStatus(s);
  boostClear(s);
  // Sequential and simultaneous boosting do not run at the same time; both write the same game list.
  if (s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('boost');
  if (settings.pauseFarmOnBoost) delayFarm(steamID, 'saat yukseltme');
  const appids = (request.appids || []).slice();
  const games = Array.isArray(request.games) ? request.games : null;
  const durationMs = +request.durationMs || 0;
  // tumu: all the games selected on the page. If the "at most at once" setting changes while the job runs
  // the list is cut again from here; if only the first slice were kept the limit could not be raised.
  const allOfIt = Array.isArray(request.allItems) && request.allItems.length ? request.allItems : null;
  b.request = { appids, durationMs, games, allItems: allOfIt };
  b.runningFlag = true;

  // If sync is on, work toward the target. There are two strategies:
  //   parallel (default) - all together, drop the one that reaches the target from the list. The fastest.
  //   staged             - step by step, keeps the games level along the way. Slow but gradual.
  if (settings.boostSync && games && games.length) {
    const mode = settings.boostSyncMode || 'highest';
    let targetMin;
    if (mode === 'manual') targetMin = Math.max(0, Math.round((+settings.boostSyncTargetHours || 0) * 60));
    else if (mode === 'library') targetMin = Math.max(0, +settings.boostSyncLibraryMaxMin || 0);
    else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

    const behind = games.filter((g) => (g.playtimeMin || 0) < targetMin);
    if (!behind.length) {
      log('info', '[' + accountName(steamID) + '] hour sync: all games are already at the target, starting them together directly');
    } else if ((settings.boostSyncStrategy || 'parallel') === 'staged') {
      const steps = buildSyncSteps(games, targetMin);
      if (steps.length) {
        b.sync = {
          strategyName: 'staged', steps, i: 0, startedAt: 0, stepMs: 0, targetMin,
          everything: games.map((g) => g.appid), nextDurationMs: durationMs,
          // The stepped strategy keeps the same ledger too: the interface reads the per-game progress
          // from here, otherwise it wrote the session percentage on every game.
          gameEntries: ledger.setupLedger(behind, targetMin),
          activeIds: [], startPoint: Date.now(), lastAccount: Date.now(),
          // The job's TOTAL time, once at the start. The bars in the interface sit on this shared
          // timeline: a game's bar shows where in the job that game finishes. It is kept
          // constant, otherwise the bars could go backwards.
          jobTotalMs: steps.reduce((t, st) => t + (st.toMin - st.fromMin) * 60000, 0),
        };
        log('info', '[' + accountName(steamID) + '] hour sync (staged): ' + steps.length + ' steps, target ' + targetMin + ' min');
        setupSyncHeartbeat(steamID);
        runSyncStep(steamID);
        return { ok: true };
      }
    } else {
      // Sync computes its own duration; the "yükseltme süresi" setting is invalid here.
      const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
      b.sync = {
        strategyName: 'parallel', targetMin, limit, gameEntries: ledger.setupLedger(behind, targetMin),
        activeIds: [], startPoint: Date.now(), lastAccount: Date.now(),
      };
      // The job's TOTAL time, once at the start and it never changes again. The bars in the interface
      // sit on this shared timeline: in a 34 hour job the bar of a game that will finish after 3 hours
      // is full from the start, the bar of the game that will run to the end is empty.
      b.sync.jobTotalMs = ledger.remainingTotalMs(b.sync);
      log('info', '[' + accountName(steamID) + '] hour sync (parallel): ' + b.sync.gameEntries.size + ' games, target ' + targetMin
        + ' dk, limit ' + limit + ', toplam is ' + Math.round(b.sync.jobTotalMs / 60000) + ' dk');
      setupSyncHeartbeat(steamID);
      scheduleSync(steamID);
      return { ok: true };
    }
  }

  // The "Süre dolunca otomatik durdur" setting was removed: if a duration is chosen it stops when the time is up,
  // if "Sınırsız" is chosen it runs until stopped. Two separate switches said the same thing.
  const proceed = request.proceeding || null;
  const start = proceed && proceed.startPoint ? proceed.startPoint : Date.now();
  const remainingMs = durationMs ? Math.max(1000, durationMs - (Date.now() - start)) : 0;
  const stagger = Math.max(0, +settings.boostStagger || 0) * 1000;
  b.appids = appids; b.startPoint = start; b.spanMs = durationMs;

  const emit = () => accountBroadcast(steamID)('boost:tick', { running: true, appids, activeAppids: s.engine.playingApps('hours'), startedAt: start, durationMs });
  if (!stagger || appids.length <= 1 || proceed) {
    s.engine.play(appids, 'hours');
    emit();
  } else {
    // "Oyun başlatma aralığı": added one after another at this interval, not all at once
    log('info', `[${accountName(steamID)}] boost: starting ${appids.length} games ${stagger}ms apart`);
    appids.forEach((id, i) => {
      b.stagger.push(setTimeout(() => {
        if (!b.runningFlag) return;
        s.engine.play(appids.slice(0, i + 1), 'hours');
        emit();
      }, i * stagger));
    });
  }
  if (remainingMs) b.timer = setTimeout(() => boostTimeUp(steamID), remainingMs);
  return { ok: true };
}

// Time is up. If "Oturumu otomatik yenile" is on it restarts with the same selection; this used to
// be in the interface and only worked for the account on screen and while the window was open. When the account changed
// the interface could restart it on the wrong account.
function boostTimeUp(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b || !b.runningFlag) return;
  const request = b.request;
  boostFinish(steamID, 'duration', true);
  if (settings.boostAutoRestart && request) {
    accountEvent(steamID, {
      typeName: 'boostRenewed',
      feedEntry: { kind: 'hours', title: 'Saat Yükseltici', text: 'Süre doldu, oturum otomatik yenilendi.', status: 'Çalışıyor' },
    });
    setTimeout(() => {
      const x = accounts.get(steamID);
      if (x && x.ready && !(x.boost && x.boost.runningFlag)) boostStart(steamID, { ...request, proceeding: null });
      else resumeFarm(steamID);
    }, 1500);
    return;
  }
  accountEvent(steamID, {
    typeName: 'boostFinished',
    feedEntry: { kind: 'hours', title: 'Saat Yükseltici', text: 'Süre doldu.', status: 'Başarılı' },
  });
  resumeFarm(steamID);
}

// Stops simultaneous hour boosting. deferContinue: card farming should not be resumed right away
// (if the automatic renewal will start again with the same selection).
function boostFinish(steamID, cause, deferContinue) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b) return;
  const wasRunning = b.runningFlag;
  boostClear(s);
  b.runningFlag = false;
  if (wasRunning) {
    try { if (s.engine) s.engine.stop('hours'); } catch (_) {}
  }
  const broadcast = accountBroadcast(steamID);
  broadcast('boost:sync', { running: false });
  broadcast('boost:tick', { running: false, cause: cause || 'user' });
  if (wasRunning && !deferContinue) resumeFarm(steamID);
}
function boostStopAccount(steamID, cause) { boostFinish(steamID, cause || 'user'); }

// Sequential idling (Saat Yükseltici, "eş zamanlı" off): one by one, `durationMs` each.
// Uses FarmController's 'sequential' mode; a separate instance so it does not clash with card farming.
function sequentialBroadcast(steamID) {
  const broadcast = accountBroadcast(steamID);
  return (channelName, payloadData) => {
    broadcast('hoursFarm:tick', payloadData);
    if (!payloadData || payloadData.running || !payloadData.wasRunning) return;
    const s = accounts.get(steamID);
    if (s && !s.hoursFarm.running) {
      if (payloadData.cause === 'finished') {
        accountEvent(steamID, {
          typeName: 'boostFinished',
          feedEntry: { kind: 'hours', title: 'Saat Yükseltici', text: 'Sıralı kuyruk tamamlandı.', status: 'Başarılı' },
        });
      }
      if (payloadData.cause !== 'boost' && payloadData.cause !== 'setting') resumeFarm(steamID);
    }
  };
}
function startSequential(steamID, request) {
  const s = accounts.get(steamID);
  if (!s || !s.engine || !s.ready) return { ok: false, error: 'Bağlı değil.' };
  if (s.boost && s.boost.runningFlag) boostFinish(steamID, 'sequential', true);
  if (settings.pauseFarmOnBoost) delayFarm(steamID, 'sirali saat yukseltme');
  if (!s.hoursFarm) s.hoursFarm = new FarmController(s.engine, sequentialBroadcast(steamID), 'sequential');
  s.hoursFarm.engine = s.engine;
  s.sequentialRequest = { games: request.games || [], durationMs: request.durationMs, loop: request.loop !== false };
  // "Oyun sırasını karıştır" only makes sense here: since games are opened one by one the order
  // shows on the profile. In simultaneous boosting all are open together and the order has no effect.
  s.hoursFarm.start('sequential', s.sequentialRequest.games, s.sequentialRequest.durationMs, {
    loop: s.sequentialRequest.loop, shuffle: !!settings.shuffleBoost, proceeding: request.proceeding || null,
  });
  return { ok: true };
}
// ================== REALISTIC MODE (G2) ==================
// Purpose: to keep a single game open and over the chosen time unlock the achievements from the MOST COMMON TO THE RARE,
// at random intervals. It leaves a trail as if the game had really been played: first the achievements
// everybody unlocks, then the rare ones; not all at once, spread over the time.
//
// Why rarity order: in a real player too the entry level achievements unlock first. Unlocking hundreds of
// achievements in a minute stands out right away on the profile and on third party sites.
// G11: the page was renewed according to the template. The engine now does this extra:
//   - GAME QUEUE: more than one game is processed in turn (if "Sırayı otomatik başlat" is off
//     it stops after the first game).
//   - TARGET COUNT: the user can say "unlock this many achievements"; the queue is trimmed toward the front.
//   - DISTRIBUTION MODEL: the unlock times are placed on a linear, exponential or Pareto curve.
//   - A GAME WITH NO ACHIEVEMENTS: only collect hours / skip / stop the queue.
// The state is in the account's slot (s.gercekci). It used to be a single global variable and it unlocked the achievements
// with the engine of the account open on screen at that moment: if the account was changed while the job ran the following
// achievements would be unlocked ON THE WRONG ACCOUNT.
function realisticStatus(steamID) {
  const s = accounts.get(steamID);
  return s ? s.realistic : null;
}
function realisticClear(steamID) {
  const s = accounts.get(steamID);
  if (!s) return;
  if (s.realistic && s.realistic.timer) clearTimeout(s.realistic.timer);
  s.realistic = null;
}

// The proportional time (0..1) of the i-th unlock in the session according to the model.
// linear : even intervals
// exp    : frequent at first, then sparse (a real player gets more achievements in the first hours)
// pareto : 80% of the achievements in 20% of the time - a "reset everything from the start" look
function realisticModelRatio(p, model) {
  const q = Math.min(1, Math.max(0, p));
  if (model === 'exp') {
    const k = 2.5;
    return (1 - Math.exp(-k * q)) / (1 - Math.exp(-k));
  }
  if (model === 'pareto') {
    // 0.8 -> 0.2 mapping: q^(ln0.2/ln0.8)
    return Math.pow(q, Math.log(0.2) / Math.log(0.8));
  }
  return q;
}

// ---- OVERDUE ACHIEVEMENT BACKLOG ----
// If a game has been played for hours but no achievement was unlocked there is a BACKLOG: a real
// player would already have got a lot of achievements in those hours. Spreading this backlog evenly over the whole session
// looks wrong - like the first achievement of a 100 hour game coming two hours later. Instead the
// backlog flows first, fast; then the rhythm returns to normal.
//
// Backlog = "the expected number of unlocks up to this hour" minus "the ones really unlocked".
// Since the expected number depends on the playtime the measure is directly TIME based: a few achievements
// in a 1 hour game, far more in a 100 hour one.
const DELAY_UPPER_LIMIT = 0.6;      // at most 60% of the queue counts as backlog

function realisticAccum(details) {
  const b = details || {};
  const sumTotal = +b.totalAchievements || 0;
  const playedHours = Math.max(0, (+b.playtimeMin || 0) / 60);
  const tcHours = Math.max(1, +b.tcHours || 0);
  const difficulty = Math.max(0.1, +b.difficultyValue || 1.2);
  if (!sumTotal || !playedHours) return 0;
  // The number that SHOULD have been unlocked up to this hour, capped by the total.
  const expected = Math.min(sumTotal, sumTotal * (playedHours / (tcHours * difficulty)));
  return Math.max(0, Math.round(expected - (+b.unlockedState || 0)));
}

// ---- RARITY WEIGHT ----
// When the time was divided equally over the queue an ultra rare achievement and a common one got the same interval;
// what is more, since the rare ones are at the end of the queue they fell into the slow part of the session.
// Now the time is divided WITH WEIGHTS: only the ultra rare ones (under 5%) wait long, the rest flow
// even and fast. What stands out on a profile is how soon the ultra rare one came;
// a 10% achievement unlocking fast does not draw attention.
function realisticRarityWeight(pct, ultraMultiplier) {
  if (!Number.isFinite(pct)) return 1;
  return pct < 5 ? Math.max(1, ultraMultiplier || 3) : 1;
}

// Writes the unlock times into the queue (ms relative to the start of the session).
//   birikim > 0 : the first that many achievements are squeezed into the start of the session
//   ayar        : { hizCarpani, ultraMultiplier, telafiPayi, bitmis, finishedRatio }
function placeRealisticTimes(queue, durationMs, model, accumulation, setting) {
  const n = queue.length;
  if (!n) return queue;
  const a = setting || {};
  const hiz = Math.max(0.1, Math.min(4, +a.speedMultiplier || 1));
  const ultra = Math.max(1, Math.min(10, +a.ultraMultiplier || 3));
  const compensationShare = Math.max(0.02, Math.min(0.9, +a.compensationShare || 0.2));
  // If the game is already finished (playtime >= completion time) there is no point imitating the learning curve:
  // the schedule is compressed as a whole. The session itself is not shortened, only the unlocks
  // end early - with "basarimlar bitince saati surdur" on it keeps collecting hours.
  const finishedRatio = a.finishedFlag ? Math.max(0.05, Math.min(1, +a.finishedRatio || 0.5)) : 1;
  const activeDuration = Math.max(60000, Math.round(durationMs * hiz * finishedRatio));

  const fast = Math.min(Math.floor(n * DELAY_UPPER_LIMIT), Math.max(0, +accumulation || 0));
  const fastDuration = fast ? Math.round(activeDuration * compensationShare) : 0;
  const remainingTime = activeDuration - fastDuration;
  const remainders = queue.slice(fast);
  const weights = remainders.map((x) => realisticRarityWeight(x.rarityPct, ultra));
  const totalWeight = weights.reduce((t, x) => t + x, 0) || 1;

  let kum = 0;
  queue.forEach((x, i) => {
    if (i < fast) {
      x.timeValue = Math.round(fastDuration * ((i + 1) / fast));
      x.delayCompensation = true;
    } else {
      kum += weights[i - fast];
      x.timeValue = fastDuration + Math.round(remainingTime * realisticModelRatio(kum / totalWeight, model));
    }
  });
  return queue;
}

function realisticNotify(steamID, extra) {
  const d = realisticStatus(steamID);
  const a = d ? d.activeIds : null;
  accountBroadcast(steamID)('realistic:tick', Object.assign({
    runningFlag: !!d,
    appid: a ? a.appid : null,
    gameTitle: a ? a.gameTitle : null,
    // toplam/acilan describe the WHOLE session; the queue can hold more than one game.
    totalSum: d ? d.totalGoal : 0,
    openedGames: d ? d.totalUnlocked : 0,
    failure: d ? d.totalErrors : 0,
    startPoint: d ? d.startPoint : 0,
    finishTime: d ? d.finishTime : 0,
    upNext: a && a.queueList[a.indexNum] ? a.queueList[a.indexNum].name : null,
    upNextPct: a && a.queueList[a.indexNum] ? a.queueList[a.indexNum].rarityPct : null,
    upNextTime: d ? d.upNextTime : 0,
    gameCount: d ? d.gameEntries.length : 0,
    gameIndex: d ? d.gameIndex : 0,
    averageIntervalMs: d ? d.averageIntervalMs : 0,
  }, extra || {}));
}

// Computes when the next unlock will happen. It waits according to the target time the model gives;
// with "Rastgele aralik" on a +-40% deviation is added on top - so that no fixed rhythm forms.
function realisticNextDelay(d) {
  const a = d.activeIds;
  const remainingCount = a.queueList.length - a.indexNum;
  if (remainingCount <= 0) return 0;
  const goalTime = a.startPoint + (a.queueList[a.indexNum].timeValue || 0);
  let g = goalTime - Date.now();
  if (!(g > 0)) {
    // The model time has passed (happens at the start or in a delay): divide the remaining time.
    g = Math.max(0, a.finishTime - Date.now()) / remainingCount;
  }
  if (d.optionList.randomInterval) {
    const deviation = g * 0.4;
    g = g - deviation + Math.random() * deviation * 2;
  }
  return Math.max(3000, Math.round(g));   // at least 3 seconds
}

async function realisticStep(steamID) {
  const s = accounts.get(steamID);
  const d = s && s.realistic;
  if (!d) return;
  if (!s.engine) { realisticFinish(steamID, 'baglanti yok'); return; }
  // If the connection is down an achievement cannot be sent; it continues when the engine reconnects.
  if (!s.ready) { d.timer = setTimeout(() => realisticStep(steamID), 30000); return; }
  const a = d.activeIds;
  const goal = a.queueList[a.indexNum];
  if (!goal) {
    // This game's achievements are done. If there is another game in the queue it moves on to it; if not, with "Başarımlar
    // bitince saati sürdür" on the game stays open until the end of the time (it keeps boosting hours).
    log('info', '[' + accountName(steamID) + '] realistic mode: ' + a.gameTitle + ' achievements done');
    realisticNotify(steamID, { achievementsDone: true });
    if (realisticNextGame(steamID)) return;
    if (d.optionList.continueHours && Date.now() < d.finishTime) {
      d.timer = setTimeout(() => { if (realisticStatus(steamID) === d) realisticFinish(steamID, 'sure doldu'); }, d.finishTime - Date.now());
    } else {
      realisticFinish(steamID, Date.now() >= d.finishTime ? 'sure doldu' : 'tum basarimlar acildi');
    }
    return;
  }

  try {
    await s.engine.setAchievements(a.appid, [{ apiName: goal.apiName, unlock: true }]);
    a.openedGames++; d.totalUnlocked++;
    log('info', '[' + accountName(steamID) + '] realistic mode: unlocked -> ' + goal.name + ' (%' + (goal.rarityPct != null ? goal.rarityPct.toFixed(1) : '?') + ')');
    accountBroadcast(steamID)('realistic:opened', {
      appid: a.appid, gameTitle: a.gameTitle, apiName: goal.apiName,
      name: goal.name, rarityPct: goal.rarityPct,
    });
    const v = accountData(steamID);
    v.achLog.unshift({ appid: a.appid, game: a.gameTitle, apiName: goal.apiName, name: goal.name, unlock: true, ts: Date.now() });
    if (v.achLog.length > 2000) v.achLog.length = 2000;
    writeAccountDataDelayed(steamID);
    if (steamID !== activeSteamID) {
      addFeed(steamID, { kind: 'card', title: 'Başarım açıldı', text: goal.name + ' · ' + a.gameTitle, status: 'Başarılı' });
    }
  } catch (e) {
    a.failure++; d.totalErrors++;
    log('warn', '[' + accountName(steamID) + '] realistic mode: could not unlock -> ' + goal.name + ': ' + (e && e.message));
  }
  if (s.realistic !== d) return;          // it was stopped in the meantime
  a.indexNum++;

  if (Date.now() >= d.finishTime && a.indexNum < a.queueList.length) {
    // The time is up but achievements are left - we do not force the rest, we tell the user.
    realisticFinish(steamID, 'sure doldu, ' + (a.queueList.length - a.indexNum) + ' basarim acilmadi');
    return;
  }
  const delay = realisticNextDelay(d);
  d.upNextTime = Date.now() + delay;
  realisticNotify(steamID);
  d.timer = setTimeout(() => realisticStep(steamID), delay);
}

// Moves to the next game in the queue. Returns true if the move was made.
function realisticNextGame(steamID) {
  const s = accounts.get(steamID);
  const d = s && s.realistic;
  if (!d) return false;
  if (!d.optionList.autoOrder) return false;             // "Sırayı otomatik başlat" is off
  while (d.gameIndex + 1 < d.gameEntries.length) {
    d.gameIndex++;
    const o = d.gameEntries[d.gameIndex];
    const remainingTime = d.finishTime - Date.now();
    if (remainingTime <= 5000) return false;               // the time is over, there is no point moving on
    const ready = d.preparing[o.appid];
    if (!ready) continue;
    // A game with no achievements left to unlock does not wait in line: this page only unlocks achievements,
    // the Hour Booster exists for boosting hours. There used to be a three option setting here
    // (collect hours / skip / stop the queue); none of the three was this page's job.
    if (!ready.queueList.length) { log('info', 'realistic mode: ' + o.name + ' skipped (no achievement to unlock)'); continue; }
    // We divide the remaining time among the remaining games according to their achievement count.
    const remainingGames = d.gameEntries.slice(d.gameIndex);
    const remainingTotalCount = remainingGames.reduce((t, x) => t + ((d.preparing[x.appid] || { queueList: [] }).queueList.length || 1), 0);
    const thisCount = ready.queueList.length || 1;
    const share = Math.max(60000, Math.round(remainingTime * (thisCount / remainingTotalCount)));
    const currentTime = Date.now();
    d.activeIds = {
      appid: o.appid, gameTitle: o.name,
      queueList: placeRealisticTimes(ready.queueList, share, d.optionList.model,
                                         computeRealisticAccum(o.appid, ready, d.optionList),
                                         realisticTimeSetting(o.appid, d.optionList)),
      indexNum: 0, openedGames: 0, failure: 0, startPoint: currentTime, finishTime: currentTime + share,
    };
    try { s.engine.play([o.appid], 'realistic'); } catch (_) {}
    log('info', '[' + accountName(steamID) + '] realistic mode: next ' + o.name + ' (' + ready.queueList.length + ' achievements, '
      + (share / 60000).toFixed(0) + ' dk)');
    const delay = ready.queueList.length ? realisticNextDelay(d) : Math.max(0, d.activeIds.finishTime - Date.now());
    d.upNextTime = Date.now() + delay;
    realisticNotify(steamID, { gameChanged: true });
    d.timer = setTimeout(() => { if (realisticStatus(steamID) === d) realisticStep(steamID); }, delay);
    return true;
  }
  return false;
}

// The end reason is shown in the interface; the text is translated in the dictionary (the key is this Turkish text).
const REALISTIC_REASON = {
  'sure doldu': 'Süre doldu', 'tum basarimlar acildi': 'Tüm başarımlar açıldı',
  'kullanici durdurdu': 'Durduruldu', 'baglanti yok': 'Steam bağlantısı yok',
};
function realisticFinish(steamID, cause) {
  const s = accounts.get(steamID);
  const d = s && s.realistic;
  if (!d) return;
  const remainingUnopened = /^sure doldu, (\d+)/.exec(cause || '');
  // The text is translated in the interface; its version that carries a number is a '#' pattern key in the dictionary.
  const reasonText = remainingUnopened ? 'Süre doldu, # başarım açılmadı'.replace('#', remainingUnopened[1]) : (REALISTIC_REASON[cause] || cause);
  const summary = { openedGames: d.totalUnlocked, failure: d.totalErrors, totalSum: d.totalGoal, cause: reasonText };
  try { if (s.engine) s.engine.stop('realistic'); } catch (_) {}
  realisticClear(steamID);
  log('info', '[' + accountName(steamID) + '] realistic mode done: ' + cause + ' (' + summary.openedGames + '/' + summary.totalSum + ')');
  accountBroadcast(steamID)('realistic:tick', Object.assign({ runningFlag: false, isFinished: true }, summary));
  if (steamID !== activeSteamID) {
    addFeed(steamID, { kind: summary.failure ? 'error' : 'card', title: 'Gerçekçi Mod',
      text: reasonText + ' · ' + summary.openedGames + ' / ' + summary.totalSum, status: summary.failure ? 'Hata' : 'Başarılı' });
  }
  resumeFarm(steamID);
}

// Prepares a game's unlockable achievement queue (ordering + trimming).
// FROM COMMON TO RARE: a LARGER rarityPct means more common, that one is unlocked first.
// ---- LEDGER OF GAMES WITHOUT ACHIEVEMENTS ----
// Realistic Mode only unlocks achievements. A game with no achievements has nothing to do on this page:
// there are separate pages for boosting hours, skipping or stopping the queue. The hasStats flag on Steam's
// library endpoint is not reliable - some games return true and give no schema.
// Only the schema request tells the truth, and that takes seconds. So a result learned once
// is written to disk and that game never shows up in this page's list again.
// BY APPID and independent of the account: achievements are a property of the game, not of the account.
const NO_ACHIEVEMENTS_FILE = path.join(CACHE_DIR, 'basarimsiz.json');
let noAchievementsSet = new Set();
function loadNoAchievements() {
  const r = readJson(NO_ACHIEVEMENTS_FILE);
  const listing = (r.ok && r.dataBlock && Array.isArray(r.dataBlock.appids)) ? r.dataBlock.appids : [];
  noAchievementsSet = new Set(listing.map((x) => +x).filter(Boolean));
}
function saveNoAchievements() {
  writeJson(NO_ACHIEVEMENTS_FILE, { appids: [...noAchievementsSet], upToDate: Date.now() }, false);
}
function markNoAchievements(appid) {
  const id = +appid;
  if (!id || noAchievementsSet.has(id)) return false;
  noAchievementsSet.add(id);
  saveNoAchievements();
  log('info', 'realistic mode: ' + id + ' marked as having no achievements, dropped from the list');
  return true;
}
loadNoAchievements();

ipcMain.handle('realistic:noAchievementsList', () => ({ ok: true, appids: [...noAchievementsSet] }));
ipcMain.handle('realistic:noAchievementsClear', () => {
  const n = noAchievementsSet.size;
  noAchievementsSet = new Set();
  saveNoAchievements();
  log('info', 'realistic mode: the no-achievement list was cleared (' + n + ' games)');
  return { ok: true, deleted: n };
});

async function prepareRealisticQueue(motor, appid, options) {
  const data = await motor.getAchievements(appid);
  const everything = (data && Array.isArray(data.achievements)) ? data.achievements : null;
  if (!everything || !everything.length) {
    markNoAchievements(appid);
    return { ok: false, noAchievements: true, error: 'Bu oyunun başarımı yok.', gameTitle: (data && data.gameName) || null };
  }
  // Locked + not protected. Protected ones are rejected by Steam (see G4).
  let suitable = everything.filter((a) => !a.achieved && !a.protectedFlag);
  const protected = everything.filter((a) => !a.achieved && a.protectedFlag).length;
  // "Ultra Nadir Başarımları Atla": those under 5% are the ones that stand out most on a profile.
  let ultraSkipped = 0;
  if (options.ultraRareSkip) {
    const earlier = suitable.length;
    suitable = suitable.filter((a) => !Number.isFinite(a.rarityPct) || a.rarityPct >= 5);
    ultraSkipped = earlier - suitable.length;
  }
  suitable.sort((x, y) => {
    const a = Number.isFinite(x.rarityPct) ? x.rarityPct : -1;
    const b = Number.isFinite(y.rarityPct) ? y.rarityPct : -1;
    return b - a;
  });
  // Target count: trimmed from the start (the most common).
  const goal = +options.goalValue || 0;
  const clipped = (goal > 0 && goal < suitable.length) ? suitable.slice(0, goal) : suitable;
  return {
    ok: true,
    gameTitle: data.gameName || ('App ' + appid),
    queueList: clipped.map((a) => ({ apiName: a.apiName, name: a.name, rarityPct: a.rarityPct })),
    suitableTotal: suitable.length,
    protectedFlag: protected,
    ultraSkipped: ultraSkipped,
    totalAchievements: everything.length,
    unlockedState: everything.filter((a) => a.achieved).length,
  };
}

// The completed form of the incoming options. Even if the interface sends them incomplete the engine works consistently.
function realisticOptions(s) {
  const g = s || {};
  return {
    goalValue: Math.max(0, +g.goalValue || 0),                       // 0 = all
    model: ['linear', 'exp', 'pareto'].includes(g.model) ? g.model : 'linear',
    randomInterval: g.randomInterval !== false,
    ultraRareSkip: !!g.ultraRareSkip,
    autoOrder: g.autoOrder !== false,
    continueHours: g.continueHours !== false,
    // Squeeze the overdue achievement backlog into the start of the session. The size of the backlog depends on the game's
    // PLAYTIME: a few in a 1 hour game, far more in a 100 hour one.
    // Tc and the difficulty come from the interface (they are already computed there).
    accelerateDelayed: !!g.accelerateDelayed,
    speedMultiplier: Math.max(0.1, Math.min(4, +g.speedMultiplier || 1)),
    ultraMultiplier: Math.max(1, Math.min(10, +g.ultraMultiplier || 3)),
    compensationShare: Math.max(0.02, Math.min(0.9, +g.compensationShare || 0.2)),
    finishedRatio: Math.max(0.05, Math.min(1, +g.finishedRatio || 0.5)),
    tcHours: Math.max(1, +g.tcHours || 0) || 20,
    difficultyValue: Math.max(0.1, +g.difficultyValue || 0) || 1.2,
    playtime: (g.playtime && typeof g.playtime === 'object') ? g.playtime : {},
  };
}

// Timing settings. 'bitmis' changes per game: if the playtime has passed the completion time.
function realisticTimeSetting(appid, pick) {
  const playedHours = (pick.playtime[appid] || pick.playtime[String(appid)] || 0) / 60;
  return {
    speedMultiplier: pick.speedMultiplier,
    ultraMultiplier: pick.ultraMultiplier,
    compensationShare: pick.compensationShare,
    finishedFlag: playedHours > 0 && playedHours >= pick.tcHours,
    finishedRatio: pick.finishedRatio,
  };
}

// A game's backlog: 0 if the option is off.
function computeRealisticAccum(appid, h, pick) {
  if (!pick.accelerateDelayed) return 0;
  return realisticAccum({
    totalAchievements: h.totalAchievements,
    unlockedState: h.unlockedState,
    playtimeMin: pick.playtime[appid] || pick.playtime[String(appid)] || 0,
    tcHours: pick.tcHours,
    difficultyValue: pick.difficultyValue,
  });
}

// Preview: how many achievements, in what order, at which minute they will unlock.
// If durationMs is not given the hours field is used (the old call form works too).
ipcMain.handle('realistic:plan', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const { appid, hours: hour, spanMs: durationMs } = arg || {};
  const pick = realisticOptions(arg && arg.optionList);
  const duration = Math.max(60000, +durationMs || (Math.max(1, +hour || 1) * 3600000));
  try {
    const h = await prepareRealisticQueue(engine, appid, pick);
    if (!h.ok) return h;
    const accumulation = computeRealisticAccum(appid, h, pick);
    placeRealisticTimes(h.queueList, duration, pick.model, accumulation, realisticTimeSetting(appid, pick));
    return {
      ok: true,
      // The interface shows this as an "N achievements overdue" note.
      accumulation: Math.min(accumulation, h.queueList.length),
      appid: +appid,
      gameTitle: h.gameTitle,
      totalSum: h.queueList.length,          // to be unlocked (trimmed by the target)
      suitableTotal: h.suitableTotal,       // all of the unlockable ones
      totalAchievements: h.totalAchievements,
      unlockedState: h.unlockedState,
      protectedFlag: h.protectedFlag,
      ultraSkipped: h.ultraSkipped,
      spanMs: duration,
      model: pick.model,
      averageIntervalMs: h.queueList.length ? Math.round(duration / h.queueList.length) : 0,
      // Full list: the interface draws the "Açılma Sırası" table from this.
      queueList: h.queueList.map((a) => ({ name: a.name, rarityPct: a.rarityPct, timeValue: a.timeValue })),
    };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Start. oyunlar: [appid, ...] - the queue. A single game goes through the same path.
ipcMain.handle('realistic:start', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const steamID = activeSteamID;
  const s = accounts.get(steamID);
  if (!s) return { ok: false, error: 'Bağlı değil.' };
  if (s.realistic) return { ok: false, error: 'Zaten çalışıyor.' };
  const motor = s.engine;
  const { appid, hours: hour, spanMs: durationMs } = arg || {};
  const pick = realisticOptions(arg && arg.optionList);
  const duration = Math.max(60000, +durationMs || (Math.max(1, +hour || 1) * 3600000));
  const listing = (Array.isArray(arg && arg.gameEntries) && arg.gameEntries.length)
    ? arg.gameEntries.map((x) => +x)
    : [+appid];
  if (!listing.length || !listing[0]) return { ok: false, error: 'Oyun seçilmedi.' };
  try {
    // The queues of ALL games are prepared FIRST: sharing the time can only be done right once every game's
    // achievement count is known, and the error is seen before the first game starts.
    const prepared = {};
    const gameList = [];
    for (const id of listing) {
      const h = await prepareRealisticQueue(motor, id, pick);
      // A game that turned out to have no achievements was written to the ledger and is silently dropped - the interface will
      // remove it from the list anyway, there is no point stopping the queue or boosting hours.
      if (!h.ok) continue;
      prepared[id] = h;
      gameList.push({ appid: id, name: h.gameTitle });
    }
    if (!gameList.length) return { ok: false, error: 'Seçilen oyunların başarım şeması okunamadı.' };

    // A game with no locked achievement left to unlock is removed from the queue.
    const willRun = gameList.filter((o) => prepared[o.appid].queueList.length);
    if (!willRun.length) return { ok: false, error: 'Seçilen oyunlarda açılabilecek kilitli başarım yok.' };

    const totalTarget = willRun.reduce((t, o) => t + prepared[o.appid].queueList.length, 0);
    const totalCount = willRun.reduce((t, o) => t + (prepared[o.appid].queueList.length || 1), 0);

    // If another start came in during preparation a second job is not opened.
    if (s.realistic) return { ok: false, error: 'Zaten çalışıyor.' };
    // If it runs at the same time as card farming both write the same game list; so they do not clash.
    if (settings.pauseFarmOnBoost) delayFarm(steamID, 'gercekci mod');

    const firstGame = willRun[0];
    const firstReady = prepared[firstGame.appid];
    const firstShare = Math.max(60000, Math.round(duration * ((firstReady.queueList.length || 1) / totalCount)));
    const currentTime = Date.now();
    motor.play([firstGame.appid], 'realistic');
    const d = {
      gameEntries: willRun,
      gameIndex: 0,
      preparing: prepared,
      optionList: pick,
      totalGoal: totalTarget,
      totalUnlocked: 0,
      totalErrors: 0,
      averageIntervalMs: totalTarget ? Math.round(duration / totalTarget) : 0,
      startPoint: currentTime,
      finishTime: currentTime + duration,
      timer: null,
      upNextTime: 0,
      activeIds: {
        appid: firstGame.appid, gameTitle: firstGame.name,
        queueList: placeRealisticTimes(firstReady.queueList, firstShare, pick.model,
                                           computeRealisticAccum(firstGame.appid, firstReady, pick),
                                           realisticTimeSetting(firstGame.appid, pick)),
        indexNum: 0, openedGames: 0, failure: 0,
        startPoint: currentTime, finishTime: currentTime + firstShare,
      },
    };
    s.realistic = d;
    log('info', '[' + accountName(steamID) + '] realistic mode started: ' + willRun.length + ' games, ' + totalTarget + ' achievements, '
      + (duration / 3600000).toFixed(2) + ' saat, model=' + pick.model);
    // The first unlock is not immediate - it is not realistic for an achievement to come the moment the game opens.
    const initial = firstReady.queueList.length
      ? realisticNextDelay(d)
      : Math.max(0, d.activeIds.finishTime - Date.now());
    d.upNextTime = Date.now() + initial;
    realisticNotify(steamID);
    d.timer = setTimeout(() => { if (realisticStatus(steamID) === d) realisticStep(steamID); }, initial);
    return { ok: true, totalSum: totalTarget, gameCount: willRun.length, gameTitle: firstGame.name };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.on('realistic:stop', () => { if (realisticStatus(activeSteamID)) realisticFinish(activeSteamID, 'kullanici durdurdu'); });

ipcMain.on('engine:boostStart', (_e, { appids, durationMs, games, allItems: allOfIt }) => {
  if (!activeSteamID) return;
  const s = accounts.get(activeSteamID);
  if (s) cancelSettingWaits(s, 'boost');
  boostStart(activeSteamID, { appids, durationMs, games, allItems: allOfIt });
});
ipcMain.on('engine:boostStop', () => {
  if (!activeSteamID) return;
  // When a setting is applied a paused job must not come back a few seconds later after the user stopped it
  const s = accounts.get(activeSteamID);
  if (s) cancelSettingWaits(s, 'boost');
  boostFinish(activeSteamID, 'user');
});

// Sync preview: shows how many steps and how long are needed before starting.
ipcMain.handle('engine:boostSyncPlan', async (_e, { games, mode, targetHours }) => {
  if (!Array.isArray(games) || !games.length) return { ok: false, error: 'Oyun seçilmedi.' };
  let targetMin;
  if (mode === 'manual') targetMin = Math.max(0, Math.round((+targetHours || 0) * 60));
  else if (mode === 'library') {
    if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
    try {
      const owned = await engine.getOwnedGames();
      targetMin = owned.reduce((m, g) => Math.max(m, g.playtimeForever || 0), 0);
      settings.boostSyncLibraryMaxMin = targetMin; saveSettings();
    } catch (e) { return { ok: false, error: e.message }; }
  } else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

  const behind = games.filter((g) => (g.playtimeMin || 0) < targetMin);
  const strategy = settings.boostSyncStrategy || 'parallel';

  if (strategy === 'parallel') {
    const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
    const sim = simulateSync(games, targetMin, limit);
    // Also give when each game will finish: the user will see the plan and confirm it.
    const finishes = [];
    const remaining = new Map(behind.map((g) => [g.appid, (targetMin - (g.playtimeMin || 0)) * 60000]));
    let t = 0;
    for (const as of sim.stages) {
      t += as.spanMs;
      as.ids.forEach((id) => {
        const k = remaining.get(id);
        if (k == null) return;
        const newItem = k - as.spanMs;
        if (newItem <= 0) { finishes.push({ appid: id, finishMs: t }); remaining.delete(id); }
        else remaining.set(id, newItem);
      });
    }
    return {
      ok: true, strategyName: 'parallel', targetMin, totalMs: sim.totalMillis, limit,
      behind: behind.length,
      stageCount: sim.stages.length,
      firstActive: Math.min(behind.length, limit),
      finishTimes: finishes.sort((a, b) => a.finishMs - b.finishMs).map((x) => {
        const g = games.find((y) => y.appid === x.appid);
        return { appid: x.appid, name: (g && g.name) || ('App ' + x.appid), finishMs: x.finishMs };
      }),
      steps: [],
    };
  }

  const steps = buildSyncSteps(games, targetMin);
  const totalMs = steps.reduce((s, st) => s + (st.toMin - st.fromMin) * 60000, 0);
  return {
    ok: true, strategyName: 'staged', targetMin, totalMs,
    steps: steps.map((st) => ({ count: st.ids.length, ids: st.ids, fromMin: st.fromMin, toMin: st.toMin })),
    behind: behind.length,
  };
});

ipcMain.on('engine:boostStartSeq', (_e, { games, durationMs, loop }) => {
  if (!activeSteamID) return;
  startSequential(activeSteamID, { games, durationMs, loop });
});
ipcMain.on('engine:boostStopSeq', () => {
  const s = accounts.get(activeSteamID);
  if (s && s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('user');
});

ipcMain.on('engine:startFarm', (_e, { mode, games, durationMs }) => {
  if (!engineReady || !engine || !activeSteamID) return;
  // The card threshold was REMOVED: every game with cards left joins the queue. The threshold silently skipped games
  // with a single card left and led to the "why is it not dropping" question.
  const s = slotOf(activeSteamID);
  s.pendingFarm = null;
  cancelSettingWaits(s, 'card');
  startCardFarm(activeSteamID, mode, games || [], durationMs);
});
ipcMain.on('engine:stopFarm', () => {
  const s = accounts.get(activeSteamID);
  if (!s) return;
  s.pendingFarm = null;
  cancelSettingWaits(s, 'card');
  if (s.farm && s.farm.running) s.farm.stop('user');
});
ipcMain.handle('engine:playing', () => (engineReady && engine) ? engine.playing : []);

// ---- CHAT ----
// All of it goes through the ACTIVE account's engine. The chat of background accounts is not looked at:
// there is a single identity on screen, showing two accounts' conversations in the same list would be confusing.
function chatEngine() {
  if (!engineReady || !engine) return null;
  return engine;
}
ipcMain.handle('chat:friends', async () => {
  const e = chatEngine();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, friends: await e.getFriends() }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:conversations', async () => {
  const e = chatEngine();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, conversationList: await e.getConversations() }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:history', async (_ev, arg) => {
  const e = chatEngine();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  const { steamid, itemCount: count } = arg || {};
  if (!steamid) return { ok: false, error: 'Kişi seçilmedi.' };
  try { return Object.assign({ ok: true }, await e.getChatHistory(steamid, count)); }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:send', async (_ev, arg) => {
  const e = chatEngine();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  const { steamid, textValue: text } = arg || {};
  try {
    const r = await e.sendChat(steamid, text);
    log('info', 'chat: message sent -> ' + steamid);
    return { ok: true, ts: r.ts };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:read', async (_ev, steamid) => {
  const e = chatEngine();
  if (!e) return { ok: false };
  await e.markChatRead(steamid);
  return { ok: true };
});
ipcMain.on('chat:typing', (_ev, steamid) => {
  const e = chatEngine();
  if (e && steamid) e.sendTyping(steamid);
});

// ---- Session timeout (Ayarlar > Gelişmiş) ----
// The renderer sends 'session:activity' on every user interaction. If there is no interaction for the
// set time the Steam sessions are closed. If card farming, hour boosting or Realistic Mode is running on an account
// it is NOT closed: closing an app that is working in the background as "idle" would cut the job
// in half. If the job is still running when the time is up the counter is set up again.
let idleTimer = null;
function armIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const mins = parseInt(settings.sessionTimeout, 10);
  if (!mins || isNaN(mins)) return;             // 'never'
  idleTimer = setTimeout(() => {
    let runningItem = false;
    accounts.forEach((s) => { if (accountRunning(s)) runningItem = true; });
    if (runningItem) { armIdleTimer(); return; }
    log('warn', `Session idle for ${mins} min - closing ALL accounts`);
    disconnectAll();
    try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
    if (win) {
      win.setMinimumSize(900, 700);
      centerDefaultSize();
      win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
    }
  }, mins * 60 * 1000);
}
ipcMain.on('session:activity', armIdleTimer);

// ---- settings IPC ----
// The settings object that goes to the renderer. accountCurrency = the account's Steam wallet currency (prices are fetched in
// this currency and shown EXACTLY in this currency; no conversion is done).
function publicSettings() {
  // The same source as getPrice - the symbol the interface shows, the currency the amount was really fetched in.
  const accountCurrency = currentPriceCurrency();
  return {
    ...settings,
    persona: engine && engine.persona,
    steamID: engine && engine.steamID,
    accountCurrency,
  };
}
// Settings that go to the interface: the ACTIVE ACCOUNT's own values are laid over the general settings.
// So the renderer side sees the right account's data without knowing anything.
function accountSettingsAdded(basis) {
  const v = activeAccountData();
  const output = { ...basis };
  ACCOUNT_SETTING_KEYS.forEach((k) => { if (k in v) output[k] = v[k]; });
  return output;
}
ipcMain.handle('settings:get', () => {
  return accountSettingsAdded(publicSettings());
});
// Handles the settings patch: account specific keys go to the account file, the rest to the settings file.
// Only the keys that REALLY changed are written and applied; the running jobs affected by the change
// are resumed with the new setting. Session fields (persona, steamID, currency) are never written:
// "Geri Al" used to send back the whole settings object and these got into the settings file.
const SESSION_FIELDS = ['persona', 'steamID', 'accountCurrency'];
function applySettingPatch(patch) {
  const received = { ...(patch || {}) };
  SESSION_FIELDS.forEach((k) => { delete received[k]; });
  let writtenToAccount = false;
  ACCOUNT_SETTING_KEYS.forEach((k) => {
    if (k in received) {
      activeAccountData()[k] = received[k];
      delete received[k];
      writtenToAccount = true;
    }
  });
  if (writtenToAccount) writeAccountData(activeSteamID);
  const changed = Object.keys(received).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(received[k]));
  if (!changed.length) return { ok: true, changedOne: changed, appliedOne: [] };
  const old = settings;
  settings = { ...settings };
  changed.forEach((k) => { settings[k] = received[k]; });
  if (!saveSettings()) {
    settings = old;
    return { ok: false, changedOne: [], appliedOne: [], error: 'Ayar dosyası yazılamadı. Açılışta okunamadığı için korunuyor olabilir.' };
  }
  settingSaveTime = Date.now();
  applySettings();
  if (changed.includes('language')) { translation.pickLang(settings.language); setupTrayMenu(); }
  // If the retention period was shortened the extra records are deleted right away (it does not wait for startup).
  if (changed.includes('dataRetentionDays')) {
    const n = pruneAccountRecords(activeAccountData());
    if (n) { writeAccountData(activeSteamID); log('info', 'retention period changed, ' + n + ' records deleted'); }
  }
  const appliedItem = applySettingsToJobs(changed);
  log('info', 'settings saved: ' + changed.join(', ') + (appliedItem.length ? (' (applied to ' + appliedItem.length + ' jobs)') : ''));
  return { ok: true, changedOne: changed, appliedOne: appliedItem };
}
// Instant controls on pages (the Hour Booster switches, "bir daha sorma" in the confirmation window
// and the like) write from here: these are preferences that are applied with a single click anyway.
ipcMain.handle('settings:set', (_e, patch) => {
  applySettingPatch(patch);
  return accountSettingsAdded(publicSettings());
});
// The "Kaydet" button of the Settings page. The page keeps changes in a draft, only the changed keys
// come here. The reply also says which jobs will be resumed with the new setting.
ipcMain.handle('settings:save', (_e, patch) => {
  const r = applySettingPatch(patch);
  return { ...r, settings: accountSettingsAdded(publicSettings()), saveTime: settingSaveTime, pauseMs: SETTINGS_DEBOUNCE_MS };
});
// "Varsayılana Sıfırla" no longer writes anything: the defaults are loaded into the page's draft,
// applied if the user presses Kaydet. It used to write instantly and it also pulled the language to Turkish.
ipcMain.handle('settings:defaults', () => {
  const v = { ...DEFAULT_SETTINGS };
  delete v.settingsVersion;
  return v;
});
ipcMain.handle('settings:info', () => ({ saveTime: settingSaveTime }));

// ---- JOBS THAT RUN WHEN A SETTING CHANGES ----
// These settings used to be read once when a job started: the user changed a setting and saved it,
// and nothing changed in the running job. Now a job affected by the change stops for SETTINGS_DEBOUNCE_MS,
// then continues where it left off with the new setting: in card farming the position and the game's elapsed
// time, in hour boosting the start moment is kept. Those that do not need a pause (the sync
// limit, shuffling in sequential mode) change instantly.
const SETTINGS_DEBOUNCE_MS = 5000;
const CARD_JOB_SETTINGS = ['cardMaxGames', 'farmMaxMinutes', 'autoNextGame', 'fastMinPlaytimeMin', 'fastRotateMinSec', 'fastRotateMaxSec'];
function cancelSettingWaits(s, category) {
  if (!s || !s.settingWait) return;
  Object.keys(s.settingWait).forEach((k) => {
    if (category && k !== category) return;
    if (s.settingWait[k]) clearTimeout(s.settingWait[k]);
    delete s.settingWait[k];
  });
}
function setupSettingWait(s, category, fn) {
  s.settingWait = s.settingWait || {};
  if (s.settingWait[category]) clearTimeout(s.settingWait[category]);
  s.settingWait[category] = setTimeout(() => { delete s.settingWait[category]; fn(); }, SETTINGS_DEBOUNCE_MS);
}
function applyAndContinueCardFarm(steamID, changed) {
  const s = accounts.get(steamID);
  if (!s || !s.farm || !s.farm.running) return false;
  const position = s.farm.location();
  const mode = s.farm.mode;
  const games = s.farm.games.map((g) => ({ ...g }));
  // If "Oyun başına süre" changed the new time, if not the time selected on the Kart Düşür page.
  const dk = +settings.farmMaxMinutes;
  const duration = changed.has('farmMaxMinutes') && dk > 0 ? dk * 60000 : s.farm.durationMs;
  s.farm.stop('setting');
  setupSettingWait(s, 'card', () => {
    const x = accounts.get(steamID);
    if (!x || (x.farm && x.farm.running)) return;          // it was started by hand in the meantime
    if (!x.ready || !x.engine) {
      // No connection: the job should not be lost, it is kept as if it will be resumed when the connection returns / boosting ends
      x.pendingFarm = { mode, games, durationMs: duration, location: position };
      return;
    }
    startCardFarm(steamID, mode, games, duration, { proceeding: position });
  });
  return true;
}
function applyAndContinueBoost(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b || !b.runningFlag || b.sync || !b.request) return false;
  const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
  const allOfIt = b.request.allItems || b.request.games || (b.request.appids || []).map((appid) => ({ appid }));
  const newItem = allOfIt.slice(0, limit);
  const newIds = newItem.map((g) => g.appid);
  if (newIds.join(',') === (b.appids || []).join(',')) return false;
  const request = { ...b.request, appids: newIds, games: newItem, proceeding: { startPoint: b.startPoint } };
  boostFinish(steamID, 'setting', true);
  setupSettingWait(s, 'boost', () => {
    const x = accounts.get(steamID);
    if (!x || (x.boost && x.boost.runningFlag)) return;
    if (!x.ready || !x.engine) { resumeFarm(steamID); return; }
    boostStart(steamID, request);
  });
  return true;
}
function applySettingsToJobs(changed) {
  const d = new Set(changed || []);
  const summary = [];
  if (!d.size) return summary;
  accounts.forEach((s, steamID) => {
    if (!s) return;
    const accountRef = accountName(steamID);
    if (s.farm && s.farm.running && CARD_JOB_SETTINGS.some((k) => d.has(k))) {
      if (applyAndContinueCardFarm(steamID, d)) summary.push({ steamID, accountRef: accountRef, is: 'card', how: 'paused' });
    }
    const b = s.boost;
    if (b && b.runningFlag && d.has('boostMaxGames')) {
      if (b.sync && b.sync.strategyName === 'parallel') {
        b.sync.limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
        if (b.syncTimer) { clearTimeout(b.syncTimer); b.syncTimer = null; }
        scheduleSync(steamID);
        summary.push({ steamID, accountRef: accountRef, is: 'hours', how: 'instant' });
      } else if (applyAndContinueBoost(steamID)) {
        summary.push({ steamID, accountRef: accountRef, is: 'hours', how: 'paused' });
      }
    }
    // In sequential idling shuffling takes effect on the next round; no need to pause.
    if (s.hoursFarm && s.hoursFarm.running && d.has('shuffleBoost')) {
      s.hoursFarm.shuffle = !!settings.shuffleBoost;
      s.hoursFarm.opts = { ...(s.hoursFarm.opts || {}), shuffle: s.hoursFarm.shuffle };
      summary.push({ steamID, accountRef: accountRef, is: 'sequential', how: 'instant' });
    }
    if (d.has('pauseFarmOnBoost')) {
      if (settings.pauseFarmOnBoost && (accountBoostRunning(s) || s.realistic) && s.farm && s.farm.running) {
        if (delayFarm(steamID, 'ayar: saat yukseltirken duraklat')) summary.push({ steamID, accountRef: accountRef, is: 'card', how: 'delayed' });
      } else if (!settings.pauseFarmOnBoost && s.pendingFarm && !s.realistic) {
        resumeFarm(steamID, true);
        summary.push({ steamID, accountRef: accountRef, is: 'card', how: 'resumed' });
      }
    }
  });
  return summary;
}
ipcMain.handle('settings:clearPriceCache', () => {
  ['', '.bak', '.bozuk', '.tmp'].forEach((extra) => {
    try { fs.unlinkSync(PRICE_FILE + extra); } catch (_) {}
    try { fs.unlinkSync(HISTORY_FILE + extra); } catch (_) {}
  });
  priceCache = new Map();
  historyCache = new Map();
  return { ok: true };
});
ipcMain.handle('settings:openConfigFolder', () => { shell.openPath(DATA_ROOT); return { ok: true }; });
// ---- Backup (export/import) ----
// The backup holds the preferences and PER-ACCOUNT data: statistics, the games selected in the Hour Booster,
// the Realistic Mode queue and presets. The session key, refresh token, user names and the fields that belong to
// the current session (persona/steamID/currency) are DELIBERATELY left out: if the backup file falls
// into someone else's hands it must not give access to the account. The backup used to hold the old shared statistics
// file detached from the account; the real statistics counted per account were never backed up.
const EXPORT_SKIP = ['persona', 'steamID', 'accountCurrency'];
const BACKUP_ACCOUNT_FIELDS = ['boostGameIds', 'grQueue', 'grPresets'];
function exportPayload() {
  const out = {};
  Object.keys(settings).forEach((k) => { if (!EXPORT_SKIP.includes(k)) out[k] = settings[k]; });
  const accountList = {};
  loadAccounts().forEach((a) => {
    const v = accountData(a.steamID);
    const h = { stats: v.stats || null };
    BACKUP_ACCOUNT_FIELDS.forEach((k) => { h[k] = Array.isArray(v[k]) ? v[k] : []; });
    accountList[a.steamID] = h;
  });
  return {
    app: 'SteamEdge',
    format: 2,
    version: app.getVersion(),
    exportedAt: new Date().toISOString(),
    settings: out,
    accountList: accountList,
  };
}
ipcMain.handle('settings:export', async () => {
  saveSettings();
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: ct('SteamEdge ayarlarını dışa aktar'),
    defaultPath: path.join(app.getPath('documents'), 'steamedge-ayarlar-' + stamp + '.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(r.filePath, JSON.stringify(exportPayload(), null, 2), 'utf8');
    log('info', 'settings exported: ' + r.filePath);
    return { ok: true, file: r.filePath };
  } catch (e) {
    log('warn', 'export error: ' + (e && e.message));
    return { ok: false, error: (e && e.message) || 'dosya yazılamadı' };
  }
});
ipcMain.handle('settings:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: ct('SteamEdge yedeğini seç'),
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
  const file = r.filePaths[0];
  try {
    const obj = migrateKeys(JSON.parse(fs.readFileSync(file, 'utf8')));
    // Both the new ({app,settings,stats}) and the old (plain settings object) formats are accepted.
    const incoming = (obj && obj.settings && typeof obj.settings === 'object') ? obj.settings : obj;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, error: 'Dosya bir SteamEdge yedeği değil.' };
    }
    // A backup from an old version is accepted too: removed/merged settings are carried over first.
    const temporary = { ...incoming };
    migrateSettings(temporary);
    // Unknown keys are dropped; session fields are kept (they do not come from the backup).
    const clean = {};
    Object.keys(DEFAULT_SETTINGS).forEach((k) => {
      if (EXPORT_SKIP.includes(k)) return;
      if (Object.prototype.hasOwnProperty.call(temporary, k)) clean[k] = temporary[k];
    });
    const applied = Object.keys(clean).length;
    if (!applied) return { ok: false, error: 'Dosyada tanınan hiçbir ayar yok.' };
    const old = settings;
    settings = { ...DEFAULT_SETTINGS, ...clean };
    const changed = Object.keys(settings).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(settings[k]));
    if (!saveSettings()) { settings = old; return { ok: false, error: 'Ayar dosyası yazılamadı.' }; }
    settingSaveTime = Date.now();
    applySettings();
    if (changed.includes('language')) { translation.pickLang(settings.language); setupTrayMenu(); }
    applySettingsToJobs(changed);
    // Account data: restored only to accounts saved on this computer.
    let accountCount = 0;
    const saved = new Set(loadAccounts().map((a) => a.steamID));
    if (obj && obj.accountList && typeof obj.accountList === 'object') {
      Object.keys(obj.accountList).forEach((sid) => {
        if (!saved.has(sid)) return;
        const h = obj.accountList[sid] || {};
        const v = accountData(sid);
        if (h.stats && typeof h.stats === 'object') v.stats = { ...DEFAULT_STATS, ...h.stats };
        BACKUP_ACCOUNT_FIELDS.forEach((k) => { if (Array.isArray(h[k])) v[k] = h[k]; });
        writeAccountData(sid);
        accountCount++;
      });
    } else if (obj && obj.stats && typeof obj.stats === 'object' && activeSteamID) {
      // Old format (format 1): a single statistics object, written to the account on screen.
      activeAccountData().stats = { ...DEFAULT_STATS, ...obj.stats };
      writeAccountData(activeSteamID);
      accountCount = 1;
    }
    if (activeSteamID) sendRaw('stats:changed', statsView(activeSteamID));
    log('info', 'settings imported (' + applied + ' keys, ' + accountCount + ' accounts): ' + file);
    return { ok: true, applied, accountCount: accountCount, settings: accountSettingsAdded(publicSettings()), file };
  } catch (e) {
    return { ok: false, error: ct('Dosya okunamadı:') + ' ' + ((e && e.message) || '') };
  }
});
// Danger zone: deletes all local data (session, accounts, settings, statistics, price cache)
// and returns to the login screen - the renderer calls it after it has already shown a strong confirm().
ipcMain.handle('settings:wipeAll', () => {
  disconnectAll();
  // Settings side
  ['session.json', 'web-session.json', 'accounts.json', 'settings.json', 'stats.json', 'state.json'].forEach((f) => {
    ['', '.bak', '.bozuk', '.tmp'].forEach((extra) => {
      try { fs.unlinkSync(path.join(CONFIG_DIR, f + extra)); } catch (_) {}
    });
  });
  // All of the per-account stores
  try { fs.rmSync(ACCOUNT_DIR, { recursive: true, force: true }); } catch (_) {}
  accountDataAll.clear(); corruptFiles.clear();
  // Cache side (prices.json and the log file are now under cache/)
  ['prices.json', 'history.json', 'steamedge.log', 'steamedge.log.1'].forEach((f) => {
    try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
  });
  settings = { ...DEFAULT_SETTINGS }; lifeStats = null; priceCache = new Map();
  activeSteamID = null;
  authSlots.clear(); addingAccountMode = false;
  if (win) {
    win.setMinimumSize(900, 700);
    centerDefaultSize();
    win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
  }
  return { ok: true };
});

// ---- update check (issue #6) ----
// Rule: nothing is downloaded, nothing is run on its own. The app only reads the newest release number
// on GitHub and compares it with the installed one. The rest is up to the user.
//
// When it looks:
//   1. ONCE at app startup. If there is a new version a window shows on screen; IF THE VERSION IS CURRENT
//      nothing is shown. No timer, no daily repeat, no check wandering in the background.
//   2. If the user presses the button in the top bar. There the result is always told - learning that
//      it is up to date is also an answer, the button must not look dead.
let lastUpdateStatus = null;    // the result of the last check
let updateRunning = false;

async function checkForUpdate(manual) {
  // Two checks must not run at the same time: the user can press the button while the startup check is running.
  if (updateRunning) return lastUpdateStatus || { ok: false, failure: 'Kontrol zaten sürüyor.' };
  updateRunning = true;
  try {
    const outcome = await update.checkNow(app.getVersion());
    lastUpdateStatus = { ...outcome, ts: Date.now(), byHand: !!manual };
    log(outcome.ok ? 'info' : 'warn', 'update check: '
      + (outcome.ok ? (outcome.isUpToDate ? 'guncel (' + outcome.installed + ')' : 'yeni surum ' + outcome.lastOne) : outcome.failure));
    sendRaw('update:status', lastUpdateStatus);
    return lastUpdateStatus;
  } finally {
    updateRunning = false;
  }
}

// The single check at startup. Delayed 15 seconds so the window and the Steam session can settle.
function startupUpdateCheck() {
  setTimeout(() => { checkForUpdate(false).catch(() => {}); }, 15000);
}

ipcMain.handle('update:check', () => checkForUpdate(true));
ipcMain.handle('update:lastStatus', () => lastUpdateStatus);
// The app's real memory use, process by process. So that the answer to "how much RAM does it eat" is not a guess
// Ayarlar > Gelişmiş shows this live. Electron runs multi process: five separate SteamEdge
// rows show up in Task Manager, the user had to add them up one by one.
// tek tek toplamasi gerekiyordu.
ipcMain.handle('app:memory', () => {
  const measurements = app.getAppMetrics();
  const processes = measurements.map((p) => ({
    typeName: p.type,
    kb: (p.memory && (p.memory.privateBytes || p.memory.workingSetSize)) || 0,
  }));
  return {
    totalKb: processes.reduce((t, p) => t + p.kb, 0),
    processList: processes,
    gpuOn: settings.hwAccel !== false,
  };
});
// Empty the image and network cache. NO loss of settings, session or data - only things that can be
// downloaded again go. The most direct way to win memory back in long sessions.
ipcMain.handle('app:memoryClear', async () => {
  const earlier = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
  try {
    await session.defaultSession.clearCache();
    if (win && !win.isDestroyed()) win.webContents.session.clearCodeCaches({ urls: [] });
  } catch (e) { return { ok: false, error: e.message }; }
  await new Promise((r) => setTimeout(r, 600));
  const later = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
  log('info', 'cache cleared: ' + Math.round((earlier - later) / 1024) + ' MB');
  return { ok: true, gainKb: Math.max(0, earlier - later) };
});

ipcMain.handle('app:info', () => ({
  versionStr: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  packaged: app.isPackaged,
}));

app.on('before-quit', () => {
  isQuitting = true;
  // Let the last minute of running jobs and the pending account writes land on disk.
  accounts.forEach((s, id) => { try { statsHour(id); } catch (_) {} });
  flushPendingWrites();
});
// If a data file could not be read at startup TELL the user. It used to silently fall back to the default,
// then the first change wrote over the intact file; the user could never learn
// why their settings were gone.
function reportReadErrors() {
  if (!readErrors.length) return;
  const recovered = readErrors.filter((h) => h.recoveredFlag).map((h) => h.displayName);
  const lost = readErrors.filter((h) => !h.recoveredFlag).map((h) => h.displayName);
  let bodyEl = '';
  if (recovered.length) {
    bodyEl += ct('Şu dosyalar bozuktu ve yedekten kurtarıldı:') + '\n  ' + recovered.map(ct).join('\n  ') + '\n\n';
  }
  if (lost.length) {
    bodyEl += ct('Şu dosyalar okunamadı ve yedekleri de yoktu:') + '\n  ' + lost.map(ct).join('\n  ')
      + '\n\n' + ct('Bu veriler varsayılana döndürüldü. Bozuk dosyalar ".bozuk" uzantısıyla settings klasöründe duruyor, üzerlerine yazılmadı.')
      + '\n\n' + ct('Bunun sebebi genellikle uygulama kayıt yaparken bilgisayarın kapanmasıdır.');
  }
  try {
    dialog.showMessageBox(win || null, {
      type: lost.length ? 'warning' : 'info',
      title: 'SteamEdge - ' + ct('veri dosyaları'),
      message: lost.length ? ct('Bazı ayarlar okunamadı') : ct('Ayarlar yedekten kurtarıldı'),
      detail: bodyEl.trim(),
      buttons: [ct('Tamam')],
    });
  } catch (_) {}
  readErrors.length = 0;
}

// Open the Steam session WITHOUT WAITING FOR THE INTERFACE.
// The logon used to start when the interface had loaded and the first page called `engine:connect`: first
// the HTML/CSS/JS loaded, then the connection was made and the two times stacked on top of each other.
// But the session info is ready on disk. When started here the connection makes progress while the interface is
// drawn; when the pages call `engine:connect` it is either ready or they share the same
// ongoing operation (connectAccount > s.connecting).
function earlyConnect() {
  const sess = hasSession();
  if (!sess) return;
  if (!activeSteamID) { activeSteamID = sess.steamID; accountDataMigration(); }
  const entry = loadAccounts().find((a) => a.steamID === activeSteamID) || sess;
  connectAccount(entry)
    .then((r) => {
      syncActive();
      log(r && r.ok ? 'info' : 'warn', 'startup connection: ' + (r && r.ok ? 'established' : (r && r.error)));
    })
    .catch((e) => log('warn', 'startup connection failed: ' + (e && e.message)));
}

// Mixed installation detection.
// Users extract the new version OVER THE OLD folder. When the app is open at that time
// some files are locked and do not come out of the archive: the exe is new, locales/ and app.asar
// stay old. Electron refuses to start with a locale file whose version does not match and
// exits WITHOUT ANY MESSAGE. From outside it looks like "the app does not work".
// The `version` file next to it carries Electron's real version; we compare it with the running version
// and if they do not match we say the reason.
function isSetupConsistent() {
  if (!app.isPackaged) return { ok: true };
  try {
    const pathStr = path.join(path.dirname(app.getPath('exe')), 'version');
    if (!fs.existsSync(pathStr)) return { ok: true };          // if the file is not there make no comment
    const fileVersion = fs.readFileSync(pathStr, 'utf8').trim();
    const runningItem = process.versions.electron;
    if (fileVersion && runningItem && fileVersion !== runningItem) {
      return { ok: false, fileVersion: fileVersion, runningItem: runningItem };
    }
  } catch (_) {}
  return { ok: true };
}

app.whenReady().then(() => {
  const setup = isSetupConsistent();
  if (!setup.ok) {
    log('error', 'mixed installation: version=' + setup.fileVersion + ' running=' + setup.runningItem);
    // The settings have not loaded yet; the language comes from the early setting read before the window opened.
    translation.pickLang((earlySettings && earlySettings.language) || 'tr');
    try {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'SteamEdge - ' + ct('kurulum bozuk'),
        message: ct('Bu klasörde iki farklı sürümün dosyaları karışmış'),
        detail: translation.tf('Klasördeki bazı dosyalar eski sürümden kalmış (beklenen #, bulunan #).', setup.runningItem, setup.fileVersion) + '\n\n'
          + ct('Bu genellikle yeni sürüm eski klasörün üzerine çıkarıldığında ve uygulama o sırada açık olduğunda olur: açık program bazı dosyaları kilitler, arşiv onları atlar.') + '\n\n'
          + ct('Çözüm:') + '\n'
          + '  1. ' + ct('SteamEdge tamamen kapalı olsun.') + '\n'
          + '  2. ' + ct('Arşivi boş ve yeni bir klasöre çıkar.') + '\n'
          + '  3. ' + ct('Eski klasördeki settings klasörünü yeni klasöre kopyala.') + '\n\n'
          + ct('settings klasörü ayarlarını ve Steam oturumunu taşır; kopyalarsan hiçbir şey kaybetmezsin.'),
        buttons: [ct('Tamam')],
      });
    } catch (_) {}
    app.quit();
    return;
  }
  loadSettings(); applySettings(); loadStats(); loadState(); loadPriceCache(); loadHistoryCache();
  createWindow(); ensureTray();
  setTimeout(reportReadErrors, 1200);
  startupUpdateCheck();
  earlyConnect();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !settings.closeToTray) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
