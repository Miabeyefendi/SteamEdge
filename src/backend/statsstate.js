// Moved out of main.js unchanged (the lifetime statistics file and the persistent state store: state.json, the achievement log, the retention rules).
// The data they work on (lifeStats, appState and their defaults) is still declared in main.js because other modules read it. Everything it needs from main.js arrives
// through `ctx`; the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { DEFAULT_STATS, STATE_FILE, STATS_FILE, accounts, ipcMain, log, readErrors, readJson, sendRaw, writeJson } = ctx;

  function loadStats() {
    const r = readJson(STATS_FILE);
    if (r.ok) {
      ctx.lifeStats = { ...DEFAULT_STATS, ...r.dataBlock };
      if (r.fromBackup) readErrors.push({ displayName: 'İstatistikler', recoveredFlag: true });
    } else {
      ctx.lifeStats = { ...DEFAULT_STATS, since: Date.now() };
      if (r.corrupt) readErrors.push({ displayName: 'İstatistikler', recoveredFlag: false });
    }
  }
  // stats.json is no longer written: statistics are per account, in the account file. The old file is only read at
  // first startup to be moved to the account on screen (accountDataMigration).
  // Statistics are account specific and are counted in the MAIN PROCESS (see addStat): the cards dropped by two
  // accounts are not added into a single counter, and a background account's job is counted too. The interface
  // only reads; the adding used to be in the interface and only the account on screen was counted.
  function statsView(steamID) {
    const st = { ...DEFAULT_STATS, ...ctx.accountStats(steamID) };
    // The uninterrupted time of the running job is taken into account too; otherwise the longest run would only show once the job ended.
    const s = accounts.get(steamID);
    if (s && s.uninterruptedStart && !s.uninterruptedEnd && ctx.accountRunning(s)) {
      st.longestRunMs = Math.max(+st.longestRunMs || 0, Date.now() - s.uninterruptedStart);
    }
    return { steamID, ...st };
  }
  ipcMain.handle('stats:get', () => {
    if (!ctx.activeSteamID) return { ...DEFAULT_STATS, since: null };
    ctx.statsHour(ctx.activeSteamID);          // so the last minute of the running job shows too
    return statsView(ctx.activeSteamID);
  });
  ipcMain.handle('stats:reset', () => {
    if (!ctx.activeSteamID) return { ...DEFAULT_STATS, since: null };
    const v = ctx.activeAccountData();
    v.stats = { ...DEFAULT_STATS, dailyCards: {}, since: Date.now() };
    const s = accounts.get(ctx.activeSteamID);
    if (s) { s.uninterruptedStart = ctx.accountRunning(s) ? Date.now() : null; s.uninterruptedEnd = null; }
    ctx.writeAccountData(ctx.activeSteamID);
    const view = statsView(ctx.activeSteamID);
    sendRaw('stats:changed', view);
    return view;
  });

  function retentionMs() {
    const d = +(ctx.settings && ctx.settings.dataRetentionDays);
    return Number.isFinite(d) && d > 0 ? d * 24 * 60 * 60 * 1000 : 0;   // 0 = forever
  }
  function pruneState() {
    const ttl = retentionMs();
    if (!ttl) return 0;
    const cut = Date.now() - ttl;
    let n = 0;
    Object.keys(ctx.appState.entries).forEach((k) => {
      const e = ctx.appState.entries[k];
      if (!e || !(e.ts > cut)) { delete ctx.appState.entries[k]; n++; }
    });
    const before = ctx.appState.achLog.length;
    ctx.appState.achLog = ctx.appState.achLog.filter((r) => r && r.ts > cut);
    return n + (before - ctx.appState.achLog.length);
  }
  function loadState() {
    const r = readJson(STATE_FILE);
    if (r.ok) {
      const raw = r.dataBlock;
      ctx.appState = {
        entries: (raw && typeof raw.entries === 'object' && raw.entries) || {},
        achLog: Array.isArray(raw && raw.achLog) ? raw.achLog : [],
      };
      if (r.fromBackup) readErrors.push({ displayName: 'Kayıtlı durum', recoveredFlag: true });
    } else {
      ctx.appState = { entries: {}, achLog: [] };
      if (r.corrupt) readErrors.push({ displayName: 'Kayıtlı durum', recoveredFlag: false });
    }
    const dropped = pruneState();
    if (dropped) log('info', dropped + ' records past the retention period deleted');
  }
  function saveState() { writeJson(STATE_FILE, ctx.appState, false); }
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
    const v = ctx.activeAccountData();
    pruneAccountRecords(v);
    const e = v.entries[key];
    return { ok: true, value: e ? e.v : undefined, ts: e ? e.ts : null };
  });
  ipcMain.handle('state:set', (_e, { key, value }) => {
    const v = ctx.activeAccountData();
    v.entries[key] = { v: value, ts: Date.now() };
    pruneAccountRecords(v); ctx.writeAccountDataDelayed(ctx.activeSteamID);
    return { ok: true };
  });
  // Unlocked/locked achievements: a permanent record of what we did, in which game and when.
  ipcMain.handle('state:achLog', (_e, entry) => {
    // a bulk operation names the account it runs on: the log entry belongs there even if another account is on screen now
    const owner = entry && entry.steamID && accounts.has(String(entry.steamID)) ? String(entry.steamID) : ctx.activeSteamID;
    const v = owner === ctx.activeSteamID ? ctx.activeAccountData() : ctx.accountData(owner);
    const { steamID: _owner, ...rest } = entry || {};
    v.achLog.unshift({ ...rest, ts: Date.now() });
    if (v.achLog.length > 2000) v.achLog.length = 2000;
    pruneAccountRecords(v); ctx.writeAccountDataDelayed(owner);
    return { ok: true };
  });
  ipcMain.handle('state:achLogGet', (_e, appid) => {
    const v = ctx.activeAccountData();
    pruneAccountRecords(v);
    const list = appid ? v.achLog.filter((r) => r.appid === appid) : v.achLog;
    return { ok: true, list };
  });
  ipcMain.handle('state:clear', () => {
    const v = ctx.activeAccountData();
    v.entries = {}; v.achLog = [];
    ctx.writeAccountData(ctx.activeSteamID);
    return { ok: true };
  });

  return { loadState, loadStats, pruneAccountRecords, statsView };
};
