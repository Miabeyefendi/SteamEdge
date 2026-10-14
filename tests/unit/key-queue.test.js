// Product key queue: parsing, results, rate limit wait, duplicates.
// Run with `npm test` (tests/run.js).
const fs = require('fs'), vm = require('vm');
let failures = 0;
const check = (name, condition) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name); };

const src = fs.readFileSync(require('path').resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let code = src.slice(src.indexOf('const KEY_GAP_MS'), src.indexOf("ipcMain.handle('keys:state'"));
code = code.replace('const KEY_GAP_MS = 1500;', 'const KEY_GAP_MS = 5;').replace('const KEY_COOLDOWN_MS = 60 * 60 * 1000;', 'const KEY_COOLDOWN_MS = 120;');
const d = { keyQueue: [], keyResults: [], keyActive: false };
const events = [];
let calls = [];
const answers = { 'AAAAA-BBBBB-CCCCC': { ok: true, detail: 0, packages: { 1: 'Game One' } }, 'DDDDD-EEEEE-FFFFF': { ok: false, detail: 9, packages: { 2: 'Game Two' } },
  'GGGGG-HHHHH-IIIII': { ok: false, detail: 14, packages: {} }, 'JJJJJ-KKKKK-LLLLL': { ok: false, detail: 77, packages: {} } };
let limitOnce = true;
const engine = { redeemKey: async (k) => { calls.push(k);
  if (k === 'RATE1-RATE2-RATE3' && limitOnce) { limitOnce = false; return { ok: false, detail: 53, packages: {} }; }
  if (k === 'RATE1-RATE2-RATE3') return { ok: true, detail: 0, packages: { 9: 'Late game' } };
  return answers[k]; } };
const s = { engine, ready: true };
const ctx = { accounts: new Map([[7, s]]), accountData: () => d, accountName: () => 'acc', log: () => {}, sendRaw: (c, p) => events.push(p), activeSteamID: 7,
  writeAccountDataDelayed: () => {}, writeAccountData: () => {}, accountEvent: (id, e) => events.push(['evt', e.typeName]), setTimeout, clearTimeout, console };
vm.createContext(ctx);
vm.runInContext(code + ';this.parse=parseKeyText;this.add=addKeys;this.run=processKeys;this.state=keyState;this.resume=resumeKeyQueue;', ctx);
const t1 = ctx.parse(`Half-Life-Alyx\tAAAAA-BBBBB-CCCCC
ddddd-eeeee-fffff
GGGGG-HHHHH-IIIII
nothing here
KEY1A-KEY2B-KEY3C JJJJJ-KKKKK-LLLLL
Some Game - RATE1-RATE2-RATE3
Half-Life-Alyx-Soundtrack`);
console.log('parsed:', JSON.stringify(t1.found), 'invalid lines:', t1.invalid);
const a = ctx.add(7, 'AAAAA-BBBBB-CCCCC\nDDDDD-EEEEE-FFFFF\nGGGGG-HHHHH-IIIII\nJJJJJ-KKKKK-LLLLL\nRATE1-RATE2-RATE3\nAAAAA-BBBBB-CCCCC\nxx');
check('parse finds 6 keys and a name before a key', t1.found.length === 6 && t1.found[0].name === 'Half-Life-Alyx' && t1.found[5].name === 'Some Game');
check('add: 5 queued, 1 duplicate, 1 invalid line', a.added === 5 && a.duplicates === 1 && a.invalid === 1 && d.keyQueue.length === 5);
(async () => {
  await ctx.run(7);
  const st = ctx.state(7);
  check('every key is tried in order and the rate-limited one is tried again', calls.join(' ') === 'AAAAA-BBBBB-CCCCC DDDDD-EEEEE-FFFFF GGGGG-HHHHH-IIIII JJJJJ-KKKKK-LLLLL RATE1-RATE2-RATE3 RATE1-RATE2-RATE3');
  check('results carry the right status for each key', d.keyResults.map((r) => r.key.slice(0, 5) + ':' + r.status + (r.status === 'other' ? '#' + r.detail : '')).join(' | ') === 'RATE1:used | JJJJJ:other#77 | GGGGG:invalid | DDDDD:owned | AAAAA:used');
  check('queue is empty, run is over and two keys were redeemed', d.keyQueue.length === 0 && st.running === false && st.usedCount === 2 && d.keyActive === false);
  check('a keysDone event was sent', events.some((e) => Array.isArray(e) && e[1] === 'keysDone'));
  console.log('calls:', calls.join(' '));
  console.log('results:', d.keyResults.map((r) => r.key.slice(0, 5) + ':' + r.status + (r.status === 'other' ? '#' + r.detail : '')).join(' | '));
  console.log('left in queue:', d.keyQueue.length, '| running:', st.running, '| usedCount:', st.usedCount, '| keyActive:', d.keyActive, '| events:', events.filter((e) => Array.isArray(e)).map((e) => e[1]).join());
  const again = ctx.add(7, 'AAAAA-BBBBB-CCCCC');
  check('a key that was already tried is not added again', again.added === 0 && again.duplicates === 1);
  process.exit(failures ? 1 : 0);
})();
