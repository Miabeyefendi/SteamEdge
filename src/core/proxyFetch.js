'use strict';
// Per-account proxy support for the engine's own web requests (market, inventory, key page, ...).
// The Steam connection itself goes through steam-user's httpProxy / socksProxy options; this file covers the plain
// HTTPS calls the engine makes with fetch. fetch cannot take a proxy in Node without an extra package, so the
// request is made with https.request and the same proxy agents steam-user already uses (@doctormckay/stdlib for
// http/https proxies, socks-proxy-agent for SOCKS5), and the reply is wrapped in the small part of the fetch
// Response interface the engine reads: status, ok, headers.get / getSetCookie, text(), json().
// A request with a proxy set never falls back to a direct connection: if the proxy is down the request fails.
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const PROXY_ERROR = 'Vekil adresi geçersiz. Biçim: http://sunucu:port, https://sunucu:port ya da socks5://sunucu:port.';

// Returns { ok:true, empty:true } for an empty value, { ok:true, url, socks } for a usable one, { ok:false, error }.
function parseProxy(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { ok: true, empty: true };
  let u;
  try { u = new URL(raw.includes('://') ? raw : 'http://' + raw); } catch (_) { return { ok: false, error: PROXY_ERROR }; }
  const proto = u.protocol.replace(':', '');
  if (!['http', 'https', 'socks5', 'socks5h'].includes(proto) || !u.hostname || !u.port) return { ok: false, error: PROXY_ERROR };
  return { ok: true, url: u.href.replace(/\/$/, ''), socks: proto.startsWith('socks') };
}

function makeAgent(proxy, secure) {
  if (proxy.socks) {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    // socks5h: the proxy resolves the host name, so the name does not leak through the local DNS
    return new SocksProxyAgent(proxy.url.replace(/^socks5:/, 'socks5h:'));
  }
  return require('@doctormckay/stdlib').HTTP.getProxyAgent(secure, proxy.url);
}

function wrapResponse(res, buffer, url) {
  const headers = res.headers;
  return {
    status: res.statusCode,
    ok: res.statusCode >= 200 && res.statusCode < 300,
    url,
    headers: {
      get: (name) => { const v = headers[String(name).toLowerCase()]; return Array.isArray(v) ? v.join(', ') : (v == null ? null : v); },
      getSetCookie: () => { const v = headers['set-cookie']; return Array.isArray(v) ? v.slice() : (v ? [v] : []); },
    },
    text: async () => buffer.toString('utf8'),
    json: async () => JSON.parse(buffer.toString('utf8')),
  };
}

function decode(res, raw) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase();
  try {
    if (enc === 'gzip') return zlib.gunzipSync(raw);
    if (enc === 'deflate') return zlib.inflateSync(raw);
    if (enc === 'br') return zlib.brotliDecompressSync(raw);
  } catch (_) { /* a damaged body is handed on as it is; the caller's JSON.parse reports it */ }
  return raw;
}

function once(urlText, options, proxy) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlText);
    const secure = url.protocol === 'https:';
    const headers = {};
    Object.entries(options.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
    if (!('accept-encoding' in headers)) headers['accept-encoding'] = 'gzip, deflate, br';
    let body = options.body;
    if (body instanceof URLSearchParams) body = body.toString();
    if (body != null) {
      body = Buffer.from(String(body), 'utf8');
      headers['content-length'] = String(body.length);
    }
    const req = (secure ? https : http).request({
      protocol: url.protocol, hostname: url.hostname, port: url.port || (secure ? 443 : 80),
      path: url.pathname + url.search, method: options.method || 'GET', headers,
      agent: makeAgent(proxy, secure),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ res, buffer: decode(res, Buffer.concat(chunks)) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    const signal = options.signal;
    if (signal) {
      const abort = () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; req.destroy(e); };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
    }
    if (body != null) req.write(body);
    req.end();
  });
}

// fetch-compatible request through `proxy` (the result of parseProxy). Redirects are followed like fetch does.
async function proxyFetch(urlText, options, proxy) {
  let current = String(urlText);
  let opts = { ...(options || {}) };
  for (let hops = 0; hops < 6; hops++) {
    const { res, buffer } = await once(current, opts, proxy);
    const loc = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && opts.redirect !== 'manual') {
      const next = new URL(loc, current);
      // the account's cookies stay with the host they were sent to
      if (next.origin !== new URL(current).origin && opts.headers) {
        opts = { ...opts, headers: Object.fromEntries(Object.entries(opts.headers).filter(([k]) => k.toLowerCase() !== 'cookie')) };
      }
      current = next.href;
      // 303 always, and 301/302 for a POST, turn into a GET without a body, as in fetch
      if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && String(opts.method || 'GET').toUpperCase() === 'POST')) {
        opts = { ...opts, method: 'GET', body: undefined };
      }
      continue;
    }
    return wrapResponse(res, buffer, current);
  }
  throw new Error('Too many redirects');
}

module.exports = { parseProxy, proxyFetch, PROXY_ERROR };
