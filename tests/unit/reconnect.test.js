// The reconnect loop of src/core/steamEngine.js on a fake clock, with a stand-in for steam-user that behaves as the real one around a connection
// (fake-steam-user.js): a drop of three hours, attempts that never answer, a wake from sleep, a first logon without network, the attempt limit, and a loop
// that stopped somewhere. What is checked: it connects again soon after the network is back, never with two sessions, never with a logOn on a busy instance,
// and a drop is told once, not on every failed attempt.
// Run with `npm test` (tests/run.js).
let now = 1000000000000, timers = [], nextId = 1;
const add = (fn, ms, every) => { const id = nextId++; timers.push({ id, at: now + Math.max(0, ms || 0), fn, every }); return { id, unref() {}, ref() {} }; };
const clear = (h) => { const id = h && h.id != null ? h.id : h; timers = timers.filter((t) => t.id !== id); };
global.setTimeout = (fn, ms) => add(fn, ms, 0);
global.setInterval = (fn, ms) => add(fn, ms, ms);
global.clearTimeout = clear;
global.clearInterval = clear;
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } };
async function advance(ms) {
  const end = now + ms;
  for (let guard = 0; guard < 500000; guard++) {
    await new Promise((r) => setImmediate(r));
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    now = Math.max(now, t.at);
    if (t.every) t.at = now + t.every; else timers.shift();
    t.fn();
  }
  now = end;
  await new Promise((r) => setImmediate(r));
}
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const { createFakeSteam, loadEngine } = require('./fake-steam-user.js');
const MIN = 60000, H = 3600000;

async function setup() {
  timers = [];
  const { FakeSteamUser, net } = createFakeSteam();
  const SteamEngine = loadEngine(FakeSteamUser, process.env.ENGINE_FILE);
  const eng = new SteamEngine();
  const statuses = [];
  eng.onStatus = (st, x) => statuses.push(Object.assign({ st, at: now }, x));
  const p = eng.logOn('account', false);
  await advance(2000);
  await p;
  return { eng, net, statuses, count: (st) => statuses.filter((x) => x.st === st).length };
}
const connectedAfter = async (t, limit) => { const start = now; while (now - start < limit) { if (t.eng.isConnected) return now - start; await advance(1000); } return t.eng.isConnected ? now - start : null; };

(async () => {
  // ---- a drop of three hours ----
  let t = await setup();
  check('logged on', t.eng.isConnected && t.net.live() === 1);
  t.net.drop(false);
  await advance(3 * H);
  check('three hours without network: still trying (a wait or an attempt is always under way)', !t.eng.isConnected && (t.eng._reconnectTimer || t.eng._attemptTimer) && t.eng.reconnecting(), String(t.statuses.slice(-1)[0] && t.statuses.slice(-1)[0].st));
  check('the drop was told once, the failed attempts did not say "dropped" again', t.count('dropped') === 1, String(t.count('dropped')));
  t.net.restore();
  let took = await connectedAfter(t, 5 * MIN);
  check('the network is back: connected again within two minutes', took != null && took <= 2 * MIN, took == null ? 'never' : (took / 1000) + ' s');
  check('one session on Steam, no logOn on a busy instance', t.net.live() === 1 && t.net.uncaught.length === 0, t.net.live() + ' sessions, ' + JSON.stringify(t.net.uncaught));
  check('and the page is told it is back', t.statuses.slice(-1)[0].st === 'connected' && t.statuses.slice(-1)[0].reconnected === true);

  // ---- attempts that never answer (a socket left half open by a sleep) ----
  t = await setup();
  t.net.drop(true);
  await advance(MIN);
  t.net.restore();
  took = await connectedAfter(t, 5 * MIN);
  check('an attempt that never answers is thrown away at its deadline and a fresh one connects (before 1.7.8 this waited for ever)', took != null && took <= 2 * MIN + 5000, took == null ? 'never' : (took / 1000) + ' s');
  check('still one session, nothing thrown', t.net.live() === 1 && t.net.uncaught.length === 0);

  // ---- a wake from sleep: no waiting out the backoff ----
  t = await setup();
  t.net.drop(true);
  await advance(10 * MIN);
  t.net.restore();
  t.eng.retryNow();
  took = await connectedAfter(t, 5 * MIN);
  check('woken up: it tries at once instead of waiting for the next attempt', took != null && took <= 5000, took == null ? 'never' : (took / 1000) + ' s');

  // ---- the first logon fails (no network when the app starts) ----
  timers = [];
  {
    const { FakeSteamUser, net } = createFakeSteam();
    const SteamEngine = loadEngine(FakeSteamUser, process.env.ENGINE_FILE);
    const eng = new SteamEngine();
    const statuses = [];
    eng.onStatus = (st, x) => statuses.push(Object.assign({ st }, x));
    net.up = false;
    let failed = false;
    eng.logOn('account', false).catch(() => { failed = true; });
    await advance(30000);
    check('no network at start: the first logon fails', failed && !eng.isConnected);
    eng.startReconnecting('account', false);
    await advance(20 * MIN);
    check('it keeps trying in the background', eng.reconnecting() && !eng.isConnected);
    net.restore();
    const start = now;
    while (!eng.isConnected && now - start < 5 * MIN) await advance(1000);
    const last = statuses.filter((x) => x.st === 'connected').slice(-1)[0];
    check('the network comes: connected, and it says this is the first session (main then resumes the jobs)', eng.isConnected && last && last.first === true && now - start <= 2 * MIN, ((now - start) / 1000) + ' s, ' + JSON.stringify(last));
    check('one session, nothing thrown', net.live() === 1 && net.uncaught.length === 0);
  }

  // ---- a loop that stopped somewhere: the heartbeat starts it again ----
  t = await setup();
  t.net.drop(true);           // the attempt under way hangs, so nothing but the heartbeat can bring it back
  await advance(10000);
  clearTimeout(t.eng._reconnectTimer); t.eng._reconnectTimer = null;
  clearTimeout(t.eng._attemptTimer); t.eng._attemptTimer = null;
  t.net.restore();
  took = await connectedAfter(t, 5 * MIN);
  check('no wait and no attempt under way while not connected: the heartbeat starts the loop again', took != null && took <= 2 * MIN + 5000, took == null ? 'never' : (took / 1000) + ' s');

  // ---- a limit in the settings (3 attempts): quick attempts, then every five minutes, never given up ----
  t = await setup();
  t.eng.reconnectLimit = 3;
  t.net.drop(false);
  await advance(2 * H);
  const tries = t.statuses.filter((x) => x.st === 'connecting' && !x.trying);
  check('3 attempts: after them it does not give up, it goes on every five minutes (before 1.7.8 it stopped for good)', !t.eng.gaveUp && t.count('abandoned') === 0 && tries.length > 20 && tries.slice(4).every((x) => x.slow && x.waitMs === 5 * MIN), tries.length + ' waits, last ' + JSON.stringify(tries.slice(-1)[0] && { n: tries.slice(-1)[0].attemptCount, w: tries.slice(-1)[0].waitMs }));
  t.net.restore();
  took = await connectedAfter(t, 10 * MIN);
  check('the network is back after two hours: connected within the five minutes', took != null && took <= 5 * MIN + 5000, took == null ? 'never' : (took / 1000) + ' s');
  t = await setup();
  t.eng.reconnectLimit = 3;
  t.net.drop(false);
  await advance(30 * MIN);
  t.net.restore();
  t.eng.retryNow();
  took = await connectedAfter(t, MIN);
  check('in the five minute waits a wake still tries at once', took != null && took <= 5000, took == null ? 'never' : (took / 1000) + ' s');

  // ---- reconnecting off in the settings ----
  t = await setup();
  t.eng.reconnectLimit = 0;
  t.net.drop(false);
  await advance(2000);
  check('"Off": no attempt, it says so', t.eng.gaveUp && t.count('abandoned') === 1 && !t.statuses.some((x) => x.st === 'connecting'));
  const before = t.statuses.length;
  t.net.restore();
  t.eng.retryNow();
  await advance(10 * MIN);
  check('"Off": a wake does not start it either (only the Reconnect button)', !t.eng.isConnected && t.statuses.length === before);
  t.eng.tryReconnect(true);
  took = await connectedAfter(t, 2 * MIN);
  check('the Reconnect button connects it at once', took != null && took <= 5000, took == null ? 'never' : (took / 1000) + ' s');

  // ---- another session takes the account over: no fight ----
  t = await setup();
  const other = new (t.eng.user.constructor)();
  other.logOn({ refreshToken: 'account' });
  await advance(2000);
  check('the account was opened elsewhere: it stops and says why, no attempt follows', t.eng.permanentDisconnect && !t.eng.reconnecting() && t.statuses.slice(-1)[0].st === 'abandoned');
  await advance(30 * MIN);
  check('half an hour later the other session is still the only one', t.net.live() === 1 && t.net.sessions.get('account') === other);
  process.exit(failures ? 1 : 0);
})();
