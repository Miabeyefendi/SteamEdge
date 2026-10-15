// Listing goes through the market gate (spaced), and the same asset is never sent twice while it is in flight or just listed.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('const SELL_GAP_MS'), src.indexOf('// ================== MY LISTINGS, BOOSTER PACKS'));

(async () => {
  const handlers = {};
  const gates = [];
  const sent = [];
  let release = null;
  const ctx = {
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    engineReady: true, activeSteamID: '111', Date, console,
    engine: { sellItem: (asset) => { sent.push(asset); return new Promise((r) => { if (asset === 'slow') release = () => r({ success: true }); else r({ success: true }); }); } },
    marketGate: (fn, gap) => { gates.push(gap); return fn(); },
    saleErrorType: () => 'general', addStat: () => {}, ct: (x) => x,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const sell = handlers['engine:sellItem'];

  let r = await sell({}, { assetId: 'a1', priceCents: 10, amount: 1 });
  check('a listing goes through the gate with a gap of at least a second', r.ok && gates[0] >= 1000, JSON.stringify(gates));
  r = await sell({}, { assetId: 'a1', priceCents: 10, amount: 1 });
  check('the same asset right after is not sent again', !r.ok && r.typeName === 'skip' && sent.length === 1, JSON.stringify(r));

  const first = sell({}, { assetId: 'slow', priceCents: 10, amount: 1 });
  await new Promise((x) => setTimeout(x, 20));
  const second = await sell({}, { assetId: 'slow', priceCents: 10, amount: 1 });
  check('while a request for an asset is in flight a second one is refused', !second.ok && second.typeName === 'skip' && sent.filter((x) => x === 'slow').length === 1);
  release();
  check('the first one still finishes', (await first).ok === true);

  ctx.engine.sellItem = () => Promise.reject(Object.assign(new Error('boom'), { httpStatus: 500 }));
  r = await sell({}, { assetId: 'a2', priceCents: 10, amount: 1 });
  check('a failed request is reported', !r.ok);
  let sentAgain = 0;
  ctx.engine.sellItem = () => { sentAgain++; return Promise.resolve({ success: true }); };
  r = await sell({}, { assetId: 'a2', priceCents: 10, amount: 1 });
  check('a failed asset may be tried again', r.ok && sentAgain === 1);

  ctx.engineReady = false;
  r = await sell({}, { assetId: 'a3', priceCents: 10, amount: 1 });
  check('without a connection nothing is sent', !r.ok && r.typeName === 'limit');
  process.exit(failures ? 1 : 0);
})();
