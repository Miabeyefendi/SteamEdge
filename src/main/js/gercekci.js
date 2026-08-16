    // ================= GERÇEKÇİ MOD =================
    // Tek oyun açık tutulur; seçilen süre boyunca başarımlar GENELDEN NADİRE doğru,
    // rastgele aralıklarla açılır. Amaç: oyunu gerçekten oynamış gibi bir iz bırakmak.
    // Motor tarafı main.js > "GERCEKCI MOD" bölümünde.
    let grGames = [], grLoaded = false, grAppid = null, grPickedName = '';
    let grPlan = null, grDurum = { calisiyor: false };
    let grTimerUI = null;
    const grAcilanlar = [];   // {name, rarityPct, ts} - bu oturumda açılanlar

    const GRC = { brand:'#5624B3', ok:'#5FB324', warn:'#B37E24', bad:'#B32453',
                  title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345', sub:'#C2AAEE' };

    async function loadGercekci(){
      if (grLoaded){ grRenderListe(); return; }
      const input = document.getElementById('grGameInput');
      input.placeholder = 'Steam\'e bağlanılıyor...';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ input.placeholder = 'Bağlanılamadı: ' + con.error; return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'kütüphane hatası' }));
      if (!res.ok){ input.placeholder = 'Kütüphane alınamadı'; return; }
      // Yalnızca başarım tutan oyunlar - diğerlerinde yapacak iş yok
      grGames = (res.games || []).filter(g=>g.hasStats);
      grLoaded = true;
      input.placeholder = grGames.length + ' oyun · ara veya seç...';
      grRenderListe();
    }

    // ---- oyun seçici ----
    const grInput = document.getElementById('grGameInput');
    const grList = document.getElementById('grGameList');
    function grRenderGameList(){
      const q = grInput.value.trim().toLowerCase();
      const match = (!q || q === grPickedName.toLowerCase())
        ? grGames
        : grGames.filter(g=>g.name.toLowerCase().includes(q));
      if (!grGames.length){
        grList.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#656D80">Kütüphane yükleniyor…</div>';
        return;
      }
      if (!match.length){
        grList.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#656D80">Eşleşen oyun yok</div>';
        return;
      }
      grList.innerHTML = match.slice(0,200).map(g=>{
        const on = g.appid === grAppid;
        return '<div class="h-s3" data-grid="'+g.appid+'" style="display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:12px;cursor:pointer;background:'+(on?'#151C28':'transparent')+'">'
          + '<div style="width:54px;height:25px;flex-shrink:0;border-radius:6px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<span style="flex:1;min-width:0;font-size:12px;font-weight:600;color:'+(on?GRC.title:'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E;flex-shrink:0">'+((g.playtimeForever||0)/60).toFixed(0)+' sa</span>'
          + '</div>';
      }).join('');
    }
    grInput.addEventListener('focus', ()=>{ grInput.select(); grList.style.display='block'; grRenderGameList(); });
    grInput.addEventListener('input', ()=>{ grList.style.display='block'; grRenderGameList(); });
    grInput.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){ grList.style.display='none'; grInput.blur(); }
      else if (e.key === 'Enter'){ const f = grList.querySelector('[data-grid]'); if (f) f.click(); }
    });
    grList.addEventListener('click', (e)=>{
      const row = e.target.closest('[data-grid]'); if (!row) return;
      grAppid = +row.getAttribute('data-grid');
      const g = grGames.find(x=>x.appid===grAppid);
      grPickedName = g ? g.name : '';
      grInput.value = grPickedName;
      grList.style.display = 'none';
      grPlanCek();
    });
    document.addEventListener('click', (e)=>{ if (!e.target.closest('#grGameInput') && !e.target.closest('#grGameList')) grList.style.display='none'; });

    // ---- süre ----
    const grSaatInput = document.getElementById('grSaat');
    function grSaat(){ return Math.max(1, Math.min(500, +grSaatInput.value || 1)); }
    grSaatInput.addEventListener('change', ()=>{ grSaatInput.value = grSaat(); grPlanCek(); });
    document.querySelectorAll('#grPresets button[data-h]').forEach(b=>{
      b.addEventListener('click', ()=>{ grSaatInput.value = b.getAttribute('data-h'); grPlanCek(); });
    });

    // ---- plan önizlemesi ----
    async function grPlanCek(){
      const kutu = document.getElementById('grOzet');
      if (!grAppid){ kutu.innerHTML = '<span style="font-size:12px;color:#8B8F9E">Önce bir oyun seç.</span>'; return; }
      kutu.innerHTML = '<span style="font-size:12px;color:#8B8F9E">Başarım şeması okunuyor…</span>';
      const p = await window.imu.gercekci.plan(grAppid, grSaat()).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!p || !p.ok){
        grPlan = null;
        kutu.innerHTML = '<span style="font-size:12px;color:'+GRC.bad+'">'+esc((p&&p.error)||'Plan alınamadı')+'</span>';
        grRenderListe();
        return;
      }
      grPlan = p;
      const ortalama = p.ortalamaAralikMs ? grSureKisa(p.ortalamaAralikMs) : '-';
      kutu.innerHTML =
          grOzetSatir('Açılacak başarım', p.toplam, p.toplam ? GRC.ok : GRC.warn)
        + grOzetSatir('Ortalama aralık', ortalama)
        + (p.korumali ? grOzetSatir('Atlanacak (korumalı)', p.korumali, GRC.warn) : '')
        + (p.toplam === 0
            ? '<span style="font-size:11px;color:'+GRC.warn+';line-height:1.5">Bu oyunda açılabilecek kilitli başarım yok.</span>'
            : '');
      grRenderListe();
    }
    function grOzetSatir(etiket, deger, renk){
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">'
        + '<span style="font-size:11.5px;color:#8B8F9E">'+esc(etiket)+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:13px;font-weight:700;color:'+(renk||GRC.title)+'">'+esc(String(deger))+'</span>'
        + '</div>';
    }
    function grSureKisa(ms){
      const sn = Math.round(ms/1000);
      if (sn < 90) return sn + ' sn';
      const dk = Math.round(sn/60);
      if (dk < 90) return dk + ' dk';
      return (dk/60).toFixed(1) + ' sa';
    }

    // ---- açılma sırası listesi ----
    function grRenderListe(){
      const el = document.getElementById('grListe');
      const sayac = document.getElementById('grSayac');
      if (!el) return;
      if (grAcilanlar.length){
        // Çalışırken: bu oturumda açılanlar en yeni üstte
        sayac.textContent = grDurum.acilan + ' / ' + (grDurum.toplam || 0);
        el.innerHTML = grAcilanlar.slice().reverse().map((a,i)=>grListeSatir(a, grAcilanlar.length-i, true)).join('');
        return;
      }
      if (!grPlan || !grPlan.toplam){
        sayac.textContent = '0 / 0';
        el.innerHTML = '<div style="padding:40px 0;text-align:center;font-size:12px;color:#656D80">'
          + (grAppid ? 'Açılacak başarım yok.' : 'Soldan bir oyun seç, açılma sırası burada görünecek.') + '</div>';
        return;
      }
      sayac.textContent = '0 / ' + grPlan.toplam;
      const bas = (grPlan.ilkler||[]).map((a,i)=>grListeSatir(a, i+1, false)).join('');
      const son = (grPlan.sonlar||[]).map((a,i)=>grListeSatir(a, grPlan.toplam-(grPlan.sonlar.length-1)+i, false)).join('');
      const ara = grPlan.toplam > (grPlan.ilkler.length + grPlan.sonlar.length)
        ? '<div style="padding:10px 0;text-align:center;font-size:11px;color:#656D80">'
          + '· ' + (grPlan.toplam - grPlan.ilkler.length - grPlan.sonlar.length) + ' başarım daha ·</div>'
        : '';
      el.innerHTML = bas + ara + son;
    }
    function grListeSatir(a, sira, acildi){
      const pct = Number.isFinite(a.rarityPct) ? ('%'+a.rarityPct.toFixed(1)) : '?';
      const renk = !Number.isFinite(a.rarityPct) ? GRC.off
                 : a.rarityPct < 5 ? GRC.bad
                 : a.rarityPct < 10 ? GRC.sub
                 : a.rarityPct < 25 ? '#24AEB3' : GRC.muted;
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #101621">'
        + '<span style="font-family:Geist Mono,monospace;font-size:11px;color:#656D80;width:32px;flex-shrink:0">#'+sira+'</span>'
        + '<span style="flex:1;min-width:0;font-size:12.5px;font-weight:600;color:'+(acildi?GRC.ok:GRC.title)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name||'')+'</span>'
        + (acildi ? '<span style="font-size:10px;font-weight:700;color:'+GRC.ok+';flex-shrink:0">AÇILDI</span>' : '')
        + '<span style="font-family:Geist Mono,monospace;font-size:11px;font-weight:700;color:'+renk+';width:52px;text-align:right;flex-shrink:0">'+pct+'</span>'
        + '</div>';
    }

    // ---- başlat / durdur ----
    document.getElementById('grStart').onclick = async ()=>{
      if (!grAppid){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Önce bir oyun seç.'); return; }
      if (!grPlan || !grPlan.ok || !grPlan.toplam){
        if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Bu oyunda açılabilecek kilitli başarım yok.');
        return;
      }
      const p = grPlan;
      const ilkler = (p.ilkler||[]).map(a=>'  · '+a.name+(Number.isFinite(a.rarityPct)?(' (%'+a.rarityPct.toFixed(1)+')'):'')).join('\n');
      const ok = await edgeConfirm({
        tag:'Gerçekçi Mod',
        title: p.toplam + ' başarım ' + grSaat() + ' saate yayılacak',
        body: esc(grPickedName) + ' açık tutulacak ve başarımlar genelden nadire doğru açılacak.\n\n'
              + 'Ortalama aralık: ' + grSureKisa(p.ortalamaAralikMs) + ' (her seferinde rastgele sapmalı)\n\n'
              + 'İlk açılacaklar:\n' + ilkler
              + (p.korumali ? ('\n\n' + p.korumali + ' başarım oyun tarafından korunduğu için atlanacak.') : ''),
        warn: 'Bu işlem Steam hesabını kalıcı olarak değiştirir. Süre boyunca uygulama açık kalmalı; istediğin an durdurabilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.gercekci.start(grAppid, grSaat()).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Başlatılamadı',
                      body:(r&&r.error)||'Bilinmeyen hata.', confirmText:'Tamam', cancelText:'Kapat' });
        return;
      }
      grAcilanlar.length = 0;
      notify('boost', 'Gerçekçi Mod Başladı', grPickedName + ' · ' + r.toplam + ' başarım');
      pushFeed('saat', 'Gerçekçi Mod', grPickedName + ' · ' + r.toplam + ' başarım ' + grSaat() + ' saate yayıldı.', 'Çalışıyor');
    };
    document.getElementById('grStop').onclick = ()=>{
      if (!grDurum.calisiyor) return;
      window.imu.gercekci.stop();
      pushFeed('saat', 'Gerçekçi Mod', 'Durduruldu.', 'Durdu');
    };

    // ---- motordan gelen durum ----
    if (window.imu.gercekci && window.imu.gercekci.onTick){
      window.imu.gercekci.onTick((d)=>{
        grDurum = d || { calisiyor:false };
        const bar = document.getElementById('grBar');
        if (grTimerUI){ clearInterval(grTimerUI); grTimerUI = null; }

        if (!d || !d.calisiyor){
          if (bar) bar.style.display = 'none';
          document.getElementById('grKalan').innerHTML = monoHMS(0);
          if (d && d.bitti){
            notify('boost', 'Gerçekçi Mod Bitti', d.acilan + ' / ' + d.toplam + ' başarım açıldı');
            pushFeed(d.hata?'hata':'kart', 'Gerçekçi Mod',
                     (d.sebep||'bitti') + ' · ' + d.acilan + ' / ' + d.toplam + ' başarım', d.hata?'Hata':'Başarılı');
          }
          grRenderListe();
          return;
        }

        if (bar) bar.style.display = 'flex';
        const yenile = ()=>{
          const kalan = Math.max(0, Math.floor((d.bitis - Date.now())/1000));
          document.getElementById('grKalan').innerHTML = monoHMS(kalan);
          const eta = document.getElementById('grBarEta');
          if (eta){
            const sn = d.siradakiZaman ? Math.max(0, Math.round((d.siradakiZaman - Date.now())/1000)) : 0;
            eta.textContent = d.basarimlarBitti ? 'bitti' : (sn > 0 ? (sn + ' sn') : 'şimdi');
          }
        };
        yenile();
        grTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) yenile(); }, 1000);

        const yuzde = d.toplam ? Math.round(d.acilan/d.toplam*100) : 0;
        const txt = document.getElementById('grBarText');
        if (txt) txt.innerHTML =
            '<span style="font-size:12px;font-weight:600;color:#DCE2FA">'+esc(d.oyunAdi||'')+'</span>'
          + '<span style="font-size:11px;color:#8B8F9E"><b style="color:'+GRC.ok+'">'+d.acilan+'</b> / '+d.toplam+' başarım açıldı'
          + (d.hata ? (' · <b style="color:'+GRC.bad+'">'+d.hata+' hata</b>') : '')
          + (d.siradaki && !d.basarimlarBitti ? (' · sıradaki: '+esc(d.siradaki)) : '')
          + '</span>';
        const fill = document.getElementById('grBarFill');
        if (fill) fill.style.width = yuzde + '%';
        grRenderListe();
      });
    }
    if (window.imu.gercekci && window.imu.gercekci.onAcildi){
      window.imu.gercekci.onAcildi((a)=>{
        grAcilanlar.push({ name:a.name, rarityPct:a.rarityPct, ts:Date.now() });
        pushFeed('kart', 'Başarım açıldı', a.name, 'Başarılı');
        grRenderListe();
      });
    }
