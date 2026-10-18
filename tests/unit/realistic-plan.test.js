// Realistic Mode planning: a game that takes 60 hours gets 60 hours for all of its achievements, the target the page shows is the target that runs,
// and a duration typed by hand still gets the old "what a real player would earn in that time" target.
// Run with `npm test` (tests/run.js).
const path = require('path');
const { realisticRarityWeight, planGames, tcFor, placeRealisticTimes, realisticTimeSetting, computeRealisticAccum, hoursForCount, MIN_SPAN_MS, MAX_SPAN_MS } = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'realisticPlan.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const HOUR = 3600000;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// a game with `total` achievements of which `unlocked` are open; the rest is the list, common to rare
function game(total, unlocked, left) {
  const open = total - unlocked;
  const n = left == null ? open : left;
  const queueList = Array.from({ length: n }, (_, i) => ({ apiName: 'A' + i, name: 'Achievement ' + i, rarityPct: 80 - (i * 75) / Math.max(1, n) }));
  return { ok: true, queueList, suitableTotal: n, totalAchievements: total, unlockedState: unlocked };
}
const base = { goalAuto: true, goalValue: 0, autoSpan: true, tcHours: 60, tcByGame: {}, difficultyValue: 1, playtime: {}, model: 'linear', speedMultiplier: 1, ultraMultiplier: 3,
  compensationShare: 0.2, finishedRatio: 0.5, accelerateDelayed: true };

// ---- the report: a game that finishes in 60 hours, default duration of 2 hours ----
let plan = planGames([{ appid: 1, h: game(50, 0) }], base, 2 * HOUR, true);
check('automatic duration: a 60 hour game gets 60 hours, not the 2 hours in the field', plan.auto && plan.spanMs === 60 * HOUR, String(plan.spanMs / HOUR));
check('automatic target is everything that is left', plan.games[0].goal === 50 && plan.games[0].queueList.length === 50);
let g0 = plan.games[0];
placeRealisticTimes(g0.queueList, plan.spanMs, 'linear', 0, realisticTimeSetting(1, Object.assign({ autoSpanApplied: true }, base)));
const last = g0.queueList[g0.queueList.length - 1].timeValue;
check('the last achievement lands at the end of the 60 hours', near(last, 60 * HOUR, 60000), (last / HOUR).toFixed(2) + ' h');
check('and the first one is not at the start', g0.queueList[0].timeValue > HOUR / 2, (g0.queueList[0].timeValue / HOUR).toFixed(2) + ' h');

// ---- the old bug: automatic target on screen, "all" sent to the engine ----
const hand = Object.assign({}, base, { autoSpan: false });
plan = planGames([{ appid: 1, h: game(50, 0) }], hand, 2 * HOUR, true);
check('duration by hand: the automatic target is the share of those 2 hours, not all 50', plan.games[0].goal === 2 && plan.games[0].queueList.length === 2, String(plan.games[0].goal));
check('and the duration stays what was typed', plan.spanMs === 2 * HOUR && !plan.auto);
// a backlog (30 hours played of 60, nothing unlocked) is on top of the share
plan = planGames([{ appid: 1, h: game(50, 0) }], Object.assign({}, hand, { playtime: { 1: 30 * 60 } }), 2 * HOUR, true);
check('duration by hand: the backlog comes on top (25 behind + 2 for the 2 hours)', plan.games[0].goal === 27, String(plan.games[0].goal));

// ---- a target typed by hand ----
plan = planGames([{ appid: 1, h: game(50, 0) }], Object.assign({}, base, { goalAuto: false, goalValue: 10 }), 2 * HOUR, true);
check('a target of 10 out of 50 with automatic duration lasts a fifth of the completion time', plan.spanMs === 12 * HOUR && plan.games[0].goal === 10, String(plan.spanMs / HOUR));
plan = planGames([{ appid: 1, h: game(50, 0) }], Object.assign({}, base, { goalAuto: false, goalValue: 10, autoSpan: false }), 5 * HOUR, true);
check('a target typed by hand with a duration typed by hand: both are kept', plan.spanMs === 5 * HOUR && plan.games[0].goal === 10);
plan = planGames([{ appid: 1, h: game(50, 0) }], Object.assign({}, base, { goalAuto: false, goalValue: 500 }), 2 * HOUR, true);
check('a target bigger than what is left is cut to what is left', plan.games[0].goal === 50);

// ---- progress already made ----
plan = planGames([{ appid: 1, h: game(50, 30) }], base, 2 * HOUR, true);
check('with 30 of 50 unlocked the run covers the 20 that are left: 24 hours', plan.spanMs === 24 * HOUR && plan.games[0].goal === 20, String(plan.spanMs / HOUR));
plan = planGames([{ appid: 1, h: game(50, 0, 40) }], base, 2 * HOUR, true);
check('achievements the game protects or the setting skips are not counted: 40 of 50 -> 48 hours', plan.spanMs === 48 * HOUR, String(plan.spanMs / HOUR));

// ---- a finished game (played longer than the completion time) ----
const finishedPick = Object.assign({}, base, { playtime: { 1: 100 * 60 } });
plan = planGames([{ appid: 1, h: game(50, 0) }], finishedPick, 2 * HOUR, true);
check('a game played for 100 hours still gets its 60 hours', plan.spanMs === 60 * HOUR);
const timing = realisticTimeSetting(1, Object.assign({ autoSpanApplied: plan.auto }, finishedPick));
check('and the "finished game" compression is not laid on top of the automatic duration', timing.finishedFlag === true && timing.finishedRatio === 1);
const timingHand = realisticTimeSetting(1, Object.assign({ autoSpanApplied: false }, finishedPick));
check('with a duration typed by hand the compression still applies', timingHand.finishedRatio === 0.5);
placeRealisticTimes(plan.games[0].queueList, plan.spanMs, 'linear', computeRealisticAccum(1, plan.games[0].h, Object.assign({ autoSpanApplied: true }, finishedPick)), timing);
const lastFinished = plan.games[0].queueList[plan.games[0].queueList.length - 1].timeValue;
check('the last unlock of a finished game is still at the end of the run', near(lastFinished, 60 * HOUR, 60000), (lastFinished / HOUR).toFixed(1) + ' h');

// ---- several games ----
plan = planGames([{ appid: 1, h: game(50, 0) }, { appid: 2, h: game(20, 0) }], Object.assign({}, base, { tcByGame: { 1: 60, 2: 20 } }), 2 * HOUR, true);
check('two games: the run is the sum of what each takes (60 + 20 hours)', plan.spanMs === 80 * HOUR, String(plan.spanMs / HOUR));
check('each game unlocks all that is left', plan.games[0].goal === 50 && plan.games[1].goal === 20);
check('the completion time of a game is its own', tcFor(2, Object.assign({}, base, { tcByGame: { 2: 20 } })) === 20 && tcFor(1, Object.assign({}, base, { tcByGame: { 2: 20 } })) === 60);
plan = planGames([{ appid: 1, h: game(50, 0) }, { appid: 2, h: game(20, 0) }], Object.assign({}, hand, { tcByGame: { 1: 60, 2: 20 } }), 8 * HOUR, true);
check('two games with a duration typed by hand share it by what is left in each', plan.spanMs === 8 * HOUR && plan.games[0].goal + plan.games[1].goal >= 2);

// ---- the schedule ----
plan = planGames([{ appid: 1, h: game(50, 0) }], base, 3 * HOUR, false);
check('a run the schedule starts keeps the span it was given', plan.spanMs === 3 * HOUR && !plan.auto);
check('and its automatic target is what fits that span (3 of 50), not everything', plan.games[0].goal === 3, String(plan.games[0].goal));

// ---- limits ----
plan = planGames([{ appid: 1, h: game(300, 299) }], base, 2 * HOUR, true);
check('the shortest automatic run is 15 minutes', plan.spanMs === MIN_SPAN_MS, String(plan.spanMs));
plan = planGames([{ appid: 1, h: game(50, 0) }], Object.assign({}, base, { tcHours: 100000, tcByGame: {} }), 2 * HOUR, true);
check('the longest is what the duration field can hold, 999 hours', plan.spanMs === MAX_SPAN_MS);
check('a game with nothing left has an empty plan', planGames([{ appid: 1, h: game(10, 10) }], base, 2 * HOUR, true).games[0].queueList.length === 0);
check('hours for a count', near(hoursForCount(10, 50, 60, 1), 12, 1e-9) && hoursForCount(0, 50, 60, 1) === 0 && hoursForCount(5, 0, 60, 1) === 0);

// difficulty scales the whole way (the page sends it relative to "normal")
plan = planGames([{ appid: 1, h: game(50, 0) }], Object.assign({}, base, { difficultyValue: 2 }), 2 * HOUR, true);
check('twice as hard: twice the time', plan.spanMs === 120 * HOUR);
// ---- a run resumed after a restart: what was left of the target of each game (src/core/resumeJobs.js) ----
plan = planGames([{ appid: 1, h: game(50, 20) }, { appid: 2, h: game(40, 0) }], Object.assign({}, base, { goalAuto: false, autoSpan: false, goalByGame: { 1: 7, 2: 12 } }), 3 * HOUR, false);
check('a resumed run unlocks exactly what was left of each game, over the time that is left', plan.games[0].goal === 7 && plan.games[1].goal === 12 && plan.spanMs === 3 * HOUR && !plan.auto, plan.games.map((g) => g.goal).join());
check('and never more than is left in the game', planGames([{ appid: 1, h: game(50, 45) }], Object.assign({}, base, { goalByGame: { 1: 30 } }), 2 * HOUR, false).games[0].goal === 5);
check('a game with nothing left of its target gets no list', planGames([{ appid: 1, h: game(10, 0) }], Object.assign({}, base, { goalByGame: { 1: 0 } }), HOUR, false).games[0].queueList.length === 0);
check('a game that is not named follows the usual target', planGames([{ appid: 1, h: game(50, 0) }, { appid: 2, h: game(20, 0) }], Object.assign({}, base, { goalAuto: false, goalValue: 0, autoSpan: false, goalByGame: { 2: 3 } }), HOUR, false).games.map((g) => g.goal).join() === '50,3');
// ---- the order and the gaps by rarity: the achievement most players have comes first and fast, the rarest last and slow ----
check('the weight grows as the achievement gets rarer: 100% 1, 50% 1.17, 20% 1.4, 5% 1.75', near(realisticRarityWeight(100, 3), 1, 1e-9) && near(realisticRarityWeight(50, 3), 1.173, 0.01) && near(realisticRarityWeight(20, 3), 1.402, 0.01) && near(realisticRarityWeight(5, 3), 1.748, 0.01));
check('under 5% it is multiplied by the ultra rare wait of the settings', near(realisticRarityWeight(1, 3) / realisticRarityWeight(1, 1), 3, 1e-9) && near(realisticRarityWeight(4.9, 4) / realisticRarityWeight(4.9, 1), 4, 1e-9) && realisticRarityWeight(5, 4) === realisticRarityWeight(5, 1));
check('an unknown rarity has the plain weight and the extremes stay finite', realisticRarityWeight(null, 3) === 1 && realisticRarityWeight(undefined, 3) === 1 && Number.isFinite(realisticRarityWeight(0, 3)) && realisticRarityWeight(0, 3) === realisticRarityWeight(0.1, 3));
check('a rarer achievement never weighs less than a more common one (with the same setting)', [100, 80, 60, 40, 20, 10, 5.1, 4.9, 3, 1, 0.5, 0.1].every((p, i, a) => i === 0 || realisticRarityWeight(p, 3) >= realisticRarityWeight(a[i - 1], 3)));
{
  const q = [60, 40, 20, 8, 5, 3, 1, 0.2].map((x, i) => ({ rarityPct: x, name: 'a' + i }));
  placeRealisticTimes(q, HOUR, 'linear', 0, {});
  const gaps = q.map((x, i) => x.timeValue - (i ? q[i - 1].timeValue : 0));
  check('the unlock times rise in the order of the queue', q.every((x, i) => i === 0 || x.timeValue > q[i - 1].timeValue));
  check('the gaps widen as the queue goes to the rarer ones', gaps.every((g, i) => i === 0 || g >= gaps[i - 1] - 1), gaps.map((g) => Math.round(g / 60000)).join(' '));
  check('the common half is out in the first third of the run, the ultra rare ones take the rest of it', q[3].timeValue < HOUR / 3 && q[5].timeValue > HOUR * 0.4 && q[7].timeValue === HOUR);
  check('the most common achievement is unlocked within the first few minutes', q[0].timeValue < 5 * 60000);
}
process.exit(failures ? 1 : 0);
