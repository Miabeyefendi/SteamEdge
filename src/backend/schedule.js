// Moved out of main.js unchanged (schedule). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { BrowserWindow, accountData, accountEvent, accountName, accountRunning, accounts, app, applySettings, createWindow, ct, dayKey, dialog, earlyConnect, ensureTray, isSetupConsistent, loadHistoryCache, loadPriceCache, loadSettings, loadState, loadStats, log, logger, powerMonitor, realisticFinish, realisticStartFor, refundableAppIds, reportReadErrors, resumeStartUp, rewriteTokenFiles, settingFor, singleInstance, startCardFarm, startupUpdateCheck, translation } = ctx;

  // ---- CARD FARMING SCHEDULE ----
  // With the schedule on, every connected account starts card farming when the window opens and the farms started this
  // way stop when it closes. A farm the user started by hand is never stopped by the schedule, and an account is
  // started at most once per window: stopping it by hand inside the window keeps it stopped until the next window.
  const SCHEDULE_CHECK_MS = 30000;
  let scheduleTimer = null;
  // Identifies the window the clock is in (the day it opened), or null outside of it.
  // { key, endsInMs } while the clock is inside the range `from` - `to` (hh:mm, may pass midnight), else null.
  function scheduleWindow(now, fromText, toText) {
    const [fh, fm] = String(fromText).split(':').map(Number);
    const [th, tm] = String(toText).split(':').map(Number);
    const f = fh * 60 + (fm || 0), t = th * 60 + (tm || 0);
    if (f === t || [f, t].some(Number.isNaN)) return null;
    const cur = now.getHours() * 60 + now.getMinutes();
    const untilEnd = (minutes) => Math.max(0, minutes * 60000 - now.getSeconds() * 1000);
    if (f < t) return (cur >= f && cur < t) ? { key: dayKey(now.getTime()), endsInMs: untilEnd(t - cur) } : null;
    if (cur >= f) return { key: dayKey(now.getTime()), endsInMs: untilEnd(24 * 60 - cur + t) };
    if (cur < t) return { key: dayKey(now.getTime() - 86400000), endsInMs: untilEnd(t - cur) };
    return null;
  }
  function scheduleWindowKey(now, steamID) {
    const w = scheduleWindow(now, settingFor(steamID, 'farmScheduleFrom') || '22:00', settingFor(steamID, 'farmScheduleTo') || '07:00');
    return w ? w.key : null;
  }
  // The same order the Card farming page uses for a manual start (orderedForMode in cards.js).
  function orderForMode(list, mode, order) {
    const byPlay = (k) => (a, b) => k * ((a.playtimeMin || 0) - (b.playtimeMin || 0));
    if (mode === 'most') return list.slice().sort((a, b) => b.remaining - a.remaining);
    if (mode === 'least') return list.slice().sort((a, b) => a.remaining - b.remaining);
    if (mode === 'leastPlayed') return list.slice().sort(byPlay(1));
    if (mode === 'mostPlayed') return list.slice().sort(byPlay(-1));
    if (mode === 'priority') {
      return list.slice().sort((a, b) => {
        const ia = order.indexOf(a.appid), ib = order.indexOf(b.appid);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      });
    }
    return list;
  }
  async function scheduleStartFarm(steamID) {
    const s = accounts.get(steamID);
    if (!s || !s.engine || !s.ready) return;
    try {
      const games = await s.engine.getDropGames();
      const mins = new Map();
      try { (await s.engine.getOwnedGames()).forEach((o) => mins.set(o.appid, o.playtimeForever || 0)); }
      catch (e) { log('warn', '[' + accountName(steamID) + '] schedule: could not get the playtime: ' + e.message); }
      const saved = (accountData(steamID).entries['cards.queue'] || {}).v || {};
      const acct = accountData(steamID);
      const excluded = new Set(acct.farmExcluded);
      const only = acct.farmWhitelistOnly ? new Set(acct.farmWhitelist) : null;
      const refunds = settingFor(steamID, 'farmSkipRecent') ? await refundableAppIds(steamID, mins) : new Set();
      const list = games.map((g) => ({ ...g, playtimeMin: mins.get(g.appid) || 0 }))
        .filter((g) => !excluded.has(g.appid) && (!only || only.has(g.appid)) && !(settingFor(steamID, 'farmSkipUnplayed') && !(g.playtimeMin > 0)) && !refunds.has(g.appid));
      // the account may have been given another job while the lists were loading
      if (!s.ready || accountRunning(s) || s.pendingFarm) return;
      if (!list.length) { log('info', '[' + accountName(steamID) + '] schedule: no game with cards left'); return; }
      const ordered = orderForMode(list, settingFor(steamID, 'cardPriorityMode'), saved.order || []);
      const durationMs = Math.max(1, +settingFor(steamID, 'farmMaxMinutes') || 5) * 60000;
      if (!startCardFarm(steamID, settingFor(steamID, 'cardPriorityMode'), ordered.map((g) => ({ appid: g.appid, name: g.name, remaining: g.remaining, playtimeMin: g.playtimeMin })), durationMs)) return;
      if (!s.farm || !s.farm.running) return;
      s.scheduleStarted = true;
      log('info', '[' + accountName(steamID) + '] schedule: card farming started (' + ordered.length + ' games)');
      accountEvent(steamID, {
        typeName: 'cardStarted',
        feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Zamanlayıcı kart düşürmeyi başlattı.', status: 'Çalışıyor' },
      });
    } catch (e) { log('warn', '[' + accountName(steamID) + '] schedule: start failed: ' + (e && e.message)); }
  }
  function scheduleTick() {
    cardScheduleTick();
    realisticScheduleTick();
  }
  function cardScheduleTick() {
    // Each account has its own schedule (switch and range, see ACCOUNT_SCOPED_SETTINGS)
    accounts.forEach((s, steamID) => {
      if (!settingFor(steamID, 'farmScheduleEnabled')) {
        // Turning the schedule off leaves a running farm alone
        s.scheduleStarted = false; s.scheduleKey = null;
        return;
      }
      const key = scheduleWindowKey(new Date(), steamID);
      if (!key) {
        if (s.scheduleStarted && s.pendingFarm) s.pendingFarm = null;   // paused for a boost: it must not resume after the window
        if (s.scheduleStarted && s.farm && s.farm.running) {
          s.farm.stop('schedule');
          log('info', '[' + accountName(steamID) + '] schedule: window closed, card farming stopped');
          accountEvent(steamID, {
            typeName: 'cardStopped',
            feedEntry: { kind: 'card', title: 'Kart Düşürme', text: 'Zamanlayıcı aralığı bitti; kart düşürme durduruldu.', status: 'Durdu' },
          });
        }
        s.scheduleStarted = false; s.scheduleKey = null;
        return;
      }
      if (s.scheduleKey === key || !s.ready || !s.engine || s.scheduleBusy) return;
      s.scheduleKey = key;
      // a job already running (started by hand, boosting, Realistic Mode) is not touched and is not the schedule's to stop
      if (accountRunning(s) || s.pendingFarm) return;
      s.scheduleBusy = true;
      scheduleStartFarm(steamID).finally(() => { s.scheduleBusy = false; });
    });
  }

  // Realistic Mode by itself: when its own time range opens, every connected account that has nothing else running starts the
  // setup of its last Realistic Mode start made by hand (games, duration, options); the run is cut to what is left of the range and
  // stopped when the range closes. A run started by hand is never stopped, and an account is started at most once per range.
  function realisticScheduleTick() {
    accounts.forEach((s, steamID) => {
      if (!settingFor(steamID, 'grScheduleEnabled')) {
        s.grScheduleStarted = false; s.grScheduleKey = null;
        return;
      }
      const w = scheduleWindow(new Date(), settingFor(steamID, 'grScheduleFrom') || '22:00', settingFor(steamID, 'grScheduleTo') || '07:00');
      if (!w) {
        if (s.grScheduleStarted && s.realistic) {
          log('info', '[' + accountName(steamID) + '] schedule: window closed, Realistic Mode stopped');
          realisticFinish(steamID, 'schedule');
        }
        s.grScheduleStarted = false; s.grScheduleKey = null;
        return;
      }
      if (s.grScheduleKey === w.key || !s.ready || !s.engine || s.grScheduleBusy) return;
      s.grScheduleKey = w.key;
      // anything already running on the account (by hand, card farming, boosting) is left alone
      if (accountRunning(s) || s.pendingFarm) return;
      const last = accountData(steamID).grLastRun;
      if (!last || !Array.isArray(last.gameEntries) || !last.gameEntries.length) {
        log('info', '[' + accountName(steamID) + '] schedule: no Realistic Mode setup saved yet, start one by hand once');
        accountEvent(steamID, { typeName: 'cardStopped', feedEntry: { kind: 'card', title: 'Gerçekçi Mod', text: 'Zamanlayıcı için kayıtlı bir Gerçekçi Mod ayarı yok; bir kez elle başlat.', status: 'Uyarı' } });
        return;
      }
      s.grScheduleBusy = true;
      const request = { gameEntries: last.gameEntries, spanMs: Math.max(60000, Math.min(+last.spanMs || 3600000, w.endsInMs)), optionList: last.optionList };
      realisticStartFor(steamID, request, true).then((r) => {
        if (r && r.ok) {
          s.grScheduleStarted = true;
          log('info', '[' + accountName(steamID) + '] schedule: Realistic Mode started (' + r.gameCount + ' games)');
          accountEvent(steamID, { typeName: 'realisticStarted', feedEntry: { kind: 'card', title: 'Gerçekçi Mod', text: 'Zamanlayıcı Gerçekçi Modu başlattı.', status: 'Çalışıyor' } });
        } else log('warn', '[' + accountName(steamID) + '] schedule: Realistic Mode did not start: ' + ((r && r.error) || ''));
      }).catch((e) => log('warn', '[' + accountName(steamID) + '] schedule: Realistic Mode failed: ' + (e && e.message))).finally(() => { s.grScheduleBusy = false; });
    });
  }

  // The computer woke up or was unlocked: an account that is not connected tries at once instead of waiting out its backoff (or an attempt made before the
  // sleep). A few seconds first: the network adapter needs them after a wake.
  function nudgeReconnect() {
    setTimeout(() => accounts.forEach((s) => { if (s.engine && !s.ready && s.engine.retryNow) s.engine.retryNow(); }), 5000);
  }

  app.whenReady().then(() => {
    // The second copy: app.quit() above does not stop 'ready', and up to 1.7.9 the whole start ran in it before it ended (a window, the logon of every
    // saved account begun next to the first copy's). Started in the tray, the app is easy to start a second time.
    if (!singleInstance) return;
    const setup = isSetupConsistent();
    try { powerMonitor.on('resume', nudgeReconnect); powerMonitor.on('unlock-screen', nudgeReconnect); } catch (_) {}
    if (!setup.ok) {
      log('error', 'mixed installation: version=' + setup.fileVersion + ' running=' + setup.runningItem);
      // The settings have not loaded yet; the language comes from the early setting read before the window opened.
      translation.pickLang((ctx.earlySettings && ctx.earlySettings.language) || 'en');
      try {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'SteamEdge - ' + ct('kurulum bozuk'),
          message: ct('Bu klasörde iki farklı sürümün dosyaları karışmış'),
          detail: translation.tf('Klasördeki bazı dosyalar eski sürümden kalmış (beklenen #, bulunan #).', setup.runningItem, setup.fileVersion) + '\n\n'
            + ct('Bu genellikle yeni sürüm eski klasörün üzerine çıkarıldığında ve uygulama o sırada açık olduğunda olur: açık program bazı dosyaları kilitler, arşiv onları atlar.') + '\n\n'
            + ct('Çözüm:') + '\n'
            + '  1. ' + ct('SteamEdge tamamen kapalı olsun.') + '\n'
            + '  2. ' + ct('Arşivi boş ve yeni bir klasöre çıkar.') + '\n'
            + '  3. ' + ct('Eski klasördeki settings klasörünü yeni klasöre kopyala.') + '\n\n'
            + ct('settings klasörü ayarlarını ve Steam oturumunu taşır; kopyalarsan hiçbir şey kaybetmezsin.'),
          buttons: [ct('Tamam')],
        });
      } catch (_) {}
      app.quit();
      return;
    }
    loadSettings(); applySettings(); loadStats(); loadState(); loadPriceCache(); loadHistoryCache();
    logger.connection('-', 'started');   // after the settings: the connection log follows the "Log file" switch; it also closes a drop the last run ended in
    resumeStartUp();                  // before the accounts connect: what an earlier run left running is read first
    if (ctx.settings.protectTokens) rewriteTokenFiles();   // a login made while the app was not running may still be plain text
    createWindow(); ensureTray();
    setTimeout(reportReadErrors, 1200);
    startupUpdateCheck();
    earlyConnect();
    scheduleTimer = setInterval(scheduleTick, SCHEDULE_CHECK_MS);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !ctx.settings.closeToTray) app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  return {};
};
