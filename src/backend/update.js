// Moved out of main.js unchanged (update). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { accountDataMigration, accounts, app, connectAccount, ct, dialog, flushPendingWrites, fs, hasSession, ipcMain, loadAccounts, log, logger, path, readErrors, sendRaw, session, statsHour, syncActive, update } = ctx;

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
        + (outcome.ok ? (outcome.isUpToDate ? 'up to date (' + outcome.installed + ')' : 'new version ' + outcome.lastOne) : outcome.failure));
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
  // Settings > Advanced shows this live. Electron runs multi process: five separate SteamEdge
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
      gpuOn: ctx.settings.hwAccel !== false,
    };
  });
  // Empty the image and network cache. NO loss of settings, session or data - only things that can be
  // downloaded again go. The most direct way to win memory back in long sessions.
  ipcMain.handle('app:memoryClear', async () => {
    const earlier = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
    try {
      await session.defaultSession.clearCache();
      if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.session.clearCodeCaches({ urls: [] });
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
    ctx.isQuitting = true;
    // The jobs that are running now are what comes back at the next start: written before anything else, and the file is closed to changes after that.
    ctx.resumeSave(true);
    // Let the last minute of running jobs and the pending account writes land on disk.
    accounts.forEach((s, id) => { try { statsHour(id); } catch (_) {} });
    flushPendingWrites();
    logger.connection('-', 'stopped');   // a drop still open ends here in the connection history, not at the next start
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
        + '\n\n' + ct('Bu veriler varsayılana döndürüldü. Bozuk dosyalar ".corrupt" uzantısıyla settings klasöründe duruyor, üzerlerine yazılmadı.')
        + '\n\n' + ct('Bunun sebebi genellikle uygulama kayıt yaparken bilgisayarın kapanmasıdır.');
    }
    try {
      dialog.showMessageBox(ctx.win || null, {
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
    if (!ctx.activeSteamID) { ctx.activeSteamID = sess.steamID; accountDataMigration(); }
    const entry = loadAccounts().find((a) => a.steamID === ctx.activeSteamID) || sess;
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


  return { earlyConnect, isSetupConsistent, reportReadErrors, startupUpdateCheck };
};
