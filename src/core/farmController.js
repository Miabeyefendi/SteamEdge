// Drives the SteamEngine over time according to the selected drop mode. Emits progress
// ('farm:tick') so the renderer can show a live idle-duration bar per game.
//
// Modes:
//  - sequential: play list order, one game at a time, `durationMs` each, then next.
//  - most / least: same round-robin timing, sorted by remaining cards desc/asc first.
//  - priority: same round-robin timing, using the caller-supplied order as-is.
//  - fast: Steam only starts dropping cards for a game once its playtime passes 2 HOURS.
//           So the fast mode has two phases:
//             1) Warm-up - games under 2 hours are run at the same time (in parallel) and pushed
//                above the threshold. Steam credits time to every game open at once, so this
//                phase is many times faster than waiting one by one.
//             2) Loop - all games past the threshold are kept open together and the featured game
//                changes every 1.5-2 minutes (gamesPlayed is refreshed). Card drops are triggered
//                by these refreshes, so a short interval speeds drops up.
//
// A GAME THAT RAN OUT OF CARDS. The controller used to take the queue once and never
// update it: a game with no cards left kept entering the loop, and in fast mode the job effectively
// stopped once the games in the first pool were done while the interface still said "running". Now
// the main process badge watcher hands over the current list through `oyunlariGuncelle`; a finished
// game is removed, the pool is refilled, and when no game is left the job stops by itself.
class FarmController {
  // sahip: the name of this job's game list in the engine ('kart' | 'sirali'). So that when another job on the same
  // account (hour boosting, Realistic Mode) is running they do not close each other's games.
  constructor(engine, emit, ownerId) {
    this.engine = engine;
    this.emit = emit;
    this.sahip = ownerId || 'kart';
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
    this.faz = null;               // fast mode: 'warmup' | 'rotate'
    this.fastPool = [];
    this._uyku = null;             // resolver of the fast mode warm-up wait
    this.nesil = 0;                // every start() is a new generation: an old loop must not interfere with the restart
  }

  // opts.loop === false → runs a single round and stops by itself when the queue ends (Hour Booster with "Repeat
  // the queue" off). When not given it loops forever (Card Farming's current behaviour).
  // opts.autoNext === false → does NOT move to the next game when a game's time is up or its cards run out,
  //   it stops (Settings > Card farming > "Move on when a game is done" off).
  //   It used to stop only when the time ran out; the setting was ignored for a game whose cards ran out.
  // opts.maxGames → the maximum number of games run at once in 'fast' mode (cardMaxGames).
  // opts.fastMinPlaytimeMin → the playtime threshold where card drops start (minutes, default 120).
  // opts.fastRotateMinSec / MaxSec → the interval at which the featured game changes in 'fast' mode (seconds).
  // opts.karistir → in sequential mode the game order is shuffled every round (Hour Booster).
  // opts.devam → { index, passedMs }: to resume where it was after a settings change.
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
    const proceed = opts && opts.devam;
    this.index = proceed && +proceed.index >= 0 ? Math.min(+proceed.index, Math.max(0, list.length - 1)) : 0;
    this.oturumBaslangic = (proceed && proceed.oturumBaslangic) || Date.now();

    if (!this.games.length) { this.stop('bitti'); return; }
    if (mode === 'fast') this._runFast();
    else this._runRoundRobin(proceed && +proceed.gecenMs > 0 ? +proceed.gecenMs : 0);
  }

  // Where the running job is. When a setting changes the job continues from this point with the new setting.
  // The time spent in the warm-up phase of fast mode is credited to the games in the batch; otherwise warm-up
  // would start over when the job is rebuilt (with the 2 hour threshold 1 hour 50 minutes would be wasted).
  konum() {
    if (this.running && this.mode === 'fast' && this.faz === 'warmup' && this.startedAt && this._partiIds) {
      const dk = Math.floor((Date.now() - this.startedAt) / 60000);
      if (dk > 0) {
        const ids = new Set(this._partiIds);
        this.games.forEach((g) => { if (ids.has(g.appid)) g.playtimeMin = (g.playtimeMin || 0) + dk; });
        this.startedAt += dk * 60000;          // so the same time is not credited a second time
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
    // The warm-up wait must not hang: an unresolved Promise would stay suspended in the background.
    if (this._uyku) { const r = this._uyku; this._uyku = null; r(); }
  }

  // sebep: 'kullanici' | 'bitti' | 'sure' | 'oyunBitti' | 'boost' | 'ayar' - the interface and the
  // statistics read this. 'sure' and 'oyunBitti': a game finished while moving on is off.
  stop(cause) {
    const wasRunning = this.running;
    this.running = false;
    this._temizle();
    this.aktifAppid = null;
    this.faz = null;
    if (this.engine) this.engine.stop(this.sahip);
    this.emit('farm:tick', { running: false, sebep: cause || 'kullanici', calisiyordu: wasRunning });
  }

  // The current list from the badge watcher. `bitenler`: games for which Steam CONFIRMS no cards are left
  // ("No card drops remaining" on the badge row). A game that is missing from the list but not marked
  // as finished is not removed: the scrape may have been incomplete.
  oyunlariGuncelle(current, finished) {
    if (!this.running) return { kalan: 0, cikan: [] };
    const remainders = new Map((current || []).map((g) => [g.appid, g]));
    const isDone = finished instanceof Set ? finished : new Set(finished || []);
    const removed = [];
    const oldActive = this.aktifAppid;
    const oldIndex = this.index;
    const newItem = [];
    this.games.forEach((g, i) => {
      const k = remainders.get(g.appid);
      const hasFinished = isDone.has(g.appid) || (k && k.remaining <= 0);
      if (hasFinished) { removed.push({ ...g, sira: i }); return; }
      if (k) { g.remaining = k.remaining; if (k.name) g.name = k.name; }
      newItem.push(g);
    });
    if (!removed.length) return { kalan: this.games.length, cikan: removed };
    this.games = newItem;

    if (!this.games.length) { this.stop('bitti'); return { kalan: 0, cikan: removed }; }

    if (this.mode === 'fast') {
      this._havuzuYenile();
      return { kalan: this.games.length, cikan: removed };
    }
    // Sequential/most/least/priority: if the active game left, move to the next without waiting out the time.
    const activeOutput = oldActive != null && removed.some((c) => c.appid === oldActive);
    // The index shifts back by the number of games that left; otherwise a game would be skipped.
    const previouslyRemoved = removed.filter((c) => c.sira < oldIndex).length;
    this.index = Math.max(0, oldIndex - previouslyRemoved);
    if (activeOutput) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (!this.autoNext) { this.stop('oyunBitti'); return { kalan: this.games.length, cikan: removed }; }
      if (this.index >= this.games.length) this.index = this.loop ? 0 : this.games.length;
      this._runRoundRobin(0);
    }
    return { kalan: this.games.length, cikan: removed };
  }

  _runRoundRobin(passedMs) {
    if (!this.running || this.games.length === 0) return;
    if (this.index >= this.games.length) {
      if (!this.loop) { this.stop('bitti'); return; }
      this.index = 0;
      if (this.karistir) this.games = FarmController.karistir(this.games);
    }
    const g = this.games[this.index];
    this.aktifAppid = g.appid;
    this.engine.play([g.appid], this.sahip);
    this.startedAt = Date.now() - (passedMs || 0);
    this._tick(g.appid);
    const remainingMs = Math.max(1000, this.durationMs - (passedMs || 0));
    this.timer = setTimeout(() => {
      if (!this.running) return;
      if (!this.autoNext) { this.stop('sure'); return; }   // automatic move is off → stop
      this.index++;
      this._runRoundRobin(0);
    }, remainingMs);
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
    const generation = this.nesil;
    const mustFinish = () => !this.running || this.nesil !== generation;
    const thresholdMin = this.fastMinPlaytimeMin;
    this.faz = 'warmup';
    // ---- 1) WARM-UP: push the games under 2 hours above the threshold ----
    // Steam credits time to EVERY game that is open at once, so running the batch together
    // takes as long as closing the longest gap - instead of waiting one by one we wait for the batch's
    // largest deficit. Batch size is limited by cardMaxGames. The list is read AGAIN before each batch:
    // a game whose cards ran out in the meantime is not opened again.
    for (;;) {
      if (mustFinish()) return;
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
      if (mustFinish()) return;
      // This batch has passed the threshold now; let it stay open in the loop too
      batch.forEach((g) => { g.playtimeMin = thresholdMin; });
    }
    if (mustFinish()) return;

    // ---- 2) LOOP: the games past the threshold are open together, the featured game changes every 1.5-2 min ----
    this.faz = 'rotate';
    this.index = 0;
    this._havuzuYenile();
  }

  // The games fast mode puts into the loop: the first `maxGames` games that still have cards. When one finishes
  // the next waiting game enters the pool.
  _havuzuYenile() {
    if (!this.running) return;
    if (this.faz !== 'rotate') return;           // warm-up reads the list in its own loop
    this.fastPool = this.games.slice(0, this.maxGames);
    if (!this.fastPool.length) { this.stop('bitti'); return; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this._fastRotate();
  }

  // A random interval between 1.5 and 2 minutes - a variable interval instead of a fixed rhythm both looks
  // more natural and keeps the drop trigger from depending on a single second.
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
    this.engine.play(all, this.sahip); // gamesPlayed refresh - the drop is triggered at this moment
    this.startedAt = Date.now();
    const wait = this._rotateMs();
    this._fastHoldTick(all, wait, 'rotate:' + g.appid);
    this.timer = setTimeout(() => { if (this.running) this._fastRotate(); }, wait);
  }

  // Of this job's games, the ones that are really open in the engine (those that do not fit the 32 limit are dropped).
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

  static karistir(listing) {
    const a = listing.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

module.exports = FarmController;
