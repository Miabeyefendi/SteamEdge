// The app's log files, in their own folder next to settings/ and cache/ (DATA_ROOT/logs):
//   steamedge.log   events at the level chosen in Settings > Advanced > "Log file"
//   connection.log  every drop, reconnect attempt and reconnect of every account, one line each. It is read back at start for the
//                   connection history in Settings, so a "reconnecting for hours" can be looked up instead of guessed.
//   crash.log       errors nothing else caught. Written whatever the level: when someone says "an error showed up" there is something to read.
// Each file rotates to <name>.1 past its size, one backup, so the disk does not fill up. Up to 1.7.9 a single steamedge.log lived in cache/;
// it is moved here once.
'use strict';

const fs = require('fs');
const path = require('path');

const RANK = { error: 0, warn: 1, info: 2, debug: 3 };
const MB = 1024 * 1024;
const LIMIT = { app: 2 * MB, connection: MB, crash: MB };
// The connection history kept in memory: a week is more than the summary asks for (24 hours), the cap keeps a flapping network from growing it
const HISTORY_MS = 7 * 24 * 3600 * 1000;
const HISTORY_MAX = 5000;
// What a connection line may carry besides its event. cause goes last on the line: it is free text and may hold spaces.
const FIELDS = ['attempt', 'attempts', 'games', 'downMs', 'nextMs', 'deadlineMs', 'permanent'];

// One connection.log line: "<ISO time>\t<steamID>\t<event>\tkey=value ... cause=<text>"
function formatConnection(e) {
  const parts = FIELDS.filter((k) => e[k] != null).map((k) => k + '=' + (typeof e[k] === 'boolean' ? (e[k] ? 1 : 0) : e[k]));
  if (e.cause) parts.push('cause=' + String(e.cause).replace(/[\r\n\t]+/g, ' '));
  return new Date(e.ts).toISOString() + '\t' + e.steamID + '\t' + e.event + '\t' + parts.join(' ');
}

function parseConnection(line) {
  const [iso, steamID, event, rest] = line.split('\t');
  const ts = Date.parse(iso);
  if (!ts || !steamID || !event) return null;
  const e = { ts, steamID, event };
  let text = rest || '';
  const at = text.indexOf('cause=');
  if (at >= 0) { e.cause = text.slice(at + 6); text = text.slice(0, at); }
  text.split(' ').forEach((pair) => {
    const eq = pair.indexOf('=');
    if (eq <= 0) return;
    const k = pair.slice(0, eq), v = pair.slice(eq + 1);
    if (!FIELDS.includes(k)) return;
    e[k] = k === 'permanent' ? v === '1' : +v;
  });
  return e;
}

// dir: the logs folder. level(): the current "Log file" setting (off | error | warn | info | debug). legacyDir: where 1.7.9 and older kept
// steamedge.log. now: the clock, replaceable in tests.
function createLogger({ dir, level, legacyDir, now = Date.now }) {
  const files = {
    app: path.join(dir, 'steamedge.log'),
    connection: path.join(dir, 'connection.log'),
    crash: path.join(dir, 'crash.log'),
  };
  const levelOf = () => { try { return level(); } catch (_) { return 'error'; } };

  function append(file, limit, text) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      try { if (fs.statSync(file).size > limit) fs.renameSync(file, file + '.1'); } catch (_) {}
      fs.appendFileSync(file, text + '\n');
    } catch (_) {}
  }

  // The old single log file is moved, not copied: two files with the same name in two folders would only confuse whoever reads them
  if (legacyDir) {
    ['steamedge.log', 'steamedge.log.1'].forEach((name) => {
      const from = path.join(legacyDir, name), to = path.join(dir, name);
      try {
        if (fs.existsSync(from) && !fs.existsSync(to)) { fs.mkdirSync(dir, { recursive: true }); fs.renameSync(from, to); }
      } catch (_) {}
    });
  }

  // The history of the last week, oldest first. Read from the file and its backup, so it survives a restart.
  const history = [];
  function remember(e) {
    history.push(e);
    const from = now() - HISTORY_MS;
    while (history.length && (history.length > HISTORY_MAX || history[0].ts < from)) history.shift();
  }
  [files.connection + '.1', files.connection].forEach((file) => {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
    text.split('\n').forEach((line) => { const e = line && parseConnection(line); if (e) remember(e); });
  });

  function log(lvl, msg, always) {
    const chosen = levelOf();
    const want = RANK[chosen] != null ? RANK[chosen] : 0;
    if (!always && (RANK[lvl] != null ? RANK[lvl] : 0) > want) return;
    const line = `[${new Date(now()).toISOString()}] ${String(lvl).toUpperCase()} ${msg}`;
    if (lvl === 'error') console.error(line); else console.log(line);
    if (chosen === 'off') return;
    append(files.app, LIMIT.app, line);
  }

  function crash(category, e) {
    const line = `[${new Date(now()).toISOString()}] CRASH ${category} ${(e && e.stack) || (e && e.message) || e}`;
    console.error(line);
    append(files.crash, LIMIT.crash, line);
  }

  // event: started | stopped | connected | dropped | waiting | attempt | reconnected | abandoned. steamID '-' for a line about the app itself.
  // The history on screen is kept even with the log off; only the file follows the setting.
  function connection(steamID, event, fields) {
    const e = { ts: now(), steamID: String(steamID || '-'), event };
    if (fields) {
      FIELDS.forEach((k) => { if (fields[k] != null) e[k] = fields[k]; });
      if (fields.cause) e.cause = String(fields.cause);
    }
    remember(e);
    if (levelOf() !== 'off') append(files.connection, LIMIT.connection, formatConnection(e));
  }

  // The connection of one account over the last `spanMs`: drops, the time it was down, the longest drop, the last cause. A drop still open
  // counts up to now. One the app was closed in the middle of ends at the last line written before the next start: what happened while
  // the app was closed is not known, and counting it would show a night with the computer off as a night without Steam.
  function connectionSummary(steamID, spanMs) {
    const id = String(steamID), t = now(), from = t - spanMs;
    const out = { drops: 0, downMs: 0, longestMs: 0, lastDropAt: null, lastCause: null, abandoned: 0, attempts: 0, downSince: null };
    let open = null, lastSeen = null;
    const close = (end) => {
      if (open == null) return;
      const start = Math.max(open, from);
      if (end > start) out.downMs += end - start;
      if (end > from) out.longestMs = Math.max(out.longestMs, end - open);
      open = null;
    };
    for (const e of history) {
      const before = lastSeen;
      lastSeen = e.ts;
      if (e.event === 'started') { close(before != null ? before : e.ts); continue; }
      if (e.event === 'stopped') { close(e.ts); continue; }
      if (e.steamID !== id) continue;
      if (e.event === 'dropped') {
        close(e.ts);
        open = e.ts;
        if (e.ts >= from) { out.drops++; out.lastDropAt = e.ts; out.lastCause = e.cause || null; }
      } else if (e.event === 'reconnected' || e.event === 'connected') {
        close(e.ts);
      } else if (e.event === 'abandoned') {
        if (e.ts >= from) out.abandoned++;
      } else if (e.event === 'attempt') {
        if (e.ts >= from) out.attempts++;
      }
    }
    if (open != null) { out.downSince = open; close(t); }
    return out;
  }

  return { dir, files, log, crash, connection, connectionSummary };
}

module.exports = { createLogger, formatConnection, parseConnection };
