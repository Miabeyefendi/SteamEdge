// Moved out of main.js unchanged (the Steam Community Market: price and sale history caches, the single market queue, the request gate and
// their IPC handlers). Everything it needs from main.js arrives through `ctx`; the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { CACHE_DIR, ct, ipcMain, log, path, readJson, sendRaw, writeJson } = ctx;

  // ---- price cache + throttled fetcher ----
  // MEASURED: Steam serves 20 priceoverview requests then 429s; the window clears after ~30s.
  // So we fetch in batches of 18 (safety margin) with a 32s cooldown, and persist results to disk
  // so a full library scan only happens once (prices are re-checked after settings.priceRefreshHours).
  const PRICE_FILE = path.join(CACHE_DIR, 'prices.json');   // price cache
  // G8: realised sale history cache (the average/median comes from here).
  // Kept SEPARATE from the price: the pricehistory endpoint needs a separate request for every item and is much
  // more expensive. It is filled by the "Fetch prices" button, after the prices.
  const HISTORY_FILE = path.join(CACHE_DIR, 'history.json');
  const BATCH_SIZE = 18;
  const BATCH_COOLDOWN_MS = 32000;

  // Two separate caches, ONE queue (see "UNIFIED MARKET QUEUE"). The caches stay separate
  // because they go stale at different speeds: price 24 hours, the realised sale median 72 hours.
  let priceCache = new Map();   // hashName -> { price, ts }
  let historyCache = new Map();  // hashName -> { hist, ts, cur }
  const historyTries = new Map();
  const HISTORY_CACHE_VERSION = 1;

  function loadPriceCache() {
    const r = readJson(PRICE_FILE);
    priceCache = (r.ok && r.dataBlock && typeof r.dataBlock === 'object') ? new Map(Object.entries(r.dataBlock)) : new Map();
  }
  // NOTE: the price cache lives under CACHE_DIR; it used to be created by mistake in CONFIG_DIR.
  function savePriceCache() { writeJson(PRICE_FILE, Object.fromEntries(priceCache), false); }

  function loadHistoryCache() {
    const r = readJson(HISTORY_FILE);
    historyCache = (r.ok && r.dataBlock && typeof r.dataBlock === 'object') ? new Map(Object.entries(r.dataBlock)) : new Map();
  }
  function saveHistoryCache() { writeJson(HISTORY_FILE, Object.fromEntries(historyCache), false); }

  // History goes stale more slowly than price: the median of realised sales hardly moves
  // during the day. Still, if the currency changes (the account moves to a different region) it is dropped.
  function cachedHistory(h) {
    const e = historyCache.get(h);
    if (!e) return undefined;
    if (e.v !== HISTORY_CACHE_VERSION) return undefined;
    const cur = currentPriceCurrency();
    if (!cur || e.cur !== cur) return undefined;
    const ttl = (ctx.settings.historyRefreshHours || 72) * 60 * 60 * 1000;
    if (Date.now() - e.ts > ttl) return undefined;
    return e.hist;
  }

  // ================== UNIFIED MARKET QUEUE ==================
  // There used to be two separate queues: first the lowest price of ALL items was fetched, then starting over
  // the average of ALL items. Two problems:
  //   1. Two separate waiting rounds for the same item - the user saw an item's price and
  //      waited for the whole list to finish for its average.
  //   2. Both eat from the SAME Steam quota (measured: ~20 requests / 30 s, priceoverview and
  //      pricehistory shared). Two queues unaware of each other spent the quota in two places.
  // Now there is a single queue and it works PER ITEM: an item's lowest price and its average are fetched
  // in the same round, back to back, then it moves to the next item.
  let marketQueue = [];        // [{ h, priceValue, pastRecords }]
  let marketRunning = false;
  let marketCancel = false;
  // Steam answered 429: every request until this time would only make the wait longer (it was sent 3 times a second, so the limit never cleared and no price came).
  let marketBlockedUntil = 0;
  let marketStrikes = 0;
  async function marketSleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !marketCancel) await new Promise((r) => setTimeout(r, Math.min(1000, Math.max(1, end - Date.now()))));
  }

  function addToMarketQueue(h, priceNum, pastEntries) {
    const v = marketQueue.find((x) => x.h === h);
    if (v) { v.priceValue = v.priceValue || priceNum; v.pastRecords = v.pastRecords || pastEntries; return; }
    marketQueue.push({ h, priceValue: !!priceNum, pastRecords: !!pastEntries });
  }
  function isInMarketQueue(h, field) {
    const v = marketQueue.find((x) => x.h === h);
    return !!(v && v[field]);
  }

  // A single price fetch request. If there is a transient error it returns true (the item will be pushed to the end).
  async function fetchPrice(h) {
    const n = (priceTries.get(h) || 0) + 1;
    priceTries.set(h, n);
    let p = null;
    try { p = await marketGate(() => ctx.engine.getPrice(h)); } catch (_) { p = null; }
    // The request limit is not the item's fault: it does not count as a try and nothing is written to the cache, the queue waits and asks again
    if (p && p.rateLimited) { priceTries.set(h, n - 1); return { repeatFlag: true, limit: true }; }
    if (p && p.noCurrency && n < MAX_PRICE_TRIES) {
      log('warn', 'market currency not read yet, price postponed: ' + h);
      return { repeatFlag: true, limit: false };
    }
    if (p && p.noCurrency) {
      // Give up: null is written to the cache, the interface shows "-" and the queue advances.
      log('warn', `could not get the price (${n} attempts): ${h} - no currency`);
      p = null;
    }
    priceTries.delete(h);
    priceCache.set(h, { price: p, ts: Date.now(), cur: currentPriceCurrency(), v: PRICE_CACHE_VERSION });
    sendRaw('price:one', { hashName: h, price: p });
    return { repeatFlag: false, limit: false };
  }

  async function fetchHistory(h) {
    const n = (historyTries.get(h) || 0) + 1;
    historyTries.set(h, n);
    let hist = null;
    try { hist = await marketGate(() => ctx.engine.getPriceHistory(h)); } catch (_) { hist = null; }
    if (hist && hist.rateLimited) { historyTries.set(h, n - 1); return { repeatFlag: true, limit: true }; }
    historyTries.delete(h);
    historyCache.set(h, { hist, ts: Date.now(), cur: currentPriceCurrency(), v: HISTORY_CACHE_VERSION });
    sendRaw('history:one', { hashName: h, history: hist });
    return { repeatFlag: false, limit: false };
  }

  async function runMarketQueue() {
    if (marketRunning) return;
    marketRunning = true;
    marketCancel = false;
    const sumTotal = marketQueue.length;
    let doneItems = 0;
    // The quota is measured in REQUESTS, not items: an item can spend two requests.
    let requestCounter = 0;
    try {
      while (marketQueue.length) {
        if (marketCancel) { marketQueue.length = 0; break; }
        const is = marketQueue.shift();
        const h = is.h;
        let repeat = false;
        let rateHit = false;

        if (is.priceValue && cachedPrice(h) === undefined) {
          requestCounter++;
          const r = await fetchPrice(h);
          rateHit = rateHit || r.limit;
          repeat = r.repeatFlag;
        }
        // SAME ITEM, SAME ROUND: no waiting for the order to come round again for the average.
        if (!repeat && is.pastRecords && cachedHistory(h) === undefined) {
          requestCounter++;
          const r = await fetchHistory(h);
          rateHit = rateHit || r.limit;
          repeat = r.repeatFlag;
        }

        if (repeat) { marketQueue.push(is); }
        else doneItems++;

        const remaining = marketQueue.length;
        sendRaw('price:progress', { remaining: remaining, cooldown: remaining > 0 });
        sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: remaining, isWaiting: false });
        if (doneItems % 10 === 0) { savePriceCache(); saveHistoryCache(); }

        // Steam said 429: stop at once and wait, longer every time it happens again (1, 2, 4, then 5 minutes); the first answer that works starts over
        if (rateHit) {
          marketStrikes++;
          requestCounter = 0;
          const waitMs = Math.min(60000 * Math.pow(2, marketStrikes - 1), 300000);
          marketBlockedUntil = Date.now() + waitMs;
          log('warn', 'market: Steam request limit (429), waiting ' + Math.round(waitMs / 1000) + ' s');
          sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: remaining, isWaiting: true });
          await marketSleep(waitMs);
          marketBlockedUntil = 0;
          continue;
        }
        marketStrikes = 0;
        // The window is full: wait for the quota to reset.
        if (remaining && requestCounter >= BATCH_SIZE) {
          requestCounter = 0;
          sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: remaining, isWaiting: true });
          await marketSleep(BATCH_COOLDOWN_MS);
        }
      }
    } finally {
      marketRunning = false;
      marketBlockedUntil = 0; marketStrikes = 0;
      priceTries.clear();
      historyTries.clear();
      savePriceCache();
      saveHistoryCache();
      sendRaw('price:progress', { remaining: 0, cooldown: false });
      sendRaw('history:progress', { totalSum: sumTotal, doneOnes: doneItems, leftover: 0, isFinished: true, abandon: marketCancel });
      marketCancel = false;
    }
  }

  // cacheOnly=true: makes no request to Steam, returns the history on disk.
  ipcMain.handle('engine:historyFor', (_e, arg) => {
    const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
    const cacheOnly = !Array.isArray(arg) && !!(arg && arg.cacheOnly);
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    const out = {};
    const lacking = [];
    [...new Set(hashNames || [])].forEach((h) => {
      if (!h) return;
      const c = cachedHistory(h);
      if (c !== undefined) out[h] = c;
      else if (!isInMarketQueue(h, 'pastRecords')) lacking.push(h);
    });
    if (cacheOnly) return { ok: true, history: out, lacking: lacking.length, queueList: 0 };
    lacking.forEach((h) => addToMarketQueue(h, false, true));
    if (marketQueue.length) runMarketQueue();
    return { ok: true, history: out, lacking: lacking.length, queueList: marketQueue.length };
  });

  ipcMain.on('engine:historyCancel', () => {
    if (marketRunning) { marketCancel = true; log('info', 'market fetch cancelled'); }
    marketQueue.length = 0;
  });
  // A cache entry is stamped with the CURRENCY it was fetched in. If an old entry in a different currency
  // is used the amount looks completely wrong (e.g. if a TRY record is taken as USD a ~40x
  // deviation) - so if the currency does not match the entry is ignored and fetched again.
  // The ONLY source of the currency is the engine (the wallet event). null = not known yet → no price is fetched.
  function currentPriceCurrency() {
    return (ctx.engine && ctx.engine.currencyCode && ctx.engine.currencyCode()) || null;
  }
  // Cache format version. Entries before v2 may have had their AMOUNTS fetched in the wrong
  // currency even if the currency label is right (getPrice ignored the account's currency and always asked for TRY), so
  // they are all dropped once and fetched again in the right currency.
  const PRICE_CACHE_VERSION = 2;
  function cachedPrice(h) {
    const e = priceCache.get(h);
    if (!e) return undefined;
    if (e.v !== PRICE_CACHE_VERSION) return undefined;
    const cur = currentPriceCurrency();
    if (!cur || e.cur !== cur) return undefined;
    const ttl = (ctx.settings.priceRefreshHours || 24) * 60 * 60 * 1000;
    if (Date.now() - e.ts > ttl) return undefined;
    return e.price;
  }

  // ---- SINGLE MARKET GATE ----
  // Steam Community Market requests are limited to ~20 requests / 30 seconds per account. The price
  // queue, the sale history and the order book share the SAME limit; when they sent requests
  // unaware of each other all of them got 429 and "could not be fetched" boxes appeared. All market requests
  // pass through here in order and spaced out.
  // A step that may hang never holds the screen: after ms it gives up with an error.
  function withTimeout(promise, ms, message) {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
  }
  let marketChain = Promise.resolve();
  let lastMarketAt = 0;
  function marketGate(fn, minGap) {
    const run = async () => {
      const gap = Math.max(ctx.settings.apiRequestDelayMs || 350, minGap || 0);
      const wait = Math.max(0, lastMarketAt + gap - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastMarketAt = Date.now();
      return fn();
    };
    marketChain = marketChain.then(run, run);
    return marketChain;
  }

  const priceTries = new Map();     // hash -> how many times tried
  const MAX_PRICE_TRIES = 3;

  // Renderer sends every marketable hash it cares about; we answer instantly from cache and
  // queue whatever is missing for background fetching.
  // With cacheOnly=true NO request is made to Steam, only the cache on disk is read.
  // The inventory page uses this when it opens: if the cache is full there is no need to ask the user
  // "fetch prices now?", the prices come instantly anyway.
  //
  // THE AVERAGE IN THE SAME ROUND TOO: while an item's lowest price is fetched its average is also fetched
  // (Settings > "Fetch the average alongside the price"). If turned off the average only comes with the
  // "Average" button in Inventory - then a single request is made per item.
  ipcMain.handle('engine:pricesFor', (_e, arg) => {
    const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
    const cacheOnly = !Array.isArray(arg) && !!(arg && arg.cacheOnly);
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    const atAverage = ctx.settings.fetchAvgWithPrice !== false;
    const out = {};
    const missing = [];
    [...new Set(hashNames || [])].forEach((h) => {
      if (!h) return;
      const c = cachedPrice(h);
      if (c !== undefined) out[h] = c;
      else if (!isInMarketQueue(h, 'priceValue')) missing.push(h);
    });
    if (cacheOnly) return { ok: true, prices: out, queued: 0, lacking: missing.length };
    missing.forEach((h) => addToMarketQueue(h, true, atAverage && cachedHistory(h) === undefined));
    if (marketQueue.length) runMarketQueue();
    return { ok: true, prices: out, queued: marketQueue.length };
  });

  // On-demand: only for the item currently open in the detail panel (see rate-limit note in engine).
  ipcMain.handle('engine:priceHistory', async (_e, hashName) => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    if (Date.now() < marketBlockedUntil) return { ok: true, history: { rateLimited: true } };   // the queue is waiting out Steam's limit: no new request now
    // Passes through the same market gate - does not race the price queue (see marketGate)
    try { return { ok: true, history: await marketGate(() => ctx.engine.getPriceHistory(hashName)) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // Order book: listings on sale + buy orders. Since it counts toward the market request limit
  // it is called on request only for the single item the user selected.
  ipcMain.handle('engine:itemOrders', async (_e, hashName) => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    if (Date.now() < marketBlockedUntil) return { ok: true, orders: { rateLimited: true, error: ct('Steam istek sınırı aşıldı (429)') } };
    try { return { ok: true, orders: await marketGate(() => ctx.engine.getItemOrders(hashName)) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // Empties both caches in memory (the files are removed by the caller).
  function resetMarketCaches() { priceCache = new Map(); historyCache = new Map(); }

  return { HISTORY_FILE, PRICE_FILE, currentPriceCurrency, loadHistoryCache, loadPriceCache, marketGate, resetMarketCaches, withTimeout };
};
