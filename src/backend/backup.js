// Moved out of main.js unchanged (backup). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { ACCOUNT_DIR, ACCOUNT_SCOPED, CACHE_DIR, CONFIG_DIR, DEFAULT_SETTINGS, DEFAULT_STATS, JSON_SIDE_FILES, accountData, accountDataAll, accountSettingsAdded, activeAccountData, app, applySettings, applySettingsToJobs, authSlots, corruptFiles, ct, dialog, disconnectAll, enterLoginWindow, fs, ipcMain, loadAccounts, log, logger, migrateKeys, migrateSettings, path, publicSettings, saveSettings, sendRaw, setupTrayMenu, statsView, translation, writeAccountData } = ctx;

  // ---- Backup (export/import) ----
  // The backup holds the preferences and PER-ACCOUNT data: statistics, the games selected in the Hour Booster,
  // the Realistic Mode queue and presets. The session key, refresh token, user names and the fields that belong to
  // the current session (persona/steamID/currency) are DELIBERATELY left out: if the backup file falls
  // into someone else's hands it must not give access to the account. The backup used to hold the old shared statistics
  // file detached from the account; the real statistics counted per account were never backed up.
  // protectTokens belongs to this Windows user and computer; a backup must not switch it on somewhere else.
  const EXPORT_SKIP = ['persona', 'steamID', 'accountCurrency', 'protectTokens', 'loginProxyUrl'];
  const BACKUP_ACCOUNT_FIELDS = ['boostGameIds', 'grQueue', 'grPresets'];
  function exportPayload() {
    const out = {};
    Object.keys(ctx.settings).forEach((k) => { if (!EXPORT_SKIP.includes(k)) out[k] = ctx.settings[k]; });
    const accountList = {};
    loadAccounts().forEach((a) => {
      const v = accountData(a.steamID);
      const h = { stats: v.stats || null };
      BACKUP_ACCOUNT_FIELDS.forEach((k) => { h[k] = Array.isArray(v[k]) ? v[k] : []; });
      h.jobSettings = { ...(v.jobSettings || {}) };          // the account's own job settings
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
    const r = await dialog.showSaveDialog(ctx.win, {
      title: ct('SteamEdge ayarlarını dışa aktar'),
      defaultPath: path.join(app.getPath('documents'), 'steamedge-settings-' + stamp + '.json'),
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
    const r = await dialog.showOpenDialog(ctx.win, {
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
      const old = ctx.settings;
      ctx.settings = { ...DEFAULT_SETTINGS, ...clean };
      const changed = Object.keys(ctx.settings).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(ctx.settings[k]));
      if (!saveSettings()) { ctx.settings = old; return { ok: false, error: 'Ayar dosyası yazılamadı.' }; }
      ctx.settingSaveTime = Date.now();
      applySettings();
      if (changed.includes('language')) { translation.pickLang(ctx.settings.language); setupTrayMenu(); }
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
          if (h.jobSettings && typeof h.jobSettings === 'object' && !Array.isArray(h.jobSettings)) {
            v.jobSettings = {};
            Object.keys(h.jobSettings).forEach((k) => { if (ACCOUNT_SCOPED.has(k)) v.jobSettings[k] = h.jobSettings[k]; });
          }
          writeAccountData(sid);
          accountCount++;
        });
      } else if (obj && obj.stats && typeof obj.stats === 'object' && ctx.activeSteamID) {
        // Old format (format 1): a single statistics object, written to the account on screen.
        activeAccountData().stats = { ...DEFAULT_STATS, ...obj.stats };
        writeAccountData(ctx.activeSteamID);
        accountCount = 1;
      }
      if (ctx.activeSteamID) sendRaw('stats:changed', statsView(ctx.activeSteamID));
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
    ctx.resumeStore.clear();
    ['session.json', 'web-session.json', 'accounts.json', 'settings.json', 'stats.json', 'state.json'].forEach((f) => {
      JSON_SIDE_FILES.forEach((extra) => {
        try { fs.unlinkSync(path.join(CONFIG_DIR, f + extra)); } catch (_) {}
      });
    });
    // All of the per-account stores
    try { fs.rmSync(ACCOUNT_DIR, { recursive: true, force: true }); } catch (_) {}
    accountDataAll.clear(); corruptFiles.clear();
    // Cache side, and the log files (logs/)
    ['prices.json', 'history.json'].forEach((f) => {
      try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
    });
    Object.values(logger.files).forEach((f) => {
      try { fs.unlinkSync(f); } catch (_) {}
      try { fs.unlinkSync(f + '.1'); } catch (_) {}
    });
    ctx.settings = { ...DEFAULT_SETTINGS }; ctx.lifeStats = null; ctx.priceCache = new Map();
    ctx.activeSteamID = null;
    authSlots.clear(); ctx.addingAccountMode = false;
    if (ctx.win) {
      enterLoginWindow();
      ctx.win.loadFile(path.join(__dirname, '..', 'login', 'login.html'));
    }
    return { ok: true };
  });


  return {};
};
