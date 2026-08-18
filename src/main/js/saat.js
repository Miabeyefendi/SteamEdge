    // ================= SAAT YÜKSELTİCİ =================
    // Eş zamanlı = tümü birlikte (belirlenen sürede durur).
    // "Sıralı bekletme modu" açıkken FarmController 'sequential' ile oyunlar sırayla döner.
    let ownedGames = [], saatLoaded = false;
    let selectedSaat = [];
    let saatDurSec = 3600;
    let maxConcurrent = 32, concurrentCustom = false;
    let boostState = { running: false, appids: [], startedAt: 0, durationMs: 0 };
    let boostTimerUI = null;
    // Davranış/Gizlilik anahtarları - ayarlara kalıcı yazılır (Ayarlar ekranıyla aynı anahtarlar)
    // ignoreUpdates ve hideGameName buradan cikarildi: ilkinin motorda karsiligi hic yoktu,
    // ikincisi Ayarlar > Gizlilik altinda duruyor.
    let boostFlags = { boostAutoRestart:false, seqIdle:false, loopQueue:true, offlineMode:false, boostSync:false };

    const BC = { brand:'#5624B3', ok:'#5FB324', teal:'#24AEB3', title:'#DCE2FA', muted:'#8B8F9E',
                 off:'#656D80', bd:'#2B3345', s1:'#0D1118', bgAlt:'#090C12', sub:'#C2AAEE' };
    const BSEG_ON  = { background:BC.brand, borderColor:BC.brand, color:BC.title };
    const BSEG_OFF = { background:'transparent', borderColor:'transparent', color:BC.muted };

    function fmtHMS(sec){ const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=Math.max(0,sec%60); return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':'); }
    function monoHMS(sec){ return fmtHMS(sec).replace(/:/g, '<span style="color:#C2AAEE">:</span>'); }
    const hrsOf = (g) => ((g.playtimeForever||0)/60).toFixed(1);

    async function loadSaat(){
      await applyBoostFlags();
      if (saatLoaded){ renderSaatList(); renderActiveBox(); return; }
      const body = document.getElementById('saatListBody');
      body.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Steam\'e bağlanılıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ body.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(con.error)+'</div>'; return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'kütüphane hatası' }));
      if (!res.ok){ body.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(res.error)+'</div>'; return; }
      ownedGames = res.games; saatLoaded = true;
      restoreBoostList();
      renderSaatList(); renderSaatSelected();
    }
    document.getElementById('saatSearch').addEventListener('input', renderSaatList);

    // "Oyun listesini hatırla" ayarı açıksa seçim kalıcı
    function persistBoostList(){
      if (appSettings && appSettings.rememberBoostList){
        window.imu.settings.set({ boostGameIds: selectedSaat.map(g=>g.appid) }).catch(()=>{});
      }
    }
    // Kayitli oyun listesini geri yukler.
    // DIKKAT: hem loadSaat icinden hem applyBoostFlags icinden cagrilir. Sebebi bir yaris
    // durumu: ayarlar (appSettings) ile kutuphane (ownedGames) farkli anlarda hazir oluyor;
    // hangisi once gelirse gelsin secim geri gelsin diye iki taraftan da deneniyor. Eskiden
    // yalnizca loadSaat icinde cagriliyordu ve ayarlar gec gelirse kullanicinin kayitli
    // listesi BOS gorunuyordu - o da elle yeniden secince kaydin uzerine yaziliyordu.
    function restoreBoostList(){
      if (!appSettings || !appSettings.rememberBoostList || !Array.isArray(appSettings.boostGameIds)) return false;
      if (!ownedGames.length) return false;      // kutuphane henuz gelmedi
      if (selectedSaat.length) return false;     // kullanici zaten secmis, uzerine yazma
      const ids = new Set(appSettings.boostGameIds);
      const bulunan = ownedGames.filter(g=>ids.has(g.appid));
      if (!bulunan.length) return false;
      selectedSaat = bulunan;
      return true;
    }

    // ---- kütüphane listesi ----
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
          // Kütüphane Başlığı oranı (920x430, ~2.14:1)
          + '<div style="width:59px;height:28px;flex-shrink:0;border-radius:8px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
            + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
            + '<span style="font-size:12px;font-weight:600;color:'+(on?BC.title:BC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+hrsOf(g)+' sa</span>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:13px;font-weight:700;color:'+(on?BC.ok:BC.off)+'">'+(on?'✓':'+')+'</span>'
          + '</div>';
      }).join('');
    }
    document.getElementById('saatListBody').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-appid]'); if (!row) return;
      toggleSaatGame(+row.getAttribute('data-appid'));
    });

    // Tüm listeyi yeniden çizmek yerine sadece tıklanan satır güncelleniyor (kütüphane 300 satıra
    // kadar çıkabiliyor; ayrıca yeniden çizim kaydırma konumunu ve tıklanan düğümü kaybettiriyordu).
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

    // ---- MADDE 4: saat esitleme ayarlari (sayfa ici) ----
    // Esitleme acikken "eszamanli limit" ve "yukseltme suresi" anlamsizdir: ikisini de
    // esitleme algoritmasi belirler. Bu yuzden gorsel olarak kilitlenir ve sebebi yazilir.
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

    // ---- kuyruk/aktif kartlar ----
    function renderActiveBox(){
      const box = document.getElementById('activeBoostBox');
      if (!box) return;
      const activeIds = boostState.running ? (boostState.activeAppids || boostState.appids || []) : [];
      const activeSet = new Set(activeIds);
      document.getElementById('statOyunSayisi').textContent = boostState.running ? activeIds.length : selectedSaat.length;

      // Süre göstergeleri
      const elapsed = boostState.running ? Math.floor((Date.now()-(boostState.startedAt||Date.now()))/1000) : 0;
      const left = boostState.running && boostState.durationMs
        ? Math.max(0, Math.floor((boostState.durationMs - (Date.now()-(boostState.startedAt||Date.now())))/1000))
        : (selectedSaat.length ? (boostFlags.seqIdle ? saatDurSec*selectedSaat.length : saatDurSec) : 0);
      document.getElementById('statToplamSure').innerHTML = monoHMS(elapsed);
      document.getElementById('saatRemain').innerHTML = monoHMS(left);

      if (!selectedSaat.length){
        box.innerHTML = '<div style="grid-column:1/-1;padding:48px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Kuyruk boş</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Soldaki kütüphaneden oyun seç - seçtiklerin burada görünür.</span></div>';
        return;
      }
      const dur = boostState.durationMs || saatDurSec*1000;
      const pct = boostState.running && dur ? Math.min(100, Math.round((Date.now()-(boostState.startedAt||Date.now()))/dur*100)) : 0;
      // G1: Esitleme acikken yuzde "oturum suresine" degil HEDEFE yakinliga gore olmali.
      // Eskiden 50/40/30 saatlik uc oyun 60 saate cekilirken ucu de ayni yuzdeyi
      // gosteriyordu, cunku olculen sey oturumun ne kadarinin gectigiydi.
      function oyunYuzde(g, aktif){
        const bilgi = syncOyunBilgi.get(g.appid);
        if (bilgi && syncHedefMin){
          if (bilgi.bitti) return 100;
          const bas = bilgi.baslangicMin || 0;
          const toplamYol = Math.max(1, syncHedefMin - bas);
          const alinan = Math.max(0, (bilgi.suankiMin || bas) - bas);
          return Math.max(0, Math.min(100, Math.round(alinan / toplamYol * 100)));
        }
        return aktif ? pct : 0;
      }
      box.innerHTML = selectedSaat.map((g,i)=>{
        const on = activeSet.has(g.appid);
        const bd = on ? BC.brand : BC.bd;
        const p = oyunYuzde(g, on);
        return '<div style="border:1px solid '+bd+';border-radius:12px;background:'+(on?BC.s1:BC.bgAlt)+';padding:14px;display:flex;align-items:center;gap:12px;min-height:84px">'
          // Kütüphane Başlığı oranı (920x430, ~2.14:1)
          + '<div style="width:97px;height:45px;flex-shrink:0;border-radius:10px;border:1px solid '+bd+';background:repeating-linear-gradient(135deg,#151C28 0 6px,#101621 6px 12px);overflow:hidden">'
            + gameThumb(g.appid) + '</div>'
          + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'
              + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0">'
                + '<span style="font-size:12px;font-weight:600;color:'+(on?BC.title:BC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
                + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+altSatir(g, on, i, elapsed)+'</span>'
              + '</div>'
              + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:'+(on?BC.ok:BC.off)+'">%'+p+'</span>'
            + '</div>'
            + '<div style="height:5px;border-radius:12px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
              + '<div style="height:100%;width:'+p+'%;border-radius:12px;background:'+(on?BC.ok:BC.teal)+'"></div></div>'
          + '</div></div>';
      }).join('');
    }

    // MADDE 15: Eskiden yalnizca "o oturumda gecen sure" yaziyordu; oyunun GUNCEL toplam
    // suresi gorunmuyordu. Artik baslangic + gecen sure gosteriliyor, esitleme acikken
    // hedefe ne kadar kaldigi da yaziyor. Esitlemedeki degerler main tarafindan gelir
    // (her oyun farkli sure calistigi icin tek bir "elapsed" yetmez).
    let syncOyunBilgi = new Map();   // appid -> { suankiMin, kalanMs, bitti }
    function altSatir(g, on, i, elapsed){
      const bilgi = syncOyunBilgi.get(g.appid);
      if (bilgi){
        if (bilgi.bitti) return 'hedefe ulaştı · ' + fmtHours(bilgi.suankiMin) + ' ✓';
        const hedef = syncHedefMin ? (' → ' + fmtHours(syncHedefMin)) : '';
        return fmtHours(bilgi.suankiMin) + hedef + (on ? ' · çalışıyor' : ' · sırada');
      }
      // Esitleme calisiyor ama bu oyun listede yoksa zaten hedefin ustundedir
      if (syncHedefMin && (g.playtimeForever || 0) >= syncHedefMin){
        return fmtHours(g.playtimeForever || 0) + ' · zaten hedefte';
      }
      // Esitleme yokken: kutuphaneden gelen sure + bu oturumda gecen sure
      const tabanMin = g.playtimeForever || 0;
      if (on) return fmtHours(tabanMin + Math.floor(elapsed/60)) + ' · çalışıyor ' + fmtHMS(elapsed);
      return '#' + (i+1) + ' · ' + fmtHours(tabanMin);
    }
    let syncHedefMin = 0;

    // ---- eşzamanlı limit ----
    function paintConc(){
      document.querySelectorAll('#saatConc button[data-n]').forEach(b=>{
        const v = b.getAttribute('data-n');
        const on = concurrentCustom ? v==='custom' : (+v === maxConcurrent);
        Object.assign(b.style, on ? BSEG_ON : BSEG_OFF);
      });
      document.getElementById('saatConcCustom').style.display = concurrentCustom ? '' : 'none';
    }
    document.querySelectorAll('#saatConc button[data-n]').forEach(b=>b.addEventListener('click', ()=>{
      const v = b.getAttribute('data-n');
      if (v === 'custom'){ concurrentCustom = true; }
      else { concurrentCustom = false; maxConcurrent = +v; }
      paintConc(); renderActiveBox();
    }));
    document.getElementById('saatConcCustom').addEventListener('change', (e)=>{
      maxConcurrent = Math.max(1, Math.min(32, +e.target.value || 1));
      e.target.value = maxConcurrent; renderActiveBox();
    });
    paintConc();

    // ---- yükseltme süresi ----
    const bH = document.getElementById('saatH'), bM = document.getElementById('saatM'), bS = document.getElementById('saatS');
    function writeSegs(){
      const h=Math.floor(saatDurSec/3600), m=Math.floor((saatDurSec%3600)/60), s=saatDurSec%60;
      bH.value=String(h).padStart(2,'0'); bM.value=String(m).padStart(2,'0'); bS.value=String(s).padStart(2,'0');
      paintBoostPresets();
    }
    function commitDurInput(){
      const h=parseInt(bH.value,10)||0, m=Math.min(59,parseInt(bM.value,10)||0), s=Math.min(59,parseInt(bS.value,10)||0);
      boostUserTouched = true;
      saatDurSec = Math.max(60, h*3600 + m*60 + s);
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
        const on = h==='custom' ? ![6,12,18,24].includes(hours) : (+h === hours);
        Object.assign(b.style, on ? BSEG_ON : BSEG_OFF);
      });
    }
    document.querySelectorAll('#saatPresets button[data-h]').forEach(b=>b.addEventListener('click', ()=>{
      const h = b.getAttribute('data-h');
      if (h === 'custom'){ bH.focus(); return; }
      boostUserTouched = true; saatDurSec = (+h)*3600; writeSegs(); renderActiveBox();
    }));
    writeSegs();

    // ---- Davranış / Gizlilik anahtarları ----
    // Ayarlar > Saat Yükseltici tercihlerini uygular ("Varsayılan hedef süre" dahil).
    let boostUserTouched = false;
    function applyBoostSettings(){
      if (typeof appSettings !== 'object' || !appSettings) return;
      if (!boostUserTouched && appSettings.boostTarget){
        // 'inf' = sınırsız → süre 0, "Süre dolunca otomatik durdur" kapalı gibi davranır
        const t = appSettings.boostTarget;
        const hours = t === 'inf' ? 0 : (+t || 0);
        if (hours > 0 && saatDurSec !== hours*3600){ saatDurSec = hours*3600; writeSegs(); }
      }
      if (appSettings.boostMaxGames) maxConcurrent = +appSettings.boostMaxGames;
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
      paintConc();
      syncAyarlariCiz();
      // Ayarlar simdi hazir; kutuphane daha once geldiyse secimi burada geri yukle.
      if (restoreBoostList()){ renderSaatList(); renderActiveBox(); }
    }
    document.querySelectorAll('#tab-saat .e-toggle[data-bset]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const key = el.getAttribute('data-bset');
        const val = !boostFlags[key];
        boostFlags[key] = val;
        el.classList.toggle('on', val);
        const next = await window.imu.settings.set({ [key]: val }).catch(()=>null);
        if (next) appSettings = next;
        syncAyarlariCiz();
        renderActiveBox();
      });
    });

    // "Preset olarak kaydet" - mevcut yapılandırmayı (limit, süre, anahtarlar, seçili oyunlar) yazar
    document.getElementById('saatSavePreset').onclick = async ()=>{
      await window.imu.settings.set({
        boostMaxGames: maxConcurrent,
        boostDurationSec: saatDurSec,
        boostGameIds: selectedSaat.map(g=>g.appid),
        ...boostFlags,
      }).catch(()=>{});
      if (typeof toast === 'function') toast('Preset kaydedildi').done(selectedSaat.length+' oyun · '+fmtHMS(saatDurSec)+' · limit '+maxConcurrent);
    };

    // ---- başlat / durdur ----
    async function startBoost(){
      if (!selectedSaat.length) return;
      // Sıralı bekletme modunda tüm kuyruk sırayla döner; kapalıyken ilk `maxConcurrent` oyun birlikte.
      const pool = boostFlags.seqIdle ? selectedSaat : selectedSaat.slice(0, maxConcurrent);
      // playtimeMin saat eşitlemesi için gerekli (ownedGames dakika cinsinden veriyor)
      const games = pool.map(g=>({ appid:g.appid, name:g.name, playtimeMin: g.playtimeForever || 0 }));

      // Saat eşitleme açıksa ne olacağını başlatmadan ÖNCE göster - kademeler ve toplam süre
      // saatlerce sürebilir, kullanıcı onaylamadan başlatmak doğru olmaz.
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
            // Ilk birkac bitisi goster - kullanici neyin ne zaman biteceğini gorsun
            const ilkler = (plan.bitisler||[]).slice(0,6).map(b=>
              '  · '+b.name+': '+fmtHours(Math.round(b.bitisMs/60000))+' sonra').join('\n');
            const kalanSayi = Math.max(0, (plan.bitisler||[]).length-6);
            baslik = plan.behind+' oyun '+fmtHours(plan.targetMin)+' hedefine çekilecek';
            govde = 'Seçili oyunların hepsi aynı anda çalışır. Hedefe ulaşan oyun listeden düşer, '
                  + 'kalanlar devam eder.\n\n'
                  + 'Aynı anda açık: ' + plan.ilkAktif + ' oyun\n\n'
                  + 'Tahmini bitiş sırası:\n' + ilkler
                  + (kalanSayi ? ('\n  · ve ' + kalanSayi + ' oyun daha') : '')
                  + '\n\nHepsinin tamamlanması: ' + fmtHours(Math.round(plan.totalMs/60000));
          } else {
            const lines = (plan.steps||[]).map((st,i)=>
              '  '+(i+1)+'. '+st.count+' oyun: '+fmtHours(st.fromMin)+' → '+fmtHours(st.toMin)
              +'  ('+fmtHours(st.toMin-st.fromMin)+')').join('\n');
            baslik = plan.behind+' oyun '+fmtHours(plan.targetMin)+' hedefine çekilecek';
            govde = 'En geride kalan oyun tek başına öne çekilir; bir sonrakine yetişince ikisi '
                  + 'birlikte devam eder ve sonunda hepsi aynı noktada buluşur.\n\n' + lines
                  + '\n\nToplam süre: ' + fmtHours(Math.round(plan.totalMs/60000));
          }
          const ok = await edgeConfirm({
            tag:'Saat Eşitleme', title: baslik, body: govde,
            warn: 'Bu süre boyunca uygulama açık kalmalı. İstediğin an durdurabilirsin.',
            confirmText:'Eşitlemeyi Başlat',
          });
          if (!ok) return;
        }
      }

      if (boostFlags.seqIdle) E.boostStartSeq(games, saatDurSec*1000, boostFlags.loopQueue);
      else E.boostStart(games.map(g=>g.appid), saatDurSec*1000, games);
      notify('boost', 'Saat Yükseltme Başladı', games.length+' oyun.');
      pushFeed('saat', 'Saat Yükseltici', games.length+' oyun ile başladı.'+(syncOn?' (eşitleme açık)':''), 'Çalışıyor');
    }
    // Dakikayı "12 sa 30 dk" biçiminde yazar
    function fmtHours(min){
      const m = Math.max(0, Math.round(min||0));
      const h = Math.floor(m/60), r = m%60;
      return h ? (h+' sa'+(r?(' '+r+' dk'):'')) : (r+' dk');
    }

    // MADDE 14: esitleme durumu artik SABIT alt barda; sayfa duzenini itmiyor.
    // MADDE 3: paralel stratejide kademe yok - kac oyun bitti, kac tanesi calisiyor gosterilir.
    function msKisa(ms){
      const dk = Math.max(0, Math.round(ms/60000));
      const g = Math.floor(dk/1440), sa = Math.floor((dk%1440)/60), m = dk%60;
      if (g) return g+' gün '+sa+' sa';
      if (sa) return sa+' sa '+m+' dk';
      return m+' dk';
    }
    if (E.onBoostSync) E.onBoostSync((d)=>{
      const bar = document.getElementById('saatSyncBar');
      if (!bar) return;
      if (!d.running){
        bar.style.display = 'none';
        syncOyunBilgi = new Map(); syncHedefMin = 0;
        if (d.done){
          notify('boost', 'Saat Eşitleme Tamamlandı', 'Tüm oyunlar hedefe ulaştı.');
          pushFeed('saat', 'Saat Eşitleme', 'Tüm oyunlar hedefe ulaştı.', 'Başarılı');
        }
        renderActiveBox();
        return;
      }
      bar.style.display = 'flex';
      syncHedefMin = d.targetMin || 0;
      const txt = document.getElementById('saatSyncText');
      const eta = document.getElementById('saatSyncEta');
      const fill = document.getElementById('saatSyncBarFill');

      if (d.strateji === 'parallel'){
        syncOyunBilgi = new Map((d.oyunlar||[]).map(o=>[o.appid, o]));
        const yuzde = d.toplam ? Math.round(d.biten/d.toplam*100) : 0;
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">Saat eşitleme · hedef '+fmtHours(d.targetMin)+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E">'
          + '<b style="color:#5FB324">'+d.biten+'</b> / '+d.toplam+' oyun hedefte · '
          + d.aktifSayi+' tanesi çalışıyor</span>';
        if (eta) eta.textContent = d.kalanMs ? msKisa(d.kalanMs) : 'bitiyor';
        if (fill) fill.style.width = yuzde + '%';
      } else {
        syncOyunBilgi = new Map();
        const yuzde = d.steps ? Math.round((d.step-1)/d.steps*100) : 0;
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">Eşitleme adımı '+d.step+' / '+d.steps+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E">'+d.ids.length+' oyun · '
          + fmtHours(d.fromMin)+' → '+fmtHours(d.toMin)+' · hedef '+fmtHours(d.targetMin)+'</span>';
        if (eta) eta.textContent = d.stepMs ? msKisa(Math.max(0, d.stepMs-(Date.now()-(d.startedAt||Date.now())))) : '-';
        if (fill) fill.style.width = yuzde + '%';
      }
      renderActiveBox();
    });
    document.getElementById('btnBoostStart').onclick = startBoost;
    document.getElementById('btnBoostStop').onclick = () => {
      if (boostState && boostState.running && boostState.startedAt) addLifeStats({ boostRuntimeMs: Math.max(0, Date.now()-boostState.startedAt) });
      autoRestartArmed = false;
      E.boostStop(); E.boostStopSeq();
      notify('boost', 'Saat Yükseltme Durdu', '');
      pushFeed('saat', 'Saat Yükseltici', 'Durduruldu.', 'Durdu');
    };

    // "Oturumu otomatik yenile": süre dolup motor durunca kuyruğu yeniden başlatır.
    let autoRestartArmed = false;
    function onSaatTick(data){
      const wasRunning = boostState.running;
      boostState = data;
      if (data.running) autoRestartArmed = true;
      if (boostTimerUI) clearInterval(boostTimerUI);
      if (data.running){
        boostTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) renderActiveBox(); }, 1000);
      } else if (wasRunning && autoRestartArmed && boostFlags.boostAutoRestart && selectedSaat.length){
        autoRestartArmed = false;
        pushFeed('saat', 'Saat Yükseltici', 'Süre doldu, oturum otomatik yenilendi.', 'Çalışıyor');
        setTimeout(startBoost, 1500);
      }
      renderActiveBox();
    }
    E.onBoostTick(onSaatTick);
    E.onSaatFarmTick((data) => onSaatTick({ running: data.running, activeAppids: data.activeAppids, startedAt: Date.now()-(data.elapsedMs||0), durationMs: data.durationMs }));
