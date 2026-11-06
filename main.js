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

// The hwAccel setting (off by default since settings version 6) has to take effect BEFORE app.whenReady() -
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
  // The graphics card is left alone unless the user turned acceleration on (in a settings file of version 6 or later): with it on, a card running an undervolt or an
  // overclock at its limit froze for 3 to 5 seconds when the window drew, and with it off SteamEdge no longer shows up as a graphics process at all.
  const keepHwAccel = !!early && early.hwAccel === true && (+early.settingsVersion || 1) >= 6;
  if (!keepHwAccel) app.disableHardwareAcceleration();

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
const DEFAULT_SETTINGS = require('./src/core/settingsDefaults');
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
// The moment the settings were last saved by the user (Settings > Configuration > Last saved).
let settingSaveTime = null;
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

let activeSteamID = null;
let engine = null;
let engineReady = false;
let farm = null;
let farmHours = null;

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
// ================== PERSISTENT STATE STORE (state.json) ==================
// Unlike the settings, the "remembered" data lives here: selected games, the last
// viewed game, the achievement unlock log. Each record is timestamped; those older than the period in the
// `dataRetentionDays` setting are cleaned at startup and on every write (0 = keep forever).
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const DEFAULT_STATE = { entries: {}, achLog: [] };
let appState = { ...DEFAULT_STATE };

const { accounts, applyActiveProxy, connectAccount, disconnectAll, syncActive } = require('./src/backend/accounts')({ CONFIG_DIR, JSON_SIDE_FILES, NOTIF_ICON, Notification, authSlots, ct, fs, hasSession, ipcMain, loadAccounts, log, makeActiveSession, parseProxy, path, saveAccounts, sendRaw, session, setActiveProxy, startLocalProxy, steamEngineClass, windowOpened, get accountData() { return accountData; }, get accountDataAll() { return accountDataAll; }, get accountDataMigration() { return accountDataMigration; }, get accountFile() { return accountFile; }, get accountJobDetail() { return accountJobDetail; }, get accountJobKinds() { return accountJobKinds; }, get accountRunning() { return accountRunning; }, get activeSteamID() { return activeSteamID; }, set activeSteamID(v) { activeSteamID = v; }, get addingAccountMode() { return addingAccountMode; }, set addingAccountMode(v) { addingAccountMode = v; }, get applyChatSettings() { return applyChatSettings; }, get bindConnectionState() { return bindConnectionState; }, get engine() { return engine; }, set engine(v) { engine = v; }, get engineReady() { return engineReady; }, set engineReady(v) { engineReady = v; }, get enterLoginWindow() { return enterLoginWindow; }, get farm() { return farm; }, set farm(v) { farm = v; }, get farmHours() { return farmHours; }, set farmHours(v) { farmHours = v; }, get flushPendingWrites() { return flushPendingWrites; }, get hideNameOf() { return hideNameOf; }, get isQuietHour() { return isQuietHour; }, get pendingWrite() { return pendingWrite; }, get personaOf() { return personaOf; }, get reconnectLimit() { return reconnectLimit; }, get resumeAfterConnect() { return resumeAfterConnect; }, get resumeKeyQueue() { return resumeKeyQueue; }, get resumeStore() { return resumeStore; }, get sendJobStatus() { return sendJobStatus; }, get settings() { return settings; }, get slotOf() { return slotOf; }, get statsView() { return statsView; }, get stopAccountJobs() { return stopAccountJobs; }, get win() { return win; } });
const { refundableAppIds, storeLists } = require('./src/backend/inventory')({ accounts, app, ct, dialog, fs, inventorySources, ipcMain, log, os, path, steamFee, toCsv, get accountData() { return accountData; }, get accountName() { return accountName; }, get activeAccountData() { return activeAccountData; }, get activeSteamID() { return activeSteamID; }, get addStat() { return addStat; }, get engine() { return engine; }, get engineReady() { return engineReady; }, get marketGate() { return marketGate; }, get settingFor() { return settingFor; }, get win() { return win; }, get withTimeout() { return withTimeout; }, get writeAccountData() { return writeAccountData; }, get writeAccountDataDelayed() { return writeAccountDataDelayed; } });
const { loadState, loadStats, pruneAccountRecords, statsView } = require('./src/backend/statsstate')({ DEFAULT_STATS, STATE_FILE, STATS_FILE, accounts, ipcMain, log, readErrors, readJson, sendRaw, writeJson, get accountData() { return accountData; }, get accountRunning() { return accountRunning; }, get activeAccountData() { return activeAccountData; }, get activeSteamID() { return activeSteamID; }, get appState() { return appState; }, set appState(v) { appState = v; }, get lifeStats() { return lifeStats; }, set lifeStats(v) { lifeStats = v; }, get settings() { return settings; }, get statsHour() { return statsHour; }, get writeAccountData() { return writeAccountData; }, get writeAccountDataDelayed() { return writeAccountDataDelayed; } });
const { accountBoostRunning, accountBroadcast, accountEvent, accountJobDetail, accountJobKinds, accountName, accountRunning, addFeed, addStat, bindConnectionState, dayKey, delayFarm, earning, resumeFarm, sendJobStatus, slotOf, startCardFarm, statsHour, stopAccountJobs } = require('./src/backend/accountjobs')({ DEFAULT_STATS, FarmController, accounts, app, ipcMain, log, logger, sendRaw, statsView, storeLists, syncActive, get accountData() { return accountData; }, get activeSteamID() { return activeSteamID; }, get boostStart() { return boostStart; }, get boostStopAccount() { return boostStopAccount; }, get cancelSettingWaits() { return cancelSettingWaits; }, get engineReady() { return engineReady; }, set engineReady(v) { engineReady = v; }, get holdCounters() { return holdCounters; }, get isQuitting() { return isQuitting; }, set isQuitting(v) { isQuitting = v; }, get keyChanged() { return keyChanged; }, get realisticFinish() { return realisticFinish; }, get resumeAfterConnect() { return resumeAfterConnect; }, get resumeKeyQueue() { return resumeKeyQueue; }, get resumeSaveSoon() { return resumeSaveSoon; }, get settingFor() { return settingFor; }, get stopKeyRun() { return stopKeyRun; }, get syncConnectionChanged() { return syncConnectionChanged; }, get updateSleepBlocker() { return updateSleepBlocker; }, get writeAccountDataDelayed() { return writeAccountDataDelayed; } });
const { ACCOUNT_DIR, ACCOUNT_SCOPED, ACCOUNT_SCOPED_SETTINGS, ACCOUNT_SETTING_KEYS, accountData, accountDataAll, accountDataMigration, accountFile, activeAccountData, applyPersona, cleanAppIds, flushPendingWrites, hideNameOf, pendingWrite, personaFromOfflineMode, personaName, personaOf, settingFor, writeAccountData, writeAccountDataDelayed } = require('./src/backend/accountdata')({ ACCOUNTS_FILE, CONFIG_DIR, accountName, accounts, log, openToken, path, readErrors, readJson, sealIfEnabled, writeJson, get activeSteamID() { return activeSteamID; }, get appState() { return appState; }, get lifeStats() { return lifeStats; }, get saveSettings() { return saveSettings; }, get settings() { return settings; } });
const { applyFitZoom, createWindow, ensureTray, enterLoginWindow, onPanelPage, setupTrayMenu, showWindow } = require('./src/backend/mainwindow')({ BrowserWindow, CONFIG_DIR, Menu, Tray, accountName, app, authSlots, ct, disconnectAll, fs, getAuthSlot, hasSession, ipcMain, log, nativeImage, path, screen, windowFit, windowOpened, get addingAccountMode() { return addingAccountMode; }, set addingAccountMode(v) { addingAccountMode = v; }, get applySettingPatch() { return applySettingPatch; }, get isQuitting() { return isQuitting; }, set isQuitting(v) { isQuitting = v; }, get maximizeOnShow() { return maximizeOnShow; }, set maximizeOnShow(v) { maximizeOnShow = v; }, get resolveWindowOpened() { return resolveWindowOpened; }, get resumeSave() { return resumeSave; }, get settings() { return settings; }, get startHidden() { return startHidden; }, set startHidden(v) { startHidden = v; }, get tray() { return tray; }, set tray(v) { tray = v; }, get trayHasIcon() { return trayHasIcon; }, set trayHasIcon(v) { trayHasIcon = v; }, get win() { return win; }, set win(v) { win = v; } });
const { applyChatSettings, applySettings, isQuietHour, loadSettings, migrateSettings, reconnectLimit, saveSettings, updateSleepBlocker } = require('./src/backend/settingsstore')({ DEFAULT_SETTINGS, OLD_SETTING_VALUES, SETTINGS_FILE, START_HIDDEN_ARG, accountRunning, accounts, app, applyFitZoom, ct, fs, hideNameOf, personaFromOfflineMode, personaOf, powerSaveBlocker, readErrors, readJson, translation, writeJson, get armIdleTimer() { return armIdleTimer; }, get psbId() { return psbId; }, set psbId(v) { psbId = v; }, get settingSaveTime() { return settingSaveTime; }, set settingSaveTime(v) { settingSaveTime = v; }, get settings() { return settings; }, set settings(v) { settings = v; } });
const { HISTORY_FILE, PRICE_FILE, currentPriceCurrency, loadHistoryCache, loadPriceCache, marketGate, resetMarketCaches, withTimeout } = require('./src/backend/market')({ CACHE_DIR, ct, ipcMain, log, path, readJson, sendRaw, writeJson, get engine() { return engine; }, get engineReady() { return engineReady; }, get settings() { return settings; } });
const { keyChanged, resumeKeyQueue, stopKeyRun } = require('./src/backend/keys')({ accountData, accountEvent, accountName, accounts, ipcMain, log, sendRaw, writeAccountData, writeAccountDataDelayed, get activeSteamID() { return activeSteamID; }, get settings() { return settings; } });
const { applyParentalPin } = require('./src/backend/family')({ accountData, accountName, accounts, ipcMain, log, shell, storeLists, get engine() { return engine; }, get engineReady() { return engineReady; } });
const { SYNC_MAX_GAMES, boostFinish, boostStart, boostStopAccount, buildSyncSteps, holdCounters, simulateSync, startSequential, syncConnectionChanged } = require('./src/backend/hours')({ FarmController, accountBroadcast, accountEvent, accountName, accounts, delayFarm, earning, ledger, log, resumeFarm, settingFor, statsHour });
const { realisticFinish, realisticStartFor } = require('./src/backend/realistic')({ CACHE_DIR, SYNC_MAX_GAMES, accountBroadcast, accountData, accountEvent, accountName, accounts, activeAccountData, addFeed, boostFinish, boostStart, buildSyncSteps, delayFarm, ipcMain, log, path, readJson, resumeFarm, saveSettings, settingFor, simulateSync, slotOf, startCardFarm, startSequential, writeAccountDataDelayed, writeJson, get activeSteamID() { return activeSteamID; }, get cancelSettingWaits() { return cancelSettingWaits; }, get engine() { return engine; }, get engineReady() { return engineReady; }, get settings() { return settings; } });
require('./src/backend/chat')({ ipcMain, log, get engine() { return engine; }, get engineReady() { return engineReady; } });
const { armIdleTimer } = require('./src/backend/session')({ CONFIG_DIR, accountRunning, accounts, disconnectAll, enterLoginWindow, fs, ipcMain, log, path, get settings() { return settings; }, get win() { return win; } });
const { accountSettingsAdded, applySettingPatch, applySettingsToJobs, cancelSettingWaits, publicSettings } = require('./src/backend/settingsipc')({ ACCOUNT_SCOPED, ACCOUNT_SCOPED_SETTINGS, ACCOUNT_SETTING_KEYS, DATA_ROOT, DEFAULT_SETTINGS, HISTORY_FILE, JSON_SIDE_FILES, PRICE_FILE, accountBoostRunning, accountData, accountName, accounts, activeAccountData, applyActiveProxy, applyParentalPin, applyPersona, applySettings, boostFinish, boostStart, cleanAppIds, currentPriceCurrency, delayFarm, fs, hideNameOf, ipcMain, log, parseProxy, personaName, personaOf, pruneAccountRecords, resetMarketCaches, resumeFarm, rewriteTokenFiles, saveSettings, settingFor, setupTrayMenu, shell, startCardFarm, tokenProtectionAvailable, translation, windowFit, writeAccountData, get activeSteamID() { return activeSteamID; }, get engine() { return engine; }, get resumeSaveSoon() { return resumeSaveSoon; }, get settingSaveTime() { return settingSaveTime; }, set settingSaveTime(v) { settingSaveTime = v; }, get settings() { return settings; }, set settings(v) { settings = v; } });
require('./src/backend/backup')({ ACCOUNT_DIR, ACCOUNT_SCOPED, CACHE_DIR, CONFIG_DIR, DEFAULT_SETTINGS, DEFAULT_STATS, JSON_SIDE_FILES, accountData, accountDataAll, accountSettingsAdded, activeAccountData, app, applySettings, applySettingsToJobs, authSlots, corruptFiles, ct, dialog, disconnectAll, enterLoginWindow, fs, ipcMain, loadAccounts, log, logger, migrateKeys, migrateSettings, path, publicSettings, resetMarketCaches, saveSettings, sendRaw, setupTrayMenu, statsView, translation, writeAccountData, get activeSteamID() { return activeSteamID; }, set activeSteamID(v) { activeSteamID = v; }, get addingAccountMode() { return addingAccountMode; }, set addingAccountMode(v) { addingAccountMode = v; }, get lifeStats() { return lifeStats; }, set lifeStats(v) { lifeStats = v; }, get resumeStore() { return resumeStore; }, get settingSaveTime() { return settingSaveTime; }, set settingSaveTime(v) { settingSaveTime = v; }, get settings() { return settings; }, set settings(v) { settings = v; }, get win() { return win; } });
const { earlyConnect, isSetupConsistent, reportReadErrors, startupUpdateCheck } = require('./src/backend/update')({ accountDataMigration, accounts, app, connectAccount, ct, dialog, flushPendingWrites, fs, hasSession, ipcMain, loadAccounts, log, logger, path, readErrors, sendRaw, session, statsHour, syncActive, update, get activeSteamID() { return activeSteamID; }, set activeSteamID(v) { activeSteamID = v; }, get isQuitting() { return isQuitting; }, set isQuitting(v) { isQuitting = v; }, get resumeSave() { return resumeSave; }, get settings() { return settings; }, get win() { return win; } });
const { resumeAfterConnect, resumeSave, resumeSaveSoon, resumeStartUp, resumeStore } = require('./src/backend/resume')({ CONFIG_DIR, accountEvent, accountJobDetail, accountName, accountRunning, accounts, boostStart, ct, fs, log, onPanelPage, path, realisticStartFor, resumeJobs, sendJobStatus, startCardFarm, startSequential, translation, windowOpened, writeJson, get activeSteamID() { return activeSteamID; }, get settings() { return settings; }, get win() { return win; } });
require('./src/backend/schedule')({ BrowserWindow, accountData, accountEvent, accountName, accountRunning, accounts, app, applySettings, createWindow, ct, dayKey, dialog, earlyConnect, ensureTray, isSetupConsistent, loadHistoryCache, loadPriceCache, loadSettings, loadState, loadStats, log, logger, powerMonitor, realisticFinish, realisticStartFor, refundableAppIds, reportReadErrors, resumeStartUp, rewriteTokenFiles, settingFor, singleInstance, startCardFarm, startupUpdateCheck, translation, get earlySettings() { return earlySettings; }, get settings() { return settings; } });
