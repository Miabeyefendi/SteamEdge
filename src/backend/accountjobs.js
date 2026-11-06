// Moved out of main.js unchanged (what runs per account: the account slot, the job status the window shows, the activity feed, the statistics counters, card farming with its
// watcher and pauses, and the connection state of an engine). Everything it needs from main.js arrives through `ctx`; the names it still gives back are returned at the end.

module.exports = function init(ctx) {
  const { DEFAULT_STATS, FarmController, accounts, app, ipcMain, log, logger, sendRaw, statsView, storeLists, syncActive } = ctx;

  function slotOf(steamID) {
    if (!accounts.has(steamID)) {
      accounts.set(steamID, {
        engine: null, farm: null, hoursFarm: null, ready: false, accountName: null,
        lastOne: {},             // channel -> last state; resent to the interface when the account changes
        boost: null,         // simultaneous hour boosting and sync
        realistic: null,      // Realistic Mode
        watcher: null,      // card drop watcher
        statHour: null,      // run time counter
        pendingFarm: null,  // card farming paused for the duration of hour boosting
      });
    }
    return accounts.get(steamID);
  }

  // ================== PER-ACCOUNT JOBS ==================
  // Card farming, hour boosting, sync and Realistic Mode used to be tied to the engine of the account open on screen
  // (the module level `engine`). The timers used the same variable too: if you switched to B
  // while hour boosting was running on account A, when the time was up B's games
  // were closed and A stayed open forever. Statistics were also counted from the interface, only
  // for the account on screen. Now every job lives in its own account's slot.
  const JOB_CHANNELS = ['farm:tick', 'boost:tick', 'hoursFarm:tick', 'boost:sync', 'realistic:tick'];
  const EMPTY_STATE = {
    'farm:tick': { running: false }, 'boost:tick': { running: false }, 'hoursFarm:tick': { running: false },
    'boost:sync': { running: false }, 'realistic:tick': { runningFlag: false },
  };
  function accountName(steamID) {
    const s = accounts.get(steamID);
    return (s && s.accountName) || String(steamID || '');
  }
  function accountBoostRunning(s) {
    return !!(s && ((s.boost && s.boost.runningFlag) || (s.hoursFarm && s.hoursFarm.running)));
  }
  function accountRunning(s) {
    return !!(s && ((s.farm && s.farm.running) || accountBoostRunning(s) || s.realistic));
  }
  // The kinds of job that run on an account ('card', 'hours', 'realistic'): the interface names them next to the account, so a job on the account that is NOT on
  // screen can be seen without opening that account.
  // What runs on an account, with its games, for the accounts that are NOT on screen: [{ kind, games: [names], more }]. A job of another account
  // (for example one resumed at startup) used to show only as a count; nothing said what it was or where.
  function accountJobDetail(s) {
    const out = [];
    const names = (list) => (list || []).map((g) => (g && g.name) || ('App ' + (g && g.appid))).filter(Boolean);
    const pack = (kind, list) => { const all = names(list); out.push({ kind, games: all.slice(0, 2), more: Math.max(0, all.length - 2) }); };
    if (s && s.farm && s.farm.running) {
      const cur = (s.farm.games || []).find((g) => g.appid === s.farm.currentActiveAppid);
      pack('card', cur ? [cur] : (s.farm.games || []).slice(0, 1));
    }
    if (s && s.boost && s.boost.runningFlag) {
      const b = s.boost.request || {};
      pack('hours', b.games || (b.appids || []).map((appid) => ({ appid })));
    } else if (s && s.hoursFarm && s.hoursFarm.running) {
      pack('hours', s.hoursFarm.games || (s.sequentialRequest && s.sequentialRequest.games) || []);
    }
    if (s && s.realistic && s.realistic.activeIds) pack('realistic', s.realistic.activeIds.parallel
      ? s.realistic.gameEntries.filter((g) => !s.realistic.playingIds || s.realistic.playingIds.includes(g.appid)).map((g) => ({ appid: g.appid, name: g.name }))
      : [{ appid: s.realistic.activeIds.appid, name: s.realistic.activeIds.gameTitle }]);
    return out;
  }
  function accountJobKinds(s) {
    const kinds = [];
    if (s && s.farm && s.farm.running) kinds.push('card');
    if (accountBoostRunning(s)) kinds.push('hours');
    if (s && s.realistic) kinds.push('realistic');
    return kinds;
  }
  // A job event of an account. Only those of the account open on screen go to the interface; all are kept.
  function accountBroadcast(steamID) {
    return (channelName, payloadData) => {
      const s = accounts.get(steamID);
      if (s) s.lastOne[channelName] = payloadData;
      if (steamID === ctx.activeSteamID) sendRaw(channelName, { ...payloadData, steamID });
      if (s) {
        const isRunning = accountRunning(s);
        const jobs = accountJobKinds(s);
        if (jobs.length) s.lastJobs = jobs;
        // the games of a running job changed (the next game of a queue): the account list and the overview follow
        const detail = accountJobDetail(s);
        const detailKey = JSON.stringify(detail);
        if (isRunning === s.lastRun && detailKey !== s.lastDetail && isRunning) {
          s.lastDetail = detailKey;
          sendRaw('accounts:activity', { steamID, running: isRunning, jobs, detail, finished: s.finished || null });
        }
        if (isRunning !== s.lastRun) {
          s.lastDetail = detailKey;
          // What ran on an account that is not on screen and has stopped is remembered ("ended at 14:02") until that account is opened: the user cannot see it end otherwise
          if (!isRunning && s.lastRun && steamID !== ctx.activeSteamID && s.lastJobs && s.lastJobs.length) s.finished = { jobs: s.lastJobs, ts: Date.now() };
          s.lastRun = isRunning;
          sendRaw('accounts:activity', { steamID, running: isRunning, jobs, detail, finished: s.finished || null });
          ctx.updateSleepBlocker();
          ctx.resumeSaveSoon();                       // a job started or ended: the file follows within a second
          handleUninterruptedRun(steamID, isRunning);
        }
        updateStatsHour(steamID);
      }
    };
  }
  // When the account changes that account's LIVE state is sent to the interface. Stopped jobs go with an empty state;
  // one-time flags like "finished" are not sent again, otherwise notifications would repeat.
  function sendJobStatus(steamID) {
    const s = accounts.get(steamID);
    JOB_CHANNELS.forEach((k) => {
      const d = s && s.lastOne[k];
      const isRunning = d && (d.running || d.runningFlag);
      sendRaw(k, isRunning ? { ...d, steamID } : { ...EMPTY_STATE[k], steamID });
    });
  }
  // Events that belong to the user (card dropped, cards finished, achievement unlocked...). The interface
  // shows the notification (quiet hours, sound and setting gates are there). The event of a background account is
  // also written to that account's own activity feed; when you switch to the account the history is not missing.
  function accountEvent(steamID, evt) {
    sendRaw('account:event', { steamID, accountRef: accountName(steamID), activeIds: steamID === ctx.activeSteamID, ...evt });
    if (steamID !== ctx.activeSteamID && evt.feedEntry) addFeed(steamID, evt.feedEntry);
  }
  const ACTIVITY_KEY = 'activityFeed';
  function addFeed(steamID, record) {
    const v = ctx.accountData(steamID);
    const e = v.entries[ACTIVITY_KEY];
    const listing = (e && Array.isArray(e.v)) ? e.v : [];
    listing.unshift({ ...record, ts: Date.now() });
    if (listing.length > 30) listing.length = 30;
    v.entries[ACTIVITY_KEY] = { v: listing, ts: Date.now() };
    ctx.writeAccountDataDelayed(steamID);
  }

  // ---- Statistics (per account) ----
  // Cards dropped day by day for "Best day". Local date: the user's day, not by UTC.
  function dayKey(t) {
    const d = new Date(t || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDailyCard(steamID, count) {
    const st = accountStats(steamID);
    if (!st.dailyCards || typeof st.dailyCards !== 'object') st.dailyCards = {};
    const day = dayKey();
    st.dailyCards[day] = (st.dailyCards[day] || 0) + count;
    const days = Object.keys(st.dailyCards).sort();
    while (days.length > 400) delete st.dailyCards[days.shift()];
  }
  // "Uninterrupted run": the longest time a job (card, hour, Realistic Mode) on an account ran without a
  // break. Pauses shorter than a minute do not count as a break (like the job being paused a few
  // seconds when a setting is saved, or a short connection drop).
  function handleUninterruptedRun(steamID, isRunning) {
    const s = accounts.get(steamID);
    if (!s) return;
    const currentTime = Date.now();
    if (isRunning) {
      if (!s.uninterruptedStart || (s.uninterruptedEnd && currentTime - s.uninterruptedEnd > 60000)) s.uninterruptedStart = currentTime;
      s.uninterruptedEnd = null;
      return;
    }
    if (!s.uninterruptedStart || s.uninterruptedEnd) return;
    s.uninterruptedEnd = currentTime;
    const st = accountStats(steamID);
    const duration = currentTime - s.uninterruptedStart;
    if (duration > (+st.longestRunMs || 0)) { st.longestRunMs = duration; ctx.writeAccountDataDelayed(steamID); }
  }
  function accountStats(steamID) {
    const v = ctx.accountData(steamID);
    if (!v.stats) v.stats = { ...DEFAULT_STATS, since: Date.now() };
    return v.stats;
  }
  function addStat(steamID, patch) {
    if (!steamID) return;
    const st = accountStats(steamID);
    Object.keys(patch || {}).forEach((k) => {
      if (typeof st[k] !== 'number') st[k] = 0;
      st[k] += (+patch[k] || 0);
    });
    ctx.writeAccountDataDelayed(steamID);
    if (steamID === ctx.activeSteamID) sendRaw('stats:changed', statsView(steamID));
  }
  // Run time counter. Card farming time is `totalRuntimeMs`, hour boosting (simultaneous or
  // sequential) is `boostRuntimeMs`. Hour boosting time used to be written only when Stop was pressed BY
  // HAND: a job that ended on its own when the time was up or the job of a background account was never
  // counted. It does not count while the connection is down; Steam does not count that time either.
  // The account earns time only while it is connected and no game of it is open on another device (Steam counts nothing for the held games then).
  function earning(s) {
    return !!(s && s.ready && !(s.engine && s.engine.playingBlocked));
  }
  function statsHour(steamID) {
    const s = accounts.get(steamID);
    if (!s) return;
    const currentTime = Date.now();
    const dt = s.statLast ? currentTime - s.statLast : 0;
    s.statLast = currentTime;
    const patch = {};
    if (dt > 0 && dt < 10 * 60000 && s.statReady) {
      if (s.statFarm) patch.totalRuntimeMs = dt;
      if (s.statBoost) patch.boostRuntimeMs = dt;
    }
    s.statFarm = !!(s.farm && s.farm.running);
    s.statBoost = accountBoostRunning(s);
    s.statReady = earning(s);
    if (Object.keys(patch).length) addStat(steamID, patch);
    if (!s.statFarm && !s.statBoost && s.statHour) { clearInterval(s.statHour); s.statHour = null; s.statLast = 0; }
  }
  // When the job's state changes the counter writes the time up to that moment to the old state, then moves to the new one.
  function updateStatsHour(steamID) {
    const s = accounts.get(steamID);
    if (!s) return;
    const farmNow = !!(s.farm && s.farm.running);
    const boostNow = accountBoostRunning(s);
    if (farmNow === !!s.statFarm && boostNow === !!s.statBoost && (s.statHour || (!farmNow && !boostNow))) return;
    if (s.statHour) statsHour(steamID);
    else { s.statLast = Date.now(); s.statFarm = farmNow; s.statBoost = boostNow; s.statReady = !!s.ready; }
    if ((farmNow || boostNow) && !s.statHour) s.statHour = setInterval(() => statsHour(steamID), 30000);
  }

  // ---- Card farming (per account) ----
  // The badge page is watched in the MAIN PROCESS and per account. The interface used to poll only
  // the account on screen once a minute; a card dropped on a background account was not counted, and a game that ran
  // out of cards never left the queue. The interval is deliberately 3 minutes: on a big library the badge page is
  // several pages and several accounts may be running at the same time.
  const CARD_WATCH_MS = 3 * 60 * 1000;
  function cardFarmOptions(steamID) {
    return {
      autoNext: ctx.settingFor(steamID, 'autoNextGame') !== false,
      maxGames: ctx.settingFor(steamID, 'cardMaxGames'),
      fastMinPlaytimeMin: ctx.settingFor(steamID, 'fastMinPlaytimeMin'),
      fastRotateMinSec: ctx.settingFor(steamID, 'fastRotateMinSec'),
      fastRotateMaxSec: ctx.settingFor(steamID, 'fastRotateMaxSec'),
    };
  }
  // The "When all cards are collected" action set to "Close the app". The check is repeated after a grace period so a job that was
  // paused for another one (resumeFarm) or a second account that is still working keeps the app open.
  let exitTimer = null;
  function scheduleExitWhenIdle(steamID) {
    if (exitTimer) return;
    log('info', 'all cards collected: closing the app in 20 s if nothing else is running');
    exitTimer = setTimeout(() => {
      exitTimer = null;
      if (ctx.settingFor(steamID, 'farmFinishedAction') !== 'exit') return;
      let busy = false;
      accounts.forEach((s) => { if (accountRunning(s) || (s && s.pendingFarm)) busy = true; });
      if (busy) { log('info', 'close cancelled: a job is still running'); return; }
      log('info', 'closing the app: every job is finished');
      ctx.isQuitting = true;
      app.quit();
    }, 20000);
  }
  // "When all cards are collected" set to "Start hour boosting": the account's remembered hour-boost list starts running,
  // as the Hour Booster page would start it without sync (the page's own options such as sequential idling are not applied here).
  async function startBoostAfterCards(steamID) {
    const s = accounts.get(steamID);
    if (!s || !s.engine || !s.ready || accountBoostRunning(s) || s.realistic) return;
    try {
      const ids = ctx.accountData(steamID).boostGameIds || [];
      if (!ids.length) {
        log('info', '[' + accountName(steamID) + '] cards done, no hour-boost list saved: nothing to start');
        accountEvent(steamID, { typeName: 'cardStopped', feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Saat yükseltme listesi boş olduğu için başlatılmadı.', status: 'Uyarı' } });
        return;
      }
      const owned = new Map((await s.engine.getOwnedGames()).map((o) => [o.appid, o]));
      const limit = Math.max(1, Math.min(32, +ctx.settingFor(steamID, 'boostMaxGames') || 32));
      const games = ids.filter((id) => owned.has(id)).slice(0, limit)
        .map((id) => ({ appid: id, name: owned.get(id).name, playtimeMin: owned.get(id).playtimeForever || 0 }));
      if (!games.length || accountBoostRunning(s) || s.realistic) return;
      ctx.boostStart(steamID, { appids: games.map((g) => g.appid), durationMs: 0, games, allItems: null });
      log('info', '[' + accountName(steamID) + '] cards done: hour boosting started (' + games.length + ' games)');
      accountEvent(steamID, { typeName: 'boostStarted', feedEntry: { kind: 'hours', title: 'Saat Yükseltme', text: 'Kartlar bitti; saat yükseltme başladı.', status: 'Çalışıyor' } });
    } catch (e) { log('warn', '[' + accountName(steamID) + '] starting hour boosting after the cards failed: ' + (e && e.message)); }
  }
  function farmBroadcast(steamID) {
    const broadcast = accountBroadcast(steamID);
    return (channelName, payloadData) => {
      broadcast(channelName, payloadData);
      if (channelName !== 'farm:tick' || !payloadData || payloadData.running) return;
      const s = accounts.get(steamID);
      stopCardWatcher(s);
      if (payloadData.cause === 'finished' && payloadData.wasRunning) {
        log('info', '[' + accountName(steamID) + '] card farming done: all cards collected');
        accountEvent(steamID, {
          typeName: 'cardsDone',
          feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Tüm kartlar toplandı.', status: 'Başarılı' },
        });
        resumeFarm(steamID);
        if (ctx.settingFor(steamID, 'farmFinishedAction') === 'exit') scheduleExitWhenIdle(steamID);
        else if (ctx.settingFor(steamID, 'farmFinishedAction') === 'boost') startBoostAfterCards(steamID);
      } else if ((payloadData.cause === 'duration' || payloadData.cause === 'gameFinished') && payloadData.wasRunning) {
        // "Move on when a game is done" is off: it says why it stopped, otherwise the user
        // thought the job had closed on its own.
        accountEvent(steamID, {
          typeName: 'cardStopped',
          feedEntry: { kind: 'card', title: 'Kart Düşürme', status: 'Durdu',
            text: payloadData.cause === 'duration'
              ? 'Oyunun süresi doldu; sıradakine geçme kapalı olduğundan durdu.'
              : 'Oyunun kartları bitti; sıradakine geçme kapalı olduğundan durdu.' },
        });
      }
    };
  }
  function startCardFarm(steamID, mode, games, durationMs, extra) {
    const s = slotOf(steamID);
    if (!s.engine || !s.ready) return false;
    if (!s.farm) s.farm = new FarmController(s.engine, farmBroadcast(steamID), 'card');
    s.farm.engine = s.engine;
    const proceed = !!(extra && extra.proceeding);
    log('info', `[${accountName(steamID)}] farm ${proceed ? 'resume' : 'start'}: mode=${mode} games=${(games || []).length} duration=${durationMs}ms`);
    s.farm.start(mode, games || [], durationMs, { ...cardFarmOptions(steamID), ...(extra || {}) });
    if (!proceed && s.farm.running) addStat(steamID, { sessions: 1 });
    if (s.farm.running) startCardWatcher(steamID, games || []);
    return true;
  }
  function startCardWatcher(steamID, gameList) {
    const s = accounts.get(steamID);
    if (!s) return;
    const old = s.watcher;
    stopCardWatcher(s);
    s.watcher = {
      timer: null, achievementTimer: null, occupiedFlag: false, achievementBusy: false, failure: 0,
      // When continuing (a settings change) the previous measurement is kept, otherwise the drop in between would be lost.
      leftover: old && old.leftover ? old.leftover : new Map((gameList || []).map((g) => [g.appid, g.remaining])),
      nameList: new Map((gameList || []).map((g) => [g.appid, g.name])),
      sessionDropped: old ? old.sessionDropped || 0 : 0,
      lastAchievement: old ? old.lastAchievement || 0 : Date.now(),
    };
    s.watcher.timer = setInterval(() => watchCards(steamID), CARD_WATCH_MS);
    s.watcher.achievementTimer = setInterval(() => openCardAchievements(steamID), 60000);
  }
  function stopCardWatcher(s) {
    if (!s || !s.watcher) return;
    if (s.watcher.timer) clearInterval(s.watcher.timer);
    if (s.watcher.achievementTimer) clearInterval(s.watcher.achievementTimer);
    s.watcher.timer = null; s.watcher.achievementTimer = null;
  }
  async function watchCards(steamID) {
    const s = accounts.get(steamID);
    if (!s || !s.watcher || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
    const trace = s.watcher;
    if (trace.occupiedFlag) return;
    trace.occupiedFlag = true;
    try {
      const { gameEntries: gameList, finishedOnes: finished } = await s.engine.getDropGames(true);
      trace.failure = 0;
      // Playtime is not on the badge page; it is carried over from the last known list (fast mode needs it).
      const dk = new Map();
      const v = ctx.accountData(steamID);
      ((v.lists && v.lists.drop) || []).forEach((g) => dk.set(g.appid, g.playtimeMin || 0));
      (s.farm.games || []).forEach((g) => dk.set(g.appid, g.playtimeMin || dk.get(g.appid) || 0));
      const current = gameList.map((g) => ({ ...g, playtimeMin: dk.get(g.appid) || 0 }));
      const newItem = new Map(current.map((g) => [g.appid, g]));
      let droppedNow = 0;
      trace.leftover.forEach((earlier, appid) => {
        let currentTime = newItem.has(appid) ? newItem.get(appid).remaining : null;
        if (currentTime == null && finished.has(appid)) currentTime = 0;
        if (currentTime == null || !(currentTime < earlier)) return;
        const count = earlier - currentTime;
        droppedNow += count;
        const name = (newItem.get(appid) && newItem.get(appid).name) || trace.nameList.get(appid) || ('App ' + appid);
        accountEvent(steamID, {
          typeName: 'cardDropped', appid, displayName: name, itemCount: count,
          feedEntry: { kind: 'card', title: '# kart düştü'.replace('#', count), text: name, status: 'Başarılı' },
        });
      });
      current.forEach((g) => { trace.leftover.set(g.appid, g.remaining); trace.nameList.set(g.appid, g.name); });
      finished.forEach((id) => trace.leftover.set(id, 0));
      if (droppedNow) {
        trace.sessionDropped += droppedNow;
        addDailyCard(steamID, droppedNow);
        addStat(steamID, { cardsDropped: droppedNow });
      }
      storeLists('drop', current, steamID);
      if (steamID === ctx.activeSteamID) sendRaw('farm:list', { steamID, games: current, sessionDropped: trace.sessionDropped, droppedItems: droppedNow });
      s.farm.updateGames(current, finished);
    } catch (e) {
      trace.failure++;
      log('warn', '[' + accountName(steamID) + '] badge watcher: ' + (e && e.message));
    } finally {
      trace.occupiedFlag = false;
    }
  }
  // "Unlock achievements while farming" (farmAchUnlock). It was in the interface and only worked for the account on screen,
  // while the window was open. One achievement every 20 to 40 minutes (random), so a long farm opens a few, not dozens.
  async function openCardAchievements(steamID) {
    if (!ctx.settingFor(steamID, 'farmAchUnlock')) return;
    const s = accounts.get(steamID);
    if (!s || !s.watcher || !s.farm || !s.farm.running || !s.engine || !s.ready) return;
    const trace = s.watcher;
    if (!trace.achievementWait) trace.achievementWait = (20 + Math.random() * 20) * 60000;
    if (trace.achievementBusy || Date.now() - (trace.lastAchievement || 0) < trace.achievementWait) return;
    const appid = s.farm.currentActiveAppid;
    if (!appid) return;
    trace.achievementBusy = true;
    try {
      const data = await s.engine.getAchievements(appid);
      const locked = ((data && data.achievements) || []).filter((a) => !a.achieved && !a.protectedFlag);
      if (!locked.length) return;
      const picked = ctx.settingFor(steamID, 'achSpread') ? locked[Math.floor(Math.random() * locked.length)] : locked[0];
      await s.engine.setAchievements(appid, [{ apiName: picked.apiName, unlock: true }]);
      trace.lastAchievement = Date.now();
      trace.achievementWait = 0;
      const v = ctx.accountData(steamID);
      v.achLog.unshift({ appid, game: data.gameName || null, apiName: picked.apiName, name: picked.name, unlock: true, ts: Date.now() });
      if (v.achLog.length > 2000) v.achLog.length = 2000;
      ctx.writeAccountDataDelayed(steamID);
      accountEvent(steamID, {
        typeName: 'achievementUnlocked', appid, displayName: picked.name,
        feedEntry: { kind: 'card', title: 'Başarım açıldı', text: picked.name, status: 'Başarılı' },
      });
    } catch (e) {
      log('warn', '[' + accountName(steamID) + '] could not unlock an achievement during farming: ' + (e && e.message));
    } finally {
      trace.achievementBusy = false;
    }
  }
  // "Pause farming while boosting hours". The setting's description said "when hour boosting ends
  // card farming continues where it left off" but the code only stopped it; it never
  // started again. Now the paused job is kept and resumed when hour boosting ends.
  function delayFarm(steamID, reasonWhy) {
    const s = accounts.get(steamID);
    if (!s || !s.farm || !s.farm.running) return false;
    const position = s.farm.location();          // first: credit the warm-up progress to the games in fast mode
    s.pendingFarm = {
      mode: s.farm.mode, games: s.farm.games.map((g) => ({ ...g })),
      durationMs: s.farm.durationMs, location: position,
    };
    s.farm.stop('boost');
    log('info', '[' + accountName(steamID) + '] card farming paused: ' + reasonWhy);
    accountEvent(steamID, {
      typeName: 'cardPaused',
      feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Saat yükseltme sürerken duraklatıldı.', status: 'Uyarı' },
    });
    return true;
  }
  // forceIt: resume even if hour boosting continues (the "pause" setting was turned off).
  function resumeFarm(steamID, forceIt) {
    const s = accounts.get(steamID);
    if (!s || !s.pendingFarm || s.realistic) return;
    if (!forceIt && accountBoostRunning(s)) return;
    if (!s.ready || !s.engine) return;
    const b = s.pendingFarm;
    s.pendingFarm = null;
    // Options come from the CURRENT settings (cardFarmOptions); the old options of the paused job
    // used to be restored, a setting that changed in between did not reach the resumed job.
    startCardFarm(steamID, b.mode, b.games, b.durationMs, { proceeding: b.location });
    accountEvent(steamID, {
      typeName: 'cardResumed',
      feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Kaldığı yerden sürüyor.', status: 'Çalışıyor' },
    });
  }
  // Stops all jobs of an account (exit, deleting an account, disconnecting).
  function stopAccountJobs(s, steamID) {
    if (!s) return;
    s.pendingFarm = null;
    ctx.cancelSettingWaits(s);
    try { if (s.farm && s.farm.running) s.farm.stop('user'); } catch (_) {}
    try { if (s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('user'); } catch (_) {}
    stopCardWatcher(s);
    ctx.stopKeyRun(s);
    if (steamID) {
      try { ctx.boostStopAccount(steamID, 'user'); } catch (_) {}
      try { if (s.realistic) ctx.realisticFinish(steamID, 'user stopped'); } catch (_) {}
      try { statsHour(steamID); } catch (_) {}
    }
    if (s.statHour) { clearInterval(s.statHour); s.statHour = null; }
  }

  // G3: Carries the engine's connection state to the interface. A connection that dropped at run time
  // used to be reported nowhere; the user looked at "running" for hours and
  // actually earned nothing.
  function bindConnectionState(eng, steamID) {
    // A game of the account is open on another device (the Steam client): the engine holds its games until it ends. Told to the log, connection.log and the page.
    eng.onPlaying = (blocked, appid) => {
      const s = accounts.get(steamID);
      if (s && s.engine && s.engine !== eng && !s.connecting) return;
      log('info', '[' + steamID + '] ' + (blocked ? 'a game of this account is open on another device' + (appid ? ' (' + appid + ')' : '') + ', the games wait' : 'the other device stopped playing, the games are open again'));
      logger.connection(steamID, blocked ? 'blocked' : 'unblocked', appid ? { appid: +appid } : null);
      sendRaw('engine:playing', { steamID, blocked: !!blocked, appid: appid || null, activeIds: steamID === ctx.activeSteamID });
      ctx.holdCounters(steamID, !!blocked);
    };
    eng.onStatus = (status, extra) => {
      const s = accounts.get(steamID);
      // An engine that is not the account's any more says nothing about it: an old one that still reported "reconnecting" set the account to "not connected"
      // while the new one worked. (During connectAccount the new one is not s.engine yet; its statuses count.)
      if (s && s.engine && s.engine !== eng && !s.connecting) return;
      if (s) {
        // The counters must not count the downtime: first the time up to that moment is written.
        if (status !== 'connected') statsHour(steamID);
        s.ready = (status === 'connected');
        if (s.ready) { s.lastConnection = Date.now(); s.statLast = Date.now(); s.statReady = true; }
        // A long drop splits the uninterrupted run; one shorter than a minute does not (see handleUninterruptedRun).
        if (accountRunning(s)) handleUninterruptedRun(steamID, s.ready);
        ctx.syncConnectionChanged(steamID, earning(s));
        // A card farm paused for a job that ended while the connection was down could not start then (resumeFarm needs a connection) and stayed paused for
        // good, blocking the schedule and the resume of jobs too. It is given back when the connection is; resumeFarm leaves it paused if that job still runs.
        if (s.ready && s.pendingFarm) resumeFarm(steamID);
        // the key queue waits 30 s at a time while the connection is down and showed "Not connected" until its next try: it goes on as soon as the connection is back
        if (s.ready && s.keys && s.keys.running && s.keys.error === 'Bağlı değil.') { s.keys.error = null; ctx.keyChanged(steamID); if (s.keys.cancelSleep) s.keys.cancelSleep(); }
      }
      if (steamID === ctx.activeSteamID) { ctx.engineReady = (status === 'connected'); }
      // Log text. The interface builds the text in its own language from the fields (condition, cause, attemptCount, waitMs,
      // limitValue, gameEntries); the text here is only for the log file.
      const message = status === 'dropped'
        ? ('Steam connection dropped: ' + (extra.cause || '?'))
        : status === 'connecting'
          ? (extra.trying
              ? ('reconnecting: attempt ' + extra.attemptCount + ' started (deadline ' + Math.round((extra.deadlineMs || 0) / 1000) + ' s)')
              : ('reconnecting (attempt ' + extra.attemptCount + ', in ' + Math.round((extra.waitMs || 0) / 1000) + ' s)' + (extra.lastFailure ? ', last: ' + extra.lastFailure : '')))
          : status === 'abandoned'
            ? ('reconnecting stopped' + (extra.permanent ? (' (permanent: ' + (extra.cause || '?') + ')') : (' (' + (extra.attemptCount || 0) + ' attempts)')))
            : status === 'connected' && extra.reconnected
              ? ('reconnected, ' + (extra.gameEntries || 0) + ' games reopened')
              : 'connected';
      log(status === 'dropped' || status === 'abandoned' ? 'warn' : 'info', '[' + steamID + '] ' + message);
      // connection.log keeps every one of these whatever the level (the countdown between attempts is one "waiting" line, not one per second)
      if (status === 'dropped') {
        if (s) { s.droppedAt = Date.now(); s.lastAttempt = 0; }
        logger.connection(steamID, 'dropped', { cause: extra.cause });
      } else if (status === 'connecting') {
        if (extra.trying && s) s.lastAttempt = extra.attemptCount || 0;
        logger.connection(steamID, extra.trying ? 'attempt' : 'waiting', extra.trying
          ? { attempt: extra.attemptCount, deadlineMs: extra.deadlineMs }
          : { attempt: extra.attemptCount, nextMs: extra.waitMs, cause: extra.lastFailure });
      } else if (status === 'abandoned') {
        logger.connection(steamID, 'abandoned', { attempts: extra.attemptCount || 0, permanent: !!extra.permanent, cause: extra.cause });
      } else if (status === 'connected') {
        logger.connection(steamID, extra.reconnected ? 'reconnected' : 'connected', extra.reconnected
          ? { games: extra.gameEntries || 0, attempts: (s && s.lastAttempt) || 0, downMs: s && s.droppedAt ? Date.now() - s.droppedAt : null }
          : null);
        if (s) { s.droppedAt = null; s.lastAttempt = 0; }
      }
      // The first session of an account whose first logon failed (no network at start) and that the engine's own loop opened later: what connectAccount does
      // after a logon is done now
      if (status === 'connected' && extra.first && s && s.engine === eng) {
        ctx.resumeKeyQueue(steamID);
        ctx.resumeAfterConnect(steamID);
        syncActive();
      }
      const s2 = accounts.get(steamID);
      if (s2) s2.connectionStatus = { condition: status, ts: Date.now(), ...extra };
      sendRaw('engine:status', { steamID, condition: status, messageText: message, activeIds: steamID === ctx.activeSteamID, limitValue: eng.reconnectLimit, ...extra });
      if (status === 'abandoned') {
        accountEvent(steamID, {
          typeName: 'connectionAbandoned', permanent: !!extra.permanent, attemptCount: extra.attemptCount || 0, cause: extra.cause || '',
          feedEntry: { kind: 'error', title: 'Steam Bağlantısı', text: extra.permanent ? 'Steam oturumu kapandı, yeniden bağlanılmıyor.' : 'Yeniden bağlanma denemeleri bitti.', status: 'Hata' },
        });
      }
    };
  }
  // The "Reconnect" button in the interface: restarts the attempts of an engine that gave up.
  ipcMain.handle('engine:reconnect', () => {
    const s = accounts.get(ctx.activeSteamID);
    if (!s || !s.engine) return { ok: false, error: 'Bağlı değil.' };
    if (s.ready) return { ok: true, alreadyConnected: true };
    s.engine.tryReconnect(true);
    return { ok: true };
  });
  // The connection of the account on screen (Settings > Account status). Not a guess, the last thing the engine reported.
  ipcMain.handle('engine:connectionStatus', () => {
    const s = ctx.activeSteamID ? accounts.get(ctx.activeSteamID) : null;
    if (!s || !s.engine) return { condition: 'none' };
    if (s.ready) return { condition: 'connected', ts: s.lastConnection || null, playingBlocked: !!s.engine.playingBlocked };
    return s.connectionStatus || { condition: 'connecting' };
  });

  return { accountBoostRunning, accountBroadcast, accountEvent, accountJobDetail, accountJobKinds, accountName, accountRunning, accountStats, addFeed, addStat, bindConnectionState, dayKey, delayFarm, earning, resumeFarm, sendJobStatus, slotOf, startCardFarm, statsHour, stopAccountJobs };
};
