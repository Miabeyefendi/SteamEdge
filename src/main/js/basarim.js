    // ================= ACHIEVEMENTS (BAŞARIMLAR) =================
    // The schema + unlock state come from the Steam protocol, the rarity percentage from the global
    // achievement percentages, the unlock date from GetPlayerAchievements.
    let acLoaded = false, acGames = [], acData = null, acAppid = null;
    const acBusy = new Set();
    const acCache = new Map();
    let acView = 'grid', acFilterV = 'all', acSort = 'default', acSelApp = null;
    // Sort direction. There is no notion of direction in the 'default' order (unlocked on top, then locked),
    // so the button stays disabled there.
    let acSortDir = 'asc';
    const acSelected = new Set();     // apiName - bulk unlock/lock selection

    const AC = { ok:'#5FB324', warn:'#B37E24', teal:'#24AEB3', sub:'#C2AAEE', brand:'#5624B3',
                 bad:'#B32453', title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345' };

    async function loadAchievementsPage(){
      acApplySettings();
      if (acLoaded){ renderAchievements(); return; }
      const input = document.getElementById('acGameInput');
      // The error was only written in the search box's placeholder; the page looked empty and
      // the user could not tell why it did not load. Now the reason + a
      // "Tekrar Dene" button appears in the middle of the page.
      const fail = (msg)=>{
        input.value=''; input.placeholder = t('Yüklenemedi');
        const body = document.getElementById('acBody');
        if (!body) return;
        body.innerHTML = '<div style="border:1px solid #B32453;border-radius:12px;background:#0D1118;padding:56px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#DCE2FA">Başarımlar yüklenemedi</span>'
          + '<span style="font-size:12px;color:#B32453;max-width:380px">'+esc(msg||'Bilinmeyen hata')+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E;max-width:420px">Steam oturumu başka bir yerde açıldıysa (Steam istemcisi ya da uygulamanın ikinci bir penceresi) bu hesabın oturumu devralınmış olabilir. Diğer oturumu kapatıp tekrar dene.</span>'
          + '<button id="acRetry" class="h-brand" style="margin-top:6px;height:34px;padding:0 18px;border-radius:999px;background:#5624B3;border:1px solid #5624B3;color:#DCE2FA;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer">Tekrar Dene</button>'
          + '</div>';
        const rb = document.getElementById('acRetry');
        if (rb) rb.onclick = ()=>{ acLoaded = false; loadAchievementsPage(); };
      };
      input.placeholder = t('Steam\'e bağlanılıyor...');
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ fail(con.error); return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'Kütüphane okunamadı.' }));
      if (!res.ok){ fail(res.error); return; }
      acGames = (res.games || []).filter(g=>g.hasStats);
      acLoaded = true;
      input.placeholder = tf('# oyun · ara ya da seç...', acGames.length);
      renderAchievements();
    }

    function acApplySettings(){
      if (typeof appSettings !== 'object' || !appSettings) return;
      if (appSettings.achOrder) acSort = appSettings.achOrder;
      const s = document.getElementById('acSort'); if (s) s.value = acSort;
      if (typeof acDirPaint === 'function') acDirPaint();
      const sm = document.getElementById('acSafeMode');
      if (sm){
        const on = appSettings.achSafeMode !== false;
        sm.textContent = on ? 'Açık' : 'Kapalı';
        sm.style.color = on ? AC.ok : AC.warn;
      }
    }

    // Rarity: the real Steam global percentage (not made up)
    // Rarity = the percentage of players who unlocked the achievement (Steam's global statistic; not made up).
    // If the percentage is LOW it is rare: if 3% unlocked it it is rare, if 80% it is common.
    // The thresholds are 5 steps by community scale - in the old 3 step scale (<10% = rare) half the list
    // looked "rare" in games with many achievements (e.g. median 10% in TF2).
    const RARITY = [
      { max: 1,        key:'ultrarare', label:'Efsanevi',   color:'#B32453' },
      { max: 5,        key:'ultrarare', label:'Ultra Nadir', color:'#B32453' },
      { max: 10,       key:'rare',      label:'Nadir',       color:'#C2AAEE' },
      { max: 25,       key:'uncommon',  label:'Sıra Dışı',   color:'#24AEB3' },
      { max: Infinity, key:'common',    label:'Yaygın',      color:'#8B8F9E' },
    ];
    function rarityOf(pct){
      if (!Number.isFinite(pct)) return null;
      return RARITY.find(r => pct < r.max) || RARITY[RARITY.length-1];
    }
    function rarityTier(pct){ const r = rarityOf(pct); return r ? r.key : null; }
    function rarityLabel(a){ const r = rarityOf(a.rarityPct); return r ? r.label : 'Bilinmiyor'; }
    function rarityColor(a){ const r = rarityOf(a.rarityPct); return r ? r.color : AC.off; }
    const acDate = (a) => a.achieved ? (a.unlockTime ? new Date(a.unlockTime).toLocaleDateString(localCode()) : t('bilinmiyor')) : '-';

    // ---- searchable game picker ----
    // acGameSelect was left hidden (for backward compatibility); the visible box is acGameInput.
    const acGameInput = document.getElementById('acGameInput');
    const acGameListEl = document.getElementById('acGameList');
    let acGamePickedName = '';
    function renderGameList(){
      const q = acGameInput.value.trim().toLowerCase();
      // If the user started typing without deleting the selected game's name filter; otherwise all of them
      const match = (!q || q === acGamePickedName.toLowerCase())
        ? acGames
        : acGames.filter(g => g.name.toLowerCase().includes(q));
      if (!acGames.length){
        acGameListEl.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#656D80">Kütüphane yükleniyor…</div>';
        return;
      }
      if (!match.length){
        acGameListEl.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#656D80">Eşleşen oyun yok</div>';
        return;
      }
      acGameListEl.innerHTML = match.slice(0, 200).map(g=>{
        const on = g.appid === acAppid;
        return '<div class="h-s3" data-gid="'+g.appid+'" style="display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:12px;cursor:pointer;'
          + 'background:'+(on?'#151C28':'transparent')+'">'
          // Library Header ratio (920x430, ~2.14:1)
          + '<div style="width:54px;height:25px;flex-shrink:0;border-radius:6px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<span style="flex:1;min-width:0;font-size:12px;font-weight:600;color:'+(on?'#DCE2FA':'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + (on?'<span style="font-family:Geist Mono,monospace;font-size:11px;color:#5FB324;flex-shrink:0">✓</span>':'')
          + '</div>';
      }).join('') + (match.length > 200
        ? '<div style="padding:8px 10px;font-size:11px;color:#656D80">'+esc(tf('# oyun daha var; aramayı daralt.', match.length-200))+'</div>' : '');
    }
    function openGameList(){ acGameListEl.style.display = 'block'; renderGameList(); }
    function closeGameList(){
      acGameListEl.style.display = 'none';
      if (acGamePickedName) acGameInput.value = acGamePickedName;   // undo the half typed search
    }
    acGameInput.addEventListener('focus', ()=>{ acGameInput.select(); openGameList(); });
    acGameInput.addEventListener('input', ()=>{ acGameListEl.style.display='block'; renderGameList(); });
    acGameInput.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){ closeGameList(); acGameInput.blur(); }
      else if (e.key === 'Enter'){
        const first = acGameListEl.querySelector('[data-gid]');
        if (first) first.click();
      }
    });
    acGameListEl.addEventListener('click', (e)=>{
      const row = e.target.closest('[data-gid]'); if (!row) return;
      const id = +row.getAttribute('data-gid');
      const g = acGames.find(x=>x.appid===id);
      acGamePickedName = g ? g.name : '';
      acGameInput.value = acGamePickedName;
      acGameListEl.style.display = 'none';
      loadAchievements(id);
    });
    document.addEventListener('click', (e)=>{
      if (!e.target.closest('#acGameBox')) closeGameList();
    });
    document.getElementById('acSearch').addEventListener('input', renderAchievements);
    document.getElementById('acFilter').addEventListener('change', e=>{ acFilterV=e.target.value; renderAchievements(); });
    document.getElementById('acSort').addEventListener('change', e=>{ acSort=e.target.value; acDirPaint(); renderAchievements(); });
    // Direction button: arrow up = ascending, down = descending. In the default order it is dimmed and inactive.
    function acDirPaint(){
      const b = document.getElementById('acSortDir');
      if (!b) return;
      const closed = acSort === 'default';
      b.disabled = closed;
      b.style.opacity = closed ? '.4' : '1';
      b.style.cursor = closed ? 'default' : 'pointer';
      b.style.color = closed ? '#656D80' : '#C2AAEE';
      b.style.borderColor = closed ? '#2B3345' : '#5624B3';
      const pathStr = b.querySelector('path');
      if (pathStr) pathStr.setAttribute('d', acSortDir === 'asc' ? 'M12 5v14M6 11l6-6 6 6' : 'M12 19V5M6 13l6 6 6-6');
      b.setAttribute('data-tip', acSortDir === 'asc' ? 'Artan sıra' : 'Azalan sıra');
    }
    document.getElementById('acSortDir').onclick = ()=>{
      if (acSort === 'default') return;
      acSortDir = acSortDir === 'asc' ? 'desc' : 'asc';
      acDirPaint(); renderAchievements();
    };
    acDirPaint();
    document.getElementById('acReset').onclick = ()=>{
      acFilterV='all'; acSort='default'; acSortDir='asc'; acSelected.clear();
      document.getElementById('acFilter').value='all';
      document.getElementById('acSort').value='default';
      document.getElementById('acSearch').value='';
      acDirPaint();
      renderAchievements();
    };
    function paintAcView(){
      const g = document.getElementById('acVGrid'), l = document.getElementById('acVList');
      const on = { background:AC.brand, borderColor:AC.brand, color:AC.title };
      const off = { background:'transparent', borderColor:'transparent', color:AC.muted };
      Object.assign(g.style, acView==='grid'?on:off);
      Object.assign(l.style, acView==='list'?on:off);
    }
    document.getElementById('acVGrid').onclick = ()=>{ acView='grid'; paintAcView(); renderAchievements(); };
    document.getElementById('acVList').onclick = ()=>{ acView='list'; paintAcView(); renderAchievements(); };
    paintAcView();

    async function loadAchievements(appid){
      acAppid = appid; acBusy.clear(); acSelApp = null; acSelected.clear();
      if (acCache.has(appid)){ acData = acCache.get(appid); renderAchievements(); return; }
      acData = null;
      document.getElementById('acBody').innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">Başarımlar Steam\'den çekiliyor...</div>';
      const res = await E.achievements(appid).catch(e=>({ ok:false, error:(e&&e.message)||'Başarımlar okunamadı.' }));
      if (acAppid !== appid) return;
      if (!res.ok){
        // On transient Steam errors the user must be able to try again; before, only the raw error
        // text was printed and there was no way out except leaving the page and coming back.
        const g = document.getElementById('acBody');
        g.innerHTML = '<div style="border:1px solid #2B3345;border-radius:12px;background:#0D1118;padding:44px 22px;'
          + 'display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">'
          + '<span style="font-size:13px;font-weight:700;color:#B32453">Başarımlar yüklenemedi</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:420px;line-height:1.6">'+esc(res.error)+'</span>'
          + '<button id="acRetry" class="h-bd" style="height:32px;padding:0 16px;border-radius:12px;'
          + 'background:#151C28;border:1px solid #24AEB3;color:#24AEB3;font-size:12px;font-weight:600;cursor:pointer">'
          + 'Yeniden Dene</button></div>';
        const rb = document.getElementById('acRetry');
        if (rb) rb.onclick = ()=>{ acCache.delete(appid); loadAchievements(appid); };
        return;
      }
      if (!res.data){
        document.getElementById('acBody').innerHTML = '<div style="border:1px solid #2B3345;border-radius:12px;background:#0D1118;padding:64px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Bu oyunun başarımı yok</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Bu oyun bu yöntemle başarım tutmuyor.</span></div>';
        return;
      }
      acData = res.data;
      const g = acGames.find(x=>x.appid===appid);
      acData.gameName = (g && g.name) || acData.gameName || ('App '+appid);
      acCache.set(appid, acData);
      renderAchievements();
    }

    function acFilteredList(){
      if (!acData) return [];
      const q = document.getElementById('acSearch').value.trim().toLowerCase();
      let list = acData.achievements;
      if (acFilterV === 'unlocked') list = list.filter(a=>a.achieved);
      else if (acFilterV === 'locked') list = list.filter(a=>!a.achieved);
      else if (acFilterV === 'rare') list = list.filter(a=>{ const t=rarityTier(a.rarityPct); return t==='rare'||t==='ultrarare'; });
      else if (acFilterV === 'ultrarare') list = list.filter(a=>rarityTier(a.rarityPct)==='ultrarare');
      if (q) list = list.filter(a=>a.name.toLowerCase().includes(q) || (a.desc||'').toLowerCase().includes(q));
      list = list.slice();
      // An ASCENDING comparator is written for each criterion, descending is its reverse. So the direction
      // is applied in one place and there is no need to write separate code for every sort option.
      const compare = acSort === 'alpha' ? (a,b)=>a.name.localeCompare(b.name)
        : acSort === 'rarity' ? (a,b)=>(a.rarityPct??101)-(b.rarityPct??101)
        : acSort === 'date' ? (a,b)=>(a.unlockTime||0)-(b.unlockTime||0)
        : null;
      if (compare) {
        // For date and rarity the first view the user expects is REVERSED: the most recently
        // unlocked first, the rarest first. In alphabetical A-Z. That is why the direction multiplier depends on the criterion.
        const startsReversed = (acSort === 'date');
        const direction = ((acSortDir === 'asc') !== startsReversed) ? 1 : -1;
        list.sort((a,b)=>compare(a,b) * direction);
      } else list.sort((a,b)=>(b.achieved-a.achieved));
      return list;
    }

    // Shared pieces (the grid and the list use the same data)
    function acBadge(text, fg, bd, extra){
      return '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+fg+';border:1px solid '+bd+';border-radius:12px;padding:2px 8px;flex-shrink:0'+(extra||'')+'">'+esc(text)+'</span>';
    }
    function acCheckbox(a){
      const on = acSelected.has(a.apiName);
      return '<div data-a="sel" style="width:18px;height:18px;flex-shrink:0;border-radius:6px;border:1px solid '+(on?AC.brand:AC.bd)+';background:'+(on?AC.brand:'transparent')+';display:flex;align-items:center;justify-content:center;cursor:pointer">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DCE2FA" stroke-width="3" style="opacity:'+(on?1:0)+'"><path d="M4 12l5 5L20 6"></path></svg></div>';
    }
    function acDivider(inGrid){
      return '<div style="'+(inGrid?'grid-column:1/-1;':'')+'display:flex;align-items:center;gap:10px;padding:'+(inGrid?'6px 2px;margin-top:2px':'8px 2px 4px')+'">'
        + '<span style="flex:1;height:1px;background:#1D2432"></span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#656D80">Kilitli</span>'
        + '<span style="flex:1;height:1px;background:#1D2432"></span></div>';
    }

    // G4: protected achievement badge - only the game's own server can write it, it cannot be
    // unlocked through the app. It is marked so the user sees the reason for the EResult 8 error.
    function acProtectedBadge(a){
      if (!a || !a.protectedFlag) return '';
      return '<span title="'+esc(t('Bu başarımı yalnızca oyunun kendi sunucusu açabilir'))+'" style="font-size:9px;'
        + 'font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#B37E24;'
        + 'border:1px solid #B37E24;border-radius:12px;padding:2px 6px;flex-shrink:0">'+esc(t('Korumalı'))+'</span>';
    }

    function acCardHTML(a){
      const busy = acBusy.has(a.apiName);
      const protectedBadge = acProtectedBadge(a);
      const dim = a.achieved ? 1 : 0.55;
      const pct = Number.isFinite(a.rarityPct) ? a.rarityPct.toFixed(1) : '?';
      const pctText = Number.isFinite(a.rarityPct) ? fmtPercent(localDecimal(a.rarityPct, 1)) : '?';
      const rare = rarityTier(a.rarityPct);
      const rareOn = (rare==='rare'||rare==='ultrarare') ? 1 : 0;
      return '<div data-ap="'+esc(a.apiName)+'" class="h-bd" style="border:1px solid '+(a.apiName===acSelApp?AC.brand:AC.bd)+';border-radius:12px;background:'+(a.achieved?'#0D1118':'#090C12')+';padding:16px;display:flex;gap:14px;align-items:flex-start;cursor:pointer">'
        + '<div style="margin-top:13px">'+acCheckbox(a)+'</div>'
        + '<div style="width:44px;height:44px;flex-shrink:0;border-radius:12px;border:1px solid '+(a.achieved?AC.ok:AC.bd)+';background:#101621;display:flex;align-items:center;justify-content:center;opacity:'+dim+';overflow:hidden">'
          + (a.icon?'<img src="'+esc(a.icon)+'" style="width:100%;height:100%;object-fit:cover"'+(a.achieved?'':' style="filter:grayscale(1)"')+'>'
                  :'<span style="width:12px;height:12px;background:'+(a.achieved?AC.ok:AC.off)+';transform:rotate(45deg)"></span>')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;opacity:'+dim+'">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '<span style="font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name)+'</span>'
            + protectedBadge
            + acBadge(busy?'İşleniyor':(a.achieved?'Açık':'Kilitli'), a.achieved?AC.ok:AC.warn, a.achieved?AC.ok:AC.warn)
          + '</div>'
          + '<p style="margin:0;font-size:11px;line-height:1.5;color:#8B8F9E">'+esc(a.desc||'Açıklama yok.')+'</p>'
          + '<div style="display:flex;align-items:center;gap:8px;margin-top:2px">'
            + acBadge(rarityLabel(a), rarityColor(a), rarityColor(a), ';opacity:'+rareOn)
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#24AEB3">'+pctText+'</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:'+(a.achieved?AC.muted:AC.off)+';margin-left:auto">'+acDate(a)+'</span>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px">'
            + '<div style="flex:1;height:4px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
              + '<div style="height:100%;width:'+pct+'%;border-radius:999px;background:#24AEB3"></div></div>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE;flex-shrink:0">'+pctText+'</span>'
          + '</div>'
        + '</div></div>';
    }

    function acRowHTML(a){
      const busy = acBusy.has(a.apiName);
      const protectedBadge = acProtectedBadge(a);
      const dim = a.achieved ? 1 : 0.55;
      const pct = Number.isFinite(a.rarityPct) ? a.rarityPct.toFixed(1) : '?';
      const pctText = Number.isFinite(a.rarityPct) ? fmtPercent(localDecimal(a.rarityPct, 1)) : '?';
      const rare = rarityTier(a.rarityPct);
      const rareOn = (rare==='rare'||rare==='ultrarare') ? 1 : 0;
      return '<div data-ap="'+esc(a.apiName)+'" class="h-bd" style="border:1px solid '+(a.apiName===acSelApp?AC.brand:AC.bd)+';border-radius:12px;background:'+(a.achieved?'#0D1118':'#090C12')+';padding:10px 16px;display:flex;align-items:center;gap:14px;cursor:pointer">'
        + acCheckbox(a)
        + '<div style="width:34px;height:34px;flex-shrink:0;border-radius:12px;border:1px solid '+(a.achieved?AC.ok:AC.bd)+';background:#101621;display:flex;align-items:center;justify-content:center;opacity:'+dim+';overflow:hidden">'
          + (a.icon?'<img src="'+esc(a.icon)+'" style="width:100%;height:100%;object-fit:cover">'
                  :'<span style="width:9px;height:9px;background:'+(a.achieved?AC.ok:AC.off)+';transform:rotate(45deg)"></span>')
        + '</div>'
        + '<span style="width:180px;flex-shrink:0;font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:'+dim+'">'+esc(a.name)+'</span>'
        + protectedBadge
        + '<p style="margin:0;flex:1;min-width:0;font-size:11px;line-height:1.4;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:'+dim+'">'+esc(a.desc||'')+'</p>'
        + acBadge(rarityLabel(a), rarityColor(a), rarityColor(a), ';opacity:'+rareOn)
        + '<span style="width:62px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:#24AEB3;text-align:right">'+pctText+'</span>'
        + '<span style="width:88px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:11px;color:'+(a.achieved?AC.muted:AC.off)+';text-align:right">'+acDate(a)+'</span>'
        + '<div style="width:110px;flex-shrink:0;display:flex;align-items:center;gap:6px">'
          + '<div style="flex:1;height:4px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
            + '<div style="height:100%;width:'+pct+'%;border-radius:999px;background:#24AEB3"></div></div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE;flex-shrink:0">'+pctText+'</span></div>'
        + acBadge(busy?'İşleniyor':(a.achieved?'Açık':'Kilitli'), a.achieved?AC.ok:AC.warn, a.achieved?AC.ok:AC.warn)
        + '</div>';
    }

    function renderAchievements(){
      const body = document.getElementById('acBody');
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      if (!acData){
        set('acStatTotal','-'); set('acUnlockedNum','-'); set('acLockedNum','-'); set('acRareNum','-');
        set('acCount','Oyun seçilmedi');
        body.innerHTML = '<div style="border:1px solid #2B3345;border-radius:12px;background:#0D1118;padding:64px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Oyun seçilmedi</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Yukarıdaki listeden başarımlarını yönetmek istediğin oyunu seç.</span></div>';
        renderAcDetail(); renderAcPick();
        return;
      }
      const total = acData.total, unlocked = acData.unlocked, locked = total - unlocked;
      const rare = acData.achievements.filter(a=>{ const t=rarityTier(a.rarityPct); return t==='rare'||t==='ultrarare'; }).length;
      const pct = total ? Math.round(unlocked/total*100) : 0;
      set('acStatTotal', total); set('acUnlockedNum', unlocked); set('acLockedNum', locked); set('acRareNum', rare);
      set('acGameName', acData.gameName);
      set('acSummaryText', tf('# / # açıldı', unlocked, total));
      set('acPctBig', fmtPercent(pct));
      document.getElementById('acBar').style.width = pct+'%';
      const logo = document.getElementById('acLogo');
      // library header → otherwise the capsule (see common.js gameImg)
      logo.src = gameImg(acAppid);
      logo.onerror = ()=>{
        if (!logo.dataset.fb){ logo.dataset.fb = '1'; logo.src = gameImg(acAppid, 'capsule'); }
        else logo.style.opacity = 0;
      };

      const list = acFilteredList();
      set('acCount', tf('# / # başarım', list.length, total));
      if (!list.length){
        body.innerHTML = '<div style="border:1px solid #2B3345;border-radius:12px;background:#0D1118;padding:64px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Bu filtreyle başarım yok</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Farklı bir oyun seç ya da filtreyi "Tüm başarımlar" yap.</span></div>';
        renderAcDetail(); renderAcPick();
        return;
      }
      // Unlocked first, then the "Kilitli" divider (divider row)
      const inGrid = acView === 'grid';
      const tpl = inGrid ? acCardHTML : acRowHTML;
      let html = '', dividerDone = false;
      list.forEach(a=>{
        if (!a.achieved && !dividerDone && acSort === 'default' && list.some(x=>x.achieved)){ html += acDivider(inGrid); dividerDone = true; }
        html += tpl(a);
      });
      body.setAttribute('style', inGrid
        ? 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px'
        : 'display:flex;flex-direction:column;gap:6px');
      body.innerHTML = html;
      renderAcDetail(); renderAcPick();
    }

    // ---- right detail panel ----
    function renderAcDetail(){
      const box = document.getElementById('acDetail');
      if (!box) return;
      const a = acData && acSelApp ? acData.achievements.find(x=>x.apiName===acSelApp) : null;
      const head = '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E">Detay</span>';
      if (!a){
        box.innerHTML = head
          + '<div style="width:56px;height:56px;border-radius:12px;border:1px solid #2B3345;background:#101621;display:flex;align-items:center;justify-content:center">'
            + '<span style="width:15px;height:15px;background:#5624B3;transform:rotate(45deg)"></span></div>'
          + '<span style="font-size:12px;line-height:1.6;color:#8B8F9E">Detay için bir başarıma tıkla.</span>';
        return;
      }
      const pct = Number.isFinite(a.rarityPct) ? a.rarityPct.toFixed(1) : '?';
      const pctText = Number.isFinite(a.rarityPct) ? fmtPercent(localDecimal(a.rarityPct, 1)) : '?';
      const row = (k,v,c) => '<div style="display:flex;align-items:center;justify-content:space-between">'
        + '<span style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#8B8F9E">'+k+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+(c||AC.title)+'">'+v+'</span></div>';
      // The latest unlocked in this game - by the real unlock time
      const recent = acData.achievements.filter(x=>x.achieved && x.unlockTime)
        .sort((x,y)=>y.unlockTime-x.unlockTime).slice(0,4);
      box.innerHTML = head
        + '<div style="width:56px;height:56px;border-radius:12px;border:1px solid '+(a.achieved?AC.ok:AC.bd)+';background:#101621;display:flex;align-items:center;justify-content:center;overflow:hidden">'
          + (a.icon?'<img src="'+esc(a.icon)+'" style="width:100%;height:100%;object-fit:cover">'
                  :'<span style="width:15px;height:15px;background:'+(a.achieved?AC.ok:AC.brand)+';transform:rotate(45deg)"></span>')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'
          + '<span style="font-size:15px;font-weight:700;color:#DCE2FA">'+esc(a.name)+'</span>'
          + '<span style="font-size:12px;line-height:1.6;color:#8B8F9E">'+esc(a.desc||'Açıklama yok.')+'</span></div>'
        + '<div style="border:1px solid #2B3345;border-radius:12px;background:#090C12;padding:14px;display:flex;flex-direction:column;gap:10px">'
          + row('Durum', a.achieved?'Açık':'Kilitli', a.achieved?AC.ok:AC.warn)
          + row('Nadirlik', rarityLabel(a), rarityColor(a))
          + row('İlerleme', a.achieved?'Tamam':'-', AC.teal)
          + row('Açılma tarihi', acDate(a), a.achieved?AC.title:AC.off)
          + row('Oyuncularda oranı', pctText, AC.sub)
          + '<div style="height:5px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
            + '<div style="height:100%;width:'+pct+'%;border-radius:999px;background:#24AEB3"></div></div>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:2px;padding-top:2px">'
          + '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E;padding-bottom:6px">Bu Oyunda Son Açılanlar</span>'
          + (recent.length ? recent.map(r=>
              '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #101621">'
              + '<span style="width:7px;height:7px;border-radius:12px;background:'+rarityColor(r)+';flex-shrink:0"></span>'
              + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1">'
                + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(r.name)+'</span>'
                + '<span style="font-size:10px;color:#656D80">'+esc(t(rarityLabel(r)))+' · '+(Number.isFinite(r.rarityPct)?fmtPercent(localDecimal(r.rarityPct, 1)):'?')+'</span></div>'
              + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E;flex-shrink:0">'+acDate(r)+'</span></div>').join('')
            : '<span style="font-size:11px;color:#656D80;padding:8px 0">Açılma tarihi bilinen başarım yok.</span>')
        + '</div>';
    }

    // ---- bottom bar (selection / estimated time) ----
    function renderAcPick(){
      const n = acSelected.size;
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('acPickLabel', tf('# başarım', n));
      // Unlocks are ALWAYS done one by one at the interval in the settings; safe mode only
      // decides whether the interval deviates randomly. The estimate is the same in both cases.
      const secs = Math.round(n * acBaseDelaySec());
      const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
      set('acPickEta', (h ? (String(h).padStart(2,'0')+':') : '')
                       + String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'));
    }

    // Unlock interval. The value in the settings is in seconds (fastest 1 s, above that minute
    // based). So that it does not look rhythmic a random deviation is applied on every unlock: normally
    // ±40%, much wider (40%-160%) when "Açılışları zamana yay" is on.
    function acBaseDelaySec(){
      const v = +((appSettings||{}).achDelay);
      return Number.isFinite(v) && v > 0 ? v : 1;
    }
    function fmtDelay(pick){
      if (pick < 60) return durationUnit(pick, 'saniye');
      const m = Math.round(pick/60);
      return m < 60 ? durationUnit(m, 'dakika') : durationUnit(localDecimal(m/60, m%60?1:0), 'saat');
    }
    function acNextDelayMs(){
      const base = acBaseDelaySec() * 1000;
      // When safe mode is OFF the interval is applied exactly - no deviation. When on it deviates:
      // normally +-40%, 40%-160% when "Açılışları zamana yay" is on. The three settings are independent:
      // the interval is always valid, safe mode turns the deviation on, spreading widens the deviation.
      const safe = !appSettings || appSettings.achSafeMode !== false;
      if (!safe) return Math.max(250, base);
      const spread = appSettings && appSettings.achSpread;
      const f = spread ? (0.4 + Math.random()*1.2) : (0.6 + Math.random()*0.8);
      return Math.max(250, Math.round(base * f));
    }

    // ---- click: selection box vs detail ----
    document.getElementById('acBody').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-ap]'); if (!row || !acData) return;
      const ap = row.getAttribute('data-ap');
      if (e.target.closest('[data-a="sel"]')){
        acSelected.has(ap) ? acSelected.delete(ap) : acSelected.add(ap);
        renderAchievements();
        return;
      }
      acSelApp = ap;
      renderAchievements();
    });
    document.getElementById('acBody').addEventListener('dblclick', (e)=>{
      const row = e.target.closest('[data-ap]'); if (!row || !acData) return;
      const a = acData.achievements.find(x=>x.apiName===row.getAttribute('data-ap')); if (!a) return;
      acToggle(a.apiName, !a.achieved);
    });

    document.getElementById('acSelLocked').onclick = ()=>{
      acFilteredList().filter(a=>!a.achieved).forEach(a=>acSelected.add(a.apiName));
      renderAchievements();
    };
    document.getElementById('acSelClear').onclick = ()=>{ acSelected.clear(); renderAchievements(); };
    document.getElementById('acAllUnlock').onclick = ()=> acBulk(true);
    document.getElementById('acAllLock').onclick = ()=> acBulk(false);

    async function acToggle(apiName, unlock, skipConfirm){
      const ach = acData && acData.achievements.find(a=>a.apiName===apiName);
      if (!ach || acBusy.has(apiName)) return false;
      if (ach.achieved === unlock) return false;
      const needConfirm = !appSettings || appSettings.achConfirmSingle !== false;
      if (!skipConfirm && needConfirm){
        const ok = await edgeConfirm({
          tag: unlock ? 'Başarım Aç' : 'Başarım Kilitle',
          title: t(unlock ? 'Açılacak:' : 'Kilitlenecek:') + ' ' + ach.name,
          body: unlock ? 'Bu işlem Steam hesabını kalıcı olarak değiştirir ve profilinde arkadaşlarına görünür.'
                       : 'Bu işlem Steam hesabını kalıcı olarak değiştirir.',
          warn: unlock ? 'Geri almak için başarımı yeniden kilitleyebilirsin.' : '',
          confirmText: unlock ? 'Aç' : 'Kilitle',
          danger: !unlock,
          askSetting: 'achConfirmSingle',
        });
        if (!ok) return false;
      }
      // OPTIMISTIC UPDATE: the tick/badge changes right away without waiting for Steam's reply; if the request
      // fails it is reverted. (Before, nothing seemed to
      // happen until the reply came.)
      const prevAchieved = ach.achieved, prevTime = ach.unlockTime;
      ach.achieved = unlock;
      if (unlock && !ach.unlockTime) ach.unlockTime = Date.now();
      acData.unlocked = acData.achievements.filter(a=>a.achieved).length;
      acBusy.add(apiName);
      renderAchievements();

      const res = await E.setAchievements(acAppid, [{ apiName, unlock }]).catch(e=>({ ok:false, error:(e&&e.message)||'hata' }));
      acBusy.delete(apiName);
      if (!res.ok){
        ach.achieved = prevAchieved; ach.unlockTime = prevTime;   // undo
        acData.unlocked = acData.achievements.filter(a=>a.achieved).length;
        renderAchievements();
        edgeConfirm({ tag:'Hata', danger:true, title:'Başarım değiştirilemedi',
                      body: res.error || 'Steam isteği reddetti.', confirmText:'Tamam', singleButton:true });
        return false;
      }
      acSelected.delete(apiName);   // the operation is done, no selection mark should remain
      // Permanent log - what we unlocked stays recorded even after the app closes (retention from Ayarlar).
      window.imu.state.achLog({ appid: acAppid, game: acData.gameName, apiName, name: ach.name, unlock }).catch(()=>{});
      acData.unlocked = acData.achievements.filter(a=>a.achieved).length;
      notify('ach', unlock?'Başarım Açıldı':'Başarım Kilitlendi', ach.name);
      pushFeed('kart', unlock?'Başarım açıldı':'Başarım kilitlendi', acData.gameName+' · '+ach.name, 'Başarılı');
      renderAchievements();
      return true;
    }

    // Bulk operation - the selected ones if there is a selection, otherwise everything in the filter.
    // With safe mode on they are sent one by one and spaced (the "Açılış aralığı" setting).
    async function acBulk(unlock){
      if (!acData) return;
      const pool = acSelected.size
        ? acData.achievements.filter(a=>acSelected.has(a.apiName))
        : acFilteredList();
      // G4: Protected achievements (those only the game server can write) are removed from the
      // targets. Steam always rejected them with EResult 8; sending them only
      // inflated the error counter and lengthened the loop.
      const allGoals = pool.filter(a=>a.achieved!==unlock);
      const protectedCount = allGoals.filter(a=>a.protectedFlag).length;
      const targets = allGoals.filter(a=>!a.protectedFlag);
      if (!targets.length){
        if (protectedCount){
          edgeConfirm({ tag:'Bilgi', title:'Bu başarımlar dışarıdan açılamaz',
            body: tf('# başarım oyun tarafından korunuyor. Steam bunları yalnızca oyunun kendi sunucusundan kabul eder; uygulama üzerinden açılamaz.', protectedCount),
            confirmText:'Tamam', singleButton:true });
        } else toast('Başarımlar').fail('Değiştirilecek başarım yok.');
        return;
      }
      // There is NO "bir daha sorma" in bulk operations - with a single click it permanently changes dozens of achievements.
      const okBulk = await edgeConfirm({
        tag: unlock ? 'Toplu Aç' : 'Toplu Kilitle',
        title: tf(unlock ? '# başarım açılacak' : '# başarım kilitlenecek', targets.length),
        body: t(acSelected.size ? 'İşlem seçtiğin başarımlara uygulanacak.' : 'İşlem şu anki filtreye uyan başarımlara uygulanacak.') + '\n'
              + t('Bu işlem Steam hesabını kalıcı olarak değiştirir.')
              + (protectedCount ? ('\n\n' + tf('# başarım oyun tarafından korunduğu için atlanacak.', protectedCount)) : ''),
        // The three settings are explained separately: if what each one does is not visible on the confirmation screen
        // the user thinks they changed the interval and nothing changed.
        warn: ((appSettings && appSettings.achSafeMode !== false)
          ? tf('Aralık: #. Güvenli mod açık; aralık her açılışta rastgele sapar, sabit bir ritim oluşmaz.', fmtDelay(acBaseDelaySec()))
          : tf('Aralık: #. Güvenli mod kapalı; aralık aynen uygulanır, eşit aralıklı açılışlar profilde göze çarpar.', fmtDelay(acBaseDelaySec())))
          + '\n' + tf('Toplam süre yaklaşık #.', fmtDelay(Math.round(targets.length * acBaseDelaySec()))),
        confirmText: unlock ? 'Hepsini Aç' : 'Hepsini Kilitle',
        danger: !unlock,
      });
      if (!okBulk) return;

      targets.forEach(a=>acBusy.add(a.apiName));
      acRunning = true; acStopRequested = false;
      const failures = [];
      let ok = 0, fail = 0, repeatedError = 0;
      paintRunBox(0, targets.length, t('başlıyor'));
      renderAchievements();

      // Unlocks are ALWAYS sent one by one and at the interval in the settings.
      // It used to be that with safe mode off they all went in a SINGLE request and the "unlock
      // interval" setting was silently ignored in that case: even with 55 minutes
      // selected they all unlocked in one second. The interval is now valid in every case;
      // safe mode only turns on the deviation (see acNextDelayMs).
      {
        for (let i = 0; i < targets.length; i++){
          if (acStopRequested){
            // Remove the busy mark from the rest, otherwise the rows stay frozen forever
            targets.slice(i).forEach(a=>acBusy.delete(a.apiName));
            break;
          }
          const a = targets[i];
          paintRunBox(i, targets.length, t('gönderiliyor:') + ' ' + a.name);
          const r = await E.setAchievements(acAppid, [{ apiName:a.apiName, unlock }])
                           .catch(e=>({ ok:false, error:(e&&e.message)||'hata' }));
          acBusy.delete(a.apiName);
          if (r.ok){
            ok++; repeatedError = 0;
            a.achieved = unlock; if (unlock && !a.unlockTime) a.unlockTime = Date.now();
            a.lastError = null;
            window.imu.state.achLog({ appid: acAppid, game: acData.gameName, apiName: a.apiName, name: a.name, unlock }).catch(()=>{});
          } else {
            fail++; repeatedError++;
            a.lastError = r.error || t('Steam isteği reddetti.');
            failures.push({ displayName: a.name, hata: a.lastError });
          }
          acData.unlocked = acData.achievements.filter(x=>x.achieved).length;
          paintRunBox(i+1, targets.length, fail ? tf('# başarılı, # hata', ok, fail) : null);
          renderAchievements();

          // ITEM 1: if Steam rejects permanently there is no point continuing the loop. The error used to
          // be swallowed and the same request repeated for the hundreds of achievements left; since the "unlock
          // interval" was waited between attempts (can go up to 90 min)
          // it looked like an infinite loop from outside.
          if (repeatedError >= 3){
            targets.slice(i+1).forEach(x=>acBusy.delete(x.apiName));
            acStopReason = 'ustuste';
            break;
          }
          if (i === targets.length - 1) break;
          // ITEM 1: the settings are re-read EVERY ROUND - changing the interval during the operation
          // used not to work, the loop used the value at the start.
          const isFresh = await window.imu.settings.get().catch(()=>null);
          if (isFresh) appSettings = isFresh;
          const d = acNextDelayMs();
          if (d) await acWait(d, i+1, targets.length);
        }
      }

      acRunning = false;
      acSelected.clear();
      hideRunBox();

      // ITEM 19: VERIFY that it was really written even if Steam says "ok". The interface used to
      // show its own guess; the user saw the "unlocked" text but on Steam
      // only a few had been unlocked.
      let verifyNote = '';
      if (ok > 0){
        paintRunBox(targets.length, targets.length, t('Steam ile doğrulanıyor'));
        const isFresh = await E.achievements(acAppid, true).catch(()=>null);
        hideRunBox();
        if (isFresh && isFresh.ok && isFresh.data && Array.isArray(isFresh.data.achievements)){
          const actual = new Map(isFresh.data.achievements.map(x=>[x.apiName, x.achieved]));
          let mismatched = 0;
          for (const a of targets){
            if (!actual.has(a.apiName)) continue;
            const g = !!actual.get(a.apiName);
            if (a.achieved !== g){ a.achieved = g; a.lastError = t('Steam kaydetmedi'); mismatched++; }
          }
          if (mismatched){
            ok -= mismatched; fail += mismatched;
            verifyNote = tf('# başarım Steam tarafında kaydedilmemiş, işaretleri düzeltildi.', mismatched);
          }
          acData.unlocked = acData.achievements.filter(x=>x.achieved).length;
        }
      }
      renderAchievements();

      // Say the result CLEARLY - silently saying "done" was misleading
      if (fail){
        const initial = failures.slice(0,4).map(b=>'  · '+b.displayName+': '+b.hata).join('\n');
        const remaining = Math.max(0, failures.length-4);
        edgeConfirm({
          tag:'Sonuç', danger:true,
          title: tf('# başarılı, # başarısız', ok, fail),
          body: (acStopReason === 'ustuste'
                  ? (t('Üst üste 3 hata alındı, işlem durduruldu.') + '\n\n')
                  : (acStopReason === 'kullanici' ? (t('İşlemi sen durdurdun.') + '\n\n') : ''))
                + (verifyNote ? verifyNote+'\n\n' : '')
                + (initial ? (t('Hatalar:') + '\n' + initial + (remaining ? ('\n  · ' + tf('ve # tane daha', remaining)) : '')) : ''),
          warn: 'Bazı başarımlar oyun içi ilerlemeye bağlıdır ve doğrudan açılamaz; Steam bunları reddeder.',
          confirmText:'Tamam', singleButton:true,
        });
      }
      acStopReason = null;
      const summary = fail ? tf('# başarılı, # hata', ok, fail) : tf('# başarım', ok);
      notify('ach', unlock?'Başarımlar Açıldı':'Başarımlar Kilitlendi', summary);
      pushFeed(fail?'hata':'kart', unlock?'Toplu başarım açma':'Toplu başarım kilitleme',
               acData.gameName + ' · ' + summary, fail?'Hata':'Başarılı');
    }

    // ---- ITEM 8: running state, progress and stopping ----
    let acRunning = false, acStopRequested = false, acStopReason = null;
    let acWaitCancel = null;
    // The "Aktif Görev" panel in Genel Bakış reads these (ITEM 16)
    // acRunNote was added in 1.1.8: the panel now also says which achievement is being sent at that moment,
    // not only the counter.
    let acRunDone = 0, acRunTotal = 0, acRunNote = '';
    function paintRunBox(doneItems, sumTotal, not){
      acRunDone = doneItems; acRunTotal = sumTotal; acRunNote = not || '';
      // So the Genel Bakış panel shows the achievement job too; when it runs alone no other
      // event is triggered, so we notify from here.
      if (typeof renderGenelActive === 'function') { try { renderGenelActive(); } catch (_) {} }
      const box = document.getElementById('acRunBox');
      const stopBtn = document.getElementById('acStop');
      if (box){
        box.style.display = 'flex';
        const c = document.getElementById('acRunCount');
        const nt = document.getElementById('acRunNote');
        const fl = document.getElementById('acRunFill');
        if (c) c.textContent = doneItems + ' / ' + sumTotal;
        if (nt) nt.textContent = not || '';
        if (fl) fl.style.width = (sumTotal ? Math.round(doneItems/sumTotal*100) : 0) + '%';
      }
      if (stopBtn) stopBtn.style.display = acRunning ? '' : 'none';
      toggleBulkButtons(!acRunning);
    }
    function hideRunBox(){
      acRunDone = 0; acRunTotal = 0; acRunNote = '';
      if (typeof renderGenelActive === 'function') { try { renderGenelActive(); } catch (_) {} }
      const box = document.getElementById('acRunBox');
      if (box) box.style.display = 'none';
      const stopBtn = document.getElementById('acStop');
      if (stopBtn) stopBtn.style.display = 'none';
      toggleBulkButtons(true);
    }
    function toggleBulkButtons(isOpen){
      ['acAllUnlock','acAllLock','acSelLocked','acSelClear'].forEach(id=>{
        const b = document.getElementById(id);
        if (!b) return;
        b.disabled = !isOpen;
        b.style.opacity = isOpen ? '1' : '0.45';
        b.style.cursor = isOpen ? 'pointer' : 'not-allowed';
      });
    }
    // Shows a countdown during the wait and is cut INSTANTLY when Durdur is pressed
    function acWait(ms, doneItems, sumTotal){
      return new Promise((res)=>{
        const finish = Date.now() + ms;
        const tickMark = ()=>{
          if (acStopRequested){ clear(); res(); return; }
          const remaining = Math.max(0, finish - Date.now());
          if (remaining <= 0){ clear(); res(); return; }
          paintRunBox(doneItems, sumTotal, tf('sıradaki # sonra', durationUnit(Math.ceil(remaining/1000), 'sn')));
        };
        const iv = setInterval(tickMark, 250);
        const clear = ()=>{ clearInterval(iv); acWaitCancel = null; };
        acWaitCancel = ()=>{ clear(); res(); };
        tickMark();
      });
    }
    (function bindStop(){
      const b = document.getElementById('acStop');
      if (!b) return;
      b.onclick = ()=>{
        if (!acRunning) return;
        acStopRequested = true;
        acStopReason = 'kullanici';
        if (acWaitCancel) acWaitCancel();
        paintRunBox(0, 0, t('durduruluyor...'));
      };
    })();
