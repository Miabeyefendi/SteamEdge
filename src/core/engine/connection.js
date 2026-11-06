// Moved out of the SteamEngine class unchanged. The methods are added to its prototype in steamEngine.js.
module.exports = function engine_connection({ SteamUser, SteamEngine }) {
  return {
    _reportStatus(status, extra) {
      if (this.onStatus) { try { this.onStatus(status, extra || {}); } catch (_) {} }
    },

    // Drop/error listeners. Flagged so they are not added again every time logOn is called; an instance made later (_newUser) gets them too.
    _setupDisconnectListeners() {
      if (this._listenerSetUp) return;
      this._listenerSetUp = true;
      this._attachRunListeners(this.user);
    },

    // Every listener checks that its instance is still the one in use: an instance that was replaced says nothing any more.
    _attachRunListeners(user) {
      const broke = (cause, eresult) => {
        if (user !== this.user || this._wasShutDown) return;
        const wasUp = this.isConnected;
        this._clearAttempt();
        this.isConnected = false;
        this.cookies = null;             // the web session dropped too, it will be fetched again
        // Drops where trying again is pointless or harmful: the logon token is no longer valid
        // (trying only collects rejections) or the same account was replaced by another session (two
        // apps drop each other in turn and fight). It does not say "Dropped, reconnecting";
        // it says directly that it gave up, together with the reason.
        if (SteamEngine.PERMANENT_DISCONNECT.has(+eresult)) {
          this.gaveUp = true; this.permanentDisconnect = true;
          this._stopProbe();
          this._reportStatus('abandoned', { permanent: true, eresult: +eresult, cause: String(cause || '') });
          return;
        }
        // A drop of a working connection is told once; an attempt that failed while the connection is down only moves on to the next one (it used to say
        // "dropped" again on every failed attempt, a notification each time).
        // Another session started a game on this account (the user opened one in the Steam client): the connection comes back, the games wait for it
        if (+eresult === SteamUser.EResult.LoggedInElsewhere) this._setPlayingBlocked(true, null);
        if (wasUp) this._reportStatus('dropped', { cause: String(cause || ''), eresult: eresult || null });
        this._lastFailure = String(cause || '');
        this._scheduleReconnect();
      };

      user.on('disconnected', (eresult, msg) => broke(msg || ('EResult ' + eresult), eresult));
      user.on('error', (e) => broke((e && e.message) || 'bilinmeyen hata', e && e.eresult));

      // After reconnecting, the web session and the games do NOT come back on their own.
      user.on('loggedOn', () => {
        if (user !== this.user) return;
        this._clearAttempt();
        this._stopProbe();
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this.isConnected = true;
        this._reconnectAttempt = 0;
        this.gaveUp = false; this.permanentDisconnect = false;
        const first = !this._everConnected;
        this._everConnected = true;
        try { this.steamID = this.user.steamID.getSteamID64(); } catch (_) {}
        this._connectedAt = Date.now();
        this._applyPersona();
        try { this.user.webLogOn(); } catch (_) {}
        // Reopen the games that were open before the drop - the real loss was here. Not while a game of the account is open elsewhere.
        this._resendGames();
        this._reportStatus('connected', { reconnected: !first, first, gameEntries: (this._playing || []).length });
      });
      // Steam says whether another session of the account is playing; it is told after a logon and whenever that changes
      user.on('playingState', (blocked, appid) => {
        if (user !== this.user) return;
        this._setPlayingBlocked(!!blocked, appid || null);
      });
      user.on('webSession', (_sid, cookies) => {
        if (user !== this.user) return;
        this.cookies = cookies;
        // a session first opened by the background loop (no network when the app started) still has to verify the market currency once
        if (!this._currencyChecked) { this._currencyChecked = true; this.detectMarketCurrency().catch(() => {}); }
        this.parentalState = null;
        if (this.parentalPin) {
          this.unlockParental(this.parentalPin)
            .then(() => { this.parentalState = 'unlocked'; })
            .catch(() => { this.parentalState = 'rejected'; });
        }
      });
    },

    _clearAttempt() {
      if (this._attemptTimer) { clearTimeout(this._attemptTimer); this._attemptTimer = null; }
    },

    // Throws away an instance that is busy or stuck and puts a fresh one in its place. Its listeners go first, so nothing it does later reaches us; an error it
    // raises later has a listener that ignores it (an 'error' without one would stop the app).
    _replaceUser() {
      const old = this.user;
      try { old.removeAllListeners(); } catch (_) {}
      try { old.on('error', () => {}); } catch (_) {}
      try { old.logOff(); } catch (_) {}
      this.user = this._newUser();
    },

    _scheduleReconnect() {
      if (this._wasShutDown || this._reconnectTimer || this._attemptTimer) return;
      if (!this._refreshToken) return;
      const bound = this.reconnectLimit;
      // "Off" in the settings: no attempt at all
      if (bound === 0) {
        this.gaveUp = true;
        this._stopProbe();
        this._reportStatus('abandoned', { permanent: false, attemptCount: this._reconnectAttempt, limitValue: bound });
        return;
      }
      // A limit (10 or 3 attempts) is the number of quick attempts; after them the loop goes on every SLOW_WAIT_MS. It used to stop for good: with 3 attempts
      // a drop longer than a minute left the account disconnected until the app was restarted (measured on a real account, 1.7.8).
      const slow = bound != null && this._reconnectAttempt >= bound;
      this._reconnectAttempt++;
      // Exponential backoff up to a minute: Steam does not accept right away after transient problems and trying every second makes it worse, but five minutes
      // (before 1.7.8) left the app waiting long after the network was back.
      const wait = slow ? SteamEngine.SLOW_WAIT_MS : Math.min(SteamEngine.RECONNECT_MAX_WAIT_MS, 5000 * Math.pow(2, Math.min(6, this._reconnectAttempt - 1)));
      this._reportStatus('connecting', { attemptCount: this._reconnectAttempt, waitMs: wait, nextAt: Date.now() + wait, slow, lastFailure: this._lastFailure || null });
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this._attemptNow();
      }, wait);
      this._startProbe();
    },

    // While it waits for the next attempt (up to a minute, five after the quick attempts of a limit) the loop looks every PROBE_MS whether Steam answers at all
    // (one small web request through the account's proxy). When it saw the network down and Steam answers again, the attempt is made at once: before, a network
    // back after the quick attempts of a limit waited up to five minutes for it (measured on a real account). When the network was up all along (Steam itself
    // does not take the logon, maintenance) the wait is left as it is, so Steam is not pressed.
    _startProbe() {
      if (this._probeTimer) return;
      this._probeSawDown = false;
      this._probeTimer = setInterval(async () => {
        if (!this._reconnectTimer || this._probing || this._wasShutDown) return;
        this._probing = true;
        let up = false;
        try { up = await this._steamReachable(); } catch (_) { up = false; }
        this._probing = false;
        if (!up) { this._probeSawDown = true; return; }
        if (this._probeSawDown && this._reconnectTimer && !this.isConnected) {
          this._probeSawDown = false;
          clearTimeout(this._reconnectTimer); this._reconnectTimer = null;
          this._lastFailure = 'network back';
          this._attemptNow();
        }
      }, SteamEngine.PROBE_MS);
    },

    _stopProbe() {
      if (this._probeTimer) { clearInterval(this._probeTimer); this._probeTimer = null; }
    },

    // Whether Steam's web API answers at all (any HTTP status), through the account's proxy
    async _steamReachable() {
      try {
        const r = await this._fetch('https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/', { signal: AbortSignal.timeout(8000) });
        return !!(r && r.status);
      } catch (_) { return false; }
    },

    // One attempt, with a deadline. Before 1.7.8 the loop called logOn and waited for an answer; steam-user retries a connection it cannot make on its own and
    // says nothing, so when no answer came the loop never tried again and the strip said "reconnecting" for hours. Now an attempt that has not logged on by the
    // deadline is thrown away with its instance and the next one is scheduled; logOn is never called on an instance that is still busy.
    _attemptNow() {
      if (this._wasShutDown || this.isConnected) return;
      if (this._recoverIfOnline()) return;       // steam-user logged on again by itself while we waited
      if (this.user.steamID || this.user._connecting) this._replaceUser();
      this._reportStatus('connecting', { attemptCount: this._reconnectAttempt || 1, trying: true, deadlineMs: SteamEngine.ATTEMPT_TIMEOUT_MS });
      this._attemptTimer = setTimeout(() => {
        this._attemptTimer = null;
        if (this._wasShutDown || this.isConnected) return;
        if (this._recoverIfOnline()) return;
        this._lastFailure = 'no answer by the deadline';
        this._replaceUser();
        this._scheduleReconnect();
      }, SteamEngine.ATTEMPT_TIMEOUT_MS);
      try { this.user.logOn({ refreshToken: this._refreshToken }); }
      catch (_) { this._clearAttempt(); this._replaceUser(); this._scheduleReconnect(); }
    },

    // The session can be back without our own attempt having done it: steam-user logs on again by itself after some drops, and an error that arrives
    // after the logon (the attempt of our timer meeting a session that is already open) sets "not connected" on a live session. The state then stayed
    // "reconnecting" for good while the connection worked. If Steam says there is a session, we are connected: say so, once.
    _recoverIfOnline() {
      if (this._wasShutDown || this.isConnected) return false;
      if (!(this.user && this.user.steamID)) return false;
      this.isConnected = true;
      this._reconnectAttempt = 0;
      this.gaveUp = false; this.permanentDisconnect = false;
      this._clearAttempt();
      this._stopProbe();
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      const first = !this._everConnected;
      this._everConnected = true;
      this._applyPersona();     // a session that came back without our own logon handler still has Steam's default (offline)
      try { this.user.webLogOn(); } catch (_) {}
      this._resendGames();
      this._reportStatus('connected', { reconnected: !first, first, gameEntries: (this._playing || []).length });
      return true;
    },

    // Restarts a loop that gave up: the user said "Reconnect" or the attempt limit was raised
    // in the settings. manual: also tries after a permanent drop (the user may have closed the other session), and at once.
    tryReconnect(manual) {
      if (this._wasShutDown || this.isConnected) return;
      if (this.permanentDisconnect && !manual) return;
      this.gaveUp = false; this.permanentDisconnect = false;
      this._reconnectAttempt = 0;
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      this._clearAttempt();
      const bound = this.reconnectLimit;
      if (bound === 0 && !manual) return;
      if (manual) { this._reconnectAttempt = 1; this._attemptNow(); return; }
      this._scheduleReconnect();
    },

    // The computer woke up or was unlocked: the network is usually back, and a minute of backoff (or an attempt that began before the sleep and will never answer)
    // only delays it. A loop that gave up (limit, permanent drop) is left alone.
    retryNow() {
      if (!this.reconnecting()) return;
      if (this._attemptTimer) { this._clearAttempt(); this._replaceUser(); }
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      this._reconnectAttempt = 1;
      this._attemptNow();
    },

    // The first logon failed (no network when the app started, Steam down): keep trying in the background as after a drop. Before 1.7.8 the app gave up after
    // three tries in six seconds and never connected until it was restarted.
    startReconnecting(refreshToken, persona) {
      this._refreshToken = refreshToken;
      this._persona = SteamEngine.personaName(persona);
      this.isConnected = false;
      this._replaceUser();                 // the instance of the failed logon may still be busy
      this._setupDisconnectListeners();
      this._startPulse();
      this._scheduleReconnect();
    },

    // Whether this engine still has a loop of its own that will bring the session back (main must not open a second logon for the account then).
    reconnecting() {
      return !this._wasShutDown && !this.isConnected && !this.gaveUp && !!this._refreshToken;
    },

    // Heartbeat: we say "I am connected" but are the games really open? steam-user's own
    // state and our expectation can diverge (silent drop). Look every 60 seconds.
    _startPulse() {
      if (this._pulseTimer) return;
      this._pulseTimer = setInterval(() => {
        if (this._wasShutDown) return;
        if (this._recoverIfOnline()) return;           // not connected on our side, a session on Steam's: it is back
        // the last safety: not connected, not given up, and neither a wait nor an attempt under way means the loop has stopped somewhere; start it again
        if (this.reconnecting() && !this._reconnectTimer && !this._attemptTimer) { this._scheduleReconnect(); return; }
        const trulyConnected = !!(this.user && this.user.steamID);
        if (this.isConnected && !trulyConnected) {
          this.isConnected = false;
          this._reportStatus('dropped', { cause: 'nabız: oturum yok' });
          this._scheduleReconnect();
          return;
        }
        // If the game should be open but is closed, send it again (cheap, no side effects)
        // Steam's word on the other session is kept by the instance; when this session never got one (a logon after LoggedInElsewhere, two minutes and no word),
        // the games are tried once again: if the other game still runs Steam says so, and the next try waits another two minutes, not a few seconds.
        if (this.isConnected && this.playingBlocked && this.user) {
          const word = this.user.playingState;
          if (word ? !word.blocked : Date.now() - (this._connectedAt || 0) > SteamEngine.PLAYING_WAIT_MS) this._setPlayingBlocked(false, null);
        }
        if (this.isConnected) this._resendGames();
      }, 60000);
    },

    _stopPulse() {
      if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; }
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      this._clearAttempt();
      this._stopProbe();
    },

    // The game name arrives in the badge page embedded with JavaScript string escapes:
    //   ShowCardDropInfo( &quot;Need for Speed™ Heat&quot;, ... )
    // Both HTML entities and \uXXXX / \" / \\ escapes have to be decoded, otherwise the
    // interface showed raw text like "Need for Speed™".
  };
};
