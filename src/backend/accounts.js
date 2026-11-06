// Moved out of main.js unchanged (the account switcher IPC, connecting an account, the proxy of the account on screen, disconnecting).
// The variables that name the active account and its engine (activeSteamID, engine, engineReady, farm, farmHours) are still declared in main.js
// because many other modules read them. Everything it needs arrives through `ctx`; the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { CONFIG_DIR, JSON_SIDE_FILES, NOTIF_ICON, Notification, authSlots, ct, fs, hasSession, ipcMain, loadAccounts, log, makeActiveSession, parseProxy, path, saveAccounts, sendRaw, session, setActiveProxy, startLocalProxy, steamEngineClass, windowOpened } = ctx;

  // ---- multi-account management (the top bar account switcher in place of the removed profile on the left bar) ----
  // Lists the saved accounts (the refreshToken is not leaked - only the main process uses it).
  // If the active session is not in accounts.json (e.g. an old session.json logged in BEFORE the multi-account
  // feature) it adds it here on its own - otherwise the account you logged in with would not show in the list.
  // The page asks for the live state of the jobs of the account on screen when it is ready and whenever that account starts or stops something. Pushing it
  // was not enough: a job resumed at startup before the account on screen was known (or before the page listened) was never told to the page, so a boost ran
  // on the account on screen and its pages said nothing was running.
  ipcMain.handle('jobs:status', () => {
    if (ctx.activeSteamID) ctx.sendJobStatus(ctx.activeSteamID);
    return { ok: true, steamID: ctx.activeSteamID || null };
  });
  ipcMain.handle('accounts:list', () => {
    const sess = hasSession();
    let list = loadAccounts();
    if (sess && !list.some((a) => a.steamID === sess.steamID)) {
      list = [...list, { accountName: sess.accountName, steamID: sess.steamID, refreshToken: sess.refreshToken, addedAt: Date.now() }];
      saveAccounts(list);
    }
    if (!ctx.activeSteamID && sess) { ctx.activeSteamID = sess.steamID; ctx.accountDataMigration(); }
    return list.map((a) => {
      const s = accounts.get(a.steamID);
      return {
        steamID: a.steamID,
        accountName: a.accountName,
        active: a.steamID === ctx.activeSteamID,        // the one shown in the interface
        connected: !!(s && s.ready),                // the Steam session is open
        running: ctx.accountRunning(s),                            // card/hour/realistic is running
        jobs: ctx.accountJobKinds(s),                              // which of them
        detail: ctx.accountJobDetail(s),                           // and on which games
        finished: (s && s.finished) || null,                   // what ended while the account was in the background, until it is opened
      };
    });
  });

  // Switch account: NO RELOAD. Only the account the interface shows changes; the previous
  // account's card farming/hour boosting job keeps running without interruption in the background.
  let switchSeq = 0;
  ipcMain.handle('accounts:switch', async (_e, steamID) => {
    const entry = loadAccounts().find((a) => a.steamID === steamID);
    if (!entry) return { ok: false, error: 'Hesap bulunamadı.' };
    const mine = ++switchSeq;
    // The account on screen STAYS the account on screen until the new one is connected. It used to change at once, while the engine, the farm and the pages kept
    // using the old account until the logon was done (several seconds for an account that was still connecting): the first click seemed to do nothing, the
    // pages loaded the OLD account's games and jobs under the new name, and a second click was needed. An account that is already connected answers at once.
    const r = await connectAccount(entry);
    if (mine !== switchSeq) return { ok: true, superseded: true, steamID };     // a newer click won
    if (!r.ok) return r;
    ctx.activeSteamID = steamID;
    // session.json always reflects the account "open in the interface" (that one opens on restart)
    makeActiveSession(entry);
    syncActive();
    const slot = accounts.get(steamID);
    if (slot && slot.finished) { slot.finished = null; sendRaw('accounts:activity', { steamID, running: ctx.accountRunning(slot), jobs: ctx.accountJobKinds(slot), finished: null }); }
    // The renderer should see the LIVE state of all the jobs of the account it switched to right away; the
    // previous account's running job must not hang on screen.
    ctx.sendJobStatus(steamID);
    sendRaw('stats:changed', ctx.statsView(steamID));
    return { ok: true, persona: r.persona, steamID, softSwitch: true };
  });

  // Connects all saved accounts in the background (for parallel idling).
  ipcMain.handle('accounts:connectAll', async () => {
    const list = loadAccounts();
    const out = [];
    for (const a of list) {
      const r = await connectAccount(a);
      out.push({ steamID: a.steamID, accountName: a.accountName, ok: r.ok, error: r.error });
    }
    syncActive();
    return out;
  });

  // Closes a given account's session (does not delete it from the list).
  ipcMain.handle('accounts:disconnect', (_e, steamID) => {
    const s = accounts.get(steamID);
    if (!s) return { ok: false, error: 'Hesap bağlı değil.' };
    ctx.stopAccountJobs(s, steamID);
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
    accounts.delete(steamID);
    syncActive();
    return { ok: true };
  });
  // Deletes a saved account from the list. If the active account was deleted: if there is another account it switches to it, if not
  // it closes the session completely and returns to the login screen.
  ipcMain.handle('accounts:remove', async (_e, steamID) => {
    const list = loadAccounts();
    const idx = list.findIndex((a) => a.steamID === steamID);
    if (idx < 0) return { ok: false, error: 'Hesap bulunamadı.' };
    const wasActive = steamID === ctx.activeSteamID;
    // Jobs stop first: stopping writes statistics and the feed, if it wrote AFTER the data was deleted
    // the file would come into being again.
    const s = accounts.get(steamID);
    if (s) {
      ctx.stopAccountJobs(s, steamID);
      try { if (s.engine) s.engine.logOff(); } catch (_) {}
      accounts.delete(steamID);
    }
    ctx.resumeStore.forget(steamID);          // what it had left running is not started again for an account that is gone
    const pending = ctx.pendingWrite.get(steamID);
    if (pending) { clearTimeout(pending); ctx.pendingWrite.delete(steamID); }
    // The account's own data should go too, otherwise when the same account is added again the old
    // queue/statistics come back and the user thinks they deleted it.
    ctx.accountDataAll.delete(steamID);
    JSON_SIDE_FILES.forEach((extra) => {
      try { fs.unlinkSync(ctx.accountFile(steamID) + extra); } catch (_) {}
    });
    list.splice(idx, 1);
    saveAccounts(list);
    if (!wasActive) { syncActive(); return { ok: true, softSwitch: true }; }
    if (list.length) {
      ctx.activeSteamID = list[0].steamID;
      makeActiveSession(list[0]);
      await connectAccount(list[0]);
      syncActive();
      return { ok: true, softSwitch: true };
    }
    try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
    if (ctx.win) {
      ctx.enterLoginWindow();
      ctx.win.loadFile(path.join(__dirname, '..', 'login', 'login.html'));
    }
    return { ok: true, loggedOut: true };
  });
  // "Add Account": goes to the login screen but does NOT CHANGE the active session - the new account is only added to the
  // list, the user stays on the current account (the steamAuth.addingAccount flag).
  ipcMain.on('accounts:startAdd', () => {
    if (!ctx.win) return;
    ctx.addingAccountMode = true; authSlots.clear();
    ctx.win.loadFile(path.join(__dirname, '..', 'login', 'login.html'));
  });

  // ================= MULTI-ACCOUNT ENGINE =================
  // Every Steam account gets ITS OWN SteamEngine + FarmController instances and they work
  // independently of each other: switching to B while A is farming cards does not stop A. The "active account" only decides
  // which account's data the interface shows.
  //
  // For backwards compatibility the `engine`/`engineReady`/`farm`/`farmHours` variables point to the ACTIVE account's
  // objects (updated with syncActive below), so the existing IPC
  // handlers keep working as they are.
  const accounts = new Map();      // steamID -> { engine, farm, farmHours, ready, accountName }

  // Binds the module level shortcuts to the active account.
  // What is not tied to an engine goes through the proxy of the account on screen: the images of the pages (the app window's session),
  // the fee script and the update check. The window talks to a local proxy (localProxy.js) that carries on to the account's proxy with
  // its login; with no proxy the session goes back to the system setting it had before.
  let localProxy = null;
  let appliedProxyKey = null;
  function applyActiveProxy() {
    const text = ctx.activeSteamID ? ctx.accountData(ctx.activeSteamID).proxyUrl : '';
    const p = parseProxy(text);
    const key = p.ok && !p.empty ? p.url : '';
    if (key === appliedProxyKey) return Promise.resolve();
    appliedProxyKey = key;
    setActiveProxy(p);
    const old = localProxy;
    localProxy = null;
    const closeOld = old ? old.close() : Promise.resolve();
    if (!key) {
      try { session.defaultSession.setProxy({ mode: 'system' }); log('info', 'app window traffic is direct (system setting)'); }
      catch (e) { log('warn', 'could not set the window proxy: ' + (e && e.message)); }
      return closeOld;
    }
    return closeOld.then(() => startLocalProxy(p)).then((lp) => {
      if (appliedProxyKey !== key) { lp.close(); return; }       // the account on screen changed while this one started
      localProxy = lp;
      return session.defaultSession.setProxy({ proxyRules: 'http://127.0.0.1:' + lp.port, proxyBypassRules: '<local>' })
        .then(() => log('info', 'app window traffic goes through the proxy of the account on screen'));
    }).catch((e) => log('warn', 'could not set the window proxy: ' + (e && e.message)));
  }
  function syncActive() {
    applyActiveProxy();
    const s = ctx.activeSteamID ? accounts.get(ctx.activeSteamID) : null;
    ctx.engine = s ? s.engine : null;
    ctx.engineReady = !!(s && s.ready);
    ctx.farm = s ? s.farm : null;
    ctx.farmHours = s ? s.hoursFarm : null;
  }
  // Stops all accounts' jobs and closes their sessions (exit / timeout / deleting data).
  function disconnectAll() {
    accounts.forEach((s, id) => {
      ctx.stopAccountJobs(s, id);
      try { if (s.engine) s.engine.logOff(); } catch (_) {}
    });
    ctx.flushPendingWrites();
    accounts.clear();
    ctx.activeSteamID = null;
    syncActive();
  }

  // Connects the account (if needed). If it is already connected it returns the existing engine.
  async function connectAccount(entry) {
    const s = ctx.slotOf(entry.steamID);
    s.accountName = entry.accountName;
    if (entry.locked) return { ok: false, error: 'Bu hesabın oturumu başka bir Windows kullanıcısı ya da bilgisayar için şifrelenmiş; yeniden giriş yapman gerekiyor.' };
    if (s.ready && s.engine) return { ok: true, persona: s.engine.persona, steamID: s.engine.steamID };
    // The engine of the account is reconnecting on its own (a drop, or a first logon that failed): a page that asked for the connection gets "not connected"
    // and no second engine. A second one logged on next to the first; Steam drops one of two sessions of an account (LogonSessionReplaced), and the two fought.
    if (s.engine && s.engine.reconnecting && s.engine.reconnecting()) return { ok: false, error: 'Bağlı değil.' };
    // An engine that gave up (the attempt limit, another session) is shut down before a new one is made, so it can never come back next to it.
    if (s.engine && !s.ready) { try { s.engine.logOff(); } catch (_) {} }
    // DO NOT OPEN A SECOND LOGON FOR THE SAME ACCOUNT. The old code short-circuited only if the session was
    // COMPLETE; when `accounts:connectAll` at startup and the pages' `engine:connect`
    // call clashed, two SteamEngines logged on at once. When Steam sees a second client
    // session for an account it drops the first → LogonSessionReplaced, the engine was left disconnected
    // and the pages said "Not connected.". If a connection is in progress its result is shared.
    if (s.connecting) return s.connecting;
    s.connecting = (async () => {
    // First logon: one attempt if reconnecting is off, three if on (2 s, 4 s apart). Drops after the logon
    // is established are caught by the engine's own loop (with the limit in Settings).
    const tries = ctx.settings.reconnectPolicy === 'off' ? 1 : 3;
    let lastErr = null, lastEngine = null;
    await windowOpened;
    const SteamEngine = steamEngineClass();
    for (let i = 0; i < tries; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i - 1)));
      // The currency does NOT come from the SETTING but from the account's wallet (the 'wallet' event at logon fills it).
      // The currency is read from the Steam market session; it cannot be chosen in the settings.
      const eng = new SteamEngine();
      lastEngine = eng;
      eng.reconnectLimit = ctx.reconnectLimit();
      eng.parentalPin = ctx.accountData(entry.steamID).parentalPin || '';
      try { eng.setProxy(ctx.accountData(entry.steamID).proxyUrl); }
      catch (e) { log('error', '[' + entry.accountName + '] proxy not used, connection stopped: ' + e.message); return { ok: false, error: e.message }; }
      // G3: carry drop/reconnect events to the interface
      ctx.bindConnectionState(eng, entry.steamID);
      ctx.applyChatSettings(eng);
      // Incoming chat message: it lands on the interface and the notification under the name of the account it arrived on.
      eng.onChatMessage = (m) => {
        log('info', `[${entry.accountName}] message: ${m.persona || m.from}`);
        if (ctx.win && !ctx.win.isDestroyed()) {
          ctx.win.webContents.send('chat:message', { ...m, account: entry.accountName, steamID: entry.steamID });
        }
        if (ctx.settings.notifications !== false && ctx.settings.notifyChat !== false && !ctx.isQuietHour()) {
          try {
            if (Notification.isSupported()) {
              new Notification({
                title: (m.persona || 'Steam') + (m.replied ? ' · ' + ct('otomatik yanıtlandı') : ''),
                body: m.message.slice(0, 220),
                icon: fs.existsSync(NOTIF_ICON) ? NOTIF_ICON : undefined,
              }).show();
            }
          } catch (_) {}
        }
      };
      try {
        eng.applyPrivacy(ctx.personaOf(entry.steamID), ctx.hideNameOf(entry.steamID));   // kept until the logon: it sends nothing before
        const info = await eng.logOn(entry.refreshToken, ctx.personaOf(entry.steamID));
        s.engine = eng; s.ready = true;
        log('info', `[${entry.accountName}] session opened`);
        ctx.resumeKeyQueue(entry.steamID);
        ctx.resumeAfterConnect(entry.steamID);
        syncActive();
        return { ok: true, persona: info.persona, steamID: info.steamID };
      } catch (e) {
        lastErr = e;
        log('error', `[${entry.accountName}] logOn error: ${e.message}`);
        // A failed attempt's socket must not stay open in the background - the next attempt should start clean
        try { eng.user.logOff(); } catch (_) {}
      }
    }
    s.ready = false;
    // The first logon failed (no network when the app started, Steam down). Before 1.7.8 the account then stayed unconnected until the app was restarted; now the
    // last engine keeps trying in the background as after a drop, and when it logs on bindConnectionState does what is done above (status 'connected', first).
    if (lastEngine && ctx.settings.reconnectPolicy !== 'off') {
      s.engine = lastEngine;
      lastEngine.startReconnecting(entry.refreshToken, ctx.personaOf(entry.steamID));
      log('warn', `[${entry.accountName}] first logon failed, trying again in the background`, true);
    }
    return { ok: false, error: lastErr ? lastErr.message : 'Bağlanılamadı.' };
    })();
    try { return await s.connecting; }
    finally { s.connecting = null; }
  }

  // Connects the active account. (Other accounts are connected with accounts:connectAll / account switching.)
  ipcMain.handle('engine:connect', async () => {
    const sess = hasSession();
    if (!sess) return { ok: false, error: 'Oturum yok, tekrar giriş yap.' };
    if (!ctx.activeSteamID) { ctx.activeSteamID = sess.steamID; ctx.accountDataMigration(); }
    const entry = loadAccounts().find((a) => a.steamID === ctx.activeSteamID) || sess;
    const r = await connectAccount(entry);
    syncActive();
    return r;
  });

  return { accounts, applyActiveProxy, connectAccount, disconnectAll, syncActive };
};
