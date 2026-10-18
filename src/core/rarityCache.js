'use strict';
// The global unlock percentages of a game's achievements (Steam's public GetGlobalAchievementPercentagesForApp), kept in memory and in a small file.
// Realistic Mode orders the queue by them, from the most common to the rarest; when the request failed (a limit, a timeout) the list used to come back empty,
// every achievement had an unknown rarity and the order fell back to the order of the schema - which looked like rare ones first. Now a request is retried, an
// answer stays for a day, and a stale answer is better than none (the percentages move by tenths in a year).
const fs = require('fs');

const MAX_AGE_MS = 24 * 3600000;
const MAX_ENTRIES = 300;
let file = null;
let loaded = false;
const entries = new Map();      // appid -> { ts, map: { apiName: percent } }

function setFile(p) { file = p; loaded = false; entries.clear(); }

function load() {
  if (loaded) return;
  loaded = true;
  if (!file) return;
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.keys(j || {}).forEach((k) => { if (j[k] && j[k].map && typeof j[k].map === 'object') entries.set(String(k), { ts: +j[k].ts || 0, map: j[k].map }); });
  } catch (_) { /* no file yet, or a damaged one: it is only a cache */ }
}

function save() {
  if (!file) return;
  try {
    const out = {};
    entries.forEach((v, k) => { out[k] = v; });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, file);
  } catch (_) { /* a cache that cannot be written is still a cache in memory */ }
}

// { ts, map } or null. fresh: only an answer younger than a day.
function get(appid, fresh) {
  load();
  const e = entries.get(String(appid));
  if (!e) return null;
  if (fresh && Date.now() - e.ts > MAX_AGE_MS) return null;
  return e;
}

function set(appid, map) {
  load();
  entries.set(String(appid), { ts: Date.now(), map });
  if (entries.size > MAX_ENTRIES) {
    const oldest = [...entries.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, entries.size - MAX_ENTRIES);
    oldest.forEach(([k]) => entries.delete(k));
  }
  save();
}

module.exports = { setFile, get, set, MAX_AGE_MS };
