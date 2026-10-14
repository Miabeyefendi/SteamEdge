// Proxy requests through a local HTTP CONNECT proxy and a local SOCKS5 proxy (src/core/proxyFetch.js).
// Run with `npm test` (tests/run.js).
process.on('uncaughtException', (e) => { if (e.code !== 'ECONNRESET') { console.log('UNCAUGHT', e); process.exit(2); } });
const http = require('http'), net = require('net'), zlib = require('zlib');
const ROOT = require('path').resolve(__dirname, '..', '..');
const { parseProxy, proxyFetch } = require(ROOT + '/src/core/proxyFetch');

const log = { connect: [], socks: [], target: [] };
// target server
const target = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    log.target.push({ m: req.method, u: req.url, cookie: req.headers.cookie, ct: req.headers['content-type'], body: Buffer.concat(chunks).toString() });
    if (req.url === '/redir') { res.writeHead(302, { Location: '/json' }); return res.end(); }
    if (req.url === '/gz') { res.writeHead(200, { 'content-encoding': 'gzip', 'set-cookie': ['a=1; Path=/', 'steamparental=zz; Path=/'] }); return res.end(zlib.gzipSync('{"success":true}')); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, url: req.url }));
  });
});
// http proxy with CONNECT + basic auth "u:p"
const hproxy = http.createServer((req, res) => { res.writeHead(405); res.end(); });
hproxy.on('connect', (req, sock, head) => {
  const auth = req.headers['proxy-authorization'];
  log.connect.push({ path: req.url, auth });
  if (auth !== 'Basic ' + Buffer.from('u:p').toString('base64')) { sock.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
  const [h, p] = req.url.split(':');
  const up = net.connect(+p, h, () => { sock.write('HTTP/1.1 200 OK\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up); });
  up.on('error', () => sock.destroy());
});
// minimal socks5 (no auth)
const sproxy = net.createServer((c) => {
  c.on('error', () => {});
  c.once('data', () => {
    c.write(Buffer.from([5, 0]));
    c.once('data', (d) => {
      let host, off;
      if (d[3] === 1) { host = [...d.slice(4, 8)].join('.'); off = 8; }
      else if (d[3] === 3) { const l = d[4]; host = d.slice(5, 5 + l).toString(); off = 5 + l; }
      const port = d.readUInt16BE(off);
      log.socks.push(host + ':' + port);
      const up = net.connect(port, host, () => { c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); up.pipe(c); c.pipe(up); });
      up.on('error', () => c.destroy());
    });
  });
});
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

(async () => {
  const tp = await listen(target), hp = await listen(hproxy), sp = await listen(sproxy);
  const T = 'http://127.0.0.1:' + tp;
  console.log('parse:', JSON.stringify([parseProxy(''), parseProxy('127.0.0.1:8080'), parseProxy('socks5://a:b@h:1080'), parseProxy('ftp://h:1'), parseProxy('http://nohost'), parseProxy('socks5://h')]));

  const hp1 = parseProxy('http://u:p@127.0.0.1:' + hp);
  let r = await proxyFetch(T + '/json', { headers: { Cookie: 'sid=1' } }, hp1);
  let j = await r.json();
  ok('http proxy GET', r.status === 200 && j.success && log.connect.length === 1 && log.connect[0].path.endsWith(':' + tp), JSON.stringify(log.connect[0]));
  ok('cookie header reaches target', log.target[0].cookie === 'sid=1');

  r = await proxyFetch(T + '/post', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: 'sid=2' }, body: new URLSearchParams({ pin: '1234', sessionid: 'abc' }) }, hp1);
  const last = log.target[log.target.length - 1];
  ok('POST body + type', last.m === 'POST' && last.body === 'pin=1234&sessionid=abc' && last.ct.startsWith('application/x-www-form-urlencoded'), JSON.stringify(last));

  r = await proxyFetch(T + '/redir', {}, hp1); j = await r.json();
  ok('redirect followed', j.url === '/json');

  r = await proxyFetch(T + '/gz', {}, hp1); j = await r.json();
  ok('gzip + set-cookie', j.success && r.headers.getSetCookie().some((c) => c.startsWith('steamparental=')));

  const bad = parseProxy('http://u:wrong@127.0.0.1:' + hp);
  let err = null; try { await proxyFetch(T + '/json', {}, bad); } catch (e) { err = e; }
  ok('wrong proxy password fails (no direct fallback)', !!err, err && err.message);
  ok('target not reached on failure', log.target.length === 5);

  const sp1 = parseProxy('socks5://127.0.0.1:' + sp);
  r = await proxyFetch(T + '/json', { headers: { Cookie: 'sid=3' } }, sp1); j = await r.json();
  ok('socks5 GET', j.success && log.socks.length === 1, log.socks[0]);

  const dead = parseProxy('http://127.0.0.1:1');
  err = null; try { await proxyFetch(T + '/json', {}, dead); } catch (e) { err = e; }
  ok('dead proxy fails', !!err, err && err.message);

  const ac = new AbortController(); setTimeout(() => ac.abort(), 5);
  const slow = net.createServer(() => {}); const slp = await listen(slow);
  err = null; try { await proxyFetch('http://127.0.0.1:' + slp + '/', { signal: ac.signal }, parseProxy('socks5://127.0.0.1:' + sp)); } catch (e) { err = e; }
  ok('abort signal', err && (err.name === 'AbortError' || /abort/i.test(err.message)), err && err.name);

  // real https through the http proxy (CONNECT) and socks: public Steam page, GET only
  const before = log.connect.length, sb = log.socks.length;
  try {
    r = await proxyFetch('https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name=x', {}, hp1);
    ok('https via CONNECT (real Steam)', r.status > 0 && log.connect.length === before + 1 && log.connect[before].path === 'steamcommunity.com:443', 'status ' + r.status);
    r = await proxyFetch('https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name=x', {}, sp1);
    ok('https via socks5 (real Steam)', r.status > 0 && log.socks.length === sb + 1 && log.socks[sb] === 'steamcommunity.com:443', 'status ' + r.status);
  } catch (e) { console.log('SKIP real Steam: ' + e.message); }
  console.log(fails ? 'FAILED ' + fails : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
