    // ================= GERÇEKÇİ MOD =================
    // Sayfa şablondan birebir alındı; buradaki iş bu tasarımı gerçek veriye bağlamak.
    // Oyunlar kuyruğa alınır, seçilen süre boyunca başarımlar GENELDEN NADİRE doğru açılır.
    // Motor tarafı main.js > "GERCEKCI MOD" bölümünde.
    //
    // Hesaplar (sağ paneldeki "Oyun Verisi · HLTB" kutusu):
    //   Tc  : oyunun %100 süresi. Elle girilebilir; girilmezse mevcut süre x tür çarpanı (CR)
    //         ile tahmin edilir. Bu bir TAHMİN, dış servise sorulmaz - HLTB verisini
    //         uydurmuyoruz, kullanıcının girdiği ya da kendi kütüphanesinden çıkan sayıyı
    //         kullanıyoruz.
    //   A(t): şu ana kadar beklenen açılmış başarım sayısı = toplam x (t / Tc), zorlukla
    //         düzeltilir. Gerçek açılmış sayı bunun altındaysa "geride kalınmış" demektir.
    //   Hız : A(t) / t (saat başına başarım).
    let grGames = [], grLoaded = false;
    let grQueue = [];               // [{appid, name, playtimeMin, hasStats}] - seçili oyunlar
    let grPlan = null;              // aktif oyunun plan önizlemesi
    let grDurum = { calisiyor: false };
    let grTimerUI = null;
    let grAcilanlar = [];           // {name, rarityPct, ts} - bu oturumda açılanlar
    let grPresets = [];
    let grPlanIstek = 0;            // yarış koşullarını engellemek için istek sayacı

    const GRC = { brand:'#5624B3', ok:'#5FB324', warn:'#B37E24', bad:'#B32453',
                  title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345', sub:'#C2AAEE',
                  teal:'#24AEB3' };

    const grEl = (id) => document.getElementById(id);
    const grSet = (id, t) => { const e = grEl(id); if (e) e.textContent = t; };

    // ---- ayar okuma/yazma ----
    function grVal(anahtar, varsayilan){
      const v = (typeof appSettings === 'object' && appSettings) ? appSettings[anahtar] : undefined;
      return v === undefined ? varsayilan : v;
    }
    async function grKaydet(patch){
      if (!window.imu.settings) return;
      const s = await window.imu.settings.set(patch).catch(()=>null);
      if (s) appSettings = s;
    }

    // ---- süre ----
    function grSureMs(){
      const h = Math.max(0, Math.min(999, +grEl('grRH').value || 0));
      const m = Math.max(0, Math.min(59, +grEl('grRM').value || 0));
      const s = Math.max(0, Math.min(59, +grEl('grRS').value || 0));
      return Math.max(60000, ((h * 3600) + (m * 60) + s) * 1000);
    }
    function grSureYaz(ms){
      const t = Math.max(60, Math.round(ms / 1000));
      const iki = (n) => String(n).padStart(2, '0');
      grEl('grRH').value = iki(Math.floor(t / 3600));
      grEl('grRM').value = iki(Math.floor((t % 3600) / 60));
      grEl('grRS').value = iki(t % 60);
    }
    function grSureEtiket(ms){
      const sn = Math.round(ms / 1000);
      if (sn < 60) return sn + ' sn';
      const dk = Math.round(sn / 60);
      if (dk < 60) return dk + ' dk';
      const sa = Math.floor(dk / 60), kalanDk = dk % 60;
      return kalanDk ? (sa + ' sa ' + kalanDk + ' dk') : (sa + ' sa');
    }
    function grAralikEtiket(ms){
      if (!ms) return '-';
      const sn = Math.round(ms / 1000);
      if (sn < 90) return sn + ' sn';
      const dk = Math.round(sn / 60);
      if (dk < 90) return dk + ' dk';
      return (dk / 60).toFixed(1) + ' sa';
    }
    // Oturum başlangıcına göre ms -> "+1sa 12dk" biçimi (Açılma Sırası tablosundaki zaman)
    function grZamanEtiket(ms){
      const sn = Math.round((ms || 0) / 1000);
      const sa = Math.floor(sn / 3600), dk = Math.floor((sn % 3600) / 60);
      if (sa) return '+' + sa + 'sa ' + String(dk).padStart(2, '0') + 'dk';
      const s = sn % 60;
      return '+' + dk + 'dk ' + String(s).padStart(2, '0') + 'sn';
    }

    // ---- nadirlik rengi ----
    function grPctRenk(pct){
      if (!Number.isFinite(pct)) return GRC.off;
      if (pct < 5) return GRC.bad;
      if (pct < 10) return GRC.sub;
      if (pct < 25) return GRC.teal;
      return GRC.muted;
    }
    function grNadirEtiket(pct){
      if (!Number.isFinite(pct)) return 'Bilinmiyor';
      if (pct < 5) return 'Ultra nadir';
      if (pct < 10) return 'Nadir';
      if (pct < 25) return 'Az bulunur';
      if (pct < 50) return 'Yaygın';
      return 'Çok yaygın';
    }

    // ---- yükleme ----
    async function loadGercekci(){
      grToggleBoya();
      grSelectBoya();
      if (!grLoaded){
        grSureYaz((+grVal('grDurationSec', 7200)) * 1000);
        grEl('grTarget').value = String(+grVal('grTarget', 0) || 0);
        grEl('grTc').value = grVal('grTc', '') || '';
      }
      grSeviyeBoya();
      grPresets = (grVal('grPresets', []) || []).slice();
      grPresetBoya();
      if (grLoaded){ grKutuphaneBoya(); grHesapBoya(); return; }
      grEl('grSearch').placeholder = 'Steam\'e bağlanılıyor...';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ grEl('grSearch').placeholder = 'Bağlanılamadı: ' + con.error; return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'kütüphane hatası' }));
      if (!res.ok){ grEl('grSearch').placeholder = 'Kütüphane alınamadı'; return; }
      grGames = (res.games || []).map(g=>({
        appid: g.appid, name: g.name, playtimeMin: g.playtimeForever || 0, hasStats: !!g.hasStats,
      }));
      grLoaded = true;
      grEl('grSearch').placeholder = 'Oyun ara...';
      // Kayıtlı kuyruk: hesap dosyasından gelir, oyun adları kütüphaneden tamamlanır.
      const kayitli = grVal('grQueue', []) || [];
      grQueue = kayitli.map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grKutuphaneBoya();
      if (grQueue.length) grPlanCek();
      else grHesapBoya();
    }

    // ---- kütüphane arama ----
    function grAranabilir(){
      return grVal('grShowNoAch', false) ? grGames : grGames.filter(g=>g.hasStats);
    }
    function grAramaBoya(){
      const q = grEl('grSearch').value.trim().toLowerCase();
      const box = grEl('grResultsBox');
      if (!q){ box.style.display = 'none'; return; }
      const secili = new Set(grQueue.map(g=>g.appid));
      const bulunan = grAranabilir().filter(g=>g.name.toLowerCase().includes(q)).slice(0, 40);
      box.style.display = 'flex';
      grEl('grNoResults').style.display = bulunan.length ? 'none' : 'block';
      grEl('grResults').innerHTML = bulunan.map(g=>{
        const icinde = secili.has(g.appid);
        return '<div class="h-s3" data-gradd="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;cursor:pointer">'
          + '<div style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + (g.playtimeMin/60).toFixed(1)+' sa · '+(g.hasStats?'başarım var':'başarım yok')+'</span>'
          + '</div>'
          + '<button class="h-brand" style="width:24px;height:24px;flex-shrink:0;border-radius:12px;border:1px solid '
          + (icinde?GRC.brand:'#2B3345')+';background:'+(icinde?'#151C28':'#090C12')+';color:'+(icinde?GRC.sub:'#8B8F9E')
          + ';font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">'
          + (icinde?'✓':'+')+'</button>'
          + '</div>';
      }).join('');
    }
    grEl('grSearch').addEventListener('input', grAramaBoya);
    grEl('grSearch').addEventListener('focus', grAramaBoya);
    grEl('grSearch').addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){ grEl('grSearch').value = ''; grEl('grResultsBox').style.display = 'none'; }
      else if (e.key === 'Enter'){ const f = grEl('grResults').querySelector('[data-gradd]'); if (f) f.click(); }
    });
    grEl('grResults').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-gradd]'); if (!row) return;
      const id = +row.getAttribute('data-gradd');
      const g = grGames.find(x=>x.appid===id);
      if (!g) return;
      if (grQueue.some(x=>x.appid===id)) grQueue = grQueue.filter(x=>x.appid!==id);
      else grQueue.push(g);
      grKuyrukKaydet();
      grKutuphaneBoya();
      grAramaBoya();
      grPlanCek();
    });
    document.addEventListener('click', (e)=>{
      if (!e.target.closest('#grSearch') && !e.target.closest('#grResultsBox')) grEl('grResultsBox').style.display = 'none';
    });

    function grKuyrukKaydet(){ grKaydet({ grQueue: grQueue.map(g=>g.appid) }); }

    // ---- seçili oyun listesi ----
    function grKutuphaneBoya(){
      grSet('grLibCount', grQueue.length + ' oyun');
      const el = grEl('grLibrary');
      if (!grQueue.length){
        el.innerHTML = '<div style="padding:30px 10px;text-align:center;font-size:11px;color:#656D80;line-height:1.6">'
          + (grLoaded ? 'Yukarıdan oyun ara ve <b style="color:#8B8F9E">+</b> ile sıraya ekle.' : 'Kütüphane yükleniyor…')
          + '</div>';
        return;
      }
      const aktifId = grDurum.calisiyor ? grDurum.appid : (grQueue[0] && grQueue[0].appid);
      el.innerHTML = grQueue.map(g=>{
        const on = g.appid === aktifId;
        const achEt = g.hasStats ? 'BAŞARIM' : 'SAAT';
        const achFg = g.hasStats ? GRC.sub : GRC.warn;
        return '<div data-grrow="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px solid '
          + (on?GRC.brand:'#1D2432')+';background:'+(on?'#101621':'#0D1118')+';cursor:pointer;margin-bottom:5px" class="h-bd">'
          + '<div style="width:30px;height:30px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:'+(on?GRC.title:'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+(g.playtimeMin/60).toFixed(1)+' sa</span>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:'+achFg
          + ';border:1px solid '+achFg+';border-radius:12px;padding:2px 7px;flex-shrink:0">'+achEt+'</span>'
          + '<button data-grdel="'+g.appid+'" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#0D1118;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" class="h-stop">&#8722;</button>'
          + '</div>';
      }).join('');
    }
    grEl('grLibrary').addEventListener('click', (e)=>{
      const sil = e.target.closest('[data-grdel]');
      if (sil){
        if (grDurum.calisiyor){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Çalışırken sıra değiştirilemez.'); return; }
        const id = +sil.getAttribute('data-grdel');
        grQueue = grQueue.filter(x=>x.appid!==id);
        grKuyrukKaydet(); grKutuphaneBoya(); grPlanCek();
        return;
      }
      const row = e.target.closest('[data-grrow]');
      if (row && !grDurum.calisiyor){
        // Tıklanan oyunu sıranın başına al: önizleme onun planını gösterir.
        const id = +row.getAttribute('data-grrow');
        const i = grQueue.findIndex(x=>x.appid===id);
        if (i > 0){ const [g] = grQueue.splice(i,1); grQueue.unshift(g); grKuyrukKaydet(); grKutuphaneBoya(); grPlanCek(); }
      }
    });

    // ---- seçenekler ----
    function grSecenekler(){
      return {
        hedef: grVal('grTargetAuto', true) ? 0 : Math.max(0, +grEl('grTarget').value || 0),
        model: grVal('grModel', 'linear'),
        rastgeleAralik: !!grVal('grRandomGap', true),
        ultraNadirAtla: !!grVal('grSkipUltraRare', false),
        otoSira: !!grVal('grAuto', true),
        saatiSurdur: !!grVal('grKeepHours', true),
        basarimsizMod: grVal('grNoAchMode', 'hours'),
      };
    }

    // ---- plan önizlemesi ----
    async function grPlanCek(){
      const ilk = grQueue[0];
      if (!ilk){
        grPlan = null;
        grListeBoya(); grHesapBoya();
        return;
      }
      const istek = ++grPlanIstek;
      grSet('grNextName', 'Başarım şeması okunuyor…');
      grSet('grNextMeta', esc(ilk.name));
      const p = await window.imu.gercekci.plan(ilk.appid, grSureMs(), grSecenekler())
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (istek !== grPlanIstek) return;      // daha yeni bir istek var, bunu at
      grPlan = (p && p.ok) ? p : null;
      if (!grPlan){
        grSet('grNextName', '-');
        grSet('grNextMeta', (p && p.error) || 'Plan alınamadı');
      }
      grListeBoya(); grHesapBoya();
    }

    // ---- orta panel ----
    function grListeBoya(){
      const oyun = grQueue[0];
      const calisiyor = !!grDurum.calisiyor;
      const basarimVar = !!(grPlan && grPlan.toplam);
      const basarimsiz = !!(oyun && grPlan && !grPlan.toplam);

      // Üst özet şerit
      grSet('grGameName', calisiyor ? (grDurum.oyunAdi || '-') : (oyun ? oyun.name : '-'));
      const art = grEl('grGameArt');
      const artId = calisiyor ? grDurum.appid : (oyun && oyun.appid);
      art.innerHTML = artId ? gameThumb(artId) : '';
      const acilan = calisiyor ? grDurum.acilan : 0;
      const toplam = calisiyor ? grDurum.toplam : (grPlan ? grPlan.toplam : 0);
      grSet('grOpened', acilan + ' / ' + toplam);
      grSet('grAvgGap', grAralikEtiket(calisiyor ? grDurum.ortalamaAralikMs : (grPlan ? grPlan.ortalamaAralikMs : 0)));
      const yuzde = toplam ? Math.round(acilan / toplam * 100) : 0;
      grSet('grPct', '%' + yuzde);
      grEl('grPctFill').style.width = yuzde + '%';

      // Başarımsız oyun kartları
      grEl('grNoAch').style.display = basarimsiz ? 'flex' : 'none';
      grEl('grNoAchSummary').style.display = basarimsiz ? 'flex' : 'none';
      grEl('grHasAch').style.display = basarimsiz ? 'none' : 'flex';
      if (basarimsiz){
        const mod = grVal('grNoAchMode', 'hours');
        const etiket = mod === 'skip' ? 'Oyunu atla' : mod === 'stop' ? 'Sırayı durdur' : 'Sadece saat topla';
        grSet('grFallbackLabel', etiket);
        grSet('grDurLabel2', grSureEtiket(grSureMs()));
        grSet('grFallbackNote', grPlan && grPlan.uygunToplam === 0 && grPlan.toplamBasarim
          ? ('Bu oyunun ' + grPlan.toplamBasarim + ' başarımının hepsi açık ya da oyun sunucusu tarafından korunuyor. Seçilen davranış: ' + etiket.toLowerCase() + '.')
          : ('Steam bu oyun için başarım şeması vermiyor. Seçilen davranış: ' + etiket.toLowerCase() + '.'));
      }

      // Sırada kartı
      if (basarimVar || calisiyor){
        const sira = calisiyor ? grDurum.siradaki : (grPlan.kuyruk[0] && grPlan.kuyruk[0].name);
        const siraPct = calisiyor ? grDurum.siradakiPct : (grPlan.kuyruk[0] && grPlan.kuyruk[0].rarityPct);
        const rank = calisiyor ? (grDurum.acilan + 1) : 1;
        grSet('grNextName', grDurum.basarimlarBitti ? 'Başarımlar bitti' : (sira || '-'));
        grSet('grNextMeta', grDurum.basarimlarBitti
          ? 'Süre sonuna kadar saat toplanıyor'
          : ('~' + grAralikEtiket(calisiyor ? grDurum.ortalamaAralikMs : grPlan.ortalamaAralikMs) + ' içinde açılacak · #' + rank + ' sırada'));
        const pctEl = grEl('grNextPct');
        pctEl.textContent = Number.isFinite(siraPct) ? ('%' + siraPct.toFixed(1)) : '-';
        pctEl.style.color = grPctRenk(siraPct);
        pctEl.style.borderColor = grPctRenk(siraPct);
      }

      // Açılma sırası tablosu
      grSet('grOpenedCount', acilan + ' / ' + toplam);
      const el = grEl('grList');
      if (!grPlan || !grPlan.kuyruk || !grPlan.kuyruk.length){
        el.innerHTML = '<div style="padding:36px 0;text-align:center;font-size:12px;color:#656D80">'
          + (grQueue.length ? 'Açılacak başarım yok.' : 'Soldan oyun ekle, açılma sırası burada görünecek.') + '</div>';
        return;
      }
      const acilanAdlar = new Set(grAcilanlar.map(a=>a.name));
      let html = '';
      let sonEtiket = null;
      grPlan.kuyruk.forEach((a, i)=>{
        // Nadirlik değişimlerinde ayırıcı: şablondaki "isDivider" satırı.
        const et = grNadirEtiket(a.rarityPct);
        if (et !== sonEtiket){
          sonEtiket = et;
          html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 2px 6px">'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#656D80">'+esc(et)+'</span>'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '</div>';
        }
        const renk = grPctRenk(a.rarityPct);
        const acildi = acilanAdlar.has(a.name);
        html += '<div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #101621">'
          + '<span style="width:26px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:10px;color:#656D80">#'+(i+1)+'</span>'
          + '<div style="width:33px;height:33px;flex-shrink:0;border-radius:11px;border:1px solid '+(acildi?GRC.ok:'#2B3345')+';background:#101621;display:flex;align-items:center;justify-content:center">'
          + '<span style="width:10px;height:10px;background:'+(acildi?GRC.ok:renk)+';transform:rotate(45deg)"></span></div>'
          + '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:'+(acildi?GRC.ok:GRC.title)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name||'')+'</span>'
          + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+renk+';border:1px solid '+renk+';border-radius:12px;padding:2px 8px;flex-shrink:0">'+esc(grNadirEtiket(a.rarityPct))+'</span>'
          + '<span style="width:52px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+renk+';text-align:right">'
          + (Number.isFinite(a.rarityPct) ? ('%'+a.rarityPct.toFixed(1)) : '-')+'</span>'
          + '<span style="width:70px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E;text-align:right">'
          + (acildi ? 'AÇILDI' : grZamanEtiket(a.zaman))+'</span>'
          + '</div>';
      });
      el.innerHTML = html;
    }

    // ---- hedef + HLTB hesapları ----
    function grHesapBoya(){
      const oyun = grQueue[0];
      const sureMs = grSureMs();
      const uygun = grPlan ? grPlan.uygunToplam : 0;
      const oto = !!grVal('grTargetAuto', true);

      grSet('grTargetTotal', String(uygun));
      grSet('grDurLabel', grSureEtiket(sureMs));

      // Zorluk çarpanı: zor başarımlar aynı sürede daha az açılır.
      const diff = parseFloat(grVal('grDiff', '1.2')) || 1.2;
      const crRaw = grVal('grCR', '2.0');
      const playtimeSa = oyun ? (oyun.playtimeMin / 60) : 0;
      const tcElle = parseFloat(grVal('grTc', '')) || 0;
      // Tc: elle girilmişse o; değilse mevcut süre x tür çarpanı, en az 2 saat.
      const cr = crRaw === 'auto' ? 0 : (parseFloat(crRaw) || 2);
      const tc = tcElle > 0 ? tcElle : Math.max(2, playtimeSa * (cr || 2) || (cr || 2) * 5);
      const sureSa = sureMs / 3600000;

      // Otomatik hedef: bu sürede gerçek bir oyuncunun açacağı kadar.
      // pay = süre / (Tc x zorluk); üstten uygun sayısıyla sınırlı.
      const otoHedef = uygun ? Math.max(1, Math.min(uygun, Math.round(uygun * (sureSa / (tc * diff))))) : 0;
      if (oto){
        grEl('grTarget').value = String(otoHedef);
        grEl('grTarget').readOnly = true;
        grEl('grTarget').style.color = GRC.sub;
      } else {
        grEl('grTarget').readOnly = false;
        grEl('grTarget').style.color = GRC.title;
      }
      const hedef = oto ? otoHedef : Math.max(0, Math.min(uygun, +grEl('grTarget').value || 0));
      grSet('grTargetVal', String(hedef || (grPlan ? grPlan.toplam : 0)));

      // OTO düğmesi ve hedef kutusunun kenarı
      const ab = grEl('grAutoTarget');
      ab.style.borderColor = oto ? GRC.brand : '#2B3345';
      ab.style.background = oto ? '#151C28' : '#0D1118';
      ab.style.color = oto ? GRC.sub : GRC.muted;
      grEl('grTargetBox').style.borderColor = oto ? GRC.brand : '#2B3345';

      // Basit paneldeki açıklama
      const crEtiket = { '1.5':'kısa hikaye oyunu', '2.0':'orta uzunlukta', '2.5':'uzun, açık dünya', '4.0':'bitmeyen sandbox', 'auto':'elle girilen süre' };
      const diffEtiket = { '0.8':'kolay', '1.2':'normal', '2.0':'zor', '3.5':'çok zor' };
      grSet('grSimpleNote', oyun
        ? ('Bu ayarlarla ' + (crEtiket[crRaw]||'-') + ' ve ' + (diffEtiket[String(grVal('grDiff','1.2'))]||'-')
           + ' kabul edildi; ' + grSureEtiket(sureMs) + ' içinde ' + hedef + ' başarım açılır. Tahmini %100 süresi ' + tc.toFixed(0) + ' saat.')
        : 'Önce soldan bir oyun ekle.');

      // Dağıtım modeli açıklaması
      const modelNot = {
        linear: 'Başarımlar süre boyunca eşit aralıklarla açılır. En sakin görünüm.',
        exp: 'Başta sık, sonra seyrek. Gerçek oyuncu da ilk saatlerde daha çok başarım alır.',
        pareto: 'Başarımların büyük kısmı sürenin ilk beşte birinde açılır. En hızlı, en dikkat çekici.',
      };
      grSet('grModelNote', modelNot[grVal('grModel','linear')] || '-');

      // Gelişmiş panel: HLTB kutusu
      grEl('grTc').placeholder = tc.toFixed(0);
      grSet('grPlaytime', oyun ? (playtimeSa.toFixed(1) + ' sa') : '-');
      const beklenen = (oyun && grPlan && grPlan.toplamBasarim)
        ? Math.min(grPlan.toplamBasarim, Math.round(grPlan.toplamBasarim * (playtimeSa / (tc * diff))))
        : 0;
      grSet('grExpected', grPlan && grPlan.toplamBasarim ? (beklenen + ' / ' + grPlan.toplamBasarim) : '-');
      grSet('grPace', playtimeSa > 0 && beklenen ? (beklenen / playtimeSa).toFixed(1) : '-');
      grSet('grLeft', grPlan ? String(uygun) : '-');
      // Kalan başarımların gerçek oyunda ne kadar sürede açılacağı (tahmin)
      const kalanSa = (uygun && grPlan && grPlan.toplamBasarim)
        ? (uygun / grPlan.toplamBasarim) * tc * diff
        : 0;
      grSet('grRemainEst', kalanSa ? (kalanSa < 1 ? (Math.round(kalanSa*60) + ' dk') : (kalanSa.toFixed(0) + ' sa')) : '-');
    }

    // ---- anahtarlar (toggle) ----
    function grToggleBoya(){
      document.querySelectorAll('#tab-gercekci .gr-toggle').forEach(el=>{
        const k = el.getAttribute('data-grset');
        const on = !!grVal(k, k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours');
        el.style.background = on ? GRC.brand : '#151C28';
        el.style.borderColor = on ? GRC.brand : '#2B3345';
        const knob = el.firstElementChild;
        if (knob){ knob.style.background = on ? GRC.title : GRC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
      });
    }
    document.querySelectorAll('#tab-gercekci .gr-toggle').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const k = el.getAttribute('data-grset');
        const yeni = !grVal(k, k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours');
        await grKaydet({ [k]: yeni });
        grToggleBoya();
        if (k === 'grSkipUltraRare') grPlanCek();
        else if (k === 'grShowNoAch') grAramaBoya();
        else grListeBoya();
        grHesapBoya();
      });
    });

    // ---- açılır listeler ----
    function grSelectBoya(){
      const ata = (id, deger) => { const e = grEl(id); if (e) e.value = deger; };
      ata('grCR', grVal('grCR', '2.0'));
      ata('grCR2', grVal('grCR', '2.0'));
      ata('grDiff', grVal('grDiff', '1.2'));
      ata('grDiff2', grVal('grDiff', '1.2'));
      ata('grModel', grVal('grModel', 'linear'));
      ata('grNoAchMode', grVal('grNoAchMode', 'hours'));
    }
    // Aynı ayarı iki panelden de değiştirebiliyoruz (şablonda da öyle); ikisi senkron kalır.
    [['grCR','grCR'], ['grCR2','grCR'], ['grDiff','grDiff'], ['grDiff2','grDiff'],
     ['grModel','grModel'], ['grNoAchMode','grNoAchMode']].forEach(([id, anahtar])=>{
      const e = grEl(id);
      if (!e) return;
      e.addEventListener('change', async ()=>{
        await grKaydet({ [anahtar]: e.value });
        grSelectBoya();
        if (anahtar === 'grModel') grPlanCek(); else { grHesapBoya(); grListeBoya(); }
      });
    });
    grEl('grTc').addEventListener('change', async ()=>{
      await grKaydet({ grTc: grEl('grTc').value.trim() });
      grHesapBoya();
    });
    ['grRH','grRM','grRS'].forEach(id=>{
      grEl(id).addEventListener('change', async ()=>{
        const ms = grSureMs();
        grSureYaz(ms);
        await grKaydet({ grDurationSec: Math.round(ms/1000) });
        grPlanCek();
      });
    });
    grEl('grTarget').addEventListener('change', async ()=>{
      if (grVal('grTargetAuto', true)) return;
      await grKaydet({ grTarget: Math.max(0, +grEl('grTarget').value || 0) });
      grPlanCek();
    });
    grEl('grAutoTarget').onclick = async ()=>{
      await grKaydet({ grTargetAuto: !grVal('grTargetAuto', true) });
      grHesapBoya();
      grPlanCek();
    };

    // ---- basit / gelişmiş ----
    function grSeviyeBoya(){
      const adv = grVal('grLevel', 'simple') === 'advanced';
      const s = grEl('grLvlSimple'), a = grEl('grLvlAdv');
      s.style.borderColor = adv ? 'transparent' : GRC.brand;
      s.style.background = adv ? 'transparent' : '#151C28';
      s.style.color = adv ? GRC.muted : GRC.title;
      a.style.borderColor = adv ? GRC.brand : 'transparent';
      a.style.background = adv ? '#151C28' : 'transparent';
      a.style.color = adv ? GRC.title : GRC.muted;
      grEl('grSimpleBox').style.display = adv ? 'none' : 'flex';
      grEl('grAdvBox').style.display = adv ? 'flex' : 'none';
    }
    grEl('grLvlSimple').onclick = async ()=>{ await grKaydet({ grLevel: 'simple' }); grSeviyeBoya(); };
    grEl('grLvlAdv').onclick = async ()=>{ await grKaydet({ grLevel: 'advanced' }); grSeviyeBoya(); };

    // ---- presetler ----
    function grPresetBoya(){
      const box = grEl('grPresetsBox');
      box.style.display = grPresets.length ? 'block' : 'none';
      grEl('grPresets').innerHTML = grPresets.map((p,i)=>
        '<div data-grpreset="'+i+'" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #101621;cursor:pointer">'
        + '<span style="width:20px;height:20px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;display:flex;align-items:center;justify-content:center;font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE">'+(i+1)+'</span>'
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">'
        + '<span style="font-size:12px;color:#B9C0D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.baslik||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(p.meta||'')+'</span>'
        + '</div>'
        + '<button data-grpdel="'+i+'" class="h-stop" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">&#8722;</button>'
        + '</div>').join('');
    }
    grEl('grSavePreset').onclick = async ()=>{
      if (!grQueue.length){ if (typeof toast === 'function') toast('Preset').fail('Önce sıraya oyun ekle.'); return; }
      const sureMs = grSureMs();
      const p = {
        baslik: grQueue.map(g=>g.name).join(', ').slice(0, 60),
        meta: grSureEtiket(sureMs) + ' · ' + grQueue.length + ' oyun · ' + grVal('grModel','linear'),
        oyunlar: grQueue.map(g=>g.appid),
        sureSec: Math.round(sureMs/1000),
        model: grVal('grModel','linear'),
        cr: grVal('grCR','2.0'), diff: grVal('grDiff','1.2'),
        hedefAuto: !!grVal('grTargetAuto', true), hedef: Math.max(0, +grEl('grTarget').value || 0),
        ts: Date.now(),
      };
      grPresets = [p].concat(grPresets).slice(0, 12);
      await grKaydet({ grPresets });
      grPresetBoya();
      if (typeof toast === 'function') toast('Preset').done('Kaydedildi.');
    };
    grEl('grPresets').addEventListener('click', async (e)=>{
      const sil = e.target.closest('[data-grpdel]');
      if (sil){
        grPresets.splice(+sil.getAttribute('data-grpdel'), 1);
        await grKaydet({ grPresets });
        grPresetBoya();
        return;
      }
      const row = e.target.closest('[data-grpreset]');
      if (!row) return;
      if (grDurum.calisiyor){ if (typeof toast === 'function') toast('Preset').fail('Çalışırken preset yüklenemez.'); return; }
      const p = grPresets[+row.getAttribute('data-grpreset')];
      if (!p) return;
      grQueue = (p.oyunlar||[]).map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grSureYaz((p.sureSec||7200)*1000);
      await grKaydet({
        grQueue: grQueue.map(g=>g.appid), grDurationSec: p.sureSec||7200, grModel: p.model||'linear',
        grCR: p.cr||'2.0', grDiff: p.diff||'1.2', grTargetAuto: p.hedefAuto !== false, grTarget: p.hedef||0,
      });
      grSelectBoya(); grToggleBoya(); grKutuphaneBoya();
      grEl('grTarget').value = String(p.hedef||0);
      grPlanCek();
      if (typeof toast === 'function') toast('Preset').done('Yüklendi.');
    });

    // ---- başlat / durdur ----
    grEl('grStart').onclick = async ()=>{
      if (grDurum.calisiyor){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Zaten çalışıyor.'); return; }
      if (!grQueue.length){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Önce sıraya oyun ekle.'); return; }
      const sureMs = grSureMs();
      const sec = grSecenekler();
      const hedef = grPlan ? grPlan.toplam : 0;
      const ilkler = (grPlan && grPlan.kuyruk ? grPlan.kuyruk.slice(0,5) : [])
        .map(a=>'  · '+a.name+(Number.isFinite(a.rarityPct)?(' (%'+a.rarityPct.toFixed(1)+')'):'')).join('\n');
      const ok = await edgeConfirm({
        tag:'Gerçekçi Mod',
        title: (hedef ? (hedef + ' başarım ') : '') + grSureEtiket(sureMs) + ' süreye yayılacak',
        body: grQueue.map(g=>g.name).join(', ')
              + '\n\nOyun sayısı: ' + grQueue.length
              + '\nDağıtım: ' + (sec.model === 'exp' ? 'üstel (önden yüklemeli)' : sec.model === 'pareto' ? 'Pareto (80/20)' : 'doğrusal')
              + (grPlan ? ('\nOrtalama aralık: ' + grAralikEtiket(grPlan.ortalamaAralikMs)) : '')
              + (sec.rastgeleAralik ? ' (her seferinde rastgele sapmalı)' : ' (sabit)')
              + (ilkler ? ('\n\nİlk açılacaklar:\n' + ilkler) : '')
              + (grPlan && grPlan.korumali ? ('\n\n' + grPlan.korumali + ' başarım oyun tarafından korunduğu için atlanacak.') : '')
              + (grPlan && grPlan.ultraAtlanan ? ('\n' + grPlan.ultraAtlanan + ' ultra nadir başarım ayara göre atlanacak.') : ''),
        warn: 'Bu işlem Steam hesabını kalıcı olarak değiştirir. Süre boyunca uygulama açık kalmalı; istediğin an durdurabilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.gercekci.start(grQueue.map(g=>g.appid), sureMs, sec)
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Başlatılamadı',
                      body:(r&&r.error)||'Bilinmeyen hata.', confirmText:'Tamam', cancelText:'Kapat' });
        return;
      }
      grAcilanlar = [];
      notify('boost', 'Gerçekçi Mod Başladı', (r.oyunAdi||'') + ' · ' + r.toplam + ' başarım');
      pushFeed('saat', 'Gerçekçi Mod',
               r.oyunSayisi + ' oyun · ' + r.toplam + ' başarım ' + grSureEtiket(sureMs) + ' süreye yayıldı.', 'Çalışıyor');
    };
    grEl('grStop').onclick = ()=>{
      if (!grDurum.calisiyor) return;
      window.imu.gercekci.stop();
      pushFeed('saat', 'Gerçekçi Mod', 'Durduruldu.', 'Durdu');
    };

    // ---- motordan gelen durum ----
    function grSaatBoya(kalanSn){
      const iki = (n)=>String(n).padStart(2,'0');
      grSet('grClockH', iki(Math.floor(kalanSn/3600)));
      grSet('grClockM', iki(Math.floor((kalanSn%3600)/60)));
      grSet('grClockS', iki(kalanSn%60));
    }
    if (window.imu.gercekci && window.imu.gercekci.onTick){
      window.imu.gercekci.onTick((d)=>{
        grDurum = d || { calisiyor:false };
        if (grTimerUI){ clearInterval(grTimerUI); grTimerUI = null; }

        if (!d || !d.calisiyor){
          grSaatBoya(0);
          if (d && d.bitti){
            notify('boost', 'Gerçekçi Mod Bitti', d.acilan + ' / ' + d.toplam + ' başarım açıldı');
            pushFeed(d.hata?'hata':'kart', 'Gerçekçi Mod',
                     (d.sebep||'bitti') + ' · ' + d.acilan + ' / ' + d.toplam + ' başarım', d.hata?'Hata':'Başarılı');
          }
          grKutuphaneBoya();
          grListeBoya();
          return;
        }

        const yenile = ()=> grSaatBoya(Math.max(0, Math.floor((d.bitis - Date.now())/1000)));
        yenile();
        grTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) yenile(); }, 1000);
        if (d.oyunDegisti) grKutuphaneBoya();
        grListeBoya();
      });
    }
    if (window.imu.gercekci && window.imu.gercekci.onAcildi){
      window.imu.gercekci.onAcildi((a)=>{
        grAcilanlar.push({ name:a.name, rarityPct:a.rarityPct, ts:Date.now() });
        pushFeed('kart', 'Başarım açıldı', a.name + (a.oyunAdi ? (' · ' + a.oyunAdi) : ''), 'Başarılı');
        grListeBoya();
      });
    }
