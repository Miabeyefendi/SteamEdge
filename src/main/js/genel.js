    // ================= GENEL BAKIŞ =================
    // Panellerdeki tüm sayılar gerçek Steam verisinden ve motorun kendi
    // ölçümlerinden geliyor; örnek/sabit veri yok.
    const sessionStartTs = Date.now();
    let genelLoaded = false;

    // Palet kısayolları
    const GC = { ok:'#5FB324', warn:'#B37E24', bad:'#B32453', sub:'#C2AAEE', bdActive:'#5624B3', muted:'#8B8F9E' };
    // "Durum" sütununun sözlüğü: Başarılı / Çalışıyor / Uyarı / Durdu
    const FEED_STATUS = {
      'Başarılı':  { color: GC.ok,  bd: GC.ok },
      'Çalışıyor': { color: GC.sub, bd: GC.bdActive },
      'Uyarı':     { color: GC.warn, bd: GC.warn },
      'Durdu':     { color: GC.bad, bd: GC.bad },
      'Hata':      { color: GC.bad, bd: GC.bad },
      'Mesaj':     { color: GC.blue || '#24AEB3', bd: GC.blue || '#24AEB3' },
    };
    const DEFAULT_STATUS_BY_KIND = { hata:'Hata', uyari:'Uyarı' };

    // {kind, title, text, status, ts} - gercek uygulama olaylari.
    // KALICI: hesap deposunda saklanir, uygulama kapanip acilinca gecmis kaybolmaz.
    let activityFeed = [];
    const AKTIVITE_ANAHTARI = 'aktiviteAkisi';
    let aktiviteYazmaZamani = null;

    async function aktiviteyiYukle(){
      try {
        const r = await window.imu.state.get(AKTIVITE_ANAHTARI);
        if (r && Array.isArray(r.value)) { activityFeed = r.value.slice(0, 30); renderFeed(); }
      } catch (_) {}
    }
    // Diske yazmayi topluyoruz: pes pese olaylarda her seferinde dosyaya gitmesin.
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
    // Aktivite satırı (grid 3 sütun, 60px, nokta kutusu + durum rozeti)
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
        const t = new Date(f.ts).toLocaleTimeString('tr-TR');
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
    // Sayaçlarda iki nokta üst üste vurgu rengiyle yazılır: 04<span #C2AAEE>:</span>12
    function monoTime(str){ return String(str).replace(/:/g, '<span style="color:#C2AAEE">:</span>'); }

    document.getElementById('gStatSessionSub').textContent = t('Başlangıç:') + ' ' + new Date(sessionStartTs).toLocaleTimeString('tr-TR');
    setInterval(()=>{
      if (typeof uiTickAllowed === 'function' && !uiTickAllowed()) return;
      const el=document.getElementById('gStatSession');
      if(el) el.innerHTML = monoTime(fmtSessionDur(Date.now()-sessionStartTs));
      // Gorev satirindaki geri sayimlar motor tikine bagli kalmasin: Gercekci Mod dakikalarca
      // sessiz kalabiliyor, "Kalan Sure" o sure boyunca donuyordu.
      if (gorevListesi.length) renderGenelActive();
    }, 1000);

    function renderGenelStats(){
      const c = document.getElementById('gStatCards'); if (!c) return;
      const set = (id, v, html) => { const e=document.getElementById(id); if(e){ if(html) e.innerHTML=v; else e.textContent=v; } };

      // Toplam Kart
      const totalCards = dropGames.reduce((s,g)=>s+g.remaining,0);
      c.textContent = kartLoaded ? totalCards.toLocaleString('tr-TR') : '-';
      set('gStatCardsSub', kartLoaded ? (dropGames.length+' oyunda kart var') : 'Kart Düşür sekmesinde yenile');

      // Kütüphane
      set('gStatGames', (saatLoaded && ownedGames.length) ? ownedGames.length.toLocaleString('tr-TR') : '-');
      set('gStatGamesSub', kartLoaded ? tf('# oyun toplamaya hazır', dropGames.length) : '-');

      // Envanter & Pazar - değer + Steam kesintisi sonrası net
      // Yedek dali SART: hesap degistiginde resetPageCaches() invMerged'i null yapiyor ama
      // kutu yazilmayinca ONCEKI HESABIN degeri ekranda kaliyordu.
      if (invMerged){
        let value=0, units=0;
        invMerged.forEach(i=>{ units+=i.count; if(i.marketable && i.marketHashName){ const v=priceVal(i); if(v!=null) value += v*i.count; } });
        set('gStatValue', fmtTL(value));
        set('gStatValueSub', tf('# öğe · net #', units.toLocaleString('tr-TR'), fmtTL(value*0.87)));
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

      // Başarımlar - sadece Başarımlar sekmesinde bir oyun seçiliyse gerçek veri var
      if (typeof acData !== 'undefined' && acData && acData.total){
        const pct = Math.round(acData.unlocked/acData.total*100);
        set('gStatAch', acData.unlocked+' / '+acData.total);
        set('gStatAchSub', tf('%# tamamlandı ·', pct) + ' ' + (acData.gameName||''));
      } else {
        set('gStatAch', '-');
        set('gStatAchSub', 'Başarımlar sekmesinde oyun seç');
      }
    }

    // Diskteki son listeler: Steam'e istek gitmez, dosyadan okunur. Kart ve kütüphane
    // sayıları oturum açılmayı beklemeden ekrana gelsin diye. Taze veri geldiğinde
    // aşağıdaki dropGames/ownedGames çağrıları bunların üstüne yazar.
    let listelerTaze = false;    // ekrandaki listeler Steam'den mi geldi, diskten mi
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
        // Profil ÖNCE: son bilinen isim/avatar/seviye ayarlarla birlikte geldiği için
        // hemen ekrana yazılır. Eskiden bu satır bağlantı kurulduktan sonra çalışıyordu ve
        // sağ üstteki hesap rozeti oturum açılana kadar tire gösteriyordu.
        loadProfile();
        await onbelleklenmisListeler();   // kart ve kütüphane sayıları hemen görünsün
        await aktiviteyiYukle();   // kalici aktivite gecmisini geri getir
        // Veri çekme başarısız olsa da (Steam'e bağlanılamadı, IPC hatası) panel yine de
        // çizilmeli - aksi halde await burada patlayıp aşağıdaki render'lar hiç çalışmıyor
        // ve Genel Bakış bomboş kalıyordu.
        try {
          const con = await E.connect();
          if (con && con.ok){
            if (window.imu.settings){
              const s = await window.imu.settings.get();
              if (s) appSettings = { ...appSettings, ...s };
            }
            loadProfile();     // bağlantı kuruldu: taze profili çek, önbelleğin üstüne yaz
            // Listeler diskten gelmiş olsa bile Steam'den bir kez tazelenir; ekrandaki
            // sayılar eskimesin. listelerTaze bunu bir defaya indirir.
            if (!kartLoaded || !listelerTaze){ const r = await E.dropGames(); if (r.ok){ dropGames = r.games; kartLoaded = true; } }
            if (!saatLoaded || !listelerTaze){ const r2 = await E.ownedGames(); if (r2.ok){ ownedGames = r2.games; saatLoaded = true; } }
            listelerTaze = true;
            // Kart Düşür ekranda açıksa taze listeyle yeniden çizilsin (gizliyse dokunma:
            // görünmeyen sekmenin listesi bilerek bellekte tutulmuyor).
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

    // Steam bize tek tek "kart düştü" olayı vermiyor; oturum boyunca kalan-kart toplamını periyodik
    // ölçüp baştaki değerle farkını alarak dürüst bir "düşen kart" sayısı hesaplıyoruz (uydurma değil).
    let farmBaselineCards = null, farmDroppedCount = 0, farmSessionStart = null, farmPollTimer = null, farmLifeDropped = 0;
    let prevRemain = new Map();   // appid -> kalan kart (oyun bazında düşüş farkı için)
    function farmSessionBegin(){
      farmBaselineCards = dropGames.reduce((s,g)=>s+g.remaining,0);
      farmDroppedCount = 0; farmSessionStart = Date.now(); farmLifeDropped = 0;
      prevRemain = new Map(dropGames.map(g=>[g.appid, g.remaining]));
      window.imu.stats.add({ sessions: 1 });
      if (farmPollTimer) clearInterval(farmPollTimer);
      farmPollTimer = setInterval(async ()=>{
        if (!lastTick || !lastTick.running) return;
        const r = await E.dropGames().catch(()=>null);
        let cardDelta = 0;
        if (r && r.ok){
          // Hangi oyunda kaç kart düştüğünü kalan-kart farkından çıkar (Steam tek tek olay vermiyor).
          r.games.forEach(g=>{
            const before = prevRemain.get(g.appid);
            if (before != null && g.remaining < before){
              const n = before - g.remaining;
              if (typeof pushDrop === 'function') pushDrop(g.appid, g.name, n);
              if (appSettings && appSettings.notifyCardDrop) notify('farm', tf('# kart düştü', n), g.name);
            }
          });
          dropGames = r.games;
          prevRemain = new Map(dropGames.map(g=>[g.appid, g.remaining]));
          const now = dropGames.reduce((s,g)=>s+g.remaining,0);
          farmDroppedCount = Math.max(0, farmBaselineCards - now);
          cardDelta = Math.max(0, farmDroppedCount - farmLifeDropped);
          farmLifeDropped = farmDroppedCount;
          if (cardDelta > 0) pushFeed('kart', tf('# kart düştü', cardDelta), tf('Toplam # kart · bu oturum', farmDroppedCount), 'Başarılı');
          if (kartLoaded && typeof renderKart === 'function') renderKart();
          renderGenelStats(); renderGenelActive();
          // "Otomatik Pazarda Satış": kart düştüyse o oyunun yeni kartlarını listele
          if (cardDelta > 0 && appSettings && appSettings.farmAutoSell && typeof autoSellDropped === 'function'){
            const cur = dropGames.find(g=>g.appid === lastTick.currentAppid);
            autoSellDropped(cur && cur.name);
          }
        }
        // "Başarım Kilitlerini Aç": farm sürerken oynanan oyunun kilitli başarımlarını
        // aralıklı olarak açar (Ayarlar > Başarımlar'daki güvenli mod aralığına uyar).
        if (appSettings && appSettings.farmAchUnlock) await farmUnlockOne();
        // kalıcı: her poll'de geçen 60sn + o aralıkta düşen kart farkı
        addLifeStats({ totalRuntimeMs: 60000, cardsDropped: cardDelta });
      }, 60000);
    }
    function farmSessionEnd(){ if (farmPollTimer){ clearInterval(farmPollTimer); farmPollTimer = null; } }

    // "Başarım Kilitlerini Aç" - oynanan oyunun kilitli başarımlarından BİRİNİ açar.
    // Aralık, Ayarlar > Başarımlar > "Açılış aralığı"ndan gelir; güvenli mod kapalıysa bile
    // burada tek tek ve aralıklı gidilir (toplu açmak profilde şüpheli görünür).
    let lastAchUnlockTs = 0;
    async function farmUnlockOne(){
      const appid = lastTick && lastTick.currentAppid;
      if (!appid) return;
      const gapMs = Math.max(5, +((appSettings||{}).achDelay) || 5) * 1000;
      if (Date.now() - lastAchUnlockTs < gapMs) return;
      const res = await E.achievements(appid).catch(()=>null);
      if (!res || !res.ok || !res.data) return;
      const locked = res.data.achievements.filter(a=>!a.achieved);
      if (!locked.length) return;
      // "Açılışları zamana yay" açıksa rastgele biri, değilse ilki
      const pick = (appSettings && appSettings.achSpread)
        ? locked[Math.floor(Math.random()*locked.length)] : locked[0];
      const r = await E.setAchievements(appid, [{ apiName: pick.apiName, unlock: true }]).catch(()=>null);
      if (r && r.ok){
        lastAchUnlockTs = Date.now();
        if (typeof acCache !== 'undefined') acCache.delete(appid);
        notify('ach', 'Başarım açıldı', pick.name);
        pushFeed('kart', 'Başarım açıldı', pick.name, 'Başarılı');
      }
    }

    // "Aktif Görev" paneli.
    // Oyun kapsülünün yanında iki tür etiketi ("Aksiyon", "Çok Oyunculu") gösterilir; Steam'in
    // GetOwnedGames yanıtı tür bilgisi vermediği için oraya uydurma tür değil, gerçek çalışma
    // bilgisi (mod + eşzamanlı oyun sayısı) yazılıyor.
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

    // MADDE 16: Panel eskiden TEK gorev varsayiyordu - kart calisiyorsa saat gorunmuyor,
    // basarim toplu islemi hic gorunmuyordu ve "Detay" her zaman Kart sekmesine gidiyordu.
    // Artik calisan her is kendi satirinda, kendi ilerlemesi ve kendi Detay baglantisiyla.
    // Panelin gorunur olcusu 1.1.10'da buyutuldu: kapak 85x40 -> 116x54, baslik 14 -> 15,
    // sayilar 13 -> 15, cubuk 6 -> 8 piksel. 2K bir ekranda satir kucuk kaliyordu ve
    // ustelik satirin kendi "Detay" dugmesi, panelin altindaki Detay ile ayni isi yapan
    // IKINCI bir dugmeydi. Satirdaki kaldirildi; alttaki zaten gosterilen gorevi izliyor.
    //
    // Eklenenler yalnizca GOSTERIM: yuzde sayisi, oturumun baslama saati. Hicbiri yeni
    // veri cekmiyor, hepsi zaten panele gelen tick'in icinde.
    function gorevSatiri(g){
      const yuzde = Math.max(0, Math.min(100, Math.round(g.yuzde || 0)));
      return '<div style="display:flex;flex-direction:column;gap:11px;padding:14px 0 4px;border-top:1px solid #101621">'
        + '<div style="display:flex;align-items:flex-start;gap:14px">'
          // Kutuphane basligi orani (920x430, ~2.14:1)
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
            + 'min-width:38px;text-align:right;color:' + (g.renk || '#24AEB3') + '">%' + yuzde + '</span>'
        + '</div>'
        + (g.basladi
            ? ('<span style="font-family:Geist Mono,monospace;font-size:10px;color:#656D80">' + esc(t('Başlangıç:')) + ' '
               + fmtClock(g.basladi) + '</span>')
            : '')
        + '</div>';
    }

    // Panelde o an gosterilen gorev. Alttaki Baslat / Durdur / Detay bu secime gore is yapar;
    // eskiden ucu de sabit Kart Dusur'e bagliydi ve saat yukseltici calisirken Detay yanlis
    // sayfayi aciyordu.
    let gorevListesi = [], gorevIndeks = 0;
    const kisalt = (s, n)=>{ s = String(s||''); return s.length > n ? (s.slice(0, n-1)+'…') : s; };
    // Ilgili sayfanin kendi dugmesine basar: dogrulamasi, toast'i ve istatistik yazmasi
    // orada duruyor, burada kopyalamak iki yerde bakim demek olurdu.
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
      // basarim.js ile ayni genel kapsamda; toplu islem calisiyorsa burada da gorunsun
      const achOn = (typeof acRunning !== 'undefined') && acRunning;
      // G12: Gercekci Mod da bir is - eskiden hic izlenmiyordu. Tek basina calisirken
      // panel "calisan islem yok" diyor, Baslat da kart dusurmeyi baslatiyordu.
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
                    ['Oturum Süresi', monoTime(fmtSessionDur(Date.now()-(farmSessionStart||Date.now())))],
                    ['Sonraki Düşüş', monoTime(nextDrop)]],
          yuzde: lastTick.durationMs ? (lastTick.elapsedMs/lastTick.durationMs*100) : 100,
          basladi: farmSessionStart || null,
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

      // Birden fazla is varsa hepsini alt alta yigmak yerine tek tek gosterilir; ‹ › ile
      // gezilir. Panelin yuksekligi sabit, uc is birden aktifken alttaki kuyruk eziliyordu.
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

    // ‹ 2 / 3 › seridi. Ortadaki metin o an hangi ise bakildigini soyler.
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

    // ---- GOSTERILEN GOREVIN DETAY ALANI ----
    // Bu kutu 1.1.8'e kadar SABIT olarak kart dusurme kuyruguydu. Panelde ‹ › ile baska
    // bir ise gecince ustteki satir degisiyor, alttaki kuyruk oldugu gibi kaliyordu; kart
    // kuyrugu bossa da basarim isine bakarken ekranda "Kuyruk bos" yaziyordu. Artik alan
    // gosterilen isin kendi ayrintisini cizer.
    const DETAY_SATIR = 'display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid #101621';
    const DETAY_MONO = 'font-family:Geist Mono,monospace;font-size:11px';
    const detayBos = (metin) => '<div style="padding:12px 0;font-size:11px;color:#656D80">' + metin + '</div>';

    // Ince ilerleme cubugu. Yuzde her is turunde farkli hesaplaniyor, cizim ortak.
    function detayCubuk(yuzde, renk){
      const y = Math.max(0, Math.min(100, Math.round(yuzde || 0)));
      return '<div style="height:4px;border-radius:999px;background:#101621;overflow:hidden;width:64px;flex-shrink:0">'
        + '<div style="height:100%;width:' + y + '%;background:' + (renk || GC.sub) + '"></div></div>';
    }

    // Satir basi isaretleri once ▸ ★ ◷ gibi Unicode karakterlerdi. Yazi tipine gore boylari
    // ve taban cizgileri tutmuyordu: uc satirda uc farkli buyuklukte, kucuk ve ne oldugu
    // anlasilmayan sekiller cikiyordu. Hepsi ayni 16 pikselik cerceveye oturan, ayni cizgi
    // kalinligindaki SVG'lere cevrildi.
    const DETAY_IKON = {
      // ok: siradaki / gonderilen
      sonraki: '<path d="M5 12h13M13 7l5 5-5 5"></path>',
      // hedef: sayac (acilan, islenen)
      sayac: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>',
      // saat: kalan sure
      sure: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4.5l3 1.8"></path>',
    };
    function detayIkon(ad, renk){
      const yol = DETAY_IKON[ad];
      if (!yol) return '';
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + (renk || GC.muted)
        + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="display:block">'
        + yol + '</svg>';
    }

    // `sira` ya bir sira numarasi metnidir (#1, #2) ya da DETAY_IKON anahtaridir.
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

    // Kart dusurme: kuyruk (#sira · ad · kalan kart · yuzde)
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

    // Saat yukseltici: acik oyunlar. Esitleme calisiyorsa cubuklar saat.js'in ORTAK ZAMAN
    // CIZELGESI olcutunu kullanir (kalan / isin toplami), yoksa oturumun kendi yuzdesi.
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

    // Gercekci Mod: acilan / kalan basarim ve siradakine kalan sure.
    function detayGercekci(){
      if (typeof grDurum === 'undefined' || !grDurum) return detayBos('Gerçekçi Mod çalışmıyor.');
      const acilan = grDurum.acilan || 0, toplam = grDurum.toplam || 0;
      const kalanAd = grDurum.siradaki || '-';
      // siradakiZaman mutlak zaman damgasi, geri sayima cevriliyor.
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

    // Basarim islemi: o an gonderilen basarim ve secili araliga gore kalan tahmini.
    function detayBasarim(){
      const yap = (typeof acRunYapilan !== 'undefined') ? acRunYapilan : 0;
      const top = (typeof acRunToplam !== 'undefined') ? acRunToplam : 0;
      const not = (typeof acRunNot !== 'undefined' && acRunNot) ? acRunNot : '-';
      // Kalan sure = kalan basarim x secili aralik. Gercek bekleme her turda rastgele
      // sapiyor (bkz. acNextDelayMs), yani bu bir tahmin; ortalama dogru.
      let kalanSure = '-';
      if (typeof acBaseDelaySec === 'function' && top > yap){
        kalanSure = monoTime(fmtSessionDur((top - yap) * acBaseDelaySec() * 1000));
      }
      return detaySatiri('sonraki', 'Gönderiliyor', kisalt(not.replace(/^gönderiliyor:\s*/i, ''), 22), null, null, true)
        + detaySatiri('sayac', 'İşlenen', yap + ' / ' + top, top ? (yap/top*100) : 0, GC.ok, true)
        + detaySatiri('sure', 'Tahmini kalan', kalanSure, null, null, true);
    }

    // Gosterilen gorevin detayini cizer. Hicbir is calismiyorsa kart kuyrugu gosterilir:
    // panelin altindaki Baslat da kart dusurmeyi baslatiyor, yani ekranda tutarli.
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

    E.onTick((data)=>{ if (data.running && farmBaselineCards===null) farmSessionBegin(); if (!data.running) farmSessionEnd(); renderGenelActive(); renderGenelStats(); });
    E.onBoostTick(()=>{ renderGenelActive(); renderGenelStats(); });
    E.onSaatFarmTick(()=>{ renderGenelActive(); renderGenelStats(); });
    // gercekci.js kendi dinleyicisini ONCE kaydeder (dosya sirasi), yani buraya gelindiginde
    // grDurum guncellenmis olur. Aksi halde panel bir tik geride kalirdi.
    if (window.imu.gercekci && window.imu.gercekci.onTick){
      window.imu.gercekci.onTick(()=>{ renderGenelActive(); renderGenelStats(); });
    }

    // Hızlı işlem toast'ı - tıklandığı an geri bildirim versin, sonucu bekletmesin.
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

    // Kart Düşür'ün gerçek motoruna, oradaki seçili mod ve süreyle bağlanır.
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

    // Panel altindaki uc dugme, o an gosterilen goreve gore davranir. Calisan bir is
    // gosteriliyorken Baslat'in anlami yok (zaten calisiyor), Durdur o isi durdurur;
    // hicbir is yokken Durdur'un anlami yok, Baslat kart dusurmeyi baslatir.
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
      if (gorevListesi[gorevIndeks]) return;    // gosterilen is zaten calisiyor
      kartiBaslat();
    };
    document.getElementById('gStop').onclick = ()=>{
      const g = gorevListesi[gorevIndeks];
      if (!g) return;
      if (typeof g.durdur === 'function') g.durdur();
    };

    // Hizli islem butonlari. HEPSI try/catch icinde: bir hata firlarsa toast'i kapatip
    // sebebi gostermek zorundayiz, yoksa spinner sonsuza kadar doner ve kullanici
    // "yenileniyor" yazisina bakip bekler.
    function hizliIslem(btnId, calisanMetin, isFn){
      const b = document.getElementById(btnId);
      if (!b) return;
      let mesgul = false;
      b.onclick = async ()=>{
        if (mesgul) return;                 // cift tiklamada iki istek gitmesin
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
      // loadEnv hata durumunda sessizce donuyor; gercekten veri geldi mi kontrol et,
      // yoksa "yenilendi" deyip kullaniciyi yaniltiyorduk.
      if (!invMerged || !invMerged.length) return { hata: 'Envanter alınamadı. Envanter sekmesindeki hatayı kontrol et.' };
      renderGenelStats();
      pushFeed('envanter', 'Envanter', 'Envanter Steam\'den yeniden çekildi.', 'Başarılı');
      return { mesaj: tf('# çeşit öğe yüklendi.', invMerged.length) };
    });

    // "Pazarı Yenile" - envanteri degil, market FIYATLARINI tazeler (onbellegi atlar).
    hizliIslem('qaPazar', 'Pazar fiyatları yenileniyor…', async ()=>{
      if (!invMerged || !invMerged.length) return { hata: 'Önce envanteri yükle.' };
      if (typeof fetchPricesForView !== 'function') return { hata: 'Envanter sayfası hazır değil.' };
      await window.imu.settings.clearPriceCache();
      if (typeof priceMap !== 'undefined') priceMap.clear();
      // Eskiden burada tanimsiz bir requestPrices() cagriliyordu.
      await fetchPricesForView();
      renderGenelStats();
      pushFeed('pazar', 'Pazar', 'Market fiyatları yeniden çekiliyor.', 'Çalışıyor');
      return { mesaj: 'Fiyatlar çekiliyor, Envanter sekmesinden ilerlemeyi görebilirsin.' };
    });
    document.getElementById('qaSettings').onclick = ()=> openAyarlar();

    // Genel Bakış açılışta zaten görünür sekme - tıklama olmadan ilk verileri yükle.
    loadGenel();
    // Dil değişimi sayfayı yeniledi: kullanıcıyı bıraktığı Ayarlar bölümüne geri götür (i18n.js).
    try {
      const donus = sessionStorage.getItem(I18N_DONUS_ANAHTARI);
      if (donus) { sessionStorage.removeItem(I18N_DONUS_ANAHTARI); openAyarlar(donus); }
    } catch (_) {}
