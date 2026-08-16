const SteamUser = require('steam-user');
// steam-user's internal protobufs map doesn't register the user-stats messages, so we encode/decode
// them ourselves from its generated schema and hand raw buffers to _send.
const Schema = require('steam-user/protobufs/generated/_load.js');

// Headless card-farm engine on node-steam-user. Logs onto the CM with a refresh token, opens a
// web session (for badge/inventory scraping) and drives gamesPlayed() to idle games so Steam
// drops trading cards. No Steam client required.
class SteamEngine {
  constructor() {
    this.user = new SteamUser();
    this.cookies = null;
    this.steamID = null;
    this.persona = null;
    this._playing = [];
    this._offline = false;
    this._hideGameName = false;
    // Hesabın cüzdan para birimi. BİLİNMİYOR olarak başlar - varsayılan vermek, cüzdan
    // olayı gelmediğinde Steam'den yanlış kurda fiyat çekip doğru kurun simgesiyle
    // göstermeye yol açıyordu (ör. TRY tutarların başına $ konması).
    this.walletCurrency = null;
    this._currency = null;
    // Gelen Steam sohbet mesajı geri çağrısı - main.js atar. (SteamEngine EventEmitter değil.)
    this.onChatMessage = null;
    this._autoReply = null;        // { text, cooldownMs } - null ise otomatik yanıt yok
    this._repliedAt = new Map();   // steamID64 -> son otomatik yanıt zamanı
    // ---- G3: baglanti durumu ----
    // Eskiden calisma aninda hicbir 'disconnected'/'error' dinleyicisi yoktu. Steam
    // baglantiyi dusurdugunde uygulama bunu HIC fark etmiyor, arayuz "calisiyor"
    // gostermeye devam ediyor, oyunlar aslinda kapali oluyordu. Saatlerce sessiz kayip.
    this.bagli = false;
    this._refreshToken = null;
    this._offlineSecenek = false;
    this._yenidenBaglanTimer = null;
    this._yenidenBaglanDeneme = 0;
    this._kapatildi = false;       // logOff() cagrildiysa yeniden baglanma
    this.onDurum = null;           // (durum) => void   durum: 'bagli'|'koptu'|'baglaniyor'|'vazgecildi'
    this._nabizTimer = null;
  }
  // Yalnızca cüzdan kuru henüz bilinmiyorken bir tahmin koyar; cüzdan olayı geldiğinde
  // onun değeri kesin kabul edilir ve buradaki değer ezilir.
  setCurrency(code) { if (!this.walletCurrency && code) this._currency = code; }
  // Fiyatların çekildiği ve gösterildiği TEK kur. null = henüz bilinmiyor.
  currencyCode() { return this.walletCurrency || this._currency || null; }

  // ---- ORTAK STEAM ISTEK KATMANI ----
  // Eskiden her cagri ham `fetch` kullaniyordu. Ag koptugunda kullaniciya `TypeError: fetch
  // failed` gibi anlamsiz bir metin donuyor, gecici hatalarda da hic yeniden denenmiyordu;
  // "basarimlar bazen hic yuklenmiyor" sikayetinin kaynagi buydu.
  // Burada: zaman asimi, gecici hatalarda ustel geri cekilme ve anlasilir hata metni.
  static hataMetni(e, nerede) {
    const m = String((e && (e.kod || e.message)) || e || '');
    if (/abort|timeout|ETIMEDOUT/i.test(m)) return (nerede || 'Steam') + ': istek zaman asimina ugradi. Baglantini kontrol et.';
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) return (nerede || 'Steam') + ': sunucuya ulasilamadi. Internet baglantin kesilmis olabilir.';
    if (/ECONNRESET|ECONNREFUSED|socket hang up|fetch failed/i.test(m)) return (nerede || 'Steam') + ': baglanti koptu. Birazdan tekrar dene.';
    if (/HTTP 429/.test(m)) return (nerede || 'Steam') + ': istek limiti asildi. Bir dakika bekleyip tekrar dene.';
    if (/HTTP 401|HTTP 403/.test(m)) return (nerede || 'Steam') + ': oturum gecersiz. Cikip yeniden giris yap.';
    if (/HTTP 5\d\d/.test(m)) return (nerede || 'Steam') + ': Steam sunucusu su an cevap veremiyor.';
    return (nerede ? nerede + ': ' : '') + m;
  }

  async _iste(url, secenekler = {}, nerede = 'Steam') {
    const { deneme = 3, zamanAsimiMs = 20000, cerezli = true, ...fetchSec } = secenekler;
    const basliklar = { 'User-Agent': SteamEngine.UA, ...(fetchSec.headers || {}) };
    if (cerezli && this.cookies) basliklar.Cookie = this.cookies.join('; ');

    let sonHata = null;
    for (let i = 0; i < deneme; i++) {
      const kes = new AbortController();
      const sayac = setTimeout(() => kes.abort(), zamanAsimiMs);
      try {
        const r = await fetch(url, { ...fetchSec, headers: basliklar, signal: kes.signal });
        clearTimeout(sayac);
        // 429 ve 5xx gecici kabul edilir, yeniden denenir. Digerleri hemen hata.
        if (r.status === 429 || r.status >= 500) {
          sonHata = new Error('HTTP ' + r.status);
          if (i < deneme - 1) { await new Promise((res) => setTimeout(res, 1500 * Math.pow(2, i))); continue; }
          throw sonHata;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r;
      } catch (e) {
        clearTimeout(sayac);
        sonHata = e;
        const gecici = /abort|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|EAI_AGAIN|HTTP 429|HTTP 5\d\d/i
          .test(String(e && e.message));
        if (!gecici || i === deneme - 1) break;
        await new Promise((res) => setTimeout(res, 1500 * Math.pow(2, i)));
      }
    }
    const hata = new Error(SteamEngine.hataMetni(sonHata, nerede));
    hata.ham = sonHata;
    throw hata;
  }

  // Hesabın PAZAR para birimini doğrudan Steam Topluluk Pazarı'ndan okur.
  // Neden protokoldeki 'wallet' olayı yetmiyor: o olay yalnızca cüzdanı olan hesaplarda ve
  // her zaman zamanında gelmiyor; gelmediğinde kur tahmin ediliyor, fiyatlar yanlış kurda
  // çekiliyordu. Pazar sayfası ise oturum açmış kullanıcı için `g_rgWalletInfo` içinde
  // `wallet_currency` alanını gömüyor - kullanıcının pazarında gördüğü kurun ta kendisi.
  async detectMarketCurrency() {
    if (!this.cookies) return null;
    try {
      const r = await this._iste('https://steamcommunity.com/market/', { deneme: 2 }, 'Pazar kuru');
      const html = await r.text();
      const m = html.match(/"wallet_currency"\s*:\s*(\d+)/);
      if (!m) return null;
      const code = SteamEngine.currencyName(+m[1]);
      if (!code) return null;
      this.walletCurrency = code;
      this._currency = code;
      return code;
    } catch (_) { return null; }
  }
  // Otomatik yanıt ayarı. text boşsa/kapalıysa sadece bildirim gösterilir, yanıt yazılmaz.
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
        // (Invisible if "Çevrimdışı görün" ayarı açıksa - arkadaşlar farming'i göremez).
        // Without this, gamesPlayed() registers at the protocol level but nothing is visible.
        this.user.setPersona(offline ? SteamUser.EPersonaState.Invisible : SteamUser.EPersonaState.Online);
        this.user.webLogOn();
      });
      this.user.once('accountInfo', (name) => { this.persona = name; done.info = true; maybe(); });
      // Hesabın cüzdan para birimi - Steam fiyatlarını hangi kurda çekeceğimizi belirler.
      // (Ayarlar > Genel > Para birimi "Otomatik" iken bu kullanılır.)
      this.user.on('wallet', (_hasWallet, currency) => {
        const code = SteamEngine.currencyName(currency);
        // Cüzdan kuru KESİN kaynaktır - önceki tahmini her zaman ezer. (Eskiden
        // `this._currency || code` yazıyordu; _currency kurucuda 'TRY' olduğu için
        // koşul hiç tutmuyor, hesap USD olsa bile fiyatlar TRY olarak çekiliyordu.)
        if (code) { this.walletCurrency = code; this._currency = code; }
      });
      // Gelen arkadaş mesajları. Headless çalışırken kimse cevap veremiyordu; artık uygulamada
      // bildirim çıkıyor ve istenirse tek seferlik otomatik yanıt gönderiliyor.
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
        // Web oturumu açılır açılmaz pazarın kendi kurunu doğrula (aşağıya bak) - cüzdan
        // olayı gecikirse ya da hiç gelmezse fiyatlar yine de doğru kurda çekilsin.
        this.detectMarketCurrency().catch(() => {});
        done.web = true; maybe();
      });
      this.user.once('error', reject);
      setTimeout(() => reject(new Error('CM logon zaman aşımı')), 25000);
    }).then((r) => {
      // Giris basarili: kalici dinleyicileri kur (bir kez).
      this._refreshToken = refreshToken;
      this._offlineSecenek = !!offline;
      this.bagli = true;
      this._yenidenBaglanDeneme = 0;
      this._kopmaDinleyicileriniKur();
      this._nabziBaslat();
      this._durumBildir('bagli');
      return r;
    });
  }

  _durumBildir(durum, ek) {
    if (this.onDurum) { try { this.onDurum(durum, ek || {}); } catch (_) {} }
  }

  // Kopma/hata dinleyicileri. logOn her cagrildiginda tekrar eklenmesin diye bayrakli.
  _kopmaDinleyicileriniKur() {
    if (this._dinleyiciKuruldu) return;
    this._dinleyiciKuruldu = true;

    const kopdu = (sebep) => {
      if (this._kapatildi) return;
      this.bagli = false;
      this.cookies = null;             // web oturumu da dustu, yeniden alinacak
      this._durumBildir('koptu', { sebep: String(sebep || '') });
      this._yenidenBaglanmayiPlanla();
    };

    this.user.on('disconnected', (eresult, msg) => kopdu(msg || ('EResult ' + eresult)));
    this.user.on('error', (e) => kopdu((e && e.message) || 'bilinmeyen hata'));

    // Yeniden baglandiginda web oturumu ve oyunlar KENDILIGINDEN geri gelmez.
    this.user.on('loggedOn', () => {
      this.bagli = true;
      this._yenidenBaglanDeneme = 0;
      try { this.steamID = this.user.steamID.getSteamID64(); } catch (_) {}
      try {
        this.user.setPersona(this._offlineSecenek ? SteamUser.EPersonaState.Invisible : SteamUser.EPersonaState.Online);
      } catch (_) {}
      try { this.user.webLogOn(); } catch (_) {}
      // Kopmadan once acik olan oyunlari geri ac - asil kayip buradaydi.
      if (this._playing && this._playing.length) {
        try { this.user.gamesPlayed(this._playing); } catch (_) {}
      }
      this._durumBildir('bagli', { yenidenBaglandi: true, oyunlar: (this._playing || []).length });
    });
    this.user.on('webSession', (_sid, cookies) => { this.cookies = cookies; });
  }

  _yenidenBaglanmayiPlanla() {
    if (this._kapatildi || this._yenidenBaglanTimer) return;
    if (!this._refreshToken) return;
    this._yenidenBaglanDeneme++;
    // Ustel geri cekilme, en fazla 5 dakika. Steam tarafi gecici sorunlarda hemen
    // kabul etmiyor; saniyede bir denemek isi kotulestiriyor.
    const bekle = Math.min(300000, 5000 * Math.pow(2, Math.min(6, this._yenidenBaglanDeneme - 1)));
    this._durumBildir('baglaniyor', { deneme: this._yenidenBaglanDeneme, bekleMs: bekle });
    this._yenidenBaglanTimer = setTimeout(() => {
      this._yenidenBaglanTimer = null;
      if (this._kapatildi) return;
      try { this.user.logOn({ refreshToken: this._refreshToken }); }
      catch (_) { this._yenidenBaglanmayiPlanla(); }
    }, bekle);
  }

  // Nabiz: "bagliyim" diyoruz ama oyunlar gercekten acik mi? steam-user'in kendi
  // durumu ile bizim beklentimiz ayrisabiliyor (sessiz kopma). 60 saniyede bir bak.
  _nabziBaslat() {
    if (this._nabizTimer) return;
    this._nabizTimer = setInterval(() => {
      if (this._kapatildi) return;
      const gercektenBagli = !!(this.user && this.user.steamID);
      if (this.bagli && !gercektenBagli) {
        this.bagli = false;
        this._durumBildir('koptu', { sebep: 'nabiz: oturum yok' });
        this._yenidenBaglanmayiPlanla();
        return;
      }
      // Oyun acik olmasi gerekirken kapaliysa tekrar gonder (ucuz, yan etkisiz)
      if (this.bagli && this._playing && this._playing.length) {
        try { this.user.gamesPlayed(this._playing); } catch (_) {}
      }
    }, 60000);
  }

  _nabziDurdur() {
    if (this._nabizTimer) { clearInterval(this._nabizTimer); this._nabizTimer = null; }
    if (this._yenidenBaglanTimer) { clearTimeout(this._yenidenBaglanTimer); this._yenidenBaglanTimer = null; }
  }

  // Oyun adi rozet sayfasinda JavaScript dizgi kacisiyla gomulu gelir:
  //   ShowCardDropInfo( &quot;Need for Speed™ Heat&quot;, ... )
  // Hem HTML varliklarini hem \uXXXX / \" / \\ kaciislarini cozmek gerekiyor, yoksa
  // arayuzde "Need for Speed™" gibi ham metin gorunuyordu.
  static decodeOyunAdi(ham) {
    if (!ham) return '';
    let s = String(ham);
    // Sayisal varliklar: &#174; (R) , &#8482; (TM) , &#x2122; ...
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
  // DIKKAT: Steam, var olmayan sayfa numarasi istendiginde BOS sayfa dondurmuyor; son
  // gecerli sayfayi (ya da 1. sayfayi) tekrar veriyor. Eski kod p=1..20 arasi kor donguyle
  // gezip sadece "hic badge_row yok" durumunda duruyordu, bu yuzden ayni oyunlar 20 kez
  // listeye ekleniyordu: 2 oyun -> 40 satir, 5 kart -> 100 kart gibi.
  // Simdi sayfa sayisi sayfalama kutusundan okunuyor, ayrica ayni appid kumesi tekrar
  // gelirse dongu kiriliyor ve sonuc appid uzerinden tekillestiriliyor.
  async getDropGames() {
    if (!this.cookies) throw new Error('web oturumu yok');
    const bulunan = new Map();          // appid -> { appid, name, remaining }
    let sonImza = null;
    let sonSayfa = 1;

    for (let p = 1; p <= sonSayfa && p <= 50; p++) {
      const url = `https://steamcommunity.com/profiles/${this.steamID}/badges/?l=english&p=${p}`;
      const r = await this._iste(url, {}, 'Rozet sayfasi');
      const html = await r.text();

      // Ilk sayfada gercek sayfa sayisini ogren: sayfalama baglantilarindaki en buyuk p degeri.
      if (p === 1) {
        const sayfalar = [...html.matchAll(/[?&]p=(\d+)/g)].map((m) => +m[1]).filter((n) => n > 0 && n < 1000);
        if (sayfalar.length) sonSayfa = Math.max(...sayfalar);
      }

      const rows = html.split('class="badge_row');
      if (rows.length <= 1) break;                 // gercekten bos sayfa

      const buSayfa = [];
      for (const row of rows.slice(1)) {
        const app = row.match(/card_drop_info_gamebadge_(\d+)_/) || row.match(/steam:\/\/run\/(\d+)/);
        if (!app) continue;
        buSayfa.push(app[1]);
        const drop = row.match(/(\d+)\s+card drops remaining/i);
        if (!drop) continue;                        // "No card drops remaining" veya hic yok
        const appid = +app[1];
        if (bulunan.has(appid)) continue;           // ayni oyun ikinci kez sayilmasin
        const nm = row.match(/ShowCardDropInfo\(\s*&quot;([\s\S]*?)&quot;\s*,/)
          || row.match(/ShowCardDropInfo\(\s*&quot;([\s\S]*?)&quot;/);
        const name = nm ? SteamEngine.decodeOyunAdi(nm[1]) : ('App ' + appid);
        bulunan.set(appid, { appid, name: name || ('App ' + appid), remaining: +drop[1] });
      }

      // Steam ayni sayfayi tekrar verdiyse dur (sayfalama okunamadigi durumlar icin emniyet).
      const imza = buSayfa.join(',');
      if (imza && imza === sonImza) break;
      sonImza = imza;
    }
    return [...bulunan.values()];
  }

  // Own Steam profile: avatar, display name and account level - straight from the protocol
  // (getPersonas/getSteamLevels), no Web API key needed. Used to fill the sidebar/account card.
  getProfile() {
    const sid = this.steamID;
    if (!sid) return Promise.reject(new Error('Steam oturumu yok'));
    const personas = () => new Promise((res) => this.user.getPersonas([sid], (err, p) => res(err ? null : (p && p[sid]))));
    const levels = () => new Promise((res) => this.user.getSteamLevels([sid], (err, l) => res(err ? null : (l && l[sid]))));
    return Promise.all([personas(), levels(), this.getVanityURL()]).then(([p, level, vanity]) => ({
      steamID: sid,
      persona: (p && p.player_name) || this.persona || null,
      avatar: (p && (p.avatar_url_full || p.avatar_url_medium || p.avatar_url_icon)) || null,
      level: (typeof level === 'number') ? level : null,
      vanity,
    }));
  }

  // Ozel profil adresi (steamcommunity.com/id/<ad>). Protokol bu bilgiyi vermiyor;
  // profilin XML ciktisinda <customURL> olarak duruyor. Kullanici bunu hic degistirmez,
  // o yuzden oturum boyunca bir kez cekilip saklanir. Basarisiz olursa null doner ve
  // arayuz "tanimli degil" gosterir - hicbir sey kirilmaz.
  async getVanityURL() {
    if (this._vanity !== undefined) return this._vanity;
    this._vanity = null;
    try {
      const r = await this._iste(
        `https://steamcommunity.com/profiles/${this.steamID}/?xml=1`,
        { deneme: 1, zamanAsimiMs: 8000 },
        'Steam profili',
      );
      const xml = await r.text();
      const m = xml.match(/<customURL>(?:<!\[CDATA\[)?([^\]<]*)/i);
      if (m && m[1] && m[1].trim()) this._vanity = m[1].trim();
    } catch (_) { /* profil gizli veya ag yok - ozel adres gosterilmez, sorun degil */ }
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

  // Full game library (for Saat Yükseltici's game picker) via the Steam Web API, authenticated
  // with the JWT embedded in the steamLoginSecure cookie from webLogOn (same token shape ASF uses).
  async getOwnedGames() {
    if (!this.cookies) throw new Error('web oturumu yok');
    const token = this._accessToken();
    if (!token) throw new Error('steamLoginSecure çerezi yok');
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?access_token=${encodeURIComponent(token)}&steamid=${this.steamID}&include_appinfo=true&include_played_free_games=true&format=json`;
    const r = await this._iste(url, {}, 'Oyun listesi');
    const j = await r.json();
    const games = (j.response && j.response.games) || [];
    // Steam, profil gizliligi "Oyun ayrintilari: Gizli" ise BOS bir yanit dondurur; eskiden
    // bu sessizce "0 oyun" olarak gorunuyor, kullanici kutuphanesinin neden bos oldugunu
    // anlayamiyordu. Ayirt edip acik bir mesaj veriyoruz.
    if (!games.length) {
      const say = (j.response && typeof j.response.game_count === 'number') ? j.response.game_count : null;
      if (say === null || say === 0) {
        throw new Error('Oyun listesi bos dondu. Steam profilinde Gizlilik > "Oyun ayrintilari" '
          + 'ayarini Herkese Acik yapman gerekiyor, aksi halde Steam kutuphaneni paylasmiyor.');
      }
    }
    return games.map((g) => ({ appid: g.appid, name: g.name, playtimeForever: g.playtime_forever || 0, hasStats: !!g.has_community_visible_stats }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Real inventory (context 753/6 = Steam Community items: cards, backgrounds, emoticons, gems...).
  // count=5000 returns HTTP 400 on some accounts; 2000 is the known-working cap (same limit the
  // old .NET app hit and fixed the same way).
  async getInventory() {
    if (!this.cookies) throw new Error('web oturumu yok');
    const url = `https://steamcommunity.com/inventory/${this.steamID}/753/6?l=english&count=2000`;
    const r = await this._iste(url, {}, 'Envanter');
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
        // 96x96 küçük kalıyordu (yüksek DPI ekranda bulanık, detay panelinde 150px kutuda eziliyor).
        // Steam ekonomi CDN'i istenen boyutu üretir - 330x192 kart oranına uygun ve net.
        iconUrl: d.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${d.icon_url}/330x192` : null,
        tradable: !!d.tradable,
        marketable: !!d.marketable,
        type: (classTag && TYPE_MAP[classTag.internal_name]) || 'other',
        gameName: gameTag ? gameTag.localized_tag_name : null,
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
    // Fiyatlar HER ZAMAN hesabın cüzdan kurunda çekilir; arayüz de aynı kurla gösterir.
    // Kur bilinmiyorsa TAHMİN YAPILMAZ - yanlış kurda çekilen tutarı doğru kurun
    // simgesiyle göstermek, sayıları sessizce 40 kat şişirmek demekti.
    const code = this.currencyCode();
    const cur = code && SteamEngine.CURRENCY[code];
    if (!cur) return { noCurrency: true };
    const url = `https://steamcommunity.com/market/priceoverview/?appid=753&currency=${cur}&market_hash_name=${encodeURIComponent(marketHashName)}`;
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

  // GERÇEKLEŞMİŞ SATIŞ GEÇMİŞİ. Bir eşyanın "gerçek değeri" buradan çıkar: satıştaki
  // ilanlar bağlayıcı değildir (tek kişi 999.999'a listeleyebilir, kimse almaz), oysa
  // pricehistory Steam'in kaydettiği GERÇEK satışlardır - her kayıt o saat dilimindeki
  // medyan satış fiyatı ve adedi. Tutarlar hesabın cüzdan kurundadır (uç nokta kur
  // parametresi almaz, oturuma göre döner).
  async getPriceHistory(marketHashName) {
    if (!this.cookies) throw new Error('web oturumu yok');
    const url = `https://steamcommunity.com/market/pricehistory/?appid=753&market_hash_name=${encodeURIComponent(marketHashName)}`;
    const r = await fetch(url, { headers: { Cookie: this.cookies.join('; ') } });
    if (r.status === 429) return { rateLimited: true };
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || !j.success || !Array.isArray(j.prices) || !j.prices.length) return null;

    // Steam tarihi "Jul 30 2026 01: +0" biçiminde veriyor - sondaki saat ekini atıp ayrıştırıyoruz.
    const parseTs = (s) => {
      const m = String(s).match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2})/);
      if (!m) return NaN;
      return Date.parse(`${m[1]} ${m[2]} ${m[3]} ${m[4]}:00:00 GMT`);
    };
    const points = j.prices.map(([date, price, qty]) => ({
      ts: parseTs(date), price: +price, qty: parseInt(qty, 10) || 0,
    })).filter((p) => Number.isFinite(p.price) && p.price > 0);
    if (!points.length) return null;

    // Adetle AĞIRLIKLI medyan: 100 adet 0,30'dan satılıp 1 adet 50'den satıldıysa
    // gerçek piyasa 0,30'dur. Düz ortalama tek bir uç satıştan sapar, medyan sapmaz.
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
    // 30 gün yoksa 90, o da yoksa tüm zamanlar - az işlem gören eşyalarda da bir değer çıksın
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
      stats,                                   // gerçek satışlardan çıkan değer
      recent: points.slice(-12).map((p) => ({ price: p.price, qty: p.qty, ts: p.ts })),
      series: points.slice(-180).map((p) => [p.ts, p.price, p.qty]),   // küçük grafik için
    };
  }

  // ================== SİPARİŞ DEFTERİ ==================
  // Steam pazar listeleme sayfasını 2026'da yeni bir SSR arayüzüne taşıdı. Eski yol
  // (`Market_LoadOrderSpread(item_nameid)` + `itemordershistogram` uç noktası) ARTIK YOK:
  // sayfada o script bloğu bulunmuyor ve `/render/?format=json` HTML döndürüyor. Bunun
  // yerine yeni sayfa, sipariş defterini doğrudan HTML'e basıyor:
  //
  //   "4 for sale starting at $22.57"      + <table> Price/Quantity satırları
  //   "6 requests to buy at $0.04 or lower" + <table> Price/Quantity satırları
  //
  // Miktarlar kümülatif DEĞİL, fiyat başına gerçek adet. CSS sınıf adları karıştırılmış
  // (APEAY0rnAbo- gibi) ve her dağıtımda değişir, bu yüzden sınıfa göre değil YAPIYA göre
  // ayrıştırıyoruz: tabloları bul, her tabloyu kendinden önce gelen özet cümlesine göre
  // "satış" ya da "alım" diye sınıflandır. Sayfa giriş gerektirmiyor ama çerez varsa
  // tutarlar hesabın kendi kurunda gelir.
  async getItemOrders(marketHashName) {
    const code = this.currencyCode();
    if (!code) return { noCurrency: true };
    const url = `https://steamcommunity.com/market/listings/753/${encodeURIComponent(marketHashName)}`;
    const r = await fetch(url, {
      headers: {
        Cookie: this.cookies ? this.cookies.join('; ') : '',
        // Özet cümlelerini İngilizce yakalayabilmek için dil sabitleniyor; tarayıcı benzeri
        // bir User-Agent olmadan Steam sayfayı farklı biçimde döndürebiliyor.
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': SteamEngine.UA,
      },
    });
    if (r.status === 429) return { rateLimited: true, error: 'Steam istek limiti (429)' };
    if (!r.ok) return { error: 'pazar sayfası HTTP ' + r.status };
    const html = await r.text();

    const strip = (x) => String(x).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
    if (!tables.length) {
      // Tablo yoksa üç olasılık var; hangisi olduğunu söyleyebiliyoruz:
      //   - sayfa başlığı genel "Market Item" ise böyle bir pazar öğesi yok (ad değişmiş olabilir)
      //   - "no listings" yazıyorsa öğe var ama satışta hiç ilan yok
      //   - başka bir şeyse sayfa yapısı beklenenden farklı (Steam yine değiştirmiş olabilir)
      const duz = strip(html);
      const baslik = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      if (/^\s*Market Item\b/i.test(baslik)) {
        return { error: 'bu öğe Steam pazarında bulunamadı (pazar adı değişmiş olabilir)' };
      }
      if (/no listings|there are no listings/i.test(duz)) {
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

    let sell = [], buy = [], sellCount = 0, buyCount = 0, ornekRaw = null;
    for (const t of tables) {
      const once = strip(html.slice(Math.max(0, t.index - 600), t.index));
      const rows = parseRows(t[1]);
      if (!rows.length) continue;
      if (!ornekRaw) ornekRaw = rows[0].raw;
      const satisOzet = once.match(/([\d,.]+)\s+for sale/i);
      const alimOzet  = once.match(/([\d,.]+)\s+requests? to buy|([\d,.]+)\s+buy orders?/i);
      const say = (m) => (m ? parseInt(String(m[1] || m[2]).replace(/[^\d]/g, ''), 10) || 0 : 0);
      if (satisOzet) { sell = rows; sellCount = say(satisOzet) || rows.reduce((s, x) => s + x.qty, 0); }
      else if (alimOzet) { buy = rows; buyCount = say(alimOzet) || rows.reduce((s, x) => s + x.qty, 0); }
      else if (!sell.length) { sell = rows; sellCount = rows.reduce((s, x) => s + x.qty, 0); }
      else if (!buy.length) { buy = rows; buyCount = rows.reduce((s, x) => s + x.qty, 0); }
    }
    if (!sell.length && !buy.length) return { error: 'sipariş defteri satırları okunamadı' };

    // KUR DOĞRULAMASI. Sayfa oturuma göre kur seçiyor; beklediğimizden farklı bir kurda
    // geldiyse sayıyı yanlış simgeyle göstermektense açıkça belirtiyoruz (daha önce tam
    // olarak bu tür bir uyumsuzluk tutarları 40 kat şişirmişti).
    const beklenen = SteamEngine.SYMBOL[code];
    if (ornekRaw && beklenen && !String(ornekRaw).includes(beklenen)) {
      return { error: 'pazar sayfası ' + code + ' dışında bir kurda geldi (' + ornekRaw + ')' };
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
    if (!this.cookies) throw new Error('web oturumu yok');
    const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
    if (!sidCookie) throw new Error('sessionid çerezi yok');
    const sessionid = sidCookie.split('=')[1];
    const body = new URLSearchParams({
      sessionid, appid: '753', contextid: '6',
      assetid: String(assetId), amount: String(amount), price: String(Math.round(priceCents)),
    });
    const r = await fetch('https://steamcommunity.com/market/sellitem/', {
      method: 'POST',
      headers: {
        Cookie: this.cookies.join('; '),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `https://steamcommunity.com/profiles/${this.steamID}/inventory`,
        Origin: 'https://steamcommunity.com',
      },
      body,
    });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error('Market yanıtı okunamadı (HTTP ' + r.status + ')');
    if (!j.success) throw new Error(j.message || 'Listeleme reddedildi');
    return j; // { success, requires_confirmation, needs_mobile_confirmation, ... }
  }

  // Low-level: encode `msgType`→buffer, send EMsg, decode the job-response buffer with `respType`.
  // We do the protobuf encode/decode ourselves because steam-user doesn't map these EMsgs.
  // Protokol istegi. Steam bazen tek bir istegi hic cevaplamiyor; eskiden bu dogrudan
  // "Steam stat yanıtı zaman aşımı" olarak yuzeye cikip basarim sayfasini bos birakiyordu.
  // Artik gecici sayilip bir kez daha deneniyor ve mesaj ne yapilmasi gerektigini soyluyor.
  _sendRecvTek(emsg, msgType, obj, respType, timeoutMs) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('zaman asimi')), timeoutMs);
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
    let son = null;
    for (let i = 0; i < 2; i++) {
      try { return await this._sendRecvTek(emsg, msgType, obj, respType, timeoutMs); }
      catch (e) {
        son = e;
        if (!/zaman asimi/i.test(String(e && e.message))) break;
        if (i === 0) await new Promise((r) => setTimeout(r, 1200));
      }
    }
    if (/zaman asimi/i.test(String(son && son.message))) {
      throw new Error('Steam bu oyunun basarim verisini zamaninda gondermedi. '
        + 'Steam yogun olabilir; birkac saniye sonra Yeniden Dene.');
    }
    throw son;
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
    if (!this.steamID) throw new Error('Steam oturumu yok');
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
      for (const bitIdx of Object.keys(st.bits)) {
        const b = st.bits[bitIdx];
        if (!b || typeof b !== 'object') continue;
        const disp = b.display || {};
        defs.push({
          statId: +statId, bit: +bitIdx,
          apiName: b.name || (statId + '_' + bitIdx),
          name: loc(disp.name) || b.name || '?',
          desc: loc(disp.desc) || '',
          icon: disp.icon || null, iconGray: disp.icon_gray || null,
          // Steam sema alanlari:
          //   permission bit 0 (1) = gizli basarim (acilana kadar aciklamasi saklanir)
          //   permission bit 1 (2) = KORUMALI - yalnizca oyun sunucusu yazabilir.
          // Korumali olanlari istemciden yazmak her zaman EResult 8 (InvalidParam) doner.
          // Eskiden bu alan tamamen yok sayiliyordu (`? false : false` olu koduydu), bu yuzden
          // kullanici sebebini anlamadan hata aliyordu.
          hidden: (+(b.permission || 0) & 1) === 1,
          korumali: (+(b.permission || 0) & 2) === 2,
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
      const r = await this._iste(url, { cerezli: false, deneme: 2, zamanAsimiMs: 12000 }, 'Nadirlik');
      const j = await r.json().catch(() => null);
      const list = (j && j.achievementpercentages && j.achievementpercentages.achievements) || [];
      const map = {};
      // DİKKAT: Steam `percent` alanını STRING döndürüyor (ör. "74.1"). Sayıya çevirmezsek
      // aşağıdaki `typeof pct === 'number'` kontrolü hep false olur ve nadirlik null kalır.
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
      const r = await this._iste(url, { deneme: 2, zamanAsimiMs: 12000 }, 'Acilma tarihleri');
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
    // Aynı önbellek setAchievements ile paylaşılır: yazdığımız değerler burada da görünür,
    // yani sayfaya geri dönünce açtığımız başarımın tiki kaybolmaz.
    const raw = await this._statsCached(appid);
    if (!raw || !raw.defs.length) return null;
    const iconUrl = (f) => (f ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${f}` : null);
    const [rarityMap, unlockMap] = await Promise.all([
      this.getAchievementRarity(appid),
      this.getAchievementUnlockTimes(appid),
    ]);
    const achievements = raw.defs.map((d) => {
      const val = raw.statValues.get(d.statId >>> 0) || 0;
      // korumali bayragi arayuze tasinir (asagidaki nesneye ekleniyor)
      const achieved = !!((val >> d.bit) & 1);
      const pct = rarityMap[d.apiName];
      return {
        apiName: d.apiName, name: d.name, desc: d.desc, achieved,
        icon: iconUrl(achieved ? d.icon : (d.iconGray || d.icon)),
        unlockTime: unlockMap[d.apiName] || null,
        // Bazı oyunlarda (ör. CS2) Steam bu uç noktadan yalnızca birkaç başarım döndürür;
        // eşleşmeyenlerde nadirlik bilinmiyor olarak kalır - uydurma değer üretilmez.
        rarityPct: Number.isFinite(pct) ? pct : null,
        // G4: yalnizca oyun sunucusunun yazabildigi basarim. Arayuz bunu isaretler ve
        // toplu islemde secilemez yapar; gondermek her zaman EResult 8 donerdi.
        korumali: !!d.korumali,
        gizli: !!d.hidden,
      };
    });
    return { gameName: null, logo: null, total: achievements.length, unlocked: achievements.filter((a) => a.achieved).length, achievements };
  }

  // Unlock/lock achievements headless (ASF-style: CMsgClientStoreUserStats2). `changes` is
  // [{apiName, unlock:true|false}]. Modifies the account permanently (reversible by re-locking).
  // Şema+değerler önbelleği: her tek başarım işleminde ClientGetUserStats'i baştan çağırmak
  // her tıkta saniyelerce bekletiyordu. Şema değişmez; stat değerlerini yazdıktan sonra
  // önbellekte yerel olarak güncelliyoruz, böylece arka arkaya işlemler anında oluyor.
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

  // G5: Steam bazi oyunlarda istatistik yazmayi ancak o oyun "oynaniyor" gorunurken
  // kabul ediyor. Yazma suresince oyunu acar, isi bitince onceki duruma geri doner.
  // Kart/saat isi calisiyorsa o listeye EKLENIR, uzerine yazilmaz.
  async _oyunuAcikTut(appid, isFn) {
    const oncekiler = (this._playing || []).slice();
    const zatenAcik = oncekiler.includes(+appid);
    if (!zatenAcik) {
      try { this.user.gamesPlayed(oncekiler.concat([+appid])); } catch (_) {}
      // Steam'in "oynuyor" durumunu islemesi icin kisa bir an gerekiyor
      await new Promise((r) => setTimeout(r, 1200));
    }
    try {
      return await isFn();
    } finally {
      if (!zatenAcik) {
        try { this.user.gamesPlayed(oncekiler); } catch (_) {}
      }
    }
  }

  async setAchievements(appid, changes) {
    return this._oyunuAcikTut(appid, () => this._setAchievementsIc(appid, changes));
  }

  async _setAchievementsIc(appid, changes) {
    const raw = await this._statsCached(appid);
    if (!raw) throw new Error('Bu oyunun başarım şeması yok');
    const byName = new Map(raw.defs.map((d) => [d.apiName, d]));
    // G4: korumali basarimlari gondermeden once ayikla - Steam bunlari zaten reddediyor,
    // gondermek sadece hata sayacini sisiriyor ve donguyu bosuna mesgul ediyor.
    const korumaliOlanlar = changes.filter((c) => {
      const d = byName.get(c.apiName);
      return d && d.korumali;
    });
    if (korumaliOlanlar.length === changes.length && changes.length) {
      const e = new Error('Bu başarım oyun tarafından korunuyor, dışarıdan açılamaz.');
      e.korumali = true;
      throw e;
    }
    const dirty = new Map(); // statId -> new value
    for (const c of changes) {
      const d = byName.get(c.apiName);
      if (!d || d.korumali) continue;
      let val = dirty.has(d.statId) ? dirty.get(d.statId) : (raw.statValues.get(d.statId >>> 0) || 0);
      val = c.unlock ? (val | (1 << d.bit)) : (val & ~(1 << d.bit));
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
      this.invalidateStats(appid);   // crc bayatlamış olabilir, sonraki denemede taze çek
      throw new Error('Steam kaydı reddetti (EResult ' + eresult + ')');
    }
    // Yazdığımız değerleri önbellekte de güncelle ki sıradaki işlem doğru tabandan hesaplasın
    dirty.forEach((val, statId) => raw.statValues.set(statId >>> 0, val));
    return { ok: true, changed: changes.length };
  }

  // Ayarlar > Gizlilik'teki "Çevrimdışı görün" anahtarı bağlantı sırasında zaten uygulanır
  // (bkz logOn); bu, oturum AÇIKKEN canlı değiştirmek için (settings:set anında çağırır).
  setOfflineMode(offline) {
    this._offline = !!offline;
    this._applyPersona();
  }

  // "Oyun adını gizle": Steam, oynanan oyunu çevrimiçiyken herkese gösterir; gizlemenin tek
  // gerçek yolu görünmez duruma geçmek. Bu yüzden bu anahtar SADECE oyun oynarken görünmez
  // yapar (çevrimdışı modun aksine, boştayken çevrimiçi kalırsın). Kart düşüşü etkilenmez.
  applyPrivacy(offline, hideGameName) {
    this._offline = !!offline;
    this._hideGameName = !!hideGameName;
    this._applyPersona();
  }
  _applyPersona() {
    const hidden = this._offline || (this._hideGameName && this._playing.length > 0);
    try { this.user.setPersona(hidden ? SteamUser.EPersonaState.Invisible : SteamUser.EPersonaState.Online); } catch (_) {}
  }

  play(appids) { this._playing = appids.slice(); this.user.gamesPlayed(appids); this._applyPersona(); }
  stop() { this._playing = []; this.user.gamesPlayed([]); this._applyPersona(); }
  get playing() { return this._playing; }
  // Kasitli cikis: yeniden baglanma denemesi YAPILMAZ (G3 dongusuyle carpismasin diye).
  logOff() {
    this._kapatildi = true;
    this.bagli = false;
    this._nabziDurdur();
    try { this.user.logOff(); } catch (_) {}
  }
}

// Steam'in kendi ECurrencyCode enum'u (steam-user içinde geliyor) - kod<->isim çevirisi
// buradan yapılıyor, elle liste tutmuyoruz.
// Steam'in yeni SSR pazar sayfasi tarayici benzeri bir User-Agent bekliyor.
SteamEngine.UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
SteamEngine.CURRENCY = SteamUser.ECurrencyCode;
// Steam fiyat metinlerini sayıya çevirir. Biçim para birimine göre değişiyor:
//   "$1,084.65"  (virgül binlik, nokta ondalık)
//   "1.084,65 TL" / "1.084,65€"  (nokta binlik, virgül ondalık)
//   "1 084,65 pуб."  (boşluk binlik)
//   "¥1,084"  (ondalık yok)
// ESKİ ayrıştırıcı virgül-binlik biçimini çözemiyordu: "$1,084.65" -> 1.084 (1000 kat hata).
// Kural: sondaki ayraç 1-2 basamak takip ediyorsa ONDALIKTIR, diğer tüm ayraçlar binliktir.
SteamEngine.parseMoney = (s) => {
  if (s == null) return null;
  // Sondaki ayraçları at: "1 084,65 pуб." temizlenince "1084,65." kalıyor ve o son nokta
  // ondalık sanılıp sayıyı bozuyordu.
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
// Desteklenen gösterim para birimleri (sembol + yerel biçim). Steam bunların hepsinde fiyat
// verebiliyor; listede olmayan bir hesap kuruyla karşılaşırsak sembol yerine kod gösterilir.
SteamEngine.SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', TRY: '₺', RUB: '₽', BRL: 'R$', JPY: '¥', CNY: '¥',
  CAD: 'CA$', AUD: 'A$', INR: '₹', UAH: '₴', PLN: 'zł', KZT: '₸', ARS: 'AR$', MXN: 'MX$',
};

module.exports = SteamEngine;
