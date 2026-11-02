// Moved out of main.js unchanged (keys). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { accountData, accountEvent, accountName, accounts, ipcMain, log, sendRaw, writeAccountData, writeAccountDataDelayed } = ctx;

  // ================== PRODUCT KEYS ==================
  // A per-account queue of product keys that is worked off in the background, one key at a time. Steam stops
  // accepting keys after roughly 50 tries an hour and answers "on cooldown"; the queue then waits an hour
  // and carries on, so a long list can simply be left alone. Results are kept in the account file.
  const KEY_GAP_MS = 1500;
  const KEY_COOLDOWN_MS = 60 * 60 * 1000;
  const KEY_RESULT_LIMIT = 1000;
  const KEY_PATTERN = /(?<![A-Za-z0-9-])[A-Z0-9]{4,6}(?:-[A-Z0-9]{4,6}){2,5}(?![A-Za-z0-9-])/g;
  // EPurchaseResult values Steam sends for a refused key (anything else is shown as "other" with the number)
  const KEY_REFUSALS = { 9: 'owned', 13: 'region', 14: 'invalid', 15: 'duplicate', 24: 'needsBase' };
  const KEY_ON_COOLDOWN = 53;

  function keyRun(steamID) {
    const s = accounts.get(steamID);
    if (!s) return null;
    if (!s.keys) s.keys = { running: false, pausedUntil: 0, error: null, stop: false, cancelSleep: null };
    return s.keys;
  }
  function stopKeyRun(s) {
    if (!s || !s.keys) return;
    s.keys.stop = true;
    if (s.keys.cancelSleep) s.keys.cancelSleep();
  }
  function keyState(steamID) {
    const d = accountData(steamID);
    const k = keyRun(steamID) || {};
    return {
      queue: d.keyQueue.map((x) => ({ key: x.key, name: x.name || '' })),
      results: d.keyResults.slice(0, 300),
      resultCount: d.keyResults.length,
      usedCount: d.keyResults.filter((x) => x.status === 'used' || x.status === 'claimed').length,
      running: !!k.running,
      pausedUntil: k.pausedUntil || 0,
      error: k.error || null,
    };
  }
  function keyChanged(steamID) {
    if (steamID === ctx.activeSteamID) sendRaw('keys:changed', keyState(steamID));
    writeAccountDataDelayed(steamID);
  }
  // "NAME<TAB>KEY", "KEY" or several keys on one line. Keys are upper case: a name in normal spelling such as
  // "Half-Life-Alyx" is not taken for one. A line that holds nothing but a (lower case) key is accepted too.
  function parseKeyText(text) {
    const found = [];
    let invalid = 0;
    String(text || '').split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      const candidate = /^[A-Za-z0-9-]+$/.test(t) ? t.toUpperCase() : t;
      const m = candidate.match(KEY_PATTERN) || [];
      // a Steam store link (or "app/123") is a request for the free license of that app
      const free = !m.length && t.match(/(?:store\.steampowered\.com\/app\/|\bapp[\/: ])(\d{1,9})\b/i);
      if (free) { found.push({ key: 'APP:' + free[1], name: '', appid: +free[1] }); return; }
      if (!m.length) { invalid++; return; }
      if (m.length > 1) { m.forEach((k) => found.push({ key: k, name: '' })); return; }
      const name = candidate.slice(0, candidate.lastIndexOf(m[0])).replace(/[\s:;,|-]+$/, '').trim().slice(0, 80);
      found.push({ key: m[0], name });
    });
    return { found, invalid };
  }
  function addKeys(steamID, text) {
    const d = accountData(steamID);
    const parsed = parseKeyText(text);
    const known = new Set(d.keyQueue.map((x) => x.key).concat(d.keyResults.map((x) => x.key)));
    let added = 0, duplicates = 0;
    parsed.found.forEach((x) => {
      if (known.has(x.key)) { duplicates++; return; }
      known.add(x.key);
      d.keyQueue.push(x);
      added++;
    });
    return { added, duplicates, invalid: parsed.invalid };
  }
  function sleepKeys(k, ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { k.cancelSleep = null; resolve(); }, ms);
      k.cancelSleep = () => { clearTimeout(t); k.cancelSleep = null; resolve(); };
    });
  }
  // The next connected account that has not seen this key (not in its queue, not in its results, not in the key's own trail), or null.
  function forwardOwnedKey(fromSteamID, item) {
    const tried = new Set([...(item.tried || []), fromSteamID]);
    for (const [id, a] of accounts) {
      if (tried.has(id) || !a || !a.ready || !a.engine) continue;
      const nd = accountData(id);
      if (nd.keyQueue.some((x) => x.key === item.key) || nd.keyResults.some((x) => x.key === item.key)) continue;
      nd.keyQueue.push({ key: item.key, name: item.name || '', tried: [...tried] });
      nd.keyActive = true;
      return id;
    }
    return null;
  }
  async function processKeys(steamID) {
    const s = accounts.get(steamID);
    const k = keyRun(steamID);
    if (!s || !k || k.running) return;
    const d = accountData(steamID);
    k.running = true; k.stop = false; k.error = null;
    d.keyActive = true;
    keyChanged(steamID);
    let used = 0, refused = 0;
    try {
      while (!k.stop && accounts.get(steamID) === s && d.keyQueue.length) {
        if (Date.now() < k.pausedUntil) { await sleepKeys(k, Math.min(30000, k.pausedUntil - Date.now())); keyChanged(steamID); continue; }
        if (!s.engine || !s.ready) { k.error = 'Bağlı değil.'; keyChanged(steamID); await sleepKeys(k, 30000); continue; }
        const item = d.keyQueue[0];
        let r;
        const isFree = !!item.appid;
        try { r = isFree ? await s.engine.claimFreeApp(item.appid) : await s.engine.redeemKey(item.key); k.error = null; }
        catch (e) {
          // no answer from Steam: the key stays in the queue and is tried again shortly
          k.error = (e && e.message) || 'Steam yanıt vermedi.';
          log('warn', `[${accountName(steamID)}] key redeem: no answer (${k.error})`);
          keyChanged(steamID);
          await sleepKeys(k, 30000);
          continue;
        }
        if (!r.ok && r.detail === KEY_ON_COOLDOWN) {
          k.pausedUntil = Date.now() + KEY_COOLDOWN_MS;
          log('info', `[${accountName(steamID)}] key redeem: Steam rate limit, waiting an hour`);
          keyChanged(steamID);
          continue;
        }
        d.keyQueue.shift();
        const status = isFree ? (r.ok ? (r.granted ? 'claimed' : 'notGranted') : 'other') : (r.ok ? 'used' : (KEY_REFUSALS[r.detail] || 'other'));
        if (r.ok && (!isFree || r.granted)) used++; else refused++;
        // "already owned": with the setting on the same key goes to the next connected account that has not seen it, so a spare
        // key is not wasted. `tried` carries the accounts it has been through, so it cannot go round in a circle.
        const forward = (status === 'owned' && ctx.settings.keyForwardOwned) ? forwardOwnedKey(steamID, item) : null;
        d.keyResults.unshift({ key: item.key, name: item.name || (isFree ? 'App ' + item.appid : ''), status, detail: r.detail, packages: Object.values(r.packages || {}).slice(0, 5), ts: Date.now(), forwardedTo: forward ? accountName(forward) : '' });
        if (d.keyResults.length > KEY_RESULT_LIMIT) d.keyResults.length = KEY_RESULT_LIMIT;
        log('info', `[${accountName(steamID)}] key redeem: ${status} (${r.detail})${forward ? ', forwarded to ' + accountName(forward) : ''}`);
        keyChanged(steamID);
        if (forward) { keyChanged(forward); processKeys(forward); }
        if (d.keyQueue.length && !k.stop) await sleepKeys(k, KEY_GAP_MS);
      }
    } finally {
      k.running = false;
      if (!d.keyQueue.length || k.stop) d.keyActive = false;
      keyChanged(steamID);
      writeAccountData(steamID);
    }
    if (!d.keyQueue.length && (used || refused)) {
      accountEvent(steamID, { typeName: 'keysDone', feedEntry: { kind: 'inventory', title: 'Anahtarlar', text: 'Anahtar kuyruğu bitti. Sonuçlar Anahtarlar sayfasında.', status: used ? 'Başarılı' : 'Uyarı' } });
    }
  }
  // The queue was running when the app closed or the connection was lost: carry on once the account is back.
  function resumeKeyQueue(steamID) {
    const d = accountData(steamID);
    if (d.keyActive && d.keyQueue.length) processKeys(steamID);
  }
  ipcMain.handle('keys:state', () => (ctx.activeSteamID ? keyState(ctx.activeSteamID) : { queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null }));
  ipcMain.handle('keys:add', (_e, text) => {
    if (!ctx.activeSteamID) return { ok: false, error: 'Oturum yok, tekrar giriş yap.' };
    const r = addKeys(ctx.activeSteamID, text);
    keyChanged(ctx.activeSteamID);
    if (r.added) processKeys(ctx.activeSteamID);
    return { ok: true, ...r };
  });
  ipcMain.handle('keys:start', (_e, skipWait) => {
    if (!ctx.activeSteamID) return { ok: false };
    const k = keyRun(ctx.activeSteamID);
    if (k && skipWait) k.pausedUntil = 0;
    processKeys(ctx.activeSteamID);
    return { ok: true };
  });
  ipcMain.handle('keys:stop', () => {
    if (!ctx.activeSteamID) return { ok: false };
    const s = accounts.get(ctx.activeSteamID);
    stopKeyRun(s);
    accountData(ctx.activeSteamID).keyActive = false;
    return { ok: true };
  });
  ipcMain.handle('keys:clear', (_e, what) => {
    if (!ctx.activeSteamID) return { ok: false };
    const d = accountData(ctx.activeSteamID);
    if (what === 'queue') d.keyQueue = [];
    else if (what === 'results') d.keyResults = [];
    keyChanged(ctx.activeSteamID);
    return { ok: true };
  });


  return { keyChanged, resumeKeyQueue, stopKeyRun };
};
