// Realistic Mode schedule: the time range, repeating the last start made by hand, cutting the run to what is left of the range,
// leaving a busy account alone, and stopping only what the schedule started.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name); };
const code = src.slice(src.indexOf('// { key, endsInMs } while the clock'), src.indexOf('// The same order the Card farming page uses')) + '\n'
  + src.slice(src.indexOf('// Realistic Mode by itself:'), src.indexOf('app.whenReady().then(() => {\n  const setup'));

const day = (t) => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const started = [], finished = [], logs = [], events = [];
let clock = new Date(2026, 9, 10, 23, 0, 0);
const accounts = new Map();
const accountsData = new Map();
const ctx = {
  settings: { grScheduleEnabled: true, grScheduleFrom: '22:00', grScheduleTo: '07:00' },
  accounts, dayKey: day, log: (l, m) => logs.push(m), accountName: (i) => i, accountEvent: (i, e) => events.push([i, e.typeName]),
  accountRunning: (s) => !!s.realistic || !!(s.farm && s.farm.running), accountData: (id) => accountsData.get(id) || {},
  realisticStartFor: async (id, req, fromSchedule) => { started.push({ id, req, fromSchedule }); accounts.get(id).realistic = {}; return { ok: true, gameCount: req.gameEntries.length }; },
  realisticFinish: (id, cause) => { finished.push([id, cause]); accounts.get(id).realistic = null; },
  Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.getTime()); } },
  console, Promise, Math, Number, String, Map, Set,
};
vm.createContext(ctx);
vm.runInContext(code + '\n;this.api = { scheduleWindow, realisticScheduleTick };', ctx);
const { scheduleWindow, realisticScheduleTick } = ctx.api;
const settle = () => new Promise((r) => setTimeout(r, 20));
const at = (h, m, d) => new ctx.Date(2026, 9, d || 10, h, m, 0);

// the window and the time left in it
const w1 = scheduleWindow(at(23, 0), '22:00', '07:00');
check('23:00 is inside 22:00 - 07:00 with 8 hours left', w1 && w1.key === '2026-10-10' && w1.endsInMs === 8 * 3600000);
const w2 = scheduleWindow(at(3, 30, 11), '22:00', '07:00');
check('03:30 belongs to the window that opened yesterday, 3.5 hours left', w2 && w2.key === '2026-10-10' && w2.endsInMs === 3.5 * 3600000);
check('12:00 is outside', scheduleWindow(at(12, 0), '22:00', '07:00') === null);
check('a same-day window works', scheduleWindow(at(10, 0), '09:00', '17:30').endsInMs === 7.5 * 3600000);
check('an empty window is off', scheduleWindow(at(9, 0), '09:00', '09:00') === null);

(async () => {
  accounts.set('a', { ready: true, engine: {} });
  accountsData.set('a', { grLastRun: { gameEntries: [10, 20], spanMs: 12 * 3600000, optionList: { model: 'pareto' } } });
  clock = at(23, 0);
  realisticScheduleTick(); await settle();
  check('starts the last setup by itself', started.length === 1 && started[0].fromSchedule === true && started[0].req.gameEntries.join() === '10,20' && started[0].req.optionList.model === 'pareto');
  check('the run is cut to the 8 hours left in the range', started[0].req.spanMs === 8 * 3600000);
  check('the feed and notification event was sent', events.some((e) => e[0] === 'a' && e[1] === 'realisticStarted'));
  realisticScheduleTick(); await settle();
  check('not started twice in the same range', started.length === 1);
  clock = at(7, 0, 11); realisticScheduleTick();
  check('stopped when the range closes', finished.length === 1 && finished[0][0] === 'a' && finished[0][1] === 'schedule');
  clock = at(22, 30, 11); realisticScheduleTick(); await settle();
  check('starts again in the next range', started.length === 2);
  clock = at(7, 0, 12); realisticScheduleTick();

  // a run started by hand is not stopped by the schedule
  accounts.get('a').realistic = {}; finished.length = 0; started.length = 0; accounts.get('a').grScheduleKey = null; accounts.get('a').grScheduleStarted = false;
  clock = at(23, 0, 12); realisticScheduleTick(); await settle();
  check('a run already going is left alone', started.length === 0);
  clock = at(7, 0, 13); realisticScheduleTick();
  check('and not stopped at the end of the range', finished.length === 0);

  // busy account and missing setup
  accounts.set('b', { ready: true, engine: {}, farm: { running: true } }); accountsData.set('b', { grLastRun: { gameEntries: [1], spanMs: 3600000 } });
  accounts.set('c', { ready: true, engine: {} }); accountsData.set('c', {});
  accounts.get('a').realistic = null;
  clock = at(23, 0, 13); started.length = 0; events.length = 0;
  realisticScheduleTick(); await settle();
  check('an account with card farming running is not started', !started.some((s) => s.id === 'b'));
  check('an account with no saved setup is not started and gets a note', !started.some((s) => s.id === 'c') && events.some((e) => e[0] === 'c'));

  // switched off
  ctx.settings.grScheduleEnabled = false; started.length = 0;
  accounts.get('a').grScheduleKey = null; clock = at(23, 0, 14);
  realisticScheduleTick(); await settle();
  check('does nothing while switched off', started.length === 0);
  process.exit(failures ? 1 : 0);
})();
