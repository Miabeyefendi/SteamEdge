// Switching accounts (cut out of main.js): the account on screen changes only once the new one is connected, a failed connection leaves the old
// account on screen, a newer click wins over an older one that is still connecting, and what ended on an account is cleared when it is opened.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const a = src.indexOf('let switchSeq = 0;');
const b = src.indexOf('// Connects all saved accounts in the background (for parallel idling).');
check('the handler is in main.js', a > 0 && b > a);

(async () => {
  const handlers = {};
  const sent = [];
  const pending = {};
  const ctx = {
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    loadAccounts: () => [{ steamID: 'a', accountName: 'first' }, { steamID: 'b', accountName: 'second' }, { steamID: 'c', accountName: 'third' }],
    connectAccount: (entry) => new Promise((resolve) => { pending[entry.steamID] = resolve; }),
    makeActiveSession: (entry) => sent.push('session ' + entry.steamID),
    syncActive: () => sent.push('sync ' + ctx.shownNow()),
    sendRaw: (channel, d) => sent.push(channel + ' ' + JSON.stringify(d)),
    sendJobStatus: (id) => sent.push('jobs ' + id),
    statsView: () => ({}),
    accountRunning: () => false,
    accountJobKinds: () => [],
    accounts: new Map([['b', { finished: { jobs: ['card'], ts: 1 } }], ['c', {}]]),
    Promise, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext("let activeSteamID = 'a'; this.shownNow = () => activeSteamID;\n" + src.slice(a, b), ctx);
  const sw = handlers['accounts:switch'];

  // one click: the account on screen does not change until the connection is done
  let first = sw(null, 'b');
  check('while the new account connects the old one stays on screen', ctx.shownNow() === 'a');
  pending.b({ ok: true, persona: 'second' });
  let r = await first;
  check('when it is connected it becomes the account on screen', r.ok && ctx.shownNow() === 'b' && sent.includes('sync b'));
  check('the job state of the new account is sent right away', sent.includes('jobs b'));
  check('what ended on it is cleared, and the interface is told', ctx.accounts.get('b').finished === null && sent.some((s) => /^accounts:activity .*"finished":null/.test(s)));

  // a failed connection leaves the old account on screen
  const failing = sw(null, 'c');
  pending.c({ ok: false, error: 'Bağlanamadı.' });
  r = await failing;
  check('a failed connection reports the reason and changes nothing', r.ok === false && r.error === 'Bağlanamadı.' && ctx.shownNow() === 'b');

  // two clicks in a row: the newer one wins, the older one reports that it was taken over
  const older = sw(null, 'a');
  const newer = sw(null, 'c');
  pending.c({ ok: true, persona: 'third' });
  const newerResult = await newer;
  pending.a({ ok: true, persona: 'first' });
  const olderResult = await older;
  check('the newer click wins and is the account on screen', newerResult.ok && !newerResult.superseded && ctx.shownNow() === 'c');
  check('the older click comes back as taken over and does not change the account on screen', olderResult.ok && olderResult.superseded === true && ctx.shownNow() === 'c');

  // an unknown account
  r = await sw(null, 'zzz');
  check('an unknown account is refused', r.ok === false);
  process.exit(failures ? 1 : 0);
})();
