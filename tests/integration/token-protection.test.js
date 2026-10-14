// Login token sealing with the real Electron safeStorage (Windows DPAPI).
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, safeStorage } = require('electron');
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const io = src.slice(src.indexOf('const corruptFiles = new Set();'), src.indexOf('// Files that could not be read at startup are collected here'));
const tok = src.slice(src.indexOf('// ---- LOGIN TOKEN PROTECTION ----'), src.indexOf('// Makes this account the active session'));
const mk = src.slice(src.indexOf('function makeActiveSession(entry) {'), src.indexOf('// Fixed startup size'));
app.whenReady().then(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-tok-'));
  const logs = []; const readErrors = [];
  const ctx = { fs, path, CONFIG_DIR: dir, safeStorage, Buffer, readErrors, settings: { protectTokens: false }, log: (l, m) => logs.push(l + ': ' + m), console,
    migrateKeys: require(ROOT + '/src/core/keyMigration').migrateKeys, process };
  vm.createContext(ctx);
  vm.runInContext(io + '\n' + tok + '\n' + mk + '\n;this.api={loadAccounts,saveAccounts,hasSession,makeActiveSession,rewriteTokenFiles,openToken,sealIfEnabled,tokenProtectionAvailable};', ctx);
  const A = ctx.api;
  console.log('available:', A.tokenProtectionAvailable());
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  // a plain login (what steamAuth writes)
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([{ accountName: 'a', steamID: '1', refreshToken: 'TOKEN-ONE' }, { accountName: 'b', steamID: '2', refreshToken: 'TOKEN-TWO' }], null, 2));
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ accountName: 'a', steamID: '1', refreshToken: 'TOKEN-ONE' }));
  fs.writeFileSync(path.join(dir, 'accounts.json.bak'), 'TOKEN-ONE old copy');
  console.log('plain read     :', A.loadAccounts().map((a) => a.refreshToken).join(), '|', A.hasSession().refreshToken);
  ctx.settings.protectTokens = true; A.rewriteTokenFiles();
  console.log('sealed on disk :', !read('accounts.json').includes('TOKEN-') && !read('session.json').includes('TOKEN-'), '| prefix', read('accounts.json').includes('enc1:'), '| bak removed', !fs.existsSync(path.join(dir, 'accounts.json.bak')));
  console.log('sealed read    :', A.loadAccounts().map((a) => a.refreshToken).join(), '|', A.hasSession().refreshToken);
  // saving again keeps it sealed, adding a new plain entry (as steamAuth does) gets sealed by the rewrite
  const raw = JSON.parse(read('accounts.json')); raw.push({ accountName: 'c', steamID: '3', refreshToken: 'TOKEN-THREE' });
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(raw));
  A.rewriteTokenFiles();
  console.log('new login sealed:', !read('accounts.json').includes('TOKEN-THREE'), '|', A.loadAccounts().map((a) => a.refreshToken).join());
  A.makeActiveSession({ accountName: 'b', steamID: '2', refreshToken: 'TOKEN-TWO' });
  console.log('active session  :', !read('session.json').includes('TOKEN-TWO'), '|', A.hasSession().refreshToken);
  // sealed for someone else: break the base64
  const bad = JSON.parse(read('accounts.json')); bad[0].refreshToken = 'enc1:' + Buffer.from('not a real dpapi blob').toString('base64');
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(bad));
  const l = A.loadAccounts();
  console.log('foreign sealed  :', l[0].locked === true, l[1].locked === undefined, '| other still opens:', l[1].refreshToken);
  A.saveAccounts(l);
  console.log('locked kept on save:', JSON.parse(read('accounts.json'))[0].refreshToken.startsWith('enc1:'), JSON.parse(read('accounts.json'))[0].locked === undefined);
  // switch off: everything plain again, nothing lost
  ctx.settings.protectTokens = false; fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(JSON.parse(read('accounts.json')).slice(1)));
  A.rewriteTokenFiles();
  console.log('switched off    :', read('accounts.json').includes('TOKEN-TWO') && read('accounts.json').includes('TOKEN-THREE'), '|', read('session.json').includes('TOKEN-TWO'));
  console.log('logs:', logs.join(' / '));
  app.exit(0);
});
