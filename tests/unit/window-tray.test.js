// The minimise button and the tray: the window goes to the notification area, and every way back (tray click, tray menu, a second copy, a notification) brings it
// back whatever state it is in (hidden, minimised by Windows, or both), maximized first when it started in the tray from a maximized window.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('// One way to bring the window back'), src.indexOf('// When the language changes the menu is rebuilt'))
  + '\n' + src.slice(src.indexOf('// The minimise button sends the window'), src.indexOf("ipcMain.on('win:maximize'"));

function fakeWindow() {
  const w = { visible: true, minimized: false, focused: true, destroyed: false, calls: [] };
  w.isVisible = () => w.visible && !w.minimized;           // as on Windows: a minimised window is not visible
  w.isMinimized = () => w.minimized;
  w.isDestroyed = () => w.destroyed;
  w.hide = () => { w.visible = false; w.calls.push('hide'); };
  w.show = () => { w.visible = true; w.calls.push('show'); };
  w.minimize = () => { w.minimized = true; w.calls.push('minimize'); };
  w.restore = () => { w.minimized = false; w.calls.push('restore'); };
  w.focus = () => { w.focused = true; w.calls.push('focus'); };
  return w;
}
function setup(trayWorks, iconFound) {
  const handlers = {};
  const trayHandlers = {};
  const ctx = {
    win: fakeWindow(), tray: null, trayHasIcon: false, maximizeOnShow: false, path, __dirname: '/app',
    nativeImage: { createFromPath: () => ({ isEmpty: () => iconFound === false, resize: () => ({}) }), createEmpty: () => ({}) },
    Tray: function () { if (!trayWorks) throw new Error('no tray'); this.destroyed = false; this.setToolTip = () => {}; this.on = (ev, fn) => { trayHandlers[ev] = fn; }; this.isDestroyed = () => this.destroyed; },
    setupTrayMenu: () => {},
    ipcMain: { on: (ch, fn) => { handlers[ch] = fn; } }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;this.api = { showWindow, ensureTray };', ctx);
  return { ctx, handlers, trayHandlers };
}

// minimise with a tray: the window is hidden, not minimised
let t = setup(true);
t.handlers['win:minimize']();
check('minimise: the window is hidden to the tray, not minimised to the taskbar', t.ctx.win.visible === false && t.ctx.win.minimized === false && t.ctx.win.calls.join() === 'hide', t.ctx.win.calls.join());
check('minimise: the tray icon exists after it', !!t.ctx.tray);
// tray click brings it back
t.trayHandlers.click();
check('tray click on a hidden window shows and focuses it', t.ctx.win.visible === true && t.ctx.win.calls.slice(-2).join() === 'show,focus', t.ctx.win.calls.join());
t.trayHandlers.click();
check('tray click on a visible window hides it again', t.ctx.win.visible === false);
// a second copy of the app asks for the window while it is hidden
t.ctx.api.showWindow();
check('a second copy of the app brings a hidden window back', t.ctx.win.visible === true);
// minimised by Windows (Win+D), then the tray is clicked: it must restore, not just "show" a minimised window
t = setup(true);
t.ctx.win.minimized = true;
t.ctx.api.ensureTray();
t.trayHandlers.click();
check('tray click on a window minimised by Windows restores it', t.ctx.win.minimized === false && t.ctx.win.visible === true && t.ctx.win.calls.includes('restore'), t.ctx.win.calls.join());
// hidden AND minimised
t = setup(true);
t.ctx.win.visible = false; t.ctx.win.minimized = true;
t.ctx.api.showWindow();
check('a window that is both hidden and minimised comes back fully', t.ctx.win.visible === true && t.ctx.win.minimized === false);
// no tray icon could be made: the button minimises as before and the window is not lost
t = setup(false);
t.handlers['win:minimize']();
check('without a tray icon the button minimises as usual (the window is not hidden with no way back)', t.ctx.win.minimized === true && t.ctx.win.visible !== false && t.ctx.win.calls.join() === 'minimize', t.ctx.win.calls.join());
// the icon file is missing: the tray entry would be invisible, so the button must not hide the window behind it
t = setup(true, false);
t.handlers['win:minimize']();
check('with a tray entry nobody can see (icon missing) the button minimises instead of hiding', t.ctx.win.minimized === true && t.ctx.win.visible !== false, t.ctx.win.calls.join());
// the window is gone: nothing throws
t = setup(true);
t.ctx.win.destroyed = true;
let threw = false;
try { t.ctx.api.showWindow(); } catch (_) { threw = true; }
check('a destroyed window is left alone', !threw);
t = setup(true); t.ctx.win = null; threw = false;
try { t.handlers['win:minimize'](); t.ctx.api.showWindow(); } catch (_) { threw = true; }
check('no window at all: the button and the way back do nothing and do not throw', !threw);
// started in the tray by Windows from a window saved maximized: maximize() would have shown it at start, so the first way back does it
t = setup(true);
t.ctx.win.visible = false; t.ctx.win.maximize = () => t.ctx.win.calls.push('maximize');
t.ctx.maximizeOnShow = true;
t.ctx.api.showWindow();
check('a window started in the tray comes back maximized, once', t.ctx.win.calls.join() === 'maximize,show,focus' && t.ctx.maximizeOnShow === false, t.ctx.win.calls.join());
t.ctx.win.calls.length = 0; t.ctx.api.showWindow();
check('the next time it is only shown', !t.ctx.win.calls.includes('maximize'), t.ctx.win.calls.join());
// A second copy (the app started again while it sits in the tray) only hands over to the first one. app.quit() does not stop 'ready': up to 1.7.9 the
// whole start ran in the second copy, a window and a logon of every account next to the first copy's (measured: its "started" line, its GPU process).
const ready = src.slice(src.indexOf('app.whenReady().then(() => {'));
check('a second copy returns before anything of the start runs', /const singleInstance = app\.requestSingleInstanceLock\(\);/.test(src)
  && /^app\.whenReady\(\)\.then\(\(\) => \{\n(\s*\/\/[^\n]*\n)*\s*if \(!singleInstance\) return;/.test(ready));
process.exit(failures ? 1 : 0);
