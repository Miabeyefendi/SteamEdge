// The local proxy the app window uses: a CONNECT tunnel and a plain http request both reach their target through an upstream HTTP proxy
// that wants a login and through an upstream SOCKS5 proxy, and a failing upstream answers 502.
// Run with `npm test` (tests/run.js).
process.on('uncaughtException', (e) => { if (e.code !== 'ECONNRESET' && e.code !== 'EPIPE') { console.log('UNCAUGHT', e); process.exit(2); } });
const http = require('http');
const net = require('net');
const { parseProxy } = require('../../src/core/proxyFetch');
const { startLocalProxy } = require('../../src/core/localProxy');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));

(async () => {
  // the real target: answers http requests and echoes raw bytes on a second port
  const seenAuth = [];
  // the answer never repeats what the request sent, only which of two paths it was
  const web = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/plain'); res.end(req.url === '/page' ? 'web:/page' : 'web:other'); });
  const echo = net.createServer((c) => { c.on('error', () => {}); c.on('data', (d) => c.write('echo:' + d)); });
  const wport = await listen(web), eport = await listen(echo);

  // upstream 1: an HTTP proxy that wants u:secret (CONNECT only)
  const hproxy = http.createServer((req, res) => { res.writeHead(405); res.end(); });
  hproxy.on('connect', (req, sock, head) => {
    const auth = req.headers['proxy-authorization']; seenAuth.push(auth);
    sock.on('error', () => {});
    if (auth !== 'Basic ' + Buffer.from('u:secret').toString('base64')) { sock.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
    const [h, p] = req.url.split(':');
    const up = net.connect(+p, h, () => { sock.write('HTTP/1.1 200 OK\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up); });
    up.on('error', () => sock.destroy());
  });
  // upstream 2: SOCKS5 that wants u:secret
  const socksSeen = [];
  const sproxy = net.createServer((c) => {
    c.on('error', () => {});
    c.once('data', () => {
      c.write(Buffer.from([5, 2]));                         // choose user/password
      c.once('data', (d) => {
        const ul = d[1], user = d.slice(2, 2 + ul).toString(), pl = d[2 + ul], pass = d.slice(3 + ul, 3 + ul + pl).toString();
        if (user !== 'u' || pass !== 'secret') { c.end(Buffer.from([1, 1])); return; }
        c.write(Buffer.from([1, 0]));
        c.once('data', (r) => {
          let host, off;
          if (r[3] === 1) { host = [...r.slice(4, 8)].join('.'); off = 8; } else { const l = r[4]; host = r.slice(5, 5 + l).toString(); off = 5 + l; }
          const port = r.readUInt16BE(off); socksSeen.push(host + ':' + port);
          const up = net.connect(port, host, () => { c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])); up.pipe(c); c.pipe(up); });
          up.on('error', () => c.destroy());
        });
      });
    });
  });
  const hport = await listen(hproxy), sport = await listen(sproxy);

  const viaConnect = (lport) => new Promise((resolve) => {
    const s = net.connect(lport, '127.0.0.1', () => s.write('CONNECT 127.0.0.1:' + eport + ' HTTP/1.1\r\nHost: 127.0.0.1:' + eport + '\r\n\r\n'));
    let buf = ''; let sent = false;
    s.on('data', (d) => {
      buf += d;
      if (!sent && buf.includes('\r\n\r\n')) { sent = true; check('CONNECT is answered 200 once the tunnel is open', /^HTTP\/1\.1 200/.test(buf)); s.write('ping'); }
      if (buf.includes('echo:ping')) { s.destroy(); resolve(buf); }
    });
    s.on('error', () => resolve(buf));
    setTimeout(() => { s.destroy(); resolve(buf); }, 5000);
  });
  const viaGet = (lport) => new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: lport, path: 'http://127.0.0.1:' + wport + '/page', headers: { Host: '127.0.0.1:' + wport } }, (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => resolve(r.statusCode + ' ' + b)); }).on('error', () => resolve('error'));
  });

  for (const [label, url] of [['HTTP proxy with a login', 'http://u:secret@127.0.0.1:' + hport], ['SOCKS5 proxy with a login', 'socks5://u:secret@127.0.0.1:' + sport]]) {
    const lp = await startLocalProxy(parseProxy(url));
    const tunnelled = await viaConnect(lp.port);
    check(label + ': bytes pass through a CONNECT tunnel', tunnelled.includes('echo:ping'));
    const got = await viaGet(lp.port); check(label + ': a plain http request reaches the target', got === '200 web:/page', got);
    await lp.close();
  }
  check('the HTTP proxy was given the login', seenAuth.every((a) => a === 'Basic ' + Buffer.from('u:secret').toString('base64')) && seenAuth.length >= 2);
  check('the SOCKS5 proxy was asked for the target (host name resolved on its side)', socksSeen.length >= 2 && socksSeen.every((x) => x === '127.0.0.1:' + eport || x === '127.0.0.1:' + wport));

  // a wrong password upstream: the window gets a 502, not a hang
  const bad = await startLocalProxy(parseProxy('http://u:wrong@127.0.0.1:' + hport));
  const answer = await new Promise((resolve) => {
    const s = net.connect(bad.port, '127.0.0.1', () => s.write('CONNECT 127.0.0.1:' + eport + ' HTTP/1.1\r\n\r\n'));
    let b = ''; s.on('data', (d) => { b += d; if (b.includes('\r\n\r\n')) { s.destroy(); resolve(b); } }); s.on('error', () => resolve(b)); setTimeout(() => { s.destroy(); resolve(b); }, 5000);
  });
  check('a wrong upstream password gives the window a 502', /^HTTP\/1\.1 502/.test(answer), answer.split('\r\n')[0]);
  await bad.close();
  process.exit(failures ? 1 : 0);
})();
