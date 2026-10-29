// A key the account already owns is passed on to the next connected account when "Pass on keys for games already owned" is on, goes through every
// account at most once, and is left alone when the setting is off.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
let code = src.slice(src.indexOf('const KEY_GAP_MS'), src.indexOf("ipcMain.handle('keys:state'"));
code = code.replace('const KEY_GAP_MS = 1500;', 'const KEY_GAP_MS = 5;').replace('const KEY_COOLDOWN_MS = 60 * 60 * 1000;', 'const KEY_COOLDOWN_MS = 120;');

function boot(forwardOn) {
  const data = {}; const calls = [];
  const mk = (id, owns) => {
    data[id] = { keyQueue: [], keyResults: [], keyActive: false };
    return { ready: true, engine: { redeemKey: async (k) => { calls.push(id + ':' + k); return owns.has(k) ? { ok: false, detail: 9, packages: { 1: 'Game' } } : { ok: true, detail: 0, packages: { 2: 'Game' } }; } } };
  };
  // A and B both own KEY-ONE, C owns nothing; A owns KEY-TWO, B does not
  const accounts = new Map([['A', mk('A', new Set(['AAAAA-AAAAA-AAAAA', 'BBBBB-BBBBB-BBBBB']))], ['B', mk('B', new Set(['AAAAA-AAAAA-AAAAA']))], ['C', mk('C', new Set())]]);
  const ctx = { accounts, settings: { keyForwardOwned: forwardOn }, accountData: (id) => data[id], accountName: (id) => 'acc-' + id, log: () => {}, sendRaw: () => {},
    activeSteamID: 'A', writeAccountDataDelayed: () => {}, writeAccountData: () => {}, accountEvent: () => {}, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(code + ';this.add = addKeys; this.run = processKeys;', ctx);
  return { ctx, data, calls };
}
const settle = () => new Promise((r) => setTimeout(r, 400));

(async () => {
  let t = boot(true);
  t.ctx.add('A', 'AAAAA-AAAAA-AAAAA\nBBBBB-BBBBB-BBBBB');
  await t.ctx.run('A'); await settle();
  const resA = t.data.A.keyResults.map((r) => r.key.slice(0, 5) + ':' + r.status + (r.forwardedTo ? '>' + r.forwardedTo : '')).sort().join(' ');
  check('A: both keys are owned and both are passed on to B', resA === 'AAAAA:owned>acc-B BBBBB:owned>acc-B', resA);
  const resB = t.data.B.keyResults.map((r) => r.key.slice(0, 5) + ':' + r.status + (r.forwardedTo ? '>' + r.forwardedTo : '')).sort().join(' ');
  check('B: the key it owns goes on to C, the other one is redeemed', resB === 'AAAAA:owned>acc-C BBBBB:used', resB);
  const resC = t.data.C.keyResults.map((r) => r.key.slice(0, 5) + ':' + r.status).join(' ');
  check('C redeems the key that nobody else could, and it goes no further', resC === 'AAAAA:used' && !t.data.C.keyResults[0].forwardedTo, resC);
  check('each account tried each key at most once', t.calls.length === 5 && new Set(t.calls).size === 5, t.calls.join(' '));

  // everybody owns it: the trail ends, nothing loops
  t = boot(true);
  t.data.A.keyQueue.push({ key: 'ZZZZZ-ZZZZZ-ZZZZZ', name: '' });
  for (const id of ['A', 'B', 'C']) t.ctx.accounts.get(id).engine.redeemKey = async (k) => { t.calls.push(id + ':' + k); return { ok: false, detail: 9, packages: {} }; };
  t.data.A.keyActive = true;
  await t.ctx.run('A'); await settle();
  check('a key every account owns stops after the last account', t.calls.length === 3 && t.data.C.keyResults[0].forwardedTo === '', t.calls.join(' '));

  // setting off: stays on the account that owns it
  t = boot(false);
  t.ctx.add('A', 'AAAAA-AAAAA-AAAAA');
  await t.ctx.run('A'); await settle();
  check('with the setting off nothing is passed on', t.data.B.keyQueue.length === 0 && t.data.B.keyResults.length === 0 && t.data.A.keyResults[0].forwardedTo === '');

  // an account that is not connected is skipped
  t = boot(true);
  t.ctx.accounts.get('B').ready = false;
  t.ctx.add('A', 'AAAAA-AAAAA-AAAAA');
  await t.ctx.run('A'); await settle();
  check('an account that is not connected is skipped', t.data.A.keyResults[0].forwardedTo === 'acc-C' && t.data.B.keyResults.length === 0);
  process.exit(failures ? 1 : 0);
})();
