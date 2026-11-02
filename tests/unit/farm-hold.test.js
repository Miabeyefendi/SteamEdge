// While a game of the account is open on another device the card farm and the hour boost clocks stand still and go on from the same point.
// Run with `npm test` (tests/run.js).
const FarmController = require('../../src/core/farmController');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const engine = { played: 0, play() { this.played++; }, stop() {}, playingApps() { return []; } };

(async () => {
  // sequential: a 1000 ms game time (the least a round takes), held for 500 ms in the middle, must still end after 1000 ms of open time
  const f = new FarmController(engine, () => {}, 'sequential');
  const ticks = [];
  f.emit = (ch, e) => ticks.push(e);
  f.start('sequential', [{ appid: 1, remaining: 1 }, { appid: 2, remaining: 1 }], 1000, { loop: false });
  await wait(400);
  f.hold();
  const idx = f.index;
  await wait(500);
  check('held: the game time does not run out', f.index === idx && f.running, 'index ' + f.index);
  f.release();
  await wait(200);
  check('released: 200 ms later it is still the same game (600 of 1000 ms used)', f.index === idx);
  await wait(800);
  check('and it moves on after the rest of the time', f.index > idx || !f.running, 'index ' + f.index + ' running ' + f.running);
  f.stop('user');

  // the elapsed time shown does not include the held time
  const g = new FarmController(engine, () => {}, 'sequential');
  const t2 = [];
  g.emit = (ch, e) => t2.push(e);
  g.start('sequential', [{ appid: 1, remaining: 1 }], 5000, { loop: true });
  await wait(200);
  g.hold();
  await wait(400);
  g.release();
  const gone = Date.now() - g.startedAt;
  check('elapsed leaves out the held time', gone < 350, String(gone));
  g.stop('user');

  // hold and release with nothing running or twice do nothing wrong
  const h = new FarmController(engine, () => {}, 'card');
  h.hold(); h.release(); h.release();
  check('idle controller ignores hold and release', !h.heldAt && !h.running);
  process.exit(failures ? 1 : 0);
})();
