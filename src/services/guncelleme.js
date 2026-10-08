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

const STORE = 'Miabeyefendi/steamedge';
const LIST_URL = 'https://api.github.com/repos/' + STORE + '/releases?per_page=10';
const RELEASES_PAGE = 'https://github.com/' + STORE + '/releases/latest';
const TIMEOUT_MS = 12000;

// "1.0.10" must be greater than "1.0.9": compare the parts as NUMBERS, not as text.
// Returns: 1 if a>b, -1 if a<b, 0 if equal. An undefined/broken part counts as 0.
function compareVersion(a, b) {
  const separate = (s) => String(s || '').trim().replace(/^v/i, '').split(/[.\-+]/).map((p) => parseInt(p, 10) || 0);
  const x = separate(a);
  const y = separate(b);
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
function errorText(e) {
  const codeStr = (e && (e.code || e.errno)) || '';
  if (codeStr === 'ENOTFOUND' || codeStr === 'EAI_AGAIN') return 'İnternet bağlantısı yok gibi görünüyor.';
  if (codeStr === 'ETIMEDOUT' || codeStr === 'ESOCKETTIMEDOUT' || codeStr === 'ZAMANASIMI') return 'GitHub zamanında yanıt vermedi.';
  if (codeStr === 'ECONNRESET' || codeStr === 'ECONNREFUSED') return 'Bağlantı kesildi.';
  if (codeStr === 'CERT_HAS_EXPIRED' || String(codeStr).indexOf('CERT') === 0) return 'Güvenli bağlantı kurulamadı.';
  return (e && e.message) ? e.message : 'Bilinmeyen hata.';
}

function request(url) {
  return new Promise((solution, errorInfo) => {
    const r = https.get(url, {
      headers: {
        // GitHub's API returns 403 without a User-Agent.
        'User-Agent': 'SteamEdge',
        Accept: 'application/vnd.github+json',
      },
    }, (reply) => {
      // Unauthenticated requests get 60 per hour. Past that a 403 comes; it has to be described not as an "error"
      // but as "could not check right now", otherwise the user thought it was broken.
      if (reply.statusCode === 403 || reply.statusCode === 429) {
        reply.resume();
        return errorInfo(Object.assign(new Error('GitHub istek sınırı aşıldı, biraz sonra tekrar dene.'), { code: 'LIMIT' }));
      }
      if (reply.statusCode < 200 || reply.statusCode >= 300) {
        reply.resume();
        return errorInfo(new Error('GitHub beklenmeyen bir yanıt döndürdü (HTTP #).'.replace('#', reply.statusCode)));
      }
      let bodyEl = '';
      reply.setEncoding('utf8');
      reply.on('data', (p) => { bodyEl += p; });
      reply.on('end', () => {
        try { solution(JSON.parse(bodyEl)); }
        catch (_) { errorInfo(new Error('GitHub yanıtı okunamadı.')); }
      });
    });
    r.on('error', errorInfo);
    r.setTimeout(TIMEOUT_MS, () => {
      r.destroy(Object.assign(new Error('zaman aşımı'), { code: 'ZAMANASIMI' }));
    });
  });
}

// installedVersion: the version in package.json (app.getVersion()).
// The return always has the same shape: { ok, kurulu, son, guncelMi, url, yayinAdi, yayinTs, hata }
async function check(installedVersion) {
  const basis = { installed: installedVersion, lastOne: null, isUpToDate: null, url: RELEASES_PAGE, releaseName: null, releaseTs: null };
  try {
    const listing = await request(LIST_URL);
    if (!Array.isArray(listing)) return { ok: false, ...basis, hata: 'GitHub beklenmeyen bir yanıt döndürdü.' };
    // Skip drafts and prereleases: an unfinished version is not offered to the user.
    const broadcasts = listing.filter((y) => y && !y.draft && !y.prerelease && y.tag_name);
    if (!broadcasts.length) return { ok: false, ...basis, hata: 'Yayımlanmış sürüm bulunamadı.' };
    let newest = broadcasts[0];
    broadcasts.forEach((y) => { if (compareVersion(y.tag_name, newest.tag_name) > 0) newest = y; });
    const latest = String(newest.tag_name).replace(/^v/i, '');
    return {
      ok: true,
      ...basis,
      lastOne: latest,
      isUpToDate: compareVersion(installedVersion, latest) >= 0,
      url: newest.html_url || RELEASES_PAGE,
      releaseName: newest.name || newest.tag_name,
      releaseTs: newest.published_at ? Date.parse(newest.published_at) : null,
    };
  } catch (e) {
    return { ok: false, ...basis, hata: errorText(e) };
  }
}

module.exports = { checkNow: check, compareVersion: compareVersion, RELEASES_PAGE: RELEASES_PAGE, STORE: STORE };
