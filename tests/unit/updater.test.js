// The update download (src/services/updater.js) and the install mode marker (src/core/installMode.js):
// which asset is picked, that only GitHub hosts are fetched, that a file without a digest or with a wrong digest is never kept.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { PassThrough } = require('stream');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const updater = require('../../src/services/updater');
const installMode = require('../../src/core/installMode');

// ---- versions and asset choice ----
check('1.10.0 is newer than 1.9.9', updater.compareVersion('1.10.0', '1.9.9') === 1);
check('3.0.0 is newer than 2.0.0', updater.compareVersion('v3.0.0', '2.0.0') === 1);
const sha = 'a'.repeat(64);
const picked = updater.pickAssets({ assets: [
  { name: 'SteamEdge-v3.0.0-win-x64.rar', browser_download_url: 'https://github.com/x/rar', size: 1, digest: 'sha256:' + sha },
  { name: 'SteamEdge-v3.0.0-win-x64.zip', browser_download_url: 'https://github.com/x/zip', size: 2, digest: 'sha256:' + sha },
  { name: 'SteamEdge-Setup-v3.0.0.exe', browser_download_url: 'https://github.com/x/setup', size: 3, digest: 'sha256:' + sha.toUpperCase() },
] });
check('the Setup is picked for installed copies', picked.setup && picked.setup.name === 'SteamEdge-Setup-v3.0.0.exe' && picked.setup.sha256 === sha);
check('the zip (not the rar) is picked for portable copies', picked.zip && picked.zip.name.endsWith('.zip'));
check('a release without assets gives none', !updater.pickAssets({}).setup && !updater.pickAssets({}).zip);
check('an asset without a digest keeps sha256 null', updater.pickAssets({ assets: [{ name: 'SteamEdge-Setup-v1.exe', browser_download_url: 'https://github.com/x' }] }).setup.sha256 === null);

// ---- allowed addresses ----
check('github.com over https is allowed', updater.allowedUrl('https://github.com/Miabeyefendi/SteamEdge/releases/download/3.0.0/a.exe'));
check('http is refused', !updater.allowedUrl('http://github.com/a'));
check('another host is refused', !updater.allowedUrl('https://evil.example.com/a.exe'));
check('a look-alike host is refused', !updater.allowedUrl('https://github.com.evil.example.com/a.exe'));
check('garbage is refused', !updater.allowedUrl('not a url'));

// ---- download with a fake GitHub ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'steamedge-updater-'));
const body = Buffer.from('pretend this is a Setup');
const goodSha = crypto.createHash('sha256').update(body).digest('hex');
let lastUrl = null;
https.get = (url, _opts, cb) => {
  lastUrl = url;
  const res = new PassThrough();
  res.statusCode = 200;
  res.headers = { 'content-length': String(body.length) };
  const req = new PassThrough();
  req.setTimeout = () => {};
  req.destroy = () => {};
  setImmediate(() => { cb(res); res.end(body); });
  return req;
};

(async () => {
  const noDigest = await updater.download({ url: 'https://github.com/x/a.exe', sha256: null }, path.join(tmp, 'a.exe'));
  check('a download without a digest is refused', !noDigest.ok && lastUrl === null);
  const badHost = await updater.download({ url: 'https://evil.example.com/a.exe', sha256: goodSha }, path.join(tmp, 'b.exe'));
  check('a download from another host is refused', !badHost.ok && lastUrl === null);

  const wrong = await updater.download({ url: 'https://github.com/x/c.exe', sha256: 'b'.repeat(64) }, path.join(tmp, 'c.exe'));
  check('a wrong digest is refused', !wrong.ok);
  check('a wrong digest leaves no file behind', !fs.existsSync(path.join(tmp, 'c.exe')) && !fs.existsSync(path.join(tmp, 'c.exe.part')));

  let progress = 0;
  const good = await updater.download({ url: 'https://github.com/x/d.exe', sha256: goodSha }, path.join(tmp, 'd.exe'), (done) => { progress = done; });
  check('a matching digest is kept', good.ok && fs.readFileSync(path.join(tmp, 'd.exe')).equals(body));
  check('progress reached the full size', progress === body.length);

  // ---- install mode ----
  const exe = path.join(tmp, 'SteamEdge.exe');
  check('no uninstaller means portable', installMode.isInstalled(exe) === false);
  fs.writeFileSync(path.join(tmp, installMode.UNINSTALLER), 'x');
  check('the uninstaller next to the exe means installed', installMode.isInstalled(exe) === true);
  fs.writeFileSync(path.join(tmp, installMode.LANG_FILE), 'de\n');
  check('the language left by the Setup is read', installMode.setupLanguage(exe) === 'de');
  fs.writeFileSync(path.join(tmp, installMode.LANG_FILE), 'xx');
  check('an unknown language code is ignored', installMode.setupLanguage(exe) === null);

  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
