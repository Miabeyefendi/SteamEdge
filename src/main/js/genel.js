    // ================= GENEL BAKIŞ (OVERVIEW) =================
    // All the numbers in the panels come from real Steam data and from the engine's own
    // measurements; there is no sample/fixed data.
    const sessionStartTs = Date.now();
    let genelLoaded = false;

    // Palette shortcuts
    const GC = { ok:'#5FB324', warn:'#B37E24', bad:'#B32453', sub:'#C2AAEE', bdActive:'#5624B3', muted:'#8B8F9E' };
    // Dictionary of the "Durum" column: Başarılı / Çalışıyor / Uyarı / Durdu
    const FEED_STATUS = {
      'Başarılı':  { color: GC.ok,  bd: GC.ok },
      'Çalışıyor': { color: GC.sub, bd: GC.bdActive },
      'Uyarı':     { color: GC.warn, bd: GC.warn },
      'Durdu':     { color: GC.bad, bd: GC.bad },
      'Hata':      { color: GC.bad, bd: GC.bad },
      'Mesaj':     { color: GC.blue || '#24AEB3', bd: GC.blue || '#24AEB3' },
    };
    const DEFAULT_STATUS_BY_KIND = { hata:'Hata', uyari:'Uyarı' };

    // {kind, title, text, status, ts} - real application events.
    // PERSISTENT: kept in the account store, the history is not lost when the app closes and reopens.
    let activityFeed = [];
    const AKTIVITE_ANAHTARI = 'aktiviteAkisi';
    let aktiviteYazmaZamani = null;

    async function aktiviteyiYukle(){
      try {
        const r = await window.imu.state.get(AKTIVITE_ANAHTARI);
        if (r && Array.isArray(r.value)) { activityFeed = r.value.slice(0, 30); renderFeed(); }
      } catch (_) {}
    }
    // We batch the disk writes: in back to back events it should not go to the file every time.
    function aktiviteyiKaydet(){
      if (aktiviteYazmaZamani) clearTimeout(aktiviteYazmaZamani);
      aktiviteYazmaZamani = setTimeout(()=>{
        aktiviteYazmaZamani = null;
        try { window.imu.state.set(AKTIVITE_ANAHTARI, activityFeed).catch(()=>{}); } catch (_) {}
      }, 800);
    }
    function pushFeed(kind, title, text, status){
      const st = status || DEFAULT_STATUS_BY_KIND[kind] || 'Başarılı';
      activityFeed.unshift({ kind: kind||'saat', title, text, status: st, ts: Date.now() });
      if (activityFeed.length > 30) activityFeed.length = 30;
      renderFeed();
      aktiviteyiKaydet();
    }
    // Activity row (grid 3 columns, 60px, dot box + status badge)
    function renderFeed(){
      const el = document.getElementById('gFeed');
      if (!el) return;
      if (typeof updateNotifBadge === 'function') updateNotifBadge(activityFeed.length);
      if (!activityFeed.length){
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:48px 18px;text-align:center">'
          + '<span style="font-size:13px;color:#656D80">Henüz bir işlem yapılmadı.</span>'
          + '<span style="font-size:11px;color:#656D80">Kart düşürme, satış ve başarım işlemleri burada listelenir.</span></div>';
        return;
      }
      el.innerHTML = activityFeed.map(f=>{
        const s = FEED_STATUS[f.status] || FEED_STATUS['Başarılı'];
        const t = new Date(f.ts).toLocaleTimeString(yerelKod());
        return '<div class="h-row" style="display:grid;grid-template-columns:minmax(240px,1fr) 130px 100px;gap:0;padding:0 18px;height:60px;align-items:center;border-bottom:1px solid #101621">'
          + '<div style="display:flex;align-items:center;gap:12px;min-width:0">'
            + '<div style="width:30px;height:30px;flex-shrink:0;border-radius:12px;border:1px solid '+s.bd+';background:#101621;display:flex;align-items:center;justify-content:center">'
              + '<span style="width:8px;height:8px;border-radius:12px;background:'+s.color+'"></span>'
            + '</div>'
            + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0">'
              + '<span style="font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(f.title)+'</span>'
              + '<span style="font-size:11px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(f.text)+'</span>'
            + '</div>'
          + '</div>'
          + '<div><span style="display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:12px;border:1px solid '+s.bd+';color:'+s.color+';font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase">'+esc(f.status)+'</span></div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:#8B8F9E;text-align:right">'+t+'</span>'
          + '</div>';
      }).join('');
    }
    document.getElementById('gClearFeed').onclick = ()=>{ activityFeed.length=0; renderFeed(); aktiviteyiKaydet(); };

    function fmtSessionDur(ms){
      const s = Math.floor(ms/1000);
      const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
      return h>0 ? (String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')) : (String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'));
    }
    // In counters the colon is written in the accent colour: 04<span #C2AAEE>:</span>12
    function monoTime(str){ return String(str).replace(/:/g, '<span style="color:#C2AAEE">:</span>'); }

    document.getElementById('gStatSessionSub').textContent = t('Başlangıç:') + ' ' + new Date(sessionStartTs).toLocaleTimeString(yerelKod());
    setInterval(()=>{
      if (typeof uiTickAllowed === 'function' && !uiTickAllowed()) return;
      const el=document.getElementById('gStatSession');
      if(el) el.innerHTML = monoTime(fmtSessionDur(Date.now()-sessionStartTs));
      // The countdowns in the task row must not depend on the engine tick: Realistic Mode can stay
      // silent for minutes and "Kalan Süre" froze during that time.
      if (gorevListesi.length) renderGenelActive();
    }, 1000);

    function renderGenelStats(){
      const c = document.getElementById('gStatCards'); if (!c) return;
      const set = (id, v, html) => { const e=document.getElementById(id); if(e){ if(html) e.innerHTML=v; else e.textContent=v; } };

      // Toplam Kart
      const totalCards = dropGames.reduce((s,g)=>s+g.remaining,0);
      c.textContent = kartLoaded ? totalCards.toLocaleString(yerelKod()) : '-';
      set('gStatCardsSub', kartLoaded ? (dropGames.length+' oyunda kart var') : 'Kart Düşür sekmesinde yenile');

      // Kütüphane
      set('gStatGames', (saatLoaded && ownedGames.length) ? ownedGames.length.toLocaleString(yerelKod()) : '-');
      set('gStatGamesSub', kartLoaded ? tf('# oyun toplamaya hazır', dropGames.length) : '-');

      // Envanter & Pazar - value + net after Steam's cut
      // The fallback branch is REQUIRED: when the account changes resetPageCaches() makes invMerged null but if the
      // box is not written the PREVIOUS ACCOUNT's value stayed on screen.
      if (invMerged){
        // Net: with Steam's own fee calculation (env.js > saticiTutari). A fixed 13% used to be
        // deducted; on cheap cards this rate does not hold because of Steam's base fee.
        let value=0, units=0, net=0;
        const eksik = [];
        invMerged.forEach(i=>{
          units+=i.count;
          if(i.marketable && i.marketHashName){
            const v=priceVal(i);
            if(v!=null){ value += v*i.count; const sn = saticiTutari(v); if (sn==null) eksik.push(v); else net += sn*i.count; }
          }
        });
        set('gStatValue', fmtTL(value));
        set('gStatValueSub', eksik.length ? tf('# öğe', yerelSayi(units)) : tf('# öğe · net #', yerelSayi(units), fmtTL(net)));
        if (eksik.length) netiHazirla(eksik);
      } else {
        set('gStatValue', '-');
        set('gStatValueSub', 'Envanter sekmesinde yükle');
      }

      // Saat Yükseltici
      const bOn = boostState && boostState.running;
      const bIds = bOn ? (boostState.activeAppids || boostState.appids || []) : [];
      set('gStatBoost', bIds.length + ' aktif');
      if (bOn && boostState.durationMs){
        const left = Math.max(0, boostState.durationMs - (Date.now()-(boostState.startedAt||Date.now())));
        set('gStatBoostSub', t('Kalan') + ' ' + fmtSessionDur(left));
      } else set('gStatBoostSub', bOn ? 'Süresiz çalışıyor' : 'Çalışmıyor');

      // Başarımlar - there is real data only if a game is selected in the Başarımlar tab
      if (typeof acData !== 'undefined' && acData && acData.total){
        const pct = Math.round(acData.unlocked/acData.total*100);
        set('gStatAch', acData.unlocked+' / '+acData.total);
        set('gStatAchSub', tf('%# tamamlandı ·', pct) + ' ' + (acData.gameName||''));
      } else {
        set('gStatAch', '-');
        set('gStatAchSub', 'Başarımlar sekmesinde oyun seç');
      }
    }

    // The last lists on disk: no request goes to Steam, they are read from the file. So that the card and library
    // counts appear on screen without waiting for the session to open. When fresh data arrives the
    // dropGames/ownedGames calls below overwrite them.
    let listelerTaze = false;    // did the lists on screen come from Steam or from disk
    async function onbelleklenmisListeler(){
      try {
        const r = await E.sonListeler();
        if (!r || !r.ok) return;
        if (!kartLoaded && Array.isArray(r.drop) && r.drop.length){ dropGames = r.drop; kartLoaded = true; }
        if (!saatLoaded && Array.isArray(r.owned) && r.owned.length){ ownedGames = r.owned; saatLoaded = true; }
        renderGenelStats();
      } catch (_) {}
    }

    async function loadGenel(){
      if (!genelLoaded){
        genelLoaded = true;
        // Profile FIRST: since the last known name/avatar/level comes with the settings it is
        // written to the screen right away. This line used to run after the connection was made and the account badge
        // in the top right showed a dash until the session opened.
        loadProfile();
        await onbelleklenmisListeler();   // so the card and library counts show right away
        await aktiviteyiYukle();   // bring back the persistent activity history
        // Even if fetching the data fails (could not connect to Steam, IPC error) the panel must still be
        // drawn - otherwise the await blew up here and the renders below never ran
        // and the Genel Bakış stayed completely empty.
        try {
          const con = await E.connect();
          if (con && con.ok){
            if (window.imu.settings){
              const s = await window.imu.settings.get();
              if (s) appSettings = { ...appSettings, ...s };
            }
            loadProfile();     // the connection is made: fetch the fresh profile, write it over the cache
            // Even if the lists came from disk they are refreshed from Steam once; so the numbers on screen
            // do not go stale. listelerTaze reduces this to once.
            if (!kartLoaded || !listelerTaze){ const r = await E.dropGames(); if (r.ok){ dropGames = r.games; kartLoaded = true; } }
            if (!saatLoaded || !listelerTaze){ const r2 = await E.ownedGames(); if (r2.ok){ ownedGames = r2.games; saatLoaded = true; } }
            listelerTaze = true;
            // If Kart Düşür is open on screen redraw it with the fresh list (if hidden leave it alone:
            // the hidden tab's list is deliberately not kept in memory).
            try {
              if (typeof renderKart === 'function' && designed.kart && !designed.kart.classList.contains('hidden')) renderKart();
            } catch (_) {}
          } else if (con && con.error){
            pushFeed('hata', 'Bağlantı', con.error, 'Hata');
          }
        } catch (e) {
          pushFeed('hata', 'Bağlantı', (e && e.message) || 'Steam bağlantısı kurulamadı.', 'Hata');
        }
      }
      renderGenelStats();
      renderGenelActive();
      renderFeed();
      renderLifeStats();
    }

    // CARD DROPS ARE MEASURED IN THE MAIN PROCESS (main.js > kartIzle). This file used to poll the badge page once a
    // minute: only for the account on screen, while the window was open, and in the second
    // session it never started (because the baseline was not reset). A card dropped on a background account
    // was not counted, a game that ran out of cards did not leave the queue. Now the main process watches each account
    // separately; the event and the current list come here.
    let farmDroppedCount = 0;
    E.onFarmListe((d)=>{
      if (!d || !Array.isArray(d.games)) return;
      dropGames = d.games; kartLoaded = true;
      farmDroppedCount = d.oturumDusen || 0;
      if (typeof renderKart === 'function' && designed.kart && !designed.kart.classList.contains('hidden')) renderKart();
      renderGenelStats(); renderGenelActive();
    });

    // Account events. The notification is shown for every account (the background account's name first),
    // only the on-screen account's are written to the activity feed; the main process writes the background one's
    // to that account's own feed.
    const OLAY_BILDIRIM = {
      kartDustu:     (o)=>['farm',  tf('# kart düştü', o.adet), o.ad],
      kartlarBitti:  ()=>['farm',  'Kart Düşürme Bitti', 'Tüm kartlar toplandı.'],
      basarimAcildi: (o)=>['ach',   'Başarım açıldı', o.ad],
      boostBitti:    (o)=>['boost', 'Saat Yükseltme Bitti', o.akis ? o.akis.text : ''],
      esitlemeBitti: ()=>['boost', 'Saat Eşitleme Tamamlandı', 'Tüm oyunlar hedefe ulaştı.'],
      baglantiVazgecildi: (o)=>['error', 'Steam Bağlantısı', o.kalici
        ? 'Steam oturumu kapandı, yeniden bağlanılmıyor.' : 'Yeniden bağlanma denemeleri bitti.'],
      kartDurdu:     (o)=>['farm',  'Kart Düşürme Durdu', o.akis ? o.akis.text : ''],
    };
    window.imu.onHesapOlayi((o)=>{
      if (!o || !o.tur) return;
      const b = OLAY_BILDIRIM[o.tur];
      // The card drop depends on a separate setting ("Kart düşünce bildir")
      const bildir = b && (o.tur !== 'kartDustu' || (appSettings && appSettings.notifyCardDrop));
      if (bildir){
        const [tur, baslik, govde] = b(o);
        notify(tur, baslik, o.aktif ? t(govde || '') : ('[' + o.hesap + '] ' + t(govde || '')));
      }
      if (!o.aktif) return;
      if (o.tur === 'kartDustu'){
        pushFeed('kart', tf('# kart düştü', o.adet), o.ad, 'Başarılı');
        if (typeof pushDrop === 'function') pushDrop(o.appid, o.ad, o.adet);
        // "Pazarda Otomatik Satış": list that game's new cards
        if (appSettings && appSettings.farmAutoSell && typeof autoSellDropped === 'function') autoSellDropped(o.ad);
      } else if (o.akis){
        pushFeed(o.akis.kind, o.akis.title, o.akis.text, o.akis.status);
      }
      if (o.tur === 'basarimAcildi' && typeof acCache !== 'undefined') acCache.delete(o.appid);
    });

    // The "Aktif Görev" panel.
    // Two type tags ("Aksiyon", "Çok Oyunculu") are shown next to the game capsule; since Steam's
    // GetOwnedGames reply gives no type information, instead of a made up type the real running
    // information (mode + number of simultaneous games) is written there.
    function chip(text){
      return '<span style="font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#8B8F9E;border:1px solid #1D2432;border-radius:12px;padding:3px 8px">'+esc(text)+'</span>';
    }
    function statCol(label, value, color){
      return '<div style="display:flex;flex-direction:column;gap:5px">'
        + '<span style="font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#8B8F9E;white-space:nowrap">'+esc(label)+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:13px;font-weight:700;line-height:1;color:'+(color||'#DCE2FA')+'">'+value+'</span>'
        + '</div>';
    }

    function setRunPill(running){
      const pill = document.getElementById('gRunPill');
      if (!pill) return;
      const c = running ? GC.ok : GC.warn;
      pill.style.background = '#101621';
      pill.style.borderColor = c;
      pill.innerHTML = '<span style="width:6px;height:6px;border-radius:12px;background:'+c+';animation:e-dotPulse 1.6s ease-in-out infinite"></span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:'+c+'">'+(running?'Çalışıyor':'Hazır')+'</span>';
      if (typeof setSysStatus === 'function') setSysStatus(running);
    }

    // ITEM 16: The panel used to assume a SINGLE task - if cards were running hours were not visible,
    // the achievement bulk operation was never visible and "Detay" always went to the Kart tab.
    // Now every running job is in its own row, with its own progress and its own Detay link.
    // The visible size of the panel was enlarged in 1.1.10: cover 85x40 -> 116x54, title 14 -> 15,
    // numbers 13 -> 15, bar 6 -> 8 pixels. On a 2K screen the row stayed small and
    // what is more the row's own "Detay" button was a SECOND button doing the same job as the Detay at the bottom of the panel.
    // The one in the row was removed; the one at the bottom already follows the task being shown.
    //
    // What was added is only DISPLAY: the percentage number, the session's start time. None fetches new
    // data, all of it is already inside the tick that comes to the panel.
    function gorevSatiri(g){
      const yuzde = Math.max(0, Math.min(100, Math.round(g.yuzde || 0)));
      return '<div style="display:flex;flex-direction:column;gap:11px;padding:14px 0 4px;border-top:1px solid #101621">'
        + '<div style="display:flex;align-items:flex-start;gap:14px">'
          // Library header ratio (920x430, ~2.14:1)
          + '<div style="width:116px;height:54px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;'
            + 'background:#101621;overflow:hidden;display:flex;align-items:center;justify-content:center">'
            + (g.appid ? gameThumb(g.appid)
                       : '<span style="display:flex;align-items:center;justify-content:center;transform:scale(1.7);transform-origin:center">'
                         + detayIkon(g.ikon, g.renk || GC.sub) + '</span>')
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:5px;min-width:0;flex:1">'
            + '<span style="font-size:15px;font-weight:700;color:#DCE2FA;white-space:nowrap;overflow:hidden;'
              + 'text-overflow:ellipsis;line-height:1.2">' + esc(g.baslik) + '</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10.5px;color:#8B8F9E">'
              + (g.appid ? ('APP_ID: ' + g.appid) : esc(g.altBilgi || '')) + '</span>'
            + '<div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap">'
              + (g.rozetler || []).map(chip).join('') + '</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:22px;flex-shrink:0">'
            + (g.sutunlar || []).map(c=>statCol(c[0], c[1], c[2])).join('')
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:11px">'
          + '<div style="flex:1;min-width:0;height:8px;border-radius:12px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
            + '<div style="height:100%;width:' + yuzde + '%;border-radius:12px;background:' + (g.renk || '#24AEB3') + '"></div>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;flex-shrink:0;'
            + 'min-width:38px;text-align:right;color:' + (g.renk || '#24AEB3') + '">' + fmtYuzde(yuzde) + '</span>'
        + '</div>'
        + (g.basladi
            ? ('<span style="font-family:Geist Mono,monospace;font-size:10px;color:#656D80">' + esc(t('Başlangıç:')) + ' '
               + fmtClock(g.basladi) + '</span>')
            : '')
        + '</div>';
    }

    // The task currently shown in the panel. The Başlat / Durdur / Detay below act according to this selection;
    // all three used to be tied to the fixed Kart Düşür and while hour boosting ran Detay opened the wrong
    // page.
    let gorevListesi = [], gorevIndeks = 0;
    const kisalt = (s, n)=>{ s = String(s||''); return s.length > n ? (s.slice(0, n-1)+'…') : s; };
    // Presses the related page's own button: its validation, its toast and the statistics write
    // live there, copying them here would mean maintenance in two places.
    function sayfaDugmesineBas(id){
      const b = document.getElementById(id);
      if (b) b.click();
    }

    function renderGenelActive(){
      const box = document.getElementById('gActiveBody');
      const qbox = document.getElementById('gQueue');
      if (!box || !qbox) return;

      const gorevler = [];
      const farmOn = lastTick && lastTick.running;
      const boostOn = boostState && boostState.running;
      // in the same global scope as basarim.js; if a bulk operation is running let it show here too
      const achOn = (typeof acRunning !== 'undefined') && acRunning;
      // G12: Realistic Mode is a job too - it used to never be watched. While running alone the
      // panel said "no running job" and Başlat started card farming.
      const grOn = (typeof grDurum !== 'undefined') && grDurum && grDurum.calisiyor;

      let heroId = null;
      if (farmOn){
        const activeIds = lastTick.activeAppids || [];
        heroId = lastTick.currentAppid || activeIds[0] || 0;
        const cur = dropGames.find(g=>g.appid===heroId);
        const nextDrop = lastTick.durationMs ? fmtSessionDur(Math.max(0, lastTick.durationMs - (lastTick.elapsedMs||0))) : '-';
        gorevler.push({
          tab:'kart', appid:heroId, baslik:(cur?cur.name:'Kart Düşürme'),
          rozetler:[modeLabels[selectedMode]||selectedMode, tf('# oyun eşzamanlı', activeIds.length)],
          sutunlar:[['Kalan Kart', (cur?cur.remaining:0), GC.sub],
                    ['Oturum Süresi', monoTime(fmtSessionDur(Date.now()-(lastTick.oturumBaslangic||Date.now())))],
                    ['Sonraki Düşüş', monoTime(nextDrop)]],
          yuzde: lastTick.durationMs ? (lastTick.elapsedMs/lastTick.durationMs*100) : 100,
          basladi: lastTick.oturumBaslangic || null,
          renk:'#24AEB3', durdur: kartiDurdur,
        });
      }
      if (boostOn){
        const ids = boostState.activeAppids || boostState.appids || [];
        const bId = ids[0] || 0;
        const g = ownedGames.find(x=>x.appid===bId);
        const gecen = Date.now()-(boostState.startedAt||Date.now());
        const left = boostState.durationMs ? fmtSessionDur(Math.max(0, boostState.durationMs-gecen)) : '-';
        gorevler.push({
          tab:'saat', appid:bId, baslik:(g?g.name:'Saat Yükseltici'),
          rozetler:['Saat Yükseltici', tf('# oyun eşzamanlı', ids.length)],
          sutunlar:[['Aktif Oyun', ids.length, GC.sub],
                    ['Oturum Süresi', monoTime(fmtSessionDur(gecen))],
                    ['Kalan', monoTime(left)]],
          yuzde: boostState.durationMs ? (gecen/boostState.durationMs*100) : 100,
          basladi: boostState.startedAt || null,
          renk:'#5624B3', durdur: ()=>sayfaDugmesineBas('btnBoostStop'),
        });
      }
      if (achOn){
        const yap = (typeof acRunYapilan !== 'undefined') ? acRunYapilan : 0;
        const top = (typeof acRunToplam !== 'undefined') ? acRunToplam : 0;
        gorevler.push({
          tab:'basarim', appid:(typeof acAppid !== 'undefined' ? acAppid : 0),
          baslik:'Başarım İşlemi', altBilgi:'toplu aç / kilitle',
          rozetler:['Başarımlar', (top ? (yap+' / '+top) : 'çalışıyor')],
          sutunlar:[['İşlenen', yap+' / '+top, GC.ok]],
          yuzde: top ? (yap/top*100) : 0,
          renk:'#5FB324', ikon:'sayac', durdur: ()=>sayfaDugmesineBas('acStop'),
        });
      }
      if (grOn){
        const acilan = grDurum.acilan || 0, toplam = grDurum.toplam || 0;
        const kalanSure = grDurum.bitis ? Math.max(0, grDurum.bitis - Date.now()) : 0;
        gorevler.push({
          tab:'gercekci', appid: grDurum.appid || 0,
          baslik: grDurum.oyunAdi || 'Gerçekçi Mod',
          altBilgi: 'başarımlar zamana yayılıyor',
          rozetler:['Gerçekçi Mod',
                    (grDurum.oyunSayisi > 1 ? ('oyun ' + ((grDurum.oyunIndeks||0)+1) + ' / ' + grDurum.oyunSayisi) : 'tek oyun')],
          sutunlar:[['Açılan', acilan + ' / ' + toplam, GC.ok],
                    ['Kalan Süre', monoTime(fmtSessionDur(kalanSure))],
                    ['Sıradaki', grDurum.siradaki ? kisalt(grDurum.siradaki, 16) : '-']],
          yuzde: toplam ? (acilan/toplam*100) : 0,
          basladi: grDurum.baslangic || null,
          renk:'#C2AAEE', durdur: ()=>sayfaDugmesineBas('grStop'),
        });
      }

      setRunPill(gorevler.length > 0);

      gorevListesi = gorevler;

      if (!gorevler.length){
        gorevIndeks = 0;
        box.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0">'
          + '<span style="font-size:13px;font-weight:600;color:#DCE2FA">Şu anda çalışan bir işlem yok</span>'
          + '<span style="font-size:11px;color:#8B8F9E">Aşağıdaki Başlat ile kart düşürmeyi başlatabilirsin.</span></div>';
        panelDugmeleriniBoya();
        renderGorevDetay(null, null);
        return;
      }

      // If there is more than one job, instead of stacking them all they are shown one by one; browsed with ‹ ›.
      // The panel's height is fixed, with three jobs active at once the queue below was squashed.
      if (gorevIndeks >= gorevler.length) gorevIndeks = gorevler.length - 1;
      if (gorevIndeks < 0) gorevIndeks = 0;
      const aktifGorev = gorevler[gorevIndeks];

      box.innerHTML = (gorevler.length > 1 ? gezinmeSeridi(gorevler.length) : '')
        + gorevSatiri(aktifGorev);

      const git = (yon)=>{
        gorevIndeks = (gorevIndeks + yon + gorevListesi.length) % gorevListesi.length;
        renderGenelActive();
      };
      const onc = box.querySelector('[data-gorev-onceki]');
      const son = box.querySelector('[data-gorev-sonraki]');
      if (onc) onc.onclick = ()=>git(-1);
      if (son) son.onclick = ()=>git(1);

      panelDugmeleriniBoya();
      renderGorevDetay(aktifGorev, heroId);
    }

    // The ‹ 2 / 3 › strip. The text in the middle says which job is being looked at.
    function gezinmeSeridi(adet){
      const ok = (attr, isaret)=>'<button class="h-bd" '+attr+' style="width:22px;height:22px;flex-shrink:0;'
        + 'border-radius:999px;background:#090C12;border:1px solid #333D4D;color:#B9C0D6;font-size:12px;'
        + 'line-height:1;cursor:pointer;padding:0">'+isaret+'</button>';
      return '<div style="display:flex;align-items:center;gap:8px;padding-bottom:2px">'
        + '<span style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;'
          + 'color:#8B8F9E;flex:1">' + esc(tf('# iş birlikte çalışıyor', adet)) + '</span>'
        + ok('data-gorev-onceki', '‹')
        + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:#C2AAEE;'
          + 'min-width:32px;text-align:center">' + (gorevIndeks+1) + ' / ' + adet + '</span>'
        + ok('data-gorev-sonraki', '›')
        + '</div>';
    }

    // ---- DETAIL AREA OF THE SHOWN TASK ----
    // Until 1.1.8 this box was FIXED as the card farming queue. When you moved to another job with ‹ › in the panel
    // the row above changed, the queue below stayed as it was; even if the card queue was empty
    // it showed "Kuyruk boş" on screen while looking at the achievement job. Now the area
    // draws the shown job's own detail.
    const DETAY_SATIR = 'display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid #101621';
    const DETAY_MONO = 'font-family:Geist Mono,monospace;font-size:11px';
    const detayBos = (metin) => '<div style="padding:12px 0;font-size:11px;color:#656D80">' + metin + '</div>';

    // Thin progress bar. The percentage is computed differently for each job type, the drawing is shared.
    function detayCubuk(yuzde, renk){
      const y = Math.max(0, Math.min(100, Math.round(yuzde || 0)));
      return '<div style="height:4px;border-radius:999px;background:#101621;overflow:hidden;width:64px;flex-shrink:0">'
        + '<div style="height:100%;width:' + y + '%;background:' + (renk || GC.sub) + '"></div></div>';
    }

    // The row start marks used to be Unicode characters like ▸ ★ ◷. Depending on the font their heights
    // and baselines did not line up: three rows had three different sizes, small shapes whose meaning
    // was unclear. They were all converted to SVGs that fit the same 16 pixel frame, with the same line
    // thickness.
    const DETAY_IKON = {
      // arrow: next / being sent
      sonraki: '<path d="M5 12h13M13 7l5 5-5 5"></path>',
      // target: counter (unlocked, processed)
      sayac: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
      // hour: remaining time
      sure: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4.5l3 1.8"></path>',
    };
    function detayIkon(ad, renk){
      const yol = DETAY_IKON[ad];
      if (!yol) return '';
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + (renk || GC.muted)
        + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="display:block">'
        + yol + '</svg>';
    }

    // `sira` is either a rank number text (#1, #2) or a DETAY_IKON key.
    function detaySatiri(sira, ad, sag, yuzde, renk, vurgu){
      const renkli = vurgu ? GC.sub : GC.muted;
      const bas = DETAY_IKON[sira]
        ? detayIkon(sira, renkli)
        : '<span style="' + DETAY_MONO + ';font-weight:700;color:' + renkli + '">' + sira + '</span>';
      return '<div style="' + DETAY_SATIR + '">'
        + '<span style="width:24px;flex-shrink:0;display:flex;align-items:center;justify-content:center">' + bas + '</span>'
        + '<span style="font-size:12.5px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">' + esc(ad) + '</span>'
        + '<span style="' + DETAY_MONO + ';color:#8B8F9E;flex-shrink:0">' + sag + '</span>'
        + (yuzde === null ? '' : detayCubuk(yuzde, vurgu ? (renk || GC.ok) : '#333D4D'))
        + '</div>';
    }

    // Card farming: queue (#order · name · cards left · percent)
    function detayKart(currentId){
      if (!dropGames.length) return detayBos('Kuyruk boş - Kart Düşür sekmesinde listeyi yenile.');
      const list = (typeof orderedForMode === 'function' ? orderedForMode() : dropGames).slice(0, 12);
      const maxRem = list.reduce((m,g)=>Math.max(m,g.remaining),0) || 1;
      return list.map((g,i)=>{
        const on = g.appid === currentId;
        return detaySatiri('#'+(i+1), g.name, g.remaining + ' kart',
                           Math.round((1 - g.remaining/maxRem) * 100), GC.ok, on);
      }).join('');
    }

    // Hour booster: open games. If sync is running the bars use saat.js's SHARED TIMELINE
    // measure (remaining / job total), otherwise the session's own percentage.
    function detaySaat(){
      const liste = (typeof selectedSaat !== 'undefined' && selectedSaat.length)
        ? selectedSaat
        : (boostState.appids || []).map(id => (ownedGames.find(g=>g.appid===id) || { appid:id, name:'App '+id }));
      if (!liste.length) return detayBos('Saat Yükseltici sekmesinde oyun seç.');
      const aktif = new Set(boostState.activeAppids || boostState.appids || []);
      const gecen = Date.now() - (boostState.startedAt || Date.now());
      const oturumYuzde = boostState.durationMs ? (gecen / boostState.durationMs * 100) : 0;
      const bilgiVar = (typeof syncOyunBilgi !== 'undefined') && (typeof syncIsToplamMs !== 'undefined') && syncIsToplamMs > 0;
      return liste.slice(0, 12).map((g,i)=>{
        const on = aktif.has(g.appid);
        let yuzde = on ? oturumYuzde : 0;
        let sag = on ? 'çalışıyor' : 'sırada';
        if (bilgiVar){
          const b = syncOyunBilgi.get(g.appid);
          if (b){
            yuzde = b.bitti ? 100 : Math.max(0, Math.min(100, (1 - Math.max(0, b.kalanMs||0) / syncIsToplamMs) * 100));
            sag = b.bitti ? 'bitti' : monoTime(fmtSessionDur(Math.max(0, b.kalanMs||0)));
          }
        }
        return detaySatiri('#'+(i+1), g.name, sag, yuzde, '#5624B3', on);
      }).join('');
    }

    // Realistic Mode: unlocked / remaining achievements and the time to the next one.
    function detayGercekci(){
      if (typeof grDurum === 'undefined' || !grDurum) return detayBos('Gerçekçi Mod çalışmıyor.');
      const acilan = grDurum.acilan || 0, toplam = grDurum.toplam || 0;
      const kalanAd = grDurum.siradaki || '-';
      // siradakiZaman is an absolute timestamp, converted to a countdown.
      const sonraki = grDurum.siradakiZaman
        ? monoTime(fmtSessionDur(Math.max(0, grDurum.siradakiZaman - Date.now()))) : '-';
      const kalanSure = grDurum.bitis ? Math.max(0, grDurum.bitis - Date.now()) : 0;
      const oturumYuzde = (grDurum.baslangic && grDurum.bitis)
        ? ((Date.now() - grDurum.baslangic) / Math.max(1, grDurum.bitis - grDurum.baslangic) * 100)
        : null;
      return detaySatiri('sonraki', 'Sıradaki', kisalt(kalanAd, 20) + '  ' + sonraki, null, null, true)
        + detaySatiri('sayac', 'Açılan başarım', acilan + ' / ' + toplam, toplam ? (acilan/toplam*100) : 0, '#C2AAEE', true)
        + detaySatiri('sure', 'Oturumun sonuna', monoTime(fmtSessionDur(kalanSure)), oturumYuzde, '#C2AAEE', true);
    }

    // Achievement job: the achievement being sent at that moment and the remaining estimate by the selected interval.
    function detayBasarim(){
      const yap = (typeof acRunYapilan !== 'undefined') ? acRunYapilan : 0;
      const top = (typeof acRunToplam !== 'undefined') ? acRunToplam : 0;
      const not = (typeof acRunNot !== 'undefined' && acRunNot) ? acRunNot : '-';
      // Remaining time = remaining achievements x selected interval. The real wait deviates randomly
      // every round (see acNextDelayMs), so this is an estimate; the average is right.
      let kalanSure = '-';
      if (typeof acBaseDelaySec === 'function' && top > yap){
        kalanSure = monoTime(fmtSessionDur((top - yap) * acBaseDelaySec() * 1000));
      }
      return detaySatiri('sonraki', 'Gönderiliyor', kisalt(not.replace(/^gönderiliyor:\s*/i, ''), 22), null, null, true)
        + detaySatiri('sayac', 'İşlenen', yap + ' / ' + top, top ? (yap/top*100) : 0, GC.ok, true)
        + detaySatiri('sure', 'Tahmini kalan', kalanSure, null, null, true);
    }

    // Draws the shown task's detail. If no job is running the card queue is shown:
    // the Başlat at the bottom of the panel starts card farming too, so it is consistent on screen.
    function renderGorevDetay(gorev, currentId){
      const qbox = document.getElementById('gQueue');
      if (!qbox) return;
      let html;
      if (!gorev) html = detayKart(null);
      else if (gorev.tab === 'kart') html = detayKart(currentId);
      else if (gorev.tab === 'saat') html = detaySaat();
      else if (gorev.tab === 'gercekci') html = detayGercekci();
      else if (gorev.tab === 'basarim') html = detayBasarim();
      else html = detayKart(null);
      qbox.innerHTML = html;
    }

    E.onTick(()=>{ renderGenelActive(); renderGenelStats(); });
    E.onBoostTick(()=>{ renderGenelActive(); renderGenelStats(); });
    E.onSaatFarmTick(()=>{ renderGenelActive(); renderGenelStats(); });
    // gercekci.js registers its own listener FIRST (file order), so by the time we get here
    // grDurum has been updated. Otherwise the panel would be one tick behind.
    if (window.imu.gercekci && window.imu.gercekci.onTick){
      window.imu.gercekci.onTick(()=>{ renderGenelActive(); renderGenelStats(); });
    }

    // Quick action toast - it should give feedback the moment it is clicked, not make you wait for the result.
    function toast(text){
      const box = document.getElementById('toastBox');
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = '<span class="tspin"></span><span class="tt">'+esc(text)+'</span>';
      box.appendChild(el);
      requestAnimationFrame(()=>el.classList.add('show'));
      return {
        done(text2){
          el.innerHTML = '<span class="tick">✓</span><span class="tt">'+esc(text2)+'</span>';
          el.classList.remove('err'); el.classList.add('ok');
          setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),200); }, 2200);
        },
        fail(text2){
          el.innerHTML = '<span class="terr">✕</span><span class="tt">'+esc(text2)+'</span>';
          el.classList.add('err');
          setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),200); }, 2800);
        },
      };
    }

    async function refreshGamesQuick(){
      const t = toast('Oyun listesi yenileniyor…');
      kartLoaded = false; saatLoaded = false;
      const con = await E.connect();
      if (con.ok){
        const r = await E.dropGames(); if (r.ok){ dropGames = r.games; kartLoaded = true; }
        const r2 = await E.ownedGames(); if (r2.ok){ ownedGames = r2.games; saatLoaded = true; }
      }
      renderGenelStats(); renderGenelActive();
      if (con.ok){ pushFeed('kart', 'Oyun Listesi', 'Kütüphane ve kart listesi yenilendi.', 'Başarılı'); t.done('Oyun listesi yenilendi.'); }
      else { pushFeed('hata', 'Oyun Listesi', tf('Bağlantı hatası: #', con.error), 'Hata'); t.fail(tf('Bağlantı hatası: #', con.error)); }
    }

    const goTab = (tab) => document.querySelector('.nav a[data-tab='+tab+']').click();

    document.getElementById('gRefresh').onclick = refreshGamesQuick;
    document.getElementById('gOpenQueue').onclick = ()=> goTab('kart');
    document.getElementById('gNavHub').onclick = ()=> goTab('env');
    document.getElementById('gNavBoost').onclick = ()=> goTab('saat');
    document.getElementById('gNavAch').onclick = ()=> goTab('basarim');

    // Connects to Kart Düşür's real engine, with the mode and duration selected there.
    function kartiBaslat(){
      if (!dropGames.length){ toast('Önce oyun listesini yenile.').fail('Düşürülecek kart bulunamadı.'); return; }
      const games = orderedForMode().map(g=>({appid:g.appid,name:g.name,remaining:g.remaining}));
      E.startFarm(selectedMode, games, durationSec*1000);
      if (typeof setKartPill === 'function') setKartPill(true, 'Çalışıyor');
      notify('farm', 'Kart Düşürme Başladı', tf('# oyun sırada.', games.length));
      pushFeed('kart', 'Kart Düşürme', tf('# oyun ile başladı.', games.length), 'Çalışıyor');
    }
    function kartiDurdur(){
      E.stopFarm();
      if (typeof setKartPill === 'function') setKartPill(false, 'Durduruldu');
      notify('farm', 'Kart Düşürme Durdu', '');
      pushFeed('kart', 'Kart Düşürme', 'Durduruldu.', 'Durdu');
    }

    // The three buttons under the panel behave according to the task being shown at that moment. While a running
    // job is shown Başlat is meaningless (it is already running), Durdur stops that job;
    // when no job is running Durdur is meaningless, Başlat starts card farming.
    function panelDugmeleriniBoya(){
      const bas = document.getElementById('gStart');
      const dur = document.getElementById('gStop');
      const det = document.getElementById('gDetail');
      const g = gorevListesi[gorevIndeks];
      const pasif = (el, kapali)=>{
        if (!el) return;
        el.disabled = !!kapali;
        el.style.opacity = kapali ? '0.4' : '1';
        el.style.cursor = kapali ? 'not-allowed' : 'pointer';
      };
      pasif(bas, !!g);
      pasif(dur, !g);
      if (det) det.textContent = g ? ('Detay: ' + GOREV_ADI[g.tab]) : 'Detay';
    }
    const GOREV_ADI = { kart:'Kart', saat:'Saat', gercekci:'Gerçekçi', basarim:'Başarım' };

    document.getElementById('gDetail').onclick = ()=>{
      const g = gorevListesi[gorevIndeks];
      goTab(g ? g.tab : 'kart');
    };
    document.getElementById('gStart').onclick = ()=>{
      if (gorevListesi[gorevIndeks]) return;    // the shown job is already running
      kartiBaslat();
    };
    document.getElementById('gStop').onclick = ()=>{
      const g = gorevListesi[gorevIndeks];
      if (!g) return;
      if (typeof g.durdur === 'function') g.durdur();
    };

    // Quick action buttons. ALL of them inside try/catch: if an error is thrown we must close the toast and
    // show the reason, otherwise the spinner spins forever and the user waits looking at
    // the "yenileniyor" text.
    function hizliIslem(btnId, calisanMetin, isFn){
      const b = document.getElementById(btnId);
      if (!b) return;
      let mesgul = false;
      b.onclick = async ()=>{
        if (mesgul) return;                 // so two requests do not go on a double click
        mesgul = true;
        b.style.opacity = '0.5'; b.style.cursor = 'wait';
        const t = toast(calisanMetin);
        try {
          const sonuc = await isFn();
          if (sonuc && sonuc.hata) t.fail(sonuc.hata);
          else t.done((sonuc && sonuc.mesaj) || 'Tamamlandı.');
        } catch (e) {
          t.fail((e && e.message) || 'Bilinmeyen hata.');
          pushFeed('hata', 'Hızlı İşlem', (e && e.message) || 'Bilinmeyen hata.', 'Hata');
        } finally {
          mesgul = false;
          b.style.opacity = '1'; b.style.cursor = 'pointer';
        }
      };
    }

    hizliIslem('qaGames', 'Oyun listesi yenileniyor…', async ()=>{
      await refreshGamesQuick();
      return { mesaj: 'Oyun listesi yenilendi.' };
    });

    hizliIslem('qaInv', 'Envanter yenileniyor…', async ()=>{
      if (typeof loadEnv !== 'function') return { hata: 'Envanter sayfası hazır değil.' };
      envLoaded = false;
      await loadEnv();
      // loadEnv silently returns on error; check whether data really arrived,
      // otherwise we said "yenilendi" and misled the user.
      if (!invMerged || !invMerged.length) return { hata: 'Envanter alınamadı. Envanter sekmesindeki hatayı kontrol et.' };
      renderGenelStats();
      pushFeed('envanter', 'Envanter', 'Envanter Steam\'den yeniden çekildi.', 'Başarılı');
      return { mesaj: tf('# çeşit öğe yüklendi.', invMerged.length) };
    });

    // "Pazarı Yenile" - refreshes the market PRICES, not the inventory (skips the cache).
    hizliIslem('qaPazar', 'Pazar fiyatları yenileniyor…', async ()=>{
      if (!invMerged || !invMerged.length) return { hata: 'Önce envanteri yükle.' };
      if (typeof fetchPricesForView !== 'function') return { hata: 'Envanter sayfası hazır değil.' };
      await window.imu.settings.clearPriceCache();
      if (typeof priceMap !== 'undefined') priceMap.clear();
      // An undefined requestPrices() used to be called here.
      await fetchPricesForView();
      renderGenelStats();
      pushFeed('pazar', 'Pazar', 'Market fiyatları yeniden çekiliyor.', 'Çalışıyor');
      return { mesaj: 'Fiyatlar çekiliyor, Envanter sekmesinden ilerlemeyi görebilirsin.' };
    });
    document.getElementById('qaSettings').onclick = ()=> openAyarlar();

    // Genel Bakış is already the visible tab at startup - load the first data without a click.
    loadGenel();
    // The language change reloaded the page: take the user back to the Ayarlar section they left (i18n.js).
    try {
      const donus = sessionStorage.getItem(I18N_DONUS_ANAHTARI);
      if (donus) { sessionStorage.removeItem(I18N_DONUS_ANAHTARI); openAyarlar(donus); }
    } catch (_) {}
