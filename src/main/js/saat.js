    // ================= SAAT YÜKSELTİCİ (HOUR BOOSTER) =================
    // Simultaneous = all together (stops at the set time).
    // When "Sıralı bekletme modu" is on, FarmController cycles the games in turn with 'sequential'.
    let ownedGames = [], hoursLoaded = false;
    let selectedHours = [];
    let hourDurSec = 3600;
    let maxConcurrent = 32, concurrentCustom = false;
    let boostState = { running: false, appids: [], startedAt: 0, durationMs: 0 };
    let boostTimerUI = null;
    // Behaviour/Privacy switches - written persistently to the settings (the same keys as the Settings screen)
    // ignoreUpdates and hideGameName were removed from here: the first had no counterpart in the engine at all,
    // the second sits under Ayarlar > Gizlilik.
    let boostFlags = { boostAutoRestart:false, seqIdle:false, loopQueue:true, offlineMode:false, boostSync:false };

    const BC = { brand:'#5624B3', ok:'#5FB324', teal:'#24AEB3', title:'#DCE2FA', muted:'#8B8F9E',
                 off:'#656D80', bd:'#2B3345', s1:'#0D1118', bgAlt:'#090C12', sub:'#C2AAEE' };
    const BSEG_ON  = { background:BC.brand, borderColor:BC.brand, color:BC.title };
    const BSEG_OFF = { background:'transparent', borderColor:'transparent', color:BC.muted };

    function fmtHMS(pick){ const h=Math.floor(pick/3600), m=Math.floor((pick%3600)/60), s=Math.max(0,pick%60); return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':'); }
    function monoHMS(pick){ return fmtHMS(pick).replace(/:/g, '<span style="color:#C2AAEE">:</span>'); }
    const hrsOf = (g) => localDecimal((g.playtimeForever||0)/60, 1);

    async function loadHours(){
      await applyBoostFlags();
      if (hoursLoaded){ renderHoursList(); renderActiveBox(); return; }
      const body = document.getElementById('hoursListBody');
      body.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Steam\'e bağlanılıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ body.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(con.error)+'</div>'; return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'Kütüphane okunamadı.' }));
      if (!res.ok){ body.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(res.error)+'</div>'; return; }
      ownedGames = res.games; hoursLoaded = true;
      restoreBoostList();
      renderHoursList(); renderHoursSelected();
    }
    document.getElementById('hoursSearch').addEventListener('input', renderHoursList);

    // if the "Oyun listesini hatırla" setting is on the selection is persistent
    function persistBoostList(){
      if (appSettings && appSettings.rememberBoostList){
        window.imu.settings.set({ boostGameIds: selectedHours.map(g=>g.appid) }).catch(()=>{});
      }
    }
    // Restores the saved game list.
    // NOTE: it is called both from loadHours and from applyBoostFlags. The reason is a race
    // condition: the settings (appSettings) and the library (ownedGames) become ready at different moments;
    // so that the selection comes back whichever arrives first it is tried from both sides. It used to be
    // called only inside loadHours and if the settings came late the user's saved
    // list looked EMPTY - and then selecting again by hand overwrote the saved one.
    function restoreBoostList(){
      if (!appSettings || !appSettings.rememberBoostList || !Array.isArray(appSettings.boostGameIds)) return false;
      if (!ownedGames.length) return false;      // the library has not arrived yet
      if (selectedHours.length) return false;     // the user already selected, do not overwrite
      const ids = new Set(appSettings.boostGameIds);
      const found = ownedGames.filter(g=>ids.has(g.appid));
      if (!found.length) return false;
      selectedHours = found;
      return true;
    }

    // ---- library list ----
    function renderHoursList(){
      const q = document.getElementById('hoursSearch').value.trim().toLowerCase();
      const body = document.getElementById('hoursListBody');
      const selIds = new Set(selectedHours.map(g=>g.appid));
      const filtered = (q ? ownedGames.filter(g=>g.name.toLowerCase().includes(q)) : ownedGames).slice(0,300);
      document.getElementById('hoursFound').textContent = (q?filtered.length:ownedGames.length) + ' bulundu';
      if (!filtered.length){ body.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Sonuç yok.</div>'; return; }
      body.innerHTML = filtered.map(g=>{
        const on = selIds.has(g.appid);
        return '<div class="h-bd" data-appid="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px solid '+(on?BC.brand:BC.bd)+';background:'+(on?'#151C28':'transparent')+';cursor:pointer;margin-bottom:5px">'
          // Library Header ratio (920x430, ~2.14:1)
          + '<div style="width:59px;height:28px;flex-shrink:0;border-radius:8px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
            + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
            + '<span style="font-size:12px;font-weight:600;color:'+(on?BC.title:BC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(durationUnit(hrsOf(g), 'sa'))+'</span>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:13px;font-weight:700;color:'+(on?BC.ok:BC.off)+'">'+(on?'✓':'+')+'</span>'
          + '</div>';
      }).join('');
    }
    document.getElementById('hoursListBody').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-appid]'); if (!row) return;
      toggleSaatGame(+row.getAttribute('data-appid'));
    });

    // Instead of redrawing the whole list only the clicked row is updated (the library can reach 300 rows;
    // also redrawing lost the scroll position and the clicked node).
    function paintLibRow(row, on){
      row.style.borderColor = on ? BC.brand : BC.bd;
      row.style.background  = on ? '#151C28' : 'transparent';
      const nameEl = row.querySelector('span');
      if (nameEl) nameEl.style.color = on ? BC.title : BC.muted;
      const mark = row.lastElementChild;
      if (mark){ mark.textContent = on ? '✓' : '+'; mark.style.color = on ? BC.ok : BC.off; }
    }
    function toggleSaatGame(appid){
      const idx = selectedHours.findIndex(g=>g.appid===appid);
      const on = idx < 0;
      if (!on) selectedHours.splice(idx,1);
      else { const g = ownedGames.find(x=>x.appid===appid); if (g) selectedHours.push(g); }
      const row = document.querySelector('#hoursListBody [data-appid="'+appid+'"]');
      if (row) paintLibRow(row, on);
      persistBoostList();
      renderHoursSelected();
    }
    document.getElementById('hoursClearQueue').onclick = ()=>{
      selectedHours = []; persistBoostList();
      document.querySelectorAll('#hoursListBody [data-appid]').forEach(r=>paintLibRow(r, false));
      renderHoursSelected();
    };

    function renderHoursSelected(){ renderActiveBox(); }

    // ---- ITEM 4: hour sync settings (in the page) ----
    // While sync is on "eszamanli limit" and "yukseltme suresi" are meaningless: the sync
    // algorithm decides both. So they are visually locked and the reason is written.
    function renderSyncSettings(){
      const isOpen = !!(appSettings && appSettings.boostSync) && !boostFlags.seqIdle;
      const opts = document.getElementById('hoursSyncOpts');
      if (opts) opts.style.display = isOpen ? 'flex' : 'none';

      const mod = (appSettings && appSettings.boostSyncMode) || 'highest';
      const mSel = document.getElementById('hoursSyncMode');
      if (mSel && mSel.value !== mod) mSel.value = mod;
      const tRow = document.getElementById('hoursSyncTargetRow');
      if (tRow) tRow.style.display = (isOpen && mod === 'manual') ? 'flex' : 'none';
      const tIn = document.getElementById('hoursSyncTarget');
      if (tIn && document.activeElement !== tIn) tIn.value = (appSettings && appSettings.boostSyncTargetHours) || 100;
      const stSel = document.getElementById('hoursSyncStrategy');
      const st = (appSettings && appSettings.boostSyncStrategy) || 'parallel';
      if (stSel && stSel.value !== st) stSel.value = st;

      lock(document.getElementById('hoursConcBlock'), isOpen,
              'Eşitleme açık: oyunları eşitleme çalıştırır (en fazla 32 eşzamanlı).');
      lock(document.getElementById('hoursDurBlock'), isOpen,
              'Eşitleme açık: süreyi hedef saat belirler.');
    }
    function lock(block, locked, cause){
      if (!block) return;
      block.style.opacity = locked ? '0.42' : '1';
      block.style.pointerEvents = locked ? 'none' : '';
      let not = block.querySelector('[data-kilit-not]');
      if (locked){
        if (!not){
          not = document.createElement('span');
          not.setAttribute('data-kilit-not','1');
          not.style.cssText = 'font-size:10.5px;line-height:1.5;color:#B37E24';
          block.appendChild(not);
        }
        not.textContent = cause;
      } else if (not) not.remove();
    }
    (function bindSyncSettings(){
      const mSel = document.getElementById('hoursSyncMode');
      if (mSel) mSel.addEventListener('change', ()=>{
        appSettings.boostSyncMode = mSel.value;
        window.imu.settings.set({ boostSyncMode: mSel.value }).catch(()=>{});
        renderSyncSettings();
      });
      const tIn = document.getElementById('hoursSyncTarget');
      if (tIn) tIn.addEventListener('change', ()=>{
        const v = Math.max(1, Math.min(20000, +tIn.value || 100));
        tIn.value = v; appSettings.boostSyncTargetHours = v;
        window.imu.settings.set({ boostSyncTargetHours: v }).catch(()=>{});
      });
      const stSel = document.getElementById('hoursSyncStrategy');
      if (stSel) stSel.addEventListener('change', ()=>{
        appSettings.boostSyncStrategy = stSel.value;
        window.imu.settings.set({ boostSyncStrategy: stSel.value }).catch(()=>{});
      });
    })();

    // ---- queue/active cards ----
    function renderActiveBox(){
      const box = document.getElementById('activeBoostBox');
      if (!box) return;
      const activeIds = boostState.running ? (boostState.activeAppids || boostState.appids || []) : [];
      const activeSet = new Set(activeIds);
      document.getElementById('statGameCount').textContent = boostState.running ? activeIds.length : selectedHours.length;

      // Time indicators
      const elapsed = boostState.running ? Math.floor((Date.now()-(boostState.startedAt||Date.now()))/1000) : 0;
      const left = boostState.running && boostState.durationMs
        ? Math.max(0, Math.floor((boostState.durationMs - (Date.now()-(boostState.startedAt||Date.now())))/1000))
        : (selectedHours.length ? (boostFlags.seqIdle ? hourDurSec*selectedHours.length : hourDurSec) : 0);
      document.getElementById('statTotalDuration').innerHTML = monoHMS(elapsed);
      const unlimited = boostState.running ? (!boostState.durationMs && !boostState.sync && !syncGameInfo.size) : !hourDurSec;
      document.getElementById('hoursRemain').innerHTML = unlimited ? '∞' : monoHMS(left);

      if (!selectedHours.length){
        box.innerHTML = '<div style="grid-column:1/-1;padding:48px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Kuyruk boş</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Soldaki kütüphaneden oyun seç - seçtiklerin burada görünür.</span></div>';
        return;
      }
      const halt = boostState.durationMs || hourDurSec*1000;
      const pct = boostState.running && halt ? Math.min(100, Math.round((Date.now()-(boostState.startedAt||Date.now()))/halt*100)) : 0;
      // While sync is on the bars sit on the SHARED TIMELINE: the measure is the ratio of that game's remaining
      // time to the job's TOTAL time. In a 34 hour job the bar of a game that will finish after 3 hours
      // is almost full from the start, the bar of the game that will run to the end is empty.
      // So the bars are comparable with each other and every game reaches 100% at the moment it finishes.
      //
      // Measuring by the game's own path (gained / distance to the target) was tried and ABANDONED:
      // in that measure all of them start from 0%, so which game would finish early was never
      // visible on screen - a 3 hour job and a 34 hour job were the same empty bar.
      function gamePercent(g, active){
        const details = syncGameInfo.get(g.appid);
        if (details && syncJobTotalMs > 0){
          if (details.isFinished) return 100;
          const remaining = Math.max(0, details.remainingMs || 0);
          return Math.max(0, Math.min(100, Math.round((1 - remaining / syncJobTotalMs) * 100)));
        }
        return active ? pct : 0;
      }
      box.innerHTML = selectedHours.map((g,i)=>{
        const on = activeSet.has(g.appid);
        const bd = on ? BC.brand : BC.bd;
        const p = gamePercent(g, on);
        return '<div style="border:1px solid '+bd+';border-radius:12px;background:'+(on?BC.s1:BC.bgAlt)+';padding:14px;display:flex;align-items:center;gap:12px;min-height:84px">'
          // Library Header ratio (920x430, ~2.14:1)
          + '<div style="width:97px;height:45px;flex-shrink:0;border-radius:10px;border:1px solid '+bd+';background:repeating-linear-gradient(135deg,#151C28 0 6px,#101621 6px 12px);overflow:hidden">'
            + gameThumb(g.appid) + '</div>'
          + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
              + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0">'
                + '<span style="font-size:12px;font-weight:600;color:'+(on?BC.title:BC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
                + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+subRow(g, on, i, elapsed)+'</span>'
              + '</div>'
              + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
                + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:'+(on?BC.ok:BC.off)+'">'+fmtPercent(p)+'</span>'
                // Remove a single game from the queue. There used to be only "clear the queue",
                // so to drop one game the whole selection had to be ruined.
                + '<button data-saatdel="'+g.appid+'" class="h-stop" title="'+esc(t('Kuyruktan Çıkar'))+'" '
                  + 'style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;'
                  + 'background:#090C12;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;'
                  + 'line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">&#8722;</button>'
              + '</div>'
            + '</div>'
            + '<div style="height:5px;border-radius:12px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
              + '<div style="height:100%;width:'+p+'%;border-radius:12px;background:'+(on?BC.ok:BC.teal)+'"></div></div>'
          + '</div></div>';
      }).join('');
    }

    // Removing a single game from the queue. While running the queue is not touched: the engine was already
    // started with that list, deleting from the interface would separate the screen from the engine.
    document.getElementById('activeBoostBox').addEventListener('click', (e)=>{
      const b = e.target.closest('[data-saatdel]'); if (!b) return;
      if (boostState && boostState.running){
        if (typeof toast === 'function') toast('Saat Yükseltici').fail('Çalışırken kuyruk değiştirilemez.');
        return;
      }
      const id = +b.getAttribute('data-saatdel');
      selectedHours = selectedHours.filter(g=>g.appid!==id);
      persistBoostList();
      const row = document.querySelector('#hoursListBody [data-appid="'+id+'"]');
      if (row) paintLibRow(row, false);
      renderActiveBox();
    });

    // ITEM 15: it used to write only "the time elapsed in that session"; the game's CURRENT total
    // time was not visible. Now start + elapsed is shown, and while sync is on how much
    // is left to the target is written too. The values during sync come from the main side
    // (since each game runs for a different time a single "elapsed" is not enough).
    let syncGameInfo = new Map();   // appid -> { suankiMin, remainingMs, bitti }
    function subRow(g, on, i, elapsed){
      const details = syncGameInfo.get(g.appid);
      if (details){
        if (details.isFinished) return esc(tf('hedefe ulaştı · # ✓', fmtHours(details.currentMin)));
        const goal = syncTargetMin ? (' → ' + fmtHours(syncTargetMin)) : '';
        return esc(fmtHours(details.currentMin) + goal + ' · ' + t(on ? 'çalışıyor' : 'sırada'));
      }
      // Sync is running but this game is not in the list, so it is already above the target
      if (syncTargetMin && (g.playtimeForever || 0) >= syncTargetMin){
        return esc(fmtHours(g.playtimeForever || 0) + ' · ' + t('zaten hedefte'));
      }
      // When there is no sync: the time that comes from the library + the time elapsed in this session
      const baseMin = g.playtimeForever || 0;
      if (on) return esc(fmtHours(baseMin + Math.floor(elapsed/60)) + ' · ' + t('çalışıyor') + ' ' + fmtHMS(elapsed));
      return '#' + (i+1) + ' · ' + esc(fmtHours(baseMin));
    }
    let syncTargetMin = 0;
    // The job's total time (ms). The common denominator of the bars; the engine computes it once at the start
    // and sends it and it does not change during the job.
    let syncJobTotalMs = 0;

    // ---- simultaneous limit ----
    function paintConc(){
      document.querySelectorAll('#hoursConc button[data-n]').forEach(b=>{
        const v = b.getAttribute('data-n');
        const on = concurrentCustom ? v==='custom' : (+v === maxConcurrent);
        Object.assign(b.style, on ? BSEG_ON : BSEG_OFF);
      });
      document.getElementById('hoursConcCustom').style.display = concurrentCustom ? '' : 'none';
    }
    // The limit is written to disk INSTANTLY. The reason: the main process runs the hour sync and reads the simultaneous
    // count from settings.boostMaxGames. This value used to be written only with "Preset olarak
    // kaydet", so while the screen said 8 the sync could be running with 32.
    function writeLimit(){
      concUserTouched = true;
      window.imu.settings.set({ boostMaxGames: maxConcurrent }).then(s=>{ if (s) appSettings = s; }).catch(()=>{});
    }
    document.querySelectorAll('#hoursConc button[data-n]').forEach(b=>b.addEventListener('click', ()=>{
      const v = b.getAttribute('data-n');
      if (v === 'custom'){ concurrentCustom = true; }
      else { concurrentCustom = false; maxConcurrent = +v; writeLimit(); }
      paintConc(); renderActiveBox();
    }));
    document.getElementById('hoursConcCustom').addEventListener('change', (e)=>{
      maxConcurrent = Math.max(1, Math.min(32, +e.target.value || 1));
      e.target.value = maxConcurrent; writeLimit(); renderActiveBox();
    });
    paintConc();

    // ---- boost duration ----
    const bH = document.getElementById('hoursH'), bM = document.getElementById('hoursM'), bS = document.getElementById('hoursS');
    // hourDurSec 0 = UNLIMITED: the session continues until it is stopped (same as Ayarlar > "Varsayılan hedef
    // süre" > Sınırsız). The page used to be unable to show unlimited; the setting was dead.
    function writeSegs(){
      if (!hourDurSec){ bH.value='∞'; bM.value='--'; bS.value='--'; paintBoostPresets(); return; }
      const h=Math.floor(hourDurSec/3600), m=Math.floor((hourDurSec%3600)/60), s=hourDurSec%60;
      bH.value=String(h).padStart(2,'0'); bM.value=String(m).padStart(2,'0'); bS.value=String(s).padStart(2,'0');
      paintBoostPresets();
    }
    function writeDuration(){
      boostUserTouched = true;
      window.imu.settings.set({ boostDurationSec: hourDurSec }).then(s=>{ if (s) appSettings = s; }).catch(()=>{});
    }
    function commitDurInput(){
      // When unlimited, entering and leaving the field must not turn the duration into 1 minute
      if (!hourDurSec && String(bH.value).trim() === '∞') return;
      const h=parseInt(bH.value,10)||0, m=Math.min(59,parseInt(bM.value,10)||0), s=Math.min(59,parseInt(bS.value,10)||0);
      hourDurSec = Math.max(60, h*3600 + m*60 + s);
      writeDuration();
      writeSegs(); renderActiveBox();
    }
    [bH,bM,bS].forEach(el=>{
      el.addEventListener('blur', commitDurInput);
      el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ commitDurInput(); el.blur(); } });
      el.addEventListener('focus', ()=>el.select());
    });
    function paintBoostPresets(){
      const hours = hourDurSec/3600;
      document.querySelectorAll('#hoursPresets button[data-h]').forEach(b=>{
        const h = b.getAttribute('data-h');
        const on = h==='inf' ? !hourDurSec
                 : h==='custom' ? (!!hourDurSec && ![6,12,18,24].includes(hours)) : (+h === hours);
        Object.assign(b.style, on ? BSEG_ON : BSEG_OFF);
        // In sequential idling the duration is PER GAME; unlimited would mean staying in the first game forever.
        if (h === 'inf'){
          const closed = !!boostFlags.seqIdle;
          b.style.opacity = closed ? '.35' : '1';
          b.style.pointerEvents = closed ? 'none' : '';
          b.title = closed ? t('Sıralı bekletmede süre oyun başınadır; sınırsız seçilemez.') : t('Sınırsız: sen durdurana kadar sürer');
        }
      });
    }
    document.querySelectorAll('#hoursPresets button[data-h]').forEach(b=>b.addEventListener('click', ()=>{
      const h = b.getAttribute('data-h');
      if (h === 'custom'){ if (!hourDurSec){ hourDurSec = 3600; writeDuration(); writeSegs(); } bH.focus(); return; }
      hourDurSec = h === 'inf' ? 0 : (+h)*3600; writeDuration(); writeSegs(); renderActiveBox();
    }));
    writeSegs();

    // ---- Behaviour / Privacy switches ----
    // Applies the Ayarlar > Saat Yükseltici preferences ("Varsayılan hedef süre" included).
    let boostUserTouched = false, concUserTouched = false;
    // degisen: the keys changed with Kaydet in Ayarlar. When "Varsayılan hedef süre" is saved the duration
    // on the page moves to it too; it used to be that the page read the last used duration so this setting
    // changed nothing.
    function applyBoostSettings(changed){
      if (typeof appSettings !== 'object' || !appSettings) return;
      const d = changed || [];
      if (d.includes('boostTarget')){
        const goal = appSettings.boostTarget === 'inf' ? 0 : (+appSettings.boostTarget || 0) * 3600;
        const suitable = boostFlags.seqIdle && !goal ? 3600 : goal;
        if (suitable !== hourDurSec || +appSettings.boostDurationSec !== suitable){
          hourDurSec = suitable; writeSegs();
          window.imu.settings.set({ boostDurationSec: hourDurSec }).then(s=>{ if (s) appSettings = s; }).catch(()=>{});
        }
      } else if (!boostUserTouched){
        // First the saved duration (0 = unlimited), otherwise the "Varsayılan hedef süre" in Ayarlar.
        const saved = appSettings.boostDurationSec;
        if (+saved >= 60 || (saved === 0 && !boostFlags.seqIdle)){
          if (hourDurSec !== +saved){ hourDurSec = +saved; writeSegs(); }
        } else if (appSettings.boostTarget){
          // 'inf' = unlimited → duration 0, behaves as if "Süre dolunca otomatik durdur" were off
          const t = appSettings.boostTarget;
          const hours = t === 'inf' ? 0 : (+t || 0);
          if (hours > 0 && hourDurSec !== hours*3600){ hourDurSec = hours*3600; writeSegs(); }
        }
      }
      // concUserTouched: if the user chose the limit in this session the old value coming from disk does not
      // overwrite it. It used to be unconditional; leaving the Saat tab and coming back made the selection
      // return to 32, because loadHours calls applyBoostFlags -> applyBoostSettings on every entry.
      if ((!concUserTouched || d.includes('boostMaxGames')) && appSettings.boostMaxGames) maxConcurrent = +appSettings.boostMaxGames;
      paintConc();
      renderActiveBox();
    }

    async function applyBoostFlags(){
      const s = await window.imu.settings.get().catch(()=>null);
      if (s){
        Object.keys(boostFlags).forEach(k=>{ if (s[k] != null) boostFlags[k] = !!s[k]; });
        if (s.boostMaxGames){ maxConcurrent = +s.boostMaxGames; }
        if (typeof appSettings === 'object') appSettings = s;
        applyBoostSettings();
      }
      document.querySelectorAll('#tab-hours .e-toggle[data-bset]').forEach(el=>{
        el.classList.toggle('on', !!boostFlags[el.getAttribute('data-bset')]);
      });
      paintHourGate();
      paintConc();
      renderSyncSettings();
      // The settings are ready now; if the library came earlier restore the selection here.
      if (restoreBoostList()){ renderHoursList(); renderActiveBox(); }
    }
    // Rows that depend on another switch: dimmed and unclickable while it is off.
    // A switch looking on and doing nothing was met in 1.1.10 at the achievement unlock
    // interval; we close the same trap here too.
    function paintHourGate(){
      const rowEl = document.getElementById('hoursLoopRow');
      if (!rowEl) return;
      const isOpen = !!boostFlags.seqIdle;
      rowEl.style.opacity = isOpen ? '1' : '.4';
      rowEl.style.pointerEvents = isOpen ? '' : 'none';
      rowEl.title = isOpen ? '' : 'Sıralı bekletme modu kapalıyken kuyruk yoktur.';
    }
    document.querySelectorAll('#tab-hours .e-toggle[data-bset]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const key = el.getAttribute('data-bset');
        const val = !boostFlags[key];
        boostFlags[key] = val;
        el.classList.toggle('on', val);
        if (key === 'seqIdle' && val && !hourDurSec){ hourDurSec = 3600; writeDuration(); }
        if (key === 'seqIdle') writeSegs();
        const next = await window.imu.settings.set({ [key]: val }).catch(()=>null);
        if (next) appSettings = next;
        paintHourGate();
        renderSyncSettings();
        renderActiveBox();
      });
    });

    // "Preset olarak kaydet" - writes the current configuration (limit, duration, switches, selected games)
    document.getElementById('hoursSavePreset').onclick = async ()=>{
      await window.imu.settings.set({
        boostMaxGames: maxConcurrent,
        boostDurationSec: hourDurSec,
        boostGameIds: selectedHours.map(g=>g.appid),
        ...boostFlags,
      }).catch(()=>{});
      if (typeof toast === 'function') toast('Preset kaydedildi').done(tf('# oyun', selectedHours.length) + ' · '
        + (hourDurSec ? fmtHMS(hourDurSec) : '∞') + ' · ' + tf('en fazla # eşzamanlı', maxConcurrent));
    };

    // ---- start / stop ----
    async function startBoost(){
      if (!selectedHours.length) return;
      // In sequential idling mode the whole queue cycles in turn; when off the first `maxConcurrent` games run together.
      const pool = boostFlags.seqIdle ? selectedHours : selectedHours.slice(0, maxConcurrent);
      // playtimeMin is needed for hour sync (ownedGames gives it in minutes)
      const games = pool.map(g=>({ appid:g.appid, name:g.name, playtimeMin: g.playtimeForever || 0 }));

      // If hour sync is on show what will happen BEFORE starting - the steps and total time
      // can take hours, it would not be right to start without the user confirming.
      const syncOn = appSettings && appSettings.boostSync && !boostFlags.seqIdle;
      if (syncOn){
        const plan = await E.boostSyncPlan(games, appSettings.boostSyncMode || 'highest',
                                           appSettings.boostSyncTargetHours).catch(e=>({ ok:false, error:(e&&e.message) }));
        if (!plan || !plan.ok){
          edgeConfirm({ tag:'Hata', danger:true, title:'Eşitleme planı hesaplanamadı',
                        body:(plan && plan.error) || 'Bilinmeyen hata.', confirmText:'Tamam', cancelText:'Kapat' });
          return;
        }
        if (plan.behind){
          let bodyEl, title;
          if (plan.strategyName === 'parallel'){
            // Show the first few endings - so the user sees what will end when
            const firsts = (plan.finishTimes||[]).slice(0,6).map(b=>
              '  · ' + b.name + ': ' + tf('# sonra', fmtHours(Math.round(b.finishMs/60000)))).join('\n');
            const remainingNumber = Math.max(0, (plan.finishTimes||[]).length-6);
            title = tf('# oyun # hedefine çekilecek', plan.behind, fmtHours(plan.targetMin));
            bodyEl = t('Seçili oyunların hepsi aynı anda çalışır. Hedefe ulaşan oyun listeden çıkar, kalanlar devam eder.') + '\n\n'
                  + tf('Aynı anda açık: # oyun', plan.firstActive) + '\n\n'
                  + t('Tahmini bitiş sırası:') + '\n' + firsts
                  + (remainingNumber ? ('\n  · ' + tf('ve # oyun daha', remainingNumber)) : '')
                  + '\n\n' + t('Hepsinin tamamlanması:') + ' ' + fmtHours(Math.round(plan.totalMs/60000));
          } else {
            const lines = (plan.steps||[]).map((st,i)=>
              '  ' + (i+1) + '. ' + tf('# oyun: # → #', st.count, fmtHours(st.fromMin), fmtHours(st.toMin))
              + '  (' + fmtHours(st.toMin-st.fromMin) + ')').join('\n');
            title = tf('# oyun # hedefine çekilecek', plan.behind, fmtHours(plan.targetMin));
            bodyEl = t('En geride kalan oyun tek başına öne çekilir; bir sonrakine yetişince ikisi birlikte devam eder ve sonunda hepsi aynı noktada buluşur.') + '\n\n' + lines
                  + '\n\n' + t('Toplam süre:') + ' ' + fmtHours(Math.round(plan.totalMs/60000));
          }
          const ok = await edgeConfirm({
            tag:'Saat Eşitleme', title: title, body: bodyEl,
            warn: 'Bu süre boyunca uygulama açık kalmalı. İstediğin an durdurabilirsin.',
            confirmText:'Eşitlemeyi Başlat',
          });
          if (!ok) return;
        }
      }

      if (boostFlags.seqIdle) E.boostStartSeq(games, (hourDurSec || 3600)*1000, boostFlags.loopQueue);
      else {
        // The whole selection goes too: if "at most at once" changes while the job runs the main process
        // cuts the list again from here (when increased the new games open too).
        const allOfIt = selectedHours.map(g=>({ appid:g.appid, name:g.name, playtimeMin: g.playtimeForever || 0 }));
        E.boostStart(games.map(g=>g.appid), hourDurSec*1000, games, allOfIt);
      }
      notify('boost', 'Saat Yükseltme Başladı', tf('# oyun', games.length));
      pushFeed('hours', 'Saat Yükseltici', syncOn ? tf('# oyunla başladı (eşitleme açık).', games.length) : tf('# oyunla başladı.', games.length), 'Çalışıyor');
    }
    // Writes minutes as "12 sa 30 dk", with the units of the interface language
    function fmtHours(min){
      const m = Math.max(0, Math.round(min||0));
      const h = Math.floor(m/60), r = m%60;
      return h ? (durationUnit(h, 'sa') + (r ? (' ' + durationUnit(r, 'dk')) : '')) : durationUnit(r, 'dk');
    }

    // ITEM 14: the sync state is now in the FIXED bottom bar; it does not push the page layout.
    // ITEM 3: in the parallel strategy there are no steps - it shows how many games finished and how many are running.
    function msShort(ms){
      const dk = Math.max(0, Math.round(ms/60000));
      const g = Math.floor(dk/1440), hoursVal = Math.floor((dk%1440)/60), m = dk%60;
      if (g) return durationUnit(g, 'gün') + ' ' + durationUnit(hoursVal, 'sa');
      if (hoursVal) return durationUnit(hoursVal, 'sa') + ' ' + durationUnit(m, 'dk');
      return durationUnit(m, 'dk');
    }
    if (E.onBoostSync) E.onBoostSync((d)=>{
      const bar = document.getElementById('hoursSyncBar');
      if (!bar) return;
      if (!d.running){
        bar.style.display = 'none';
        syncGameInfo = new Map(); syncTargetMin = 0; syncJobTotalMs = 0;
        // The completion notification comes with the account event (genel.js > onHesapOlayi).
        renderActiveBox();
        return;
      }
      bar.style.display = 'flex';
      syncTargetMin = d.targetMin || 0;
      if (d.jobTotalMs) syncJobTotalMs = d.jobTotalMs;
      const txt = document.getElementById('hoursSyncText');
      const eta = document.getElementById('hoursSyncEta');
      const fill = document.getElementById('hoursSyncBarFill');

      if (d.strategyName === 'parallel'){
        syncGameInfo = new Map((d.gameEntries||[]).map(o=>[o.appid, o]));
        const percent = d.totalSum ? Math.round(d.finishedOne/d.totalSum*100) : 0;
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">'+esc(tf('Saat eşitleme · hedef #', fmtHours(d.targetMin)))+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E">'
          + esc(tf('# / # oyun hedefte · # oyun çalışıyor', d.finishedOne, d.totalSum, d.activeTotal)) + '</span>';
        if (eta) eta.textContent = d.remainingMs ? msShort(d.remainingMs) : t('bitiyor');
        if (fill) fill.style.width = percent + '%';
      } else {
        // G13: the game ledger comes on the stepped side too. This place used to be emptied and
        // every game showed the same session percentage; a game with 1 hour left to the target and a game with
        // 47 hours left were on the same bar.
        syncGameInfo = new Map((d.gameEntries||[]).map(o=>[o.appid, o]));
        const percent = d.steps ? Math.round((d.step-1)/d.steps*100) : 0;
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">'+esc(tf('Eşitleme adımı # / #', d.step, d.steps))+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E">'+esc(tf('# oyun', d.ids.length) + ' · '
          + fmtHours(d.fromMin) + ' → ' + fmtHours(d.toMin) + ' · ' + tf('hedef #', fmtHours(d.targetMin)))+'</span>';
        if (eta) eta.textContent = d.stepMs ? msShort(Math.max(0, d.stepMs-(Date.now()-(d.startedAt||Date.now())))) : '-';
        if (fill) fill.style.width = percent + '%';
      }
      renderActiveBox();
    });
    document.getElementById('btnBoostStart').onclick = startBoost;
    document.getElementById('btnBoostStop').onclick = () => {
      E.boostStop(); E.boostStopSeq();
      notify('boost', 'Saat Yükseltme Durdu', '');
      pushFeed('hours', 'Saat Yükseltici', 'Durduruldu.', 'Durdu');
    };

    // "Oturumu otomatik yenile" is now in the main process and per account (main.js > boostTimeUp).
    // While it stayed here it only worked on the account on screen and while the window was open; the "stopped"
    // info that came when the account changed could trigger the renewal on the WRONG account.
    function onHourTick(data){
      boostState = data;
      if (boostTimerUI) clearInterval(boostTimerUI);
      if (data.running){
        boostTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) renderActiveBox(); }, 1000);
      }
      renderActiveBox();
    }
    E.onBoostTick(onHourTick);
    E.onHourFarmTick((data) => onHourTick({ running: data.running, activeAppids: data.activeAppids, startedAt: Date.now()-(data.elapsedMs||0), durationMs: data.durationMs }));
