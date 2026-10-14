// Family View PIN and proxy address sealed in the account files.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, safeStorage } = require('electron');
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const code = [cut('const corruptFiles = new Set();', '// Files that could not be read at startup are collected here'),
  cut('// ---- LOGIN TOKEN PROTECTION ----', '// Makes this account the active session'),
  "const ACCOUNT_DIR = path.join(CONFIG_DIR, 'accounts');",
  cut('const ACCOUNT_SETTING_KEYS', 'function flushPendingWrites')].join(String.fromCharCode(10));
app.whenReady().then(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-acc-'));
  const ctx = { fs, path, CONFIG_DIR: dir, ACCOUNT_DIR_X: 0, safeStorage, Buffer, readErrors: [], settings: { protectTokens: false }, log: (l, m) => console.log('  log ' + l + ': ' + m), console, setTimeout, clearTimeout,
    migrateKeys: require(ROOT + '/src/core/keyMigration').migrateKeys, process, DEFAULT_STATS: {}, DEFAULT_ACCOUNT_DATA_X: 0 };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.api={accountData,writeAccountData,rewriteTokenFiles,accountDataAll};', ctx);
  const A = ctx.api; const f = path.join(dir, 'accounts', '123.json'); const read = () => fs.readFileSync(f, 'utf8');
  const d = A.accountData('123'); d.parentalPin = '4321'; d.proxyUrl = 'http://u:SECRETPW@h:8080'; A.writeAccountData('123');
  console.log('plain when off      :', read().includes('4321') && read().includes('SECRETPW'));
  ctx.settings.protectTokens = true; A.rewriteTokenFiles();
  console.log('sealed when on      :', !read().includes('4321') && !read().includes('SECRETPW') && read().includes('enc1:'), '| bak gone', !fs.existsSync(f + '.bak'));
  A.writeAccountData('123');
  console.log('stays sealed on save:', !read().includes('SECRETPW'), '| bak sealed', !fs.existsSync(f + '.bak') || !fs.readFileSync(f + '.bak', 'utf8').includes('SECRETPW'));
  A.accountDataAll.clear(); const e = A.accountData('123');
  console.log('reads back          :', e.parentalPin === '4321' && e.proxyUrl === 'http://u:SECRETPW@h:8080');
  ctx.settings.protectTokens = false; A.rewriteTokenFiles();
  console.log('back to plain       :', read().includes('4321'));
  app.exit(0);
});
