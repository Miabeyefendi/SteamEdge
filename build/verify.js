#!/usr/bin/env node
/**
 *  * SteamEdge verification suite.  Usage: npm run verify
 *
 *  * Independent checks that run before the build. No test framework: each check reads the
 *  * source and PROVES something or says on which line it broke.
 *
 *  *   1. Syntax           - can every .js file be parsed
 *  *   2. Missing id       - is the id the JS looks for present in the HTML
 *  *   3. Duplicate id     - is the same id defined twice
 *  *   4. Tag balance      - is there an unopened/unclosed <div> in the page fragments
 *  *   5. IPC match        - is the channel preload calls defined in main.js
 *  *   6. Long dash        - an em/en dash must not be found anywhere
 *  *   7. Author trace     - has a tool/person name other than the author leaked into the source
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let errorCount = 0;
let warnCount = 0;

const fail = (m) => { errorCount++; console.log('  ERROR  ' + m); };
const warn = (m) => { warnCount++; console.log('  WARNING' + m); };
const section = (m) => console.log('\n' + m);

function files(dir, ext, output = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.out'
        || e.name === 'settings' || e.name === 'cache'
        || e.name === 'archive' || e.name === 'releases') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, ext, output);
    else if (e.name.toLowerCase().endsWith(ext)) output.push(p);
  }
  return output;
}
const relative = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
// This file itself is not scanned: it carries the patterns it looks for, it would
// catch itself on every run.
const isSelf = (p) => relative(p) === 'build/verify.js';
const read = (p) => fs.readFileSync(p, 'utf8');
const lineNo = (text, location) => text.slice(0, location).split('\n').length;

// ---- 1. Syntax ----
section('1. Syntax');
const jsFiles = files(ROOT, '.js');
jsFiles.forEach((f) => {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { fail(relative(f) + ' could not be parsed\n' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')); }
});
console.log('  ' + jsFiles.length + ' files checked');

// ---- 2 + 3. id checks ----
section('2. Missing id');
const htmlFiles = files(ROOT, '.html');
const allIds = new Set();
// The duplicate check is per DOCUMENT: the login screen and the main window are separate documents, and it is correct for both to have
// the window button ids (min/max/close). A clash is only a problem in the same document.
// Since the main window injects the page fragments into main.html they count as a single document.
const docIds = new Map();
const docName = (p) => (relative(p).startsWith('src/main/') ? 'main window' : relative(p));
htmlFiles.forEach((f) => {
  const m = read(f);
  const doc = docName(f);
  if (!docIds.has(doc)) docIds.set(doc, new Map());
  const counter = docIds.get(doc);
  for (const match of m.matchAll(/\bid="([^"]+)"/g)) {
    allIds.add(match[1]);
    counter.set(match[1], (counter.get(match[1]) || 0) + 1);
  }
});
// Ids the JS produces itself are counted too: id="X" inside innerHTML or el.id = 'X'
const uiJs = files(path.join(ROOT, 'src', 'main', 'js'), '.js');
uiJs.forEach((f) => {
  const m = read(f);
  for (const e of m.matchAll(/\bid="([^"'{}$]+)"/g)) allIds.add(e[1]);
  for (const e of m.matchAll(/\.id\s*=\s*'([^']+)'/g)) allIds.add(e[1]);
  for (const e of m.matchAll(/\.id\s*=\s*"([^"]+)"/g)) allIds.add(e[1]);
});
let searched = 0;
uiJs.concat(files(path.join(ROOT, 'src', 'login'), '.html')).forEach((f) => {
  const m = read(f);
  for (const e of m.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
    searched++;
    if (!allIds.has(e[1])) fail(relative(f) + ':' + lineNo(m, e.index) + ' id missing: ' + e[1]);
  }
});
console.log('  ' + searched + ' getElementById calls, ' + allIds.size + ' defined ids');

section('3. Duplicate id');
let repeated = 0;
docIds.forEach((counter, doc) => {
  counter.forEach((n, id) => { if (n > 1) { repeated++; fail(doc + ': id ' + n + ' times defined: ' + id); } });
});
if (!repeated) console.log('  no duplicates');

// ---- 4. Tag balance ----
section('4. Tag balance (div)');
htmlFiles.forEach((f) => {
  // Comments are not counted. The counter once gave a false alarm because of comment blindness: a comment describing a layout
  // bug contained "<div>" so the file looked unbalanced.
  // A block wrapped in a comment would produce a false alarm the same way.
  const m = read(f).replace(/<!--[\s\S]*?-->/g, '');
  const ac = (m.match(/<div\b/g) || []).length;
  const close = (m.match(/<\/div>/g) || []).length;
  if (ac !== close) fail(relative(f) + ' <div> ' + ac + ' / </div> ' + close);
});
console.log('  ' + htmlFiles.length + ' pages checked');

// ---- 5. IPC match ----
section('5. IPC match');
const preload = read(path.join(ROOT, 'preload.js'));
const mainProcess = read(path.join(ROOT, 'main.js'));
const defined = new Set();
for (const e of mainProcess.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)) defined.add(e[1]);
// Events that go from the main process to the interface (ipcRenderer.on) are sent from main.js with sendRaw/send.
const sentEvents = new Set();
for (const e of mainProcess.matchAll(/send(?:Raw)?\(\s*'([^']+)'/g)) sentEvents.add(e[1]);
// Per-account jobs send their events with accountBroadcast(...)('channel', ...) or broadcast('channel', ...);
// FarmController sends its own 'farm:tick' event with emit. Those count as sent too.
for (const e of mainProcess.matchAll(/(?:accountBroadcast\([^)]*\)|broadcast)\(\s*'([^']+)'/g)) sentEvents.add(e[1]);
for (const e of mainProcess.matchAll(/JOB_CHANNELS\s*=\s*\[([^\]]*)\]/g)) {
  for (const k of e[1].matchAll(/'([^']+)'/g)) sentEvents.add(k[1]);
}
for (const e of read(path.join(ROOT, 'src', 'core', 'farmController.js')).matchAll(/this\.emit\(\s*'([^']+)'/g)) sentEvents.add(e[1]);
let calls = 0;
for (const e of preload.matchAll(/ipcRenderer\.(invoke|send)\(\s*'([^']+)'/g)) {
  calls++;
  if (!defined.has(e[2])) fail('preload.js:' + lineNo(preload, e.index) + ' has no counterpart in main.js: ' + e[2]);
}
for (const e of preload.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)) {
  calls++;
  if (!sentEvents.has(e[1])) warn('preload.js:' + lineNo(preload, e.index) + ' main.js never sends this event: ' + e[1]);
}
console.log('  ' + calls + ' channels, main.js defines ' + defined.size + ' handlers');

// ---- 6. Long dash ----
section('6. Long dash (em/en dash)');
let dash = 0;
// Dictionaries (.json) and documents (.md) are scanned too: seven long dashes stayed unnoticed in the Russian dictionary
// because of this.
files(ROOT, '.js').concat(files(ROOT, '.html'), files(ROOT, '.css'), files(ROOT, '.json'), files(ROOT, '.md')).forEach((f) => {
  if (isSelf(f)) return;
  const m = read(f);
  for (const e of m.matchAll(/[–—]/g)) { dash++; fail(relative(f) + ':' + lineNo(m, e.index) + ' long dashes'); }
});
if (!dash) console.log('  clean');

// ---- 7. Author trace ----
section('7. Author traces');
const FORBIDDEN = /claude|anthropic|copilot|chatgpt|openai|gemini|cursor\.so|scratchpad/i;
let trace = 0;
files(ROOT, '.js').concat(files(ROOT, '.html'), files(ROOT, '.css'), files(ROOT, '.json')).forEach((f) => {
  if (isSelf(f) || relative(f).startsWith('package-lock')) return;
  const m = read(f);
  m.split('\n').forEach((line, i) => {
    if (FORBIDDEN.test(line)) { trace++; fail(relative(f) + ':' + (i + 1) + ' ' + line.trim().slice(0, 100)); }
  });
});
// Local path leak: the distributed source must not contain the development machine's drive path.
files(path.join(ROOT, 'src'), '.js').forEach((f) => {
  const m = read(f);
  for (const e of m.matchAll(/[A-Z]:\\(?:Coding|Users)\\/g)) { trace++; fail(relative(f) + ':' + lineNo(m, e.index) + ' local paths'); }
});
if (!trace) console.log('  clean');

// ---- 8. Dead setting key ----
// A key that sits in the default settings but is read nowhere. "ignoreUpdates" was found this way
// in 1.1.2: it had a button in the interface and no counterpart in the engine, the user turned it on and
// off and nothing happened. Hard to notice by hand, easy to scan for.
section('8. Dead setting key');
{
  const main = read(path.join(ROOT, 'main.js'));
  const block = main.match(/const VARSAYILAN_AYARLAR\s*=\s*\{([\s\S]*?)\n\};/)
            || main.match(/const DEFAULT_SETTINGS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    console.log('  default settings block not found, skipped');
  } else {
    const keys = [...block[1].matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
    // Everywhere in the whole source where the key appears (except the defaults block)
    const body = files(ROOT, '.js')
      .concat(files(ROOT, '.html'))
      .filter((f) => !isSelf(f) && !relative(f).startsWith('package-lock'))
      .map((f) => (relative(f) === 'main.js' ? main.replace(block[0], '') : read(f)))
      .join('\n');
    const dead = keys.filter((k) => {
      const re = new RegExp('[."\'\\[]' + k + '\\b');
      return !re.test(body);
    });
    if (dead.length) {
      dead.forEach((k) => warn('unread setting: ' + k));
      console.log('  ' + keys.length + ' keys, ' + dead.length + ' of them are never read');
    } else {
      console.log('  ' + keys.length + ' keys, all of them are used');
    }
  }
}

// ---- 9. Unanswered IPC channel ----
// If preload.js opens a channel but main.js does not answer it, the call is silently rejected and the
// interface says "could not be fetched". The reverse happens too: a handler sits in main and nobody calls it.
section('9. IPC channel without a counterpart');
{
  const on = read(path.join(ROOT, 'preload.js'));
  const main = read(path.join(ROOT, 'main.js'));
  const called = new Set([...on.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g)].map((m) => m[1]));
  const listened = new Set([...on.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)].map((m) => m[1]));
  const matched = new Set([...main.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)].map((m) => m[1]));
  const dispatched = new Set([...main.matchAll(/sendRaw\(\s*'([^']+)'|webContents\.send\(\s*'([^']+)'/g)]
    .map((m) => m[1] || m[2]).filter(Boolean));

  const missingHandler = [...called].filter((k) => !matched.has(k));
  missingHandler.forEach((k) => fail('preload calls, main does not handle: ' + k));

  // For listened events: a dead listener if main never sends it
  const unsentEvent = [...listened].filter((k) => !dispatched.has(k) && !main.includes("'" + k + "'"));
  unsentEvent.forEach((k) => warn('preload listens, main never sends: ' + k));

  if (!missingHandler.length && !unsentEvent.length) {
    console.log('  ' + called.size + ' calls + ' + listened.size + ' events, all have a counterpart');
  }
}

// ---- summary ----
console.log('\n================================');
console.log('ERRORS  : ' + errorCount);
console.log('WARNINGS: ' + warnCount);
console.log(errorCount ? 'RESULT  : FAILED' : 'RESULT  : PASSED');
process.exit(errorCount ? 1 : 0);
