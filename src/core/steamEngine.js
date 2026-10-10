const SteamUser = require('steam-user');
const translation = require('./translation');
// steam-user's internal protobufs map doesn't register the user-stats messages, so we encode/decode
// them ourselves from its generated schema and hand raw buffers to _send.
const Schema = require('steam-user/protobufs/generated/_load.js');

// Headless card-farm engine on node-steam-user. Logs onto the CM with a refresh token, opens a
// web session (for badge/inventory scraping) and drives gamesPlayed() to idle games so Steam
// drops trading cards. No Steam client required.
class SteamEngine {
  constructor() {
    // The loop below does the reconnecting, not steam-user's own loop. When both
    // run, two logon attempts happen at once and one dropped with "Already attempting to log
    // on"; the attempt limit and the "Off" option in Settings also did not reach steam-user's
    // own attempts.
    this.user = new SteamUser({ autoRelogin: false });
    this.cookies = null;
    this.steamID = null;
    this.persona = null;
    this._playing = [];
    this._owners = new Map();    // job name -> the games that job opened (see play)
    this._offline = false;
    this._hideGameName = false;
    // The account's wallet currency. It starts as UNKNOWN - giving it a default made us fetch prices
    // from Steam in the wrong currency when the wallet event did not arrive and show them with the right
    // currency's symbol (e.g. a $ in front of TRY amounts).
    this.walletCurrency = null;
    this._currency = null;
    // Callback for an incoming Steam chat message - assigned by main.js. (SteamEngine is not an EventEmitter.)
    this.onChatMessage = null;
    this._autoReply = null;        // { text, cooldownMs } - null means no automatic reply
    this._repliedAt = new Map();   // steamID64 -> time of the last automatic reply
    // ---- G3: connection state ----
    // There used to be no 'disconnected'/'error' listener at run time. When Steam dropped the
    // connection the app did not notice AT ALL, the interface kept saying "running" and the games were
    // actually closed. Hours of silent loss.
    this.isConnected = false;
    this._refreshToken = null;
    this._offlineChoice = false;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._wasShutDown = false;       // do not reconnect if logOff() was called
    // Settings > "Reconnect if the connection drops" (set by main): null = unlimited, 0 = off,
    // n = at most n attempts. When the limit is reached 'abandoned' is reported and the loop stops.
    this.reconnectLimit = null;
    this.gaveUp = false;
    this.permanentDisconnect = false;      // a drop where trying again is pointless (below)
    this.onStatus = null;           // (status) => void   status: 'connected'|'dropped'|'connecting'|'abandoned'
    this._pulseTimer = null;
  }
  // Only puts in a guess while the wallet currency is still unknown; once the wallet event arrives
  // its value is taken as final and the value here is overwritten.
  setCurrency(code) { if (!this.walletCurrency && code) this._currency = code; }
  // The ONE currency prices are fetched and shown in. null = not known yet.
  currencyCode() { return this.walletCurrency || this._currency || null; }

  // ---- SHARED STEAM REQUEST LAYER ----
  // Every call used to use a raw `fetch`. When the network dropped the user got a meaningless text like `TypeError: fetch
  // failed`, and transient errors were never retried;
  // this was the source of the "achievements sometimes never load" complaint.
  // Here: a timeout, exponential backoff on transient errors and an understandable error text.
  // The text is built in the interface language (translation: main process dictionary). It used to be written
  // without Turkish letters and was not translated in any language.
  static errorText(e, whereAt) {
    const m = String((e && (e.codeValue || e.message)) || e || '');
    const place = translation.t(whereAt || 'Steam') + ': ';
    if (/abort|timeout|ETIMEDOUT/i.test(m)) return place + translation.t('İstek zaman aşımına uğradı. Bağlantını kontrol et.');
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return place + translation.t('Sunucuya ulaşılamadı. İnternet bağlantın kesilmiş olabilir.');
    if (/ECONNRESET|ECONNREFUSED|socket hang up|fetch failed/i.test(m)) return place + translation.t('Bağlantı koptu. Birazdan tekrar dene.');
    if (/HTTP 429/.test(m)) return place + translation.t('İstek sınırı aşıldı. Bir dakika bekleyip tekrar dene.');
    if (/HTTP 401|HTTP 403/.test(m)) return place + translation.t('Oturum geçersiz. Çıkış yapıp yeniden giriş yap.');
    if (/HTTP 5\d\d/.test(m)) return place + translation.t('Steam sunucusu şu an yanıt veremiyor.');
    return (whereAt ? place : '') + translation.t(m);
  }

  // Steam community pages and market endpoints localise the response by the account's Steam
  // language. A Chinese error notification in the Turkish interface was seen because of this: the text
  // came from Steam itself, not from the dictionary. The `Steam_Language` cookie pins this choice;
  // the `l=english` parameter does the same for calls without a cookie.
  cookieHeader() {
    const c = this.cookies ? this.cookies.slice() : [];
    c.push('Steam_Language=english');
    return c.join('; ');
  }

  // If the error text Steam sends still comes out non-Latin it is not shown. It carries information,
  // so we do not drop the text entirely, we only replace the part that cannot be read with a question mark.
  static steamMessage(text, backup) {
    const m = String(text || '').trim();
    if (!m) return backup;
    // ASCII + Latin-1 supplement + Latin Extended A/B: English, German, Spanish and
    // Turkish all fit in this range. Cyrillic, CJK and Arabic do not.
    return /^[\x20-\x7E\u00A0-\u024F\s]+$/.test(m) ? m : backup;
  }

  async _requestItem(url, options = {}, whereAt = 'Steam') {
    const { attemptCount: attemptNo = 3, timeoutLimitMs: timeoutMs = 20000, withCookies: withCookies = true, ...fetchSec } = options;
    const titles = { 'User-Agent': SteamEngine.UA, ...(fetchSec.headers || {}) };
    if (withCookies && this.cookies) titles.Cookie = this.cookieHeader();

    let lastError = null;
    for (let i = 0; i < attemptNo; i++) {
      const trim = new AbortController();
      const counter = setTimeout(() => trim.abort(), timeoutMs);
      try {
        const r = await fetch(url, { ...fetchSec, headers: titles, signal: trim.signal });
        clearTimeout(counter);
        // 429 and 5xx count as transient and are retried. Anything else is an immediate error.
        if (r.status === 429 || r.status >= 500) {
          lastError = new Error('HTTP ' + r.status);
          if (i < attemptNo - 1) { await new Promise((res) => setTimeout(res, 1500 * Math.pow(2, i))); continue; }
          throw lastError;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r;
      } catch (e) {
        clearTimeout(counter);
        lastError = e;
        const temporary = /abort|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|EAI_AGAIN|HTTP 429|HTTP 5\d\d/i
          .test(String(e && e.message));
        if (!temporary || i === attemptNo - 1) break;
        await new Promise((res) => setTimeout(res, 1500 * Math.pow(2, i)));
      }
    }
    const errorInfo = new Error(SteamEngine.errorText(lastError, whereAt));
    errorInfo.rawError = lastError;
    throw errorInfo;
  }

  // Reads the account's MARKET currency straight from the Steam Community Market.
  // Why the protocol's 'wallet' event is not enough: it only arrives for accounts that have a wallet and
  // not always on time; when it did not arrive the currency was guessed and prices were
  // fetched in the wrong currency. The market page embeds the `wallet_currency` field in `g_rgWalletInfo`
  // for a logged in user - exactly the currency the user sees in their market.
  async detectMarketCurrency() {
    if (!this.cookies) return null;
    try {
      const r = await this._requestItem('https://steamcommunity.com/market/?l=english', { attemptCount: 2 }, 'Pazar kuru');
      const html = await r.text();
      this._readWallet(html);
      const m = html.match(/"wallet_currency"\s*:\s*(\d+)/);
      if (!m) return null;
      const code = SteamEngine.currencyName(+m[1]);
      if (!code) return null;
      this.walletCurrency = code;
      this._currency = code;
      return code;
    } catch (_) { return null; }
  }

  // Inputs of the sale fee. Steam embeds these in the page as `g_rgWalletInfo` and its own
  // fee calculation (economy_common.js) works with this object. Only the fee fields are kept;
  // fields like the wallet balance are not kept in memory at all.
  _readWallet(html) {
    const m = String(html || '').match(/g_rgWalletInfo\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return null;
    let rawText;
    try { rawText = JSON.parse(m[1]); } catch (_) { return null; }
    const fields = ['wallet_currency', 'wallet_fee', 'wallet_fee_minimum', 'wallet_fee_percent',
      'wallet_publisher_fee_percent_default', 'wallet_fee_base', 'wallet_market_minimum', 'wallet_currency_increment'];
    const c = {};
    fields.forEach((k) => { if (rawText[k] != null) c[k] = rawText[k]; });
    if (c.wallet_fee_percent == null && c.wallet_publisher_fee_percent_default == null) return null;
    this._wallet = c;
    this._walletTs = Date.now();
    return c;
  }
  // Fee fields. If they are not found on the market page the inventory page is checked (the sale
  // window is there). Kept in memory for one hour.
  async walletInfo() {
    if (this._wallet && Date.now() - (this._walletTs || 0) < 3600000) return this._wallet;
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const r1 = await this._requestItem('https://steamcommunity.com/market/?l=english', { attemptCount: 2 }, 'Pazar');
    if (this._readWallet(await r1.text())) return this._wallet;
    const r2 = await this._requestItem(`https://steamcommunity.com/profiles/${this.steamID}/inventory/?l=english`, { attemptCount: 2 }, 'Envanter');
    if (this._readWallet(await r2.text())) return this._wallet;
    throw new Error(translation.t('Steam cüzdan bilgisi okunamadı'));
  }
  // Automatic reply setting. If text is empty/off only a notification is shown, no reply is written.
  setAutoReply(text, cooldownMinutes) {
    this._autoReply = (text && String(text).trim())
      ? { text: String(text).trim(), cooldownMs: Math.max(1, +cooldownMinutes || 60) * 60000 }
      : null;
  }

  logOn(refreshToken, offline) {
    return new Promise((resolve, reject) => {
      const done = { info: false, web: false };
      const maybe = () => { if (done.info && done.web) resolve({ steamID: this.steamID, persona: this.persona }); };
      this.user.logOn({ refreshToken });
      this.user.once('loggedOn', () => {
        this.steamID = this.user.steamID.getSteamID64();
        // Steam only shows "in game" on the profile / to friends once persona state is Online
        // (Invisible if the "Appear offline" setting is on - friends cannot see the farming).
        // Without this, gamesPlayed() registers at the protocol level but nothing is visible.
        this.user.setPersona(offline ? SteamUser.EPersonaState.Invisible : SteamUser.EPersonaState.Online);
        this.user.webLogOn();
      });
      this.user.once('accountInfo', (name) => { this.persona = name; done.info = true; maybe(); });
      // The account's wallet currency - decides which currency we fetch Steam prices in.
      // (Used when Settings > General > Currency is "Otomatik".)
      this.user.on('wallet', (_hasWallet, currency) => {
        const code = SteamEngine.currencyName(currency);
        // The wallet currency is the FINAL source - it always overrides the earlier guess. (It used to
        // say `this._currency || code`; since _currency is 'TRY' in the constructor the
        // condition never held and prices were fetched in TRY even for a USD account.)
        if (code) { this.walletCurrency = code; this._currency = code; }
      });
      // Incoming friend messages. Nobody could reply while running headless; now the app
      // shows a notification and, if wanted, sends a one-time automatic reply.
      this.user.on('friendMessage', (senderID, message) => {
        const from = senderID && senderID.getSteamID64 ? senderID.getSteamID64() : String(senderID);
        let persona = null;
        try { const u = this.user.users && this.user.users[from]; persona = (u && u.player_name) || null; } catch (_) {}
        let replied = false;
        if (this._autoReply) {
          const last = this._repliedAt.get(from) || 0;
          if (Date.now() - last >= this._autoReply.cooldownMs) {
            this._repliedAt.set(from, Date.now());
            try { this.user.chat.sendFriendMessage(senderID, this._autoReply.text); replied = true; } catch (_) {}
          }
        }
        if (this.onChatMessage) {
          try { this.onChatMessage({ from, persona, message: String(message || ''), replied, ts: Date.now() }); } catch (_) {}
        }
      });
      this.user.once('webSession', (_sid, cookies) => {
        this.cookies = cookies;
        // As soon as the web session opens, verify the market's own currency (see below) - if the wallet
        // event is late or never arrives the prices are still fetched in the right currency.
        this.detectMarketCurrency().catch(() => {});
        done.web = true; maybe();
      });
      this.user.once('error', reject);
      setTimeout(() => reject(new Error(translation.t('Steam sunucusuna giriş zaman aşımına uğradı'))), 25000);
    }).then((r) => {
      // Logon succeeded: set up the permanent listeners (once).
      this._refreshToken = refreshToken;
      this._offlineChoice = !!offline;
      this.isConnected = true;
      this._reconnectAttempt = 0;
      this.gaveUp = false; this.permanentDisconnect = false;
      this._setupDisconnectListeners();
      this._startPulse();
      this._reportStatus('connected');
      return r;
    });
  }

  _reportStatus(status, extra) {
    if (this.onStatus) { try { this.onStatus(status, extra || {}); } catch (_) {} }
  }

  // Drop/error listeners. Flagged so they are not added again every time logOn is called.
  _setupDisconnectListeners() {
    if (this._listenerSetUp) return;
    this._listenerSetUp = true;

    const broke = (cause, eresult) => {
      if (this._wasShutDown) return;
      this.isConnected = false;
      this.cookies = null;             // the web session dropped too, it will be fetched again
      // Drops where trying again is pointless or harmful: the logon token is no longer valid
      // (trying only collects rejections) or the same account was replaced by another session (two
      // apps drop each other in turn and fight). It does not say "Dropped, reconnecting";
      // it says directly that it gave up, together with the reason.
      if (SteamEngine.PERMANENT_DISCONNECT.has(+eresult)) {
        this.gaveUp = true; this.permanentDisconnect = true;
        this._reportStatus('abandoned', { permanent: true, eresult: +eresult, cause: String(cause || '') });
        return;
      }
      this._reportStatus('dropped', { cause: String(cause || ''), eresult: eresult || null });
      this._scheduleReconnect();
    };

    this.user.on('disconnected', (eresult, msg) => broke(msg || ('EResult ' + eresult), eresult));
    this.user.on('error', (e) => broke((e && e.message) || 'bilinmeyen hata', e && e.eresult));

    // After reconnecting, the web session and the games do NOT come back on their own.
    this.user.on('loggedOn', () => {
      this.isConnected = true;
      this._reconnectAttempt = 0;
      this.gaveUp = false; this.permanentDisconnect = false;
      try { this.steamID = this.user.steamID.getSteamID64(); } catch (_) {}
      try {
        this.user.setPersona(this._offlineChoice ? SteamUser.EPersonaState.Invisible : SteamUser.EPersonaState.Online);
      } catch (_) {}
      try { this.user.webLogOn(); } catch (_) {}
      // Reopen the games that were open before the drop - the real loss was here.
      if (this._playing && this._playing.length) {
        try { this.user.gamesPlayed(this._playing); } catch (_) {}
      }
      this._reportStatus('connected', { reconnected: true, gameEntries: (this._playing || []).length });
    });
    this.user.on('webSession', (_sid, cookies) => {
      this.cookies = cookies;
      this.parentalState = null;
      if (this.parentalPin) {
        this.unlockParental(this.parentalPin)
          .then(() => { this.parentalState = 'unlocked'; })
          .catch(() => { this.parentalState = 'rejected'; });
      }
    });
  }

  _scheduleReconnect() {
    if (this._wasShutDown || this._reconnectTimer) return;
    if (!this._refreshToken) return;
    const bound = this.reconnectLimit;
    if (bound != null && this._reconnectAttempt >= bound) {
      this.gaveUp = true;
      this._reportStatus('abandoned', { permanent: false, attemptCount: this._reconnectAttempt, limitValue: bound });
      return;
    }
    this._reconnectAttempt++;
    // Exponential backoff, at most 5 minutes. Steam does not accept right away after
    // transient problems; trying every second makes it worse.
    const wait = Math.min(300000, 5000 * Math.pow(2, Math.min(6, this._reconnectAttempt - 1)));
    this._reportStatus('connecting', { attemptCount: this._reconnectAttempt, waitMs: wait });
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._wasShutDown) return;
      try { this.user.logOn({ refreshToken: this._refreshToken }); }
      catch (_) { this._scheduleReconnect(); }
    }, wait);
  }

  // Restarts a loop that gave up: the user said "Reconnect" or the attempt limit was raised
  // in the settings. manual: also tries after a permanent drop (the user may have closed the other session).
  tryReconnect(manual) {
    if (this._wasShutDown || this.isConnected) return;
    if (this.permanentDisconnect && !manual) return;
    this.gaveUp = false; this.permanentDisconnect = false;
    this._reconnectAttempt = 0;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    const bound = this.reconnectLimit;
    if (bound === 0 && !manual) return;
    // If requested by hand one attempt is made even when the limit is 0 (off).
    if (bound === 0) {
      this._reconnectAttempt = 1;
      this._reportStatus('connecting', { attemptCount: 1, waitMs: 1000 });
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        if (this._wasShutDown) return;
        try { this.user.logOn({ refreshToken: this._refreshToken }); } catch (_) {}
      }, 1000);
      return;
    }
    this._scheduleReconnect();
  }

  // Heartbeat: we say "I am connected" but are the games really open? steam-user's own
  // state and our expectation can diverge (silent drop). Look every 60 seconds.
  _startPulse() {
    if (this._pulseTimer) return;
    this._pulseTimer = setInterval(() => {
      if (this._wasShutDown) return;
      const trulyConnected = !!(this.user && this.user.steamID);
      if (this.isConnected && !trulyConnected) {
        this.isConnected = false;
        this._reportStatus('dropped', { cause: 'nabız: oturum yok' });
        this._scheduleReconnect();
        return;
      }
      // If the game should be open but is closed, send it again (cheap, no side effects)
      if (this.isConnected && this._playing && this._playing.length) {
        try { this.user.gamesPlayed(this._playing); } catch (_) {}
      }
    }, 60000);
  }

  _stopPulse() {
    if (this._pulseTimer) { clearInterval(this._pulseTimer); this._pulseTimer = null; }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
  }

  // The game name arrives in the badge page embedded with JavaScript string escapes:
  //   ShowCardDropInfo( &quot;Need for Speed™ Heat&quot;, ... )
  // Both HTML entities and \uXXXX / \" / \\ escapes have to be decoded, otherwise the
  // interface showed raw text like "Need for Speed™".
  static decodeGameName(rawText) {
    if (!rawText) return '';
    let s = String(rawText);
    // Numeric entities: &#174; (R) , &#8482; (TM) , &#x2122; ...
    s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
    s = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
    s = s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    s = s.replace(/\\r\\n|\\n|\\r/g, ' ').replace(/\\(["'\\/])/g, '$1');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Scrapes the badges page for games that still have card drops remaining.
  //
  // NOTE: when a page number that does not exist is requested Steam does not return an EMPTY page; it returns the last
  // valid page (or page 1) again. The old code walked p=1..20 blindly and only stopped on "no badge_row at all",
  // so the same games were added to the list 20 times:
  // 2 games -> 40 rows, 5 cards -> 100 cards.
  // Now the page count is read from the pagination box, the loop is also broken if the same appid set
  // comes again, and the result is made unique by appid.
  // If `detay` is given it returns { oyunlar, bitenler }: bitenler are the games whose badge row says "No card drops
  // remaining". The card watcher only removes a game from the queue when Steam SAYS so;
  // not appearing in the list alone does not mean "finished" (the scrape may be incomplete).
  async getDropGames(detay) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const found = new Map();          // appid -> { appid, name, remaining }
    const finished = new Set();
    let lastSignature = null;
    let lastPage = 1;

    for (let p = 1; p <= lastPage && p <= 50; p++) {
      const url = `https://steamcommunity.com/profiles/${this.steamID}/badges/?l=english&p=${p}`;
      const r = await this._requestItem(url, {}, 'Rozet sayfası');
      const html = await r.text();

      if (p === 1) {
        // IS IT THE OWNER'S VIEW? When the web session drops the badge page still opens (the profile is
        // public) but there is NO card drop information. That page reads as "no game has cards left"
        // and card farming would think the whole queue is done. If the session id on the page does not match
        // ours the result is not used and the web session is refreshed.
        // In case Steam changes the format of this variable we must not lock up: if nothing is found at all, we look
        // for the owner-only drop text on the page.
        const sessionInfo = html.match(/g_steamID\s*=\s*("?)(\d{17}|false)\1/);
        const owner = sessionInfo
          ? sessionInfo[2] === String(this.steamID)
          : (/card drops? remaining/i.test(html) || !html.includes('class="badge_row'));
        if (!owner) {
          try { this.user.webLogOn(); } catch (_) {}
          throw new Error(translation.t('Rozet sayfası oturum açılmadan geldi'));
        }
        // Learn the real page count: the largest p value in the pagination links.
        const pages = [...html.matchAll(/[?&]p=(\d+)/g)].map((m) => +m[1]).filter((n) => n > 0 && n < 1000);
        if (pages.length) lastPage = Math.max(...pages);
      }

      const rows = html.split('class="badge_row');
      if (rows.length <= 1) break;                 // a truly empty page

      const thisPage = [];
      for (const row of rows.slice(1)) {
        const app = row.match(/card_drop_info_gamebadge_(\d+)_/) || row.match(/steam:\/\/run\/(\d+)/);
        if (!app) continue;
        thisPage.push(app[1]);
        const appid = +app[1];
        // SINGULAR/PLURAL: Steam writes "1 card drop remaining" when one card is left. The pattern used to
        // look only for "drops"; a game with its last card left dropped off the list and that card was never
        // collected. ASF reads the number independently of the text for the same reason.
        const drop = row.match(/(\d+)\s+card\s+drops?\s+remaining/i);
        if (!drop) {
          if (/No card drops remaining/i.test(row)) finished.add(appid);
          continue;
        }
        if (found.has(appid)) continue;           // do not count the same game a second time
        const nm = row.match(/ShowCardDropInfo\(\s*&quot;([\s\S]*?)&quot;\s*,/)
          || row.match(/ShowCardDropInfo\(\s*&quot;([\s\S]*?)&quot;/);
        const name = nm ? SteamEngine.decodeGameName(nm[1]) : ('App ' + appid);
        found.set(appid, { appid, name: name || ('App ' + appid), remaining: +drop[1] });
      }

      // Stop if Steam returned the same page again (a safety net for when pagination could not be read).
      const signature = thisPage.join(',');
      if (signature && signature === lastSignature) break;
      lastSignature = signature;
    }
    const gameList = [...found.values()];
    found.forEach((_, id) => finished.delete(id));
    return detay ? { gameEntries: gameList, finishedOnes: finished } : gameList;
  }

  // Own Steam profile: avatar, display name and account level - straight from the protocol
  // (getPersonas/getSteamLevels), no Web API key needed. Used to fill the sidebar/account card.
  getProfile() {
    const sid = this.steamID;
    if (!sid) return Promise.reject(new Error(translation.t('Steam oturumu yok')));
    const personas = () => new Promise((res) => this.user.getPersonas([sid], (err, p) => res(err ? null : (p && p[sid]))));
    const levels = () => new Promise((res) => this.user.getSteamLevels([sid], (err, l) => res(err ? null : (l && l[sid]))));
    // The custom address is NOT part of this call. It does not come from the protocol, it is
    // fetched from the profile page and while it was inside Promise.all it held the whole profile reply for its own duration
    // (measured 75-350 ms, up to 8 seconds when Steam is slow). Name, avatar and level
    // must not wait for a web request to be shown on screen; the interface asks for the custom address separately.
    return Promise.all([personas(), levels()]).then(([p, level]) => ({
      steamID: sid,
      persona: (p && p.player_name) || this.persona || null,
      avatar: (p && (p.avatar_url_full || p.avatar_url_medium || p.avatar_url_icon)) || null,
      level: (typeof level === 'number') ? level : null,
    }));
  }

  // Custom profile address (steamcommunity.com/id/<name>). The protocol does not give this;
  // it is in the profile's XML output as <customURL>. The user never changes it,
  // so it is fetched once per session and kept. If it fails it returns null and the
  // interface shows its "not defined" text - nothing breaks.
  async getVanityURL() {
    if (this._vanity !== undefined) return this._vanity;
    this._vanity = null;
    try {
      const r = await this._requestItem(
        `https://steamcommunity.com/profiles/${this.steamID}/?xml=1`,
        { attemptCount: 1, timeoutLimitMs: 8000 },
        'Steam profili',
      );
      const xml = await r.text();
      const m = xml.match(/<customURL>(?:<!\[CDATA\[)?([^\]<]*)/i);
      if (m && m[1] && m[1].trim()) this._vanity = m[1].trim();
    } catch (_) { /* private profile or no network - the custom address is not shown, no problem */ }
    return this._vanity;
  }

  // JWT embedded in the steamLoginSecure cookie from webLogOn (same token shape ASF uses) - lets
  // us call the newer access_token-authenticated Steam Web API endpoints for the logged-in user
  // without a registered dev API key (GetOwnedGames, GetPlayerAchievements, ...).
  _accessToken() {
    if (!this.cookies) return null;
    const secure = this.cookies.find((c) => c.startsWith('steamLoginSecure='));
    if (!secure) return null;
    const raw = decodeURIComponent(secure.split('=').slice(1).join('='));
    const sep = raw.indexOf('||');
    return sep >= 0 ? raw.slice(sep + 2) : raw;
  }

  // Full game library (for the Hour Booster game picker) via the Steam Web API, authenticated
  // with the JWT embedded in the steamLoginSecure cookie from webLogOn (same token shape ASF uses).
  async getOwnedGames() {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const token = this._accessToken();
    if (!token) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?access_token=${encodeURIComponent(token)}&steamid=${this.steamID}&include_appinfo=true&include_played_free_games=true&format=json`;
    const r = await this._requestItem(url, {}, 'Oyun listesi');
    const j = await r.json();
    const games = (j.response && j.response.games) || [];
    // When the privacy setting is "Game details: Private" Steam returns an EMPTY reply; this used to
    // silently show up as "0 games" and the user could not tell why their library was empty.
    // We tell it apart and give a clear message.
    if (!games.length) {
      const countUp = (j.response && typeof j.response.game_count === 'number') ? j.response.game_count : null;
      if (countUp === null || countUp === 0) {
        throw new Error(translation.t('Oyun listesi boş döndü. Steam profilinde Gizlilik > "Oyun ayrıntıları" '
          + 'ayarını Herkese Açık yapman gerekiyor, aksi halde Steam kütüphaneni paylaşmıyor.'));
      }
    }
    return games.map((g) => ({ appid: g.appid, name: g.name, playtimeForever: g.playtime_forever || 0, hasStats: !!g.has_community_visible_stats }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Real inventory (context 753/6 = Steam Community items: cards, backgrounds, emoticons, gems...).
  // count=5000 returns HTTP 400 on some accounts; 2000 is the known-working cap (same limit the
  // old .NET app hit and fixed the same way).
  async getInventory() {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const url = `https://steamcommunity.com/inventory/${this.steamID}/753/6?l=english&count=2000`;
    const r = await this._requestItem(url, {}, 'Envanter');
    const j = await r.json();
    const key = (a) => a.classid + '_' + a.instanceid;
    const descMap = {};
    (j.descriptions || []).forEach((d) => { descMap[key(d)] = d; });

    // item_class ids confirmed against this account's real inventory dump.
    // NOTE: badges ("Rozet") are NOT inventory items - they're a separate Steam profile feature
    // and can never appear here, so the UI disables that filter.
    const TYPE_MAP = {
      item_class_2: 'card',
      item_class_3: 'background',
      item_class_4: 'emoticon',
      item_class_6: 'coupon',
      item_class_8: 'profile',   // Profile Modifier
      item_class_13: 'profile',  // Mini Profile Background
      item_class_14: 'profile',  // Avatar Profile Frame
      item_class_15: 'profile',  // Animated Avatar
      item_class_17: 'profile',  // Startup Movie
    };
    const items = [];
    (j.assets || []).forEach((a, idx) => {
      const d = descMap[key(a)];
      if (!d) return;
      const tags = d.tags || [];
      const classTag = tags.find((t) => t.category === 'item_class');
      const gameTag = tags.find((t) => t.category === 'Game');
      items.push({
        assetId: a.assetid,
        order: idx,                                // Steam's own inventory order
        dedupKey: key(a),                          // same classid+instanceid = visually identical item (duplicate)
        name: d.name,
        marketHashName: d.market_hash_name || null, // needed for priceoverview; null if not marketable
        // 96x96 was too small (blurry on a high DPI screen, squashed in a 150px box in the detail panel).
        // Steam's economy CDN produces the requested size - 330x192 fits the card ratio and is sharp.
        iconUrl: d.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${d.icon_url}/330x192` : null,
        tradable: !!d.tradable,
        marketable: !!d.marketable,
        type: (classTag && TYPE_MAP[classTag.internal_name]) || (/booster pack/i.test(d.type || '') ? 'booster' : /gems?$/i.test(d.type || '') ? 'gems' : 'other'),
        gameName: gameTag ? gameTag.localized_tag_name : null,
        // the game an item belongs to; booster packs need it to be opened
        appid: +d.market_fee_app || ((/^app_(\d+)$/.exec((gameTag && gameTag.internal_name) || '') || [])[1] | 0),
        amount: parseInt(a.amount || '1', 10),
      });
    });
    return items;
  }

  // Steam Community Market price (TRY / "TL", matching the ₺ used elsewhere in the UI).
  // MEASURED RATE LIMIT: Steam serves exactly 20 requests then returns HTTP 429; the window
  // clears after ~30s. main.js batches 20-at-a-time with a cooldown and caches to disk.
  // Returns null on 429 so the caller can retry that item later.
  async getPrice(marketHashName) {
    // Prices are ALWAYS fetched in the account's wallet currency; the interface shows them in the same currency.
    // If the currency is unknown NO GUESS IS MADE - showing an amount fetched in the wrong currency with the right
    // currency's symbol meant silently inflating the numbers 40 times.
    const code = this.currencyCode();
    const cur = code && SteamEngine.CURRENCY[code];
    if (!cur) return { noCurrency: true };
    const url = `https://steamcommunity.com/market/priceoverview/?appid=753&currency=${cur}&l=english&market_hash_name=${encodeURIComponent(marketHashName)}`;
    const r = await fetch(url);
    if (r.status === 429) return { rateLimited: true };
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j.success) return null;
    const toNum = SteamEngine.parseMoney;
    return {
      lowest: j.lowest_price || null,
      median: j.median_price || null,
      lowestValue: toNum(j.lowest_price),
      medianValue: toNum(j.median_price),
      volume: j.volume || null,
    };
  }

  // REALISED SALE HISTORY. An item's "real value" comes from here: listings on sale
  // are not binding (one person can list at 999,999 and nobody buys), whereas
  // pricehistory holds the REAL sales Steam recorded - each record is the median sale price
  // and quantity in that time slot. Amounts are in the account's wallet currency (the endpoint takes no currency
  // parameter, it replies according to the session).
  async getPriceHistory(marketHashName) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const url = `https://steamcommunity.com/market/pricehistory/?appid=753&l=english&market_hash_name=${encodeURIComponent(marketHashName)}`;
    const r = await fetch(url, { headers: { Cookie: this.cookieHeader() } });
    if (r.status === 429) return { rateLimited: true };
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || !j.success || !Array.isArray(j.prices) || !j.prices.length) return null;

    // Steam gives the date as "Jul 30 2026 01: +0" - we drop the trailing hour suffix and parse it.
    const parseTs = (s) => {
      const m = String(s).match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2})/);
      if (!m) return NaN;
      return Date.parse(`${m[1]} ${m[2]} ${m[3]} ${m[4]}:00:00 GMT`);
    };
    const points = j.prices.map(([date, price, qty]) => ({
      ts: parseTs(date), price: +price, qty: parseInt(qty, 10) || 0,
    })).filter((p) => Number.isFinite(p.price) && p.price > 0);
    if (!points.length) return null;

    // Quantity-WEIGHTED median: if 100 units sold at 0.30 and 1 unit at 50,
    // the real market is 0.30. A plain average swings with a single outlier sale, the median does not.
    const weightedMedian = (list) => {
      const arr = list.filter((p) => p.qty > 0).sort((a, b) => a.price - b.price);
      if (!arr.length) return null;
      const total = arr.reduce((s, p) => s + p.qty, 0);
      let acc = 0;
      for (const p of arr) { acc += p.qty; if (acc >= total / 2) return p.price; }
      return arr[arr.length - 1].price;
    };
    const windowStats = (days) => {
      const cut = Date.now() - days * 24 * 60 * 60 * 1000;
      const w = points.filter((p) => Number.isFinite(p.ts) && p.ts >= cut);
      if (!w.length) return null;
      const vol = w.reduce((s, p) => s + p.qty, 0);
      const sum = w.reduce((s, p) => s + p.price * p.qty, 0);
      return {
        days, volume: vol,
        median: weightedMedian(w),
        avg: vol ? sum / vol : null,
        min: Math.min(...w.map((p) => p.price)),
        max: Math.max(...w.map((p) => p.price)),
        samples: w.length,
      };
    };
    const last = points[points.length - 1];
    const allVol = points.reduce((s, p) => s + p.qty, 0);
    // if there is no 30 days use 90, if not that then all time - so even items that trade rarely get a value
    const stats = windowStats(30) || windowStats(90) || {
      days: 0, volume: allVol, median: weightedMedian(points),
      avg: allVol ? points.reduce((s, p) => s + p.price * p.qty, 0) / allVol : null,
      min: Math.min(...points.map((p) => p.price)),
      max: Math.max(...points.map((p) => p.price)),
      samples: points.length,
    };
    return {
      last: last.price, lastDate: last.ts || null, lastQty: last.qty,
      totalVolume: allVol,
      stats,                                   // the value derived from the real sales
      recent: points.slice(-12).map((p) => ({ price: p.price, qty: p.qty, ts: p.ts })),
      series: points.slice(-180).map((p) => [p.ts, p.price, p.qty]),   // for the small chart
    };
  }

  // ================== ORDER BOOK ==================
  // In 2026 Steam moved the market listing page to a new SSR interface. The old way
  // (`Market_LoadOrderSpread(item_nameid)` + the `itemordershistogram` endpoint) IS GONE:
  // that script block is not on the page and `/render/?format=json` returns HTML. Instead,
  // the new page prints the order book straight into the HTML:
  //
  //   "4 for sale starting at $22.57"      + <table> Price/Quantity rows
  //   "6 requests to buy at $0.04 or lower" + <table> Price/Quantity rows
  //
  // Quantities are NOT cumulative, they are the real count per price. The CSS class names are scrambled
  // (like APEAY0rnAbo-) and change on every deploy, so we parse by STRUCTURE, not by class:
  // find the tables and classify each table as "sell" or "buy" by the summary sentence before it.
  // The page does not need a login but if a cookie is present
  // the amounts come in the account's own currency.
  async getItemOrders(marketHashName) {
    const code = this.currencyCode();
    if (!code) return { noCurrency: true };
    const url = `https://steamcommunity.com/market/listings/753/${encodeURIComponent(marketHashName)}?l=english`;
    const r = await fetch(url, {
      headers: {
        Cookie: this.cookieHeader(),
        // The language is pinned so that the summary sentences can be caught in English; without a browser-like
        // User-Agent Steam can return the page in a different form.
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': SteamEngine.UA,
      },
    });
    if (r.status === 429) return { rateLimited: true, error: translation.t('Steam istek sınırı aşıldı (429)') };
    if (!r.ok) return { error: translation.tf('pazar sayfası HTTP # döndürdü', r.status) };
    const html = await r.text();

    const strip = (x) => String(x).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
    if (!tables.length) {
      // If there is no table there are three possibilities, and we can tell which one it is:
      //   - if the page title is the generic "Market Item" there is no such market item (the name may have changed)
      //   - if it says "no listings" the item exists but nothing is on sale
      //   - anything else means the page structure differs from what was expected (Steam may have changed it again)
      const flat = strip(html);
      const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      if (/^\s*Market Item\b/i.test(title)) {
        return { error: 'bu öğe Steam pazarında bulunamadı (pazar adı değişmiş olabilir)' };
      }
      if (/no listings|there are no listings/i.test(flat)) {
        return { error: 'bu öğe şu an satışta değil (hiç ilan yok)' };
      }
      return { error: 'pazar sayfası beklenen biçimde değil (Steam sayfayı değiştirmiş olabilir)' };
    }
    const parseRows = (body) => [...body.matchAll(
      /<tr>\s*<td[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<td[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g)]
      .map((m) => ({
        raw: m[1].trim(),
        price: SteamEngine.parseMoney(m[1]),
        qty: parseInt(String(m[2]).replace(/[^\d]/g, ''), 10) || 0,
      }))
      .filter((x) => x.price != null && x.price > 0);

    let sell = [], buy = [], sellCount = 0, buyCount = 0, sampleRaw = null;
    for (const t of tables) {
      const earlier = strip(html.slice(Math.max(0, t.index - 600), t.index));
      const rows = parseRows(t[1]);
      if (!rows.length) continue;
      if (!sampleRaw) sampleRaw = rows[0].raw;
      const saleSummary = earlier.match(/([\d,.]+)\s+for sale/i);
      const purchaseSummary  = earlier.match(/([\d,.]+)\s+requests? to buy|([\d,.]+)\s+buy orders?/i);
      const countUp = (m) => (m ? parseInt(String(m[1] || m[2]).replace(/[^\d]/g, ''), 10) || 0 : 0);
      if (saleSummary) { sell = rows; sellCount = countUp(saleSummary) || rows.reduce((s, x) => s + x.qty, 0); }
      else if (purchaseSummary) { buy = rows; buyCount = countUp(purchaseSummary) || rows.reduce((s, x) => s + x.qty, 0); }
      else if (!sell.length) { sell = rows; sellCount = rows.reduce((s, x) => s + x.qty, 0); }
      else if (!buy.length) { buy = rows; buyCount = rows.reduce((s, x) => s + x.qty, 0); }
    }
    if (!sell.length && !buy.length) return { error: 'sipariş defteri satırları okunamadı' };

    // CURRENCY CHECK. The page picks the currency by session; if it came in a currency different from
    // what we expected we say so openly instead of showing the number with the wrong symbol (a mismatch of exactly
    // this kind once inflated the amounts 40 times).
    const expected = SteamEngine.SYMBOL[code];
    if (sampleRaw && expected && !String(sampleRaw).includes(expected)) {
      return { error: translation.tf('pazar sayfası # dışında bir kurda geldi', code) + ' (' + sampleRaw + ')' };
    }
    return {
      sell, buy, sellCount, buyCount,
      lowestSell: sell.length ? Math.min(...sell.map((x) => x.price)) : null,
      highestBuy: buy.length ? Math.max(...buy.map((x) => x.price)) : null,
      currency: code,
    };
  }

  // Lists an item on the Community Market. `priceCents` is what the SELLER receives (Steam adds
  // its fee on top for the buyer). If the account has a mobile authenticator, Steam still requires
  // the user to approve each listing in the Steam app - we do not auto-confirm.
  async sellItem(assetId, priceCents, amount = 1) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
    if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
    const sessionid = sidCookie.split('=')[1];
    const body = new URLSearchParams({
      sessionid, appid: '753', contextid: '6',
      assetid: String(assetId), amount: String(amount), price: String(Math.round(priceCents)),
    });
    const r = await fetch('https://steamcommunity.com/market/sellitem/', {
      method: 'POST',
      headers: {
        Cookie: this.cookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `https://steamcommunity.com/profiles/${this.steamID}/inventory`,
        Origin: 'https://steamcommunity.com',
      },
      body,
    });
    const j = await r.json().catch(() => null);
    // The error detail is kept: the main process looks at Steam's message and the HTTP status and sorts it as "limit"
    // (stop), "atla" (this item cannot be listed, move on to the next) or a general error.
    if (!j) {
      const e = new Error(translation.tf('Pazar yanıtı okunamadı (HTTP #)', r.status));
      e.httpStatus = r.status;
      throw e;
    }
    if (!j.success) {
      const e = new Error(SteamEngine.steamMessage(j.message, 'Listeleme reddedildi'));
      e.steamMessage = String(j.message || '');
      e.httpStatus = r.status;
      throw e;
    }
    return j; // { success, requires_confirmation, needs_mobile_confirmation, needs_email_confirmation, email_domain }
  }

  // ---- ACTIVE MARKET LISTINGS ----
  // `norender=1` makes Steam answer with structured JSON instead of the HTML fragment. The shape is read
  // defensively: `listings` can be an array or an object keyed by listing id, and the descriptions of the
  // items live in `assets[appid][contextid][assetid]`.
  async getMyListings() {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const asList = (x) => (Array.isArray(x) ? x : Object.values(x || {}));
    const out = { listings: [], toConfirm: [], onHold: [], buyOrders: 0 };
    const seen = new Set();
    const PAGE = 100;
    for (let start = 0, guard = 0; guard < 30; guard++, start += PAGE) {
      const r = await this._requestItem(`https://steamcommunity.com/market/mylistings/?norender=1&count=${PAGE}&start=${start}`, {}, 'Pazar ilanları');
      const j = await r.json().catch(() => null);
      if (!j || !j.success) throw new Error(translation.t('Pazar yanıtı beklenen biçimde değil'));
      const assets = j.assets || {};
      const describe = (l) => {
        const a = l.asset || {};
        const d = (assets[a.appid] && assets[a.appid][a.contextid] && assets[a.appid][a.contextid][a.id]) || a;
        const seller = +l.price || 0;
        return {
          listingId: String(l.listingid),
          name: d.name || d.market_hash_name || ('#' + (a.id || l.listingid)),
          marketHashName: d.market_hash_name || null,
          iconUrl: d.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${d.icon_url}/96fx96f` : null,
          appid: +a.appid || 0,
          assetId: a.id != null ? String(a.id) : null,
          sellerCents: seller,
          buyerCents: seller + (+l.fee || 0),
          created: (+l.time_created || 0) * 1000,
        };
      };
      const page = asList(j.listings);
      page.forEach((l) => { if (l && l.listingid && !seen.has(String(l.listingid))) { seen.add(String(l.listingid)); out.listings.push(describe(l)); } });
      if (start === 0) {
        asList(j.listings_to_confirm).forEach((l) => { if (l && l.listingid) out.toConfirm.push(describe(l)); });
        asList(j.listings_on_hold).forEach((l) => { if (l && l.listingid) out.onHold.push(describe(l)); });
        out.buyOrders = asList(j.buy_orders).length;
      }
      const total = +j.total_count || 0;
      if (page.length < PAGE || start + PAGE >= total) break;
    }
    return out;
  }

  // Takes one of our own listings off the market (the item returns to the inventory).
  async removeListing(listingId) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    if (!/^\d+$/.test(String(listingId))) throw new Error(translation.t('Geçersiz ilan numarası'));
    const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
    if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
    const r = await fetch(`https://steamcommunity.com/market/removelisting/${listingId}`, {
      method: 'POST',
      headers: {
        Cookie: this.cookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: 'https://steamcommunity.com/market/',
        Origin: 'https://steamcommunity.com',
        'User-Agent': SteamEngine.UA,
      },
      body: new URLSearchParams({ sessionid: sidCookie.split('=')[1] }),
    });
    if (r.status === 429) { const e = new Error(translation.t('Steam istek sınırı aşıldı (429)')); e.rateLimited = true; throw e; }
    if (!r.ok) throw new Error(translation.tf('Pazar yanıtı okunamadı (HTTP #)', r.status));
    return { ok: true };
  }

  // ---- PRODUCT KEYS ----
  // Returns { ok, detail, packages } for every answer Steam gives, including the refusals (they carry the
  // reason in `detail`). Only a missing answer (timeout, no connection) is thrown so that the caller
  // keeps the key in its queue instead of marking it as used up.
  async redeemKey(key) {
    if (!this.user || !this.isConnected) throw new Error(translation.t('Steam oturumu yok'));
    try {
      const r = await this.user.redeemKey(key);
      return { ok: true, detail: r.purchaseResultDetails, packages: r.packageList || {} };
    } catch (e) {
      if (e && e.purchaseResultDetails !== undefined) {
        return { ok: false, detail: e.purchaseResultDetails, packages: e.packageList || {} };
      }
      throw e;
    }
  }

  // ---- BOOSTER PACKS ----
  async unpackBooster(assetId, appid) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
    if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
    const r = await fetch(`https://steamcommunity.com/profiles/${this.steamID}/ajaxunpackbooster/`, {
      method: 'POST',
      headers: {
        Cookie: this.cookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `https://steamcommunity.com/profiles/${this.steamID}/inventory`,
        Origin: 'https://steamcommunity.com',
        'User-Agent': SteamEngine.UA,
      },
      body: new URLSearchParams({ sessionid: sidCookie.split('=')[1], appid: String(+appid), communityitemid: String(assetId) }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || +j.success !== 1) {
      throw new Error(translation.t('Booster paketi açılamadı'));
    }
    const items = Array.isArray(j.rgItems) ? j.rgItems.map((x) => ({ name: x.name || '?', foil: !!x.foil })) : [];
    return { ok: true, items };
  }

  // ---- STEAM FAMILY VIEW (parental PIN) ----
  // With Family View on, the web endpoints answer with the "unlock" page until the PIN has been entered.
  // The PIN is sent once per web session and Steam answers with a `steamparental` cookie that is added to ours.
  async unlockParental(pin) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
    if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
    const r = await fetch('https://steamcommunity.com/parental/ajaxunlock', {
      method: 'POST',
      headers: {
        Cookie: this.cookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: 'https://steamcommunity.com/',
        Origin: 'https://steamcommunity.com',
        'User-Agent': SteamEngine.UA,
      },
      body: new URLSearchParams({ pin: String(pin), sessionid: sidCookie.split('=')[1] }),
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.success) throw new Error(translation.t("Aile Görünümü PIN'i reddedildi"));
    const set = (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
      .map((c) => c.split(';')[0]).filter((c) => c.startsWith('steamparental='));
    if (set.length) this.cookies = this.cookies.filter((c) => !c.startsWith('steamparental=')).concat(set);
    return { ok: true };
  }

  // Low-level: encode `msgType`→buffer, send EMsg, decode the job-response buffer with `respType`.
  // We do the protobuf encode/decode ourselves because steam-user doesn't map these EMsgs.
  // Protocol request. Steam sometimes does not answer a single request at all; this used to surface directly as
  // "Steam stats reply timed out" and leave the achievements page empty.
  // Now it counts as transient and is tried once more, and the message says what to do.
  _sendRecvSingle(emsg, msgType, obj, respType, timeoutMs) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Object.assign(new Error('zaman aşımı'), { timeoutValue: true })), timeoutMs);
      let payload;
      try { payload = Buffer.from(msgType.encode(obj).finish()); }
      catch (e) { clearTimeout(t); reject(e); return; }
      this.user._send({ msg: emsg, proto: {} }, payload, (respBuf) => {
        clearTimeout(t);
        try {
          const buf = respBuf && typeof respBuf.toBuffer === 'function' ? respBuf.toBuffer() : respBuf;
          resolve(respType.decode(buf));
        } catch (e) { reject(e); }
      });
    });
  }
  async _sendRecv(emsg, msgType, obj, respType, timeoutMs = 15000) {
    let latest = null;
    for (let i = 0; i < 2; i++) {
      try { return await this._sendRecvSingle(emsg, msgType, obj, respType, timeoutMs); }
      catch (e) {
        latest = e;
        if (!(e && e.timeoutValue)) break;
        if (i === 0) await new Promise((r) => setTimeout(r, 1200));
      }
    }
    if (latest && latest.timeoutValue) {
      throw new Error(translation.t('Steam bu oyunun başarım verisini zamanında göndermedi. Steam yoğun olabilir; birkaç saniye sonra yeniden dene.'));
    }
    throw latest;
  }

  // Valve binary KeyValues parser (the achievement schema comes as this blob inside the
  // ClientGetUserStats response). Types: 0=object 1=string 2=int32 3=float 4=ptr 5=wstring
  // 6=color 7=uint64 8=end 10=int64.
  static _parseBinaryKV(buf) {
    let off = 0;
    const readCStr = () => { const s = off; while (off < buf.length && buf[off] !== 0) off++; const str = buf.toString('utf8', s, off); off++; return str; };
    const parseObj = () => {
      const obj = {};
      while (off < buf.length) {
        const type = buf[off++];
        if (type === 8) break;
        const key = readCStr();
        let val;
        switch (type) {
          case 0: val = parseObj(); break;
          case 1: case 5: val = readCStr(); break;
          case 2: val = buf.readInt32LE(off); off += 4; break;
          case 3: val = buf.readFloatLE(off); off += 4; break;
          case 4: case 6: val = buf.readUInt32LE(off); off += 4; break;
          case 7: val = buf.readBigUInt64LE(off).toString(); off += 8; break;
          case 10: val = buf.readBigInt64LE(off).toString(); off += 8; break;
          default: return obj; // unknown → stop this object gracefully
        }
        // duplicate keys (Steam schema repeats "bits" child ids as "0","1"...) are unique per object
        obj[key] = val;
      }
      return obj;
    };
    return parseObj();
  }

  // Fetch raw stats+schema for one app: achievement definitions (statId+bit → name/desc/icon)
  // plus current stat values (the achievement bits) and the crc needed to store back.
  async _getUserStatsRaw(appid) {
    if (!this.steamID) throw new Error(translation.t('Steam oturumu yok'));
    const resp = await this._sendRecv(818 /* ClientGetUserStats */,
      Schema.CMsgClientGetUserStats, { game_id: String(appid), crc_stats: 0, schema_local_version: 0, steam_id_for_user: this.steamID },
      Schema.CMsgClientGetUserStatsResponse);
    if (!resp || !resp.schema || !resp.schema.length) return null;
    const schemaBuf = Buffer.isBuffer(resp.schema) ? resp.schema : Buffer.from(resp.schema);
    const root = SteamEngine._parseBinaryKV(schemaBuf);
    // top level is keyed by appid; grab the object that has a "stats" child
    let appObj = root[String(appid)] || Object.values(root).find((v) => v && typeof v === 'object' && v.stats);
    const statsSchema = (appObj && appObj.stats) || {};
    const loc = (v) => (typeof v === 'string' ? v : (v && (v.turkish || v.english || Object.values(v)[0])) || '');
    const defs = [];
    for (const statId of Object.keys(statsSchema)) {
      const st = statsSchema[statId];
      if (!st || typeof st !== 'object' || !st.bits) continue; // only achievement-bit stats have "bits"
      for (const endIdx of Object.keys(st.bits)) {
        const b = st.bits[endIdx];
        if (!b || typeof b !== 'object') continue;
        const disp = b.display || {};
        defs.push({
          statId: +statId, finishAt: +endIdx,
          apiName: b.name || (statId + '_' + endIdx),
          name: loc(disp.name) || b.name || '?',
          desc: loc(disp.desc) || '',
          icon: disp.icon || null, iconGray: disp.icon_gray || null,
          // Steam schema fields:
          //   permission bit 0 (1) = hidden achievement (its description is hidden until unlocked)
          //   permission bit 1 (2) = PROTECTED - only the game server can write it.
          // Writing protected ones from the client always returns EResult 8 (InvalidParam).
          // This field used to be ignored completely (it was dead code, `? false : false`), so the
          // user got an error without understanding why.
          hidden: (+(b.permission || 0) & 1) === 1,
          protectedFlag: (+(b.permission || 0) & 2) === 2,
        });
      }
    }
    const statValues = new Map();
    (resp.stats || []).forEach((s) => statValues.set(s.stat_id >>> 0, (s.stat_value >>> 0)));
    return { crc: resp.crc_stats >>> 0, defs, statValues, appid: +appid };
  }

  // Global unlock % per achievement (public endpoint, no auth needed) - real rarity data used for
  // the "Rare / Ultra-Rare" filter. Best-effort: empty map on any failure, never fabricated.
  async getAchievementRarity(appid) {
    try {
      const url = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`;
      const r = await this._requestItem(url, { withCookies: false, attemptCount: 2, timeoutLimitMs: 12000 }, 'Nadirlik');
      const j = await r.json().catch(() => null);
      const list = (j && j.achievementpercentages && j.achievementpercentages.achievements) || [];
      const map = {};
      // NOTE: Steam returns the `percent` field as a STRING (e.g. "74.1"). If we do not convert it to a number
      // the `typeof pct === 'number'` check below is always false and the rarity stays null.
      list.forEach((a) => {
        const n = parseFloat(a.percent);
        if (!isNaN(n)) map[a.name] = n;
      });
      return map;
    } catch (_) { return {}; }
  }

  // This account's own unlock timestamps, via the same access_token auth as getOwnedGames.
  // Best-effort: empty map on any failure (private profile, no token, endpoint down, ...).
  async getAchievementUnlockTimes(appid) {
    try {
      const token = this._accessToken();
      if (!token) return {};
      const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?access_token=${encodeURIComponent(token)}&steamid=${this.steamID}&appid=${appid}&format=json`;
      const r = await this._requestItem(url, { attemptCount: 2, timeoutLimitMs: 12000 }, 'Açılma tarihleri');
      const j = await r.json().catch(() => null);
      const list = (j && j.playerstats && j.playerstats.achievements) || [];
      const map = {};
      list.forEach((a) => { if (a.achieved && a.unlocktime) map[a.apiname] = a.unlocktime * 1000; });
      return map;
    } catch (_) { return {}; }
  }

  // Read-only view: achievement list with real unlock state. Works headless over the Steam
  // protocol (same path ASF uses), independent of profile privacy. null if game has no achievements.
  // Rarity % and unlock timestamps are best-effort extras from the Web API; null when unavailable.
  async getAchievements(appid, force) {
    if (force) this.invalidateStats(appid);
    // The same cache is shared with setAchievements: the values we wrote show up here too,
    // so when you come back to the page the tick of the achievement we unlocked is not lost.
    const raw = await this._statsCached(appid);
    if (!raw || !raw.defs.length) return null;
    const iconUrl = (f) => (f ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${f}` : null);
    const [rarityMap, unlockMap] = await Promise.all([
      this.getAchievementRarity(appid),
      this.getAchievementUnlockTimes(appid),
    ]);
    const achievements = raw.defs.map((d) => {
      const val = raw.statValues.get(d.statId >>> 0) || 0;
      // the korumali flag is carried to the interface (it is added to the object below)
      const achieved = !!((val >> d.finishAt) & 1);
      const pct = rarityMap[d.apiName];
      return {
        apiName: d.apiName, name: d.name, desc: d.desc, achieved,
        icon: iconUrl(achieved ? d.icon : (d.iconGray || d.icon)),
        unlockTime: unlockMap[d.apiName] || null,
        // In some games (e.g. CS2) Steam returns only a few achievements from this endpoint;
        // for the ones that do not match the rarity stays unknown - no made-up value is produced.
        rarityPct: Number.isFinite(pct) ? pct : null,
        // G4: an achievement that only the game server can write. The interface marks it and
        // makes it unselectable in bulk operations; sending it would always return EResult 8.
        protectedFlag: !!d.protectedFlag,
        isHidden: !!d.hidden,
      };
    });
    return { gameName: null, logo: null, total: achievements.length, unlocked: achievements.filter((a) => a.achieved).length, achievements };
  }

  // Unlock/lock achievements headless (ASF-style: CMsgClientStoreUserStats2). `changes` is
  // [{apiName, unlock:true|false}]. Modifies the account permanently (reversible by re-locking).
  // Schema + values cache: calling ClientGetUserStats from scratch on every single achievement operation
  // made every click wait for seconds. The schema does not change; after writing stat values
  // we update them locally in the cache, so back to back operations are instant.
  async _statsCached(appid) {
    this._statsCache = this._statsCache || new Map();
    const hit = this._statsCache.get(appid);
    if (hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.raw;
    const raw = await this._getUserStatsRaw(appid);
    if (raw) this._statsCache.set(appid, { raw, ts: Date.now() });
    return raw;
  }
  invalidateStats(appid) {
    if (this._statsCache) { if (appid == null) this._statsCache.clear(); else this._statsCache.delete(appid); }
  }

  // G5: for some games Steam only accepts writing statistics while that game looks "being played".
  // It opens the game for the duration of the write and returns to the previous state when done.
  // If a card/hour job is running it is ADDED to that list, not written over it.
  async _keepGameOpen(appid, isFn) {
    const previousOnes = (this._playing || []).slice();
    const alreadyOpen = previousOnes.includes(+appid);
    if (!alreadyOpen) {
      try { this.user.gamesPlayed(previousOnes.concat([+appid])); } catch (_) {}
      // Steam needs a short moment to process the "playing" state
      await new Promise((r) => setTimeout(r, 1200));
    }
    try {
      return await isFn();
    } finally {
      if (!alreadyOpen) {
        try { this.user.gamesPlayed(previousOnes); } catch (_) {}
      }
    }
  }

  async setAchievements(appid, changes) {
    return this._keepGameOpen(appid, () => this._setAchievementsInner(appid, changes));
  }

  async _setAchievementsInner(appid, changes) {
    const raw = await this._statsCached(appid);
    if (!raw) throw new Error(translation.t('Bu oyunun başarım şeması yok'));
    const byName = new Map(raw.defs.map((d) => [d.apiName, d]));
    // G4: filter out protected achievements before sending - Steam rejects them anyway,
    // sending them only inflates the error counter and keeps the loop busy for nothing.
    const protectedOnes = changes.filter((c) => {
      const d = byName.get(c.apiName);
      return d && d.protectedFlag;
    });
    if (protectedOnes.length === changes.length && changes.length) {
      const e = new Error(translation.t('Bu başarım oyun tarafından korunuyor, dışarıdan açılamaz.'));
      e.protectedFlag = true;
      throw e;
    }
    const dirty = new Map(); // statId -> new value
    for (const c of changes) {
      const d = byName.get(c.apiName);
      if (!d || d.protectedFlag) continue;
      let val = dirty.has(d.statId) ? dirty.get(d.statId) : (raw.statValues.get(d.statId >>> 0) || 0);
      val = c.unlock ? (val | (1 << d.finishAt)) : (val & ~(1 << d.finishAt));
      dirty.set(d.statId, val >>> 0);
    }
    if (!dirty.size) return { ok: true, changed: 0 };
    const stats = [...dirty.entries()].map(([stat_id, stat_value]) => ({ stat_id, stat_value }));
    const resp = await this._sendRecv(5466 /* ClientStoreUserStats2 */,
      Schema.CMsgClientStoreUserStats2, {
        game_id: String(appid), settor_steam_id: this.steamID, settee_steam_id: this.steamID,
        crc_stats: raw.crc, explicit_reset: false, stats,
      }, Schema.CMsgClientStoreUserStatsResponse);
    const eresult = resp && typeof resp.eresult !== 'undefined' ? resp.eresult : 2;
    if (eresult !== 1) {
      this.invalidateStats(appid);   // the crc may have gone stale, fetch fresh on the next attempt
      throw new Error(translation.tf('Steam kaydı reddetti (EResult #)', eresult));
    }
    // Update the values we wrote in the cache too so the next operation computes from the right base
    dirty.forEach((val, statId) => raw.statValues.set(statId >>> 0, val));
    return { ok: true, changed: changes.length };
  }

  // The "Appear offline" switch under Settings > Privacy is already applied during the connection
  // (see logOn); this is for changing it live while the session is OPEN (settings:set calls it instantly).
  setOfflineMode(offline) {
    this._offline = !!offline;
    this._applyPersona();
  }

  // "Hide the game name": Steam shows the game being played to everyone while you are online; the only
  // real way to hide it is to go invisible. So this switch makes you invisible ONLY while a game is
  // being played (unlike offline mode, you stay online when idle). Card drops are not affected.
  applyPrivacy(offline, hideGameName) {
    this._offline = !!offline;
    this._hideGameName = !!hideGameName;
    this._applyPersona();
  }
  _applyPersona() {
    const hidden = this._offline || (this._hideGameName && this._playing.length > 0);
    try { this.user.setPersona(hidden ? SteamUser.EPersonaState.Invisible : SteamUser.EPersonaState.Online); } catch (_) {}
  }

  // ---- GAMES BEING PLAYED ----
  // More than one job on the same account can open games at the same time: card farming, hour boosting,
  // Realistic Mode. Each job used to replace the engine's SINGLE list with its own: while hour boosting
  // was running, card farming moving to the next game closed all the boosted games,
  // and the other way round. Now each job keeps its own list by name ("sahip"); the union of all of them
  // goes to Steam, at most 32 games (Steam does not count beyond that). Order: SAHIP_SIRASI.
  play(appids, ownerId) {
    this._owners.set(ownerId || 'general', (appids || []).slice());
    this._sendGames();
  }
  // If sahip is given only that job's games are closed; if not, all of them (exit, disconnect).
  stop(ownerId) {
    if (ownerId) this._owners.delete(ownerId); else this._owners.clear();
    this._sendGames();
  }
  // Of a job's games, the ones that fit the 32 limit and are really open.
  playingApps(ownerId) {
    const isOpen = new Set(this._playing);
    return (this._owners.get(ownerId) || []).filter((id) => isOpen.has(id));
  }
  _sendGames() {
    const union = [];
    const seen = new Set();
    const position = SteamEngine.OWNER_ORDER.concat([...this._owners.keys()]);
    position.forEach((k) => {
      (this._owners.get(k) || []).forEach((id) => {
        if (union.length >= 32 || seen.has(id)) return;
        seen.add(id); union.push(id);
      });
    });
    this._playing = union;
    try { this.user.gamesPlayed(union); } catch (_) {}
    this._applyPersona();
  }
  get playing() { return this._playing; }

  // ================== CHAT ==================
  // Steam chat does not need the client: node-steam-user's chat component gives the friend
  // list, the history and sending over the protocol. Incoming messages were already caught
  // by the 'friendMessage' event (see above), only the interface was missing.
  //
  // NOTE: there are no Steam GROUP chats here, only one-to-one friend messages.
  // Group chat is a separate concept (chatroom groups) and needs a screen of its own.

  // Friend list. myFriends gives steamID -> relationship type; 3 = mutual friends.
  // Name and avatar come from getPersonas, all in a single request.
  async getFriends() {
    const relations = this.user.myFriends || {};
    const idler = Object.keys(relations).filter((id) => relations[id] === 3);
    if (!idler.length) return [];
    // getPersonas gets slow with many ids; we split them into groups of 100.
    const people = {};
    for (let i = 0; i < idler.length; i += 100) {
      const group = idler.slice(i, i + 100);
      // eslint-disable-next-line no-await-in-loop
      const p = await new Promise((res) => {
        try { this.user.getPersonas(group, (err, r) => res(err ? {} : (r || {}))); }
        catch (_) { res({}); }
      });
      Object.assign(people, p);
    }
    return idler.map((id) => {
      const k = people[id] || {};
      return {
        steamid: id,
        persona: k.player_name || translation.tf('Kullanıcı #', id.slice(-4)),
        avatar: k.avatar_url_medium || k.avatar_url_icon || null,
        // 0 = offline, 1 = online, others busy/away etc.
        condition: typeof k.persona_state === 'number' ? k.persona_state : 0,
        gameEntry: k.game_name || null,
      };
    }).sort((a, b) => {
      if ((b.condition > 0) !== (a.condition > 0)) return (b.condition > 0) ? 1 : -1;
      return a.persona.localeCompare(b.persona, 'tr');
    });
  }

  // Recent conversations: who we wrote with, when last, how many unread.
  async getConversations() {
    const r = await this.user.chat.getActiveFriendMessageSessions({}).catch(() => null);
    if (!r || !Array.isArray(r.sessions)) return [];
    return r.sessions.map((s) => ({
      steamid: s.steamid_friend ? s.steamid_friend.toString() : null,
      lastMessageTs: s.last_message ? new Date(s.last_message).getTime() : 0,
      unreadCount: s.unread_message_count || 0,
    })).filter((s) => s.steamid);
  }

  // A conversation with one person. Steam gives newest to oldest, it is reversed for the interface.
  async getChatHistory(steamid, count) {
    const r = await this.user.chat.getFriendMessageHistory(steamid, {
      maxCount: Math.max(1, Math.min(200, +count || 50)),
    });
    const mine = this.user.steamID ? this.user.steamID.toString() : null;
    const messages = (r && r.messages ? r.messages : []).map((m) => ({
      senderName: m.sender ? m.sender.toString() : null,
      me: !!(mine && m.sender && m.sender.toString() === mine),
      textValue: String(m.message || ''),
      ts: m.server_timestamp ? m.server_timestamp.getTime() : 0,
      unreadCount: !!m.unread,
    }));
    messages.sort((a, b) => a.ts - b.ts);
    return { messageList: messages, hasMore: !!(r && r.more_available) };
  }

  async sendChat(steamid, text) {
    const t = String(text || '').trim();
    if (!t) throw new Error(translation.t('Boş mesaj gönderilemez.'));
    await this.user.chat.sendFriendMessage(steamid, t);
    return { ts: Date.now() };
  }

  // Mark as read - so it also shows as read on Steam and does not notify again on the phone.
  async markChatRead(steamid) {
    try { await this.user.chat.ackFriendMessage(steamid, new Date()); } catch (_) { /* onemsiz */ }
    return true;
  }

  // "Typing..." notification. So the other side sees it; if it fails it does not matter.
  sendTyping(steamid) {
    try { this.user.chat.sendFriendTyping(steamid); } catch (_) {}
  }

  // Deliberate exit: NO reconnect attempt is made (so it does not collide with the G3 loop).
  logOff() {
    this._wasShutDown = true;
    this.isConnected = false;
    this._stopPulse();
    try { this.user.logOff(); } catch (_) {}
  }
}

// Steam's own ECurrencyCode enum (it comes inside steam-user) - code<->name conversion
// is done from there, we keep no hand-written list.
// Steam's new SSR market page expects a browser-like User-Agent.
SteamEngine.UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// Drops that are not retried (EResult): InvalidPassword 5, AccessDenied 15, Revoked 26,
// Expired 27 - the logon token is invalid; LogonSessionReplaced 34 - the same account was replaced by
// another session. LoggedInElsewhere (6) is NOT HERE: it arrives when the user opens a game elsewhere.
// Since the games are reported without 'force', reconnecting does not close that game;
// Steam does not count idling at that time, and when the game closes the heartbeat reports the games again.
SteamEngine.PERMANENT_DISCONNECT = new Set([5, 15, 26, 27, 34]);
// Which job's games stay open when the 32 limit is full: Realistic Mode opens a single game and the
// achievements are written while that game is open; card farming earns cards; hour boosting comes last.
SteamEngine.OWNER_ORDER = ['realistic', 'card', 'hours', 'sequential', 'general'];
SteamEngine.CURRENCY = SteamUser.ECurrencyCode;
// Converts Steam price texts to numbers. The format varies by currency:
//   "$1,084.65"  (comma thousands, dot decimal)
//   "1.084,65 TL" / "1.084,65€"  (dot thousands, comma decimal)
//   "1 084,65 pуб."  (space thousands)
//   "¥1,084"  (no decimals)
// The OLD parser could not read the comma-thousands format: "$1,084.65" -> 1.084 (a 1000x error).
// Rule: if the last separator is followed by 1-2 digits it is DECIMAL, all other separators are thousands.
SteamEngine.parseMoney = (s) => {
  if (s == null) return null;
  // Drop the trailing separators: after cleaning "1 084,65 pуб." what is left is "1084,65." and that last dot
  // was taken as a decimal and broke the number.
  const t = String(s).replace(/[^0-9.,]/g, '').replace(/[.,]+$/, '');
  if (!t) return null;
  const decPos = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  const tail = decPos >= 0 ? t.length - decPos - 1 : -1;
  let intPart = t, fracPart = '';
  if (tail === 1 || tail === 2) { intPart = t.slice(0, decPos); fracPart = t.slice(decPos + 1); }
  intPart = intPart.replace(/[.,]/g, '');
  if (!intPart && !fracPart) return null;
  const n = parseFloat((intPart || '0') + (fracPart ? '.' + fracPart : ''));
  return isNaN(n) ? null : n;
};

SteamEngine.currencyName = (code) => {
  const e = SteamUser.ECurrencyCode || {};
  const hit = Object.keys(e).find((k) => e[k] === code && /^[A-Z]{3}$/.test(k));
  return hit || null;
};
// Supported display currencies (symbol + local format). Steam can quote prices in all of these;
// if we meet an account currency that is not in the list the code is shown instead of the symbol.
SteamEngine.SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', TRY: '₺', RUB: '₽', BRL: 'R$', JPY: '¥', CNY: '¥',
  CAD: 'CA$', AUD: 'A$', INR: '₹', UAH: '₴', PLN: 'zł', KZT: '₸', ARS: 'AR$', MXN: 'MX$',
};

module.exports = SteamEngine;
