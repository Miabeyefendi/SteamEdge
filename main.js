const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, powerSaveBlocker, powerMonitor, Notification, dialog, session, safeStorage } = require('electron');
const os = require('os');
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
const { migrateKeys, renameOldFiles, OLD_SETTING_VALUES } = require('./src/core/keyMigration');
const { parseProxy, setActiveProxy } = require('./src/core/proxyFetch');
const { startLocalProxy } = require('./src/core/localProxy');
const windowFit = require('./src/core/windowFit');
const inventorySources = require('./src/core/inventorySources');
const resumeJobs = require('./src/core/resumeJobs');
const { toCsv } = require('./src/utils/csv');
const { createLogger } = require('./src/core/logger');
const ct = translation.t;
// The `error` and `failure` text in every reply returned to the interface is translated to the selected language. Instead of
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

  // GPU compositing off (the default since settings version 5): the processor composites the window's frames and the graphics card holds 9 MB of video memory
  // instead of 67 MB, measured on the overview page. Next to a full screen game that is memory the game keeps, and its presentation path stays free.
  // The cost is a few points on the processor side, and none while the window is still (it only draws when something changes).
  // Only a user who turned it on (in a settings file of version 5 or later) gets the graphics card.
  const keepGpuComposition = !!early && early.gpuComposition === true && (+early.settingsVersion || 1) >= 5;
  if (!keepGpuComposition) app.commandLine.appendSwitch('disable-gpu-compositing');

  // LOW MEMORY MODE (default on): Chromium runs the graphics and the network code inside the main process instead of two extra ones. Measured on the overview
  // page: 4 processes and 411 MB of working set become 2 processes and 313 MB; every integration test passes with it. The price: a driver that crashes takes the app
  // down with it instead of just restarting a helper process, so it can be switched off (Settings > Advanced & data, asks for a restart).
  if (!early || early.lowMemory !== false) {
    app.commandLine.appendSwitch('in-process-gpu');
    app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2');
  }
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
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
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
    showWindow();
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
// session (slotId -> instance). Slot "0" is always the main box; the "Go to dashboard" navigation
// is triggered ONLY when slot 0 finishes successfully, the other boxes may keep working in the background.
const authSlots = new Map();
// Becomes true when we return to login.html through the "Add Account" flow - NO slot in that session
// (slot 0 included) overwrites the current active session.json.
let addingAccountMode = false;
function getAuthSlot(slotId) {
  const id = String(slotId == null ? '0' : slotId);
  if (!authSlots.has(id)) {
    const inst = new (steamAuthClass())(CONFIG_DIR, makeAuthSend(id), { proxyUrl: settings.loginProxyUrl });
    inst.addingAccount = addingAccountMode || id !== '0';
    authSlots.set(id, inst);
  }
  return authSlots.get(id);
}
function makeAuthSend(slotId) {
  return (event, data) => {
    if (win && !win.isDestroyed()) win.webContents.send('auth:' + event, { ...data, slotId });
    // steamAuth has just written the new login to disk in plain text
    if (event === 'authenticated' && settings.protectTokens) rewriteTokenFiles();
  };
}
let tray = null;
let trayHasIcon = false;
let isQuitting = false;
// What the Windows start-up entry passes with "Start in the tray" (applyLoginItem). Only the first window of the run stays hidden; starting the
// app again by hand brings it up (second-instance).
const START_HIDDEN_ARG = '--start-in-tray';
let startHidden = process.argv.includes(START_HIDDEN_ARG);
let maximizeOnShow = false;   // a window saved maximized that started hidden: maximize() would show it, so it waits for the first showWindow
let psbId = null;

// ================== DATA FOLDERS (PORTABLE) ==================
// In the packaged version the app writes its data NEXT TO ITS OWN FOLDER, not to AppData.
// So wherever you extract the downloaded .zip, your settings and cache stay next to it:
//
//   SteamEdge/
//     SteamEdge.exe
//     settings/     settings, saved accounts, session, statistics, remembered data
//     cache/        price cache, Chromium cache
//     logs/         log files (src/core/logger.js)
//
// If it was installed in a read-only place (e.g. Program Files) the write attempt fails;
// in that case it silently falls back to AppData and the app still works.
// During development (unpackaged) AppData is always used so the repository does not get dirty.
function portableRoot() {
  if (!app.isPackaged) return null;
  const side = path.join(path.dirname(app.getPath('exe')));
  try {
    fs.mkdirSync(side, { recursive: true });
    const attemptNo = path.join(side, '.write-test');
    fs.writeFileSync(attemptNo, 'x');
    fs.unlinkSync(attemptNo);
    return side;
  } catch (_) { return null; }
}
const PORTABLE_ROOT = portableRoot();
const DATA_ROOT = PORTABLE_ROOT || app.getPath('userData');
const CONFIG_DIR = path.join(DATA_ROOT, 'settings');
const CACHE_DIR = path.join(DATA_ROOT, 'cache');
const LOG_DIR = path.join(DATA_ROOT, 'logs');
try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
// Set up before anything can log. The level is read on every line: `settings` is only loaded further down, until then errors only.
const logger = createLogger({ dir: LOG_DIR, level: () => settings.logLevel, legacyDir: CACHE_DIR });
// Files an older version wrote under a Turkish name get the current one before anything reads them
[CONFIG_DIR, path.join(CONFIG_DIR, 'accounts'), CACHE_DIR].forEach((dir) => renameOldFiles(dir));
// The companions of every JSON file (see writeJson/readJson): its backup, a broken copy set aside, an unfinished write
const JSON_SIDE_FILES = ['', '.bak', '.corrupt', '.tmp'];
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

// Returns: { ok:true, dataBlock } | { ok:true, dataBlock, fromBackup:true } | { ok:false, none:true } | { ok:false, corrupt:true }
function readJson(fileEntry) {
  const attempt = (p) => {
    const rawText = fs.readFileSync(p, 'utf8');
    if (!rawText.trim()) throw new Error('empty file');
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
      try { fs.copyFileSync(fileEntry, fileEntry + '.corrupt'); } catch (_) {}
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
  startInTray: true,        // started by Windows: the window stays closed, the app runs in the tray (only with autoLaunch)
  closeToTray: false,       // minimise to the system tray on close
  preventSleep: false,      // prevent sleep while the app is open
  resumeJobs: true,         // a job that was running when the app ended starts again where it left off (src/core/resumeJobs.js)
  language: 'en',
  // Card farming
  grScheduleEnabled: false,   // Realistic Mode runs the last setup by itself inside the time range below
  grScheduleFrom: '22:00',
  grScheduleTo: '07:00',
  farmScheduleEnabled: false, // card farming runs by itself inside the time window below
  farmScheduleFrom: '22:00',
  farmScheduleTo: '07:00',
  keyForwardOwned: false,     // a key the account already owns is tried on the next connected account
  loginProxyUrl: '',          // proxy the sign-in goes through (an account's own proxy is only known after it is signed in)
  protectTokens: false,       // seal the saved login tokens with Windows DPAPI (safeStorage)
  cardPriorityMode: 'sequential',
  farmSkipUnplayed: false,    // leave games with no recorded playtime out of the queue
  farmSkipRecent: false,      // leave games out that can still be refunded (bought in the last 14 days, under 2 hours played)
  farmFinishedAction: 'none', // none | exit | boost: what to do when every card has been collected
  cardMaxGames: 32,         // games open at once in fast mode (Steam's known upper limit is 32)
  notifyCardDrop: false,    // desktop notification as cards drop (Card Farming > Automation)
  // Card Farming > Automation. All three really work; two affect the account permanently so
  // the default is OFF and the sale flow follows the "Ask for confirmation before selling" setting.
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
  pauseFarmOnBoost: false,  // automatically stop Card Farming when boosting starts
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
  // Privacy & Security (the visibility on Steam is chosen per account in the top bar: account data personaState)
  // Advanced & Data
  apiRequestDelayMs: 350,   // wait per price request (Steam's limit - lowering it raises the 429 risk)
  hwAccel: true,            // GPU hardware acceleration - turning it off asks for a restart
  lightMode: true,           // stop drawing and animations when the window is not focused
  gpuBackend: 'auto',        // ANGLE backend: auto | d3d11 | d3d9 | gl (asks for a restart)
  lowMemory: true,          // the graphics and network code run inside the main process: two processes fewer, about 100 MB less (asks for a restart)
  gpuComposition: false,    // false = the processor composites the window: 9 MB of video memory instead of 67 and no clash with a game (asks for a restart)

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
  // Modules: a page that is switched off leaves the side menu and the overview and makes no Steam request of its own.
  // Settings and the overview are always there. navOrder is the order of the side menu.
  moduleCard: true, moduleInventory: true, moduleHours: true, moduleRealistic: true, moduleAchievements: true, moduleKeys: true, moduleChat: true,
  navOrder: 'overview,card,inventory,hours,realistic,achievements,keys',
  perfMode: 'auto',         // auto | full | light: light turns off animations, transitions, blur and shadows (see edge.css .e-light)
  setupDone: true,          // false only on a first start: the welcome window asks which pages to use (see common.js showSetup)
  // Small features and top bar items that can be switched off (Settings > Modules, common.js FEATURES); everything is on until the setting says false
  featFeed: true, featFavorites: true, featListings: true, featCsv: true, featOtherGames: true,
  topSearch: true, topNotif: true, topUpdate: true,
  theme: 'auto',            // auto | dark | midnight | white | contrast (see src/main/js/theme.js); auto = contrast when the system asks for it, dark otherwise
  density: 'auto',          // auto | comfortable | compact (*)
  uiScale: 100,             // percent, one of windowFit.SCALES; the window zooms the page to this while the layout still fits (applyFitZoom)
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
  boostTarget: '2',
  boostStagger: 5,          // in simultaneous boosting the games are opened one after another at this interval (s)
  shuffleBoost: false,      // only in sequential idling: the game order is shuffled every round
  // The Behaviour/Privacy switches on the Hour Booster page and the preset
  // Hour sync - brings the total times of the selected games to the same point (default OFF)
  boostSync: true,              // equalise the selected games; only applies when two or more are selected
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
  boostGameIds: [],         // the selected games when "Remember the game list" is on
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
  grParallel: true,              // Realistic Mode plays the games of the queue at the same time (off: one after the other)
  grSpeed: 1,                 // speed multiplier: compresses/stretches the whole schedule
  grUltraMultiplier: 3,         // achievements under 5% wait this many times longer
  grCatchUpShare: 20,          // in what first percent of the time the ones left behind are unlocked
  grFinishedRatio: 50,          // if the game is finished the schedule drops to this ratio (percent)
  grLevel: 'simple',        // right panel: simple | advanced
  achDelay: '15',               // seconds between two unlocks: 15, 30, 45, 60, 120, 300, 600, 1800 or 3600
  achOrder: 'default',
  achSafeMode: true,
  achSpread: false,
  notifyPriceDrop: false,   // when an item in the inventory drops below the 24 hour average by the threshold
  notifSound: 'knock',      // five plain tones, produced with Web Audio (common.js > NOTIF_SOUNDS)
  sessionTimeout: 'never',  // idle time (min), does not apply while a job runs - 'never' = off
  hideGameName: false,      // become invisible while playing (so the game name does not show on the profile)
  logLevel: 'error',        // log file: off | error | warn | info | debug
  settingsVersion: 5,            // format of the settings file; migrations are in migrateSettings
};
let settings = { ...DEFAULT_SETTINGS };

// ---- levelled logging (Settings > Advanced > "Log file") ----
// A single choice: off / errors / warnings / events / verbose. The files, their folder and rotation are in src/core/logger.js.
// always: written whatever the level (not when the log is off).
function log(level, msg, always) { logger.log(level, msg, always); }
// NOTE: Currency conversion was REMOVED ENTIRELY. Amounts are fetched from the Steam Community Market
// in the account's own market currency and shown exactly in that currency. Conversion caused the number
// the user saw on Steam and the number seen in the app to differ.

ipcMain.handle('log:write', (_e, { level, msg }) => { log(level || 'info', '[ui] ' + msg); return true; });
// Says so if the folder or file does not exist yet (logging off or nothing written); the
// button used to silently do nothing.
async function openLogPath(p, missing) {
  if (!fs.existsSync(p)) return { ok: false, error: missing };
  const errorInfo = await shell.openPath(p);
  return errorInfo ? { ok: false, error: errorInfo } : { ok: true };
}
ipcMain.handle('log:open', () => openLogPath(LOG_DIR, 'Kayıt klasörü henüz oluşmadı.'));
ipcMain.handle('log:openConnection', () => openLogPath(logger.files.connection, 'Bağlantı kaydı henüz oluşmadı.'));
// Settings > Connection history: the last 24 hours of the account on screen, from the same lines connection.log holds
const CONNECTION_SUMMARY_MS = 24 * 3600 * 1000;
ipcMain.handle('log:connectionSummary', () => {
  if (!activeSteamID) return { ok: false };
  return { ok: true, spanMs: CONNECTION_SUMMARY_MS, ...logger.connectionSummary(activeSteamID, CONNECTION_SUMMARY_MS) };
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
    n.on('click', () => showWindow());
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
// is not lost, and no dead key is left in the file. settingsVersion is raised once.
const REMOVED_SETTINGS = ['autoReconnect', 'farmRetry', 'twoStepSell', 'autoStopBoost', 'dontAsk_achSingle', 'debugLogs', 'offlineMode', 'grShowNoAch', 'compactRows'];
const ACH_DELAY_CHOICES = [15, 30, 45, 60, 120, 300, 600, 1800, 3600];
function nearestAchDelay(sec) {
  if (!(sec > 0)) return ACH_DELAY_CHOICES[0];
  return ACH_DELAY_CHOICES.reduce((best, c) => (Math.abs(c - sec) < Math.abs(best - sec) ? c : best));
}
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
    // "Keep debug logs" was removed: the chosen level is now also written to the file.
    v.settingsVersion = 2;
    hasChanged = true;
  }
  // The unlock interval choices were cut down (no 1 second, no odd minutes): move an old value to the nearest new one
  if ((+v.settingsVersion || 1) < 3) {
    if (v.achDelay != null) v.achDelay = String(nearestAchDelay(+v.achDelay));
    v.settingsVersion = 3;
    hasChanged = true;
  }
  // Interface density got an automatic choice and it became the default: a file that still holds the old default follows it.
  if ((+v.settingsVersion || 1) < 4) {
    if (v.density === 'comfortable') v.density = 'auto';
    v.settingsVersion = 4;
    hasChanged = true;
  }
  // The window is composited by the processor by default now (see the early settings read at the top): a file written before that follows the new default once.
  if ((+v.settingsVersion || 1) < 5) {
    if (v.gpuComposition === true) v.gpuComposition = false;
    v.settingsVersion = 5;
    hasChanged = true;
  }
  // Values renamed from Turkish (the old names are in src/core/keyMigration.js)
  Object.entries(OLD_SETTING_VALUES).forEach(([k, names]) => {
    if (typeof v[k] === 'string' && Object.prototype.hasOwnProperty.call(names, v[k])) { v[k] = names[v[k]]; hasChanged = true; }
  });
  // "Compact rows" is the interface density now
  if (v.compactRows === true && (!v.density || v.density === 'auto')) v.density = 'compact';
  REMOVED_SETTINGS.forEach((k) => { if (k in v) { delete v[k]; hasChanged = true; } });
  return hasChanged;
}
// The moment the settings were last saved by the user (Settings > Configuration > Last saved).
let settingSaveTime = null;
function loadSettings() {
  const r = readJson(SETTINGS_FILE);
  if (r.ok) {
    const rawText = { ...r.dataBlock };
    const wasInvisible = rawText.offlineMode === true;
    const hasPassed = migrateSettings(rawText);
    settings = { ...DEFAULT_SETTINGS, ...rawText };
    if (r.fromBackup) readErrors.push({ displayName: 'Ayarlar', recoveredFlag: true });
    if (hasPassed) saveSettings();
    if (wasInvisible) personaFromOfflineMode();
    try { settingSaveTime = fs.statSync(SETTINGS_FILE).mtimeMs; } catch (_) {}
  } else {
    settings = { ...DEFAULT_SETTINGS };
    // none = first run, normal: the welcome window will ask. corrupt = a real problem, tell the user.
    if (r.none) settings.setupDone = false;
    if (r.corrupt) readErrors.push({ displayName: 'Ayarlar', recoveredFlag: false });
  }
  translation.pickLang(settings.language);
}
// Returns false if it fails: if the file could not be read (broken) writing is deliberately blocked and "Save"
// must tell the user so, not say "saved".
function saveSettings() { return writeJson(SETTINGS_FILE, settings, true); }
// "Uyku modunu engelle": only while a job runs on an account. Previously when the setting was on the
// computer never slept even if the app was doing nothing.
function updateSleepBlocker() {
  let runningItem = false;
  accounts.forEach((s) => { if (accountRunning(s)) runningItem = true; });
  const keepAwake = !!settings.preventSleep && runningItem;
  try {
    if (keepAwake && psbId === null) psbId = powerSaveBlocker.start('prevent-app-suspension');
    else if (!keepAwake && psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
  } catch (_) {}
}
// "Reconnect if the connection drops". null = unlimited, 0 = off, n = at most n attempts.
function reconnectLimit() {
  const v = settings.reconnectPolicy;
  if (v === 'off') return 0;
  const n = parseInt(v, 10);
  return n > 0 ? n : null;
}
// The Windows start-up entry ("Start with Windows"). It used to be written on every start of any copy: a run from the source (npm start, the tests) put the
// Electron of node_modules there, and a copy with the setting off (a new version just extracted, its settings not copied over yet) removed the entry of the
// copy the user starts. Now only a packaged app touches it, and turning it off removes it only when it is this copy's.
// With "Start in the tray" the entry carries START_HIDDEN_ARG: the first window stays hidden (see createWindow).
function applyLoginItem() {
  if (!app.isPackaged) return;
  try {
    if (settings.autoLaunch) { app.setLoginItemSettings({ openAtLogin: true, args: settings.startInTray ? [START_HIDDEN_ARG] : [] }); return; }
    const current = app.getLoginItemSettings();
    const items = (current && current.launchItems) || [];
    const mine = (p) => String(p || '').replace(/"/g, '').toLowerCase() === String(process.execPath).toLowerCase();
    if (items.length ? items.some((x) => mine(x.path)) : current.openAtLogin) app.setLoginItemSettings({ openAtLogin: false });
  } catch (_) {}
}

function applySettings() {
  applyLoginItem();
  updateSleepBlocker();
  applyFitZoom();
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
  accounts.forEach((s, id) => { try { if (s.ready && s.engine) s.engine.applyPrivacy(personaOf(id), settings.hideGameName); } catch (_) {} });
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

// One way to bring the window back, whatever state it is in: hidden to the tray, minimised by Windows (Win+D, Win+M) or both. Before, the tray click, the tray menu,
// the second copy and the notification each did a part of this and a minimised window could stay minimised.
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (maximizeOnShow) { maximizeOnShow = false; win.maximize(); }
  win.show();
  win.focus();
}

function ensureTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'icon.png'));
    trayHasIcon = !img.isEmpty();          // an empty image makes a tray entry nobody can see: the minimise button must not hide the window behind it
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip('SteamEdge');
    setupTrayMenu();
    tray.on('click', () => { if (win && !win.isDestroyed()) { (win.isVisible() && !win.isMinimized()) ? win.hide() : showWindow(); } });
  } catch (_) {}
}
// When the language changes the menu is rebuilt; it used to stay in Turkish in every language.
function setupTrayMenu() {
  if (!tray) return;
  try {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: ct('Pencereyi göster'), click: () => showWindow() },
      { type: 'separator' },
      // the dictionary key "Exit" (Turkish source text) means "sign out" in the navigation; this entry closes the app.
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

process.on('uncaughtException', (e) => { logger.crash('uncaughtException', e); });
process.on('unhandledRejection', (e) => { logger.crash('unhandledRejection', e); });

// ---- LOGIN TOKEN PROTECTION ----
// The refresh tokens in session.json and accounts.json are enough to use the Steam account. With "Seal login tokens"
// on they are stored encrypted with Windows DPAPI (Electron safeStorage), which only the same Windows user on the
// same computer can open. A sealed value is `enc1:<base64>`; it is always opened when read, whatever the setting is,
// so switching the setting off (or moving back to plain text) never loses an account.
const TOKEN_PREFIX = 'enc1:';
function tokenProtectionAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; }
}
function sealIfEnabled(token) {
  if (!token || typeof token !== 'string' || token.startsWith(TOKEN_PREFIX)) return token;
  if (!settings.protectTokens || !tokenProtectionAvailable()) return token;
  try { return TOKEN_PREFIX + safeStorage.encryptString(token).toString('base64'); }
  catch (_) { return token; }
}
// Returns the plain token, the value unchanged if it was never sealed, or null if it is sealed and cannot be opened
// here (the folder was copied to another Windows user or computer).
function openToken(value) {
  if (typeof value !== 'string' || !value.startsWith(TOKEN_PREFIX)) return value;
  try { return safeStorage.decryptString(Buffer.from(value.slice(TOKEN_PREFIX.length), 'base64')); }
  catch (_) { return null; }
}
function hasSession() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'session.json'), 'utf8'));
    if (!s || !s.refreshToken) return null;
    const token = openToken(s.refreshToken);
    if (token === null) { log('warn', 'session.json is sealed for another Windows user or computer, signing in again is needed'); return null; }
    return { ...s, refreshToken: token };
  } catch (_) { return null; }
}

// ---- multi-account store (accounts.json) - session.json always reflects the "active" account ----
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
// An entry whose token cannot be opened here keeps its sealed value and gets `locked: true`.
function openAccountEntry(a) {
  const token = openToken(a && a.refreshToken);
  if (token === null) return { ...a, locked: true };
  return token === (a && a.refreshToken) ? a : { ...a, refreshToken: token };
}
function loadAccounts() {
  const r = readJson(ACCOUNTS_FILE);
  if (r.ok) {
    if (r.fromBackup) readErrors.push({ displayName: 'Kayıtlı hesaplar', recoveredFlag: true });
    return Array.isArray(r.dataBlock) ? r.dataBlock.map(openAccountEntry) : [];
  }
  if (r.corrupt) readErrors.push({ displayName: 'Kayıtlı hesaplar', recoveredFlag: false });
  return [];
}
function saveAccounts(list) {
  writeJson(ACCOUNTS_FILE, list.map((a) => { const { locked, ...rest } = a; return { ...rest, refreshToken: sealIfEnabled(rest.refreshToken) }; }), true);
}
// Writes both token files again in the form the setting asks for, and removes the .bak/.tmp copies that would
// still hold the previous (plain text) version.
function rewriteTokenFiles() {
  try {
    const list = loadAccounts();
    if (list.length) saveAccounts(list);
    const sp = path.join(CONFIG_DIR, 'session.json');
    if (fs.existsSync(sp)) {
      const sess = JSON.parse(fs.readFileSync(sp, 'utf8'));
      const token = openToken(sess.refreshToken);
      if (token !== null) writeJson(sp, { ...sess, refreshToken: sealIfEnabled(token) }, true);
    }
    // the Family View PIN and the proxy password live in the per-account files
    try {
      fs.readdirSync(ACCOUNT_DIR).filter((f) => /^\d+\.json$/.test(f)).forEach((f) => writeAccountData(f.slice(0, -5)));
    } catch (_) { /* no account folder yet */ }
    if (settings.protectTokens) {
      try { fs.readdirSync(ACCOUNT_DIR).filter((f) => /^\d+\.json\.(bak|tmp)$/.test(f)).forEach((f) => fs.unlinkSync(path.join(ACCOUNT_DIR, f))); } catch (_) {}
      ['accounts.json', 'session.json'].forEach((f) => ['.bak', '.tmp'].forEach((x) => { try { fs.unlinkSync(path.join(CONFIG_DIR, f + x)); } catch (_) {} }));
    }
  } catch (e) { log('warn', 'rewriting the token files failed: ' + (e && e.message)); }
}
// Makes this account the active session (session.json) and resets the engine - the next engine:connect
// reconnects with this account's refreshToken. The renderer, the caller will reload.
// session.json = "which account shows at app startup". It does NOT reset the engine - since accounts
// work independently of each other switching does not affect the others.
function makeActiveSession(entry) {
  writeJson(path.join(CONFIG_DIR, 'session.json'), {
    accountName: entry.accountName, steamID: entry.steamID, refreshToken: sealIfEnabled(entry.refreshToken),
  }, true);
}

// Fixed startup size - the same for login and the panel (3:2 ratio) on a big screen; a small screen gets the work area minus a margin.
// Every place that centres/resizes the window (logout, moving to the dashboard, deleting an account, deleting data) uses these
// helpers so it changes from a single place.
const WIN_W = 1716;
const WIN_H = 1144;
// The smallest the window may get. The layout is fluid down to 900 x 560 (the login screen needs a little more height); a smaller window
// zooms the page out as a whole (applyFitZoom) instead of squeezing it, so the buttons shrink with the window and nothing runs off the edge.
const MIN_DASH = windowFit.minWindow(windowFit.DESIGN.dash);
const MIN_LOGIN = windowFit.minWindow(windowFit.DESIGN.login);
let fitDesign = windowFit.DESIGN.login;      // the design size of the page that is (about to be) shown
const WINDOW_FILE = path.join(CONFIG_DIR, 'window.json');   // { x, y, width, height, maximized } of the panel window
// The work area (screen minus the taskbar) of the display a rectangle is mostly on. Its x and y are not 0 when the taskbar is
// on the left or top, or when the display is not the first one.
function workAreaOf(rect) { return screen.getDisplayMatching(rect).workArea; }
function defaultBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(WIN_W, wa.width - 24);
  const height = Math.min(WIN_H, wa.height - 24);
  return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width, height };
}
// A minimum bigger than the screen would leave a window that cannot be fitted on it.
function minimumFor(base, rect) {
  const wa = workAreaOf(rect);
  return { w: Math.min(base.w, wa.width), h: Math.min(base.h, wa.height) };
}
function applyMinimumSize(base) {
  if (!win) return;
  const m = minimumFor(base, win.getBounds());
  win.setMinimumSize(m.w, m.h);
}
// Zooms the page so the design size always fits the window: 1 while the window is at least that big, smaller below it. The content size
// is what the page gets (a frameless window has no frame to subtract).
function applyFitZoom() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const [width, height] = win.getContentSize();
  const zoom = windowFit.fitZoom(width, height, fitDesign, settings.uiScale);
  if (Math.abs(win.webContents.getZoomFactor() - zoom) > 0.001) win.webContents.setZoomFactor(zoom);
}
// Ctrl + / - / 0: the next step of the interface scale (0 = back to 100), saved like the setting in Settings (which shows it next time it opens).
function stepUiScale(dir) {
  const next = dir === 0 ? 100 : windowFit.stepScale(settings.uiScale, dir);
  if (next !== windowFit.normalizeScale(settings.uiScale)) applySettingPatch({ uiScale: next });
}
// While the app itself moves the window (centring, fitting) the position must not be remembered as the user's choice.
let windowSaveBlockedUntil = 0;
// Centres the window on screen and makes it WIN_W x WIN_H. If the screen is small it fits it to the work area.
function centerDefaultSize() {
  if (!win) return;
  windowSaveBlockedUntil = Date.now() + 1500;
  if (win.isMaximized()) win.unmaximize();
  win.setBounds(defaultBounds());
}
// What was kept in window.json, fitted to a screen that exists now. null when there is nothing usable: first start, a damaged file,
// or the screen it was on is gone (an unplugged monitor must not leave the window out of reach).
function loadWindowState() {
  // A plain read on purpose: readJson would mark a damaged file as protected and never let it be rewritten, and a window position is not worth that.
  let v = null;
  try { v = JSON.parse(fs.readFileSync(WINDOW_FILE, 'utf8')); } catch (_) { return null; }
  if (!v || ![v.x, v.y, v.width, v.height].every(Number.isFinite)) return null;
  const want = { x: Math.round(v.x), y: Math.round(v.y), width: Math.round(v.width), height: Math.round(v.height) };
  const wa = workAreaOf(want);
  const overlapW = Math.min(want.x + want.width, wa.x + wa.width) - Math.max(want.x, wa.x);
  const overlapH = Math.min(want.y + want.height, wa.y + wa.height) - Math.max(want.y, wa.y);
  if (overlapW < 200 || overlapH < 120) return null;
  const min = minimumFor(MIN_DASH, want);
  const width = Math.max(min.w, Math.min(want.width, wa.width));
  const height = Math.max(min.h, Math.min(want.height, wa.height));
  const x = Math.min(Math.max(want.x, wa.x), wa.x + wa.width - width);
  const y = Math.min(Math.max(want.y, wa.y), wa.y + wa.height - height);
  return { bounds: { x, y, width, height }, maximized: v.maximized === true };
}
function onPanelPage() {
  try { return !!win && !win.isDestroyed() && win.webContents.getURL().endsWith('/src/main/main.html'); } catch (_) { return false; }
}
let windowSaveTimer = null;
function saveWindowState() {
  clearTimeout(windowSaveTimer);
  windowSaveTimer = null;
  if (!win || win.isDestroyed() || !onPanelPage() || Date.now() < windowSaveBlockedUntil) return;
  if (win.isMinimized() || win.isFullScreen()) return;
  const b = win.getNormalBounds();
  try {
    fs.writeFileSync(WINDOW_FILE + '.tmp', JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() }, null, 2), 'utf8');
    fs.renameSync(WINDOW_FILE + '.tmp', WINDOW_FILE);
  } catch (_) {}
}
function saveWindowStateSoon() {
  clearTimeout(windowSaveTimer);
  windowSaveTimer = setTimeout(saveWindowState, 800);
}
// Login -> panel: the saved place if there is one, the default otherwise.
function enterPanelWindow() {
  if (!win) return;
  fitDesign = windowFit.DESIGN.dash;
  applyMinimumSize(MIN_DASH);
  const st = loadWindowState();
  if (!st) { centerDefaultSize(); applyFitZoom(); return; }
  windowSaveBlockedUntil = Date.now() + 1500;
  win.setBounds(st.bounds);
  if (st.maximized) win.maximize();
  applyFitZoom();
}
function enterLoginWindow() {
  if (!win) return;
  fitDesign = windowFit.DESIGN.login;
  applyMinimumSize(MIN_LOGIN);
  centerDefaultSize();
  applyFitZoom();
}

function createWindow() {
  const sess = hasSession();               // saved refresh token → auto-login straight to dashboard
  const saved = sess ? loadWindowState() : null;
  const start = saved ? saved.bounds : defaultBounds();
  const min = minimumFor(sess ? MIN_DASH : MIN_LOGIN, start);
  fitDesign = sess ? windowFit.DESIGN.dash : windowFit.DESIGN.login;
  windowSaveBlockedUntil = Infinity;   // until the window has been shown (see ready-to-show below)

  win = new BrowserWindow({
    x: start.x, y: start.y, width: start.width, height: start.height, minWidth: min.w, minHeight: min.h,
    frame: false, backgroundColor: '#0f1720', show: false,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });

  // The window only ever shows the app's own pages: no popups, no navigation away (a link in injected content could not open a web page here)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.loadFile(path.join(__dirname, ...(sess ? ['src', 'main', 'main.html'] : ['src', 'login', 'login.html'])));
  // After the window shows, wait one frame and then allow the engine to be set up (see windowOpened).
  win.once('ready-to-show', () => {
    // Showing and maximizing fire move and resize events too; they are the app's own doing, not a choice of the user.
    windowSaveBlockedUntil = Date.now() + 1500;
    // Started by Windows with "Start in the tray": the panel loads and the accounts connect, the window waits for the tray icon. Not without
    // a saved session (the login screen needs the user) and not without an icon to bring it back with.
    const hidden = startHidden && sess && tray && trayHasIcon && !tray.isDestroyed();
    startHidden = false;
    if (hidden) maximizeOnShow = !!(saved && saved.maximized);
    else if (saved && saved.maximized) win.maximize();
    applyFitZoom();      // before the window shows: a zoom left over from an earlier session must not flash on screen
    if (hidden) log('info', 'started in the tray'); else win.show();
    setTimeout(() => resolveWindowOpened(), 50);
  });
  ['resize', 'move', 'maximize', 'unmaximize'].forEach((ev) => win.on(ev, saveWindowStateSoon));
  // The page follows the window: every size change, and every page that loads (login -> panel changes the design size)
  ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'].forEach((ev) => win.on(ev, applyFitZoom));
  win.webContents.on('did-finish-load', applyFitZoom);
  // Ctrl + / - / 0 would change the zoom the window sets for itself, and the next resize would snap it back
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || !['+', '=', '-', '_', '0'].includes(input.key)) return;
    e.preventDefault();
    stepUiScale(input.key === '0' ? 0 : (input.key === '-' || input.key === '_') ? -1 : 1);
  });
  // Windows is shutting down or signing out: the app may be ended before before-quit, so the jobs are written now
  win.on('session-end', () => resumeSave(true));
  win.on('close', (e) => {
    saveWindowState();
    if (!isQuitting && settings.closeToTray) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
}

// window controls
// The minimise button sends the window to the notification area (tray), not to the taskbar; the tray icon brings it back. Without a tray icon it minimises as usual.
ipcMain.on('win:minimize', () => {
  if (!win) return;
  ensureTray();
  if (tray && trayHasIcon && !tray.isDestroyed()) win.hide(); else win.minimize();
});
ipcMain.on('win:maximize', () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => win && win.close());
ipcMain.on('win:fit', (_e, h) => {
  if (!win || win.isMaximized()) return;
  const cur = win.getBounds();
  const wa = workAreaOf(cur);
  const height = Math.min(Math.ceil(h), wa.height - 24);
  windowSaveBlockedUntil = Date.now() + 1500;
  win.setBounds({ x: wa.x + Math.round((wa.width - cur.width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width: cur.width, height });
});
// Widens the window as (+) adds a new account box on the login screen (so they fit side by side).
ipcMain.on('win:setWidth', (_e, w) => {
  if (!win || win.isMaximized()) return;
  const cur = win.getBounds();
  const wa = workAreaOf(cur);
  const width = Math.min(Math.ceil(w), wa.width - 24);
  windowSaveBlockedUntil = Date.now() + 1500;
  win.setBounds({ x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - cur.height) / 2), width, height: cur.height });
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
  // "Sign out of all accounts" - all of them close, including the ones running in the background
  disconnectAll();
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'web-session.json')); } catch (_) {}
  authSlots.clear(); addingAccountMode = false;
  if (!win) return;
  enterLoginWindow();
  win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
});

// login -> dashboard (login.html calls this only when slot 0 finishes successfully)
ipcMain.on('go:dashboard', () => {
  if (!win) return;
  authSlots.clear(); addingAccountMode = false; // if the "Add Account" flow is over reset the flag
  enterPanelWindow();
  win.loadFile(path.join(__dirname, 'src', 'main', 'main.html'));
});

// ---- multi-account management (the top bar account switcher in place of the removed profile on the left bar) ----
// Lists the saved accounts (the refreshToken is not leaked - only the main process uses it).
// If the active session is not in accounts.json (e.g. an old session.json logged in BEFORE the multi-account
// feature) it adds it here on its own - otherwise the account you logged in with would not show in the list.
// The page asks for the live state of the jobs of the account on screen when it is ready and whenever that account starts or stops something. Pushing it
// was not enough: a job resumed at startup before the account on screen was known (or before the page listened) was never told to the page, so a boost ran
// on the account on screen and its pages said nothing was running.
ipcMain.handle('jobs:status', () => {
  if (activeSteamID) sendJobStatus(activeSteamID);
  return { ok: true, steamID: activeSteamID || null };
});
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
      jobs: accountJobKinds(s),                              // which of them
      detail: accountJobDetail(s),                           // and on which games
      finished: (s && s.finished) || null,                   // what ended while the account was in the background, until it is opened
    };
  });
});

// Switch account: NO RELOAD. Only the account the interface shows changes; the previous
// account's card farming/hour boosting job keeps running without interruption in the background.
let switchSeq = 0;
ipcMain.handle('accounts:switch', async (_e, steamID) => {
  const entry = loadAccounts().find((a) => a.steamID === steamID);
  if (!entry) return { ok: false, error: 'Hesap bulunamadı.' };
  const mine = ++switchSeq;
  // The account on screen STAYS the account on screen until the new one is connected. It used to change at once, while the engine, the farm and the pages kept
  // using the old account until the logon was done (several seconds for an account that was still connecting): the first click seemed to do nothing, the
  // pages loaded the OLD account's games and jobs under the new name, and a second click was needed. An account that is already connected answers at once.
  const r = await connectAccount(entry);
  if (mine !== switchSeq) return { ok: true, superseded: true, steamID };     // a newer click won
  if (!r.ok) return r;
  activeSteamID = steamID;
  // session.json always reflects the account "open in the interface" (that one opens on restart)
  makeActiveSession(entry);
  syncActive();
  const slot = accounts.get(steamID);
  if (slot && slot.finished) { slot.finished = null; sendRaw('accounts:activity', { steamID, running: accountRunning(slot), jobs: accountJobKinds(slot), finished: null }); }
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
  resumeStore.forget(steamID);          // what it had left running is not started again for an account that is gone
  const pending = pendingWrite.get(steamID);
  if (pending) { clearTimeout(pending); pendingWrite.delete(steamID); }
  // The account's own data should go too, otherwise when the same account is added again the old
  // queue/statistics come back and the user thinks they deleted it.
  accountDataAll.delete(steamID);
  JSON_SIDE_FILES.forEach((extra) => {
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
    enterLoginWindow();
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
// The kinds of job that run on an account ('card', 'hours', 'realistic'): the interface names them next to the account, so a job on the account that is NOT on
// screen can be seen without opening that account.
// What runs on an account, with its games, for the accounts that are NOT on screen: [{ kind, games: [names], more }]. A job of another account
// (for example one resumed at startup) used to show only as a count; nothing said what it was or where.
function accountJobDetail(s) {
  const out = [];
  const names = (list) => (list || []).map((g) => (g && g.name) || ('App ' + (g && g.appid))).filter(Boolean);
  const pack = (kind, list) => { const all = names(list); out.push({ kind, games: all.slice(0, 2), more: Math.max(0, all.length - 2) }); };
  if (s && s.farm && s.farm.running) {
    const cur = (s.farm.games || []).find((g) => g.appid === s.farm.currentActiveAppid);
    pack('card', cur ? [cur] : (s.farm.games || []).slice(0, 1));
  }
  if (s && s.boost && s.boost.runningFlag) {
    const b = s.boost.request || {};
    pack('hours', b.games || (b.appids || []).map((appid) => ({ appid })));
  } else if (s && s.hoursFarm && s.hoursFarm.running) {
    pack('hours', s.hoursFarm.games || (s.sequentialRequest && s.sequentialRequest.games) || []);
  }
  if (s && s.realistic && s.realistic.activeIds) pack('realistic', s.realistic.activeIds.parallel
    ? s.realistic.gameEntries.filter((g) => !s.realistic.playingIds || s.realistic.playingIds.includes(g.appid)).map((g) => ({ appid: g.appid, name: g.name }))
    : [{ appid: s.realistic.activeIds.appid, name: s.realistic.activeIds.gameTitle }]);
  return out;
}
function accountJobKinds(s) {
  const kinds = [];
  if (s && s.farm && s.farm.running) kinds.push('card');
  if (accountBoostRunning(s)) kinds.push('hours');
  if (s && s.realistic) kinds.push('realistic');
  return kinds;
}
// A job event of an account. Only those of the account open on screen go to the interface; all are kept.
function accountBroadcast(steamID) {
  return (channelName, payloadData) => {
    const s = accounts.get(steamID);
    if (s) s.lastOne[channelName] = payloadData;
    if (steamID === activeSteamID) sendRaw(channelName, { ...payloadData, steamID });
    if (s) {
      const isRunning = accountRunning(s);
      const jobs = accountJobKinds(s);
      if (jobs.length) s.lastJobs = jobs;
      // the games of a running job changed (the next game of a queue): the account list and the overview follow
      const detail = accountJobDetail(s);
      const detailKey = JSON.stringify(detail);
      if (isRunning === s.lastRun && detailKey !== s.lastDetail && isRunning) {
        s.lastDetail = detailKey;
        sendRaw('accounts:activity', { steamID, running: isRunning, jobs, detail, finished: s.finished || null });
      }
      if (isRunning !== s.lastRun) {
        s.lastDetail = detailKey;
        // What ran on an account that is not on screen and has stopped is remembered ("ended at 14:02") until that account is opened: the user cannot see it end otherwise
        if (!isRunning && s.lastRun && steamID !== activeSteamID && s.lastJobs && s.lastJobs.length) s.finished = { jobs: s.lastJobs, ts: Date.now() };
        s.lastRun = isRunning;
        sendRaw('accounts:activity', { steamID, running: isRunning, jobs, detail, finished: s.finished || null });
        updateSleepBlocker();
        resumeSaveSoon();                       // a job started or ended: the file follows within a second
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
// Cards dropped day by day for "Best day". Local date: the user's day, not by UTC.
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
// "Uninterrupted run": the longest time a job (card, hour, Realistic Mode) on an account ran without a
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
// The account earns time only while it is connected and no game of it is open on another device (Steam counts nothing for the held games then).
function earning(s) {
  return !!(s && s.ready && !(s.engine && s.engine.playingBlocked));
}
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
  s.statReady = earning(s);
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
function cardFarmOptions(steamID) {
  return {
    autoNext: settingFor(steamID, 'autoNextGame') !== false,
    maxGames: settingFor(steamID, 'cardMaxGames'),
    fastMinPlaytimeMin: settingFor(steamID, 'fastMinPlaytimeMin'),
    fastRotateMinSec: settingFor(steamID, 'fastRotateMinSec'),
    fastRotateMaxSec: settingFor(steamID, 'fastRotateMaxSec'),
  };
}
// The "When all cards are collected" action set to "Close the app". The check is repeated after a grace period so a job that was
// paused for another one (resumeFarm) or a second account that is still working keeps the app open.
let exitTimer = null;
function scheduleExitWhenIdle(steamID) {
  if (exitTimer) return;
  log('info', 'all cards collected: closing the app in 20 s if nothing else is running');
  exitTimer = setTimeout(() => {
    exitTimer = null;
    if (settingFor(steamID, 'farmFinishedAction') !== 'exit') return;
    let busy = false;
    accounts.forEach((s) => { if (accountRunning(s) || (s && s.pendingFarm)) busy = true; });
    if (busy) { log('info', 'close cancelled: a job is still running'); return; }
    log('info', 'closing the app: every job is finished');
    isQuitting = true;
    app.quit();
  }, 20000);
}
// "When all cards are collected" set to "Start hour boosting": the account's remembered hour-boost list starts running,
// as the Hour Booster page would start it without sync (the page's own options such as sequential idling are not applied here).
async function startBoostAfterCards(steamID) {
  const s = accounts.get(steamID);
  if (!s || !s.engine || !s.ready || accountBoostRunning(s) || s.realistic) return;
  try {
    const ids = accountData(steamID).boostGameIds || [];
    if (!ids.length) {
      log('info', '[' + accountName(steamID) + '] cards done, no hour-boost list saved: nothing to start');
      accountEvent(steamID, { typeName: 'cardStopped', feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Saat yükseltme listesi boş olduğu için başlatılmadı.', status: 'Uyarı' } });
      return;
    }
    const owned = new Map((await s.engine.getOwnedGames()).map((o) => [o.appid, o]));
    const limit = Math.max(1, Math.min(32, +settingFor(steamID, 'boostMaxGames') || 32));
    const games = ids.filter((id) => owned.has(id)).slice(0, limit)
      .map((id) => ({ appid: id, name: owned.get(id).name, playtimeMin: owned.get(id).playtimeForever || 0 }));
    if (!games.length || accountBoostRunning(s) || s.realistic) return;
    boostStart(steamID, { appids: games.map((g) => g.appid), durationMs: 0, games, allItems: null });
    log('info', '[' + accountName(steamID) + '] cards done: hour boosting started (' + games.length + ' games)');
    accountEvent(steamID, { typeName: 'boostStarted', feedEntry: { kind: 'hours', title: 'Saat Yükseltme', text: 'Kartlar bitti; saat yükseltme başladı.', status: 'Çalışıyor' } });
  } catch (e) { log('warn', '[' + accountName(steamID) + '] starting hour boosting after the cards failed: ' + (e && e.message)); }
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
      if (settingFor(steamID, 'farmFinishedAction') === 'exit') scheduleExitWhenIdle(steamID);
      else if (settingFor(steamID, 'farmFinishedAction') === 'boost') startBoostAfterCards(steamID);
    } else if ((payloadData.cause === 'duration' || payloadData.cause === 'gameFinished') && payloadData.wasRunning) {
      // "Move on when a game is done" is off: it says why it stopped, otherwise the user
      // thought the job had closed on its own.
      accountEvent(steamID, {
        typeName: 'cardStopped',
        feedEntry: { kind: 'card', title: 'Kart Düşürme', status: 'Durdu',
          text: payloadData.cause === 'duration'
            ? 'Oyunun süresi doldu; sıradakine geçme kapalı olduğundan durdu.'
            : 'Oyunun kartları bitti; sıradakine geçme kapalı olduğundan durdu.' },
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
  s.farm.start(mode, games || [], durationMs, { ...cardFarmOptions(steamID), ...(extra || {}) });
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
// "Unlock achievements while farming" (farmAchUnlock). It was in the interface and only worked for the account on screen,
// while the window was open. Interval: the achievement unlock interval, at least one minute.
async function openCardAchievements(steamID) {
  if (!settingFor(steamID, 'farmAchUnlock')) return;
  const s = accounts.get(steamID);
  if (!s || !s.watcher || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
  const trace = s.watcher;
  const intervalMs = Math.max(60, +settingFor(steamID, 'achDelay') || 60) * 1000;
  if (trace.achievementBusy || Date.now() - (trace.lastAchievement || 0) < intervalMs) return;
  const appid = s.farm.currentActiveAppid;
  if (!appid) return;
  trace.achievementBusy = true;
  try {
    const data = await s.engine.getAchievements(appid);
    const locked = ((data && data.achievements) || []).filter((a) => !a.achieved && !a.protectedFlag);
    if (!locked.length) return;
    const picked = settingFor(steamID, 'achSpread') ? locked[Math.floor(Math.random() * locked.length)] : locked[0];
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
// "Pause farming while boosting hours". The setting's description said "when hour boosting ends
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
// forceIt: resume even if hour boosting continues (the "pause" setting was turned off).
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
  stopKeyRun(s);
  if (steamID) {
    try { boostStopAccount(steamID, 'user'); } catch (_) {}
    try { if (s.realistic) realisticFinish(steamID, 'user stopped'); } catch (_) {}
    try { statsHour(steamID); } catch (_) {}
  }
  if (s.statHour) { clearInterval(s.statHour); s.statHour = null; }
}

// G3: Carries the engine's connection state to the interface. A connection that dropped at run time
// used to be reported nowhere; the user looked at "running" for hours and
// actually earned nothing.
function bindConnectionState(eng, steamID) {
  // A game of the account is open on another device (the Steam client): the engine holds its games until it ends. Told to the log, connection.log and the page.
  eng.onPlaying = (blocked, appid) => {
    const s = accounts.get(steamID);
    if (s && s.engine && s.engine !== eng && !s.connecting) return;
    log('info', '[' + steamID + '] ' + (blocked ? 'a game of this account is open on another device' + (appid ? ' (' + appid + ')' : '') + ', the games wait' : 'the other device stopped playing, the games are open again'));
    logger.connection(steamID, blocked ? 'blocked' : 'unblocked', appid ? { appid: +appid } : null);
    sendRaw('engine:playing', { steamID, blocked: !!blocked, appid: appid || null, activeIds: steamID === activeSteamID });
    holdCounters(steamID, !!blocked);
  };
  eng.onStatus = (status, extra) => {
    const s = accounts.get(steamID);
    // An engine that is not the account's any more says nothing about it: an old one that still reported "reconnecting" set the account to "not connected"
    // while the new one worked. (During connectAccount the new one is not s.engine yet; its statuses count.)
    if (s && s.engine && s.engine !== eng && !s.connecting) return;
    if (s) {
      // The counters must not count the downtime: first the time up to that moment is written.
      if (status !== 'connected') statsHour(steamID);
      s.ready = (status === 'connected');
      if (s.ready) { s.lastConnection = Date.now(); s.statLast = Date.now(); s.statReady = true; }
      // A long drop splits the uninterrupted run; one shorter than a minute does not (see handleUninterruptedRun).
      if (accountRunning(s)) handleUninterruptedRun(steamID, s.ready);
      syncConnectionChanged(steamID, earning(s));
      // A card farm paused for a job that ended while the connection was down could not start then (resumeFarm needs a connection) and stayed paused for
      // good, blocking the schedule and the resume of jobs too. It is given back when the connection is; resumeFarm leaves it paused if that job still runs.
      if (s.ready && s.pendingFarm) resumeFarm(steamID);
      // the key queue waits 30 s at a time while the connection is down and showed "Not connected" until its next try: it goes on as soon as the connection is back
      if (s.ready && s.keys && s.keys.running && s.keys.error === 'Bağlı değil.') { s.keys.error = null; keyChanged(steamID); if (s.keys.cancelSleep) s.keys.cancelSleep(); }
    }
    if (steamID === activeSteamID) { engineReady = (status === 'connected'); }
    // Log text. The interface builds the text in its own language from the fields (condition, cause, attemptCount, waitMs,
    // limitValue, gameEntries); the text here is only for the log file.
    const message = status === 'dropped'
      ? ('Steam connection dropped: ' + (extra.cause || '?'))
      : status === 'connecting'
        ? (extra.trying
            ? ('reconnecting: attempt ' + extra.attemptCount + ' started (deadline ' + Math.round((extra.deadlineMs || 0) / 1000) + ' s)')
            : ('reconnecting (attempt ' + extra.attemptCount + ', in ' + Math.round((extra.waitMs || 0) / 1000) + ' s)' + (extra.lastFailure ? ', last: ' + extra.lastFailure : '')))
        : status === 'abandoned'
          ? ('reconnecting stopped' + (extra.permanent ? (' (permanent: ' + (extra.cause || '?') + ')') : (' (' + (extra.attemptCount || 0) + ' attempts)')))
          : status === 'connected' && extra.reconnected
            ? ('reconnected, ' + (extra.gameEntries || 0) + ' games reopened')
            : 'connected';
    log(status === 'dropped' || status === 'abandoned' ? 'warn' : 'info', '[' + steamID + '] ' + message);
    // connection.log keeps every one of these whatever the level (the countdown between attempts is one "waiting" line, not one per second)
    if (status === 'dropped') {
      if (s) { s.droppedAt = Date.now(); s.lastAttempt = 0; }
      logger.connection(steamID, 'dropped', { cause: extra.cause });
    } else if (status === 'connecting') {
      if (extra.trying && s) s.lastAttempt = extra.attemptCount || 0;
      logger.connection(steamID, extra.trying ? 'attempt' : 'waiting', extra.trying
        ? { attempt: extra.attemptCount, deadlineMs: extra.deadlineMs }
        : { attempt: extra.attemptCount, nextMs: extra.waitMs, cause: extra.lastFailure });
    } else if (status === 'abandoned') {
      logger.connection(steamID, 'abandoned', { attempts: extra.attemptCount || 0, permanent: !!extra.permanent, cause: extra.cause });
    } else if (status === 'connected') {
      logger.connection(steamID, extra.reconnected ? 'reconnected' : 'connected', extra.reconnected
        ? { games: extra.gameEntries || 0, attempts: (s && s.lastAttempt) || 0, downMs: s && s.droppedAt ? Date.now() - s.droppedAt : null }
        : null);
      if (s) { s.droppedAt = null; s.lastAttempt = 0; }
    }
    // The first session of an account whose first logon failed (no network at start) and that the engine's own loop opened later: what connectAccount does
    // after a logon is done now
    if (status === 'connected' && extra.first && s && s.engine === eng) {
      resumeKeyQueue(steamID);
      resumeAfterConnect(steamID);
      syncActive();
    }
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
// The "Reconnect" button in the interface: restarts the attempts of an engine that gave up.
ipcMain.handle('engine:reconnect', () => {
  const s = accounts.get(activeSteamID);
  if (!s || !s.engine) return { ok: false, error: 'Bağlı değil.' };
  if (s.ready) return { ok: true, alreadyConnected: true };
  s.engine.tryReconnect(true);
  return { ok: true };
});
// The connection of the account on screen (Settings > Account status). Not a guess, the last thing the engine reported.
ipcMain.handle('engine:connectionStatus', () => {
  const s = activeSteamID ? accounts.get(activeSteamID) : null;
  if (!s || !s.engine) return { condition: 'none' };
  if (s.ready) return { condition: 'connected', ts: s.lastConnection || null, playingBlocked: !!s.engine.playingBlocked };
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
// 'profileInfo': the last known name/avatar/level/custom address. It goes to the interface together with the settings,
// so it can be written to the screen at startup without waiting for the Steam session.
// 'grQueue' and 'grPresets': Realistic Mode's game queue and saved presets. Account
// specific, because the library and achievement state differ per account.
const ACCOUNT_SETTING_KEYS = ['boostGameIds', 'profileInfo', 'grQueue', 'grPresets', 'parentalPin', 'proxyUrl', 'farmExcluded', 'farmWhitelist', 'farmWhitelistOnly', 'favoriteGames', 'personaState'];
// The settings of the JOBS of an account (card farming, hour boosting, Realistic Mode, achievements). They used to be one set for the whole app: two accounts could
// not run Realistic Mode with two different durations, and a change made on one account changed the job of the other. Each account now keeps its own values in
// its account file (jobSettings); an account that has never changed one reads the general value, so nothing changes for anyone on the first start.
// The schedules of card farming and Realistic Mode too (each account its own range). The look, the language, notifications, the network and the app's
// behaviour stay general.
const ACCOUNT_SCOPED_SETTINGS = [
  'cardPriorityMode', 'farmSkipUnplayed', 'farmSkipRecent', 'farmFinishedAction', 'cardMaxGames', 'farmAutoSell', 'farmAchUnlock', 'farmMaxMinutes',
  'fastMinPlaytimeMin', 'fastRotateMinSec', 'fastRotateMaxSec', 'autoNextGame', 'queueSort',
  'boostMaxGames', 'rememberBoostList', 'pauseFarmOnBoost', 'boostTarget', 'boostStagger', 'shuffleBoost', 'boostSync', 'boostSyncMode', 'boostSyncTargetHours',
  'boostSyncLibraryMaxMin', 'boostSyncStrategy', 'boostAutoRestart', 'seqIdle', 'loopQueue', 'boostDurationSec',
  'grDurationSec', 'grTargetAuto', 'grTarget', 'grCR', 'grDiff', 'grTc', 'grTcGame', 'grModel', 'grAuto', 'grRandomGap', 'grSkipUltraRare', 'grKeepHours', 'grCatchUp',
  'grAutoDuration', 'grParallel', 'grSpeed', 'grUltraMultiplier', 'grCatchUpShare', 'grFinishedRatio', 'grLevel',
  'achConfirmSingle', 'achDelay', 'achOrder', 'achSafeMode', 'achSpread',
  'farmScheduleEnabled', 'farmScheduleFrom', 'farmScheduleTo', 'grScheduleEnabled', 'grScheduleFrom', 'grScheduleTo',
];
const ACCOUNT_SCOPED = new Set(ACCOUNT_SCOPED_SETTINGS);
const DEFAULT_ACCOUNT_DATA = {
  boostGameIds: [], entries: {}, achLog: [], stats: null, profileInfo: null,
  grQueue: [], grPresets: [],
  parentalPin: '',                 // Steam Family View PIN of this account (never exported)
  proxyUrl: '',                    // proxy of this account (http://, https:// or socks5://, may hold a user:password; never exported)
  personaState: null,              // what friends see, chosen in the top bar: online | away | invisible (null: never chosen, online)
  keyQueue: [], keyResults: [], keyActive: false,   // product key queue (see PRODUCT KEYS)
  grCompleted: {},                 // appid -> when it was learned that nothing is left to unlock (Realistic Mode leaves it out of its game list)
  farmExcluded: [],                // card farming blacklist (appids); unlike the queue state it never expires
  farmWhitelist: [],               // appids that card farming is limited to while farmWhitelistOnly is on
  farmWhitelistOnly: false,
  grLastRun: null,                 // the last Realistic Mode start of this account { gameEntries, spanMs, optionList }: what the schedule repeats
  jobSettings: {},                 // this account's own values of ACCOUNT_SCOPED_SETTINGS (the ones it changed); the rest comes from the general settings
  favoriteGames: [],               // games starred in the Hour Booster, Realistic Mode and Achievements lists (shown first)
};

const accountDataAll = new Map();   // steamID -> data
// Account file fields that are sealed with the login tokens when "Encrypt login tokens" is on
const SECRET_ACCOUNT_FIELDS = ['parentalPin', 'proxyUrl'];

function accountFile(steamID) { return path.join(ACCOUNT_DIR, String(steamID) + '.json'); }

// A list of appids from the interface: positive integers only, no duplicates
function cleanAppIds(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}
function accountData(steamID) {
  if (!steamID) return { ...DEFAULT_ACCOUNT_DATA, entries: {}, achLog: [], keyQueue: [], keyResults: [] };
  if (accountDataAll.has(steamID)) return accountDataAll.get(steamID);
  const r = readJson(accountFile(steamID));
  const v = r.ok
    ? { ...DEFAULT_ACCOUNT_DATA, ...r.dataBlock }
    : { ...DEFAULT_ACCOUNT_DATA, entries: {}, achLog: [] };
  SECRET_ACCOUNT_FIELDS.forEach((k) => {
    const plain = openToken(v[k]);
    if (plain === null) { log('warn', 'account ' + steamID + ': ' + k + ' is sealed for another Windows user or computer and was dropped'); v[k] = ''; }
    else v[k] = plain;
  });
  if (r.ok && r.fromBackup) readErrors.push({ displayName: 'Hesap verisi (' + steamID + ')', recoveredFlag: true });
  if (r.corrupt) readErrors.push({ displayName: 'Hesap verisi (' + steamID + ')', recoveredFlag: false });
  // the defaults hold shared arrays: every account needs its own, since the key queue is changed in place
  ['keyQueue', 'keyResults', 'farmExcluded', 'farmWhitelist', 'favoriteGames'].forEach((k) => { if (!Array.isArray(v[k]) || v[k] === DEFAULT_ACCOUNT_DATA[k]) v[k] = []; });
  if (!v.jobSettings || typeof v.jobSettings !== 'object' || Array.isArray(v.jobSettings) || v.jobSettings === DEFAULT_ACCOUNT_DATA.jobSettings) v.jobSettings = {};
  Object.keys(v.jobSettings).forEach((k) => { if (!ACCOUNT_SCOPED.has(k)) delete v.jobSettings[k]; });
  // Games taken out of the queue used to live in the queue state, which expires with the retention period: move them to the blacklist once
  const legacy = v.entries && v.entries['cards.queue'] && v.entries['cards.queue'].v;
  if (legacy && Array.isArray(legacy.removed) && legacy.removed.length) {
    v.farmExcluded = cleanAppIds(v.farmExcluded.concat(legacy.removed));
    legacy.removed = [];
    log('info', 'account ' + steamID + ': ' + v.farmExcluded.length + ' removed games moved to the card farming blacklist');
  }
  accountDataAll.set(steamID, v);
  return v;
}
function writeAccountData(steamID) {
  if (!steamID) return;
  const t = pendingWrite.get(steamID);
  if (t) { clearTimeout(t); pendingWrite.delete(steamID); }
  const data = accountData(steamID);
  const out = { ...data };
  SECRET_ACCOUNT_FIELDS.forEach((k) => { out[k] = sealIfEnabled(data[k]); });
  writeJson(accountFile(steamID), out, false);
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

// ---- VISIBILITY ON STEAM (the top bar) ----
// Chosen per account, as in the Steam client, and kept in the account file; the engine sends it again on every logon, reconnect and game
// change. "Appear offline" (one general switch up to 1.8.0, in Settings and on the Hour Booster page) became the Invisible choice.
const PERSONA_STATES = ['online', 'away', 'invisible'];
function personaName(v) { return PERSONA_STATES.includes(v) ? v : 'online'; }
function personaOf(steamID) { return steamID ? personaName(accountData(steamID).personaState) : 'online'; }
function applyPersona(steamID) {
  const s = accounts.get(steamID);
  if (s && s.engine) { try { s.engine.applyPrivacy(personaOf(steamID), settings.hideGameName); } catch (_) {} }
  log('info', '[' + accountName(steamID) + '] visibility: ' + personaOf(steamID));
}
// "Appear offline" was on in a settings file of 1.8.0 or older: every saved account starts Invisible, unless it has a choice of its own
function personaFromOfflineMode() {
  const r = readJson(ACCOUNTS_FILE);
  (r.ok && Array.isArray(r.dataBlock) ? r.dataBlock : []).forEach((a) => {
    if (!a || !a.steamID || accountData(a.steamID).personaState) return;
    accountData(a.steamID).personaState = 'invisible';
    writeAccountData(a.steamID);
  });
  log('info', 'the old "appear offline" switch became the invisible visibility of the saved accounts');
}
// The value of a job setting for one account: its own value if it set one, otherwise the general one. Every job reads its settings from here with ITS account.
function settingFor(steamID, key) {
  if (steamID && ACCOUNT_SCOPED.has(key)) {
    const own = accountData(steamID).jobSettings;
    if (own && Object.prototype.hasOwnProperty.call(own, key)) return own[key];
  }
  return settings[key];
}

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
    moved.push(v.boostGameIds.length + ' hour-boost games');
  }
  if (appState && appState.entries && Object.keys(appState.entries).length && !Object.keys(v.entries).length) {
    v.entries = JSON.parse(JSON.stringify(appState.entries));
    moved.push(Object.keys(v.entries).length + ' saved states');
  }
  if (appState && Array.isArray(appState.achLog) && appState.achLog.length && !v.achLog.length) {
    v.achLog = appState.achLog.slice();
    moved.push(v.achLog.length + ' achievement log entries');
  }
  if (!v.stats && lifeStats) { v.stats = { ...lifeStats }; moved.push('stats'); }
  writeAccountData(activeSteamID);
  settings.accountDataMigrated = true; saveSettings();
  if (moved.length) log('info', 'account data moved (' + activeSteamID + '): ' + moved.join(', '));
}
// Binds the module level shortcuts to the active account.
// What is not tied to an engine goes through the proxy of the account on screen: the images of the pages (the app window's session),
// the fee script and the update check. The window talks to a local proxy (localProxy.js) that carries on to the account's proxy with
// its login; with no proxy the session goes back to the system setting it had before.
let localProxy = null;
let appliedProxyKey = null;
function applyActiveProxy() {
  const text = activeSteamID ? accountData(activeSteamID).proxyUrl : '';
  const p = parseProxy(text);
  const key = p.ok && !p.empty ? p.url : '';
  if (key === appliedProxyKey) return Promise.resolve();
  appliedProxyKey = key;
  setActiveProxy(p);
  const old = localProxy;
  localProxy = null;
  const closeOld = old ? old.close() : Promise.resolve();
  if (!key) {
    try { session.defaultSession.setProxy({ mode: 'system' }); log('info', 'app window traffic is direct (system setting)'); }
    catch (e) { log('warn', 'could not set the window proxy: ' + (e && e.message)); }
    return closeOld;
  }
  return closeOld.then(() => startLocalProxy(p)).then((lp) => {
    if (appliedProxyKey !== key) { lp.close(); return; }       // the account on screen changed while this one started
    localProxy = lp;
    return session.defaultSession.setProxy({ proxyRules: 'http://127.0.0.1:' + lp.port, proxyBypassRules: '<local>' })
      .then(() => log('info', 'app window traffic goes through the proxy of the account on screen'));
  }).catch((e) => log('warn', 'could not set the window proxy: ' + (e && e.message)));
}
function syncActive() {
  applyActiveProxy();
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
  if (entry.locked) return { ok: false, error: 'Bu hesabın oturumu başka bir Windows kullanıcısı ya da bilgisayar için şifrelenmiş; yeniden giriş yapman gerekiyor.' };
  if (s.ready && s.engine) return { ok: true, persona: s.engine.persona, steamID: s.engine.steamID };
  // The engine of the account is reconnecting on its own (a drop, or a first logon that failed): a page that asked for the connection gets "not connected"
  // and no second engine. A second one logged on next to the first; Steam drops one of two sessions of an account (LogonSessionReplaced), and the two fought.
  if (s.engine && s.engine.reconnecting && s.engine.reconnecting()) return { ok: false, error: 'Bağlı değil.' };
  // An engine that gave up (the attempt limit, another session) is shut down before a new one is made, so it can never come back next to it.
  if (s.engine && !s.ready) { try { s.engine.logOff(); } catch (_) {} }
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
  let lastErr = null, lastEngine = null;
  await windowOpened;
  const SteamEngine = steamEngineClass();
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i - 1)));
    // The currency does NOT come from the SETTING but from the account's wallet (the 'wallet' event at logon fills it).
    // The currency is read from the Steam market session; it cannot be chosen in the settings.
    const eng = new SteamEngine();
    lastEngine = eng;
    eng.reconnectLimit = reconnectLimit();
    eng.parentalPin = accountData(entry.steamID).parentalPin || '';
    try { eng.setProxy(accountData(entry.steamID).proxyUrl); }
    catch (e) { log('error', '[' + entry.accountName + '] proxy not used, connection stopped: ' + e.message); return { ok: false, error: e.message }; }
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
      eng.applyPrivacy(personaOf(entry.steamID), settings.hideGameName);   // kept until the logon: it sends nothing before
      const info = await eng.logOn(entry.refreshToken, personaOf(entry.steamID));
      s.engine = eng; s.ready = true;
      log('info', `[${entry.accountName}] session opened`);
      resumeKeyQueue(entry.steamID);
      resumeAfterConnect(entry.steamID);
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
  // The first logon failed (no network when the app started, Steam down). Before 1.7.8 the account then stayed unconnected until the app was restarted; now the
  // last engine keeps trying in the background as after a drop, and when it logs on bindConnectionState does what is done above (status 'connected', first).
  if (lastEngine && settings.reconnectPolicy !== 'off') {
    s.engine = lastEngine;
    lastEngine.startReconnecting(entry.refreshToken, personaOf(entry.steamID));
    log('warn', `[${entry.accountName}] first logon failed, trying again in the background`, true);
  }
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
// that time "Total cards" and "Library" showed a dash. Now the last known values are
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

// Games of an account that can still be refunded: bought within REFUND_DAYS and played under REFUND_MAX_MIN. Cached for ten
// minutes per account. When Steam does not answer the answer is "none", so the farm is not held back by a failed lookup.
const REFUND_DAYS = 14, REFUND_MAX_MIN = 120, REFUND_CACHE_MS = 10 * 60000;
const refundCache = new Map();   // steamID -> { at, ids: Set }
async function refundableAppIds(steamID, playtimes) {
  const s = accounts.get(steamID);
  if (!s || !s.engine || !s.ready) return new Set();
  let hit = refundCache.get(steamID);
  if (!hit || Date.now() - hit.at > REFUND_CACHE_MS) {
    try { hit = { at: Date.now(), ids: await s.engine.getRecentAppIds(REFUND_DAYS) }; }
    catch (e) { log('warn', '[' + accountName(steamID) + '] recent purchases could not be read: ' + (e && e.message)); hit = { at: Date.now() - REFUND_CACHE_MS + 60000, ids: new Set() }; }
    refundCache.set(steamID, hit);
  }
  return new Set([...hit.ids].filter((id) => (playtimes.get(id) || 0) < REFUND_MAX_MIN));
}
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
    const refundIds = settingFor(activeSteamID, 'farmSkipRecent') ? [...await refundableAppIds(activeSteamID, mins)] : [];
    return { ok: true, games: output, refundIds };
  } catch (e) { return { ok: false, error: e.message }; }
});

// "Export CSV" on the Inventory page: the page sends the rows it shows, this writes them where the user chooses.
ipcMain.handle('inventory:exportCsv', async (_e, rows) => {
  if (!Array.isArray(rows) || !rows.length || rows.length > 200000 || !rows.every((r) => Array.isArray(r) && r.length < 40)) return { ok: false, error: 'Dışa aktarılacak satır yok.' };
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: ct('Envanteri CSV olarak kaydet'),
    defaultPath: path.join(app.getPath('documents'), 'steamedge-inventory-' + stamp + '.csv'),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    // the BOM makes Excel read the text as UTF-8
    fs.writeFileSync(r.filePath, '\ufeff' + toCsv(rows), 'utf8');
    log('info', 'inventory exported: ' + rows.length + ' rows');
    return { ok: true, file: r.filePath, count: rows.length - 1 };
  } catch (e) { return { ok: false, error: (e && e.message) || 'Dosya yazılamadı.' }; }
});

// arg (optional): { appid, contextId, appName } - the backpack of a game instead of the Steam community inventory.
// `incomplete` says a later page of a big inventory was refused: the items are only a part of it.
ipcMain.handle('engine:inventory', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const source = inventorySources.validSource(arg);
  if (!source) return { ok: false, error: ct('Geçersiz envanter.') };
  try {
    const items = await engine.getInventory(source.appid, source.contextId, (arg && arg.appName) ? String(arg.appName).slice(0, 80) : null);
    return { ok: true, items, incomplete: !!items.incomplete };
  } catch (e) { return { ok: false, error: e.message }; }
});
// The games the account has items in (the source list of the Inventory page). Steam's inventory page is read once in ten minutes.
let inventorySourcesCache = null;
ipcMain.handle('engine:inventorySources', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const who = activeSteamID;
  if (inventorySourcesCache && inventorySourcesCache.steamID === who && Date.now() - inventorySourcesCache.ts < 10 * 60 * 1000) return inventorySourcesCache.value;
  try {
    const got = await marketGate(() => engine.getInventorySources());
    const value = { ok: true, found: got.found, list: got.list };
    inventorySourcesCache = { steamID: who, ts: Date.now(), value };
    return value;
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---- price cache + throttled fetcher ----
// MEASURED: Steam serves 20 priceoverview requests then 429s; the window clears after ~30s.
// So we fetch in batches of 18 (safety margin) with a 32s cooldown, and persist results to disk
// so a full library scan only happens once (prices are re-checked after settings.priceRefreshHours).
const PRICE_FILE = path.join(CACHE_DIR, 'prices.json');   // price cache
// G8: realised sale history cache (the average/median comes from here).
// Kept SEPARATE from the price: the pricehistory endpoint needs a separate request for every item and is much
// more expensive. It is filled by the "Fetch prices" button, after the prices.
const HISTORY_FILE = path.join(CACHE_DIR, 'history.json');
const BATCH_SIZE = 18;
const BATCH_COOLDOWN_MS = 32000;

// Two separate caches, ONE queue (see "UNIFIED MARKET QUEUE"). The caches stay separate
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
let marketQueue = [];        // [{ h, priceValue, pastRecords }]
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
// A step that may hang never holds the screen: after ms it gives up with an error.
function withTimeout(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}
let marketChain = Promise.resolve();
let lastMarketAt = 0;
function marketGate(fn, minGap) {
  const run = async () => {
    const gap = Math.max(settings.apiRequestDelayMs || 350, minGap || 0);
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
// (Settings > "Fetch the average alongside the price"). If turned off the average only comes with the
// "Average" button in Inventory - then a single request is made per item.
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

// The engine of the account a request names (a bulk operation keeps the account it started on), or of the account on screen.
// A named account that is not connected (or was removed) gives no engine: the request must not fall through to another account.
function engineFor(steamID) {
  if (steamID) { const s = accounts.get(String(steamID)); return s && s.ready && s.engine ? s.engine : null; }
  return engineReady && engine ? engine : null;
}
ipcMain.handle('engine:achievements', async (_e, arg) => {
  const appid = (arg && typeof arg === 'object') ? arg.appid : arg;
  const isFresh = !!(arg && typeof arg === 'object' && arg.freshFlag);
  const eng = engineFor(arg && typeof arg === 'object' ? arg.steamID : null);
  if (!eng) return { ok: false, error: 'Bağlı değil.' };
  // freshFlag: throw away the schema/value cache, read again from Steam. The verification after a bulk
  // operation uses this; reading from the cache would give back our own guess.
  if (isFresh) { try { eng.invalidateStats(appid); } catch (_) {} }
  try { return { ok: true, data: await eng.getAchievements(appid) }; }
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
  dailyCards: {},        // 'YYYY-MM-DD' -> cards dropped that day (Best day)
  saleAmount: 0,         // the total the seller keeps of the items put on sale (cents)
  pricedForSale: 0,       // number of listings whose amount is known (Average sale = saleAmount / pricedForSale)
  longestRunMs: 0,    // uninterrupted run (Uninterrupted run)
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
    if (r.fromBackup) readErrors.push({ displayName: 'Kayıtlı durum', recoveredFlag: true });
  } else {
    appState = { entries: {}, achLog: [] };
    if (r.corrupt) readErrors.push({ displayName: 'Kayıtlı durum', recoveredFlag: false });
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
  // a bulk operation names the account it runs on: the log entry belongs there even if another account is on screen now
  const owner = entry && entry.steamID && accounts.has(String(entry.steamID)) ? String(entry.steamID) : activeSteamID;
  const v = owner === activeSteamID ? activeAccountData() : accountData(owner);
  const { steamID: _owner, ...rest } = entry || {};
  v.achLog.unshift({ ...rest, ts: Date.now() });
  if (v.achLog.length > 2000) v.achLog.length = 2000;
  pruneAccountRecords(v); writeAccountDataDelayed(owner);
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

ipcMain.handle('engine:setAchievements', async (_e, { appid, changes, steamID }) => {
  const eng = engineFor(steamID);
  // notConnected / refused: a bulk run waits for the connection and sends a write again that got no answer, but not one that Steam refused
  if (!eng) return { ok: false, error: 'Bağlı değil.', notConnected: true };
  try { return { ok: true, result: await eng.setAchievements(appid, changes) }; }
  catch (e) { return { ok: false, error: e.message, refused: !!(e && (e.protectedFlag || /EResult/.test(String(e.message || '')))), notConnected: !eng.isConnected }; }
});

// ---- SALE ----
// Steam's fee calculation (see src/services/steamFee.js). toplamlar: the amounts the buyer pays,
// in cents. Returns: for each, the amount that will go to Steam and the real price at which the listing
// will appear on the market.
// What the machine has, for Settings > Modules > "Set up for this computer"
ipcMain.handle('app:hardware', () => {
  let gpu = 'unknown';
  try { gpu = (app.getGPUFeatureStatus() || {}).gpu_compositing || 'unknown'; } catch (_) {}
  return { cores: os.cpus().length || 0, memGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)), gpuCompositing: gpu };
});

ipcMain.handle('engine:saleFee', async (_e, totals) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  let wallet = null;
  try {
    // Through the market gate, so it does not race the price queue, and with a limit so a slow Steam cannot hold the sale screen.
    wallet = await withTimeout(marketGate(() => engine.walletInfo()), 25000, 'zaman aşımı');
  } catch (e) {
    log('warn', 'could not read the wallet fee fields: ' + (e && e.message));
    return { ok: false, error: ct('Steam ücret hesabı yüklenemedi:') + ' ' + ct((e && e.message) || '') };
  }
  // The fee fields also go to the page: with them it can work the amounts out at once while Steam's own script is not answering.
  const fee = {
    pct: parseFloat(wallet.wallet_fee_percent != null ? wallet.wallet_fee_percent : 0.05),
    pubPct: parseFloat(wallet.wallet_publisher_fee_percent_default != null ? wallet.wallet_publisher_fee_percent_default : 0.10),
    min: parseInt(wallet.wallet_fee_minimum != null ? wallet.wallet_fee_minimum : 1, 10),
    base: parseInt(wallet.wallet_fee_base != null ? wallet.wallet_fee_base : 0, 10),
  };
  try {
    const outcome = await withTimeout(steamFee().compute(wallet, Array.isArray(totals) ? totals.slice(0, 5000) : []), 25000, 'zaman aşımı');
    return { ok: true, outcomeData: outcome, rate: engine.currencyCode(), fee };
  } catch (e) {
    log('warn', 'could not calculate the sale fee: ' + (e && e.message));
    return { ok: false, error: ct('Steam ücret hesabı yüklenemedi:') + ' ' + ct((e && e.message) || ''), fee };
  }
});

// What Steam's listing error means. ACCOUNT TRUSTWORTHINESS decides Steam's listing limit:
// a new account can be stopped after 10-15 listings, an old account can list 80+ at
// once. Continuing after hitting the limit only piles up errors;
// the safest way is to stop and tell the user.
//   limit  : Steam stopped listing (too many listings awaiting confirmation, too many requests, wallet cap)
//   skip   : this item cannot be listed (it already has a listing awaiting confirmation, not in the inventory); move on to the next
//   general: reason unclear; if it happens twice in a row it is treated like a limit
function saleErrorType(e) {
  const m = String((e && (e.steamMessage || e.message)) || '');
  const http = e && e.httpStatus;
  if (/already have a listing|no longer in your inventory|not allowed to be traded|specified item/i.test(m)) return 'skip';
  if (http === 429 || http === 503 || http === 502
      || /too many|pending confirmation|previous action|wallet|maximum|exceed|rate limit|try again later/i.test(m)) return 'limit';
  return 'general';
}
// Listing is the most sensitive request an account makes. Every listing goes through the market gate (one at a time, with the
// price queue, at least SELL_GAP_MS apart), and an asset that is being listed or was listed a moment ago is not sent again:
// pressing Sell twice, or two screens asking for the same item, cannot send the same request twice.
const SELL_GAP_MS = 1500;
const SELL_REPEAT_MS = 10 * 60 * 1000;
const sellInFlight = new Set();
const sellDone = new Map();
// appid and contextId say where the item lives (a game's backpack); without them it is a Steam community item (753, 6).
ipcMain.handle('engine:sellItem', async (_e, { assetId, priceCents, amount, appid, contextId, steamID: owner }) => {
  // the account the sale started on: a batch that waited minutes must not list on the account that is on screen now
  const eng = engineFor(owner);
  if (!eng) return { ok: false, error: 'Bağlı değil.', typeName: 'limit' };
  const source = inventorySources.validSource(appid == null ? null : { appid, contextId });
  if (!source) return { ok: false, error: ct('Geçersiz envanter.'), typeName: 'skip' };
  const steamID = owner && accounts.has(String(owner)) ? String(owner) : activeSteamID;
  const key = steamID + ':' + (source.appid === inventorySources.COMMUNITY.appid ? '' : source.appid + ':') + String(assetId);
  const earlier = sellDone.get(key);
  if (sellInFlight.has(key) || (earlier && Date.now() - earlier < SELL_REPEAT_MS)) {
    return { ok: false, error: ct('Bu öğe için istek zaten gönderildi.'), typeName: 'skip' };
  }
  sellInFlight.add(key);
  try {
    const result = await marketGate(() => eng.sellItem(assetId, priceCents, amount || 1, source.appid, source.contextId), SELL_GAP_MS);
    sellDone.set(key, Date.now());
    // The statistic is the number of items "put on sale": a listing was made, whether it sold is not known. The amount is
    // what the seller will keep (Steam's cut deducted); "Average sale" is computed from it.
    const count = amount || 1;
    addStat(steamID, { cardsSold: count, saleAmount: (+priceCents || 0) * count, pricedForSale: count });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Listeleme reddedildi', typeName: saleErrorType(e), http: (e && e.httpStatus) || null };
  } finally {
    sellInFlight.delete(key);
  }
});

// ================== MY LISTINGS, BOOSTER PACKS ==================
// Both go through the market gate so they never race the price queue.
ipcMain.handle('market:myListings', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, data: await marketGate(() => engine.getMyListings()) }; }
  catch (e) { return { ok: false, error: (e && e.message) || 'Pazar ilanları alınamadı.' }; }
});
ipcMain.handle('market:removeListing', async (_e, arg) => {
  // { listingId, steamID }: the account the listings were read from (the old form, a bare id, means the account on screen)
  const listingId = arg && typeof arg === 'object' ? arg.listingId : arg;
  const eng = engineFor(arg && typeof arg === 'object' ? arg.steamID : null);
  if (!eng) return { ok: false, error: 'Bağlı değil.' };
  try { await marketGate(() => eng.removeListing(listingId)); log('info', 'market listing removed: ' + listingId); return { ok: true }; }
  catch (e) { return { ok: false, error: (e && e.message) || 'İlan iptal edilemedi.', rateLimited: !!(e && e.rateLimited) }; }
});
ipcMain.handle('engine:unpackBooster', async (_e, { assetId, appid }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return await marketGate(() => engine.unpackBooster(assetId, appid)); }
  catch (e) { return { ok: false, error: (e && e.message) || 'Booster paketi açılamadı' }; }
});

const { keyChanged, resumeKeyQueue, stopKeyRun } = require('./src/backend/keys')({ accountData, accountEvent, accountName, accounts, ipcMain, log, sendRaw, writeAccountData, writeAccountDataDelayed, get activeSteamID() { return activeSteamID; }, get settings() { return settings; } });
const { applyParentalPin } = require('./src/backend/family')({ accountData, accountName, accounts, ipcMain, log, shell, storeLists, get engine() { return engine; }, get engineReady() { return engineReady; } });
const { SYNC_MAX_GAMES, boostFinish, boostStart, boostStopAccount, buildSyncSteps, holdCounters, simulateSync, startSequential, syncConnectionChanged } = require('./src/backend/hours')({ FarmController, accountBroadcast, accountEvent, accountName, accounts, delayFarm, earning, ledger, log, resumeFarm, settingFor, statsHour });
const { realisticFinish, realisticStartFor } = require('./src/backend/realistic')({ CACHE_DIR, SYNC_MAX_GAMES, accountBroadcast, accountData, accountEvent, accountName, accounts, activeAccountData, addFeed, boostFinish, boostStart, buildSyncSteps, delayFarm, ipcMain, log, path, readJson, resumeFarm, saveSettings, settingFor, simulateSync, slotOf, startCardFarm, startSequential, writeAccountDataDelayed, writeJson, get activeSteamID() { return activeSteamID; }, get cancelSettingWaits() { return cancelSettingWaits; }, get engine() { return engine; }, get engineReady() { return engineReady; }, get settings() { return settings; } });
require('./src/backend/chat')({ ipcMain, log, get engine() { return engine; }, get engineReady() { return engineReady; } });
const { armIdleTimer } = require('./src/backend/session')({ CONFIG_DIR, accountRunning, accounts, disconnectAll, enterLoginWindow, fs, ipcMain, log, path, get settings() { return settings; }, get win() { return win; } });
const { accountSettingsAdded, applySettingPatch, applySettingsToJobs, cancelSettingWaits, publicSettings } = require('./src/backend/settingsipc')({ ACCOUNT_SCOPED, ACCOUNT_SCOPED_SETTINGS, ACCOUNT_SETTING_KEYS, DATA_ROOT, DEFAULT_SETTINGS, HISTORY_FILE, JSON_SIDE_FILES, PRICE_FILE, accountBoostRunning, accountData, accountName, accounts, activeAccountData, applyActiveProxy, applyParentalPin, applyPersona, applySettings, boostFinish, boostStart, cleanAppIds, currentPriceCurrency, delayFarm, fs, ipcMain, log, parseProxy, personaName, personaOf, pruneAccountRecords, resumeFarm, rewriteTokenFiles, saveSettings, settingFor, setupTrayMenu, shell, startCardFarm, tokenProtectionAvailable, translation, windowFit, writeAccountData, get activeSteamID() { return activeSteamID; }, get engine() { return engine; }, get historyCache() { return historyCache; }, set historyCache(v) { historyCache = v; }, get priceCache() { return priceCache; }, set priceCache(v) { priceCache = v; }, get resumeSaveSoon() { return resumeSaveSoon; }, get settingSaveTime() { return settingSaveTime; }, set settingSaveTime(v) { settingSaveTime = v; }, get settings() { return settings; }, set settings(v) { settings = v; } });
require('./src/backend/backup')({ ACCOUNT_DIR, ACCOUNT_SCOPED, CACHE_DIR, CONFIG_DIR, DEFAULT_SETTINGS, DEFAULT_STATS, JSON_SIDE_FILES, accountData, accountDataAll, accountSettingsAdded, activeAccountData, app, applySettings, applySettingsToJobs, authSlots, corruptFiles, ct, dialog, disconnectAll, enterLoginWindow, fs, ipcMain, loadAccounts, log, logger, migrateKeys, migrateSettings, path, publicSettings, saveSettings, sendRaw, setupTrayMenu, statsView, translation, writeAccountData, get activeSteamID() { return activeSteamID; }, set activeSteamID(v) { activeSteamID = v; }, get addingAccountMode() { return addingAccountMode; }, set addingAccountMode(v) { addingAccountMode = v; }, get lifeStats() { return lifeStats; }, set lifeStats(v) { lifeStats = v; }, get priceCache() { return priceCache; }, set priceCache(v) { priceCache = v; }, get resumeStore() { return resumeStore; }, get settingSaveTime() { return settingSaveTime; }, set settingSaveTime(v) { settingSaveTime = v; }, get settings() { return settings; }, set settings(v) { settings = v; }, get win() { return win; } });
const { earlyConnect, isSetupConsistent, reportReadErrors, startupUpdateCheck } = require('./src/backend/update')({ accountDataMigration, accounts, app, connectAccount, ct, dialog, flushPendingWrites, fs, hasSession, ipcMain, loadAccounts, log, logger, path, readErrors, sendRaw, session, statsHour, syncActive, update, get activeSteamID() { return activeSteamID; }, set activeSteamID(v) { activeSteamID = v; }, get isQuitting() { return isQuitting; }, set isQuitting(v) { isQuitting = v; }, get resumeSave() { return resumeSave; }, get settings() { return settings; }, get win() { return win; } });
const { resumeAfterConnect, resumeSave, resumeSaveSoon, resumeStartUp, resumeStore } = require('./src/backend/resume')({ CONFIG_DIR, accountEvent, accountJobDetail, accountName, accountRunning, accounts, boostStart, ct, fs, log, onPanelPage, path, realisticStartFor, resumeJobs, sendJobStatus, startCardFarm, startSequential, translation, windowOpened, writeJson, get activeSteamID() { return activeSteamID; }, get settings() { return settings; }, get win() { return win; } });
require('./src/backend/schedule')({ BrowserWindow, accountData, accountEvent, accountName, accountRunning, accounts, app, applySettings, createWindow, ct, dayKey, dialog, earlyConnect, ensureTray, isSetupConsistent, loadHistoryCache, loadPriceCache, loadSettings, loadState, loadStats, log, logger, powerMonitor, realisticFinish, realisticStartFor, refundableAppIds, reportReadErrors, resumeStartUp, rewriteTokenFiles, settingFor, singleInstance, startCardFarm, startupUpdateCheck, translation, get earlySettings() { return earlySettings; }, get settings() { return settings; } });
