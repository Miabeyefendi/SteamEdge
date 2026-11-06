const SteamUser = require('steam-user');
const translation = require('./translation');
const { parseProxy, proxyFetch } = require('./proxyFetch');

// Steam's community site answers 429 to the fetch built into Electron's Node on the market, inventory and selling endpoints, every time, from the first request (measured
// against the same address that answers 200 to curl). The same request through Chromium's network stack goes through, so inside Electron the web requests use that.
// No cookies from the browser session: the account's own Cookie header is the only one sent. Outside Electron (the tests) it is the plain fetch.
function webFetch(url, options) {
  let net = null;
  try { const e = require('electron'); if (e && e.app && e.net && e.app.isReady()) net = e.net; } catch (_) {}
  return net ? net.fetch(url, { credentials: 'omit', ...options }) : fetch(url, options);
}
const inventorySources = require('./inventorySources');

// Headless card-farm engine on node-steam-user. Logs onto the CM with a refresh token, opens a
// web session (for badge/inventory scraping) and drives gamesPlayed() to idle games so Steam
// drops trading cards. No Steam client required.
class SteamEngine {
  constructor() {
    // The loop below does the reconnecting, not steam-user's own loop. When both
    // run, two logon attempts happen at once and one dropped with "Already attempting to log
    // on"; the attempt limit and the "Off" option in Settings also did not reach steam-user's
    // own attempts.
    this.user = this._newUser();
    this._proxy = null;          // set by setProxy: { url, socks } - every request of this account then goes through it
    this.cookies = null;
    this.steamID = null;
    this.persona = null;
    this._playing = [];
    this._owners = new Map();    // job name -> the games that job opened (see play)
    // A game of this account is open on another device (the Steam client, another computer): Steam lets one session play at a time. While it is,
    // SteamEdge sends no game of its own; up to 1.8.1 it logged on again every few seconds and opened its games over that one (LoggedInElsewhere, 6).
    this.playingBlocked = false;
    this.onPlaying = null;       // (blocked, appid) - set by main.js
    this._persona = 'online';    // what friends see (the top bar): online | away | invisible. The one value every logon, reconnect and game change reads.
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
  // Routes this account's Steam connection and web requests through a proxy (see proxyFetch.js). Call it before logOn;
  // an empty value means a direct connection. Throws on an unusable address instead of silently going direct.
  // One steam-user instance with the listeners every instance needs. A fresh one replaces an instance stuck in an attempt (see _attemptNow): steam-user retries a
  // connection it cannot make on its own without a word, and a second logOn on such an instance throws on the next tick, outside of any try.
  _newUser() {
    const user = new SteamUser({ autoRelogin: false });
    if (this._proxy) user.setOption(this._proxy.socks ? 'socksProxy' : 'httpProxy', this._proxy.url.replace(/^socks5:/, 'socks5h:'));
    // The account's wallet currency - decides which currency we fetch Steam prices in.
    // (Used when Settings > General > Currency is "Otomatik".)
    user.on('wallet', (_hasWallet, currency) => {
      const code = SteamEngine.currencyName(currency);
      // The wallet currency is the FINAL source - it always overrides the earlier guess. (It used to
      // say `this._currency || code`; since _currency is 'TRY' in the constructor the
      // condition never held and prices were fetched in TRY even for a USD account.)
      if (code) { this.walletCurrency = code; this._currency = code; }
    });
    // Incoming friend messages. Nobody could reply while running headless; now the app
    // shows a notification and, if wanted, sends a one-time automatic reply.
    user.on('friendMessage', (senderID, message) => {
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
    user.on('accountInfo', (name) => { if (user === this.user) this.persona = name; });
    if (this._listenerSetUp) this._attachRunListeners(user);
    return user;
  }

  setProxy(text) {
    const p = parseProxy(text);
    if (!p.ok) throw new Error(translation.t(p.error));
    this._proxy = p.empty ? null : p;
    // socks5h: the proxy resolves host names (no DNS lookup on this computer)
    if (this._proxy) this.user.setOption(this._proxy.socks ? 'socksProxy' : 'httpProxy', this._proxy.url.replace(/^socks5:/, 'socks5h:'));
  }
  _fetch(url, options) {
    return this._proxy ? proxyFetch(url, options, this._proxy) : webFetch(url, options);
  }

  // The apps of the licenses this account got in the last `days` days. A game bought that recently can still be refunded
  // (14 days and under 2 hours of play), and farming it past 2 hours ends that. Steam gives the purchase time on the
  // license and the apps on the package, so only the few recent packages are looked up. Throws when Steam does not answer.
  async getRecentAppIds(days) {
    const licenses = (this.user.licenses || []);
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const packages = licenses.filter((l) => (+l.time_created || 0) >= cutoff).map((l) => l.package_id);
    const ids = new Set();
    if (!packages.length) return ids;
    const info = await this.user.getProductInfo([], packages, false);
    Object.values((info && info.packages) || {}).forEach((p) => {
      ((p && p.packageinfo && p.packageinfo.appids) || []).forEach((a) => ids.add(+a));
    });
    return ids;
  }

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
        const r = await this._fetch(url, { ...fetchSec, headers: titles, signal: trim.signal });
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

  logOn(refreshToken, persona) {
    this._persona = SteamEngine.personaName(persona);
    return new Promise((resolve, reject) => {
      const done = { info: false, web: false };
      const maybe = () => { if (done.info && done.web) resolve({ steamID: this.steamID, persona: this.persona }); };
      this.user.logOn({ refreshToken });
      this.user.once('loggedOn', () => {
        this.steamID = this.user.steamID.getSteamID64();
        // Steam only shows "in game" on the profile / to friends once a persona state is set (Online or Away; Invisible hides it).
        // Without this, gamesPlayed() registers at the protocol level but nothing is visible.
        this._applyPersona();
        this.user.webLogOn();
      });
      this.user.once('accountInfo', (name) => { this.persona = name; done.info = true; maybe(); });
      this.user.once('webSession', (_sid, cookies) => {
        this.cookies = cookies;
        this._currencyChecked = true;
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
      this.isConnected = true;
      this._everConnected = true;
      this._reconnectAttempt = 0;
      this.gaveUp = false; this.permanentDisconnect = false;
      this._setupDisconnectListeners();
      this._startPulse();
      this._reportStatus('connected');
      return r;
    });
  }

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
  // If `withFinished` is given it returns { gameEntries, finishedOnes }: finishedOnes are the games whose badge row says "No card drops
  // remaining". The card watcher only removes a game from the queue when Steam SAYS so;
  // not appearing in the list alone does not mean "finished" (the scrape may be incomplete).
  async getDropGames(withFinished) {
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
    return withFinished ? { gameEntries: gameList, finishedOnes: finished } : gameList;
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
          + 'ayarını Herkese Açık yapmalısın; yoksa Steam kütüphaneni paylaşmaz.'));
      }
    }
    return games.map((g) => ({ appid: g.appid, name: g.name, playtimeForever: g.playtime_forever || 0, hasStats: !!g.has_community_visible_stats }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // An inventory: by default the Steam community one (appid 753, context 6: cards, backgrounds, emoticons, gems...), or the backpack of a
  // game (Counter-Strike 2 is 730/2, Dota 2 570/2). appName is the game's name for the Game column; it is only known for the other games.
  // count=5000 returns HTTP 400 on some accounts; 2000 is the known-working cap (same limit the old .NET app hit and fixed the same way).
  // An inventory bigger than a page is read page by page (Steam says so with more_items and last_assetid). If a LATER page is refused
  // (Steam answers a quick second request with 429) the items read so far are returned and the array says `incomplete`: a part of the
  // inventory is better than an error, as long as the page tells the user it is a part.
  async getInventory(appid = inventorySources.COMMUNITY.appid, contextId = inventorySources.COMMUNITY.contextId, appName = null) {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const app = +appid || inventorySources.COMMUNITY.appid;
    const context = String(contextId || inventorySources.COMMUNITY.contextId);
    const community = app === inventorySources.COMMUNITY.appid;
    const key = (a) => a.classid + '_' + a.instanceid;

    // item_class ids confirmed against this account's real inventory dump.
    // NOTE: badges are NOT inventory items - they're a separate Steam profile feature
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
    let incomplete = false, startAssetId = null;
    for (let page = 0; page < SteamEngine.INVENTORY_MAX_PAGES; page++) {
      const url = `https://steamcommunity.com/inventory/${this.steamID}/${app}/${context}?l=english&count=2000`
        + (startAssetId ? '&start_assetid=' + encodeURIComponent(startAssetId) : '');
      let j;
      try {
        const r = await this._requestItem(url, {}, 'Envanter');
        j = await r.json();
      } catch (e) {
        if (!page) throw e;
        incomplete = true;
        break;
      }
      if (!j) break;                                   // an empty inventory can come back as null
      if (page === 0 && (j.success === false || j.success === 0)) throw new Error(translation.t('Envanter okunamadı.'));
      const descMap = {};
      (j.descriptions || []).forEach((d) => { descMap[key(d)] = d; });
      const base = items.length;
      (j.assets || []).forEach((a, idx) => {
        const d = descMap[key(a)];
        if (!d) return;
        const tags = d.tags || [];
        const classTag = tags.find((t) => t.category === 'item_class');
        const gameTag = tags.find((t) => t.category === 'Game');
        const common = {
          assetId: a.assetid,
          order: base + idx,                         // Steam's own inventory order
          dedupKey: key(a),                          // same classid+instanceid = visually identical item (duplicate)
          // 96x96 was too small (blurry on a high DPI screen, squashed in a 150px box in the detail panel).
          // Steam's economy CDN produces the requested size - 330x192 fits the card ratio and is sharp.
          iconUrl: d.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${d.icon_url}/330x192` : null,
          tradable: !!d.tradable,
          marketable: !!d.marketable,
          amount: parseInt(a.amount || '1', 10),
          invApp: app, invContext: context,          // where the item lives: the sale needs both
        };
        if (community) {
          items.push(Object.assign(common, {
            name: d.name,
            marketHashName: d.market_hash_name || null, // needed for priceoverview; null if not marketable
            type: (classTag && TYPE_MAP[classTag.internal_name]) || (/booster pack/i.test(d.type || '') ? 'booster' : /gems?$/i.test(d.type || '') ? 'gems' : 'other'),
            gameName: gameTag ? gameTag.localized_tag_name : null,
            // the game an item belongs to; booster packs need it to be opened
            appid: +d.market_fee_app || ((/^app_(\d+)$/.exec((gameTag && gameTag.internal_name) || '') || [])[1] | 0),
          }));
        } else {
          items.push(Object.assign(common, {
            // market_name is the full name a game's items are sold under ("AK-47 | Redline (Field-Tested)"), name can lack the wear
            name: d.market_name || d.name,
            marketHashName: inventorySources.marketKey(app, d.market_hash_name),
            hashName: d.market_hash_name || null,    // Steam's own name: the market link and the CSV use it
            type: 'other',
            typeText: d.type || '',
            gameName: appName || ('App ' + app),
            appid: app,
          }));
        }
      });
      if (!j.more_items || !j.last_assetid) break;
      startAssetId = String(j.last_assetid);
      await new Promise((res) => setTimeout(res, SteamEngine.INVENTORY_PAGE_GAP_MS));
    }
    if (incomplete) Object.defineProperty(items, 'incomplete', { value: true });
    return items;
  }

  // The games the account has items in, for the source list of the Inventory page. They are printed in the inventory page itself
  // (g_rgAppContextData). `found` is false when the page did not have them (Steam changed it): the usual games are offered instead and
  // the page loads them on request, an empty one just says it is empty.
  async getInventorySources() {
    if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
    const r = await this._requestItem(`https://steamcommunity.com/profiles/${this.steamID}/inventory/?l=english`, { attemptCount: 2 }, 'Envanter');
    const list = inventorySources.parseAppContexts(await r.text());
    return list ? { found: true, list } : { found: false, list: inventorySources.FALLBACK_SOURCES };
  }

  // Steam Community Market price (TRY / "TL", matching the ₺ used elsewhere in the UI).
  // MEASURED RATE LIMIT: Steam serves exactly 20 requests then returns HTTP 429; the window
  // clears after ~30s. main.js batches 20-at-a-time with a cooldown and caches to disk.
  // Returns null on 429 so the caller can retry that item later.
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
  applyPrivacy(persona, hideGameName) {
    this._persona = SteamEngine.personaName(persona);
    this._hideGameName = !!hideGameName;
    this._applyPersona();
  }
  // One place decides what Steam shows, read on every logon, reconnect, game change and setting change. Up to 1.8.0 the logon took the
  // choice of that moment and the rest read a second copy that started as "online": with "Appear offline" on, the first game a job opened
  // made the account online again, and a reconnect went back to the choice of the first logon. Nothing is sent before the logon.
  _applyPersona() {
    if (!this.user || !this.user.steamID) return;
    const name = (this._hideGameName && this._playing.length > 0) ? 'invisible' : this._persona;
    try { this.user.setPersona(SteamEngine.PERSONA_STATE[name]); } catch (_) {}
  }
  // An unknown value (an old caller passing true/false, a hand-edited file) is "online"
  static personaName(v) {
    return Object.prototype.hasOwnProperty.call(SteamEngine.PERSONA_STATE, v) ? v : 'online';
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
    // Steam's word may have come before the listener was there (the first logon): the instance keeps it
    const word = this.user && this.user.playingState;
    if (!this.playingBlocked && word && word.blocked) this._setPlayingBlocked(true, word.appid || null);
    if (!this.playingBlocked) { try { this.user.gamesPlayed(union); } catch (_) {} }
    this._applyPersona();
  }
  // The open games again (after a logon, on the heartbeat), unless a game of the account is open on another device
  _resendGames() {
    if (this.playingBlocked || !this._playing || !this._playing.length) return;
    try { this.user.gamesPlayed(this._playing); } catch (_) {}
  }
  // blocked: another session of the account plays (appid: its game, when Steam says). When it ends the games of the jobs open again.
  _setPlayingBlocked(blocked, appid) {
    if (this.playingBlocked === blocked) return;
    this.playingBlocked = blocked;
    if (!blocked) this._resendGames();
    if (typeof this.onPlaying === 'function') { try { this.onPlaying(blocked, appid); } catch (_) {} }
  }
  get playing() { return this._playing; }

  logOff() {
    this._wasShutDown = true;
    this.isConnected = false;
    this._stopPulse();
    try { this.user.logOff(); } catch (_) {}
  }
}
Object.assign(SteamEngine.prototype, require('./engine/connection')({ SteamUser, SteamEngine }));
Object.assign(SteamEngine.prototype, require('./engine/achievements')({ SteamEngine }));
Object.assign(SteamEngine.prototype, require('./engine/store')({ SteamEngine }));
Object.assign(SteamEngine.prototype, require('./engine/market')({ SteamEngine }));
Object.assign(SteamEngine.prototype, require('./engine/chat')());

// A bigger inventory is read page by page: at most this many pages (2000 items each), a pause in between (Steam answers a quick second request with 429)
SteamEngine.INVENTORY_MAX_PAGES = 25;
SteamEngine.INVENTORY_PAGE_GAP_MS = 1500;
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
// An attempt that has not logged on by then is thrown away with its steam-user instance; the wait between attempts grows up to the second value.
SteamEngine.ATTEMPT_TIMEOUT_MS = 60000;
SteamEngine.RECONNECT_MAX_WAIT_MS = 60000;
// After the quick attempts of a limit in the settings (10 or 3): one attempt every five minutes, never given up
SteamEngine.SLOW_WAIT_MS = 5 * 60000;
// While waiting for an attempt: how often it looks whether Steam answers again
SteamEngine.PROBE_MS = 15000;
// Which job's games stay open when the 32 limit is full: Realistic Mode opens a single game and the
// achievements are written while that game is open; card farming earns cards; hour boosting comes last.
SteamEngine.OWNER_ORDER = ['realistic', 'card', 'hours', 'sequential', 'general'];
// The visibilities the top bar offers, in its order, and what each one sends to Steam
SteamEngine.PLAYING_WAIT_MS = 2 * 60000;
SteamEngine.PERSONA_STATE = { online: SteamUser.EPersonaState.Online, away: SteamUser.EPersonaState.Away, invisible: SteamUser.EPersonaState.Invisible };
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
