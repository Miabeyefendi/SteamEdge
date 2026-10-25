// Realistic Mode, the whole matrix: every setting on its own and the games at the same time against one after the other, on games never played, half played,
// played to their completion time and far past it, with one and with several games. Each run is a real start (main.js realisticStartFor, the real
// prepareRealisticQueue) on a fake schema and a fake clock, run to its end. What is checked is what the user would see: the duration, that every planned achievement
// is unlocked in its own game before the run ends, that nothing already open is unlocked again, that the run ends and says so, that nothing is left running.
// Run with `npm test` (tests/run.js).
const path = require('path');
const { createHarness, HOUR } = require('./realistic-harness');
const planner = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'realisticPlan.js'));
let failures = 0;
const failed = [];
const check = (name, condition, extra) => { if (!condition) { failures++; failed.push(name + (extra ? '  ' + extra : '')); } };
const say = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const BASE = { goalAuto: true, goalValue: 0, autoSpan: true, model: 'linear', randomInterval: false, ultraRareSkip: false, autoOrder: true, continueHours: true,
  accelerateDelayed: true, speedMultiplier: 1, ultraMultiplier: 3, compensationShare: 0.2, finishedRatio: 0.5, tcHours: 20, difficultyValue: 1, parallel: true };

// one start, run to the end; returns what happened
async function runOnce(label, games, options, spanMs, extra) {
  const h = createHarness();
  const tcByGame = {}, playtime = {};
  games.forEach((g) => { h.game(g.appid, g.total, g.unlocked || 0); tcByGame[g.appid] = g.tc; playtime[g.appid] = Math.round((g.played || 0) * 60); });
  const s = h.account('a');
  const optionList = Object.assign({}, BASE, options, { tcByGame, playtime });
  const res = await h.api.realisticStartFor('a', { appid: games[0].appid, gameEntries: games.map((g) => g.appid), spanMs, optionList }, false);
  if (!res.ok) return { label, res, h };
  const d = s.realistic;
  const plannedSpan = d.finishTime - d.startPoint;
  const goal = d.totalGoal;
  const ids = new Set(games.map((g) => g.appid));
  if (extra && extra.during) await extra.during(h, s, d);
  await h.advance(plannedSpan + 10 * HOUR);
  return { label, res, h, s, d, plannedSpan, goal, ids, end: h.lastTick() };
}
function common(r, opt) {
  const o = opt || {};
  const L = r.label + ': ';
  if (!r.res.ok) { check(L + 'started', false, JSON.stringify(r.res)); return; }
  check(L + 'the run ended and the page was told so', r.s.realistic === null && r.end && r.end.runningFlag === false && r.end.isFinished === true, JSON.stringify(r.end).slice(0, 120));
  check(L + 'no timer left running', r.h.timers.length === 0, String(r.h.timers.length));
  check(L + 'nothing that was already open was unlocked again', r.h.unlocks.every((u) => !u.wasOpen), JSON.stringify(r.h.unlocks.filter((u) => u.wasOpen).slice(0, 3)));
  check(L + 'every unlock went to a game of the queue', r.h.unlocks.every((u) => r.ids.has(u.appid)));
  // the last ones planned at the end itself go out a few seconds apart
  check(L + 'every unlock came by the end of the run (the last ones a few seconds apart)', r.h.unlocks.every((u) => u.at <= r.d.finishTime + 3000 * r.ids.size + 5000), String(r.h.unlocks.filter((u) => u.at > r.d.finishTime + 3000 * r.ids.size + 5000).length) + ' late');
  if (!o.partial) check(L + 'every planned achievement was unlocked (' + r.goal + ')', r.h.unlocks.length === r.goal && r.end.openedGames === r.goal, r.h.unlocks.length + ' unlocked, reason ' + (r.end && r.end.cause));
  check(L + 'the tick numbers match the engine', r.end.openedGames === r.h.unlocks.length && r.end.totalSum === r.goal);
  // per game, in the order of the game's list: from common to rare
  r.ids.forEach((id) => {
    const order = r.h.unlocks.filter((u) => u.appid === id).map((u) => +u.apiName.slice(1));
    check(L + 'game ' + id + ' unlocks from common to rare', order.every((v, i) => i === 0 || v > order[i - 1]), order.slice(0, 12).join(','));
  });
}

(async () => {
  // ---- the four player situations, one game ----
  const situations = [
    ['never played', 0], ['half played', 10], ['played to the completion time', 20], ['far past it', 80],
  ];
  for (const [name, played] of situations) {
    const r = await runOnce('one game, ' + name, [{ appid: 10, total: 40, tc: 20, played }], {}, 2 * HOUR);
    common(r);
    if (r.res.ok) {
      const hrs = r.plannedSpan / HOUR;
      if (played >= 20) check(r.label + ': a few hours of catch-up, not the completion time again', hrs <= 3.01, hrs.toFixed(2) + ' h');
      if (played === 0) check(r.label + ': the whole completion time', Math.abs(hrs - 20) < 0.02, hrs.toFixed(2) + ' h');
      if (played === 10) check(r.label + ': half in full plus a short catch-up', hrs > 10 && hrs < 12, hrs.toFixed(2) + ' h');
    }
  }

  // ---- every setting on its own, on a half played game and on a finished one, with one and three games, together and one after the other ----
  const variations = [
    ['default', {}],
    ['model exponential', { model: 'exp' }], ['model pareto', { model: 'pareto' }],
    ['random gaps', { randomInterval: true }],
    ['skip ultra rare', { ultraRareSkip: true }],
    ['queue start off', { autoOrder: false }],
    ['keep hours off', { continueHours: false }],
    ['catch-up off', { accelerateDelayed: false }],
    ['speed 0.5', { speedMultiplier: 0.5 }], ['speed 2', { speedMultiplier: 2 }], ['speed 4', { speedMultiplier: 4 }],
    ['ultra wait 1', { ultraMultiplier: 1 }], ['ultra wait 10', { ultraMultiplier: 10 }],
    ['catch-up share 2%', { compensationShare: 0.02 }], ['catch-up share 90%', { compensationShare: 0.9 }],
    ['finished ratio 5%', { finishedRatio: 0.05 }], ['finished ratio 100%', { finishedRatio: 1 }],
    ['target 5 by hand', { goalAuto: false, goalValue: 5 }], ['target 100 by hand', { goalAuto: false, goalValue: 100 }],
    ['easy', { difficultyValue: 0.68 }], ['very hard', { difficultyValue: 1.9 }],
    ['duration by hand 3 h', { autoSpan: false }],
    ['duration by hand, finished game compression', { autoSpan: false, finishedRatio: 0.3 }],
  ];
  const sets = [
    ['1 game half played', [{ appid: 10, total: 30, tc: 10, played: 5 }]],
    ['1 game finished', [{ appid: 10, total: 30, tc: 2, played: 2.5 }]],
    ['3 games mixed', [{ appid: 10, total: 30, tc: 10, played: 5 }, { appid: 20, total: 12, tc: 2, played: 2.5 }, { appid: 30, total: 20, tc: 6, played: 0, unlocked: 4 }]],
  ];
  let runs = 0;
  for (const [setName, games] of sets) {
    for (const parallel of [true, false]) {
      for (const [vName, v] of variations) {
        const label = setName + (games.length > 1 ? (parallel ? ', together' : ', one after the other') : '') + ', ' + vName;
        if (games.length === 1 && !parallel) continue;
        const r = await runOnce(label, games, Object.assign({ parallel }, v), 3 * HOUR);
        runs++;
        // a queue that does not start the next game by itself only does the first game; with the games together there is no "next game"
        const partial = (!parallel && v.autoOrder === false && games.length > 1);
        common(r, { partial });
        if (!r.res.ok) continue;
        if (partial) check(label + ': only the first game was played', r.h.unlocks.every((u) => u.appid === games[0].appid) && r.h.unlocks.length === r.d.preparing[games[0].appid].queueList.length);
        // together: every game is open from the start, the run is as long as its longest game
        if (parallel && games.length > 1) {
          check(label + ': all games were opened together at the start', r.h.plays.length >= 1 && r.h.plays[0].ids.length === games.length, JSON.stringify(r.h.plays[0]));
        }
        if (!parallel && games.length > 1 && !partial) {
          check(label + ': the games were opened one by one', r.h.plays.every((p) => p.ids.length === 1) && r.h.plays.length === games.length, JSON.stringify(r.h.plays.map((p) => p.ids.join())));
        }
        if (v.goalAuto === false && v.goalValue === 5) check(label + ': the target typed by hand is per game (5 each)', r.goal === 5 * games.length || r.goal === r.h.unlocks.length && r.goal <= 5 * games.length, String(r.goal));
        if (v.ultraRareSkip) check(label + ': no ultra rare one (the last tenth) was unlocked', r.h.unlocks.every((u) => { const total = r.h.schemas.get(u.appid).length; return +u.apiName.slice(1) < Math.ceil(total * 0.9); }));
      }
    }
  }
  say('matrix: ' + runs + ' runs over ' + variations.length + ' settings, ' + failed.length + ' problems', failed.length === 0);
  failed.slice(0, 40).forEach((f) => console.log('   FAIL ' + f));

  // ---- the user's case: many short games already played past their completion time ----
  const zups = Array.from({ length: 8 }, (_, i) => ({ appid: 100 + i, total: 30, tc: 2, played: 2.5 }));
  let r = await runOnce('8 short games played past 2 hours, together', zups, { parallel: true }, 2 * HOUR);
  const eightOne = r.res.ok ? r.plannedSpan : 0;
  say('8 finished short games together: two groups of at most five, a few hours, not the sum of eight', r.res.ok && r.plannedSpan <= 2 * 3 * HOUR + 1000, r.res.ok ? (r.plannedSpan / HOUR).toFixed(2) + ' h' : JSON.stringify(r.res));
  r = await runOnce('8 short games played past 2 hours, one after the other', zups, { parallel: false }, 2 * HOUR);
  say('the same one after the other adds up (each game a short catch-up), longer than the two groups', r.res.ok && r.plannedSpan > eightOne, r.res.ok ? (r.plannedSpan / HOUR).toFixed(2) + ' h' : '');
  // the estimate the page sends when no completion time was typed: playtime x 2 (medium game). It never counts as finished, so the duration is long; per game it is
  // still the same as one game's
  const unknown = Array.from({ length: 20 }, (_, i) => ({ appid: 200 + i, total: 30, tc: 5, played: 2.5 }));
  r = await runOnce('20 games without a typed completion time, together', unknown, { parallel: true }, 2 * HOUR);
  const one = planner.planGames([{ appid: 1, h: { queueList: [], suitableTotal: 30, totalAchievements: 30, unlockedState: 0 } }], Object.assign({}, BASE, { tcByGame: { 1: 5 }, playtime: { 1: 150 } }), 2 * HOUR, true);
  say('20 games together: four groups of five, each as long as one game (' + (one.spanMs / HOUR).toFixed(2) + ' h), not 20 times it', r.res.ok && Math.abs(r.plannedSpan - 4 * one.spanMs) < 60000, r.res.ok ? (r.plannedSpan / HOUR).toFixed(2) + ' h' : JSON.stringify(r.res));
  say('20 games together: never more than five games are played at once', r.res.ok && r.h.plays.every((p) => p.ids.length <= 5) && r.h.plays.length === 4, JSON.stringify(r.h.plays.map((p) => p.ids.length)));
  // 33 games together: seven groups (5 x 6 + 3), the queue is not refused any more
  const many = Array.from({ length: 33 }, (_, i) => ({ appid: 300 + i, total: 5, tc: 2, played: 0 }));
  r = await runOnce('33 games together', many, { parallel: true }, 2 * HOUR);
  say('33 games together run in seven groups, at most five at once, and every game gets its turn', r.res.ok && r.h.plays.length === 7 && r.h.plays.every((p) => p.ids.length <= 5) && new Set(r.h.plays.flatMap((p) => p.ids)).size === 33, JSON.stringify(r.res.ok ? r.h.plays.map((p) => p.ids.length) : r.res));

  // ---- groups: the games of a group are open in its time, and each unlock comes while its own game is open ----
  const h3 = createHarness();
  const seven = [21, 22, 23, 24, 25, 26, 27];
  seven.forEach((id) => h3.game(id, 12, 0));
  h3.account('a');
  const st = await h3.api.realisticStartFor('a', { appid: 21, gameEntries: seven, spanMs: 4 * HOUR, optionList: Object.assign({}, BASE, { autoSpan: false, goalAuto: false, goalValue: 0, parallel: true, tcByGame: {}, playtime: {} }) }, false);
  const d3 = h3.accounts.get('a').realistic;
  say('groups: the first five games are opened at the start, and the page is told which', st.ok && h3.plays.length === 1 && h3.plays[0].ids.join() === '21,22,23,24,25' && String(h3.lastTick().playingIds) === '21,22,23,24,25', JSON.stringify(h3.plays) + ' ' + JSON.stringify(h3.lastTick().playingIds));
  const open = [];
  const unlocksSeen = h3.unlocks.length;
  for (let k = 0; k < 5 * 60; k++) { await h3.advance(60000); open.push([h3.now, (h3.plays[h3.plays.length - 1] || { ids: [] }).ids.slice()]); }
  const openAt = (t) => { let last = []; open.forEach(([at, ids]) => { if (at <= t) last = ids; }); return last; };
  say('groups: the last two games take the place of the first five when their time comes', h3.plays.length === 2 && h3.plays[1].ids.join() === '26,27', JSON.stringify(h3.plays.map((p) => p.ids.join())));
  say('groups: every unlock went to a game that was open at that moment', h3.unlocks.slice(unlocksSeen).every((u) => openAt(u.at).includes(u.appid)), JSON.stringify(h3.unlocks.filter((u) => !openAt(u.at).includes(u.appid)).slice(0, 3)));
  say('groups: all 84 achievements of the seven games were unlocked and the run ended without a timer left', h3.unlocks.length === 84 && !h3.accounts.get('a').realistic && h3.timers.length === 0, h3.unlocks.length + ' unlocked, timers ' + h3.timers.length + ', running ' + !!h3.accounts.get('a').realistic);
  void d3;

  // ---- a second run after the first ended: only what is still locked, and the numbers say so ----
  const h2 = createHarness();
  h2.game(10, 20, 0);
  const s2 = h2.account('a');
  await h2.api.realisticStartFor('a', { appid: 10, gameEntries: [10], spanMs: 2 * HOUR, optionList: Object.assign({}, BASE, { autoSpan: false, goalAuto: false, goalValue: 8, tcByGame: { 10: 10 }, playtime: {} }) }, false);
  await h2.advance(3 * HOUR);
  const firstCount = h2.unlocks.length;
  await h2.api.realisticStartFor('a', { appid: 10, gameEntries: [10], spanMs: 2 * HOUR, optionList: Object.assign({}, BASE, { autoSpan: true, goalAuto: true, tcByGame: { 10: 10 }, playtime: {} }) }, false);
  const second = s2.realistic;
  say('second run: it plans only the 12 that are still locked (not all 20 again)', firstCount === 8 && second && second.totalGoal === 12, firstCount + ' then ' + (second && second.totalGoal));
  await h2.advance(12 * HOUR);
  say('second run: nothing that the first run opened is sent again', h2.unlocks.slice(firstCount).every((u) => !u.wasOpen) && h2.unlocks.length === 20, String(h2.unlocks.length));

  // ---- a slower pace: the run is longer, and a resumed or scheduled run is not stretched a second time ----
  {
    const hs = createHarness(); hs.game(10, 20, 0); const ss = hs.account('a');
    await hs.api.realisticStartFor('a', { appid: 10, gameEntries: [10], spanMs: 2 * HOUR, optionList: Object.assign({}, BASE, { autoSpan: false, goalAuto: false, goalValue: 10, speedMultiplier: 2, tcByGame: { 10: 10 }, playtime: {} }) }, false);
    say('speed 2 by hand: the 2 hour run lasts 4 hours (the same unlocks at half the pace)', ss.realistic && Math.abs((ss.realistic.finishTime - ss.realistic.startPoint) - 4 * HOUR) < 1000, ss.realistic ? String((ss.realistic.finishTime - ss.realistic.startPoint) / HOUR) : 'no run');
    const hr = createHarness(); hr.game(10, 20, 0); const sr = hr.account('a');
    await hr.api.realisticStartFor('a', { gameEntries: [10], spanMs: 1 * HOUR, optionList: Object.assign({}, BASE, { autoSpan: false, goalAuto: false, goalValue: 0, goalByGame: { 10: 6 }, speedMultiplier: 2, tcByGame: { 10: 10 }, playtime: {} }) }, true);
    say('speed 2, resumed or started by the schedule: the hour that is left stays one hour and all 6 fit in it', sr.realistic && Math.abs((sr.realistic.finishTime - sr.realistic.startPoint) - HOUR) < 1000 && Math.max(...sr.realistic.activeIds.queueList.map((x) => x.timeValue)) <= HOUR, sr.realistic ? String((sr.realistic.finishTime - sr.realistic.startPoint) / HOUR) : 'no run');
  }

  // ---- the games together, closed in the middle and resumed: each game gets what is left of ITS list ----
  {
    const resumeJobs = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'resumeJobs.js'));
    const hp = createHarness(); [10, 20, 30].forEach((id, i) => hp.game(id, 10 + i * 5, 0)); const sp = hp.account('a');
    const opts = Object.assign({}, BASE, { parallel: true, autoSpan: false, goalAuto: false, goalValue: 0, tcByGame: { 10: 5, 20: 5, 30: 5 }, playtime: {} });
    await hp.api.realisticStartFor('a', { appid: 10, gameEntries: [10, 20, 30], spanMs: 6 * HOUR, optionList: opts }, false);
    await hp.advance(3 * HOUR);
    const done = new Map(); hp.unlocks.forEach((u) => done.set(u.appid, (done.get(u.appid) || 0) + 1));
    const saved = JSON.parse(JSON.stringify(resumeJobs.describeJobs(sp, hp.now)));
    const lefts = saved && saved.realistic ? Object.fromEntries(saved.realistic.games.map((g) => [g.appid, g.left])) : {};
    say('resume of games together: what is left is counted per game (10, 15, 20 minus what each one already unlocked)', saved && saved.realistic && [10, 20, 30].every((id, i) => lefts[id] === (10 + i * 5) - (done.get(id) || 0)), JSON.stringify(lefts) + ' done ' + JSON.stringify([...done]));
    const plan = resumeJobs.buildPlan(Object.assign({ savedAt: hp.now }, saved), hp.now);
    hp.api.realisticFinish('a', 'user stopped');
    await hp.api.realisticStartFor('a', plan.realistic.request, true);
    const dr = sp.realistic;
    say('resume of games together: the resumed run plans exactly what was left, all three games together', dr && dr.totalGoal === Object.values(lefts).reduce((t, x) => t + x, 0) && dr.activeIds.parallel === true && hp.plays[hp.plays.length - 1].ids.length === 3, dr ? dr.totalGoal + ' planned' : 'no run');
    await hp.advance(6 * HOUR);
    say('resume of games together: in the end every achievement of the three games is open, none twice', hp.unlocks.length === 45 && hp.unlocks.every((u) => !u.wasOpen), String(hp.unlocks.length));
  }

  // ---- the merged timeline on its own ----
  const g1 = { appid: 1, gameTitle: 'One', queueList: Array.from({ length: 10 }, (_, i) => ({ name: 'a' + i, rarityPct: 80 - i, pos: i / 10 })), accumulation: 0, timing: {} };
  const g2 = { appid: 2, gameTitle: 'Two', queueList: Array.from({ length: 4 }, (_, i) => ({ name: 'b' + i, rarityPct: 80 - i * 10, pos: i / 4 })), accumulation: 0, timing: {} };
  const merged = planner.mergeParallel([g1, g2], 4 * HOUR, 'linear');
  say('merged: every item keeps its game and the list is in time order', merged.length === 14 && merged.every((x, i) => (x.appid === 1 || x.appid === 2) && (i === 0 || x.timeValue >= merged[i - 1].timeValue)));
  say('merged: both games use the whole run (each ends at about 4 hours)', [1, 2].every((id) => Math.abs(Math.max(...merged.filter((x) => x.appid === id).map((x) => x.timeValue)) - 4 * HOUR) < 60000));
  say('merged: inside a game the order is kept', [1, 2].every((id) => { const o = merged.filter((x) => x.appid === id).map((x) => x.order); return o.every((v, i) => i === 0 || v > o[i - 1]); }));

  process.exit(failures ? 1 : 0);
})();
