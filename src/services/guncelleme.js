// ================= UPDATE CHECK =================
// Only LOOKS, never downloads. Reads GitHub's release list, compares it with the installed version
// and returns the result. The decision to download is the user's: the interface only links to
// the release page. A path that silently downloads and runs files is deliberately absent - the user
// must see what lands on their computer.
//
// Why /releases?per_page=... and not /releases/latest:
// GitHub's "latest" endpoint skips prereleases and drafts, but it also returns 404
// if no release is marked. Fetching the list and picking the newest non-draft, non-prerelease
// ourselves is both more predictable and a single request.

const https = require('https');

const DEPO = 'Miabeyefendi/steamedge';
const LISTE_URL = 'https://api.github.com/repos/' + DEPO + '/releases?per_page=10';
const YAYIN_SAYFASI = 'https://github.com/' + DEPO + '/releases/latest';
const ZAMAN_ASIMI_MS = 12000;

// "1.0.10" must be greater than "1.0.9": compare the parts as NUMBERS, not as text.
// Returns: 1 if a>b, -1 if a<b, 0 if equal. An undefined/broken part counts as 0.
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

// Turns a network error into one sentence the user can understand. Raw ENOTFOUND/ETIMEDOUT
// texts mean nothing in the interface.
function hataMetni(e) {
  const kod = (e && (e.code || e.errno)) || '';
  if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN') return 'İnternet bağlantısı yok gibi görünüyor.';
  if (kod === 'ETIMEDOUT' || kod === 'ESOCKETTIMEDOUT' || kod === 'ZAMANASIMI') return 'GitHub zamanında yanıt vermedi.';
  if (kod === 'ECONNRESET' || kod === 'ECONNREFUSED') return 'Bağlantı kesildi.';
  if (kod === 'CERT_HAS_EXPIRED' || String(kod).indexOf('CERT') === 0) return 'Güvenli bağlantı kurulamadı.';
  return (e && e.message) ? e.message : 'Bilinmeyen hata.';
}

function istek(url) {
  return new Promise((cozum, hata) => {
    const r = https.get(url, {
      headers: {
        // GitHub's API returns 403 without a User-Agent.
        'User-Agent': 'SteamEdge',
        Accept: 'application/vnd.github+json',
      },
    }, (yanit) => {
      // Unauthenticated requests get 60 per hour. Past that a 403 comes; it has to be described not as an "error"
      // but as "could not check right now", otherwise the user thought it was broken.
      if (yanit.statusCode === 403 || yanit.statusCode === 429) {
        yanit.resume();
        return hata(Object.assign(new Error('GitHub istek sınırı aşıldı, biraz sonra tekrar dene.'), { code: 'LIMIT' }));
      }
      if (yanit.statusCode < 200 || yanit.statusCode >= 300) {
        yanit.resume();
        return hata(new Error('GitHub beklenmeyen bir yanıt döndürdü (HTTP #).'.replace('#', yanit.statusCode)));
      }
      let govde = '';
      yanit.setEncoding('utf8');
      yanit.on('data', (p) => { govde += p; });
      yanit.on('end', () => {
        try { cozum(JSON.parse(govde)); }
        catch (_) { hata(new Error('GitHub yanıtı okunamadı.')); }
      });
    });
    r.on('error', hata);
    r.setTimeout(ZAMAN_ASIMI_MS, () => {
      r.destroy(Object.assign(new Error('zaman aşımı'), { code: 'ZAMANASIMI' }));
    });
  });
}

// kuruluSurum: the version in package.json (app.getVersion()).
// The return always has the same shape: { ok, kurulu, son, guncelMi, url, yayinAdi, yayinTs, hata }
async function kontrolEt(kuruluSurum) {
  const temel = { kurulu: kuruluSurum, son: null, guncelMi: null, url: YAYIN_SAYFASI, yayinAdi: null, yayinTs: null };
  try {
    const liste = await istek(LISTE_URL);
    if (!Array.isArray(liste)) return { ok: false, ...temel, hata: 'GitHub beklenmeyen bir yanıt döndürdü.' };
    // Skip drafts and prereleases: an unfinished version is not offered to the user.
    const yayinlar = liste.filter((y) => y && !y.draft && !y.prerelease && y.tag_name);
    if (!yayinlar.length) return { ok: false, ...temel, hata: 'Yayımlanmış sürüm bulunamadı.' };
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
