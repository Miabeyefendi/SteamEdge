// Realistic Mode planning: when each achievement is unlocked and how long the whole run lasts.
// Pure functions, no Steam and no Electron in here, so the numbers can be tested on their own.
'use strict';

const HOUR = 3600000;
const MIN_SPAN_MS = 15 * 60000;
const MAX_SPAN_MS = 999 * HOUR;          // the most the duration field can hold

// The proportional time (0..1) of the i-th unlock in the session according to the model.
// linear : even intervals
// exp    : frequent at first, then sparse (a real player gets more achievements in the first hours)
// pareto : 80% of the achievements in 20% of the time - a "reset everything from the start" look
function realisticModelRatio(p, model) {
  const q = Math.min(1, Math.max(0, p));
  if (model === 'exp') {
    const k = 2.5;
    return (1 - Math.exp(-k * q)) / (1 - Math.exp(-k));
  }
  if (model === 'pareto') {
    // 0.8 -> 0.2 mapping: q^(ln0.2/ln0.8)
    return Math.pow(q, Math.log(0.2) / Math.log(0.8));
  }
  return q;
}

// ---- OVERDUE ACHIEVEMENT BACKLOG ----
// If a game has been played for hours but no achievement was unlocked there is a BACKLOG: a real
// player would already have got a lot of achievements in those hours. Spreading this backlog evenly over the whole session
// looks wrong - like the first achievement of a 100 hour game coming two hours later. Instead the
// backlog flows first, fast; then the rhythm returns to normal.
//
// Backlog = "the expected number of unlocks up to this hour" minus "the ones really unlocked".
// Since the expected number depends on the playtime the measure is directly TIME based: a few achievements
// in a 1 hour game, far more in a 100 hour one.
const DELAY_UPPER_LIMIT = 0.6;      // at most 60% of the queue counts as backlog

function realisticAccum(details) {
  const b = details || {};
  const sumTotal = +b.totalAchievements || 0;
  const playedHours = Math.max(0, (+b.playtimeMin || 0) / 60);
  const tcHours = Math.max(1, +b.tcHours || 0);
  const difficulty = Math.max(0.1, +b.difficultyValue || 1.2);
  if (!sumTotal || !playedHours) return 0;
  // The number that SHOULD have been unlocked up to this hour, capped by the total.
  const expected = Math.min(sumTotal, sumTotal * (playedHours / (tcHours * difficulty)));
  return Math.max(0, Math.round(expected - (+b.unlockedState || 0)));
}

// ---- RARITY ----
// Steam's percentage is the share of the OWNERS of the game, and many owners never really start it: the most common achievement of a game is held by 33% of the owners
// in one game and by 97% in another. So rarity is measured against the game's own most common achievement (rel = percent / the highest percent of the game), which is
// "the share of the players who started". Measured on 42 games (HowLongToBeat times and Steam percentages): about 8% of a game's achievements are under 0.05 of it
// (the ultra rare ones, the grind of a completionist), and the achievement that ends the story sits at about 0.30.
// The same data fits the time of an unlock best when it follows the RANK in the queue (from common to rare) in a straight line: at the end of the story a player has
// 34% of the achievements after 38% of the time it takes to get all of them. A weight that grows with rarity fitted worse (log error 0.69 against 0.44), so the only
// extra wait left is the "ultra rare wait" setting, in front of the ultra rare ones.
const ULTRA_REL = 0.05;        // under this share of the game's most common achievement: ultra rare
const STORY_REL = 0.30;        // at this share the story of a game is typically over; the backlog squeeze never reaches below it
function relativeRarity(pct, highest) {
  return Number.isFinite(pct) && highest > 0 ? pct / highest : null;
}
function isUltraRare(rel) { return Number.isFinite(rel) && rel < ULTRA_REL; }
function realisticRarityWeight(ultra, ultraMultiplier) {
  return ultra ? Math.max(1, ultraMultiplier || 3) : 1;
}
// rel and ultra come from the game's whole list (main.js prepareRealisticQueue); a list without them is judged against its own highest percent
function rarityOf(queue) {
  const highest = Math.max(0, ...queue.map((x) => (Number.isFinite(x.rarityPct) ? x.rarityPct : 0)));
  return queue.map((x) => {
    const rel = Number.isFinite(x.rel) ? x.rel : relativeRarity(x.rarityPct, highest);
    return { rel, ultra: typeof x.ultra === 'boolean' ? x.ultra : isUltraRare(rel) };
  });
}

// Writes the unlock times into the queue (ms relative to the start of the session).
//   accumulation > 0 : the first that many achievements are squeezed into the start of the session, but only common ones: never an ultra rare one, and never one that is
//                      rarer than the end of a story (STORY_REL), because a player who has played for hours has the story achievements, not the grind
//   setting          : { speedMultiplier, ultraMultiplier, compensationShare, finishedFlag, finishedRatio }
// The ultra rare ones are always at the end of the run: none of them is unlocked before the last of the others.
function placeRealisticTimes(queue, durationMs, model, accumulation, setting) {
  const n = queue.length;
  if (!n) return queue;
  const a = setting || {};
  const speed = Math.max(0.1, Math.min(4, +a.speedMultiplier || 1));
  const ultra = Math.max(1, Math.min(10, +a.ultraMultiplier || 3));
  const compensationShare = Math.max(0.02, Math.min(0.9, +a.compensationShare || 0.2));
  // If the game is already finished (playtime >= completion time) there is no point imitating the learning curve:
  // the schedule is compressed as a whole. The session itself is not shortened, only the unlocks
  // end early - with "Keep collecting hours when unlocks finish" on it keeps collecting hours.
  const finishedRatio = a.finishedFlag ? Math.max(0.05, Math.min(1, +a.finishedRatio || 0.5)) : 1;
  const activeDuration = Math.max(60000, Math.round(durationMs * speed * finishedRatio));

  const kinds = rarityOf(queue);
  let eligible = 0;
  while (eligible < n && !kinds[eligible].ultra && Number.isFinite(kinds[eligible].rel) && kinds[eligible].rel >= STORY_REL) eligible++;
  const fast = Math.min(Math.floor(n * DELAY_UPPER_LIMIT), Math.max(0, +accumulation || 0), eligible);
  const fastDuration = fast ? Math.round(activeDuration * compensationShare) : 0;
  const remainingTime = activeDuration - fastDuration;
  const weights = queue.slice(fast).map((x, i) => realisticRarityWeight(kinds[fast + i].ultra, ultra));
  const totalWeight = weights.reduce((t, x) => t + x, 0) || 1;

  let cumulative = 0;
  queue.forEach((x, i) => {
    if (i < fast) {
      x.timeValue = Math.round(fastDuration * ((i + 1) / fast));
      x.delayCompensation = true;
    } else {
      cumulative += weights[i - fast];
      x.timeValue = fastDuration + Math.round(remainingTime * realisticModelRatio(cumulative / totalWeight, model));
    }
  });
  // A model that bends the curve (Pareto) must not bring an ultra rare one in front of the others
  const lastOrdinary = queue.reduce((m, x, i) => (kinds[i].ultra ? m : Math.max(m, x.timeValue)), 0);
  queue.forEach((x, i) => { if (kinds[i].ultra && x.timeValue < lastOrdinary) x.timeValue = lastOrdinary; });
  return queue;
}

// ---- COMPLETION TIME, TARGET AND DURATION ----
// The completion time of one game: the value that belongs to that game, or the one given for the queue.
function tcFor(appid, pick) {
  const map = (pick && pick.tcByGame) || {};
  const own = +map[appid] || +map[String(appid)] || 0;
  return own > 0 ? own : (Math.max(1, +(pick && pick.tcHours) || 0) || 20);
}

function playedMinutes(appid, pick) {
  const m = (pick && pick.playtime) || {};
  return +m[appid] || +m[String(appid)] || 0;
}

// Timing settings. finishedFlag changes per game: whether the playtime has passed the completion time.
// With the automatic duration the run is as long as the whole way takes, so nothing is compressed on top of it.
function realisticTimeSetting(appid, pick) {
  const playedHours = playedMinutes(appid, pick) / 60;
  return {
    speedMultiplier: pick.speedMultiplier,
    ultraMultiplier: pick.ultraMultiplier,
    compensationShare: pick.compensationShare,
    finishedFlag: playedHours > 0 && playedHours >= tcFor(appid, pick),
    finishedRatio: pick.autoSpanApplied ? 1 : pick.finishedRatio,
  };
}

// A game's backlog: 0 if the option is off.
function computeRealisticAccum(appid, h, pick) {
  if (!pick.accelerateDelayed) return 0;
  return realisticAccum({
    totalAchievements: h.totalAchievements,
    unlockedState: h.unlockedState,
    playtimeMin: playedMinutes(appid, pick),
    tcHours: tcFor(appid, pick),
    difficultyValue: pick.difficultyValue,
  });
}

// How long a real player needs to earn `count` of a game's `total` achievements: the completion time times that share, times the difficulty.
function hoursForCount(count, total, tcHours, difficulty) {
  if (!(total > 0) || !(count > 0)) return 0;
  return (count / total) * tcHours * difficulty;
}

// Decides, for the whole queue at once, how many achievements each game unlocks and how long the run lasts.
//   entries : [{ appid, h }] in queue order, h = the game's full list of unlockable achievements (common to rare), see prepareRealisticQueue
//   pick    : the options (goalAuto, goalValue, goalByGame, autoSpan, tcHours / tcByGame, difficultyValue, playtime)
//   givenSpanMs : the duration the user has set
//   autoSpanAllowed : false for a run the schedule starts, it has to fit what is left of its time range
//
// Automatic duration (autoSpan): the run lasts as long as a real player would need for the achievements it unlocks. A game that takes 60 hours
// to finish therefore gets 60 hours for all of its achievements, not the two hours the field happened to hold. The automatic target is then
// "all that is left"; a target typed by hand gets its own share of the completion time.
// Duration set by hand: the automatic target is the backlog plus what a real player would earn in the time given.
// (Before, the page worked out an automatic target but sent 0, which means all, to the engine: the box said 3 / 50 while all 50
//  were planned, and they all fell into the two hours of the default duration.)
function planGames(entries, pick, givenSpanMs, autoSpanAllowed) {
  const games = entries.map(({ appid, h }) => {
    const total = h.totalAchievements || 0;
    const left = h.suitableTotal || 0;
    const tc = tcFor(appid, pick);
    const difficulty = Math.max(0.1, +pick.difficultyValue || 1);
    const denominator = Math.max(0.1, tc * difficulty);
    const playedHours = playedMinutes(appid, pick) / 60;
    const expected = total ? Math.min(total, total * (playedHours / denominator)) : 0;
    const behind = Math.max(0, Math.round(expected - (h.unlockedState || 0)));
    return { appid, h, total, left, tc, difficulty, denominator, playedHours, expected, behind, goal: 0, queueList: [] };
  });
  const auto = !!(pick.autoSpan && autoSpanAllowed);
  let spanMs = Math.max(60000, +givenSpanMs || HOUR);
  if (auto) {
    let hours = 0;
    games.forEach((g) => {
      const count = pick.goalAuto ? g.left : Math.min(g.left, pick.goalValue > 0 ? pick.goalValue : g.left);
      hours += hoursForCount(count, g.total, g.tc, g.difficulty);
    });
    spanMs = Math.round(Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, hours * HOUR)));
  }
  const totalLeft = games.reduce((t, g) => t + g.left, 0) || 1;
  games.forEach((g) => {
    const share = spanMs * (g.left / totalLeft);          // this game's part of the run
    const fixed = pick.goalByGame && pick.goalByGame[g.appid];
    if (fixed != null) {
      // A run that is being resumed after a restart: exactly what was left of the target of this game, whatever the other options say
      g.goal = Math.min(g.left, Math.max(0, Math.floor(+fixed || 0)));
    } else if (pick.goalAuto) {
      g.goal = auto ? g.left : Math.max(g.left ? 1 : 0, Math.min(g.left, Math.round(g.behind + g.total * (share / HOUR) / g.denominator)));
    } else {
      g.goal = pick.goalValue > 0 ? Math.min(g.left, pick.goalValue) : g.left;
    }
    g.queueList = g.h.queueList.slice(0, g.goal);
  });
  return { spanMs, auto, games };
}

module.exports = {
  realisticModelRatio, realisticAccum, realisticRarityWeight, relativeRarity, isUltraRare, placeRealisticTimes,
  tcFor, realisticTimeSetting, computeRealisticAccum, hoursForCount, planGames,
  DELAY_UPPER_LIMIT, ULTRA_REL, STORY_REL, MIN_SPAN_MS, MAX_SPAN_MS,
};
