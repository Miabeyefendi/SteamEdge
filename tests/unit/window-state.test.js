// The window comes back where it was, stays reachable on the screens that exist now, the smallest size never exceeds the screen, and the page is
// zoomed out to fit when the window is smaller than the layout was drawn for.
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
  const windowFit = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'windowFit.js'));
  const ctx = { fs, path, CONFIG_DIR: dir, screen, win: null, windowFit, Date, Math, JSON, Number, clearTimeout, setTimeout };
  vm.createContext(ctx);
  vm.runInContext(code + ';this.load = loadWindowState; this.def = defaultBounds; this.minFor = minimumFor; this.MIN_DASH = MIN_DASH; this.MIN_LOGIN = MIN_LOGIN;'
    + ' this.fit = applyFitZoom; this.enterPanel = enterPanelWindow; this.enterLogin = enterLoginWindow;', ctx);
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
check('a size below the minimum is raised to it', r && r.bounds.width === 675 && r.bounds.height === 420, JSON.stringify(r && r.bounds));

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
check('the panel can shrink to 675x420 there (three quarters of the 900x560 it was drawn for)', m.w === 675 && m.h === 420, JSON.stringify(m));
m = t.minFor(t.MIN_LOGIN, d);
check('the login window can shrink to 675x480 there', m.w === 675 && m.h === 480, JSON.stringify(m));

t = boot([{ x: 0, y: 40, width: 1024, height: 560 }]);
d = t.def();
m = t.minFor(t.MIN_LOGIN, d);
check('a taskbar on top moves the default place down with the work area', d.y === 40 + 12 && d.height === 536, JSON.stringify(d));
check('the login minimum fits a 1024x560 work area', m.w === 675 && m.h === 480, JSON.stringify(m));

t = boot([{ x: 0, y: 0, width: 640, height: 400 }]);
m = t.minFor(t.MIN_DASH, t.def());
check('on a 640x400 screen the minimum follows the screen', m.w === 640 && m.h === 400, JSON.stringify(m));

// ---- the page follows the window: below the size the layout was drawn for it is zoomed out as a whole ----
// A stand-in for the window: the content size is the size, the minimum is kept like the system does, the page remembers the zoom it was given.
function fakeWindow(w, h) {
  const f = { size: [w, h], min: [0, 0], max: false, mini: false, zoomCalls: 0, zoom: 1 };
  f.isDestroyed = () => false; f.isMinimized = () => f.mini; f.isMaximized = () => f.max; f.maximize = () => { f.max = true; }; f.unmaximize = () => { f.max = false; };
  f.getContentSize = () => f.size.slice(); f.getBounds = () => ({ x: 0, y: 0, width: f.size[0], height: f.size[1] });
  f.setMinimumSize = (a, b) => { f.min = [a, b]; };
  f.setBounds = (b) => { f.size = [Math.max(b.width, f.min[0]), Math.max(b.height, f.min[1])]; };
  f.webContents = { getZoomFactor: () => f.zoom, setZoomFactor: (z) => { f.zoom = z; f.zoomCalls++; } };
  return f;
}
t = boot([A]);
let fw = fakeWindow(1000, 700);
t.win = fw;
t.enterPanel();
check('on a big screen the panel opens without any zoom', fw.zoom === 1 && fw.zoomCalls === 0 && fw.min[0] === 675 && fw.min[1] === 420, fw.zoom + ' ' + JSON.stringify(fw.min));
fw.setBounds({ width: 720, height: 450 }); t.fit();
check('a 720x450 panel is zoomed to 0.8, so the page still has 900x560', fw.zoom === 0.8 && 720 / fw.zoom >= 900 && 450 / fw.zoom >= 560, String(fw.zoom));
fw.setBounds({ width: 300, height: 300 }); t.fit();
check('a window dragged far below the minimum stays at the minimum: 0.75, 900x560 of page', fw.size[0] === 675 && fw.size[1] === 420 && fw.zoom === 0.75, fw.zoom + ' ' + fw.size);
fw.size = [659, 412]; t.fit();
check('the few pixels the system allows below the minimum are covered too', fw.zoom === 0.73 && 659 / fw.zoom >= 900 && 412 / fw.zoom >= 560, String(fw.zoom));
fw.setBounds({ width: 1500, height: 900 }); t.fit();
check('a big window gets its normal size back', fw.zoom === 1, String(fw.zoom));
const calls = fw.zoomCalls; t.fit(); t.fit();
check('the page is not told again while the zoom stays the same', fw.zoomCalls === calls);
fw.setBounds({ width: 800, height: 500 }); t.fit();
fw.mini = true; fw.size = [160, 28]; t.fit();
check('a minimized window leaves the zoom alone', fw.zoom === 0.88, String(fw.zoom));
fw.mini = false;
t.win = null; t.fit();
check('without a window nothing happens', true);

// the login screen needs more height than the panel
t = boot([{ x: 0, y: 0, width: 1024, height: 600 }]);
fw = fakeWindow(1000, 576); t.win = fw;
t.enterLogin();
check('the login window on a short screen is zoomed (576 of 640 high)', fw.zoom === 0.9 && fw.size[1] === 576, fw.zoom + ' ' + fw.size);
t.enterPanel();
check('and the panel, which needs 560, fits the same window without a zoom', fw.zoom === 1, String(fw.zoom));

fs.rmSync(dir, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
