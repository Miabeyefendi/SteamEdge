// ================= GUNCELLEME KONTROLU =================
// Sadece BAKAR, indirmez. GitHub'in yayin listesini okur, kurulu surumle karsilastirir
// ve sonucu doner. Indirme karari kullanicinin: arayuz yalnizca yayin sayfasina baglanti
// gosterir. Sessizce dosya indirip calistiran bir yol bilerek yoktur - kullanicinin
// bilgisayarina ne indigini kullanici gormeli.
//
// Neden /releases/latest degil de /releases?per_page=... :
// GitHub'in "latest" ucu on-yayin (prerelease) ve taslaklari atlar, ama ayni zamanda
// hicbir yayin isaretlenmemisse 404 doner. Listeyi cekip taslak/on-yayin olmayanlarin
// en yenisini kendimiz secmek hem daha ongorulebilir hem de tek istek.

const https = require('https');

const DEPO = 'Miabeyefendi/steamedge';
const LISTE_URL = 'https://api.github.com/repos/' + DEPO + '/releases?per_page=10';
const YAYIN_SAYFASI = 'https://github.com/' + DEPO + '/releases/latest';
const ZAMAN_ASIMI_MS = 12000;

// "1.0.10" > "1.0.9" olmali: parcalari SAYI olarak karsilastir, metin olarak degil.
// Donus: a>b ise 1, a<b ise -1, esitse 0. Tanimsiz/bozuk parca 0 sayilir.
function surumKarsilastir(a, b) {
  const ayir = (s) => String(s || '').trim().replace(/^v/i, '').split(/[.\-+]/).map((p) => parseInt(p, 10) || 0);
  const x = ayir(a);
  const y = ayir(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const fx = x[i] || 0;
    const fy = y[i] || 0;
    if (fx > fy) return 1;
    if (fx < fy) return -1;
  }
  return 0;
}

// Ag hatasini kullanicinin anlayacagi tek cumleye cevirir. Ham ENOTFOUND/ETIMEDOUT
// metinleri arayuzde hicbir sey ifade etmiyor.
function hataMetni(e) {
  const kod = (e && (e.code || e.errno)) || '';
  if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN') return 'Internet baglantisi yok gibi gorunuyor.';
  if (kod === 'ETIMEDOUT' || kod === 'ESOCKETTIMEDOUT' || kod === 'ZAMANASIMI') return 'GitHub zamaninda yanit vermedi.';
  if (kod === 'ECONNRESET' || kod === 'ECONNREFUSED') return 'Baglanti kesildi.';
  if (kod === 'CERT_HAS_EXPIRED' || String(kod).indexOf('CERT') === 0) return 'Guvenli baglanti kurulamadi.';
  return (e && e.message) ? e.message : 'Bilinmeyen hata.';
}

function istek(url) {
  return new Promise((cozum, hata) => {
    const r = https.get(url, {
      headers: {
        // GitHub API'si User-Agent olmadan 403 doner.
        'User-Agent': 'SteamEdge',
        Accept: 'application/vnd.github+json',
      },
    }, (yanit) => {
      // Kimliksiz istekte saatte 60 hak var. Asilirsa 403 gelir; bunu "hata" degil
      // "simdi bakilamadi" diye anlatmak lazim, yoksa kullanici bozuk sandi.
      if (yanit.statusCode === 403 || yanit.statusCode === 429) {
        yanit.resume();
        return hata(Object.assign(new Error('GitHub istek siniri asildi, biraz sonra tekrar dene.'), { code: 'LIMIT' }));
      }
      if (yanit.statusCode < 200 || yanit.statusCode >= 300) {
        yanit.resume();
        return hata(new Error('GitHub ' + yanit.statusCode + ' dondu.'));
      }
      let govde = '';
      yanit.setEncoding('utf8');
      yanit.on('data', (p) => { govde += p; });
      yanit.on('end', () => {
        try { cozum(JSON.parse(govde)); }
        catch (_) { hata(new Error('GitHub yaniti okunamadi.')); }
      });
    });
    r.on('error', hata);
    r.setTimeout(ZAMAN_ASIMI_MS, () => {
      r.destroy(Object.assign(new Error('zaman asimi'), { code: 'ZAMANASIMI' }));
    });
  });
}

// kuruluSurum: package.json'daki surum (app.getVersion()).
// Donus her zaman ayni bicimde: { ok, kurulu, son, guncelMi, url, yayinAdi, yayinTs, hata }
async function kontrolEt(kuruluSurum) {
  const temel = { kurulu: kuruluSurum, son: null, guncelMi: null, url: YAYIN_SAYFASI, yayinAdi: null, yayinTs: null };
  try {
    const liste = await istek(LISTE_URL);
    if (!Array.isArray(liste)) return { ok: false, ...temel, hata: 'GitHub beklenmeyen bir yanit dondu.' };
    // Taslak ve on-yayinlari atla: kullaniciya bitmemis surum onerilmez.
    const yayinlar = liste.filter((y) => y && !y.draft && !y.prerelease && y.tag_name);
    if (!yayinlar.length) return { ok: false, ...temel, hata: 'Yayimlanmis surum bulunamadi.' };
    let enYeni = yayinlar[0];
    yayinlar.forEach((y) => { if (surumKarsilastir(y.tag_name, enYeni.tag_name) > 0) enYeni = y; });
    const son = String(enYeni.tag_name).replace(/^v/i, '');
    return {
      ok: true,
      ...temel,
      son,
      guncelMi: surumKarsilastir(kuruluSurum, son) >= 0,
      url: enYeni.html_url || YAYIN_SAYFASI,
      yayinAdi: enYeni.name || enYeni.tag_name,
      yayinTs: enYeni.published_at ? Date.parse(enYeni.published_at) : null,
    };
  } catch (e) {
    return { ok: false, ...temel, hata: hataMetni(e) };
  }
}

module.exports = { kontrolEt, surumKarsilastir, YAYIN_SAYFASI, DEPO };
