    // ================= KART DÜŞÜR (CARD FARMING) =================
    // The fields on the page are filled with real engine data (dropGames / farm:tick).
    let dropGames = [], cardsLoaded = false;
    let selectedMode = 'sequential';
    let durationSec = 15*60;
    let lastTick = { running: false, activeAppids: [] };

    // Queue controls (sortable column headers + the Hepsi/1-2/3+ filter +
    // inline up/down/En Öne Al/remove buttons)
    let queueSort = 'rank', queueSortDir = 'asc', qfilter = 'all';
    let priorityOrder = [];          // array of appids - the source of the "Öncelikli" mode and of manual ordering
    const removedIds = new Set();    // removed from the queue (not sent to farm)
    const recentDrops = [];          // {appid,name,count,ts} - from overview.js's real drop measurement

    const modeLabels = { sequential:'Sıralı', most:'Çok Kart', least:'Az Kart', priority:'Öncelik', fast:'Hızlı' };
    // Every tooltip is ONE string: the DOM translation looks up the text as a whole, piecewise
    // concatenation matched no key in the dictionary.
    const modeHints = {
      sequential: 'Oyunları kuyruk sırasıyla tek tek çalıştırır.',
      most: 'En çok kartı kalan oyunları öne alır.',
      least: 'En az kartı kalan oyunları öne alır; rozetler daha çabuk tamamlanır.',
      priority: 'Öncelik listendeki oyunları önce çalıştırır.',
      fast: 'Steam kart düşürmeye oyun 2 saati geçince başlar. Hızlı mod önce 2 saatin altındaki oyunları birlikte çalıştırıp bu eşiğe çeker, sonra hepsini birlikte açık tutar ve öne çıkan oyunu 1,5-2 dakikada bir değiştirir.'
    };
    // listRow(on) / segSet(cur,key) selected-style helpers
    const ROW_ON  = { bg:'#151C28', fg:'#DCE2FA', bd:'#5624B3' };
    const ROW_OFF = { bg:'transparent', fg:'#8B8F9E', bd:'transparent' };
    const SEG_ON  = { bg:'#5624B3', fg:'#DCE2FA', bd:'#5624B3' };
    const SEG_OFF = { bg:'transparent', fg:'#8B8F9E', bd:'transparent' };
    function paint(el, s){ el.style.background = s.bg; el.style.color = s.fg; el.style.borderColor = s.bd; }

    // Applies the Ayarlar > Kart Düşürme preferences to the page (default mode, duration, queue order).
    // It does not overwrite what the user changed by hand on the page; BUT a value changed with Kaydet in Ayarlar
    // (degisen) is always applied, because the user explicitly chose it a moment ago. The mode of a running
    // queue does not change (the order is set up in the engine); the main process applies a duration change to the running job
    // too (see main.js > applySettingsToJobs).
    let farmUserTouched = false;
    function applyFarmSettings(changed){
      if (typeof appSettings !== 'object' || !appSettings) return;
      const d = changed || [];
      const isRunning = !!(lastTick && lastTick.running);
      if ((!farmUserTouched || (d.includes('cardPriorityMode') && !isRunning))
          && appSettings.cardPriorityMode && appSettings.cardPriorityMode !== selectedMode) setMode(appSettings.cardPriorityMode);
      if (!farmUserTouched || d.includes('farmMaxMinutes')){
        const mins = +appSettings.farmMaxMinutes;
        if (mins > 0 && durationSec !== mins*60){ durationSec = mins*60; writeDur(); }
      }
      const qs = appSettings.queueSort;
      if (qs && qs !== 'default' && qs !== queueSort){ queueSort = qs; }
      if (typeof renderCards === 'function' && cardsLoaded) renderCards();
    }

    async function loadCards(){
      applyFarmToggles();
      applyFarmSettings();
      if (cardsLoaded) { renderCards(); return; }
      const q = document.getElementById('cardQueue');
      q.innerHTML = '<div style="padding:16px;color:#8B8F9E;font-size:12px">Steam\'e bağlanılıyor...</div>';
      const con = await E.connect();
      if (!con.ok){ q.innerHTML = '<div style="padding:16px;color:#B32453;font-size:12px">'+esc(t('Bağlantı hatası:') + ' ' + (con.error || ''))+'</div>'; return; }
      const res = await E.dropGames();
      if (!res.ok){ q.innerHTML = '<div style="padding:16px;color:#B32453;font-size:12px">'+esc(res.error)+'</div>'; return; }
      dropGames = res.games; cardsLoaded = true;
      priorityOrder = dropGames.map(g=>g.appid);
      await restoreCardState();
      renderCards();
    }

    // ---- persistence of queue preferences (main.js state.json, retention from Ayarlar) ----
    // The order the user made by hand and the games they removed from the queue should come back
    // even after the app closes. Appids that are no longer owned are filtered out on load.
    const CARD_STATE_KEY = 'cards.queue';
    let cardStateReady = false;
    async function restoreCardState(){
      const r = await window.imu.state.get(CARD_STATE_KEY).catch(()=>null);
      const v = r && r.value;
      if (v && typeof v === 'object'){
        const own = new Set(dropGames.map(g=>g.appid));
        (v.removed || []).forEach(id=>{ if (own.has(id)) removedIds.add(id); });
        if (Array.isArray(v.order) && v.order.length){
          const kept = v.order.filter(id=>own.has(id));
          const rest = priorityOrder.filter(id=>!kept.includes(id));
          priorityOrder = kept.concat(rest);
        }
      }
      cardStateReady = true;
    }
    function saveCardState(){
      if (!cardStateReady) return;
      window.imu.state.set(CARD_STATE_KEY, { removed:[...removedIds], order: priorityOrder }).catch(()=>{});
    }
    document.getElementById('btnRefresh').onclick = () => { cardsLoaded = false; loadCards(); };

    // Games that will enter the queue: excluding the removed ones, ordered by the selected mode.
    function orderedForMode(){
      const list = dropGames.filter(g=>!removedIds.has(g.appid));
      if (selectedMode === 'most') return list.slice().sort((a,b)=>b.remaining-a.remaining);
      if (selectedMode === 'least') return list.slice().sort((a,b)=>a.remaining-b.remaining);
      if (selectedMode === 'priority'){
        return list.slice().sort((a,b)=>{
          const ia = priorityOrder.indexOf(a.appid), ib = priorityOrder.indexOf(b.appid);
          return (ia<0?1e9:ia) - (ib<0?1e9:ib);
        });
      }
      return list;
    }

    // The list to show on screen: mode order + filter + column sort.
    function viewQueue(){
      const base = orderedForMode();
      const ranked = base.map((g,i)=>({ ...g, rank: i+1 }));
      const filtered = ranked.filter(g => qfilter==='all' ? true : qfilter==='low' ? g.remaining<=2 : g.remaining>=3);
      const activeIds = new Set(lastTick.activeAppids || []);
      const dir = queueSortDir==='asc' ? 1 : -1;
      return filtered.slice().sort((a,b)=>{
        const aa = activeIds.has(a.appid), ba = activeIds.has(b.appid);
        if (aa !== ba) return aa ? -1 : 1;              // the active one is always on top
        if (queueSort==='name')   return a.name.localeCompare(b.name) * dir;
        if (queueSort==='remain') return (a.remaining-b.remaining) * dir;
        return (a.rank-b.rank) * dir;
      });
    }

    function renderCards(){
      const q = document.getElementById('cardQueue');
      const live = orderedForMode();
      const total = live.reduce((s,g)=>s+g.remaining,0);
      document.getElementById('cardRemaining').textContent = total;
      document.getElementById('listLabel').textContent = tf('Düşürme Kuyruğu · # Oyun', live.length);
      document.getElementById('dropCount').textContent = recentDrops.length + ' öğe';

      // sort arrows
      const arrow = (key) => queueSort===key ? (queueSortDir==='asc'?'▲':'▼') : '';
      document.getElementById('arrowRank').textContent = arrow('rank');
      document.getElementById('arrowName').textContent = arrow('name');
      document.getElementById('arrowRemain').textContent = arrow('remain');

      const rows = viewQueue();
      if (!rows.length){
        q.innerHTML = '<div style="padding:16px;color:#8B8F9E;font-size:12px">'
          + (dropGames.length ? 'Bu filtreye uyan oyun yok.' : 'Düşürülecek kart kalmamış.') + '</div>';
        renderDrops();
        return;
      }
      const activeIds = new Set(lastTick.activeAppids || []);
      const currentId = lastTick.currentAppid;
      const turnPct = lastTick.durationMs ? Math.min(100, Math.round((lastTick.elapsedMs/lastTick.durationMs)*100)) : 0;

      q.innerHTML = rows.map(g=>{
        const on = activeIds.has(g.appid);
        const bd = on ? '#5624B3' : '#2B3345';
        const pct = (g.appid===currentId) ? turnPct : 0;
        // Every game that is open is "Çalışıyor": in fast mode all the games in the pool are open,
        // they all used to say "1. Sırada".
        const state = on ? 'Çalışıyor' : 'Bekliyor';
        return '<div class="h-bd" data-row="'+g.appid+'" style="border:1px solid '+bd+';border-radius:12px;background:'+(on?'#0D1118':'#090C12')+';padding:12px 14px;display:flex;align-items:center;gap:12px;margin-bottom:8px;opacity:'+(on?1:0.5)+'">'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+(on?'#B37E24':'#8B8F9E')+';border:1px solid '+bd+';border-radius:12px;padding:4px 0;width:34px;box-sizing:border-box;text-align:center;flex-shrink:0">#'+g.rank+'</span>'
          // The box ratio is 920x430 (~2.14:1) - the Steam Library Header standard.
          + '<div style="width:85px;height:40px;flex-shrink:0;border-radius:10px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
            + gameThumb(g.appid)
          + '</div>'
          + '<span style="font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:150px;flex-shrink:0">'+esc(g.name)+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E;flex-shrink:0;width:64px;border-left:1px solid #1D2432;padding-left:8px">'+esc(tf('# kalan', g.remaining))+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E;flex-shrink:0;width:84px;border-left:1px solid #1D2432;padding-left:8px">'+g.appid+'</span>'
          + '<div style="flex:1;min-width:60px;height:5px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
            + '<div data-ilerleme style="height:100%;width:'+pct+'%;border-radius:999px;background:#24AEB3"></div></div>'
          + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
            + '<span style="height:26px;display:flex;align-items:center;padding:0 10px;border-radius:12px;border:1px solid '+bd+';color:'+(on?'#C2AAEE':'#8B8F9E')+';font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">'+state+'</span>'
            + '<div style="display:flex;gap:4px;padding:3px;border-radius:12px;background:#090C12;border:1px solid #1D2432">'
              + '<button data-act="up" title="Yukarı" class="h-s3" style="width:26px;height:26px;border-radius:999px;background:transparent;border:none;color:#8B8F9E;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 14l6-6 6 6"></path></svg></button>'
              + '<button data-act="down" title="Aşağı" class="h-s3" style="width:26px;height:26px;border-radius:999px;background:transparent;border:none;color:#8B8F9E;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 10l6 6 6-6"></path></svg></button>'
            + '</div>'
            + '<button data-act="top" class="h-brand" style="height:28px;padding:0 12px;border-radius:999px;background:#090C12;border:1px solid #333D4D;color:#B9C0D6;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:6px;flex-shrink:0;white-space:nowrap">'
              + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M5 5h14M6 16l6-6 6 6"></path></svg>En Öne Al</button>'
            + '<button data-act="remove" title="Kuyruktan Çıkar" style="width:28px;height:28px;border-radius:999px;background:transparent;border:1px solid #B32453;color:#B32453;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>'
          + '</div></div>';
      }).join('');
      renderDrops();
    }

    // Inline order/remove operations - manual ordering is written to the "Öncelikli" mode (priority
    // = "Öncelik listendeki oyunları önce düşürür").
    document.getElementById('cardQueue').addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const row = e.target.closest('[data-row]'); if (!row) return;
      const id = +row.getAttribute('data-row');
      const act = btn.getAttribute('data-act');
      if (act === 'remove'){ removedIds.add(id); saveCardState(); renderCards(); return; }
      // the order change is made in the priority list and the mode automatically moves to "Öncelikli"
      if (!priorityOrder.length) priorityOrder = orderedForMode().map(g=>g.appid);
      const i = priorityOrder.indexOf(id);
      if (i < 0) return;
      priorityOrder.splice(i, 1);
      if (act === 'top') priorityOrder.unshift(id);
      else if (act === 'up') priorityOrder.splice(Math.max(0, i-1), 0, id);
      else if (act === 'down') priorityOrder.splice(Math.min(priorityOrder.length, i+1), 0, id);
      saveCardState();
      if (selectedMode !== 'priority') setMode('priority');
      else renderCards();
    });

    // column sort
    function toggleSort(key){
      if (queueSort === key) queueSortDir = (queueSortDir==='asc' ? 'desc' : 'asc');
      else { queueSort = key; queueSortDir = 'asc'; }
      renderCards();
    }
    document.getElementById('sortRank').onclick = ()=>toggleSort('rank');
    document.getElementById('sortName').onclick = ()=>toggleSort('name');
    document.getElementById('sortRemain').onclick = ()=>toggleSort('remain');

    // filter segment
    function paintFilter(){
      document.querySelectorAll('#qFilter button[data-qf]').forEach(b=>paint(b, b.getAttribute('data-qf')===qfilter ? SEG_ON : SEG_OFF));
    }
    document.querySelectorAll('#qFilter button[data-qf]').forEach(b=>b.addEventListener('click', ()=>{
      qfilter = b.getAttribute('data-qf'); paintFilter(); renderCards();
    }));
    paintFilter();

    // mode selection
    function setMode(mode){
      selectedMode = mode;
      document.querySelectorAll('#modeList button[data-mode]').forEach(b=>paint(b, b.getAttribute('data-mode')===mode ? ROW_ON : ROW_OFF));
      document.getElementById('durNote').textContent = modeHints[mode] || '';
      // Fast mode manages the duration itself (a fixed rotation in the engine), the timer fades
      document.getElementById('durationPanel').style.opacity = (mode==='fast') ? '.45' : '1';
      renderCards();
    }
    document.querySelectorAll('#modeList button[data-mode]').forEach(b=>b.addEventListener('click', ()=>{ farmUserTouched = true; setMode(b.getAttribute('data-mode')); }));
    setMode('sequential');

    // ---- Session timer: HRS : DK : SN ----
    const kH = document.getElementById('cardH'), kM = document.getElementById('cardM'), kS = document.getElementById('cardS');
    function writeDur(){
      const h=Math.floor(durationSec/3600), m=Math.floor((durationSec%3600)/60), s=durationSec%60;
      kH.value=String(h).padStart(2,'0'); kM.value=String(m).padStart(2,'0'); kS.value=String(s).padStart(2,'0');
      paintPresets();
    }
    function commitDur(){
      const h=parseInt(kH.value,10)||0, m=Math.min(59,parseInt(kM.value,10)||0), s=Math.min(59,parseInt(kS.value,10)||0);
      farmUserTouched = true;
      durationSec = Math.max(30, h*3600 + m*60 + s);   // under 30 s is meaningless to Steam
      writeDur();
    }
    [kH,kM,kS].forEach(el=>{
      el.addEventListener('blur', commitDur);
      el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ commitDur(); el.blur(); } });
      el.addEventListener('focus', ()=>el.select());
    });
    function paintPresets(){
      document.querySelectorAll('#cardPresets button[data-min]').forEach(b=>{
        paint(b, (+b.getAttribute('data-min'))*60 === durationSec ? SEG_ON : SEG_OFF);
      });
    }
    document.querySelectorAll('#cardPresets button[data-min]').forEach(b=>b.addEventListener('click', ()=>{
      farmUserTouched = true; durationSec = (+b.getAttribute('data-min'))*60; writeDur();
    }));
    writeDur();

    // ---- Automation switches (written persistently to the settings) ----
    async function applyFarmToggles(){
      const s = await window.imu.settings.get().catch(()=>null);
      if (!s) return;
      document.querySelectorAll('#tab-card .e-toggle[data-set]').forEach(el=>{
        el.classList.toggle('on', !!s[el.getAttribute('data-set')]);
      });
    }
    document.querySelectorAll('#tab-card .e-toggle[data-set]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const key = el.getAttribute('data-set');
        const val = !el.classList.contains('on');
        el.classList.toggle('on', val);
        const next = await window.imu.settings.set({ [key]: val }).catch(()=>null);
        if (next && typeof appSettings !== 'undefined') appSettings = next;
      });
    });

    // ---- Son Düşüşler (real measurement - overview.js's card counter feeds it) ----
    function pushDrop(appid, name, count){
      recentDrops.unshift({ appid, name, count, ts: Date.now() });
      if (recentDrops.length > 12) recentDrops.length = 12;
      renderCards();
    }
    function renderDrops(){
      const box = document.getElementById('dropList');
      if (!box) return;
      if (!recentDrops.length){
        box.innerHTML = '<div style="padding:14px 16px;font-size:11px;color:#656D80">Bu oturumda henüz kart düşmedi.</div>';
        return;
      }
      box.innerHTML = recentDrops.map(d=>
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #101621">'
        + '<div style="display:flex;align-items:center;gap:11px;min-width:0">'
          + '<div style="width:32px;height:32px;flex-shrink:0;border-radius:10px;border:1px solid #5FB324;background:#101621;display:flex;align-items:center;justify-content:center">'
            + '<span style="width:8px;height:8px;border-radius:999px;background:#5FB324"></span></div>'
          + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0">'
            + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(tf('# kart düştü', d.count))+'</span>'
            + '<span style="font-size:10.5px;color:#656D80;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(d.name)+' · <span style="font-family:Geist Mono,monospace;color:#8B8F9E">'+new Date(d.ts).toLocaleTimeString(localCode())+'</span></span>'
          + '</div></div>'
        + '<button class="h-brand" data-godrop="'+d.appid+'" style="height:28px;padding:0 12px;border-radius:999px;background:#090C12;border:1px solid #333D4D;color:#B9C0D6;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0">Envanter</button>'
        + '</div>').join('');
      box.querySelectorAll('[data-godrop]').forEach(b=>b.addEventListener('click', ()=>{
        document.querySelector('.nav a[data-tab=env]').click();
      }));
    }

    // ---- Start / Stop ----
    function setCardPill(run){
      const d = document.getElementById('cardPillDot');
      if (d) d.style.background = run ? '#5FB324' : '#B37E24';
    }
    document.getElementById('btnStart').onclick = () => {
      // playtimeMin is needed for fast mode's "2 hour" rule (the engine reads it)
      const games = orderedForMode().map(g=>({appid:g.appid,name:g.name,remaining:g.remaining,playtimeMin:g.playtimeMin||0}));
      if (!games.length) return;
      E.startFarm(selectedMode, games, durationSec*1000);
      setCardPill(true);
      let sub = tf('# oyun sırada.', games.length);
      if (selectedMode === 'fast'){
        const cold = games.filter(g=>(g.playtimeMin||0) < 120);
        sub = cold.length
          ? tf('# oyun 2 saatin altında; önce bu eşiğe çekilecek, sonra kart düşmeye başlayacak.', cold.length)
          : tf('# oyunun hepsi 2 saati geçmiş; kart düşmeye hemen başlıyor.', games.length);
      }
      notify('farm', 'Kart Düşürme Başladı', sub);
      pushFeed('card', 'Kart Düşürme', sub, 'Çalışıyor');
    };
    document.getElementById('btnStop').onclick = () => {
      E.stopFarm();
      setCardPill(false);
      notify('farm', 'Kart Düşürme Durdu', '');
      pushFeed('card', 'Kart Düşürme', 'Durduruldu.', 'Durdu');
    };

    // SPEED: the tick comes once a second. Every tick used to redraw the WHOLE queue,
    // even while the tab was hidden: with a 400 game queue that was ~50 ms of processor per second and it refilled
    // the list the hidden tab had dropped from memory every second. Now drawing happens only when the running game
    // changes; on the ticks in between only the progress bar is updated.
    let lastCardSignature = '';
    E.onTick((data) => {
      // Card farming has just started: the inventory baseline for auto-sell is taken (inventory.js).
      if (data.running && !lastTick.running && typeof autoSellFloor === 'function') autoSellFloor();
      lastTick = data;
      setCardPill(!!data.running);
      if (!cardsLoaded || !designed.card || designed.card.classList.contains('hidden')) { lastCardSignature = ''; return; }
      const signature = (data.running ? 1 : 0) + '|' + (data.activeAppids || []).join(',') + '|' + data.currentAppid;
      if (signature !== lastCardSignature){ lastCardSignature = signature; renderCards(); return; }
      const barEl = document.querySelector('#cardQueue [data-row="' + data.currentAppid + '"] [data-ilerleme]');
      if (barEl && data.durationMs) barEl.style.width = Math.min(100, Math.round((data.elapsedMs / data.durationMs) * 100)) + '%';
    });
