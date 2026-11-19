// Signing in again to one saved account whose login Steam stopped taking (accounts.js markNeedsLogin). Before 4.3.7 the only way back was to remove the
// account and add it again, which threw away its queue, statistics and settings. A small window of its own shows the sign-in of the login screen (QR and
// password) for that account only; the main window and the jobs of the other accounts stay as they are. The new token replaces the old one in
// accounts.json (steamAuth._saveSession matches by steamID and drops the mark), and the account connects with its data and the jobs it had left.

module.exports = function init(ctx) {
  const { BrowserWindow, CONFIG_DIR, authSlots, connectAccount, ipcMain, loadAccounts, log, logger, makeActiveSession, path, sendRaw, slotOf, steamAuthClass, syncActive } = ctx;

  // The auth IPC of login.html is keyed by slot (mainwindow.js); this one is the sign-in window's. Its answers go to that window, not the main one.
  const SLOT = 'relogin';
  let popup = null, target = null;

  function closePopup() {
    if (popup && !popup.isDestroyed()) popup.close();
  }
  function dropAuth() {
    const auth = authSlots.get(SLOT);
    if (auth) { try { auth.cancel(); } catch (_) {} authSlots.delete(SLOT); }
  }
  function emitTo(win) {
    return (event, data) => {
      if (win && !win.isDestroyed()) win.webContents.send('auth:' + event, { ...data, slotId: SLOT });
      if (event === 'authenticated') finish(target, win);
    };
  }

  async function finish(steamID, win) {
    // steamAuth has just written the new login to disk in plain text
    if (ctx.settings.protectTokens) ctx.rewriteTokenFiles();
    const entry = loadAccounts().find((a) => a.steamID === steamID);
    setTimeout(() => { if (popup === win) closePopup(); }, 1500);
    if (!entry || entry.locked || !entry.refreshToken) { log('warn', 'sign-in again: the account could not be read back'); return; }
    log('info', `[${entry.accountName}] signed in again, connecting`);
    if (logger) logger.connection(steamID, 'signedIn', null);
    // session.json carries the account on screen, so it gets the new token too (a restart would read the dead one)
    if (steamID === ctx.activeSteamID) makeActiveSession(entry);
    const s = slotOf(steamID);
    s.needsLogin = false;
    if (s.engine) { try { s.engine.logOff(); } catch (_) {} s.engine = null; }
    s.ready = false;
    const r = await connectAccount(entry);
    syncActive();
    sendRaw('accounts:relogged', { steamID, accountName: entry.accountName, ok: !!r.ok, error: r.ok ? null : (r.error || null), activeIds: steamID === ctx.activeSteamID });
  }

  ipcMain.handle('accounts:relogin', (_e, steamID) => {
    const id = String(steamID || ctx.activeSteamID || '');
    const entry = loadAccounts().find((a) => a.steamID === id);
    if (!entry) return { ok: false, error: 'Hesap bulunamadı.' };
    if (popup && !popup.isDestroyed()) {
      if (target === id) { popup.show(); popup.focus(); return { ok: true }; }
      closePopup();
    }
    dropAuth();
    target = id;
    const win = new BrowserWindow({
      parent: ctx.win || undefined, width: 460, height: 640, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true,
      frame: false, backgroundColor: '#0f1720', show: false,
      webPreferences: { preload: path.join(__dirname, '..', '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    popup = win;
    // the sign-in goes through the account's own proxy when it has one, as its connection does
    const auth = new (steamAuthClass())(CONFIG_DIR, emitTo(win), { proxyUrl: ctx.accountData(id).proxyUrl || ctx.settings.loginProxyUrl });
    auth.addingAccount = true;          // session.json is written in finish(), only for the account on screen
    auth.expectSteamID = id;
    authSlots.set(SLOT, auth);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file://')) ev.preventDefault(); });
    win.loadFile(path.join(__dirname, '..', 'login', 'login.html'), { query: { relogin: id, name: entry.accountName || id } });
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
    win.on('closed', () => {
      if (popup !== win) return;
      popup = null; target = null;
      dropAuth();
    });
    return { ok: true };
  });
  ipcMain.on('relogin:close', (e) => {
    if (popup && !popup.isDestroyed() && e.sender === popup.webContents) closePopup();
  });

  return { closeRelogin: closePopup };
};
