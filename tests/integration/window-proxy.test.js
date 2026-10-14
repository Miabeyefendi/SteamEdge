// The app window's own traffic (the images of the pages) goes through the proxy of the account on screen, answers the proxy's
// login from the address the user typed, and goes back to a direct connection when the proxy is removed.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, session, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
const { parseProxy, setActiveProxy } = require('../../src/core/proxyFetch');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const { startLocalProxy } = require('../../src/core/localProxy');
const code = src.slice(src.indexOf('let localProxy = null;'), src.indexOf('function syncActive() {'));

app.whenReady().then(async () => {
  const seen = [];
  // a plain HTTP proxy that wants user:secret and forwards what it gets to the real target
  // a 1x1 gif, so that an <img> loads it
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const target = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'image/gif' }); res.end(GIF); });
  await new Promise((r) => target.listen(0, '127.0.0.1', r));
  const tport = target.address().port;
  const proxy = http.createServer((req, res) => { res.writeHead(405); res.end(); });
  proxy.on('connect', (req, sock, head) => {
    const auth = req.headers['proxy-authorization'];
    seen.push({ url: req.url, auth });
    sock.on('error', () => {});
    if (auth !== 'Basic ' + Buffer.from('u:secret').toString('base64')) { sock.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); return; }
    // whatever host the page asked for, the made-up one included, the proxy knows the real target
    const up = net.connect(tport, '127.0.0.1', () => { sock.write('HTTP/1.1 200 OK\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up); });
    up.on('error', () => sock.destroy());
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const pport = proxy.address().port;

  const accountsData = { A: { proxyUrl: 'http://u:secret@127.0.0.1:' + pport } };
  const ctx = { app, session, parseProxy, setActiveProxy, startLocalProxy, log: () => {}, URL, Promise, accountData: (id) => accountsData[id] || { proxyUrl: '' }, activeSteamID: 'A', console };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.apply = applyActiveProxy; this.setActive = (id) => { activeSteamID = id; };', ctx);

  await ctx.apply();
  const url = 'http://steam-images.test:' + tport + '/avatar.gif';
  // the page asks for an image the way the app pages do
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  let n = 0;
  // a new address every time, so that the page cache cannot answer for the network
  const loadImage = () => win.webContents.executeJavaScript(`new Promise((res) => { const i = new Image(); i.onload = () => res('loaded'); i.onerror = () => res('failed'); i.src = ${JSON.stringify(url)} + '?n=' + ${++n}; setTimeout(() => res('timeout'), 6000); })`);
  let body = await loadImage(), err = null;
  check('an image from a host nobody resolves is carried by the proxy', body === 'loaded', String(body));
  check('the proxy was asked to open a tunnel to the host the page named', seen.some((s) => s.url.startsWith('steam-images.test:')));
  check('the proxy login came from the typed address (user and password), the page never saw a login question', seen.some((s) => s.auth === 'Basic ' + Buffer.from('u:secret').toString('base64')));

  // the account on screen has no proxy any more: direct again, so the made-up host cannot be reached
  ctx.setActive('B'); await ctx.apply();
  seen.length = 0;
  body = await loadImage();
  check('with no proxy the traffic is direct again', body !== 'loaded' && seen.length === 0, String(body));

  process.exit(failures ? 1 : 0);
});
