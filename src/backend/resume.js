// Moved out of main.js unchanged (resume). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { CONFIG_DIR, accountEvent, accountJobDetail, accountName, accountRunning, accounts, boostStart, ct, fs, log, onPanelPage, path, realisticStartFor, resumeJobs, sendJobStatus, startCardFarm, startSequential, translation, windowOpened, writeJson } = ctx;

  // ---- JOBS THAT SURVIVE A RESTART ----
  // A job that is running when the app ends (the PC is shut down, the app is closed, it crashes) is written to settings/resume.json, and it starts
  // again where it left off when its account connects again (Settings > General > "Resume unfinished jobs"). What is written and how it is read back
  // is in src/core/resumeJobs.js. The file is not part of the account files: it is rewritten every RESUME_SAVE_MS while a job runs, and it holds
  // nothing secret (games, modes, times).
  const RESUME_FILE = path.join(CONFIG_DIR, 'resume.json');
  const RESUME_SAVE_MS = 30000;
  const resumeStore = resumeJobs.createStore({
    file: RESUME_FILE,
    readText: (f) => fs.readFileSync(f, 'utf8'),
    write: (f, o) => writeJson(f, o, false),
    remove: (f) => ['', '.bak', '.tmp'].forEach((x) => { try { fs.unlinkSync(f + x); } catch (_) {} }),
    now: () => Date.now(),
  });
  let resumeSaveTimer = null;
  let resumeEnded = false;      // the app is ending and the last write has been made: what happens while it closes must not change the file
  let resumeWiped = false;      // the setting is off and the file has been removed: it is not removed again every half minute
  function resumeSave(final) {
    if (resumeEnded) return;
    if (ctx.settings.resumeJobs === false) {
      if (!resumeWiped) { resumeStore.clear(); resumeWiped = true; }
      return;
    }
    resumeWiped = false;
    const live = {};
    accounts.forEach((s, id) => { const e = resumeJobs.describeJobs(s, Date.now()); if (e) live[id] = e; });
    resumeStore.save(live);
    if (final) resumeEnded = true;
  }
  function resumeSaveSoon() {
    if (resumeEnded || resumeSaveTimer) return;
    resumeSaveTimer = setTimeout(() => { resumeSaveTimer = null; resumeSave(); }, 1000);
  }
  function resumeStartUp() {
    if (ctx.settings.resumeJobs === false) { resumeStore.clear(); resumeWiped = true; }
    else {
      const ids = resumeStore.load();
      if (ids.length) log('info', 'resume: ' + ids.length + ' account(s) left jobs running last time');
    }
    setInterval(resumeSave, RESUME_SAVE_MS);
  }
  // The page has to be listening before the first tick of a job reaches it: a boost sends one at its start and no more.
  function rendererReady() {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const ready = () => !!ctx.win && !ctx.win.isDestroyed() && onPanelPage() && !ctx.win.webContents.isLoading();
      const check = () => { if (ready() || Date.now() - t0 > 60000) setTimeout(resolve, 2000); else setTimeout(check, 500); };
      windowOpened.then(check);
    });
  }
  // "Hour boosting: Counter-Strike 2" and the like, in the interface language: the resume message names what runs again, not only how many jobs
  const JOB_TITLE = { card: 'Kart Düşürme', hours: 'Saat Yükseltme', realistic: 'Gerçekçi Mod' };
  function resumedText(s) {
    const parts = accountJobDetail(s).map((j) => ct(JOB_TITLE[j.kind] || j.kind) + (j.games.length ? (' (' + j.games.join(', ') + (j.more ? ' +' + j.more : '') + ')') : ''));
    return parts.join(' · ') || '-';
  }
  // The account is connected: what it was doing when the app ended starts again. The entry stays until the account is connected and the page is up, so
  // a connection that is lost in between does not lose it; an account on which the user has started something already is left alone.
  async function resumeAfterConnect(steamID) {
    try {
      if (ctx.settings.resumeJobs === false || !resumeStore.peek(steamID)) return;
      await rendererReady();
      const s = accounts.get(steamID);
      if (!s || !s.ready || !s.engine) return;
      const entry = resumeStore.take(steamID);
      if (!entry) return;
      // The file is rewritten before anything starts: if starting a job were to take the app down, the same job must not be started again at the next
      // start, over and over
      resumeSave();
      if (accountRunning(s) || s.pendingFarm) { log('info', '[' + accountName(steamID) + '] resume: skipped, something is running already'); return; }
      const plan = resumeJobs.buildPlan(entry, Date.now());
      log('info', '[' + accountName(steamID) + '] resume: ' + ['farm', 'boost', 'sequential', 'realistic'].filter((k) => plan[k]).join(', '));
      const result = await resumeJobs.run(plan, {
        startFarm: (f) => (startCardFarm(steamID, f.mode, f.games, f.durationMs, { proceeding: f.location }) ? { ok: true } : { ok: false, error: 'Bağlı değil.' }),
        holdFarm: (f) => { s.pendingFarm = { mode: f.mode, games: f.games, durationMs: f.durationMs, location: f.location }; return { ok: true }; },
        startBoost: (b) => boostStart(steamID, b.request),
        startSequential: (q) => startSequential(steamID, q.request),
        startRealistic: (r) => realisticStartFor(steamID, r.request, true),
        // A boost that synchronises plans its length from the playtimes: they moved while it ran, so they are read again
        refreshBoostGames: async (request) => {
          const owned = await s.engine.getOwnedGames();
          const minutes = new Map(owned.map((g) => [g.appid, g.playtimeForever || 0]));
          [request.games, request.allItems].forEach((list) => (list || []).forEach((g) => { if (minutes.has(g.appid)) g.playtimeMin = minutes.get(g.appid); }));
        },
      });
      result.failed.forEach((x) => log('warn', '[' + accountName(steamID) + '] resume: ' + x.kind + ' did not start' + (x.error ? ': ' + x.error : '')));
      if (result.started.length) {
        accountEvent(steamID, {
          typeName: 'jobsResumed',
          feedEntry: { kind: 'card', title: 'Yarım kalan işler', text: translation.tf('Kaldığı yerden sürdürüldü: #', resumedText(s)), status: 'Çalışıyor' },
          resumed: true,
        });
      } else if (result.failed.length) {
        accountEvent(steamID, {
          typeName: 'jobsResumeFailed',
          feedEntry: { kind: 'card', title: 'Yarım kalan işler', text: 'Yarım kalan iş sürdürülemedi.', status: 'Uyarı' },
        });
      }
      resumeSaveSoon();
      if (steamID === ctx.activeSteamID) setTimeout(() => sendJobStatus(steamID), 1500);
    } catch (e) { log('warn', 'resume failed: ' + (e && e.message)); }
  }


  return { resumeAfterConnect, resumeSave, resumeSaveSoon, resumeStartUp, resumeStore };
};
