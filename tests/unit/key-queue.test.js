// Product key queue: parsing, results, rate limit wait, duplicates.
// Run with `npm test` (tests/run.js).
const fs = require('fs'), vm = require('vm');
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
console.log('add:', JSON.stringify(a), 'queue:', d.keyQueue.length);
(async () => {
  await ctx.run(7);
  const st = ctx.state(7);
  console.log('calls:', calls.join(' '));
  console.log('results:', d.keyResults.map((r) => r.key.slice(0, 5) + ':' + r.status + (r.status === 'other' ? '#' + r.detail : '')).join(' | '));
  console.log('left in queue:', d.keyQueue.length, '| running:', st.running, '| usedCount:', st.usedCount, '| keyActive:', d.keyActive, '| events:', events.filter((e) => Array.isArray(e)).map((e) => e[1]).join());
  const again = ctx.add(7, 'AAAAA-BBBBB-CCCCC');
  console.log('re-add finished key ->', JSON.stringify(again));
  process.exit(0);
})();
