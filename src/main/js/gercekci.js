    // ================= GERÇEKÇİ MOD (REALISTIC MODE) =================
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
    let grStatus = { calisiyor: false };
    let grTimerUI = null;
    let grOpened = [];           // {name, rarityPct, ts} - those unlocked in this session
    let grPresets = [];
    // Games found to have no achievements (appid). The engine learns once and writes to disk;
    // they never show up in this page's list again. This page only unlocks achievements.
    let grNoAchievements = new Set();
    // If the user touched the duration field by hand the automatic assignment does not kick in.
    let grDurationTouched = false;
    let grPlanRequest = 0;            // request counter to prevent race conditions

    const GRC = { brand:'#5624B3', ok:'#5FB324', warn:'#B37E24', bad:'#B32453',
                  title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345', sub:'#C2AAEE',
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
    // ms since the start of the session -> "+1 sa 12 dk" format (the time in the Açılma Sırası table)
    function grTimeLabel(ms){
      const sn = Math.round((ms || 0) / 1000);
      const hoursVal = Math.floor(sn / 3600), dk = Math.floor((sn % 3600) / 60);
      if (hoursVal) return '+' + durationUnit(hoursVal, 'sa') + ' ' + durationUnit(String(dk).padStart(2, '0'), 'dk');
      const s = sn % 60;
      return '+' + durationUnit(dk, 'dk') + ' ' + durationUnit(String(s).padStart(2, '0'), 'sn');
    }
    const grWriteHours = (dk) => durationUnit(localDecimal((dk || 0) / 60, 1), 'sa');

    // ---- rarity colour ----
    function grPctColor(pct){
      if (!Number.isFinite(pct)) return GRC.off;
      if (pct < 5) return GRC.bad;
      if (pct < 10) return GRC.sub;
      if (pct < 25) return GRC.teal;
      return GRC.muted;
    }
    function grRarityLabel(pct){
      if (!Number.isFinite(pct)) return 'Bilinmiyor';
      if (pct < 5) return 'Ultra nadir';
      if (pct < 10) return 'Nadir';
      if (pct < 25) return 'Az bulunur';
      if (pct < 50) return 'Yaygın';
      return 'Çok yaygın';
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
      const bs = await window.imu.gercekci.noAchievementsList().catch(()=>null);
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
      // The "Başarımsız oyunları göster" switch only loosens Steam's unreliable hasStats
      // flag, it does not bring back what was proven.
      const tidy = grGames.filter(g=>!grNoAchievements.has(g.appid));
      return grVal('grShowNoAch', false) ? tidy : tidy.filter(g=>g.hasStats);
    }
    function grPaintSearch(){
      const q = grEl('grSearch').value.trim().toLowerCase();
      const box = grEl('grResultsBox');
      if (!q){ box.style.display = 'none'; return; }
      const chosen = new Set(grQueue.map(g=>g.appid));
      const found = grSearchable().filter(g=>g.name.toLowerCase().includes(q)).slice(0, 40);
      box.style.display = 'flex';
      grEl('grNoResults').style.display = found.length ? 'none' : 'block';
      grEl('grResults').innerHTML = found.map(g=>{
        const inside = chosen.has(g.appid);
        return '<div class="h-s3" data-gradd="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;cursor:pointer">'
          + '<div style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + esc(grWriteHours(g.playtimeMin) + ' · ' + t(g.hasStats ? 'başarım var' : 'başarım yok'))+'</span>'
          + '</div>'
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
      const p = await window.imu.gercekci.plan(game.appid, grDurationMs(), grOptions())
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
        el.innerHTML = '<div style="padding:30px 10px;text-align:center;font-size:11px;color:#656D80;line-height:1.6">'
          + (grLoaded ? 'Yukarıdan oyun ara ve <b style="color:#8B8F9E">+</b> ile sıraya ekle.' : 'Kütüphane yükleniyor…')
          + '</div>';
        return;
      }
      const activeId = grStatus.calisiyor ? grStatus.appid : (grQueue[0] && grQueue[0].appid);
      el.innerHTML = grQueue.map(g=>{
        const on = g.appid === activeId;
        const achEt = g.hasStats ? 'BAŞARIM' : 'SAAT';
        const achFg = g.hasStats ? GRC.sub : GRC.warn;
        return '<div data-grrow="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px solid '
          + (on?GRC.brand:'#1D2432')+';background:'+(on?'#101621':'#0D1118')+';cursor:pointer;margin-bottom:5px" class="h-bd">'
          + '<div style="width:30px;height:30px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:'+(on?GRC.title:'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(grWriteHours(g.playtimeMin))+'</span>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:'+achFg
          + ';border:1px solid '+achFg+';border-radius:12px;padding:2px 7px;flex-shrink:0">'+achEt+'</span>'
          + '<button data-grdel="'+g.appid+'" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#0D1118;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" class="h-stop">&#8722;</button>'
          + '</div>';
      }).join('');
    }
    grEl('grLibrary').addEventListener('click', (e)=>{
      const remove = e.target.closest('[data-grdel]');
      if (remove){
        if (grStatus.calisiyor){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Çalışırken sıra değiştirilemez.'); return; }
        const id = +remove.getAttribute('data-grdel');
        grQueue = grQueue.filter(x=>x.appid!==id);
        grSaveQueue(); grPaintLibrary(); grFetchPlan();
        return;
      }
      const row = e.target.closest('[data-grrow]');
      if (row && !grStatus.calisiyor){
        // Move the clicked game to the front of the order: the preview shows its plan.
        const id = +row.getAttribute('data-grrow');
        const i = grQueue.findIndex(x=>x.appid===id);
        if (i > 0){ const [g] = grQueue.splice(i,1); grQueue.unshift(g); grSaveQueue(); grPaintLibrary(); grFetchPlan(); }
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
      const difficulty = parseFloat(grVal('grDiff', '1.2')) || 1.2;
      const crRaw = grVal('grCR', '2.0');
      const cr = crRaw === 'auto' ? 0 : (parseFloat(crRaw) || 2);
      const playedHours = game ? (game.playtimeMin / 60) : 0;
      const manual = (game ? grTcRead(game.appid) : 0) || (parseFloat(grVal('grTc', '')) || 0);
      const estimate = Math.max(2, playedHours * (cr || 2) || (cr || 2) * 5);
      return { tcHours: manual > 0 ? manual : estimate, difficultyValue: difficulty, manuallyEntered: manual > 0, playedHours: playedHours };
    }
    function grOptions(){
      const { tcHours: tcHours, difficultyValue: difficulty } = grTcAndDifficulty(grQueue[0]);
      const playtime = {};
      grQueue.forEach(g=>{ playtime[g.appid] = g.playtimeMin || 0; });
      return {
        goalValue: grVal('grTargetAuto', true) ? 0 : Math.max(0, +grEl('grTarget').value || 0),
        model: grVal('grModel', 'linear'),
        rastgeleAralik: !!grVal('grRandomGap', true),
        ultraNadirAtla: !!grVal('grSkipUltraRare', false),
        autoOrder: !!grVal('grAuto', true),
        continueHours: !!grVal('grKeepHours', true),
        accelerateDelayed: !!grVal('grCatchUp', true),
        speedMultiplier: +grVal('grSpeed', 1) || 1,
        ultraMultiplier: +grVal('grUltraMultiplier', 3) || 3,
        compensationShare: (+grVal('grCatchUpShare', 20) || 20) / 100,
        finishedRatio: (+grVal('grFinishedRatio', 50) || 50) / 100,
        tcHours: tcHours, difficultyValue: difficulty, playtime,
      };
    }

    // ---- plan preview ----
    async function grFetchPlan(){
      const initial = grQueue[0];
      if (!initial){
        grPlan = null;
        grPaintList(); grPaintAccount();
        return;
      }
      const request = ++grPlanRequest;
      grSet('grNextName', t('Başarım şeması okunuyor…'));
      // It is written to textContent: esc() here showed the name as "&amp;".
      grSet('grNextMeta', initial.name);
      const p = await window.imu.gercekci.plan(initial.appid, grDurationMs(), grOptions())
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
      if (!grPlan){
        grSet('grNextName', '-');
        grSet('grNextMeta', t((p && p.error) || 'Plan alınamadı'));
      }
      grPaintList(); grPaintAccount();
    }

    // ---- middle panel ----
    function grPaintList(){
      const game = grQueue[0];
      const isRunning = !!grStatus.calisiyor;
      const hasAchievements = !!(grPlan && grPlan.totalSum);
      const noAchievements = !!(game && grPlan && !grPlan.totalSum);

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
        const position = isRunning ? grStatus.upNext : (grPlan.queueList[0] && grPlan.queueList[0].name);
        const orderPct = isRunning ? grStatus.upNextPct : (grPlan.queueList[0] && grPlan.queueList[0].rarityPct);
        const rank = isRunning ? (grStatus.openedGames + 1) : 1;
        grSet('grNextName', grStatus.achievementsDone ? t('Başarımlar bitti') : (position || '-'));
        grSet('grNextMeta', grStatus.achievementsDone
          ? t('Süre sonuna kadar saat toplanıyor')
          : tf('yaklaşık # içinde açılacak · sıra: #', grIntervalLabel(isRunning ? grStatus.averageIntervalMs : grPlan.averageIntervalMs), rank));
        const pctEl = grEl('grNextPct');
        pctEl.textContent = Number.isFinite(orderPct) ? fmtPercent(localDecimal(orderPct, 1)) : '-';
        pctEl.style.color = grPctColor(orderPct);
        pctEl.style.borderColor = grPctColor(orderPct);
      }

      // Unlock order table
      grSet('grOpenedCount', opened + ' / ' + sumTotal);
      const el = grEl('grList');
      if (!grPlan || !grPlan.queueList || !grPlan.queueList.length){
        el.innerHTML = '<div style="padding:36px 0;text-align:center;font-size:12px;color:#656D80">'
          + (grQueue.length ? 'Açılacak başarım yok.' : 'Soldan oyun ekle, açılma sırası burada görünecek.') + '</div>';
        return;
      }
      const openedNames = new Set(grOpened.map(a=>a.name));
      let html = '';
      let lastLabel = null;
      grPlan.queueList.forEach((a, i)=>{
        // Divider when the rarity changes: the "isDivider" row in the template.
        const et = grRarityLabel(a.rarityPct);
        if (et !== lastLabel){
          lastLabel = et;
          html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 2px 6px">'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#656D80">'+esc(et)+'</span>'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '</div>';
        }
        const colorVal = grPctColor(a.rarityPct);
        const wasOpened = openedNames.has(a.name);
        html += '<div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #101621">'
          + '<span style="width:26px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:10px;color:#656D80">#'+(i+1)+'</span>'
          + '<div style="width:33px;height:33px;flex-shrink:0;border-radius:11px;border:1px solid '+(wasOpened?GRC.ok:'#2B3345')+';background:#101621;display:flex;align-items:center;justify-content:center">'
          + '<span style="width:10px;height:10px;background:'+(wasOpened?GRC.ok:colorVal)+';transform:rotate(45deg)"></span></div>'
          + '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:'+(wasOpened?GRC.ok:GRC.title)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name||'')+'</span>'
          + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+colorVal+';border:1px solid '+colorVal+';border-radius:12px;padding:2px 8px;flex-shrink:0">'+esc(grRarityLabel(a.rarityPct))+'</span>'
          + '<span style="width:52px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+colorVal+';text-align:right">'
          + (Number.isFinite(a.rarityPct) ? fmtPercent(localDecimal(a.rarityPct, 1)) : '-')+'</span>'
          + '<span style="width:92px;flex-shrink:0;white-space:nowrap;font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E;text-align:right">'
          + (wasOpened ? 'AÇILDI' : grTimeLabel(a.timeValue))+'</span>'
          + '</div>';
      });
      el.innerHTML = html;
    }

    // The plan summary is written from a single template. It used to be four pieces: "2 sa" + " süresinde " + "12" +
    // " başarım açılacaktır"; every language was condemned to Turkish syntax,
    // the English came out "2 h over 12 achievements will unlock".
    function grWritePlanSentence(durationMs, goal){
      const el = grEl('grPlanSentence');
      if (!el) return;
      el.innerHTML = tf('# içinde # başarım açılacak',
        '<span style="font-family:Geist Mono,monospace;color:#C2AAEE">' + esc(grDurationLabel(durationMs)) + '</span>',
        '<span style="font-family:Geist Mono,monospace;font-weight:700;color:#DCE2FA">' + (Number(goal) || 0) + '</span>');
    }

    // ---- target + HLTB calculations ----
    function grPaintAccount(){
      const game = grQueue[0];
      let durationMs = grDurationMs();
      const suitable = grPlan ? (grPlan.suitableTotal || 0) : 0;
      const auto = !!grVal('grTargetAuto', true);

      grSet('grTargetTotal', String(suitable));

      const crRaw = grVal('grCR', '2.0');
      const { tcHours: tc, difficultyValue: diff, manuallyEntered: manuallyEntered, playedHours: playtimeHours } = grTcAndDifficulty(game);
      let durationHours = durationMs / 3600000;

      // The automatic target is made of TWO parts:
      //   1. WHAT IS BEHIND - the number that SHOULD already have been unlocked at this playtime,
      //      minus the one really unlocked. In a 180 hour game with its achievements locked
      //      this is a big number.
      //   2. SESSION SHARE - as much as will be earned in this session's own time.
      // There used to be only the 2nd part: the calculation said "how many achievements would a player who starts from zero get in this
      // time". The result was a suggestion like 2 achievements in 8 hours for a game with 180 hours played;
      // yet in that game almost all of them should already have been unlocked.
      const totalB = grPlan ? (grPlan.totalAchievements || 0) : 0;
      const acilmisB = grPlan ? (grPlan.unlockedState || 0) : 0;
      const denominator = Math.max(0.1, tc * diff);
      const scale = totalB || suitable;
      const expected = scale ? Math.min(scale, scale * (playtimeHours / denominator)) : 0;
      const remainingBehind = Math.max(0, Math.round(expected - acilmisB));
      const sessionShare = scale * (durationHours / denominator);
      // AUTOMATIC DURATION: when the settings change not only the target but the DURATION must be recomputed.
      // The measure is how long it would take a real player to earn the achievements that are behind:
      //   (behind / total) x completion time x difficulty
      // It is clamped between 15 minutes and 12 hours. If the user typed the duration by hand it is left alone,
      // and it is left alone if the switch in Ayarlar is off.
      if (grVal('grAutoDuration', true) && !grDurationTouched && game && scale && remainingBehind > 0){
        const neededHours = Math.max(0.25, Math.min(12, (remainingBehind / scale) * denominator));
        const newMs = Math.round(neededHours * 3600000);
        if (Math.abs(newMs - durationMs) > 60000){
          grWriteDuration(newMs);
          durationMs = newMs;
          durationHours = neededHours;
          grSave({ grDurationSec: Math.round(durationMs / 1000) });
        }
      }
      const autoTarget = suitable ? Math.max(1, Math.min(suitable, Math.round(remainingBehind + sessionShare))) : 0;
      // The two halves of the target box must look like ONE piece: the same font, the same height, the same colour.
      // It used to be a big white number on the top line and a small grey "/ total" under it.
      const goalColor = auto ? GRC.sub : GRC.title;
      grEl('grTarget').readOnly = auto;
      if (auto) grEl('grTarget').value = String(autoTarget);
      ['grTarget', 'grTargetSep', 'grTargetTotal'].forEach((id)=>{
        const el = grEl(id); if (el) el.style.color = goalColor;
      });
      const goal = auto ? autoTarget : Math.max(0, Math.min(suitable, +grEl('grTarget').value || 0));
      grWritePlanSentence(durationMs, goal || (grPlan ? grPlan.totalSum : 0));

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
           + ' ' + tf('Bu kadar oynanmışken # başarım açılmış olmalıydı; açılan #, geride kalan #.', Math.round(expected), acilmisB, remainingBehind)
           + ' ' + tf('# içinde # başarım açılır.', grDurationLabel(durationMs), goal))
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
      const game = grQueue[0];
      const not = grEl('grSpeedNote');
      if (!not) return;
      if (!game){ not.textContent = t('Önce soldan bir oyun ekle.'); return; }
      const { tcHours: tcHours, playedHours: playedHours } = grTcAndDifficulty(game);
      const isFinished = playedHours > 0 && playedHours >= tcHours;
      const frequent = +grVal('grFinishedRatio', 50) || 50;
      not.textContent = isFinished
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
    function grPaintToggle(){
      document.querySelectorAll('#tab-gercekci .gr-toggle').forEach(el=>{
        const k = el.getAttribute('data-grset');
        // grCatchUp is ON by default: if there is no backlog it changes nothing anyway.
        const on = !!grVal(k, k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours' || k === 'grCatchUp' || k === 'grAutoDuration');
        el.style.background = on ? GRC.brand : '#151C28';
        el.style.borderColor = on ? GRC.brand : '#2B3345';
        const knob = el.firstElementChild;
        if (knob){ knob.style.background = on ? GRC.title : GRC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
      });
    }
    document.querySelectorAll('#tab-gercekci .gr-toggle').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const k = el.getAttribute('data-grset');
        const newItem = !grVal(k, k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours');
        await grSave({ [k]: newItem });
        grPaintToggle();
        if (k === 'grSkipUltraRare') grFetchPlan();
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
        if (keyName === 'grModel') grFetchPlan(); else { grPaintAccount(); grPaintList(); }
      });
    });
    // Both panels write the same value and the value is kept PER GAME. There used to be a single general
    // 'grTc' setting: writing 180 for Cyberpunk made every game in the library
    // count as 180 hours.
    ['grTcMain', 'grTc'].forEach((id)=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const game = grQueue[0];
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
        + '<span style="width:20px;height:20px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;display:flex;align-items:center;justify-content:center;font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE">'+(i+1)+'</span>'
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">'
        + '<span style="font-size:12px;color:#B9C0D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.heading||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(grPresetMeta(p))+'</span>'
        + '</div>'
        + '<button data-grpdel="'+i+'" class="h-stop" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">&#8722;</button>'
        + '</div>').join('');
    }
    // At most this many presets are kept. If full, saving is REFUSED - silently dropping
    // the oldest would mean deleting a configuration without the user knowing.
    const GR_PRESET_LIMIT = 5;
    grEl('grSavePreset').onclick = async ()=>{
      if (!grQueue.length){ if (typeof toast === 'function') toast('Preset').fail('Önce sıraya oyun ekle.'); return; }
      if (grPresets.length >= GR_PRESET_LIMIT){
        if (typeof toast === 'function') toast('Preset').fail(tf('En fazla # preset tutulur. Önce birini sil.', GR_PRESET_LIMIT));
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
      if (typeof toast === 'function') toast('Preset').done('Kaydedildi.');
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
      if (grStatus.calisiyor){ if (typeof toast === 'function') toast('Preset').fail('Çalışırken preset yüklenemez.'); return; }
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
      if (typeof toast === 'function') toast('Preset').done('Yüklendi.');
    });

    // ---- start / stop ----
    grEl('grStart').onclick = async ()=>{
      if (grStatus.calisiyor){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Zaten çalışıyor.'); return; }
      if (!grQueue.length){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Önce sıraya oyun ekle.'); return; }
      const durationMs = grDurationMs();
      const pick = grOptions();
      const goal = grPlan ? grPlan.totalSum : 0;
      const firsts = (grPlan && grPlan.queueList ? grPlan.queueList.slice(0,5) : [])
        .map(a=>'  · '+a.name+(Number.isFinite(a.rarityPct)?(' ('+fmtPercent(localDecimal(a.rarityPct, 1))+')'):'')).join('\n');
      const ok = await edgeConfirm({
        tag:'Gerçekçi Mod',
        title: goal ? tf('# başarım # süreye yayılacak', goal, grDurationLabel(durationMs)) : tf('Başarımlar # süreye yayılacak', grDurationLabel(durationMs)),
        body: grQueue.map(g=>g.name).join(', ')
              + '\n\n' + t('Oyun sayısı:') + ' ' + grQueue.length
              + '\n' + t('Dağıtım:') + ' ' + t(GR_MODEL_NAME[pick.model] || GR_MODEL_NAME.linear)
              + (grPlan ? ('\n' + t('Ortalama aralık:') + ' ' + grIntervalLabel(grPlan.averageIntervalMs)
                          + ' ' + t(pick.rastgeleAralik ? '(her seferinde rastgele sapmalı)' : '(sabit)')) : '')
              + (firsts ? ('\n\n' + t('İlk açılacaklar:') + '\n' + firsts) : '')
              + (grPlan && grPlan.protectedFlag ? ('\n\n' + tf('# başarım oyun tarafından korunduğu için atlanacak.', grPlan.protectedFlag)) : '')
              + (grPlan && grPlan.ultraSkipped ? ('\n' + tf('# ultra nadir başarım ayara göre atlanacak.', grPlan.ultraSkipped)) : ''),
        warn: 'Bu işlem Steam hesabını kalıcı olarak değiştirir. Süre boyunca uygulama açık kalmalı; istediğin an durdurabilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.gercekci.start(grQueue.map(g=>g.appid), durationMs, pick)
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Başlatılamadı',
                      body:(r&&r.error)||'Bilinmeyen hata.', confirmText:'Tamam', singleButton:true });
        return;
      }
      grOpened = [];
      notify('boost', 'Gerçekçi Mod Başladı', (r.gameTitle||'') + ' · ' + tf('# başarım', r.totalSum));
      pushFeed('saat', 'Gerçekçi Mod',
               tf('# oyun', r.gameCount) + ' · ' + tf('# başarım # süreye yayıldı.', r.totalSum, grDurationLabel(durationMs)), 'Çalışıyor');
    };
    grEl('grStop').onclick = ()=>{
      if (!grStatus.calisiyor) return;
      window.imu.gercekci.stop();
      pushFeed('saat', 'Gerçekçi Mod', 'Durduruldu.', 'Durdu');
    };

    // ---- state coming from the engine ----
    function grPaintHours(remainingSec){
      const two = (n)=>String(n).padStart(2,'0');
      grSet('grClockH', two(Math.floor(remainingSec/3600)));
      grSet('grClockM', two(Math.floor((remainingSec%3600)/60)));
      grSet('grClockS', two(remainingSec%60));
    }
    if (window.imu.gercekci && window.imu.gercekci.onTick){
      window.imu.gercekci.onTick((d)=>{
        grStatus = d || { calisiyor:false };
        if (grTimerUI){ clearInterval(grTimerUI); grTimerUI = null; }

        if (!d || !d.calisiyor){
          grPaintHours(0);
          if (d && d.bitti){
            notify('boost', 'Gerçekçi Mod Bitti', tf('# / # başarım açıldı', d.openedGames, d.totalSum));
            pushFeed(d.hata?'hata':'kart', 'Gerçekçi Mod',
                     t(d.cause || 'Bitti') + ' · ' + tf('# / # başarım', d.openedGames, d.totalSum), d.hata?'Hata':'Başarılı');
          }
          grPaintLibrary();
          grPaintList();
          return;
        }

        const refresh = ()=> grPaintHours(Math.max(0, Math.floor((d.finishTime - Date.now())/1000)));
        refresh();
        grTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) refresh(); }, 1000);
        if (d.gameChanged) grPaintLibrary();
        grPaintList();
      });
    }
    if (window.imu.gercekci && window.imu.gercekci.onOpened){
      window.imu.gercekci.onOpened((a)=>{
        grOpened.push({ name:a.name, rarityPct:a.rarityPct, ts:Date.now() });
        pushFeed('kart', 'Başarım açıldı', a.name + (a.gameTitle ? (' · ' + a.gameTitle) : ''), 'Başarılı');
        grPaintList();
      });
    }
