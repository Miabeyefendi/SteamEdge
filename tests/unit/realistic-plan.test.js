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
// ---- rarity: proportions of the game's own achievements; ultra rare ones are the last tenth, last in the run and never squeezed ----
const { rarityPositions, isUltraRare, ULTRA_POS, STORY_POS } = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'realisticPlan.js'));
{
  const list = Array.from({ length: 10 }, (_, i) => ({ apiName: 'a' + i, rarityPct: 50 - i * 4 }));
  const pos = rarityPositions(list);
  check('the place of an achievement in its game: 0 for the most common, rising by a tenth for ten achievements', near(pos.get('a0'), 0, 1e-9) && near(pos.get('a5'), 0.5, 1e-9) && near(pos.get('a9'), 0.9, 1e-9));
  check('the last tenth is ultra rare, the rest is not', isUltraRare(pos.get('a9')) && !isUltraRare(pos.get('a8')) && ULTRA_POS === 0.9 && STORY_POS === 0.35);
  const same = rarityPositions([{ apiName: 'b', rarityPct: 4.93 }, { apiName: 'a', rarityPct: 4.94 }, { apiName: 'c', rarityPct: 4.91 }, { apiName: 'x', rarityPct: null }]);
  check('percentages that read the same at one decimal keep the order they came in, an unknown one has no place', same.get('b') === 0 && same.get('a') > 0 && same.get('c') > same.get('a') && !same.has('x'));
  const flat = Array.from({ length: 50 }, (_, i) => ({ apiName: 'f' + i, rarityPct: 7 - i * 0.08 }));
  const flatPos = rarityPositions(flat);
  check('a game whose achievements all sit between 3% and 7% still has a rare end: the last tenth of them is ultra rare', flat.filter((x) => isUltraRare(flatPos.get(x.apiName))).length === 5);
}
check('the ultra rare weight is the setting, everything else weighs the same', realisticRarityWeight(true, 3) === 3 && realisticRarityWeight(true, 1) === 1 && realisticRarityWeight(false, 3) === 1 && realisticRarityWeight(undefined, 3) === 1);
{
  // 100 achievements, the way main.js gives them: percentages from the most common to the rarest, each with its place
  const pcts = [...Array.from({ length: 80 }, (_, i) => 60 - i * 0.3), ...Array.from({ length: 10 }, (_, i) => 12 - i * 0.5), ...Array.from({ length: 10 }, (_, i) => 2.5 - i * 0.2)];
  const mk = () => { const base = pcts.map((x, i) => ({ apiName: 'a' + i, rarityPct: x, name: 'a' + i })); const p = rarityPositions(base); return base.map((x) => ({ ...x, pos: p.get(x.apiName), ultra: isUltraRare(p.get(x.apiName)) })); };
  const q = mk();
  check('100 achievements: exactly the last 10 are ultra rare', q.filter((x) => x.ultra).length === 10 && q.slice(90).every((x) => x.ultra));
  placeRealisticTimes(q, 10 * HOUR, 'linear', 0, {});
  const ultras = q.slice(90), others = q.slice(0, 90);
  check('none of the ultra rare ones is among the first 90 unlocks', others.every((x, i) => i === 0 || x.timeValue >= others[i - 1].timeValue) && ultras.every((x) => x.timeValue >= others[89].timeValue));
  check('the first unlock is a common one and comes early', q[0].timeValue < 15 * 60000 && !q[0].ultra);
  const waits = q.map((x, i) => x.timeValue - (i ? q[i - 1].timeValue : 0));
  check('the gap in front of the first ultra rare one is the ultra rare wait (3x an ordinary gap)', near(waits[90] / waits[50], 3, 0.2), (waits[90] / waits[50]).toFixed(2));
  // the backlog squeeze: 50 overdue, but only the first 35 may be squeezed (the end of a story)
  const sq = mk();
  placeRealisticTimes(sq, 10 * HOUR, 'linear', 50, {});
  const squeezed = sq.filter((x) => x.delayCompensation);
  check('50 overdue: only the first 35 achievements (a story) are squeezed into the start, the rest keeps its rhythm', squeezed.length === 35 && squeezed.every((x) => x.pos < 0.35 && !x.ultra) && !sq[40].delayCompensation, String(squeezed.length));
  const sq2 = mk();
  placeRealisticTimes(sq2, 10 * HOUR, 'linear', 95, {});
  check('an overdue count that reaches into the rare and ultra rare ones stops at the same place', sq2.filter((x) => x.delayCompensation).length === 35 && sq2.slice(90).every((x) => !x.delayCompensation));
  const sq3 = mk();
  placeRealisticTimes(sq3, 10 * HOUR, 'pareto', 0, {});
  check('a model that bends the curve still keeps the ultra rare ones after the others', sq3.slice(90).every((x) => x.timeValue >= Math.max(...sq3.slice(0, 90).map((y) => y.timeValue))));
  // no rarity at all (Steam did not answer): the list is still placed in order and nothing is squeezed
  const none = Array.from({ length: 6 }, (_, i) => ({ rarityPct: null, name: 'n' + i }));
  placeRealisticTimes(none, HOUR, 'linear', 4, {});
  check('without any rarity data the unlocks still rise in order and nothing is squeezed', none.every((x, i) => !x.delayCompensation && (i === 0 || x.timeValue > none[i - 1].timeValue)));
}
process.exit(failures ? 1 : 0);
