// The window comes back where it was, stays reachable on the screens that exist now, and the smallest size never exceeds the screen.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('// Fixed startup size - the same for login'), src.indexOf('function createWindow() {'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-window-'));
function boot(displays) {
  // displays: [{ x, y, width, height }] work areas; the first one is the primary display
  const nearest = (r) => {
    let best = displays[0], bestArea = -1;
    for (const d of displays) {
      const w = Math.min(r.x + r.width, d.x + d.width) - Math.max(r.x, d.x);
      const h = Math.min(r.y + r.height, d.y + d.height) - Math.max(r.y, d.y);
      const area = w > 0 && h > 0 ? w * h : 0;
      if (area > bestArea) { best = d; bestArea = area; }
    }
    return best;
  };
  const screen = { getPrimaryDisplay: () => ({ workArea: displays[0] }), getDisplayMatching: (r) => ({ workArea: nearest(r) }) };
  const ctx = { fs, path, CONFIG_DIR: dir, screen, win: null, Date, Math, JSON, Number, clearTimeout, setTimeout };
  vm.createContext(ctx);
  vm.runInContext(code + ';this.load = loadWindowState; this.def = defaultBounds; this.minFor = minimumFor; this.MIN_DASH = MIN_DASH; this.MIN_LOGIN = MIN_LOGIN;', ctx);
  return ctx;
}
const file = path.join(dir, 'window.json');
const put = (o) => fs.writeFileSync(file, typeof o === 'string' ? o : JSON.stringify(o));
const A = { x: 0, y: 0, width: 1920, height: 1040 };

let t = boot([A]);
put({ x: 100, y: 80, width: 1200, height: 800, maximized: false });
let r = t.load();
check('a saved place on the screen comes back as it was', r && r.bounds.x === 100 && r.bounds.y === 80 && r.bounds.width === 1200 && r.bounds.height === 800 && r.maximized === false, JSON.stringify(r));

put({ x: 100, y: 80, width: 1200, height: 800, maximized: true });
check('the maximized flag is kept', t.load().maximized === true);

put({ x: -700, y: 30, width: 1200, height: 800 });
r = t.load();
check('a window pushed off the left edge is pulled back in', r && r.bounds.x === 0 && r.bounds.width === 1200, JSON.stringify(r && r.bounds));

put({ x: 1500, y: 700, width: 1200, height: 800 });
r = t.load();
check('a window that hangs over the right and bottom edge is pulled back in', r && r.bounds.x + r.bounds.width <= 1920 && r.bounds.y + r.bounds.height <= 1040, JSON.stringify(r && r.bounds));

put({ x: 3000, y: 100, width: 1200, height: 800 });
check('a place on a monitor that is gone is not used', t.load() === null);

put({ x: 0, y: 0, width: 5000, height: 4000 });
r = t.load();
check('a size bigger than the screen is cut to the work area', r && r.bounds.width === 1920 && r.bounds.height === 1040, JSON.stringify(r && r.bounds));

put({ x: 10, y: 10, width: 300, height: 200 });
r = t.load();
check('a size below the minimum is raised to it', r && r.bounds.width === 900 && r.bounds.height === 560, JSON.stringify(r && r.bounds));

put('{ not json');
check('a damaged file is ignored', t.load() === null);
put({ x: 'a', y: 1, width: 1000, height: 700 });
check('values that are not numbers are ignored', t.load() === null);
fs.unlinkSync(file);
check('no file means no saved place', t.load() === null);

// second monitor on the right, saved window on it
t = boot([A, { x: 1920, y: 0, width: 1600, height: 900 }]);
put({ x: 2100, y: 50, width: 1000, height: 700 });
r = t.load();
check('a window on the second monitor stays there', r && r.bounds.x === 2100 && r.bounds.y === 50, JSON.stringify(r && r.bounds));
t = boot([A]);
check('the same place is dropped once that monitor is unplugged', t.load() === null);

// small screens
t = boot([{ x: 0, y: 0, width: 1366, height: 728 }]);
let d = t.def();
check('the default size on a 1366x768 screen fits the work area', d.width === 1342 && d.height === 704 && d.x === 12 && d.y === 12, JSON.stringify(d));
let m = t.minFor(t.MIN_DASH, d);
check('the panel can shrink to 900x560 there', m.w === 900 && m.h === 560, JSON.stringify(m));
m = t.minFor(t.MIN_LOGIN, d);
check('the login window keeps its 900x640 minimum there', m.w === 900 && m.h === 640, JSON.stringify(m));

t = boot([{ x: 0, y: 40, width: 1024, height: 560 }]);
d = t.def();
m = t.minFor(t.MIN_LOGIN, d);
check('a taskbar on top moves the default place down with the work area', d.y === 40 + 12 && d.height === 536, JSON.stringify(d));
check('the minimum never exceeds the screen', m.w === 900 && m.h === 560, JSON.stringify(m));

t = boot([{ x: 0, y: 0, width: 800, height: 480 }]);
m = t.minFor(t.MIN_DASH, t.def());
check('on a 800x480 screen the minimum follows the screen', m.w === 800 && m.h === 480, JSON.stringify(m));

fs.rmSync(dir, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
