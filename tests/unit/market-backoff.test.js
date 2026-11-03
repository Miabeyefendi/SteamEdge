// Steam answers 429 to the price queue: it must stop and wait longer each time (1, 2, 4 minutes), never write a "no price" into the cache for it,
// and carry on with the same item once Steam answers. It used to retry three times a second, which kept the limit from ever clearing.
// Run with `npm test` (tests/run.js).
const vm = require('vm');
const src = require('../main-source')();
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('let marketQueue = [];'), src.indexOf('// cacheOnly=true: makes no request to Steam'));

(async () => {
  let clock = 1000000000000;
  const calls = [];
  const events = [];
  let answers = [{ rateLimited: true }, { rateLimited: true }, { rateLimited: true }, { lowest: '$1.00' }];
  const cache = new Map();
  const ctx = {
    console, Math, Date: class { static now() { return clock; } },
    setTimeout: (fn, ms) => { clock += ms; setImmediate(fn); return 0; },
    priceTries: new Map(), historyTries: new Map(), MAX_PRICE_TRIES: 3, BATCH_SIZE: 18, BATCH_COOLDOWN_MS: 32000,
    PRICE_CACHE_VERSION: 2, HISTORY_CACHE_VERSION: 1,
    priceCache: cache, historyCache: new Map(),
    cachedPrice: (h) => (cache.has(h) ? cache.get(h).price : undefined), cachedHistory: () => undefined,
    savePriceCache: () => {}, saveHistoryCache: () => {}, currentPriceCurrency: () => 'USD',
    marketGate: (fn) => fn(), log: () => {}, sendRaw: (name, data) => events.push([name, data]),
    engine: { getPrice: () => { calls.push(clock); return Promise.resolve(answers.shift()); } },
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.addToMarketQueue = addToMarketQueue; this.runMarketQueue = runMarketQueue; this.state = () => ({ q: marketQueue.length, strikes: marketStrikes, blocked: marketBlockedUntil });', ctx);
  ctx.addToMarketQueue('753-Tomato', true, false);
  await ctx.runMarketQueue();
  check('four requests: three 429 and then the answer', calls.length === 4, String(calls.length));
  const gaps = calls.slice(1).map((t, i) => t - calls[i]);
  check('the waits between them grow: 1, 2 and 4 minutes', gaps[0] >= 60000 && gaps[1] >= 120000 && gaps[2] >= 240000, gaps.join());
  check('the item got its price in the end (nothing was cached as "no price" on the way)', cache.get('753-Tomato') && cache.get('753-Tomato').price && cache.get('753-Tomato').price.lowest === '$1.00');
  check('the queue is empty and the wait state is reset', ctx.state().q === 0 && ctx.state().strikes === 0 && ctx.state().blocked === 0, JSON.stringify(ctx.state()));
  process.exit(failures ? 1 : 0);
})();
