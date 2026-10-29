// The log files (src/core/logger.js): their own folder, the old cache/steamedge.log moved there once, the level, rotation, crashes written
// whatever the level, and the connection history read back after a restart. Also the old Turkish file names renamed at start (keyMigration).
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger, formatConnection, parseConnection } = require('../../src/core/logger');
const { renameOldFiles } = require('../../src/core/keyMigration');

let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'se-logger-'));
const cache = path.join(root, 'cache'), dir = path.join(root, 'logs');
fs.mkdirSync(cache, { recursive: true });
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; } };
const quiet = () => { const l = console.log, e = console.error; console.log = console.error = () => {}; return () => { console.log = l; console.error = e; }; };

// 1. the old single log file is moved into logs/, not copied
fs.writeFileSync(path.join(cache, 'steamedge.log'), 'old line\n');
fs.writeFileSync(path.join(cache, 'steamedge.log.1'), 'older line\n');
let level = 'error';
let clock = Date.parse('2026-10-29T10:00:00Z');
let lg = createLogger({ dir, level: () => level, legacyDir: cache, now: () => clock });
check('the old cache/steamedge.log is moved to logs/', read(path.join(dir, 'steamedge.log')) === 'old line\n' && !fs.existsSync(path.join(cache, 'steamedge.log')));
check('its backup too', read(path.join(dir, 'steamedge.log.1')) === 'older line\n' && !fs.existsSync(path.join(cache, 'steamedge.log.1')));

// 2. the level decides what reaches steamedge.log; off writes nothing, crashes are written whatever the level
let restore = quiet();
lg.log('info', 'an event');
lg.log('error', 'an error');
lg.log('info', 'a connection line', true);
restore();
let app = read(lg.files.app);
check('"errors only" leaves an event out', !app.includes('an event') && app.includes('ERROR an error'));
check('always is written at any level', app.includes('INFO a connection line'));
level = 'off';
restore = quiet();
lg.log('error', 'not written');
lg.crash('uncaughtException', new Error('boom'));
restore();
check('off writes nothing to steamedge.log', !read(lg.files.app).includes('not written'));
check('a crash goes to crash.log even with the log off', /CRASH uncaughtException Error: boom/.test(read(lg.files.crash)));
check('steamedge.log carries no crash', !read(lg.files.app).includes('CRASH'));

// 3. the connection log: a line per event, read back after a restart, a summary of the last 24 hours
level = 'error';
const id = '76561190000000001';
const at = (iso) => { clock = Date.parse(iso); };
at('2026-10-29T10:00:00Z'); lg.connection('-', 'started');
at('2026-10-29T10:00:05Z'); lg.connection(id, 'connected');
at('2026-10-29T11:00:00Z'); lg.connection(id, 'dropped', { cause: 'NoConnection' });
at('2026-10-29T11:00:05Z'); lg.connection(id, 'waiting', { attempt: 1, nextMs: 5000, cause: 'NoConnection' });
at('2026-10-29T11:00:10Z'); lg.connection(id, 'attempt', { attempt: 1, deadlineMs: 60000 });
at('2026-10-29T11:02:00Z'); lg.connection(id, 'reconnected', { attempts: 1, games: 3, downMs: 120000 });
at('2026-10-29T12:00:00Z'); lg.connection(id, 'dropped', { cause: 'no answer by the deadline' });
at('2026-10-29T12:10:00Z'); lg.connection(id, 'reconnected', { attempts: 4, games: 3, downMs: 600000 });
at('2026-10-29T12:30:00Z'); lg.connection('76561190000000002', 'dropped', { cause: 'other account' });
const lines = read(lg.files.connection).trim().split('\n');
check('one line per event', lines.length === 9, String(lines.length));
check('a line reads as time, account, event, fields', lines[2] === '2026-10-29T11:00:00.000Z\t' + id + '\tdropped\tcause=NoConnection', lines[2]);
const back = parseConnection(formatConnection({ ts: clock, steamID: id, event: 'abandoned', attempts: 10, permanent: true, cause: 'Logged in elsewhere (34)' }));
check('a line reads back the same', back.attempts === 10 && back.permanent === true && back.cause === 'Logged in elsewhere (34)', JSON.stringify(back));

at('2026-10-29T13:00:00Z');
let sum = lg.connectionSummary(id, 24 * 3600 * 1000);
check('two drops, 12 minutes down, the longest 10', sum.drops === 2 && sum.downMs === 12 * 60000 && sum.longestMs === 10 * 60000, JSON.stringify(sum));
check('the last cause and time', sum.lastCause === 'no answer by the deadline' && sum.lastDropAt === Date.parse('2026-10-29T12:00:00Z'));
check('another account does not count', sum.downSince === null && sum.abandoned === 0);

// a drop still open counts up to now
at('2026-10-29T14:00:00Z'); lg.connection(id, 'dropped', { cause: 'NoConnection' });
at('2026-10-29T14:05:00Z');
sum = lg.connectionSummary(id, 24 * 3600 * 1000);
check('a drop still open counts up to now', sum.drops === 3 && sum.downSince === Date.parse('2026-10-29T14:00:00Z') && sum.downMs === 17 * 60000, JSON.stringify(sum));

// the app closes while the account is down and starts hours later: the drop ends at "stopped", the night with the app closed does not count
lg.connection('-', 'stopped');
at('2026-10-29T22:00:00Z');
lg = createLogger({ dir, level: () => level, legacyDir: cache, now: () => clock });
lg.connection('-', 'started');
at('2026-10-29T22:00:30Z'); lg.connection(id, 'connected');
sum = lg.connectionSummary(id, 24 * 3600 * 1000);
check('the history is read back after a restart', sum.drops === 3, JSON.stringify(sum));
check('a drop the app closed in ends where the app stopped', sum.downMs === 17 * 60000 && sum.downSince === null, JSON.stringify(sum));

// a run that crashed (no "stopped" line): the open drop ends at the last line written before the next start
at('2026-10-30T08:00:00Z'); lg.connection(id, 'dropped', { cause: 'NoConnection' });
at('2026-10-30T08:01:00Z'); lg.connection(id, 'waiting', { attempt: 1, nextMs: 5000 });
at('2026-10-30T15:00:00Z');
lg = createLogger({ dir, level: () => level, now: () => clock });
lg.connection('-', 'started');
sum = lg.connectionSummary(id, 24 * 3600 * 1000);
check('after a crash the drop ends at the last line of that run, not at the next start', sum.drops === 1 && sum.downSince === null && sum.downMs === 60000, JSON.stringify(sum));

// 24 hours later the old drops have left the window
at('2026-10-31T16:00:00Z');
sum = lg.connectionSummary(id, 24 * 3600 * 1000);
check('drops older than the window leave the summary', sum.drops === 0 && sum.downMs === 0, JSON.stringify(sum));

// off: the summary still works for this run, the file is not written
level = 'off';
const before = read(lg.files.connection);
lg.connection(id, 'dropped', { cause: 'x' });
check('with the log off the file is not written', read(lg.files.connection) === before);
check('but the history on screen still has it', lg.connectionSummary(id, 3600000).downSince === clock);

// 4. rotation: past its size the file moves to .1
level = 'debug';
restore = quiet();
const big = 'x'.repeat(4096);
for (let i = 0; i < 600; i++) lg.log('debug', big);
restore();
check('steamedge.log rotates past 2 MB', fs.existsSync(lg.files.app + '.1') && fs.statSync(lg.files.app).size < 2 * 1024 * 1024);

// 5. old Turkish file names get the current one; a name already taken is left alone
const settingsDir = path.join(root, 'settings');
fs.mkdirSync(settingsDir);
fs.writeFileSync(path.join(cache, 'basarimsiz.json'), '{"appids":[1]}');
fs.writeFileSync(path.join(settingsDir, 'settings.json.bozuk'), 'broken');
fs.writeFileSync(path.join(settingsDir, 'accounts.json.bozuk'), 'old broken');
fs.writeFileSync(path.join(settingsDir, 'accounts.json.corrupt'), 'new broken');
renameOldFiles(cache); renameOldFiles(settingsDir); renameOldFiles(path.join(root, 'missing'));
check('basarimsiz.json becomes no-achievements.json', read(path.join(cache, 'no-achievements.json')) === '{"appids":[1]}' && !fs.existsSync(path.join(cache, 'basarimsiz.json')));
check('a .bozuk file becomes .corrupt', read(path.join(settingsDir, 'settings.json.corrupt')) === 'broken');
check('an existing .corrupt is not overwritten', read(path.join(settingsDir, 'accounts.json.corrupt')) === 'new broken' && fs.existsSync(path.join(settingsDir, 'accounts.json.bozuk')));

fs.rmSync(root, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
