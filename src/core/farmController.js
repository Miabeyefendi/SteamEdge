// Drives the SteamEngine over time according to the selected drop mode. Emits progress
// ('farm:tick') so the renderer can show a live idle-duration bar per game.
//
// Modes:
//  - sequential: play list order, one game at a time, `durationMs` each, then next.
//  - most / least: same round-robin timing, sorted by remaining cards desc/asc first.
//  - priority: same round-robin timing, using the caller-supplied order as-is.
//  - fast: Steam bir oyunda kart düşürmeye ancak oyun süresi 2 SAATİ geçtikten sonra başlar.
//          Bu yüzden hızlı mod iki aşamalıdır:
//            1) Isıtma - 2 saatin altındaki oyunlar aynı anda (paralel) çalıştırılıp eşiğin
//               üstüne çıkarılır. Steam eşzamanlı açık her oyuna süre işlediği için bu
//               aşama tek tek beklemekten kat kat hızlıdır.
//            2) Döngü - eşiği geçmiş tüm oyunlar birlikte açık tutulur ve öne çıkan oyun
//               her 1,5-2 dakikada bir değişir (gamesPlayed tazelenir). Kart düşüşü bu
//               tazelemelerde tetiklendiği için kısa aralık düşüşü hızlandırır.
//
// KARTI BITEN OYUN. Kontrolcu eskiden kuyrugu bir kez aliyor ve bir daha hic
// guncellemiyordu: karti biten oyun donguye girmeye devam ediyor, hizli modda ilk
// havuzdaki oyunlar bitince is fiilen duruyordu ama arayuz "calisiyor" diyordu. Artik
// ana surecteki rozet izleyicisi `oyunlariGuncelle` ile guncel listeyi veriyor; biten
// oyun cikar, havuz yeniden dolar, hic oyun kalmayinca is kendiliginden durur.
class FarmController {
  // sahip: motorda bu isin oyun listesinin adi ('kart' | 'sirali'). Ayni hesapta baska bir is
  // (saat yukseltme, Gercekci Mod) calisirken birbirlerinin oyunlarini kapatmasinlar diye.
  constructor(engine, emit, sahip) {
    this.engine = engine;
    this.emit = emit;
    this.sahip = sahip || 'kart';
    this.timer = null;
    this.timer2 = null;
    this.running = false;
    this.mode = null;
    this.games = [];
    this.index = 0;
    this.startedAt = 0;
    this.durationMs = 0;
    this.oturumBaslangic = 0;
    this.aktifAppid = null;
    this.faz = null;               // hizli mod: 'warmup' | 'rotate'
    this.fastPool = [];
    this._uyku = null;             // hizli mod isitma beklemesinin cozucusu
    this.nesil = 0;                // her start() yeni nesil: eski dongu yeniden baslamaya karismasin
  }

  // opts.loop === false → tek tur döner, kuyruk bitince kendi durur (Saat Yükseltici "Sırayı
  // Tekrarla" kapalıyken). Belirtilmezse sonsuz döngü (Kart Düşür'ün mevcut davranışı).
  // opts.autoNext === false → bir oyunun süresi dolunca ya da kartları bitince sıradakine
  //   GEÇMEZ, durur (Ayarlar > Kart Düşürme > "Oyun bitince sıradakine geç" kapalı).
  //   Eskiden yalnızca süre dolunca duruyordu; kartı biten oyunda ayar yok sayılıyordu.
  // opts.maxGames → 'fast' modda aynı anda çalıştırılacak azami oyun sayısı (cardMaxGames).
  // opts.fastMinPlaytimeMin → kart düşüşünün başladığı oynama süresi eşiği (dk, varsayılan 120).
  // opts.fastRotateMinSec / MaxSec → 'fast' modda öne çıkan oyunun değişme aralığı (sn).
  // opts.karistir → sıralı modda her turda oyun sırası karıştırılır (Saat Yükseltici).
  // opts.devam → { index, gecenMs }: ayar değişikliğinden sonra kaldığı yerden sürdürmek için.
  start(mode, games, durationMs, opts) {
    this._temizle();
    this.running = false;
    this.nesil++;
    this.mode = mode;
    this.opts = { ...(opts || {}) };
    this.loop = !opts || opts.loop !== false;
    this.autoNext = !opts || opts.autoNext !== false;
    this.karistir = !!(opts && opts.karistir);
    this.maxGames = (opts && +opts.maxGames > 0) ? Math.min(32, +opts.maxGames) : 32;
    this.fastMinPlaytimeMin = (opts && +opts.fastMinPlaytimeMin >= 0) ? +opts.fastMinPlaytimeMin : 120;
    this.fastRotateMinMs = ((opts && +opts.fastRotateMinSec) || 90) * 1000;
    this.fastRotateMaxMs = ((opts && +opts.fastRotateMaxSec) || 120) * 1000;
    if (this.fastRotateMaxMs < this.fastRotateMinMs) this.fastRotateMaxMs = this.fastRotateMinMs;
    this.durationMs = durationMs || 30 * 60 * 1000;
    let list = (games || []).map((g) => ({ ...g }));
    if (mode === 'most') list.sort((a, b) => b.remaining - a.remaining);
    else if (mode === 'least') list.sort((a, b) => a.remaining - b.remaining);
    if (this.karistir) list = FarmController.karistir(list);
    this.games = list;
    this.running = true;
    const devam = opts && opts.devam;
    this.index = devam && +devam.index >= 0 ? Math.min(+devam.index, Math.max(0, list.length - 1)) : 0;
    this.oturumBaslangic = (devam && devam.oturumBaslangic) || Date.now();

    if (!this.games.length) { this.stop('bitti'); return; }
    if (mode === 'fast') this._runFast();
    else this._runRoundRobin(devam && +devam.gecenMs > 0 ? +devam.gecenMs : 0);
  }

  // Calisan isin kaldigi yer. Ayar degisince is yeni ayarla bu noktadan surdurulur.
  // Hizli modun isitma asamasinda gecen sure partideki oyunlara islenir; yoksa is yeniden
  // kuruldugunda isitma bastan baslardi (2 saatlik esikte 1 saat 50 dakika bosa giderdi).
  konum() {
    if (this.running && this.mode === 'fast' && this.faz === 'warmup' && this.startedAt && this._partiIds) {
      const dk = Math.floor((Date.now() - this.startedAt) / 60000);
      if (dk > 0) {
        const ids = new Set(this._partiIds);
        this.games.forEach((g) => { if (ids.has(g.appid)) g.playtimeMin = (g.playtimeMin || 0) + dk; });
        this.startedAt += dk * 60000;          // ayni sure ikinci kez islenmesin
      }
    }
    return {
      index: this.index,
      gecenMs: this.startedAt ? Math.max(0, Date.now() - this.startedAt) : 0,
      oturumBaslangic: this.oturumBaslangic,
    };
  }

  _temizle() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.timer2) { clearTimeout(this.timer2); this.timer2 = null; }
    // Isitma beklemesi askida kalmasin: cozulmeyen bir Promise arkada asili kalirdi.
    if (this._uyku) { const r = this._uyku; this._uyku = null; r(); }
  }

  // sebep: 'kullanici' | 'bitti' | 'sure' | 'oyunBitti' | 'boost' | 'ayar' - arayuz ve
  // istatistik bunu okur. 'sure' ve 'oyunBitti': siradakine gecme kapaliyken oyun bitti.
  stop(sebep) {
    const calisiyordu = this.running;
    this.running = false;
    this._temizle();
    this.aktifAppid = null;
    this.faz = null;
    if (this.engine) this.engine.stop(this.sahip);
    this.emit('farm:tick', { running: false, sebep: sebep || 'kullanici', calisiyordu });
  }

  // Rozet izleyicisinden gelen guncel liste. `bitenler`: kartı kalmadığı Steam tarafından
  // DOĞRULANAN oyunlar (rozet satırında "No card drops remaining"). Listede görünmeyen
  // ama bitti diye işaretlenmeyen oyun çıkarılmaz: kazıma eksik kalmış olabilir.
  oyunlariGuncelle(guncel, bitenler) {
    if (!this.running) return { kalan: 0, cikan: [] };
    const kalanlar = new Map((guncel || []).map((g) => [g.appid, g]));
    const bitti = bitenler instanceof Set ? bitenler : new Set(bitenler || []);
    const cikan = [];
    const eskiAktif = this.aktifAppid;
    const eskiIndex = this.index;
    const yeni = [];
    this.games.forEach((g, i) => {
      const k = kalanlar.get(g.appid);
      const bittiMi = bitti.has(g.appid) || (k && k.remaining <= 0);
      if (bittiMi) { cikan.push({ ...g, sira: i }); return; }
      if (k) { g.remaining = k.remaining; if (k.name) g.name = k.name; }
      yeni.push(g);
    });
    if (!cikan.length) return { kalan: this.games.length, cikan };
    this.games = yeni;

    if (!this.games.length) { this.stop('bitti'); return { kalan: 0, cikan }; }

    if (this.mode === 'fast') {
      this._havuzuYenile();
      return { kalan: this.games.length, cikan };
    }
    // Sirali/cok/az/oncelik: aktif oyun ciktiysa bekleme suresini doldurmadan siradakine gec.
    const aktifCikti = eskiAktif != null && cikan.some((c) => c.appid === eskiAktif);
    // Indeks, cikan oyunlar kadar geri kayar; yoksa bir oyun atlanirdi.
    const oncekiCikan = cikan.filter((c) => c.sira < eskiIndex).length;
    this.index = Math.max(0, eskiIndex - oncekiCikan);
    if (aktifCikti) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (!this.autoNext) { this.stop('oyunBitti'); return { kalan: this.games.length, cikan }; }
      if (this.index >= this.games.length) this.index = this.loop ? 0 : this.games.length;
      this._runRoundRobin(0);
    }
    return { kalan: this.games.length, cikan };
  }

  _runRoundRobin(gecenMs) {
    if (!this.running || this.games.length === 0) return;
    if (this.index >= this.games.length) {
      if (!this.loop) { this.stop('bitti'); return; }
      this.index = 0;
      if (this.karistir) this.games = FarmController.karistir(this.games);
    }
    const g = this.games[this.index];
    this.aktifAppid = g.appid;
    this.engine.play([g.appid], this.sahip);
    this.startedAt = Date.now() - (gecenMs || 0);
    this._tick(g.appid);
    const kalanMs = Math.max(1000, this.durationMs - (gecenMs || 0));
    this.timer = setTimeout(() => {
      if (!this.running) return;
      if (!this.autoNext) { this.stop('sure'); return; }   // otomatik geçiş kapalı → dur
      this.index++;
      this._runRoundRobin(0);
    }, kalanMs);
  }

  _tick(activeAppid) {
    if (!this.running) return;
    this.emit('farm:tick', {
      running: true, mode: this.mode, activeAppids: this._calanlar(),
      currentAppid: activeAppid, elapsedMs: Date.now() - this.startedAt, durationMs: this.durationMs,
      oturumBaslangic: this.oturumBaslangic, oyunSayisi: this.games.length,
    });
    if (this.timer2) clearTimeout(this.timer2);
    this.timer2 = setTimeout(() => this._tick(activeAppid), 1000);
  }

  async _runFast() {
    const nesil = this.nesil;
    const bitmeli = () => !this.running || this.nesil !== nesil;
    const thresholdMin = this.fastMinPlaytimeMin;
    this.faz = 'warmup';
    // ---- 1) ISITMA: 2 saatin altındakileri eşiğin üstüne çıkar ----
    // Steam eşzamanlı açık HER oyuna süre işler, dolayısıyla partiyi birlikte çalıştırmak
    // en uzun açığı kapatmak kadar sürer - tek tek beklemek yerine partinin en büyük
    // eksiği kadar bekleriz. Parti boyu cardMaxGames ile sınırlı. Liste her parti öncesi
    // YENIDEN okunur: bu arada karti biten oyun ciktiysa bir daha acilmaz.
    for (;;) {
      if (bitmeli()) return;
      const cold = this.games.filter((g) => (g.playtimeMin || 0) < thresholdMin);
      if (!cold.length) break;
      const batch = cold.slice(0, this.maxGames);
      const needMs = Math.max(...batch.map((g) => (thresholdMin - (g.playtimeMin || 0)) * 60000));
      const ids = batch.map((g) => g.appid);
      this._partiIds = ids;
      this.engine.play(ids, this.sahip);
      this.startedAt = Date.now();
      this._fastHoldTick(ids, needMs, 'warmup');
      await this._sleep(needMs);
      if (bitmeli()) return;
      // Bu parti artık eşiği geçti; döngüde de açık kalsın
      batch.forEach((g) => { g.playtimeMin = thresholdMin; });
    }
    if (bitmeli()) return;

    // ---- 2) DÖNGÜ: eşiği geçmiş oyunlar birlikte açık, öne çıkan oyun 1,5-2 dk'da bir değişir ----
    this.faz = 'rotate';
    this.index = 0;
    this._havuzuYenile();
  }

  // Hizli modun donguye aldigi oyunlar: karti kalan ilk `maxGames` oyun. Biten cikinca
  // siradaki bekleyen oyun havuza girer.
  _havuzuYenile() {
    if (!this.running) return;
    if (this.faz !== 'rotate') return;           // isitma kendi dongusunde listeyi okuyor
    this.fastPool = this.games.slice(0, this.maxGames);
    if (!this.fastPool.length) { this.stop('bitti'); return; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this._fastRotate();
  }

  // 1,5-2 dakika arası rastgele bir aralık - sabit ritim yerine değişken aralık hem daha
  // doğal görünür hem de düşüş tetiklemesini tek bir saniyeye bağlamaz.
  _rotateMs() {
    const lo = this.fastRotateMinMs, hi = this.fastRotateMaxMs;
    return Math.round(lo + Math.random() * Math.max(0, hi - lo));
  }

  _fastHoldTick(all, durationMs, phase) {
    if (!this.running) return;
    this.emit('farm:tick', {
      running: true, mode: 'fast', phase, activeAppids: all, currentAppid: this.aktifAppid,
      elapsedMs: Date.now() - this.startedAt, durationMs,
      oturumBaslangic: this.oturumBaslangic, oyunSayisi: this.games.length,
    });
    if (this.timer2) clearTimeout(this.timer2);
    if (Date.now() - this.startedAt < durationMs) this.timer2 = setTimeout(() => this._fastHoldTick(all, durationMs, phase), 1000);
  }

  _fastRotate() {
    if (!this.running) return;
    const pool = this.fastPool.length ? this.fastPool : this.games;
    if (!pool.length) { this.stop('bitti'); return; }
    const all = pool.map((g) => g.appid);
    const g = pool[this.index % pool.length];
    this.index++;
    this.aktifAppid = g.appid;
    this.engine.play(all, this.sahip); // gamesPlayed tazelemesi - düşüş bu anda tetikleniyor
    this.startedAt = Date.now();
    const wait = this._rotateMs();
    this._fastHoldTick(all, wait, 'rotate:' + g.appid);
    this.timer = setTimeout(() => { if (this.running) this._fastRotate(); }, wait);
  }

  // Bu isin oyunlarindan motorda gercekten acik olanlar (32 sinirina sigmayan dusulur).
  _calanlar() {
    if (this.engine && typeof this.engine.calanlar === 'function') return this.engine.calanlar(this.sahip);
    return this.engine ? this.engine.playing : [];
  }

  _sleep(ms) {
    return new Promise((r) => {
      this._uyku = r;
      this.timer = setTimeout(() => { this._uyku = null; r(); }, ms);
    });
  }

  static karistir(liste) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

module.exports = FarmController;
