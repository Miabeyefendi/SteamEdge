// ================= UPDATE CHECK AND DOWNLOAD =================
// check() only LOOKS: it reads GitHub's release list and compares it with the installed version.
// download() runs ONLY after the user pressed the update button, and only fetches the file of that
// release from this project's own GitHub release (https, host allow list, size cap). A file whose SHA-256 does
// not equal the digest GitHub lists for the asset is deleted and never run, and an asset without a digest is refused.
//
// Why /releases?per_page=... and not /releases/latest:
// GitHub's "latest" endpoint skips prereleases and drafts, but it also returns 404
// if no release is marked. Fetching the list and picking the newest non-draft, non-prerelease
// ourselves is both more predictable and a single request.

const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { activeAgent } = require('../core/proxyFetch');

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
      agent: activeAgent(true),
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

// The two files a release carries for the updater: the Setup (installed copies) and the zip (portable copies).
// `digest` is the "sha256:<hex>" GitHub computes for every uploaded asset.
const MAX_BYTES = 400 * 1024 * 1024;
const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-releases.githubusercontent.com'];
function pickAssets(release) {
  const list = Array.isArray(release && release.assets) ? release.assets : [];
  const find = (re) => {
    const a = list.find((x) => x && re.test(String(x.name || '')) && x.browser_download_url);
    if (!a) return null;
    const m = /^sha256:([0-9a-f]{64})$/i.exec(String(a.digest || ''));
    return { name: a.name, url: a.browser_download_url, size: +a.size || 0, sha256: m ? m[1].toLowerCase() : null };
  };
  return { setup: find(/^SteamEdge-Setup.*\.exe$/i), zip: find(/^SteamEdge-v.*-win-x64\.zip$/i) };
}

// Only https, and only GitHub's own hosts, on the first request and on every redirect.
function allowedUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && ALLOWED_HOSTS.includes(x.hostname);
  } catch (_) { return false; }
}

// Downloads `asset` ({url, size, sha256}) to `dest`. onProgress(done, total). Resolves { ok, path } or { ok:false, failure }.
function download(asset, dest, onProgress) {
  return new Promise((resolve) => {
    if (!asset || !allowedUrl(asset.url)) return resolve({ ok: false, failure: 'İndirme adresi geçersiz.' });
    if (!asset.sha256) return resolve({ ok: false, failure: 'Yayında doğrulama değeri yok, indirme yapılmadı.' });
    const part = dest + '.part';
    let finished = false;
    const done = (r) => {
      if (finished) return;
      finished = true;
      if (!r.ok) { try { fs.unlinkSync(part); } catch (_) {} }
      resolve(r);
    };
    const get = (url, hops) => {
      if (hops > 5 || !allowedUrl(url)) return done({ ok: false, failure: 'İndirme adresi geçersiz.' });
      const req = https.get(url, { headers: { 'User-Agent': 'SteamEdge' }, agent: activeAgent(true) }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(new URL(res.headers.location, url).toString(), hops + 1);
        }
        if (res.statusCode !== 200) { res.resume(); return done({ ok: false, failure: 'GitHub beklenmeyen bir yanıt döndürdü (HTTP #).'.replace('#', res.statusCode) }); }
        const total = +res.headers['content-length'] || asset.size || 0;
        if (total > MAX_BYTES) { res.resume(); return done({ ok: false, failure: 'İndirilecek dosya beklenenden büyük.' }); }
        const hash = crypto.createHash('sha256');
        const out = fs.createWriteStream(part);
        let got = 0;
        res.on('data', (c) => {
          got += c.length;
          if (got > MAX_BYTES) { req.destroy(); out.destroy(); return done({ ok: false, failure: 'İndirilecek dosya beklenenden büyük.' }); }
          hash.update(c);
          if (onProgress) onProgress(got, total);
        });
        res.pipe(out);
        out.on('error', (e) => done({ ok: false, failure: errorText(e) }));
        out.on('finish', () => {
          if (finished) return;
          if (hash.digest('hex') !== asset.sha256) return done({ ok: false, failure: 'İndirilen dosya doğrulanamadı, silindi.' });
          try { fs.renameSync(part, dest); } catch (e) { return done({ ok: false, failure: errorText(e) }); }
          done({ ok: true, path: dest });
        });
        res.on('error', (e) => done({ ok: false, failure: errorText(e) }));
      });
      req.on('error', (e) => done({ ok: false, failure: errorText(e) }));
      req.setTimeout(TIMEOUT_MS, () => req.destroy(Object.assign(new Error('zaman aşımı'), { code: 'ZAMANASIMI' })));
    };
    get(asset.url, 0);
  });
}

// installedVersion: the version in package.json (app.getVersion()).
// The return always has the same shape: { ok, installed, lastOne, isUpToDate, url, releaseName, releaseTs, failure }
async function check(installedVersion) {
  const basis = { installed: installedVersion, lastOne: null, isUpToDate: null, url: RELEASES_PAGE, releaseName: null, releaseTs: null };
  try {
    const listing = await request(LIST_URL);
    if (!Array.isArray(listing)) return { ok: false, ...basis, failure: 'GitHub beklenmeyen bir yanıt döndürdü.' };
    // Skip drafts and prereleases: an unfinished version is not offered to the user.
    const broadcasts = listing.filter((y) => y && !y.draft && !y.prerelease && y.tag_name);
    if (!broadcasts.length) return { ok: false, ...basis, failure: 'Yayımlanmış sürüm bulunamadı.' };
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
      assets: pickAssets(newest),
    };
  } catch (e) {
    return { ok: false, ...basis, failure: errorText(e) };
  }
}

module.exports = { checkNow: check, download: download, pickAssets: pickAssets, allowedUrl: allowedUrl, compareVersion: compareVersion, RELEASES_PAGE: RELEASES_PAGE, STORE: STORE };
