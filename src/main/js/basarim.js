    // ================= BAŞARIMLAR =================
    // Şema + açılma durumu Steam protokolünden, nadirlik yüzdesi global
    // achievement percentages'tan, açılma tarihi GetPlayerAchievements'tan geliyor.
    let acLoaded = false, acGames = [], acData = null, acAppid = null;
    const acBusy = new Set();
    const acCache = new Map();
    let acView = 'grid', acFilterV = 'all', acSort = 'default', acSelAp = null;
    const acSelected = new Set();     // apiName - toplu aç/kilitle seçimi

    const AC = { ok:'#5FB324', warn:'#B37E24', teal:'#24AEB3', sub:'#C2AAEE', brand:'#5624B3',
                 bad:'#B32453', title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345' };

    async function loadBasarim(){
      acApplySettings();
      if (acLoaded){ renderAchievements(); return; }
      const input = document.getElementById('acGameInput');
      // Hata sadece arama kutusunun placeholder'ında yazıyordu; sayfa boş görünüyor ve
      // kullanıcı neden yüklenmediğini anlamıyordu. Artık sayfanın ortasında sebep +
      // "Tekrar Dene" düğmesi çıkıyor.
      const fail = (msg)=>{
        input.value=''; input.placeholder = 'Yüklenemedi';
        const body = document.getElementById('acBody');
        if (!body) return;
        body.innerHTML = '<div style="border:1px solid #B32453;border-radius:12px;background:#0D1118;padding:56px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#DCE2FA">Başarımlar yüklenemedi</span>'
          + '<span style="font-size:12px;color:#B32453;max-width:380px">'+esc(msg||'Bilinmeyen hata')+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E;max-width:420px">Steam oturumu başka bir yerde açıldıysa (Steam istemcisi ya da '
          + 'uygulamanın ikinci bir penceresi) bu hesabın oturumu devralınır. Diğer oturumu kapatıp tekrar dene.</span>'
          + '<button id="acRetry" class="h-brand" style="margin-top:6px;height:34px;padding:0 18px;border-radius:999px;background:#5624B3;border:1px solid #5624B3;color:#DCE2FA;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer">Tekrar Dene</button>'
          + '</div>';
        const rb = document.getElementById('acRetry');
        if (rb) rb.onclick = ()=>{ acLoaded = false; loadBasarim(); };
      };
      input.placeholder = 'Steam\'e bağlanılıyor...';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ fail(con.error); return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'kütüphane hatası' }));
      if (!res.ok){ fail(res.error); return; }
      acGames = (res.games || []).filter(g=>g.hasStats);
      acLoaded = true;
      input.placeholder = acGames.length + ' oyun · ara veya seç...';
      renderAchievements();
    }

    function acApplySettings(){
      if (typeof appSettings !== 'object' || !appSettings) return;
      if (appSettings.achOrder) acSort = appSettings.achOrder;
      const s = document.getElementById('acSort'); if (s) s.value = acSort;
      const sm = document.getElementById('acSafeMode');
      if (sm){
        const on = appSettings.achSafeMode !== false;
        sm.textContent = on ? 'Açık' : 'Kapalı';
        sm.style.color = on ? AC.ok : AC.warn;
      }
    }

    // Nadirlik: gerçek Steam global yüzdesi (uydurma değil)
    // Nadirlik = başarımı açan oyuncu yüzdesi (Steam'in global istatistiği; uydurma değil).
    // Yüzde DÜŞÜKSE nadir: %3 açmışsa nadir, %80 açmışsa yaygın.
    // Eşikler topluluk ölçeğine göre 5 kademe - eski 3 kademeli ölçekte (<%10 = nadir) çok
    // başarımlı oyunlarda listenin yarısı "nadir" görünüyordu (ör. TF2'de medyan %10).
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
    const acDate = (a) => a.achieved ? (a.unlockTime ? new Date(a.unlockTime).toLocaleDateString('tr-TR') : 'bilinmiyor') : '-';

    // ---- aranabilir oyun seçici ----
    // acGameSelect gizli kaldı (geri uyumluluk için); görünen kutu acGameInput.
    const acGameInput = document.getElementById('acGameInput');
    const acGameListEl = document.getElementById('acGameList');
    let acGamePickedName = '';
    function renderGameList(){
      const q = acGameInput.value.trim().toLowerCase();
      // Kullanıcı seçili oyunun adını silmeden yazmaya başladıysa filtrele; aksi halde hepsi
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
          // Kütüphane Başlığı oranı (920x430, ~2.14:1)
          + '<div style="width:54px;height:25px;flex-shrink:0;border-radius:6px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<span style="flex:1;min-width:0;font-size:12px;font-weight:600;color:'+(on?'#DCE2FA':'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + (on?'<span style="font-family:Geist Mono,monospace;font-size:11px;color:#5FB324;flex-shrink:0">✓</span>':'')
          + '</div>';
      }).join('') + (match.length > 200
        ? '<div style="padding:8px 10px;font-size:11px;color:#656D80">+'+(match.length-200)+' oyun daha - aramayı daraltın</div>' : '');
    }
    function openGameList(){ acGameListEl.style.display = 'block'; renderGameList(); }
    function closeGameList(){
      acGameListEl.style.display = 'none';
      if (acGamePickedName) acGameInput.value = acGamePickedName;   // yarım aramayı geri al
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
    document.getElementById('acSort').addEventListener('change', e=>{ acSort=e.target.value; renderAchievements(); });
    document.getElementById('acReset').onclick = ()=>{
      acFilterV='all'; acSort='default'; acSelected.clear();
      document.getElementById('acFilter').value='all';
      document.getElementById('acSort').value='default';
      document.getElementById('acSearch').value='';
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
      acAppid = appid; acBusy.clear(); acSelAp = null; acSelected.clear();
      if (acCache.has(appid)){ acData = acCache.get(appid); renderAchievements(); return; }
      acData = null;
      document.getElementById('acBody').innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">Başarımlar Steam\'den çekiliyor...</div>';
      const res = await E.achievements(appid).catch(e=>({ ok:false, error:(e&&e.message)||'başarım hatası' }));
      if (acAppid !== appid) return;
      if (!res.ok){
        // Gecici Steam hatalarinda kullanici yeniden deneyebilmeli; eskiden sadece ham hata
        // metni basiliyor, sayfayi terk edip donmekten baska care kalmiyordu.
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
      if (acSort === 'alpha') list.sort((a,b)=>a.name.localeCompare(b.name));
      else if (acSort === 'rarity') list.sort((a,b)=>(a.rarityPct??101)-(b.rarityPct??101));
      else if (acSort === 'date') list.sort((a,b)=>(b.unlockTime||0)-(a.unlockTime||0));
      else list.sort((a,b)=>(b.achieved-a.achieved));
      return list;
    }

    // Ortak parçalar (grid ve liste aynı verileri kullanıyor)
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

    // G4: korumali basarim rozeti - yalnizca oyunun kendi sunucusu yazabilir, uygulama
    // uzerinden acilamaz. Kullanici EResult 8 hatasinin sebebini gorsun diye isaretlenir.
    function acKorumaliRozet(a){
      if (!a || !a.korumali) return '';
      return '<span title="Bu başarımı yalnızca oyunun kendi sunucusu açabilir" style="font-size:9px;'
        + 'font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#B37E24;'
        + 'border:1px solid #B37E24;border-radius:12px;padding:2px 6px;flex-shrink:0">Korumalı</span>';
    }

    function acCardHTML(a){
      const busy = acBusy.has(a.apiName);
      const korumaliRozet = acKorumaliRozet(a);
      const dim = a.achieved ? 1 : 0.55;
      const pct = Number.isFinite(a.rarityPct) ? a.rarityPct.toFixed(1) : '?';
      const rare = rarityTier(a.rarityPct);
      const rareOn = (rare==='rare'||rare==='ultrarare') ? 1 : 0;
      return '<div data-ap="'+esc(a.apiName)+'" class="h-bd" style="border:1px solid '+(a.apiName===acSelAp?AC.brand:AC.bd)+';border-radius:12px;background:'+(a.achieved?'#0D1118':'#090C12')+';padding:16px;display:flex;gap:14px;align-items:flex-start;cursor:pointer">'
        + '<div style="margin-top:13px">'+acCheckbox(a)+'</div>'
        + '<div style="width:44px;height:44px;flex-shrink:0;border-radius:12px;border:1px solid '+(a.achieved?AC.ok:AC.bd)+';background:#101621;display:flex;align-items:center;justify-content:center;opacity:'+dim+';overflow:hidden">'
          + (a.icon?'<img src="'+esc(a.icon)+'" style="width:100%;height:100%;object-fit:cover"'+(a.achieved?'':' style="filter:grayscale(1)"')+'>'
                  :'<span style="width:12px;height:12px;background:'+(a.achieved?AC.ok:AC.off)+';transform:rotate(45deg)"></span>')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1;opacity:'+dim+'">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '<span style="font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name)+'</span>'
            + korumaliRozet
            + acBadge(busy?'İşleniyor':(a.achieved?'Açık':'Kilitli'), a.achieved?AC.ok:AC.warn, a.achieved?AC.ok:AC.warn)
          + '</div>'
          + '<p style="margin:0;font-size:11px;line-height:1.5;color:#8B8F9E">'+esc(a.desc||'Açıklama yok.')+'</p>'
          + '<div style="display:flex;align-items:center;gap:8px;margin-top:2px">'
            + acBadge(rarityLabel(a), rarityColor(a), rarityColor(a), ';opacity:'+rareOn)
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#24AEB3">%'+pct+'</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:'+(a.achieved?AC.muted:AC.off)+';margin-left:auto">'+acDate(a)+'</span>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px">'
            + '<div style="flex:1;height:4px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
              + '<div style="height:100%;width:'+pct+'%;border-radius:999px;background:#24AEB3"></div></div>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE;flex-shrink:0">%'+pct+'</span>'
          + '</div>'
        + '</div></div>';
    }

    function acRowHTML(a){
      const busy = acBusy.has(a.apiName);
      const korumaliRozet = acKorumaliRozet(a);
      const dim = a.achieved ? 1 : 0.55;
      const pct = Number.isFinite(a.rarityPct) ? a.rarityPct.toFixed(1) : '?';
      const rare = rarityTier(a.rarityPct);
      const rareOn = (rare==='rare'||rare==='ultrarare') ? 1 : 0;
      return '<div data-ap="'+esc(a.apiName)+'" class="h-bd" style="border:1px solid '+(a.apiName===acSelAp?AC.brand:AC.bd)+';border-radius:12px;background:'+(a.achieved?'#0D1118':'#090C12')+';padding:10px 16px;display:flex;align-items:center;gap:14px;cursor:pointer">'
        + acCheckbox(a)
        + '<div style="width:34px;height:34px;flex-shrink:0;border-radius:12px;border:1px solid '+(a.achieved?AC.ok:AC.bd)+';background:#101621;display:flex;align-items:center;justify-content:center;opacity:'+dim+';overflow:hidden">'
          + (a.icon?'<img src="'+esc(a.icon)+'" style="width:100%;height:100%;object-fit:cover">'
                  :'<span style="width:9px;height:9px;background:'+(a.achieved?AC.ok:AC.off)+';transform:rotate(45deg)"></span>')
        + '</div>'
        + '<span style="width:180px;flex-shrink:0;font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:'+dim+'">'+esc(a.name)+'</span>'
        + korumaliRozet
        + '<p style="margin:0;flex:1;min-width:0;font-size:11px;line-height:1.4;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:'+dim+'">'+esc(a.desc||'')+'</p>'
        + acBadge(rarityLabel(a), rarityColor(a), rarityColor(a), ';opacity:'+rareOn)
        + '<span style="width:62px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:#24AEB3;text-align:right">%'+pct+'</span>'
        + '<span style="width:88px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:11px;color:'+(a.achieved?AC.muted:AC.off)+';text-align:right">'+acDate(a)+'</span>'
        + '<div style="width:110px;flex-shrink:0;display:flex;align-items:center;gap:6px">'
          + '<div style="flex:1;height:4px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden">'
            + '<div style="height:100%;width:'+pct+'%;border-radius:999px;background:#24AEB3"></div></div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE;flex-shrink:0">%'+pct+'</span></div>'
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
      set('acSummaryText', unlocked+' / '+total+' açıldı');
      set('acPctBig', '%'+pct);
      document.getElementById('acBar').style.width = pct+'%';
      const logo = document.getElementById('acLogo');
      // kütüphane başlığı → yoksa kapsül (bkz common.js gameImg)
      logo.src = gameImg(acAppid);
      logo.onerror = ()=>{
        if (!logo.dataset.fb){ logo.dataset.fb = '1'; logo.src = gameImg(acAppid, 'capsule'); }
        else logo.style.opacity = 0;
      };

      const list = acFilteredList();
      set('acCount', list.length + ' / ' + total + ' başarım');
      if (!list.length){
        body.innerHTML = '<div style="border:1px solid #2B3345;border-radius:12px;background:#0D1118;padding:64px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Bu filtreyle başarım yok</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Farklı bir oyun seç ya da filtreyi "Tüm başarımlar" yap.</span></div>';
        renderAcDetail(); renderAcPick();
        return;
      }
      // Açılanlar önce, sonra "Kilitli" ayracı (ayraç satırı)
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

    // ---- sağ detay paneli ----
    function renderAcDetail(){
      const box = document.getElementById('acDetail');
      if (!box) return;
      const a = acData && acSelAp ? acData.achievements.find(x=>x.apiName===acSelAp) : null;
      const head = '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E">Detay</span>';
      if (!a){
        box.innerHTML = head
          + '<div style="width:56px;height:56px;border-radius:12px;border:1px solid #2B3345;background:#101621;display:flex;align-items:center;justify-content:center">'
            + '<span style="width:15px;height:15px;background:#5624B3;transform:rotate(45deg)"></span></div>'
          + '<span style="font-size:12px;line-height:1.6;color:#8B8F9E">Detay için bir başarıma tıkla.</span>';
        return;
      }
      const pct = Number.isFinite(a.rarityPct) ? a.rarityPct.toFixed(1) : '?';
      const row = (k,v,c) => '<div style="display:flex;align-items:center;justify-content:space-between">'
        + '<span style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#8B8F9E">'+k+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+(c||AC.title)+'">'+v+'</span></div>';
      // Bu oyunda son açılanlar - gerçek açılma zamanına göre
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
          + row('Oyuncularda oranı', '%'+pct, AC.sub)
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
                + '<span style="font-size:10px;color:#656D80">'+rarityLabel(r)+' · %'+(Number.isFinite(r.rarityPct)?r.rarityPct.toFixed(1):'?')+'</span></div>'
              + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E;flex-shrink:0">'+acDate(r)+'</span></div>').join('')
            : '<span style="font-size:11px;color:#656D80;padding:8px 0">Açılma tarihi bilinen başarım yok.</span>')
        + '</div>';
    }

    // ---- alt bar (seçim / tahmini süre) ----
    function renderAcPick(){
      const n = acSelected.size;
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('acPickLabel', n + ' başarım');
      // Güvenli mod açıkken açılışlar ayarlardaki aralıkla tek tek yapılır → gerçek tahmin.
      // Aralık rastgeleleştirildiği için tahmin ORTALAMA üzerinden verilir.
      const safe = !appSettings || appSettings.achSafeMode !== false;
      const secs = safe ? Math.round(n * acBaseDelaySec()) : 0;
      const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
      set('acPickEta', (h ? (String(h).padStart(2,'0')+':') : '')
                       + String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'));
    }

    // Açılış aralığı. Ayarlardaki değer saniye cinsindendir (en hızlı 1 sn, üstü dakika
    // bazlı). Ritmik görünmemesi için her açılışta rastgele sapma uygulanır: normalde
    // ±%40, "Açılışları zamana yay" açıkken çok daha geniş (%40-%160).
    function acBaseDelaySec(){
      const v = +((appSettings||{}).achDelay);
      return Number.isFinite(v) && v > 0 ? v : 1;
    }
    function fmtDelay(sec){
      if (sec < 60) return sec + ' saniye';
      const m = Math.round(sec/60);
      return m < 60 ? (m + ' dakika') : ((m/60).toFixed(m%60?1:0).replace('.',',') + ' saat');
    }
    function acNextDelayMs(){
      const base = acBaseDelaySec() * 1000;
      const spread = appSettings && appSettings.achSpread;
      const f = spread ? (0.4 + Math.random()*1.2) : (0.6 + Math.random()*0.8);
      return Math.max(250, Math.round(base * f));
    }

    // ---- tıklama: seçim kutusu vs detay ----
    document.getElementById('acBody').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-ap]'); if (!row || !acData) return;
      const ap = row.getAttribute('data-ap');
      if (e.target.closest('[data-a="sel"]')){
        acSelected.has(ap) ? acSelected.delete(ap) : acSelected.add(ap);
        renderAchievements();
        return;
      }
      acSelAp = ap;
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
          title: (unlock ? 'Açılacak: ' : 'Kilitlenecek: ') + ach.name,
          body: 'Bu işlem Steam hesabını kalıcı olarak değiştirir'
                + (unlock ? ' ve profilinde arkadaşlarına görünür' : '') + '.',
          warn: unlock ? 'Geri almak için başarımı yeniden kilitleyebilirsin.' : '',
          confirmText: unlock ? 'Aç' : 'Kilitle',
          danger: !unlock,
          dontAskKey: 'achSingle',
        });
        if (!ok) return false;
      }
      // İYİMSER GÜNCELLEME: tik/rozet Steam yanıtını beklemeden hemen değişir; istek
      // başarısız olursa eski haline döndürülür. (Önceden yanıt gelene kadar hiçbir şey
      // olmuyor gibi görünüyordu.)
      const prevAchieved = ach.achieved, prevTime = ach.unlockTime;
      ach.achieved = unlock;
      if (unlock && !ach.unlockTime) ach.unlockTime = Date.now();
      acData.unlocked = acData.achievements.filter(a=>a.achieved).length;
      acBusy.add(apiName);
      renderAchievements();

      const res = await E.setAchievements(acAppid, [{ apiName, unlock }]).catch(e=>({ ok:false, error:(e&&e.message)||'hata' }));
      acBusy.delete(apiName);
      if (!res.ok){
        ach.achieved = prevAchieved; ach.unlockTime = prevTime;   // geri al
        acData.unlocked = acData.achievements.filter(a=>a.achieved).length;
        renderAchievements();
        edgeConfirm({ tag:'Hata', danger:true, title:'Başarım değiştirilemedi',
                      body: res.error || 'Steam isteği reddetti.', confirmText:'Tamam', cancelText:'Kapat' });
        return false;
      }
      acSelected.delete(apiName);   // işlem bitti, seçim işareti kalmasın
      // Kalıcı günlük - uygulama kapansa da ne açtığımız kayıtlı kalır (saklama süresi Ayarlar'dan).
      window.imu.state.achLog({ appid: acAppid, game: acData.gameName, apiName, name: ach.name, unlock }).catch(()=>{});
      acData.unlocked = acData.achievements.filter(a=>a.achieved).length;
      notify('ach', unlock?'Başarım Açıldı':'Başarım Kilitlendi', ach.name);
      pushFeed('kart', unlock?'Başarım açıldı':'Başarım kilitlendi', acData.gameName+' · '+ach.name, 'Başarılı');
      renderAchievements();
      return true;
    }

    // Toplu işlem - seçim varsa seçilenler, yoksa filtredeki hepsi.
    // Güvenli mod açıkken tek tek ve aralıklı gönderilir ("Açılış aralığı" ayarı).
    async function acBulk(unlock){
      if (!acData) return;
      const pool = acSelected.size
        ? acData.achievements.filter(a=>acSelected.has(a.apiName))
        : acFilteredList();
      // G4: Korumali basarimlar (yalnizca oyun sunucusunun yazabildikleri) hedeflerden
      // cikarilir. Steam bunlari her zaman EResult 8 ile reddediyordu; gondermek sadece
      // hata sayacini sisirip donguyu uzatiyordu.
      const hepsiHedef = pool.filter(a=>a.achieved!==unlock);
      const korumaliSayi = hepsiHedef.filter(a=>a.korumali).length;
      const targets = hepsiHedef.filter(a=>!a.korumali);
      if (!targets.length){
        if (korumaliSayi){
          edgeConfirm({ tag:'Bilgi', title:'Bu başarımlar dışarıdan açılamaz',
            body: korumaliSayi + ' başarım oyun tarafından korunuyor. Steam bunları yalnızca '
                  + 'oyunun kendi sunucusundan kabul eder; uygulama üzerinden açılamaz.',
            confirmText:'Tamam', cancelText:'Kapat' });
        } else alert('Değiştirilecek başarım yok.');
        return;
      }
      // Toplu işlemde "bir daha sorma" YOK - tek tıkla onlarca başarımı kalıcı değiştiriyor.
      const okBulk = await edgeConfirm({
        tag: unlock ? 'Toplu Aç' : 'Toplu Kilitle',
        title: targets.length + ' başarım ' + (unlock ? 'açılacak' : 'kilitlenecek'),
        body: (acSelected.size ? 'Seçtiğin' : 'Şu anki filtreye uyan') + ' başarımlar üzerinde işlem yapılacak.\n'
              + 'Bu işlem Steam hesabını kalıcı olarak değiştirir.'
              + (korumaliSayi ? ('\n\n' + korumaliSayi + ' başarım oyun tarafından korunduğu için atlanacak.') : ''),
        warn: (appSettings && appSettings.achSafeMode !== false)
          ? ('Güvenli mod açık: açılışlar ortalama ' + fmtDelay(acBaseDelaySec()) + ' arayla, her seferinde '
             + 'rastgele sapmayla yapılır - sabit bir ritim oluşmaz.')
          : 'Güvenli mod KAPALI: hepsi aynı anda gönderilir, profilde toplu açılış olarak görünür.',
        confirmText: unlock ? 'Hepsini Aç' : 'Hepsini Kilitle',
        danger: !unlock,
      });
      if (!okBulk) return;

      const safe = !appSettings || appSettings.achSafeMode !== false;
      targets.forEach(a=>acBusy.add(a.apiName));
      acRunning = true; acStopIstendi = false;
      const basarisizlar = [];
      let ok = 0, fail = 0, ustUsteHata = 0;
      paintRunBox(0, targets.length, 'başlıyor');
      renderAchievements();

      if (safe){
        for (let i = 0; i < targets.length; i++){
          if (acStopIstendi){
            // Kalanlarin mesgul isaretini kaldir, yoksa satirlar sonsuza kadar donuk kalir
            targets.slice(i).forEach(a=>acBusy.delete(a.apiName));
            break;
          }
          const a = targets[i];
          paintRunBox(i, targets.length, 'gönderiliyor: ' + a.name);
          const r = await E.setAchievements(acAppid, [{ apiName:a.apiName, unlock }])
                           .catch(e=>({ ok:false, error:(e&&e.message)||'hata' }));
          acBusy.delete(a.apiName);
          if (r.ok){
            ok++; ustUsteHata = 0;
            a.achieved = unlock; if (unlock && !a.unlockTime) a.unlockTime = Date.now();
            a.sonHata = null;
            window.imu.state.achLog({ appid: acAppid, game: acData.gameName, apiName: a.apiName, name: a.name, unlock }).catch(()=>{});
          } else {
            fail++; ustUsteHata++;
            a.sonHata = r.error || 'Steam reddetti';
            basarisizlar.push({ ad: a.name, hata: a.sonHata });
          }
          acData.unlocked = acData.achievements.filter(x=>x.achieved).length;
          paintRunBox(i+1, targets.length, fail ? (ok+' açıldı, '+fail+' hata') : null);
          renderAchievements();

          // MADDE 1: Steam kalici olarak reddediyorsa donguyu surdurmek anlamsiz. Eskiden
          // hata yutuluyor ve kalan yuzlerce basarim icin ayni istek tekrarlaniyordu; her
          // deneme arasinda "acilis araligi" kadar beklendigi icin (90 dk'ya kadar cikabilir)
          // disaridan sonsuz dongu gibi gorunuyordu.
          if (ustUsteHata >= 3){
            targets.slice(i+1).forEach(x=>acBusy.delete(x.apiName));
            acDurdurmaSebebi = 'ustuste';
            break;
          }
          if (i === targets.length - 1) break;
          // MADDE 1: ayarlar HER TURDA yeniden okunur - islem sirasinda araligi degistirmek
          // eskiden ise yaramiyordu, dongu baslangictaki degeri kullaniyordu.
          const taze = await window.imu.settings.get().catch(()=>null);
          if (taze) appSettings = taze;
          const d = acNextDelayMs();
          if (d) await acBekle(d, i+1, targets.length);
        }
      } else {
        paintRunBox(0, targets.length, 'toplu gönderiliyor');
        const r = await E.setAchievements(acAppid, targets.map(a=>({ apiName:a.apiName, unlock })))
                         .catch(e=>({ ok:false, error:(e&&e.message) }));
        targets.forEach(a=>acBusy.delete(a.apiName));
        if (r.ok){ ok = targets.length; targets.forEach(a=>{
          a.achieved = unlock; if (unlock && !a.unlockTime) a.unlockTime = Date.now(); a.sonHata = null;
          window.imu.state.achLog({ appid: acAppid, game: acData.gameName, apiName: a.apiName, name: a.name, unlock }).catch(()=>{});
        }); }
        else {
          fail = targets.length;
          targets.forEach(a=>{ a.sonHata = r.error || 'Steam reddetti'; });
          basarisizlar.push({ ad: targets.length+' başarım', hata: r.error || 'Steam reddetti' });
        }
        acData.unlocked = acData.achievements.filter(x=>x.achieved).length;
        paintRunBox(targets.length, targets.length, null);
      }

      acRunning = false;
      acSelected.clear();
      gizleRunBox();

      // MADDE 19: Steam "tamam" dese bile gercekten yazildigini DOGRULA. Eskiden arayuz
      // kendi tahminini gosteriyordu; kullanici "acildi" yazisini goruyor ama Steam'de
      // sadece birkaci acilmis oluyordu.
      let dogrulamaNotu = '';
      if (ok > 0){
        paintRunBox(targets.length, targets.length, 'Steam ile doğrulanıyor');
        const taze = await E.achievements(acAppid, true).catch(()=>null);
        gizleRunBox();
        if (taze && taze.ok && taze.data && Array.isArray(taze.data.achievements)){
          const gercek = new Map(taze.data.achievements.map(x=>[x.apiName, x.achieved]));
          let uyusmayan = 0;
          for (const a of targets){
            if (!gercek.has(a.apiName)) continue;
            const g = !!gercek.get(a.apiName);
            if (a.achieved !== g){ a.achieved = g; a.sonHata = 'Steam kaydetmedi'; uyusmayan++; }
          }
          if (uyusmayan){
            ok -= uyusmayan; fail += uyusmayan;
            dogrulamaNotu = uyusmayan + ' başarım Steam tarafında kaydedilmemiş, işaretleri düzeltildi.';
          }
          acData.unlocked = acData.achievements.filter(x=>x.achieved).length;
        }
      }
      renderAchievements();

      // Sonucu ACIKCA anlat - sessizce "bitti" demek yaniltiyordu
      if (fail){
        const ilk = basarisizlar.slice(0,4).map(b=>'  · '+b.ad+': '+b.hata).join('\n');
        const kalan = Math.max(0, basarisizlar.length-4);
        edgeConfirm({
          tag:'Sonuç', danger:true,
          title: ok+' başarıldı, '+fail+' başarısız',
          body: (acDurdurmaSebebi === 'ustuste'
                  ? 'Üst üste 3 hata alındı, işlem durduruldu.\n\n'
                  : (acDurdurmaSebebi === 'kullanici' ? 'İşlemi sen durdurdun.\n\n' : ''))
                + (dogrulamaNotu ? dogrulamaNotu+'\n\n' : '')
                + (ilk ? ('Hatalar:\n'+ilk+(kalan?('\n  · ve '+kalan+' tane daha'):'')) : ''),
          warn: 'Bazı başarımlar oyun içi ilerlemeye bağlıdır ve doğrudan açılamaz; Steam bunları reddeder.',
          confirmText:'Tamam', cancelText:'Kapat',
        });
      }
      acDurdurmaSebebi = null;
      notify('ach', unlock?'Başarımlar Açıldı':'Başarımlar Kilitlendi', ok+' başarım'+(fail?(', '+fail+' hata'):''));
      pushFeed(fail?'hata':'kart', unlock?'Toplu başarım açma':'Toplu başarım kilitleme',
               acData.gameName+' · '+ok+' başarım'+(fail?(', '+fail+' hata'):''), fail?'Hata':'Başarılı');
    }

    // ---- MADDE 8: calisma durumu, ilerleme ve durdurma ----
    let acRunning = false, acStopIstendi = false, acDurdurmaSebebi = null;
    let acBeklemeIptal = null;
    // Genel Bakis'taki "Aktif Görev" paneli bunlari okur (MADDE 16)
    // acRunNot 1.1.8'de eklendi: panel artik o an hangi basarimin gonderildigini de
    // yaziyor, yalnizca sayaci degil.
    let acRunYapilan = 0, acRunToplam = 0, acRunNot = '';
    function paintRunBox(yapilan, toplam, not){
      acRunYapilan = yapilan; acRunToplam = toplam; acRunNot = not || '';
      // Genel Bakis paneli basarim isini de gostersin; tek basina calisirken baska
      // hicbir olay tetiklenmedigi icin buradan haber veriyoruz.
      if (typeof renderGenelActive === 'function') { try { renderGenelActive(); } catch (_) {} }
      const box = document.getElementById('acRunBox');
      const stopBtn = document.getElementById('acStop');
      if (box){
        box.style.display = 'flex';
        const c = document.getElementById('acRunCount');
        const nt = document.getElementById('acRunNote');
        const fl = document.getElementById('acRunFill');
        if (c) c.textContent = yapilan + ' / ' + toplam;
        if (nt) nt.textContent = not || '';
        if (fl) fl.style.width = (toplam ? Math.round(yapilan/toplam*100) : 0) + '%';
      }
      if (stopBtn) stopBtn.style.display = acRunning ? '' : 'none';
      toggleBulkButtons(!acRunning);
    }
    function gizleRunBox(){
      acRunYapilan = 0; acRunToplam = 0; acRunNot = '';
      if (typeof renderGenelActive === 'function') { try { renderGenelActive(); } catch (_) {} }
      const box = document.getElementById('acRunBox');
      if (box) box.style.display = 'none';
      const stopBtn = document.getElementById('acStop');
      if (stopBtn) stopBtn.style.display = 'none';
      toggleBulkButtons(true);
    }
    function toggleBulkButtons(acik){
      ['acAllUnlock','acAllLock','acSelLocked','acSelClear'].forEach(id=>{
        const b = document.getElementById(id);
        if (!b) return;
        b.disabled = !acik;
        b.style.opacity = acik ? '1' : '0.45';
        b.style.cursor = acik ? 'pointer' : 'not-allowed';
      });
    }
    // Bekleme sirasinda geri sayim gosterir ve Durdur'a basilinca ANINDA kesilir
    function acBekle(ms, yapilan, toplam){
      return new Promise((res)=>{
        const bitis = Date.now() + ms;
        const tik = ()=>{
          if (acStopIstendi){ temizle(); res(); return; }
          const kalan = Math.max(0, bitis - Date.now());
          if (kalan <= 0){ temizle(); res(); return; }
          paintRunBox(yapilan, toplam, 'sıradaki ' + Math.ceil(kalan/1000) + ' sn sonra');
        };
        const iv = setInterval(tik, 250);
        const temizle = ()=>{ clearInterval(iv); acBeklemeIptal = null; };
        acBeklemeIptal = ()=>{ temizle(); res(); };
        tik();
      });
    }
    (function baglaDurdur(){
      const b = document.getElementById('acStop');
      if (!b) return;
      b.onclick = ()=>{
        if (!acRunning) return;
        acStopIstendi = true;
        acDurdurmaSebebi = 'kullanici';
        if (acBeklemeIptal) acBeklemeIptal();
        paintRunBox(0, 0, 'durduruluyor...');
      };
    })();
