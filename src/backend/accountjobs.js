// What runs per account: the account slot, the job status the window shows, the activity feed and the statistics counters. Card farming is in cardfarm.js,
// the connection state of an engine in connectionstate.js. Everything it needs from main.js arrives through `ctx`; the names it gives back are returned at the end.

module.exports = function init(ctx) {
  const { DEFAULT_STATS, accounts, sendRaw, statsView } = ctx;

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

  // Stops all jobs of an account (exit, deleting an account, disconnecting).
  function stopAccountJobs(s, steamID) {
    if (!s) return;
    s.pendingFarm = null;
    ctx.cancelSettingWaits(s);
    try { if (s.farm && s.farm.running) s.farm.stop('user'); } catch (_) {}
    try { if (s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('user'); } catch (_) {}
    ctx.stopCardWatcher(s);
    ctx.stopKeyRun(s);
    if (steamID) {
      try { ctx.boostStopAccount(steamID, 'user'); } catch (_) {}
      try { if (s.realistic) ctx.realisticFinish(steamID, 'user stopped'); } catch (_) {}
      try { statsHour(steamID); } catch (_) {}
    }
    if (s.statHour) { clearInterval(s.statHour); s.statHour = null; }
  }

  return { accountBoostRunning, accountBroadcast, accountEvent, accountJobDetail, accountJobKinds, accountName, accountRunning, accountStats, addDailyCard, addFeed, addStat, dayKey, earning, handleUninterruptedRun, sendJobStatus, slotOf, statsHour, stopAccountJobs };
};
