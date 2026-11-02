// Moved out of main.js unchanged (realistic). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { CACHE_DIR, SYNC_MAX_GAMES, accountBroadcast, accountData, accountEvent, accountName, accounts, activeAccountData, addFeed, boostFinish, boostStart, buildSyncSteps, delayFarm, ipcMain, log, path, readJson, resumeFarm, saveSettings, settingFor, simulateSync, slotOf, startCardFarm, startSequential, writeAccountDataDelayed, writeJson } = ctx;

  // ================== REALISTIC MODE (G2) ==================
  // Purpose: to keep a single game open and over the chosen time unlock the achievements from the MOST COMMON TO THE RARE,
  // at random intervals. It leaves a trail as if the game had really been played: first the achievements
  // everybody unlocks, then the rare ones; not all at once, spread over the time.
  //
  // Why rarity order: in a real player too the entry level achievements unlock first. Unlocking hundreds of
  // achievements in a minute stands out right away on the profile and on third party sites.
  // G11: the page was renewed according to the template. The engine now does this extra:
  //   - GAME QUEUE: more than one game is processed in turn (if "Start the queue automatically" is off
  //     it stops after the first game).
  //   - TARGET COUNT: the user can say "unlock this many achievements"; the queue is trimmed toward the front.
  //   - DISTRIBUTION MODEL: the unlock times are placed on a linear, exponential or Pareto curve.
  //   - A GAME WITH NO ACHIEVEMENTS: only collect hours / skip / stop the queue.
  // The state is in the account's slot (s.gercekci). It used to be a single global variable and it unlocked the achievements
  // with the engine of the account open on screen at that moment: if the account was changed while the job ran the following
  // achievements would be unlocked ON THE WRONG ACCOUNT.
  function realisticStatus(steamID) {
    const s = accounts.get(steamID);
    return s ? s.realistic : null;
  }
  function realisticClear(steamID) {
    const s = accounts.get(steamID);
    if (!s) return;
    if (s.realistic && s.realistic.timer) clearTimeout(s.realistic.timer);
    if (s.realistic && s.realistic.groupTimer) clearTimeout(s.realistic.groupTimer);
    s.realistic = null;
  }

  // The games at the same time are played in groups (at most TOGETHER_MAX, src/core/realisticPlan.js): the group whose time it is now is open, and when the time of
  // the next one comes its games take its place.
  function realisticPlayGroup(steamID, d) {
    const s = accounts.get(steamID);
    if (!s || s.realistic !== d || !d.groups || !d.groups.length) return;
    const elapsed = Date.now() - d.startPoint;
    let i = 0;
    while (i + 1 < d.groups.length && elapsed >= d.groups[i + 1].startMs) i++;
    // the last unlocks of a group can come a few seconds after its time (the random gap, a drop): its games stay open until they are sent
    const next = d.activeIds && d.activeIds.queueList[d.activeIds.indexNum];
    if (d.groupIndex >= 0 && i > d.groupIndex && next && d.groups[d.groupIndex].appids.includes(next.appid)) {
      if (d.groupTimer) clearTimeout(d.groupTimer);
      d.groupTimer = setTimeout(() => realisticPlayGroup(steamID, d), 5000);
      return;
    }
    if (d.groupIndex !== i) {
      d.groupIndex = i;
      d.playingIds = d.groups[i].appids.slice();
      try { if (s.engine) s.engine.play(d.playingIds, 'realistic'); } catch (_) {}
      if (i > 0) log('info', '[' + accountName(steamID) + '] realistic mode: group ' + (i + 1) + '/' + d.groups.length + ' opened (' + d.playingIds.join(', ') + ')');
      realisticNotify(steamID);
    }
    if (d.groupTimer) clearTimeout(d.groupTimer);
    d.groupTimer = i + 1 < d.groups.length ? setTimeout(() => realisticPlayGroup(steamID, d), Math.max(1000, d.groups[i + 1].startMs - elapsed)) : null;
  }

  // The planning (when each achievement unlocks, how long the run lasts) is in src/core/realisticPlan.js: pure functions with their own tests.
  const { realisticModelRatio, realisticAccum, realisticRarityWeight, rarityPositions, isUltraRare, placeRealisticTimes, realisticTimeSetting, computeRealisticAccum, planGames, mergeParallel, FAST_GAP_MS } = require('../core/realisticPlan');

  function realisticNotify(steamID, extra) {
    const d = realisticStatus(steamID);
    const a = d ? d.activeIds : null;
    // with the games at the same time the game on screen is the one of the next unlock
    const nextItem = a && a.parallel ? a.queueList[a.indexNum] : null;
    accountBroadcast(steamID)('realistic:tick', Object.assign({
      runningFlag: !!d,
      parallel: !!(a && a.parallel),
      playingIds: d && a && a.parallel ? (d.playingIds || null) : null,     // the games of the group being played now
      appid: a ? ((nextItem && nextItem.appid) || a.appid) : null,
      gameTitle: a ? ((nextItem && nextItem.gameTitle) || a.gameTitle) : null,
      // totalSum/openedGames describe the WHOLE session; the queue can hold more than one game.
      totalSum: d ? d.totalGoal : 0,
      openedGames: d ? d.totalUnlocked : 0,
      failure: d ? d.totalErrors : 0,
      startPoint: d ? d.startPoint : 0,
      finishTime: d ? d.finishTime : 0,
      upNext: a && a.queueList[a.indexNum] ? a.queueList[a.indexNum].name : null,
      upNextPct: a && a.queueList[a.indexNum] ? a.queueList[a.indexNum].rarityPct : null,
      upNextPos: a && a.queueList[a.indexNum] ? a.queueList[a.indexNum].pos : null,
      upNextTime: d ? d.upNextTime : 0,
      gameCount: d ? d.gameEntries.length : 0,
      gameIndex: d ? d.gameIndex : 0,
      averageIntervalMs: d ? d.averageIntervalMs : 0,
    }, extra || {}));
  }

  // Computes when the next unlock will happen. It waits according to the target time the model gives;
  // with "Randomised gaps" on a +-40% deviation is added on top - so that no fixed rhythm forms.
  function realisticNextDelay(d) {
    const a = d.activeIds;
    const remainingCount = a.queueList.length - a.indexNum;
    if (remainingCount <= 0) return 0;
    const goalTime = a.startPoint + (a.queueList[a.indexNum].timeValue || 0);
    let g = goalTime - Date.now();
    if (!(g > 0)) {
      // The model time has passed (happens at the start or in a delay): divide the remaining time.
      g = Math.max(0, a.finishTime - Date.now()) / remainingCount;
    }
    if (d.optionList.randomInterval) {
      const deviation = g * 0.4;
      g = g - deviation + Math.random() * deviation * 2;
    }
    return Math.max(FAST_GAP_MS, Math.round(g));   // never faster than Steam's pace (it was 3 s, which held the overdue ones of a finished game for hours)
  }

  // A game with nothing left to unlock leaves the account's Realistic Mode queue, the saved one and the page's. It used to stay there for good and was skipped at
  // every start. Achievements the app cannot write (protected ones) do not keep it there either.
  function realisticGameCompleted(steamID, appid, title) {
    const v = accountData(steamID);
    markCompleted(steamID, appid);
    const before = (v.grQueue || []).length;
    v.grQueue = (v.grQueue || []).filter((id) => +id !== +appid);
    if (v.grQueue.length === before) return;
    writeAccountDataDelayed(steamID);
    log('info', '[' + accountName(steamID) + '] realistic mode: ' + title + ' has nothing left to unlock, taken out of the queue');
    accountEvent(steamID, {
      typeName: 'realisticGameDone', appid, displayName: title,
      feedEntry: { kind: 'card', title: 'Tamamlandı, sıradan çıkarıldı', text: title, status: 'Başarılı' },
    });
    accountBroadcast(steamID)('realistic:queue', { grQueue: v.grQueue.slice(), completed: +appid });
  }
  // The games of an account with nothing left to unlock: the game list of Realistic Mode leaves them out. 1.8.2 only took them out of the queue, the search still
  // offered them. An entry is read again after COMPLETED_RECHECK_MS: a game can get new achievements.
  const COMPLETED_RECHECK_MS = 30 * 24 * 3600 * 1000;
  function markCompleted(steamID, appid) {
    const v = accountData(steamID);
    if (!v.grCompleted || typeof v.grCompleted !== 'object' || Array.isArray(v.grCompleted)) v.grCompleted = {};
    if (v.grCompleted[appid]) return;
    v.grCompleted[appid] = Date.now();
    writeAccountDataDelayed(steamID);
  }
  function completedOf(steamID) {
    const all = (accountData(steamID).grCompleted) || {};
    return Object.keys(all).filter((id) => Date.now() - all[id] < COMPLETED_RECHECK_MS).map(Number);
  }

  async function realisticStep(steamID) {
    const s = accounts.get(steamID);
    const d = s && s.realistic;
    if (!d) return;
    if (!s.engine) { realisticFinish(steamID, 'no connection'); return; }
    // If the connection is down an achievement cannot be sent; it continues when the engine reconnects. The same while a game of the account is open on another
    // device: the run's games are not open then, and opening one to write would take the session from that game.
    if (!s.ready || s.engine.playingBlocked) { d.timer = setTimeout(() => realisticStep(steamID), 30000); return; }
    const a = d.activeIds;
    const goal = a.queueList[a.indexNum];
    if (!goal) {
      // This game's achievements are done. If there is another game in the queue it moves on to it; if not, with "Keep collecting hours when unlocks finish"
      // on, the game stays open until the end of the time (it keeps boosting hours).
      log('info', '[' + accountName(steamID) + '] realistic mode: ' + a.gameTitle + ' achievements done');
      realisticNotify(steamID, { achievementsDone: true });
      if (realisticNextGame(steamID)) return;
      if (d.optionList.continueHours && Date.now() < d.finishTime) {
        d.timer = setTimeout(() => { if (realisticStatus(steamID) === d) realisticFinish(steamID, 'time up'); }, d.finishTime - Date.now());
      } else {
        realisticFinish(steamID, Date.now() >= d.finishTime ? 'time up' : 'all unlocked');
      }
      return;
    }

    // with the games at the same time every item carries its own game
    const goalAppid = goal.appid || a.appid;
    const goalTitle = goal.gameTitle || a.gameTitle;
    try {
      await s.engine.setAchievements(goalAppid, [{ apiName: goal.apiName, unlock: true }]);
      a.openedGames++; d.totalUnlocked++;
      const done = d.preparing && d.preparing[goalAppid];
      if (done && (done.unlockedNow = (done.unlockedNow || 0) + 1) >= (done.suitableTotal || 0)) realisticGameCompleted(steamID, goalAppid, goalTitle);
      log('info', '[' + accountName(steamID) + '] realistic mode: unlocked -> ' + goal.name + ' (%' + (goal.rarityPct != null ? goal.rarityPct.toFixed(1) : '?') + ')' + (a.parallel ? ' in ' + goalTitle : ''));
      accountBroadcast(steamID)('realistic:opened', {
        appid: goalAppid, gameTitle: goalTitle, apiName: goal.apiName,
        name: goal.name, rarityPct: goal.rarityPct,
      });
      const v = accountData(steamID);
      v.achLog.unshift({ appid: goalAppid, game: goalTitle, apiName: goal.apiName, name: goal.name, unlock: true, ts: Date.now() });
      if (v.achLog.length > 2000) v.achLog.length = 2000;
      writeAccountDataDelayed(steamID);
      if (steamID !== ctx.activeSteamID) {
        addFeed(steamID, { kind: 'card', title: 'Başarım açıldı', text: goal.name + ' · ' + goalTitle, status: 'Başarılı' });
      }
    } catch (e) {
      if (s.realistic !== d) return;
      // A write that did not get Steam's answer (the connection dropped under it, a timeout) is not a refusal: the same achievement is sent again, at most
      // three times, instead of being counted as failed and skipped for good (a 60 s drop on a real account lost one that way). While the connection is down it
      // waits for it and that does not count as a try. A refusal (an EResult, a protected achievement) is final.
      const refused = !!(e && (e.protectedFlag || /EResult/.test(String(e.message || ''))));
      const connectionDown = !s.ready || !(s.engine && s.engine.isConnected);
      if (!refused) {
        if (!connectionDown) goal.retries = (goal.retries || 0) + 1;
        if (connectionDown || goal.retries < 3) {
          log('warn', '[' + accountName(steamID) + '] realistic mode: no answer for ' + goal.name + ' (' + (e && e.message) + '), sent again in 30 s', true);
          d.timer = setTimeout(() => realisticStep(steamID), 30000);
          return;
        }
      }
      a.failure++; d.totalErrors++;
      log('warn', '[' + accountName(steamID) + '] realistic mode: could not unlock -> ' + goal.name + ': ' + (e && e.message));
    }
    if (s.realistic !== d) return;          // it was stopped in the meantime
    a.indexNum++;

    // The time is up. Unlocks planned up to the end are still sent, a few seconds apart (with the games at the same time several of them end at the same moment);
    // only what is late by more than that (the connection was down past the end) is left and reported.
    const dueAtEnd = a.queueList.slice(a.indexNum).filter((x) => a.startPoint + (x.timeValue || 0) <= d.finishTime).length;
    if (Date.now() >= d.finishTime + dueAtEnd * 3000 + 5000 && a.indexNum < a.queueList.length) {
      // The time is up but achievements are left - we do not force the rest, we tell the user.
      realisticFinish(steamID, 'time up, ' + (a.queueList.length - a.indexNum) + ' not unlocked');
      return;
    }
    const delay = realisticNextDelay(d);
    d.upNextTime = Date.now() + delay;
    realisticNotify(steamID);
    d.timer = setTimeout(() => realisticStep(steamID), delay);
  }

  // Moves to the next game in the queue. Returns true if the move was made.
  function realisticNextGame(steamID) {
    const s = accounts.get(steamID);
    const d = s && s.realistic;
    if (!d) return false;
    if (d.activeIds && d.activeIds.parallel) return false; // all games of the queue are already running together
    if (!d.optionList.autoOrder) return false;             // "Start the queue automatically" is off
    while (d.gameIndex + 1 < d.gameEntries.length) {
      d.gameIndex++;
      const o = d.gameEntries[d.gameIndex];
      const remainingTime = d.finishTime - Date.now();
      if (remainingTime <= 5000) return false;               // the time is over, there is no point moving on
      const ready = d.preparing[o.appid];
      if (!ready) continue;
      // A game with no achievements left to unlock does not wait in line: this page only unlocks achievements,
      // the Hour Booster exists for boosting hours. There used to be a three option setting here
      // (collect hours / skip / stop the queue); none of the three was this page's job.
      if (!ready.queueList.length) { log('info', 'realistic mode: ' + o.name + ' skipped (no achievement to unlock)'); continue; }
      // We divide the remaining time among the remaining games according to their achievement count.
      const remainingGames = d.gameEntries.slice(d.gameIndex);
      const remainingTotalCount = remainingGames.reduce((t, x) => t + ((d.preparing[x.appid] || { queueList: [] }).queueList.length || 1), 0);
      const thisCount = ready.queueList.length || 1;
      const share = Math.max(60000, Math.round(remainingTime * (thisCount / remainingTotalCount)));
      const currentTime = Date.now();
      d.activeIds = {
        appid: o.appid, gameTitle: o.name,
        queueList: placeRealisticTimes(ready.queueList, share, d.optionList.model,
                                           computeRealisticAccum(o.appid, ready, d.optionList),
                                           realisticTimeSetting(o.appid, d.optionList)),
        indexNum: 0, openedGames: 0, failure: 0, startPoint: currentTime, finishTime: currentTime + share,
      };
      try { s.engine.play([o.appid], 'realistic'); } catch (_) {}
      log('info', '[' + accountName(steamID) + '] realistic mode: next ' + o.name + ' (' + ready.queueList.length + ' achievements, '
        + (share / 60000).toFixed(0) + ' min)');
      const delay = ready.queueList.length ? realisticNextDelay(d) : Math.max(0, d.activeIds.finishTime - Date.now());
      d.upNextTime = Date.now() + delay;
      realisticNotify(steamID, { gameChanged: true });
      d.timer = setTimeout(() => { if (realisticStatus(steamID) === d) realisticStep(steamID); }, delay);
      return true;
    }
    return false;
  }

  // The end reason is shown in the interface; the text is translated in the dictionary (the key is this Turkish text).
  const REALISTIC_REASON = {
    'time up': 'Süre doldu', 'all unlocked': 'Tüm başarımlar açıldı',
    'user stopped': 'Durduruldu', 'no connection': 'Steam bağlantısı yok',
    'schedule': 'Zamanlayıcı aralığı bitti',
  };
  function realisticFinish(steamID, cause) {
    const s = accounts.get(steamID);
    const d = s && s.realistic;
    if (!d) return;
    const remainingUnopened = /^time up, (\d+) not unlocked/.exec(cause || '');
    // The text is translated in the interface; its version that carries a number is a '#' pattern key in the dictionary.
    const reasonText = remainingUnopened ? 'Süre doldu, # başarım açılmadı'.replace('#', remainingUnopened[1]) : (REALISTIC_REASON[cause] || cause);
    const summary = { openedGames: d.totalUnlocked, failure: d.totalErrors, totalSum: d.totalGoal, cause: reasonText };
    try { if (s.engine) s.engine.stop('realistic'); } catch (_) {}
    realisticClear(steamID);
    log('info', '[' + accountName(steamID) + '] realistic mode done: ' + cause + ' (' + summary.openedGames + '/' + summary.totalSum + ')');
    accountBroadcast(steamID)('realistic:tick', Object.assign({ runningFlag: false, isFinished: true }, summary));
    if (steamID !== ctx.activeSteamID) {
      addFeed(steamID, { kind: summary.failure ? 'error' : 'card', title: 'Gerçekçi Mod',
        text: reasonText + ' · ' + summary.openedGames + ' / ' + summary.totalSum, status: summary.failure ? 'Hata' : 'Başarılı' });
    }
    resumeFarm(steamID);
  }

  // Prepares a game's unlockable achievement queue (ordering + trimming).
  // FROM COMMON TO RARE: a LARGER rarityPct means more common, that one is unlocked first.
  // ---- LEDGER OF GAMES WITHOUT ACHIEVEMENTS ----
  // Realistic Mode only unlocks achievements. A game with no achievements has nothing to do on this page:
  // there are separate pages for boosting hours, skipping or stopping the queue. The hasStats flag on Steam's
  // library endpoint is not reliable - some games return true and give no schema.
  // Only the schema request tells the truth, and that takes seconds. So a result learned once
  // is written to disk and that game never shows up in this page's list again.
  // BY APPID and independent of the account: achievements are a property of the game, not of the account.
  const NO_ACHIEVEMENTS_FILE = path.join(CACHE_DIR, 'no-achievements.json');
  let noAchievementsSet = new Set();
  function loadNoAchievements() {
    const r = readJson(NO_ACHIEVEMENTS_FILE);
    const listing = (r.ok && r.dataBlock && Array.isArray(r.dataBlock.appids)) ? r.dataBlock.appids : [];
    noAchievementsSet = new Set(listing.map((x) => +x).filter(Boolean));
  }
  function saveNoAchievements() {
    writeJson(NO_ACHIEVEMENTS_FILE, { appids: [...noAchievementsSet], upToDate: Date.now() }, false);
  }
  function markNoAchievements(appid) {
    const id = +appid;
    if (!id || noAchievementsSet.has(id)) return false;
    noAchievementsSet.add(id);
    saveNoAchievements();
    log('info', 'realistic mode: ' + id + ' marked as having no achievements, dropped from the list');
    return true;
  }
  loadNoAchievements();
  // The global unlock percentages Realistic Mode orders its queue by are kept for a day in a file of their own (src/core/rarityCache.js)
  require('../core/rarityCache').setFile(path.join(CACHE_DIR, 'achievement-rarity.json'));

  ipcMain.handle('realistic:noAchievementsList', () => ({ ok: true, appids: [...noAchievementsSet] }));
  ipcMain.handle('realistic:completedList', () => ({ ok: true, appids: ctx.activeSteamID ? completedOf(ctx.activeSteamID) : [] }));
  // The games the search shows that were never read: their achievements are read (over the Steam connection, not the market quota; the engine keeps the schema
  // for five minutes) and the finished ones are remembered, so the list drops them. At most 40 at a time, the number the search shows.
  let completedCheckBusy = false;
  ipcMain.handle('realistic:checkCompleted', async (_e, appids) => {
    if (!ctx.engineReady || !ctx.engine || !ctx.activeSteamID) return { ok: false, error: 'Bağlı değil.' };
    if (completedCheckBusy) return { ok: false, busy: true };
    completedCheckBusy = true;
    const who = ctx.activeSteamID, eng = ctx.engine;
    const known = new Set(completedOf(who));
    const finished = [];
    try {
      for (const id of (Array.isArray(appids) ? appids : []).map(Number).filter((x) => x > 0 && !known.has(x)).slice(0, 40)) {
        if (ctx.activeSteamID !== who) break;
        try {
          const data = await eng.getAchievements(id);
          const list = (data && data.achievements) || [];
          if (list.length && !list.some((a) => !a.achieved && !a.protectedFlag)) { markCompleted(who, id); finished.push(id); }
        } catch (_) {}
      }
    } finally { completedCheckBusy = false; }
    return { ok: true, completed: finished };
  });
  ipcMain.handle('realistic:noAchievementsClear', () => {
    const n = noAchievementsSet.size;
    noAchievementsSet = new Set();
    saveNoAchievements();
    log('info', 'realistic mode: the no-achievement list was cleared (' + n + ' games)');
    return { ok: true, deleted: n };
  });

  // The engine's achievement call gives no game name; the library list of the account that owns the engine does.
  function ownedGameName(eng, appid) {
    for (const [id, s] of accounts) {
      if (s.engine !== eng) continue;
      const owned = (accountData(id).lists || {}).owned;
      const g = Array.isArray(owned) ? owned.find((x) => +x.appid === +appid) : null;
      return g && g.name ? g.name : null;
    }
    return null;
  }

  async function prepareRealisticQueue(eng, appid, options) {
    const data = await eng.getAchievements(appid);
    const everything = (data && Array.isArray(data.achievements)) ? data.achievements : null;
    if (!everything || !everything.length) {
      markNoAchievements(appid);
      return { ok: false, noAchievements: true, error: 'Bu oyunun başarımı yok.', gameTitle: (data && data.gameName) || null };
    }
    // The order of the queue is the point of Realistic Mode (from the most common achievement to the rarest). If the percentages could not be read and nothing from an earlier
    // read is kept (rarityOk false) the run still starts: the order falls back to the schema order with the hidden achievements last (usually the end of the story and the
    // grind), and the interface says so. It used to be refused, which left the user with nothing.
    const rarityMissing = data.rarityOk === false;
    if (rarityMissing) log('warn', 'realistic mode: the rarity percentages of ' + appid + ' could not be read, the order is a guess (hidden achievements last)');
    // Rarity is a proportion of the game's OWN achievements (place in the list from the most common), see realisticPlan.js; the place is worked out on the whole list so it
    // does not change while achievements are being unlocked
    const places = rarityPositions(everything);
    everything.forEach((a) => { a.pos = places.has(a.apiName) ? places.get(a.apiName) : null; a.ultra = isUltraRare(a.pos); });
    // Locked + not protected. Protected ones are rejected by Steam (see G4).
    let suitable = everything.filter((a) => !a.achieved && !a.protectedFlag);
    const protected = everything.filter((a) => !a.achieved && a.protectedFlag).length;
    // "Skip ultra rare achievements": the grind of a completionist, under 5% of the players who started
    let ultraSkipped = 0;
    if (options.ultraRareSkip) {
      const earlier = suitable.length;
      suitable = suitable.filter((a) => !a.ultra);
      ultraSkipped = earlier - suitable.length;
    }
    // Known percentages from the highest to the lowest (compared on one decimal, as shown, so a group that reads the same keeps the schema order and the preview and the run
    // agree); unknown ones after them, the hidden ones last of all. The sort is stable.
    const weightOf = (x) => (Number.isFinite(x.rarityPct) ? Math.round(x.rarityPct * 10) / 10 : (x.isHidden ? -2 : -1));
    suitable.sort((x, y) => weightOf(y) - weightOf(x));
    // Target count: trimmed from the start (the most common).
    const goal = +options.goalValue || 0;
    const clipped = (goal > 0 && goal < suitable.length) ? suitable.slice(0, goal) : suitable;
    return {
      ok: true,
      gameTitle: data.gameName || ownedGameName(eng, appid) || ('App ' + appid),
      queueList: clipped.map((a) => ({ apiName: a.apiName, name: a.name, rarityPct: a.rarityPct, pos: a.pos, ultra: a.ultra })),
      rarityMissing,
      suitableTotal: suitable.length,
      protectedFlag: protected,
      ultraSkipped: ultraSkipped,
      totalAchievements: everything.length,
      unlockedState: everything.filter((a) => a.achieved).length,
    };
  }

  // The completed form of the incoming options. Even if the interface sends them incomplete the engine works consistently.
  function realisticOptions(s) {
    const g = s || {};
    return {
      goalValue: Math.max(0, +g.goalValue || 0),                       // 0 = all
      goalAuto: !!g.goalAuto,                                          // the target is worked out here (planGames), goalValue is then ignored
      autoSpan: !!g.autoSpan,                                          // the duration is worked out here too: as long as the unlocks take a real player
      // what is left of the target of each game when a run is resumed after a restart (src/core/resumeJobs.js); it wins over goalAuto and goalValue
      goalByGame: Object.fromEntries(Object.entries((g.goalByGame && typeof g.goalByGame === 'object') ? g.goalByGame : {})
        .map(([k, v]) => [k, Math.max(0, Math.min(100000, Math.floor(+v || 0)))]).filter(([k]) => /^\d+$/.test(k))),
      tcByGame: Object.fromEntries(Object.entries((g.tcByGame && typeof g.tcByGame === 'object') ? g.tcByGame : {})
        .map(([k, v]) => [k, Math.max(0, Math.min(20000, +v || 0))]).filter(([k, v]) => /^\d+$/.test(k) && v > 0)),
      model: ['linear', 'exp', 'pareto'].includes(g.model) ? g.model : 'linear',
      randomInterval: g.randomInterval !== false,
      ultraRareSkip: !!g.ultraRareSkip,
      autoOrder: g.autoOrder !== false,
      // the games of the queue at the same time (like the Hour Booster), each over the whole run; off: one after the other. On unless it was switched off, so a run
      // saved by an older version (schedule, resume) is read the way the page now starts one
      parallel: g.parallel !== false,
      continueHours: g.continueHours !== false,
      // Squeeze the overdue achievement backlog into the start of the session. The size of the backlog depends on the game's
      // PLAYTIME: a few in a 1 hour game, far more in a 100 hour one.
      // Tc and the difficulty come from the interface (they are already computed there).
      accelerateDelayed: !!g.accelerateDelayed,
      speedMultiplier: Math.max(0.1, Math.min(4, +g.speedMultiplier || 1)),
      ultraMultiplier: Math.max(1, Math.min(10, +g.ultraMultiplier || 3)),
      compensationShare: Math.max(0.02, Math.min(0.9, +g.compensationShare || 0.2)),
      finishedRatio: Math.max(0.05, Math.min(1, +g.finishedRatio || 0.5)),
      tcHours: Math.max(1, +g.tcHours || 0) || 20,
      difficultyValue: Math.max(0.1, +g.difficultyValue || 0) || 1,
      // set only by a run that was started with the automatic duration and is now being resumed (resumeJobs keeps the options): its duration already is the time the unlocks take,
      // so the "finished game" compression must not be laid on it a second time
      autoSpanApplied: !!g.autoSpanApplied,
      playtime: (g.playtime && typeof g.playtime === 'object') ? g.playtime : {},
    };
  }

  // Prepares every game of a queue and plans them together: the duration and the share of each game depend on all of them.
  // The lists come back whole (prepareRealisticQueue is called without a target); planGames trims them.
  async function realisticPrepareAll(eng, listing, pick, givenSpanMs, autoSpanAllowed) {
    const entries = [];
    const dropped = {};
    for (const id of listing) {
      const h = await prepareRealisticQueue(eng, id, Object.assign({}, pick, { goalValue: 0 }));
      if (!h.ok) { dropped[id] = h; continue; }
      entries.push({ appid: id, h });
    }
    return Object.assign(planGames(entries, pick, givenSpanMs, autoSpanAllowed), { dropped });
  }

  // Preview: how many achievements, in what order, at which minute they will unlock.
  // If durationMs is not given the hours field is used (the old call form works too). queueIds is the whole queue: the first game's list is
  // what comes back, but its share of the run and the automatic duration depend on the other games too.
  ipcMain.handle('realistic:plan', async (_e, arg) => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    const { appid, hours: hour, spanMs: durationMs } = arg || {};
    const pick = realisticOptions(arg && arg.optionList);
    const given = Math.max(60000, +durationMs || (Math.max(1, +hour || 1) * 3600000));
    const queueIds = (Array.isArray(arg && arg.queueIds) ? arg.queueIds.map((x) => +x) : []).filter(Boolean);
    if (!queueIds.includes(+appid)) queueIds.unshift(+appid);
    try {
      const built = await realisticPrepareAll(ctx.engine, queueIds, pick, given, true);
      // the plan reads every game of the queue: one with nothing left to unlock leaves it now, not only when a run starts
      built.games.filter((g) => !g.h.suitableTotal).forEach((g) => realisticGameCompleted(ctx.activeSteamID, g.appid, g.h.gameTitle));
      const head = built.games.find((g) => g.appid === +appid);
      if (!head) return built.dropped[appid] || { ok: false, error: 'Plan alınamadı' };
      pick.autoSpanApplied = built.auto;
      const totalCount = built.games.reduce((t, g) => t + (g.queueList.length || 1), 0);
      const share = Math.max(60000, Math.round(built.spanMs * ((head.queueList.length || 1) / totalCount)));
      const accumulation = computeRealisticAccum(appid, head.h, pick);
      const timing = realisticTimeSetting(appid, pick);
      placeRealisticTimes(head.queueList, share, pick.model, accumulation, timing);
      // What the settings really make of the run, measured on the placed times: a finished game or a squeezed backlog ends its unlocks long before the whole duration
      // the games at the same time: the preview is the merged timeline of all of them over the whole run, the one the engine runs
      const together = built.parallel ? built.games.filter((g) => g.queueList.length) : null;
      const shown = together && together.length > 1
        ? mergeParallel(together.map((g) => ({ appid: g.appid, gameTitle: g.h.gameTitle, queueList: g.queueList, slotStart: g.slotStart, slotMs: g.slotMs, paced: g.paced,
            accumulation: computeRealisticAccum(g.appid, g.h, pick), timing: realisticTimeSetting(g.appid, pick) })), built.spanMs, pick.model)
        : head.queueList;
      const shownShare = shown === head.queueList ? share : built.spanMs;
      const times = shown.map((a) => a.timeValue);
      const unlockWindowMs = times.length ? Math.max(...times) : 0;
      const firstUnlockMs = times.length ? Math.min(...times) : 0;
      return {
        ok: true,
        parallel: shown !== head.queueList,
        suitableQueue: built.games.reduce((t, g) => t + (g.h.suitableTotal || 0), 0),   // all unlockable ones of the queue (the target box when the games run together)
        firstUnlockMs,                            // when the first unlock comes
        unlockWindowMs,                           // when the last one comes: all unlocks are done by then
        unlockRatio: shownShare > 0 ? Math.min(1, unlockWindowMs / shownShare) : 1,   // that, as a part of this game's share of the run (1 = the unlocks use all of it)
        finishedFlag: !!timing.finishedFlag,      // the playtime has already passed the completion time
        // The interface shows this as an "N achievements overdue" note.
        accumulation: Math.min(accumulation, head.queueList.length),
        appid: +appid,
        gameTitle: head.h.gameTitle,
        totalSum: shown.length,                   // to be unlocked (the target applied); all games of the queue when they run together
        suitableTotal: head.h.suitableTotal,      // all of the unlockable ones
        totalAchievements: head.h.totalAchievements,
        unlockedState: head.h.unlockedState,
        protectedFlag: head.h.protectedFlag,
        ultraSkipped: head.h.ultraSkipped,
        rarityMissing: !!head.h.rarityMissing,
        spanMs: built.spanMs,                   // the whole run (all games), the automatic one if autoSpan
        autoSpan: built.auto,
        queueTotal: built.games.reduce((t, g) => t + g.queueList.length, 0),
        model: pick.model,
        averageIntervalMs: shown.length ? Math.round(unlockWindowMs / shown.length) : 0,
        // the games at the same time: the figures of every game, so a click on another game of the queue shows its own without asking for the whole plan again
        perGame: shown === head.queueList ? null : Object.fromEntries(built.games.map((g) => [g.appid, {
          appid: g.appid, gameTitle: g.h.gameTitle, suitableTotal: g.h.suitableTotal, totalAchievements: g.h.totalAchievements, unlockedState: g.h.unlockedState,
          protectedFlag: g.h.protectedFlag, ultraSkipped: g.h.ultraSkipped, rarityMissing: !!g.h.rarityMissing,
          accumulation: Math.min(computeRealisticAccum(g.appid, g.h, pick), g.queueList.length), finishedFlag: !!realisticTimeSetting(g.appid, pick).finishedFlag,
        }])),
        // Full list: the interface draws the "Unlock order" table from this.
        queueList: shown.map((a) => ({ name: a.name, rarityPct: a.rarityPct, pos: a.pos, timeValue: a.timeValue, gameTitle: a.gameTitle || null, appid: a.appid || null })),
      };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Start. gameEntries: [appid, ...] - the queue. A single game goes through the same path.
  async function realisticStartFor(steamID, arg, fromSchedule) {
    const s = accounts.get(steamID);
    if (!s || !s.ready || !s.engine) return { ok: false, error: 'Bağlı değil.' };
    if (s.realistic) return { ok: false, error: 'Zaten çalışıyor.' };
    const eng = s.engine;
    const { appid, hours: hour, spanMs: durationMs } = arg || {};
    const pick = realisticOptions(arg && arg.optionList);
    const givenSpan = Math.max(60000, +durationMs || (Math.max(1, +hour || 1) * 3600000));
    const listing = (Array.isArray(arg && arg.gameEntries) && arg.gameEntries.length)
      ? arg.gameEntries.map((x) => +x)
      : [+appid];
    if (!listing.length || !listing[0]) return { ok: false, error: 'Oyun seçilmedi.' };
    try {
      // The queues of ALL games are prepared FIRST: sharing the time can only be done right once every game's
      // achievement count is known, and the error is seen before the first game starts.
      // A game that turned out to have no achievements was written to the ledger and is silently dropped - the interface will
      // remove it from the list anyway, there is no point stopping the queue or boosting hours.
      // A run the schedule starts keeps the span it was given (it has to fit what is left of its time range); any other run may get the
      // automatic duration.
      const plan = await realisticPrepareAll(eng, listing, pick, givenSpan, !fromSchedule);
      const duration = plan.spanMs;
      pick.autoSpanApplied = plan.auto || pick.autoSpanApplied;
      const prepared = {};
      const gameList = [];
      plan.games.forEach((g) => {
        prepared[g.appid] = Object.assign({}, g.h, { queueList: g.queueList, slotStart: g.slotStart, slotMs: g.slotMs, paced: g.paced });
        gameList.push({ appid: g.appid, name: g.h.gameTitle });
      });
      if (!gameList.length) return { ok: false, error: 'Seçilen oyunların başarım şeması okunamadı.' };

      // A game with no locked achievement left to unlock does not run, and leaves the saved queue too.
      gameList.filter((o) => !prepared[o.appid].suitableTotal).forEach((o) => realisticGameCompleted(steamID, o.appid, o.name));
      const willRun = gameList.filter((o) => prepared[o.appid].queueList.length);
      if (!willRun.length) return { ok: false, error: 'Seçilen oyunlarda açılabilecek kilitli başarım yok.' };

      const totalTarget = willRun.reduce((t, o) => t + prepared[o.appid].queueList.length, 0);
      const totalCount = willRun.reduce((t, o) => t + (prepared[o.appid].queueList.length || 1), 0);

      // If another start came in during preparation a second job is not opened.
      if (s.realistic) return { ok: false, error: 'Zaten çalışıyor.' };
      // If it runs at the same time as card farming both write the same game list; so they do not clash.
      if (settingFor(steamID, 'pauseFarmOnBoost')) delayFarm(steamID, 'realistic mode');

      const firstGame = willRun[0];
      const firstReady = prepared[firstGame.appid];
      // the games at the same time: in groups of at most TOGETHER_MAX, the first group is opened now (realisticPlayGroup)
      const parallel = !!plan.parallel && willRun.length > 1;
      const groups = parallel ? plan.groups.map((g) => Object.assign({}, g, { appids: g.appids.filter((id) => willRun.some((o) => o.appid === id)) })).filter((g) => g.appids.length) : [];
      const firstShare = parallel ? duration : Math.max(60000, Math.round(duration * ((firstReady.queueList.length || 1) / totalCount)));
      const currentTime = Date.now();
      if (!parallel) eng.play([firstGame.appid], 'realistic');
      const d = {
        gameEntries: willRun,
        gameIndex: 0,
        preparing: prepared,
        optionList: pick,
        totalGoal: totalTarget,
        totalUnlocked: 0,
        totalErrors: 0,
        averageIntervalMs: totalTarget ? Math.round(duration / totalTarget) : 0,
        startPoint: currentTime,
        finishTime: currentTime + duration,
        timer: null,
        upNextTime: 0,
        groups, groupIndex: -1, groupTimer: null, playingIds: null,
        activeIds: {
          appid: firstGame.appid, gameTitle: firstGame.name,
          queueList: parallel
            ? mergeParallel(willRun.map((o) => ({ appid: o.appid, gameTitle: o.name, queueList: prepared[o.appid].queueList, slotStart: prepared[o.appid].slotStart, slotMs: prepared[o.appid].slotMs, paced: prepared[o.appid].paced,
                accumulation: computeRealisticAccum(o.appid, prepared[o.appid], pick), timing: realisticTimeSetting(o.appid, pick) })), duration, pick.model)
            : placeRealisticTimes(firstReady.queueList, firstShare, pick.model,
                                             computeRealisticAccum(firstGame.appid, firstReady, pick),
                                             realisticTimeSetting(firstGame.appid, pick)),
          indexNum: 0, openedGames: 0, failure: 0,
          startPoint: currentTime, finishTime: currentTime + firstShare,
          parallel,
        },
      };
      // the average gap is measured on the unlock times that were really placed (a finished game ends its unlocks early), as the preview does
      const placedEnd = Math.max(...d.activeIds.queueList.map((x) => x.timeValue || 0), 0);
      d.averageIntervalMs = totalTarget && firstShare > 0 ? Math.round(duration * Math.min(1, placedEnd / firstShare) / totalTarget) : d.averageIntervalMs;
      s.realistic = d;
      realisticPlayGroup(steamID, d);
      // what the schedule repeats: the setup of the last start made by hand
      if (!fromSchedule) {
        accountData(steamID).grLastRun = { gameEntries: listing, spanMs: duration, optionList: (arg && arg.optionList) || null };
        writeAccountDataDelayed(steamID);
      }
      log('info', '[' + accountName(steamID) + '] realistic mode started: ' + willRun.length + ' games, ' + totalTarget + ' achievements, '
        + (duration / 3600000).toFixed(2) + ' hours, model=' + pick.model);
      // The first unlock is not immediate - it is not realistic for an achievement to come the moment the game opens.
      const initial = firstReady.queueList.length
        ? realisticNextDelay(d)
        : Math.max(0, d.activeIds.finishTime - Date.now());
      d.upNextTime = Date.now() + initial;
      realisticNotify(steamID);
      d.timer = setTimeout(() => { if (realisticStatus(steamID) === d) realisticStep(steamID); }, initial);
      return { ok: true, totalSum: totalTarget, gameCount: willRun.length, gameTitle: firstGame.name, rarityMissing: plan.games.some((g) => g.h.rarityMissing) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  ipcMain.handle('realistic:start', (_e, arg) => realisticStartFor(ctx.activeSteamID, arg, false));

  ipcMain.on('realistic:stop', () => { if (realisticStatus(ctx.activeSteamID)) realisticFinish(ctx.activeSteamID, 'user stopped'); });

  ipcMain.on('engine:boostStart', (_e, { appids, durationMs, games, allItems: allOfIt }) => {
    if (!ctx.activeSteamID) return;
    const s = accounts.get(ctx.activeSteamID);
    if (s) ctx.cancelSettingWaits(s, 'boost');
    boostStart(ctx.activeSteamID, { appids, durationMs, games, allItems: allOfIt });
  });
  ipcMain.on('engine:boostStop', () => {
    if (!ctx.activeSteamID) return;
    // When a setting is applied a paused job must not come back a few seconds later after the user stopped it
    const s = accounts.get(ctx.activeSteamID);
    if (s) ctx.cancelSettingWaits(s, 'boost');
    boostFinish(ctx.activeSteamID, 'user');
  });

  // Sync preview: shows how many steps and how long are needed before starting.
  ipcMain.handle('engine:boostSyncPlan', async (_e, { games, mode, targetHours }) => {
    if (!Array.isArray(games) || !games.length) return { ok: false, error: 'Oyun seçilmedi.' };
    let targetMin;
    if (mode === 'manual') targetMin = Math.max(0, Math.round((+targetHours || 0) * 60));
    else if (mode === 'library') {
      if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
      try {
        const owned = await ctx.engine.getOwnedGames();
        targetMin = owned.reduce((m, g) => Math.max(m, g.playtimeForever || 0), 0);
        // the highest playtime of THIS account's library: kept with the account
        if (ctx.activeSteamID) { activeAccountData().jobSettings.boostSyncLibraryMaxMin = targetMin; writeAccountDataDelayed(ctx.activeSteamID); }
        else { ctx.settings.boostSyncLibraryMaxMin = targetMin; saveSettings(); }
      } catch (e) { return { ok: false, error: e.message }; }
    } else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

    const behind = games.filter((g) => (g.playtimeMin || 0) < targetMin);
    const strategy = settingFor(ctx.activeSteamID, 'boostSyncStrategy') || 'parallel';

    if (strategy === 'parallel') {
      const limit = SYNC_MAX_GAMES;
      const sim = simulateSync(games, targetMin, limit);
      // Also give when each game will finish: the user will see the plan and confirm it.
      const finishes = [];
      const remaining = new Map(behind.map((g) => [g.appid, (targetMin - (g.playtimeMin || 0)) * 60000]));
      let t = 0;
      for (const as of sim.stages) {
        t += as.spanMs;
        as.ids.forEach((id) => {
          const k = remaining.get(id);
          if (k == null) return;
          const newItem = k - as.spanMs;
          if (newItem <= 0) { finishes.push({ appid: id, finishMs: t }); remaining.delete(id); }
          else remaining.set(id, newItem);
        });
      }
      return {
        ok: true, strategyName: 'parallel', targetMin, totalMs: sim.totalMillis, limit,
        behind: behind.length,
        stageCount: sim.stages.length,
        firstActive: Math.min(behind.length, limit),
        finishTimes: finishes.sort((a, b) => a.finishMs - b.finishMs).map((x) => {
          const g = games.find((y) => y.appid === x.appid);
          return { appid: x.appid, name: (g && g.name) || ('App ' + x.appid), finishMs: x.finishMs };
        }),
        steps: [],
      };
    }

    const steps = buildSyncSteps(games, targetMin);
    const totalMs = steps.reduce((s, st) => s + (st.toMin - st.fromMin) * 60000, 0);
    return {
      ok: true, strategyName: 'staged', targetMin, totalMs,
      steps: steps.map((st) => ({ count: st.ids.length, ids: st.ids, fromMin: st.fromMin, toMin: st.toMin })),
      behind: behind.length,
    };
  });

  ipcMain.on('engine:boostStartSeq', (_e, { games, durationMs, loop }) => {
    if (!ctx.activeSteamID) return;
    startSequential(ctx.activeSteamID, { games, durationMs, loop });
  });
  ipcMain.on('engine:boostStopSeq', () => {
    const s = accounts.get(ctx.activeSteamID);
    if (s && s.hoursFarm && s.hoursFarm.running) s.hoursFarm.stop('user');
  });

  ipcMain.on('engine:startFarm', (_e, { mode, games, durationMs }) => {
    if (!ctx.engineReady || !ctx.engine || !ctx.activeSteamID) return;
    // The card threshold was REMOVED: every game with cards left joins the queue. The threshold silently skipped games
    // with a single card left and led to the "why is it not dropping" question.
    const s = slotOf(ctx.activeSteamID);
    s.pendingFarm = null;
    ctx.cancelSettingWaits(s, 'card');
    startCardFarm(ctx.activeSteamID, mode, games || [], durationMs);
  });
  ipcMain.on('engine:stopFarm', () => {
    const s = accounts.get(ctx.activeSteamID);
    if (!s) return;
    s.pendingFarm = null;
    ctx.cancelSettingWaits(s, 'card');
    if (s.farm && s.farm.running) s.farm.stop('user');
  });
  ipcMain.handle('engine:playing', () => (ctx.engineReady && ctx.engine) ? ctx.engine.playing : []);


  return { realisticFinish, realisticStartFor };
};
