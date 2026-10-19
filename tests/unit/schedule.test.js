// Card farming schedule windows and start/stop rules, plus the engine proxy options.
// Run with `npm test` (tests/run.js).
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const E = require(ROOT + '/src/core/steamEngine');
let fails = 0; const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
// engine proxy
const e1 = new E(); e1.setProxy('socks5://u:p@10.0.0.1:1080'); ok('engine socks option', e1.user.options.socksProxy === 'socks5h://u:p@10.0.0.1:1080' && !e1.user.options.httpProxy, e1.user.options.socksProxy);
const e2 = new E(); e2.setProxy('10.0.0.2:3128'); ok('engine http option', e2.user.options.httpProxy === 'http://10.0.0.2:3128', e2.user.options.httpProxy);
const e3 = new E(); e3.setProxy(''); ok('engine direct', !e3.user.options.httpProxy && !e3.user.options.socksProxy && e3._proxy === null);
let thrown = null; try { new E().setProxy('ftp://x:1'); } catch (e) { thrown = e; } ok('engine rejects bad address', !!thrown);
// scheduler functions from main.js
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const a = src.indexOf('// ---- CARD FARMING SCHEDULE ----'), b = src.indexOf('app.whenReady().then(() => {\n  const setup');
const block = src.slice(a, b);
const logs = [], events = [], started = [], stopped = [];
const now = { v: new Date(2026, 9, 10, 23, 0) };
const accounts = new Map();
const mkAcc = (extra) => Object.assign({ ready: true, engine: { getDropGames: async () => [
  { appid: 1, name: 'A', remaining: 3 }, { appid: 2, name: 'B', remaining: 1 }, { appid: 3, name: 'C', remaining: 2 }, { appid: 4, name: 'D', remaining: 5 }],
  getOwnedGames: async () => [{ appid: 1, playtimeForever: 500 }, { appid: 2, playtimeForever: 0 }, { appid: 3, playtimeForever: 100 }, { appid: 4, playtimeForever: 900 }] },
  farm: null, pendingFarm: null }, extra || {});
const ctx = { settings: { farmScheduleEnabled: true, farmScheduleFrom: '22:00', farmScheduleTo: '07:00', cardPriorityMode: 'least', farmMaxMinutes: 7, farmSkipUnplayed: false },
  accounts, log: (l, m) => logs.push(m), accountName: (id) => id, accountEvent: (id, ev) => events.push([id, ev.typeName]),
  accountRunning: (s) => !!(s.farm && s.farm.running) || !!s.realistic, accountData: () => ({ farmExcluded: [3], farmWhitelist: [], farmWhitelistOnly: false, entries: { 'cards.queue': { v: { order: [4, 1] } } } }),
  dayKey: (t) => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  startCardFarm: (id, mode, games, dur) => { started.push({ id, mode, games: games.map((g) => g.appid), dur }); const s = accounts.get(id); s.farm = { running: true, stop: (c) => { stopped.push([id, c]); s.farm.running = false; } }; return true; },
  Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now.v.getTime()); } }, console, Promise, Math, Number, String, Map, Set };
vm.createContext(ctx);
vm.runInContext('function settingFor(id, k) { return settings[k]; }\n' + block + '\n;this.api={scheduleTick,scheduleWindowKey,orderForMode};', ctx);
const A = ctx.api;
const w = (h, m, d) => new ctx.Date(2026, 9, d || 10, h, m);
ok('window inside (23:00)', A.scheduleWindowKey(w(23, 0)) === '2026-10-10');
ok('window after midnight belongs to yesterday', A.scheduleWindowKey(w(3, 0, 11)) === '2026-10-10');
ok('outside (12:00)', A.scheduleWindowKey(w(12, 0)) === null);
ok('edge start 22:00 in / 07:00 out', A.scheduleWindowKey(w(22, 0)) !== null && A.scheduleWindowKey(w(7, 0)) === null);
ctx.settings.farmScheduleFrom = '09:00'; ctx.settings.farmScheduleTo = '17:30';
ok('same-day window', A.scheduleWindowKey(w(12, 0)) === '2026-10-10' && A.scheduleWindowKey(w(18, 0)) === null);
ctx.settings.farmScheduleTo = '09:00'; ok('empty window is off', A.scheduleWindowKey(w(9, 0)) === null);
ctx.settings.farmScheduleFrom = '22:00'; ctx.settings.farmScheduleTo = '07:00';
ok('order least', JSON.stringify(A.orderForMode([{ appid: 1, remaining: 3 }, { appid: 2, remaining: 1 }], 'least', []).map((g) => g.appid)) === '[2,1]');
ok('order priority', JSON.stringify(A.orderForMode([{ appid: 1 }, { appid: 2 }, { appid: 4 }], 'priority', [4, 1]).map((g) => g.appid)) === '[4,1,2]');
const settle = () => new Promise((r) => setTimeout(r, 20));
(async () => {
  accounts.set('s1', mkAcc()); accounts.set('s2', mkAcc({ realistic: true })); accounts.set('s3', mkAcc({ ready: false }));
  now.v = new Date(2026, 9, 10, 23, 0);
  A.scheduleTick(); await settle();
  ok('starts idle ready account only', started.length === 1 && started[0].id === 's1', JSON.stringify(started));
  ok('queue: removed filtered, mode least ordering, duration', JSON.stringify(started[0].games) === '[2,1,4]' && started[0].dur === 420000 && started[0].mode === 'least', JSON.stringify(started[0]));
  A.scheduleTick(); await settle(); ok('no second start in same window', started.length === 1);
  accounts.get('s3').ready = true; A.scheduleTick(); await settle();
  ok('late-connected account starts', started.length === 2 && started[1].id === 's3');
  // manual stop inside window: stays stopped
  accounts.get('s1').farm.running = false; A.scheduleTick(); await settle(); ok('manual stop is respected', started.length === 2);
  // window closes
  now.v = new Date(2026, 9, 11, 7, 0); A.scheduleTick();
  ok('window end stops only scheduler farms', JSON.stringify(stopped) === '[["s3","schedule"]]', JSON.stringify(stopped));
  // next night starts again
  now.v = new Date(2026, 9, 11, 22, 30); A.scheduleTick(); await settle(); ok('next window starts again', started.length === 4 || started.length === 3, started.length + ' starts');
  // manual farm is never stopped
  const s4 = mkAcc(); s4.farm = { running: true, stop: (c) => stopped.push(['s4', c]) }; accounts.clear(); accounts.set('s4', s4);
  now.v = new Date(2026, 9, 12, 2, 0); A.scheduleTick(); await settle(); now.v = new Date(2026, 9, 12, 8, 0); A.scheduleTick();
  ok('manual farm survives window end', !stopped.some((x) => x[0] === 's4'));
  // disabled
  ctx.settings.farmScheduleEnabled = false; const n = started.length; accounts.set('s5', mkAcc()); now.v = new Date(2026, 9, 12, 23, 0); A.scheduleTick(); await settle(); ok('disabled does nothing', started.length === n);
  console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
