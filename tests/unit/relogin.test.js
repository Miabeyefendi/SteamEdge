// A saved login that Steam stopped taking (InvalidPassword, AccessDenied, Revoked, Expired). Up to 4.3.6 the app tried it again on every start, switch
// and page (three logons each, plus the background loop) until Steam answered RateLimitExceeded, and the only way back was to remove the account and add
// it again. Checked here: the engine tells a dead token from a replaced session, connectAccount tries it once and marks the account, nothing tries it
// again, its jobs are kept for later, and a sign-in for that account (and only that account) clears the mark and keeps the rest of its entry.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const root = path.resolve(__dirname, '..', '..');
const { createFakeSteam, loadEngine } = require('./fake-steam-user.js');

(async () => {
  // ---- the engine: a dead token is told apart from a replaced session ----
  {
    const { FakeSteamUser, net } = createFakeSteam();
    const SteamEngine = loadEngine(FakeSteamUser, null, net);
    check('the dead-token codes are 5, 15, 26, 27 and not 34', [5, 15, 26, 27].every((c) => SteamEngine.TOKEN_INVALID.has(c)) && !SteamEngine.TOKEN_INVALID.has(34));
    check('a logon error is read by its EResult, or by its name when it has none',
      SteamEngine.tokenInvalid({ eresult: 15 }) && SteamEngine.tokenInvalid(new Error('AccessDenied')) && !SteamEngine.tokenInvalid({ eresult: 3, message: 'NoConnection' }));
    for (const [code, name, dead] of [[15, 'AccessDenied', true], [34, 'LogonSessionReplaced', false]]) {
      const eng = new SteamEngine();
      const statuses = [];
      eng.onStatus = (st, x) => statuses.push(Object.assign({ st }, x));
      await eng.logOn('account', false);
      const before = net.logons;
      FakeSteamUser.instances.filter((u) => u.steamID).forEach((u) => u._kick(code, name));
      await new Promise((r) => setTimeout(r, 50));
      const last = statuses[statuses.length - 1];
      check(name + ': the engine gives up for good and says whether the token is dead (' + dead + ')',
        last && last.st === 'abandoned' && last.permanent === true && last.tokenInvalid === dead && !eng.reconnecting(), JSON.stringify(last));
      check(name + ': no new logon follows', net.logons === before);
      eng.logOff();
    }
  }

  // ---- connectAccount: one try, the mark, no background loop, no second try ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamedge-relogin-'));
  let stored = [{ steamID: 'A', accountName: 'alpha', refreshToken: 'dead', addedAt: 1 }, { steamID: 'B', accountName: 'beta', refreshToken: 'fine' }];
  const handlers = {};
  const sent = [], events = [], conn = [], kept = [], stopped = [];
  let logons = 0, loops = 0;
  class Engine {
    constructor() { this.user = { logOff() {} }; }
    setProxy() {} applyPrivacy() {}
    startReconnecting() { loops++; }
    logOff() { this.off = true; }
    logOn(token) {
      logons++;
      if (token === 'dead') { const e = new Error('AccessDenied'); e.eresult = 15; return Promise.reject(e); }
      return Promise.resolve({ persona: 'p', steamID: 'A' });
    }
  }
  Engine.tokenInvalid = (e) => !!e && [5, 15, 26, 27].includes(+e.eresult);
  const slots = new Map();
  const ctx = {
    CONFIG_DIR: dir, JSON_SIDE_FILES: [], NOTIF_ICON: '', Notification: { isSupported: () => false }, authSlots: new Map(), ct: (s) => s, fs, path,
    hasSession: () => null, ipcMain: { handle: (n, f) => { handlers[n] = f; }, on: (n, f) => { handlers[n] = f; } },
    loadAccounts: () => stored.map((a) => ({ ...a })), saveAccounts: (l) => { stored = l.map((a) => ({ ...a })); },
    log: () => {}, logger: { connection: (id, name, d) => conn.push([id, name, d]), event() {} },
    makeActiveSession() {}, parseProxy: () => ({ ok: true, empty: true }), sendRaw: (c, d) => sent.push([c, d]), session: { defaultSession: { setProxy: () => Promise.resolve() } },
    setActiveProxy() {}, startLocalProxy() {}, steamEngineClass: () => Engine, windowOpened: Promise.resolve(),
    accountData: () => ({ proxyUrl: '', parentalPin: '' }), accountEvent: (id, e) => events.push([id, e]),
    resumeJobs: { describeJobs: (s) => (s.running ? { card: { games: [1] } } : null) }, resumeStore: { keep: (id, e) => kept.push([id, e]) },
    accountRunning: (s) => !!(s && s.running), stopAccountJobs: (s, id) => { stopped.push(id); s.running = false; },
    settings: { reconnectPolicy: 'on', resumeJobs: true }, activeSteamID: 'A',
    slotOf: (id) => { if (!slots.has(id)) slots.set(id, { engine: null, ready: false }); return slots.get(id); },
    reconnectLimit: () => 10, bindConnectionState() {}, applyChatSettings() {}, personaOf: () => 1, hideNameOf: () => false,
    resumeKeyQueue() {}, resumeAfterConnect() {}, accountJobKinds: () => [], accountJobDetail: () => [], sendJobStatus() {}, statsView: () => ({}),
  };
  const acc = require(path.join(root, 'src', 'backend', 'accounts.js'))(ctx);
  // the account's slot is the module's own map: the jobs it "runs" are put on it
  ctx.slotOf = (id) => { if (!acc.accounts.has(id)) acc.accounts.set(id, { engine: null, ready: false }); return acc.accounts.get(id); };
  ctx.slotOf('A').running = true;

  let r = await acc.connectAccount(stored[0]);
  check('a dead token is tried once, not three times', logons === 1, logons + ' logons');
  check('no background loop is started for it', loops === 0);
  check('the result says a sign-in is needed', r.ok === false && r.needsLogin === true);
  check('accounts.json marks the account', stored[0].needsLogin === true && stored[1].needsLogin === undefined);
  check('its running jobs are kept for the resume and stopped', kept.length === 1 && kept[0][0] === 'A' && stopped.includes('A'));
  check('it is told once: the feed event, connection.log and the page', events.filter((e) => e[1].typeName === 'needsLogin').length === 1
    && conn.some((c) => c[1] === 'needsLogin' && c[2].eresult === 15) && sent.some((s) => s[0] === 'accounts:needsLogin' && s[1].steamID === 'A'));
  r = await acc.connectAccount(stored[0]);
  check('the next start, switch or page does not try it again', logons === 1 && r.needsLogin === true, logons + ' logons');
  const list = await handlers['accounts:list']();
  check('the account list shows which account waits for a sign-in', list.find((a) => a.steamID === 'A').needsLogin === true && list.find((a) => a.steamID === 'B').needsLogin === false);
  const all = await handlers['accounts:connectAll']();
  check('connecting all accounts skips it and says why', logons === 2 && all.find((a) => a.steamID === 'A').needsLogin === true && all.find((a) => a.steamID === 'B').ok, logons + ' logons');
  acc.markNeedsLogin('A', 15);
  check('marking it again tells nothing new', events.filter((e) => e[1].typeName === 'needsLogin').length === 1);

  // ---- the sign-in: only the account that waits, and the mark goes ----
  const SteamAuth = require(path.join(root, 'src', 'services', 'steamAuth.js'));
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(stored));
  const emitted = [];
  const auth = new SteamAuth(dir, (ev, d) => emitted.push([ev, d]), {});
  auth.addingAccount = true;
  auth.expectSteamID = 'A';
  const fakeSession = (id, name) => ({ steamID: { getSteamID64: () => id }, accountName: name, refreshToken: 'new-' + id, getWebCookies: async () => [], cancelLoginAttempt() {} });
  auth.session = fakeSession('B', 'beta');
  await auth._onAuth();
  let file = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
  check('a QR scanned with another account is refused and saves nothing', emitted.some((e) => e[0] === 'error' && e[1].wrongAccount) && !emitted.some((e) => e[0] === 'authenticated')
    && file.find((a) => a.steamID === 'B').refreshToken === 'fine');
  auth.session = fakeSession('A', 'alpha');
  await auth._onAuth();
  file = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
  const a = file.find((x) => x.steamID === 'A');
  check('the account that waits gets the new token and loses the mark', a.refreshToken === 'new-A' && a.needsLogin === undefined && emitted.some((e) => e[0] === 'authenticated'));
  check('the rest of its entry stays (it is not added again)', a.addedAt === 1 && file.length === 2);
  check('session.json is left alone (finish() writes it for the account on screen only)', !fs.existsSync(path.join(dir, 'session.json')));

  // ---- the strip: the connection of an account that waits says so, and "Reconnect" does not try ----
  const csHandlers = {};
  const marked = [];
  const cs = require(path.join(root, 'src', 'backend', 'connectionstate.js'))({
    accountEvent: (id, e) => events.push([id, e]), accountRunning: () => false, accounts: new Map([['A', { needsLogin: true }], ['B', {}]]), earning: () => false,
    handleUninterruptedRun() {}, ipcMain: { handle: (n, f) => { csHandlers[n] = f; } }, loadAccounts: () => stored, log() {}, logger: { connection() {} },
    markNeedsLogin: (id, er) => marked.push([id, er]), resumeFarm() {}, sendRaw() {}, statsHour() {}, syncActive() {}, activeSteamID: 'A', syncConnectionChanged() {},
  });
  const st = await csHandlers['engine:connectionStatus']();
  check('the connection of the account on screen says it needs a sign-in', st.condition === 'abandoned' && st.needsLogin === true);
  const rc = await csHandlers['engine:reconnect']();
  check('"Reconnect" does not try a dead token', rc.ok === false && rc.needsLogin === true);
  const eng = {};
  cs.bindConnectionState(eng, 'B');
  const before = events.length;
  eng.onStatus('abandoned', { permanent: true, eresult: 26, tokenInvalid: true, cause: 'Revoked' });
  check('a dead token found while running marks the account instead of "reconnecting stopped"', marked.length === 1 && marked[0][0] === 'B' && marked[0][1] === 26
    && !events.slice(before).some((e) => e[1].typeName === 'connectionAbandoned'));
  eng.onStatus('abandoned', { permanent: true, eresult: 34, tokenInvalid: false, cause: 'LogonSessionReplaced' });
  check('a replaced session is still "reconnecting stopped"', marked.length === 1 && events.slice(before).some((e) => e[1].typeName === 'connectionAbandoned'));

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + (e && e.stack)); process.exit(1); });
