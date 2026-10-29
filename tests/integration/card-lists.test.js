// Blacklist migration and persistence, schedule filters, hour boosting after the cards.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, safeStorage } = require('electron');
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const ROOT = require('path').resolve(__dirname, '..', '..');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const code = [cut('const corruptFiles = new Set();', '// Files that could not be read at startup are collected here'),
  cut('// ---- LOGIN TOKEN PROTECTION ----', '// Makes this account the active session'),
  "const ACCOUNT_DIR = path.join(CONFIG_DIR, 'accounts');",
  cut('const ACCOUNT_SETTING_KEYS', 'function flushPendingWrites'),
  cut('// ---- CARD FARMING SCHEDULE ----', 'app.whenReady().then(() => {\n  // The second copy'),
  cut('// "When all cards are collected" set to "Start hour boosting"', 'function farmBroadcast')].join(String.fromCharCode(10));
let fails = 0; const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-p5-'));
  fs.mkdirSync(path.join(dir, 'accounts'));
  const day = 86400000;
  // an account file from before 1.4.5: the removed games live in the queue state
  fs.writeFileSync(path.join(dir, 'accounts', '111.json'), JSON.stringify({ entries: { 'cards.queue': { v: { removed: [20, 30], order: [10] }, ts: Date.now() } }, achLog: [] }));
  const logs = [], events = [], started = [], boosted = [];
  const accounts = new Map();
  const ctx = { fs, path, CONFIG_DIR: dir, safeStorage, Buffer, readErrors: [], settings: { protectTokens: false, farmScheduleEnabled: true, farmScheduleFrom: '00:00', farmScheduleTo: '23:59', cardPriorityMode: 'sequential', farmMaxMinutes: 5, boostMaxGames: 2 },
    log: (l, m) => logs.push(m), console, setTimeout, clearTimeout, process, DEFAULT_STATS: {}, accounts, accountName: (i) => i, accountEvent: (i, e) => events.push([i, e.typeName]),
    accountRunning: (s) => !!(s.farm && s.farm.running), accountBoostRunning: () => false, dayKey: () => 'k',
    startCardFarm: (id, mode, games) => { started.push(games.map((g) => g.appid)); accounts.get(id).farm = { running: true }; return true; },
    boostStart: (id, req) => { boosted.push(req.appids); }, migrateKeys: (x) => x };
  vm.createContext(ctx);
  vm.runInContext('function settingFor(id, k) { return settings[k]; }\n' + code + '\n;this.api={accountData,writeAccountData,cleanAppIds,scheduleTick,startBoostAfterCards,accountDataAll};', ctx);
  const A = ctx.api;
  const d = A.accountData('111');
  ok('legacy removed moved to blacklist', JSON.stringify(d.farmExcluded) === '[20,30]' && d.entries['cards.queue'].v.removed.length === 0, JSON.stringify(d.farmExcluded));
  ok('queue order kept', JSON.stringify(d.entries['cards.queue'].v.order) === '[10]');
  A.writeAccountData('111'); A.accountDataAll.clear();
  const again = A.accountData('111');
  ok('blacklist survives a reload', JSON.stringify(again.farmExcluded) === '[20,30]');
  // retention pruning of the queue state must not touch the blacklist (simulate: entries wiped)
  again.entries = {}; ok('blacklist is outside the expiring entries', again.farmExcluded.length === 2);
  ok('cleanAppIds', JSON.stringify(A.cleanAppIds([5, '6', 'x', -1, 5, 1.5, null])) === '[5,6]');
  ok('two accounts do not share the list', A.accountData('222').farmExcluded !== A.accountData('333').farmExcluded);
  // scheduler uses the lists
  const eng = { getDropGames: async () => [{ appid: 10, name: 'A', remaining: 1 }, { appid: 20, name: 'B', remaining: 1 }, { appid: 40, name: 'D', remaining: 1 }], getOwnedGames: async () => [], ready: true };
  accounts.set('111', { ready: true, engine: eng, farm: null, pendingFarm: null });
  A.scheduleTick(); await new Promise((r) => setTimeout(r, 30));
  ok('schedule skips the blacklist', JSON.stringify(started[0]) === '[10,40]', JSON.stringify(started));
  accounts.get('111').scheduleKey = null; accounts.get('111').farm = null; started.length = 0;
  const acc = A.accountData('111'); acc.farmWhitelistOnly = true; acc.farmWhitelist = [40];
  A.scheduleTick(); await new Promise((r) => setTimeout(r, 30));
  ok('schedule honours whitelist-only', JSON.stringify(started[0]) === '[40]', JSON.stringify(started));
  // chaining
  const acc2 = A.accountData('444'); acc2.boostGameIds = [1, 2, 3, 99];
  accounts.set('444', { ready: true, engine: { getOwnedGames: async () => [1, 2, 3].map((i) => ({ appid: i, name: 'G' + i, playtimeForever: 5 })) } });
  await A.startBoostAfterCards('444');
  ok('boost starts with the saved list, limited, owned only', JSON.stringify(boosted[0]) === '[1,2]', JSON.stringify(boosted));
  const acc3 = A.accountData('555'); acc3.boostGameIds = [];
  accounts.set('555', { ready: true, engine: { getOwnedGames: async () => [] } });
  boosted.length = 0; await A.startBoostAfterCards('555');
  ok('empty list starts nothing and reports', boosted.length === 0 && events.some((e) => e[0] === '555'));
  console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); app.exit(fails ? 1 : 0);
});
