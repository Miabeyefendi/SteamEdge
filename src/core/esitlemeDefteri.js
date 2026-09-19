// Saat esitleme defteri.
//
// Hedefe kalan sureyi oyun bazinda tutar. Paralel ve sirali stratejilerin ikisi de bunu
// kullanir; arayuzdeki oyun bazli ilerleme cubugu da buradan beslenir.
//
// Ayri dosyada durmasinin sebebi test: esitleme saatlerce surer ve dogrulugu ancak saati
// taklit ederek olculebilir. Buradaki islevler durumu disaridan alir ve "simdi"yi parametre
// olarak kabul eder, yani gercek zamani beklemeden 47 saatlik bir oturum sinanabilir.

// geride: [{ appid, name, playtimeMin }] - hedefin altinda kalan oyunlar
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

// Son islemden bu yana gecen sureyi ACIK olan oyunlara isler - Steam de boyle sayar,
// kapali duran oyun sure kazanmaz. Hedefe ulasanlari isaretler ve dondurur.
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

// Siradaki aktif kume: en cok suresi kalan oyunlar once (LPT). Darbogaz olan oyun erken
// baslar, boylece toplam sure en aza yaklasir.
function siradakiAktifKume(durum) {
  if (!durum || !durum.oyunlar) return [];
  const kalanlar = [...durum.oyunlar.values()].filter((o) => !o.bitti);
  kalanlar.sort((a, b) => b.kalanMs - a.kalanMs);
  return kalanlar.slice(0, Math.max(1, durum.limit || 32)).map((o) => o.appid);
}

// Arayuze giden liste. Defter yalnizca bir oyun hedefe ulasinca (ya da adim degisince)
// islenir; aradaki sure burada CANLI eklenir, yoksa ekran iki olay arasinda hic ilerlemez.
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

// Kalan is bitene kadar gecmesi gereken sure. Aktif kume limitle sinirli oldugu icin
// bu, "en cok kalani olan oyunun kalani" degil, kuyruk simulasyonunun toplamidir.
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
