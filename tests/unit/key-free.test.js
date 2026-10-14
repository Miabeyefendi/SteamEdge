// A Steam store link (or "app/123") in the keys box is a request for that app's free license: it is parsed, queued, claimed and listed
// with its own result, next to ordinary keys.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
let code = src.slice(src.indexOf('const KEY_GAP_MS'), src.indexOf("ipcMain.handle('keys:state'"));
code = code.replace('const KEY_GAP_MS = 1500;', 'const KEY_GAP_MS = 5;');
const d = { keyQueue: [], keyResults: [], keyActive: false };
const claimed = [];
const engine = {
  claimFreeApp: async (appid) => { claimed.push(appid); return appid === 620 ? { ok: true, granted: true, packages: [4] } : appid === 730 ? { ok: true, granted: false, packages: [] } : { ok: false, detail: 15, granted: false, packages: [] }; },
  redeemKey: async () => ({ ok: true, detail: 0, packages: { 1: 'Game' } }),
};
const ctx = { settings: {}, accounts: new Map([[7, { engine, ready: true }]]), accountData: () => d, accountName: () => 'acc', log: () => {}, sendRaw: () => {},
  activeSteamID: 7, writeAccountDataDelayed: () => {}, writeAccountData: () => {}, accountEvent: () => {}, setTimeout, clearTimeout, console };
vm.createContext(ctx);
vm.runInContext(code + ';this.parse = parseKeyText; this.add = addKeys; this.run = processKeys; this.state = keyState;', ctx);

const parsed = ctx.parse('https://store.steampowered.com/app/620/Portal_2/\napp/730\nSome Game AAAAA-BBBBB-CCCCC\nnothing here');
check('a store link and app/ID become free license requests', parsed.found.length === 3 && parsed.found[0].appid === 620 && parsed.found[1].appid === 730 && parsed.found[0].key === 'APP:620');
check('an ordinary key line is still a key and a line with neither is invalid', parsed.found[2].key === 'AAAAA-BBBBB-CCCCC' && !parsed.found[2].appid && parsed.invalid === 1);
const added = ctx.add(7, 'https://store.steampowered.com/app/620/\napp/730\napp/999\nAAAAA-BBBBB-CCCCC\napp/620');
check('queued once each: the repeated link is a duplicate', added.added === 4 && added.duplicates === 1, JSON.stringify(added));
(async () => {
  await ctx.run(7);
  const status = d.keyResults.map((r) => r.key + ':' + r.status).sort().join(' ');
  check('granted, not granted and refused are told apart', status === 'AAAAA-BBBBB-CCCCC:used APP:620:claimed APP:730:notGranted APP:999:other', status);
  check('the claim asked Steam for the right app ids', claimed.join() === '620,730,999');
  check('a free result is named after its app until the name is known', d.keyResults.find((r) => r.key === 'APP:620').name === 'App 620');
  const st = ctx.state(7);
  check('the used count includes claimed licenses', st.usedCount === 2 && st.resultCount === 4);
  process.exit(failures ? 1 : 0);
})();
