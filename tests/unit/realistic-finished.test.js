// Realistic Mode takes a game with nothing left to unlock out of the account's saved queue: one already finished when a run starts, and one a run finishes.
// Up to 1.8.1 both stayed in the queue for good and were skipped at every start. A game whose target was only a part of its achievements stays.
// Run with `npm test` (tests/run.js).
const { createHarness, HOUR } = require('./realistic-harness');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const BASE = { goalAuto: false, goalValue: 0, autoSpan: false, model: 'linear', randomInterval: false, ultraRareSkip: false, autoOrder: true, continueHours: false,
  accelerateDelayed: false, speedMultiplier: 1, ultraMultiplier: 3, compensationShare: 0.2, finishedRatio: 0.5, tcHours: 20, difficultyValue: 1, parallel: false, tcByGame: {}, playtime: {} };

(async () => {
  // ---- one game finished already, two to unlock; one after the other ----
  let h = createHarness();
  h.game(1, 4, 0); h.game(2, 3, 3); h.game(3, 5, 0);
  h.account('a');
  h.accountsData.set('a', { achLog: [], grQueue: [1, 2, 3] });
  const res = await h.api.realisticStartFor('a', { appid: 1, gameEntries: [1, 2, 3], spanMs: 1 * HOUR, optionList: BASE }, false);
  check('the run starts', res && res.ok, JSON.stringify(res));
  check('the finished game leaves the saved queue at the start', h.accountsData.get('a').grQueue.join() === '1,3', h.accountsData.get('a').grQueue.join());
  check('the page is told the new queue', h.queues.length >= 1 && h.queues[0].grQueue.join() === '1,3', JSON.stringify(h.queues));
  check('and the feed says it', h.events.some(([, e]) => e.typeName === 'realisticGameDone' && e.appid === 2));
  await h.advance(2 * HOUR);
  check('every achievement of the two games was unlocked', h.unlocks.length === 9, String(h.unlocks.length));
  check('each game leaves the queue when its last one is unlocked', h.accountsData.get('a').grQueue.length === 0, h.accountsData.get('a').grQueue.join());
  check('in the order they finished', h.queues.map((q) => q.grQueue.join('/')).join(' | ') === '1/3 | 3 | ', h.queues.map((q) => q.grQueue.join('/')).join(' | '));

  // ---- the same games together ----
  h = createHarness();
  h.game(1, 4, 0); h.game(3, 5, 0);
  h.account('a');
  h.accountsData.set('a', { achLog: [], grQueue: [1, 3] });
  await h.api.realisticStartFor('a', { appid: 1, gameEntries: [1, 3], spanMs: 1 * HOUR, optionList: Object.assign({}, BASE, { parallel: true }) }, false);
  await h.advance(2 * HOUR);
  check('games played together: both leave the queue as they finish', h.unlocks.length === 9 && h.accountsData.get('a').grQueue.length === 0, h.unlocks.length + ' unlocked, left ' + h.accountsData.get('a').grQueue.join());

  // ---- a target of 2 out of 6: the game is not finished, it stays ----
  h = createHarness();
  h.game(5, 6, 0);
  h.account('a');
  h.accountsData.set('a', { achLog: [], grQueue: [5] });
  await h.api.realisticStartFor('a', { appid: 5, gameEntries: [5], spanMs: 1 * HOUR, optionList: Object.assign({}, BASE, { goalValue: 2 }) }, false);
  await h.advance(2 * HOUR);
  check('a run that unlocked only its target leaves the game in the queue', h.unlocks.length === 2 && h.accountsData.get('a').grQueue.join() === '5', h.unlocks.length + ' unlocked, queue ' + h.accountsData.get('a').grQueue.join());

  process.exit(failures ? 1 : 0);
})();
