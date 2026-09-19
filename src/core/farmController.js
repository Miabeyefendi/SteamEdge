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
class FarmController {
  constructor(engine, emit) {
    this.engine = engine;
    this.emit = emit;
    this.timer = null;
    this.running = false;
    this.mode = null;
    this.games = [];
    this.index = 0;
    this.startedAt = 0;
    this.durationMs = 0;
  }

  // opts.loop === false → tek tur döner, kuyruk bitince kendi durur (Saat Yükseltici "Sırayı
  // Tekrarla" kapalıyken). Belirtilmezse sonsuz döngü (Kart Düşür'ün mevcut davranışı).
  // opts.autoNext === false → bir oyunun süresi dolunca sıradakine GEÇMEZ, durur
  //   (Ayarlar > Kart Düşürme > "Kartlar bitince sıradaki oyuna geç" kapalı).
  // opts.maxGames → 'fast' modda aynı anda çalıştırılacak azami oyun sayısı (cardMaxGames).
  // opts.fastMinPlaytimeMin → kart düşüşünün başladığı oynama süresi eşiği (dk, varsayılan 120).
  // opts.fastRotateMinSec / MaxSec → 'fast' modda öne çıkan oyunun değişme aralığı (sn).
  start(mode, games, durationMs, opts) {
    this.stop();
    this.mode = mode;
    this.loop = !opts || opts.loop !== false;
    this.autoNext = !opts || opts.autoNext !== false;
    this.maxGames = (opts && +opts.maxGames > 0) ? +opts.maxGames : 32;
    this.fastMinPlaytimeMin = (opts && +opts.fastMinPlaytimeMin >= 0) ? +opts.fastMinPlaytimeMin : 120;
    this.fastRotateMinMs = ((opts && +opts.fastRotateMinSec) || 90) * 1000;
    this.fastRotateMaxMs = ((opts && +opts.fastRotateMaxSec) || 120) * 1000;
    if (this.fastRotateMaxMs < this.fastRotateMinMs) this.fastRotateMaxMs = this.fastRotateMinMs;
    this.durationMs = durationMs || 30 * 60 * 1000;
    let list = games.slice();
    if (mode === 'most') list.sort((a, b) => b.remaining - a.remaining);
    else if (mode === 'least') list.sort((a, b) => a.remaining - b.remaining);
    this.games = list;
    this.running = true;
    this.index = 0;

    if (mode === 'fast') this._runFast();
    else this._runRoundRobin();
  }

  stop() {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.engine) this.engine.stop();
    this.emit('farm:tick', { running: false });
  }

  _runRoundRobin() {
    if (!this.running || this.games.length === 0) return;
    if (!this.loop && this.index >= this.games.length) { this.stop(); return; }
    const g = this.games[this.index % this.games.length];
    this.engine.play([g.appid]);
    this.startedAt = Date.now();
    this._tick(g.appid);
    this.timer = setTimeout(() => {
      if (!this.running) return;
      if (!this.autoNext) { this.stop(); return; }   // otomatik geçiş kapalı → dur
      this.index++;
      this._runRoundRobin();
    }, this.durationMs);
  }

  _tick(activeAppid) {
    if (!this.running) return;
    this.emit('farm:tick', {
      running: true, mode: this.mode, activeAppids: this.engine.playing,
      currentAppid: activeAppid, elapsedMs: Date.now() - this.startedAt, durationMs: this.durationMs,
    });
    this.timer2 && clearTimeout(this.timer2);
    this.timer2 = setTimeout(() => this._tick(activeAppid), 1000);
  }

  async _runFast() {
    const thresholdMin = this.fastMinPlaytimeMin;
    const cold = this.games.filter((g) => (g.playtimeMin || 0) < thresholdMin);
    const warm = this.games.filter((g) => (g.playtimeMin || 0) >= thresholdMin);

    // ---- 1) ISITMA: 2 saatin altındakileri eşiğin üstüne çıkar ----
    // Steam eşzamanlı açık HER oyuna süre işler, dolayısıyla partiyi birlikte çalıştırmak
    // en uzun açığı kapatmak kadar sürer - tek tek beklemek yerine partinin en büyük
    // eksiği kadar bekleriz. Parti boyu cardMaxGames ile sınırlı.
    for (let i = 0; i < cold.length && this.running; i += this.maxGames) {
      const batch = cold.slice(i, i + this.maxGames);
      const needMs = Math.max(...batch.map((g) => (thresholdMin - (g.playtimeMin || 0)) * 60000));
      const ids = batch.map((g) => g.appid);
      this.engine.play(ids);
      this.startedAt = Date.now();
      this._fastHoldTick(ids, needMs, 'warmup');
      await this._sleep(needMs);
      if (!this.running) return;
      // Bu parti artık eşiği geçti; kalıcı listeye al ve döngüde de açık kalsın
      batch.forEach((g) => { g.playtimeMin = thresholdMin; warm.push(g); });
    }
    if (!this.running) return;

    // ---- 2) DÖNGÜ: eşiği geçmiş oyunlar birlikte açık, öne çıkan oyun 1,5-2 dk'da bir değişir ----
    this.fastPool = (warm.length ? warm : this.games).slice(0, this.maxGames);
    if (!this.fastPool.length) { this.stop(); return; }
    this.index = 0;
    this._fastRotate(this.fastPool.map((g) => g.appid));
  }

  // 1,5-2 dakika arası rastgele bir aralık - sabit ritim yerine değişken aralık hem daha
  // doğal görünür hem de düşüş tetiklemesini tek bir saniyeye bağlamaz.
  _rotateMs() {
    const lo = this.fastRotateMinMs, hi = this.fastRotateMaxMs;
    return Math.round(lo + Math.random() * Math.max(0, hi - lo));
  }

  _fastHoldTick(all, durationMs, phase) {
    if (!this.running) return;
    this.emit('farm:tick', { running: true, mode: 'fast', phase, activeAppids: all, currentAppid: null, elapsedMs: Date.now() - this.startedAt, durationMs });
    this.timer2 && clearTimeout(this.timer2);
    if (Date.now() - this.startedAt < durationMs) this.timer2 = setTimeout(() => this._fastHoldTick(all, durationMs, phase), 1000);
  }

  _fastRotate(all) {
    if (!this.running) return;
    const pool = this.fastPool && this.fastPool.length ? this.fastPool : this.games;
    const g = pool[this.index % pool.length];
    this.index++;
    this.engine.play(all); // gamesPlayed tazelemesi - düşüş bu anda tetikleniyor
    this.startedAt = Date.now();
    const wait = this._rotateMs();
    this._fastHoldTick(all, wait, 'rotate:' + g.appid);
    this.timer = setTimeout(() => { if (this.running) this._fastRotate(all); }, wait);
  }

  _sleep(ms) { return new Promise((r) => { this.timer = setTimeout(r, ms); }); }
}

module.exports = FarmController;
