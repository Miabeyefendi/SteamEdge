'use strict';
// Jobs that survive a restart. When the app ends while a job is running (the PC is shut down, the app is closed, it crashes) the job is written
// to a small file, and when the account connects again the job starts again where it left off. The time the app was not running does not count:
// a boost with three hours left has three hours left when it comes back.
//
// This module holds the parts that need no Electron: what to write down (describeJobs), how to read it back safely (sanitizeEntry), what to
// start from it (buildPlan), the file (createStore) and the order the jobs are started in (run). main.js wires them to the real jobs.

const FILE_VERSION = 1;
// An entry older than this is not resumed: whoever left a job running a week ago is not expecting it to start by itself.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_GAMES = 3000;
const MAX_SPAN_MS = 999 * 60 * 60 * 1000;
const MIN_REALISTIC_MS = 60 * 1000;

const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const clamp = (x, lo, hi, fallback) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
const wholeId = (x) => { const n = Number(x); return Number.isInteger(n) && n > 0 && n < 4294967296 ? n : 0; };

// A game of a list reduced to its plain fields (the name, the numbers): the lists hold hundreds of games and a job needs no more than these to start again.
function plainGame(g) {
  if (!isObject(g)) return null;
  const appid = wholeId(g.appid);
  if (!appid) return null;
  const out = { appid };
  Object.keys(g).slice(0, 24).forEach((k) => {
    if (k === 'appid' || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)) return;
    const v = g[k];
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  });
  return out;
}
function plainGames(list) {
  return (Array.isArray(list) ? list : []).slice(0, MAX_GAMES).map(plainGame).filter(Boolean);
}
const jsonSafe = (x, maxChars) => {
  try { const text = JSON.stringify(x); return text && text.length <= maxChars ? JSON.parse(text) : null; } catch (_) { return null; }
};

// ---------------------------------------------------------------- writing down
function farmEntry(mode, games, durationMs, location, now, paused) {
  const loc = location || {};
  return {
    mode: String(mode || ''), games: plainGames(games), durationMs: Math.max(0, +durationMs || 0),
    index: Math.max(0, +loc.index || 0), passedMs: Math.max(0, +loc.passedMs || 0),
    sessionElapsedMs: loc.sessionStart ? Math.max(0, now - loc.sessionStart) : 0,
    paused: !!paused,
  };
}

// What the account is doing, from its live slot (see main.js: farm, pendingFarm, boost, hoursFarm, sequentialRequest, realistic).
// A job the schedule started is left out: the schedule starts it again by itself when its time range is open, and stops it when the range closes.
function describeJobs(slot, now) {
  if (!slot) return null;
  const out = {};
  try {
    if (!slot.scheduleStarted) {
      if (slot.farm && slot.farm.running) out.farm = farmEntry(slot.farm.mode, slot.farm.games, slot.farm.durationMs, slot.farm.location(), now, false);
      else if (slot.pendingFarm) out.farm = farmEntry(slot.pendingFarm.mode, slot.pendingFarm.games, slot.pendingFarm.durationMs, slot.pendingFarm.location, now, true);
    }
    const b = slot.boost;
    if (b && b.runningFlag && b.request) {
      out.boost = {
        appids: (b.request.appids || []).map(wholeId).filter(Boolean).slice(0, 64),
        durationMs: Math.max(0, +b.request.durationMs || 0),
        games: Array.isArray(b.request.games) ? plainGames(b.request.games) : null,
        allItems: Array.isArray(b.request.allItems) ? plainGames(b.request.allItems) : null,
        // A synchronising boost works out its own length from the playtimes of the moment, so only the plain ones carry the time already run
        sync: !!b.sync,
        elapsedMs: !b.sync && b.startPoint ? Math.max(0, now - b.startPoint) : 0,
      };
    }
    if (slot.hoursFarm && slot.hoursFarm.running && slot.sequentialRequest) {
      const loc = slot.hoursFarm.location();
      out.sequential = {
        games: plainGames(slot.sequentialRequest.games), durationMs: Math.max(0, +slot.sequentialRequest.durationMs || 0),
        loop: slot.sequentialRequest.loop !== false,
        index: Math.max(0, +loc.index || 0), passedMs: Math.max(0, +loc.passedMs || 0),
        sessionElapsedMs: loc.sessionStart ? Math.max(0, now - loc.sessionStart) : 0,
      };
    }
    const r = slot.realistic;
    if (r && !slot.grScheduleStarted && Array.isArray(r.gameEntries) && r.activeIds) {
      // What is still to be unlocked in each game: the rest of the list of the game that is open, the whole list of the games that wait
      const games = [];
      // the games at the same time: one merged list, what is left of it is counted per game
      const leftTogether = r.activeIds.parallel ? new Map() : null;
      if (leftTogether) (r.activeIds.queueList || []).slice(r.activeIds.indexNum || 0).forEach((x) => leftTogether.set(+x.appid, (leftTogether.get(+x.appid) || 0) + 1));
      r.gameEntries.forEach((g, i) => {
        if (i < r.gameIndex) return;
        const left = leftTogether ? (leftTogether.get(+g.appid) || 0) : i === r.gameIndex
          ? Math.max(0, ((r.activeIds.queueList || []).length) - (r.activeIds.indexNum || 0))
          : ((r.preparing && r.preparing[g.appid] && r.preparing[g.appid].queueList) || []).length;
        const appid = wholeId(g.appid);
        if (appid && left > 0) games.push({ appid, name: String(g.name || '').slice(0, 120), left });
      });
      if (games.length) {
        out.realistic = { games: games.slice(0, 64), remainingMs: Math.max(MIN_REALISTIC_MS, (+r.finishTime || now) - now), options: jsonSafe(r.optionList, 20000) || {} };
      }
    }
  } catch (_) { return null; }
  if (!out.farm && !out.boost && !out.sequential && !out.realistic) return null;
  out.savedAt = now;
  return out;
}

// ---------------------------------------------------------------- reading back
// The file may be anything (a half written file, an older shape, something someone edited): only what is well formed and recent is taken.
function sanitizeEntry(raw, now) {
  if (!isObject(raw)) return null;
  let savedAt = Number(raw.savedAt);
  if (!Number.isFinite(savedAt) || savedAt <= 0) return null;
  if (savedAt > now) savedAt = now;
  if (now - savedAt > MAX_AGE_MS) return null;
  const out = { savedAt };
  const f = raw.farm;
  if (isObject(f) && /^[A-Za-z]{1,32}$/.test(String(f.mode || ''))) {
    const games = plainGames(f.games);
    if (games.length) {
      out.farm = {
        mode: String(f.mode), games, durationMs: clamp(f.durationMs, 0, MAX_SPAN_MS, 0), index: Math.floor(clamp(f.index, 0, MAX_GAMES, 0)),
        passedMs: clamp(f.passedMs, 0, MAX_SPAN_MS, 0), sessionElapsedMs: clamp(f.sessionElapsedMs, 0, 30 * 24 * 3600000, 0), paused: !!f.paused,
      };
    }
  }
  const b = raw.boost;
  if (isObject(b)) {
    const appids = (Array.isArray(b.appids) ? b.appids : []).map(wholeId).filter(Boolean).slice(0, 64);
    if (appids.length) {
      out.boost = {
        appids, durationMs: clamp(b.durationMs, 0, MAX_SPAN_MS, 0),
        games: Array.isArray(b.games) ? plainGames(b.games) : null, allItems: Array.isArray(b.allItems) ? plainGames(b.allItems) : null,
        sync: !!b.sync, elapsedMs: clamp(b.elapsedMs, 0, MAX_SPAN_MS, 0),
      };
    }
  }
  const q = raw.sequential;
  if (isObject(q)) {
    const games = plainGames(q.games);
    if (games.length) {
      out.sequential = {
        games, durationMs: clamp(q.durationMs, 0, MAX_SPAN_MS, 0), loop: q.loop !== false, index: Math.floor(clamp(q.index, 0, MAX_GAMES, 0)),
        passedMs: clamp(q.passedMs, 0, MAX_SPAN_MS, 0), sessionElapsedMs: clamp(q.sessionElapsedMs, 0, 30 * 24 * 3600000, 0),
      };
    }
  }
  const r = raw.realistic;
  if (isObject(r)) {
    const games = (Array.isArray(r.games) ? r.games : []).map((g) => (isObject(g) && wholeId(g.appid) && Number(g.left) >= 1
      ? { appid: wholeId(g.appid), name: String(g.name || '').slice(0, 120), left: Math.min(100000, Math.floor(Number(g.left))) } : null)).filter(Boolean).slice(0, 64);
    if (games.length) out.realistic = { games, remainingMs: clamp(r.remainingMs, MIN_REALISTIC_MS, MAX_SPAN_MS, MIN_REALISTIC_MS), options: isObject(r.options) ? jsonSafe(r.options, 20000) || {} : {} };
  }
  return out.farm || out.boost || out.sequential || out.realistic ? out : null;
}
function sanitizeFile(raw, now) {
  const out = {};
  if (!isObject(raw) || raw.v !== FILE_VERSION || !isObject(raw.accounts)) return out;
  Object.keys(raw.accounts).slice(0, 50).forEach((id) => {
    if (!/^\d{5,20}$/.test(id)) return;
    const e = sanitizeEntry(raw.accounts[id], now);
    if (e) out[id] = e;
  });
  return out;
}

// ---------------------------------------------------------------- starting again
// What to start for a written-down entry, with the times turned back into starting points: a job that had run for 40 minutes starts as if it began
// 40 minutes ago. Null parts are not started. A job whose time was already used up is not started either.
function buildPlan(entry, now) {
  const plan = { farm: null, boost: null, sequential: null, realistic: null };
  if (!entry) return plan;
  if (entry.farm) {
    const f = entry.farm;
    plan.farm = {
      mode: f.mode, games: f.games.map((g) => ({ ...g })), durationMs: f.durationMs, paused: !!f.paused,
      location: { index: f.index, passedMs: f.passedMs, sessionStart: now - f.sessionElapsedMs },
    };
  }
  if (entry.boost && !(entry.boost.durationMs > 0 && !entry.boost.sync && entry.boost.elapsedMs >= entry.boost.durationMs)) {
    const b = entry.boost;
    plan.boost = {
      refreshGames: !!b.sync,
      request: {
        appids: b.appids.slice(), durationMs: b.durationMs, games: b.games ? b.games.map((g) => ({ ...g })) : null, allItems: b.allItems ? b.allItems.map((g) => ({ ...g })) : null,
        proceeding: b.sync ? null : { startPoint: now - b.elapsedMs },
      },
    };
  }
  if (entry.sequential) {
    const q = entry.sequential;
    plan.sequential = {
      request: {
        games: q.games.map((g) => ({ ...g })), durationMs: q.durationMs, loop: q.loop,
        proceeding: { index: q.index, passedMs: q.passedMs, sessionStart: now - q.sessionElapsedMs },
      },
    };
  }
  if (entry.realistic) {
    const r = entry.realistic;
    const goalByGame = {};
    r.games.forEach((g) => { goalByGame[g.appid] = g.left; });
    // What is left of the target goes in as the target of each game, and the time that is left as the span: the same plan, shorter. The unlocks that
    // were already made are not in the list any more (it is read from Steam again), so nothing is unlocked twice.
    plan.realistic = {
      request: {
        gameEntries: r.games.map((g) => g.appid), spanMs: r.remainingMs,
        optionList: Object.assign({}, r.options, { goalAuto: false, autoSpan: false, goalValue: 0, goalByGame }),
      },
    };
  }
  return plan;
}

// The order the jobs are started in is the order they were started in by hand: card farming first, then whatever pauses it (the same rules apply),
// and a card farm that was paused for them is put back last, so it comes back when they end.
// deps: startFarm(plan), holdFarm(plan), startBoost(plan), startSequential(plan), startRealistic(plan) (async), refreshBoostGames(request) (async), log(text)
async function run(plan, deps) {
  const started = [], failed = [];
  const attempt = async (kind, fn) => {
    try {
      const r = await fn();
      if (r && r.ok === false) failed.push({ kind, error: r.error || '' }); else started.push(kind);
    } catch (e) { failed.push({ kind, error: (e && e.message) || String(e) }); }
  };
  if (plan.farm && !plan.farm.paused) await attempt('farm', () => deps.startFarm(plan.farm));
  if (plan.boost) {
    if (plan.boost.refreshGames && deps.refreshBoostGames) { try { await deps.refreshBoostGames(plan.boost.request); } catch (_) {} }
    await attempt('boost', () => deps.startBoost(plan.boost));
  }
  if (plan.sequential) await attempt('sequential', () => deps.startSequential(plan.sequential));
  if (plan.realistic) await attempt('realistic', () => deps.startRealistic(plan.realistic));
  if (plan.farm && plan.farm.paused) await attempt('farm', () => deps.holdFarm(plan.farm));
  return { started, failed };
}

// ---------------------------------------------------------------- the file
// deps: file, readText(file) -> string (throws when there is none), write(file, object) -> bool, remove(file), now() -> ms
function createStore(deps) {
  let pending = {};                  // written by an earlier run, not started again yet: id -> entry
  let onDisk = null;                 // what the file holds as far as we know: '' = no file, null = not known (an unreadable file may be there)
  const body = (accounts) => JSON.stringify({ v: FILE_VERSION, accounts });
  return {
    // Reads the file. A file that cannot be read is the same as no file: a job is not worth stopping the app for.
    load() {
      try {
        pending = sanitizeFile(JSON.parse(deps.readText(deps.file)), deps.now());
        onDisk = Object.keys(pending).length ? body(pending) : null;
      } catch (e) {
        pending = {};
        onDisk = e && e.code === 'ENOENT' ? '' : null;
      }
      return Object.keys(pending);
    },
    peek(id) { return pending[id] || null; },
    take(id) { const e = pending[id] || null; delete pending[id]; return e; },
    forget(id) { delete pending[id]; },
    pendingIds() { return Object.keys(pending); },
    // live: id -> entry of the jobs that are running now. What an account wrote down earlier and has not started again yet stays in the file
    // (it may not have connected yet), unless the account is running something now. Returns true when the file was written.
    save(live) {
      const liveIds = Object.keys(live || {});
      liveIds.forEach((id) => { delete pending[id]; });
      const accounts = Object.assign({}, pending, live || {});
      if (!Object.keys(accounts).length) {
        if (onDisk !== '') this.clear();
        return false;
      }
      // Running jobs change the file every time (the time they have run); entries that only wait are written once
      const text = body(accounts);
      if (!liveIds.length && text === onDisk) return false;
      onDisk = text;
      return !!deps.write(deps.file, { v: FILE_VERSION, accounts });
    },
    clear() { pending = {}; onDisk = ''; try { deps.remove(deps.file); } catch (_) {} },
  };
}

module.exports = { FILE_VERSION, MAX_AGE_MS, describeJobs, sanitizeEntry, sanitizeFile, buildPlan, run, createStore, plainGames };
