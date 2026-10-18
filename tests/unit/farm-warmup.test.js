// Fast mode warm-up: the games that are already past the playtime threshold drop cards from the first minute, while the cold ones are pulled up.
// (Before, a game with hours of playtime sat idle for the whole warm-up of the others.) Time is virtual: timers and Date.now are replaced.
// Run with `npm test` (tests/run.js).
const FC = require('../../src/core/farmController.js');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const MIN = 60000;

// virtual clock
let now = 1700000000000;
const timers = [];
const realNow = Date.now, realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
Date.now = () => now;
global.setTimeout = (fn, ms) => { const t = { at: now + (ms || 0), fn, on: true }; timers.push(t); return t; };
global.clearTimeout = (t) => { if (t) t.on = false; };
async function advance(ms) {
  const end = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.on && t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at; due.on = false; due.fn();
    await Promise.resolve(); await Promise.resolve();
  }
  now = end;
  await Promise.resolve(); await Promise.resolve();
}

(async () => {
  const played = [];
  const eng = { play: (ids) => played.push(ids.slice()), stop() {}, playingApps: () => played[played.length - 1] || [] };
  const ticks = [];
  const fc = new FC(eng, (ch, d) => ticks.push(d), 'card');
  // two cold games (8 min), one hot game (338 min), one more hot game; threshold 60 minutes
  const games = [
    { appid: 1, name: 'cold a', remaining: 3, playtimeMin: 8 },
    { appid: 2, name: 'cold b', remaining: 3, playtimeMin: 8 },
    { appid: 3, name: 'hot c', remaining: 3, playtimeMin: 338 },
    { appid: 4, name: 'hot d', remaining: 3, playtimeMin: 120 },
  ];
  fc.start('fast', games, 5 * 60 * MIN, { fastMinPlaytimeMin: 60, maxGames: 32, fastRotateMinSec: 90, fastRotateMaxSec: 90 });
  await advance(1);
  check('the warm-up opens the cold games AND the hot ones together from the first moment', played.length >= 1 && [1, 2, 3, 4].every((id) => played[0].includes(id)), JSON.stringify(played[0]));
  check('the cold ones come first in the list, the hot ones after', JSON.stringify(played[0]) === '[1,2,3,4]');
  check('the job is in its warm-up phase and a hot game is the one in front', fc.phaseName === 'warmup' && [3, 4].includes(fc.currentActiveAppid));
  const first = played.length;
  await advance(10 * MIN);
  check('while the cold games warm up the list is refreshed at the rotation rhythm (every 90 s), which is what triggers the drops', played.length - first >= 6 && played.length - first <= 7, String(played.length - first));
  const seen = new Set();
  const tickBefore = ticks.length;
  await advance(3 * MIN);
  ticks.slice(tickBefore).forEach((d) => { if (d.currentAppid) seen.add(d.currentAppid); });
  check('the hot games take turns in front', seen.has(3) && seen.has(4), JSON.stringify([...seen]));
  check('every refresh keeps all four games open', played.every((l) => JSON.stringify(l) === '[1,2,3,4]'));
  await advance(40 * MIN);
  check('after about 52 minutes (the deficit of the cold games) the warm-up is over and the loop has all four games', fc.phaseName === 'rotate' && played[played.length - 1].length === 4, fc.phaseName);
  fc.stop('user');

  // no hot game: one wait, no refresh in between (the old behaviour)
  played.length = 0;
  const fc2 = new FC(eng, () => {}, 'card');
  fc2.start('fast', [{ appid: 1, name: 'a', remaining: 3, playtimeMin: 0 }, { appid: 2, name: 'b', remaining: 3, playtimeMin: 30 }], 5 * 60 * MIN, { fastMinPlaytimeMin: 60, maxGames: 32, fastRotateMinSec: 90, fastRotateMaxSec: 90 });
  await advance(1);
  await advance(20 * MIN);
  check('with only cold games the list is opened once and left alone during the warm-up', played.length === 1 && JSON.stringify(played[0]) === '[1,2]', String(played.length));
  fc2.stop('user');

  // room: cardMaxGames bounds cold plus hot together
  played.length = 0;
  const fc3 = new FC(eng, () => {}, 'card');
  const many = [];
  for (let i = 1; i <= 4; i++) many.push({ appid: i, name: 'c' + i, remaining: 2, playtimeMin: 5 });
  for (let i = 5; i <= 10; i++) many.push({ appid: i, name: 'h' + i, remaining: 2, playtimeMin: 500 });
  fc3.start('fast', many, 5 * 60 * MIN, { fastMinPlaytimeMin: 60, maxGames: 6, fastRotateMinSec: 90, fastRotateMaxSec: 90 });
  await advance(1);
  check('cold plus hot never go over cardMaxGames: 4 cold and 2 hot of 6 hot games', played[0].length === 6 && JSON.stringify(played[0]) === '[1,2,3,4,5,6]', JSON.stringify(played[0]));
  fc3.stop('user');

  Date.now = realNow; global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout;
  process.exit(failures ? 1 : 0);
})();
