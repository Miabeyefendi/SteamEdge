// A game of the account opened on another device (the Steam client) while SteamEdge plays its jobs' games. Steam lets one session play: it logs off the one
// that opens games over the other with LoggedInElsewhere. Up to 1.8.1 the engine took that for a drop, logged on again in five seconds and opened its games,
// and was logged off again: a logon every six seconds for as long as the user played (seen on a real account). Checked: the session comes back once, no game is
// sent while the other device plays, the games open again when it stops, and a session that never hears from Steam tries again after two minutes, not six seconds.
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

async function setup() {
  timers = [];
  const { FakeSteamUser, net } = createFakeSteam();
  const SteamEngine = loadEngine(FakeSteamUser, process.env.ENGINE_FILE, net);
  const eng = new SteamEngine();
  const told = [];
  eng.onPlaying = (blocked, appid) => told.push({ blocked, appid });
  const p = eng.logOn('account', 'online');
  await advance(2000);
  await p;
  eng.play([440, 570], 'card');
  await advance(1000);
  return { eng, net, told };
}
const sentSince = (net, t) => net.played.filter((x) => x.at >= t && x.ids.length);

(async () => {
  // ---- the user opens a game in the Steam client and plays it for ten minutes ----
  let t = await setup();
  const logonsBefore = t.net.logons;
  const from = now;
  t.net.otherDevice(true);
  await advance(10 * 60000);
  check('the session came back once, not a logon every six seconds (1.8.1: about a hundred)', t.net.logons - logonsBefore === 1, (t.net.logons - logonsBefore) + ' logons');
  check('still connected for everything else (inventory, market, chat)', t.eng.isConnected);
  check('no game was sent while the other device played', sentSince(t.net, from + 1).length === 0, JSON.stringify(sentSince(t.net, from + 1).map((x) => x.ids)));
  check('the engine knows and tells main', t.eng.playingBlocked === true && t.told.some((x) => x.blocked));
  t.eng.play([440, 570, 730], 'hours');
  check('a job that starts meanwhile is kept, not sent', t.eng.playing.length === 3 && sentSince(t.net, from + 1).length === 0);
  const ends = now;
  t.net.otherDevice(false);
  await advance(2000);
  const back = sentSince(t.net, ends);
  check('the other game ends: the games open again at once', back.length >= 1 && back[0].ids.join() === '440,570,730', JSON.stringify(back.map((x) => x.ids)));
  check('and main is told', t.told.length >= 2 && t.told[t.told.length - 1].blocked === false);
  check('no new logon for that', t.net.logons - logonsBefore === 1);

  // ---- Steam says nothing to the new session: it tries again after two minutes, once ----
  t = await setup();
  const l2 = t.net.logons;
  t.net.otherDevice(true, true);
  await advance(30000);
  check('silent Steam: kicked once, back once', t.net.logons - l2 === 1, (t.net.logons - l2) + ' logons');
  await advance(10 * 60000);
  const tries = t.net.logons - l2;
  check('ten minutes of a silent Steam: a try every two minutes or so, not every six seconds', tries >= 2 && tries <= 7, tries + ' logons');
  t.net.otherDevice(false, true);
  await advance(4 * 60000);
  check('the other game ended (still silent): the games are open again within the wait', t.eng.isConnected && !t.eng.playingBlocked && t.eng.user.played && t.eng.user.played.length === 2,
    JSON.stringify(t.eng.user.played));

  // ---- a plain drop is still a drop: the games open again as before ----
  t = await setup();
  const d0 = now;
  t.net.drop(false);
  await advance(20000);
  t.net.restore();
  for (let i = 0; i < 120 && !t.eng.isConnected; i++) await advance(1000);
  check('a network drop: the games are sent again after the reconnect', t.eng.isConnected && !t.eng.playingBlocked && sentSince(t.net, d0).length >= 1);

  process.exit(failures ? 1 : 0);
})();
