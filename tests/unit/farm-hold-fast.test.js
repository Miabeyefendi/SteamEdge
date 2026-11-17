// The account owner starts a game on the real Steam client: Steam counts nothing for the farm then, so a card farm in fast mode must stand still
// (no rotation, no list sent, the elapsed clock frozen) and go on when the other game ends. Before 4.3.4 only the other modes stopped.
// Run with `npm test` (tests/run.js).
const FC = require('../../src/core/farmController.js');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const played = [], ticks = [];
  const eng = { play: (ids) => played.push(ids.slice()), stop() {}, playingApps: () => played[played.length - 1] || [] };
  const fc = new FC(eng, (ch, d) => { if (ch === 'farm:tick') ticks.push(d); }, 'card');
  fc.start('fast', [{ appid: 1, name: 'a', remaining: 3, playtimeMin: 300 }, { appid: 2, name: 'b', remaining: 3, playtimeMin: 300 }], 600000, { fastMinPlaytimeMin: 60, maxGames: 32, fastRotateMinSec: 1, fastRotateMaxSec: 1 });
  await wait(2300);
  check('before the hold the rotation sends the list', played.length >= 2, String(played.length));

  fc.hold();
  const sent = played.length;
  await wait(1200);                  // the first tick after the hold is the first frozen one
  const at = ticks.length ? ticks[ticks.length - 1].elapsedMs : -1;
  await wait(2500);
  check('held: no list is sent while the other game runs', played.length === sent, sent + ' -> ' + played.length);
  const last = ticks[ticks.length - 1];
  check('held: the tick goes on and says so', last && last.held === true);
  check('held: the elapsed clock stands still', last && Math.abs(last.elapsedMs - at) < 50, at + ' -> ' + (last && last.elapsedMs));
  check('held: the rotation timer is stopped', fc.timer === null);

  fc.release();
  check('released: the list is sent again at once', played.length === sent + 1, sent + ' -> ' + played.length);
  await wait(1300);
  check('released: the rotation runs again', played.length >= sent + 2, String(played.length));
  const after = ticks[ticks.length - 1];
  check('released: the tick no longer says held', after && after.held === false);

  // a game finishing while held (the pool is refreshed) sends nothing; it is picked up at the release
  fc.hold();
  const n = played.length;
  fc.updateGames([{ appid: 1, name: 'a', remaining: 2 }], new Set([2]));
  fc._refreshPool();
  check('held: a pool refresh sends nothing', played.length === n, n + ' -> ' + played.length);
  fc.release();
  check('released: the new pool is what is sent', JSON.stringify(played[played.length - 1]) === '[1]', JSON.stringify(played[played.length - 1]));
  fc.stop('user');
  process.exit(failures ? 1 : 0);
})();
