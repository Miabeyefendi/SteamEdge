// Moved out of main.js unchanged (hours). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { FarmController, accountBroadcast, accountEvent, accountName, accounts, delayFarm, earning, ledger, log, resumeFarm, settingFor, statsHour } = ctx;

  // ================== HOUR BOOSTING (per account) ==================
  // The state is in the account's slot (s.boost). Timers remember the account, NOT the engine; whichever
  // account is open on screen, when the time is up the right account's games close.
  function boostStatus(s) {
    if (!s.boost) {
      s.boost = { runningFlag: false, timer: null, stagger: [], sync: null, syncTimer: null, syncHeartbeat: null,
                  request: null, startPoint: 0, spanMs: 0, appids: [] };
    }
    return s.boost;
  }
  // While the games wait for the other device nothing is earned, so nothing may be counted either: the statistics, the hour sync ledger, the
  // boost timer and the card farm clocks stop and go on from the same point (the same way a connection drop is handled).
  function holdCounters(steamID, blocked) {
    const s = accounts.get(steamID);
    if (!s) return;
    try { statsHour(steamID); } catch (_) {}
    syncConnectionChanged(steamID, earning(s));
    const b = s.boost;
    if (b) {
      if (blocked && b.timer) { clearTimeout(b.timer); b.timer = null; b.heldLeft = Math.max(1000, (b.timerEnd || Date.now()) - Date.now()); b.heldAt = Date.now(); }
      else if (!blocked && b.heldLeft != null) {
        b.startPoint = (b.startPoint || Date.now()) + (Date.now() - b.heldAt);
        setBoostTimer(steamID, b.heldLeft);
        b.heldLeft = null; b.heldAt = 0;
      }
    }
    [s.farm, s.hoursFarm].forEach((f) => { if (f) { if (blocked) f.hold(); else f.release(); } });
  }
  function setBoostTimer(steamID, ms) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    if (!b) return;
    b.timerEnd = Date.now() + ms;
    b.timer = setTimeout(() => boostTimeUp(steamID), ms);
  }

  function boostClear(s) {
    const b = s && s.boost;
    if (!b) return;
    if (b.timer) { clearTimeout(b.timer); b.timer = null; }
    b.heldLeft = null; b.heldAt = 0;
    b.stagger.forEach((t) => clearTimeout(t));
    b.stagger = [];
    if (b.syncTimer) { clearTimeout(b.syncTimer); b.syncTimer = null; }
    if (b.syncHeartbeat) { clearInterval(b.syncHeartbeat); b.syncHeartbeat = null; }
    b.sync = null;
  }

  // ================== HOUR SYNC ==================
  // Purpose: to bring the TOTAL playtimes of the selected games to the same point.
  // Since Steam credits time to every game that is open at once, running the group that is furthest
  // behind together moves them up equally. That is why it proceeds in steps:
  //   e.g. if 8h / 11h / 101h are selected → first only the 8h game is raised to 11h,
  //   then the two together are raised to 101h, then all three continue together.
  // Target: 'highest' (the highest of the selected) · 'manual' (hours typed by hand) ·
  //        'library' (the highest time in the library).
  // G13: HEARTBEAT. Sync takes hours and the interface used to be told only when a game reached the
  // target: on a 47 hour job the percentages on screen stayed frozen at the starting value for 47 hours.
  // Now the current state is sent at regular intervals.
  const SYNC_HEARTBEAT_MS = 30000;
  function setupSyncHeartbeat(steamID) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    if (!b) return;
    if (b.syncHeartbeat) clearInterval(b.syncHeartbeat);
    b.syncHeartbeat = setInterval(() => {
      const x = accounts.get(steamID);
      if (x && x.boost && x.boost.sync) syncEmit(steamID, true);
      else if (b.syncHeartbeat) { clearInterval(b.syncHeartbeat); b.syncHeartbeat = null; }
    }, SYNC_HEARTBEAT_MS);
  }

  // ---- PARALLEL SYNC (default) ----
  // The stepped method keeps the games level along the way but is needlessly slow for going to a fixed target
  // (e.g. 400 hours): with 12 games of different times it makes 12 steps, and in the first step
  // a single game runs. Since Steam credits time to EVERY game that is open AT THE SAME TIME the right approach is
  // to run all of them together and drop the one that reaches the target from the list. The total time falls to the time the
  // game furthest behind needs to reach the target.
  //
  // If the simultaneous limit is exceeded the games with the most time left get priority (LPT); so the
  // bottleneck games start early and the total time comes as close to the minimum as it can.
  function simulateSync(games, targetMin, limit) {
    const remaining = new Map();
    (games || []).forEach((g) => {
      const lacking = targetMin - (g.playtimeMin || 0);
      if (lacking > 0) remaining.set(g.appid, lacking * 60000);
    });
    const stages = [];
    let totalMillis = 0;
    const container = Math.max(1, Math.min(32, limit || 32));
    let security = 0;
    while (remaining.size && security++ < 500) {
      const sequential = [...remaining.entries()].sort((a, b) => b[1] - a[1]);
      const active = sequential.slice(0, container);
      const dt = Math.min(...active.map((x) => x[1]));
      stages.push({ ids: active.map((x) => x[0]), spanMs: dt, activeTotal: active.length });
      active.forEach(([id, ms]) => {
        const newItem = ms - dt;
        if (newItem <= 0) remaining.delete(id); else remaining.set(id, newItem);
      });
      totalMillis += dt;
    }
    return { totalMillis: totalMillis, stages: stages };
  }

  // WHEN THE CONNECTION DROPS. Sync used to be silently abandoned the moment the connection dropped; even if the engine
  // reconnected and reopened the games the sync was gone. Now the downtime
  // is not credited to the ledger (Steam does not count it either), in the stepped strategy the step time is extended by that much.
  function syncConnectionChanged(steamID, connected) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    const st = b && b.sync;
    if (!st) return;
    const currentTime = Date.now();
    if (!connected) {
      if (!st.isDropped) {
        ledger.applyLedger(st, currentTime);
        st.isDropped = true;
        st.dropMoment = currentTime;
      }
      return;
    }
    if (!st.isDropped) return;
    st.isDropped = false;
    const lost = Math.max(0, currentTime - (st.dropMoment || currentTime));
    st.lastAccount = currentTime;
    if (st.strategyName === 'staged' && st.stepEnd && b.syncTimer) {
      st.stepEnd += lost;
      st.startedAt += lost;
      clearTimeout(b.syncTimer);
      b.syncTimer = setTimeout(() => advanceTier(steamID), Math.max(1000, st.stepEnd - currentTime));
    }
  }

  // Plans one step of a running parallel sync: subtracts the elapsed time from the active games,
  // removes the ones that reached the target from the list, builds a new active set from the rest.
  function scheduleSync(steamID) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    const st = b && b.sync;
    if (!st || st.strategyName !== 'parallel') return;
    if (!s.engine) { boostFinish(steamID, 'connection'); return; }
    // If there is no connection wait; the engine reopens the games itself once it reconnects.
    if (!s.ready) { b.syncTimer = setTimeout(() => scheduleSync(steamID), 30000); return; }
    const newlyFinished = ledger.applyLedger(st, Date.now());
    newlyFinished.forEach((o) => log('info', '[' + accountName(steamID) + '] hour sync: ' + o.name + ' reached the target'));

    const remainders = [...st.gameEntries.values()].filter((o) => !o.isFinished);
    if (!remainders.length) {
      log('info', '[' + accountName(steamID) + '] hour sync done: all games reached the target');
      syncEmit(steamID, false, { done: true });
      accountEvent(steamID, {
        typeName: 'syncFinished',
        feedEntry: { kind: 'hours', title: 'Saat Eşitleme', text: 'Tüm oyunlar hedefe ulaştı.', status: 'Başarılı' },
      });
      boostFinish(steamID, 'sync');
      return;
    }
    st.activeIds = ledger.nextActiveSet(st);
    s.engine.play(st.activeIds, 'hours');

    const shortest = Math.min(...st.activeIds.map((id) => st.gameEntries.get(id).remainingMs));
    syncEmit(steamID, true);
    accountBroadcast(steamID)('boost:tick', {
      running: true, appids: st.activeIds, activeAppids: s.engine.playingApps('hours'),
      startedAt: st.startPoint, durationMs: 0, sync: true,
    });
    b.syncTimer = setTimeout(() => scheduleSync(steamID), Math.max(1000, shortest));
  }

  // Steam's limit of games open at once; the parallel hour sync always uses all of it
  const SYNC_MAX_GAMES = 32;
  function buildSyncSteps(games, targetMin) {
    // games: [{appid, playtimeMin}] - those that are already past the target count as "ready" from the start
    const sorted = games.slice().sort((a, b) => (a.playtimeMin || 0) - (b.playtimeMin || 0));
    const levels = [...new Set(sorted.map((g) => g.playtimeMin || 0))].filter((v) => v < targetMin).sort((a, b) => a - b);
    const steps = [];
    for (let i = 0; i < levels.length; i++) {
      const from = levels[i];
      const to = Math.min(levels[i + 1] != null ? levels[i + 1] : targetMin, targetMin);
      if (to <= from) continue;
      const ids = sorted.filter((g) => (g.playtimeMin || 0) <= from).map((g) => g.appid);
      if (ids.length) steps.push({ ids, fromMin: from, toMin: to });
    }
    return steps;
  }
  function syncEmit(steamID, running, extra) {
    const s = accounts.get(steamID);
    const st = s && s.boost && s.boost.sync;
    const broadcast = accountBroadcast(steamID);
    if (st && st.strategyName === 'parallel') {
      const gameList = ledger.uiList(st, Date.now());
      const remainders = gameList.filter((o) => !o.isFinished);
      broadcast('boost:sync', Object.assign({
        running,
        strategyName: 'parallel',
        targetMin: st.targetMin,
        totalSum: gameList.length,
        finishedOne: gameList.length - remainders.length,
        activeTotal: (st.activeIds || []).length,
        ids: (st.activeIds || []).slice(),
        gameEntries: gameList,
        // The end of the game furthest behind = the end of the whole job (if the limit is enough)
        remainingMs: remainders.length ? Math.max(...remainders.map((o) => o.remainingMs)) : 0,
        startedAt: st.startPoint,
        jobTotalMs: st.jobTotalMs || 0,
      }, extra || {}));
      return;
    }
    // G13: the game list is sent in the stepped strategy too. Since it was not sent before the
    // interface wrote the SAME percentage on every game (how much of the session had passed); a game one
    // hour from the target and a game 47 hours from it showed the same bar.
    const step = st && st.steps[st.i];
    broadcast('boost:sync', Object.assign({
      running,
      strategyName: 'staged',
      step: st ? st.i + 1 : 0,
      steps: st ? st.steps.length : 0,
      targetMin: st ? st.targetMin : 0,
      ids: step ? step.ids : [],
      fromMin: step ? step.fromMin : 0,
      toMin: step ? step.toMin : 0,
      startedAt: st ? st.startedAt : 0,
      stepMs: st ? st.stepMs : 0,
      gameEntries: st ? ledger.uiList(st, Date.now()) : [],
      jobTotalMs: st ? (st.jobTotalMs || 0) : 0,
    }, extra || {}));
  }
  function advanceTier(steamID) {
    const s = accounts.get(steamID);
    const st = s && s.boost && s.boost.sync;
    if (!st) return;
    st.i++;
    runSyncStep(steamID);
  }
  function runSyncStep(steamID) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    const st = b && b.sync;
    if (!st || !s.engine) return;
    if (!s.ready) { b.syncTimer = setTimeout(() => runSyncStep(steamID), 30000); return; }
    // Credit the time that passed in the previous step to the ledger - otherwise the interface counts from zero at every step.
    ledger.applyLedger(st, Date.now()).forEach((o) => log('info', '[' + accountName(steamID) + '] hour sync: ' + o.name + ' reached the target'));
    const step = st.steps[st.i];
    if (!step) {
      // All steps are done → all are equal, now they continue together
      const allIds = st.everything;
      const nextDuration = st.nextDurationMs || 0;
      log('info', '[' + accountName(steamID) + '] hour sync done, all games are running together');
      syncEmit(steamID, false, { done: true });
      accountEvent(steamID, {
        typeName: 'syncFinished',
        feedEntry: { kind: 'hours', title: 'Saat Eşitleme', text: 'Tüm oyunlar hedefe ulaştı.', status: 'Başarılı' },
      });
      b.sync = null;
      if (b.syncHeartbeat) { clearInterval(b.syncHeartbeat); b.syncHeartbeat = null; }
      s.engine.play(allIds, 'hours');
      b.appids = allIds; b.startPoint = Date.now(); b.spanMs = nextDuration;
      accountBroadcast(steamID)('boost:tick', { running: true, appids: allIds, activeAppids: s.engine.playingApps('hours'), startedAt: b.startPoint, durationMs: b.spanMs });
      if (nextDuration) setBoostTimer(steamID, nextDuration);
      return;
    }
    st.stepMs = (step.toMin - step.fromMin) * 60000;
    st.startedAt = Date.now();
    st.stepEnd = st.startedAt + st.stepMs;
    st.activeIds = step.ids.slice();      // the ledger credits time to this set
    st.lastAccount = Date.now();
    s.engine.play(step.ids, 'hours');
    log('info', `[${accountName(steamID)}] hour sync step ${st.i + 1}/${st.steps.length}: ${step.ids.length} games ${step.fromMin}min -> ${step.toMin}min`);
    syncEmit(steamID, true);
    accountBroadcast(steamID)('boost:tick', { running: true, appids: step.ids, activeAppids: s.engine.playingApps('hours'), startedAt: st.startedAt, durationMs: st.stepMs, sync: true });
    b.syncTimer = setTimeout(() => advanceTier(steamID), st.stepMs);
  }

  // Starts simultaneous hour boosting. request: { appids, durationMs, games, proceeding }
  // proceeding: { startPoint } - when a setting changes the job is resumed with the same start and total duration.
  function boostStart(steamID, request) {
    const s = accounts.get(steamID);
    if (!s || !s.engine || !s.ready) return { ok: false, error: 'Bağlı değil.' };
    const b = boostStatus(s);
    boostClear(s);
    // Sequential and simultaneous boosting do not run at the same time; both write the same game list.
    if (s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('boost');
    if (settingFor(steamID, 'pauseFarmOnBoost')) delayFarm(steamID, 'hour boosting');
    const appids = (request.appids || []).slice();
    const games = Array.isArray(request.games) ? request.games : null;
    const durationMs = +request.durationMs || 0;
    // allItems: all the games selected on the page. If the "at most at once" setting changes while the job runs
    // the list is cut again from here; if only the first slice were kept the limit could not be raised.
    const allOfIt = Array.isArray(request.allItems) && request.allItems.length ? request.allItems : null;
    b.request = { appids, durationMs, games, allItems: allOfIt };
    b.runningFlag = true;

    // If sync is on, work toward the target. There are two strategies:
    //   parallel (default) - all together, drop the one that reaches the target from the list. The fastest.
    //   staged             - step by step, keeps the games level along the way. Slow but gradual.
    // "Highest of the selected" with a single game has nothing to equalise: it runs like a normal boost with the chosen duration
    const syncMode = settingFor(steamID, 'boostSyncMode') || 'highest';
    if (settingFor(steamID, 'boostSync') && games && games.length && (games.length > 1 || syncMode !== 'highest')) {
      const mode = syncMode;
      let targetMin;
      if (mode === 'manual') targetMin = Math.max(0, Math.round((+settingFor(steamID, 'boostSyncTargetHours') || 0) * 60));
      else if (mode === 'library') targetMin = Math.max(0, +settingFor(steamID, 'boostSyncLibraryMaxMin') || 0);
      else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

      const behind = games.filter((g) => (g.playtimeMin || 0) < targetMin);
      if (!behind.length) {
        log('info', '[' + accountName(steamID) + '] hour sync: all games are already at the target, starting them together directly');
      } else if ((settingFor(steamID, 'boostSyncStrategy') || 'parallel') === 'staged') {
        const steps = buildSyncSteps(games, targetMin);
        if (steps.length) {
          b.sync = {
            strategyName: 'staged', steps, i: 0, startedAt: 0, stepMs: 0, targetMin,
            everything: games.map((g) => g.appid), nextDurationMs: durationMs,
            // The stepped strategy keeps the same ledger too: the interface reads the per-game progress
            // from here, otherwise it wrote the session percentage on every game.
            gameEntries: ledger.setupLedger(behind, targetMin),
            activeIds: [], startPoint: Date.now(), lastAccount: Date.now(),
            // The job's TOTAL time, once at the start. The bars in the interface sit on this shared
            // timeline: a game's bar shows where in the job that game finishes. It is kept
            // constant, otherwise the bars could go backwards.
            jobTotalMs: steps.reduce((t, st) => t + (st.toMin - st.fromMin) * 60000, 0),
          };
          log('info', '[' + accountName(steamID) + '] hour sync (staged): ' + steps.length + ' steps, target ' + targetMin + ' min');
          setupSyncHeartbeat(steamID);
          runSyncStep(steamID);
          return { ok: true };
        }
      } else {
        // Sync computes its own duration. The "Max games at once" choice does not apply either: the page locks it while
        // sync runs, and a leftover small value used to open the games in groups of that size
        const limit = SYNC_MAX_GAMES;
        b.sync = {
          strategyName: 'parallel', targetMin, limit, gameEntries: ledger.setupLedger(behind, targetMin),
          activeIds: [], startPoint: Date.now(), lastAccount: Date.now(),
        };
        // The job's TOTAL time, once at the start and it never changes again. The bars in the interface
        // sit on this shared timeline: in a 34 hour job the bar of a game that will finish after 3 hours
        // is full from the start, the bar of the game that will run to the end is empty.
        b.sync.jobTotalMs = ledger.remainingTotalMs(b.sync);
        log('info', '[' + accountName(steamID) + '] hour sync (parallel): ' + b.sync.gameEntries.size + ' games, target ' + targetMin
          + ' min, limit ' + limit + ', job total ' + Math.round(b.sync.jobTotalMs / 60000) + ' min');
        setupSyncHeartbeat(steamID);
        scheduleSync(steamID);
        return { ok: true };
      }
    }

    // The "Stop automatically when time is up" setting was removed: if a duration is chosen it stops when the time is up,
    // if "Unlimited" is chosen it runs until stopped. Two separate switches said the same thing.
    const proceed = request.proceeding || null;
    const start = proceed && proceed.startPoint ? proceed.startPoint : Date.now();
    const remainingMs = durationMs ? Math.max(1000, durationMs - (Date.now() - start)) : 0;
    const stagger = Math.max(0, +settingFor(steamID, 'boostStagger') || 0) * 1000;
    b.appids = appids; b.startPoint = start; b.spanMs = durationMs;

    const emit = () => accountBroadcast(steamID)('boost:tick', { running: true, appids, activeAppids: s.engine.playingApps('hours'), startedAt: start, durationMs });
    if (!stagger || appids.length <= 1 || proceed) {
      s.engine.play(appids, 'hours');
      emit();
    } else {
      // "Game start interval": added one after another at this interval, not all at once
      log('info', `[${accountName(steamID)}] boost: starting ${appids.length} games ${stagger}ms apart`);
      appids.forEach((id, i) => {
        b.stagger.push(setTimeout(() => {
          if (!b.runningFlag) return;
          s.engine.play(appids.slice(0, i + 1), 'hours');
          emit();
        }, i * stagger));
      });
    }
    if (remainingMs) setBoostTimer(steamID, remainingMs);
    return { ok: true };
  }

  // Time is up. If "Oturumu otomatik yenile" is on it restarts with the same selection; this used to
  // be in the interface and only worked for the account on screen and while the window was open. When the account changed
  // the interface could restart it on the wrong account.
  function boostTimeUp(steamID) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    if (!b || !b.runningFlag) return;
    const request = b.request;
    boostFinish(steamID, 'duration', true);
    if (settingFor(steamID, 'boostAutoRestart') && request) {
      accountEvent(steamID, {
        typeName: 'boostRenewed',
        feedEntry: { kind: 'hours', title: 'Saat Yükseltici', text: 'Süre doldu, oturum otomatik yenilendi.', status: 'Çalışıyor' },
      });
      setTimeout(() => {
        const x = accounts.get(steamID);
        if (x && x.ready && !(x.boost && x.boost.runningFlag)) boostStart(steamID, { ...request, proceeding: null });
        else resumeFarm(steamID);
      }, 1500);
      return;
    }
    accountEvent(steamID, {
      typeName: 'boostFinished',
      feedEntry: { kind: 'hours', title: 'Saat Yükseltici', text: 'Süre doldu.', status: 'Başarılı' },
    });
    resumeFarm(steamID);
  }

  // Stops simultaneous hour boosting. deferContinue: card farming should not be resumed right away
  // (if the automatic renewal will start again with the same selection).
  function boostFinish(steamID, cause, deferContinue) {
    const s = accounts.get(steamID);
    const b = s && s.boost;
    if (!b) return;
    const wasRunning = b.runningFlag;
    boostClear(s);
    b.runningFlag = false;
    if (wasRunning) {
      try { if (s.engine) s.engine.stop('hours'); } catch (_) {}
    }
    const broadcast = accountBroadcast(steamID);
    broadcast('boost:sync', { running: false });
    broadcast('boost:tick', { running: false, cause: cause || 'user' });
    if (wasRunning && !deferContinue) resumeFarm(steamID);
  }
  function boostStopAccount(steamID, cause) { boostFinish(steamID, cause || 'user'); }

  // Sequential idling (Hour Booster, "simultaneous" off): one by one, `durationMs` each.
  // Uses FarmController's 'sequential' mode; a separate instance so it does not clash with card farming.
  function sequentialBroadcast(steamID) {
    const broadcast = accountBroadcast(steamID);
    return (channelName, payloadData) => {
      broadcast('hoursFarm:tick', payloadData);
      if (!payloadData || payloadData.running || !payloadData.wasRunning) return;
      const s = accounts.get(steamID);
      if (s && !s.hoursFarm.running) {
        if (payloadData.cause === 'finished') {
          accountEvent(steamID, {
            typeName: 'boostFinished',
            feedEntry: { kind: 'hours', title: 'Saat Yükseltici', text: 'Sıralı kuyruk tamamlandı.', status: 'Başarılı' },
          });
        }
        if (payloadData.cause !== 'boost' && payloadData.cause !== 'setting') resumeFarm(steamID);
      }
    };
  }
  function startSequential(steamID, request) {
    const s = accounts.get(steamID);
    if (!s || !s.engine || !s.ready) return { ok: false, error: 'Bağlı değil.' };
    if (s.boost && s.boost.runningFlag) boostFinish(steamID, 'sequential', true);
    if (settingFor(steamID, 'pauseFarmOnBoost')) delayFarm(steamID, 'sequential hour boosting');
    if (!s.hoursFarm) s.hoursFarm = new FarmController(s.engine, sequentialBroadcast(steamID), 'sequential');
    s.hoursFarm.engine = s.engine;
    s.sequentialRequest = { games: request.games || [], durationMs: request.durationMs, loop: request.loop !== false };
    // "Shuffle the game order" only makes sense here: since games are opened one by one the order
    // shows on the profile. In simultaneous boosting all are open together and the order has no effect.
    s.hoursFarm.start('sequential', s.sequentialRequest.games, s.sequentialRequest.durationMs, {
      loop: s.sequentialRequest.loop, shuffle: !!settingFor(steamID, 'shuffleBoost'), proceeding: request.proceeding || null,
    });
    return { ok: true };
  }

  return { SYNC_MAX_GAMES, boostFinish, boostStart, boostStopAccount, buildSyncSteps, holdCounters, simulateSync, startSequential, syncConnectionChanged };
};
