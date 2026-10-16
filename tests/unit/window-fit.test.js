// Window fit: below the size the layout was drawn for, the page is scaled as a whole. These are the numbers behind it.
// Run with `npm test` (tests/run.js).
const path = require('path');
const { DESIGN, MIN_ZOOM, FLOOR_ZOOM, minWindow, fitZoom } = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'windowFit.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

check('the layout is drawn for 900x560 (the login screen 900x640)', DESIGN.dash.w === 900 && DESIGN.dash.h === 560 && DESIGN.login.w === 900 && DESIGN.login.h === 640);
check('the smallest window is three quarters of that: 675x420 and 675x480', JSON.stringify(minWindow(DESIGN.dash)) === '{"w":675,"h":420}' && JSON.stringify(minWindow(DESIGN.login)) === '{"w":675,"h":480}');
check('a window as big as the design, or bigger, is not zoomed', fitZoom(900, 560, DESIGN.dash) === 1 && fitZoom(1716, 1144, DESIGN.dash) === 1 && fitZoom(900, 5000, DESIGN.dash) === 1);
check('the smallest window shows the whole design at 0.75', fitZoom(675, 420, DESIGN.dash) === MIN_ZOOM && fitZoom(675, 480, DESIGN.login) === MIN_ZOOM);
check('the narrower side decides: 720 wide and 700 high is 0.8', fitZoom(720, 700, DESIGN.dash) === 0.8);
check('and the lower side too: 1200 wide and 448 high is 0.8', fitZoom(1200, 448, DESIGN.dash) === 0.8);
check('the login screen needs more height than the panel', fitZoom(1000, 576, DESIGN.login) === 0.9 && fitZoom(1000, 576, DESIGN.dash) === 1);
check('the factor is cut down to 1/100, never rounded up', fitZoom(800, 500, DESIGN.dash) === 0.88);
check('a few pixels below the minimum (the system allows them) are still covered', fitZoom(659, 412, DESIGN.dash) === 0.73);
check('nothing goes below the floor', fitZoom(100, 100, DESIGN.dash) === FLOOR_ZOOM && FLOOR_ZOOM < MIN_ZOOM);
check('a size that is not there yet changes nothing', fitZoom(0, 0, DESIGN.dash) === 1 && fitZoom(NaN, 300, DESIGN.dash) === 1 && fitZoom(undefined, undefined, DESIGN.dash) === 1);

// For every window the app can end up with (from the minimum, minus the few pixels the system allows, up to well past the design) the page keeps
// at least the design size: nothing is cut at the edge
let worst = Infinity, worstAt = '';
for (const d of [DESIGN.dash, DESIGN.login]) {
  const min = minWindow(d);
  for (let w = min.w - 16; w <= 1100; w += 3) {
    for (let h = min.h - 8; h <= 800; h += 3) {
      const z = fitZoom(w, h, d);
      const room = Math.min(w / z - d.w, h / z - d.h);
      if (room < worst) { worst = room; worstAt = d.w + 'x' + d.h + ' design, window ' + w + 'x' + h + ', zoom ' + z; }
    }
  }
}
check('the page never gets less than the design size, from the minimum up', worst >= -1e-9, 'tightest: ' + worst.toFixed(2) + ' px at ' + worstAt);
process.exit(failures ? 1 : 0);
