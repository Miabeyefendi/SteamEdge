// Listing goes through the market gate (spaced), and the same asset is never sent twice while it is in flight or just listed.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('const SELL_GAP_MS'), src.indexOf('// ================== MY LISTINGS, BOOSTER PACKS'));
const engineForCode = src.slice(src.indexOf('function engineFor(steamID)'), src.indexOf("ipcMain.handle('engine:achievements'"));

(async () => {
  const handlers = {};
  const gates = [];
  const sent = [];
  const sentOther = [];
  let release = null;
  const ctx = {
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    engineReady: true, activeSteamID: '111', Date, console, String,
    // a second account, connected: a sale that names it goes to ITS engine
    accounts: new Map([['222', { ready: true, engine: { sellItem: (asset) => { sentOther.push(asset); return Promise.resolve({ success: true }); } } }]]),
    engine: { sellItem: (asset) => { sent.push(asset); return new Promise((r) => { if (asset === 'slow') release = () => r({ success: true }); else r({ success: true }); }); } },
    marketGate: (fn, gap) => { gates.push(gap); return fn(); },
    saleErrorType: () => 'general', addStat: () => {}, ct: (x) => x,
    inventorySources: require(path.resolve(__dirname, '..', '..', 'src', 'core', 'inventorySources.js')),
  };
  vm.createContext(ctx);
  vm.runInContext(engineForCode + '\n' + code, ctx);
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

  // a game's backpack: the sale carries the game and the context, and the same asset number in another game is another item
  const seen = [];
  ctx.engine.sellItem = (asset, cents, amount, appid, contextId) => { seen.push([asset, appid, contextId]); return Promise.resolve({ success: true }); };
  r = await sell({}, { assetId: 'b1', priceCents: 500, amount: 1 });
  check('without a game the sale is a Steam community item (753, 6)', r.ok && JSON.stringify(seen[0]) === '["b1",753,"6"]', JSON.stringify(seen[0]));
  r = await sell({}, { assetId: 'b1', priceCents: 500, amount: 1, appid: 730, contextId: '2' });
  check('the same asset number in Counter-Strike 2 is another item and goes out with its game', r.ok && JSON.stringify(seen[1]) === '["b1",730,"2"]', JSON.stringify(seen[1]));
  r = await sell({}, { assetId: 'b1', priceCents: 500, amount: 1, appid: 730, contextId: '2' });
  check('and the same one twice is still refused', !r.ok && r.typeName === 'skip' && seen.length === 2);
  r = await sell({}, { assetId: 'b2', priceCents: 500, amount: 1, appid: '730; DROP', contextId: '2' });
  check('a game that is not a plain number is refused before anything is sent', !r.ok && seen.length === 2);
  r = await sell({}, { assetId: 'b3', priceCents: 500, amount: 1, appid: 730, contextId: '../x' });
  check('a context that is not a plain number is refused too', !r.ok && seen.length === 2);

  ctx.engineReady = false;
  r = await sell({}, { assetId: 'a3', priceCents: 10, amount: 1 });
  check('without a connection nothing is sent', !r.ok && r.typeName === 'limit');
  r = await sell({}, { assetId: 'b9', priceCents: 10, amount: 1, steamID: '222' });
  check('a sale that names its account lists on that account, not on the one on screen', r.ok && sentOther.join() === 'b9' && !sent.includes('b9'), JSON.stringify(sentOther));
  ctx.engineReady = true;
  r = await sell({}, { assetId: 'b10', priceCents: 10, amount: 1, steamID: '999' });
  check('the account it started on is gone: nothing is listed, and NOT on the account on screen', !r.ok && !sent.includes('b10') && !sentOther.includes('b10'), JSON.stringify(r));
  process.exit(failures ? 1 : 0);
})();
