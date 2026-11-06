// Moved out of main.js unchanged (the settings file: the migrations of old formats, load and save, and what a change does to the app: sleep blocker, login item,
// reconnect limit, quiet hours, chat auto reply). Everything it needs from main.js arrives through `ctx`; the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { DEFAULT_SETTINGS, OLD_SETTING_VALUES, SETTINGS_FILE, START_HIDDEN_ARG, accountRunning, accounts, app, applyFitZoom, ct, fs, hideNameOf, personaFromOfflineMode, personaOf, powerSaveBlocker, readErrors, readJson, translation, writeJson } = ctx;

  // ---- SETTINGS MIGRATIONS ----
  // Removed and merged settings are carried over from the old file to here: the user's old choice
  // is not lost, and no dead key is left in the file. settingsVersion is raised once.
  const REMOVED_SETTINGS = ['autoReconnect', 'farmRetry', 'twoStepSell', 'autoStopBoost', 'dontAsk_achSingle', 'debugLogs', 'offlineMode', 'grShowNoAch', 'compactRows', 'farmSilent', 'autoRefreshPrices', 'priceRefreshMin'];
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
    // Hardware acceleration is off by default now (see the early settings read at the top): a file written before that follows the new default once.
    if ((+v.settingsVersion || 1) < 6) {
      v.hwAccel = false;
      v.settingsVersion = 6;
      hasChanged = true;
    }
    // Values renamed from Turkish (the old names are in src/core/keyMigration.js)
    Object.entries(OLD_SETTING_VALUES).forEach(([k, names]) => {
      if (typeof v[k] === 'string' && Object.prototype.hasOwnProperty.call(names, v[k])) { v[k] = names[v[k]]; hasChanged = true; }
    });
    // "Compact rows" is the interface density now
    if (v.compactRows === true && (!v.density || v.density === 'auto')) v.density = 'compact';
    // The fast mode now moves to another game every 10-15 s (it was 90-120 s)
    if (v.fastRotateMinSec === 90 && v.fastRotateMaxSec === 120) { v.fastRotateMinSec = 10; v.fastRotateMaxSec = 15; hasChanged = true; }
    // The next batch of a sale always starts by itself now: 0 used to mean "ask after every batch"
    if (+v.sellBatchWaitMin <= 0) { v.sellBatchWaitMin = 5; hasChanged = true; }
    REMOVED_SETTINGS.forEach((k) => { if (k in v) { delete v[k]; hasChanged = true; } });
    return hasChanged;
  }

  function loadSettings() {
    const r = readJson(SETTINGS_FILE);
    if (r.ok) {
      const rawText = { ...r.dataBlock };
      const wasInvisible = rawText.offlineMode === true;
      const hasPassed = migrateSettings(rawText);
      ctx.settings = { ...DEFAULT_SETTINGS, ...rawText };
      if (r.fromBackup) readErrors.push({ displayName: 'Ayarlar', recoveredFlag: true });
      if (hasPassed) saveSettings();
      if (wasInvisible) personaFromOfflineMode();
      try { ctx.settingSaveTime = fs.statSync(SETTINGS_FILE).mtimeMs; } catch (_) {}
    } else {
      ctx.settings = { ...DEFAULT_SETTINGS };
      // none = first run, normal: the welcome window will ask. corrupt = a real problem, tell the user.
      if (r.none) ctx.settings.setupDone = false;
      if (r.corrupt) readErrors.push({ displayName: 'Ayarlar', recoveredFlag: false });
    }
    translation.pickLang(ctx.settings.language);
  }
  // Returns false if it fails: if the file could not be read (broken) writing is deliberately blocked and "Save"
  // must tell the user so, not say "saved".
  function saveSettings() { return writeJson(SETTINGS_FILE, ctx.settings, true); }
  // "Uyku modunu engelle": only while a job runs on an account. Previously when the setting was on the
  // computer never slept even if the app was doing nothing.
  function updateSleepBlocker() {
    let runningItem = false;
    accounts.forEach((s) => { if (accountRunning(s)) runningItem = true; });
    const keepAwake = !!ctx.settings.preventSleep && runningItem;
    try {
      if (keepAwake && ctx.psbId === null) ctx.psbId = powerSaveBlocker.start('prevent-app-suspension');
      else if (!keepAwake && ctx.psbId !== null) { powerSaveBlocker.stop(ctx.psbId); ctx.psbId = null; }
    } catch (_) {}
  }
  // "Reconnect if the connection drops". null = unlimited, 0 = off, n = at most n attempts.
  function reconnectLimit() {
    const v = ctx.settings.reconnectPolicy;
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
      if (ctx.settings.autoLaunch) { app.setLoginItemSettings({ openAtLogin: true, args: ctx.settings.startInTray ? [START_HIDDEN_ARG] : [] }); return; }
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
    accounts.forEach((s, id) => { try { if (s.ready && s.engine) s.engine.applyPrivacy(personaOf(id), hideNameOf(id)); } catch (_) {} });
    // Chat auto reply - applied to ALL connected accounts
    accounts.forEach((s) => { if (s.engine) applyChatSettings(s.engine); });
    if (typeof ctx.armIdleTimer === 'function') ctx.armIdleTimer();
  }

  // Notifications sent from the main process also follow the same rule as the interface: the master switch, the type's own
  // switch and quiet hours. The chat notification used to look only at its own switch.
  function isQuietHour() {
    if (!ctx.settings.quietHoursEnabled) return false;
    const [fh, fm] = String(ctx.settings.quietFrom || '23:00').split(':').map(Number);
    const [th, tm] = String(ctx.settings.quietTo || '08:00').split(':').map(Number);
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
      const text = ctx.settings.chatReplyText === DEFAULT_SETTINGS.chatReplyText ? ct(DEFAULT_SETTINGS.chatReplyText) : ctx.settings.chatReplyText;
      eng.setAutoReply(ctx.settings.chatAutoReply ? text : null, ctx.settings.chatReplyCooldown);
    } catch (_) {}
  }

  return { applyChatSettings, applySettings, isQuietHour, loadSettings, migrateSettings, reconnectLimit, saveSettings, updateSleepBlocker };
};
