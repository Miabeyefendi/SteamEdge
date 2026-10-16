'use strict';
// Inventories other than the Steam community one (appid 753, context 6: cards, backgrounds, emoticons, gems): Counter-Strike 2, Dota 2,
// Team Fortress 2 and the rest. Pure helpers, no network.
//
// Market keys. The community items keep their plain market_hash_name ("440-Card Name", it already carries the game); every other game's
// items get the game in front ("730|AK-47 | Redline (Field-Tested)"). One string is all the price cache, the history cache, the queue and
// the page pass around, and two games can never share an entry that way.

const COMMUNITY = { appid: 753, contextId: '6' };

// The key an item is known by in the price machinery
function marketKey(appid, hashName) {
  if (!hashName) return null;
  return (+appid === COMMUNITY.appid || !+appid) ? String(hashName) : (+appid) + '|' + hashName;
}

// The other way: which game's market a key belongs to, and the name Steam knows the item by
function splitMarketKey(key) {
  const m = /^(\d{1,10})\|([\s\S]+)$/.exec(String(key == null ? '' : key));
  return m ? { appid: +m[1], name: m[2] } : { appid: COMMUNITY.appid, name: String(key == null ? '' : key) };
}

// A page asks for an inventory with { appid, contextId }. Anything that is not a plain number is refused: these end up in a URL and a request body.
function validSource(arg) {
  if (arg == null) return { appid: COMMUNITY.appid, contextId: COMMUNITY.contextId };
  const appid = Number(arg.appid), contextId = String(arg.contextId == null ? '' : arg.contextId);
  if (!Number.isInteger(appid) || appid < 1 || appid > 2147483647 || !/^\d{1,4}$/.test(contextId)) return null;
  return { appid, contextId };
}

// "730:2" <-> { appid: 730, contextId: '2' } (the value of the source list on the page)
function sourceId(appid, contextId) { return (+appid) + ':' + contextId; }
function parseSourceId(id) {
  const m = /^(\d{1,10}):(\d{1,4})$/.exec(String(id || ''));
  return m ? { appid: +m[1], contextId: m[2] } : null;
}

// The part of text that is the JSON object starting at `start` (the position of its opening brace): braces inside strings do not count.
function scanObject(text, start) {
  let depth = 0, inString = false;
  const end = Math.min(text.length, start + 2000000);
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (inString) { if (c === 92) i++; else if (c === 34) inString = false; continue; }
    if (c === 34) inString = true;
    else if (c === 123) depth++;
    else if (c === 125 && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

// The games with items in the account, from the inventory page (it prints them as g_rgAppContextData). The community inventory is left out:
// it is the page's own default. Returns null when the page has no such block, so the caller can offer the usual games instead.
function parseAppContexts(html) {
  const text = String(html || '');
  const at = text.indexOf('g_rgAppContextData');
  if (at < 0) return null;
  const open = text.indexOf('{', at);
  if (open < 0 || open - at > 40) return null;
  const raw = scanObject(text, open);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch (_) { return null; }
  if (!data || typeof data !== 'object') return null;
  const out = [];
  Object.keys(data).forEach((k) => {
    const g = data[k];
    const appid = Number(g && g.appid != null ? g.appid : k);
    if (!g || !Number.isInteger(appid) || appid < 1 || appid === COMMUNITY.appid) return;
    const contexts = Object.keys(g.rgContexts || {}).map((cid) => {
      const c = g.rgContexts[cid] || {};
      return { id: String(c.id != null ? c.id : cid), name: String(c.name || ''), assetCount: Number(c.asset_count) || 0 };
    }).filter((c) => /^\d{1,4}$/.test(c.id) && c.assetCount > 0);
    if (!contexts.length) return;
    out.push({ appid, name: String(g.name || ('App ' + appid)), assetCount: contexts.reduce((s, c) => s + c.assetCount, 0), contexts });
  });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// What is offered when the page could not be read: the games most accounts have an inventory in
const FALLBACK_SOURCES = [
  { appid: 730, name: 'Counter-Strike 2', assetCount: null, contexts: [{ id: '2', name: 'Backpack', assetCount: null }] },
  { appid: 570, name: 'Dota 2', assetCount: null, contexts: [{ id: '2', name: 'Backpack', assetCount: null }] },
  { appid: 440, name: 'Team Fortress 2', assetCount: null, contexts: [{ id: '2', name: 'Backpack', assetCount: null }] },
  { appid: 252490, name: 'Rust', assetCount: null, contexts: [{ id: '2', name: 'Backpack', assetCount: null }] },
];

module.exports = { COMMUNITY, marketKey, splitMarketKey, validSource, sourceId, parseSourceId, parseAppContexts, FALLBACK_SOURCES };
