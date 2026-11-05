// The market code lives in src/backend/market.js (moved out of main.js). This loads the real module with a stand-in `ctx` and runs it:
// the channels it registers, the price flow through the queue and the cache, the gate spacing, and the cache reset that settingsipc/backup call.
// Run with `npm test` (tests/run.js).
const path = require('path');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const handlers = new Map();
const listeners = new Map();
const sent = [];
const files = new Map();
const state = { settings: { apiRequestDelayMs: 1, priceRefreshHours: 24, historyRefreshHours: 72, fetchAvgWithPrice: false }, engineReady: true };
const calls = [];
state.engine = {
  currencyCode: () => 'USD',
  getPrice: async (h) => { calls.push(h); return { lowest: '1.00', median: '1.10' }; },
  getPriceHistory: async () => ({ points: [] }),
  getItemOrders: async () => ({ orders: [] }),
};

const ctx = {
  CACHE_DIR: path.join('X:', 'cache'),
  ct: (t) => t,
  ipcMain: { handle: (n, f) => handlers.set(n, f), on: (n, f) => listeners.set(n, f) },
  log: () => {},
  path,
  readJson: (f) => (files.has(f.file || String(f)) ? { ok: true, dataBlock: files.get(f.file || String(f)) } : { ok: false }),
  writeJson: (f, data) => { files.set(f.file || String(f), data); return true; },
  sendRaw: (channel, data) => sent.push([channel, data]),
  get engine() { return state.engine; },
  get engineReady() { return state.engineReady; },
  get settings() { return state.settings; },
};

const m = require('../../src/backend/market')(ctx);

(async () => {
  check('the module gives back what main.js, settingsipc, backup and schedule use',
    ['HISTORY_FILE', 'PRICE_FILE', 'currentPriceCurrency', 'loadHistoryCache', 'loadPriceCache', 'marketGate', 'resetMarketCaches', 'withTimeout'].every((k) => m[k] !== undefined));
  check('it registers the five market channels',
    ['engine:historyFor', 'engine:pricesFor', 'engine:priceHistory', 'engine:itemOrders'].every((c) => handlers.has(c)) && listeners.has('engine:historyCancel'));
  check('the currency comes from the engine', m.currentPriceCurrency() === 'USD');

  // price flow: nothing cached -> queued -> fetched -> cached -> answered from cache
  m.loadPriceCache(); m.loadHistoryCache();
  const first = await handlers.get('engine:pricesFor')({}, ['ITEM A']);
  // queued is the length AFTER the queue took its first item (runMarketQueue starts synchronously), exactly as before the move
  check('a missing price is not answered from the cache and goes to the queue', first.ok && first.queued === 0 && Object.keys(first.prices).length === 0, JSON.stringify(first));
  for (let i = 0; i < 100 && !sent.some((s) => s[0] === 'price:one'); i++) await new Promise((r) => setTimeout(r, 20));
  check('the queue fetches it and tells the window', sent.some((s) => s[0] === 'price:one' && s[1].hashName === 'ITEM A') && calls.length === 1);
  for (let i = 0; i < 100 && !sent.some((s) => s[0] === 'price:progress' && s[1].remaining === 0 && s[1].cooldown === false && sent.filter((x) => x[0] === 'history:progress' && x[1].isFinished).length); i++) await new Promise((r) => setTimeout(r, 20));
  const again = await handlers.get('engine:pricesFor')({}, { hashNames: ['ITEM A'], cacheOnly: true });
  check('the second ask is answered from the cache without a request', again.ok && again.prices['ITEM A'] !== undefined && calls.length === 1, JSON.stringify(again));

  // not connected
  state.engineReady = false;
  const off = await handlers.get('engine:pricesFor')({}, ['ITEM B']);
  check('without a connection it says so and asks nothing', off.ok === false && calls.length === 1);
  state.engineReady = true;

  // the gate keeps requests apart
  const stamps = [];
  await Promise.all([1, 2, 3].map(() => m.marketGate(async () => { stamps.push(Date.now()); }, 30)));
  check('the gate spaces requests by at least the gap', stamps[1] - stamps[0] >= 25 && stamps[2] - stamps[1] >= 25, stamps.join(','));

  // withTimeout gives up
  let timedOut = false;
  try { await m.withTimeout(new Promise(() => {}), 20, 'late'); } catch (e) { timedOut = e.message === 'late'; }
  check('withTimeout rejects a step that hangs', timedOut);

  // the cache reset used by settings and backup
  m.resetMarketCaches();
  const cleared = await handlers.get('engine:pricesFor')({}, { hashNames: ['ITEM A'], cacheOnly: true });
  check('resetMarketCaches empties the price cache', cleared.ok && cleared.prices['ITEM A'] === undefined && cleared.lacking === 1, JSON.stringify(cleared));

  // an order book asked while the queue waits out a 429 does not go out (blocked flag is internal; here only the open path)
  const orders = await handlers.get('engine:itemOrders')({}, 'ITEM A');
  check('the order book is served when nothing blocks it', orders.ok === true);

  process.exit(failures ? 1 : 0);
})();
