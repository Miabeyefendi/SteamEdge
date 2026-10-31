// A stand-in for steam-user that behaves as the real one does around a connection (node_modules/steam-user 5.x, read for 1.7.8), so the reconnect loop of
// src/core/steamEngine.js can be driven through drops without Steam. Not a test itself (the runner only takes *.test.js).
//   - logOn checks "already logged on / already attempting" on the NEXT tick and throws there: outside of any try of the caller (09-logon.js logOn)
//   - while it cannot connect it retries on its own, every second, and says nothing (02-connection.js _handleConnectionClose, tcp.js timeout)
//   - an attempt begun while the network is in "limbo" never answers at all (a socket left half open by a sleep or a network change): the case a loop
//     that only waits for an event can never leave
//   - Steam keeps one session per account: a second logon drops the first with LogonSessionReplaced (34)
//   - a drop of a logged on session is an 'error' with NoConnection (3) when autoRelogin is off (09-logon.js _handleLogOff)
const EventEmitter = require('events');
const path = require('path');
const Real = require(path.resolve(__dirname, '..', '..', 'node_modules', 'steam-user'));

function createFakeSteam() {
  const net = { up: true, limbo: false, sessions: new Map(), logons: 0, uncaught: [], personas: [], played: [], elsewhere: false };
  class FakeSteamUser extends EventEmitter {
    constructor(options) {
      super();
      this.options = options || {};
      this.steamID = null;
      this._connecting = false;
      this._closed = false;
      FakeSteamUser.instances.push(this);
    }
    setOption() {}
    logOn(details) {
      process.nextTick(() => {
        try {
          if (this.steamID) throw new Error('Already logged on, cannot log on again');
          if (this._connecting) throw new Error('Already attempting to log on, cannot log on again');
        } catch (e) { net.uncaught.push(e.message); return; }    // the real one throws here; the app's uncaughtException handler only writes it down
        this._connecting = true;
        this._closed = false;
        this._account = (details && details.refreshToken) || 'account';
        this._hung = net.limbo;
        this._try();
      });
    }
    _try() {
      if (this._closed || !this._connecting || this._hung) return;
      if (!net.up) { setTimeout(() => this._try(), 1000); return; }
      setTimeout(() => {
        if (this._closed || !this._connecting) return;
        this._connecting = false;
        const before = net.sessions.get(this._account);
        if (before && before !== this && before.steamID) before._kick(34, 'LogonSessionReplaced');
        net.sessions.set(this._account, this);
        net.logons++;
        this.steamID = { getSteamID64: () => '76561198000000001' };
        this.emit('loggedOn', {});
        this.emit('accountInfo', 'tester');
        // Steam tells a new session at once that another device of the account plays (unless the test wants it silent)
        if (net.elsewhere && !net.silent) { this.playingState = { blocked: true, appid: 730 }; this.emit('playingState', true, 730); }
        setTimeout(() => { if (this.steamID && !this._closed) this.emit('webSession', 'sid', ['steamLoginSecure=1']); }, 50);
      }, 300);
    }
    _kick(eresult, message) {
      const e = new Error(message);
      e.eresult = eresult;
      this.steamID = null;
      this._connecting = false;
      if (net.sessions.get(this._account) === this) net.sessions.delete(this._account);
      this.emit('error', e);
    }
    logOff() {
      this._closed = true;
      this._connecting = false;
      this.steamID = null;
      if (net.sessions.get(this._account) === this) net.sessions.delete(this._account);
    }
    // the real one sends it only on a logged on session; every call is kept, so a test can see what Steam was told and when
    setPersona(state) { this.persona = state; net.personas.push({ state, loggedOn: !!this.steamID }); }
    webLogOn() {}
    // Another device of the account plays (net.elsewhere): Steam logs off a session that opens games over it with LoggedInElsewhere, as seen on a real
    // account (1.8.1 log: a logon and a kick every six seconds)
    gamesPlayed(ids) {
      this.played = ids;
      net.played.push({ ids: (ids || []).slice(), at: Date.now() });
      if (net.elsewhere && ids && ids.length && this.steamID) setTimeout(() => { if (this.steamID) this._kick(6, 'LoggedInElsewhere'); }, 300);
    }
  }
  ['EPersonaState', 'ECurrencyCode', 'EResult'].forEach((k) => { FakeSteamUser[k] = Real[k]; });
  FakeSteamUser.instances = [];
  // the network goes: every logged on session drops; attempts from now on cannot connect (limbo: and never answer)
  net.drop = (limbo) => { net.up = false; net.limbo = !!limbo; FakeSteamUser.instances.filter((u) => u.steamID).forEach((u) => u._kick(3, 'NoConnection')); };
  // it comes back: new attempts connect; an attempt that hung in limbo stays hung, as a dead socket does
  net.restore = () => { net.up = true; net.limbo = false; };
  net.live = () => [...net.sessions.values()].filter((u) => u.steamID).length;
  // a game of the account starts or ends on another device: Steam tells every logged on session (ClientPlayingSessionState); silent: it says nothing
  net.otherDevice = (playing, silent) => {
    net.elsewhere = playing;
    net.silent = !!silent;
    const live = FakeSteamUser.instances.filter((u) => u.steamID && !u._closed);
    // the Steam client starting a game takes the play from the session that has one open: it is logged off (the user confirmed "play anyway")
    if (playing) live.filter((u) => u.played && u.played.length).forEach((u) => u._kick(6, 'LoggedInElsewhere'));
    if (silent) return;
    live.filter((u) => u.steamID).forEach((u) => { u.playingState = { blocked: playing, appid: playing ? 730 : 0 }; u.emit('playingState', playing, playing ? 730 : 0); });
  };
  return { FakeSteamUser, net };
}

// Loads a copy of steamEngine.js (the file given, or the one of the repository) with the fake in place of steam-user. The market currency check is a web
// request; it is switched off. With net given, "does Steam answer" (the probe of the reconnect loop) asks the fake network instead of the real one.
function loadEngine(FakeSteamUser, file, net) {
  const Module = require('module');
  const root = path.resolve(__dirname, '..', '..');
  const src = require('fs').readFileSync(file || path.join(root, 'src', 'core', 'steamEngine.js'), 'utf8')
    .replace(/require\('steam-user'\)/, '__fakeSteamUser')
    .replace(/require\('\.\//g, "require('" + path.join(root, 'src', 'core').replace(/\\/g, '/') + '/')
    .replace(/require\('steam-user\//g, "require('" + path.join(root, 'node_modules', 'steam-user').replace(/\\/g, '/') + '/');
  const m = new Module(file || 'steamEngine.js', module);
  m.paths = module.paths;
  m.filename = path.join(root, 'src', 'core', 'steamEngine.js');
  global.__fakeSteamUser = FakeSteamUser;
  m._compile(src, m.filename);
  const SteamEngine = m.exports;
  SteamEngine.prototype.detectMarketCurrency = async () => {};
  if (net) SteamEngine.prototype._steamReachable = async () => net.up;
  return SteamEngine;
}

module.exports = { createFakeSteam, loadEngine };
