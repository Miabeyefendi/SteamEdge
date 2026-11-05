// Moved out of main.js unchanged (the per-account data store: one file per account, the settings that belong to an account, the visibility on Steam
// and the one-time move from the old global files). Everything it needs from main.js arrives through `ctx`; the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { ACCOUNTS_FILE, CONFIG_DIR, accountName, accounts, log, openToken, path, readErrors, readJson, sealIfEnabled, writeJson } = ctx;

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
  const ACCOUNT_SETTING_KEYS = ['boostGameIds', 'profileInfo', 'grQueue', 'grPresets', 'parentalPin', 'proxyUrl', 'farmExcluded', 'favoriteGames', 'personaState', 'hideGameName'];
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
    hideGameName: null,              // go invisible only while a game is played (null: no choice yet, it takes the general setting once)
    keyQueue: [], keyResults: [], keyActive: false,   // product key queue (see PRODUCT KEYS)
    grCompleted: {},                 // appid -> when it was learned that nothing is left to unlock (Realistic Mode leaves it out of its game list)
    farmExcluded: [],                // card farming blacklist (appids); unlike the queue state it never expires
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
    ['keyQueue', 'keyResults', 'farmExcluded', 'favoriteGames'].forEach((k) => { if (!Array.isArray(v[k]) || v[k] === DEFAULT_ACCOUNT_DATA[k]) v[k] = []; });
    // "Hide the game name" was one general switch: an account that has no choice of its own yet starts from it, once
    if (typeof v.hideGameName !== 'boolean') v.hideGameName = !!ctx.settings.hideGameName;
    // The card farming whitelist (up to 1.9.1) is gone
    delete v.farmWhitelist; delete v.farmWhitelistOnly;
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
  function activeAccountData() { return accountData(ctx.activeSteamID); }

  // ---- VISIBILITY ON STEAM (the top bar) ----
  // Chosen per account, as in the Steam client, and kept in the account file; the engine sends it again on every logon, reconnect and game
  // change. "Appear offline" (one general switch up to 1.8.0, in Settings and on the Hour Booster page) became the Invisible choice.
  const PERSONA_STATES = ['online', 'away', 'invisible'];
  function personaName(v) { return PERSONA_STATES.includes(v) ? v : 'online'; }
  function personaOf(steamID) { return steamID ? personaName(accountData(steamID).personaState) : 'online'; }
  function hideNameOf(steamID) { return steamID ? !!accountData(steamID).hideGameName : false; }
  function applyPersona(steamID) {
    const s = accounts.get(steamID);
    if (s && s.engine) { try { s.engine.applyPrivacy(personaOf(steamID), hideNameOf(steamID)); } catch (_) {} }
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
    return ctx.settings[key];
  }

  // ---- One-time migration: move from the old global files to the active account's file ----
  // So the user does not lose data when upgrading. After moving, the copies in the global
  // files are not read; we do not delete them so they are at hand if a return is needed.
  function accountDataMigration() {
    if (!ctx.activeSteamID) return;
    if (ctx.settings.accountDataMigrated) return;
    const v = accountData(ctx.activeSteamID);
    let moved = [];
    if (Array.isArray(ctx.settings.boostGameIds) && ctx.settings.boostGameIds.length && !v.boostGameIds.length) {
      v.boostGameIds = ctx.settings.boostGameIds.slice();
      moved.push(v.boostGameIds.length + ' hour-boost games');
    }
    if (ctx.appState && ctx.appState.entries && Object.keys(ctx.appState.entries).length && !Object.keys(v.entries).length) {
      v.entries = JSON.parse(JSON.stringify(ctx.appState.entries));
      moved.push(Object.keys(v.entries).length + ' saved states');
    }
    if (ctx.appState && Array.isArray(ctx.appState.achLog) && ctx.appState.achLog.length && !v.achLog.length) {
      v.achLog = ctx.appState.achLog.slice();
      moved.push(v.achLog.length + ' achievement log entries');
    }
    if (!v.stats && ctx.lifeStats) { v.stats = { ...ctx.lifeStats }; moved.push('stats'); }
    writeAccountData(ctx.activeSteamID);
    ctx.settings.accountDataMigrated = true; ctx.saveSettings();
    if (moved.length) log('info', 'account data moved (' + ctx.activeSteamID + '): ' + moved.join(', '));
  }

  return { ACCOUNT_DIR, ACCOUNT_SCOPED, ACCOUNT_SCOPED_SETTINGS, ACCOUNT_SETTING_KEYS, accountData, accountDataAll, accountDataMigration, accountFile, activeAccountData, applyPersona, cleanAppIds, flushPendingWrites, hideNameOf, pendingWrite, personaFromOfflineMode, personaName, personaOf, settingFor, writeAccountData, writeAccountDataDelayed };
};
