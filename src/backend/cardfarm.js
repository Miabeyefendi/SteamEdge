// Card farming per account: the farm controller of an account, the badge page watcher that counts the drops, achievements while farming,
// pausing for hour boosting and resuming, and what happens when all cards are collected. Moved out of accountjobs.js unchanged.

module.exports = function init(ctx) {
  const { FarmController, accountBoostRunning, accountBroadcast, accountEvent, accountName, accountRunning, accounts, addDailyCard, addStat, app, log, logger, sendRaw, slotOf, storeLists } = ctx;

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
    // The wait for the next achievement of "Unlock achievements while farming" counts from the last unlock of the ACCOUNT, kept in its file: it used to start
    // again with every start of the app, so an app that was closed and opened every half hour or so never reached the 20 to 40 minutes (13 hours, no unlock).
    // An account that never unlocked one starts counting at its first farm, and keeps that time over restarts.
    const v = ctx.accountData(steamID);
    if (!(v.farmAchAt > 0)) { v.farmAchAt = Date.now(); ctx.writeAccountDataDelayed(steamID); }
    s.watcher = {
      timer: null, achievementTimer: null, occupiedFlag: false, achievementBusy: false, failure: 0,
      // When continuing (a settings change) the previous measurement is kept, otherwise the drop in between would be lost.
      leftover: old && old.leftover ? old.leftover : new Map((gameList || []).map((g) => [g.appid, g.remaining])),
      nameList: new Map((gameList || []).map((g) => [g.appid, g.name])),
      sessionDropped: old ? old.sessionDropped || 0 : 0,
      lastAchievement: old ? old.lastAchievement || 0 : v.farmAchAt,
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
      const playtimes = new Map();
      const v = ctx.accountData(steamID);
      ((v.lists && v.lists.drop) || []).forEach((g) => playtimes.set(g.appid, g.playtimeMin || 0));
      (s.farm.games || []).forEach((g) => playtimes.set(g.appid, g.playtimeMin || playtimes.get(g.appid) || 0));
      const current = gameList.map((g) => ({ ...g, playtimeMin: playtimes.get(g.appid) || 0 }));
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
      v.farmAchAt = trace.lastAchievement;
      v.achLog.unshift({ appid, game: data.gameName || null, apiName: picked.apiName, name: picked.name, unlock: true, ts: Date.now() });
      logger.event(steamID, 'ach.unlock', 'app=' + appid + ' api=' + picked.apiName + ' by=farm');
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

  return { delayFarm, resumeFarm, startCardFarm, stopCardWatcher };
};
