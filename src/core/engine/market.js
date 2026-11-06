// Moved out of the SteamEngine class unchanged. The methods are added to its prototype in steamEngine.js.
const translation = require('../translation');
const inventorySources = require('../inventorySources');
module.exports = function engine_market({ SteamEngine }) {
  return {
    async getPrice(marketHashName) {
      // Prices are ALWAYS fetched in the account's wallet currency; the interface shows them in the same currency.
      // If the currency is unknown NO GUESS IS MADE - showing an amount fetched in the wrong currency with the right
      // currency's symbol meant silently inflating the numbers 40 times.
      const code = this.currencyCode();
      const cur = code && SteamEngine.CURRENCY[code];
      if (!cur) return { noCurrency: true };
      const item = inventorySources.splitMarketKey(marketHashName);
      const url = `https://steamcommunity.com/market/priceoverview/?appid=${item.appid}&currency=${cur}&l=english&market_hash_name=${encodeURIComponent(item.name)}`;
      const r = await this._fetch(url);
      if (r.status === 429) return { rateLimited: true };
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.success) return null;
      const toNum = SteamEngine.parseMoney;
      return {
        lowest: j.lowest_price || null,
        median: j.median_price || null,
        lowestValue: toNum(j.lowest_price),
        medianValue: toNum(j.median_price),
        volume: j.volume || null,
      };
    },

    // REALISED SALE HISTORY. An item's "real value" comes from here: listings on sale
    // are not binding (one person can list at 999,999 and nobody buys), whereas
    // pricehistory holds the REAL sales Steam recorded - each record is the median sale price
    // and quantity in that time slot. Amounts are in the account's wallet currency (the endpoint takes no currency
    // parameter, it replies according to the session).
    async getPriceHistory(marketHashName) {
      if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
      const item = inventorySources.splitMarketKey(marketHashName);
      const url = `https://steamcommunity.com/market/pricehistory/?appid=${item.appid}&l=english&market_hash_name=${encodeURIComponent(item.name)}`;
      const r = await this._fetch(url, { headers: { Cookie: this.cookieHeader() } });
      if (r.status === 429) return { rateLimited: true };
      if (!r.ok) return null;
      const j = await r.json().catch(() => null);
      if (!j || !j.success || !Array.isArray(j.prices) || !j.prices.length) return null;

      // Steam gives the date as "Jul 30 2026 01: +0" - we drop the trailing hour suffix and parse it.
      const parseTs = (s) => {
        const m = String(s).match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2})/);
        if (!m) return NaN;
        return Date.parse(`${m[1]} ${m[2]} ${m[3]} ${m[4]}:00:00 GMT`);
      };
      const points = j.prices.map(([date, price, qty]) => ({
        ts: parseTs(date), price: +price, qty: parseInt(qty, 10) || 0,
      })).filter((p) => Number.isFinite(p.price) && p.price > 0);
      if (!points.length) return null;

      // Quantity-WEIGHTED median: if 100 units sold at 0.30 and 1 unit at 50,
      // the real market is 0.30. A plain average swings with a single outlier sale, the median does not.
      const weightedMedian = (list) => {
        const arr = list.filter((p) => p.qty > 0).sort((a, b) => a.price - b.price);
        if (!arr.length) return null;
        const total = arr.reduce((s, p) => s + p.qty, 0);
        let acc = 0;
        for (const p of arr) { acc += p.qty; if (acc >= total / 2) return p.price; }
        return arr[arr.length - 1].price;
      };
      const windowStats = (days) => {
        const cut = Date.now() - days * 24 * 60 * 60 * 1000;
        const w = points.filter((p) => Number.isFinite(p.ts) && p.ts >= cut);
        if (!w.length) return null;
        const vol = w.reduce((s, p) => s + p.qty, 0);
        const sum = w.reduce((s, p) => s + p.price * p.qty, 0);
        return {
          days, volume: vol,
          median: weightedMedian(w),
          avg: vol ? sum / vol : null,
          min: Math.min(...w.map((p) => p.price)),
          max: Math.max(...w.map((p) => p.price)),
          samples: w.length,
        };
      };
      const last = points[points.length - 1];
      const allVol = points.reduce((s, p) => s + p.qty, 0);
      // if there is no 30 days use 90, if not that then all time - so even items that trade rarely get a value
      const stats = windowStats(30) || windowStats(90) || {
        days: 0, volume: allVol, median: weightedMedian(points),
        avg: allVol ? points.reduce((s, p) => s + p.price * p.qty, 0) / allVol : null,
        min: Math.min(...points.map((p) => p.price)),
        max: Math.max(...points.map((p) => p.price)),
        samples: points.length,
      };
      return {
        last: last.price, lastDate: last.ts || null, lastQty: last.qty,
        totalVolume: allVol,
        stats,                                   // the value derived from the real sales
        recent: points.slice(-12).map((p) => ({ price: p.price, qty: p.qty, ts: p.ts })),
        series: points.slice(-180).map((p) => [p.ts, p.price, p.qty]),   // for the small chart
      };
    },

    // ================== ORDER BOOK ==================
    // In 2026 Steam moved the market listing page to a new SSR interface. The old way
    // (`Market_LoadOrderSpread(item_nameid)` + the `itemordershistogram` endpoint) IS GONE:
    // that script block is not on the page and `/render/?format=json` returns HTML. Instead,
    // the new page prints the order book straight into the HTML:
    //
    //   "4 for sale starting at $22.57"      + <table> Price/Quantity rows
    //   "6 requests to buy at $0.04 or lower" + <table> Price/Quantity rows
    //
    // Quantities are NOT cumulative, they are the real count per price. The CSS class names are scrambled
    // (like APEAY0rnAbo-) and change on every deploy, so we parse by STRUCTURE, not by class:
    // find the tables and classify each table as "sell" or "buy" by the summary sentence before it.
    // The page does not need a login but if a cookie is present
    // the amounts come in the account's own currency.
    async getItemOrders(marketHashName) {
      const code = this.currencyCode();
      if (!code) return { noCurrency: true };
      const item = inventorySources.splitMarketKey(marketHashName);
      const url = `https://steamcommunity.com/market/listings/${item.appid}/${encodeURIComponent(item.name)}?l=english`;
      const r = await this._fetch(url, {
        headers: {
          Cookie: this.cookieHeader(),
          // The language is pinned so that the summary sentences can be caught in English; without a browser-like
          // User-Agent Steam can return the page in a different form.
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': SteamEngine.UA,
        },
      });
      if (r.status === 429) return { rateLimited: true, error: translation.t('Steam istek sınırı aşıldı (429)') };
      if (!r.ok) return { error: translation.tf('pazar sayfası HTTP # döndürdü', r.status) };
      const html = await r.text();

      const strip = (x) => String(x).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
      if (!tables.length) {
        // If there is no table there are three possibilities, and we can tell which one it is:
        //   - if the page title is the generic "Market Item" there is no such market item (the name may have changed)
        //   - if it says "no listings" the item exists but nothing is on sale
        //   - anything else means the page structure differs from what was expected (Steam may have changed it again)
        const flat = strip(html);
        const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        if (/^\s*Market Item\b/i.test(title)) {
          return { error: 'bu öğe Steam pazarında bulunamadı (pazar adı değişmiş olabilir)' };
        }
        if (/no listings|there are no listings/i.test(flat)) {
          return { error: 'bu öğe şu an satışta değil (hiç ilan yok)' };
        }
        return { error: 'pazar sayfası beklenen biçimde değil (Steam sayfayı değiştirmiş olabilir)' };
      }
      const parseRows = (body) => [...body.matchAll(
        /<tr>\s*<td[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<td[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g)]
        .map((m) => ({
          raw: m[1].trim(),
          price: SteamEngine.parseMoney(m[1]),
          qty: parseInt(String(m[2]).replace(/[^\d]/g, ''), 10) || 0,
        }))
        .filter((x) => x.price != null && x.price > 0);

      let sell = [], buy = [], sellCount = 0, buyCount = 0, sampleRaw = null;
      for (const t of tables) {
        const earlier = strip(html.slice(Math.max(0, t.index - 600), t.index));
        const rows = parseRows(t[1]);
        if (!rows.length) continue;
        if (!sampleRaw) sampleRaw = rows[0].raw;
        const saleSummary = earlier.match(/([\d,.]+)\s+for sale/i);
        const purchaseSummary  = earlier.match(/([\d,.]+)\s+requests? to buy|([\d,.]+)\s+buy orders?/i);
        const countUp = (m) => (m ? parseInt(String(m[1] || m[2]).replace(/[^\d]/g, ''), 10) || 0 : 0);
        if (saleSummary) { sell = rows; sellCount = countUp(saleSummary) || rows.reduce((s, x) => s + x.qty, 0); }
        else if (purchaseSummary) { buy = rows; buyCount = countUp(purchaseSummary) || rows.reduce((s, x) => s + x.qty, 0); }
        else if (!sell.length) { sell = rows; sellCount = rows.reduce((s, x) => s + x.qty, 0); }
        else if (!buy.length) { buy = rows; buyCount = rows.reduce((s, x) => s + x.qty, 0); }
      }
      if (!sell.length && !buy.length) return { error: 'sipariş defteri satırları okunamadı' };

      // CURRENCY CHECK. The page picks the currency by session; if it came in a currency different from
      // what we expected we say so openly instead of showing the number with the wrong symbol (a mismatch of exactly
      // this kind once inflated the amounts 40 times).
      const expected = SteamEngine.SYMBOL[code];
      if (sampleRaw && expected && !String(sampleRaw).includes(expected)) {
        return { error: translation.tf('pazar sayfası # dışında bir para biriminde geldi', code) + ' (' + sampleRaw + ')' };
      }
      return {
        sell, buy, sellCount, buyCount,
        lowestSell: sell.length ? Math.min(...sell.map((x) => x.price)) : null,
        highestBuy: buy.length ? Math.max(...buy.map((x) => x.price)) : null,
        currency: code,
      };
    },

    // Lists an item on the Community Market. `priceCents` is what the SELLER receives (Steam adds
    // its fee on top for the buyer). If the account has a mobile authenticator, Steam still requires
    // the user to approve each listing in the Steam app - we do not auto-confirm.
    async sellItem(assetId, priceCents, amount = 1, appid = inventorySources.COMMUNITY.appid, contextId = inventorySources.COMMUNITY.contextId) {
      if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
      const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
      if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
      const sessionid = sidCookie.split('=')[1];
      const body = new URLSearchParams({
        sessionid, appid: String(+appid || inventorySources.COMMUNITY.appid), contextid: String(contextId || inventorySources.COMMUNITY.contextId),
        assetid: String(assetId), amount: String(amount), price: String(Math.round(priceCents)),
      });
      const r = await this._fetch('https://steamcommunity.com/market/sellitem/', {
        method: 'POST',
        headers: {
          Cookie: this.cookieHeader(),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: `https://steamcommunity.com/profiles/${this.steamID}/inventory`,
          Origin: 'https://steamcommunity.com',
        },
        body,
      });
      const j = await r.json().catch(() => null);
      // The error detail is kept: the main process looks at Steam's message and the HTTP status and sorts it as "limit"
      // (stop), "skip" (this item cannot be listed, move on to the next) or a general error.
      if (!j) {
        const e = new Error(translation.tf('Pazar yanıtı okunamadı (HTTP #)', r.status));
        e.httpStatus = r.status;
        throw e;
      }
      if (!j.success) {
        const e = new Error(SteamEngine.steamMessage(j.message, 'Listeleme reddedildi'));
        e.steamMessage = String(j.message || '');
        e.httpStatus = r.status;
        throw e;
      }
      return j; // { success, requires_confirmation, needs_mobile_confirmation, needs_email_confirmation, email_domain }
    },

    // ---- ACTIVE MARKET LISTINGS ----
    // `norender=1` makes Steam answer with structured JSON instead of the HTML fragment. The shape is read
    // defensively: `listings` can be an array or an object keyed by listing id, and the descriptions of the
    // items live in `assets[appid][contextid][assetid]`.
    async getMyListings() {
      if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
      const asList = (x) => (Array.isArray(x) ? x : Object.values(x || {}));
      const out = { listings: [], toConfirm: [], onHold: [], buyOrders: 0 };
      const seen = new Set();
      const PAGE = 100;
      for (let start = 0, guard = 0; guard < 30; guard++, start += PAGE) {
        const r = await this._requestItem(`https://steamcommunity.com/market/mylistings/?norender=1&count=${PAGE}&start=${start}`, {}, 'Pazar ilanları');
        const j = await r.json().catch(() => null);
        if (!j || !j.success) throw new Error(translation.t('Pazar yanıtı beklenen biçimde değil'));
        const assets = j.assets || {};
        const describe = (l) => {
          const a = l.asset || {};
          const d = (assets[a.appid] && assets[a.appid][a.contextid] && assets[a.appid][a.contextid][a.id]) || a;
          const seller = +l.price || 0;
          return {
            listingId: String(l.listingid),
            name: d.name || d.market_hash_name || ('#' + (a.id || l.listingid)),
            marketHashName: d.market_hash_name || null,
            iconUrl: d.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${d.icon_url}/96fx96f` : null,
            appid: +a.appid || 0,
            assetId: a.id != null ? String(a.id) : null,
            sellerCents: seller,
            buyerCents: seller + (+l.fee || 0),
            created: (+l.time_created || 0) * 1000,
          };
        };
        const page = asList(j.listings);
        page.forEach((l) => { if (l && l.listingid && !seen.has(String(l.listingid))) { seen.add(String(l.listingid)); out.listings.push(describe(l)); } });
        if (start === 0) {
          asList(j.listings_to_confirm).forEach((l) => { if (l && l.listingid) out.toConfirm.push(describe(l)); });
          asList(j.listings_on_hold).forEach((l) => { if (l && l.listingid) out.onHold.push(describe(l)); });
          out.buyOrders = asList(j.buy_orders).length;
        }
        const total = +j.total_count || 0;
        if (page.length < PAGE || start + PAGE >= total) break;
      }
      return out;
    },

    // Takes one of our own listings off the market (the item returns to the inventory).
    async removeListing(listingId) {
      if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
      if (!/^\d+$/.test(String(listingId))) throw new Error(translation.t('Geçersiz ilan numarası'));
      const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
      if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
      const r = await this._fetch(`https://steamcommunity.com/market/removelisting/${listingId}`, {
        method: 'POST',
        headers: {
          Cookie: this.cookieHeader(),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: 'https://steamcommunity.com/market/',
          Origin: 'https://steamcommunity.com',
          'User-Agent': SteamEngine.UA,
        },
        body: new URLSearchParams({ sessionid: sidCookie.split('=')[1] }),
      });
      if (r.status === 429) { const e = new Error(translation.t('Steam istek sınırı aşıldı (429)')); e.rateLimited = true; throw e; }
      if (!r.ok) throw new Error(translation.tf('Pazar yanıtı okunamadı (HTTP #)', r.status));
      return { ok: true };
    },

    // ---- PRODUCT KEYS ----
    // Returns { ok, detail, packages } for every answer Steam gives, including the refusals (they carry the
    // reason in `detail`). Only a missing answer (timeout, no connection) is thrown so that the caller
    // keeps the key in its queue instead of marking it as used up.
    // Asks Steam for the free license of an app (a free-on-demand game: the "Add to account" button of its store page).
    // Resolves { ok, granted, packages } or, when Steam refuses, { ok: false, detail: EResult }. `granted` is false when
    // Steam answered without granting anything: the account owns it already or the app is not free.
  };
};
