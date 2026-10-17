// The difficulty of Realistic Mode turns the completion time that was entered into the time a player of that kind needs. The curves come from
// HowLongToBeat data for 47 games (the "rushed" 100% time is 0.68 of the average, the "leisure" time 2.4 times, never under 1.6 times).
// grTcAndDifficulty is cut out of src/main/js/realistic.js and run against stand-ins for the page. Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'main', 'js', 'realistic.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const a = src.indexOf('    function grTcAndDifficulty(game){');
const b = src.indexOf('    function grOptions(){');
check('the function is in realistic.js', a > 0 && b > a);
const code = src.slice(a, b);

// the multiplier for a game whose completion time is `hours` at the difficulty `diff`, and the time that makes
function multiplier(hours, diff) {
  const ctx = {
    parseFloat, Math, String, Number,
    grVal: (k, d) => ({ grDiff: diff, grCR: '2.0', grTc: String(hours) }[k] ?? d),
    grTcRead: () => 0,
  };
  vm.createContext(ctx);
  vm.runInContext(code + ';this.run = grTcAndDifficulty;', ctx);
  const r = ctx.run({ appid: 1, playtimeMin: 0 });
  return { factor: r.difficultyValue, tc: r.tcHours, time: r.tcHours * r.difficultyValue };
}
const near = (x, y, tol) => Math.abs(x - y) <= tol;

check('normal is the time that was entered', [12, 100, 300, 800].every((h) => multiplier(h, '1.2').factor === 1));
check('easy is a fast player: 9 hours for 12, 67 for 100, 196 for 300, 507 for 800', near(multiplier(12, '0.8').time, 9, 0.5) && near(multiplier(100, '0.8').time, 67, 1) && near(multiplier(300, '0.8').time, 196, 2) && near(multiplier(800, '0.8').time, 507, 3), [12, 100, 300, 800].map((h) => multiplier(h, '0.8').time.toFixed(1)).join(' '));
check('easy never goes below 0.60 or above 0.75 of the time', [1, 2, 12, 100, 800, 5000].every((h) => { const f = multiplier(h, '0.8').factor; return f >= 0.6 && f <= 0.75; }));
check('the longer the game, the more a fast player saves', multiplier(12, '0.8').factor > multiplier(100, '0.8').factor && multiplier(100, '0.8').factor > multiplier(800, '0.8').factor);
check('very hard is a completionist who takes their time: 1.9x on a short game, 1.6x on a long one', near(multiplier(12, '3.5').factor, 1.9, 0.01) && near(multiplier(800, '3.5').factor, 1.6, 0.01) && near(multiplier(100, '3.5').factor, 1.75, 0.02), [12, 100, 800].map((h) => multiplier(h, '3.5').factor).join(' '));
check('very hard is never under 1.6x, the lowest the data shows for the leisure time', [1, 12, 800, 5000].every((h) => multiplier(h, '3.5').factor >= 1.6 && multiplier(h, '3.5').factor <= 1.9));
check('hard is halfway between normal and very hard on a log scale (its square root)', [12, 100, 800].every((h) => near(multiplier(h, '2.0').factor, Math.sqrt(multiplier(h, '3.5').factor), 0.002)));
check('the order is always easy < normal < hard < very hard', [5, 12, 60, 300, 800].every((h) => { const f = ['0.8', '1.2', '2.0', '3.5'].map((d) => multiplier(h, d).factor); return f[0] < f[1] && f[1] < f[2] && f[2] < f[3]; }));
check('an unknown value is read as normal', multiplier(100, '9').factor === 1);

process.exit(failures ? 1 : 0);
