    // The saved accounts: what runs on each, the account list, switching, removing, signing out and incoming messages.
    // Loaded after common.js (main.html); like every page script it shares the global scope.

    // ---- THE ACCOUNTS: what runs on each of them ----
    // The user has several accounts and works on one at a time. A job on another account used to be visible only by opening that account, and what ended there was
    // not visible at all. acctState keeps every account's running jobs and what ended while it was in the background; the chip in the top bar and the list of accounts show it.
    const acctState = new Map();       // steamID -> { steamID, accountName, active, connected, running, jobs: [], finished: { jobs, ts } | null }
    const JOB_NAMES = { card: 'Kart Düşürme', hours: 'Saat Yükseltme', realistic: 'Gerçekçi Mod' };
    function jobLine(a){
      if (a.running && a.detail && a.detail.length) return a.detail.map(j => t(JOB_NAMES[j.kind] || j.kind) + (j.games && j.games.length ? (': ' + j.games.join(', ') + (j.more ? ' +' + j.more : '')) : '')).join(' · ');
      if (a.running && a.jobs && a.jobs.length) return a.jobs.map(k => t(JOB_NAMES[k] || k)).join(' · ');
      if (a.finished) return tf('Bitti · #', new Date(a.finished.ts).toLocaleTimeString(localCode(), { hour:'2-digit', minute:'2-digit' }));
      return '';
    }
    function paintRunChip(){
      const chip = document.getElementById('tbRunning');
      if (!chip) return;
      const all = [...acctState.values()];
      const running = all.filter(a => a.running);
      const ended = all.filter(a => !a.running && a.finished);
      if (!running.length && !ended.length){ chip.style.display = 'none'; return; }
      const parts = [];
      if (running.length) parts.push(tf('Çalışan hesap: #', running.length));
      if (ended.length) parts.push(tf('Biten: # hesap', ended.length));
      chip.style.display = '';
      chip.classList.toggle('done', !running.length);
      document.getElementById('tbRunningDot').classList.toggle('e-pulse', running.length > 0);
      document.getElementById('tbRunningText').textContent = parts.join(' · ');
      chip.title = all.filter(a => a.running || a.finished).map(a => (a.accountName || a.steamID) + ': ' + jobLine(a)).join('\n');
    }
    function mergeAcctState(d){
      if (!d || !d.steamID) return;
      const a = acctState.get(d.steamID);
      if (!a){ refreshAcctState(); return; }       // an account the list has not seen yet: read the list again
      a.running = !!d.running; a.jobs = d.jobs || []; a.detail = d.detail || (d.running ? a.detail : []) || []; a.finished = d.finished || null;
      paintRunChip();
      if (typeof renderOverviewActive === 'function') renderOverviewActive();
      if (typeof renderActiveBox === 'function' && typeof hoursLoaded !== 'undefined' && hoursLoaded) renderActiveBox();
    }
    async function refreshAcctState(){
      const accts = await window.imu.accounts.list().catch(()=>[]);
      acctState.clear();
      accts.forEach(a => acctState.set(a.steamID, a));
      paintRunChip();
      if (typeof renderOverviewActive === 'function') renderOverviewActive();
      return accts;
    }
    let acctListSignature = '';
    async function renderAcctList(){
      const list = document.getElementById('acctList');
      const accts = await refreshAcctState();
      if (!accts.length){ acctListSignature = ''; list.innerHTML = '<div style="padding:10px 14px;color:var(--muted2);font-size:12px">Kayıtlı hesap yok.</div>'; return; }
      // A list that has not changed is not drawn again: drawing replaces the rows, and a click that started on a row that was replaced before the button came up is lost
      const signature = JSON.stringify(accts.map(a => [a.steamID, a.accountName, a.active, a.connected, a.running, a.jobs, a.finished && a.finished.ts, a.needsLogin]));
      if (signature === acctListSignature && list.children.length) return;
      acctListSignature = signature;
      // Badges: "Active" = shown in the interface, green dot = card/hour running in the background
      list.innerHTML = accts.map(a=>'<div class="acct-row'+(a.active?' active':'')+'" data-id="'+esc(a.steamID)+'">'
        + '<span class="nmwrap"><span class="nm">'+esc(a.accountName||a.steamID)+'</span>'
        + (a.needsLogin ? '<span class="sub bad">'+esc(t('Oturum kapandı'))+'</span>'
            : jobLine(a) ? '<span class="sub'+(a.running?' on':'')+'">'+esc(jobLine(a))+'</span>' : '') + '</span>'
        + (a.needsLogin?'<button type="button" class="relogin" data-relogin="'+esc(a.steamID)+'">'+esc(t('Giriş yap'))+'</button>':'')
        + (a.running?'<span class="run-dot" title="Arka planda çalışıyor"></span>':'')
        + (a.connected&&!a.running?'<span class="conn-dot" title="Bağlı"></span>':'')
        + (a.active?'<span class="tag">Aktif</span>':'')
        + '<span class="x" data-x="'+esc(a.steamID)+'">✕</span>'
        + '</div>').join('');
    }
    // One handler for the whole list, so it does not depend on the rows that happen to be there; a row is chosen when the button goes DOWN
    document.getElementById('acctList').addEventListener('mousedown', (e)=>{
      if (e.button !== 0) return;
      const row = e.target.closest('.acct-row');
      if (!row || e.target.closest('[data-x]')) return;
      e.preventDefault();
      // an account that waits for a sign-in cannot be opened: its row (and its button) opens the sign-in for it
      const known = acctState.get(row.getAttribute('data-id'));
      if (e.target.closest('[data-relogin]') || (known && known.needsLogin && !known.active)){ closeAcct(); openRelogin(row.getAttribute('data-id')); return; }
      switchAccount(row.getAttribute('data-id'));
    });
    document.getElementById('acctList').addEventListener('click', (e)=>{
      const x = e.target.closest('[data-x]');
      if (x){ e.stopPropagation(); removeAccount(x.getAttribute('data-x')); }
    });
    document.getElementById('tbRunning').addEventListener('click', (e)=>{
      e.stopPropagation();
      if (!acctDropdown.classList.contains('open')) tbProfile.click();
    });

    // Switching accounts DOES NOT RELOAD - since the other accounts' card farming/hour boosting
    // jobs continue in the background, rebuilding the page from scratch would be both needless and would reset those jobs'
    // live indicators. Instead the page caches are emptied and the active tab fetches
    // the data again.
    // ITEM 2a: Only clearing the variables was not enough. The DOM of the inactive tabs
    // stayed on screen and when that tab was switched to the PREVIOUS ACCOUNT's games showed; if the data
    // came late or the connection could not be made it stayed that way forever.
    // The fix: when the account changes empty the content of all tabs and put in a "loading" skeleton.
    function placeSkeleton(){
      const goals = [
        ['cardRows', 'Oyun listesi yükleniyor...'],
        ['invRows', 'Envanter yükleniyor...'],
        ['hoursListBody', 'Kütüphane yükleniyor...'],
        ['activeBoostBox', 'Kuyruk yükleniyor...'],
        ['acBody', 'Başarımlar yükleniyor...'],
        ['grListBox', 'Yükleniyor...'],
        ['gFeed', 'Yükleniyor...'],
      ];
      goals.forEach(([id, text])=>{
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">'+text+'</div>';
      });
    }
    function resetPageCaches(){
      placeSkeleton();
      if (typeof cardsLoaded !== 'undefined'){ cardsLoaded = false; dropGames = []; }
      if (typeof hoursLoaded !== 'undefined'){ hoursLoaded = false; ownedGames = []; selectedHours = []; }
      if (typeof inventoryLoaded !== 'undefined'){ inventoryLoaded = false; invMerged = null; invItems = null; detailKey = null; }
      if (typeof resetInventorySources === 'function') resetInventorySources();
      if (typeof priceMap !== 'undefined') priceMap.clear();
      if (typeof selected !== 'undefined') selected.clear();
      if (typeof acLoaded !== 'undefined'){ acLoaded = false; acData = null; acAppid = null; }
      if (typeof grLoaded !== 'undefined'){ grLoaded = false; grGames = []; grAppid = null; grPlan = null; grCompleted = new Set(); grChecked.clear(); }
      if (typeof acCache !== 'undefined') acCache.clear();
      // Chat must not show another account's friend list
      if (typeof chLoaded !== 'undefined'){ chLoaded = false; chFriends = []; chSelected = null; chMessages.clear(); chUnread.clear(); }
      if (typeof overviewLoaded !== 'undefined') overviewLoaded = false;
      // The activity feed is account specific; the old account's history must not stay on screen
      if (typeof activityFeed !== 'undefined') activityFeed.length = 0;
      // Recent drops are account specific too
      if (typeof recentDrops !== 'undefined') recentDrops.length = 0;
    }
    // The visible tab is found from the DOM. Settings and Chat have no link in the sidebar,
    // Realistic Mode was not in the list either: while these were open Overview was loaded when the account changed,
    // and the visible page stayed in the skeleton.
    function reloadActiveTab(){
      const tab = Object.keys(designed).find(k => designed[k] && !designed[k].classList.contains('hidden')) || 'overview';
      if (tab === 'card' && typeof loadCards === 'function') loadCards();
      else if (tab === 'hours' && typeof loadHours === 'function') loadHours();
      else if (tab === 'inventory' && typeof loadInventory === 'function') loadInventory();
      else if (tab === 'achievements' && typeof loadAchievementsPage === 'function') loadAchievementsPage();
      else if (tab === 'keys' && typeof loadKeys === 'function') loadKeys();
      else if (tab === 'realistic' && typeof loadRealistic === 'function') loadRealistic();
      else if (tab === 'chat' && typeof loadChat === 'function') loadChat();
      else if (tab === 'settings' && typeof loadSettingsPage === 'function') loadSettingsPage();
      else if (typeof loadOverview === 'function') loadOverview();
    }
    // Switching accounts. The account on screen changes when the new one is CONNECTED (main.js accounts:switch); until then the page is dimmed and says what is going on,
    // so nobody has to click again, and nothing is started on the old account by mistake.
    let switchingTo = null, switchToast = null;
    async function switchAccount(steamID){
      closeAcct();
      if (switchingTo === steamID) return;               // the same row clicked again while it is loading
      const known = acctState.get(steamID);
      if (known && known.active && !switchingTo) return;  // already the account on screen
      switchingTo = steamID;
      document.body.classList.add('e-switching');
      // One notice for the whole change: a newer click on another row takes over the same notice
      if (!switchToast) switchToast = toast(tf('# hesabına geçiliyor…', (known && known.accountName) || steamID));
      const r = await window.imu.accounts.switch(steamID).catch(()=>null);
      if (r && r.superseded) return;                      // a newer click took over; it finishes the job
      const working = switchToast; switchToast = null;
      switchingTo = null;
      document.body.classList.remove('e-switching');
      if (r && r.needsLogin){
        working.fail(t('Hesap değiştirilemedi.'));
        acctListSignature = ''; renderAcctList();
        openRelogin(steamID);
        return;
      }
      if (!r || !r.ok){
        working.fail(t('Hesap değiştirilemedi.'));
        edgeConfirm({ tag:'Hata', danger:true, title:'Hesap değiştirilemedi.', body:(r && r.error) ? t(r.error) : '', confirmText:'Tamam', singleButton:true });
        return;
      }
      working.done(tf('# hesabı açıldı.', (known && known.accountName) || steamID));
      await loadAccountSettings();
      reconcileConnection().then(armStripTimer);
      resetPageCaches();
      imuProfile = null; imuProfileFresh = false; loadProfile();
      reloadActiveTab();
      acctListSignature = '';
      renderAcctList();
    }
    // After a switch the pages must work with the NEW account's own values: its Realistic Mode queue and presets, its hour list, its card lists, its favourites and
    // its job settings. They used to keep the values read at startup, so the first account's queue showed up on the second one and was saved into its file.
    async function loadAccountSettings(){
      const fresh = await window.imu.settings.get().catch(()=>null);
      if (!fresh) return;
      appSettings = fresh;
      if (window.imu.settings.forAccount) window.imu.settings.forAccount(fresh.settingsAccount);
      paintVisibility();          // the visibility is the new account's own
      // what the pages took from the old account
      if (typeof grQueue !== 'undefined') grQueue = [];
      if (typeof grPresets !== 'undefined') grPresets = [];
      if (typeof grDurationTouched !== 'undefined') grDurationTouched = false;
      if (typeof farmUserTouched !== 'undefined') farmUserTouched = false;
      if (typeof boostUserTouched !== 'undefined') boostUserTouched = false;
      if (typeof concUserTouched !== 'undefined') concUserTouched = false;
      // unsaved changes on the Settings page belonged to the old account
      if (typeof draft !== 'undefined') { draft = null; draftBase = null; }
      if (typeof applySettingsEverywhere === 'function') applySettingsEverywhere(false);
    }
    async function removeAccount(steamID){
      // ITEM 9: instead of a plain confirm() a confirmation that CLEARLY says what will be deleted
      const ok = await edgeConfirm({
        tag:'Hesabı Kaldır', danger:true,
        title:'Bu hesap listeden kaldırılacak',
        body:t('Silinecekler:') + '\n'
             + '  · ' + t('Kayıtlı Steam oturumu (giriş anahtarı)') + '\n'
             + '  · ' + t('O hesaba ait saat yükseltici listesi, kuyruk sırası ve başarım geçmişi') + '\n'
             + '  · ' + t('O hesaba ait istatistikler') + '\n\n'
             + t('Arka planda çalışan kart toplama ve saat yükseltme işi durdurulur.') + '\n\n'
             + t('Steam hesabına hiçbir şey olmaz; istersen tekrar giriş yapabilirsin.'),
        warn:'Bu işlem geri alınamaz.',
        confirmText:'Hesabı Kaldır', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.accounts.remove(steamID).catch(()=>null);
      if (!r || !r.ok) {
        edgeConfirm({ tag:'Hata', danger:true, title:'Hesap kaldırılamadı.', body:(r && r.error) ? t(r.error) : '', confirmText:'Tamam', singleButton:true });
        return;
      }
      if (r.loggedOut) return; // main.js already moved to the login screen
      resetPageCaches();
      imuProfile = null; imuProfileFresh = false; loadProfile();
      reloadActiveTab();
      renderAcctList();
    }
    document.getElementById('acctAddBtn').onclick = () => window.imu.accounts.startAdd();
    // When one of the background accounts starts/stops refresh the dot in the list
    // The account on screen started or stopped something (a job resumed at startup, for instance): the pages ask for its live state instead of trusting
    // that every event reached them
    const askJobStatus = () => { if (window.imu.jobs && window.imu.jobs.status) window.imu.jobs.status().catch(()=>{}); };
    if (window.imu.onAccountActivity) window.imu.onAccountActivity((d)=>{
      mergeAcctState(d);
      const mine = d && d.steamID && acctState.get(d.steamID);
      if (mine && mine.active && !switchingTo) askJobStatus();
      if (acctDropdown.classList.contains('open')) renderAcctList();
    });
    refreshAcctState().then(askJobStatus);
    // Incoming Steam message: it drops into the activity feed + a toast appears on screen. The desktop notification
    // is sent in the main process (see main.js connectAccount > onChatMessage).
    if (window.imu.onChatMessage) window.imu.onChatMessage((m)=>{
      // If the chat screen is not open let the badge in the top bar show.
      if (designed.chat && designed.chat.classList.contains('hidden')){
        chPending++; chPaintBadge();
      }
      const who = m.persona || m.from;
      if (typeof pushFeed === 'function'){
        pushFeed('message', t('Steam mesajı') + ' · ' + who,
                 m.message.slice(0,140) + (m.replied ? '  ·  ' + t('otomatik yanıtlandı') : ''), 'Mesaj');
      }
      if (typeof toast === 'function') toast(who).done(m.message.slice(0,120));
      if (typeof playNotifSound === 'function' && appSettings && appSettings.notifications
          && appSettings.notifyChat !== false && !(typeof inQuietHours === 'function' && inQuietHours())) playNotifSound();
    });
    // Signing in again to an account whose saved login Steam stopped taking (src/backend/relogin.js opens a small window for it). Before 4.3.7 the only
    // way back was to remove the account and add it again.
    function openRelogin(steamID){
      window.imu.accounts.relogin(steamID).then((r)=>{
        if (!r || !r.ok) toast('Steam Bağlantısı').fail(t((r && r.error) || 'Giriş penceresi açılamadı.'));
      }).catch(()=>{});
    }
    if (window.imu.accounts.onNeedsLogin) window.imu.accounts.onNeedsLogin(()=>{
      acctListSignature = '';
      refreshAcctState().then(()=>{ if (acctDropdown.classList.contains('open')) renderAcctList(); });
      if (typeof reconcileConnection === 'function') reconcileConnection().then(armStripTimer);
    });
    if (window.imu.accounts.onRelogged) window.imu.accounts.onRelogged((d)=>{
      if (!d) return;
      acctListSignature = '';
      refreshAcctState().then(()=>{ if (acctDropdown.classList.contains('open')) renderAcctList(); });
      if (typeof reconcileConnection === 'function') reconcileConnection().then(armStripTimer);
      if (d.ok) toast(d.accountName || 'Steam').done(t('Oturum yenilendi, hesap bağlandı.'));
      else toast(d.accountName || 'Steam').fail(t(d.error || 'Bağlanılamadı.'));
      // the page of the account on screen was empty while it waited: its lists are read again
      if (d.ok && d.activeIds){ resetPageCaches(); imuProfile = null; imuProfileFresh = false; loadProfile(); reloadActiveTab(); }
    });
    // At startup connect all saved accounts in the background - parallel idling is built on this
    window.imu.accounts.connectAll().then((res)=>{
      const failed = (res||[]).filter(r=>!r.ok && !r.needsLogin);   // one waiting for a sign-in says so in its row and in the strip
      if (failed.length && typeof pushFeed === 'function'){
        failed.forEach(f=>pushFeed('error','Hesap bağlanamadı', f.accountName+' - '+(f.error||''), 'Hata'));
      }
    }).catch(()=>{});
    document.getElementById('acctLogoutBtn').onclick = () => {
      // ITEM 9: signing out does NOT delete permanent data, say it clearly - so the user does not hesitate
      edgeConfirm({
        tag:'Çıkış Yap', danger:true,
        title:'Bu hesaptan çıkış yapılacak',
        body:t('Oturum kapatılır ve giriş ekranına dönersin.') + '\n\n'
             + t('Ayarların, saat yükseltici listen, başarım geçmişin ve istatistiklerin SİLİNMEZ; tekrar giriş yaptığında yerinde olur.'),
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
