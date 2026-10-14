'use strict';
// A small proxy on 127.0.0.1 that the app window's session points at. Chromium cannot log in to a SOCKS5 proxy at all and only
// asks for an HTTP proxy's password through events that do not fire for page images, so the window talks to this local proxy
// without a login and this one carries every request on to the account's own proxy with its user name and password.
// Bound to the loopback address on a random port; it only exists while the account on screen has a proxy.
const http = require('http');
const https = require('https');
const net = require('net');

// A raw TCP tunnel to host:port through the upstream proxy (the result of parseProxy). Resolves with the connected socket.
function openTunnel(upstream, host, port) {
  const u = new URL(upstream.url);
  if (upstream.socks) {
    const { SocksClient } = require('socks');
    return SocksClient.createConnection({
      proxy: { host: u.hostname, port: +u.port, type: 5, userId: u.username ? decodeURIComponent(u.username) : undefined, password: u.password ? decodeURIComponent(u.password) : undefined },
      command: 'connect',
      destination: { host, port },
      timeout: 15000,
    }).then((info) => info.socket);
  }
  return new Promise((resolve, reject) => {
    const headers = {};
    if (u.username) headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password || ''), 'utf8').toString('base64');
    const req = (u.protocol === 'https:' ? https : http).request({ host: u.hostname, port: +u.port, method: 'CONNECT', path: host + ':' + port, headers, timeout: 15000 });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error('Proxy CONNECT ' + res.statusCode)); return; }
      resolve(socket);
    });
    req.on('timeout', () => req.destroy(new Error('proxy timeout')));
    req.on('error', reject);
    req.end();
  });
}

function startLocalProxy(upstream) {
  const server = http.createServer((req, res) => {
    // a plain http request: it arrives with the full address, goes out through a tunnel to the target
    let target;
    try { target = new URL(req.url); } catch (_) { res.writeHead(400); res.end(); return; }
    if (target.protocol !== 'http:') { res.writeHead(405); res.end(); return; }
    openTunnel(upstream, target.hostname, +target.port || 80).then((socket) => {
      const headers = { ...req.headers };
      delete headers['proxy-connection']; delete headers['proxy-authorization'];
      // an agent whose only connection is the tunnel that was just opened
      const agent = new http.Agent({ keepAlive: false });
      agent.createConnection = () => socket;
      const out = http.request({ method: req.method, path: target.pathname + target.search, headers, agent }, (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      });
      out.on('error', (e) => { if (process.env.LP_DEBUG) console.log('plain error', e.message); try { res.writeHead(502); res.end(); } catch (_) {} socket.destroy(); });
      req.pipe(out);
    }).catch((e) => { if (process.env.LP_DEBUG) console.log('tunnel error', e.message); try { res.writeHead(502); res.end(); } catch (_) {} });
  });
  // https (and anything else over TLS): a CONNECT, answered once the tunnel is open
  server.on('connect', (req, clientSocket, head) => {
    clientSocket.on('error', () => {});
    const idx = req.url.lastIndexOf(':');
    const host = req.url.slice(0, idx).replace(/^\[|\]$/g, ''), port = +req.url.slice(idx + 1);
    if (!host || !(port > 0 && port < 65536)) { clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    openTunnel(upstream, host, port).then((socket) => {
      socket.on('error', () => clientSocket.destroy());
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) socket.write(head);
      socket.pipe(clientSocket); clientSocket.pipe(socket);
      clientSocket.on('close', () => socket.destroy());
    }).catch(() => { clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }) }));
  });
}

module.exports = { startLocalProxy, openTunnel };
