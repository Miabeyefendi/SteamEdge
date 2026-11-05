// Steam's community site answers 429 to the fetch built into Electron's Node (market, inventory, selling), every time. Inside Electron the engine sends its web
// requests through Chromium's network stack (net.fetch) with no browser cookies; outside Electron (the tests) and before the app is ready it is the plain fetch.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'core', 'steamEngine.js'), 'utf8');
const a = src.indexOf('function webFetch(url, options) {');
const b = src.indexOf('\n}\n', a) + 3;
check('webFetch is in steamEngine.js', a > 0 && b > a);
const code = src.slice(a, b);

function run(electron) {
  const calls = [];
  const ctx = {
    require: (name) => { if (name === 'electron' && electron) return electron(calls); throw new Error('no electron'); },
    fetch: (u, o) => { calls.push(['fetch', u, o]); return Promise.resolve('plain'); },
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.go = webFetch;', ctx);
  return { go: ctx.go, calls };
}

const ready = (calls) => ({ app: { isReady: () => true }, net: { fetch: (u, o) => { calls.push(['net', u, o]); return Promise.resolve('net'); } } });
const notReady = (calls) => ({ app: { isReady: () => false }, net: { fetch: () => { calls.push(['net']); return Promise.resolve('net'); } } });
const pathOnly = () => 'C:\\path\\electron.exe';      // what require('electron') gives in plain Node

(async () => {
  let t = run(ready);
  check('inside a ready Electron the request goes through net.fetch', (await t.go('https://x/y', { headers: { Cookie: 'a=b' } })) === 'net' && t.calls[0][0] === 'net');
  check('browser cookies are not added (credentials omit) and the account cookie header is kept', t.calls[0][2].credentials === 'omit' && t.calls[0][2].headers.Cookie === 'a=b');
  t = run(notReady);
  check('before the app is ready it is the plain fetch', (await t.go('https://x/y')) === 'plain' && t.calls[0][0] === 'fetch');
  t = run(pathOnly);
  check('in plain Node (the tests) it is the plain fetch', (await t.go('https://x/y')) === 'plain' && t.calls[0][0] === 'fetch');
  t = run(null);
  check('and when electron cannot be loaded at all', (await t.go('https://x/y')) === 'plain');
  process.exit(failures ? 1 : 0);
})();
