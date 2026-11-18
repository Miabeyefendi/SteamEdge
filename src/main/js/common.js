    const api = window.imu;
    document.getElementById('min').onclick = () => api && api.win.minimize();
    document.getElementById('max').onclick = () => api && api.win.maximize();
    document.getElementById('close').onclick = () => api && api.win.close();

    const designed = { overview: document.getElementById('tab-overview'), card: document.getElementById('tab-card'), inventory: document.getElementById('tab-inventory'), hours: document.getElementById('tab-hours'), realistic: document.getElementById('tab-realistic'), achievements: document.getElementById('tab-achievements'), keys: document.getElementById('tab-keys'), chat: document.getElementById('tab-chat'), settings: document.getElementById('tab-settings') };
    const empty = document.getElementById('tab-empty');
    const emptyName = document.getElementById('emptyName');
    // Opening a tab. The body used to be directly inside the nav link's click listener; since the Chat button in the top bar
    // has no counterpart in the sidebar it was moved to a separate function. The nav links call it too,
    // so there is only one path left.
    async function openTab(tab, sourceConnection) {
      // A page that is switched off (Settings > Modules) is not opened by any road (menu, overview tile, start page, search): the overview opens instead.
      if (!moduleOn(tab)) { tab = 'overview'; sourceConnection = document.querySelector('.nav a[data-tab="overview"]'); }
      // If leaving the Settings tab, the unsaved changes warning (settings.js)
      const leavingSettings = !designed.settings.classList.contains('hidden');
      if (leavingSettings && typeof confirmLeaveSettings === 'function') {
        const ok = await confirmLeaveSettings();
        if (!ok) return;
      }
      if (tab === 'exit') { window.imu.logout(); return; }
      // Open windows that belong to another page close (see edgeConfirm > o.pageName).
      document.querySelectorAll('.e-modal-back[data-page]').forEach(m=>{
        if (m.getAttribute('data-page') !== tab && typeof m._shutdownInner === 'function') m._shutdownInner(false);
      });
      document.querySelectorAll('.nav a').forEach(x => x.classList.remove('active'));
      // Chat has no link in the sidebar; then none of them stays marked.
      if (sourceConnection) sourceConnection.classList.add('active');
      setRailTop(tab);
      Object.values(designed).forEach(s => s.classList.add('hidden'));
      empty.classList.add('hidden');
      if (designed[tab]) designed[tab].classList.remove('hidden');
      else {
        empty.classList.remove('hidden');
        emptyName.textContent = sourceConnection ? sourceConnection.textContent.trim() : tab;
      }
      flushHeavyLists(tab);
      if (tab === 'overview') loadOverview();
      if (tab === 'card') loadCards();
      if (tab === 'hours') loadHours();
      if (tab === 'inventory') loadInventory();
      if (tab === 'realistic') loadRealistic();
      if (tab === 'achievements') loadAchievementsPage();
      if (tab === 'keys') loadKeys();
      if (tab === 'chat') loadChat();
      if (tab === 'settings') loadSettingsPage();
      redrawHeavyList(tab);
      paintRunButtons();
    }
    document.querySelectorAll('.nav a[data-tab]').forEach(a => {
      a.addEventListener('click', () => openTab(a.getAttribute('data-tab'), a));
    });

    // ---- KEEPING THE LISTS OF HIDDEN TABS IN MEMORY ----
    // In accounts with a big library these lists mean thousands of rows: a 400 game queue alone is
    // ~9,600 DOM nodes. When a tab is hidden they are not on screen but the browser
    // kept holding all of them in memory.
    //
    // The fix: the list body of a hidden tab is emptied, and redrawn when the tab is returned to.
    // NO DATA IS DELETED - the lists are drawn from JS arrays anyway, only the DOM is deleted. Selections,
    // sorting and filters stay on the JS side too, so nothing is lost on return.
    // Not a single extra request goes to Steam.
    const HEAVY_LISTS = {
      card:    { container: 'cardQueue',    draw: () => (typeof renderCards === 'function' && typeof cardsLoaded !== 'undefined' && cardsLoaded) && renderCards() },
      inventory:     { container: 'invRows',      draw: () => (typeof renderInventory === 'function' && typeof inventoryLoaded !== 'undefined' && inventoryLoaded) && renderInventory() },
      hours:    { container: 'hoursListBody', draw: () => (typeof renderHoursList === 'function' && typeof hoursLoaded !== 'undefined' && hoursLoaded) && renderHoursList() },
      achievements: { container: 'acBody',       draw: () => (typeof renderAchievements === 'function' && typeof acData !== 'undefined' && acData) && renderAchievements() },
    };
    const suspendedTabs = new Set();

    function flushHeavyLists(openedTab){
      Object.keys(HEAVY_LISTS).forEach(t => {
        if (t === openedTab || suspendedTabs.has(t)) return;
        const container = document.getElementById(HEAVY_LISTS[t].container);
        // There is no point suspending a list that was never filled; also let us not delete one line
        // status texts like "loading" and leave the user alone with an empty screen.
        if (!container || container.children.length < 2) return;
        container.innerHTML = '';
        suspendedTabs.add(t);
      });
    }
    function redrawHeavyList(tab){
      if (!suspendedTabs.has(tab)) return;
      suspendedTabs.delete(tab);
      try { HEAVY_LISTS[tab].draw(); } catch (_) { /* the page has not loaded yet - its own load draws it */ }
    }

    // ---- shared helpers (all pages use them) ----
    const E = window.imu.engine;

    // LIBRARY HEADER (library_capsule / header) - Steam's standard is 920x430 pixels,
    // that is ~2.14:1. The library LOGO (logo.png) was tried but it is a transparent PNG: the back stays
    // empty and it looked bad in the box. Since the header image is a full JPG
    // `object-fit:cover` fills the box completely, no gap is left.
    //   header.jpg 460x215 - the name of the same 2.14:1 ratio on the CDN; 920x430 is 2x of this.
    const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';
    const IMG_KIND = { header: 'header.jpg', capsule: 'capsule_616x353.jpg', logo: 'logo.png' };
    function gameImg(appid, kind){
      return CDN + appid + '/' + (IMG_KIND[kind] || IMG_KIND.header);
    }
    // A ready <img> for 920x430 (~2.14:1) slots: header → otherwise capsule → otherwise hide.
    // `scale(1.03)`: the image is zoomed 3% inside the box - the thin gap at the edges
    // closes and the cover art looks fuller. It does not overflow because the box has overflow:hidden.
    function gameThumb(appid, extra){
      return '<img src="' + gameImg(appid) + '" loading="lazy" alt=""'
        + ' style="width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.03)' + (extra || '') + '"'
        + ' onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=\'' + gameImg(appid, 'capsule') + '\';}'
        + 'else{this.style.display=\'none\';}">';
    }
    // Quotes are escaped too: the output of this function is used as an attribute value in many places
    // (src="'+esc(x)+'"), if the quote was not escaped the value could break out of the attribute.
    const ESC_CHAR = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(s){ return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ESC_CHAR[c]); }

    // ================= FAVORITE GAMES =================
    // A star on a game in the Hour Booster, Realistic Mode and Achievements lists puts it at the top of those lists. The list
    // is an account setting (main.js: favoriteGames); the Set is rebuilt whenever appSettings carries a new array.
    let favSource = null, favSet = new Set();
    function favoriteSet(){
      const a = (typeof appSettings === 'object' && appSettings && appSettings.favoriteGames) || [];
      if (a !== favSource){ favSource = a; favSet = new Set(a.map(Number)); }
      return favSet;
    }
    const isFavorite = (appid) => favoriteSet().has(+appid);
    function favoritesFirst(list){
      return (featureOn('favorites') && favoriteSet().size) ? list.slice().sort((a, b) => (isFavorite(b.appid) ? 1 : 0) - (isFavorite(a.appid) ? 1 : 0)) : list;
    }
    function favStar(appid){
      const on = isFavorite(appid);
      return '<button data-fav="' + (+appid) + '" title="' + esc(t(on ? 'Favorilerden Çıkar' : 'Favorilere Ekle')) + '" style="width:24px;height:28px;flex-shrink:0;border-radius:999px;background:transparent;border:none;color:'
        + (on ? '#B37E24' : '#7F879B') + ';cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="' + (on ? 'currentColor' : 'none')
        + '" stroke="currentColor" stroke-width="2"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"></path></svg></button>';
    }
    async function toggleFavorite(appid){
      const next = new Set(favoriteSet());
      if (next.has(+appid)) next.delete(+appid); else next.add(+appid);
      const s = await window.imu.settings.set({ favoriteGames: [...next] }).catch(() => null);
      if (s && typeof appSettings !== 'undefined') appSettings = s;
    }

    // ================= THEMED CONFIRM MODAL =================
    // The native confirm() box opened Windows' grey window (outside the theme). This is the theme matching
    // counterpart that does the same job. It returns a Promise: true if confirmed.
    //   opts.askSetting → shows a "Don't ask again" checkbox. If it is ticked and confirmed this setting
    //   is written false (e.g. achConfirmSingle) and later calls return true WITHOUT asking. The user can turn
    //   the setting back on from Settings. A separate "dontAsk_" key used to be written and
    //   two settings held the same state.
    function edgeConfirm(opts){
      const o = opts || {};
      const key = o.askSetting || null;
      // If "Don't ask again" was said before, do not show at all
      if (key && typeof appSettings === 'object' && appSettings && appSettings[key] === false) return Promise.resolve(true);

      return new Promise((resolve)=>{
        const back = document.createElement('div');
        back.className = 'e-modal-back';
        const accent = o.danger ? '#B32453' : '#5624B3';
        // o.pageName: the window belongs to a page; if the user moves to another tab it closes
        // on its own (counts as cancelled). The Inventory "fetch prices now?" question used to open on top of
        // another page after the tab was changed.
        if (o.pageName) back.setAttribute('data-page', o.pageName);
        back.innerHTML =
          '<div class="e-modal" role="dialog" aria-modal="true">'
          + '<div class="e-modal-hd"><span class="dot" style="background:'+accent+'"></span>'
          + '<span class="ttl">'+esc(t(o.tag || (o.danger ? 'Dikkat' : 'Onay')))+'</span></div>'
          + '<div class="e-modal-body">'
            + '<span class="h">'+esc(t(o.title || 'Emin misin?'))+'</span>'
            + (o.body ? '<span class="p">'+esc(t(o.body))+'</span>' : '')
            // Red warning: for cases where one should not hurry (e.g. the price is below the 24 hour average)
            + (o.warningRed ? '<span class="warn" style="color:#E45A86;border-color:#B32453;background:rgba(179,36,83,.08)">'+esc(o.warningRed)+'</span>' : '')
            + (o.warn ? '<span class="warn">'+esc(t(o.warn))+'</span>' : '')
          + '</div>'
          + (key ? '<div class="e-modal-ask" data-ask><span class="box">'
              + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DCE2FA" stroke-width="3.4"><path d="M5 13l4 4L19 7"></path></svg>'
              + '</span><span>Bir daha sorma</span></div>' : '')
          + '<div class="e-modal-ft">'
            // o.tekDugme: a window that only informs (like a result summary), there is nothing to cancel
            + (o.singleButton ? '' : '<button class="cancel" data-no>'+esc(t(o.cancelText || 'Vazgeç'))+'</button>')
            + (o.subText ? '<button class="alt" data-alt>'+esc(t(o.subText))+'</button>' : '')
            + '<button class="ok'+(o.danger?' danger':'')+'" data-yes>'+esc(t(o.confirmText || 'Devam Et'))+'</button>'
          + '</div></div>';
        document.body.appendChild(back);
        requestAnimationFrame(()=>back.classList.add('show'));

        const ask = back.querySelector('[data-ask]');
        if (ask) ask.addEventListener('click', ()=>ask.classList.toggle('on'));

        let done = false;
        async function close(result){
          if (done) return; done = true;
          if (result === true && ask && ask.classList.contains('on') && key){
            try { appSettings = await window.imu.settings.set({ [key]: false }); } catch(_){}
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
        back._shutdownInner = close;
        const isNo = back.querySelector('[data-no]');
        if (isNo) isNo.onclick = ()=>close(false);
        back.querySelector('[data-yes]').onclick = ()=>close(true);
        const lower = back.querySelector('[data-alt]');
        if (lower) lower.onclick = ()=>close('alt');
        back.addEventListener('mousedown', (e)=>{ if (e.target === back) close(false); });
        setTimeout(()=>{ const y = back.querySelector('[data-yes]'); if (y) y.focus(); }, 30);
      });
    }

    // ================= SHARED HELPERS TIED TO THE SETTINGS =================
    // (So that the preferences on the Settings screen have a counterpart in all pages, in one place.)

    // ---- Currency ----
    // Prices are fetched from Steam in the ACCOUNT's wallet currency and shown EXACTLY in that currency.
    // There is no conversion. If the currency is not known yet (the wallet event did not arrive) no symbol is printed -
    // a wrong symbol would mean silently presenting the amount as if it were another currency.
    const CUR_SYM = {
      USD:'$', EUR:'€', GBP:'£', TRY:'₺', RUB:'₽', BRL:'R$', JPY:'¥', CNY:'¥',
      CAD:'CA$', AUD:'A$', INR:'₹', UAH:'₴', PLN:'zł', KZT:'₸', ARS:'AR$', MXN:'MX$',
    };
    // The local name of the cent/kurus - for the unit of fields like "Undercut amount"
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
    // The ONE right source: the Steam account's own wallet currency. The user cannot choose.
    // Why: amounts are money; currency conversion is open to rounding + stale rate + conversion in the wrong direction
    // errors, and the sale price is already listed in the account's currency. So that the amount you see and the amount
    // sent to Steam are THE SAME, conversion was removed entirely.
    function acctCur(){ return (appSettings && appSettings.accountCurrency) || null; }
    function curCode(){ return acctCur(); }
    function curSym(){ const c = curCode(); return c ? (CUR_SYM[c] || (c + ' ')) : ''; }
    function curSubunit(){ const c = curCode(); return c ? (CUR_SUBUNIT[c] || 'birim') : 'birim'; }
    function fmtMoney(n){
      const c = curCode();
      const loc = CUR_LOCALE[c] || localCode();
      const v = +n || 0;
      // On the Steam market the lowest sale is 0.03; there is NO such price as 0.00. Values greater than zero
      // that look like 0.00 when rounded to two digits (sale history averages
      // can come with 3 digits) are written with their real digits instead of being shown as if they were zero.
      if (v > 0 && v < 0.005){
        return curSym() + v.toLocaleString(loc, { minimumFractionDigits:3, maximumFractionDigits:4 });
      }
      return curSym() + v.toLocaleString(loc, { minimumFractionDigits:2, maximumFractionDigits:2 });
    }
    // The lower limit of the Steam Community Market (in the account's currency). A listing cannot be made below this;
    // if a computed "value" falls below this limit the data is not reliable and is marked as such.
    const MARKET_MIN = { USD:0.03, EUR:0.03, GBP:0.02, TRY:0.23, RUB:1.00, BRL:0.10, JPY:3, CNY:0.23,
                         CAD:0.04, AUD:0.05, INR:2.00, UAH:1.00, PLN:0.11, KZT:12, ARS:2.00, MXN:0.50 };
    function marketMin(){ const c = curCode(); return (c && MARKET_MIN[c] != null) ? MARKET_MIN[c] : 0.03; }

    // "Time format" - 24 hour / 12 hour (AM-PM)
    function fmtClock(d){
      const use12 = (typeof appSettings==='object' && appSettings && String(appSettings.timeFormat)==='12');
      return new Date(d).toLocaleTimeString(localCode(), { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: use12 });
    }
    function fmtDateShort(d){ return new Date(d).toLocaleDateString(localCode()); }

    // "Interface density" - in compact mode row heights and inner spacing shrink.
    // Automatic: compact while the window is short. A 768 line laptop at 125 % scaling leaves about 600 px, and the lists get squeezed to a few rows there.
    const DENSITY_AUTO_H = 720;
    function applyDensity(){
      const mode = (typeof appSettings==='object' && appSettings && appSettings.density) || 'auto';
      const compact = mode === 'compact' || (mode === 'auto' && window.innerHeight < DENSITY_AUTO_H);
      document.body.classList.toggle('e-compact', !!compact);
      if (typeof applyTheme === 'function' && appSettings) applyTheme(appSettings.theme || 'auto');
      if (typeof setRailTop === 'function') setRailTop(railTab);
    }
    // ================= MODULES =================
    // A page that is switched off leaves the side menu, the overview and the top bar, and is never opened, so it asks Steam for nothing.
    // The overview and Settings are always there. The side menu order is the setting navOrder.
    const MODULES = { card:'moduleCard', inventory:'moduleInventory', hours:'moduleHours', realistic:'moduleRealistic', achievements:'moduleAchievements', keys:'moduleKeys', chat:'moduleChat' };
    const NAV_ITEMS = ['overview', 'card', 'inventory', 'hours', 'realistic', 'achievements', 'keys'];
    function moduleOn(tab){
      const k = MODULES[tab];
      return !k || !(typeof appSettings === 'object' && appSettings && appSettings[k] === false);
    }
    // Small features and top bar items that can be switched off too. The side menu, Settings and the account button are not on the list:
    // without them the app could not be steered. A switched-off one is hidden by a body class (edge.css .opt-off-*), nothing else changes.
    const FEATURES = { feed:'featFeed', favorites:'featFavorites', listings:'featListings', csv:'featCsv', games:'featOtherGames', search:'topSearch', notif:'topNotif', update:'topUpdate' };
    function featureOn(name){
      return !(typeof appSettings === 'object' && appSettings && appSettings[FEATURES[name]] === false);
    }
    // Saved order first (unknown names dropped), whatever it does not mention follows in the default order.
    function navOrderList(raw){
      const saved = String(raw == null ? ((typeof appSettings === 'object' && appSettings && appSettings.navOrder) || '') : raw).split(',').filter(x => NAV_ITEMS.includes(x));
      return [...new Set([...saved, ...NAV_ITEMS])];
    }
    function applyModules(){
      const nav = document.getElementById('mainNav');
      if (!nav) return;
      const sep = nav.querySelector('.e-nav-sep');
      navOrderList().forEach(tab => { const a = nav.querySelector('a[data-tab="'+tab+'"]'); if (a) nav.insertBefore(a, sep); });
      Object.keys(MODULES).forEach(tab => {
        const off = !moduleOn(tab);
        const a = nav.querySelector('a[data-tab="'+tab+'"]');
        if (a) a.style.display = off ? 'none' : '';
        document.body.classList.toggle('mod-off-' + tab, off);
      });
      const chat = document.getElementById('tbChat');
      if (chat) chat.style.display = moduleOn('chat') ? '' : 'none';
      Object.keys(FEATURES).forEach(name => document.body.classList.toggle('opt-off-' + name, !featureOn(name)));
      if (typeof syncOtherGames === 'function') syncOtherGames();
      // switched off while it is on screen: back to the overview
      const shown = Object.keys(designed).find(k => !designed[k].classList.contains('hidden'));
      if (shown && !moduleOn(shown)) openTab('overview', nav.querySelector('a[data-tab="overview"]'));
      setRailTop(railTab);
    }

    // ================= PERFORMANCE MODE =================
    // Light: no animations, transitions, blur or shadows (edge.css .e-light). Automatic follows the system's "reduce motion" setting
    // and switches on for a weak machine (2 cores or 2 GB, or 4 cores and 4 GB at most).
    function weakMachine(cores, memGB){ return cores <= 2 || memGB <= 2 || (cores <= 4 && memGB <= 4); }
    function perfLight(){
      const mode = (typeof appSettings === 'object' && appSettings && appSettings.perfMode) || 'auto';
      if (mode === 'light') return true;
      if (mode === 'full') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches || weakMachine(navigator.hardwareConcurrency || 8, navigator.deviceMemory || 8);
    }
    function applyPerf(){ document.body.classList.toggle('e-light', perfLight()); if (typeof runBeat === 'function') runBeat(); }
    try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyPerf); } catch (_) {}

    // ================= KEYBOARD =================
    // The switches (<span>/<div>) and the side menu items (<a> without an href) are not reachable with Tab and say nothing to a screen reader.
    // They get a tab stop, a role and, for the switches, aria-checked that follows their look; Enter and Space press them.
    // New ones (pages are filled later) are picked up by the observer.
    const KB_SELECTOR = '.e-toggle, #tab-settings div[data-set], .e-nav-item';
    function switchOn(el){
      if (el.classList.contains('on')) return true;
      const knob = el.firstElementChild;
      return !!(knob && knob.style && knob.style.marginLeft === '16px');
    }
    function makeReachable(el){
      if (el.getAttribute('data-kb')) return;
      el.setAttribute('data-kb', '1');
      el.setAttribute('tabindex', '0');
      const isSwitch = !el.classList.contains('e-nav-item');
      el.setAttribute('role', isSwitch ? 'switch' : 'button');
      const sync = () => {
        if (isSwitch) el.setAttribute('aria-checked', String(switchOn(el)));
        else if (el.classList.contains('active')) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      };
      sync();
      new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class', 'style'], subtree: isSwitch });
      el.addEventListener('keydown', (e) => {
        if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        el.click();
      });
    }
    // The "?" notes were hover-only: they get a tab stop and show the same bubble on focus (see initTips).
    // An icon-only button has just a title: the same text is its accessible name (read again when it takes focus, so the translated title is the one used).
    function reachTip(el){
      if (el.getAttribute('data-kb')) return;
      el.setAttribute('data-kb', 'tip');
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'note');
    }
    function nameIcon(el){
      if (el && el.tagName === 'BUTTON' && el.title && !(el.textContent || '').trim()) el.setAttribute('aria-label', el.title);
    }
    function reachAll(root){
      if (!root || root.nodeType !== 1) return;
      if (root.matches && root.matches(KB_SELECTOR)) makeReachable(root);
      root.querySelectorAll(KB_SELECTOR).forEach(makeReachable);
      if (root.matches && root.matches('[data-tip]')) reachTip(root);
      root.querySelectorAll('[data-tip]').forEach(reachTip);
      nameIcon(root);
      root.querySelectorAll('button[title]').forEach(nameIcon);
    }
    document.addEventListener('focusin', (e) => nameIcon(e.target.closest ? e.target.closest('button') : null));
    function startKeyboard(){
      reachAll(document.body);
      new MutationObserver((ms) => ms.forEach(m => m.addedNodes.forEach(reachAll))).observe(document.body, { childList: true, subtree: true });
    }
    if (document.body) startKeyboard(); else document.addEventListener('DOMContentLoaded', startKeyboard);

    // ================= WELCOME WINDOW (first start only) =================
    function showSetup(){
      if (document.getElementById('setupBack')) return;
      const names = { card:'Kart Düşür', inventory:'Envanter & Pazar', hours:'Saat Yükseltici', realistic:'Gerçekçi Mod', achievements:'Başarımlar', keys:'Anahtarlar', chat:'Sohbet' };
      const back = document.createElement('div');
      back.className = 'e-modal-back'; back.id = 'setupBack';
      back.innerHTML = '<div class="e-modal" role="dialog" aria-modal="true">'
        + '<div class="e-modal-hd"><span class="dot" style="background:#5624B3"></span><span class="ttl">'+esc(t('Kurulum'))+'</span></div>'
        + '<div class="e-modal-body"><span class="h">'+esc(t('SteamEdge\'e hoş geldin'))+'</span>'
        + '<span class="p">'+esc(t('Kullanacağın sayfaları seç. İstediğin zaman Ayarlar > Modüller\'den değiştirebilirsin.'))+'</span></div>'
        + Object.keys(names).map(k => '<div class="e-modal-ask on" data-sm="'+k+'"><span class="box"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DCE2FA" stroke-width="3.4"><path d="M5 13l4 4L19 7"></path></svg></span><span>'+esc(t(names[k]))+'</span></div>').join('')
        + '<div class="e-modal-ask" style="cursor:default;gap:12px"><span style="flex:1">'+esc(t('Performans modu'))+'</span>'
        + '<select id="setupPerf" style="height:36px;border-radius:10px;background:#090C12;border:1px solid #2B3345;color:#B9C0D6;font-size:12px;padding:0 10px;outline:none">'
        + '<option value="auto">'+esc(t('Otomatik'))+'</option><option value="full">'+esc(t('Tam'))+'</option><option value="light">'+esc(t('Hafif'))+'</option></select></div>'
        + '<div class="e-modal-ask" style="cursor:default;gap:12px"><span style="flex:1">'+esc(t('Arayüz ölçeği'))+'</span>'
        + '<select id="setupScale" style="height:36px;border-radius:10px;background:#090C12;border:1px solid #2B3345;color:#B9C0D6;font-size:12px;padding:0 10px;outline:none">'
        + [80, 90, 100, 110, 125, 150].map(v => '<option value="'+v+'"'+(v === 100 ? ' selected' : '')+'>'+v+'%</option>').join('') + '</select></div>'
        + '<div class="e-modal-ft"><button class="ok" data-yes>'+esc(t('Başla'))+'</button></div></div>';
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('show'));
      back.querySelectorAll('[data-sm]').forEach(r => r.addEventListener('click', () => r.classList.toggle('on')));
      back.querySelector('[data-yes]').onclick = async () => {
        const patch = { setupDone: true, perfMode: back.querySelector('#setupPerf').value, uiScale: Number(back.querySelector('#setupScale').value) };
        back.querySelectorAll('[data-sm]').forEach(r => { patch[MODULES[r.getAttribute('data-sm')]] = r.classList.contains('on'); });
        try { appSettings = await window.imu.settings.set(patch); } catch (_) { Object.assign(appSettings || {}, patch); }
        back.classList.remove('show');
        setTimeout(() => back.remove(), 140);
        applyModules(); applyPerf();
        if (typeof paintAll === 'function') paintAll();
      };
    }

    // Resizing the window flips automatic density at the limit; the colours are only repainted when it really flips.
    window.addEventListener('resize', () => {
      if (!(typeof appSettings==='object' && appSettings && appSettings.density==='auto')) return;
      if (document.body.classList.contains('e-compact') !== (window.innerHeight < DENSITY_AUTO_H)) applyDensity();
    });

    // "Farm in the background" - when the window is not visible the per-second interface refreshes
    // are skipped; since the card farming/hour boosting engine is on the main side it is not affected.
    // The 1 s render loops in the page JS files pass through this gate.
    // G10: while the window is hidden/minimised per-second refreshes are ALWAYS skipped, the setting
    // is not looked at. Redrawing an invisible interface every second benefits nobody;
    // since the engine runs in the main process card farming, hour boosting and achievement jobs are
    // not affected - only drawing stops. When the window comes back the pages are refreshed once,
    // so the user never sees a stale counter.
    // LIGHT MODE.
    // Chromium only throttles drawing when the window is HIDDEN or OCCLUDED. When the window
    // is on screen but not focused nothing is throttled: per-second redraws and
    // endless CSS animations cause compositing on every frame. A full screen game
    // (measured: Dota 2, Vulkan) therefore loses "independent flip" presentation, falls to composite
    // mode and the frame rate drops. It happens even if SteamEdge's GPU use is 0%,
    // because the cost is not ours, it is the desktop compositor's.
    //
    // The fix: on losing focus stop the per-second drawing and pause the animations.
    let windowFocused = document.hasFocus();
    function lightModeOn(){
      return typeof appSettings !== 'object' || !appSettings || appSettings.lightMode !== false;
    }
    // THE BEAT. A dot that pulses is one CSS animation, and a CSS animation that never ends makes Chromium draw the window 30 to 60 times a second: measured, a 7 px
    // dot costs three quarters of a processor core when the processor composites the window (1.5.7 default) and a fifth of a core on the graphics card. So the dots do not
    // animate: one timer flips body.e-beat every 0.8 s and the dots follow it (0.5 % of a core). It only runs while the window is in use: focused, visible, not in light mode,
    // and there is a dot to flip.
    const BEAT_MS = 800;
    const BEAT_DOTS = '.e-pulse, .acct-row .run-dot, .drop-slot.current, .blive i, .panel-title .dot';
    let beatTimer = null;
    function beatWanted(){
      return !document.hidden && !document.documentElement.classList.contains('e-idle') && !document.body.classList.contains('e-light');
    }
    // a dot that is in the page but not on screen (a hidden page, a bar that is closed) needs no beat
    function beatDotShown(){ return [...document.querySelectorAll(BEAT_DOTS)].some(e => e.getClientRects().length > 0); }
    function runBeat(){
      if (beatWanted()){
        if (!beatTimer) beatTimer = setInterval(() => { if (beatDotShown()) document.body.classList.toggle('e-beat'); }, BEAT_MS);
      } else if (beatTimer){
        clearInterval(beatTimer); beatTimer = null;
        document.body.classList.remove('e-beat');
      }
    }
    function paintIdle(){
      const idle = lightModeOn() && !windowFocused;
      document.documentElement.classList.toggle('e-idle', idle);
      runBeat();
    }
    window.addEventListener('focus', () => { windowFocused = true; paintIdle(); });
    window.addEventListener('blur',  () => { windowFocused = false; paintIdle(); });
    // A window that starts without the focus (started with Windows while a game is open) gets no blur event: it must be calmed from the start, not only after a focus and a blur
    paintIdle();
    document.addEventListener('DOMContentLoaded', paintIdle);
    function uiTickAllowed(){
      if (document.hidden) return false;
      return !(lightModeOn() && !windowFocused);
    }
    document.addEventListener('visibilitychange', () => {
      runBeat();
      if (document.hidden){
        // When the window is hidden the list of the OPEN tab is also dropped from memory (it used to be a setting, now it is always so;
        // before, only the per-second drawing was skipped).
        flushHeavyLists(null);
        return;
      }
      // Came back: if there is a suspended list draw it, so the counters come to the fresh value.
      Object.keys(HEAVY_LISTS).forEach(t => {
        if (designed[t] && !designed[t].classList.contains('hidden')) redrawHeavyList(t);
      });
      try { if (typeof renderActiveBox === 'function' && !designed.hours.classList.contains('hidden')) renderActiveBox(); } catch (_) {}
      try { if (typeof renderOverviewStats === 'function' && !designed.overview.classList.contains('hidden')) renderOverviewStats(); } catch (_) {}
    });

    // "Session timeout" - report real user interaction to main (resets the counter)
    (function wireActivity(){
      let last = 0;
      const ping = () => { const t = Date.now(); if (t - last < 5000) return; last = t; window.imu.activity(); };
      ['mousedown','keydown','wheel'].forEach(ev=>document.addEventListener(ev, ping, { passive:true }));
      ping();
    })();

    // Shared empty-state component (item 10): icon + title + description + optional redirect button.
    const EB_ICON = {
      idle:'<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/>',
      market:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.5 13h11"/><path d="M6 6h15l-2 7H7"/>',
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

    // 16:9 - Library Logo (logo.png). contain: a transparent logo fits without being cropped.
    function imgTag(appid){ return '<img src="'+gameImg(appid)+'" class="gt" style="width:85px;height:40px;object-fit:cover;border-radius:7px" onerror="this.style.background=\'#26313f\';this.src=\'\'">'; }
    function fmtDur(pick){ const m=Math.floor(pick/60), s=pick%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }

    // ---- sidebar expand/collapse (< / > ) ----
    const sideNav = document.getElementById('sideNav');
    const SIDE_COLLAPSE_KEY = 'imu_side_collapsed';
    // The rail tab stays aligned with the active nav item, wherever it is now (a page can be switched off or moved). Measured, not assumed.
    // Settings is not in the sidebar: its slot is the one after the last item.
    let railTab = 'overview';
    function setRailTop(tab) {
      const btn = document.getElementById('sideCollapseBtn');
      if (!btn) return;
      const items = [...document.querySelectorAll('.nav a[data-tab]:not(.e-logout)')].filter(a => a.style.display !== 'none');
      if (!items.length) return;
      let at;
      if (tab === 'settings') {
        const step = items.length > 1 ? items[1].offsetTop - items[0].offsetTop : 44;
        at = items[items.length - 1].offsetTop + step;
        railTab = tab;
        btn.style.top = (at + (items[0].offsetHeight - btn.offsetHeight) / 2) + 'px';
        return;
      }
      const a = items.find(x => x.getAttribute('data-tab') === tab);
      if (!a) return;
      railTab = tab;
      btn.style.top = (a.offsetTop + (a.offsetHeight - btn.offsetHeight) / 2) + 'px';
    }
    // railChevronPath: to the right when closed (open), to the left when open (close)
    function setRailChevron() {
      const p = document.getElementById('railChev');
      if (p) p.setAttribute('d', sideNav.classList.contains('collapsed') ? 'M10 8l4 4-4 4' : 'M14 8l-4 4 4 4');
    }
    // Below this width the rail closes by itself (a 1366x768 laptop at 150 % scaling has 911 px). It acts only when the width crosses the limit,
    // so the < button still wins until then, and the choice saved by the button (or the setting) is what comes back on a wide window.
    const RAIL_AUTO_W = 1000;
    let railNarrow = null;
    function railNarrowNow(){ return window.innerWidth < RAIL_AUTO_W; }
    function syncRailToWidth(){
      const narrow = railNarrowNow();
      if (narrow === railNarrow) return;
      railNarrow = narrow;
      sideNav.classList.toggle('collapsed', narrow || localStorage.getItem(SIDE_COLLAPSE_KEY) === '1');
      setRailChevron();
    }
    syncRailToWidth();
    window.addEventListener('resize', syncRailToWidth);
    document.getElementById('sideCollapseBtn').onclick = () => {
      const on = sideNav.classList.toggle('collapsed');
      localStorage.setItem(SIDE_COLLAPSE_KEY, on ? '1' : '0');
      setRailChevron();
    };

    // ---- tooltips ----
    // One floating bubble for every [data-tip] (the text is translated by i18n like any other attribute). It lives on <body>, so a scrolling panel
    // cannot clip it; it stays inside the window and turns below the element when there is no room above.
    (function initTips(){
      const bubble = document.createElement('div');
      bubble.className = 'e-tipbox';
      bubble.setAttribute('role', 'tooltip');
      document.body.appendChild(bubble);
      let host = null;
      function place(){
        if (!host) return;
        const r = host.getBoundingClientRect();
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        const w = Math.min(264, vw - 16);
        bubble.style.width = w + 'px';
        const h = bubble.offsetHeight;
        const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
        let top = r.top - h - 7;
        if (top < 8) top = Math.min(r.bottom + 7, vh - h - 8);
        bubble.style.left = left + 'px';
        bubble.style.top = Math.max(8, top) + 'px';
      }
      function hide(){ host = null; bubble.classList.remove('on'); }
      document.addEventListener('mouseover', (e) => {
        const el = e.target.closest ? e.target.closest('[data-tip]') : null;
        if (el === host) return;
        if (!el) { hide(); return; }
        host = el;
        bubble.textContent = el.getAttribute('data-tip') || '';
        bubble.classList.add('on');
        place();
      });
      // the keyboard gets the same bubble (and the screen reader the same text as the note's name)
      document.addEventListener('focusin', (e) => {
        const el = e.target.closest ? e.target.closest('[data-tip]') : null;
        if (!el) { hide(); return; }
        el.setAttribute('aria-label', el.getAttribute('data-tip') || '');
        host = el;
        bubble.textContent = el.getAttribute('data-tip') || '';
        bubble.classList.add('on');
        place();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
      document.addEventListener('scroll', hide, true);
      window.addEventListener('blur', hide);
      window.addEventListener('resize', hide);
    })();
