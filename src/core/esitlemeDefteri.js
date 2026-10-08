// Hour sync ledger.
//
// Keeps the time remaining to the target per game. Both the parallel and the sequential strategies use it;
// the per-game progress bar in the interface is fed from here too.
//
// It lives in its own file for testing: syncing takes hours and its accuracy can only be measured by
// faking the clock. The functions here take the state from outside and accept "now" as a parameter,
// so a 47 hour session can be tested without waiting for real time.

// geride: [{ appid, name, playtimeMin }] - games that are below the target
function defterKur(geride, targetMin) {
  const oyunlar = new Map();
  (geride || []).forEach((g) => oyunlar.set(g.appid, {
    appid: g.appid,
    name: g.name || ('App ' + g.appid),
    baslangicMin: g.playtimeMin || 0,
    kalanMs: Math.max(0, (targetMin - (g.playtimeMin || 0)) * 60000),
    gecenMs: 0,
    bitti: false,
  }));
  return oyunlar;
}

// Adds the time elapsed since the last update to the games that are OPEN - Steam counts it the same way,
// a game that is not running earns no time. Marks the ones that reached the target and returns them.
function defteriIsle(durum, simdi) {
  if (!durum || !durum.oyunlar) return [];
  const t = simdi == null ? Date.now() : simdi;
  const gecen = Math.max(0, t - (durum.sonHesap == null ? t : durum.sonHesap));
  durum.sonHesap = t;
  if (gecen > 0) {
    (durum.aktif || []).forEach((id) => {
      const o = durum.oyunlar.get(id);
      if (o && !o.bitti) { o.kalanMs = Math.max(0, o.kalanMs - gecen); o.gecenMs += gecen; }
    });
  }
  const bitenler = [];
  durum.oyunlar.forEach((o) => {
    if (!o.bitti && o.kalanMs <= 0) { o.bitti = true; bitenler.push(o); }
  });
  return bitenler;
}

// The next active set: games with the most time left go first (LPT). The bottleneck game starts
// early, so the total time comes as close to the minimum as it can.
function siradakiAktifKume(durum) {
  if (!durum || !durum.oyunlar) return [];
  const kalanlar = [...durum.oyunlar.values()].filter((o) => !o.bitti);
  kalanlar.sort((a, b) => b.kalanMs - a.kalanMs);
  return kalanlar.slice(0, Math.max(1, durum.limit || 32)).map((o) => o.appid);
}

// The list sent to the interface. The ledger is only updated when a game reaches the target (or the step changes);
// the time in between is added LIVE here, otherwise the screen would not move at all between two events.
function arayuzListesi(durum, simdi) {
  if (!durum || !durum.oyunlar) return [];
  const t = simdi == null ? Date.now() : simdi;
  const aktifSet = new Set(durum.aktif || []);
  const beklemede = Math.max(0, t - (durum.sonHesap == null ? t : durum.sonHesap));
  return [...durum.oyunlar.values()].map((o) => {
    const ek = (!o.bitti && aktifSet.has(o.appid)) ? Math.min(beklemede, o.kalanMs) : 0;
    return {
      appid: o.appid,
      name: o.name,
      baslangicMin: o.baslangicMin,
      suankiMin: o.baslangicMin + Math.floor((o.gecenMs + ek) / 60000),
      kalanMs: Math.max(0, o.kalanMs - ek),
      aktif: aktifSet.has(o.appid),
      bitti: !!o.bitti,
    };
  });
}

// The time that has to pass until the remaining work is done. Because the active set is capped by the limit,
// this is the total of the queue simulation, not "the remaining time of the game with the most left".
function kalanToplamMs(durum) {
  if (!durum || !durum.oyunlar) return 0;
  const kalan = new Map();
  durum.oyunlar.forEach((o) => { if (!o.bitti && o.kalanMs > 0) kalan.set(o.appid, o.kalanMs); });
  const kap = Math.max(1, Math.min(32, durum.limit || 32));
  let toplam = 0, guvenlik = 0;
  while (kalan.size && guvenlik++ < 500) {
    const sirali = [...kalan.entries()].sort((a, b) => b[1] - a[1]).slice(0, kap);
    const dt = Math.min(...sirali.map((x) => x[1]));
    toplam += dt;
    sirali.forEach(([id, ms]) => {
      const yeni = ms - dt;
      if (yeni <= 0) kalan.delete(id); else kalan.set(id, yeni);
    });
  }
  return toplam;
}

module.exports = { defterKur, defteriIsle, siradakiAktifKume, arayuzListesi, kalanToplamMs };
