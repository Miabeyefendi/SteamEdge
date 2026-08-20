    const api = window.imu;
    document.getElementById('min').onclick = () => api && api.win.minimize();
    document.getElementById('max').onclick = () => api && api.win.maximize();
    document.getElementById('close').onclick = () => api && api.win.close();

    const designed = { genel: document.getElementById('tab-genel'), kart: document.getElementById('tab-kart'), env: document.getElementById('tab-env'), saat: document.getElementById('tab-saat'), gercekci: document.getElementById('tab-gercekci'), basarim: document.getElementById('tab-basarim'), ayarlar: document.getElementById('tab-ayarlar') };
    const empty = document.getElementById('tab-empty');
    const emptyName = document.getElementById('emptyName');
    document.querySelectorAll('.nav a[data-tab]').forEach(a => {
      a.addEventListener('click', async () => {
        // Ayarlar sekmesinden çıkılıyorsa kaydedilmemiş değişiklik uyarısı (ayarlar.js)
        const leavingSettings = !designed.ayarlar.classList.contains('hidden');
        if (leavingSettings && typeof confirmLeaveSettings === 'function') {
          const ok = await confirmLeaveSettings();
          if (!ok) return;
        }
        document.querySelectorAll('.nav a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        const tab = a.getAttribute('data-tab');
        if (tab === 'cikis') { window.imu.logout(); return; }
        setRailTop(tab);
        Object.values(designed).forEach(s => s.classList.add('hidden'));
        empty.classList.add('hidden');
        if (designed[tab]) designed[tab].classList.remove('hidden');
        else { empty.classList.remove('hidden'); emptyName.textContent = a.textContent.trim(); }
        agirListeleriBosalt(tab);
        if (tab === 'genel') loadGenel();
        if (tab === 'kart') loadKart();
        if (tab === 'saat') loadSaat();
        if (tab === 'env') loadEnv();
        if (tab === 'gercekci') loadGercekci();
        if (tab === 'basarim') loadBasarim();
        if (tab === 'ayarlar') loadAyarlar();
        agirListeyiGeriCiz(tab);
      });
    });

    // ---- GÖRÜNMEYEN SEKMELERİN LİSTELERİNİ BELLEKTE TUTMA ----
    // Kütüphanesi büyük hesaplarda bu listeler binlerce satır demek: 400 oyunluk bir kuyruk
    // tek başına ~9.600 DOM düğümü. Sekme gizlendiğinde bunlar ekranda değil ama tarayıcı
    // hepsini bellekte tutmaya devam ediyordu.
    //
    // Çözüm: gizlenen sekmenin liste gövdesi boşaltılır, sekmeye dönüldüğünde yeniden çizilir.
    // VERİ SİLİNMEZ - listeler zaten JS dizilerinden çiziliyor, silinen sadece DOM. Seçimler,
    // sıralama ve filtreler de JS tarafında durduğu için geri dönüşte hiçbir şey kaybolmaz.
    // Steam'e tek bir istek daha gitmez.
    const AGIR_LISTELER = {
      kart:    { kap: 'kartQueue',    ciz: () => (typeof renderKart === 'function' && typeof kartLoaded !== 'undefined' && kartLoaded) && renderKart() },
      env:     { kap: 'envRows',      ciz: () => (typeof renderEnv === 'function' && typeof envLoaded !== 'undefined' && envLoaded) && renderEnv() },
      saat:    { kap: 'saatListBody', ciz: () => (typeof renderSaatList === 'function' && typeof saatLoaded !== 'undefined' && saatLoaded) && renderSaatList() },
      basarim: { kap: 'acBody',       ciz: () => (typeof renderAchievements === 'function' && typeof acData !== 'undefined' && acData) && renderAchievements() },
    };
    const askidaSekmeler = new Set();

    function agirListeleriBosalt(acilanTab){
      Object.keys(AGIR_LISTELER).forEach(t => {
        if (t === acilanTab || askidaSekmeler.has(t)) return;
        const kap = document.getElementById(AGIR_LISTELER[t].kap);
        // Hiç doldurulmamış listeyi askıya almanın anlamı yok; ayrıca "yükleniyor" gibi
        // tek satırlık durum metinlerini silip kullanıcıyı boş ekranla baş başa bırakmayalım.
        if (!kap || kap.children.length < 2) return;
        kap.innerHTML = '';
        askidaSekmeler.add(t);
      });
    }
    function agirListeyiGeriCiz(tab){
      if (!askidaSekmeler.has(tab)) return;
      askidaSekmeler.delete(tab);
      try { AGIR_LISTELER[tab].ciz(); } catch (_) { /* sayfa henüz yüklenmemiş - kendi load'u çizecek */ }
    }

    // ---- ortak yardımcılar (tüm sayfalar kullanır) ----
    const E = window.imu.engine;

    // KÜTÜPHANE BAŞLIĞI (library_capsule / header) - Steam'in ölçütü 920x430 piksel,
    // yani ~2.14:1. Kütüphane LOGOSU (logo.png) denenmişti ama o saydam PNG: arkası boş
    // kalıyor ve kutu içinde kötü duruyordu. Başlık görseli dolu bir JPG olduğu için
    // `object-fit:cover` ile kutuyu tamamen doldurur, boşluk kalmaz.
    //   header.jpg 460x215 - aynı 2.14:1 oranın CDN'deki adı; 920x430 bunun 2x'i.
    const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';
    const IMG_KIND = { header: 'header.jpg', capsule: 'capsule_616x353.jpg', logo: 'logo.png' };
    function gameImg(appid, kind){
      return CDN + appid + '/' + (IMG_KIND[kind] || IMG_KIND.header);
    }
    // 920x430 (~2.14:1) yuvalar için hazır <img>: başlık → yoksa kapsül → yoksa gizle.
    // `scale(1.03)`: görsel kutunun içinde %3 yakınlaştırılır - kenarlardaki ince boşluk
    // kapanır ve kapak grafiği daha dolu görünür. Kutuda overflow:hidden olduğu için taşmaz.
    function gameThumb(appid, extra){
      return '<img src="' + gameImg(appid) + '" loading="lazy" alt=""'
        + ' style="width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.03)' + (extra || '') + '"'
        + ' onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=\'' + gameImg(appid, 'capsule') + '\';}'
        + 'else{this.style.display=\'none\';}">';
    }
    function esc(s){ return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

    // ================= TEMALI ONAY MODALI =================
    // Yerel confirm() kutusu Windows'un gri penceresini açıyordu (tema dışı). Bu, aynı işi
    // yapan tema uyumlu karşılığı. Promise döner: onaylandıysa true.
    //   opts.dontAskKey → "Bir daha sorma" kutucuğu gösterir; işaretlenip onaylanırsa
    //   ayarlara `dontAsk_<key>: true` yazılır ve sonraki çağrılar SORMADAN true döner.
    //   Kullanıcı bunu Ayarlar > (ilgili bölüm) üzerinden geri açabilir.
    function edgeConfirm(opts){
      const o = opts || {};
      const key = o.dontAskKey ? ('dontAsk_' + o.dontAskKey) : null;
      // Daha önce "bir daha sorma" denmişse hiç gösterme
      if (key && typeof appSettings === 'object' && appSettings && appSettings[key]) return Promise.resolve(true);

      return new Promise((resolve)=>{
        const back = document.createElement('div');
        back.className = 'e-modal-back';
        const accent = o.danger ? '#B32453' : '#5624B3';
        back.innerHTML =
          '<div class="e-modal" role="dialog" aria-modal="true">'
          + '<div class="e-modal-hd"><span class="dot" style="background:'+accent+'"></span>'
          + '<span class="ttl">'+esc(o.tag || (o.danger ? 'Dikkat' : 'Onay'))+'</span></div>'
          + '<div class="e-modal-body">'
            + '<span class="h">'+esc(o.title || 'Emin misiniz?')+'</span>'
            + (o.body ? '<span class="p">'+esc(o.body)+'</span>' : '')
            + (o.warn ? '<span class="warn">'+esc(o.warn)+'</span>' : '')
          + '</div>'
          + (key ? '<div class="e-modal-ask" data-ask><span class="box">'
              + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DCE2FA" stroke-width="3.4"><path d="M5 13l4 4L19 7"></path></svg>'
              + '</span><span>Bir daha sorma</span></div>' : '')
          + '<div class="e-modal-ft">'
            + '<button class="cancel" data-no>'+esc(o.cancelText || 'Vazgeç')+'</button>'
            + (o.altText ? '<button class="alt" data-alt>'+esc(o.altText)+'</button>' : '')
            + '<button class="ok'+(o.danger?' danger':'')+'" data-yes>'+esc(o.confirmText || 'Devam Et')+'</button>'
          + '</div></div>';
        document.body.appendChild(back);
        requestAnimationFrame(()=>back.classList.add('show'));

        const ask = back.querySelector('[data-ask]');
        if (ask) ask.addEventListener('click', ()=>ask.classList.toggle('on'));

        let done = false;
        async function close(result){
          if (done) return; done = true;
          if (result === true && ask && ask.classList.contains('on') && key){
            try { appSettings = await window.imu.settings.set({ [key]: true }); } catch(_){}
          }
          back.classList.remove('show');
          setTimeout(()=>back.remove(), 140);
          document.removeEventListener('keydown', onKey);
          resolve(result);
        }
        function onKey(e){
          if (e.key === 'Escape') close(false);
          else if (e.key === 'Enter') close(true);
        }
        document.addEventListener('keydown', onKey);
        back.querySelector('[data-no]').onclick = ()=>close(false);
        back.querySelector('[data-yes]').onclick = ()=>close(true);
        const alt = back.querySelector('[data-alt]');
        if (alt) alt.onclick = ()=>close('alt');
        back.addEventListener('mousedown', (e)=>{ if (e.target === back) close(false); });
        setTimeout(()=>{ const y = back.querySelector('[data-yes]'); if (y) y.focus(); }, 30);
      });
    }

    // ================= AYARLARA BAĞLI ORTAK YARDIMCILAR =================
    // (Ayarlar ekranındaki tercihlerin tüm sayfalarda karşılığı olması için tek yerde.)

    // ---- Para birimi ----
    // Fiyatlar Steam'den HESABIN cüzdan kurunda çekilir ve TAM OLARAK o kurda gösterilir.
    // Çeviri yoktur. Kur henüz bilinmiyorsa (cüzdan olayı gelmediyse) simge basılmaz -
    // yanlış simge, tutarı sessizce başka bir para birimiymiş gibi göstermek demek.
    const CUR_SYM = {
      USD:'$', EUR:'€', GBP:'£', TRY:'₺', RUB:'₽', BRL:'R$', JPY:'¥', CNY:'¥',
      CAD:'CA$', AUD:'A$', INR:'₹', UAH:'₴', PLN:'zł', KZT:'₸', ARS:'AR$', MXN:'MX$',
    };
    // Kuruşun/sentin yerel adı - "Alt sıralama miktarı" gibi alanların birimi için
    const CUR_SUBUNIT = {
      USD:'sent', EUR:'sent', GBP:'peni', TRY:'kuruş', RUB:'kopek', BRL:'sentavo',
      JPY:'yen', CNY:'fen', CAD:'sent', AUD:'sent', INR:'paisa', UAH:'kopiyka',
      PLN:'grosz', KZT:'tıyın', ARS:'sentavo', MXN:'sentavo',
    };
    const CUR_LOCALE = {
      USD:'en-US', EUR:'de-DE', GBP:'en-GB', TRY:'tr-TR', RUB:'ru-RU', BRL:'pt-BR',
      JPY:'ja-JP', CNY:'zh-CN', CAD:'en-CA', AUD:'en-AU', INR:'en-IN', UAH:'uk-UA',
      PLN:'pl-PL', KZT:'kk-KZ', ARS:'es-AR', MXN:'es-MX',
    };
    // Tek doğru kaynak: Steam hesabının kendi cüzdan para birimi. Kullanıcı seçemez.
    // Neden: tutarlar para; kur çevirisi yuvarlama + bayat kur + yanlış yönde çevirme
    // hatalarına açık ve satış fiyatı zaten hesabın kurunda listeleniyor. Gördüğün tutarla
    // Steam'e gönderilen tutarın AYNI olması için çeviri tamamen kaldırıldı.
    function acctCur(){ return (appSettings && appSettings.accountCurrency) || null; }
    function curCode(){ return acctCur(); }
    function curSym(){ const c = curCode(); return c ? (CUR_SYM[c] || (c + ' ')) : ''; }
    function curSubunit(){ const c = curCode(); return c ? (CUR_SUBUNIT[c] || 'birim') : 'birim'; }
    function fmtMoney(n){
      const c = curCode();
      const loc = CUR_LOCALE[c] || 'tr-TR';
      const v = +n || 0;
      // Steam pazarında en düşük satış 0,03'tür; 0,00 diye bir fiyat YOKTUR. Sıfırdan büyük
      // ama iki haneye yuvarlayınca 0,00 görünen değerleri (satış geçmişi ortalamaları
      // 3 haneli gelebiliyor) sıfırmış gibi göstermek yerine gerçek basamağıyla yazıyoruz.
      if (v > 0 && v < 0.005){
        return curSym() + v.toLocaleString(loc, { minimumFractionDigits:3, maximumFractionDigits:4 });
      }
      return curSym() + v.toLocaleString(loc, { minimumFractionDigits:2, maximumFractionDigits:2 });
    }
    // Steam Topluluk Pazarı'nın alt sınırı (hesabın kurunda). Bunun altında ilan verilemez;
    // hesaplanan bir "değer" bu sınırın altına düşüyorsa veri güvenilir değildir, öyle işaretlenir.
    const MARKET_MIN = { USD:0.03, EUR:0.03, GBP:0.02, TRY:0.23, RUB:1.00, BRL:0.10, JPY:3, CNY:0.23,
                         CAD:0.04, AUD:0.05, INR:2.00, UAH:1.00, PLN:0.11, KZT:12, ARS:2.00, MXN:0.50 };
    function marketMin(){ const c = curCode(); return (c && MARKET_MIN[c] != null) ? MARKET_MIN[c] : 0.03; }

    // "Saat biçimi" - 24 saat / 12 saat (ÖÖ-ÖS)
    function fmtClock(d){
      const use12 = (typeof appSettings==='object' && appSettings && String(appSettings.timeFormat)==='12');
      return new Date(d).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: use12 });
    }
    function fmtDateShort(d){ return new Date(d).toLocaleDateString('tr-TR'); }

    // "Arayüz yoğunluğu" - sıkışık modda satır yükseklikleri ve iç boşluklar daralır
    function applyDensity(){
      const compact = (typeof appSettings==='object' && appSettings && appSettings.density==='compact');
      document.body.classList.toggle('e-compact', !!compact);
    }

    // ================= BİLDİRİM SESLERİ =================
    // Sesler Web Audio ile ÜRETİLİYOR, dosya indirilmiyor: indirilen ses dosyalarının
    // lisansını doğrulayamayız; sentez hem telif sorunu yaratmaz hem uygulamayı büyütmez.
    //
    // İki ses kaynağı var, bu yüzden tonlar birbirine benzemiyor:
    //   'tone'  - osilatör. f bir sayı ya da [başlangıç, ..., bitiş] kaydırma dizisi.
    //   'noise' - beyaz gürültü + süzgeç (whoosh / smash / hit gibi vurmalı efektler bundan).
    // Ortak alanlar: at=başlangıç sn, d=süre sn, g=ses düzeyi, a=atak sn, wave=dalga biçimi.
    const NS = (o) => Object.assign({ t:'tone', at:0, d:.4, g:.2, a:.008, wave:'sine' }, o);
    const NZ = (o) => Object.assign({ t:'noise', at:0, d:.4, g:.2, a:.004, ftype:'bandpass', f:[800,800], q:1 }, o);
    // Aynı sesi gecikmeli tekrar etmek için küçük yardımcı (yankı/çift vuruş hissi)
    const REP = (n, step, make) => Array.from({ length:n }, (_, i) => make(i * step, i));

    const NOTIF_SOUNDS = {
      // --- çan / tonal ailesi ---
      chime:    { voices:[ NS({f:784,d:1.1,g:.16}), NS({f:1046,at:.13,d:1.3,g:.14}), NS({f:1568,at:.26,d:1.9,g:.10}) ] },
      bell:     { voices:[ NS({f:523,d:3.2,g:.16}), NS({f:1268,d:2.6,g:.07}), NS({f:2010,d:1.7,g:.04}), NS({f:3140,d:1.0,g:.02}) ] },
      glass:    { voices:[ NS({f:1568,d:2.2,g:.09}), NS({f:2637,at:.02,d:1.8,g:.06}), NS({f:4186,at:.04,d:1.2,g:.03}), NS({f:5274,at:.06,d:.8,g:.02}) ] },
      marimba:  { voices:[ NS({f:523,d:.7,g:.16,wave:'triangle'}), NS({f:659,at:.16,d:.7,g:.16,wave:'triangle'}),
                           NS({f:784,at:.32,d:.8,g:.16,wave:'triangle'}), NS({f:1046,at:.48,d:1.4,g:.14,wave:'triangle'}) ] },
      // --- vurmalı / SFX ailesi (gürültü tabanlı) ---
      whoosh:   { voices:[ NZ({d:1.5,g:.30,a:.25,ftype:'bandpass',q:1.6,f:[240,1200,5200,2400,500]}) ] },
      swoosh:   { voices:[ NZ({d:1.4,g:.28,a:.55,ftype:'bandpass',q:2.2,f:[300,900,2600,6000]}) ] },   // ters whoosh (yükselen)
      smash:    { voices:[ NZ({d:.16,g:.42,a:.002,ftype:'lowpass',q:.7,f:[9000,2500]}),
                           NS({f:[150,44],d:.5,g:.34,wave:'sine'}),
                           NZ({at:.05,d:1.9,g:.16,a:.01,ftype:'bandpass',q:5,f:[4200,3000,1800]}) ] },
      hit:      { voices:[ NZ({d:.09,g:.34,a:.001,ftype:'lowpass',q:.7,f:[6000,900]}),
                           NS({f:[190,55],d:.55,g:.30,wave:'triangle'}),
                           NZ({at:.04,d:1.2,g:.09,a:.01,ftype:'bandpass',q:6,f:[2400,1600]}) ] },   // çınlama kuyruğu
      thud:     { voices:[ NS({f:[110,38],d:1.1,g:.38,wave:'sine'}), NZ({d:.07,g:.14,a:.001,ftype:'lowpass',f:[1400,300]}) ] },
      knock:    { voices:[ ...REP(3,.21,(t)=>NS({f:[210,70],at:t,d:.26,g:.32,wave:'triangle'})),
                           ...REP(3,.21,(t)=>NZ({at:t,d:.05,g:.18,a:.001,ftype:'lowpass',f:[3000,600]})),
                           NZ({at:.42,d:.9,g:.06,a:.02,ftype:'lowpass',q:1,f:[900,200]}) ] },      // oda yankısı
      // --- uyarı / sinyal ailesi ---
      alert:    { voices: REP(3,.42,(t)=>NS({f:880,at:t,d:.26,g:.15,wave:'square'}))
                          .concat(REP(3,.42,(t)=>NS({f:660,at:t+.2,d:.26,g:.15,wave:'square'}))) },
      siren:    { voices:[ NS({f:[560,1180,560,1180,560],d:2.8,g:.13,a:.05,wave:'sawtooth'}) ] },
      honk:     { voices:[ NS({f:[420,405],d:.55,g:.18,wave:'square'}), NS({f:[318,306],d:.55,g:.14,wave:'sawtooth'}),
                           NS({f:[420,405],at:.72,d:.85,g:.18,wave:'square'}), NS({f:[318,306],at:.72,d:.85,g:.14,wave:'sawtooth'}) ] },
      radar:    { voices: REP(3,.85,(t)=>NS({f:1400,at:t,d:.9,g:.12}))
                          .concat(REP(3,.85,(t)=>NS({f:1400,at:t+.16,d:.7,g:.05}))) },   // ping + yankısı
      // --- oyun tarzı ---
      coin:     { voices:[ NS({f:988,d:.09,g:.14,wave:'square'}), NS({f:1319,at:.09,d:1.0,g:.12,wave:'square'}) ] },
      powerup:  { voices: REP(6,.09,(t,i)=>NS({f:392*Math.pow(2,i/6),at:t,d:.16,g:.13,wave:'triangle'}))
                          .concat([ NS({f:1568,at:.54,d:1.1,g:.14,wave:'triangle'}) ]) },
      powerdown:{ voices: REP(6,.10,(t,i)=>NS({f:1568/Math.pow(2,i/6),at:t,d:.18,g:.13,wave:'triangle'}))
                          .concat([ NS({f:392,at:.60,d:1.2,g:.16,wave:'triangle'}) ]) },
      laser:    { voices:[ NS({f:[2600,240],d:.42,g:.12,wave:'sawtooth'}), NS({f:[2600,240],at:.5,d:.42,g:.12,wave:'sawtooth'}),
                           NS({f:[2600,180],at:1.0,d:.7,g:.12,wave:'sawtooth'}) ] },
      bloop:    { voices:[ NS({f:[720,180],d:1.0,g:.26}) ] },
      drip:     { voices:[ NS({f:[420,1500],d:.14,g:.22}), NS({f:[380,1300],at:.55,d:.16,g:.18}),
                           NS({f:[440,1600],at:1.15,d:.9,g:.16}) ] },
      // --- yumuşak / arka plan ---
      soft:     { voices:[ NS({f:440,d:1.4,g:.14,a:.09}), NS({f:554,at:.12,d:1.5,g:.12,a:.09}), NS({f:659,at:.24,d:1.8,g:.10,a:.09}) ] },
      heartbeat:{ voices:[ ...REP(2,.30,(t)=>NS({f:[92,48],at:t,d:.28,g:.36,wave:'sine'})),
                           ...REP(2,.30,(t)=>NS({f:[92,48],at:t+1.05,d:.28,g:.30,wave:'sine'})) ] },
      typewriter:{ voices: REP(5,.13,(t)=>NZ({at:t,d:.035,g:.20,a:.001,ftype:'bandpass',q:3,f:[2600,1500]}))
                          .concat([ NS({f:1760,at:.85,d:1.0,g:.12}) ]) },
    };

    // Sesi çal. Her çağrı kendi AudioContext'ini açar ve bitince kapatır (uzun ömürlü
    // context tutmak Electron'da gereksiz ses aygıtı meşguliyeti yaratıyordu).
    function playNotifSound(name){
      const kind = name || (typeof appSettings==='object' && appSettings && appSettings.notifSound) || 'chime';
      if (kind === 'none') return;
      const def = NOTIF_SOUNDS[kind] || NOTIF_SOUNDS.chime;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const t0 = ctx.currentTime + 0.02;
        let end = 0;
        // Bir parametreyi sayı ya da [a,b,c...] kaydırma dizisi olarak uygular
        const ramp = (param, val, start, dur)=>{
          const pts = Array.isArray(val) ? val : [val];
          param.setValueAtTime(Math.max(1, pts[0]), start);
          for (let i=1; i<pts.length; i++){
            param.exponentialRampToValueAtTime(Math.max(1, pts[i]), start + dur*(i/(pts.length-1)));
          }
        };
        def.voices.forEach(v=>{
          const start = t0 + (v.at||0), dur = v.d;
          const g = ctx.createGain();
          const atk = Math.min(v.a || .008, dur*0.5);
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(v.g, start + atk);           // atak
          g.gain.exponentialRampToValueAtTime(0.0001, start + dur);        // sönüm
          let src;
          if (v.t === 'noise'){
            // Beyaz gürültü tamponu - süzgeçten geçince whoosh/smash/hit karakteri çıkıyor
            const len = Math.ceil(ctx.sampleRate * dur);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const ch = buf.getChannelData(0);
            for (let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
            src = ctx.createBufferSource(); src.buffer = buf;
            const flt = ctx.createBiquadFilter();
            flt.type = v.ftype; flt.Q.value = v.q;
            ramp(flt.frequency, v.f, start, dur);
            src.connect(flt); flt.connect(g);
          } else {
            src = ctx.createOscillator();
            src.type = v.wave;
            ramp(src.frequency, v.f, start, dur);
            src.connect(g);
          }
          g.connect(ctx.destination);
          src.start(start); src.stop(start + dur + 0.02);
          end = Math.max(end, (v.at||0) + dur);
        });
        setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, (end + 0.4) * 1000);
      } catch(_){}
    }

    // "Arka Planda Topla" (farmSilent) - pencere görünmezken saniyelik arayüz yenilemeleri
    // atlanır; kart toplama/saat yükseltme motoru main tarafında olduğu için etkilenmez.
    // Sayfa JS'lerindeki 1sn'lik render döngüleri bu kapıdan geçer.
    // G10: pencere gizli/simge durumundayken saniyelik yenilemeler HER ZAMAN atlanır, ayara
    // bakılmaz. Görünmeyen bir arayüzü saniyede bir yeniden çizmenin kimseye faydası yok;
    // motor ana süreçte çalıştığı için kart toplama, saat yükseltme ve başarım işleri
    // etkilenmez - sadece çizim durur. Pencere geri geldiğinde sayfalar bir kez tazelenir,
    // böylece kullanıcı asla bayat sayaç görmez.
    // HAFIF MOD.
    // Chromium yalnizca pencere GIZLI ya da ORTULU oldugunda cizimi kisar. Pencere
    // ekranda durup odakta degilken hicbir sey kismiyor: saniyelik yeniden cizimler ve
    // sonsuz CSS animasyonlari her karede kompozisyon yaptiriyor. Tam ekran bir oyun
    // (olculdu: Dota 2, Vulkan) bu yuzden "independent flip" sunumunu kaybedip kompozit
    // moda dusuyor ve kare hizi dusuyor. SteamEdge'in GPU kullanimi %0 olsa bile oluyor,
    // cunku maliyet bizim degil masaustu kompozitorunun.
    //
    // Cozum: odak kaybinda saniyelik cizimleri durdur ve animasyonlari duraklat.
    let pencereOdakta = document.hasFocus();
    function hafifModAcik(){
      return typeof appSettings !== 'object' || !appSettings || appSettings.hafifMod !== false;
    }
    function durgunlukBoya(){
      const durgun = hafifModAcik() && !pencereOdakta;
      document.documentElement.classList.toggle('e-durgun', durgun);
    }
    window.addEventListener('focus', () => { pencereOdakta = true; durgunlukBoya(); });
    window.addEventListener('blur',  () => { pencereOdakta = false; durgunlukBoya(); });
    function uiTickAllowed(){
      if (document.hidden) return false;
      return !(hafifModAcik() && !pencereOdakta);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden){
        // "Arka Planda Topla" açıkken pencere gizlenince AÇIK sekmenin listesi de bellekten
        // düşer. Ayarın vaadi buydu ("en az işlemci ve bellek kullanımı"); önceden yalnızca
        // saniyelik çizimleri atlıyordu, bellek tarafında bir şey yapmıyordu.
        if (typeof appSettings === 'object' && appSettings && appSettings.farmSilent) agirListeleriBosalt(null);
        return;
      }
      // Geri gelindi: askıya alınmış liste varsa çiz, sayaçlar taze değere gelsin.
      Object.keys(AGIR_LISTELER).forEach(t => {
        if (designed[t] && !designed[t].classList.contains('hidden')) agirListeyiGeriCiz(t);
      });
      try { if (typeof renderActiveBox === 'function' && !designed.saat.classList.contains('hidden')) renderActiveBox(); } catch (_) {}
      try { if (typeof renderGenelStats === 'function' && !designed.genel.classList.contains('hidden')) renderGenelStats(); } catch (_) {}
    });

    // "Oturum zaman aşımı" - gerçek kullanıcı etkileşimini main'e bildir (sayacı sıfırlar)
    (function wireActivity(){
      let last = 0;
      const ping = () => { const t = Date.now(); if (t - last < 5000) return; last = t; window.imu.activity(); };
      ['mousedown','keydown','wheel'].forEach(ev=>document.addEventListener(ev, ping, { passive:true }));
      ping();
    })();

    // Ortak boş-durum bileşeni (madde 10): ikon + başlık + açıklama + opsiyonel yönlendirme butonu.
    const EB_ICON = {
      idle:'<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/>',
      pazar:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.5 13h11"/><path d="M6 6h15l-2 7H7"/>',
      trophy:'<path d="M8 3h8v5a4 4 0 0 1-8 0Z"/><path d="M5 4h3M16 4h3M12 12v4M9 20h6M10 16h4"/>',
      box:'<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    };
    function emptyBox(icon, title, desc, btnText, btnAttr){
      return '<div class="emptybox"><div class="eb-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">'+(EB_ICON[icon]||EB_ICON.box)+'</svg></div>'
        + '<div class="eb-a">'+esc(title)+'</div>'
        + (desc?'<div class="eb-b">'+esc(desc)+'</div>':'')
        + (btnText?'<button class="eb-btn" '+(btnAttr||'')+'>'+esc(btnText)+'</button>':'')
        + '</div>';
    }

    // ---- Steam profil (avatar/isim/seviye) ----
    // Profil ancak Steam oturumu kurulduktan SONRA çekilebiliyor ve oturum açmak saniyeler
    // sürüyor. O süre boyunca sağ üstte ve Ayarlar'daki hesap kartında tire duruyordu.
    // Artık son bilinen profil hesabın kendi dosyasında saklanıyor (main.js > engine:profile)
    // ve ayarlarla birlikte anında geliyor: ekran ilk karede dolu açılıyor, bağlantı kurulunca
    // taze veri üstüne yazıyor. Özel adres ayrı istekle, en son gelir.
    let imuProfile = null;
    let imuProfilTaze = false;      // önbellekten mi geldi, Steam'den mi

    function onbelleklenmisProfil(){
      const p = (typeof appSettings === 'object' && appSettings && appSettings.profil) || null;
      if (!p || (!p.persona && !p.avatar)) return false;
      imuProfile = { ...p };
      applyProfile();
      return true;
    }

    async function loadProfile(){
      // Elde bir şey varsa hemen göster; taze değilse arkadan tazelemeye devam et.
      if (imuProfile) applyProfile(); else onbelleklenmisProfil();
      if (!imuProfilTaze){
        const r = await E.profile().catch(()=>null);
        if (r && r.ok && r.profile){
          imuProfile = { ...(imuProfile || {}), ...r.profile };
          imuProfilTaze = true;
          applyProfile();
        }
      }
      // Özel adres profil sayfasından okunuyor; ismi ve avatarı bekletmesin diye ayrı istek.
      if (imuProfile && !imuProfile.vanity){
        E.vanity().then(v=>{
          if (v && v.ok && v.vanity){
            imuProfile.vanity = v.vanity;
            if (typeof kimlikleriBoya === 'function') kimlikleriBoya();
          }
        }).catch(()=>{});
      }
    }
    function applyProfile(){
      if (!imuProfile) return;
      const nm = imuProfile.persona || '-';
      const av = imuProfile.avatar;
      const sName = document.getElementById('sideName'); if (sName) sName.textContent = nm;
      const sLvl = document.getElementById('sideLevel'); if (sLvl) sLvl.textContent = imuProfile.level!=null ? ('Seviye '+imuProfile.level) : 'Çevrimiçi';
      // Avatar varsa görsel, yoksa baş harf rozeti (ör. "VE")
      const sAv = document.getElementById('sideAvatar');
      if (sAv) {
        const initials = (nm.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '-').toUpperCase();
        sAv.innerHTML = av ? '<img src="' + esc(av) + '" onerror="this.parentNode.textContent=\'' + initials + '\'">' : initials;
      }
      const setP = document.getElementById('setPersona'); if (setP) setP.textContent = nm;
      const setLevelRow = document.getElementById('setLevel'); if (setLevelRow) setLevelRow.textContent = imuProfile.level!=null ? imuProfile.level : '-';
      // Kimlik satırları profilden gelen özel adresi de gösteriyor; hesap değişince tazelensin.
      if (typeof kimlikleriBoya === 'function') kimlikleriBoya();
    }

    // ---- kalıcı istatistikler (main.js stats.json) ----
    let lifeStats = null;
    function fmtHrs(ms){ const h=ms/3600000; return h>=1 ? (h.toFixed(1)+' saat') : (Math.round(ms/60000)+' dk'); }
    async function renderLifeStats(){
      lifeStats = await window.imu.stats.get().catch(()=>null);
      if (!lifeStats) return;
      const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
      set('lifeRuntime', fmtHrs(lifeStats.totalRuntimeMs||0));
      set('lifeCards', (lifeStats.cardsDropped||0));
      set('lifeSold', (lifeStats.cardsSold||0));
      set('lifeBoost', fmtHrs(lifeStats.boostRuntimeMs||0));
      set('lifeSince', 'Kayıt başlangıcı: ' + new Date(lifeStats.since||Date.now()).toLocaleDateString('tr-TR'));
    }
    async function addLifeStats(patch){ lifeStats = await window.imu.stats.add(patch).catch(()=>lifeStats); renderLifeStats(); }
    // 16:9 - Kütüphane Logosu (logo.png). contain: saydam logo kırpılmadan sığar.
    function imgTag(appid){ return '<img src="'+gameImg(appid)+'" class="gt" style="width:85px;height:40px;object-fit:cover;border-radius:7px" onerror="this.style.background=\'#26313f\';this.src=\'\'">'; }
    function fmtDur(sec){ const m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }

    // ---- sol kenar çubuğu açılır/kapanır (< / > ) ----
    const sideNav = document.getElementById('sideNav');
    const SIDE_COLLAPSE_KEY = 'imu_side_collapsed';
    // Rail sekmesi aktif nav öğesinin hizasında durur: top = 17 + 44*index
    // (nav öğesi 40px + 4px gap = 44px adım). Ayarlar sidebar'da olmadığı için index 5.
    const RAIL_ORDER = ['genel', 'kart', 'env', 'saat', 'gercekci', 'basarim', 'ayarlar'];
    function setRailTop(tab) {
      const btn = document.getElementById('sideCollapseBtn');
      const i = RAIL_ORDER.indexOf(tab);
      if (btn && i >= 0) btn.style.top = (17 + 44 * i) + 'px';
    }
    // railChevronPath: kapalıyken sağa (aç), açıkken sola (kapat)
    function setRailChevron() {
      const p = document.getElementById('railChev');
      if (p) p.setAttribute('d', sideNav.classList.contains('collapsed') ? 'M10 8l4 4-4 4' : 'M14 8l-4 4 4 4');
    }
    if (localStorage.getItem(SIDE_COLLAPSE_KEY) === '1') sideNav.classList.add('collapsed');
    setRailChevron();
    document.getElementById('sideCollapseBtn').onclick = () => {
      const on = sideNav.classList.toggle('collapsed');
      localStorage.setItem(SIDE_COLLAPSE_KEY, on ? '1' : '0');
      setRailChevron();
    };

    // ---- üst çubuk: Ayarlar (dişli) ----
    document.getElementById('tbSettings').onclick = () => {
      document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
      openAyarlar();
    };

    // ---- üst çubuk: sürüm rozeti ve güncelleme uyarısı ----
    // Sürüm package.json'dan okunur (preload > imu.surum); hiçbir yerde elle yazılmaz.
    const APP_SURUM = (window.imu && window.imu.surum) || '';
    (function paintVersion(){
      const e = document.getElementById('tbVersion');
      if (e) e.textContent = APP_SURUM ? ('v' + APP_SURUM) : 'v-';
    })();

    // ---- GÜNCELLEME ----
    // Uygulama açılışta BİR KEZ bakar. Yeni sürüm varsa pencere açılır; sürüm güncelse
    // hiçbir şey gösterilmez - kullanıcıyı "her şey yolunda" demek için rahatsız etmenin
    // anlamı yok. Üst çubuktaki düğme aynı kontrolü istendiği an tekrar yapar; orada sonuç
    // her durumda söylenir, çünkü düğmeye basan cevap bekler.
    // İndirme, kurulum veya kendini güncelleme YOK: yalnızca sürüm numarası okunur.
    let sonGuncellemeDurumu = null;
    let guncellemePenceresiAcik = false;

    async function guncellemePenceresi(d){
      if (guncellemePenceresiAcik) return;
      guncellemePenceresiAcik = true;
      try {
        const tarih = d.yayinTs ? new Date(d.yayinTs).toLocaleDateString('tr-TR') : '';
        const ac = await edgeConfirm({
          tag: 'Güncelleme',
          title: 'Yeni sürüm yayımlandı: v' + d.son,
          body: 'Kurulu sürüm v' + d.kurulu + (tarih ? ('  ·  yayımlanma tarihi ' + tarih) : '')
                + '\nDeğişiklikleri yayın sayfasında okuyabilirsin.',
          warn: 'İndirmeyi uygulama yapmaz. Yayın sayfasından kendin indirir, arşivi BOŞ ve YENİ '
                + 'bir klasöre çıkarır, eski klasördeki settings klasörünü yanına kopyalarsın.',
          confirmText: 'Yayın Sayfasını Aç',
          cancelText: 'Şimdi Değil',
        });
        if (ac) window.imu.openExternal(d.url);
      } finally {
        guncellemePenceresiAcik = false;
      }
    }

    function guncellemeDurumu(d, elleBakildi){
      sonGuncellemeDurumu = d || null;
      const rozet = document.getElementById('tbUpdateBadge');
      const yeniVar = !!(d && d.ok && d.guncelMi === false);
      // Düğmenin üstündeki nokta: yeni sürüm varken yanar, güncelken söner.
      if (rozet) rozet.style.display = yeniVar ? 'block' : 'none';
      const btn = document.getElementById('tbUpdate');
      if (btn) btn.title = yeniVar ? ('Yeni sürüm var: v' + d.son) : 'Güncellemeleri denetle';
      if (yeniVar){ guncellemePenceresi(d); return; }
      // Güncel ya da bakılamadı: yalnızca kullanıcı elle sorduysa cevap ver.
      if (!elleBakildi || !d || typeof toast !== 'function') return;
      if (d.ok) toast('Güncelleme').done('En güncel sürümü kullanıyorsun (v' + d.kurulu + ').');
      else toast('Güncelleme').fail((d.hata || 'Sürüm bilgisi alınamadı.') + ' Kurulu sürümün çalışmaya devam eder.');
    }

    if (window.imu && window.imu.guncelleme){
      // Açılıştaki tek kontrolün sonucu buradan gelir.
      window.imu.guncelleme.onDurum((d) => guncellemeDurumu(d, false));
      const ub = document.getElementById('tbUpdate');
      if (ub) ub.onclick = async ()=>{
        ub.disabled = true;
        const d = await window.imu.guncelleme.kontrol().catch(e=>({ ok:false, hata:(e&&e.message)||'Denetim başarısız.' }));
        ub.disabled = false;
        guncellemeDurumu(d, true);
      };
    }

    // ---- HESAP KİMLİĞİ (sağ üstteki hesap menüsü) ----
    // Steam'in yedi biçimi de TEK sayıdan türer: SteamID64. Ağa hiçbir şey sorulmaz.
    //   hesap numarası = SteamID64 - 76561197960265728   (evren 1, "individual" hesap tabanı)
    //   klasik         = STEAM_1:<numaranın son biti>:<numaranın yarısı>
    //   SteamID3       = [U:1:<hesap numarası>]
    // Tam sayılar 53 biti aştığı için BigInt kullanılır; Number ile son haneler bozulur.
    const STEAM64_TABAN = 76561197960265728n;
    let kimlikler = null;

    function kimlikBicimleri(steamID64, vanity){
      const ham = String(steamID64 || '').trim();
      if (!/^\d{17}$/.test(ham)) return null;
      let sid;
      try { sid = BigInt(ham); } catch (_) { return null; }
      if (sid < STEAM64_TABAN) return null;
      const hesap = sid - STEAM64_TABAN;
      return {
        idSteam64: ham,
        idKlasik : 'STEAM_1:' + (hesap % 2n) + ':' + (hesap / 2n),
        idSteam3 : '[U:1:' + hesap + ']',
        idHesap  : String(hesap),
        idHex    : '0x' + sid.toString(16).toUpperCase().padStart(16, '0'),
        idProfil : 'https://steamcommunity.com/profiles/' + ham,
        idOzel   : vanity ? ('https://steamcommunity.com/id/' + vanity) : null,
      };
    }

    function kimlikleriBoya(){
      const sid = (imuProfile && imuProfile.steamID)
        || (typeof appSettings === 'object' && appSettings && appSettings.steamID) || null;
      kimlikler = kimlikBicimleri(sid, imuProfile && imuProfile.vanity);
      ['idSteam64','idKlasik','idSteam3','idHesap','idHex','idProfil','idOzel'].forEach(id=>{
        const e = document.getElementById(id);
        if (!e) return;
        const v = kimlikler ? kimlikler[id] : null;
        // Menü 268 px: tam adres satıra sığmayıp üç noktayla kesiliyordu. Adreslerde
        // "https://steamcommunity.com" kısmı zaten her satırda aynı, o yüzden yalnızca
        // yol gösteriliyor. KOPYALANAN ve AÇILAN değer tam adres olarak kalır.
        // Adres AYRISTIRILARAK karsilastirilir, basi kesilerek degil: "steamcommunity.com"
        // ile BASLAYAN her dizge Steam degildir (steamcommunity.com.baskasite.tr gibi).
        // Burada deger zaten kendi urettigimiz adres, ama karsilastirmanin dogrusu bu ve
        // kod taramasi da hakli olarak isaret ediyordu.
        let gorunen = v;
        if (v) {
          try {
            const u = new URL(v);
            if (u.origin === 'https://steamcommunity.com') gorunen = u.pathname + u.search + u.hash;
          } catch (_) { /* adres degilse oldugu gibi gosterilir */ }
        }
        // Boş tire "bozuk" gibi görünüyor; değeri olmayan satır sebebini yazsın.
        e.textContent = gorunen || (kimlikler ? 'tanımlı değil' : 'hesap bağlı değil');
        e.classList.toggle('bos', !v);
        if (v) e.parentNode.title = v;      // tam değer üzerine gelince görünür
      });
      document.querySelectorAll('#kimlikBox [data-kopya]').forEach(b=>{
        const v = kimlikler && kimlikler[b.getAttribute('data-kopya')];
        b.disabled = !v;
        b.style.opacity = v ? '1' : '0.45';
      });
      const hepsi = document.getElementById('idCopyAll');
      const profil = document.getElementById('idOpenProfile');
      if (hepsi) hepsi.disabled = !kimlikler;
      if (profil) profil.disabled = !kimlikler;
    }

    function kimlikKopyala(metin, etiket){
      navigator.clipboard.writeText(metin).then(()=>{
        if (typeof toast === 'function') toast('Kopyalandı').done((etiket || 'Değer') + ' panoya kopyalandı.');
      }).catch(()=>{});
    }

    document.querySelectorAll('#kimlikBox [data-kopya]').forEach(b=>{
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const v = kimlikler && kimlikler[b.getAttribute('data-kopya')];
        if (v) kimlikKopyala(v, 'Kimlik');
      });
    });
    const idCopyAllBtn = document.getElementById('idCopyAll');
    if (idCopyAllBtn) idCopyAllBtn.onclick = (e)=>{
      e.stopPropagation();
      if (!kimlikler) return;
      kimlikKopyala([
        'SteamID64      : ' + kimlikler.idSteam64,
        'SteamID        : ' + kimlikler.idKlasik,
        'SteamID3       : ' + kimlikler.idSteam3,
        'Hesap numarası : ' + kimlikler.idHesap,
        'Hex            : ' + kimlikler.idHex,
        'Profil adresi  : ' + kimlikler.idProfil,
        'Özel adres     : ' + (kimlikler.idOzel || 'tanımlı değil'),
      ].join('\n'), 'Tüm kimlik biçimleri');
    };
    const idOpenProfileBtn = document.getElementById('idOpenProfile');
    if (idOpenProfileBtn) idOpenProfileBtn.onclick = (e)=>{
      e.stopPropagation();
      if (kimlikler) window.imu.openExternal(kimlikler.idOzel || kimlikler.idProfil);
    };

    // ---- üst çubuk: Bildirimler + Profil/Hesap akordiyonu (referanslar önce, olay bağlama sonra) ----
    const notifDropdown = document.getElementById('notifDropdown');
    const acctDropdown = document.getElementById('acctDropdown');
    const tbProfile = document.getElementById('tbProfile');

    function closeAcct(){ acctDropdown.classList.remove('open'); tbProfile.classList.remove('open'); }
    function closeNotif(){ notifDropdown.classList.remove('open'); }

    // Sidebar alt durum göstergesi: statusColor = running ? ok : warn,
    // statusLabel = running ? 'ÇALIŞIYOR' : 'HAZIR'. genel.js durum değişince çağırır.
    function setSysStatus(running){
      const d = document.getElementById('sysDot'), l = document.getElementById('sysLabel');
      const c = running ? 'var(--e-ok)' : 'var(--e-warn)';
      if (d) d.style.background = c;
      if (l){ l.style.color = c; l.textContent = running ? 'ÇALIŞIYOR' : 'HAZIR'; }
    }

    // Bildirim rozeti (header'daki zil ikonunun üstündeki kırmızı nokta): okunmamış
    // aktivite varsa görünür. Sayıyı genel.js'in renderFeed()'i bildirir - activityFeed
    // orada `const` ile tanımlı olduğu için buradan doğrudan okumak TDZ riski taşır.
    let notifSeen = 0, notifCount = 0;
    function updateNotifBadge(n){
      if (typeof n === 'number') notifCount = n;
      const b = document.getElementById('tbNotifBadge');
      if (b) b.style.display = notifCount > notifSeen ? 'block' : 'none';
    }

    // genel.js'in gerçek activityFeed'inden okur (uydurma veri yok)
    function renderNotifList(){
      const box = document.getElementById('notifList');
      const feed = activityFeed || [];
      if (!feed.length){ box.innerHTML = '<div style="padding:14px;color:var(--muted2);font-size:12px;text-align:center">Henüz bildirim yok.</div>'; return; }
      box.innerHTML = feed.slice(0,8).map(f=>{
        const t = new Date(f.ts).toLocaleTimeString('tr-TR');
        return '<div class="notif-item"><div class="a">'+esc(f.title)+'</div><div class="b">'+esc(f.text)+'</div><div class="t">'+t+'</div></div>';
      }).join('');
    }
    document.getElementById('tbNotif').addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !notifDropdown.classList.contains('open');
      closeAcct();
      notifDropdown.classList.toggle('open', willOpen);
      if (willOpen){ renderNotifList(); notifSeen = notifCount; updateNotifBadge(); }
    });

    async function renderAcctList(){
      const list = document.getElementById('acctList');
      const accts = await window.imu.accounts.list().catch(()=>[]);
      if (!accts.length){ list.innerHTML = '<div style="padding:10px 14px;color:var(--muted2);font-size:12px">Kayıtlı hesap yok.</div>'; return; }
      // Rozetler: "Aktif" = arayüzde görüntülenen, yeşil nokta = arka planda kart/saat çalışıyor
      list.innerHTML = accts.map(a=>'<div class="acct-row'+(a.active?' active':'')+'" data-id="'+esc(a.steamID)+'">'
        + '<span class="nm">'+esc(a.accountName||a.steamID)+'</span>'
        + (a.running?'<span class="run-dot" title="Arka planda çalışıyor"></span>':'')
        + (a.connected&&!a.running?'<span class="conn-dot" title="Bağlı"></span>':'')
        + (a.active?'<span class="tag">Aktif</span>':'')
        + '<span class="x" data-x="'+esc(a.steamID)+'">✕</span>'
        + '</div>').join('');
      list.querySelectorAll('.acct-row').forEach(row=>{
        row.addEventListener('click', (e)=>{ if (!e.target.closest('[data-x]')) switchAccount(row.getAttribute('data-id')); });
      });
      list.querySelectorAll('[data-x]').forEach(x=>{
        x.addEventListener('click', (e)=>{ e.stopPropagation(); removeAccount(x.getAttribute('data-x')); });
      });
    }
    // G3: Steam baglanti durumu seridi. Kopma sessiz kalmasin diye ust barin altinda
    // kalici bir serit gosterilir; yeniden baglaninca kendiliginden kaybolur.
    function baglantiSeridi(durum, mesaj){
      let el = document.getElementById('baglantiSerit');
      if (durum === 'bagli'){
        if (el) el.remove();
        return;
      }
      if (!el){
        el = document.createElement('div');
        el.id = 'baglantiSerit';
        el.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 20px;'
          + 'font-size:12px;font-weight:600;border-bottom:1px solid #B37E24;background:#1A1408;color:#B37E24';
        // Serit GOVDE SATIRININ ustune girer. Eskiden dogrudan <main>'in kardesi olarak
        // ekleniyordu; o satir yan panelle ayni flex satiri oldugu icin serit ust cubugun
        // altina degil, kenar cubugunun yanina dusuyordu.
        const ana = document.querySelector('main');
        const satir = ana && ana.parentNode;                   // aside + main satiri
        const hedef = (satir && satir.parentNode) ? satir : (ana || document.body);
        hedef.parentNode.insertBefore(el, hedef);
      }
      const renk = durum === 'koptu' ? '#B32453' : '#B37E24';
      el.style.borderBottomColor = renk; el.style.color = renk;
      el.innerHTML = '<span style="width:7px;height:7px;border-radius:12px;background:'+renk+';flex-shrink:0;'
        + 'animation:e-dotPulse 1.6s ease-in-out infinite"></span><span>'+esc(mesaj||'')+'</span>';
    }
    if (window.imu.engine && window.imu.engine.onDurum){
      window.imu.engine.onDurum((d)=>{
        if (!d || !d.aktif) return;          // yalnizca ekranda acik olan hesap
        baglantiSeridi(d.durum, d.mesaj);
        if (d.durum === 'koptu'){
          if (typeof setSysStatus === 'function') setSysStatus(false);
          if (typeof pushFeed === 'function') pushFeed('hata', 'Steam Bağlantısı', d.mesaj || 'Koptu.', 'Hata');
          if (typeof notify === 'function') notify('error', 'Steam Bağlantısı Koptu', 'Yeniden bağlanılıyor...');
        } else if (d.durum === 'bagli' && d.yenidenBaglandi){
          if (typeof pushFeed === 'function') pushFeed('kart', 'Steam Bağlantısı', d.mesaj || 'Yeniden bağlandı.', 'Başarılı');
        }
      });
    }

    // Hesap değiştirme YENİDEN YÜKLEME YAPMAZ - diğer hesapların kart toplama/saat yükseltme
    // işi arka planda sürdüğü için sayfayı baştan kurmak hem gereksiz hem de o işlerin canlı
    // göstergesini sıfırlardı. Bunun yerine sayfa önbellekleri boşaltılıp aktif sekme yeniden
    // veri çeker.
    // MADDE 2a: Sadece degiskenleri temizlemek yetmiyordu. Aktif olmayan sekmelerin DOM'u
    // ekranda kaliyor ve o sekmeye gecildiginde ONCEKI HESABIN oyunlari gorunuyordu; veri
    // gec gelirse ya da baglanti kurulamazsa sonsuza kadar oyle kaliyordu.
    // Cozum: hesap degisince tum sekmelerin icerigini bosalt, "yukleniyor" iskeleti koy.
    function iskeletKoy(){
      const hedefler = [
        ['kartRows', 'Oyun listesi yükleniyor...'],
        ['envRows', 'Envanter yükleniyor...'],
        ['saatListBody', 'Kütüphane yükleniyor...'],
        ['activeBoostBox', 'Kuyruk yükleniyor...'],
        ['acBody', 'Başarımlar yükleniyor...'],
        ['grListe', 'Yükleniyor...'],
        ['gFeed', 'Yükleniyor...'],
      ];
      hedefler.forEach(([id, metin])=>{
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">'+metin+'</div>';
      });
    }
    function resetPageCaches(){
      iskeletKoy();
      if (typeof kartLoaded !== 'undefined'){ kartLoaded = false; dropGames = []; }
      if (typeof saatLoaded !== 'undefined'){ saatLoaded = false; ownedGames = []; selectedSaat = []; }
      if (typeof envLoaded !== 'undefined'){ envLoaded = false; invMerged = null; invItems = null; detailKey = null; }
      if (typeof priceMap !== 'undefined') priceMap.clear();
      if (typeof selected !== 'undefined') selected.clear();
      if (typeof acLoaded !== 'undefined'){ acLoaded = false; acData = null; acAppid = null; }
      if (typeof grLoaded !== 'undefined'){ grLoaded = false; grGames = []; grAppid = null; grPlan = null; }
      if (typeof acCache !== 'undefined') acCache.clear();
      if (typeof genelLoaded !== 'undefined') genelLoaded = false;
      // Aktivite akisi hesaba ozeldir; eski hesabin gecmisi ekranda kalmasin
      if (typeof activityFeed !== 'undefined') activityFeed.length = 0;
    }
    function reloadActiveTab(){
      const active = document.querySelector('.nav a.active');
      const tab = active ? active.getAttribute('data-tab') : 'genel';
      if (tab === 'kart' && typeof loadKart === 'function') loadKart();
      else if (tab === 'saat' && typeof loadSaat === 'function') loadSaat();
      else if (tab === 'env' && typeof loadEnv === 'function') loadEnv();
      else if (tab === 'basarim' && typeof loadBasarim === 'function') loadBasarim();
      else if (typeof loadGenel === 'function') loadGenel();
    }
    async function switchAccount(steamID){
      closeAcct();
      const r = await window.imu.accounts.switch(steamID).catch(()=>null);
      if (!r || !r.ok){ alert('Hesap değiştirilemedi.' + (r && r.error ? '\n'+r.error : '')); return; }
      resetPageCaches();
      imuProfile = null; imuProfilTaze = false; loadProfile();
      reloadActiveTab();
      renderAcctList();
    }
    async function removeAccount(steamID){
      // MADDE 9: duz confirm() yerine ne silinecegini ACIKCA anlatan onay
      const ok = await edgeConfirm({
        tag:'Hesabı Kaldır', danger:true,
        title:'Bu hesap listeden kaldırılacak',
        body:'Silinecekler:\n'
             + '  · Kayıtlı Steam oturumu (giriş anahtarı)\n'
             + '  · O hesaba ait saat yükseltici listesi, kuyruk sırası ve başarım geçmişi\n'
             + '  · O hesaba ait istatistikler\n\n'
             + 'Arka planda çalışan kart toplama ve saat yükseltme işi durdurulur.\n\n'
             + 'Steam hesabının kendisine hiçbir şey olmaz; istersen tekrar giriş yapabilirsin.',
        warn:'Bu işlem geri alınamaz.',
        confirmText:'Hesabı Kaldır', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.accounts.remove(steamID).catch(()=>null);
      if (!r || !r.ok) { alert('Hesap kaldırılamadı.'); return; }
      if (r.loggedOut) return; // main.js zaten giriş ekranına geçti
      resetPageCaches();
      imuProfile = null; imuProfilTaze = false; loadProfile();
      reloadActiveTab();
      renderAcctList();
    }
    document.getElementById('acctAddBtn').onclick = () => window.imu.accounts.startAdd();
    // Arka plandaki hesaplardan biri başlayınca/durunca listedeki noktayı tazele
    if (window.imu.onAccountActivity) window.imu.onAccountActivity(()=>{
      if (acctDropdown.classList.contains('open')) renderAcctList();
    });
    // Gelen Steam mesajı: aktivite akışına düşer + ekranda toast çıkar. Masaüstü bildirimi
    // ana süreçte gönderiliyor (bkz. main.js connectAccount > onChatMessage).
    if (window.imu.onChatMessage) window.imu.onChatMessage((m)=>{
      const who = m.persona || m.from;
      if (typeof pushFeed === 'function'){
        pushFeed('mesaj', 'Steam mesajı · ' + who,
                 m.message.slice(0,140) + (m.replied ? '  ·  otomatik yanıtlandı' : ''), 'Mesaj');
      }
      if (typeof toast === 'function') toast(who).done(m.message.slice(0,120));
      if (typeof playNotifSound === 'function' && appSettings && appSettings.notifications) playNotifSound();
    });
    // Açılışta kayıtlı tüm hesapları arka planda bağla - paralel idle bunun üzerine kurulu
    window.imu.accounts.connectAll().then((res)=>{
      const failed = (res||[]).filter(r=>!r.ok);
      if (failed.length && typeof pushFeed === 'function'){
        failed.forEach(f=>pushFeed('hata','Hesap bağlanamadı', f.accountName+' - '+(f.error||''), 'Hata'));
      }
    }).catch(()=>{});
    document.getElementById('acctLogoutBtn').onclick = () => {
      // MADDE 9: cikis KALICI veriyi silmez, bunu acikca soyle - kullanici tereddut etmesin
      edgeConfirm({
        tag:'Çıkış Yap',
        title:'Bu hesaptan çıkış yapılacak',
        body:'Oturum kapatılır ve giriş ekranına dönersin.\n\n'
             + 'Ayarların, saat yükseltici listen, başarım geçmişin ve istatistiklerin SİLİNMEZ; '
             + 'tekrar giriş yaptığında yerinde olur.',
        warn:'Çalışan kart toplama ve saat yükseltme işi durur.',
        confirmText:'Çıkış Yap', cancelText:'Vazgeç',
      }).then(ok=>{ if (ok) window.imu.logout(); });
    };
    tbProfile.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !acctDropdown.classList.contains('open');
      closeNotif();
      acctDropdown.classList.toggle('open', willOpen);
      tbProfile.classList.toggle('open', willOpen);
      if (willOpen) renderAcctList();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#acctDropdown') && !e.target.closest('#tbProfile')) closeAcct();
      if (!e.target.closest('#notifDropdown') && !e.target.closest('#tbNotif')) closeNotif();
    });
