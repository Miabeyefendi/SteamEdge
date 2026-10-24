    // ================= REALISTIC MODE =================
    // The page was taken from the template as is; the job here is to connect this design to real data.
    // Games are put in a queue, over the chosen time the achievements are unlocked FROM COMMON TO RARE.
    // The engine side is in main.js > the "GERCEKCI MOD" section.
    //
    // Calculations (the "Oyun Verisi · HLTB" box in the right panel):
    //   Tc  : the game's 100% time. It can be entered by hand; if not it is estimated from the current time x type multiplier (CR).
    //         This is an ESTIMATE, no external service is asked - we do not make up
    //         HLTB data, we use the number the user entered or the one that comes out of
    //         their own library.
    //   A(t): the number of unlocked achievements expected up to now = total x (t / Tc), corrected
    //         by difficulty. If the real unlocked number is below this it means "behind".
    //   Rate: A(t) / t (achievements per hour).
    let grGames = [], grLoaded = false;
    let grQueue = [];               // [{appid, name, playtimeMin, hasStats}] - selected games
    let grPlan = null;              // plan preview of the active game
    let grStatus = { runningFlag: false };
    let grTimerUI = null;
    let grOpened = [];           // {name, rarityPct, ts} - those unlocked in this session
    let grPresets = [];
    // Games found to have no achievements (appid). The engine learns once and writes to disk;
    // they never show up in this page's list again. This page only unlocks achievements.
    let grNoAchievements = new Set();
    // If the user touched the duration field by hand the automatic assignment does not kick in.
    let grDurationTouched = false;
    let grPlanRequest = 0;            // request counter to prevent race conditions
    // The game on screen. Clicking a game in the list SELECTS it (its achievements, its completion time); the order of the queue stays as it is.
    // Clicking used to move the game to the front, so the order jumped around and with the games at the same time the list showed every game mixed together.
    let grSelectedId = null;
    function grSel(){ return grQueue.find(g=>g.appid===grSelectedId) || grQueue[0] || null; }
    let grStopAsked = false;          // the Stop button was pressed here: the feed line and the "finished" notice of that stop are not written a second time when the engine confirms it

    const GRC = { brand:'#5624B3', ok:'#5FB324', warn:'#B37E24', bad:'#B32453',
                  title:'#DCE2FA', muted:'#8B8F9E', off:'#7F879B', bd:'#2B3345', sub:'#C2AAEE',
                  teal:'#24AEB3' };

    const grEl = (id) => document.getElementById(id);
    const grSet = (id, t) => { const e = grEl(id); if (e) e.textContent = t; };

    // ---- reading/writing settings ----
    function grVal(keyName, defaultVal){
      const v = (typeof appSettings === 'object' && appSettings) ? appSettings[keyName] : undefined;
      return v === undefined ? defaultVal : v;
    }
    async function grSave(patch){
      if (!window.imu.settings) return;
      const s = await window.imu.settings.set(patch).catch(()=>null);
      if (s) appSettings = s;
    }

    // ---- duration ----
    function grDurationMs(){
      const h = Math.max(0, Math.min(999, +grEl('grRH').value || 0));
      const m = Math.max(0, Math.min(59, +grEl('grRM').value || 0));
      const s = Math.max(0, Math.min(59, +grEl('grRS').value || 0));
      return Math.max(60000, ((h * 3600) + (m * 60) + s) * 1000);
    }
    function grWriteDuration(ms){
      const t = Math.max(60, Math.round(ms / 1000));
      const two = (n) => String(n).padStart(2, '0');
      grEl('grRH').value = two(Math.floor(t / 3600));
      grEl('grRM').value = two(Math.floor((t % 3600) / 60));
      grEl('grRS').value = two(t % 60);
    }
    // Duration labels with the units of the interface language (durationUnit, i18n.js)
    function grDurationLabel(ms){
      const sn = Math.round(ms / 1000);
      if (sn < 60) return durationUnit(sn, 'sn');
      const dk = Math.round(sn / 60);
      if (dk < 60) return durationUnit(dk, 'dk');
      const hoursVal = Math.floor(dk / 60), remainingMin = dk % 60;
      return remainingMin ? (durationUnit(hoursVal, 'sa') + ' ' + durationUnit(remainingMin, 'dk')) : durationUnit(hoursVal, 'sa');
    }
    function grIntervalLabel(ms){
      if (!ms) return '-';
      const sn = Math.round(ms / 1000);
      if (sn < 90) return durationUnit(sn, 'sn');
      const dk = Math.round(sn / 60);
      if (dk < 90) return durationUnit(dk, 'dk');
      return durationUnit(localDecimal(dk / 60, 1), 'sa');
    }
    // ms since the start of the session -> "+1 sa 12 dk" format (the time in the Unlock order table)
    function grTimeLabel(ms){
      const sn = Math.round((ms || 0) / 1000);
      const hoursVal = Math.floor(sn / 3600), dk = Math.floor((sn % 3600) / 60);
      if (hoursVal) return '+' + durationUnit(hoursVal, 'sa') + ' ' + durationUnit(String(dk).padStart(2, '0'), 'dk');
      const s = sn % 60;
      return '+' + durationUnit(dk, 'dk') + ' ' + durationUnit(String(s).padStart(2, '0'), 'sn');
    }
    const grWriteHours = (dk) => durationUnit(localDecimal((dk || 0) / 60, 1), 'sa');

    // ---- rarity colour ----
    // The bands are proportions of the game's own achievements in the order of their percentages (pos, from the engine; see realisticPlan.js RARITY_BANDS):
    // very common 20%, common 30%, uncommon 20%, rare 20%, ultra rare 10%. Steam's own client only has "rare", under about 10%. Without pos (an older answer) the raw
    // percentage is read as before.
    function grBand(pct, pos){
      if (Number.isFinite(pos)) return pos < 0.2 ? 0 : pos < 0.5 ? 1 : pos < 0.7 ? 2 : pos < 0.9 ? 3 : 4;
      if (!Number.isFinite(pct)) return -1;
      return pct >= 50 ? 0 : pct >= 25 ? 1 : pct >= 10 ? 2 : pct >= 5 ? 3 : 4;
    }
    function grPctColor(pct, pos){
      const band = grBand(pct, pos);
      return [GRC.muted, GRC.muted, GRC.teal, GRC.sub, GRC.bad][band] || GRC.off;
    }
    function grRarityLabel(pct, pos){
      const band = grBand(pct, pos);
      return ['Çok yaygın', 'Yaygın', 'Az bulunur', 'Nadir', 'Ultra nadir'][band] || 'Bilinmiyor';
    }

    // ---- loading ----
    async function loadRealistic(){
      grPaintToggle();
      grPaintSelect();
      if (!grLoaded){
        grWriteDuration((+grVal('grDurationSec', 7200)) * 1000);
        grEl('grTarget').value = String(+grVal('grTarget', 0) || 0);
      }
      grPaintLevel();
      grPresets = (grVal('grPresets', []) || []).slice();
      grPaintPreset();
      if (grLoaded){ grPaintLibrary(); grPaintAccount(); return; }
      grEl('grSearch').placeholder = t('Steam\'e bağlanılıyor...');
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ grEl('grSearch').placeholder = t('Bağlanılamadı:') + ' ' + t(con.error || ''); return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'Kütüphane okunamadı.' }));
      if (!res.ok){ grEl('grSearch').placeholder = t('Kütüphane okunamadı.'); return; }
      const bs = await window.imu.realistic.noAchievementsList().catch(()=>null);
      if (bs && bs.ok) grNoAchievements = new Set((bs.appids||[]).map(Number));
      grGames = (res.games || []).map(g=>({
        appid: g.appid, name: g.name, playtimeMin: g.playtimeForever || 0, hasStats: !!g.hasStats,
      }));
      grLoaded = true;
      grEl('grSearch').placeholder = 'Oyun ara...';
      // Saved queue: comes from the account file, game names are completed from the library.
      const saved = grVal('grQueue', []) || [];
      grQueue = saved.map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grPaintLibrary();
      if (grQueue.length) grFetchPlan();
      else grPaintAccount();
    }

    // ---- library search ----
    function grSearchable(){
      // Those in the ledger are ALWAYS filtered out: it was learned by trying that they have no achievements.
      // The "Show games without achievements" switch only loosens Steam's unreliable hasStats
      // flag, it does not bring back what was proven.
      const tidy = grGames.filter(g=>!grNoAchievements.has(g.appid));
      return grVal('grShowNoAch', false) ? tidy : tidy.filter(g=>g.hasStats);
    }
    function grPaintSearch(){
      const q = grEl('grSearch').value.trim().toLowerCase();
      const box = grEl('grResultsBox');
      // With nothing typed the starred games are offered; without any the box stays closed
      if (!q && !grSearchable().some(g=>isFavorite(g.appid))){ box.style.display = 'none'; return; }
      const chosen = new Set(grQueue.map(g=>g.appid));
      const found = favoritesFirst(grSearchable().filter(g=>q ? g.name.toLowerCase().includes(q) : isFavorite(g.appid))).slice(0, 40);
      box.style.display = 'flex';
      grEl('grNoResults').style.display = found.length ? 'none' : 'block';
      grEl('grResults').innerHTML = found.map(g=>{
        const inside = chosen.has(g.appid);
        return '<div class="h-s3" data-gradd="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;cursor:pointer">'
          + '<div style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + esc(grWriteHours(g.playtimeMin) + ' · ' + t(g.hasStats ? 'başarım var' : 'başarım yok'))+'</span>'
          + '</div>'
          + favStar(g.appid)
          + '<button class="h-brand" style="width:24px;height:24px;flex-shrink:0;border-radius:12px;border:1px solid '
          + (inside?GRC.brand:'#2B3345')+';background:'+(inside?'#151C28':'#090C12')+';color:'+(inside?GRC.sub:'#8B8F9E')
          + ';font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">'
          + (inside?'✓':'+')+'</button>'
          + '</div>';
      }).join('');
    }
    grEl('grSearch').addEventListener('input', grPaintSearch);
    grEl('grSearch').addEventListener('focus', grPaintSearch);
    grEl('grSearch').addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){ grEl('grSearch').value = ''; grEl('grResultsBox').style.display = 'none'; }
      else if (e.key === 'Enter'){ const f = grEl('grResults').querySelector('[data-gradd]'); if (f) f.click(); }
    });
    // Verify a game that enters the queue IMMEDIATELY. grFetchPlan only reads the schema of the NEXT game;
    // a game without achievements added second in line was not noticed until its turn - that is,
    // hours later. The schema request goes over the protocol, does not spend the market
    // quota; cached for 5 minutes on the engine side.
    async function grValidate(game){
      if (!game) return true;
      const p = await window.imu.realistic.plan(game.appid, grDurationMs(), grOptions())
        .catch(()=>null);
      if (!p || !p.noAchievements) return true;
      grNoAchievements.add(game.appid);
      grQueue = grQueue.filter(x=>x.appid!==game.appid);
      grSaveQueue();
      grPaintLibrary();
      grPaintSearch();
      if (typeof toast === 'function') toast('Gerçekçi Mod').fail(tf('#: başarımı yok, listeden çıkarıldı.', game.name));
      return false;
    }
    grEl('grResults').addEventListener('click', async (e)=>{
      const star = e.target.closest('[data-fav]');
      if (star){ await toggleFavorite(+star.getAttribute('data-fav')); grPaintSearch(); return; }
      const row = e.target.closest('[data-gradd]'); if (!row) return;
      const id = +row.getAttribute('data-gradd');
      const g = grGames.find(x=>x.appid===id);
      if (!g) return;
      const beingRemoved = grQueue.some(x=>x.appid===id);
      if (beingRemoved) grQueue = grQueue.filter(x=>x.appid!==id);
      else grQueue.push(g);
      grSaveQueue();
      grPaintLibrary();
      grPaintSearch();
      // The first in line is already verified with grFetchPlan; the rest here.
      if (!beingRemoved && grQueue[0] && grQueue[0].appid !== id){
        const stayed = await grValidate(g);
        if (!stayed) return;
      }
      grFetchPlan();
    });
    document.addEventListener('click', (e)=>{
      if (!e.target.closest('#grSearch') && !e.target.closest('#grResultsBox')) grEl('grResultsBox').style.display = 'none';
    });

    function grSaveQueue(){ grSave({ grQueue: grQueue.map(g=>g.appid) }); }

    // ---- selected game list ----
    function grPaintLibrary(){
      grSet('grLibCount', grQueue.length + ' oyun');
      const el = grEl('grLibrary');
      if (!grQueue.length){
        el.innerHTML = '<div style="padding:30px 10px;text-align:center;font-size:11px;color:#7F879B;line-height:1.6">'
          + (grLoaded ? 'Yukarıdan oyun ara ve <b style="color:#8B8F9E">+</b> ile sıraya ekle.' : 'Kütüphane yükleniyor…')
          + '</div>';
        return;
      }
      const sel = grSel();
      el.innerHTML = grQueue.map(g=>{
        const on = !!sel && g.appid === sel.appid;
        // a game that is being played now: all of them when the games run together, the current one when they run one after the other
        const playing = !!grStatus.runningFlag && (grStatus.parallel ? true : g.appid === grStatus.appid);
        const achEt = g.hasStats ? 'BAŞARIM' : 'SAAT';
        const achFg = g.hasStats ? GRC.sub : GRC.warn;
        return '<div data-grrow="'+g.appid+'"'+(on ? ' data-grsel="1"' : '')+(playing ? ' data-grplaying="1"' : '')+' style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px solid '
          + (on?GRC.brand:'#1D2432')+';background:'+(on?'#101621':'#0D1118')+';cursor:pointer;margin-bottom:5px" class="h-bd">'
          + '<div style="width:30px;height:30px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:'+(on?GRC.title:'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E">'+esc(grWriteHours(g.playtimeMin))+'</span>'
          + '</div>'
          + (playing ? '<span title="'+esc(t('çalışıyor'))+'" style="width:8px;height:8px;border-radius:50%;background:'+GRC.ok+';box-shadow:0 0 0 3px rgba(95,179,36,.18);flex-shrink:0"></span>' : '')
          + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:'+achFg
          + ';border:1px solid '+achFg+';border-radius:12px;padding:2px 7px;flex-shrink:0">'+achEt+'</span>'
          + '<button data-grdel="'+g.appid+'" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#0D1118;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" class="h-stop">&#8722;</button>'
          + '</div>';
      }).join('');
    }
    grEl('grLibrary').addEventListener('click', (e)=>{
      const remove = e.target.closest('[data-grdel]');
      if (remove){
        if (grStatus.runningFlag){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Çalışırken sıra değiştirilemez.'); return; }
        const id = +remove.getAttribute('data-grdel');
        grQueue = grQueue.filter(x=>x.appid!==id);
        grSaveQueue(); grPaintLibrary(); grFetchPlan();
        return;
      }
      const row = e.target.closest('[data-grrow]');
      if (row){
        // Select the clicked game (also while a run goes): its achievements and its completion time are shown, the order of the queue does not change.
        const id = +row.getAttribute('data-grrow');
        if (id === (grSel() && grSel().appid)) return;
        grSelectedId = id;
        grPaintLibrary(); grPaintAccount(); grPaintList(); grPaintSpeed();
        grFetchPlan();
      }
    });

    // ---- options ----
    // ---- 100% COMPLETION TIME (Tc) ----
    // Kept PER GAME: Cyberpunk 180 hours, a short story game 12 hours. A single
    // general value did not fit the whole library.
    function grTcMap(){ const h = grVal('grTcGame', {}); return (h && typeof h === 'object') ? h : {}; }
    function grTcRead(appid){ return Math.max(0, +grTcMap()[appid] || 0); }
    async function grTcWrite(appid, hour){
      const h = Object.assign({}, grTcMap());
      if (hour > 0) h[appid] = hour; else delete h[appid];
      await grSave({ grTcGame: h });
    }

    // Tc and the difficulty multiplier. grPaintAccount, grOptions and the engine's backlog computation are fed from the same
    // source, otherwise three different numbers come out in three places.
    //
    // NOTE - the structural problem of the estimate: if no value is entered by hand Tc is estimated FROM THE PLAYTIME
    // (played x type multiplier). That means the more you play a game
    // the longer its estimated completion time grows and the fewer achievements the app unlocks.
    // A 180 hour game is read as "so it is 360 hours, you are only halfway".
    // That is why a value entered by hand always takes precedence and the box is now in the simple panel.
    function grTcAndDifficulty(game){
      // "Normal" difficulty (the stored 1.2) is the completion time as entered: 60 hours means 60 hours. It used to add 20% on top, so a game that
      // takes 60 hours showed 72. Easier / harder move it a little from there (see below).
      // The difficulty only nudges the time the player entered: a game whose 100% takes 12 hours does not get done in 4 because the story is easy, and a
      // 300 hour game is not 500 hours because it is hard (someone who needs 500 hours is not the player the entered time describes). Easy, hard and very hard
      // follow curves fitted to HowLongToBeat data (below), normal is 1.
      const crRaw = grVal('grCR', '2.0');
      const cr = crRaw === 'auto' ? 0 : (parseFloat(crRaw) || 2);
      const playedHours = game ? (game.playtimeMin / 60) : 0;
      const manual = (game ? grTcRead(game.appid) : 0) || (parseFloat(grVal('grTc', '')) || 0);
      const estimate = Math.max(2, playedHours * (cr || 2) || (cr || 2) * 5);
      const tcValue = manual > 0 ? manual : estimate;
      // Easy: a fast player. From HowLongToBeat, 47 games from 5 to 435 hours: the "rushed" 100% time is 0.68 of the average 100% time
      // (0.57 to 0.77) and drops a little as the game gets longer, fitted as 0.762 - 0.0191 ln(hours): 12 h -> 8.6, 100 h -> 67, 800 h -> 507.
      // Very hard: a completionist who takes their time. The same 47 games: the "leisure" 100% time is 2.4x the average (median), never below 1.6x;
      // a quarter of the games are under 2.05x. Softened on purpose to the low side of that: 1.9x on a 12 hour game falling to the 1.6x floor at
      // 800 hours (a long game's grind is the part people skip). Hard is halfway in between on a log scale (the square root): 1.38x to 1.26x.
      const easy = Math.max(0.6, Math.min(0.75, 0.762 - 0.0191 * Math.log(Math.max(1, tcValue))));
      const veryHard = Math.max(1.6, Math.min(1.9, 1.9 - 0.3 * Math.log(Math.max(1, tcValue) / 12) / Math.log(800 / 12)));
      const factor = { '0.8': easy, '1.2': 1, '2.0': Math.sqrt(veryHard), '3.5': veryHard }[String(grVal('grDiff', '1.2'))] || 1;
      const difficulty = Math.round(factor * 1000) / 1000;
      return { tcHours: tcValue, difficultyValue: difficulty, manuallyEntered: manual > 0, playedHours: playedHours };
    }
    function grOptions(){
      const { tcHours: tcHours, difficultyValue: difficulty } = grTcAndDifficulty(grSel());
      const playtime = {}, tcByGame = {};
      grQueue.forEach(g=>{ playtime[g.appid] = g.playtimeMin || 0; tcByGame[g.appid] = grTcAndDifficulty(g).tcHours; });
      const auto = !!grVal('grTargetAuto', true);
      return {
        // The target and the duration are worked out by the engine (planGames) from these; what the page shows is what the engine plans.
        goalAuto: auto,
        goalValue: auto ? 0 : Math.max(0, +grEl('grTarget').value || 0),
        autoSpan: !!grVal('grAutoDuration', true) && !grDurationTouched,
        model: grVal('grModel', 'linear'),
        randomInterval: !!grVal('grRandomGap', true),
        ultraRareSkip: !!grVal('grSkipUltraRare', false),
        autoOrder: !!grVal('grAuto', true),
        parallel: !!grVal('grParallel', true),
        continueHours: !!grVal('grKeepHours', true),
        accelerateDelayed: !!grVal('grCatchUp', true),
        speedMultiplier: +grVal('grSpeed', 1) || 1,
        ultraMultiplier: +grVal('grUltraMultiplier', 3) || 3,
        compensationShare: (+grVal('grCatchUpShare', 20) || 20) / 100,
        finishedRatio: (+grVal('grFinishedRatio', 50) || 50) / 100,
        tcHours: tcHours, tcByGame, difficultyValue: difficulty, playtime,
      };
    }

    // ---- plan preview ----
    async function grFetchPlan(){
      const initial = grSel();
      if (!initial){
        grPlan = null;
        grPaintList(); grPaintAccount();
        return;
      }
      const request = ++grPlanRequest;
      grSet('grNextName', t('Başarım şeması okunuyor…'));
      // It is written to textContent: esc() here showed the name as "&amp;".
      grSet('grNextMeta', initial.name);
      const p = await window.imu.realistic.plan(initial.appid, grDurationMs(), grOptions(), grQueue.map(g=>g.appid))
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (request !== grPlanRequest) return;      // there is a newer request, drop this one
      // If reading the schema shows "this game has no achievements" the game is removed from the queue and never
      // enters the list again. We had taken it into the list by looking at the hasStats flag, Steam was wrong.
      if (p && p.noAchievements){
        grNoAchievements.add(initial.appid);
        grQueue = grQueue.filter(x=>x.appid!==initial.appid);
        grSaveQueue();
        grPaintLibrary();
        if (typeof toast === 'function') toast('Gerçekçi Mod').fail(tf('#: başarımı yok, listeden çıkarıldı.', initial.name));
        grPlan = null;
        grFetchPlan();          // continue with the next game
        return;
      }
      grPlan = (p && p.ok) ? p : null;
      // Automatic duration: the engine says how long the whole run takes (the completion time for the achievements it unlocks). It goes into the
      // fields and is remembered, as if it had been typed.
      if (grPlan && grPlan.autoSpan && Math.abs(grPlan.spanMs - grDurationMs()) > 1000){
        grWriteDuration(grPlan.spanMs);
        grSave({ grDurationSec: Math.round(grPlan.spanMs / 1000) });
      }
      if (!grPlan){
        grSet('grNextName', '-');
        grSet('grNextMeta', t((p && p.error) || 'Plan alınamadı'));
      }
      grPaintList(); grPaintAccount();
    }

    // ---- middle panel ----
    function grPaintList(){
      const game = grSel();
      const isRunning = !!grStatus.runningFlag;
      // the achievements of the SELECTED game: with the games at the same time the plan is one merged list of all of them
      const selList = !grPlan || !grPlan.queueList ? [] : (grPlan.parallel && game && grPlan.queueList.some(a=>a.appid) ? grPlan.queueList.filter(a=>a.appid===game.appid) : grPlan.queueList);
      const hasAchievements = selList.length > 0;
      const noAchievements = !!(game && grPlan && !selList.length);

      // Top summary strip
      // Steam's achievement schema sometimes gives no game name and the engine falls back to something like 'App 1091500'.
      // There is no point showing that when we have the real name from the library.
      const runningId = isRunning ? grStatus.appid : null;
      const kutupAd = runningId
        ? ((grGames.find(g=>g.appid===runningId) || {}).name || null)
        : (game ? game.name : null);
      const engineName = isRunning ? grStatus.gameTitle : null;
      const engineValid = engineName && !/^App \d+$/.test(engineName);
      grSet('grGameName', kutupAd || (engineValid ? engineName : null) || engineName || '-');
      const art = grEl('grGameArt');
      const artId = isRunning ? grStatus.appid : (game && game.appid);
      art.innerHTML = artId ? gameThumb(artId) : '';
      const opened = isRunning ? grStatus.openedGames : 0;
      const sumTotal = isRunning ? grStatus.totalSum : (grPlan ? grPlan.totalSum : 0);
      grSet('grOpened', opened + ' / ' + sumTotal);
      grSet('grAvgGap', grIntervalLabel(isRunning ? grStatus.averageIntervalMs : (grPlan ? grPlan.averageIntervalMs : 0)));
      const percent = sumTotal ? Math.round(opened / sumTotal * 100) : 0;
      grSet('grPct', fmtPercent(percent));
      grEl('grPctFill').style.width = percent + '%';

      // Cards of games without achievements
      grEl('grNoAch').style.display = noAchievements ? 'flex' : 'none';
      grEl('grNoAchSummary').style.display = noAchievements ? 'flex' : 'none';
      grEl('grHasAch').style.display = noAchievements ? 'none' : 'flex';
      if (noAchievements){
        // Only games that HAVE achievements but have NO locked achievement left to unlock land here.
        // A game with no achievements at all does not enter the list anyway (grFetchPlan drops it).
        grSet('grFallbackLabel', 'Listeden çıkarılacak');
        grSet('grDurLabel2', grDurationLabel(grDurationMs()));
        grSet('grFallbackNote', grPlan && grPlan.suitableTotal === 0 && grPlan.totalAchievements
          ? tf('Bu oyunun # başarımının hepsi açık ya da oyun sunucusu tarafından korunuyor. Açılacak bir şey kalmadığı için sıraya alınmaz.', grPlan.totalAchievements)
          : t('Steam bu oyun için başarım şeması vermiyor. Sıraya alınmaz.'));
      }

      // Next-in-line card
      if (hasAchievements || isRunning){
        // while the games run together the next unlock can be in any of them: its game is named
        const position = isRunning ? (grStatus.upNext && grStatus.parallel && grStatus.gameTitle ? grStatus.upNext + ' · ' + grStatus.gameTitle : grStatus.upNext) : (selList[0] && selList[0].name);
        const orderPct = isRunning ? grStatus.upNextPct : (selList[0] && selList[0].rarityPct);
        const orderPos = isRunning ? grStatus.upNextPos : (selList[0] && selList[0].pos);
        const rank = isRunning ? (grStatus.openedGames + 1) : 1;
        grSet('grNextName', grStatus.achievementsDone ? t('Başarımlar bitti') : (position || '-'));
        grSet('grNextMeta', grStatus.achievementsDone
          ? t('Süre sonuna kadar saat toplanıyor')
          : tf('yaklaşık # içinde açılacak · sıra: #', grIntervalLabel(isRunning ? grStatus.averageIntervalMs : ((selList[0] && selList[0].timeValue) || grPlan.firstUnlockMs || grPlan.averageIntervalMs)), rank));
        const pctEl = grEl('grNextPct');
        pctEl.textContent = Number.isFinite(orderPct) ? fmtPercent(localDecimal(orderPct, 1)) : '-';
        pctEl.style.color = grPctColor(orderPct, orderPos);
        pctEl.style.borderColor = grPctColor(orderPct, orderPos);
      } else {
        // nothing to unlock in this game: say so, the "reading the schema" line of the request must not stay on screen
        grSet('grNextName', '-');
        grSet('grNextMeta', game && grPlan ? t('Açılacak başarım yok.') : (game ? t('Başarım şeması okunuyor…') : t('Önce soldan bir oyun ekle.')));
        const pctEl = grEl('grNextPct'); if (pctEl){ pctEl.textContent = '-'; pctEl.style.color = '#7F879B'; pctEl.style.borderColor = '#2B3345'; }
      }

      // Unlock order table
      const openedHere = grPlan && grPlan.parallel && game ? grOpened.filter(a=>a.appid===game.appid).length : opened;
      grSet('grOpenedCount', openedHere + ' / ' + (grPlan && grPlan.parallel ? selList.length + openedHere : sumTotal));
      const el = grEl('grList');
      if (!selList.length){
        el.innerHTML = '<div style="padding:36px 0;text-align:center;font-size:12px;color:#7F879B">'
          + (grQueue.length ? 'Açılacak başarım yok.' : 'Soldan oyun ekle, açılma sırası burada görünecek.') + '</div>';
        return;
      }
      const openedNames = new Set(grOpened.map(a=>a.name));
      let html = '';
      let lastLabel = null;
      selList.forEach((a, i)=>{
        // Divider when the rarity changes: the "isDivider" row in the template.
        const et = grRarityLabel(a.rarityPct, a.pos);
        if (et !== lastLabel){
          lastLabel = et;
          html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 2px 6px">'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '<span style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7F879B">'+esc(et)+'</span>'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '</div>';
        }
        const colorVal = grPctColor(a.rarityPct, a.pos);
        const wasOpened = openedNames.has(a.name);
        html += '<div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #101621">'
          + '<span style="width:26px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:11px;color:#7F879B">#'+(i+1)+'</span>'
          + '<div style="width:33px;height:33px;flex-shrink:0;border-radius:11px;border:1px solid '+(wasOpened?GRC.ok:'#2B3345')+';background:#101621;display:flex;align-items:center;justify-content:center">'
          + '<span style="width:10px;height:10px;background:'+(wasOpened?GRC.ok:colorVal)+';transform:rotate(45deg)"></span></div>'
          + '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:'+(wasOpened?GRC.ok:GRC.title)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name||'')+'</span>'
          + '<span style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+colorVal+';border:1px solid '+colorVal+';border-radius:12px;padding:2px 8px;flex-shrink:0">'+esc(grRarityLabel(a.rarityPct, a.pos))+'</span>'
          + '<span style="width:52px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+colorVal+';text-align:right">'
          + (Number.isFinite(a.rarityPct) ? fmtPercent(localDecimal(a.rarityPct, 1)) : '-')+'</span>'
          + '<span style="width:92px;flex-shrink:0;white-space:nowrap;font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E;text-align:right">'
          + (wasOpened ? 'AÇILDI' : grTimeLabel(a.timeValue))+'</span>'
          + '</div>';
      });
      el.innerHTML = html;
    }

    // The plan summary is written from a single template. It used to be four pieces: "2 h" + " within " + "12" +
    // " achievements will unlock"; every language was condemned to Turkish syntax,
    // the English came out "2 h over 12 achievements will unlock".
    function grWritePlanSentence(durationMs, goal){
      const el = grEl('grPlanSentence');
      if (!el) return;
      el.innerHTML = tf('# içinde # başarım açılacak',
        '<span style="font-family:Geist Mono,monospace;color:#C2AAEE">' + esc(grDurationLabel(durationMs)) + '</span>',
        '<span style="font-family:Geist Mono,monospace;font-weight:700;color:#DCE2FA">' + (Number(goal) || 0) + '</span>');
    }

    // When the last unlock of the plan comes. It is shorter than the duration whenever a finished game, a squeezed backlog or the speed setting shortens it;
    // the sentence on the page says this, not the whole duration, so every setting that matters shows.
    // The ratio comes from the first game's share of the run and is applied to the whole duration, so the sentence "N achievements in ..." stays true for every game of the queue.
    function grUnlockWindowMs(durationMs){
      // the run the engine plans: a slower pace makes it longer than the duration field
      const run = (grPlan && grPlan.spanMs > 0) ? grPlan.spanMs : durationMs;
      const r = grPlan && grPlan.unlockRatio;
      return (r > 0 && r < 0.995) ? Math.max(60000, Math.round(run * r)) : run;
    }

    // ---- target + HLTB calculations ----
    function grPaintAccount(){
      const game = grSel();
      grSet('grTcGameName', game ? game.name : '');
      const durationMs = grDurationMs();
      const suitable = grPlan ? (grPlan.suitableTotal || 0) : 0;
      const auto = !!grVal('grTargetAuto', true);

      // with the games at the same time the target is the whole queue's
      grSet('grTargetTotal', String(grPlan && grPlan.parallel ? (grPlan.suitableQueue || suitable) : suitable));

      const crRaw = grVal('grCR', '2.0');
      const { tcHours: tc, difficultyValue: diff, manuallyEntered: manuallyEntered, playedHours: playtimeHours } = grTcAndDifficulty(game);

      // WHAT SHOULD ALREADY HAVE BEEN UNLOCKED at this playtime: the number a real player would have at this hour, minus the one really unlocked.
      // It is only used for the notes below. The target and the duration themselves come from the engine together with the plan (main.js planGames),
      // so the number in the box is the number that runs. (The page used to work out an automatic target of its own and send "all" to the engine.)
      const totalB = grPlan ? (grPlan.totalAchievements || 0) : 0;
      const unlockedB = grPlan ? (grPlan.unlockedState || 0) : 0;
      const denominator = Math.max(0.1, tc * diff);
      const scale = totalB || suitable;
      const expected = scale ? Math.min(scale, scale * (playtimeHours / denominator)) : 0;
      const remainingBehind = Math.max(0, Math.round(expected - unlockedB));
      const planned = grPlan ? (grPlan.totalSum || 0) : 0;
      // The two halves of the target box must look like ONE piece: the same font, the same height, the same colour.
      // It used to be a big white number on the top line and a small grey "/ total" under it.
      const goalColor = auto ? GRC.sub : GRC.title;
      grEl('grTarget').readOnly = auto;
      if (auto) grEl('grTarget').value = String(planned);
      ['grTarget', 'grTargetSep', 'grTargetTotal'].forEach((id)=>{
        const el = grEl(id); if (el) el.style.color = goalColor;
      });
      const goal = auto ? planned : Math.max(0, Math.min(grPlan && grPlan.parallel ? (grPlan.suitableQueue || suitable) : suitable, +grEl('grTarget').value || 0));
      grWritePlanSentence(grUnlockWindowMs(durationMs), (grPlan && grPlan.queueTotal) || goal || planned);

      // Backlog note
      const not = grEl('grCatchUpNote');
      if (not){
        const one = (grPlan && grPlan.accumulation) || 0;
        if (one > 0 && grVal('grCatchUp', true)){
          not.style.display = 'block';
          not.textContent = game
            ? tf('#: # saat oynanmış, # başarım geride kalmış. Geride kalanlar oturumun ilk beşte birinde açılır, sonrası normal ritimde sürer.', game.name, Math.round((game.playtimeMin||0)/60), one)
            : tf('# başarım geride kalmış; oturumun ilk beşte birinde açılır.', one);
        } else not.style.display = 'none';
      }

      // AUTO button and the border of the target box
      const ab = grEl('grAutoTarget');
      ab.style.borderColor = auto ? GRC.brand : '#2B3345';
      ab.style.background = auto ? '#151C28' : '#0D1118';
      ab.style.color = auto ? GRC.sub : GRC.muted;
      grEl('grTargetBox').style.borderColor = auto ? GRC.brand : '#2B3345';

      // Description in the simple panel
      const crLabel = { '1.5':'kısa hikâye oyunu', '2.0':'orta uzunlukta oyun', '2.5':'uzun açık dünya oyunu', '4.0':'bitmeyen sandbox oyunu', 'auto':'elle girilen süre' };
      const diffLabel = { '0.8':'kolay', '1.2':'normal', '2.0':'zor', '3.5':'çok zor' };
      // Make the number checkable: show which value it came from. The sentences are separate
      // templates: a single long concatenation came out fragmented and broken in every language.
      const tcSource = manuallyEntered ? t('girdiğin değer') : tf('# varsayımı', t(crLabel[crRaw] || 'tür tahmini'));
      grSet('grSimpleNote', game
        ? (tf('#: # saat oynanmış. Bitiş süresi # saat kabul edildi (#), zorluk: #.', game.name, Math.round(playtimeHours), Math.round(tc), tcSource, t(diffLabel[String(grVal('grDiff','1.2'))] || '-'))
           + ' ' + tf('Bu kadar oynanmışken # başarım açılmış olmalıydı; açılan #, geride kalan #.', Math.round(expected), unlockedB, remainingBehind)
           + ' ' + tf('# içinde # başarım açılır.', grDurationLabel(grUnlockWindowMs(durationMs)), goal))
        : t('Önce soldan bir oyun ekle.'));

      // Distribution model description
      const modelNote = {
        linear: 'Başarımlar süre boyunca eşit aralıklarla açılır. En sakin görünüm.',
        exp: 'Başta sık, sonra seyrek. Gerçek oyuncu da ilk saatlerde daha çok başarım alır.',
        pareto: 'Başarımların büyük kısmı sürenin ilk beşte birinde açılır. En hızlı, en dikkat çekici.',
      };
      grSet('grModelNote', modelNote[grVal('grModel','linear')] || '-');

      // The two Tc boxes (simple and advanced panel) show the same value.
      const tcValue = game ? grTcRead(game.appid) : 0;
      [grEl('grTcMain'), grEl('grTc')].forEach((el)=>{
        if (!el) return;
        el.placeholder = tc.toFixed(0);
        if (document.activeElement !== el) el.value = tcValue > 0 ? String(tcValue) : '';
      });
      grSet('grPlaytime', game ? durationUnit(localDecimal(playtimeHours, 1), 'sa') : '-');
      // the expected number was computed once above (the first part of the automatic target), it is not
      // recomputed here - so two different numbers do not show in two places.
      const expectedB = Math.round(expected);
      grSet('grExpected', totalB ? (expectedB + ' / ' + totalB) : '-');
      grSet('grPace', playtimeHours > 0 && expectedB ? localDecimal(expectedB / playtimeHours, 1) : '-');
      grSet('grLeft', grPlan ? String(suitable) : '-');
      // How long the remaining achievements will take to unlock in the real game (estimate)
      const remainingHours = (suitable && totalB) ? (suitable / totalB) * tc * diff : 0;
      grSet('grRemainEst', remainingHours ? (remainingHours < 1 ? durationUnit(Math.round(remainingHours*60), 'dk') : durationUnit(Math.round(remainingHours), 'sa')) : '-');
      grPaintSpeed();
    }

    // ---- pace settings (advanced panel) ----
    const GR_SPEED_FIELD = [
      ['grSpeed', 'grSpeed', 1, 0.1, 4],
      ['grUltraMultiplier', 'grUltraMultiplier', 3, 1, 10],
      ['grCatchUpShare', 'grCatchUpShare', 20, 2, 90],
      ['grFinishedRatio', 'grFinishedRatio', 50, 5, 100],
    ];
    function grPaintSpeed(){
      GR_SPEED_FIELD.forEach(([id, keyName, defaultVal])=>{
        const el = grEl(id);
        if (el && document.activeElement !== el) el.value = String(grVal(keyName, defaultVal));
      });
      const game = grSel();
      const not = grEl('grSpeedNote');
      if (!not) return;
      if (!game){ not.textContent = t('Önce soldan bir oyun ekle.'); return; }
      const { tcHours: tcHours, playedHours: playedHours } = grTcAndDifficulty(game);
      const isFinished = playedHours > 0 && playedHours >= tcHours;
      const frequent = +grVal('grFinishedRatio', 50) || 50;
      const autoSpan = !!grVal('grAutoDuration', true) && !grDurationTouched;
      not.textContent = (isFinished && autoSpan)
        ? tf('# zaten bitmiş sayılıyor (# saat oynanmış, bitiş # saat). Süre ayarlardan belirlendiği için sıkıştırma uygulanmaz.', game.name, Math.round(playedHours), Math.round(tcHours))
        : isFinished
        ? tf('# zaten bitmiş sayılıyor (# saat oynanmış, bitiş # saat). Çizelge %# oranına sıkıştırıldı.', game.name, Math.round(playedHours), Math.round(tcHours), frequent)
        : tf('Oyun henüz bitmemiş (# / # saat), sıkıştırma uygulanmıyor. Ultra nadir başarımlar # kat daha uzun bekler.', Math.round(playedHours), Math.round(tcHours), (+grVal('grUltraMultiplier', 3) || 3));
    }
    GR_SPEED_FIELD.forEach(([id, keyName, defaultVal, lower, upper])=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const v = Math.max(lower, Math.min(upper, parseFloat(el.value) || defaultVal));
        el.value = String(v);
        await grSave({ [keyName]: v });
        grFetchPlan();          // the unlock times depend on these values
      });
    });

    // ---- switches (toggle) ----
    // The switches that are ON until the user turns them off. Painting and clicking used to disagree about two of them (grCatchUp, grAutoDuration):
    // the switch showed "on", and the first click wrote "on" again, so it seemed to do nothing.
    // grCatchUp is ON by default: if there is no backlog it changes nothing anyway.
    const grToggleDefault = (k) => k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours' || k === 'grCatchUp' || k === 'grAutoDuration' || k === 'grParallel';
    function grPaintToggle(){
      document.querySelectorAll('#tab-realistic .gr-toggle').forEach(el=>{
        const k = el.getAttribute('data-grset');
        const on = !!grVal(k, grToggleDefault(k));
        el.style.background = on ? GRC.brand : '#151C28';
        el.style.borderColor = on ? GRC.brand : '#2B3345';
        const knob = el.firstElementChild;
        if (knob){ knob.style.background = on ? GRC.title : GRC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
      });
    }
    document.querySelectorAll('#tab-realistic .gr-toggle').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const k = el.getAttribute('data-grset');
        const newItem = !grVal(k, grToggleDefault(k));
        await grSave({ [k]: newItem });
        grPaintToggle();
        // Turning the automatic duration on again takes back a duration typed earlier in this session
        if (k === 'grAutoDuration' && newItem) grDurationTouched = false;
        if (k === 'grSkipUltraRare' || k === 'grAutoDuration' || k === 'grCatchUp' || k === 'grParallel') grFetchPlan();
        else if (k === 'grShowNoAch') grPaintSearch();
        else grPaintList();
        grPaintAccount();
      });
    });

    // ---- dropdown lists ----
    function grPaintSelect(){
      const ancestor = (id, rawValue) => { const e = grEl(id); if (e) e.value = rawValue; };
      ancestor('grCR', grVal('grCR', '2.0'));
      ancestor('grCR2', grVal('grCR', '2.0'));
      ancestor('grDiff', grVal('grDiff', '1.2'));
      ancestor('grDiff2', grVal('grDiff', '1.2'));
      ancestor('grModel', grVal('grModel', 'linear'));
    }
    // We can change the same setting from both panels (the template does the same); the two stay in sync.
    [['grCR','grCR'], ['grCR2','grCR'], ['grDiff','grDiff'], ['grDiff2','grDiff'],
     ['grModel','grModel']].forEach(([id, keyName])=>{
      const e = grEl(id);
      if (!e) return;
      e.addEventListener('change', async ()=>{
        await grSave({ [keyName]: e.value });
        grPaintSelect();
        grFetchPlan();          // the type, the difficulty and the model all change the unlock times, so the plan is rebuilt
      });
    });
    // Both panels write the same value and the value is kept PER GAME. There used to be a single general
    // 'grTc' setting: writing 180 for Cyberpunk made every game in the library
    // count as 180 hours.
    ['grTcMain', 'grTc'].forEach((id)=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const game = grSel();
        const hour = Math.max(0, Math.min(20000, parseFloat(el.value) || 0));
        el.value = hour > 0 ? String(hour) : '';
        if (game) await grTcWrite(game.appid, hour);
        else await grSave({ grTc: hour > 0 ? String(hour) : '' });
        grFetchPlan();       // the target and timing depend on this value, the plan is rebuilt
      });
    });
    ['grRH','grRM','grRS'].forEach(id=>{
      grEl(id).addEventListener('change', async ()=>{
        grDurationTouched = true;         // entered by hand, automatic assignment no longer overwrites it
        const ms = grDurationMs();
        grWriteDuration(ms);
        await grSave({ grDurationSec: Math.round(ms/1000) });
        grFetchPlan();
      });
    });
    grEl('grTarget').addEventListener('change', async ()=>{
      if (grVal('grTargetAuto', true)) return;
      await grSave({ grTarget: Math.max(0, +grEl('grTarget').value || 0) });
      grFetchPlan();
    });
    grEl('grAutoTarget').onclick = async ()=>{
      await grSave({ grTargetAuto: !grVal('grTargetAuto', true) });
      grPaintAccount();
      grFetchPlan();
    };

    // ---- simple / advanced ----
    function grPaintLevel(){
      const adv = grVal('grLevel', 'simple') === 'advanced';
      const s = grEl('grLvlSimple'), a = grEl('grLvlAdv');
      s.style.borderColor = adv ? 'transparent' : GRC.brand;
      s.style.background = adv ? 'transparent' : '#151C28';
      s.style.color = adv ? GRC.muted : GRC.title;
      a.style.borderColor = adv ? GRC.brand : 'transparent';
      a.style.background = adv ? '#151C28' : 'transparent';
      a.style.color = adv ? GRC.title : GRC.muted;
      grEl('grSimpleBox').style.display = adv ? 'none' : 'flex';
      grEl('grAdvBox').style.display = adv ? 'flex' : 'none';
    }
    grEl('grLvlSimple').onclick = async ()=>{ await grSave({ grLevel: 'simple' }); grPaintLevel(); };
    grEl('grLvlAdv').onclick = async ()=>{ await grSave({ grLevel: 'advanced' }); grPaintLevel(); };

    // ---- presets ----
    // The preset summary is built at draw time: the text written at save time stayed in the old language
    // when the language changed later. If old presets lack the field it falls back to the saved text.
    const GR_MODEL_NAME = { linear:'doğrusal', exp:'üstel (önden yüklemeli)', pareto:'Pareto (80/20)' };
    function grPresetMeta(p){
      if (!p || !p.spanSec || !Array.isArray(p.gameEntries)) return (p && p.meta) || '';
      return grDurationLabel(p.spanSec * 1000) + ' · ' + tf('# oyun', p.gameEntries.length) + ' · ' + t(GR_MODEL_NAME[p.model] || p.model || '-');
    }
    function grPaintPreset(){
      const box = grEl('grPresetsBox');
      box.style.display = grPresets.length ? 'block' : 'none';
      grEl('grPresets').innerHTML = grPresets.map((p,i)=>
        '<div data-grpreset="'+i+'" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #101621;cursor:pointer">'
        + '<span style="width:20px;height:20px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;display:flex;align-items:center;justify-content:center;font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:#C2AAEE">'+(i+1)+'</span>'
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">'
        + '<span style="font-size:12px;color:#B9C0D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.heading||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E">'+esc(grPresetMeta(p))+'</span>'
        + '</div>'
        + '<button data-grpdel="'+i+'" class="h-stop" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">&#8722;</button>'
        + '</div>').join('');
    }
    // At most this many presets are kept. If full, saving is REFUSED - silently dropping
    // the oldest would mean deleting a configuration without the user knowing.
    const GR_PRESET_LIMIT = 5;
    grEl('grSavePreset').onclick = async ()=>{
      if (!grQueue.length){ if (typeof toast === 'function') toast('Ön ayar').fail('Önce sıraya oyun ekle.'); return; }
      if (grPresets.length >= GR_PRESET_LIMIT){
        if (typeof toast === 'function') toast('Ön ayar').fail(tf('En fazla # ön ayar tutulur. Önce birini sil.', GR_PRESET_LIMIT));
        return;
      }
      const durationMs = grDurationMs();
      const p = {
        heading: grQueue.map(g=>g.name).join(', ').slice(0, 60),
        meta: '',
        gameEntries: grQueue.map(g=>g.appid),
        spanSec: Math.round(durationMs/1000),
        model: grVal('grModel','linear'),
        cr: grVal('grCR','2.0'), diff: grVal('grDiff','1.2'),
        goalAuto: !!grVal('grTargetAuto', true), goalValue: Math.max(0, +grEl('grTarget').value || 0),
        ts: Date.now(),
      };
      grPresets = [p].concat(grPresets).slice(0, GR_PRESET_LIMIT);
      await grSave({ grPresets });
      grPaintPreset();
      if (typeof toast === 'function') toast('Ön ayar').done('Kaydedildi.');
    };
    grEl('grPresets').addEventListener('click', async (e)=>{
      const remove = e.target.closest('[data-grpdel]');
      if (remove){
        grPresets.splice(+remove.getAttribute('data-grpdel'), 1);
        await grSave({ grPresets });
        grPaintPreset();
        return;
      }
      const row = e.target.closest('[data-grpreset]');
      if (!row) return;
      if (grStatus.runningFlag){ if (typeof toast === 'function') toast('Ön ayar').fail('Çalışırken ön ayar yüklenemez.'); return; }
      const p = grPresets[+row.getAttribute('data-grpreset')];
      if (!p) return;
      grQueue = (p.gameEntries||[]).map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grWriteDuration((p.spanSec||7200)*1000);
      await grSave({
        grQueue: grQueue.map(g=>g.appid), grDurationSec: p.spanSec||7200, grModel: p.model||'linear',
        grCR: p.cr||'2.0', grDiff: p.diff||'1.2', grTargetAuto: p.goalAuto !== false, grTarget: p.goalValue||0,
      });
      grPaintSelect(); grPaintToggle(); grPaintLibrary();
      grEl('grTarget').value = String(p.goalValue||0);
      grFetchPlan();
      if (typeof toast === 'function') toast('Ön ayar').done('Yüklendi.');
    });

    // ---- start / stop ----
    grEl('grStart').onclick = async ()=>{
      if (grStatus.runningFlag){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Zaten çalışıyor.'); return; }
      if (!grQueue.length){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Önce sıraya oyun ekle.'); return; }
      if ((runBusy.realistic || 0) > Date.now()) return;     // the question is already open
      runBegin('realistic', 120000);
      const durationMs = grDurationMs();
      // what the question tells the user is the run the engine plans (a slower pace makes it longer than the field)
      const runMs = (grPlan && grPlan.spanMs > 0) ? grPlan.spanMs : durationMs;
      const pick = grOptions();
      const goal = grPlan ? grPlan.totalSum : 0;
      const firsts = (grPlan && grPlan.queueList ? grPlan.queueList.slice(0,5) : [])
        .map(a=>'  · '+a.name+(Number.isFinite(a.rarityPct)?(' ('+fmtPercent(localDecimal(a.rarityPct, 1))+')'):'')).join('\n');
      const ok = await edgeConfirm({
        tag:'Gerçekçi Mod',
        title: goal ? tf('# başarım # süreye yayılacak', goal, grDurationLabel(runMs)) : tf('Başarımlar # süreye yayılacak', grDurationLabel(runMs)),
        body: grQueue.map(g=>g.name).join(', ')
              + '\n\n' + t('Oyun sayısı:') + ' ' + grQueue.length
              + '\n' + t('Dağıtım:') + ' ' + t(GR_MODEL_NAME[pick.model] || GR_MODEL_NAME.linear)
              + (grPlan ? ('\n' + t('Ortalama aralık:') + ' ' + grIntervalLabel(grPlan.averageIntervalMs)
                          + ' ' + t(pick.randomInterval ? '(her seferinde rastgele sapmalı)' : '(sabit)')) : '')
              + (firsts ? ('\n\n' + t('İlk açılacaklar:') + '\n' + firsts) : '')
              + (grPlan && grPlan.protectedFlag ? ('\n\n' + tf('# başarım oyun tarafından korunduğu için atlanacak.', grPlan.protectedFlag)) : '')
              + (grPlan && grPlan.ultraSkipped ? ('\n' + tf('# ultra nadir başarım ayara göre atlanacak.', grPlan.ultraSkipped)) : ''),
        warn: 'Bu işlem Steam hesabını kalıcı olarak değiştirir. Süre boyunca uygulama açık kalmalı; istediğin an durdurabilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok){ runEnd('realistic'); return; }
      const r = await window.imu.realistic.start(grQueue.map(g=>g.appid), durationMs, pick)
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        runEnd('realistic');
        edgeConfirm({ tag:'Hata', danger:true, title:'Başlatılamadı',
                      body:(r&&r.error)||'Bilinmeyen hata.', confirmText:'Tamam', singleButton:true });
        return;
      }
      grOpened = [];
      runBegin('realistic');
      // The order could not be read from Steam: the run goes on with a guess and the user is told once
      if (r.rarityMissing && typeof toast === 'function') toast('Gerçekçi Mod').fail('Nadirlik oranları okunamadı; sıra tahmini, gizli başarımlar sonda.');
      notify('boost', 'Gerçekçi Mod Başladı', (r.gameTitle||'') + ' · ' + tf('# başarım', r.totalSum));
      pushFeed('hours', 'Gerçekçi Mod',
               tf('# oyun', r.gameCount) + ' · ' + tf('# başarım # süreye yayıldı.', r.totalSum, grDurationLabel(durationMs)), 'Çalışıyor');
    };
    grEl('grStop').onclick = ()=>{
      if (!grStatus.runningFlag) return;
      runEnd('realistic');
      grStopAsked = true;
      window.imu.realistic.stop();
      pushFeed('hours', 'Gerçekçi Mod', 'Durduruldu.', 'Durdu');
    };

    // ---- state coming from the engine ----
    function grPaintHours(remainingSec){
      const two = (n)=>String(n).padStart(2,'0');
      grSet('grClockH', two(Math.floor(remainingSec/3600)));
      grSet('grClockM', two(Math.floor((remainingSec%3600)/60)));
      grSet('grClockS', two(remainingSec%60));
    }
    if (window.imu.realistic && window.imu.realistic.onTick){
      window.imu.realistic.onTick((d)=>{
        const wasRunning = !!grStatus.runningFlag, wasTogether = !!grStatus.parallel;
        grStatus = d || { runningFlag:false };
        // the list marks the games being played: it is drawn again when a run starts or the way it runs changes
        if (!!grStatus.runningFlag !== wasRunning || !!grStatus.parallel !== wasTogether) grPaintLibrary();
        paintRunButtons();
        if (grTimerUI){ clearInterval(grTimerUI); grTimerUI = null; }

        if (!d || !d.runningFlag){
          grPaintHours(0);
          const stoppedHere = grStopAsked && d && d.isFinished;
          grStopAsked = false;
          if (d && d.isFinished && !stoppedHere){
            notify('boost', 'Gerçekçi Mod Bitti', tf('# / # başarım açıldı', d.openedGames, d.totalSum));
            pushFeed(d.failure?'error':'card', 'Gerçekçi Mod',
                     t(d.cause || 'Bitti') + ' · ' + tf('# / # başarım', d.openedGames, d.totalSum), d.failure?'Hata':'Başarılı');
          }
          grPaintLibrary();
          grPaintList();
          // The list on screen was read before the run (everything locked); Steam has the new state now, so the next run is shown as it will really be
          if (d && d.isFinished) grFetchPlan();
          return;
        }

        const refresh = ()=> grPaintHours(Math.max(0, Math.floor((d.finishTime - Date.now())/1000)));
        refresh();
        grTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) refresh(); }, 1000);
        if (d.gameChanged) grPaintLibrary();
        grPaintList();
      });
    }
    if (window.imu.realistic && window.imu.realistic.onOpened){
      window.imu.realistic.onOpened((a)=>{
        grOpened.push({ name:a.name, rarityPct:a.rarityPct, appid:a.appid, ts:Date.now() });
        pushFeed('card', 'Başarım açıldı', a.name + (a.gameTitle ? (' · ' + a.gameTitle) : ''), 'Başarılı');
        grPaintList();
      });
    }
