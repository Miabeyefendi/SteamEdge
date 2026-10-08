    // ================= SAAT YÜKSELTİCİ (HOUR BOOSTER) =================
    // Simultaneous = all together (stops at the set time).
    // When "Sıralı bekletme modu" is on, FarmController cycles the games in turn with 'sequential'.
    let ownedGames = [], saatLoaded = false;
    let selectedSaat = [];
    let saatDurSec = 3600;
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

    function fmtHMS(sec){ const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=Math.max(0,sec%60); return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':'); }
    function monoHMS(sec){ return fmtHMS(sec).replace(/:/g, '<span style="color:#C2AAEE">:</span>'); }
    const hrsOf = (g) => yerelOndalik((g.playtimeForever||0)/60, 1);

    async function loadSaat(){
      await applyBoostFlags();
      if (saatLoaded){ renderSaatList(); renderActiveBox(); return; }
      const body = document.getElementById('saatListBody');
      body.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Steam\'e bağlanılıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ body.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(con.error)+'</div>'; return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'Kütüphane okunamadı.' }));
      if (!res.ok){ body.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(res.error)+'</div>'; return; }
      ownedGames = res.games; saatLoaded = true;
      restoreBoostList();
      renderSaatList(); renderSaatSelected();
    }
    document.getElementById('saatSearch').addEventListener('input', renderSaatList);

    // if the "Oyun listesini hatırla" setting is on the selection is persistent
    function persistBoostList(){
      if (appSettings && appSettings.rememberBoostList){
        window.imu.settings.set({ boostGameIds: selectedSaat.map(g=>g.appid) }).catch(()=>{});
      }
    }
    // Restores the saved game list.
    // NOTE: it is called both from loadSaat and from applyBoostFlags. The reason is a race
    // condition: the settings (appSettings) and the library (ownedGames) become ready at different moments;
    // so that the selection comes back whichever arrives first it is tried from both sides. It used to be
    // called only inside loadSaat and if the settings came late the user's saved
    // list looked EMPTY - and then selecting again by hand overwrote the saved one.
    function restoreBoostList(){
      if (!appSettings || !appSettings.rememberBoostList || !Array.isArray(appSettings.boostGameIds)) return false;
      if (!ownedGames.length) return false;      // the library has not arrived yet
      if (selectedSaat.length) return false;     // the user already selected, do not overwrite
      const ids = new Set(appSettings.boostGameIds);
      const bulunan = ownedGames.filter(g=>ids.has(g.appid));
      if (!bulunan.length) return false;
      selectedSaat = bulunan;
      return true;
    }

    // ---- library list ----
    function renderSaatList(){
      const q = document.getElementById('saatSearch').value.trim().toLowerCase();
      const body = document.getElementById('saatListBody');
      const selIds = new Set(selectedSaat.map(g=>g.appid));
      const filtered = (q ? ownedGames.filter(g=>g.name.toLowerCase().includes(q)) : ownedGames).slice(0,300);
      document.getElementById('saatFound').textContent = (q?filtered.length:ownedGames.length) + ' bulundu';
      if (!filtered.length){ body.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Sonuç yok.</div>'; return; }
      body.innerHTML = filtered.map(g=>{
        const on = selIds.has(g.appid);
        return '<div class="h-bd" data-appid="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px solid '+(on?BC.brand:BC.bd)+';background:'+(on?'#151C28':'transparent')+';cursor:pointer;margin-bottom:5px">'
          // Library Header ratio (920x430, ~2.14:1)
          + '<div style="width:59px;height:28px;flex-shrink:0;border-radius:8px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
            + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
            + '<span style="font-size:12px;font-weight:600;color:'+(on?BC.title:BC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(sureBirim(hrsOf(g), 'sa'))+'</span>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:13px;font-weight:700;color:'+(on?BC.ok:BC.off)+'">'+(on?'✓':'+')+'</span>'
          + '</div>';
      }).join('');
    }
    document.getElementById('saatListBody').addEventListener('click', (e)=>{
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
      const idx = selectedSaat.findIndex(g=>g.appid===appid);
      const on = idx < 0;
      if (!on) selectedSaat.splice(idx,1);
      else { const g = ownedGames.find(x=>x.appid===appid); if (g) selectedSaat.push(g); }
      const row = document.querySelector('#saatListBody [data-appid="'+appid+'"]');
      if (row) paintLibRow(row, on);
      persistBoostList();
      renderSaatSelected();
    }
    document.getElementById('saatClearQueue').onclick = ()=>{
      selectedSaat = []; persistBoostList();
      document.querySelectorAll('#saatListBody [data-appid]').forEach(r=>paintLibRow(r, false));
      renderSaatSelected();
    };

    function renderSaatSelected(){ renderActiveBox(); }

    // ---- ITEM 4: hour sync settings (in the page) ----
    // While sync is on "eszamanli limit" and "yukseltme suresi" are meaningless: the sync
    // algorithm decides both. So they are visually locked and the reason is written.
    function syncAyarlariCiz(){
      const acik = !!(appSettings && appSettings.boostSync) && !boostFlags.seqIdle;
      const opts = document.getElementById('saatSyncOpts');
      if (opts) opts.style.display = acik ? 'flex' : 'none';

      const mod = (appSettings && appSettings.boostSyncMode) || 'highest';
      const mSel = document.getElementById('saatSyncMode');
      if (mSel && mSel.value !== mod) mSel.value = mod;
      const tRow = document.getElementById('saatSyncTargetRow');
      if (tRow) tRow.style.display = (acik && mod === 'manual') ? 'flex' : 'none';
      const tIn = document.getElementById('saatSyncTarget');
      if (tIn && document.activeElement !== tIn) tIn.value = (appSettings && appSettings.boostSyncTargetHours) || 100;
      const stSel = document.getElementById('saatSyncStrategy');
      const st = (appSettings && appSettings.boostSyncStrategy) || 'parallel';
      if (stSel && stSel.value !== st) stSel.value = st;

      kilitle(document.getElementById('saatConcBlock'), acik,
              'Eşitleme açık: oyunları eşitleme çalıştırır (en fazla 32 eşzamanlı).');
      kilitle(document.getElementById('saatDurBlock'), acik,
              'Eşitleme açık: süreyi hedef saat belirler.');
    }
    function kilitle(blok, kilitli, sebep){
      if (!blok) return;
      blok.style.opacity = kilitli ? '0.42' : '1';
      blok.style.pointerEvents = kilitli ? 'none' : '';
      let not = blok.querySelector('[data-kilit-not]');
      if (kilitli){
        if (!not){
          not = document.createElement('span');
          not.setAttribute('data-kilit-not','1');
          not.style.cssText = 'font-size:10.5px;line-height:1.5;color:#B37E24';
          blok.appendChild(not);
        }
        not.textContent = sebep;
      } else if (not) not.remove();
    }
    (function baglaSyncAyarlari(){
      const mSel = document.getElementById('saatSyncMode');
      if (mSel) mSel.addEventListener('change', ()=>{
        appSettings.boostSyncMode = mSel.value;
        window.imu.settings.set({ boostSyncMode: mSel.value }).catch(()=>{});
        syncAyarlariCiz();
      });
      const tIn = document.getElementById('saatSyncTarget');
      if (tIn) tIn.addEventListener('change', ()=>{
        const v = Math.max(1, Math.min(20000, +tIn.value || 100));
        tIn.value = v; appSettings.boostSyncTargetHours = v;
        window.imu.settings.set({ boostSyncTargetHours: v }).catch(()=>{});
      });
      const stSel = document.getElementById('saatSyncStrategy');
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
      document.getElementById('statOyunSayisi').textContent = boostState.running ? activeIds.length : selectedSaat.length;

      // Time indicators
      const elapsed = boostState.running ? Math.floor((Date.now()-(boostState.startedAt||Date.now()))/1000) : 0;
      const left = boostState.running && boostState.durationMs
        ? Math.max(0, Math.floor((boostState.durationMs - (Date.now()-(boostState.startedAt||Date.now())))/1000))
        : (selectedSaat.length ? (boostFlags.seqIdle ? saatDurSec*selectedSaat.length : saatDurSec) : 0);
      document.getElementById('statToplamSure').innerHTML = monoHMS(elapsed);
      const sinirsiz = boostState.running ? (!boostState.durationMs && !boostState.sync && !syncOyunBilgi.size) : !saatDurSec;
      document.getElementById('saatRemain').innerHTML = sinirsiz ? '∞' : monoHMS(left);

      if (!selectedSaat.length){
        box.innerHTML = '<div style="grid-column:1/-1;padding:48px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Kuyruk boş</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Soldaki kütüphaneden oyun seç - seçtiklerin burada görünür.</span></div>';
        return;
      }
      const dur = boostState.durationMs || saatDurSec*1000;
      const pct = boostState.running && dur ? Math.min(100, Math.round((Date.now()-(boostState.startedAt||Date.now()))/dur*100)) : 0;
      // While sync is on the bars sit on the SHARED TIMELINE: the measure is the ratio of that game's remaining
      // time to the job's TOTAL time. In a 34 hour job the bar of a game that will finish after 3 hours
      // is almost full from the start, the bar of the game that will run to the end is empty.
      // So the bars are comparable with each other and every game reaches 100% at the moment it finishes.
      //
      // Measuring by the game's own path (gained / distance to the target) was tried and ABANDONED:
      // in that measure all of them start from 0%, so which game would finish early was never
      // visible on screen - a 3 hour job and a 34 hour job were the same empty bar.
      function oyunYuzde(g, aktif){
        const bilgi = syncOyunBilgi.get(g.appid);
        if (bilgi && syncIsToplamMs > 0){
          if (bilgi.bitti) return 100;
          const kalan = Math.max(0, bilgi.kalanMs || 0);
          return Math.max(0, Math.min(100, Math.round((1 - kalan / syncIsToplamMs) * 100)));
        }
        return aktif ? pct : 0;
      }
      box.innerHTML = selectedSaat.map((g,i)=>{
        const on = activeSet.has(g.appid);
        const bd = on ? BC.brand : BC.bd;
        const p = oyunYuzde(g, on);
        return '<div style="border:1px solid '+bd+';border-radius:12px;background:'+(on?BC.s1:BC.bgAlt)+';padding:14px;display:flex;align-items:center;gap:12px;min-height:84px">'
          // Library Header ratio (920x430, ~2.14:1)
          + '<div style="width:97px;height:45px;flex-shrink:0;border-radius:10px;border:1px solid '+bd+';background:repeating-linear-gradient(135deg,#151C28 0 6px,#101621 6px 12px);overflow:hidden">'
            + gameThumb(g.appid) + '</div>'
          + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
              + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0">'
                + '<span style="font-size:12px;font-weight:600;color:'+(on?BC.title:BC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
                + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+altSatir(g, on, i, elapsed)+'</span>'
              + '</div>'
              + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
                + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:'+(on?BC.ok:BC.off)+'">'+fmtYuzde(p)+'</span>'
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
      selectedSaat = selectedSaat.filter(g=>g.appid!==id);
      persistBoostList();
      const row = document.querySelector('#saatListBody [data-appid="'+id+'"]');
      if (row) paintLibRow(row, false);
      renderActiveBox();
    });

    // ITEM 15: it used to write only "the time elapsed in that session"; the game's CURRENT total
    // time was not visible. Now start + elapsed is shown, and while sync is on how much
    // is left to the target is written too. The values during sync come from the main side
    // (since each game runs for a different time a single "elapsed" is not enough).
    let syncOyunBilgi = new Map();   // appid -> { suankiMin, kalanMs, bitti }
    function altSatir(g, on, i, elapsed){
      const bilgi = syncOyunBilgi.get(g.appid);
      if (bilgi){
        if (bilgi.bitti) return esc(tf('hedefe ulaştı · # ✓', fmtHours(bilgi.suankiMin)));
        const hedef = syncHedefMin ? (' → ' + fmtHours(syncHedefMin)) : '';
        return esc(fmtHours(bilgi.suankiMin) + hedef + ' · ' + t(on ? 'çalışıyor' : 'sırada'));
      }
      // Sync is running but this game is not in the list, so it is already above the target
      if (syncHedefMin && (g.playtimeForever || 0) >= syncHedefMin){
        return esc(fmtHours(g.playtimeForever || 0) + ' · ' + t('zaten hedefte'));
      }
      // When there is no sync: the time that comes from the library + the time elapsed in this session
      const tabanMin = g.playtimeForever || 0;
      if (on) return esc(fmtHours(tabanMin + Math.floor(elapsed/60)) + ' · ' + t('çalışıyor') + ' ' + fmtHMS(elapsed));
      return '#' + (i+1) + ' · ' + esc(fmtHours(tabanMin));
    }
    let syncHedefMin = 0;
    // The job's total time (ms). The common denominator of the bars; the engine computes it once at the start
    // and sends it and it does not change during the job.
    let syncIsToplamMs = 0;

    // ---- simultaneous limit ----
    function paintConc(){
      document.querySelectorAll('#saatConc button[data-n]').forEach(b=>{
        const v = b.getAttribute('data-n');
        const on = concurrentCustom ? v==='custom' : (+v === maxConcurrent);
        Object.assign(b.style, on ? BSEG_ON : BSEG_OFF);
      });
      document.getElementById('saatConcCustom').style.display = concurrentCustom ? '' : 'none';
    }
    // The limit is written to disk INSTANTLY. The reason: the main process runs the hour sync and reads the simultaneous
    // count from settings.boostMaxGames. This value used to be written only with "Preset olarak
    // kaydet", so while the screen said 8 the sync could be running with 32.
    function limitiYaz(){
      concUserTouched = true;
      window.imu.settings.set({ boostMaxGames: maxConcurrent }).then(s=>{ if (s) appSettings = s; }).catch(()=>{});
    }
    document.querySelectorAll('#saatConc button[data-n]').forEach(b=>b.addEventListener('click', ()=>{
      const v = b.getAttribute('data-n');
      if (v === 'custom'){ concurrentCustom = true; }
      else { concurrentCustom = false; maxConcurrent = +v; limitiYaz(); }
      paintConc(); renderActiveBox();
    }));
    document.getElementById('saatConcCustom').addEventListener('change', (e)=>{
      maxConcurrent = Math.max(1, Math.min(32, +e.target.value || 1));
      e.target.value = maxConcurrent; limitiYaz(); renderActiveBox();
    });
    paintConc();

    // ---- boost duration ----
    const bH = document.getElementById('saatH'), bM = document.getElementById('saatM'), bS = document.getElementById('saatS');
    // saatDurSec 0 = UNLIMITED: the session continues until it is stopped (same as Ayarlar > "Varsayılan hedef
    // süre" > Sınırsız). The page used to be unable to show unlimited; the setting was dead.
    function writeSegs(){
      if (!saatDurSec){ bH.value='∞'; bM.value='--'; bS.value='--'; paintBoostPresets(); return; }
      const h=Math.floor(saatDurSec/3600), m=Math.floor((saatDurSec%3600)/60), s=saatDurSec%60;
      bH.value=String(h).padStart(2,'0'); bM.value=String(m).padStart(2,'0'); bS.value=String(s).padStart(2,'0');
      paintBoostPresets();
    }
    function sureyiYaz(){
      boostUserTouched = true;
      window.imu.settings.set({ boostDurationSec: saatDurSec }).then(s=>{ if (s) appSettings = s; }).catch(()=>{});
    }
    function commitDurInput(){
      // When unlimited, entering and leaving the field must not turn the duration into 1 minute
      if (!saatDurSec && String(bH.value).trim() === '∞') return;
      const h=parseInt(bH.value,10)||0, m=Math.min(59,parseInt(bM.value,10)||0), s=Math.min(59,parseInt(bS.value,10)||0);
      saatDurSec = Math.max(60, h*3600 + m*60 + s);
      sureyiYaz();
      writeSegs(); renderActiveBox();
    }
    [bH,bM,bS].forEach(el=>{
      el.addEventListener('blur', commitDurInput);
      el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ commitDurInput(); el.blur(); } });
      el.addEventListener('focus', ()=>el.select());
    });
    function paintBoostPresets(){
      const hours = saatDurSec/3600;
      document.querySelectorAll('#saatPresets button[data-h]').forEach(b=>{
        const h = b.getAttribute('data-h');
        const on = h==='inf' ? !saatDurSec
                 : h==='custom' ? (!!saatDurSec && ![6,12,18,24].includes(hours)) : (+h === hours);
        Object.assign(b.style, on ? BSEG_ON : BSEG_OFF);
        // In sequential idling the duration is PER GAME; unlimited would mean staying in the first game forever.
        if (h === 'inf'){
          const kapali = !!boostFlags.seqIdle;
          b.style.opacity = kapali ? '.35' : '1';
          b.style.pointerEvents = kapali ? 'none' : '';
          b.title = kapali ? t('Sıralı bekletmede süre oyun başınadır; sınırsız seçilemez.') : t('Sınırsız: sen durdurana kadar sürer');
        }
      });
    }
    document.querySelectorAll('#saatPresets button[data-h]').forEach(b=>b.addEventListener('click', ()=>{
      const h = b.getAttribute('data-h');
      if (h === 'custom'){ if (!saatDurSec){ saatDurSec = 3600; sureyiYaz(); writeSegs(); } bH.focus(); return; }
      saatDurSec = h === 'inf' ? 0 : (+h)*3600; sureyiYaz(); writeSegs(); renderActiveBox();
    }));
    writeSegs();

    // ---- Behaviour / Privacy switches ----
    // Applies the Ayarlar > Saat Yükseltici preferences ("Varsayılan hedef süre" included).
    let boostUserTouched = false, concUserTouched = false;
    // degisen: the keys changed with Kaydet in Ayarlar. When "Varsayılan hedef süre" is saved the duration
    // on the page moves to it too; it used to be that the page read the last used duration so this setting
    // changed nothing.
    function applyBoostSettings(degisen){
      if (typeof appSettings !== 'object' || !appSettings) return;
      const d = degisen || [];
      if (d.includes('boostTarget')){
        const hedef = appSettings.boostTarget === 'inf' ? 0 : (+appSettings.boostTarget || 0) * 3600;
        const uygun = boostFlags.seqIdle && !hedef ? 3600 : hedef;
        if (uygun !== saatDurSec || +appSettings.boostDurationSec !== uygun){
          saatDurSec = uygun; writeSegs();
          window.imu.settings.set({ boostDurationSec: saatDurSec }).then(s=>{ if (s) appSettings = s; }).catch(()=>{});
        }
      } else if (!boostUserTouched){
        // First the saved duration (0 = unlimited), otherwise the "Varsayılan hedef süre" in Ayarlar.
        const kayitli = appSettings.boostDurationSec;
        if (+kayitli >= 60 || (kayitli === 0 && !boostFlags.seqIdle)){
          if (saatDurSec !== +kayitli){ saatDurSec = +kayitli; writeSegs(); }
        } else if (appSettings.boostTarget){
          // 'inf' = unlimited → duration 0, behaves as if "Süre dolunca otomatik durdur" were off
          const t = appSettings.boostTarget;
          const hours = t === 'inf' ? 0 : (+t || 0);
          if (hours > 0 && saatDurSec !== hours*3600){ saatDurSec = hours*3600; writeSegs(); }
        }
      }
      // concUserTouched: if the user chose the limit in this session the old value coming from disk does not
      // overwrite it. It used to be unconditional; leaving the Saat tab and coming back made the selection
      // return to 32, because loadSaat calls applyBoostFlags -> applyBoostSettings on every entry.
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
      document.querySelectorAll('#tab-saat .e-toggle[data-bset]').forEach(el=>{
        el.classList.toggle('on', !!boostFlags[el.getAttribute('data-bset')]);
      });
      saatKapiBoya();
      paintConc();
      syncAyarlariCiz();
      // The settings are ready now; if the library came earlier restore the selection here.
      if (restoreBoostList()){ renderSaatList(); renderActiveBox(); }
    }
    // Rows that depend on another switch: dimmed and unclickable while it is off.
    // A switch looking on and doing nothing was met in 1.1.10 at the achievement unlock
    // interval; we close the same trap here too.
    function saatKapiBoya(){
      const satir = document.getElementById('saatLoopRow');
      if (!satir) return;
      const acik = !!boostFlags.seqIdle;
      satir.style.opacity = acik ? '1' : '.4';
      satir.style.pointerEvents = acik ? '' : 'none';
      satir.title = acik ? '' : 'Sıralı bekletme modu kapalıyken kuyruk yoktur.';
    }
    document.querySelectorAll('#tab-saat .e-toggle[data-bset]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const key = el.getAttribute('data-bset');
        const val = !boostFlags[key];
        boostFlags[key] = val;
        el.classList.toggle('on', val);
        if (key === 'seqIdle' && val && !saatDurSec){ saatDurSec = 3600; sureyiYaz(); }
        if (key === 'seqIdle') writeSegs();
        const next = await window.imu.settings.set({ [key]: val }).catch(()=>null);
        if (next) appSettings = next;
        saatKapiBoya();
        syncAyarlariCiz();
        renderActiveBox();
      });
    });

    // "Preset olarak kaydet" - writes the current configuration (limit, duration, switches, selected games)
    document.getElementById('saatSavePreset').onclick = async ()=>{
      await window.imu.settings.set({
        boostMaxGames: maxConcurrent,
        boostDurationSec: saatDurSec,
        boostGameIds: selectedSaat.map(g=>g.appid),
        ...boostFlags,
      }).catch(()=>{});
      if (typeof toast === 'function') toast('Preset kaydedildi').done(tf('# oyun', selectedSaat.length) + ' · '
        + (saatDurSec ? fmtHMS(saatDurSec) : '∞') + ' · ' + tf('en fazla # eşzamanlı', maxConcurrent));
    };

    // ---- start / stop ----
    async function startBoost(){
      if (!selectedSaat.length) return;
      // In sequential idling mode the whole queue cycles in turn; when off the first `maxConcurrent` games run together.
      const pool = boostFlags.seqIdle ? selectedSaat : selectedSaat.slice(0, maxConcurrent);
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
          let govde, baslik;
          if (plan.strateji === 'parallel'){
            // Show the first few endings - so the user sees what will end when
            const ilkler = (plan.bitisler||[]).slice(0,6).map(b=>
              '  · ' + b.name + ': ' + tf('# sonra', fmtHours(Math.round(b.bitisMs/60000)))).join('\n');
            const kalanSayi = Math.max(0, (plan.bitisler||[]).length-6);
            baslik = tf('# oyun # hedefine çekilecek', plan.behind, fmtHours(plan.targetMin));
            govde = t('Seçili oyunların hepsi aynı anda çalışır. Hedefe ulaşan oyun listeden çıkar, kalanlar devam eder.') + '\n\n'
                  + tf('Aynı anda açık: # oyun', plan.ilkAktif) + '\n\n'
                  + t('Tahmini bitiş sırası:') + '\n' + ilkler
                  + (kalanSayi ? ('\n  · ' + tf('ve # oyun daha', kalanSayi)) : '')
                  + '\n\n' + t('Hepsinin tamamlanması:') + ' ' + fmtHours(Math.round(plan.totalMs/60000));
          } else {
            const lines = (plan.steps||[]).map((st,i)=>
              '  ' + (i+1) + '. ' + tf('# oyun: # → #', st.count, fmtHours(st.fromMin), fmtHours(st.toMin))
              + '  (' + fmtHours(st.toMin-st.fromMin) + ')').join('\n');
            baslik = tf('# oyun # hedefine çekilecek', plan.behind, fmtHours(plan.targetMin));
            govde = t('En geride kalan oyun tek başına öne çekilir; bir sonrakine yetişince ikisi birlikte devam eder ve sonunda hepsi aynı noktada buluşur.') + '\n\n' + lines
                  + '\n\n' + t('Toplam süre:') + ' ' + fmtHours(Math.round(plan.totalMs/60000));
          }
          const ok = await edgeConfirm({
            tag:'Saat Eşitleme', title: baslik, body: govde,
            warn: 'Bu süre boyunca uygulama açık kalmalı. İstediğin an durdurabilirsin.',
            confirmText:'Eşitlemeyi Başlat',
          });
          if (!ok) return;
        }
      }

      if (boostFlags.seqIdle) E.boostStartSeq(games, (saatDurSec || 3600)*1000, boostFlags.loopQueue);
      else {
        // The whole selection goes too: if "at most at once" changes while the job runs the main process
        // cuts the list again from here (when increased the new games open too).
        const tumu = selectedSaat.map(g=>({ appid:g.appid, name:g.name, playtimeMin: g.playtimeForever || 0 }));
        E.boostStart(games.map(g=>g.appid), saatDurSec*1000, games, tumu);
      }
      notify('boost', 'Saat Yükseltme Başladı', tf('# oyun', games.length));
      pushFeed('saat', 'Saat Yükseltici', syncOn ? tf('# oyunla başladı (eşitleme açık).', games.length) : tf('# oyunla başladı.', games.length), 'Çalışıyor');
    }
    // Writes minutes as "12 sa 30 dk", with the units of the interface language
    function fmtHours(min){
      const m = Math.max(0, Math.round(min||0));
      const h = Math.floor(m/60), r = m%60;
      return h ? (sureBirim(h, 'sa') + (r ? (' ' + sureBirim(r, 'dk')) : '')) : sureBirim(r, 'dk');
    }

    // ITEM 14: the sync state is now in the FIXED bottom bar; it does not push the page layout.
    // ITEM 3: in the parallel strategy there are no steps - it shows how many games finished and how many are running.
    function msKisa(ms){
      const dk = Math.max(0, Math.round(ms/60000));
      const g = Math.floor(dk/1440), sa = Math.floor((dk%1440)/60), m = dk%60;
      if (g) return sureBirim(g, 'gün') + ' ' + sureBirim(sa, 'sa');
      if (sa) return sureBirim(sa, 'sa') + ' ' + sureBirim(m, 'dk');
      return sureBirim(m, 'dk');
    }
    if (E.onBoostSync) E.onBoostSync((d)=>{
      const bar = document.getElementById('saatSyncBar');
      if (!bar) return;
      if (!d.running){
        bar.style.display = 'none';
        syncOyunBilgi = new Map(); syncHedefMin = 0; syncIsToplamMs = 0;
        // The completion notification comes with the account event (genel.js > onHesapOlayi).
        renderActiveBox();
        return;
      }
      bar.style.display = 'flex';
      syncHedefMin = d.targetMin || 0;
      if (d.isToplamMs) syncIsToplamMs = d.isToplamMs;
      const txt = document.getElementById('saatSyncText');
      const eta = document.getElementById('saatSyncEta');
      const fill = document.getElementById('saatSyncBarFill');

      if (d.strateji === 'parallel'){
        syncOyunBilgi = new Map((d.oyunlar||[]).map(o=>[o.appid, o]));
        const yuzde = d.toplam ? Math.round(d.biten/d.toplam*100) : 0;
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">'+esc(tf('Saat eşitleme · hedef #', fmtHours(d.targetMin)))+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E">'
          + esc(tf('# / # oyun hedefte · # oyun çalışıyor', d.biten, d.toplam, d.aktifSayi)) + '</span>';
        if (eta) eta.textContent = d.kalanMs ? msKisa(d.kalanMs) : t('bitiyor');
        if (fill) fill.style.width = yuzde + '%';
      } else {
        // G13: the game ledger comes on the stepped side too. This place used to be emptied and
        // every game showed the same session percentage; a game with 1 hour left to the target and a game with
        // 47 hours left were on the same bar.
        syncOyunBilgi = new Map((d.oyunlar||[]).map(o=>[o.appid, o]));
        const yuzde = d.steps ? Math.round((d.step-1)/d.steps*100) : 0;
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">'+esc(tf('Eşitleme adımı # / #', d.step, d.steps))+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E">'+esc(tf('# oyun', d.ids.length) + ' · '
          + fmtHours(d.fromMin) + ' → ' + fmtHours(d.toMin) + ' · ' + tf('hedef #', fmtHours(d.targetMin)))+'</span>';
        if (eta) eta.textContent = d.stepMs ? msKisa(Math.max(0, d.stepMs-(Date.now()-(d.startedAt||Date.now())))) : '-';
        if (fill) fill.style.width = yuzde + '%';
      }
      renderActiveBox();
    });
    document.getElementById('btnBoostStart').onclick = startBoost;
    document.getElementById('btnBoostStop').onclick = () => {
      E.boostStop(); E.boostStopSeq();
      notify('boost', 'Saat Yükseltme Durdu', '');
      pushFeed('saat', 'Saat Yükseltici', 'Durduruldu.', 'Durdu');
    };

    // "Oturumu otomatik yenile" is now in the main process and per account (main.js > boostSureDoldu).
    // While it stayed here it only worked on the account on screen and while the window was open; the "stopped"
    // info that came when the account changed could trigger the renewal on the WRONG account.
    function onSaatTick(data){
      boostState = data;
      if (boostTimerUI) clearInterval(boostTimerUI);
      if (data.running){
        boostTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) renderActiveBox(); }, 1000);
      }
      renderActiveBox();
    }
    E.onBoostTick(onSaatTick);
    E.onSaatFarmTick((data) => onSaatTick({ running: data.running, activeAppids: data.activeAppids, startedAt: Date.now()-(data.elapsedMs||0), durationMs: data.durationMs }));
