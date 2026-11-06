// Moved out of main.js unchanged (the lists kept per account, the library and inventory calls, achievements, the profile, the sale and the market listings).
// Everything it needs from main.js arrives through `ctx`; the names other parts still use are returned at the end.

module.exports = function init(ctx) {
  const { accounts, app, ct, dialog, fs, inventorySources, ipcMain, log, os, path, steamFee, toCsv } = ctx;

  // The last fetched lists are kept in the account's own file. The purpose: at startup the Overview should not
  // wait empty. The badge page and the library call take a few seconds; during
  // that time "Total cards" and "Library" showed a dash. Now the last known values are
  // drawn instantly and overwritten when the fresh data comes.
  function storeLists(field, payloadData, steamID) {
    const id = steamID || ctx.activeSteamID;
    const v = ctx.accountData(id);
    v.lists = { ...(v.lists || {}), [field]: payloadData, [field + 'Ts']: Date.now() };
    ctx.writeAccountDataDelayed(id);
  }
  ipcMain.handle('engine:lastLists', () => {
    const v = ctx.activeAccountData();
    return { ok: true, ...(v.lists || {}) };
  });

  // Games of an account that can still be refunded: bought within REFUND_DAYS and played under REFUND_MAX_MIN. Cached for ten
  // minutes per account. When Steam does not answer the answer is "none", so the farm is not held back by a failed lookup.
  const REFUND_DAYS = 14, REFUND_MAX_MIN = 120, REFUND_CACHE_MS = 10 * 60000;
  const refundCache = new Map();   // steamID -> { at, ids: Set }
  async function refundableAppIds(steamID, playtimes) {
    const s = accounts.get(steamID);
    if (!s || !s.engine || !s.ready) return new Set();
    let hit = refundCache.get(steamID);
    if (!hit || Date.now() - hit.at > REFUND_CACHE_MS) {
      try { hit = { at: Date.now(), ids: await s.engine.getRecentAppIds(REFUND_DAYS) }; }
      catch (e) { log('warn', '[' + ctx.accountName(steamID) + '] recent purchases could not be read: ' + (e && e.message)); hit = { at: Date.now() - REFUND_CACHE_MS + 60000, ids: new Set() }; }
      refundCache.set(steamID, hit);
    }
    return new Set([...hit.ids].filter((id) => (playtimes.get(id) || 0) < REFUND_MAX_MIN));
  }
  ipcMain.handle('engine:dropGames', async () => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    try {
      const games = await ctx.engine.getDropGames();
      // The badge page does not give the playtime; but fast mode needs it for the "2 hour" rule
      // (Steam only starts dropping cards once a game passes 2 hours). We merge the time from the owned game
      // list. If it cannot be obtained the games count as having no time (0 min).
      let mins = new Map();
      try {
        const owned = await ctx.engine.getOwnedGames();
        owned.forEach((o) => mins.set(o.appid, o.playtimeForever || 0));
      } catch (e) { log('warn', 'could not get the playtime: ' + e.message); }
      const output = games.map((g) => ({ ...g, playtimeMin: mins.get(g.appid) || 0 }));
      storeLists('drop', output);
      const refundIds = ctx.settingFor(ctx.activeSteamID, 'farmSkipRecent') ? [...await refundableAppIds(ctx.activeSteamID, mins)] : [];
      return { ok: true, games: output, refundIds };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // "Export CSV" on the Inventory page: the page sends the rows it shows, this writes them where the user chooses.
  ipcMain.handle('inventory:exportCsv', async (_e, rows) => {
    if (!Array.isArray(rows) || !rows.length || rows.length > 200000 || !rows.every((r) => Array.isArray(r) && r.length < 40)) return { ok: false, error: 'Dışa aktarılacak satır yok.' };
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(ctx.win, {
      title: ct('Envanteri CSV olarak kaydet'),
      defaultPath: path.join(app.getPath('documents'), 'steamedge-inventory-' + stamp + '.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      // the BOM makes Excel read the text as UTF-8
      fs.writeFileSync(r.filePath, '\ufeff' + toCsv(rows), 'utf8');
      log('info', 'inventory exported: ' + rows.length + ' rows');
      return { ok: true, file: r.filePath, count: rows.length - 1 };
    } catch (e) { return { ok: false, error: (e && e.message) || 'Dosya yazılamadı.' }; }
  });

  // arg (optional): { appid, contextId, appName } - the backpack of a game instead of the Steam community inventory.
  // `incomplete` says a later page of a big inventory was refused: the items are only a part of it.
  ipcMain.handle('engine:inventory', async (_e, arg) => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    const source = inventorySources.validSource(arg);
    if (!source) return { ok: false, error: ct('Geçersiz envanter.') };
    try {
      const items = await ctx.engine.getInventory(source.appid, source.contextId, (arg && arg.appName) ? String(arg.appName).slice(0, 80) : null);
      return { ok: true, items, incomplete: !!items.incomplete };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  // The games the account has items in (the source list of the Inventory page). Steam's inventory page is read once in ten minutes.
  let inventorySourcesCache = null;
  ipcMain.handle('engine:inventorySources', async () => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    const who = ctx.activeSteamID;
    if (inventorySourcesCache && inventorySourcesCache.steamID === who && Date.now() - inventorySourcesCache.ts < 10 * 60 * 1000) return inventorySourcesCache.value;
    try {
      const got = await ctx.marketGate(() => ctx.engine.getInventorySources());
      const value = { ok: true, found: got.found, list: got.list };
      inventorySourcesCache = { steamID: who, ts: Date.now(), value };
      return value;
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // The engine of the account a request names (a bulk operation keeps the account it started on), or of the account on screen.
  // A named account that is not connected (or was removed) gives no engine: the request must not fall through to another account.
  function engineFor(steamID) {
    if (steamID) { const s = accounts.get(String(steamID)); return s && s.ready && s.engine ? s.engine : null; }
    return ctx.engineReady && ctx.engine ? ctx.engine : null;
  }
  ipcMain.handle('engine:achievements', async (_e, arg) => {
    const appid = (arg && typeof arg === 'object') ? arg.appid : arg;
    const isFresh = !!(arg && typeof arg === 'object' && arg.freshFlag);
    const eng = engineFor(arg && typeof arg === 'object' ? arg.steamID : null);
    if (!eng) return { ok: false, error: 'Bağlı değil.' };
    // freshFlag: throw away the schema/value cache, read again from Steam. The verification after a bulk
    // operation uses this; reading from the cache would give back our own guess.
    if (isFresh) { try { eng.invalidateStats(appid); } catch (_) {} }
    try { return { ok: true, data: await eng.getAchievements(appid) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // Own Steam profile (avatar/name/level) via protocol.
  ipcMain.handle('engine:profile', async () => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    try {
      const profileData = await ctx.engine.getProfile();
      // Write the last known profile to the account's own file. So that at the next startup the interface can show
      // the name, avatar and level without waiting for the Steam session to be established: logging
      // on takes seconds and during that time a dash sat on the screen.
      const v = ctx.activeAccountData();
      v.profileInfo = { ...(v.profileInfo || {}), ...profileData, ts: Date.now() };
      ctx.writeAccountData(ctx.activeSteamID);
      return { ok: true, profile: v.profileInfo };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  // Custom profile address (steamcommunity.com/id/<name>). Separate from the profile call: it is not in the
  // protocol, it is read from the web page and nobody should hold the name/avatar waiting for it.
  ipcMain.handle('engine:vanity', async () => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    try {
      const vanity = await ctx.engine.getVanityURL();
      const v = ctx.activeAccountData();
      v.profileInfo = { ...(v.profileInfo || {}), vanity };
      ctx.writeAccountData(ctx.activeSteamID);
      return { ok: true, vanity };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('engine:setAchievements', async (_e, { appid, changes, steamID }) => {
    const eng = engineFor(steamID);
    // notConnected / refused: a bulk run waits for the connection and sends a write again that got no answer, but not one that Steam refused
    if (!eng) return { ok: false, error: 'Bağlı değil.', notConnected: true };
    try { return { ok: true, result: await eng.setAchievements(appid, changes) }; }
    catch (e) { return { ok: false, error: e.message, refused: !!(e && (e.protectedFlag || /EResult/.test(String(e.message || '')))), notConnected: !eng.isConnected }; }
  });

  // ---- SALE ----
  // Steam's fee calculation (see src/services/steamFee.js). toplamlar: the amounts the buyer pays,
  // in cents. Returns: for each, the amount that will go to Steam and the real price at which the listing
  // will appear on the market.
  // What the machine has, for Settings > Modules > "Set up for this computer"
  ipcMain.handle('app:hardware', () => {
    let gpu = 'unknown';
    try { gpu = (app.getGPUFeatureStatus() || {}).gpu_compositing || 'unknown'; } catch (_) {}
    return { cores: os.cpus().length || 0, memGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)), gpuCompositing: gpu };
  });

  ipcMain.handle('engine:saleFee', async (_e, totals) => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    let wallet = null;
    try {
      // Through the market gate, so it does not race the price queue, and with a limit so a slow Steam cannot hold the sale screen.
      wallet = await ctx.withTimeout(ctx.marketGate(() => ctx.engine.walletInfo()), 25000, 'zaman aşımı');
    } catch (e) {
      log('warn', 'could not read the wallet fee fields: ' + (e && e.message));
      return { ok: false, error: ct('Steam ücret hesabı yüklenemedi:') + ' ' + ct((e && e.message) || '') };
    }
    // The fee fields also go to the page: with them it can work the amounts out at once while Steam's own script is not answering.
    const fee = {
      pct: parseFloat(wallet.wallet_fee_percent != null ? wallet.wallet_fee_percent : 0.05),
      pubPct: parseFloat(wallet.wallet_publisher_fee_percent_default != null ? wallet.wallet_publisher_fee_percent_default : 0.10),
      min: parseInt(wallet.wallet_fee_minimum != null ? wallet.wallet_fee_minimum : 1, 10),
      base: parseInt(wallet.wallet_fee_base != null ? wallet.wallet_fee_base : 0, 10),
    };
    try {
      const outcome = await ctx.withTimeout(steamFee().compute(wallet, Array.isArray(totals) ? totals.slice(0, 5000) : []), 25000, 'zaman aşımı');
      return { ok: true, outcomeData: outcome, rate: ctx.engine.currencyCode(), fee };
    } catch (e) {
      log('warn', 'could not calculate the sale fee: ' + (e && e.message));
      return { ok: false, error: ct('Steam ücret hesabı yüklenemedi:') + ' ' + ct((e && e.message) || ''), fee };
    }
  });

  // What Steam's listing error means. ACCOUNT TRUSTWORTHINESS decides Steam's listing limit:
  // a new account can be stopped after 10-15 listings, an old account can list 80+ at
  // once. Continuing after hitting the limit only piles up errors;
  // the safest way is to stop and tell the user.
  //   limit  : Steam stopped listing (too many listings awaiting confirmation, too many requests, wallet cap)
  //   skip   : this item cannot be listed (it already has a listing awaiting confirmation, not in the inventory); move on to the next
  //   general: reason unclear; if it happens twice in a row it is treated like a limit
  function saleErrorType(e) {
    const m = String((e && (e.steamMessage || e.message)) || '');
    const http = e && e.httpStatus;
    if (/already have a listing|no longer in your inventory|not allowed to be traded|specified item/i.test(m)) return 'skip';
    if (http === 429 || http === 503 || http === 502
        || /too many|pending confirmation|previous action|wallet|maximum|exceed|rate limit|try again later/i.test(m)) return 'limit';
    return 'general';
  }
  // Listing is the most sensitive request an account makes. Every listing goes through the market gate (one at a time, with the
  // price queue, at least SELL_GAP_MS apart), and an asset that is being listed or was listed a moment ago is not sent again:
  // pressing Sell twice, or two screens asking for the same item, cannot send the same request twice.
  const SELL_GAP_MS = 1500;
  const SELL_REPEAT_MS = 10 * 60 * 1000;
  const sellInFlight = new Set();
  const sellDone = new Map();
  // appid and contextId say where the item lives (a game's backpack); without them it is a Steam community item (753, 6).
  ipcMain.handle('engine:sellItem', async (_e, { assetId, priceCents, amount, appid, contextId, steamID: owner }) => {
    // the account the sale started on: a batch that waited minutes must not list on the account that is on screen now
    const eng = engineFor(owner);
    if (!eng) return { ok: false, error: 'Bağlı değil.', typeName: 'limit' };
    const source = inventorySources.validSource(appid == null ? null : { appid, contextId });
    if (!source) return { ok: false, error: ct('Geçersiz envanter.'), typeName: 'skip' };
    const steamID = owner && accounts.has(String(owner)) ? String(owner) : ctx.activeSteamID;
    const key = steamID + ':' + (source.appid === inventorySources.COMMUNITY.appid ? '' : source.appid + ':') + String(assetId);
    const earlier = sellDone.get(key);
    if (sellInFlight.has(key) || (earlier && Date.now() - earlier < SELL_REPEAT_MS)) {
      return { ok: false, error: ct('Bu öğe için istek zaten gönderildi.'), typeName: 'skip' };
    }
    sellInFlight.add(key);
    try {
      const result = await ctx.marketGate(() => eng.sellItem(assetId, priceCents, amount || 1, source.appid, source.contextId), SELL_GAP_MS);
      sellDone.set(key, Date.now());
      // The statistic is the number of items "put on sale": a listing was made, whether it sold is not known. The amount is
      // what the seller will keep (Steam's cut deducted); "Average sale" is computed from it.
      const count = amount || 1;
      ctx.addStat(steamID, { cardsSold: count, saleAmount: (+priceCents || 0) * count, pricedForSale: count });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'Listeleme reddedildi', typeName: saleErrorType(e), http: (e && e.httpStatus) || null };
    } finally {
      sellInFlight.delete(key);
    }
  });

  // ================== MY LISTINGS, BOOSTER PACKS ==================
  // Both go through the market gate so they never race the price queue.
  ipcMain.handle('market:myListings', async () => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    try { return { ok: true, data: await ctx.marketGate(() => ctx.engine.getMyListings()) }; }
    catch (e) { return { ok: false, error: (e && e.message) || 'Pazar ilanları alınamadı.' }; }
  });
  ipcMain.handle('market:removeListing', async (_e, arg) => {
    // { listingId, steamID }: the account the listings were read from (the old form, a bare id, means the account on screen)
    const listingId = arg && typeof arg === 'object' ? arg.listingId : arg;
    const eng = engineFor(arg && typeof arg === 'object' ? arg.steamID : null);
    if (!eng) return { ok: false, error: 'Bağlı değil.' };
    try { await ctx.marketGate(() => eng.removeListing(listingId)); log('info', 'market listing removed: ' + listingId); return { ok: true }; }
    catch (e) { return { ok: false, error: (e && e.message) || 'İlan iptal edilemedi.', rateLimited: !!(e && e.rateLimited) }; }
  });
  ipcMain.handle('engine:unpackBooster', async (_e, { assetId, appid }) => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    try { return await ctx.marketGate(() => ctx.engine.unpackBooster(assetId, appid)); }
    catch (e) { return { ok: false, error: (e && e.message) || 'Booster paketi açılamadı' }; }
  });

  return { refundableAppIds, storeLists };
};
