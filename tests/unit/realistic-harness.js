// Shared by the Realistic Mode scenario tests: the run code of main.js (realisticStatus .. realisticFinish, realisticOptions .. realisticStartFor) in a vm,
// with a fake clock, fake timers, a fake engine and a fake achievement schema. Not a test itself (the runner only takes *.test.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const code = src.slice(src.indexOf('function realisticStatus(steamID)'), src.indexOf('// Prepares a game\'s unlockable achievement queue'));
const startCode = src.slice(src.indexOf('function realisticOptions(s)'), src.indexOf("ipcMain.handle('realistic:start'"));
const HOUR = 3600000;

function createHarness() {
  const h = { now: 1000000000000, timers: [], nextTimer: 1, accounts: new Map(), ticks: [], logs: [], feeds: [], resumed: [], unlocks: [], accountsData: new Map(), schemas: new Map(), plays: [] };
  const fakeSetTimeout = (fn, ms) => { const id = h.nextTimer++; h.timers.push({ id, at: h.now + Math.max(0, ms || 0), fn }); return id; };
  const fakeClearTimeout = (id) => { h.timers = h.timers.filter((t) => t.id !== id); };
  h.advance = async (ms) => {
    const end = h.now + ms;
    for (let guard = 0; guard < 200000; guard++) {
      h.timers.sort((a, b) => a.at - b.at);
      const t = h.timers[0];
      if (!t || t.at > end) break;
      h.timers.shift();
      h.now = Math.max(h.now, t.at);
      t.fn();
      await new Promise((r) => setImmediate(r));
    }
    h.now = end;
  };
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(h.now); } static now() { return h.now; } }
  // a game: total achievements, how many are open, rarity from common to rare; ultra rare are the last tenth
  h.game = (appid, total, unlocked) => {
    h.schemas.set(appid, Array.from({ length: total }, (_, i) => ({ apiName: 'A' + i, name: appid + '-' + i, rarityPct: 90 - (i * 85) / total, achieved: i < unlocked, protectedFlag: false })));
  };
  h.engine = (opts) => {
    const o = opts || {};
    const e = { stopped: [], setAchievements: async (appid, list) => {
      if (o.failOn && o.failOn.includes(appid + ':' + list[0].apiName)) throw new Error('EResult 8');
      const sch = h.schemas.get(appid);
      const a = sch && sch.find((x) => x.apiName === list[0].apiName);
      h.unlocks.push({ appid, apiName: list[0].apiName, at: h.now, wasOpen: !!(a && a.achieved) });
      if (a) a.achieved = true;
    }, play: (ids, why) => h.plays.push({ ids: ids.slice(), why }), stop: (why) => e.stopped.push(why) };
    return e;
  };
  const ctx = {
    accounts: h.accounts, activeSteamID: 'a',
    accountBroadcast: () => (channel, payload) => { if (channel === 'realistic:tick') h.ticks.push(payload); },
    log: (l, m) => h.logs.push(l + ' ' + m), accountName: (i) => i,
    accountData: (id) => { if (!h.accountsData.has(id)) h.accountsData.set(id, { achLog: [] }); return h.accountsData.get(id); },
    writeAccountDataDelayed: () => {}, addFeed: (id, e) => h.feeds.push([id, e]), resumeFarm: (id) => h.resumed.push(id),
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, Date: FakeDate,
    require: (p) => require(p.startsWith('.') ? path.resolve(ROOT, p) : p),
    console, Promise, Math: Object.assign(Object.create(Math), { random: () => h.random == null ? 0.5 : h.random() }), Number, String, Map, Set, Object, Array, JSON, RegExp, Error,
    ipcMain: { handle: () => {}, on: () => {} }, engineReady: true, engine: null, settingFor: () => false, delayFarm: () => {},
    markNoAchievements: () => {}, ownedGameName: () => null,
    // the schema as Steam gives it now (what was unlocked earlier is "achieved")
    prepareRealisticQueue: null,
  };
  vm.createContext(ctx);
  // the real prepareRealisticQueue of main.js, fed by the fake schema
  const prepCode = src.slice(src.indexOf('async function prepareRealisticQueue(motor, appid, options)'), src.indexOf('// The completed form of the incoming options'));
  vm.runInContext(code + '\n' + prepCode + '\n' + startCode + '\n;this.api = { realisticStep, realisticNextGame, realisticFinish, realisticNotify, realisticNextDelay, realisticStatus, realisticOptions, realisticStartFor, prepareRealisticQueue };', ctx);
  h.api = ctx.api;
  h.ctx = ctx;
  h.account = (id, opts) => {
    const engine = h.engine(opts && opts.engine);
    engine.getAchievements = async (appid) => {
      const sch = h.schemas.get(appid);
      return sch ? { gameName: 'Game ' + appid, rarityOk: true, achievements: sch.map((x) => Object.assign({}, x)) } : null;
    };
    const s = Object.assign({ id, ready: true, engine, realistic: null }, (opts && opts.slot) || {});
    h.accounts.set(id, s);
    return s;
  };
  h.lastTick = () => h.ticks[h.ticks.length - 1];
  h.HOUR = HOUR;
  return h;
}
module.exports = { createHarness, HOUR };
