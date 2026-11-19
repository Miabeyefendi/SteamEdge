// The connection state of every account's engine: what it reports goes to the log, connection.log, the statistics counters and the window,
// and the window's "Reconnect" button and connection status. Moved out of accountjobs.js unchanged.

module.exports = function init(ctx) {
  const { accountEvent, accountRunning, accounts, earning, handleUninterruptedRun, ipcMain, log, logger, resumeFarm, sendRaw, statsHour, syncActive } = ctx;

  // G3: Carries the engine's connection state to the interface. A connection that dropped at run time
  // used to be reported nowhere; the user looked at "running" for hours and
  // actually earned nothing.
  function bindConnectionState(eng, steamID) {
    // A game of the account is open on another device (the Steam client): the engine holds its games until it ends. Told to the log, connection.log and the page.
    eng.onPlaying = (blocked, appid) => {
      const s = accounts.get(steamID);
      if (s && s.engine && s.engine !== eng && !s.connecting) return;
      log('info', '[' + steamID + '] ' + (blocked ? 'a game of this account is open on another device' + (appid ? ' (' + appid + ')' : '') + ', the games wait' : 'the other device stopped playing, the games are open again'));
      logger.connection(steamID, blocked ? 'blocked' : 'unblocked', appid ? { appid: +appid } : null);
      sendRaw('engine:playing', { steamID, blocked: !!blocked, appid: appid || null, activeIds: steamID === ctx.activeSteamID });
      ctx.holdCounters(steamID, !!blocked);
    };
    eng.onStatus = (status, extra) => {
      const s = accounts.get(steamID);
      // An engine that is not the account's any more says nothing about it: an old one that still reported "reconnecting" set the account to "not connected"
      // while the new one worked. (During connectAccount the new one is not s.engine yet; its statuses count.)
      if (s && s.engine && s.engine !== eng && !s.connecting) return;
      if (s) {
        // The counters must not count the downtime: first the time up to that moment is written.
        if (status !== 'connected') statsHour(steamID);
        s.ready = (status === 'connected');
        if (s.ready) { s.lastConnection = Date.now(); s.statLast = Date.now(); s.statReady = true; }
        // A long drop splits the uninterrupted run; one shorter than a minute does not (see handleUninterruptedRun).
        if (accountRunning(s)) handleUninterruptedRun(steamID, s.ready);
        ctx.syncConnectionChanged(steamID, earning(s));
        // A card farm paused for a job that ended while the connection was down could not start then (resumeFarm needs a connection) and stayed paused for
        // good, blocking the schedule and the resume of jobs too. It is given back when the connection is; resumeFarm leaves it paused if that job still runs.
        if (s.ready && s.pendingFarm) resumeFarm(steamID);
        // the key queue waits 30 s at a time while the connection is down and showed "Not connected" until its next try: it goes on as soon as the connection is back
        if (s.ready && s.keys && s.keys.running && s.keys.error === 'Bağlı değil.') { s.keys.error = null; ctx.keyChanged(steamID); if (s.keys.cancelSleep) s.keys.cancelSleep(); }
      }
      if (steamID === ctx.activeSteamID) { ctx.engineReady = (status === 'connected'); }
      // Log text. The interface builds the text in its own language from the fields (condition, cause, attemptCount, waitMs,
      // limitValue, gameEntries); the text here is only for the log file.
      const message = status === 'dropped'
        ? ('Steam connection dropped: ' + (extra.cause || '?'))
        : status === 'connecting'
          ? (extra.trying
              ? ('reconnecting: attempt ' + extra.attemptCount + ' started (deadline ' + Math.round((extra.deadlineMs || 0) / 1000) + ' s)')
              : ('reconnecting (attempt ' + extra.attemptCount + ', in ' + Math.round((extra.waitMs || 0) / 1000) + ' s)' + (extra.lastFailure ? ', last: ' + extra.lastFailure : '')))
          : status === 'abandoned'
            ? ('reconnecting stopped' + (extra.permanent ? (' (permanent: ' + (extra.cause || '?') + ')') : (' (' + (extra.attemptCount || 0) + ' attempts)')))
            : status === 'connected' && extra.reconnected
              ? ('reconnected, ' + (extra.gameEntries || 0) + ' games reopened')
              : 'connected';
      log(status === 'dropped' || status === 'abandoned' ? 'warn' : 'info', '[' + steamID + '] ' + message);
      // connection.log keeps every one of these whatever the level (the countdown between attempts is one "waiting" line, not one per second)
      if (status === 'dropped') {
        if (s) { s.droppedAt = Date.now(); s.lastAttempt = 0; }
        logger.connection(steamID, 'dropped', { cause: extra.cause });
      } else if (status === 'connecting') {
        if (extra.trying && s) s.lastAttempt = extra.attemptCount || 0;
        logger.connection(steamID, extra.trying ? 'attempt' : 'waiting', extra.trying
          ? { attempt: extra.attemptCount, deadlineMs: extra.deadlineMs }
          : { attempt: extra.attemptCount, nextMs: extra.waitMs, cause: extra.lastFailure });
      } else if (status === 'abandoned') {
        logger.connection(steamID, 'abandoned', { attempts: extra.attemptCount || 0, permanent: !!extra.permanent, cause: extra.cause });
      } else if (status === 'connected') {
        logger.connection(steamID, extra.reconnected ? 'reconnected' : 'connected', extra.reconnected
          ? { games: extra.gameEntries || 0, attempts: (s && s.lastAttempt) || 0, downMs: s && s.droppedAt ? Date.now() - s.droppedAt : null }
          : null);
        if (s) { s.droppedAt = null; s.lastAttempt = 0; }
      }
      // The first session of an account whose first logon failed (no network at start) and that the engine's own loop opened later: what connectAccount does
      // after a logon is done now
      if (status === 'connected' && extra.first && s && s.engine === eng) {
        ctx.resumeKeyQueue(steamID);
        ctx.resumeAfterConnect(steamID);
        syncActive();
      }
      const s2 = accounts.get(steamID);
      if (s2) s2.connectionStatus = { condition: status, ts: Date.now(), ...extra };
      sendRaw('engine:status', { steamID, condition: status, messageText: message, activeIds: steamID === ctx.activeSteamID, limitValue: eng.reconnectLimit, ...extra });
      // a dead token is not "reconnecting stopped": the account is marked and the page offers a sign-in for it (accounts.js markNeedsLogin)
      if (status === 'abandoned' && extra.tokenInvalid) ctx.markNeedsLogin(steamID, extra.eresult);
      else if (status === 'abandoned') {
        accountEvent(steamID, {
          typeName: 'connectionAbandoned', permanent: !!extra.permanent, attemptCount: extra.attemptCount || 0, cause: extra.cause || '',
          feedEntry: { kind: 'error', title: 'Steam Bağlantısı', text: extra.permanent ? 'Steam oturumu kapandı, yeniden bağlanılmıyor.' : 'Yeniden bağlanma denemeleri bitti.', status: 'Hata' },
        });
      }
    };
  }
  // The "Reconnect" button in the interface: restarts the attempts of an engine that gave up.
  ipcMain.handle('engine:reconnect', () => {
    if (needsLogin(ctx.activeSteamID)) return { ok: false, needsLogin: true, error: 'Bu hesabın Steam oturumu kapandı; yeniden giriş yap.' };
    const s = accounts.get(ctx.activeSteamID);
    if (!s || !s.engine) return { ok: false, error: 'Bağlı değil.' };
    if (s.ready) return { ok: true, alreadyConnected: true };
    s.engine.tryReconnect(true);
    return { ok: true };
  });
  // The connection of the account on screen (Settings > Account status). Not a guess, the last thing the engine reported.
  ipcMain.handle('engine:connectionStatus', () => {
    if (ctx.activeSteamID && needsLogin(ctx.activeSteamID)) return { condition: 'abandoned', permanent: true, tokenInvalid: true, needsLogin: true };
    const s = ctx.activeSteamID ? accounts.get(ctx.activeSteamID) : null;
    if (!s || !s.engine) return { condition: 'none' };
    if (s.ready) return { condition: 'connected', ts: s.lastConnection || null, playingBlocked: !!s.engine.playingBlocked };
    return s.connectionStatus || { condition: 'connecting' };
  });

  // The account waits for a sign-in (its slot knows it once it was tried; after a restart only accounts.json does)
  function needsLogin(steamID) {
    const s = accounts.get(steamID);
    if (s && s.needsLogin) return true;
    const entry = ctx.loadAccounts().find((a) => a.steamID === steamID);
    return !!(entry && (entry.needsLogin || entry.locked));
  }

  return { bindConnectionState };
};
