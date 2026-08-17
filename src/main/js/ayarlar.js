    // ================= AYARLAR =================
    // Her kontrol data-set="<ayar anahtarı>" taşır; değişiklikler buradan
    // settings.json dosyasına yazılır.
    let appSettings = {};
    const S = window.imu.settings;

    // palet kısayolları
    const SC = { brand:'#5624B3', s3:'#151C28', bd:'#2B3345', title:'#DCE2FA', off:'#656D80', muted:'#8B8F9E', bdActive:'#5624B3' };

    S.get().then(s => {
      appSettings = s || {};
      // Dili ayarlardan baslat: metinler cizilmeden once devreye girmeli.
      if (typeof initI18n === 'function') initI18n(appSettings.language);
      paintAll();
      applySettingsEverywhere(true);
      // Açılış sayfası sadece uygulama ilk açıldığında uygulanır (genel.js yüklendikten sonra)
      setTimeout(applyStartPage, 0);
    });

    // Bir ayar değişince ilgili sayfaları anında yeniden çizer - "kaydettim ama hiçbir şey
    // olmadı" durumunu ortadan kaldırır.
    function applySettingsEverywhere(first){
      if (typeof applyDensity === 'function') applyDensity();
      // Yan menü daraltılmış başlasın
      if (first && typeof sideNav !== 'undefined' && sideNav && appSettings.sidebarCollapsed) {
        sideNav.classList.add('collapsed');
        if (typeof setRailChevron === 'function') setRailChevron();
      }
      paintCurrencySymbols();
      if (typeof applyCurrencyLabels === 'function') applyCurrencyLabels();
      if (typeof applyFarmSettings === 'function') applyFarmSettings();
      if (typeof applyInvSettings === 'function' && typeof invMerged !== 'undefined' && invMerged) applyInvSettings();
      if (typeof applyBoostSettings === 'function') applyBoostSettings();
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
    function inQuietHours(){
      if (!appSettings.quietHoursEnabled) return false;
      const [fh,fm] = (appSettings.quietFrom||'23:00').split(':').map(Number);
      const [th,tm] = (appSettings.quietTo||'08:00').split(':').map(Number);
      const now = new Date(), cur = now.getHours()*60+now.getMinutes();
      const f = fh*60+(fm||0), t = th*60+(tm||0);
      return f <= t ? (cur>=f && cur<t) : (cur>=f || cur<t);
    }
    function notify(kind, title, body){
      if (!appSettings.notifications) return;
      if (kind==='farm'  && !appSettings.notifyFarm)  return;
      if (kind==='boost' && !appSettings.notifyBoost) return;
      if (kind==='error' && !appSettings.notifyError) return;
      if (kind==='ach'   && !appSettings.notifyAch)   return;
      if (inQuietHours()) return;
      // Ana süreç üzerinden gönderilir; Windows toast'ları renderer'dan sessizce düşüyordu.
      window.imu.notify(title, body||'').catch(()=>{});
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

    // Üst çubuktaki dişli ikonu bunu çağırır (bkz common.js #tbSettings).
    function openAyarlar(sec){
      Object.values(designed).forEach(s=>s.classList.add('hidden'));
      document.getElementById('tab-empty').classList.add('hidden');
      designed.ayarlar.classList.remove('hidden');
      document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
      loadAyarlar().then(snapshotSettings);
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

    // ---- kontrolleri ayarlardan boya ----
    function paintToggle(el, on){
      el.style.background  = on ? SC.brand : SC.s3;
      el.style.borderColor = on ? SC.brand : SC.bd;
      const knob = el.firstElementChild;
      if (knob){ knob.style.background = on ? SC.title : SC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
    }
    function paintAll(){
      const fixes = {};
      document.querySelectorAll('#tab-ayarlar [data-set]').forEach(el=>{
        const key = el.getAttribute('data-set');
        const v = appSettings[key];
        if (el.tagName === 'DIV') { paintToggle(el, !!v); return; }
        if (v != null) el.value = v;
        // Kayıtlı değer artık listede yoksa <select> BOŞ görünür. Bildirim sesi listesi
        // yenilendiğinde eski ses adı kaydedilmiş kullanıcılarda tam olarak bu oluyordu.
        // Böyle bir durumda ilk seçeneğe düşülür ve düzeltme kalıcı olarak yazılır.
        if (el.tagName === 'SELECT' && el.selectedIndex < 0 && el.options.length){
          el.selectedIndex = 0;
          fixes[key] = el.value;
        }
      });
      if (Object.keys(fixes).length){
        S.set(fixes).then(s=>{ appSettings = s; });
      }
      paintCurrencySymbols();
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
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
      set('setAcctStatus', appSettings.steamID ? 'Bağlı' : 'Bağlı değil');
      set('setLastSync', appSettings.steamID ? 'Şimdi' : '-');
      // Sürüm package.json'dan gelir (preload > imu.surum). Elle yazılan sürüm satırı yok.
      const surum = (window.imu && window.imu.surum) || '';
      set('setVersion', surum ? ('SteamEdge v' + surum) : 'SteamEdge');
      set('setVersionSide', surum ? ('v' + surum) : '-');
      showSetSection(currentSetSec);
    }

    // ================= BELLEK GÖSTERGESİ =================
    // Ölçüm ana süreçten geliyor (app.getAppMetrics), tahmin değil. Yalnızca Ayarlar >
    // Gelişmiş görünürken ve pencere açıkken güncellenir - göstergenin kendisi bellek
    // ölçmek uğruna arka planda dönmesin.
    let memTimer = null;
    function bellekYaz(d){
      const t = document.getElementById('memTotal');
      const b = document.getElementById('memBreak');
      if (!t) return;
      if (!d){ t.textContent = '-'; return; }
      const mb = (kb)=> (kb/1024);
      t.textContent = mb(d.toplamKb).toFixed(0) + ' MB';
      // Süreç türleri: Browser = ana süreç, Tab = arayüz, GPU = ekran kartı, Utility = ağ.
      // Kırılım metni JS'te birleştiği için DOM çevirisine takılmaz; adları burada t() ile
      // geçiriyoruz. Anahtarlar bilerek uzun: tek kelimelik anahtar sözlükte başka metinleri
      // de yakalardı.
      const ad = { Browser:'ana süreç', Tab:'arayüz süreci', GPU:'ekran kartı süreci', Utility:'ağ süreci' };
      const cev = (s)=> (typeof t === 'function' ? t(s) : s);
      const parcalar = (d.surecler||[])
        .map(p => cev(ad[p.tur] || p.tur) + ' ' + mb(p.kb).toFixed(0))
        .join(' · ');
      b.textContent = parcalar ? (parcalar + '  (MB)') : 'Tüm SteamEdge süreçlerinin toplamı';
    }
    async function bellekOku(){
      if (document.hidden) return;
      if (typeof currentSetSec === 'string' && currentSetSec !== 'advanced') return;
      if (designed.ayarlar.classList.contains('hidden')) return;
      const d = await window.imu.appBellek().catch(()=>null);
      bellekYaz(d);
    }
    function bellekIzlemeKur(){
      if (memTimer) return;
      memTimer = setInterval(bellekOku, 4000);
      bellekOku();
    }
    bellekIzlemeKur();

    async function loadAyarlar(){
      appSettings = await S.get() || {};
      // Profil (avatar dahil) gelmeden boyarsak avatar yerine baş harf kalır - önce profili çek.
      await loadProfile();
      paintAll();
      renderLifeStats();    // kalıcı istatistikler
    }

    // Test bildirimi - seçili ses/sessiz-saat ayarlarıyla birlikte gerçek bildirimi dener.
    const testBtn = document.getElementById('setTestNotif');
    if (testBtn) testBtn.onclick = async ()=>{
      if (!appSettings.notifications){
        alert('Önce "Masaüstü bildirimlerini göster" anahtarını aç.');
        return;
      }
      if (inQuietHours()){
        alert('Sessiz saatler şu an aktif ('+(appSettings.quietFrom||'23:00')+'-'+(appSettings.quietTo||'08:00')+').\nBu aralıkta bildirim gösterilmez.');
        return;
      }
      testBtn.disabled = true;
      const r = await window.imu.notify('SteamEdge',
        'Bildirimler çalışıyor ✓  ·  ses: ' + (appSettings.notifSound || 'chime')).catch(e=>({ ok:false, error:(e&&e.message) }));
      testBtn.disabled = false;
      if (typeof playNotifSound === 'function') playNotifSound();
      if (r && r.ok){
        toast('Test bildirimi').done('Bildirim gönderildi. Görünmediyse Windows > Ayarlar > Bildirimler altında SteamEdge iznini kontrol et.');
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'Bildirim gösterilemedi',
                      body: (r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', cancelText:'Kapat' });
      }
    };

    // Hakkında > yapımcı ve teşekkür bağlantıları - dış tarayıcıda açılır
    document.querySelectorAll('#tab-ayarlar [data-gh]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        window.imu.openExternal('https://github.com/' + a.getAttribute('data-gh'));
      });
    });

    // ---- değişiklikleri kaydet ----
    // Değişiklikler ANINDA arayüze uygulanır (etkiyi görürsün) ve settings.json'a yazılır,
    // ama "kaydedilmemiş" sayacı hangi anahtarların bu ziyarette değiştiğini tutar. Ayarlardan
    // çıkarken bu liste doluysa kullanıcıya sorulur; "Geri Al" derse ziyaret başındaki
    // değerlere dönülür (snapshot).
    let dirtyKeys = new Set();
    let settingsSnapshot = null;     // ayarlar sekmesine girildiği andaki değerler
    function markDirty(key){
      if (key) dirtyKeys.add(key);
      const d = document.getElementById('setDirty');
      if (d) d.textContent = dirtyKeys.size ? (dirtyKeys.size + ' değişiklik') : 'yok';
    }
    function snapshotSettings(){
      settingsSnapshot = JSON.parse(JSON.stringify(appSettings || {}));
      dirtyKeys = new Set();
      markDirty();
    }
    // Ayarlar sekmesinden çıkarken çağrılır (common.js sekme değiştirici + üst çubuk).
    // true dönerse çıkışa izin verilir.
    async function confirmLeaveSettings(){
      if (!dirtyKeys.size) return true;
      const list = [...dirtyKeys].slice(0, 6).join(', ') + (dirtyKeys.size > 6 ? ' …' : '');
      const r = await edgeConfirm({
        tag: 'Kaydedilmemiş Değişiklik',
        title: dirtyKeys.size + ' ayarı değiştirdin',
        body: 'Değişiklikler zaten uygulandı ve diske yazıldı.\nDeğişen: ' + list,
        warn: '“Geri Al” dersen bu sayfaya girdiğin andaki değerlere dönülür.',
        confirmText: 'Kaydet ve Çık',
        altText: 'Geri Al',
        cancelText: 'Sayfada Kal',
      });
      if (r === false) return false;
      if (r === 'alt' && settingsSnapshot){
        appSettings = await S.set(settingsSnapshot);
        paintAll();
        applySettingsEverywhere();
      }
      snapshotSettings();
      return true;
    }
    document.querySelectorAll('#tab-ayarlar [data-set]').forEach(el=>{
      const key = el.getAttribute('data-set');
      if (el.tagName === 'DIV'){
        el.addEventListener('click', async ()=>{
          const val = !appSettings[key];
          paintToggle(el, val);
          appSettings = await S.set({ [key]: val });
          markDirty(key);
          if (key === 'notifications') paintAll();
          applySettingsEverywhere();
        });
      } else {
        el.addEventListener('change', async ()=>{
          let val = el.value;
          if (el.type === 'number'){
            const mn = el.min!=='' ? +el.min : -Infinity, mx = el.max!=='' ? +el.max : Infinity;
            val = Math.max(mn, Math.min(mx, +val || 0));
            el.value = val;
          }
          appSettings = await S.set({ [key]: val });
          markDirty(key);
          // Dil degisti: cevrilmis metni geri cevirmek mumkun degil, sayfa yeniden yuklenir.
          if (key === 'language'){ if (typeof setUiLang === 'function') setUiLang(val); return; }
          // Ses seçilince hemen çal - kullanıcı deneyerek seçebilsin
          if (key === 'notifSound' && typeof playNotifSound === 'function') playNotifSound(val);
          applySettingsEverywhere();
        });
      }
    });

    // Ayarlar anında kaydediliyor; "Kaydet" diske flush edip geri bildirim verir.
    document.getElementById('setSave').onclick = async ()=>{
      await S.set({});
      snapshotSettings();
      const l = document.getElementById('setLastSync'); if (l) l.textContent = 'Şimdi';
      if (typeof toast === 'function') toast('Ayarlar kaydedildi.').done('Ayarlar kaydedildi.');
    };
    document.getElementById('setReset').onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'Sıfırla', danger:true, title:'Tüm ayarlar varsayılana dönecek',
        body:'Seçili oyunlar ve tercihler sıfırlanır. Kalıcı istatistikler ve Steam oturumun etkilenmez.',
        confirmText:'Sıfırla' });
      if (!ok) return;
      appSettings = await S.reset();
      snapshotSettings();
      paintAll();
      applySettingsEverywhere();
      if (typeof toast === 'function') toast('Sıfırlama').done('Ayarlar varsayılana döndü.');
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

    // ---- Yedekleme ----
    document.getElementById('setExport').onclick = async ()=>{
      const r = await S.export().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (r && r.canceled) return;
      if (r && r.ok){
        setBackupInfo('Son dışa aktarma: ' + r.file);
        if (typeof toast === 'function') toast('Dışa aktarma').done('Yedek kaydedildi.');
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'Dışa aktarılamadı',
                      body:(r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', cancelText:'Kapat' });
      }
    };
    document.getElementById('setImport').onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'İçe Aktar', title:'Yedekten geri yüklensin mi?',
        body:'Seçeceğin dosyadaki ayarlar mevcut ayarların ÜZERİNE yazılır.',
        warn:'Steam oturumun ve kayıtlı hesapların etkilenmez.', confirmText:'Dosya Seç' });
      if (!ok) return;
      const r = await S.import().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (r && r.canceled) return;
      if (r && r.ok){
        appSettings = r.settings;
        snapshotSettings();
        await renderLifeStats();   // istatistikler de yedekten gelmiş olabilir
        paintAll();
        applySettingsEverywhere();
        setBackupInfo('Son içe aktarma: ' + r.file);
        if (typeof toast === 'function') toast('İçe aktarma').done(r.applied + ' ayar geri yüklendi.');
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'İçe aktarılamadı',
                      body:(r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', cancelText:'Kapat' });
      }
    };
    function setBackupInfo(t){ const e = document.getElementById('setBackupInfo'); if (e) e.textContent = t; }

    document.getElementById('setWipeAll').onclick = async ()=>{
      const ok1 = await edgeConfirm({ tag:'Tehlikeli Bölge', danger:true, title:'TÜM YEREL VERİ SİLİNECEK',
        body:'Oturum, kayıtlı hesaplar, ayarlar, kalıcı istatistikler ve fiyat önbelleği kalıcı olarak silinir '
             + 've giriş ekranına dönülür.',
        warn:'Steam hesabın etkilenmez - sadece bu bilgisayardaki uygulama verisi temizlenir.',
        confirmText:'Devam' });
      if (!ok1) return;
      const ok2 = await edgeConfirm({ tag:'Son Onay', danger:true, title:'Bu işlem geri alınamaz',
        body:'Gerçekten tüm veriyi silmek istiyor musun?', confirmText:'Evet, Hepsini Sil' });
      if (!ok2) return;
      await S.wipeAll();
    };

    showSetSection('general');
