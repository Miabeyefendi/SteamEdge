const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, powerSaveBlocker, Notification, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const FarmController = require('./src/core/farmController');
// steam-user takes ~0.8 s on first load, steam-session ~0.2 s (the protobuf schemas get compiled).
// When they were required at the top the window waited for this time. Now they are loaded when the first
// instance is created, and that first creation is left until after the window is on screen: creating the
// engine right away locks the main process, and the 'ready-to-show' event got stuck on that lock so the window opened late.
let SteamAuthSinifi = null, SteamEngineSinifi = null;
const steamAuthSinifi = () => SteamAuthSinifi || (SteamAuthSinifi = require('./src/services/steamAuth'));
const steamEngineSinifi = () => SteamEngineSinifi || (SteamEngineSinifi = require('./src/core/steamEngine'));
let pencereAcildiCoz = null;
const pencereAcildi = new Promise((r) => { pencereAcildiCoz = r; });
setTimeout(() => pencereAcildiCoz(), 2500);   // start the connection even if the window never comes
const defter = require('./src/core/esitlemeDefteri');
const guncelleme = require('./src/services/guncelleme');
// The text the main process produces is in the interface language too: tray menu, file dialogs, desktop
// notifications and the error messages returned to the interface (the dictionary is shared with the interface).
const ceviri = require('./src/core/ceviri');
const ct = ceviri.t;
// The `error` and `hata` text in every reply returned to the interface is translated to the selected language. Instead of
// wrapping every return point one by one, it is done here: a newly added error message gets
// translated on its own (if the dictionary has an entry; otherwise it stays Turkish and `npm run dil` catches it).
{
  const asilHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (kanal, fn) => asilHandle(kanal, async (...a) => {
    const r = await fn(...a);
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      if (typeof r.error === 'string') r.error = ct(r.error);
      if (typeof r.hata === 'string') r.hata = ct(r.hata);
    }
    return r;
  });
}
// The sale fee window is only created when a sale is made.
let steamUcretModulu = null;
function steamUcret() { if (!steamUcretModulu) steamUcretModulu = require('./src/services/steamUcret'); return steamUcretModulu; }

// The hwAccel setting, if it says 'turn off GPU acceleration', has to take effect BEFORE app.whenReady() -
// since the normal settings.json load (loadSettings) happens inside whenReady, we do a synchronous,
// early read here (only for this one flag).
let erkenAyarlar = null;
try {
  // Settings are under DATA_ROOT/settings (set up below; needed here before the app is ready):
  // in the packaged version next to the exe, and AppData if it cannot be written there, and in development AppData. It used to
  // look in the 'config' folder in development; since the file was not there the graphics settings were never
  // applied in development.
  const erkenYollar = [path.join(app.getPath('userData'), 'settings', 'settings.json')];
  if (app.isPackaged) erkenYollar.unshift(path.join(path.dirname(app.getPath('exe')), 'settings', 'settings.json'));
  const erkenYol = erkenYollar.find((p) => fs.existsSync(p));
  const early = erkenYol ? JSON.parse(fs.readFileSync(erkenYol, 'utf8')) : null;
  erkenAyarlar = early;
  if (early && early.hwAccel === false) app.disableHardwareAcceleration();

  // GRAPHICS COMPATIBILITY. All three switches have to be given BEFORE whenReady; if set
  // later Chromium does not see them. That is why Settings says "asks for a
  // restart".
  //
  // ANGLE backend: on Windows Chromium by default translates OpenGL/Vulkan calls
  // through D3D11. On some Intel and older AMD drivers this path stalls;
  // moving to D3D9 or OpenGL fixes it. Automatic = whatever Chromium picks.
  const angle = early && early.gpuArkaUc;
  if (angle && angle !== 'auto') app.commandLine.appendSwitch('use-angle', angle);

  // GPU compositing off: the processor composites the window's frames and the graphics card
  // is not touched at all. When running on the same desktop as a full screen game it frees the game's presentation
  // path. The cost is a few points on the processor side.
  if (early && early.gpuKompozisyon === false) app.commandLine.appendSwitch('disable-gpu-compositing');
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
    const inst = new (steamAuthSinifi())(CONFIG_DIR, makeAuthSend(id));
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
  const yan = path.join(path.dirname(app.getPath('exe')));
  try {
    fs.mkdirSync(yan, { recursive: true });
    const deneme = path.join(yan, '.yazma-testi');
    fs.writeFileSync(deneme, 'x');
    fs.unlinkSync(deneme);
    return yan;
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
const bozukDosyalar = new Set();   // files that could not be read and are therefore forbidden to write

function jsonYaz(dosya, veri, bicimli) {
  if (bozukDosyalar.has(dosya)) {
    log('warn', 'write blocked (the file could not be read, data is being kept): ' + path.basename(dosya));
    return false;
  }
  const metin = bicimli ? JSON.stringify(veri, null, 2) : JSON.stringify(veri);
  const tmp = dosya + '.tmp';
  const bak = dosya + '.bak';
  try {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, metin, 'utf8');
      fs.fsyncSync(fd);              // flush the data to disk, do not leave it in the operating system cache
    } finally { fs.closeSync(fd); }
    try { if (fs.existsSync(dosya)) fs.copyFileSync(dosya, bak); } catch (_) {}
    fs.renameSync(tmp, dosya);       // atomic replacement
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    log('warn', 'write error ' + path.basename(dosya) + ': ' + (e && e.message));
    return false;
  }
}

// Returns: { ok:true, veri } | { ok:true, veri, yedekten:true } | { ok:false, yok:true } | { ok:false, bozuk:true }
function jsonOku(dosya) {
  const dene = (p) => {
    const ham = fs.readFileSync(p, 'utf8');
    if (!ham.trim()) throw new Error('bos dosya');
    return JSON.parse(ham);
  };
  try { return { ok: true, veri: dene(dosya) }; }
  catch (e1) {
    if (e1 && e1.code === 'ENOENT') return { ok: false, yok: true };
    log('warn', path.basename(dosya) + ' could not be read (' + (e1 && e1.message) + '), trying the backup');
    try {
      const veri = dene(dosya + '.bak');
      log('info', path.basename(dosya) + ' recovered from the backup');
      return { ok: true, veri, yedekten: true };
    } catch (_) {
      // Do not delete the broken file, set it aside so it can be inspected, and forbid writing over it
      try { fs.copyFileSync(dosya, dosya + '.bozuk'); } catch (_) {}
      bozukDosyalar.add(dosya);
      log('warn', path.basename(dosya) + ' COULD NOT BE RECOVERED, it will not be overwritten');
      return { ok: false, bozuk: true };
    }
  }
}

// Files that could not be read at startup are collected here and shown to the user when the window is ready.
const okumaHatalari = [];

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
  hafifMod: true,           // stop drawing and animations when the window is not focused
  gpuArkaUc: 'auto',        // ANGLE backend: auto | d3d11 | d3d9 | gl (asks for a restart)
  gpuKompozisyon: true,     // false = let the processor composite the window (reduces clashes with a game)

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
  theme: 'dark',            // dark | midnight | white (see src/main/js/tema.js)
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
  // If the connection drops: 'sinirsiz' | '10' | '3' | 'kapali'. "Automatic reconnect"
  // and "retry" used to be two separate settings and both only affected the first logon.
  yenidenBaglanma: 'sinirsiz',
  // feeMode was REMOVED: list prices are always the amount on the Steam market.
  // The amount you will get after commission is shown as a separate line in the sale flow.
  priceRefreshMin: 15,      // interval at which prices are refreshed in the background while Inventory is open
  bookDepth: 5,             // how many levels in the order book in the detail panel
  undercutCents: 1,
  autoRefreshPrices: false,
  hideAfterSell: true,
  invDefaultSort: 'value',
  dblAction: 'steam',       // double click behaviour in the inventory (env.js reads it)
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
  // deviation on every unlock, so no fixed rhythm forms (basarim.js > acNextDelayMs).
  // Realistic Mode (G11: the page was renewed according to the template)
  grDurationSec: 7200,      // session duration (2 hours)
  grTargetAuto: true,       // let the app pick the target achievement count
  grTarget: 0,              // manual target (0 = all)
  grCR: '2.0',              // game length multiplier ('auto' = manual Tc)
  grDiff: '1.2',            // multiplier for the difficulty of the achievements left
  grTc: '',                 // 100% time (hours) - the old single-field value, for backwards
  grTcOyun: {},             // appid -> 100% completion time (hours). Per game, entered by hand
  grModel: 'linear',        // distribution model: linear | exp | pareto
  grAuto: true,             // start the queue automatically (move on to the next game in the queue)
  grRandomGap: true,        // random deviation in unlock intervals
  grSkipUltraRare: false,   // skip achievements under 5%
  grKeepHours: true,        // when the achievements are done collect hours until the end of the time
  grCatchUp: true,          // squeeze the overdue achievement backlog into the start of the session
  grOtoSure: true,          // assign the duration on its own according to the settings (left alone if typed by hand)
  grHiz: 1,                 // speed multiplier: compresses/stretches the whole schedule
  grUltraCarpan: 3,         // achievements under 5% wait this many times longer
  grTelafiPay: 20,          // in what first percent of the time the ones left behind are unlocked
  grBitmisSik: 50,          // if the game is finished the schedule drops to this ratio (percent)
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
  ayarSurumu: 2,            // format of the settings file; migrations are in ayarlariGecir
};
let settings = { ...DEFAULT_SETTINGS };

// ---- levelled logging (Settings > Gelişmiş > "Kayıt dosyası") ----
// A single choice: off / errors / warnings / events / verbose. The level and "write to file"
// used to be two separate settings: when a level was chosen and the file stayed off nothing was recorded.
const LOG_FILE = path.join(CACHE_DIR, 'steamedge.log');   // the log file is on the cache side
const LOG_RANK = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, msg) {
  const seviye = settings.logLevel;
  const want = LOG_RANK[seviye] != null ? LOG_RANK[seviye] : 0;
  if ((LOG_RANK[level] != null ? LOG_RANK[level] : 0) > want) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
  if (seviye === 'off') return;
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
  const hata = await shell.openPath(LOG_FILE);
  return hata ? { ok: false, error: hata } : { ok: true };
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
const KALDIRILAN_AYARLAR = ['autoReconnect', 'farmRetry', 'twoStepSell', 'autoStopBoost', 'dontAsk_achSingle', 'debugLogs'];
function ayarlariGecir(v) {
  if (!v || typeof v !== 'object') return false;
  let degisti = false;
  if ((+v.ayarSurumu || 1) < 2) {
    // "Automatic reconnect" + "retry" became a single choice. Reconnecting while running was
    // already unlimited; if it was turned off it stays off.
    if (v.autoReconnect === false) v.yenidenBaglanma = 'kapali';
    // "Do not ask again" and "ask for confirmation on a single operation" kept the same thing in two keys.
    if (v.dontAsk_achSingle === true) v.achConfirmSingle = false;
    // The old default was 10; Steam's known limit is 32 (the user can still lower it).
    if (+v.cardMaxGames === 10) v.cardMaxGames = 32;
    // Old values that have no counterpart in the choice list: the box looked empty.
    if (v.dblAction === 'open') v.dblAction = 'steam';
    if (v.saleMode === 'lowest') v.saleMode = 'match';
    // "Hata ayıklama kayıtlarını tut" was removed: the chosen level is now also written to the file.
    v.ayarSurumu = 2;
    degisti = true;
  }
  KALDIRILAN_AYARLAR.forEach((k) => { if (k in v) { delete v[k]; degisti = true; } });
  return degisti;
}
// The moment the settings were last saved by the user (Ayarlar > Yapılandırma > Son kayıt).
let ayarKayitZamani = null;
function loadSettings() {
  const r = jsonOku(SETTINGS_FILE);
  if (r.ok) {
    const ham = { ...r.veri };
    const gecti = ayarlariGecir(ham);
    settings = { ...DEFAULT_SETTINGS, ...ham };
    if (r.yedekten) okumaHatalari.push({ ad: 'Ayarlar', kurtarildi: true });
    if (gecti) saveSettings();
    try { ayarKayitZamani = fs.statSync(SETTINGS_FILE).mtimeMs; } catch (_) {}
  } else {
    settings = { ...DEFAULT_SETTINGS };
    // yok = first run, normal. bozuk = a real problem, tell the user.
    if (r.bozuk) okumaHatalari.push({ ad: 'Ayarlar', kurtarildi: false });
  }
  ceviri.dilSec(settings.language);
}
// Returns false if it fails: if the file could not be read (broken) writing is deliberately blocked and "Kaydet"
// must tell the user so, not say "saved".
function saveSettings() { return jsonYaz(SETTINGS_FILE, settings, true); }
// "Uyku modunu engelle": only while a job runs on an account. Previously when the setting was on the
// computer never slept even if the app was doing nothing.
function uykuEngeliniGuncelle() {
  let calisan = false;
  accounts.forEach((s) => { if (hesapCalisiyor(s)) calisan = true; });
  const iste = !!settings.preventSleep && calisan;
  try {
    if (iste && psbId === null) psbId = powerSaveBlocker.start('prevent-app-suspension');
    else if (!iste && psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
  } catch (_) {}
}
// "Bağlantı koparsa yeniden bağlan". null = unlimited, 0 = off, n = at most n attempts.
function yenidenBaglanmaSiniri() {
  const v = settings.yenidenBaglanma;
  if (v === 'kapali') return 0;
  const n = parseInt(v, 10);
  return n > 0 ? n : null;
}
function applySettings() {
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autoLaunch }); } catch (_) {}
  uykuEngeliniGuncelle();
  // The reconnect limit to all engines. If an engine has run out of attempts and given up
  // and the new setting allows it, the attempts start over.
  const sinir = yenidenBaglanmaSiniri();
  accounts.forEach((s) => {
    if (!s.engine) return;
    s.engine.yenidenBaglanmaSiniri = sinir;
    if (s.engine.vazgecti && !s.engine.kaliciKopma && sinir !== 0) s.engine.yenidenBaglanmayiDene();
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
function sessizSaatMi() {
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
    const metin = settings.chatReplyText === DEFAULT_SETTINGS.chatReplyText ? ct(DEFAULT_SETTINGS.chatReplyText) : settings.chatReplyText;
    eng.setAutoReply(settings.chatAutoReply ? metin : null, settings.chatReplyCooldown);
  } catch (_) {}
}

function ensureTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'icon.png'));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip('SteamEdge');
    tepsiMenusunuKur();
    tray.on('click', () => { if (win) { win.isVisible() ? win.hide() : (win.show(), win.focus()); } });
  } catch (_) {}
}
// When the language changes the menu is rebuilt; it used to say "Göster / Çıkış" in every language.
function tepsiMenusunuKur() {
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

function cokmeYaz(tur, e) {
  const satir = `[${new Date().toISOString()}] CRASH ${tur} ${(e && e.stack) || (e && e.message) || e}`;
  console.error(satir);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch (_) {}
    fs.appendFileSync(LOG_FILE, satir + '\n');
  } catch (_) {}
}

process.on('uncaughtException', (e) => { cokmeYaz('uncaughtException', e); });
process.on('unhandledRejection', (e) => { cokmeYaz('unhandledRejection', e); });

function hasSession() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'session.json'), 'utf8'));
    return s && s.refreshToken ? s : null;
  } catch (_) { return null; }
}

// ---- multi-account store (accounts.json) - session.json always reflects the "active" account ----
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
function loadAccounts() {
  const r = jsonOku(ACCOUNTS_FILE);
  if (r.ok) {
    if (r.yedekten) okumaHatalari.push({ ad: 'Kayitli hesaplar', kurtarildi: true });
    return Array.isArray(r.veri) ? r.veri : [];
  }
  if (r.bozuk) okumaHatalari.push({ ad: 'Kayitli hesaplar', kurtarildi: false });
  return [];
}
function saveAccounts(list) { jsonYaz(ACCOUNTS_FILE, list, true); }
// Makes this account the active session (session.json) and resets the engine - the next engine:connect
// reconnects with this account's refreshToken. The renderer, the caller will reload.
// session.json = "which account shows at app startup". It does NOT reset the engine - since accounts
// work independently of each other switching does not affect the others.
function makeActiveSession(entry) {
  jsonYaz(path.join(CONFIG_DIR, 'session.json'), {
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
  // After the window shows, wait one frame and then allow the engine to be set up (see pencereAcildi).
  win.once('ready-to-show', () => { win.center(); win.show(); setTimeout(() => pencereAcildiCoz(), 50); });
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
ipcMain.on('auth:startQR', (_e, { slotId } = {}) => pencereAcildi.then(() => getAuthSlot(slotId).startQR()));
ipcMain.on('auth:startCredentials', (_e, { slotId, accountName, password }) => pencereAcildi.then(() => getAuthSlot(slotId).startCredentials(accountName, password)));
ipcMain.on('auth:submitGuard', (_e, { slotId, code }) => pencereAcildi.then(() => getAuthSlot(slotId).submitGuard(code)));
ipcMain.on('auth:cancel', (_e, { slotId } = {}) => pencereAcildi.then(() => getAuthSlot(slotId).cancel()));
ipcMain.on('auth:loginCookie', (_e, { slotId, sessionid, steamLoginSecure, steamparental }) => pencereAcildi.then(() => getAuthSlot(slotId).loginCookie(sessionid, steamLoginSecure, steamparental)));

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
  if (!activeSteamID && sess) { activeSteamID = sess.steamID; hesapVerisiGecisi(); }
  return list.map((a) => {
    const s = accounts.get(a.steamID);
    return {
      steamID: a.steamID,
      accountName: a.accountName,
      active: a.steamID === activeSteamID,        // the one shown in the interface
      connected: !!(s && s.ready),                // the Steam session is open
      running: hesapCalisiyor(s),                            // card/hour/realistic is running
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
  isDurumunuYolla(steamID);
  sendRaw('stats:degisti', istatistikGorunumu(steamID));
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
  hesapIsleriniDurdur(s, steamID);
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
    hesapIsleriniDurdur(s, steamID);
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
    accounts.delete(steamID);
  }
  const bek = bekleyenYazim.get(steamID);
  if (bek) { clearTimeout(bek); bekleyenYazim.delete(steamID); }
  // The account's own data should go too, otherwise when the same account is added again the old
  // queue/statistics come back and the user thinks they deleted it.
  hesapVerileri.delete(steamID);
  ['', '.bak', '.bozuk', '.tmp'].forEach((ek) => {
    try { fs.unlinkSync(hesapDosyasi(steamID) + ek); } catch (_) {}
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
// For backwards compatibility the `engine`/`engineReady`/`farm`/`farmSaat` variables point to the ACTIVE account's
// objects (updated with syncActive below), so the existing IPC
// handlers keep working as they are.
const accounts = new Map();      // steamID -> { engine, farm, farmSaat, ready, accountName }
let activeSteamID = null;
let engine = null;
let engineReady = false;
let farm = null;
let farmSaat = null;

function slotOf(steamID) {
  if (!accounts.has(steamID)) {
    accounts.set(steamID, {
      engine: null, farm: null, farmSaat: null, ready: false, accountName: null,
      son: {},             // channel -> last state; resent to the interface when the account changes
      boost: null,         // simultaneous hour boosting and sync
      gercekci: null,      // Realistic Mode
      izleyici: null,      // card drop watcher
      istSaati: null,      // run time counter
      bekleyenFarm: null,  // card farming paused for the duration of hour boosting
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
const IS_KANALLARI = ['farm:tick', 'boost:tick', 'saatFarm:tick', 'boost:sync', 'gercekci:tick'];
const BOS_DURUM = {
  'farm:tick': { running: false }, 'boost:tick': { running: false }, 'saatFarm:tick': { running: false },
  'boost:sync': { running: false }, 'gercekci:tick': { calisiyor: false },
};
function hesapAdi(steamID) {
  const s = accounts.get(steamID);
  return (s && s.accountName) || String(steamID || '');
}
function hesapBoostCalisiyor(s) {
  return !!(s && ((s.boost && s.boost.calisiyor) || (s.farmSaat && s.farmSaat.running)));
}
function hesapCalisiyor(s) {
  return !!(s && ((s.farm && s.farm.running) || hesapBoostCalisiyor(s) || s.gercekci));
}
// A job event of an account. Only those of the account open on screen go to the interface; all are kept.
function hesapYayini(steamID) {
  return (kanal, veri) => {
    const s = accounts.get(steamID);
    if (s) s.son[kanal] = veri;
    if (steamID === activeSteamID) sendRaw(kanal, { ...veri, steamID });
    if (s) {
      const calisiyor = hesapCalisiyor(s);
      if (calisiyor !== s.sonCalisma) {
        s.sonCalisma = calisiyor;
        sendRaw('accounts:activity', { steamID, running: calisiyor });
        uykuEngeliniGuncelle();
        kesintisizCalismaIsle(steamID, calisiyor);
      }
      istatistikSaatiniGuncelle(steamID);
    }
  };
}
// When the account changes that account's LIVE state is sent to the interface. Stopped jobs go with an empty state;
// one-time flags like "finished" are not sent again, otherwise notifications would repeat.
function isDurumunuYolla(steamID) {
  const s = accounts.get(steamID);
  IS_KANALLARI.forEach((k) => {
    const d = s && s.son[k];
    const calisiyor = d && (d.running || d.calisiyor);
    sendRaw(k, calisiyor ? { ...d, steamID } : { ...BOS_DURUM[k], steamID });
  });
}
// Events that belong to the user (card dropped, cards finished, achievement unlocked...). The interface
// shows the notification (quiet hours, sound and setting gates are there). The event of a background account is
// also written to that account's own activity feed; when you switch to the account the history is not missing.
function hesapOlayi(steamID, olay) {
  sendRaw('hesap:olay', { steamID, hesap: hesapAdi(steamID), aktif: steamID === activeSteamID, ...olay });
  if (steamID !== activeSteamID && olay.akis) akisEkle(steamID, olay.akis);
}
const AKTIVITE_ANAHTARI = 'aktiviteAkisi';
function akisEkle(steamID, kayit) {
  const v = hesapVerisi(steamID);
  const e = v.entries[AKTIVITE_ANAHTARI];
  const liste = (e && Array.isArray(e.v)) ? e.v : [];
  liste.unshift({ ...kayit, ts: Date.now() });
  if (liste.length > 30) liste.length = 30;
  v.entries[AKTIVITE_ANAHTARI] = { v: liste, ts: Date.now() };
  hesapVerisiYazGecikmeli(steamID);
}

// ---- Statistics (per account) ----
// Cards dropped day by day for "En Verimli Gün". Local date: the user's day, not by UTC.
function gunAnahtari(t) {
  const d = new Date(t || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function gunlukKartEkle(steamID, adet) {
  const st = hesapIstatistik(steamID);
  if (!st.gunlukKart || typeof st.gunlukKart !== 'object') st.gunlukKart = {};
  const gun = gunAnahtari();
  st.gunlukKart[gun] = (st.gunlukKart[gun] || 0) + adet;
  const gunler = Object.keys(st.gunlukKart).sort();
  while (gunler.length > 400) delete st.gunlukKart[gunler.shift()];
}
// "Kesintisiz Çalışma": the longest time a job (card, hour, Realistic Mode) on an account ran without a
// break. Pauses shorter than a minute do not count as a break (like the job being paused a few
// seconds when a setting is saved, or a short connection drop).
function kesintisizCalismaIsle(steamID, calisiyor) {
  const s = accounts.get(steamID);
  if (!s) return;
  const simdi = Date.now();
  if (calisiyor) {
    if (!s.kesintisizBas || (s.kesintisizSon && simdi - s.kesintisizSon > 60000)) s.kesintisizBas = simdi;
    s.kesintisizSon = null;
    return;
  }
  if (!s.kesintisizBas || s.kesintisizSon) return;
  s.kesintisizSon = simdi;
  const st = hesapIstatistik(steamID);
  const sure = simdi - s.kesintisizBas;
  if (sure > (+st.enUzunCalismaMs || 0)) { st.enUzunCalismaMs = sure; hesapVerisiYazGecikmeli(steamID); }
}
function hesapIstatistik(steamID) {
  const v = hesapVerisi(steamID);
  if (!v.stats) v.stats = { ...DEFAULT_STATS, since: Date.now() };
  return v.stats;
}
function istatistikEkle(steamID, patch) {
  if (!steamID) return;
  const st = hesapIstatistik(steamID);
  Object.keys(patch || {}).forEach((k) => {
    if (typeof st[k] !== 'number') st[k] = 0;
    st[k] += (+patch[k] || 0);
  });
  hesapVerisiYazGecikmeli(steamID);
  if (steamID === activeSteamID) sendRaw('stats:degisti', istatistikGorunumu(steamID));
}
// Run time counter. Card farming time is `totalRuntimeMs`, hour boosting (simultaneous or
// sequential) is `boostRuntimeMs`. Hour boosting time used to be written only when Stop was pressed BY
// HAND: a job that ended on its own when the time was up or the job of a background account was never
// counted. It does not count while the connection is down; Steam does not count that time either.
function istatistikSaati(steamID) {
  const s = accounts.get(steamID);
  if (!s) return;
  const simdi = Date.now();
  const dt = s.istSon ? simdi - s.istSon : 0;
  s.istSon = simdi;
  const patch = {};
  if (dt > 0 && dt < 10 * 60000 && s.istHazir) {
    if (s.istFarm) patch.totalRuntimeMs = dt;
    if (s.istBoost) patch.boostRuntimeMs = dt;
  }
  s.istFarm = !!(s.farm && s.farm.running);
  s.istBoost = hesapBoostCalisiyor(s);
  s.istHazir = !!s.ready;
  if (Object.keys(patch).length) istatistikEkle(steamID, patch);
  if (!s.istFarm && !s.istBoost && s.istSaati) { clearInterval(s.istSaati); s.istSaati = null; s.istSon = 0; }
}
// When the job's state changes the counter writes the time up to that moment to the old state, then moves to the new one.
function istatistikSaatiniGuncelle(steamID) {
  const s = accounts.get(steamID);
  if (!s) return;
  const farmNow = !!(s.farm && s.farm.running);
  const boostNow = hesapBoostCalisiyor(s);
  if (farmNow === !!s.istFarm && boostNow === !!s.istBoost && (s.istSaati || (!farmNow && !boostNow))) return;
  if (s.istSaati) istatistikSaati(steamID);
  else { s.istSon = Date.now(); s.istFarm = farmNow; s.istBoost = boostNow; s.istHazir = !!s.ready; }
  if ((farmNow || boostNow) && !s.istSaati) s.istSaati = setInterval(() => istatistikSaati(steamID), 30000);
}

// ---- Card farming (per account) ----
// The badge page is watched in the MAIN PROCESS and per account. The interface used to poll only
// the account on screen once a minute; a card dropped on a background account was not counted, and a game that ran
// out of cards never left the queue. The interval is deliberately 3 minutes: on a big library the badge page is
// several pages and several accounts may be running at the same time.
const KART_IZLEME_MS = 3 * 60 * 1000;
function kartFarmSecenekleri() {
  return {
    autoNext: settings.autoNextGame !== false,
    maxGames: settings.cardMaxGames,
    fastMinPlaytimeMin: settings.fastMinPlaytimeMin,
    fastRotateMinSec: settings.fastRotateMinSec,
    fastRotateMaxSec: settings.fastRotateMaxSec,
  };
}
function farmYayini(steamID) {
  const yay = hesapYayini(steamID);
  return (kanal, veri) => {
    yay(kanal, veri);
    if (kanal !== 'farm:tick' || !veri || veri.running) return;
    const s = accounts.get(steamID);
    kartIzleyiciDurdur(s);
    if (veri.sebep === 'bitti' && veri.calisiyordu) {
      log('info', '[' + hesapAdi(steamID) + '] card farming done: all cards collected');
      hesapOlayi(steamID, {
        tur: 'kartlarBitti',
        akis: { kind: 'kart', title: 'Kart Düşürme', text: 'Tüm kartlar toplandı.', status: 'Başarılı' },
      });
      farmiSurdur(steamID);
    } else if ((veri.sebep === 'sure' || veri.sebep === 'oyunBitti') && veri.calisiyordu) {
      // "Oyun bitince sıradakine geç" is off: it says why it stopped, otherwise the user
      // thought the job had closed on its own.
      hesapOlayi(steamID, {
        tur: 'kartDurdu',
        akis: { kind: 'kart', title: 'Kart Düşürme', status: 'Durdu',
          text: veri.sebep === 'sure'
            ? 'Oyunun süresi doldu; sıradakine geçme kapalı olduğu için durdu.'
            : 'Oyunun kartları bitti; sıradakine geçme kapalı olduğu için durdu.' },
      });
    }
  };
}
function kartFarmBaslat(steamID, mode, games, durationMs, ek) {
  const s = slotOf(steamID);
  if (!s.engine || !s.ready) return false;
  if (!s.farm) s.farm = new FarmController(s.engine, farmYayini(steamID), 'kart');
  s.farm.engine = s.engine;
  const devam = !!(ek && ek.devam);
  log('info', `[${hesapAdi(steamID)}] farm ${devam ? 'resume' : 'start'}: mode=${mode} games=${(games || []).length} duration=${durationMs}ms`);
  s.farm.start(mode, games || [], durationMs, { ...kartFarmSecenekleri(), ...(ek || {}) });
  if (!devam && s.farm.running) istatistikEkle(steamID, { sessions: 1 });
  if (s.farm.running) kartIzleyiciBaslat(steamID, games || []);
  return true;
}
function kartIzleyiciBaslat(steamID, oyunlar) {
  const s = accounts.get(steamID);
  if (!s) return;
  const eski = s.izleyici;
  kartIzleyiciDurdur(s);
  s.izleyici = {
    timer: null, basarimTimer: null, mesgul: false, basarimMesgul: false, hata: 0,
    // When continuing (a settings change) the previous measurement is kept, otherwise the drop in between would be lost.
    kalan: eski && eski.kalan ? eski.kalan : new Map((oyunlar || []).map((g) => [g.appid, g.remaining])),
    adlar: new Map((oyunlar || []).map((g) => [g.appid, g.name])),
    oturumDusen: eski ? eski.oturumDusen || 0 : 0,
    sonBasarim: eski ? eski.sonBasarim || 0 : 0,
  };
  s.izleyici.timer = setInterval(() => kartIzle(steamID), KART_IZLEME_MS);
  s.izleyici.basarimTimer = setInterval(() => kartBasarimAc(steamID), 60000);
}
function kartIzleyiciDurdur(s) {
  if (!s || !s.izleyici) return;
  if (s.izleyici.timer) clearInterval(s.izleyici.timer);
  if (s.izleyici.basarimTimer) clearInterval(s.izleyici.basarimTimer);
  s.izleyici.timer = null; s.izleyici.basarimTimer = null;
}
async function kartIzle(steamID) {
  const s = accounts.get(steamID);
  if (!s || !s.izleyici || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
  const iz = s.izleyici;
  if (iz.mesgul) return;
  iz.mesgul = true;
  try {
    const { oyunlar, bitenler } = await s.engine.getDropGames(true);
    iz.hata = 0;
    // Playtime is not on the badge page; it is carried over from the last known list (fast mode needs it).
    const dk = new Map();
    const v = hesapVerisi(steamID);
    ((v.listeler && v.listeler.drop) || []).forEach((g) => dk.set(g.appid, g.playtimeMin || 0));
    (s.farm.games || []).forEach((g) => dk.set(g.appid, g.playtimeMin || dk.get(g.appid) || 0));
    const guncel = oyunlar.map((g) => ({ ...g, playtimeMin: dk.get(g.appid) || 0 }));
    const yeni = new Map(guncel.map((g) => [g.appid, g]));
    let dusen = 0;
    iz.kalan.forEach((once, appid) => {
      let simdi = yeni.has(appid) ? yeni.get(appid).remaining : null;
      if (simdi == null && bitenler.has(appid)) simdi = 0;
      if (simdi == null || !(simdi < once)) return;
      const adet = once - simdi;
      dusen += adet;
      const ad = (yeni.get(appid) && yeni.get(appid).name) || iz.adlar.get(appid) || ('App ' + appid);
      hesapOlayi(steamID, {
        tur: 'kartDustu', appid, ad, adet,
        akis: { kind: 'kart', title: '# kart düştü'.replace('#', adet), text: ad, status: 'Başarılı' },
      });
    });
    guncel.forEach((g) => { iz.kalan.set(g.appid, g.remaining); iz.adlar.set(g.appid, g.name); });
    bitenler.forEach((id) => iz.kalan.set(id, 0));
    if (dusen) {
      iz.oturumDusen += dusen;
      gunlukKartEkle(steamID, dusen);
      istatistikEkle(steamID, { cardsDropped: dusen });
    }
    listeleriSakla('drop', guncel, steamID);
    if (steamID === activeSteamID) sendRaw('farm:liste', { steamID, games: guncel, oturumDusen: iz.oturumDusen, dusen });
    s.farm.oyunlariGuncelle(guncel, bitenler);
  } catch (e) {
    iz.hata++;
    log('warn', '[' + hesapAdi(steamID) + '] badge watcher: ' + (e && e.message));
  } finally {
    iz.mesgul = false;
  }
}
// "Kart düşerken başarımları aç" (farmAchUnlock). It was in the interface and only worked for the account on screen,
// while the window was open. Interval: the achievement unlock interval, at least one minute.
async function kartBasarimAc(steamID) {
  if (!settings.farmAchUnlock) return;
  const s = accounts.get(steamID);
  if (!s || !s.izleyici || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
  const iz = s.izleyici;
  const aralikMs = Math.max(60, +settings.achDelay || 60) * 1000;
  if (iz.basarimMesgul || Date.now() - (iz.sonBasarim || 0) < aralikMs) return;
  const appid = s.farm.aktifAppid;
  if (!appid) return;
  iz.basarimMesgul = true;
  try {
    const data = await s.engine.getAchievements(appid);
    const kilitli = ((data && data.achievements) || []).filter((a) => !a.achieved && !a.korumali);
    if (!kilitli.length) return;
    const secilen = settings.achSpread ? kilitli[Math.floor(Math.random() * kilitli.length)] : kilitli[0];
    await s.engine.setAchievements(appid, [{ apiName: secilen.apiName, unlock: true }]);
    iz.sonBasarim = Date.now();
    const v = hesapVerisi(steamID);
    v.achLog.unshift({ appid, game: data.gameName || null, apiName: secilen.apiName, name: secilen.name, unlock: true, ts: Date.now() });
    if (v.achLog.length > 2000) v.achLog.length = 2000;
    hesapVerisiYazGecikmeli(steamID);
    hesapOlayi(steamID, {
      tur: 'basarimAcildi', appid, ad: secilen.name,
      akis: { kind: 'kart', title: 'Başarım açıldı', text: secilen.name, status: 'Başarılı' },
    });
  } catch (e) {
    log('warn', '[' + hesapAdi(steamID) + '] could not unlock an achievement during farming: ' + (e && e.message));
  } finally {
    iz.basarimMesgul = false;
  }
}
// "Saat yükseltirken kart düşürmeyi duraklat". The setting's description said "when hour boosting ends
// card farming continues where it left off" but the code only stopped it; it never
// started again. Now the paused job is kept and resumed when hour boosting ends.
function farmiBeklet(steamID, neden) {
  const s = accounts.get(steamID);
  if (!s || !s.farm || !s.farm.running) return false;
  const konum = s.farm.konum();          // first: credit the warm-up progress to the games in fast mode
  s.bekleyenFarm = {
    mode: s.farm.mode, games: s.farm.games.map((g) => ({ ...g })),
    durationMs: s.farm.durationMs, konum,
  };
  s.farm.stop('boost');
  log('info', '[' + hesapAdi(steamID) + '] card farming paused: ' + neden);
  hesapOlayi(steamID, {
    tur: 'kartDuraklatildi',
    akis: { kind: 'kart', title: 'Kart Düşürme', text: 'Saat yükseltme sürerken duraklatıldı.', status: 'Uyarı' },
  });
  return true;
}
// zorla: resume even if hour boosting continues (the "pause" setting was turned off).
function farmiSurdur(steamID, zorla) {
  const s = accounts.get(steamID);
  if (!s || !s.bekleyenFarm || s.gercekci) return;
  if (!zorla && hesapBoostCalisiyor(s)) return;
  if (!s.ready || !s.engine) return;
  const b = s.bekleyenFarm;
  s.bekleyenFarm = null;
  // Options come from the CURRENT settings (kartFarmSecenekleri); the old options of the paused job
  // used to be restored, a setting that changed in between did not reach the resumed job.
  kartFarmBaslat(steamID, b.mode, b.games, b.durationMs, { devam: b.konum });
  hesapOlayi(steamID, {
    tur: 'kartSurdu',
    akis: { kind: 'kart', title: 'Kart Düşürme', text: 'Kaldığı yerden sürüyor.', status: 'Çalışıyor' },
  });
}
// Stops all jobs of an account (exit, deleting an account, disconnecting).
function hesapIsleriniDurdur(s, steamID) {
  if (!s) return;
  s.bekleyenFarm = null;
  ayarBeklemeleriniIptalEt(s);
  try { if (s.farm && s.farm.running) s.farm.stop('kullanici'); } catch (_) {}
  try { if (s.farmSaat && s.farmSaat.running) s.farmSaat.stop('kullanici'); } catch (_) {}
  kartIzleyiciDurdur(s);
  if (steamID) {
    try { boostDurdurHesap(steamID, 'kullanici'); } catch (_) {}
    try { if (s.gercekci) gercekciBitir(steamID, 'kullanici durdurdu'); } catch (_) {}
    try { istatistikSaati(steamID); } catch (_) {}
  }
  if (s.istSaati) { clearInterval(s.istSaati); s.istSaati = null; }
}

// G3: Carries the engine's connection state to the interface. A connection that dropped at run time
// used to be reported nowhere; the user looked at "running" for hours and
// actually earned nothing.
function baglantiDurumunuBagla(eng, steamID) {
  eng.onDurum = (durum, ek) => {
    const s = accounts.get(steamID);
    if (s) {
      // The counters must not count the downtime: first the time up to that moment is written.
      if (durum !== 'bagli') istatistikSaati(steamID);
      s.ready = (durum === 'bagli');
      if (s.ready) { s.sonBaglanti = Date.now(); s.istSon = Date.now(); s.istHazir = true; }
      // A long drop splits the uninterrupted run; one shorter than a minute does not (see kesintisizCalismaIsle).
      if (hesapCalisiyor(s)) kesintisizCalismaIsle(steamID, s.ready);
      esitlemeBaglantiDegisti(steamID, s.ready);
    }
    if (steamID === activeSteamID) { engineReady = (durum === 'bagli'); }
    // Log text. The interface builds the text in its own language from the fields (durum, sebep, deneme, bekleMs,
    // sinir, oyunlar); the text here is only for the log file.
    const mesaj = durum === 'koptu'
      ? ('Steam baglantisi koptu: ' + (ek.sebep || '?'))
      : durum === 'baglaniyor'
        ? ('yeniden baglaniyor (deneme ' + ek.deneme + ', ' + Math.round((ek.bekleMs || 0) / 1000) + ' sn sonra)')
        : durum === 'vazgecildi'
          ? ('yeniden baglanma durdu' + (ek.kalici ? (' (kalici: ' + (ek.sebep || '?') + ')') : (' (' + (ek.deneme || 0) + ' deneme)')))
          : durum === 'bagli' && ek.yenidenBaglandi
            ? ('yeniden baglandi, ' + (ek.oyunlar || 0) + ' oyun geri acildi')
            : 'baglandi';
    log(durum === 'koptu' || durum === 'vazgecildi' ? 'warn' : 'info', '[' + steamID + '] ' + mesaj);
    const s2 = accounts.get(steamID);
    if (s2) s2.baglantiDurumu = { durum, ts: Date.now(), ...ek };
    sendRaw('engine:durum', { steamID, durum, mesaj, aktif: steamID === activeSteamID, sinir: eng.yenidenBaglanmaSiniri, ...ek });
    if (durum === 'vazgecildi') {
      hesapOlayi(steamID, {
        tur: 'baglantiVazgecildi', kalici: !!ek.kalici, deneme: ek.deneme || 0, sebep: ek.sebep || '',
        akis: { kind: 'hata', title: 'Steam Bağlantısı', text: ek.kalici ? 'Steam oturumu kapandı, yeniden bağlanılmıyor.' : 'Yeniden bağlanma denemeleri bitti.', status: 'Hata' },
      });
    }
  };
}
// The "Yeniden bağlan" button in the interface: restarts the attempts of an engine that gave up.
ipcMain.handle('engine:yenidenBaglan', () => {
  const s = accounts.get(activeSteamID);
  if (!s || !s.engine) return { ok: false, error: 'Bağlı değil.' };
  if (s.ready) return { ok: true, zatenBagli: true };
  s.engine.yenidenBaglanmayiDene(true);
  return { ok: true };
});
// The connection of the account on screen (Ayarlar > Hesap Statüsü). Not a guess, the last thing the engine reported.
ipcMain.handle('engine:baglantiDurumu', () => {
  const s = activeSteamID ? accounts.get(activeSteamID) : null;
  if (!s || !s.engine) return { durum: 'yok' };
  if (s.ready) return { durum: 'bagli', ts: s.sonBaglanti || null };
  return s.baglantiDurumu || { durum: 'baglaniyor' };
});

// ================== PER-ACCOUNT DATA STORE ==================
// The hour booster game list, queue order, achievement log and statistics used to be kept
// in app-wide files. With multiple accounts this made the accounts see each other's data:
// User 1's selected games also showed up on User 2.
// Now each account has its own file: settings/accounts/<steamID>.json
const HESAP_DIZINI = path.join(CONFIG_DIR, 'accounts');
// Keys that come through settings:set but actually belong to the account.
// We sort them out here so the renderer side does not change.
// 'profil': the last known name/avatar/level/custom address. It goes to the interface together with the settings,
// so it can be written to the screen at startup without waiting for the Steam session.
// 'grQueue' and 'grPresets': Realistic Mode's game queue and saved presets. Account
// specific, because the library and achievement state differ per account.
const HESAP_AYAR_ANAHTARLARI = ['boostGameIds', 'profil', 'grQueue', 'grPresets'];
const VARSAYILAN_HESAP_VERISI = {
  boostGameIds: [], entries: {}, achLog: [], stats: null, profil: null,
  grQueue: [], grPresets: [],
};

const hesapVerileri = new Map();   // steamID -> data

function hesapDosyasi(steamID) { return path.join(HESAP_DIZINI, String(steamID) + '.json'); }

function hesapVerisi(steamID) {
  if (!steamID) return { ...VARSAYILAN_HESAP_VERISI, entries: {}, achLog: [] };
  if (hesapVerileri.has(steamID)) return hesapVerileri.get(steamID);
  const r = jsonOku(hesapDosyasi(steamID));
  const v = r.ok
    ? { ...VARSAYILAN_HESAP_VERISI, ...r.veri }
    : { ...VARSAYILAN_HESAP_VERISI, entries: {}, achLog: [] };
  if (r.ok && r.yedekten) okumaHatalari.push({ ad: 'Hesap verisi (' + steamID + ')', kurtarildi: true });
  if (r.bozuk) okumaHatalari.push({ ad: 'Hesap verisi (' + steamID + ')', kurtarildi: false });
  hesapVerileri.set(steamID, v);
  return v;
}
function hesapVerisiYaz(steamID) {
  if (!steamID) return;
  const t = bekleyenYazim.get(steamID);
  if (t) { clearTimeout(t); bekleyenYazim.delete(steamID); }
  jsonYaz(hesapDosyasi(steamID), hesapVerisi(steamID), false);
}
// SPEED: the account file is fully serialised on every write, forced to disk
// and its backup is taken. With a 5000 entry achievement log this is ~25 ms per write and it locks the main process;
// in bulk achievement unlocking it was written separately for every achievement. Frequently changing data
// (statistics, feed, state, log) is now gathered and written once every 1.5 seconds.
const bekleyenYazim = new Map();   // steamID -> timer
function hesapVerisiYazGecikmeli(steamID) {
  if (!steamID || bekleyenYazim.has(steamID)) return;
  bekleyenYazim.set(steamID, setTimeout(() => {
    bekleyenYazim.delete(steamID);
    hesapVerisiYaz(steamID);
  }, 1500));
}
function bekleyenYazimlariBosalt() {
  [...bekleyenYazim.keys()].forEach((id) => hesapVerisiYaz(id));
}
// The active account's data. If there is no account a temporary container is returned (not written to disk).
function aktifHesapVerisi() { return hesapVerisi(activeSteamID); }

// ---- One-time migration: move from the old global files to the active account's file ----
// So the user does not lose data when upgrading. After moving, the copies in the global
// files are not read; we do not delete them so they are at hand if a return is needed.
function hesapVerisiGecisi() {
  if (!activeSteamID) return;
  if (settings.hesapVerisiTasindi) return;
  const v = hesapVerisi(activeSteamID);
  let tasinan = [];
  if (Array.isArray(settings.boostGameIds) && settings.boostGameIds.length && !v.boostGameIds.length) {
    v.boostGameIds = settings.boostGameIds.slice();
    tasinan.push(v.boostGameIds.length + ' saat yukseltici oyunu');
  }
  if (appState && appState.entries && Object.keys(appState.entries).length && !Object.keys(v.entries).length) {
    v.entries = JSON.parse(JSON.stringify(appState.entries));
    tasinan.push(Object.keys(v.entries).length + ' kayitli durum');
  }
  if (appState && Array.isArray(appState.achLog) && appState.achLog.length && !v.achLog.length) {
    v.achLog = appState.achLog.slice();
    tasinan.push(v.achLog.length + ' basarim kaydi');
  }
  if (!v.stats && lifeStats) { v.stats = { ...lifeStats }; tasinan.push('istatistikler'); }
  hesapVerisiYaz(activeSteamID);
  settings.hesapVerisiTasindi = true; saveSettings();
  if (tasinan.length) log('info', 'account data moved (' + activeSteamID + '): ' + tasinan.join(', '));
}
// Binds the module level shortcuts to the active account.
function syncActive() {
  const s = activeSteamID ? accounts.get(activeSteamID) : null;
  engine = s ? s.engine : null;
  engineReady = !!(s && s.ready);
  farm = s ? s.farm : null;
  farmSaat = s ? s.farmSaat : null;
}
// Stops all accounts' jobs and closes their sessions (exit / timeout / deleting data).
function disconnectAll() {
  accounts.forEach((s, id) => {
    hesapIsleriniDurdur(s, id);
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
  });
  bekleyenYazimlariBosalt();
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
  const tries = settings.yenidenBaglanma === 'kapali' ? 1 : 3;
  let lastErr = null;
  await pencereAcildi;
  const SteamEngine = steamEngineSinifi();
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i - 1)));
    // The currency does NOT come from the SETTING but from the account's wallet (the 'wallet' event at logon fills it).
    // The currency is read from the Steam market session; it cannot be chosen in the settings.
    const eng = new SteamEngine();
    eng.yenidenBaglanmaSiniri = yenidenBaglanmaSiniri();
    // G3: carry drop/reconnect events to the interface
    baglantiDurumunuBagla(eng, entry.steamID);
    applyChatSettings(eng);
    // Incoming chat message: it lands on the interface and the notification under the name of the account it arrived on.
    eng.onChatMessage = (m) => {
      log('info', `[${entry.accountName}] message: ${m.persona || m.from}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('chat:message', { ...m, account: entry.accountName, steamID: entry.steamID });
      }
      if (settings.notifications !== false && settings.notifyChat !== false && !sessizSaatMi()) {
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
  if (!activeSteamID) { activeSteamID = sess.steamID; hesapVerisiGecisi(); }
  const entry = loadAccounts().find((a) => a.steamID === activeSteamID) || sess;
  const r = await connectAccount(entry);
  syncActive();
  return r;
});

// The last fetched lists are kept in the account's own file. The purpose: at startup the Overview should not
// wait empty. The badge page and the library call take a few seconds; during
// that time "Toplam Kart" and "Kütüphane" showed a dash. Now the last known values are
// drawn instantly and overwritten when the fresh data comes.
function listeleriSakla(alan, veri, steamID) {
  const id = steamID || activeSteamID;
  const v = hesapVerisi(id);
  v.listeler = { ...(v.listeler || {}), [alan]: veri, [alan + 'Ts']: Date.now() };
  hesapVerisiYazGecikmeli(id);
}
ipcMain.handle('engine:sonListeler', () => {
  const v = aktifHesapVerisi();
  return { ok: true, ...(v.listeler || {}) };
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
    const cikti = games.map((g) => ({ ...g, playtimeMin: mins.get(g.appid) || 0 }));
    listeleriSakla('drop', cikti);
    return { ok: true, games: cikti };
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
  const r = jsonOku(PRICE_FILE);
  priceCache = (r.ok && r.veri && typeof r.veri === 'object') ? new Map(Object.entries(r.veri)) : new Map();
}
// NOTE: the price cache lives under CACHE_DIR; it used to be created by mistake in CONFIG_DIR.
function savePriceCache() { jsonYaz(PRICE_FILE, Object.fromEntries(priceCache), false); }

function loadHistoryCache() {
  const r = jsonOku(HISTORY_FILE);
  historyCache = (r.ok && r.veri && typeof r.veri === 'object') ? new Map(Object.entries(r.veri)) : new Map();
}
function saveHistoryCache() { jsonYaz(HISTORY_FILE, Object.fromEntries(historyCache), false); }

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
let marketIptal = false;

function marketKuyrugaEkle(h, fiyat, gecmis) {
  const v = marketQueue.find((x) => x.h === h);
  if (v) { v.fiyat = v.fiyat || fiyat; v.gecmis = v.gecmis || gecmis; return; }
  marketQueue.push({ h, fiyat: !!fiyat, gecmis: !!gecmis });
}
function marketKuyruktaMi(h, alan) {
  const v = marketQueue.find((x) => x.h === h);
  return !!(v && v[alan]);
}

// A single price fetch request. If there is a transient error it returns true (the item will be pushed to the end).
async function fiyatCek(h) {
  const n = (priceTries.get(h) || 0) + 1;
  priceTries.set(h, n);
  let p = null;
  try { p = await marketGate(() => engine.getPrice(h)); } catch (_) { p = null; }
  const geciciHata = p && (p.rateLimited || p.noCurrency);
  if (geciciHata && n < MAX_PRICE_TRIES) {
    if (p.noCurrency) log('warn', 'market currency not read yet, price postponed: ' + h);
    return { tekrar: true, limit: !!p.rateLimited };
  }
  if (geciciHata) {
    // Give up: null is written to the cache, the interface shows "-" and the queue advances.
    log('warn', `could not get the price (${n} attempts): ${h} - ${p.rateLimited ? 'rate limit' : 'no currency'}`);
    p = null;
  }
  priceTries.delete(h);
  priceCache.set(h, { price: p, ts: Date.now(), cur: currentPriceCurrency(), v: PRICE_CACHE_VERSION });
  sendRaw('price:one', { hashName: h, price: p });
  return { tekrar: false, limit: false };
}

async function gecmisCek(h) {
  const n = (historyTries.get(h) || 0) + 1;
  historyTries.set(h, n);
  let hist = null;
  try { hist = await marketGate(() => engine.getPriceHistory(h)); } catch (_) { hist = null; }
  if (hist && hist.rateLimited && n < MAX_HISTORY_TRIES) return { tekrar: true, limit: true };
  if (hist && hist.rateLimited) { log('warn', 'could not get the sale history (rate limit): ' + h); hist = null; }
  historyTries.delete(h);
  historyCache.set(h, { hist, ts: Date.now(), cur: currentPriceCurrency(), v: HISTORY_CACHE_VERSION });
  sendRaw('history:one', { hashName: h, history: hist });
  return { tekrar: false, limit: false };
}

async function runMarketQueue() {
  if (marketRunning) return;
  marketRunning = true;
  marketIptal = false;
  const toplam = marketQueue.length;
  let yapilan = 0;
  // The quota is measured in REQUESTS, not items: an item can spend two requests.
  let istekSayaci = 0;
  let limitYendi = false;
  try {
    while (marketQueue.length) {
      if (marketIptal) { marketQueue.length = 0; break; }
      const is = marketQueue.shift();
      const h = is.h;
      let tekrar = false;

      if (is.fiyat && cachedPrice(h) === undefined) {
        istekSayaci++;
        const r = await fiyatCek(h);
        limitYendi = limitYendi || r.limit;
        tekrar = r.tekrar;
      }
      // SAME ITEM, SAME ROUND: no waiting for the order to come round again for the average.
      if (!tekrar && is.gecmis && cachedHistory(h) === undefined) {
        istekSayaci++;
        const r = await gecmisCek(h);
        limitYendi = limitYendi || r.limit;
        tekrar = r.tekrar;
      }

      if (tekrar) { marketQueue.push(is); }
      else yapilan++;

      const kalan = marketQueue.length;
      sendRaw('price:progress', { remaining: kalan, cooldown: kalan > 0 });
      sendRaw('history:progress', { toplam, yapilan, kalan, bekliyor: false });
      if (yapilan % 10 === 0) { savePriceCache(); saveHistoryCache(); }

      // The window is full: wait for the quota to reset.
      if (kalan && istekSayaci >= BATCH_SIZE) {
        istekSayaci = 0;
        sendRaw('history:progress', { toplam, yapilan, kalan, bekliyor: true });
        await new Promise((r) => setTimeout(r, limitYendi ? BATCH_COOLDOWN_MS + 8000 : BATCH_COOLDOWN_MS));
        limitYendi = false;
      }
    }
  } finally {
    marketRunning = false;
    priceTries.clear();
    historyTries.clear();
    savePriceCache();
    saveHistoryCache();
    sendRaw('price:progress', { remaining: 0, cooldown: false });
    sendRaw('history:progress', { toplam, yapilan, kalan: 0, bitti: true, iptal: marketIptal });
    marketIptal = false;
  }
}

// sadeceOnbellek=true: makes no request to Steam, returns the history on disk.
ipcMain.handle('engine:historyFor', (_e, arg) => {
  const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
  const sadeceOnbellek = !Array.isArray(arg) && !!(arg && arg.sadeceOnbellek);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const out = {};
  const eksik = [];
  [...new Set(hashNames || [])].forEach((h) => {
    if (!h) return;
    const c = cachedHistory(h);
    if (c !== undefined) out[h] = c;
    else if (!marketKuyruktaMi(h, 'gecmis')) eksik.push(h);
  });
  if (sadeceOnbellek) return { ok: true, history: out, eksik: eksik.length, kuyruk: 0 };
  eksik.forEach((h) => marketKuyrugaEkle(h, false, true));
  if (marketQueue.length) runMarketQueue();
  return { ok: true, history: out, eksik: eksik.length, kuyruk: marketQueue.length };
});

ipcMain.on('engine:historyCancel', () => {
  if (marketRunning) { marketIptal = true; log('info', 'market fetch cancelled'); }
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
// With sadeceOnbellek=true NO request is made to Steam, only the cache on disk is read.
// The inventory page uses this when it opens: if the cache is full there is no need to ask the user
// "fetch prices now?", the prices come instantly anyway.
//
// THE AVERAGE IN THE SAME ROUND TOO: while an item's lowest price is fetched its average is also fetched
// (Ayarlar > "Fiyatla birlikte ortalamayı da çek"). If turned off the average only comes with the
// "Ortalama" button in Envanter - then a single request is made per item.
ipcMain.handle('engine:pricesFor', (_e, arg) => {
  const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
  const sadeceOnbellek = !Array.isArray(arg) && !!(arg && arg.sadeceOnbellek);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const ortalamaDa = settings.fetchAvgWithPrice !== false;
  const out = {};
  const missing = [];
  [...new Set(hashNames || [])].forEach((h) => {
    if (!h) return;
    const c = cachedPrice(h);
    if (c !== undefined) out[h] = c;
    else if (!marketKuyruktaMi(h, 'fiyat')) missing.push(h);
  });
  if (sadeceOnbellek) return { ok: true, prices: out, queued: 0, eksik: missing.length };
  missing.forEach((h) => marketKuyrugaEkle(h, true, ortalamaDa && cachedHistory(h) === undefined));
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
  const taze = !!(arg && typeof arg === 'object' && arg.taze);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  // taze=true: throw away the schema/value cache, read again from Steam. The verification after a bulk
  // operation uses this; reading from the cache would give back our own guess.
  if (taze) { try { engine.invalidateStats(appid); } catch (_) {} }
  try { return { ok: true, data: await engine.getAchievements(appid) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Own Steam profile (avatar/name/level) via protocol.
ipcMain.handle('engine:profile', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const profil = await engine.getProfile();
    // Write the last known profile to the account's own file. So that at the next startup the interface can show
    // the name, avatar and level without waiting for the Steam session to be established: logging
    // on takes seconds and during that time a dash sat on the screen.
    const v = aktifHesapVerisi();
    v.profil = { ...(v.profil || {}), ...profil, ts: Date.now() };
    hesapVerisiYaz(activeSteamID);
    return { ok: true, profile: v.profil };
  } catch (e) { return { ok: false, error: e.message }; }
});
// Custom profile address (steamcommunity.com/id/<name>). Separate from the profile call: it is not in the
// protocol, it is read from the web page and nobody should hold the name/avatar waiting for it.
ipcMain.handle('engine:vanity', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const vanity = await engine.getVanityURL();
    const v = aktifHesapVerisi();
    v.profil = { ...(v.profil || {}), vanity };
    hesapVerisiYaz(activeSteamID);
    return { ok: true, vanity };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---- persistent lifetime stats (survive app restarts) ----
const STATS_FILE = path.join(CONFIG_DIR, 'stats.json');
const DEFAULT_STATS = {
  totalRuntimeMs: 0, cardsDropped: 0, cardsSold: 0, boostRuntimeMs: 0, sessions: 0, since: Date.now(),
  gunlukKart: {},        // 'YYYY-MM-DD' -> cards dropped that day (En Verimli Gün)
  satisTutar: 0,         // the total the seller keeps of the items put on sale (cents)
  satisFiyatli: 0,       // number of listings whose amount is known (Ortalama Satış = satisTutar / satisFiyatli)
  enUzunCalismaMs: 0,    // uninterrupted run (Kesintisiz Çalışma)
};
let lifeStats = { ...DEFAULT_STATS };
function loadStats() {
  const r = jsonOku(STATS_FILE);
  if (r.ok) {
    lifeStats = { ...DEFAULT_STATS, ...r.veri };
    if (r.yedekten) okumaHatalari.push({ ad: 'İstatistikler', kurtarildi: true });
  } else {
    lifeStats = { ...DEFAULT_STATS, since: Date.now() };
    if (r.bozuk) okumaHatalari.push({ ad: 'İstatistikler', kurtarildi: false });
  }
}
// stats.json is no longer written: statistics are per account, in the account file. The old file is only read at
// first startup to be moved to the account on screen (hesapVerisiGecisi).
// Statistics are account specific and are counted in the MAIN PROCESS (see istatistikEkle): the cards dropped by two
// accounts are not added into a single counter, and a background account's job is counted too. The interface
// only reads; the adding used to be in the interface and only the account on screen was counted.
function istatistikGorunumu(steamID) {
  const st = { ...DEFAULT_STATS, ...hesapIstatistik(steamID) };
  // The uninterrupted time of the running job is taken into account too; otherwise the longest run would only show once the job ended.
  const s = accounts.get(steamID);
  if (s && s.kesintisizBas && !s.kesintisizSon && hesapCalisiyor(s)) {
    st.enUzunCalismaMs = Math.max(+st.enUzunCalismaMs || 0, Date.now() - s.kesintisizBas);
  }
  return { steamID, ...st };
}
ipcMain.handle('stats:get', () => {
  if (!activeSteamID) return { ...DEFAULT_STATS, since: null };
  istatistikSaati(activeSteamID);          // so the last minute of the running job shows too
  return istatistikGorunumu(activeSteamID);
});
ipcMain.handle('stats:reset', () => {
  if (!activeSteamID) return { ...DEFAULT_STATS, since: null };
  const v = aktifHesapVerisi();
  v.stats = { ...DEFAULT_STATS, gunlukKart: {}, since: Date.now() };
  const s = accounts.get(activeSteamID);
  if (s) { s.kesintisizBas = hesapCalisiyor(s) ? Date.now() : null; s.kesintisizSon = null; }
  hesapVerisiYaz(activeSteamID);
  const gorunum = istatistikGorunumu(activeSteamID);
  sendRaw('stats:degisti', gorunum);
  return gorunum;
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
  const r = jsonOku(STATE_FILE);
  if (r.ok) {
    const raw = r.veri;
    appState = {
      entries: (raw && typeof raw.entries === 'object' && raw.entries) || {},
      achLog: Array.isArray(raw && raw.achLog) ? raw.achLog : [],
    };
    if (r.yedekten) okumaHatalari.push({ ad: 'Kayitli durum', kurtarildi: true });
  } else {
    appState = { entries: {}, achLog: [] };
    if (r.bozuk) okumaHatalari.push({ ad: 'Kayitli durum', kurtarildi: false });
  }
  const dropped = pruneState();
  if (dropped) log('info', dropped + ' records past the retention period deleted');
}
function saveState() { jsonYaz(STATE_FILE, appState, false); }
// Cleans the records whose retention time has run out from the ACCOUNT data.
function hesapKayitlariniBudama(v) {
  const ttl = retentionMs();
  if (!ttl || !v) return 0;
  const cut = Date.now() - ttl;
  let n = 0;
  Object.keys(v.entries || {}).forEach((k) => {
    const e = v.entries[k];
    if (!e || !(e.ts > cut)) { delete v.entries[k]; n++; }
  });
  const once = (v.achLog || []).length;
  v.achLog = (v.achLog || []).filter((r) => r && r.ts > cut);
  return n + (once - v.achLog.length);
}

// Read a key - if it has expired undefined is returned (the caller falls back to its default).
// Reads from the ACTIVE ACCOUNT's own store; accounts do not see each other's choices.
ipcMain.handle('state:get', (_e, key) => {
  const v = aktifHesapVerisi();
  hesapKayitlariniBudama(v);
  const e = v.entries[key];
  return { ok: true, value: e ? e.v : undefined, ts: e ? e.ts : null };
});
ipcMain.handle('state:set', (_e, { key, value }) => {
  const v = aktifHesapVerisi();
  v.entries[key] = { v: value, ts: Date.now() };
  hesapKayitlariniBudama(v); hesapVerisiYazGecikmeli(activeSteamID);
  return { ok: true };
});
// Unlocked/locked achievements: a permanent record of what we did, in which game and when.
ipcMain.handle('state:achLog', (_e, entry) => {
  const v = aktifHesapVerisi();
  v.achLog.unshift({ ...entry, ts: Date.now() });
  if (v.achLog.length > 2000) v.achLog.length = 2000;
  hesapKayitlariniBudama(v); hesapVerisiYazGecikmeli(activeSteamID);
  return { ok: true };
});
ipcMain.handle('state:achLogGet', (_e, appid) => {
  const v = aktifHesapVerisi();
  hesapKayitlariniBudama(v);
  const list = appid ? v.achLog.filter((r) => r.appid === appid) : v.achLog;
  return { ok: true, list };
});
ipcMain.handle('state:clear', () => {
  const v = aktifHesapVerisi();
  v.entries = {}; v.achLog = [];
  hesapVerisiYaz(activeSteamID);
  return { ok: true };
});

ipcMain.handle('engine:setAchievements', async (_e, { appid, changes }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, result: await engine.setAchievements(appid, changes) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ---- SALE ----
// Steam's fee calculation (see src/services/steamUcret.js). toplamlar: the amounts the buyer pays,
// in cents. Returns: for each, the amount that will go to Steam and the real price at which the listing
// will appear on the market.
ipcMain.handle('engine:satisUcreti', async (_e, toplamlar) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const cuzdan = await engine.cuzdanBilgisi();
    const sonuc = await steamUcret().hesapla(cuzdan, Array.isArray(toplamlar) ? toplamlar.slice(0, 5000) : []);
    return { ok: true, sonuc, kur: engine.currencyCode() };
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
function satisHatasiTuru(e) {
  const m = String((e && (e.steamMesaji || e.message)) || '');
  const http = e && e.httpDurum;
  if (/already have a listing|no longer in your inventory|not allowed to be traded|specified item/i.test(m)) return 'atla';
  if (http === 429 || http === 503 || http === 502
      || /too many|pending confirmation|previous action|wallet|maximum|exceed|rate limit|try again later/i.test(m)) return 'limit';
  return 'genel';
}
ipcMain.handle('engine:sellItem', async (_e, { assetId, priceCents, amount }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.', tur: 'limit' };
  const steamID = activeSteamID;
  try {
    const result = await engine.sellItem(assetId, priceCents, amount || 1);
    // The statistic is the number of items "put on sale": a listing was made, whether it sold is not known. The amount is
    // what the seller will keep (Steam's cut deducted); "Ortalama Satış" is computed from it.
    const adet = amount || 1;
    istatistikEkle(steamID, { cardsSold: adet, satisTutar: (+priceCents || 0) * adet, satisFiyatli: adet });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Listeleme reddedildi', tur: satisHatasiTuru(e), http: (e && e.httpDurum) || null };
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
    listeleriSakla('owned', games);
    return { ok: true, games };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ================== HOUR BOOSTING (per account) ==================
// The state is in the account's slot (s.boost). Timers remember the account, NOT the engine; whichever
// account is open on screen, when the time is up the right account's games close.
function boostDurumu(s) {
  if (!s.boost) {
    s.boost = { calisiyor: false, timer: null, stagger: [], sync: null, syncTimer: null, syncKalp: null,
                istek: null, baslangic: 0, sureMs: 0, appids: [] };
  }
  return s.boost;
}
function boostTemizle(s) {
  const b = s && s.boost;
  if (!b) return;
  if (b.timer) { clearTimeout(b.timer); b.timer = null; }
  b.stagger.forEach((t) => clearTimeout(t));
  b.stagger = [];
  if (b.syncTimer) { clearTimeout(b.syncTimer); b.syncTimer = null; }
  if (b.syncKalp) { clearInterval(b.syncKalp); b.syncKalp = null; }
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
const SYNC_KALP_MS = 30000;
function esitlemeKalbiKur(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b) return;
  if (b.syncKalp) clearInterval(b.syncKalp);
  b.syncKalp = setInterval(() => {
    const x = accounts.get(steamID);
    if (x && x.boost && x.boost.sync) syncEmit(steamID, true);
    else if (b.syncKalp) { clearInterval(b.syncKalp); b.syncKalp = null; }
  }, SYNC_KALP_MS);
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
function esitlemeSimule(games, targetMin, limit) {
  const kalan = new Map();
  (games || []).forEach((g) => {
    const eksik = targetMin - (g.playtimeMin || 0);
    if (eksik > 0) kalan.set(g.appid, eksik * 60000);
  });
  const asamalar = [];
  let toplamMs = 0;
  const kap = Math.max(1, Math.min(32, limit || 32));
  let guvenlik = 0;
  while (kalan.size && guvenlik++ < 500) {
    const sirali = [...kalan.entries()].sort((a, b) => b[1] - a[1]);
    const aktif = sirali.slice(0, kap);
    const dt = Math.min(...aktif.map((x) => x[1]));
    asamalar.push({ ids: aktif.map((x) => x[0]), sureMs: dt, aktifSayi: aktif.length });
    aktif.forEach(([id, ms]) => {
      const yeni = ms - dt;
      if (yeni <= 0) kalan.delete(id); else kalan.set(id, yeni);
    });
    toplamMs += dt;
  }
  return { toplamMs, asamalar };
}

// WHEN THE CONNECTION DROPS. Sync used to be silently abandoned the moment the connection dropped; even if the engine
// reconnected and reopened the games the sync was gone. Now the downtime
// is not credited to the ledger (Steam does not count it either), in the stepped strategy the step time is extended by that much.
function esitlemeBaglantiDegisti(steamID, bagli) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  const st = b && b.sync;
  if (!st) return;
  const simdi = Date.now();
  if (!bagli) {
    if (!st.kopuk) {
      defter.defteriIsle(st, simdi);
      st.kopuk = true;
      st.kopmaAni = simdi;
    }
    return;
  }
  if (!st.kopuk) return;
  st.kopuk = false;
  const kayip = Math.max(0, simdi - (st.kopmaAni || simdi));
  st.sonHesap = simdi;
  if (st.strateji === 'staged' && st.adimBitis && b.syncTimer) {
    st.adimBitis += kayip;
    st.startedAt += kayip;
    clearTimeout(b.syncTimer);
    b.syncTimer = setTimeout(() => kademeIlerle(steamID), Math.max(1000, st.adimBitis - simdi));
  }
}

// Plans one step of a running parallel sync: subtracts the elapsed time from the active games,
// removes the ones that reached the target from the list, builds a new active set from the rest.
function esitlemePlanla(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  const st = b && b.sync;
  if (!st || st.strateji !== 'parallel') return;
  if (!s.engine) { boostBitir(steamID, 'baglanti'); return; }
  // If there is no connection wait; the engine reopens the games itself once it reconnects.
  if (!s.ready) { b.syncTimer = setTimeout(() => esitlemePlanla(steamID), 30000); return; }
  const yeniBitenler = defter.defteriIsle(st, Date.now());
  yeniBitenler.forEach((o) => log('info', '[' + hesapAdi(steamID) + '] hour sync: ' + o.name + ' reached the target'));

  const kalanlar = [...st.oyunlar.values()].filter((o) => !o.bitti);
  if (!kalanlar.length) {
    log('info', '[' + hesapAdi(steamID) + '] hour sync done: all games reached the target');
    syncEmit(steamID, false, { done: true });
    hesapOlayi(steamID, {
      tur: 'esitlemeBitti',
      akis: { kind: 'saat', title: 'Saat Eşitleme', text: 'Tüm oyunlar hedefe ulaştı.', status: 'Başarılı' },
    });
    boostBitir(steamID, 'esitleme');
    return;
  }
  st.aktif = defter.siradakiAktifKume(st);
  s.engine.play(st.aktif, 'saat');

  const enKisa = Math.min(...st.aktif.map((id) => st.oyunlar.get(id).kalanMs));
  syncEmit(steamID, true);
  hesapYayini(steamID)('boost:tick', {
    running: true, appids: st.aktif, activeAppids: s.engine.calanlar('saat'),
    startedAt: st.baslangic, durationMs: 0, sync: true,
  });
  b.syncTimer = setTimeout(() => esitlemePlanla(steamID), Math.max(1000, enKisa));
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
  const yay = hesapYayini(steamID);
  if (st && st.strateji === 'parallel') {
    const oyunlar = defter.arayuzListesi(st, Date.now());
    const kalanlar = oyunlar.filter((o) => !o.bitti);
    yay('boost:sync', Object.assign({
      running,
      strateji: 'parallel',
      targetMin: st.targetMin,
      toplam: oyunlar.length,
      biten: oyunlar.length - kalanlar.length,
      aktifSayi: (st.aktif || []).length,
      ids: (st.aktif || []).slice(),
      oyunlar,
      // The end of the game furthest behind = the end of the whole job (if the limit is enough)
      kalanMs: kalanlar.length ? Math.max(...kalanlar.map((o) => o.kalanMs)) : 0,
      startedAt: st.baslangic,
      isToplamMs: st.isToplamMs || 0,
    }, extra || {}));
    return;
  }
  // G13: the game list is sent in the stepped strategy too. Since it was not sent before the
  // interface wrote the SAME percentage on every game (how much of the session had passed); a game one
  // hour from the target and a game 47 hours from it showed the same bar.
  const adim = st && st.steps[st.i];
  yay('boost:sync', Object.assign({
    running,
    strateji: 'staged',
    step: st ? st.i + 1 : 0,
    steps: st ? st.steps.length : 0,
    targetMin: st ? st.targetMin : 0,
    ids: adim ? adim.ids : [],
    fromMin: adim ? adim.fromMin : 0,
    toMin: adim ? adim.toMin : 0,
    startedAt: st ? st.startedAt : 0,
    stepMs: st ? st.stepMs : 0,
    oyunlar: st ? defter.arayuzListesi(st, Date.now()) : [],
    isToplamMs: st ? (st.isToplamMs || 0) : 0,
  }, extra || {}));
}
function kademeIlerle(steamID) {
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
  defter.defteriIsle(st, Date.now()).forEach((o) => log('info', '[' + hesapAdi(steamID) + '] hour sync: ' + o.name + ' reached the target'));
  const adim = st.steps[st.i];
  if (!adim) {
    // All steps are done → all are equal, now they continue together
    const allIds = st.hepsi;
    const sonrakiSure = st.sonrakiSureMs || 0;
    log('info', '[' + hesapAdi(steamID) + '] hour sync done, all games are running together');
    syncEmit(steamID, false, { done: true });
    hesapOlayi(steamID, {
      tur: 'esitlemeBitti',
      akis: { kind: 'saat', title: 'Saat Eşitleme', text: 'Tüm oyunlar hedefe ulaştı.', status: 'Başarılı' },
    });
    b.sync = null;
    if (b.syncKalp) { clearInterval(b.syncKalp); b.syncKalp = null; }
    s.engine.play(allIds, 'saat');
    b.appids = allIds; b.baslangic = Date.now(); b.sureMs = sonrakiSure;
    hesapYayini(steamID)('boost:tick', { running: true, appids: allIds, activeAppids: s.engine.calanlar('saat'), startedAt: b.baslangic, durationMs: b.sureMs });
    if (sonrakiSure) b.timer = setTimeout(() => boostSureDoldu(steamID), sonrakiSure);
    return;
  }
  st.stepMs = (adim.toMin - adim.fromMin) * 60000;
  st.startedAt = Date.now();
  st.adimBitis = st.startedAt + st.stepMs;
  st.aktif = adim.ids.slice();      // the ledger credits time to this set
  st.sonHesap = Date.now();
  s.engine.play(adim.ids, 'saat');
  log('info', `[${hesapAdi(steamID)}] hour sync step ${st.i + 1}/${st.steps.length}: ${adim.ids.length} games ${adim.fromMin}min -> ${adim.toMin}min`);
  syncEmit(steamID, true);
  hesapYayini(steamID)('boost:tick', { running: true, appids: adim.ids, activeAppids: s.engine.calanlar('saat'), startedAt: st.startedAt, durationMs: st.stepMs, sync: true });
  b.syncTimer = setTimeout(() => kademeIlerle(steamID), st.stepMs);
}

// Starts simultaneous hour boosting. istek: { appids, durationMs, games, devam }
// devam: { baslangic } - when a setting changes the job is resumed with the same start and total duration.
function boostBaslat(steamID, istek) {
  const s = accounts.get(steamID);
  if (!s || !s.engine || !s.ready) return { ok: false, error: 'Bağlı değil.' };
  const b = boostDurumu(s);
  boostTemizle(s);
  // Sequential and simultaneous boosting do not run at the same time; both write the same game list.
  if (s.farmSaat && s.farmSaat.running) s.farmSaat.stop('boost');
  if (settings.pauseFarmOnBoost) farmiBeklet(steamID, 'saat yukseltme');
  const appids = (istek.appids || []).slice();
  const games = Array.isArray(istek.games) ? istek.games : null;
  const durationMs = +istek.durationMs || 0;
  // tumu: all the games selected on the page. If the "at most at once" setting changes while the job runs
  // the list is cut again from here; if only the first slice were kept the limit could not be raised.
  const tumu = Array.isArray(istek.tumu) && istek.tumu.length ? istek.tumu : null;
  b.istek = { appids, durationMs, games, tumu };
  b.calisiyor = true;

  // If sync is on, work toward the target. There are two strategies:
  //   parallel (default) - all together, drop the one that reaches the target from the list. The fastest.
  //   staged             - step by step, keeps the games level along the way. Slow but gradual.
  if (settings.boostSync && games && games.length) {
    const mode = settings.boostSyncMode || 'highest';
    let targetMin;
    if (mode === 'manual') targetMin = Math.max(0, Math.round((+settings.boostSyncTargetHours || 0) * 60));
    else if (mode === 'library') targetMin = Math.max(0, +settings.boostSyncLibraryMaxMin || 0);
    else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

    const geride = games.filter((g) => (g.playtimeMin || 0) < targetMin);
    if (!geride.length) {
      log('info', '[' + hesapAdi(steamID) + '] hour sync: all games are already at the target, starting them together directly');
    } else if ((settings.boostSyncStrategy || 'parallel') === 'staged') {
      const steps = buildSyncSteps(games, targetMin);
      if (steps.length) {
        b.sync = {
          strateji: 'staged', steps, i: 0, startedAt: 0, stepMs: 0, targetMin,
          hepsi: games.map((g) => g.appid), sonrakiSureMs: durationMs,
          // The stepped strategy keeps the same ledger too: the interface reads the per-game progress
          // from here, otherwise it wrote the session percentage on every game.
          oyunlar: defter.defterKur(geride, targetMin),
          aktif: [], baslangic: Date.now(), sonHesap: Date.now(),
          // The job's TOTAL time, once at the start. The bars in the interface sit on this shared
          // timeline: a game's bar shows where in the job that game finishes. It is kept
          // constant, otherwise the bars could go backwards.
          isToplamMs: steps.reduce((t, st) => t + (st.toMin - st.fromMin) * 60000, 0),
        };
        log('info', '[' + hesapAdi(steamID) + '] hour sync (staged): ' + steps.length + ' steps, target ' + targetMin + ' min');
        esitlemeKalbiKur(steamID);
        runSyncStep(steamID);
        return { ok: true };
      }
    } else {
      // Sync computes its own duration; the "yükseltme süresi" setting is invalid here.
      const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
      b.sync = {
        strateji: 'parallel', targetMin, limit, oyunlar: defter.defterKur(geride, targetMin),
        aktif: [], baslangic: Date.now(), sonHesap: Date.now(),
      };
      // The job's TOTAL time, once at the start and it never changes again. The bars in the interface
      // sit on this shared timeline: in a 34 hour job the bar of a game that will finish after 3 hours
      // is full from the start, the bar of the game that will run to the end is empty.
      b.sync.isToplamMs = defter.kalanToplamMs(b.sync);
      log('info', '[' + hesapAdi(steamID) + '] hour sync (parallel): ' + b.sync.oyunlar.size + ' games, target ' + targetMin
        + ' dk, limit ' + limit + ', toplam is ' + Math.round(b.sync.isToplamMs / 60000) + ' dk');
      esitlemeKalbiKur(steamID);
      esitlemePlanla(steamID);
      return { ok: true };
    }
  }

  // The "Süre dolunca otomatik durdur" setting was removed: if a duration is chosen it stops when the time is up,
  // if "Sınırsız" is chosen it runs until stopped. Two separate switches said the same thing.
  const devam = istek.devam || null;
  const baslangic = devam && devam.baslangic ? devam.baslangic : Date.now();
  const kalanMs = durationMs ? Math.max(1000, durationMs - (Date.now() - baslangic)) : 0;
  const stagger = Math.max(0, +settings.boostStagger || 0) * 1000;
  b.appids = appids; b.baslangic = baslangic; b.sureMs = durationMs;

  const emit = () => hesapYayini(steamID)('boost:tick', { running: true, appids, activeAppids: s.engine.calanlar('saat'), startedAt: baslangic, durationMs });
  if (!stagger || appids.length <= 1 || devam) {
    s.engine.play(appids, 'saat');
    emit();
  } else {
    // "Oyun başlatma aralığı": added one after another at this interval, not all at once
    log('info', `[${hesapAdi(steamID)}] boost: starting ${appids.length} games ${stagger}ms apart`);
    appids.forEach((id, i) => {
      b.stagger.push(setTimeout(() => {
        if (!b.calisiyor) return;
        s.engine.play(appids.slice(0, i + 1), 'saat');
        emit();
      }, i * stagger));
    });
  }
  if (kalanMs) b.timer = setTimeout(() => boostSureDoldu(steamID), kalanMs);
  return { ok: true };
}

// Time is up. If "Oturumu otomatik yenile" is on it restarts with the same selection; this used to
// be in the interface and only worked for the account on screen and while the window was open. When the account changed
// the interface could restart it on the wrong account.
function boostSureDoldu(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b || !b.calisiyor) return;
  const istek = b.istek;
  boostBitir(steamID, 'sure', true);
  if (settings.boostAutoRestart && istek) {
    hesapOlayi(steamID, {
      tur: 'boostYenilendi',
      akis: { kind: 'saat', title: 'Saat Yükseltici', text: 'Süre doldu, oturum otomatik yenilendi.', status: 'Çalışıyor' },
    });
    setTimeout(() => {
      const x = accounts.get(steamID);
      if (x && x.ready && !(x.boost && x.boost.calisiyor)) boostBaslat(steamID, { ...istek, devam: null });
      else farmiSurdur(steamID);
    }, 1500);
    return;
  }
  hesapOlayi(steamID, {
    tur: 'boostBitti',
    akis: { kind: 'saat', title: 'Saat Yükseltici', text: 'Süre doldu.', status: 'Başarılı' },
  });
  farmiSurdur(steamID);
}

// Stops simultaneous hour boosting. surdurmeyiErtele: card farming should not be resumed right away
// (if the automatic renewal will start again with the same selection).
function boostBitir(steamID, sebep, surdurmeyiErtele) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b) return;
  const calisiyordu = b.calisiyor;
  boostTemizle(s);
  b.calisiyor = false;
  if (calisiyordu) {
    try { if (s.engine) s.engine.stop('saat'); } catch (_) {}
  }
  const yay = hesapYayini(steamID);
  yay('boost:sync', { running: false });
  yay('boost:tick', { running: false, sebep: sebep || 'kullanici' });
  if (calisiyordu && !surdurmeyiErtele) farmiSurdur(steamID);
}
function boostDurdurHesap(steamID, sebep) { boostBitir(steamID, sebep || 'kullanici'); }

// Sequential idling (Saat Yükseltici, "eş zamanlı" off): one by one, `durationMs` each.
// Uses FarmController's 'sequential' mode; a separate instance so it does not clash with card farming.
function siraliYayini(steamID) {
  const yay = hesapYayini(steamID);
  return (kanal, veri) => {
    yay('saatFarm:tick', veri);
    if (!veri || veri.running || !veri.calisiyordu) return;
    const s = accounts.get(steamID);
    if (s && !s.farmSaat.running) {
      if (veri.sebep === 'bitti') {
        hesapOlayi(steamID, {
          tur: 'boostBitti',
          akis: { kind: 'saat', title: 'Saat Yükseltici', text: 'Sıralı kuyruk tamamlandı.', status: 'Başarılı' },
        });
      }
      if (veri.sebep !== 'boost' && veri.sebep !== 'ayar') farmiSurdur(steamID);
    }
  };
}
function siraliBaslat(steamID, istek) {
  const s = accounts.get(steamID);
  if (!s || !s.engine || !s.ready) return { ok: false, error: 'Bağlı değil.' };
  if (s.boost && s.boost.calisiyor) boostBitir(steamID, 'sirali', true);
  if (settings.pauseFarmOnBoost) farmiBeklet(steamID, 'sirali saat yukseltme');
  if (!s.farmSaat) s.farmSaat = new FarmController(s.engine, siraliYayini(steamID), 'sirali');
  s.farmSaat.engine = s.engine;
  s.siraliIstek = { games: istek.games || [], durationMs: istek.durationMs, loop: istek.loop !== false };
  // "Oyun sırasını karıştır" only makes sense here: since games are opened one by one the order
  // shows on the profile. In simultaneous boosting all are open together and the order has no effect.
  s.farmSaat.start('sequential', s.siraliIstek.games, s.siraliIstek.durationMs, {
    loop: s.siraliIstek.loop, karistir: !!settings.shuffleBoost, devam: istek.devam || null,
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
function gercekciDurumu(steamID) {
  const s = accounts.get(steamID);
  return s ? s.gercekci : null;
}
function gercekciTemizle(steamID) {
  const s = accounts.get(steamID);
  if (!s) return;
  if (s.gercekci && s.gercekci.timer) clearTimeout(s.gercekci.timer);
  s.gercekci = null;
}

// The proportional time (0..1) of the i-th unlock in the session according to the model.
// linear : even intervals
// exp    : frequent at first, then sparse (a real player gets more achievements in the first hours)
// pareto : 80% of the achievements in 20% of the time - a "reset everything from the start" look
function gercekciModelOran(p, model) {
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
const GECIKME_UST_SINIR = 0.6;      // at most 60% of the queue counts as backlog

function gercekciBirikim(bilgi) {
  const b = bilgi || {};
  const toplam = +b.toplamBasarim || 0;
  const oynanmisSa = Math.max(0, (+b.playtimeMin || 0) / 60);
  const tcSa = Math.max(1, +b.tcSa || 0);
  const zorluk = Math.max(0.1, +b.zorluk || 1.2);
  if (!toplam || !oynanmisSa) return 0;
  // The number that SHOULD have been unlocked up to this hour, capped by the total.
  const beklenen = Math.min(toplam, toplam * (oynanmisSa / (tcSa * zorluk)));
  return Math.max(0, Math.round(beklenen - (+b.acilmis || 0)));
}

// ---- RARITY WEIGHT ----
// When the time was divided equally over the queue an ultra rare achievement and a common one got the same interval;
// what is more, since the rare ones are at the end of the queue they fell into the slow part of the session.
// Now the time is divided WITH WEIGHTS: only the ultra rare ones (under 5%) wait long, the rest flow
// even and fast. What stands out on a profile is how soon the ultra rare one came;
// a 10% achievement unlocking fast does not draw attention.
function gercekciNadirlikAgirlik(pct, ultraCarpan) {
  if (!Number.isFinite(pct)) return 1;
  return pct < 5 ? Math.max(1, ultraCarpan || 3) : 1;
}

// Writes the unlock times into the queue (ms relative to the start of the session).
//   birikim > 0 : the first that many achievements are squeezed into the start of the session
//   ayar        : { hizCarpani, ultraCarpan, telafiPayi, bitmis, bitmisOran }
function gercekciZamanlariYerlestir(kuyruk, sureMs, model, birikim, ayar) {
  const n = kuyruk.length;
  if (!n) return kuyruk;
  const a = ayar || {};
  const hiz = Math.max(0.1, Math.min(4, +a.hizCarpani || 1));
  const ultra = Math.max(1, Math.min(10, +a.ultraCarpan || 3));
  const telafiPay = Math.max(0.02, Math.min(0.9, +a.telafiPayi || 0.2));
  // If the game is already finished (playtime >= completion time) there is no point imitating the learning curve:
  // the schedule is compressed as a whole. The session itself is not shortened, only the unlocks
  // end early - with "basarimlar bitince saati surdur" on it keeps collecting hours.
  const bitmisOran = a.bitmis ? Math.max(0.05, Math.min(1, +a.bitmisOran || 0.5)) : 1;
  const etkinSure = Math.max(60000, Math.round(sureMs * hiz * bitmisOran));

  const hizli = Math.min(Math.floor(n * GECIKME_UST_SINIR), Math.max(0, +birikim || 0));
  const hizliSure = hizli ? Math.round(etkinSure * telafiPay) : 0;
  const kalanSure = etkinSure - hizliSure;
  const kalanlar = kuyruk.slice(hizli);
  const agirliklar = kalanlar.map((x) => gercekciNadirlikAgirlik(x.rarityPct, ultra));
  const toplamAgirlik = agirliklar.reduce((t, x) => t + x, 0) || 1;

  let kum = 0;
  kuyruk.forEach((x, i) => {
    if (i < hizli) {
      x.zaman = Math.round(hizliSure * ((i + 1) / hizli));
      x.gecikmeTelafi = true;
    } else {
      kum += agirliklar[i - hizli];
      x.zaman = hizliSure + Math.round(kalanSure * gercekciModelOran(kum / toplamAgirlik, model));
    }
  });
  return kuyruk;
}

function gercekciBildir(steamID, ek) {
  const d = gercekciDurumu(steamID);
  const a = d ? d.aktif : null;
  hesapYayini(steamID)('gercekci:tick', Object.assign({
    calisiyor: !!d,
    appid: a ? a.appid : null,
    oyunAdi: a ? a.oyunAdi : null,
    // toplam/acilan describe the WHOLE session; the queue can hold more than one game.
    toplam: d ? d.toplamHedef : 0,
    acilan: d ? d.toplamAcilan : 0,
    hata: d ? d.toplamHata : 0,
    baslangic: d ? d.baslangic : 0,
    bitis: d ? d.bitis : 0,
    siradaki: a && a.kuyruk[a.indeks] ? a.kuyruk[a.indeks].name : null,
    siradakiPct: a && a.kuyruk[a.indeks] ? a.kuyruk[a.indeks].rarityPct : null,
    siradakiZaman: d ? d.siradakiZaman : 0,
    oyunSayisi: d ? d.oyunlar.length : 0,
    oyunIndeks: d ? d.oyunIndeks : 0,
    ortalamaAralikMs: d ? d.ortalamaAralikMs : 0,
  }, ek || {}));
}

// Computes when the next unlock will happen. It waits according to the target time the model gives;
// with "Rastgele aralik" on a +-40% deviation is added on top - so that no fixed rhythm forms.
function gercekciSonrakiGecikme(d) {
  const a = d.aktif;
  const kalanAdet = a.kuyruk.length - a.indeks;
  if (kalanAdet <= 0) return 0;
  const hedefZaman = a.baslangic + (a.kuyruk[a.indeks].zaman || 0);
  let g = hedefZaman - Date.now();
  if (!(g > 0)) {
    // The model time has passed (happens at the start or in a delay): divide the remaining time.
    g = Math.max(0, a.bitis - Date.now()) / kalanAdet;
  }
  if (d.secenekler.rastgeleAralik) {
    const sapma = g * 0.4;
    g = g - sapma + Math.random() * sapma * 2;
  }
  return Math.max(3000, Math.round(g));   // at least 3 seconds
}

async function gercekciAdim(steamID) {
  const s = accounts.get(steamID);
  const d = s && s.gercekci;
  if (!d) return;
  if (!s.engine) { gercekciBitir(steamID, 'baglanti yok'); return; }
  // If the connection is down an achievement cannot be sent; it continues when the engine reconnects.
  if (!s.ready) { d.timer = setTimeout(() => gercekciAdim(steamID), 30000); return; }
  const a = d.aktif;
  const hedef = a.kuyruk[a.indeks];
  if (!hedef) {
    // This game's achievements are done. If there is another game in the queue it moves on to it; if not, with "Başarımlar
    // bitince saati sürdür" on the game stays open until the end of the time (it keeps boosting hours).
    log('info', '[' + hesapAdi(steamID) + '] realistic mode: ' + a.oyunAdi + ' achievements done');
    gercekciBildir(steamID, { basarimlarBitti: true });
    if (gercekciSonrakiOyun(steamID)) return;
    if (d.secenekler.saatiSurdur && Date.now() < d.bitis) {
      d.timer = setTimeout(() => { if (gercekciDurumu(steamID) === d) gercekciBitir(steamID, 'sure doldu'); }, d.bitis - Date.now());
    } else {
      gercekciBitir(steamID, Date.now() >= d.bitis ? 'sure doldu' : 'tum basarimlar acildi');
    }
    return;
  }

  try {
    await s.engine.setAchievements(a.appid, [{ apiName: hedef.apiName, unlock: true }]);
    a.acilan++; d.toplamAcilan++;
    log('info', '[' + hesapAdi(steamID) + '] realistic mode: unlocked -> ' + hedef.name + ' (%' + (hedef.rarityPct != null ? hedef.rarityPct.toFixed(1) : '?') + ')');
    hesapYayini(steamID)('gercekci:acildi', {
      appid: a.appid, oyunAdi: a.oyunAdi, apiName: hedef.apiName,
      name: hedef.name, rarityPct: hedef.rarityPct,
    });
    const v = hesapVerisi(steamID);
    v.achLog.unshift({ appid: a.appid, game: a.oyunAdi, apiName: hedef.apiName, name: hedef.name, unlock: true, ts: Date.now() });
    if (v.achLog.length > 2000) v.achLog.length = 2000;
    hesapVerisiYazGecikmeli(steamID);
    if (steamID !== activeSteamID) {
      akisEkle(steamID, { kind: 'kart', title: 'Başarım açıldı', text: hedef.name + ' · ' + a.oyunAdi, status: 'Başarılı' });
    }
  } catch (e) {
    a.hata++; d.toplamHata++;
    log('warn', '[' + hesapAdi(steamID) + '] realistic mode: could not unlock -> ' + hedef.name + ': ' + (e && e.message));
  }
  if (s.gercekci !== d) return;          // it was stopped in the meantime
  a.indeks++;

  if (Date.now() >= d.bitis && a.indeks < a.kuyruk.length) {
    // The time is up but achievements are left - we do not force the rest, we tell the user.
    gercekciBitir(steamID, 'sure doldu, ' + (a.kuyruk.length - a.indeks) + ' basarim acilmadi');
    return;
  }
  const gecikme = gercekciSonrakiGecikme(d);
  d.siradakiZaman = Date.now() + gecikme;
  gercekciBildir(steamID);
  d.timer = setTimeout(() => gercekciAdim(steamID), gecikme);
}

// Moves to the next game in the queue. Returns true if the move was made.
function gercekciSonrakiOyun(steamID) {
  const s = accounts.get(steamID);
  const d = s && s.gercekci;
  if (!d) return false;
  if (!d.secenekler.otoSira) return false;             // "Sırayı otomatik başlat" is off
  while (d.oyunIndeks + 1 < d.oyunlar.length) {
    d.oyunIndeks++;
    const o = d.oyunlar[d.oyunIndeks];
    const kalanSure = d.bitis - Date.now();
    if (kalanSure <= 5000) return false;               // the time is over, there is no point moving on
    const hazir = d.hazirlanan[o.appid];
    if (!hazir) continue;
    // A game with no achievements left to unlock does not wait in line: this page only unlocks achievements,
    // the Hour Booster exists for boosting hours. There used to be a three option setting here
    // (collect hours / skip / stop the queue); none of the three was this page's job.
    if (!hazir.kuyruk.length) { log('info', 'realistic mode: ' + o.name + ' skipped (no achievement to unlock)'); continue; }
    // We divide the remaining time among the remaining games according to their achievement count.
    const kalanOyunlar = d.oyunlar.slice(d.oyunIndeks);
    const kalanToplamAdet = kalanOyunlar.reduce((t, x) => t + ((d.hazirlanan[x.appid] || { kuyruk: [] }).kuyruk.length || 1), 0);
    const buAdet = hazir.kuyruk.length || 1;
    const pay = Math.max(60000, Math.round(kalanSure * (buAdet / kalanToplamAdet)));
    const simdi = Date.now();
    d.aktif = {
      appid: o.appid, oyunAdi: o.name,
      kuyruk: gercekciZamanlariYerlestir(hazir.kuyruk, pay, d.secenekler.model,
                                         gercekciBirikimHesapla(o.appid, hazir, d.secenekler),
                                         gercekciZamanAyari(o.appid, d.secenekler)),
      indeks: 0, acilan: 0, hata: 0, baslangic: simdi, bitis: simdi + pay,
    };
    try { s.engine.play([o.appid], 'gercekci'); } catch (_) {}
    log('info', '[' + hesapAdi(steamID) + '] realistic mode: next ' + o.name + ' (' + hazir.kuyruk.length + ' achievements, '
      + (pay / 60000).toFixed(0) + ' dk)');
    const gecikme = hazir.kuyruk.length ? gercekciSonrakiGecikme(d) : Math.max(0, d.aktif.bitis - Date.now());
    d.siradakiZaman = Date.now() + gecikme;
    gercekciBildir(steamID, { oyunDegisti: true });
    d.timer = setTimeout(() => { if (gercekciDurumu(steamID) === d) gercekciAdim(steamID); }, gecikme);
    return true;
  }
  return false;
}

// The end reason is shown in the interface; the text is translated in the dictionary (the key is this Turkish text).
const GERCEKCI_SEBEP = {
  'sure doldu': 'Süre doldu', 'tum basarimlar acildi': 'Tüm başarımlar açıldı',
  'kullanici durdurdu': 'Durduruldu', 'baglanti yok': 'Steam bağlantısı yok',
};
function gercekciBitir(steamID, sebep) {
  const s = accounts.get(steamID);
  const d = s && s.gercekci;
  if (!d) return;
  const kalanAcilmadi = /^sure doldu, (\d+)/.exec(sebep || '');
  // The text is translated in the interface; its version that carries a number is a '#' pattern key in the dictionary.
  const sebepMetni = kalanAcilmadi ? 'Süre doldu, # başarım açılmadı'.replace('#', kalanAcilmadi[1]) : (GERCEKCI_SEBEP[sebep] || sebep);
  const ozet = { acilan: d.toplamAcilan, hata: d.toplamHata, toplam: d.toplamHedef, sebep: sebepMetni };
  try { if (s.engine) s.engine.stop('gercekci'); } catch (_) {}
  gercekciTemizle(steamID);
  log('info', '[' + hesapAdi(steamID) + '] realistic mode done: ' + sebep + ' (' + ozet.acilan + '/' + ozet.toplam + ')');
  hesapYayini(steamID)('gercekci:tick', Object.assign({ calisiyor: false, bitti: true }, ozet));
  if (steamID !== activeSteamID) {
    akisEkle(steamID, { kind: ozet.hata ? 'hata' : 'kart', title: 'Gerçekçi Mod',
      text: sebepMetni + ' · ' + ozet.acilan + ' / ' + ozet.toplam, status: ozet.hata ? 'Hata' : 'Başarılı' });
  }
  farmiSurdur(steamID);
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
const BASARIMSIZ_FILE = path.join(CACHE_DIR, 'basarimsiz.json');
let basarimsizSet = new Set();
function loadBasarimsiz() {
  const r = jsonOku(BASARIMSIZ_FILE);
  const liste = (r.ok && r.veri && Array.isArray(r.veri.appids)) ? r.veri.appids : [];
  basarimsizSet = new Set(liste.map((x) => +x).filter(Boolean));
}
function saveBasarimsiz() {
  jsonYaz(BASARIMSIZ_FILE, { appids: [...basarimsizSet], guncel: Date.now() }, false);
}
function basarimsizIsaretle(appid) {
  const id = +appid;
  if (!id || basarimsizSet.has(id)) return false;
  basarimsizSet.add(id);
  saveBasarimsiz();
  log('info', 'realistic mode: ' + id + ' marked as having no achievements, dropped from the list');
  return true;
}
loadBasarimsiz();

ipcMain.handle('gercekci:basarimsizlar', () => ({ ok: true, appids: [...basarimsizSet] }));
ipcMain.handle('gercekci:basarimsizTemizle', () => {
  const n = basarimsizSet.size;
  basarimsizSet = new Set();
  saveBasarimsiz();
  log('info', 'realistic mode: the no-achievement list was cleared (' + n + ' games)');
  return { ok: true, silinen: n };
});

async function gercekciKuyrukHazirla(motor, appid, secenekler) {
  const data = await motor.getAchievements(appid);
  const hepsi = (data && Array.isArray(data.achievements)) ? data.achievements : null;
  if (!hepsi || !hepsi.length) {
    basarimsizIsaretle(appid);
    return { ok: false, basarimsiz: true, error: 'Bu oyunun başarımı yok.', oyunAdi: (data && data.gameName) || null };
  }
  // Locked + not protected. Protected ones are rejected by Steam (see G4).
  let uygun = hepsi.filter((a) => !a.achieved && !a.korumali);
  const korumali = hepsi.filter((a) => !a.achieved && a.korumali).length;
  // "Ultra Nadir Başarımları Atla": those under 5% are the ones that stand out most on a profile.
  let ultraAtlanan = 0;
  if (secenekler.ultraNadirAtla) {
    const once = uygun.length;
    uygun = uygun.filter((a) => !Number.isFinite(a.rarityPct) || a.rarityPct >= 5);
    ultraAtlanan = once - uygun.length;
  }
  uygun.sort((x, y) => {
    const a = Number.isFinite(x.rarityPct) ? x.rarityPct : -1;
    const b = Number.isFinite(y.rarityPct) ? y.rarityPct : -1;
    return b - a;
  });
  // Target count: trimmed from the start (the most common).
  const hedef = +secenekler.hedef || 0;
  const kirpilan = (hedef > 0 && hedef < uygun.length) ? uygun.slice(0, hedef) : uygun;
  return {
    ok: true,
    oyunAdi: data.gameName || ('App ' + appid),
    kuyruk: kirpilan.map((a) => ({ apiName: a.apiName, name: a.name, rarityPct: a.rarityPct })),
    uygunToplam: uygun.length,
    korumali,
    ultraAtlanan,
    toplamBasarim: hepsi.length,
    acilmis: hepsi.filter((a) => a.achieved).length,
  };
}

// The completed form of the incoming options. Even if the interface sends them incomplete the engine works consistently.
function gercekciSecenekler(s) {
  const g = s || {};
  return {
    hedef: Math.max(0, +g.hedef || 0),                       // 0 = all
    model: ['linear', 'exp', 'pareto'].includes(g.model) ? g.model : 'linear',
    rastgeleAralik: g.rastgeleAralik !== false,
    ultraNadirAtla: !!g.ultraNadirAtla,
    otoSira: g.otoSira !== false,
    saatiSurdur: g.saatiSurdur !== false,
    // Squeeze the overdue achievement backlog into the start of the session. The size of the backlog depends on the game's
    // PLAYTIME: a few in a 1 hour game, far more in a 100 hour one.
    // Tc and the difficulty come from the interface (they are already computed there).
    gecikmisHizlandir: !!g.gecikmisHizlandir,
    hizCarpani: Math.max(0.1, Math.min(4, +g.hizCarpani || 1)),
    ultraCarpan: Math.max(1, Math.min(10, +g.ultraCarpan || 3)),
    telafiPayi: Math.max(0.02, Math.min(0.9, +g.telafiPayi || 0.2)),
    bitmisOran: Math.max(0.05, Math.min(1, +g.bitmisOran || 0.5)),
    tcSa: Math.max(1, +g.tcSa || 0) || 20,
    zorluk: Math.max(0.1, +g.zorluk || 0) || 1.2,
    playtime: (g.playtime && typeof g.playtime === 'object') ? g.playtime : {},
  };
}

// Timing settings. 'bitmis' changes per game: if the playtime has passed the completion time.
function gercekciZamanAyari(appid, sec) {
  const oynanmisSa = (sec.playtime[appid] || sec.playtime[String(appid)] || 0) / 60;
  return {
    hizCarpani: sec.hizCarpani,
    ultraCarpan: sec.ultraCarpan,
    telafiPayi: sec.telafiPayi,
    bitmis: oynanmisSa > 0 && oynanmisSa >= sec.tcSa,
    bitmisOran: sec.bitmisOran,
  };
}

// A game's backlog: 0 if the option is off.
function gercekciBirikimHesapla(appid, h, sec) {
  if (!sec.gecikmisHizlandir) return 0;
  return gercekciBirikim({
    toplamBasarim: h.toplamBasarim,
    acilmis: h.acilmis,
    playtimeMin: sec.playtime[appid] || sec.playtime[String(appid)] || 0,
    tcSa: sec.tcSa,
    zorluk: sec.zorluk,
  });
}

// Preview: how many achievements, in what order, at which minute they will unlock.
// If sureMs is not given the hours field is used (the old call form works too).
ipcMain.handle('gercekci:plan', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const { appid, saat, sureMs } = arg || {};
  const sec = gercekciSecenekler(arg && arg.secenekler);
  const sure = Math.max(60000, +sureMs || (Math.max(1, +saat || 1) * 3600000));
  try {
    const h = await gercekciKuyrukHazirla(engine, appid, sec);
    if (!h.ok) return h;
    const birikim = gercekciBirikimHesapla(appid, h, sec);
    gercekciZamanlariYerlestir(h.kuyruk, sure, sec.model, birikim, gercekciZamanAyari(appid, sec));
    return {
      ok: true,
      // The interface shows this as an "N achievements overdue" note.
      birikim: Math.min(birikim, h.kuyruk.length),
      appid: +appid,
      oyunAdi: h.oyunAdi,
      toplam: h.kuyruk.length,          // to be unlocked (trimmed by the target)
      uygunToplam: h.uygunToplam,       // all of the unlockable ones
      toplamBasarim: h.toplamBasarim,
      acilmis: h.acilmis,
      korumali: h.korumali,
      ultraAtlanan: h.ultraAtlanan,
      sureMs: sure,
      model: sec.model,
      ortalamaAralikMs: h.kuyruk.length ? Math.round(sure / h.kuyruk.length) : 0,
      // Full list: the interface draws the "Açılma Sırası" table from this.
      kuyruk: h.kuyruk.map((a) => ({ name: a.name, rarityPct: a.rarityPct, zaman: a.zaman })),
    };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Start. oyunlar: [appid, ...] - the queue. A single game goes through the same path.
ipcMain.handle('gercekci:start', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const steamID = activeSteamID;
  const s = accounts.get(steamID);
  if (!s) return { ok: false, error: 'Bağlı değil.' };
  if (s.gercekci) return { ok: false, error: 'Zaten çalışıyor.' };
  const motor = s.engine;
  const { appid, saat, sureMs } = arg || {};
  const sec = gercekciSecenekler(arg && arg.secenekler);
  const sure = Math.max(60000, +sureMs || (Math.max(1, +saat || 1) * 3600000));
  const liste = (Array.isArray(arg && arg.oyunlar) && arg.oyunlar.length)
    ? arg.oyunlar.map((x) => +x)
    : [+appid];
  if (!liste.length || !liste[0]) return { ok: false, error: 'Oyun seçilmedi.' };
  try {
    // The queues of ALL games are prepared FIRST: sharing the time can only be done right once every game's
    // achievement count is known, and the error is seen before the first game starts.
    const hazirlanan = {};
    const oyunlar = [];
    for (const id of liste) {
      const h = await gercekciKuyrukHazirla(motor, id, sec);
      // A game that turned out to have no achievements was written to the ledger and is silently dropped - the interface will
      // remove it from the list anyway, there is no point stopping the queue or boosting hours.
      if (!h.ok) continue;
      hazirlanan[id] = h;
      oyunlar.push({ appid: id, name: h.oyunAdi });
    }
    if (!oyunlar.length) return { ok: false, error: 'Seçilen oyunların başarım şeması okunamadı.' };

    // A game with no locked achievement left to unlock is removed from the queue.
    const calisacak = oyunlar.filter((o) => hazirlanan[o.appid].kuyruk.length);
    if (!calisacak.length) return { ok: false, error: 'Seçilen oyunlarda açılabilecek kilitli başarım yok.' };

    const toplamHedef = calisacak.reduce((t, o) => t + hazirlanan[o.appid].kuyruk.length, 0);
    const toplamAdet = calisacak.reduce((t, o) => t + (hazirlanan[o.appid].kuyruk.length || 1), 0);

    // If another start came in during preparation a second job is not opened.
    if (s.gercekci) return { ok: false, error: 'Zaten çalışıyor.' };
    // If it runs at the same time as card farming both write the same game list; so they do not clash.
    if (settings.pauseFarmOnBoost) farmiBeklet(steamID, 'gercekci mod');

    const ilkOyun = calisacak[0];
    const ilkHazir = hazirlanan[ilkOyun.appid];
    const ilkPay = Math.max(60000, Math.round(sure * ((ilkHazir.kuyruk.length || 1) / toplamAdet)));
    const simdi = Date.now();
    motor.play([ilkOyun.appid], 'gercekci');
    const d = {
      oyunlar: calisacak,
      oyunIndeks: 0,
      hazirlanan,
      secenekler: sec,
      toplamHedef,
      toplamAcilan: 0,
      toplamHata: 0,
      ortalamaAralikMs: toplamHedef ? Math.round(sure / toplamHedef) : 0,
      baslangic: simdi,
      bitis: simdi + sure,
      timer: null,
      siradakiZaman: 0,
      aktif: {
        appid: ilkOyun.appid, oyunAdi: ilkOyun.name,
        kuyruk: gercekciZamanlariYerlestir(ilkHazir.kuyruk, ilkPay, sec.model,
                                           gercekciBirikimHesapla(ilkOyun.appid, ilkHazir, sec),
                                           gercekciZamanAyari(ilkOyun.appid, sec)),
        indeks: 0, acilan: 0, hata: 0,
        baslangic: simdi, bitis: simdi + ilkPay,
      },
    };
    s.gercekci = d;
    log('info', '[' + hesapAdi(steamID) + '] realistic mode started: ' + calisacak.length + ' games, ' + toplamHedef + ' achievements, '
      + (sure / 3600000).toFixed(2) + ' saat, model=' + sec.model);
    // The first unlock is not immediate - it is not realistic for an achievement to come the moment the game opens.
    const ilk = ilkHazir.kuyruk.length
      ? gercekciSonrakiGecikme(d)
      : Math.max(0, d.aktif.bitis - Date.now());
    d.siradakiZaman = Date.now() + ilk;
    gercekciBildir(steamID);
    d.timer = setTimeout(() => { if (gercekciDurumu(steamID) === d) gercekciAdim(steamID); }, ilk);
    return { ok: true, toplam: toplamHedef, oyunSayisi: calisacak.length, oyunAdi: ilkOyun.name };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.on('gercekci:stop', () => { if (gercekciDurumu(activeSteamID)) gercekciBitir(activeSteamID, 'kullanici durdurdu'); });

ipcMain.on('engine:boostStart', (_e, { appids, durationMs, games, tumu }) => {
  if (!activeSteamID) return;
  const s = accounts.get(activeSteamID);
  if (s) ayarBeklemeleriniIptalEt(s, 'boost');
  boostBaslat(activeSteamID, { appids, durationMs, games, tumu });
});
ipcMain.on('engine:boostStop', () => {
  if (!activeSteamID) return;
  // When a setting is applied a paused job must not come back a few seconds later after the user stopped it
  const s = accounts.get(activeSteamID);
  if (s) ayarBeklemeleriniIptalEt(s, 'boost');
  boostBitir(activeSteamID, 'kullanici');
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

  const geride = games.filter((g) => (g.playtimeMin || 0) < targetMin);
  const strateji = settings.boostSyncStrategy || 'parallel';

  if (strateji === 'parallel') {
    const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
    const sim = esitlemeSimule(games, targetMin, limit);
    // Also give when each game will finish: the user will see the plan and confirm it.
    const bitisler = [];
    const kalan = new Map(geride.map((g) => [g.appid, (targetMin - (g.playtimeMin || 0)) * 60000]));
    let t = 0;
    for (const as of sim.asamalar) {
      t += as.sureMs;
      as.ids.forEach((id) => {
        const k = kalan.get(id);
        if (k == null) return;
        const yeni = k - as.sureMs;
        if (yeni <= 0) { bitisler.push({ appid: id, bitisMs: t }); kalan.delete(id); }
        else kalan.set(id, yeni);
      });
    }
    return {
      ok: true, strateji: 'parallel', targetMin, totalMs: sim.toplamMs, limit,
      behind: geride.length,
      asamaSayisi: sim.asamalar.length,
      ilkAktif: Math.min(geride.length, limit),
      bitisler: bitisler.sort((a, b) => a.bitisMs - b.bitisMs).map((x) => {
        const g = games.find((y) => y.appid === x.appid);
        return { appid: x.appid, name: (g && g.name) || ('App ' + x.appid), bitisMs: x.bitisMs };
      }),
      steps: [],
    };
  }

  const steps = buildSyncSteps(games, targetMin);
  const totalMs = steps.reduce((s, st) => s + (st.toMin - st.fromMin) * 60000, 0);
  return {
    ok: true, strateji: 'staged', targetMin, totalMs,
    steps: steps.map((st) => ({ count: st.ids.length, ids: st.ids, fromMin: st.fromMin, toMin: st.toMin })),
    behind: geride.length,
  };
});

ipcMain.on('engine:boostStartSeq', (_e, { games, durationMs, loop }) => {
  if (!activeSteamID) return;
  siraliBaslat(activeSteamID, { games, durationMs, loop });
});
ipcMain.on('engine:boostStopSeq', () => {
  const s = accounts.get(activeSteamID);
  if (s && s.farmSaat && s.farmSaat.running) s.farmSaat.stop('kullanici');
});

ipcMain.on('engine:startFarm', (_e, { mode, games, durationMs }) => {
  if (!engineReady || !engine || !activeSteamID) return;
  // The card threshold was REMOVED: every game with cards left joins the queue. The threshold silently skipped games
  // with a single card left and led to the "why is it not dropping" question.
  const s = slotOf(activeSteamID);
  s.bekleyenFarm = null;
  ayarBeklemeleriniIptalEt(s, 'kart');
  kartFarmBaslat(activeSteamID, mode, games || [], durationMs);
});
ipcMain.on('engine:stopFarm', () => {
  const s = accounts.get(activeSteamID);
  if (!s) return;
  s.bekleyenFarm = null;
  ayarBeklemeleriniIptalEt(s, 'kart');
  if (s.farm && s.farm.running) s.farm.stop('kullanici');
});
ipcMain.handle('engine:playing', () => (engineReady && engine) ? engine.playing : []);

// ---- CHAT ----
// All of it goes through the ACTIVE account's engine. The chat of background accounts is not looked at:
// there is a single identity on screen, showing two accounts' conversations in the same list would be confusing.
function sohbetMotoru() {
  if (!engineReady || !engine) return null;
  return engine;
}
ipcMain.handle('chat:friends', async () => {
  const e = sohbetMotoru();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, friends: await e.getFriends() }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:conversations', async () => {
  const e = sohbetMotoru();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, konusmalar: await e.getConversations() }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:history', async (_ev, arg) => {
  const e = sohbetMotoru();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  const { steamid, adet } = arg || {};
  if (!steamid) return { ok: false, error: 'Kişi seçilmedi.' };
  try { return Object.assign({ ok: true }, await e.getChatHistory(steamid, adet)); }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:send', async (_ev, arg) => {
  const e = sohbetMotoru();
  if (!e) return { ok: false, error: 'Bağlı değil.' };
  const { steamid, metin } = arg || {};
  try {
    const r = await e.sendChat(steamid, metin);
    log('info', 'chat: message sent -> ' + steamid);
    return { ok: true, ts: r.ts };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('chat:read', async (_ev, steamid) => {
  const e = sohbetMotoru();
  if (!e) return { ok: false };
  await e.markChatRead(steamid);
  return { ok: true };
});
ipcMain.on('chat:typing', (_ev, steamid) => {
  const e = sohbetMotoru();
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
    let calisan = false;
    accounts.forEach((s) => { if (hesapCalisiyor(s)) calisan = true; });
    if (calisan) { armIdleTimer(); return; }
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
function hesapAyarlariEklenmis(temel) {
  const v = aktifHesapVerisi();
  const cikti = { ...temel };
  HESAP_AYAR_ANAHTARLARI.forEach((k) => { if (k in v) cikti[k] = v[k]; });
  return cikti;
}
ipcMain.handle('settings:get', () => {
  return hesapAyarlariEklenmis(publicSettings());
});
// Handles the settings patch: account specific keys go to the account file, the rest to the settings file.
// Only the keys that REALLY changed are written and applied; the running jobs affected by the change
// are resumed with the new setting. Session fields (persona, steamID, currency) are never written:
// "Geri Al" used to send back the whole settings object and these got into the settings file.
const OTURUM_ALANLARI = ['persona', 'steamID', 'accountCurrency'];
function ayarYamasiniIsle(patch) {
  const gelen = { ...(patch || {}) };
  OTURUM_ALANLARI.forEach((k) => { delete gelen[k]; });
  let hesabaYazildi = false;
  HESAP_AYAR_ANAHTARLARI.forEach((k) => {
    if (k in gelen) {
      aktifHesapVerisi()[k] = gelen[k];
      delete gelen[k];
      hesabaYazildi = true;
    }
  });
  if (hesabaYazildi) hesapVerisiYaz(activeSteamID);
  const degisen = Object.keys(gelen).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(gelen[k]));
  if (!degisen.length) return { ok: true, degisen, uygulanan: [] };
  const eski = settings;
  settings = { ...settings };
  degisen.forEach((k) => { settings[k] = gelen[k]; });
  if (!saveSettings()) {
    settings = eski;
    return { ok: false, degisen: [], uygulanan: [], error: 'Ayar dosyası yazılamadı. Açılışta okunamadığı için korunuyor olabilir.' };
  }
  ayarKayitZamani = Date.now();
  applySettings();
  if (degisen.includes('language')) { ceviri.dilSec(settings.language); tepsiMenusunuKur(); }
  // If the retention period was shortened the extra records are deleted right away (it does not wait for startup).
  if (degisen.includes('dataRetentionDays')) {
    const n = hesapKayitlariniBudama(aktifHesapVerisi());
    if (n) { hesapVerisiYaz(activeSteamID); log('info', 'retention period changed, ' + n + ' records deleted'); }
  }
  const uygulanan = ayarlariIslereUygula(degisen);
  log('info', 'settings saved: ' + degisen.join(', ') + (uygulanan.length ? (' (applied to ' + uygulanan.length + ' jobs)') : ''));
  return { ok: true, degisen, uygulanan };
}
// Instant controls on pages (the Hour Booster switches, "bir daha sorma" in the confirmation window
// and the like) write from here: these are preferences that are applied with a single click anyway.
ipcMain.handle('settings:set', (_e, patch) => {
  ayarYamasiniIsle(patch);
  return hesapAyarlariEklenmis(publicSettings());
});
// The "Kaydet" button of the Settings page. The page keeps changes in a draft, only the changed keys
// come here. The reply also says which jobs will be resumed with the new setting.
ipcMain.handle('settings:kaydet', (_e, patch) => {
  const r = ayarYamasiniIsle(patch);
  return { ...r, settings: hesapAyarlariEklenmis(publicSettings()), kayitZamani: ayarKayitZamani, duraklamaMs: AYAR_DURAKLAMA_MS };
});
// "Varsayılana Sıfırla" no longer writes anything: the defaults are loaded into the page's draft,
// applied if the user presses Kaydet. It used to write instantly and it also pulled the language to Turkish.
ipcMain.handle('settings:varsayilanlar', () => {
  const v = { ...DEFAULT_SETTINGS };
  delete v.ayarSurumu;
  return v;
});
ipcMain.handle('settings:bilgi', () => ({ kayitZamani: ayarKayitZamani }));

// ---- JOBS THAT RUN WHEN A SETTING CHANGES ----
// These settings used to be read once when a job started: the user changed a setting and saved it,
// and nothing changed in the running job. Now a job affected by the change stops for AYAR_DURAKLAMA_MS,
// then continues where it left off with the new setting: in card farming the position and the game's elapsed
// time, in hour boosting the start moment is kept. Those that do not need a pause (the sync
// limit, shuffling in sequential mode) change instantly.
const AYAR_DURAKLAMA_MS = 5000;
const KART_IS_AYARLARI = ['cardMaxGames', 'farmMaxMinutes', 'autoNextGame', 'fastMinPlaytimeMin', 'fastRotateMinSec', 'fastRotateMaxSec'];
function ayarBeklemeleriniIptalEt(s, tur) {
  if (!s || !s.ayarBekleme) return;
  Object.keys(s.ayarBekleme).forEach((k) => {
    if (tur && k !== tur) return;
    if (s.ayarBekleme[k]) clearTimeout(s.ayarBekleme[k]);
    delete s.ayarBekleme[k];
  });
}
function ayarBeklemesiKur(s, tur, fn) {
  s.ayarBekleme = s.ayarBekleme || {};
  if (s.ayarBekleme[tur]) clearTimeout(s.ayarBekleme[tur]);
  s.ayarBekleme[tur] = setTimeout(() => { delete s.ayarBekleme[tur]; fn(); }, AYAR_DURAKLAMA_MS);
}
function kartFarminiAyarlaSurdur(steamID, degisen) {
  const s = accounts.get(steamID);
  if (!s || !s.farm || !s.farm.running) return false;
  const konum = s.farm.konum();
  const mode = s.farm.mode;
  const games = s.farm.games.map((g) => ({ ...g }));
  // If "Oyun başına süre" changed the new time, if not the time selected on the Kart Düşür page.
  const dk = +settings.farmMaxMinutes;
  const sure = degisen.has('farmMaxMinutes') && dk > 0 ? dk * 60000 : s.farm.durationMs;
  s.farm.stop('ayar');
  ayarBeklemesiKur(s, 'kart', () => {
    const x = accounts.get(steamID);
    if (!x || (x.farm && x.farm.running)) return;          // it was started by hand in the meantime
    if (!x.ready || !x.engine) {
      // No connection: the job should not be lost, it is kept as if it will be resumed when the connection returns / boosting ends
      x.bekleyenFarm = { mode, games, durationMs: sure, konum };
      return;
    }
    kartFarmBaslat(steamID, mode, games, sure, { devam: konum });
  });
  return true;
}
function boostuAyarlaSurdur(steamID) {
  const s = accounts.get(steamID);
  const b = s && s.boost;
  if (!b || !b.calisiyor || b.sync || !b.istek) return false;
  const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
  const tumu = b.istek.tumu || b.istek.games || (b.istek.appids || []).map((appid) => ({ appid }));
  const yeni = tumu.slice(0, limit);
  const yeniIds = yeni.map((g) => g.appid);
  if (yeniIds.join(',') === (b.appids || []).join(',')) return false;
  const istek = { ...b.istek, appids: yeniIds, games: yeni, devam: { baslangic: b.baslangic } };
  boostBitir(steamID, 'ayar', true);
  ayarBeklemesiKur(s, 'boost', () => {
    const x = accounts.get(steamID);
    if (!x || (x.boost && x.boost.calisiyor)) return;
    if (!x.ready || !x.engine) { farmiSurdur(steamID); return; }
    boostBaslat(steamID, istek);
  });
  return true;
}
function ayarlariIslereUygula(degisen) {
  const d = new Set(degisen || []);
  const ozet = [];
  if (!d.size) return ozet;
  accounts.forEach((s, steamID) => {
    if (!s) return;
    const hesap = hesapAdi(steamID);
    if (s.farm && s.farm.running && KART_IS_AYARLARI.some((k) => d.has(k))) {
      if (kartFarminiAyarlaSurdur(steamID, d)) ozet.push({ steamID, hesap, is: 'kart', nasil: 'duraklatildi' });
    }
    const b = s.boost;
    if (b && b.calisiyor && d.has('boostMaxGames')) {
      if (b.sync && b.sync.strateji === 'parallel') {
        b.sync.limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
        if (b.syncTimer) { clearTimeout(b.syncTimer); b.syncTimer = null; }
        esitlemePlanla(steamID);
        ozet.push({ steamID, hesap, is: 'saat', nasil: 'aninda' });
      } else if (boostuAyarlaSurdur(steamID)) {
        ozet.push({ steamID, hesap, is: 'saat', nasil: 'duraklatildi' });
      }
    }
    // In sequential idling shuffling takes effect on the next round; no need to pause.
    if (s.farmSaat && s.farmSaat.running && d.has('shuffleBoost')) {
      s.farmSaat.karistir = !!settings.shuffleBoost;
      s.farmSaat.opts = { ...(s.farmSaat.opts || {}), karistir: s.farmSaat.karistir };
      ozet.push({ steamID, hesap, is: 'sirali', nasil: 'aninda' });
    }
    if (d.has('pauseFarmOnBoost')) {
      if (settings.pauseFarmOnBoost && (hesapBoostCalisiyor(s) || s.gercekci) && s.farm && s.farm.running) {
        if (farmiBeklet(steamID, 'ayar: saat yukseltirken duraklat')) ozet.push({ steamID, hesap, is: 'kart', nasil: 'bekletildi' });
      } else if (!settings.pauseFarmOnBoost && s.bekleyenFarm && !s.gercekci) {
        farmiSurdur(steamID, true);
        ozet.push({ steamID, hesap, is: 'kart', nasil: 'surduruldu' });
      }
    }
  });
  return ozet;
}
ipcMain.handle('settings:clearPriceCache', () => {
  ['', '.bak', '.bozuk', '.tmp'].forEach((ek) => {
    try { fs.unlinkSync(PRICE_FILE + ek); } catch (_) {}
    try { fs.unlinkSync(HISTORY_FILE + ek); } catch (_) {}
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
const YEDEK_HESAP_ALANLARI = ['boostGameIds', 'grQueue', 'grPresets'];
function exportPayload() {
  const out = {};
  Object.keys(settings).forEach((k) => { if (!EXPORT_SKIP.includes(k)) out[k] = settings[k]; });
  const hesaplar = {};
  loadAccounts().forEach((a) => {
    const v = hesapVerisi(a.steamID);
    const h = { stats: v.stats || null };
    YEDEK_HESAP_ALANLARI.forEach((k) => { h[k] = Array.isArray(v[k]) ? v[k] : []; });
    hesaplar[a.steamID] = h;
  });
  return {
    app: 'SteamEdge',
    format: 2,
    version: app.getVersion(),
    exportedAt: new Date().toISOString(),
    settings: out,
    hesaplar,
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
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Both the new ({app,settings,stats}) and the old (plain settings object) formats are accepted.
    const incoming = (obj && obj.settings && typeof obj.settings === 'object') ? obj.settings : obj;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, error: 'Dosya bir SteamEdge yedeği değil.' };
    }
    // A backup from an old version is accepted too: removed/merged settings are carried over first.
    const gecici = { ...incoming };
    ayarlariGecir(gecici);
    // Unknown keys are dropped; session fields are kept (they do not come from the backup).
    const clean = {};
    Object.keys(DEFAULT_SETTINGS).forEach((k) => {
      if (EXPORT_SKIP.includes(k)) return;
      if (Object.prototype.hasOwnProperty.call(gecici, k)) clean[k] = gecici[k];
    });
    const applied = Object.keys(clean).length;
    if (!applied) return { ok: false, error: 'Dosyada tanınan hiçbir ayar yok.' };
    const eski = settings;
    settings = { ...DEFAULT_SETTINGS, ...clean };
    const degisen = Object.keys(settings).filter((k) => JSON.stringify(eski[k]) !== JSON.stringify(settings[k]));
    if (!saveSettings()) { settings = eski; return { ok: false, error: 'Ayar dosyası yazılamadı.' }; }
    ayarKayitZamani = Date.now();
    applySettings();
    if (degisen.includes('language')) { ceviri.dilSec(settings.language); tepsiMenusunuKur(); }
    ayarlariIslereUygula(degisen);
    // Account data: restored only to accounts saved on this computer.
    let hesapSayisi = 0;
    const kayitli = new Set(loadAccounts().map((a) => a.steamID));
    if (obj && obj.hesaplar && typeof obj.hesaplar === 'object') {
      Object.keys(obj.hesaplar).forEach((sid) => {
        if (!kayitli.has(sid)) return;
        const h = obj.hesaplar[sid] || {};
        const v = hesapVerisi(sid);
        if (h.stats && typeof h.stats === 'object') v.stats = { ...DEFAULT_STATS, ...h.stats };
        YEDEK_HESAP_ALANLARI.forEach((k) => { if (Array.isArray(h[k])) v[k] = h[k]; });
        hesapVerisiYaz(sid);
        hesapSayisi++;
      });
    } else if (obj && obj.stats && typeof obj.stats === 'object' && activeSteamID) {
      // Old format (format 1): a single statistics object, written to the account on screen.
      aktifHesapVerisi().stats = { ...DEFAULT_STATS, ...obj.stats };
      hesapVerisiYaz(activeSteamID);
      hesapSayisi = 1;
    }
    if (activeSteamID) sendRaw('stats:degisti', istatistikGorunumu(activeSteamID));
    log('info', 'settings imported (' + applied + ' keys, ' + hesapSayisi + ' accounts): ' + file);
    return { ok: true, applied, hesapSayisi, settings: hesapAyarlariEklenmis(publicSettings()), file };
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
    ['', '.bak', '.bozuk', '.tmp'].forEach((ek) => {
      try { fs.unlinkSync(path.join(CONFIG_DIR, f + ek)); } catch (_) {}
    });
  });
  // All of the per-account stores
  try { fs.rmSync(HESAP_DIZINI, { recursive: true, force: true }); } catch (_) {}
  hesapVerileri.clear(); bozukDosyalar.clear();
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
let guncellemeSonDurum = null;    // the result of the last check
let guncellemeCalisiyor = false;

async function guncellemeKontrolEt(elle) {
  // Two checks must not run at the same time: the user can press the button while the startup check is running.
  if (guncellemeCalisiyor) return guncellemeSonDurum || { ok: false, hata: 'Kontrol zaten sürüyor.' };
  guncellemeCalisiyor = true;
  try {
    const sonuc = await guncelleme.kontrolEt(app.getVersion());
    guncellemeSonDurum = { ...sonuc, ts: Date.now(), elle: !!elle };
    log(sonuc.ok ? 'info' : 'warn', 'update check: '
      + (sonuc.ok ? (sonuc.guncelMi ? 'guncel (' + sonuc.kurulu + ')' : 'yeni surum ' + sonuc.son) : sonuc.hata));
    sendRaw('guncelleme:durum', guncellemeSonDurum);
    return guncellemeSonDurum;
  } finally {
    guncellemeCalisiyor = false;
  }
}

// The single check at startup. Delayed 15 seconds so the window and the Steam session can settle.
function acilisGuncellemeKontrolu() {
  setTimeout(() => { guncellemeKontrolEt(false).catch(() => {}); }, 15000);
}

ipcMain.handle('guncelleme:kontrol', () => guncellemeKontrolEt(true));
ipcMain.handle('guncelleme:sonDurum', () => guncellemeSonDurum);
// The app's real memory use, process by process. So that the answer to "how much RAM does it eat" is not a guess
// Ayarlar > Gelişmiş shows this live. Electron runs multi process: five separate SteamEdge
// rows show up in Task Manager, the user had to add them up one by one.
// tek tek toplamasi gerekiyordu.
ipcMain.handle('app:bellek', () => {
  const olcumler = app.getAppMetrics();
  const surecler = olcumler.map((p) => ({
    tur: p.type,
    kb: (p.memory && (p.memory.privateBytes || p.memory.workingSetSize)) || 0,
  }));
  return {
    toplamKb: surecler.reduce((t, p) => t + p.kb, 0),
    surecler,
    gpuAcik: settings.hwAccel !== false,
  };
});
// Empty the image and network cache. NO loss of settings, session or data - only things that can be
// downloaded again go. The most direct way to win memory back in long sessions.
ipcMain.handle('app:bellekTemizle', async () => {
  const once = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
  try {
    await session.defaultSession.clearCache();
    if (win && !win.isDestroyed()) win.webContents.session.clearCodeCaches({ urls: [] });
  } catch (e) { return { ok: false, error: e.message }; }
  await new Promise((r) => setTimeout(r, 600));
  const sonra = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
  log('info', 'cache cleared: ' + Math.round((once - sonra) / 1024) + ' MB');
  return { ok: true, kazancKb: Math.max(0, once - sonra) };
});

ipcMain.handle('app:bilgi', () => ({
  surum: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  paketli: app.isPackaged,
}));

app.on('before-quit', () => {
  isQuitting = true;
  // Let the last minute of running jobs and the pending account writes land on disk.
  accounts.forEach((s, id) => { try { istatistikSaati(id); } catch (_) {} });
  bekleyenYazimlariBosalt();
});
// If a data file could not be read at startup TELL the user. It used to silently fall back to the default,
// then the first change wrote over the intact file; the user could never learn
// why their settings were gone.
function okumaHatalariniBildir() {
  if (!okumaHatalari.length) return;
  const kurtarilan = okumaHatalari.filter((h) => h.kurtarildi).map((h) => h.ad);
  const kayip = okumaHatalari.filter((h) => !h.kurtarildi).map((h) => h.ad);
  let govde = '';
  if (kurtarilan.length) {
    govde += ct('Şu dosyalar bozuktu ve yedekten kurtarıldı:') + '\n  ' + kurtarilan.map(ct).join('\n  ') + '\n\n';
  }
  if (kayip.length) {
    govde += ct('Şu dosyalar okunamadı ve yedekleri de yoktu:') + '\n  ' + kayip.map(ct).join('\n  ')
      + '\n\n' + ct('Bu veriler varsayılana döndürüldü. Bozuk dosyalar ".bozuk" uzantısıyla settings klasöründe duruyor, üzerlerine yazılmadı.')
      + '\n\n' + ct('Bunun sebebi genellikle uygulama kayıt yaparken bilgisayarın kapanmasıdır.');
  }
  try {
    dialog.showMessageBox(win || null, {
      type: kayip.length ? 'warning' : 'info',
      title: 'SteamEdge - ' + ct('veri dosyaları'),
      message: kayip.length ? ct('Bazı ayarlar okunamadı') : ct('Ayarlar yedekten kurtarıldı'),
      detail: govde.trim(),
      buttons: [ct('Tamam')],
    });
  } catch (_) {}
  okumaHatalari.length = 0;
}

// Open the Steam session WITHOUT WAITING FOR THE INTERFACE.
// The logon used to start when the interface had loaded and the first page called `engine:connect`: first
// the HTML/CSS/JS loaded, then the connection was made and the two times stacked on top of each other.
// But the session info is ready on disk. When started here the connection makes progress while the interface is
// drawn; when the pages call `engine:connect` it is either ready or they share the same
// ongoing operation (connectAccount > s.connecting).
function erkenBaglan() {
  const sess = hasSession();
  if (!sess) return;
  if (!activeSteamID) { activeSteamID = sess.steamID; hesapVerisiGecisi(); }
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
function kurulumTutarliMi() {
  if (!app.isPackaged) return { ok: true };
  try {
    const yol = path.join(path.dirname(app.getPath('exe')), 'version');
    if (!fs.existsSync(yol)) return { ok: true };          // if the file is not there make no comment
    const dosyaSurum = fs.readFileSync(yol, 'utf8').trim();
    const calisan = process.versions.electron;
    if (dosyaSurum && calisan && dosyaSurum !== calisan) {
      return { ok: false, dosyaSurum, calisan };
    }
  } catch (_) {}
  return { ok: true };
}

app.whenReady().then(() => {
  const kurulum = kurulumTutarliMi();
  if (!kurulum.ok) {
    log('error', 'mixed installation: version=' + kurulum.dosyaSurum + ' running=' + kurulum.calisan);
    // The settings have not loaded yet; the language comes from the early setting read before the window opened.
    ceviri.dilSec((erkenAyarlar && erkenAyarlar.language) || 'tr');
    try {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'SteamEdge - ' + ct('kurulum bozuk'),
        message: ct('Bu klasörde iki farklı sürümün dosyaları karışmış'),
        detail: ceviri.tf('Klasördeki bazı dosyalar eski sürümden kalmış (beklenen #, bulunan #).', kurulum.calisan, kurulum.dosyaSurum) + '\n\n'
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
  setTimeout(okumaHatalariniBildir, 1200);
  acilisGuncellemeKontrolu();
  erkenBaglan();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !settings.closeToTray) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
