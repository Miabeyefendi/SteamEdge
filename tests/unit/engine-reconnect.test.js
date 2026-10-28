// A drop that Steam recovers from by itself must not leave the engine "reconnecting" for good (the strip on screen hung on it after the connection was back).
// Run with `npm test` (tests/run.js).
const SteamEngine = require('../../src/core/steamEngine.js');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

function engine(online) {
  const e = Object.create(SteamEngine.prototype);
  const log = { status: [], logOn: 0, webLogOn: 0, games: 0 };
  e.user = { steamID: online ? { getSteamID64: () => '1' } : null, logOn: () => { log.logOn++; }, webLogOn: () => { log.webLogOn++; }, gamesPlayed: () => { log.games++; } };
  e.onStatus = (s, x) => log.status.push([s, x]);
  e._refreshToken = 'tok'; e._playing = [570]; e.reconnectLimit = 3;
  e.isConnected = false; e._reconnectAttempt = 2; e.gaveUp = true; e.permanentDisconnect = false; e._reconnectTimer = null; e._wasShutDown = false;
  e._everConnected = true;          // it was connected before the drop (1.7.8: a first session is reported as first, not as reconnected)
  return { e, log };
}

let { e, log } = engine(true);
check('not connected on our side but a session on Steam\'s: it is recovered and reported as reconnected, once', e._recoverIfOnline() === true && e.isConnected && log.status.length === 1 && log.status[0][0] === 'connected' && log.status[0][1].reconnected === true && log.status[0][1].gameEntries === 1);
check('the counters are cleared and the games are asked to open again', e._reconnectAttempt === 0 && e.gaveUp === false && log.games === 1 && log.webLogOn === 1);
check('a second call does nothing (already connected)', e._recoverIfOnline() === false && log.status.length === 1);

({ e, log } = engine(false));
check('no session on Steam\'s side: nothing is recovered', e._recoverIfOnline() === false && log.status.length === 0 && e.isConnected === false);

// the timer of a scheduled attempt finds the session back: no second logon, the state is corrected
({ e, log } = engine(false));
e._reconnectAttempt = 0;
e.user.steamID = null;
const realSetTimeout = global.setTimeout;
let fire = null;
global.setTimeout = (fn) => { fire = fn; return 1; };
e._scheduleReconnect();
global.setTimeout = realSetTimeout;
check('an attempt is scheduled and reported as "connecting"', log.status.length === 1 && log.status[0][0] === 'connecting' && typeof fire === 'function');
e.user.steamID = { getSteamID64: () => '1' };         // steam-user logged on again by itself while we waited
fire();
check('when the timer fires and the session is back it reports "connected" and does not log on a second time', log.logOn === 0 && log.status.length === 2 && log.status[1][0] === 'connected' && e.isConnected === true);

// the heartbeat finds the same thing
({ e, log } = engine(true));
const realSetInterval = global.setInterval;
let beat = null;
global.setInterval = (fn) => { beat = fn; return 1; };
e._startPulse();
global.setInterval = realSetInterval;
beat();
check('the heartbeat recovers a live session that was marked as dropped', e.isConnected === true && log.status.some((s) => s[0] === 'connected'));
process.exit(failures ? 1 : 0);
