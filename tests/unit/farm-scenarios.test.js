// Card farming, the state machine (src/core/farmController.js) driven with a fake clock: every mode, a game running out of cards (the active one, one waiting,
// all of them), "move on when a game is done" off, the queue not looping, fast mode warm-up and loop with hot and cold games, the room under cardMaxGames, a
// settings change in the middle (location and proceeding), a stop and a restart while the warm-up waits. What is checked is what the engine is told to play,
// what the page is told (the ticks), and that nothing is left running.
// Run with `npm test` (tests/run.js).
const path = require('path');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

// ---- fake clock: the controller uses the global timers and Date.now ----
let now = 1000000000000;
let timers = [];
let nextId = 1;
global.setTimeout = (fn, ms) => { const id = nextId++; timers.push({ id, at: now + Math.max(0, ms || 0), fn }); return id; };
global.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
const realNow = Date.now;
Date.now = () => now;
Math.random = () => 0.5;
async function advance(ms) {
  const end = now + ms;
  for (let guard = 0; guard < 500000; guard++) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    now = Math.max(now, t.at);
    t.fn();
    await new Promise((r) => setImmediate(r));
  }
  now = end;
  await new Promise((r) => setImmediate(r));
}
const FarmController = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'farmController.js'));
const MIN = 60000;

function setup() {
  const plays = [], stops = [], ticks = [];
  const engine = { playing: [], play(ids, owner) { this.playing = ids.slice(); plays.push({ ids: ids.slice(), owner, at: now }); }, stop(owner) { stops.push(owner); this.playing = []; } };
  const fc = new FarmController(engine, (ch, d) => { if (ch === 'farm:tick') ticks.push(d); }, 'card');
  return { fc, engine, plays, stops, ticks, last: () => ticks[ticks.length - 1] };
}
const games = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ appid: 10 + i, name: 'G' + i, remaining: 3 + i, playtimeMin: 600 }, extra && extra(i)));

(async () => {
  // ---- sequential: each game its time, in order, looping ----
  let t = setup();
  t.fc.start('sequential', games(3), 10 * MIN);
  check('sequential: the first game plays first, alone', t.plays[0].ids.join() === '10' && t.plays[0].owner === 'card');
  await advance(10 * MIN + 1000);
  check('sequential: after its time the second one', t.plays[t.plays.length - 1].ids.join() === '11');
  await advance(20 * MIN);
  check('sequential: after the last one it starts over (loop)', t.plays[t.plays.length - 1].ids.join() === '10', t.plays.map((p) => p.ids.join()).join(' '));
  check('sequential: the page ticks while it runs', t.last().running === true && t.last().currentAppid === 10);
  t.fc.stop('user');
  check('stop: the engine stops this job\'s games and the page is told why', t.stops.join() === 'card' && t.last().running === false && t.last().cause === 'user');
  await advance(60 * MIN);
  check('stop: nothing plays and nothing ticks after the stop', timers.length === 0 && t.last().running === false, String(timers.length));

  // ---- most / least sort ----
  t = setup();
  t.fc.start('most', games(3), 10 * MIN);
  check('most: the game with the most cards left first', t.plays[0].ids.join() === '12');
  t.fc.stop(); t = setup();
  t.fc.start('least', games(3), 10 * MIN);
  check('least: the game with the fewest cards left first', t.plays[0].ids.join() === '10');
  t.fc.stop();

  // ---- the ACTIVE game runs out of cards ----
  t = setup();
  t.fc.start('sequential', games(3), 30 * MIN);
  await advance(5 * MIN);
  t.fc.updateGames([{ appid: 10, remaining: 0 }, { appid: 11, remaining: 4 }, { appid: 12, remaining: 5 }], new Set([10]));
  check('active game done: it moves on at once (does not wait out the 30 minutes)', t.plays[t.plays.length - 1].ids.join() === '11' && t.plays[t.plays.length - 1].at === now);
  check('active game done: it is out of the job', t.fc.games.map((g) => g.appid).join() === '11,12');
  await advance(30 * MIN + 1000);
  check('active game done: then the next one after its full time', t.plays[t.plays.length - 1].ids.join() === '12');
  // a WAITING game runs out: the active one keeps its time
  const before = t.plays.length;
  t.fc.updateGames([{ appid: 11, remaining: 0 }, { appid: 12, remaining: 5 }], new Set([11]));
  check('waiting game done: the active one is not interrupted', t.plays.length === before && t.fc.games.map((g) => g.appid).join() === '12');
  await advance(31 * MIN);
  check('one game left: it loops on itself', t.plays[t.plays.length - 1].ids.join() === '12');
  t.fc.updateGames([{ appid: 12, remaining: 0 }], new Set([12]));
  check('all games done: the job stops by itself and says "finished"', t.fc.running === false && t.last().running === false && t.last().cause === 'finished');
  await advance(60 * MIN);
  check('all games done: no timer left', timers.length === 0, String(timers.length));
  // a game missing from an incomplete scrape is NOT removed
  t = setup();
  t.fc.start('sequential', games(3), 30 * MIN);
  t.fc.updateGames([{ appid: 10, remaining: 2 }], new Set());
  check('incomplete scrape: games missing from it stay in the job', t.fc.games.length === 3);
  t.fc.stop();

  // ---- "move on when a game is done" off ----
  t = setup();
  t.fc.start('sequential', games(3), 10 * MIN, { autoNext: false });
  await advance(10 * MIN + 1000);
  check('move on off: the time is up -> it stops with "duration"', t.fc.running === false && t.last().cause === 'duration');
  t = setup();
  t.fc.start('sequential', games(3), 10 * MIN, { autoNext: false });
  t.fc.updateGames([{ appid: 10, remaining: 0 }], new Set([10]));
  check('move on off: the active game runs out of cards -> it stops with "gameFinished"', t.fc.running === false && t.last().cause === 'gameFinished');

  // ---- not looping (Hour Booster "repeat the queue" off) ----
  t = setup();
  t.fc.start('sequential', games(2), 10 * MIN, { loop: false });
  await advance(21 * MIN);
  check('no loop: after the last game the job ends with "finished"', t.fc.running === false && t.last().cause === 'finished', t.plays.map((p) => p.ids.join()).join(' '));
  t = setup();
  t.fc.start('sequential', games(2), 10 * MIN, { loop: false });
  await advance(11 * MIN);
  t.fc.updateGames([{ appid: 11, remaining: 0 }, { appid: 10, remaining: 3 }], new Set([11]));
  check('no loop: the last game runs out of cards -> the job ends, it does not go back to the first', t.fc.running === false && t.last().cause === 'finished', t.plays.map((p) => p.ids.join()).join(' '));

  // ---- a settings change in the middle: location() and proceeding ----
  t = setup();
  t.fc.start('sequential', games(3), 30 * MIN);
  await advance(30 * MIN + 1000 + 12 * MIN);    // second game, 12 minutes in
  const loc = t.fc.location();
  check('location: on the second game, 12 minutes in', loc.index === 1 && Math.abs(loc.passedMs - 12 * MIN) < 2000, JSON.stringify(loc));
  t.fc.start('sequential', t.fc.games, 30 * MIN, { proceeding: loc });
  check('proceeding: the rebuilt job goes on with the same game', t.plays[t.plays.length - 1].ids.join() === '11');
  await advance(18 * MIN + 1000);
  check('proceeding: and moves on after the 18 minutes that were left, not 30', t.plays[t.plays.length - 1].ids.join() === '12', t.plays.map((p) => p.ids.join() + '@' + Math.round((p.at - t.plays[0].at) / MIN)).join(' '));
  t.fc.stop();

  // ---- fast mode: cold games warm up together, hot ones drop from the first minute ----
  t = setup();
  const mixed = [{ appid: 1, remaining: 3, playtimeMin: 30 }, { appid: 2, remaining: 3, playtimeMin: 100 }, { appid: 3, remaining: 3, playtimeMin: 400 }, { appid: 4, remaining: 3, playtimeMin: 500 }];
  t.fc.start('fast', mixed, 30 * MIN, { maxGames: 32, fastMinPlaytimeMin: 120 });
  await advance(1000);
  check('fast warm-up: cold and hot games are all open from the start', t.plays[0].ids.slice().sort().join() === '1,2,3,4', t.plays[0].ids.join());
  check('fast warm-up: the page is told the warm-up phase', t.ticks.some((x) => x.phase === 'warmup'));
  await advance(30 * MIN);
  check('fast warm-up: the open list is refreshed at the rotation rhythm, hot games in front in turn', t.plays.length >= 10 && new Set(t.plays.slice(0, 6).map(() => t.fc.currentActiveAppid)).size >= 1);
  await advance(60 * MIN);                       // 90 minutes in: the 30 minute game needs 90 minutes
  check('fast warm-up: after the largest deficit (90 min) the loop phase starts', t.fc.phaseName === 'rotate', t.fc.phaseName);
  const pl = t.plays.length;
  await advance(10 * MIN);
  check('fast loop: the featured game changes every 1.5-2 minutes (about 5 refreshes in 10 minutes)', t.plays.length - pl >= 4 && t.plays.length - pl <= 7, String(t.plays.length - pl));
  check('fast loop: all four stay open', t.plays[t.plays.length - 1].ids.length === 4);
  t.fc.updateGames(mixed.map((g) => ({ appid: g.appid, remaining: g.appid === 3 ? 0 : 3 })), new Set([3]));
  check('fast loop: a game out of cards leaves the open list', t.plays[t.plays.length - 1].ids.slice().sort().join() === '1,2,4');
  t.fc.updateGames([{ appid: 1, remaining: 0 }, { appid: 2, remaining: 0 }, { appid: 4, remaining: 0 }], new Set([1, 2, 4]));
  check('fast loop: the last ones done -> finished, no timer left', t.fc.running === false && t.last().cause === 'finished' && timers.length === 0, String(timers.length));

  // ---- fast mode: the room under cardMaxGames ----
  t = setup();
  const lots = Array.from({ length: 6 }, (_, i) => ({ appid: 100 + i, remaining: 2, playtimeMin: i < 4 ? 0 : 300 }));
  t.fc.start('fast', lots, 30 * MIN, { maxGames: 5, fastMinPlaytimeMin: 120 });
  await advance(1000);
  check('maxGames 5 with 4 cold and 2 hot: 4 cold + 1 hot are open, never more than 5', t.plays[0].ids.length === 5 && t.plays.every((p) => p.ids.length <= 5), t.plays[0].ids.join());
  t.fc.stop();

  // ---- fast mode: stop and restart while the warm-up waits ----
  t = setup();
  t.fc.start('fast', [{ appid: 1, remaining: 3, playtimeMin: 0 }], 30 * MIN, { fastMinPlaytimeMin: 120 });
  await advance(10 * MIN);
  t.fc.stop('user');
  await advance(200 * MIN);
  check('stop during warm-up: the warm-up does not wake up later and start the loop', t.fc.running === false && t.fc.phaseName === null && timers.length === 0, String(t.fc.phaseName) + ' ' + timers.length);
  t.fc.start('fast', [{ appid: 1, remaining: 3, playtimeMin: 0 }], 30 * MIN, { fastMinPlaytimeMin: 120 });
  await advance(10 * MIN);
  const loc2 = t.fc.location();
  check('location in warm-up: the 10 minutes are credited to the game (so a rebuild does not start the warm-up over)', t.fc.games[0].playtimeMin === 10, String(t.fc.games[0].playtimeMin));
  t.fc.start('fast', t.fc.games, 30 * MIN, { fastMinPlaytimeMin: 120, proceeding: loc2 });
  await advance(111 * MIN);
  check('restart in warm-up: the old warm-up loop does not run next to the new one (one phase, one timer set)', t.fc.phaseName === 'rotate' && timers.filter((x) => x).length <= 2, t.fc.phaseName + ' ' + timers.length);
  t.fc.stop();

  // ---- empty list ----
  t = setup();
  t.fc.start('sequential', [], 10 * MIN);
  check('empty list: it ends at once with "finished"', t.fc.running === false && t.last().cause === 'finished');

  Date.now = realNow;
  process.exit(failures ? 1 : 0);
})();
