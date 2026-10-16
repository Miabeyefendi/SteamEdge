// Window fit: below the size the layout was drawn for, the page is scaled as a whole. These are the numbers behind it.
// Run with `npm test` (tests/run.js).
const path = require('path');
const { DESIGN, MIN_ZOOM, FLOOR_ZOOM, SCALES, minWindow, fitZoom, normalizeScale, stepScale } = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'windowFit.js'));
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

// The interface scale the user picks: the window zooms the page to it while the design still fits at that size
check('the scale steps are 80 to 150 percent', JSON.stringify(SCALES) === '[80,90,100,110,125,150]');
check('anything that is not a step is 100', normalizeScale(undefined) === 100 && normalizeScale('abc') === 100 && normalizeScale(120) === 100 && normalizeScale('125') === 125 && normalizeScale(150) === 150);
check('a big window shows the page at the chosen scale', fitZoom(1716, 1144, DESIGN.dash, 125) === 1.25 && fitZoom(1716, 1144, DESIGN.dash, 80) === 0.8 && fitZoom(1716, 1144, DESIGN.dash, '110') === 1.1);
check('a window too small for the design at that scale gives way: 1000 x 700 at 150 percent is 1.11', fitZoom(1000, 700, DESIGN.dash, 150) === 1.11);
check('and at the smallest window the scale does not matter', fitZoom(675, 420, DESIGN.dash, 150) === MIN_ZOOM && fitZoom(675, 420, DESIGN.dash, 80) === MIN_ZOOM);
check('no scale given is the old behaviour', fitZoom(1716, 1144, DESIGN.dash) === 1 && fitZoom(800, 500, DESIGN.dash) === 0.88);
check('Ctrl + steps up, Ctrl - steps down, and the ends stay', stepScale(100, 1) === 110 && stepScale(100, -1) === 90 && stepScale(150, 1) === 150 && stepScale(80, -1) === 80 && stepScale(undefined, 1) === 110);
// for every scale and every window the page keeps at least the design size, so nothing is cut at the edge
let worstScaled = Infinity;
for (const sc of SCALES) for (let w = 640; w <= 1800; w += 40) for (let h = 400; h <= 1200; h += 40) {
  const z = fitZoom(w, h, DESIGN.dash, sc);
  if (z < FLOOR_ZOOM + 0.0001) continue;      // below the smallest window the floor decides, not the scale
  worstScaled = Math.min(worstScaled, w / z - DESIGN.dash.w, h / z - DESIGN.dash.h);
}
check('at every scale the page keeps the design size', worstScaled >= -0.5, 'worst ' + worstScaled.toFixed(2));

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
