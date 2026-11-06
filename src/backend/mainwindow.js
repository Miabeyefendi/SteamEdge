// Moved out of main.js unchanged (the main window, its saved size and place, the page fit zoom and the tray). Everything it needs from main.js arrives through `ctx`;
// the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { BrowserWindow, CONFIG_DIR, Menu, Tray, accountName, app, authSlots, ct, disconnectAll, fs, getAuthSlot, hasSession, ipcMain, log, nativeImage, path, screen, windowFit, windowOpened } = ctx;

  // One way to bring the window back, whatever state it is in: hidden to the tray, minimised by Windows (Win+D, Win+M) or both. Before, the tray click, the tray menu,
  // the second copy and the notification each did a part of this and a minimised window could stay minimised.
  function showWindow() {
    if (!ctx.win || ctx.win.isDestroyed()) return;
    if (ctx.win.isMinimized()) ctx.win.restore();
    if (ctx.maximizeOnShow) { ctx.maximizeOnShow = false; ctx.win.maximize(); }
    ctx.win.show();
    ctx.win.focus();
  }

  // The .ico carries 16 to 256 px, so the taskbar and Alt+Tab pick the size they need; the png is the fallback
  function windowIcon() {
    const ico = path.join(__dirname, '..', 'assets', 'icon.ico');
    return process.platform === 'win32' && require('fs').existsSync(ico) ? ico : path.join(__dirname, '..', 'assets', 'icon.png');
  }

  function ensureTray() {
    if (ctx.tray) return;
    try {
      const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'));
      ctx.trayHasIcon = !img.isEmpty();          // an empty image makes a tray entry nobody can see: the minimise button must not hide the window behind it
      ctx.tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
      ctx.tray.setToolTip('SteamEdge');
      setupTrayMenu();
      ctx.tray.on('click', () => { if (ctx.win && !ctx.win.isDestroyed()) { (ctx.win.isVisible() && !ctx.win.isMinimized()) ? ctx.win.hide() : showWindow(); } });
    } catch (_) {}
  }
  // When the language changes the menu is rebuilt; it used to stay in Turkish in every language.
  function setupTrayMenu() {
    if (!ctx.tray) return;
    try {
      ctx.tray.setContextMenu(Menu.buildFromTemplate([
        { label: ct('Pencereyi göster'), click: () => showWindow() },
        { type: 'separator' },
        // the dictionary key "Exit" (Turkish source text) means "sign out" in the navigation; this entry closes the app.
        { label: ct("SteamEdge'i kapat"), click: () => { ctx.isQuitting = true; app.quit(); } },
      ]));
    } catch (_) {}
  }

  // Fixed startup size - the same for login and the panel (3:2 ratio) on a big screen; a small screen gets the work area minus a margin.
  // Every place that centres/resizes the window (logout, moving to the dashboard, deleting an account, deleting data) uses these
  // helpers so it changes from a single place.
  const WIN_W = 1716;
  const WIN_H = 1144;
  // The smallest the window may get. The layout is fluid down to 900 x 560 (the login screen needs a little more height); a smaller window
  // zooms the page out as a whole (applyFitZoom) instead of squeezing it, so the buttons shrink with the window and nothing runs off the edge.
  const MIN_DASH = windowFit.minWindow(windowFit.DESIGN.dash);
  const MIN_LOGIN = windowFit.minWindow(windowFit.DESIGN.login);
  let fitDesign = windowFit.DESIGN.login;      // the design size of the page that is (about to be) shown
  const WINDOW_FILE = path.join(CONFIG_DIR, 'window.json');   // { x, y, width, height, maximized } of the panel window
  // The work area (screen minus the taskbar) of the display a rectangle is mostly on. Its x and y are not 0 when the taskbar is
  // on the left or top, or when the display is not the first one.
  function workAreaOf(rect) { return screen.getDisplayMatching(rect).workArea; }
  function defaultBounds() {
    const wa = screen.getPrimaryDisplay().workArea;
    const width = Math.min(WIN_W, wa.width - 24);
    const height = Math.min(WIN_H, wa.height - 24);
    return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width, height };
  }
  // A minimum bigger than the screen would leave a window that cannot be fitted on it.
  function minimumFor(base, rect) {
    const wa = workAreaOf(rect);
    return { w: Math.min(base.w, wa.width), h: Math.min(base.h, wa.height) };
  }
  function applyMinimumSize(base) {
    if (!ctx.win) return;
    const m = minimumFor(base, ctx.win.getBounds());
    ctx.win.setMinimumSize(m.w, m.h);
  }
  // Zooms the page so the design size always fits the window: 1 while the window is at least that big, smaller below it. The content size
  // is what the page gets (a frameless window has no frame to subtract).
  function applyFitZoom() {
    if (!ctx.win || ctx.win.isDestroyed() || ctx.win.isMinimized()) return;
    const [width, height] = ctx.win.getContentSize();
    const zoom = windowFit.fitZoom(width, height, fitDesign, ctx.settings.uiScale);
    if (Math.abs(ctx.win.webContents.getZoomFactor() - zoom) > 0.001) ctx.win.webContents.setZoomFactor(zoom);
  }
  // Ctrl + / - / 0: the next step of the interface scale (0 = back to 100), saved like the setting in Settings (which shows it next time it opens).
  function stepUiScale(dir) {
    const next = dir === 0 ? 100 : windowFit.stepScale(ctx.settings.uiScale, dir);
    if (next !== windowFit.normalizeScale(ctx.settings.uiScale)) ctx.applySettingPatch({ uiScale: next });
  }
  // While the app itself moves the window (centring, fitting) the position must not be remembered as the user's choice.
  let windowSaveBlockedUntil = 0;
  // Centres the window on screen and makes it WIN_W x WIN_H. If the screen is small it fits it to the work area.
  function centerDefaultSize() {
    if (!ctx.win) return;
    windowSaveBlockedUntil = Date.now() + 1500;
    if (ctx.win.isMaximized()) ctx.win.unmaximize();
    ctx.win.setBounds(defaultBounds());
  }
  // What was kept in window.json, fitted to a screen that exists now. null when there is nothing usable: first start, a damaged file,
  // or the screen it was on is gone (an unplugged monitor must not leave the window out of reach).
  function loadWindowState() {
    // A plain read on purpose: readJson would mark a damaged file as protected and never let it be rewritten, and a window position is not worth that.
    let v = null;
    try { v = JSON.parse(fs.readFileSync(WINDOW_FILE, 'utf8')); } catch (_) { return null; }
    if (!v || ![v.x, v.y, v.width, v.height].every(Number.isFinite)) return null;
    const want = { x: Math.round(v.x), y: Math.round(v.y), width: Math.round(v.width), height: Math.round(v.height) };
    const wa = workAreaOf(want);
    const overlapW = Math.min(want.x + want.width, wa.x + wa.width) - Math.max(want.x, wa.x);
    const overlapH = Math.min(want.y + want.height, wa.y + wa.height) - Math.max(want.y, wa.y);
    if (overlapW < 200 || overlapH < 120) return null;
    const min = minimumFor(MIN_DASH, want);
    const width = Math.max(min.w, Math.min(want.width, wa.width));
    const height = Math.max(min.h, Math.min(want.height, wa.height));
    const x = Math.min(Math.max(want.x, wa.x), wa.x + wa.width - width);
    const y = Math.min(Math.max(want.y, wa.y), wa.y + wa.height - height);
    return { bounds: { x, y, width, height }, maximized: v.maximized === true };
  }
  function onPanelPage() {
    try { return !!ctx.win && !ctx.win.isDestroyed() && ctx.win.webContents.getURL().endsWith('/src/main/main.html'); } catch (_) { return false; }
  }
  let windowSaveTimer = null;
  function saveWindowState() {
    clearTimeout(windowSaveTimer);
    windowSaveTimer = null;
    if (!ctx.win || ctx.win.isDestroyed() || !onPanelPage() || Date.now() < windowSaveBlockedUntil) return;
    if (ctx.win.isMinimized() || ctx.win.isFullScreen()) return;
    const b = ctx.win.getNormalBounds();
    try {
      fs.writeFileSync(WINDOW_FILE + '.tmp', JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: ctx.win.isMaximized() }, null, 2), 'utf8');
      fs.renameSync(WINDOW_FILE + '.tmp', WINDOW_FILE);
    } catch (_) {}
  }
  function saveWindowStateSoon() {
    clearTimeout(windowSaveTimer);
    windowSaveTimer = setTimeout(saveWindowState, 800);
  }
  // Login -> panel: the saved place if there is one, the default otherwise.
  function enterPanelWindow() {
    if (!ctx.win) return;
    fitDesign = windowFit.DESIGN.dash;
    applyMinimumSize(MIN_DASH);
    const st = loadWindowState();
    if (!st) { centerDefaultSize(); applyFitZoom(); return; }
    windowSaveBlockedUntil = Date.now() + 1500;
    ctx.win.setBounds(st.bounds);
    if (st.maximized) ctx.win.maximize();
    applyFitZoom();
  }
  function enterLoginWindow() {
    if (!ctx.win) return;
    fitDesign = windowFit.DESIGN.login;
    applyMinimumSize(MIN_LOGIN);
    centerDefaultSize();
    applyFitZoom();
  }

  function createWindow() {
    const sess = hasSession();               // saved refresh token → auto-login straight to dashboard
    const saved = sess ? loadWindowState() : null;
    const start = saved ? saved.bounds : defaultBounds();
    const min = minimumFor(sess ? MIN_DASH : MIN_LOGIN, start);
    fitDesign = sess ? windowFit.DESIGN.dash : windowFit.DESIGN.login;
    windowSaveBlockedUntil = Infinity;   // until the window has been shown (see ready-to-show below)

    ctx.win = new BrowserWindow({
      x: start.x, y: start.y, width: start.width, height: start.height, minWidth: min.w, minHeight: min.h,
      frame: false, backgroundColor: '#0f1720', show: false,
      // the .ico carries 16 to 256 px: the taskbar and Alt+Tab pick the size they need, the png is scaled
      icon: windowIcon(),
      webPreferences: { preload: path.join(__dirname, '..', '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });

    // The window only ever shows the app's own pages: no popups, no navigation away (a link in injected content could not open a web page here)
    ctx.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    ctx.win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
    ctx.win.loadFile(path.join(__dirname, '..', ...(sess ? ['main', 'main.html'] : ['login', 'login.html'])));
    // After the window shows, wait one frame and then allow the engine to be set up (see windowOpened).
    ctx.win.once('ready-to-show', () => {
      // Showing and maximizing fire move and resize events too; they are the app's own doing, not a choice of the user.
      windowSaveBlockedUntil = Date.now() + 1500;
      // Started by Windows with "Start in the tray": the panel loads and the accounts connect, the window waits for the tray icon. Not without
      // a saved session (the login screen needs the user) and not without an icon to bring it back with.
      const hidden = ctx.startHidden && sess && ctx.tray && ctx.trayHasIcon && !ctx.tray.isDestroyed();
      ctx.startHidden = false;
      if (hidden) ctx.maximizeOnShow = !!(saved && saved.maximized);
      else if (saved && saved.maximized) ctx.win.maximize();
      applyFitZoom();      // before the window shows: a zoom left over from an earlier session must not flash on screen
      if (hidden) log('info', 'started in the tray'); else ctx.win.show();
      setTimeout(() => ctx.resolveWindowOpened(), 50);
    });
    ['resize', 'move', 'maximize', 'unmaximize'].forEach((ev) => ctx.win.on(ev, saveWindowStateSoon));
    // The page follows the window: every size change, and every page that loads (login -> panel changes the design size)
    ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'].forEach((ev) => ctx.win.on(ev, applyFitZoom));
    ctx.win.webContents.on('did-finish-load', applyFitZoom);
    // Ctrl + / - / 0 would change the zoom the window sets for itself, and the next resize would snap it back
    ctx.win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown' || !(input.control || input.meta) || !['+', '=', '-', '_', '0'].includes(input.key)) return;
      e.preventDefault();
      stepUiScale(input.key === '0' ? 0 : (input.key === '-' || input.key === '_') ? -1 : 1);
    });
    // Windows is shutting down or signing out: the app may be ended before before-quit, so the jobs are written now
    ctx.win.on('session-end', () => ctx.resumeSave(true));
    ctx.win.on('close', (e) => {
      saveWindowState();
      if (!ctx.isQuitting && ctx.settings.closeToTray) { e.preventDefault(); ctx.win.hide(); }
    });
    ctx.win.on('closed', () => { ctx.win = null; });
  }

  // window controls
  // The minimise button sends the window to the notification area (tray), not to the taskbar; the tray icon brings it back. Without a tray icon it minimises as usual.
  ipcMain.on('win:minimize', () => {
    if (!ctx.win) return;
    ensureTray();
    if (ctx.tray && ctx.trayHasIcon && !ctx.tray.isDestroyed()) ctx.win.hide(); else ctx.win.minimize();
  });
  ipcMain.on('win:maximize', () => { if (ctx.win) ctx.win.isMaximized() ? ctx.win.unmaximize() : ctx.win.maximize(); });
  ipcMain.on('win:close', () => ctx.win && ctx.win.close());
  ipcMain.on('win:fit', (_e, h) => {
    if (!ctx.win || ctx.win.isMaximized()) return;
    const cur = ctx.win.getBounds();
    const wa = workAreaOf(cur);
    const height = Math.min(Math.ceil(h), wa.height - 24);
    windowSaveBlockedUntil = Date.now() + 1500;
    ctx.win.setBounds({ x: wa.x + Math.round((wa.width - cur.width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width: cur.width, height });
  });
  // Widens the window as (+) adds a new account box on the login screen (so they fit side by side).
  ipcMain.on('win:setWidth', (_e, w) => {
    if (!ctx.win || ctx.win.isMaximized()) return;
    const cur = ctx.win.getBounds();
    const wa = workAreaOf(cur);
    const width = Math.min(Math.ceil(w), wa.width - 24);
    windowSaveBlockedUntil = Date.now() + 1500;
    ctx.win.setBounds({ x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - cur.height) / 2), width, height: cur.height });
  });

  // auth - every call carries {slotId, ...}; each (+) box in login.html uses its own independent
  // SteamAuth instance (see getAuthSlot).
  // The login screen wants the QR as soon as it opens; so that loading steam-session does not hold the window,
  // requests are handled after the window shows (order is kept: they all wait on the same promise).
  ipcMain.on('auth:startQR', (_e, { slotId } = {}) => windowOpened.then(() => getAuthSlot(slotId).startQR()));
  ipcMain.on('auth:startCredentials', (_e, { slotId, accountName, password }) => windowOpened.then(() => getAuthSlot(slotId).startCredentials(accountName, password)));
  ipcMain.on('auth:submitGuard', (_e, { slotId, code }) => windowOpened.then(() => getAuthSlot(slotId).submitGuard(code)));
  ipcMain.on('auth:cancel', (_e, { slotId } = {}) => windowOpened.then(() => getAuthSlot(slotId).cancel()));
  ipcMain.on('auth:loginCookie', (_e, { slotId, sessionid, steamLoginSecure, steamparental }) => windowOpened.then(() => getAuthSlot(slotId).loginCookie(sessionid, steamLoginSecure, steamparental)));

  // logout: clear saved session, back to login
  ipcMain.on('auth:logout', () => {
    // "Sign out of all accounts" - all of them close, including the ones running in the background
    disconnectAll();
    try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
    try { fs.unlinkSync(path.join(CONFIG_DIR, 'web-session.json')); } catch (_) {}
    authSlots.clear(); ctx.addingAccountMode = false;
    if (!ctx.win) return;
    enterLoginWindow();
    ctx.win.loadFile(path.join(__dirname, '..', 'login', 'login.html'));
  });

  // login -> dashboard (login.html calls this only when slot 0 finishes successfully)
  ipcMain.on('go:dashboard', () => {
    if (!ctx.win) return;
    authSlots.clear(); ctx.addingAccountMode = false; // if the "Add Account" flow is over reset the flag
    enterPanelWindow();
    ctx.win.loadFile(path.join(__dirname, '..', 'main', 'main.html'));
  });

  return { applyFitZoom, createWindow, ensureTray, enterLoginWindow, onPanelPage, setupTrayMenu, showWindow };
};
