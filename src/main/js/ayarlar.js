    // ================= AYARLAR =================
    // Her kontrol data-set="<ayar anahtarı>" taşır.
    //
    // KAYDET MODELİ. Sayfadaki değişiklikler "Kaydet"e basılana kadar yalnızca TASLAKTA durur:
    // diske yazılmaz, hiçbir işe uygulanmaz. Kaydet değişen anahtarları ana sürece yollar; orada
    // yazılır, uygulanır ve değişiklikten etkilenen çalışan işler birkaç saniye duraklatılıp yeni
    // ayarla sürdürülür. Eskiden her tıklama anında diske yazılıyordu, "Kaydet" hiçbir şey
    // yapmıyordu, bir anahtarı açıp geri kapatmak bile "kaydedilmemiş değişiklik" sayılıyordu.
    let appSettings = {};          // KAYITLI ayarlar: uygulamanın geri kalanı bunu okur
    const S = window.imu.settings;
    let taslak = null;             // sayfadaki, henüz kaydedilmemiş değerler
    let taslakTaban = null;        // sayfaya girildiği andaki kayıtlı değerler
    let varsayilanAyarlar = null;  // Sıfırla ve "Profil" satırı için, ana süreçten bir kez
    let ayarKayitZamani = null;
    let kaydediliyor = false;

    // palet kısayolları
    const SC = { brand:'#5624B3', s3:'#151C28', bd:'#2B3345', title:'#DCE2FA', off:'#656D80', muted:'#8B8F9E', bdActive:'#5624B3' };

    S.get().then(s => {
      appSettings = s || {};
      // Dili ayarlardan baslat: metinler cizilmeden once devreye girmeli.
      if (typeof initI18n === 'function') initI18n(appSettings.language);
      // Ayarlar içinde son bilinen profil de geliyor (main.js > hesap dosyası). Steam
      // oturumu daha kurulmadan isim, avatar ve seviye ekrana yazılabilsin diye ilk iş bu.
      if (typeof onbelleklenmisProfil === 'function') onbelleklenmisProfil();
      paintAll();
      applySettingsEverywhere(true);
      // Açılış sayfası sadece uygulama ilk açıldığında uygulanır (genel.js yüklendikten sonra)
      setTimeout(applyStartPage, 0);
    });

    // ---- taslak ----
    function kopya(o){ return JSON.parse(JSON.stringify(o == null ? null : o)); }
    function sayfaAnahtarlari(){
      const set = new Set();
      document.querySelectorAll('#tab-ayarlar [data-set]').forEach(el=>set.add(el.getAttribute('data-set')));
      return [...set];
    }
    // Sayfadaki değer: taslak varsa taslaktan, yoksa kayıtlı ayardan.
    function deger(k){ return (taslak && k in taslak) ? taslak[k] : appSettings[k]; }
    function taslakBaslat(){
      taslakTaban = {};
      sayfaAnahtarlari().forEach(k=>{ taslakTaban[k] = kopya(appSettings[k]); });
      taslak = kopya(taslakTaban);
      degisiklikleriGoster();
    }
    function taslakBitir(){ taslak = null; taslakTaban = null; }
    const ayni = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function degisenler(){
      if (!taslak) return [];
      return Object.keys(taslak).filter(k => !ayni(taslak[k], taslakTaban[k]));
    }
    // Seçim kutusu değeri her zaman metin döner; kayıtlı değer sayıysa sayıya çevrilir. Yoksa
    // "90" ile 90 farklı sayılır ve geri alınan seçim yine "değişti" görünürdü.
    function turUydur(k, v){
      const ornek = (taslakTaban && taslakTaban[k] !== undefined) ? taslakTaban[k]
                  : (varsayilanAyarlar ? varsayilanAyarlar[k] : undefined);
      if (typeof ornek === 'number'){ const n = Number(v); return Number.isFinite(n) ? n : ornek; }
      if (typeof ornek === 'boolean') return !!v;
      return v;
    }
    function ayarSatiri(k){
      const el = document.querySelector('#tab-ayarlar [data-set="'+k+'"]');
      return el ? el.closest('[data-ayar-satir]') : null;
    }
    // Değişen ayarın sayfadaki adı (çıkış sorusunda anahtar adı yerine gösterilir)
    function ayarEtiketi(k){
      const satir = ayarSatiri(k);
      const ad = satir && satir.querySelector('span[style*="font-weight:600"]');
      return ad ? ad.textContent.trim() : k;
    }

    function degisiklikleriGoster(){
      const n = degisenler().length;
      const d = document.getElementById('setDirty');
      if (d) d.textContent = n ? tf('# değişiklik', n) : t('yok');
      const kaydet = document.getElementById('setSave');
      if (kaydet){
        kaydet.style.opacity = n ? '1' : '.55';
        kaydet.style.boxShadow = n ? '0 0 0 3px rgba(86,36,179,.35)' : 'none';
        kaydet.title = n ? '' : t('Kaydedilecek değişiklik yok.');
      }
      const geri = document.getElementById('setDiscard');
      if (geri) geri.style.display = n ? '' : 'none';
    }

    // ---- bağlı ayarlar ----
    // Bir ayarin baska bir ayara bagli oldugu yerler. Bagli olan kapaliyken satir sonuk
    // ve tiklanamaz olur; acik gorunup hicbir sey yapmayan anahtar birakmiyoruz. Bu tuzak
    // 1.1.10'da basarim acilis araliginda yasandi. Kosullar TASLAGA bakar: ust ayar sayfada
    // kapatilinca alti hemen sonuklesir, kaydetmek gerekmez.
    const BILDIRIM_KAPALI = 'Masaüstü bildirimleri kapalıyken hiçbir bildirim gösterilmez.';
    const AYAR_KAPILARI = [
      { anahtar: 'achSpread', kosul: () => deger('achSafeMode') !== false, not: 'Güvenli mod kapalıyken açılış aralığı sapmaz.' },
      { anahtar: 'undercutCents', kosul: () => deger('saleMode') === 'undercut', not: 'Yalnızca varsayılan satış fiyatı "En ucuzun altına in" iken kullanılır.' },
      { anahtar: 'priceRefreshMin', kosul: () => !!deger('autoRefreshPrices'), not: '"Fiyatları otomatik yenile" kapalıyken fiyatlar kendiliğinden yenilenmez.' },
      { anahtar: 'sellBatchWaitMin', kosul: () => +deger('bulkSellLimit') > 0, not: 'Parti büyüklüğü 0 iken satış partilere bölünmez.' },
      { anahtar: 'shuffleBoost', kosul: () => !!appSettings.seqIdle, not: 'Yalnızca Saat Yükseltici\'de sıralı bekletme açıkken geçerli; eş zamanlı yükseltmede sıra yoktur.' },
      { anahtar: 'boostSyncMode', kosul: () => !!deger('boostSync'), not: '"Saatleri eşitle" kapalıyken kullanılmaz.' },
      { anahtar: 'boostSyncTargetHours', kosul: () => !!deger('boostSync') && deger('boostSyncMode') === 'manual', not: 'Yalnızca hedef "Elle girilen saat" iken kullanılır.' },
      { anahtar: 'notifyFarm', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'notifyBoost', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'notifyAch', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'notifyError', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'notifyPriceDrop', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'quietHoursEnabled', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'notifSound', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'notifyChat', kosul: () => deger('notifications') !== false, not: BILDIRIM_KAPALI },
      { anahtar: 'quietFrom', kosul: () => deger('notifications') !== false && !!deger('quietHoursEnabled'), not: '"Sessiz saatler" kapalıyken kullanılmaz.' },
      { anahtar: 'chatReplyText', kosul: () => !!deger('chatAutoReply'), not: '"Otomatik yanıt gönder" kapalıyken kullanılmaz.' },
      { anahtar: 'chatReplyCooldown', kosul: () => !!deger('chatAutoReply'), not: '"Otomatik yanıt gönder" kapalıyken kullanılmaz.' },
    ];
    function ayarKapilariniBoya(){
      AYAR_KAPILARI.forEach(({ anahtar, kosul, not }) => {
        const el = ayarSatiri(anahtar);
        if (!el) return;
        const acik = !!kosul();
        el.style.opacity = acik ? '1' : '.4';
        el.style.pointerEvents = acik ? '' : 'none';
        el.title = acik ? '' : t(not);
      });
    }

    // Kayıtlı ayar değişince ilgili sayfalar anında yeniden çizilir. degisen: Kaydet ile
    // değişen anahtarlar; sayfa varsayılanları (mod, süre) kullanıcı sayfada elle seçmiş olsa da
    // kaydedilen değere geçer, çünkü kullanıcı onu az önce açıkça seçti.
    function applySettingsEverywhere(first, degisen){
      ayarKapilariniBoya();
      if (typeof applyDensity === 'function') applyDensity();
      // Yan menü daraltılmış başlasın
      if (first && typeof sideNav !== 'undefined' && sideNav && appSettings.sidebarCollapsed) {
        sideNav.classList.add('collapsed');
        if (typeof setRailChevron === 'function') setRailChevron();
      }
      if (degisen && degisen.includes('sidebarCollapsed') && typeof sideNav !== 'undefined' && sideNav){
        sideNav.classList.toggle('collapsed', !!appSettings.sidebarCollapsed);
        try { localStorage.setItem('imu_side_collapsed', appSettings.sidebarCollapsed ? '1' : '0'); } catch(_){}
        if (typeof setRailChevron === 'function') setRailChevron();
      }
      paintCurrencySymbols();
      if (typeof applyCurrencyLabels === 'function') applyCurrencyLabels();
      if (typeof applyFarmSettings === 'function') applyFarmSettings(degisen);
      if (typeof applyInvSettings === 'function' && typeof invMerged !== 'undefined' && invMerged) applyInvSettings();
      if (typeof applyBoostSettings === 'function') applyBoostSettings(degisen);
      if (typeof acApplySettings === 'function') acApplySettings();
      if (typeof renderEnv === 'function' && typeof invMerged !== 'undefined' && invMerged) renderEnv();
      if (typeof renderKart === 'function' && typeof kartLoaded !== 'undefined' && kartLoaded) renderKart();
      if (typeof renderAchievements === 'function' && typeof acData !== 'undefined' && acData) renderAchievements();
      if (typeof renderGenelStats === 'function') renderGenelStats();
      if (typeof renderLifeStats === 'function') renderLifeStats();
    }

    // Açılış sayfası (Ayarlar > Genel > "Açılış sayfası")
    function applyStartPage(){
      const map = { overview:'genel', farm:'kart', hub:'env', boost:'saat', ach:'basarim' };
      const tab = map[appSettings.startPage];
      if (!tab || tab === 'genel') return;
      const a = document.querySelector('.nav a[data-tab='+tab+']');
      if (a) a.click();
    }

    // Sessiz saatler: "23:00"→"08:00" gibi gece yarısını saran aralıkları da doğru ele alır.
    // kaynak: hangi ayar nesnesine bakılacağı (test bildirimi taslağa bakar).
    function inQuietHours(kaynak){
      const a = kaynak || appSettings;
      if (!a.quietHoursEnabled) return false;
      const [fh,fm] = (a.quietFrom||'23:00').split(':').map(Number);
      const [th,tm] = (a.quietTo||'08:00').split(':').map(Number);
      const now = new Date(), cur = now.getHours()*60+now.getMinutes();
      const f = fh*60+(fm||0), to = th*60+(tm||0);
      return f <= to ? (cur>=f && cur<to) : (cur>=f || cur<to);
    }
    function notify(kind, title, body){
      if (!appSettings.notifications) return;
      if (kind==='farm'  && !appSettings.notifyFarm)  return;
      if (kind==='boost' && !appSettings.notifyBoost) return;
      if (kind==='error' && !appSettings.notifyError) return;
      if (kind==='ach'   && !appSettings.notifyAch)   return;
      // Fiyat düşüşü kendi anahtarına bağlı; hata bildirimi kapatılınca susmaz.
      if (kind==='fiyat' && !appSettings.notifyPriceDrop) return;
      if (inQuietHours()) return;
      // Ana süreç üzerinden gönderilir; Windows toast'ları renderer'dan sessizce düşüyordu.
      window.imu.notify(t(title), t(body||'')).catch(()=>{});
      if (typeof playNotifSound === 'function') playNotifSound();
    }

    // ---- bölüm gezinmesi (sol 194px sütun) ----
    let currentSetSec = 'general';
    function showSetSection(sec){
      currentSetSec = sec;
      if (sec === 'advanced' && typeof bellekOku === 'function') bellekOku();
      document.querySelectorAll('#tab-ayarlar .setpanel').forEach(p=>{
        p.style.display = (p.getAttribute('data-sec')===sec) ? '' : 'none';
      });
      document.querySelectorAll('#tab-ayarlar [data-secbtn]').forEach(b=>{
        const on = b.getAttribute('data-secbtn')===sec;
        b.style.background  = on ? SC.s3 : 'transparent';
        b.style.color       = on ? SC.title : SC.muted;
        b.style.borderColor = on ? SC.bdActive : 'transparent';
      });
    }
    document.querySelectorAll('#tab-ayarlar [data-secbtn]').forEach(b=>{
      b.addEventListener('click', ()=>showSetSection(b.getAttribute('data-secbtn')));
    });

    // Üst çubuktaki dişli ikonu bunu çağırır (bkz common.js #tbSettings). Ayarlar zaten
    // açıksa yalnızca bölüm değişir: taslak korunur, yapılmış değişiklikler kaybolmaz.
    function openAyarlar(sec){
      const zatenAcik = !designed.ayarlar.classList.contains('hidden');
      if (!zatenAcik){
        Object.values(designed).forEach(s=>s.classList.add('hidden'));
        document.getElementById('tab-empty').classList.add('hidden');
        designed.ayarlar.classList.remove('hidden');
        document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
      }
      loadAyarlar();
      showSetSection(sec || currentSetSec);
    }

    // Ayar satırlarındaki para birimi ekleri (ör. "Düşük değer eşiği" yanındaki ₺) seçili
    // Para birimi Steam cüzdanından gelir, sabit sembol yazılmaz.
    function paintCurrencySymbols(){
      const sym  = (typeof curSym  === 'function') ? curSym()  : '';
      const code = (typeof curCode === 'function') ? (curCode() || '-') : '-';
      const sub  = (typeof curSubunit === 'function') ? curSubunit() : 'birim';
      document.querySelectorAll('#tab-ayarlar [data-cursym]').forEach(e=>{ e.textContent = sym; });
      document.querySelectorAll('#tab-ayarlar [data-curcode]').forEach(e=>{ e.textContent = code; });
      // "Alt sıralama miktarı" birimi: USD hesapta "kuruş" değil "sent" yazmalı
      document.querySelectorAll('#tab-ayarlar [data-cursub]').forEach(e=>{ e.textContent = sub; });
    }

    // "Fiyat kaynağı" satırı. Kur seçimi kaldırıldı: tutarlar HER ZAMAN Steam hesabının
    // cüzdan kurunda gösterilir, hiçbir çeviri yapılmaz - böylece "44.898,67" gibi kur/ayraç
    // kaynaklı yanlış tutarlar mümkün değil.
    function paintFxInfo(){
      const note = document.getElementById('setFxNote');
      const rateEl = document.getElementById('setFxRate');
      if (!note || !rateEl) return;
      const cur = (typeof curCode === 'function') ? curCode() : null;
      if (!cur){
        note.textContent = 'Pazar kuru henüz okunmadı - Steam oturumu bekleniyor';
        rateEl.textContent = '-';
        rateEl.style.color = '#B37E24';
        return;
      }
      note.textContent = 'Steam Topluluk Pazarı kurun - tutarlar aynen bu kurda, çeviri yok';
      rateEl.textContent = cur;
      rateEl.style.color = '#5FB324';
    }

    // ---- kontrolleri boya ----
    function paintToggle(el, on){
      el.style.background  = on ? SC.brand : SC.s3;
      el.style.borderColor = on ? SC.brand : SC.bd;
      const knob = el.firstElementChild;
      if (knob){ knob.style.background = on ? SC.title : SC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
    }
    function kontrolleriBoya(){
      document.querySelectorAll('#tab-ayarlar [data-set]').forEach(el=>{
        const key = el.getAttribute('data-set');
        const v = deger(key);
        if (el.tagName === 'DIV') { paintToggle(el, !!v); return; }
        // Varsayılan otomatik yanıt metni arayüz dilinde gösterilir (gönderilen de odur, bkz
        // main.js > applyChatSettings). Kullanıcının yazdığı metin olduğu gibi kalır.
        if (key === 'chatReplyText' && varsayilanAyarlar && v === varsayilanAyarlar.chatReplyText){ el.value = t(v); return; }
        if (v != null) el.value = v;
        // Kayıtlı değer listede yoksa kutu BOŞ görünürdü. İlk seçenek gösterilir ve TASLAĞA
        // yazılır (değişiklik sayılır): kullanıcı görür, Kaydet'le düzeltilir. Sessizce diske
        // yazılmaz. Bilinen eski değerler zaten ana süreçte taşınıyor (ayarlariGecir).
        if (el.tagName === 'SELECT' && el.selectedIndex < 0 && el.options.length){
          el.selectedIndex = 0;
          if (taslak) taslak[key] = turUydur(key, el.value);
        }
      });
    }
    function paintAll(){
      kontrolleriBoya();
      ayarKapilariniBoya();
      degisiklikleriGoster();
      paintCurrencySymbols();
      const set=(id,tx)=>{ const e=document.getElementById(id); if(e) e.textContent=tx; };
      set('setPersona', appSettings.persona || '-');
      set('setSteamID', appSettings.steamID || '-');
      // Steam avatarı varsa görsel, yoksa baş harf (sağ üstteki hesap rozetiyle aynı davranış)
      const av = document.getElementById('setAvatar');
      if (av){
        const initials = (String(appSettings.persona||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,2) || '-').toUpperCase();
        const url = (typeof imuProfile === 'object' && imuProfile && imuProfile.avatar) || null;
        av.style.overflow = 'hidden';
        av.innerHTML = url
          ? '<img src="'+esc(url)+'" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit" onerror="this.parentNode.textContent=\''+initials+'\'">'
          : initials;
      }
      paintFxInfo();
      baglantiDurumunuYaz();
      yapilandirmaKartiniYaz();
      // Sürüm package.json'dan gelir (preload > imu.surum). Elle yazılan sürüm satırı yok.
      const surum = (window.imu && window.imu.surum) || '';
      set('setVersion', surum ? ('SteamEdge v' + surum) : 'SteamEdge');
      set('setVersionSide', surum ? ('v' + surum) : '-');
      showSetSection(currentSetSec);
    }

    // ---- Hesap Statüsü: motorun son bildirdiği bağlantı durumu, tahmin değil ----
    let aktifBaglanti = { durum: 'yok' };
    const BAGLANTI_GORUNUM = {
      bagli:      { metin: 'Bağlı',                renk: '#5FB324' },
      baglaniyor: { metin: 'Yeniden bağlanıyor',   renk: '#B37E24' },
      koptu:      { metin: 'Bağlantı koptu',       renk: '#B32453' },
      vazgecildi: { metin: 'Bağlantı kurulamadı',  renk: '#B32453' },
      yok:        { metin: 'Bağlı değil',          renk: '#8B8F9E' },
    };
    function baglantiDurumunuYaz(){
      const el = document.getElementById('setAcctStatus');
      if (!el) return;
      const g = BAGLANTI_GORUNUM[aktifBaglanti.durum] || BAGLANTI_GORUNUM.yok;
      el.textContent = t(g.metin);
      el.style.color = g.renk;
      el.title = (aktifBaglanti.durum === 'bagli' && aktifBaglanti.ts)
        ? (t('Bağlantı kuruldu:') + ' ' + new Date(aktifBaglanti.ts).toLocaleString(yerelKod())) : '';
    }
    async function baglantiDurumunuOku(){
      const d = await window.imu.engine.baglantiDurumu().catch(()=>null);
      aktifBaglanti = d || { durum: 'yok' };
      baglantiDurumunuYaz();
    }
    if (window.imu.engine && window.imu.engine.onDurum){
      window.imu.engine.onDurum((d)=>{
        if (!d || !d.aktif) return;
        aktifBaglanti = { durum: d.durum, ts: d.durum === 'bagli' ? Date.now() : null };
        baglantiDurumunuYaz();
      });
    }

    // ---- Yapılandırma kartı: son kayıt ve profil ----
    function kayitZamaniMetni(ts){
      if (!ts) return '-';
      const d = new Date(ts), bugun = new Date();
      const saat = d.toLocaleTimeString(yerelKod(), { hour:'2-digit', minute:'2-digit' });
      return d.toDateString() === bugun.toDateString() ? saat : (d.toLocaleDateString(yerelKod()) + ' ' + saat);
    }
    function yapilandirmaKartiniYaz(){
      const son = document.getElementById('setLastSync');
      if (son) son.textContent = kayitZamaniMetni(ayarKayitZamani);
      // "Profil": kayıtlı ayarlardan kaçı varsayılandan farklı. Dil sayılmaz.
      const pr = document.getElementById('setProfile');
      if (!pr) return;
      if (!varsayilanAyarlar){ pr.textContent = '-'; return; }
      const fark = sayfaAnahtarlari().filter(k => k !== 'language' && k in varsayilanAyarlar
        && !ayni(turUydurVarsayilan(k, appSettings[k]), varsayilanAyarlar[k])).length;
      pr.textContent = fark ? tf('Özel · # ayar', fark) : t('Varsayılan');
    }
    function turUydurVarsayilan(k, v){
      const o = varsayilanAyarlar[k];
      if (typeof o === 'number'){ const n = Number(v); return Number.isFinite(n) ? n : v; }
      return v;
    }
    async function yapilandirmaBilgisiniOku(){
      const [v, b] = await Promise.all([
        varsayilanAyarlar ? Promise.resolve(varsayilanAyarlar) : S.varsayilanlar().catch(()=>null),
        S.bilgi().catch(()=>null),
      ]);
      if (v) varsayilanAyarlar = v;
      if (b) ayarKayitZamani = b.kayitZamani || null;
      yapilandirmaKartiniYaz();
    }

    // ================= BELLEK GÖSTERGESİ =================
    // Ölçüm ana süreçten geliyor (app.getAppMetrics), tahmin değil. Yalnızca Ayarlar >
    // Gelişmiş görünürken ve pencere açıkken güncellenir - göstergenin kendisi bellek
    // ölçmek uğruna arka planda dönmesin.
    let memTimer = null;
    function bellekYaz(d){
      // Değişken adı bilerek "t" değil: t() çeviri işlevini gölgeliyordu ve süreç adları
      // hiçbir dilde çevrilmiyordu.
      const toplam = document.getElementById('memTotal');
      const b = document.getElementById('memBreak');
      if (!toplam) return;
      if (!d){ toplam.textContent = '-'; return; }
      const mb = (kb)=> (kb/1024);
      toplam.textContent = mb(d.toplamKb).toFixed(0) + ' MB';
      // Süreç türleri: Browser = ana süreç, Tab = arayüz, GPU = ekran kartı, Utility = ağ.
      // Anahtarlar bilerek uzun: tek kelimelik anahtar sözlükte başka metinleri de yakalardı.
      const ad = { Browser:'ana süreç', Tab:'arayüz süreci', GPU:'ekran kartı süreci', Utility:'ağ süreci' };
      const parcalar = (d.surecler||[])
        .map(p => t(ad[p.tur] || p.tur) + ' ' + mb(p.kb).toFixed(0))
        .join(' · ');
      b.textContent = parcalar ? (parcalar + '  (MB)') : t('Tüm SteamEdge süreçlerinin toplamı');
    }
    async function bellekOku(){
      if (document.hidden) return;
      if (typeof currentSetSec === 'string' && currentSetSec !== 'advanced') return;
      if (designed.ayarlar.classList.contains('hidden')) return;
      const d = await window.imu.appBellek().catch(()=>null);
      bellekYaz(d);
    }
    // Gorsel ve ag onbellegini bosalt. Uzun oturumlarda binlerce oyun kapagi birikiyor;
    // ayar ve oturum kaybi olmadan bellegi geri kazanmanin en dogrudan yolu bu.
    (function bellekTemizleBagla(){
      const b = document.getElementById('memTemizle');
      if (!b) return;
      b.onclick = async ()=>{
        b.disabled = true; b.style.opacity = '0.5';
        const ts = (typeof toast === 'function') ? toast('Önbellek boşaltılıyor...') : null;
        const r = await window.imu.appBellekTemizle().catch(e=>({ ok:false, error:(e&&e.message) }));
        b.disabled = false; b.style.opacity = '1';
        if (!r || !r.ok){ if (ts) ts.fail((r && r.error) || 'Boşaltılamadı.'); return; }
        const mb = Math.round((r.kazancKb || 0) / 1024);
        if (ts) ts.done(mb > 0 ? tf('# MB geri alındı.', mb) : 'Önbellek boşaltıldı.');
        bellekOku();
      };
    })();

    function bellekIzlemeKur(){
      if (memTimer) return;
      memTimer = setInterval(bellekOku, 4000);
      bellekOku();
    }
    bellekIzlemeKur();

    // Sayfaya giriş: kayıtlı ayarlar okunur, taslak YOKSA kurulur. Taslak varsa (hesap
    // değişti, dişliye yeniden basıldı) korunur; kullanıcının kaydetmediği değişiklik kaybolmaz.
    async function loadAyarlar(){
      appSettings = await S.get() || {};
      if (!taslak) taslakBaslat();
      // Sayfa ÖNCE çizilir; profil ve bağlantı durumu gelince kendi alanlarını günceller.
      paintAll();
      renderLifeStats();    // kalıcı istatistikler
      loadProfile();        // beklenmez
      baglantiDurumunuOku();
      yapilandirmaBilgisiniOku();
    }

    // Test bildirimi: TASLAKTAKİ ses ve sessiz saat seçimleriyle gerçek bildirimi dener;
    // kaydetmeden önce denemek için. Hiçbir şey kaydetmez.
    const testBtn = document.getElementById('setTestNotif');
    if (testBtn) testBtn.onclick = async ()=>{
      const a = taslak ? { ...appSettings, ...taslak } : appSettings;
      if (!a.notifications){
        toast('Test bildirimi').fail('Önce "Masaüstü bildirimlerini göster" anahtarını aç.');
        return;
      }
      if (inQuietHours(a)){
        edgeConfirm({ tag:'Test bildirimi', title:'Sessiz saatler şu an aktif',
          body: (a.quietFrom||'23:00') + ' - ' + (a.quietTo||'08:00') + '\n' + t('Bu aralıkta bildirim gösterilmez.'),
          confirmText:'Tamam', tekDugme:true });
        return;
      }
      testBtn.disabled = true;
      const r = await window.imu.notify('SteamEdge',
        t('Bildirimler çalışıyor ✓') + '  ·  ' + t('ses:') + ' ' + (a.notifSound || 'chime')).catch(e=>({ ok:false, error:(e&&e.message) }));
      testBtn.disabled = false;
      if (typeof playNotifSound === 'function') playNotifSound(a.notifSound);
      if (r && r.ok){
        toast('Test bildirimi').done('Bildirim gönderildi. Görünmediyse Windows > Ayarlar > Bildirimler altında SteamEdge iznini kontrol et.');
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'Bildirim gösterilemedi',
                      body: (r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', tekDugme:true });
      }
    };

    // Hakkında > yapımcı ve teşekkür bağlantıları - dış tarayıcıda açılır
    document.querySelectorAll('#tab-ayarlar [data-gh]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        window.imu.openExternal('https://github.com/' + a.getAttribute('data-gh'));
      });
    });

    // ---- kontroller: yalnızca taslağı değiştirir ----
    // Bu anahtarlar Chromium'a app.whenReady()'den ONCE veriliyor; degistirmek ancak
    // uygulama yeniden acilinca etki eder. Kaydedince bu soylenir.
    const YENIDEN_BASLAT = ['hwAccel', 'gpuArkaUc', 'gpuKompozisyon'];
    function taslagaYaz(key, val){
      if (!taslak) taslakBaslat();
      taslak[key] = val;
      degisiklikleriGoster();
      ayarKapilariniBoya();
    }
    document.querySelectorAll('#tab-ayarlar [data-set]').forEach(el=>{
      const key = el.getAttribute('data-set');
      if (el.tagName === 'DIV'){
        el.addEventListener('click', ()=>{
          const val = !deger(key);
          paintToggle(el, val);
          taslagaYaz(key, val);
        });
      } else {
        el.addEventListener('change', ()=>{
          let val = el.value;
          if (el.type === 'number'){
            const mn = el.min!=='' ? +el.min : -Infinity, mx = el.max!=='' ? +el.max : Infinity;
            val = Math.max(mn, Math.min(mx, +val || 0));
            el.value = val;
          }
          taslagaYaz(key, turUydur(key, val));
          // Ses seçilince hemen çal - kullanıcı deneyerek seçebilsin (kaydetmez)
          if (key === 'notifSound' && typeof playNotifSound === 'function') playNotifSound(val);
        });
      }
    });

    // ---- Kaydet ----
    async function ayarlariKaydet(){
      if (kaydediliyor) return false;
      const liste = degisenler();
      if (!liste.length){
        if (typeof toast === 'function') toast('Ayarlar').done('Kaydedilecek değişiklik yok.');
        return true;
      }
      const yama = {};
      liste.forEach(k=>{ yama[k] = taslak[k]; });
      kaydediliyor = true;
      const btn = document.getElementById('setSave');
      if (btn) btn.disabled = true;
      const r = await S.kaydet(yama).catch(e=>({ ok:false, error:(e && e.message) }));
      kaydediliyor = false;
      if (btn) btn.disabled = false;
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Ayarlar kaydedilemedi',
                      body: t((r && r.error) || 'Bilinmeyen hata.'), confirmText:'Tamam', tekDugme:true });
        return false;
      }
      appSettings = r.settings || appSettings;
      if (r.kayitZamani) ayarKayitZamani = r.kayitZamani;
      const dilDegisti = liste.includes('language');
      taslakBaslat();
      paintAll();
      applySettingsEverywhere(false, liste);
      // Dil değişti: çevrilmiş metin geri çevrilemediği için sayfa yeniden yüklenir; Ayarlar'ın
      // aynı bölümüne dönülür (bkz i18n.js > setUiLang).
      if (dilDegisti && typeof setUiLang === 'function'){ setUiLang(appSettings.language); return true; }
      kayitSonucunuSoyle(r, liste);
      return true;
    }
    const IS_ADI = { kart:'Kart düşürme', saat:'Saat yükseltme', sirali:'Sıralı saat yükseltme' };
    function kayitSonucunuSoyle(r, liste){
      const satirlar = [];
      const duraklayan = (r.uygulanan || []).filter(u => u.nasil === 'duraklatildi');
      const coklu = new Set((r.uygulanan || []).map(u => u.steamID)).size > 1;
      duraklayan.forEach(u => satirlar.push(t(IS_ADI[u.is] || u.is) + (coklu ? (' (' + u.hesap + ')') : '') + ': '
        + tf('# sn duraklatıldı, yeni ayarla sürecek.', Math.round((r.duraklamaMs || 5000) / 1000))));
      (r.uygulanan || []).filter(u => u.nasil === 'aninda').forEach(u => satirlar.push(t(IS_ADI[u.is] || u.is)
        + (coklu ? (' (' + u.hesap + ')') : '') + ': ' + t('yeni ayar hemen uygulandı.')));
      (r.uygulanan || []).filter(u => u.nasil === 'bekletildi').forEach(u => satirlar.push(t('Kart düşürme')
        + (coklu ? (' (' + u.hesap + ')') : '') + ': ' + t('saat yükseltme bitene kadar duraklatıldı.')));
      (r.uygulanan || []).filter(u => u.nasil === 'surduruldu').forEach(u => satirlar.push(t('Kart düşürme')
        + (coklu ? (' (' + u.hesap + ')') : '') + ': ' + t('kaldığı yerden sürüyor.')));
      if (liste.some(k => YENIDEN_BASLAT.includes(k))) satirlar.push(t('Grafik ayarları SteamEdge yeniden başlatılınca etkili olur.'));
      const baslik = tf('# ayar kaydedildi.', liste.length);
      if (typeof toast === 'function') toast('Ayarlar').done(satirlar.length ? (t(baslik) + ' ' + satirlar.join(' ')) : baslik);
    }
    document.getElementById('setSave').onclick = ()=>{ ayarlariKaydet(); };

    // ---- Değişiklikleri geri al ----
    function taslagiGeriAl(){
      if (!taslakTaban) return;
      taslak = kopya(taslakTaban);
      paintAll();
    }
    const geriBtn = document.getElementById('setDiscard');
    if (geriBtn) geriBtn.onclick = ()=>{ taslagiGeriAl(); if (typeof toast === 'function') toast('Ayarlar').done('Değişiklikler geri alındı.'); };

    // Ayarlar sekmesinden çıkarken çağrılır (common.js sekme değiştirici). true: çıkılabilir.
    async function confirmLeaveSettings(){
      const liste = degisenler();
      if (!liste.length){ taslakBitir(); return true; }
      const adlar = liste.map(ayarEtiketi);
      const r = await edgeConfirm({
        tag: 'Kaydedilmemiş Değişiklik',
        title: tf('# ayar kaydedilmedi', liste.length),
        body: t('Değişen:') + ' ' + adlar.slice(0, 6).join(', ') + (adlar.length > 6 ? ' …' : ''),
        warn: 'Kaydetmezsen bu değişiklikler uygulanmaz ve kaybolur.',
        confirmText: 'Kaydet ve Çık',
        altText: 'Kaydetmeden Çık',
        cancelText: 'Sayfada Kal',
      });
      if (r === false) return false;
      if (r === 'alt'){ taslakBitir(); return true; }
      const ok = await ayarlariKaydet();
      if (!ok) return false;
      taslakBitir();
      return true;
    }

    // ---- Sıfırla: varsayılanlar TASLAĞA yüklenir, Kaydet'e basılana kadar hiçbir şey olmaz ----
    // Dil dokunulmaz (sıfırlamak arayüzü sessizce Türkçeye çekiyordu). Hesaba özel veri
    // (seçili oyunlar, istatistikler) ve oturum bu sayfanın ayarı değil, onlar da etkilenmez.
    document.getElementById('setReset').onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'Sıfırla', danger:true, title:'Bu sayfadaki ayarlar varsayılana dönecek',
        body:'Varsayılan değerler sayfaya yüklenir; Kaydet\'e basana kadar hiçbir şey uygulanmaz. Uygulama dili, seçili oyunlar, istatistikler ve Steam oturumun etkilenmez.',
        confirmText:'Varsayılanları Yükle' });
      if (!ok) return;
      if (!varsayilanAyarlar) varsayilanAyarlar = await S.varsayilanlar().catch(()=>null);
      if (!varsayilanAyarlar){ toast('Sıfırlama').fail('Varsayılanlar okunamadı.'); return; }
      if (!taslak) taslakBaslat();
      sayfaAnahtarlari().forEach(k=>{
        if (k === 'language' || !(k in varsayilanAyarlar)) return;
        taslak[k] = kopya(varsayilanAyarlar[k]);
      });
      paintAll();
      const n = degisenler().length;
      if (typeof toast === 'function') toast('Sıfırlama').done(n ? tf('# ayar varsayılana döndü. Uygulamak için Kaydet\'e bas.', n) : 'Ayarlar zaten varsayılan.');
    };
    document.getElementById('setLogout').onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'Çıkış', title:'Steam oturumu kapatılsın mı?',
        body:'Giriş ekranına dönülür. Kayıtlı hesaplar silinmez.', confirmText:'Çıkış Yap' });
      if (ok) window.imu.logout();
    };
    document.getElementById('setSteamID').onclick = ()=>{
      if (!appSettings.steamID) return;
      navigator.clipboard.writeText(appSettings.steamID);
      if (typeof toast === 'function') toast('Kopyalandı').done('SteamID panoya kopyalandı.');
    };

    // ---- Kayıt dosyası ----
    const logAc = document.getElementById('setLogOpen');
    if (logAc) logAc.onclick = async ()=>{
      const r = await window.imu.log.open().catch(e=>({ ok:false, error:(e && e.message) }));
      if (r && r.ok === false) toast('Kayıt dosyası').fail(t(r.error || 'Açılamadı.'));
    };

    // ---- Gelişmiş alt düğmeleri ----
    const fiyatTemizle = document.getElementById('setPriceCacheClear');
    if (fiyatTemizle) fiyatTemizle.onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'Fiyat Önbelleği', title:'Fiyat önbelleği temizlensin mi?',
        body:'Kayıtlı en düşük fiyatlar ve satış geçmişi silinir. Envanter açılınca fiyatlar Steam\'den yeniden çekilir; büyük envanterde bu birkaç dakika sürebilir.',
        confirmText:'Temizle' });
      if (!ok) return;
      await S.clearPriceCache().catch(()=>{});
      if (typeof priceMap !== 'undefined') priceMap.clear();
      if (typeof historyMap !== 'undefined' && historyMap && historyMap.clear) historyMap.clear();
      if (typeof renderEnv === 'function' && typeof invMerged !== 'undefined' && invMerged) renderEnv();
      toast('Fiyat Önbelleği').done('Fiyat önbelleği temizlendi.');
    };
    const klasorAc = document.getElementById('setOpenFolder');
    if (klasorAc) klasorAc.onclick = ()=>{ S.openConfigFolder().catch(()=>{}); };

    // ---- İstatistikler ----
    const istSifirla = document.getElementById('setStatsReset');
    if (istSifirla) istSifirla.onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'İstatistikler', danger:true, title:'Bu hesabın istatistikleri sıfırlansın mı?',
        body: tf('Hesap: #', appSettings.persona || '-') + '\n' + t('Toplam çalışma, düşen kart, satış ve rekorlar sıfırlanır. Diğer hesapların istatistikleri etkilenmez.'),
        warn:'Bu işlem geri alınamaz.', confirmText:'Sıfırla' });
      if (!ok) return;
      const r = await window.imu.stats.reset().catch(()=>null);
      if (r && typeof renderLifeStats === 'function') renderLifeStats(r);
      toast('İstatistikler').done('İstatistikler sıfırlandı.');
    };

    // ---- Yedekleme ----
    async function disaAktar(){
      const r = await S.export().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (r && r.canceled) return;
      if (r && r.ok){
        setBackupInfo(t('Son dışa aktarma:') + ' ' + r.file);
        if (typeof toast === 'function') toast('Dışa aktarma').done('Yedek kaydedildi.');
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'Dışa aktarılamadı',
                      body:(r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', tekDugme:true });
      }
    }
    // İçe aktarma DOSYADAKİ ayarları doğrudan kaydeder ve uygular (kullanıcı dosyayı seçerek
    // açıkça onaylıyor). Sayfada kaydedilmemiş değişiklik varsa önce sorulur.
    async function iceAktar(){
      const bekleyen = degisenler().length;
      const ok = await edgeConfirm({ tag:'İçe Aktar', title:'Yedekten geri yüklensin mi?',
        body:'Seçeceğin dosyadaki ayarlar mevcut ayarların ÜZERİNE yazılır ve hemen uygulanır. Bu bilgisayarda kayıtlı hesapların istatistikleri ve seçili oyunları da yedekten geri gelir.'
             + (bekleyen ? ('\n\n' + tf('Sayfada kaydedilmemiş # değişiklik var; bunlar kaybolur.', bekleyen)) : ''),
        warn:'Steam oturumun ve kayıtlı hesapların etkilenmez.', confirmText:'Dosya Seç' });
      if (!ok) return;
      const r = await S.import().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (r && r.canceled) return;
      if (r && r.ok){
        appSettings = r.settings;
        taslakBaslat();
        await renderLifeStats();
        paintAll();
        applySettingsEverywhere(false, Object.keys(appSettings));
        yapilandirmaBilgisiniOku();
        setBackupInfo(t('Son içe aktarma:') + ' ' + r.file);
        if (typeof toast === 'function') toast('İçe aktarma').done(tf('# ayar geri yüklendi.', r.applied)
          + (r.hesapSayisi ? (' ' + tf('# hesabın verisi geri yüklendi.', r.hesapSayisi)) : ''));
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'İçe aktarılamadı',
                      body:(r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', tekDugme:true });
      }
    }
    document.getElementById('setExport').onclick = disaAktar;
    document.getElementById('setImport').onclick = iceAktar;
    const disa2 = document.getElementById('setExport2'); if (disa2) disa2.onclick = disaAktar;
    const ice2 = document.getElementById('setImport2'); if (ice2) ice2.onclick = iceAktar;
    function setBackupInfo(tx){ const e = document.getElementById('setBackupInfo'); if (e) e.textContent = tx; }

    document.getElementById('setWipeAll').onclick = async ()=>{
      const ok1 = await edgeConfirm({ tag:'Tehlikeli Bölge', danger:true, title:'TÜM YEREL VERİ SİLİNECEK',
        body:'Oturum, kayıtlı hesaplar, ayarlar, kalıcı istatistikler ve fiyat önbelleği kalıcı olarak silinir ve giriş ekranına dönülür.',
        warn:'Steam hesabın etkilenmez - sadece bu bilgisayardaki uygulama verisi temizlenir.',
        confirmText:'Devam' });
      if (!ok1) return;
      const ok2 = await edgeConfirm({ tag:'Son Onay', danger:true, title:'Bu işlem geri alınamaz',
        body:'Gerçekten tüm veriyi silmek istiyor musun?', confirmText:'Evet, Hepsini Sil' });
      if (!ok2) return;
      await S.wipeAll();
    };

    showSetSection('general');
