// Moved out of main.js unchanged (settingsipc). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { ACCOUNT_SCOPED, ACCOUNT_SCOPED_SETTINGS, ACCOUNT_SETTING_KEYS, DATA_ROOT, DEFAULT_SETTINGS, HISTORY_FILE, JSON_SIDE_FILES, PRICE_FILE, accountBoostRunning, accountData, accountName, accounts, activeAccountData, applyActiveProxy, applyParentalPin, applyPersona, applySettings, boostFinish, boostStart, cleanAppIds, currentPriceCurrency, delayFarm, fs, ipcMain, log, parseProxy, personaName, personaOf, pruneAccountRecords, resumeFarm, rewriteTokenFiles, saveSettings, settingFor, setupTrayMenu, shell, startCardFarm, tokenProtectionAvailable, translation, windowFit, writeAccountData } = ctx;

  // ---- settings IPC ----
  // The settings object that goes to the renderer. accountCurrency = the account's Steam wallet currency (prices are fetched in
  // this currency and shown EXACTLY in this currency; no conversion is done).
  function publicSettings() {
    // The same source as getPrice - the symbol the interface shows, the currency the amount was really fetched in.
    const accountCurrency = currentPriceCurrency();
    return {
      ...ctx.settings,
      persona: ctx.engine && ctx.engine.persona,
      steamID: ctx.engine && ctx.engine.steamID,
      accountCurrency,
    };
  }
  // Settings that go to the interface: the ACTIVE ACCOUNT's own values are laid over the general settings.
  // So the renderer side sees the right account's data without knowing anything.
  function accountSettingsAdded(basis) {
    const v = activeAccountData();
    const output = { ...basis };
    ACCOUNT_SETTING_KEYS.forEach((k) => { if (k in v) output[k] = v[k]; });
    ACCOUNT_SCOPED_SETTINGS.forEach((k) => { output[k] = settingFor(ctx.activeSteamID, k); });
    // which account these values belong to: the page sends it back with every write (see applySettingPatch)
    output.settingsAccount = ctx.activeSteamID || null;
    return output;
  }
  ipcMain.handle('settings:get', () => {
    return accountSettingsAdded(publicSettings());
  });
  // Handles the settings patch: account specific keys go to the account file, the rest to the settings file.
  // Only the keys that REALLY changed are written and applied; the running jobs affected by the change
  // are resumed with the new setting. Session fields (persona, steamID, currency) are never written:
  // "Geri Al" used to send back the whole settings object and these got into the settings file.
  const SESSION_FIELDS = ['persona', 'steamID', 'accountCurrency', 'settingsAccount'];
  function applySettingPatch(patch, forAccount) {
    const received = { ...(patch || {}) };
    SESSION_FIELDS.forEach((k) => { delete received[k]; });
    // A page that still shows ANOTHER account (the switch happened between its read and this write) must not write its account values into the account now on
    // screen: that is how one account's Realistic Mode queue replaced the other's. Its general settings still go through.
    if (forAccount !== undefined && forAccount !== null && String(forAccount) !== String(ctx.activeSteamID || '')) {
      const dropped = Object.keys(received).filter((k) => ACCOUNT_SETTING_KEYS.includes(k) || ACCOUNT_SCOPED.has(k));
      dropped.forEach((k) => { delete received[k]; });
      if (dropped.length) log('warn', 'settings: ' + dropped.length + ' account value(s) from a page of another account were not written (' + dropped.join(', ') + ')');
    }
    ['farmExcluded', 'farmWhitelist', 'favoriteGames'].forEach((k) => { if (k in received) received[k] = cleanAppIds(received[k]); });
    if ('farmWhitelistOnly' in received) received.farmWhitelistOnly = !!received.farmWhitelistOnly;
    if ('personaState' in received) received.personaState = personaName(received.personaState);
    const personaChanged = 'personaState' in received && received.personaState !== personaOf(ctx.activeSteamID);
    if ('uiScale' in received) received.uiScale = windowFit.normalizeScale(received.uiScale);      // the selector sends text
    ['proxyUrl', 'loginProxyUrl'].forEach((k) => {
      if (!(k in received) || received.__proxyError) return;
      const p = parseProxy(received[k]);
      if (!p.ok) { received.__proxyError = p.error; return; }
      received[k] = p.empty ? '' : String(received[k]).trim();
    });
    if (received.__proxyError) return { ok: false, changedOne: [], appliedOne: [], error: received.__proxyError };
    let writtenToAccount = false;
    let pinChanged = false;
    ACCOUNT_SETTING_KEYS.forEach((k) => {
      if (k in received) {
        if (k === 'parentalPin') pinChanged = String(received[k] || '') !== String(activeAccountData().parentalPin || '');
        activeAccountData()[k] = received[k];
        delete received[k];
        writtenToAccount = true;
      }
    });
    // The job settings: to the account on screen (its own value), unless there is no account yet (the first start), then to the general settings
    const scopedChanged = [];
    if (ctx.activeSteamID) {
      const own = activeAccountData().jobSettings;
      ACCOUNT_SCOPED_SETTINGS.forEach((k) => {
        if (!(k in received)) return;
        if (JSON.stringify(settingFor(ctx.activeSteamID, k)) !== JSON.stringify(received[k])) { own[k] = received[k]; scopedChanged.push(k); writtenToAccount = true; }
        delete received[k];
      });
    }
    if (writtenToAccount) writeAccountData(ctx.activeSteamID);
    if (pinChanged) applyParentalPin(ctx.activeSteamID);
    if (personaChanged) applyPersona(ctx.activeSteamID);
    if (writtenToAccount) applyActiveProxy();      // no-op unless the proxy of the account on screen changed
    const changed = Object.keys(received).filter((k) => JSON.stringify(ctx.settings[k]) !== JSON.stringify(received[k]));
    if (!changed.length) {
      if (!scopedChanged.length) return { ok: true, changedOne: [], appliedOne: [] };
      ctx.settingSaveTime = Date.now();
      const applied = applySettingsToJobs(scopedChanged, ctx.activeSteamID);
      log('info', 'account settings saved: ' + scopedChanged.join(', ') + (applied.length ? (' (applied to ' + applied.length + ' jobs)') : ''));
      return { ok: true, changedOne: scopedChanged, appliedOne: applied };
    }
    const old = ctx.settings;
    ctx.settings = { ...ctx.settings };
    changed.forEach((k) => { ctx.settings[k] = received[k]; });
    if (!saveSettings()) {
      ctx.settings = old;
      return { ok: false, changedOne: [], appliedOne: [], error: 'Ayar dosyası yazılamadı. Açılışta okunamadığı için korunuyor olabilir.' };
    }
    ctx.settingSaveTime = Date.now();
    if (changed.includes('protectTokens')) {
      if (ctx.settings.protectTokens && !tokenProtectionAvailable()) {
        ctx.settings = { ...ctx.settings, protectTokens: false };
        saveSettings();
        return { ok: false, changedOne: [], appliedOne: [], error: 'Windows şifrelemesi bu bilgisayarda kullanılamıyor.' };
      }
      rewriteTokenFiles();
      log('info', 'login token protection ' + (ctx.settings.protectTokens ? 'on' : 'off'));
    }
    applySettings();
    // The reconnect setting changed while an account waits for its next attempt (up to five minutes after the quick attempts of a limit): it tries now with the
    // new setting instead of finishing the old wait. (A loop that gave up is started again by applySettings.)
    if (changed.includes('reconnectPolicy')) accounts.forEach((s) => { if (s.engine && !s.ready && s.engine.retryNow) s.engine.retryNow(); });
    if (changed.includes('resumeJobs')) ctx.resumeSaveSoon();      // switched on: what runs now is written; switched off: the file goes
    if (changed.includes('language')) { translation.pickLang(ctx.settings.language); setupTrayMenu(); }
    // If the retention period was shortened the extra records are deleted right away (it does not wait for startup).
    if (changed.includes('dataRetentionDays')) {
      const n = pruneAccountRecords(activeAccountData());
      if (n) { writeAccountData(ctx.activeSteamID); log('info', 'retention period changed, ' + n + ' records deleted'); }
    }
    const appliedItem = applySettingsToJobs(changed).concat(scopedChanged.length ? applySettingsToJobs(scopedChanged, ctx.activeSteamID) : []);
    log('info', 'settings saved: ' + changed.concat(scopedChanged).join(', ') + (appliedItem.length ? (' (applied to ' + appliedItem.length + ' jobs)') : ''));
    return { ok: true, changedOne: changed.concat(scopedChanged), appliedOne: appliedItem };
  }
  // Instant controls on pages (the Hour Booster switches, "Don't ask again" in the confirmation window
  // and the like) write from here: these are preferences that are applied with a single click anyway.
  ipcMain.handle('settings:set', (_e, patch, forAccount) => {
    applySettingPatch(patch, forAccount);
    return accountSettingsAdded(publicSettings());
  });
  // The "Save" button of the Settings page. The page keeps changes in a draft, only the changed keys
  // come here. The reply also says which jobs will be resumed with the new setting.
  ipcMain.handle('settings:save', (_e, patch, forAccount) => {
    const r = applySettingPatch(patch, forAccount);
    return { ...r, settings: accountSettingsAdded(publicSettings()), saveTime: ctx.settingSaveTime, pauseMs: SETTINGS_DEBOUNCE_MS };
  });
  // "Reset to defaults" no longer writes anything: the defaults are loaded into the page's draft,
  // applied if the user presses Save. It used to write instantly and it also pulled the language to Turkish.
  ipcMain.handle('settings:defaults', () => {
    const v = { ...DEFAULT_SETTINGS };
    delete v.settingsVersion;
    return v;
  });
  ipcMain.handle('settings:info', () => ({ saveTime: ctx.settingSaveTime }));

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
    // If "Time per game" changed the new time, if not the time selected on the Card Farming page.
    const dk = +settingFor(steamID, 'farmMaxMinutes');
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
    const limit = Math.max(1, Math.min(32, +settingFor(steamID, 'boostMaxGames') || 32));
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
  function applySettingsToJobs(changed, onlyAccount) {
    const d = new Set(changed || []);
    const summary = [];
    if (!d.size) return summary;
    accounts.forEach((s, steamID) => {
      if (!s) return;
      if (onlyAccount && steamID !== onlyAccount) return;
      // a general value changes nothing on an account that has its own
      const keysHere = new Set([...d].filter((k) => onlyAccount || !ACCOUNT_SCOPED.has(k) || !Object.prototype.hasOwnProperty.call(accountData(steamID).jobSettings, k)));
      if (!keysHere.size) return;
      const accountRef = accountName(steamID);
      if (s.farm && s.farm.running && CARD_JOB_SETTINGS.some((k) => keysHere.has(k))) {
        if (applyAndContinueCardFarm(steamID, keysHere)) summary.push({ steamID, accountRef: accountRef, is: 'card', how: 'paused' });
      }
      const b = s.boost;
      if (b && b.runningFlag && keysHere.has('boostMaxGames')) {
        // a running sync ignores this setting (see SYNC_MAX_GAMES)
        if (b.sync) { /* nothing to apply */ } else if (applyAndContinueBoost(steamID)) {
          summary.push({ steamID, accountRef: accountRef, is: 'hours', how: 'paused' });
        }
      }
      // In sequential idling shuffling takes effect on the next round; no need to pause.
      if (s.hoursFarm && s.hoursFarm.running && keysHere.has('shuffleBoost')) {
        s.hoursFarm.shuffle = !!settingFor(steamID, 'shuffleBoost');
        s.hoursFarm.opts = { ...(s.hoursFarm.opts || {}), shuffle: s.hoursFarm.shuffle };
        summary.push({ steamID, accountRef: accountRef, is: 'sequential', how: 'instant' });
      }
      if (keysHere.has('pauseFarmOnBoost')) {
        if (settingFor(steamID, 'pauseFarmOnBoost') && (accountBoostRunning(s) || s.realistic) && s.farm && s.farm.running) {
          if (delayFarm(steamID, 'setting: pause while boosting hours')) summary.push({ steamID, accountRef: accountRef, is: 'card', how: 'delayed' });
        } else if (!settingFor(steamID, 'pauseFarmOnBoost') && s.pendingFarm && !s.realistic) {
          resumeFarm(steamID, true);
          summary.push({ steamID, accountRef: accountRef, is: 'card', how: 'resumed' });
        }
      }
    });
    return summary;
  }
  ipcMain.handle('settings:clearPriceCache', () => {
    JSON_SIDE_FILES.forEach((extra) => {
      try { fs.unlinkSync(PRICE_FILE + extra); } catch (_) {}
      try { fs.unlinkSync(HISTORY_FILE + extra); } catch (_) {}
    });
    ctx.priceCache = new Map();
    ctx.historyCache = new Map();
    return { ok: true };
  });
  ipcMain.handle('settings:openConfigFolder', () => { shell.openPath(DATA_ROOT); return { ok: true }; });

  return { accountSettingsAdded, applySettingPatch, applySettingsToJobs, cancelSettingWaits, publicSettings };
};
