// "Start with Windows": the start-up entry is written by a packaged app only, and turning the setting off removes it only when it belongs to this copy.
// 1.7.8 wrote it on every start of any copy: a run from the source put the Electron of node_modules there, a copy with the setting off removed the entry of
// the copy the user starts. With "Start in the tray" (1.8.0) the entry carries --start-in-tray.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
const code = src.slice(src.indexOf('function applyLoginItem()'), src.indexOf('function applySettings()'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

function run(o) {
  const calls = [];
  const ctx = {
    START_HIDDEN_ARG: '--start-in-tray',
    settings: { autoLaunch: o.autoLaunch, startInTray: !!o.tray },
    process: { execPath: 'C:\\Apps\\SteamEdge-v1.7.9\\SteamEdge.exe' },
    app: {
      isPackaged: o.packaged,
      setLoginItemSettings: (x) => calls.push(x),
      getLoginItemSettings: () => ({ openAtLogin: !!o.registered, launchItems: o.registered ? [{ name: 'com.miabeyefendi.steamedge', path: o.registered }] : [] }),
    },
    String,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;applyLoginItem();', ctx);
  return calls;
}

check('a run from the source never touches the entry (it put node_modules\\electron.exe there)', run({ packaged: false, autoLaunch: true }).length === 0 && run({ packaged: false, autoLaunch: false, registered: 'C:\\Apps\\Old\\SteamEdge.exe' }).length === 0);
let c = run({ packaged: true, autoLaunch: true });
check('setting on: this copy is registered', c.length === 1 && c[0].openAtLogin === true && c[0].args.length === 0, JSON.stringify(c));
c = run({ packaged: true, autoLaunch: true, tray: true });
check('"Start in the tray" on: the entry carries the argument that keeps the first window hidden', c.length === 1 && c[0].openAtLogin === true && c[0].args.join() === '--start-in-tray', JSON.stringify(c));
c = run({ packaged: true, autoLaunch: false, registered: 'C:\\Apps\\SteamEdge-v1.7.7\\SteamEdge.exe' });
check('setting off in a new copy: the entry of the copy the user starts is left alone', c.length === 0, JSON.stringify(c));
c = run({ packaged: true, autoLaunch: false, registered: '"C:\\Apps\\SteamEdge-v1.7.9\\SteamEdge.exe"' });
check('setting off in the copy that is registered: its entry is removed', c.length === 1 && c[0].openAtLogin === false, JSON.stringify(c));
c = run({ packaged: true, autoLaunch: false });
check('setting off and nothing registered: nothing is done', c.length === 0);
process.exit(failures ? 1 : 0);
