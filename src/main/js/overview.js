    // ================= GENEL BAKIŞ (OVERVIEW) =================
    // All the numbers in the panels come from real Steam data and from the engine's own
    // measurements; there is no sample/fixed data.
    const sessionStartTs = Date.now();
    let overviewLoaded = false;

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
    const DEFAULT_STATUS_BY_KIND = { error:'Hata', warning:'Uyarı' };

    // {kind, title, text, status, ts} - real application events.
    // PERSISTENT: kept in the account store, the history is not lost when the app closes and reopens.
    let activityFeed = [];
    const ACTIVITY_KEY = 'activityFeed';
    let activityWriteTime = null;

    async function loadActivity(){
      try {
        const r = await window.imu.state.get(ACTIVITY_KEY);
        if (r && Array.isArray(r.value)) { activityFeed = r.value.slice(0, 30); renderFeed(); }
      } catch (_) {}
    }
    // We batch the disk writes: in back to back events it should not go to the file every time.
    function saveActivity(){
      if (activityWriteTime) clearTimeout(activityWriteTime);
      activityWriteTime = setTimeout(()=>{
        activityWriteTime = null;
        try { window.imu.state.set(ACTIVITY_KEY, activityFeed).catch(()=>{}); } catch (_) {}
      }, 800);
    }
    function pushFeed(kind, title, text, status){
      const st = status || DEFAULT_STATUS_BY_KIND[kind] || 'Başarılı';
      activityFeed.unshift({ kind: kind||'hours', title, text, status: st, ts: Date.now() });
      if (activityFeed.length > 30) activityFeed.length = 30;
      renderFeed();
      saveActivity();
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
        const t = new Date(f.ts).toLocaleTimeString(localCode());
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
    document.getElementById('gClearFeed').onclick = ()=>{ activityFeed.length=0; renderFeed(); saveActivity(); };

    function fmtSessionDur(ms){
      const s = Math.floor(ms/1000);
      const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), pick=s%60;
      return h>0 ? (String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(pick).padStart(2,'0')) : (String(m).padStart(2,'0')+':'+String(pick).padStart(2,'0'));
    }
    // In counters the colon is written in the accent colour: 04<span #C2AAEE>:</span>12
    function monoTime(str){ return String(str).replace(/:/g, '<span style="color:#C2AAEE">:</span>'); }

    document.getElementById('gStatSessionSub').textContent = t('Başlangıç:') + ' ' + new Date(sessionStartTs).toLocaleTimeString(localCode());
    setInterval(()=>{
      if (typeof uiTickAllowed === 'function' && !uiTickAllowed()) return;
      const el=document.getElementById('gStatSession');
      if(el) el.innerHTML = monoTime(fmtSessionDur(Date.now()-sessionStartTs));
      // The countdowns in the task row must not depend on the engine tick: Realistic Mode can stay
      // silent for minutes and "Kalan Süre" froze during that time.
      if (taskList.length) renderOverviewActive();
    }, 1000);

    function renderOverviewStats(){
      const c = document.getElementById('gStatCards'); if (!c) return;
      const set = (id, v, html) => { const e=document.getElementById(id); if(e){ if(html) e.innerHTML=v; else e.textContent=v; } };

      // Toplam Kart
      const totalCards = dropGames.reduce((s,g)=>s+g.remaining,0);
      c.textContent = cardsLoaded ? totalCards.toLocaleString(localCode()) : '-';
      set('gStatCardsSub', cardsLoaded ? (dropGames.length+' oyunda kart var') : 'Kart Düşür sekmesinde yenile');

      // Kütüphane
      set('gStatGames', (hoursLoaded && ownedGames.length) ? ownedGames.length.toLocaleString(localCode()) : '-');
      set('gStatGamesSub', cardsLoaded ? tf('# oyun toplamaya hazır', dropGames.length) : '-');

      // Envanter & Pazar - value + net after Steam's cut
      // The fallback branch is REQUIRED: when the account changes resetPageCaches() makes invMerged null but if the
      // box is not written the PREVIOUS ACCOUNT's value stayed on screen.
      if (invMerged){
        // Net: with Steam's own fee calculation (inventory.js > sellerAmount). A fixed 13% used to be
        // deducted; on cheap cards this rate does not hold because of Steam's base fee.
        let value=0, units=0, net=0;
        const lacking = [];
        invMerged.forEach(i=>{
          units+=i.count;
          if(i.marketable && i.marketHashName){
            const v=priceVal(i);
            if(v!=null){ value += v*i.count; const sn = sellerAmount(v); if (sn==null) lacking.push(v); else net += sn*i.count; }
          }
        });
        set('gStatValue', fmtLira(value));
        set('gStatValueSub', lacking.length ? tf('# öğe', localNumber(units)) : tf('# öğe · net #', localNumber(units), fmtLira(net)));
        if (lacking.length) prepareNet(lacking);
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
    let listsFresh = false;    // did the lists on screen come from Steam or from disk
    async function cachedLists(){
      try {
        const r = await E.lastLists();
        if (!r || !r.ok) return;
        if (!cardsLoaded && Array.isArray(r.drop) && r.drop.length){ dropGames = r.drop; cardsLoaded = true; }
        if (!hoursLoaded && Array.isArray(r.owned) && r.owned.length){ ownedGames = r.owned; hoursLoaded = true; }
        renderOverviewStats();
      } catch (_) {}
    }

    async function loadOverview(){
      if (!overviewLoaded){
        overviewLoaded = true;
        // Profile FIRST: since the last known name/avatar/level comes with the settings it is
        // written to the screen right away. This line used to run after the connection was made and the account badge
        // in the top right showed a dash until the session opened.
        loadProfile();
        await cachedLists();   // so the card and library counts show right away
        await loadActivity();   // bring back the persistent activity history
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
            // do not go stale. listsFresh reduces this to once.
            if (!cardsLoaded || !listsFresh){ const r = await E.dropGames(); if (r.ok){ dropGames = r.games; cardsLoaded = true; } }
            if (!hoursLoaded || !listsFresh){ const r2 = await E.ownedGames(); if (r2.ok){ ownedGames = r2.games; hoursLoaded = true; } }
            listsFresh = true;
            // If Kart Düşür is open on screen redraw it with the fresh list (if hidden leave it alone:
            // the hidden tab's list is deliberately not kept in memory).
            try {
              if (typeof renderCards === 'function' && designed.card && !designed.card.classList.contains('hidden')) renderCards();
            } catch (_) {}
          } else if (con && con.error){
            pushFeed('error', 'Bağlantı', con.error, 'Hata');
          }
        } catch (e) {
          pushFeed('error', 'Bağlantı', (e && e.message) || 'Steam bağlantısı kurulamadı.', 'Hata');
        }
      }
      renderOverviewStats();
      renderOverviewActive();
      renderFeed();
      renderLifeStats();
    }

    // CARD DROPS ARE MEASURED IN THE MAIN PROCESS (main.js > watchCards). This file used to poll the badge page once a
    // minute: only for the account on screen, while the window was open, and in the second
    // session it never started (because the baseline was not reset). A card dropped on a background account
    // was not counted, a game that ran out of cards did not leave the queue. Now the main process watches each account
    // separately; the event and the current list come here.
    let farmDroppedCount = 0;
    E.onFarmList((d)=>{
      if (!d || !Array.isArray(d.games)) return;
      dropGames = d.games; cardsLoaded = true;
      farmDroppedCount = d.sessionDropped || 0;
      if (typeof renderCards === 'function' && designed.card && !designed.card.classList.contains('hidden')) renderCards();
      renderOverviewStats(); renderOverviewActive();
    });

    // Account events. The notification is shown for every account (the background account's name first),
    // only the on-screen account's are written to the activity feed; the main process writes the background one's
    // to that account's own feed.
    const EVENT_NOTIFICATION = {
      cardDropped:     (o)=>['farm',  tf('# kart düştü', o.itemCount), o.displayName],
      cardsDone:  ()=>['farm',  'Kart Düşürme Bitti', 'Tüm kartlar toplandı.'],
      achievementUnlocked: (o)=>['ach',   'Başarım açıldı', o.displayName],
      boostFinished:    (o)=>['boost', 'Saat Yükseltme Bitti', o.feedEntry ? o.feedEntry.text : ''],
      syncFinished: ()=>['boost', 'Saat Eşitleme Tamamlandı', 'Tüm oyunlar hedefe ulaştı.'],
      connectionAbandoned: (o)=>['error', 'Steam Bağlantısı', o.permanent
        ? 'Steam oturumu kapandı, yeniden bağlanılmıyor.' : 'Yeniden bağlanma denemeleri bitti.'],
      cardStopped:     (o)=>['farm',  'Kart Düşürme Durdu', o.feedEntry ? o.feedEntry.text : ''],
    };
    window.imu.onAccountEvent((o)=>{
      if (!o || !o.typeName) return;
      const b = EVENT_NOTIFICATION[o.typeName];
      // The card drop depends on a separate setting ("Kart düşünce bildir")
      const report = b && (o.typeName !== 'cardDropped' || (appSettings && appSettings.notifyCardDrop));
      if (report){
        const [category, title, bodyEl] = b(o);
        notify(category, title, o.activeIds ? t(bodyEl || '') : ('[' + o.accountRef + '] ' + t(bodyEl || '')));
      }
      if (!o.activeIds) return;
      if (o.typeName === 'cardDropped'){
        pushFeed('card', tf('# kart düştü', o.itemCount), o.displayName, 'Başarılı');
        if (typeof pushDrop === 'function') pushDrop(o.appid, o.displayName, o.itemCount);
        // "Pazarda Otomatik Satış": list that game's new cards
        if (appSettings && appSettings.farmAutoSell && typeof autoSellDropped === 'function') autoSellDropped(o.displayName);
      } else if (o.feedEntry){
        pushFeed(o.feedEntry.kind, o.feedEntry.title, o.feedEntry.text, o.feedEntry.status);
      }
      if (o.typeName === 'achievementUnlocked' && typeof acCache !== 'undefined') acCache.delete(o.appid);
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
    function taskRow(g){
      const percent = Math.max(0, Math.min(100, Math.round(g.percentValue || 0)));
      return '<div style="display:flex;flex-direction:column;gap:11px;padding:14px 0 4px;border-top:1px solid #101621">'
        + '<div style="display:flex;align-items:flex-start;gap:14px">'
          // Library header ratio (920x430, ~2.14:1)
          + '<div style="width:116px;height:54px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;'
            + 'background:#101621;overflow:hidden;display:flex;align-items:center;justify-content:center">'
            + (g.appid ? gameThumb(g.appid)
                       : '<span style="display:flex;align-items:center;justify-content:center;transform:scale(1.7);transform-origin:center">'
                         + detailIcon(g.iconRef, g.colorValue || GC.sub) + '</span>')
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:5px;min-width:0;flex:1">'
            + '<span style="font-size:15px;font-weight:700;color:#DCE2FA;white-space:nowrap;overflow:hidden;'
              + 'text-overflow:ellipsis;line-height:1.2">' + esc(g.heading) + '</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10.5px;color:#8B8F9E">'
              + (g.appid ? ('APP_ID: ' + g.appid) : esc(g.subInfo || '')) + '</span>'
            + '<div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap">'
              + (g.badges || []).map(chip).join('') + '</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:22px;flex-shrink:0">'
            + (g.columns || []).map(c=>statCol(c[0], c[1], c[2])).join('')
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:11px">'
          + '<div style="flex:1;min-width:0;height:8px;border-radius:12px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
            + '<div style="height:100%;width:' + percent + '%;border-radius:12px;background:' + (g.colorValue || '#24AEB3') + '"></div>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;flex-shrink:0;'
            + 'min-width:38px;text-align:right;color:' + (g.colorValue || '#24AEB3') + '">' + fmtPercent(percent) + '</span>'
        + '</div>'
        + (g.started
            ? ('<span style="font-family:Geist Mono,monospace;font-size:10px;color:#656D80">' + esc(t('Başlangıç:')) + ' '
               + fmtClock(g.started) + '</span>')
            : '')
        + '</div>';
    }

    // The task currently shown in the panel. The Başlat / Durdur / Detay below act according to this selection;
    // all three used to be tied to the fixed Kart Düşür and while hour boosting ran Detay opened the wrong
    // page.
    let taskList = [], taskIndex = 0;
    const shorten = (s, n)=>{ s = String(s||''); return s.length > n ? (s.slice(0, n-1)+'…') : s; };
    // Presses the related page's own button: its validation, its toast and the statistics write
    // live there, copying them here would mean maintenance in two places.
    function pressPageButton(id){
      const b = document.getElementById(id);
      if (b) b.click();
    }

    function renderOverviewActive(){
      const box = document.getElementById('gActiveBody');
      const qbox = document.getElementById('gQueue');
      if (!box || !qbox) return;

      const tasks = [];
      const farmOn = lastTick && lastTick.running;
      const boostOn = boostState && boostState.running;
      // in the same global scope as achievements.js; if a bulk operation is running let it show here too
      const achOn = (typeof acRunning !== 'undefined') && acRunning;
      // G12: Realistic Mode is a job too - it used to never be watched. While running alone the
      // panel said "no running job" and Başlat started card farming.
      const grOn = (typeof grStatus !== 'undefined') && grStatus && grStatus.runningFlag;

      let heroId = null;
      if (farmOn){
        const activeIds = lastTick.activeAppids || [];
        heroId = lastTick.currentAppid || activeIds[0] || 0;
        const cur = dropGames.find(g=>g.appid===heroId);
        const nextDrop = lastTick.durationMs ? fmtSessionDur(Math.max(0, lastTick.durationMs - (lastTick.elapsedMs||0))) : '-';
        tasks.push({
          tab:'card', appid:heroId, heading:(cur?cur.name:'Kart Düşürme'),
          badges:[modeLabels[selectedMode]||selectedMode, tf('# oyun eşzamanlı', activeIds.length)],
          columns:[['Kalan Kart', (cur?cur.remaining:0), GC.sub],
                    ['Oturum Süresi', monoTime(fmtSessionDur(Date.now()-(lastTick.sessionStart||Date.now())))],
                    ['Sonraki Düşüş', monoTime(nextDrop)]],
          percentValue: lastTick.durationMs ? (lastTick.elapsedMs/lastTick.durationMs*100) : 100,
          started: lastTick.sessionStart || null,
          colorValue:'#24AEB3', haltJob: stopCard,
        });
      }
      if (boostOn){
        const ids = boostState.activeAppids || boostState.appids || [];
        const bId = ids[0] || 0;
        const g = ownedGames.find(x=>x.appid===bId);
        const passed = Date.now()-(boostState.startedAt||Date.now());
        const left = boostState.durationMs ? fmtSessionDur(Math.max(0, boostState.durationMs-passed)) : '-';
        tasks.push({
          tab:'hours', appid:bId, heading:(g?g.name:'Saat Yükseltici'),
          badges:['Saat Yükseltici', tf('# oyun eşzamanlı', ids.length)],
          columns:[['Aktif Oyun', ids.length, GC.sub],
                    ['Oturum Süresi', monoTime(fmtSessionDur(passed))],
                    ['Kalan', monoTime(left)]],
          percentValue: boostState.durationMs ? (passed/boostState.durationMs*100) : 100,
          started: boostState.startedAt || null,
          colorValue:'#5624B3', haltJob: ()=>pressPageButton('btnBoostStop'),
        });
      }
      if (achOn){
        const perform = (typeof acRunDone !== 'undefined') ? acRunDone : 0;
        const top = (typeof acRunTotal !== 'undefined') ? acRunTotal : 0;
        tasks.push({
          tab:'achievements', appid:(typeof acAppid !== 'undefined' ? acAppid : 0),
          heading:'Başarım İşlemi', subInfo:'toplu aç / kilitle',
          badges:['Başarımlar', (top ? (perform+' / '+top) : 'çalışıyor')],
          columns:[['İşlenen', perform+' / '+top, GC.ok]],
          percentValue: top ? (perform/top*100) : 0,
          colorValue:'#5FB324', iconRef:'counter', haltJob: ()=>pressPageButton('acStop'),
        });
      }
      if (grOn){
        const opened = grStatus.openedGames || 0, sumTotal = grStatus.totalSum || 0;
        const remainingTime = grStatus.finishTime ? Math.max(0, grStatus.finishTime - Date.now()) : 0;
        tasks.push({
          tab:'realistic', appid: grStatus.appid || 0,
          heading: grStatus.gameTitle || 'Gerçekçi Mod',
          subInfo: 'başarımlar zamana yayılıyor',
          badges:['Gerçekçi Mod',
                    (grStatus.gameCount > 1 ? ('oyun ' + ((grStatus.gameIndex||0)+1) + ' / ' + grStatus.gameCount) : 'tek oyun')],
          columns:[['Açılan', opened + ' / ' + sumTotal, GC.ok],
                    ['Kalan Süre', monoTime(fmtSessionDur(remainingTime))],
                    ['Sıradaki', grStatus.upNext ? shorten(grStatus.upNext, 16) : '-']],
          percentValue: sumTotal ? (opened/sumTotal*100) : 0,
          started: grStatus.startPoint || null,
          colorValue:'#C2AAEE', haltJob: ()=>pressPageButton('grStop'),
        });
      }

      setRunPill(tasks.length > 0);

      taskList = tasks;

      if (!tasks.length){
        taskIndex = 0;
        box.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0">'
          + '<span style="font-size:13px;font-weight:600;color:#DCE2FA">Şu anda çalışan bir işlem yok</span>'
          + '<span style="font-size:11px;color:#8B8F9E">Aşağıdaki Başlat ile kart düşürmeyi başlatabilirsin.</span></div>';
        paintPanelButtons();
        renderTaskDetail(null, null);
        return;
      }

      // If there is more than one job, instead of stacking them all they are shown one by one; browsed with ‹ ›.
      // The panel's height is fixed, with three jobs active at once the queue below was squashed.
      if (taskIndex >= tasks.length) taskIndex = tasks.length - 1;
      if (taskIndex < 0) taskIndex = 0;
      const activeTask = tasks[taskIndex];

      box.innerHTML = (tasks.length > 1 ? navStrip(tasks.length) : '')
        + taskRow(activeTask);

      const git = (direction)=>{
        taskIndex = (taskIndex + direction + taskList.length) % taskList.length;
        renderOverviewActive();
      };
      const onc = box.querySelector('[data-gorev-onceki]');
      const latest = box.querySelector('[data-gorev-sonraki]');
      if (onc) onc.onclick = ()=>git(-1);
      if (latest) latest.onclick = ()=>git(1);

      paintPanelButtons();
      renderTaskDetail(activeTask, heroId);
    }

    // The ‹ 2 / 3 › strip. The text in the middle says which job is being looked at.
    function navStrip(count){
      const ok = (attr, marker)=>'<button class="h-bd" '+attr+' style="width:22px;height:22px;flex-shrink:0;'
        + 'border-radius:999px;background:#090C12;border:1px solid #333D4D;color:#B9C0D6;font-size:12px;'
        + 'line-height:1;cursor:pointer;padding:0">'+marker+'</button>';
      return '<div style="display:flex;align-items:center;gap:8px;padding-bottom:2px">'
        + '<span style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;'
          + 'color:#8B8F9E;flex:1">' + esc(tf('# iş birlikte çalışıyor', count)) + '</span>'
        + ok('data-gorev-onceki', '‹')
        + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:#C2AAEE;'
          + 'min-width:32px;text-align:center">' + (taskIndex+1) + ' / ' + count + '</span>'
        + ok('data-gorev-sonraki', '›')
        + '</div>';
    }

    // ---- DETAIL AREA OF THE SHOWN TASK ----
    // Until 1.1.8 this box was FIXED as the card farming queue. When you moved to another job with ‹ › in the panel
    // the row above changed, the queue below stayed as it was; even if the card queue was empty
    // it showed "Kuyruk boş" on screen while looking at the achievement job. Now the area
    // draws the shown job's own detail.
    const DETAIL_ROW = 'display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid #101621';
    const DETAIL_MONO = 'font-family:Geist Mono,monospace;font-size:11px';
    const detailEmpty = (text) => '<div style="padding:12px 0;font-size:11px;color:#656D80">' + text + '</div>';

    // Thin progress bar. The percentage is computed differently for each job type, the drawing is shared.
    function detailBar(percent, colorVal){
      const y = Math.max(0, Math.min(100, Math.round(percent || 0)));
      return '<div style="height:4px;border-radius:999px;background:#101621;overflow:hidden;width:64px;flex-shrink:0">'
        + '<div style="height:100%;width:' + y + '%;background:' + (colorVal || GC.sub) + '"></div></div>';
    }

    // The row start marks used to be Unicode characters like ▸ ★ ◷. Depending on the font their heights
    // and baselines did not line up: three rows had three different sizes, small shapes whose meaning
    // was unclear. They were all converted to SVGs that fit the same 16 pixel frame, with the same line
    // thickness.
    const DETAIL_ICON = {
      // arrow: next / being sent
      next: '<path d="M5 12h13M13 7l5 5-5 5"></path>',
      // target: counter (unlocked, processed)
      counter: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
      // hour: remaining time
      duration: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4.5l3 1.8"></path>',
    };
    function detailIcon(name, colorVal){
      const pathStr = DETAIL_ICON[name];
      if (!pathStr) return '';
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + (colorVal || GC.muted)
        + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="display:block">'
        + pathStr + '</svg>';
    }

    // `sira` is either a rank number text (#1, #2) or a DETAIL_ICON key.
    function detailRow(position, name, rightSide, percent, colorVal, emphasis){
      const colored = emphasis ? GC.sub : GC.muted;
      const begin = DETAIL_ICON[position]
        ? detailIcon(position, colored)
        : '<span style="' + DETAIL_MONO + ';font-weight:700;color:' + colored + '">' + position + '</span>';
      return '<div style="' + DETAIL_ROW + '">'
        + '<span style="width:24px;flex-shrink:0;display:flex;align-items:center;justify-content:center">' + begin + '</span>'
        + '<span style="font-size:12.5px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">' + esc(name) + '</span>'
        + '<span style="' + DETAIL_MONO + ';color:#8B8F9E;flex-shrink:0">' + rightSide + '</span>'
        + (percent === null ? '' : detailBar(percent, emphasis ? (colorVal || GC.ok) : '#333D4D'))
        + '</div>';
    }

    // Card farming: queue (#order · name · cards left · percent)
    function detailCard(currentId){
      if (!dropGames.length) return detailEmpty('Kuyruk boş - Kart Düşür sekmesinde listeyi yenile.');
      const list = (typeof orderedForMode === 'function' ? orderedForMode() : dropGames).slice(0, 12);
      const maxRem = list.reduce((m,g)=>Math.max(m,g.remaining),0) || 1;
      return list.map((g,i)=>{
        const on = g.appid === currentId;
        return detailRow('#'+(i+1), g.name, g.remaining + ' kart',
                           Math.round((1 - g.remaining/maxRem) * 100), GC.ok, on);
      }).join('');
    }

    // Hour booster: open games. If sync is running the bars use hours.js's SHARED TIMELINE
    // measure (remaining / job total), otherwise the session's own percentage.
    function detailHours(){
      const listing = (typeof selectedHours !== 'undefined' && selectedHours.length)
        ? selectedHours
        : (boostState.appids || []).map(id => (ownedGames.find(g=>g.appid===id) || { appid:id, name:'App '+id }));
      if (!listing.length) return detailEmpty('Saat Yükseltici sekmesinde oyun seç.');
      const active = new Set(boostState.activeAppids || boostState.appids || []);
      const passed = Date.now() - (boostState.startedAt || Date.now());
      const sessionPercent = boostState.durationMs ? (passed / boostState.durationMs * 100) : 0;
      const hasInfo = (typeof syncGameInfo !== 'undefined') && (typeof syncJobTotalMs !== 'undefined') && syncJobTotalMs > 0;
      return listing.slice(0, 12).map((g,i)=>{
        const on = active.has(g.appid);
        let percent = on ? sessionPercent : 0;
        let rightSide = on ? 'çalışıyor' : 'sırada';
        if (hasInfo){
          const b = syncGameInfo.get(g.appid);
          if (b){
            percent = b.isFinished ? 100 : Math.max(0, Math.min(100, (1 - Math.max(0, b.remainingMs||0) / syncJobTotalMs) * 100));
            rightSide = b.isFinished ? 'finished' : monoTime(fmtSessionDur(Math.max(0, b.remainingMs||0)));
          }
        }
        return detailRow('#'+(i+1), g.name, rightSide, percent, '#5624B3', on);
      }).join('');
    }

    // Realistic Mode: unlocked / remaining achievements and the time to the next one.
    function detailRealistic(){
      if (typeof grStatus === 'undefined' || !grStatus) return detailEmpty('Gerçekçi Mod çalışmıyor.');
      const opened = grStatus.openedGames || 0, sumTotal = grStatus.totalSum || 0;
      const remainingName = grStatus.upNext || '-';
      // siradakiZaman is an absolute timestamp, converted to a countdown.
      const following = grStatus.upNextTime
        ? monoTime(fmtSessionDur(Math.max(0, grStatus.upNextTime - Date.now()))) : '-';
      const remainingTime = grStatus.finishTime ? Math.max(0, grStatus.finishTime - Date.now()) : 0;
      const sessionPercent = (grStatus.startPoint && grStatus.finishTime)
        ? ((Date.now() - grStatus.startPoint) / Math.max(1, grStatus.finishTime - grStatus.startPoint) * 100)
        : null;
      return detailRow('next', 'Sıradaki', shorten(remainingName, 20) + '  ' + following, null, null, true)
        + detailRow('counter', 'Açılan başarım', opened + ' / ' + sumTotal, sumTotal ? (opened/sumTotal*100) : 0, '#C2AAEE', true)
        + detailRow('duration', 'Oturumun sonuna', monoTime(fmtSessionDur(remainingTime)), sessionPercent, '#C2AAEE', true);
    }

    // Achievement job: the achievement being sent at that moment and the remaining estimate by the selected interval.
    function detailAchievement(){
      const perform = (typeof acRunDone !== 'undefined') ? acRunDone : 0;
      const top = (typeof acRunTotal !== 'undefined') ? acRunTotal : 0;
      const not = (typeof acRunNote !== 'undefined' && acRunNote) ? acRunNote : '-';
      // Remaining time = remaining achievements x selected interval. The real wait deviates randomly
      // every round (see acNextDelayMs), so this is an estimate; the average is right.
      let remainingTime = '-';
      if (typeof acBaseDelaySec === 'function' && top > perform){
        remainingTime = monoTime(fmtSessionDur((top - perform) * acBaseDelaySec() * 1000));
      }
      return detailRow('next', 'Gönderiliyor', shorten(not.replace(/^gönderiliyor:\s*/i, ''), 22), null, null, true)
        + detailRow('counter', 'İşlenen', perform + ' / ' + top, top ? (perform/top*100) : 0, GC.ok, true)
        + detailRow('duration', 'Tahmini kalan', remainingTime, null, null, true);
    }

    // Draws the shown task's detail. If no job is running the card queue is shown:
    // the Başlat at the bottom of the panel starts card farming too, so it is consistent on screen.
    function renderTaskDetail(taskItem, currentId){
      const qbox = document.getElementById('gQueue');
      if (!qbox) return;
      let html;
      if (!taskItem) html = detailCard(null);
      else if (taskItem.tab === 'card') html = detailCard(currentId);
      else if (taskItem.tab === 'hours') html = detailHours();
      else if (taskItem.tab === 'realistic') html = detailRealistic();
      else if (taskItem.tab === 'achievements') html = detailAchievement();
      else html = detailCard(null);
      qbox.innerHTML = html;
    }

    E.onTick(()=>{ renderOverviewActive(); renderOverviewStats(); });
    E.onBoostTick(()=>{ renderOverviewActive(); renderOverviewStats(); });
    E.onHourFarmTick(()=>{ renderOverviewActive(); renderOverviewStats(); });
    // realistic.js registers its own listener FIRST (file order), so by the time we get here
    // grStatus has been updated. Otherwise the panel would be one tick behind.
    if (window.imu.realistic && window.imu.realistic.onTick){
      window.imu.realistic.onTick(()=>{ renderOverviewActive(); renderOverviewStats(); });
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
      cardsLoaded = false; hoursLoaded = false;
      const con = await E.connect();
      if (con.ok){
        const r = await E.dropGames(); if (r.ok){ dropGames = r.games; cardsLoaded = true; }
        const r2 = await E.ownedGames(); if (r2.ok){ ownedGames = r2.games; hoursLoaded = true; }
      }
      renderOverviewStats(); renderOverviewActive();
      if (con.ok){ pushFeed('card', 'Oyun Listesi', 'Kütüphane ve kart listesi yenilendi.', 'Başarılı'); t.done('Oyun listesi yenilendi.'); }
      else { pushFeed('error', 'Oyun Listesi', tf('Bağlantı hatası: #', con.error), 'Hata'); t.fail(tf('Bağlantı hatası: #', con.error)); }
    }

    const goTab = (tab) => document.querySelector('.nav a[data-tab='+tab+']').click();

    document.getElementById('gRefresh').onclick = refreshGamesQuick;
    document.getElementById('gOpenQueue').onclick = ()=> goTab('card');
    document.getElementById('gNavHub').onclick = ()=> goTab('inventory');
    document.getElementById('gNavBoost').onclick = ()=> goTab('hours');
    document.getElementById('gNavAch').onclick = ()=> goTab('achievements');

    // Connects to Kart Düşür's real engine, with the mode and duration selected there.
    function startCard(){
      if (!dropGames.length){ toast('Önce oyun listesini yenile.').fail('Düşürülecek kart bulunamadı.'); return; }
      const games = orderedForMode().map(g=>({appid:g.appid,name:g.name,remaining:g.remaining}));
      E.startFarm(selectedMode, games, durationSec*1000);
      if (typeof setCardPill === 'function') setCardPill(true, 'Çalışıyor');
      notify('farm', 'Kart Düşürme Başladı', tf('# oyun sırada.', games.length));
      pushFeed('card', 'Kart Düşürme', tf('# oyun ile başladı.', games.length), 'Çalışıyor');
    }
    function stopCard(){
      E.stopFarm();
      if (typeof setCardPill === 'function') setCardPill(false, 'Durduruldu');
      notify('farm', 'Kart Düşürme Durdu', '');
      pushFeed('card', 'Kart Düşürme', 'Durduruldu.', 'Durdu');
    }

    // The three buttons under the panel behave according to the task being shown at that moment. While a running
    // job is shown Başlat is meaningless (it is already running), Durdur stops that job;
    // when no job is running Durdur is meaningless, Başlat starts card farming.
    function paintPanelButtons(){
      const begin = document.getElementById('gStart');
      const halt = document.getElementById('gStop');
      const det = document.getElementById('gDetail');
      const g = taskList[taskIndex];
      const passive = (el, closed)=>{
        if (!el) return;
        el.disabled = !!closed;
        el.style.opacity = closed ? '0.4' : '1';
        el.style.cursor = closed ? 'not-allowed' : 'pointer';
      };
      passive(begin, !!g);
      passive(halt, !g);
      if (det) det.textContent = g ? ('Detay: ' + TASK_NAME[g.tab]) : 'Detay';
    }
    const TASK_NAME = { card:'Kart', hours:'Saat', realistic:'Gerçekçi', achievements:'Başarım' };

    document.getElementById('gDetail').onclick = ()=>{
      const g = taskList[taskIndex];
      goTab(g ? g.tab : 'card');
    };
    document.getElementById('gStart').onclick = ()=>{
      if (taskList[taskIndex]) return;    // the shown job is already running
      startCard();
    };
    document.getElementById('gStop').onclick = ()=>{
      const g = taskList[taskIndex];
      if (!g) return;
      if (typeof g.haltJob === 'function') g.haltJob();
    };

    // Quick action buttons. ALL of them inside try/catch: if an error is thrown we must close the toast and
    // show the reason, otherwise the spinner spins forever and the user waits looking at
    // the "yenileniyor" text.
    function quickAction(btnId, runningText, isFn){
      const b = document.getElementById(btnId);
      if (!b) return;
      let occupied = false;
      b.onclick = async ()=>{
        if (occupied) return;                 // so two requests do not go on a double click
        occupied = true;
        b.style.opacity = '0.5'; b.style.cursor = 'wait';
        const t = toast(runningText);
        try {
          const outcome = await isFn();
          if (outcome && outcome.failure) t.fail(outcome.failure);
          else t.done((outcome && outcome.messageText) || 'Tamamlandı.');
        } catch (e) {
          t.fail((e && e.message) || 'Bilinmeyen hata.');
          pushFeed('error', 'Hızlı İşlem', (e && e.message) || 'Bilinmeyen hata.', 'Hata');
        } finally {
          occupied = false;
          b.style.opacity = '1'; b.style.cursor = 'pointer';
        }
      };
    }

    quickAction('qaGames', 'Oyun listesi yenileniyor…', async ()=>{
      await refreshGamesQuick();
      return { messageText: 'Oyun listesi yenilendi.' };
    });

    quickAction('qaInv', 'Envanter yenileniyor…', async ()=>{
      if (typeof loadInventory !== 'function') return { failure: 'Envanter sayfası hazır değil.' };
      inventoryLoaded = false;
      await loadInventory();
      // loadInventory silently returns on error; check whether data really arrived,
      // otherwise we said "yenilendi" and misled the user.
      if (!invMerged || !invMerged.length) return { failure: 'Envanter alınamadı. Envanter sekmesindeki hatayı kontrol et.' };
      renderOverviewStats();
      pushFeed('inventory', 'Envanter', 'Envanter Steam\'den yeniden çekildi.', 'Başarılı');
      return { messageText: tf('# çeşit öğe yüklendi.', invMerged.length) };
    });

    // "Pazarı Yenile" - refreshes the market PRICES, not the inventory (skips the cache).
    quickAction('qaMarket', 'Pazar fiyatları yenileniyor…', async ()=>{
      if (!invMerged || !invMerged.length) return { failure: 'Önce envanteri yükle.' };
      if (typeof fetchPricesForView !== 'function') return { failure: 'Envanter sayfası hazır değil.' };
      await window.imu.settings.clearPriceCache();
      if (typeof priceMap !== 'undefined') priceMap.clear();
      // An undefined requestPrices() used to be called here.
      await fetchPricesForView();
      renderOverviewStats();
      pushFeed('market', 'Pazar', 'Market fiyatları yeniden çekiliyor.', 'Çalışıyor');
      return { messageText: 'Fiyatlar çekiliyor, Envanter sekmesinden ilerlemeyi görebilirsin.' };
    });
    document.getElementById('qaSettings').onclick = ()=> openSettingsPage();

    // Genel Bakış is already the visible tab at startup - load the first data without a click.
    loadOverview();
    // The language change reloaded the page: take the user back to the Ayarlar section they left (i18n.js).
    try {
      const returnVal = sessionStorage.getItem(I18N_RETURN_KEY);
      if (returnVal) { sessionStorage.removeItem(I18N_RETURN_KEY); openSettingsPage(returnVal); }
    } catch (_) {}
