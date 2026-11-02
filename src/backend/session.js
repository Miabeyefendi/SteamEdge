// Moved out of main.js unchanged (session). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { CONFIG_DIR, accountRunning, accounts, disconnectAll, enterLoginWindow, fs, ipcMain, log, path } = ctx;

  // ---- Session timeout (Settings > Advanced) ----
  // The renderer sends 'session:activity' on every user interaction. If there is no interaction for the
  // set time the Steam sessions are closed. If card farming, hour boosting or Realistic Mode is running on an account
  // it is NOT closed: closing an app that is working in the background as "idle" would cut the job
  // in half. If the job is still running when the time is up the counter is set up again.
  let idleTimer = null;
  function armIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    const mins = parseInt(ctx.settings.sessionTimeout, 10);
    if (!mins || isNaN(mins)) return;             // 'never'
    idleTimer = setTimeout(() => {
      let runningItem = false;
      accounts.forEach((s) => { if (accountRunning(s)) runningItem = true; });
      if (runningItem) { armIdleTimer(); return; }
      log('warn', `Session idle for ${mins} min - closing ALL accounts`);
      disconnectAll();
      try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
      if (ctx.win) {
        enterLoginWindow();
        ctx.win.loadFile(path.join(__dirname, '..', 'login', 'login.html'));
      }
    }, mins * 60 * 1000);
  }
  ipcMain.on('session:activity', armIdleTimer);


  return { armIdleTimer };
};
