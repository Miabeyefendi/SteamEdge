    // ================= SETTINGS =================
    // Every control carries data-set="<setting key>".
    //
    // SAVE MODEL. Changes on the page stay only in the DRAFT until "Kaydet" is pressed:
    // they are not written to disk and not applied to any job. Kaydet sends the changed keys to the main process; there they are
    // written, applied, and the running jobs affected by the change are paused for a few seconds and resumed with the new
    // setting. Every click used to be written to disk instantly, "Kaydet" did nothing,
    // and even turning a switch on and back off counted as an "unsaved change".
    let appSettings = {};          // SAVED settings: the rest of the app reads this
    const S = window.imu.settings;
    let draft = null;             // the values on the page that are not saved yet
    let draftBase = null;        // the saved values at the moment the page was entered
    let defaultSettings = null;  // once from the main process, for Reset and the "Profil" row
    let settingSaveTime = null;
    let saving = false;

    // palette shortcuts
    const SC = { brand:'#5624B3', s3:'#151C28', bd:'#2B3345', title:'#DCE2FA', off:'#656D80', muted:'#8B8F9E', bdActive:'#5624B3' };

    S.get().then(s => {
      appSettings = s || {};
      // Start the language from the settings: it must take effect before the texts are drawn.
      if (typeof initI18n === 'function') initI18n(appSettings.language);
      // The last known profile comes with the settings too (main.js > account file). So that the name,
      // avatar and level can be written to the screen before the Steam session is even set up, this is the first job.
      if (typeof cachedProfile === 'function') cachedProfile();
      paintAll();
      applySettingsEverywhere(true);
      // The startup page is applied only when the app first opens (after overview.js has loaded)
      setTimeout(applyStartPage, 0);
    });

    // ---- draft ----
    function copy(o){ return JSON.parse(JSON.stringify(o == null ? null : o)); }
    function pageKeys(){
      const set = new Set();
      document.querySelectorAll('#tab-settings [data-set]').forEach(el=>set.add(el.getAttribute('data-set')));
      return [...set];
    }
    // The value on the page: from the draft if there is one, otherwise from the saved setting.
    function rawValue(k){ return (draft && k in draft) ? draft[k] : appSettings[k]; }
    function startDraft(){
      draftBase = {};
      pageKeys().forEach(k=>{ draftBase[k] = copy(appSettings[k]); });
      draft = copy(draftBase);
      showChanges();
    }
    function finishDraft(){ draft = null; draftBase = null; }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function changes(){
      if (!draft) return [];
      return Object.keys(draft).filter(k => !same(draft[k], draftBase[k]));
    }
    // A select box always returns text; if the saved value is a number it is converted to a number. Otherwise
    // "90" and 90 would count as different and a reverted choice would still look "changed".
    function matchType(k, v){
      const sample = (draftBase && draftBase[k] !== undefined) ? draftBase[k]
                  : (defaultSettings ? defaultSettings[k] : undefined);
      if (typeof sample === 'number'){ const n = Number(v); return Number.isFinite(n) ? n : sample; }
      if (typeof sample === 'boolean') return !!v;
      return v;
    }
    function settingRow(k){
      const el = document.querySelector('#tab-settings [data-set="'+k+'"]');
      return el ? el.closest('[data-setting-row]') : null;
    }
    // The page name of a changed setting (shown in the exit question instead of the key name)
    function settingLabel(k){
      const rowEl = settingRow(k);
      const name = rowEl && rowEl.querySelector('span[style*="font-weight:600"]');
      return name ? name.textContent.trim() : k;
    }

    function showChanges(){
      const n = changes().length;
      const d = document.getElementById('setDirty');
      if (d) d.textContent = n ? tf('# değişiklik', n) : t('yok');
      const save = document.getElementById('setSave');
      if (save){
        save.style.opacity = n ? '1' : '.55';
        save.style.boxShadow = n ? '0 0 0 3px rgba(86,36,179,.35)' : 'none';
        save.title = n ? '' : t('Kaydedilecek değişiklik yok.');
      }
      const backward = document.getElementById('setDiscard');
      if (backward) backward.style.display = n ? '' : 'none';
    }

    // ---- dependent settings ----
    // Places where one setting depends on another. When the dependent one is off the row is dimmed
    // and cannot be clicked; we do not leave a switch that looks on and does nothing. This trap
    // was met in 1.1.10 at the achievement unlock interval. The conditions look at the DRAFT: when the parent setting is
    // turned off on the page the child dims right away, no need to save.
    const NOTIFICATIONS_OFF = 'Masaüstü bildirimleri kapalıyken hiçbir bildirim gösterilmez.';
    const SETTING_GATES = [
      { keyField: 'achSpread', ruleCondition: () => rawValue('achSafeMode') !== false, not: 'Güvenli mod kapalıyken açılış aralığı sapmaz.' },
      { keyField: 'undercutCents', ruleCondition: () => rawValue('saleMode') === 'undercut', not: 'Yalnızca varsayılan satış fiyatı "En ucuzun altına in" iken kullanılır.' },
      { keyField: 'priceRefreshMin', ruleCondition: () => !!rawValue('autoRefreshPrices'), not: '"Fiyatları otomatik yenile" kapalıyken fiyatlar kendiliğinden yenilenmez.' },
      { keyField: 'sellBatchWaitMin', ruleCondition: () => +rawValue('bulkSellLimit') > 0, not: 'Parti büyüklüğü 0 iken satış partilere bölünmez.' },
      { keyField: 'shuffleBoost', ruleCondition: () => !!appSettings.seqIdle, not: 'Yalnızca Saat Yükseltici\'de sıralı bekletme açıkken geçerli; eş zamanlı yükseltmede sıra yoktur.' },
      { keyField: 'boostSyncMode', ruleCondition: () => !!rawValue('boostSync'), not: '"Saatleri eşitle" kapalıyken kullanılmaz.' },
      { keyField: 'boostSyncTargetHours', ruleCondition: () => !!rawValue('boostSync') && rawValue('boostSyncMode') === 'manual', not: 'Yalnızca hedef "Elle girilen saat" iken kullanılır.' },
      { keyField: 'notifyFarm', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'notifyBoost', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'notifyAch', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'notifyError', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'notifyPriceDrop', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'quietHoursEnabled', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'notifSound', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'notifyChat', ruleCondition: () => rawValue('notifications') !== false, not: NOTIFICATIONS_OFF },
      { keyField: 'farmScheduleFrom', ruleCondition: () => !!rawValue('farmScheduleEnabled'), not: '"Kart düşürme zamanlayıcısı" kapalıyken kullanılmaz.' },
      { keyField: 'farmScheduleTo', ruleCondition: () => !!rawValue('farmScheduleEnabled'), not: '"Kart düşürme zamanlayıcısı" kapalıyken kullanılmaz.' },
      { keyField: 'quietFrom', ruleCondition: () => rawValue('notifications') !== false && !!rawValue('quietHoursEnabled'), not: '"Sessiz saatler" kapalıyken kullanılmaz.' },
      { keyField: 'chatReplyText', ruleCondition: () => !!rawValue('chatAutoReply'), not: '"Otomatik yanıt gönder" kapalıyken kullanılmaz.' },
      { keyField: 'chatReplyCooldown', ruleCondition: () => !!rawValue('chatAutoReply'), not: '"Otomatik yanıt gönder" kapalıyken kullanılmaz.' },
    ];
    function paintSettingGates(){
      SETTING_GATES.forEach(({ keyField: keyName, ruleCondition: condition, not }) => {
        const el = settingRow(keyName);
        if (!el) return;
        const isOpen = !!condition();
        el.style.opacity = isOpen ? '1' : '.4';
        el.style.pointerEvents = isOpen ? '' : 'none';
        el.title = isOpen ? '' : t(not);
      });
    }

    // When a saved setting changes the related pages are redrawn instantly. degisen: the keys that
    // changed with Kaydet; the page defaults (mode, duration) move to the saved value even if the user picked them by hand
    // on the page, because the user explicitly chose it a moment ago.
    function applySettingsEverywhere(first, changed){
      paintSettingGates();
      if (typeof applyDensity === 'function') applyDensity();
      // Start with the sidebar collapsed
      if (first && typeof sideNav !== 'undefined' && sideNav && appSettings.sidebarCollapsed) {
        sideNav.classList.add('collapsed');
        if (typeof setRailChevron === 'function') setRailChevron();
      }
      if (changed && changed.includes('sidebarCollapsed') && typeof sideNav !== 'undefined' && sideNav){
        sideNav.classList.toggle('collapsed', !!appSettings.sidebarCollapsed);
        try { localStorage.setItem('imu_side_collapsed', appSettings.sidebarCollapsed ? '1' : '0'); } catch(_){}
        if (typeof setRailChevron === 'function') setRailChevron();
      }
      paintCurrencySymbols();
      if (typeof applyCurrencyLabels === 'function') applyCurrencyLabels();
      if (typeof applyFarmSettings === 'function') applyFarmSettings(changed);
      if (typeof applyInvSettings === 'function' && typeof invMerged !== 'undefined' && invMerged) applyInvSettings();
      if (typeof applyBoostSettings === 'function') applyBoostSettings(changed);
      if (typeof acApplySettings === 'function') acApplySettings();
      if (typeof renderInventory === 'function' && typeof invMerged !== 'undefined' && invMerged) renderInventory();
      if (typeof renderCards === 'function' && typeof cardsLoaded !== 'undefined' && cardsLoaded) renderCards();
      if (typeof renderAchievements === 'function' && typeof acData !== 'undefined' && acData) renderAchievements();
      if (typeof renderOverviewStats === 'function') renderOverviewStats();
      if (typeof renderLifeStats === 'function') renderLifeStats();
    }

    // Startup page (Ayarlar > Genel > "Start page")
    function applyStartPage(){
      const map = { overview:'overview', farm:'card', hub:'inventory', boost:'hours', ach:'achievements' };
      const tab = map[appSettings.startPage];
      if (!tab || tab === 'overview') return;
      const a = document.querySelector('.nav a[data-tab='+tab+']');
      if (a) a.click();
    }

    // Quiet hours: it handles ranges that wrap around midnight like "23:00"→"08:00" correctly too.
    // source: which settings object to look at (the test notification looks at the draft).
    function inQuietHours(source){
      const a = source || appSettings;
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
      // The price drop is tied to its own key; it does not go quiet when the error notification is turned off.
      if (kind==='price' && !appSettings.notifyPriceDrop) return;
      if (inQuietHours()) return;
      // Sent through the main process; Windows toasts were silently dropped from the renderer.
      window.imu.notify(t(title), t(body||'')).catch(()=>{});
      if (typeof playNotifSound === 'function') playNotifSound();
    }

    // ---- section navigation (the left 194px column) ----
    let currentSetSec = 'general';
    function showSetSection(pick){
      currentSetSec = pick;
      if (pick === 'advanced' && typeof readMemory === 'function') readMemory();
      document.querySelectorAll('#tab-settings .setpanel').forEach(p=>{
        p.style.display = (p.getAttribute('data-sec')===pick) ? '' : 'none';
      });
      document.querySelectorAll('#tab-settings [data-secbtn]').forEach(b=>{
        const on = b.getAttribute('data-secbtn')===pick;
        b.style.background  = on ? SC.s3 : 'transparent';
        b.style.color       = on ? SC.title : SC.muted;
        b.style.borderColor = on ? SC.bdActive : 'transparent';
      });
    }
    document.querySelectorAll('#tab-settings [data-secbtn]').forEach(b=>{
      b.addEventListener('click', ()=>showSetSection(b.getAttribute('data-secbtn')));
    });

    // The gear icon in the top bar calls this (see common.js #tbSettings). If Settings is already
    // open only the section changes: the draft is kept, changes already made are not lost.
    function openSettingsPage(pick){
      const alreadyOpen = !designed.settings.classList.contains('hidden');
      if (!alreadyOpen){
        Object.values(designed).forEach(s=>s.classList.add('hidden'));
        document.getElementById('tab-empty').classList.add('hidden');
        designed.settings.classList.remove('hidden');
        document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
      }
      loadSettingsPage();
      showSetSection(pick || currentSetSec);
    }

    // The currency suffixes in setting rows (e.g. the ₺ next to "Low-value threshold") follow the selected
    // currency; it comes from the Steam wallet, no fixed symbol is written.
    function paintCurrencySymbols(){
      const sym  = (typeof curSym  === 'function') ? curSym()  : '';
      const code = (typeof curCode === 'function') ? (curCode() || '-') : '-';
      const sub  = (typeof curSubunit === 'function') ? curSubunit() : 'birim';
      document.querySelectorAll('#tab-settings [data-cursym]').forEach(e=>{ e.textContent = sym; });
      document.querySelectorAll('#tab-settings [data-curcode]').forEach(e=>{ e.textContent = code; });
      // The unit of "Undercut amount": in a USD account it must say "sent", not "cents"
      document.querySelectorAll('#tab-settings [data-cursub]').forEach(e=>{ e.textContent = sub; });
    }

    // The "Price source" row. The currency choice was removed: amounts are ALWAYS shown in the Steam account's
    // wallet currency, no conversion is done - so wrong amounts caused by currency/separators
    // like "44.898,67" are impossible.
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

    // ---- paint the controls ----
    function paintToggle(el, on){
      el.style.background  = on ? SC.brand : SC.s3;
      el.style.borderColor = on ? SC.brand : SC.bd;
      const knob = el.firstElementChild;
      if (knob){ knob.style.background = on ? SC.title : SC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
    }
    function paintControls(){
      document.querySelectorAll('#tab-settings [data-set]').forEach(el=>{
        const key = el.getAttribute('data-set');
        const v = rawValue(key);
        if (el.tagName === 'DIV') { paintToggle(el, !!v); return; }
        // The default automatic reply text is shown in the interface language (and that is what is sent, see
        // main.js > applyChatSettings). Text the user wrote stays as it is.
        if (key === 'chatReplyText' && defaultSettings && v === defaultSettings.chatReplyText){ el.value = t(v); return; }
        if (v != null) el.value = v;
        // If the saved value is not in the list the box would look EMPTY. The first option is shown and WRITTEN TO THE DRAFT
        // (it counts as a change): the user sees it and fixes it with Kaydet. It is not silently
        // written to disk. Known old values are already carried over in the main process (migrateSettings).
        if (el.tagName === 'SELECT' && el.selectedIndex < 0 && el.options.length){
          el.selectedIndex = 0;
          if (draft) draft[key] = matchType(key, el.value);
        }
      });
    }
    function paintAll(){
      paintControls();
      paintSettingGates();
      showChanges();
      paintCurrencySymbols();
      const set=(id,tx)=>{ const e=document.getElementById(id); if(e) e.textContent=tx; };
      set('setPersona', appSettings.persona || '-');
      set('setSteamID', appSettings.steamID || '-');
      // If there is a Steam avatar an image, otherwise the initial (same behaviour as the account badge top right)
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
      writeConnectionState();
      writeConfigCard();
      // The version comes from package.json (preload > imu.versionStr). There is no hand-written version line.
      const version = (window.imu && window.imu.versionStr) || '';
      set('setVersion', version ? ('SteamEdge v' + version) : 'SteamEdge');
      set('setVersionSide', version ? ('v' + version) : '-');
      showSetSection(currentSetSec);
    }

    // ---- Account status: the connection state the engine last reported, not a guess ----
    let activeConnection = { condition: 'none' };
    const CONNECTION_VIEW = {
      connected:      { textValue: 'Bağlı',                colorValue: '#5FB324' },
      connecting: { textValue: 'Yeniden bağlanıyor',   colorValue: '#B37E24' },
      dropped:      { textValue: 'Bağlantı koptu',       colorValue: '#B32453' },
      abandoned: { textValue: 'Bağlantı kurulamadı',  colorValue: '#B32453' },
      none:        { textValue: 'Bağlı değil',          colorValue: '#8B8F9E' },
    };
    function writeConnectionState(){
      const el = document.getElementById('setAcctStatus');
      if (!el) return;
      const g = CONNECTION_VIEW[activeConnection.condition] || CONNECTION_VIEW.none;
      el.textContent = t(g.textValue);
      el.style.color = g.colorValue;
      el.title = (activeConnection.condition === 'connected' && activeConnection.ts)
        ? (t('Bağlantı kuruldu:') + ' ' + new Date(activeConnection.ts).toLocaleString(localCode())) : '';
    }
    async function readConnectionState(){
      const d = await window.imu.engine.connectionStatus().catch(()=>null);
      activeConnection = d || { condition: 'none' };
      writeConnectionState();
    }
    if (window.imu.engine && window.imu.engine.onStatus){
      window.imu.engine.onStatus((d)=>{
        if (!d || !d.activeIds) return;
        activeConnection = { condition: d.condition, ts: d.condition === 'connected' ? Date.now() : null };
        writeConnectionState();
      });
    }

    // ---- Configuration card: last save and profile ----
    function saveTimeText(ts){
      if (!ts) return '-';
      const d = new Date(ts), today = new Date();
      const hour = d.toLocaleTimeString(localCode(), { hour:'2-digit', minute:'2-digit' });
      return d.toDateString() === today.toDateString() ? hour : (d.toLocaleDateString(localCode()) + ' ' + hour);
    }
    function writeConfigCard(){
      const latest = document.getElementById('setLastSync');
      if (latest) latest.textContent = saveTimeText(settingSaveTime);
      // "Profil": how many of the saved settings differ from the default. The language does not count.
      const pr = document.getElementById('setProfile');
      if (!pr) return;
      if (!defaultSettings){ pr.textContent = '-'; return; }
      const difference = pageKeys().filter(k => k !== 'language' && k in defaultSettings
        && !same(matchTypeDefault(k, appSettings[k]), defaultSettings[k])).length;
      pr.textContent = difference ? tf('Özel · # ayar', difference) : t('Varsayılan');
    }
    function matchTypeDefault(k, v){
      const o = defaultSettings[k];
      if (typeof o === 'number'){ const n = Number(v); return Number.isFinite(n) ? n : v; }
      return v;
    }
    async function readConfigInfo(){
      const [v, b] = await Promise.all([
        defaultSettings ? Promise.resolve(defaultSettings) : S.defaultsMap().catch(()=>null),
        S.details().catch(()=>null),
      ]);
      if (v) defaultSettings = v;
      if (b) settingSaveTime = b.saveTime || null;
      writeConfigCard();
    }

    // ================= MEMORY GAUGE =================
    // The measurement comes from the main process (app.getAppMetrics), not a guess. It is updated only while Ayarlar >
    // Advanced is visible and the window is open - so the gauge itself does not keep running in the background
    // just to measure memory.
    let memTimer = null;
    function writeMemory(d){
      // The variable name is deliberately not "t": t() was shadowing the translation function and the process names
      // were not translated in any language.
      const sumTotal = document.getElementById('memTotal');
      const b = document.getElementById('memBreak');
      if (!sumTotal) return;
      if (!d){ sumTotal.textContent = '-'; return; }
      const mb = (kb)=> (kb/1024);
      sumTotal.textContent = mb(d.totalKb).toFixed(0) + ' MB';
      // Process types: Browser = main process, Tab = interface, GPU = graphics card, Utility = network.
      // The keys are deliberately long: a one-word key would catch other texts in the dictionary too.
      const name = { Browser:'ana süreç', Tab:'arayüz süreci', GPU:'ekran kartı süreci', Utility:'ağ süreci' };
      const pieces = (d.processList||[])
        .map(p => t(name[p.typeName] || p.typeName) + ' ' + mb(p.kb).toFixed(0))
        .join(' · ');
      b.textContent = pieces ? (pieces + '  (MB)') : t('Tüm SteamEdge süreçlerinin toplamı');
    }
    async function readMemory(){
      if (document.hidden) return;
      if (typeof currentSetSec === 'string' && currentSetSec !== 'advanced') return;
      if (designed.settings.classList.contains('hidden')) return;
      const d = await window.imu.appMemory().catch(()=>null);
      writeMemory(d);
    }
    // Empty the image and network cache. In long sessions thousands of game covers pile up;
    // this is the most direct way to win memory back without losing settings or session.
    (function bindMemoryClear(){
      const b = document.getElementById('memClear');
      if (!b) return;
      b.onclick = async ()=>{
        b.disabled = true; b.style.opacity = '0.5';
        const ts = (typeof toast === 'function') ? toast('Önbellek boşaltılıyor...') : null;
        const r = await window.imu.appMemoryClear().catch(e=>({ ok:false, error:(e&&e.message) }));
        b.disabled = false; b.style.opacity = '1';
        if (!r || !r.ok){ if (ts) ts.fail((r && r.error) || 'Boşaltılamadı.'); return; }
        const mb = Math.round((r.gainKb || 0) / 1024);
        if (ts) ts.done(mb > 0 ? tf('# MB geri alındı.', mb) : 'Önbellek boşaltıldı.');
        readMemory();
      };
    })();

    function setupMemoryMonitor(){
      if (memTimer) return;
      memTimer = setInterval(readMemory, 4000);
      readMemory();
    }
    setupMemoryMonitor();

    // Entering the page: the saved settings are read, the draft is set up if there is NONE. If there is a draft (the account
    // changed, the gear was pressed again) it is kept; changes the user did not save are not lost.
    async function loadSettingsPage(){
      appSettings = await S.get() || {};
      if (!draft) startDraft();
      // The page is drawn FIRST; the profile and connection state update their own fields when they arrive.
      paintAll();
      renderLifeStats();    // lifetime statistics
      loadProfile();        // not waited for
      readConnectionState();
      readConfigInfo();
    }

    // Test notification: tries the real notification with the sound and quiet hours choices in the DRAFT;
    // to try before saving. It saves nothing.
    const testBtn = document.getElementById('setTestNotif');
    if (testBtn) testBtn.onclick = async ()=>{
      const a = draft ? { ...appSettings, ...draft } : appSettings;
      if (!a.notifications){
        toast('Test bildirimi').fail('Önce "Masaüstü bildirimlerini göster" anahtarını aç.');
        return;
      }
      if (inQuietHours(a)){
        edgeConfirm({ tag:'Test bildirimi', title:'Sessiz saatler şu an aktif',
          body: (a.quietFrom||'23:00') + ' - ' + (a.quietTo||'08:00') + '\n' + t('Bu aralıkta bildirim gösterilmez.'),
          confirmText:'Tamam', singleButton:true });
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
                      body: (r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', singleButton:true });
      }
    };

    // About > author and credits links - opened in the external browser
    document.querySelectorAll('#tab-settings [data-gh]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        window.imu.openExternal('https://github.com/' + a.getAttribute('data-gh'));
      });
    });

    // ---- controls: they only change the draft ----
    // These switches are given to Chromium BEFORE app.whenReady(); changing them only takes effect
    // when the app is reopened. Saving says so.
    const RESTART = ['hwAccel', 'gpuBackend', 'gpuComposition'];
    function writeToDraft(key, val){
      if (!draft) startDraft();
      draft[key] = val;
      showChanges();
      paintSettingGates();
    }
    document.querySelectorAll('#tab-settings [data-set]').forEach(el=>{
      const key = el.getAttribute('data-set');
      if (el.tagName === 'DIV'){
        el.addEventListener('click', ()=>{
          const val = !rawValue(key);
          paintToggle(el, val);
          writeToDraft(key, val);
        });
      } else {
        el.addEventListener('change', ()=>{
          let val = el.value;
          if (el.type === 'number'){
            const mn = el.min!=='' ? +el.min : -Infinity, mx = el.max!=='' ? +el.max : Infinity;
            val = Math.max(mn, Math.min(mx, +val || 0));
            el.value = val;
          }
          writeToDraft(key, matchType(key, val));
          // Play the sound as soon as it is chosen - so the user can choose by trying (does not save)
          if (key === 'notifSound' && typeof playNotifSound === 'function') playNotifSound(val);
        });
      }
    });

    // ---- Save ----
    async function persistSettings(){
      if (saving) return false;
      const listing = changes();
      if (!listing.length){
        if (typeof toast === 'function') toast('Ayarlar').done('Kaydedilecek değişiklik yok.');
        return true;
      }
      const patchData = {};
      listing.forEach(k=>{ patchData[k] = draft[k]; });
      saving = true;
      const btn = document.getElementById('setSave');
      if (btn) btn.disabled = true;
      const r = await S.saveIt(patchData).catch(e=>({ ok:false, error:(e && e.message) }));
      saving = false;
      if (btn) btn.disabled = false;
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Ayarlar kaydedilemedi',
                      body: t((r && r.error) || 'Bilinmeyen hata.'), confirmText:'Tamam', singleButton:true });
        return false;
      }
      appSettings = r.settings || appSettings;
      if (r.saveTime) settingSaveTime = r.saveTime;
      const langChanged = listing.includes('language');
      startDraft();
      paintAll();
      applySettingsEverywhere(false, listing);
      // The language changed: since translated text cannot be translated back the page is reloaded; it returns to
      // the same section of Ayarlar (see i18n.js > setUiLang).
      if (langChanged && typeof setUiLang === 'function'){ setUiLang(appSettings.language); return true; }
      announceSaveResult(r, listing);
      return true;
    }
    const JOB_NAME = { card:'Kart düşürme', hours:'Saat yükseltme', sequential:'Sıralı saat yükseltme' };
    function announceSaveResult(r, listing){
      const rowsList = [];
      const pausing = (r.appliedOne || []).filter(u => u.how === 'paused');
      const multi = new Set((r.appliedOne || []).map(u => u.steamID)).size > 1;
      pausing.forEach(u => rowsList.push(t(JOB_NAME[u.is] || u.is) + (multi ? (' (' + u.accountRef + ')') : '') + ': '
        + tf('# sn duraklatıldı, yeni ayarla sürecek.', Math.round((r.pauseMs || 5000) / 1000))));
      (r.appliedOne || []).filter(u => u.how === 'instant').forEach(u => rowsList.push(t(JOB_NAME[u.is] || u.is)
        + (multi ? (' (' + u.accountRef + ')') : '') + ': ' + t('yeni ayar hemen uygulandı.')));
      (r.appliedOne || []).filter(u => u.how === 'delayed').forEach(u => rowsList.push(t('Kart düşürme')
        + (multi ? (' (' + u.accountRef + ')') : '') + ': ' + t('saat yükseltme bitene kadar duraklatıldı.')));
      (r.appliedOne || []).filter(u => u.how === 'resumed').forEach(u => rowsList.push(t('Kart düşürme')
        + (multi ? (' (' + u.accountRef + ')') : '') + ': ' + t('kaldığı yerden sürüyor.')));
      if (listing.some(k => RESTART.includes(k))) rowsList.push(t('Grafik ayarları SteamEdge yeniden başlatılınca etkili olur.'));
      if (listing.includes('proxyUrl')) rowsList.push(t('Vekil, hesap yeniden bağlanınca etkili olur.'));
      const title = tf('# ayar kaydedildi.', listing.length);
      if (typeof toast === 'function') toast('Ayarlar').done(rowsList.length ? (t(title) + ' ' + rowsList.join(' ')) : title);
    }
    document.getElementById('setSave').onclick = ()=>{ persistSettings(); };

    // ---- Revert changes ----
    function revertDraft(){
      if (!draftBase) return;
      draft = copy(draftBase);
      paintAll();
    }
    const returnBtn = document.getElementById('setDiscard');
    if (returnBtn) returnBtn.onclick = ()=>{ revertDraft(); if (typeof toast === 'function') toast('Ayarlar').done('Değişiklikler geri alındı.'); };

    // Called when leaving the Ayarlar tab (common.js tab switcher). true: it may be left.
    async function confirmLeaveSettings(){
      const listing = changes();
      if (!listing.length){ finishDraft(); return true; }
      const names = listing.map(settingLabel);
      const r = await edgeConfirm({
        tag: 'Kaydedilmemiş Değişiklik',
        title: tf('# ayar kaydedilmedi', listing.length),
        body: t('Değişen:') + ' ' + names.slice(0, 6).join(', ') + (names.length > 6 ? ' …' : ''),
        warn: 'Kaydetmezsen bu değişiklikler uygulanmaz ve kaybolur.',
        confirmText: 'Kaydet ve Çık',
        subText: 'Kaydetmeden Çık',
        cancelText: 'Sayfada Kal',
      });
      if (r === false) return false;
      if (r === 'alt'){ finishDraft(); return true; }
      const ok = await persistSettings();
      if (!ok) return false;
      finishDraft();
      return true;
    }

    // ---- Reset: defaults are loaded into the DRAFT, nothing happens until Kaydet is pressed ----
    // The language is not touched (reset used to silently pull the interface to Turkish). Per-account data
    // (selected games, statistics) and the session are not this page's setting, they are not affected either.
    document.getElementById('setReset').onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'Sıfırla', danger:true, title:'Bu sayfadaki ayarlar varsayılana dönecek',
        body:'Varsayılan değerler sayfaya yüklenir; Kaydet\'e basana kadar hiçbir şey uygulanmaz. Uygulama dili, seçili oyunlar, istatistikler ve Steam oturumun etkilenmez.',
        confirmText:'Varsayılanları Yükle' });
      if (!ok) return;
      if (!defaultSettings) defaultSettings = await S.defaultsMap().catch(()=>null);
      if (!defaultSettings){ toast('Sıfırlama').fail('Varsayılanlar okunamadı.'); return; }
      if (!draft) startDraft();
      pageKeys().forEach(k=>{
        if (k === 'language' || !(k in defaultSettings)) return;
        draft[k] = copy(defaultSettings[k]);
      });
      paintAll();
      const n = changes().length;
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

    // ---- Log file ----
    const openLog = document.getElementById('setLogOpen');
    if (openLog) openLog.onclick = async ()=>{
      const r = await window.imu.log.open().catch(e=>({ ok:false, error:(e && e.message) }));
      if (r && r.ok === false) toast('Kayıt dosyası').fail(t(r.error || 'Açılamadı.'));
    };

    // ---- Advanced bottom buttons ----
    const clearPrice = document.getElementById('setPriceCacheClear');
    if (clearPrice) clearPrice.onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'Fiyat Önbelleği', title:'Fiyat önbelleği temizlensin mi?',
        body:'Kayıtlı en düşük fiyatlar ve satış geçmişi silinir. Envanter açılınca fiyatlar Steam\'den yeniden çekilir; büyük envanterde bu birkaç dakika sürebilir.',
        confirmText:'Temizle' });
      if (!ok) return;
      await S.clearPriceCache().catch(()=>{});
      if (typeof priceMap !== 'undefined') priceMap.clear();
      if (typeof historyMap !== 'undefined' && historyMap && historyMap.clear) historyMap.clear();
      if (typeof renderInventory === 'function' && typeof invMerged !== 'undefined' && invMerged) renderInventory();
      toast('Fiyat Önbelleği').done('Fiyat önbelleği temizlendi.');
    };
    const openFolder = document.getElementById('setOpenFolder');
    if (openFolder) openFolder.onclick = ()=>{ S.openConfigFolder().catch(()=>{}); };

    // ---- Statistics ----
    const resetStats = document.getElementById('setStatsReset');
    if (resetStats) resetStats.onclick = async ()=>{
      const ok = await edgeConfirm({ tag:'İstatistikler', danger:true, title:'Bu hesabın istatistikleri sıfırlansın mı?',
        body: tf('Hesap: #', appSettings.persona || '-') + '\n' + t('Toplam çalışma, düşen kart, satış ve rekorlar sıfırlanır. Diğer hesapların istatistikleri etkilenmez.'),
        warn:'Bu işlem geri alınamaz.', confirmText:'Sıfırla' });
      if (!ok) return;
      const r = await window.imu.stats.reset().catch(()=>null);
      if (r && typeof renderLifeStats === 'function') renderLifeStats(r);
      toast('İstatistikler').done('İstatistikler sıfırlandı.');
    };

    // ---- Backup ----
    async function exportOut(){
      const r = await S.export().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (r && r.canceled) return;
      if (r && r.ok){
        setBackupInfo(t('Son dışa aktarma:') + ' ' + r.file);
        if (typeof toast === 'function') toast('Dışa aktarma').done('Yedek kaydedildi.');
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'Dışa aktarılamadı',
                      body:(r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', singleButton:true });
      }
    }
    // Import saves and applies the settings IN THE FILE directly (the user explicitly confirms by choosing
    // the file). If there are unsaved changes on the page it asks first.
    async function importIn(){
      const waiting = changes().length;
      const ok = await edgeConfirm({ tag:'İçe Aktar', title:'Yedekten geri yüklensin mi?',
        body:'Seçeceğin dosyadaki ayarlar mevcut ayarların ÜZERİNE yazılır ve hemen uygulanır. Bu bilgisayarda kayıtlı hesapların istatistikleri ve seçili oyunları da yedekten geri gelir.'
             + (waiting ? ('\n\n' + tf('Sayfada kaydedilmemiş # değişiklik var; bunlar kaybolur.', waiting)) : ''),
        warn:'Steam oturumun ve kayıtlı hesapların etkilenmez.', confirmText:'Dosya Seç' });
      if (!ok) return;
      const r = await S.import().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (r && r.canceled) return;
      if (r && r.ok){
        appSettings = r.settings;
        startDraft();
        await renderLifeStats();
        paintAll();
        applySettingsEverywhere(false, Object.keys(appSettings));
        readConfigInfo();
        setBackupInfo(t('Son içe aktarma:') + ' ' + r.file);
        if (typeof toast === 'function') toast('İçe aktarma').done(tf('# ayar geri yüklendi.', r.applied)
          + (r.accountCount ? (' ' + tf('# hesabın verisi geri yüklendi.', r.accountCount)) : ''));
      } else {
        edgeConfirm({ tag:'Hata', danger:true, title:'İçe aktarılamadı',
                      body:(r && r.error) || 'Bilinmeyen hata.', confirmText:'Tamam', singleButton:true });
      }
    }
    document.getElementById('setExport').onclick = exportOut;
    document.getElementById('setImport').onclick = importIn;
    const out2 = document.getElementById('setExport2'); if (out2) out2.onclick = exportOut;
    const ice2 = document.getElementById('setImport2'); if (ice2) ice2.onclick = importIn;
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
