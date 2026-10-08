    const api = window.imu;
    document.getElementById('min').onclick = () => api && api.win.minimize();
    document.getElementById('max').onclick = () => api && api.win.maximize();
    document.getElementById('close').onclick = () => api && api.win.close();

    const designed = { genel: document.getElementById('tab-genel'), kart: document.getElementById('tab-kart'), env: document.getElementById('tab-env'), saat: document.getElementById('tab-saat'), gercekci: document.getElementById('tab-gercekci'), basarim: document.getElementById('tab-basarim'), sohbet: document.getElementById('tab-sohbet'), ayarlar: document.getElementById('tab-ayarlar') };
    const empty = document.getElementById('tab-empty');
    const emptyName = document.getElementById('emptyName');
    // Opening a tab. The body used to be directly inside the nav link's click listener; since the Sohbet button in the top bar
    // has no counterpart in the sidebar it was moved to a separate function. The nav links call it too,
    // so there is only one path left.
    async function openTab(tab, sourceConnection) {
      // If leaving the Ayarlar tab, the unsaved changes warning (ayarlar.js)
      const leavingSettings = !designed.ayarlar.classList.contains('hidden');
      if (leavingSettings && typeof confirmLeaveSettings === 'function') {
        const ok = await confirmLeaveSettings();
        if (!ok) return;
      }
      if (tab === 'cikis') { window.imu.logout(); return; }
      // Open windows that belong to another page close (see edgeConfirm > o.sayfa).
      document.querySelectorAll('.e-modal-back[data-sayfa]').forEach(m=>{
        if (m.getAttribute('data-sayfa') !== tab && typeof m._kapat === 'function') m._kapat(false);
      });
      document.querySelectorAll('.nav a').forEach(x => x.classList.remove('active'));
      // Sohbet has no link in the sidebar; then none of them stays marked.
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
      if (tab === 'genel') loadGenel();
      if (tab === 'kart') loadKart();
      if (tab === 'saat') loadHours();
      if (tab === 'env') loadEnv();
      if (tab === 'gercekci') loadRealistic();
      if (tab === 'basarim') loadAchievementsPage();
      if (tab === 'sohbet') loadChat();
      if (tab === 'ayarlar') loadSettingsPage();
      redrawHeavyList(tab);
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
      kart:    { kap: 'kartQueue',    ciz: () => (typeof renderKart === 'function' && typeof kartLoaded !== 'undefined' && kartLoaded) && renderKart() },
      env:     { kap: 'envRows',      ciz: () => (typeof renderEnv === 'function' && typeof envLoaded !== 'undefined' && envLoaded) && renderEnv() },
      saat:    { kap: 'saatListBody', ciz: () => (typeof renderHoursList === 'function' && typeof hoursLoaded !== 'undefined' && hoursLoaded) && renderHoursList() },
      basarim: { kap: 'acBody',       ciz: () => (typeof renderAchievements === 'function' && typeof acData !== 'undefined' && acData) && renderAchievements() },
    };
    const suspendedTabs = new Set();

    function flushHeavyLists(openedTab){
      Object.keys(HEAVY_LISTS).forEach(t => {
        if (t === openedTab || suspendedTabs.has(t)) return;
        const container = document.getElementById(HEAVY_LISTS[t].kap);
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
      try { HEAVY_LISTS[tab].ciz(); } catch (_) { /* sayfa henüz yüklenmemiş - kendi load'u çizecek */ }
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
    function esc(s){ return (s||'').replace(/[&<>"']/g, c => ESC_CHAR[c]); }

    // ================= THEMED CONFIRM MODAL =================
    // The native confirm() box opened Windows' grey window (outside the theme). This is the theme matching
    // counterpart that does the same job. It returns a Promise: true if confirmed.
    //   opts.sormaAyari → shows a "Bir daha sorma" checkbox. If it is ticked and confirmed this setting
    //   is written false (e.g. achConfirmSingle) and later calls return true WITHOUT asking. The user can turn
    //   the setting back on from Ayarlar. A separate "dontAsk_" key used to be written and
    //   two settings held the same state.
    function edgeConfirm(opts){
      const o = opts || {};
      const key = o.sormaAyari || null;
      // If "bir daha sorma" was said before, do not show at all
      if (key && typeof appSettings === 'object' && appSettings && appSettings[key] === false) return Promise.resolve(true);

      return new Promise((resolve)=>{
        const back = document.createElement('div');
        back.className = 'e-modal-back';
        const accent = o.danger ? '#B32453' : '#5624B3';
        // o.sayfa: the window belongs to a page; if the user moves to another tab it closes
        // on its own (counts as cancelled). Envanter's "fiyatlar getirilsin mi" question used to open on top of
        // another page after the tab was changed.
        if (o.sayfa) back.setAttribute('data-sayfa', o.sayfa);
        back.innerHTML =
          '<div class="e-modal" role="dialog" aria-modal="true">'
          + '<div class="e-modal-hd"><span class="dot" style="background:'+accent+'"></span>'
          + '<span class="ttl">'+esc(t(o.tag || (o.danger ? 'Dikkat' : 'Onay')))+'</span></div>'
          + '<div class="e-modal-body">'
            + '<span class="h">'+esc(t(o.title || 'Emin misin?'))+'</span>'
            + (o.body ? '<span class="p">'+esc(t(o.body))+'</span>' : '')
            // Red warning: for cases where one should not hurry (e.g. the price is below the 24 hour average)
            + (o.uyariKirmizi ? '<span class="warn" style="color:#B32453;border-color:#B32453;background:rgba(179,36,83,.08)">'+esc(o.uyariKirmizi)+'</span>' : '')
            + (o.warn ? '<span class="warn">'+esc(t(o.warn))+'</span>' : '')
          + '</div>'
          + (key ? '<div class="e-modal-ask" data-ask><span class="box">'
              + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DCE2FA" stroke-width="3.4"><path d="M5 13l4 4L19 7"></path></svg>'
              + '</span><span>Bir daha sorma</span></div>' : '')
          + '<div class="e-modal-ft">'
            // o.tekDugme: a window that only informs (like a result summary), there is nothing to cancel
            + (o.tekDugme ? '' : '<button class="cancel" data-no>'+esc(t(o.cancelText || 'Vazgeç'))+'</button>')
            + (o.altText ? '<button class="alt" data-alt>'+esc(t(o.altText))+'</button>' : '')
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
        back._kapat = close;
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
    // The local name of the cent/kuruş - for the unit of fields like "Alt sıralama miktarı"
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

    // "Saat biçimi" - 24 hour / 12 hour (AM-PM)
    function fmtClock(d){
      const use12 = (typeof appSettings==='object' && appSettings && String(appSettings.timeFormat)==='12');
      return new Date(d).toLocaleTimeString(localCode(), { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: use12 });
    }
    function fmtDateShort(d){ return new Date(d).toLocaleDateString(localCode()); }

    // "Arayüz yoğunluğu" - in compact mode row heights and inner spacing shrink
    function applyDensity(){
      const compact = (typeof appSettings==='object' && appSettings && appSettings.density==='compact');
      document.body.classList.toggle('e-compact', !!compact);
      if (typeof temaUygula === 'function' && appSettings) temaUygula(appSettings.theme || 'dark');
    }

    // ================= NOTIFICATION SOUNDS =================
    // The sounds are PRODUCED with Web Audio, no file is downloaded: we cannot verify the
    // licence of downloaded sound files; synthesis creates no copyright issue and does not grow the app.
    //
    // There are two sound sources, which is why the tones do not resemble each other:
    //   'tone'  - oscillator. f is a number or a [start, ..., end] sweep array.
    //   'noise' - white noise + filter (percussive effects like whoosh / smash / hit come from this).
    // Shared fields: at=start s, d=duration s, g=volume, a=attack s, wave=wave shape.
    const NS = (o) => Object.assign({ t:'tone', at:0, d:.4, g:.2, a:.008, wave:'sine' }, o);
    const NZ = (o) => Object.assign({ t:'noise', at:0, d:.4, g:.2, a:.004, ftype:'bandpass', f:[800,800], q:1 }, o);
    // A small helper to repeat the same sound with a delay (an echo/double hit feel)
    const REP = (n, step, make) => Array.from({ length:n }, (_, i) => make(i * step, i));

    const NOTIF_SOUNDS = {
      // --- bell / tonal family ---
      chime:    { voices:[ NS({f:784,d:1.1,g:.16}), NS({f:1046,at:.13,d:1.3,g:.14}), NS({f:1568,at:.26,d:1.9,g:.10}) ] },
      bell:     { voices:[ NS({f:523,d:3.2,g:.16}), NS({f:1268,d:2.6,g:.07}), NS({f:2010,d:1.7,g:.04}), NS({f:3140,d:1.0,g:.02}) ] },
      glass:    { voices:[ NS({f:1568,d:2.2,g:.09}), NS({f:2637,at:.02,d:1.8,g:.06}), NS({f:4186,at:.04,d:1.2,g:.03}), NS({f:5274,at:.06,d:.8,g:.02}) ] },
      marimba:  { voices:[ NS({f:523,d:.7,g:.16,wave:'triangle'}), NS({f:659,at:.16,d:.7,g:.16,wave:'triangle'}),
                           NS({f:784,at:.32,d:.8,g:.16,wave:'triangle'}), NS({f:1046,at:.48,d:1.4,g:.14,wave:'triangle'}) ] },
      // --- percussive / SFX family (noise based) ---
      whoosh:   { voices:[ NZ({d:1.5,g:.30,a:.25,ftype:'bandpass',q:1.6,f:[240,1200,5200,2400,500]}) ] },
      swoosh:   { voices:[ NZ({d:1.4,g:.28,a:.55,ftype:'bandpass',q:2.2,f:[300,900,2600,6000]}) ] },   // swoosh:   { voices:[ NZ({d:1.4,g:.28,a:.55,ftype:'bandpass',q:2.2,f:[300,900,2600,6000]}) ] },   // reverse whoosh (rising)
      smash:    { voices:[ NZ({d:.16,g:.42,a:.002,ftype:'lowpass',q:.7,f:[9000,2500]}),
                           NS({f:[150,44],d:.5,g:.34,wave:'sine'}),
                           NZ({at:.05,d:1.9,g:.16,a:.01,ftype:'bandpass',q:5,f:[4200,3000,1800]}) ] },
      hit:      { voices:[ NZ({d:.09,g:.34,a:.001,ftype:'lowpass',q:.7,f:[6000,900]}),
                           NS({f:[190,55],d:.55,g:.30,wave:'triangle'}),
                           NZ({at:.04,d:1.2,g:.09,a:.01,ftype:'bandpass',q:6,f:[2400,1600]}) ] },   // NZ({at:.04,d:1.2,g:.09,a:.01,ftype:'bandpass',q:6,f:[2400,1600]}) ] },   // ringing tail
      thud:     { voices:[ NS({f:[110,38],d:1.1,g:.38,wave:'sine'}), NZ({d:.07,g:.14,a:.001,ftype:'lowpass',f:[1400,300]}) ] },
      knock:    { voices:[ ...REP(3,.21,(t)=>NS({f:[210,70],at:t,d:.26,g:.32,wave:'triangle'})),
                           ...REP(3,.21,(t)=>NZ({at:t,d:.05,g:.18,a:.001,ftype:'lowpass',f:[3000,600]})),
                           NZ({at:.42,d:.9,g:.06,a:.02,ftype:'lowpass',q:1,f:[900,200]}) ] },      // NZ({at:.42,d:.9,g:.06,a:.02,ftype:'lowpass',q:1,f:[900,200]}) ] },      // room echo
      // --- warning / signal family ---
      alert:    { voices: REP(3,.42,(t)=>NS({f:880,at:t,d:.26,g:.15,wave:'square'}))
                          .concat(REP(3,.42,(t)=>NS({f:660,at:t+.2,d:.26,g:.15,wave:'square'}))) },
      siren:    { voices:[ NS({f:[560,1180,560,1180,560],d:2.8,g:.13,a:.05,wave:'sawtooth'}) ] },
      honk:     { voices:[ NS({f:[420,405],d:.55,g:.18,wave:'square'}), NS({f:[318,306],d:.55,g:.14,wave:'sawtooth'}),
                           NS({f:[420,405],at:.72,d:.85,g:.18,wave:'square'}), NS({f:[318,306],at:.72,d:.85,g:.14,wave:'sawtooth'}) ] },
      radar:    { voices: REP(3,.85,(t)=>NS({f:1400,at:t,d:.9,g:.12}))
                          .concat(REP(3,.85,(t)=>NS({f:1400,at:t+.16,d:.7,g:.05}))) },   // .concat(REP(3,.85,(t)=>NS({f:1400,at:t+.16,d:.7,g:.05}))) },   // ping + its echo
      // --- game style ---
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
      // --- soft / background ---
      soft:     { voices:[ NS({f:440,d:1.4,g:.14,a:.09}), NS({f:554,at:.12,d:1.5,g:.12,a:.09}), NS({f:659,at:.24,d:1.8,g:.10,a:.09}) ] },
      heartbeat:{ voices:[ ...REP(2,.30,(t)=>NS({f:[92,48],at:t,d:.28,g:.36,wave:'sine'})),
                           ...REP(2,.30,(t)=>NS({f:[92,48],at:t+1.05,d:.28,g:.30,wave:'sine'})) ] },
      typewriter:{ voices: REP(5,.13,(t)=>NZ({at:t,d:.035,g:.20,a:.001,ftype:'bandpass',q:3,f:[2600,1500]}))
                          .concat([ NS({f:1760,at:.85,d:1.0,g:.12}) ]) },
    };

    // Play the sound. Every call opens its own AudioContext and closes it when done (keeping a long lived
    // context in Electron created needless audio device occupancy).
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
        // Applies a parameter as a number or as a [a,b,c...] sweep array
        const ramp = (param, val, start, halt)=>{
          const pts = Array.isArray(val) ? val : [val];
          param.setValueAtTime(Math.max(1, pts[0]), start);
          for (let i=1; i<pts.length; i++){
            param.exponentialRampToValueAtTime(Math.max(1, pts[i]), start + halt*(i/(pts.length-1)));
          }
        };
        def.voices.forEach(v=>{
          const start = t0 + (v.at||0), halt = v.d;
          const g = ctx.createGain();
          const atk = Math.min(v.a || .008, halt*0.5);
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(v.g, start + atk);           // attack
          g.gain.exponentialRampToValueAtTime(0.0001, start + halt);        // decay
          let src;
          if (v.t === 'noise'){
            // White noise buffer - when passed through the filter the whoosh/smash/hit character comes out
            const len = Math.ceil(ctx.sampleRate * halt);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const ch = buf.getChannelData(0);
            for (let i=0;i<len;i++) ch[i] = Math.random()*2 - 1;
            src = ctx.createBufferSource(); src.buffer = buf;
            const flt = ctx.createBiquadFilter();
            flt.type = v.ftype; flt.Q.value = v.q;
            ramp(flt.frequency, v.f, start, halt);
            src.connect(flt); flt.connect(g);
          } else {
            src = ctx.createOscillator();
            src.type = v.wave;
            ramp(src.frequency, v.f, start, halt);
            src.connect(g);
          }
          g.connect(ctx.destination);
          src.start(start); src.stop(start + halt + 0.02);
          end = Math.max(end, (v.at||0) + halt);
        });
        setTimeout(()=>{ try{ ctx.close(); }catch(_){} }, (end + 0.4) * 1000);
      } catch(_){}
    }

    // "Arka Planda Topla" (farmSilent) - when the window is not visible the per-second interface refreshes
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
      return typeof appSettings !== 'object' || !appSettings || appSettings.hafifMod !== false;
    }
    function paintIdle(){
      const idle = lightModeOn() && !windowFocused;
      document.documentElement.classList.toggle('e-durgun', idle);
    }
    window.addEventListener('focus', () => { windowFocused = true; paintIdle(); });
    window.addEventListener('blur',  () => { windowFocused = false; paintIdle(); });
    function uiTickAllowed(){
      if (document.hidden) return false;
      return !(lightModeOn() && !windowFocused);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden){
        // When "Arka Planda Topla" is on and the window is hidden the list of the OPEN tab is also dropped from memory.
        // That was the promise of the setting ("en az işlemci ve bellek kullanımı"); before, it only skipped
        // per-second drawing and did nothing on the memory side.
        if (typeof appSettings === 'object' && appSettings && appSettings.farmSilent) flushHeavyLists(null);
        return;
      }
      // Came back: if there is a suspended list draw it, so the counters come to the fresh value.
      Object.keys(HEAVY_LISTS).forEach(t => {
        if (designed[t] && !designed[t].classList.contains('hidden')) redrawHeavyList(t);
      });
      try { if (typeof renderActiveBox === 'function' && !designed.saat.classList.contains('hidden')) renderActiveBox(); } catch (_) {}
      try { if (typeof renderGenelStats === 'function' && !designed.genel.classList.contains('hidden')) renderGenelStats(); } catch (_) {}
    });

    // "Oturum zaman aşımı" - report real user interaction to main (resets the counter)
    (function wireActivity(){
      let last = 0;
      const ping = () => { const t = Date.now(); if (t - last < 5000) return; last = t; window.imu.activity(); };
      ['mousedown','keydown','wheel'].forEach(ev=>document.addEventListener(ev, ping, { passive:true }));
      ping();
    })();

    // Shared empty-state component (item 10): icon + title + description + optional redirect button.
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

    // ---- Steam profile (avatar/name/level) ----
    // The profile can only be fetched AFTER the Steam session is established and opening a session takes
    // seconds. During that time a dash stood in the top right and in the account card in Ayarlar.
    // Now the last known profile is kept in the account's own file (main.js > engine:profile)
    // and comes instantly with the settings: the screen opens full on the first frame, when the connection is made
    // fresh data is written over it. The custom address comes last, with a separate request.
    let imuProfile = null;
    let imuProfileFresh = false;      // did it come from the cache or from Steam

    function cachedProfile(){
      const p = (typeof appSettings === 'object' && appSettings && appSettings.profil) || null;
      if (!p || (!p.persona && !p.avatar)) return false;
      imuProfile = { ...p };
      applyProfile();
      return true;
    }

    async function loadProfile(){
      // If there is something at hand show it right away; if it is not fresh keep refreshing in the background.
      if (imuProfile) applyProfile(); else cachedProfile();
      if (!imuProfileFresh){
        const r = await E.profile().catch(()=>null);
        if (r && r.ok && r.profile){
          imuProfile = { ...(imuProfile || {}), ...r.profile };
          imuProfileFresh = true;
          applyProfile();
        }
      }
      // The custom address is read from the profile page; a separate request so it does not hold up the name and avatar.
      if (imuProfile && !imuProfile.vanity){
        E.vanity().then(v=>{
          if (v && v.ok && v.vanity){
            imuProfile.vanity = v.vanity;
            if (typeof paintIds === 'function') paintIds();
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
      // If there is an avatar an image, otherwise an initial badge (e.g. "VE")
      const sAv = document.getElementById('sideAvatar');
      if (sAv) {
        const initials = (nm.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '-').toUpperCase();
        sAv.innerHTML = av ? '<img src="' + esc(av) + '" onerror="this.parentNode.textContent=\'' + initials + '\'">' : initials;
      }
      const setP = document.getElementById('setPersona'); if (setP) setP.textContent = nm;
      const setLevelRow = document.getElementById('setLevel'); if (setLevelRow) setLevelRow.textContent = imuProfile.level!=null ? imuProfile.level : '-';
      // The identity rows also show the custom address that comes from the profile; so it refreshes when the account changes.
      if (typeof paintIds === 'function') paintIds();
    }

    // ---- lifetime statistics (main.js stats.json) ----
    let lifeStats = null;
    function fmtHrs(ms){ const h=ms/3600000; return h>=1 ? (h.toLocaleString(localCode(), { maximumFractionDigits:1 })+' '+t('saat')) : (Math.round(ms/60000)+' '+t('dk')); }
    // if data is given no IPC is made (the main process's 'stats:degisti' event already carries the current data).
    // All of them are the real measurement of the account on screen counted in the main process. "En verimli gün", "Ortalama
    // satış" and "Kesintisiz çalışma" used to never be filled, they always showed a dash.
    async function renderLifeStats(payloadData){
      lifeStats = payloadData || await window.imu.stats.get().catch(()=>null);
      if (!lifeStats) return;
      const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
      set('lifeRuntime', fmtHrs(lifeStats.totalRuntimeMs||0));
      set('lifeCards', localNumber(lifeStats.cardsDropped||0));
      set('lifeSold', localNumber(lifeStats.cardsSold||0));
      set('lifeBoost', fmtHrs(lifeStats.boostRuntimeMs||0));
      const days = Object.entries(lifeStats.gunlukKart || {}).filter(x => x[1] > 0);
      if (days.length){
        const [day, count] = days.reduce((m, x) => (x[1] > m[1] ? x : m));
        const [y, a, g] = day.split('-').map(Number);
        set('lifeBestDay', new Date(y, a - 1, g).toLocaleDateString(localCode()) + ' · ' + tf('# kart', count));
      } else set('lifeBestDay', '-');
      set('lifeAvgSale', (lifeStats.satisFiyatli > 0 && typeof fmtMoney === 'function')
        ? fmtMoney(lifeStats.satisTutar / lifeStats.satisFiyatli / 100) : '-');
      set('lifeStreak', lifeStats.enUzunCalismaMs >= 60000 ? fmtHrs(lifeStats.enUzunCalismaMs) : '-');
      set('lifeSince', lifeStats.since ? new Date(lifeStats.since).toLocaleDateString(localCode()) : '-');
      const h = document.getElementById('lifeHesap');
      if (h) h.textContent = (typeof appSettings === 'object' && appSettings && appSettings.persona) ? appSettings.persona : '';
    }
    // Statistics are counted in the main process; they come here as they change (only for the account on screen).
    if (window.imu.stats.onDegisti) window.imu.stats.onDegisti((d)=>renderLifeStats(d));
    // 16:9 - Library Logo (logo.png). contain: a transparent logo fits without being cropped.
    function imgTag(appid){ return '<img src="'+gameImg(appid)+'" class="gt" style="width:85px;height:40px;object-fit:cover;border-radius:7px" onerror="this.style.background=\'#26313f\';this.src=\'\'">'; }
    function fmtDur(pick){ const m=Math.floor(pick/60), s=pick%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }

    // ---- sidebar expand/collapse (< / > ) ----
    const sideNav = document.getElementById('sideNav');
    const SIDE_COLLAPSE_KEY = 'imu_side_collapsed';
    // The rail tab stays aligned with the active nav item: top = 17 + 44*index
    // (nav item 40px + 4px gap = 44px step). Since Ayarlar is not in the sidebar the index is 5.
    const RAIL_ORDER = ['genel', 'kart', 'env', 'saat', 'gercekci', 'basarim', 'ayarlar'];
    function setRailTop(tab) {
      const btn = document.getElementById('sideCollapseBtn');
      const i = RAIL_ORDER.indexOf(tab);
      if (btn && i >= 0) btn.style.top = (17 + 44 * i) + 'px';
    }
    // railChevronPath: to the right when closed (open), to the left when open (close)
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

    // ---- top bar: Ayarlar (gear) ----
    document.getElementById('tbSettings').onclick = () => {
      document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
      openAyarlar();
    };

    // ---- top bar: Sohbet ----
    // It has no counterpart in the sidebar, it opens the tab directly. The badge holds the number of unread
    // messages; it is reset while the chat screen is open.
    let chPending = 0;
    function chPaintBadge(){
      const r = document.getElementById('tbChatBadge');
      if (!r) return;
      r.style.display = chPending ? '' : 'none';
    }
    document.getElementById('tbChat').onclick = () => {
      chPending = 0; chPaintBadge();
      openTab('sohbet');
    };

    // ---- top bar: version badge and update warning ----
    // The version is read from package.json (preload > imu.surum); it is written by hand nowhere.
    const APP_VERSION = (window.imu && window.imu.surum) || '';
    (function paintVersion(){
      const e = document.getElementById('tbVersion');
      if (e) e.textContent = APP_VERSION ? ('v' + APP_VERSION) : 'v-';
    })();

    // ---- UPDATE ----
    // The app looks ONCE at startup. If there is a new version a window opens; if the version is current
    // nothing is shown - there is no point disturbing the user just to say "everything is fine".
    // The button in the top bar repeats the same check whenever asked; there the result is told
    // in every case, because whoever pressed the button is waiting for an answer.
    // There is NO download, install or self-update: only the version number is read.
    let latestUpdateStatus = null;
    let updateWindowOpen = false;

    async function updateWindow(d){
      if (updateWindowOpen) return;
      updateWindowOpen = true;
      try {
        const date = d.yayinTs ? new Date(d.yayinTs).toLocaleDateString(localCode()) : '';
        const ac = await edgeConfirm({
          tag: 'Güncelleme',
          title: t('Yeni sürüm yayımlandı:') + ' v' + d.son,
          body: t('Kurulu sürüm') + ' v' + d.kurulu + (date ? ('  ·  ' + t('yayımlanma tarihi') + ' ' + date) : '')
                + '\n' + t('Değişiklikleri yayın sayfasında okuyabilirsin.'),
          warn: 'Uygulama hiçbir şey indirmez. Yeni sürümü yayın sayfasından kendin indirir, arşivi BOŞ ve YENİ bir klasöre çıkarır, eski klasördeki settings klasörünü yeni klasöre kopyalarsın.',
          confirmText: 'Yayın Sayfasını Aç',
          cancelText: 'Şimdi Değil',
        });
        if (ac) window.imu.openExternal(d.url);
      } finally {
        updateWindowOpen = false;
      }
    }

    function updateStatus(d, manuallyChecked){
      latestUpdateStatus = d || null;
      const badge = document.getElementById('tbUpdateBadge');
      const hasNew = !!(d && d.ok && d.guncelMi === false);
      // The dot above the button: lit when there is a new version, off when current.
      if (badge) badge.style.display = hasNew ? 'block' : 'none';
      const btn = document.getElementById('tbUpdate');
      if (btn) btn.title = hasNew ? (t('Yeni sürüm var:') + ' v' + d.son) : 'Güncellemeleri denetle';
      if (hasNew){ updateWindow(d); return; }
      // Current or could not check: only answer if the user asked by hand.
      if (!manuallyChecked || !d || typeof toast !== 'function') return;
      if (d.ok) toast('Güncelleme').done(tf('En güncel sürümü kullanıyorsun (v#).', d.kurulu));
      else toast('Güncelleme').fail(t(d.hata || 'Sürüm bilgisi alınamadı.') + ' ' + t('Kurulu sürümün çalışmaya devam eder.'));
    }

    if (window.imu && window.imu.guncelleme){
      // The result of the single check at startup comes from here.
      window.imu.guncelleme.onDurum((d) => updateStatus(d, false));
      const ub = document.getElementById('tbUpdate');
      if (ub) ub.onclick = async ()=>{
        ub.disabled = true;
        const d = await window.imu.guncelleme.kontrol().catch(e=>({ ok:false, hata:(e&&e.message)||'Denetim başarısız.' }));
        ub.disabled = false;
        updateStatus(d, true);
      };
    }

    // ---- ACCOUNT IDENTITY (the account menu top right) ----
    // All seven of Steam's formats derive from a SINGLE number: SteamID64. Nothing is asked from the network.
    //   account number = SteamID64 - 76561197960265728   (universe 1, the "individual" account base)
    //   classic        = STEAM_1:<last bit of the number>:<half of the number>
    //   SteamID3       = [U:1:<account number>]
    // BigInt is used because whole numbers exceed 53 bits; with Number the last digits get corrupted.
    const STEAM64_BASE = 76561197960265728n;
    let identities = null;

    function idFormats(steamID64, vanity){
      const rawText = String(steamID64 || '').trim();
      if (!/^\d{17}$/.test(rawText)) return null;
      let sid;
      try { sid = BigInt(rawText); } catch (_) { return null; }
      if (sid < STEAM64_BASE) return null;
      const accountRef = sid - STEAM64_BASE;
      return {
        idSteam64: rawText,
        idKlasik : 'STEAM_1:' + (accountRef % 2n) + ':' + (accountRef / 2n),
        idSteam3 : '[U:1:' + accountRef + ']',
        idHesap  : String(accountRef),
        idHex    : '0x' + sid.toString(16).toUpperCase().padStart(16, '0'),
        idProfil : 'https://steamcommunity.com/profiles/' + rawText,
        idOzel   : vanity ? ('https://steamcommunity.com/id/' + vanity) : null,
      };
    }

    function paintIds(){
      const sid = (imuProfile && imuProfile.steamID)
        || (typeof appSettings === 'object' && appSettings && appSettings.steamID) || null;
      identities = idFormats(sid, imuProfile && imuProfile.vanity);
      ['idSteam64','idKlasik','idSteam3','idHesap','idHex','idProfil','idOzel'].forEach(id=>{
        const e = document.getElementById(id);
        if (!e) return;
        const v = identities ? identities[id] : null;
        // The menu is 268 px: the full address did not fit the row and was cut with an ellipsis. In the addresses
        // the "https://steamcommunity.com" part is the same on every row anyway, so only the
        // path is shown. The value that is COPIED and OPENED stays the full address.
        // The address is compared by PARSING, not by cutting the beginning: not every string that STARTS with "steamcommunity.com"
        // is Steam (like steamcommunity.com.someothersite.tr).
        // Here the value is already an address we produced ourselves, but this is the right way to compare and
        // the code scan was rightly flagging it.
        let shown = v;
        if (v) {
          try {
            const u = new URL(v);
            if (u.origin === 'https://steamcommunity.com') shown = u.pathname + u.search + u.hash;
          } catch (_) { /* adres degilse oldugu gibi gosterilir */ }
        }
        // An empty dash looks "broken"; a row with no value should write the reason.
        e.textContent = shown || (identities ? 'tanımlı değil' : 'hesap bağlı değil');
        e.classList.toggle('bos', !v);
        if (v) e.parentNode.title = v;      // the full value shows when hovered
      });
      document.querySelectorAll('#kimlikBox [data-kopya]').forEach(b=>{
        const v = identities && identities[b.getAttribute('data-kopya')];
        b.disabled = !v;
        b.style.opacity = v ? '1' : '0.45';
      });
      const everything = document.getElementById('idCopyAll');
      const profileData = document.getElementById('idOpenProfile');
      if (everything) everything.disabled = !identities;
      if (profileData) profileData.disabled = !identities;
    }

    function copyId(text, labelText){
      navigator.clipboard.writeText(text).then(()=>{
        if (typeof toast === 'function') toast('Kopyalandı').done(t(labelText || 'Değer') + ' ' + t('panoya kopyalandı.'));
      }).catch(()=>{});
    }

    document.querySelectorAll('#kimlikBox [data-kopya]').forEach(b=>{
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const v = identities && identities[b.getAttribute('data-kopya')];
        if (v) copyId(v, 'Kimlik');
      });
    });
    const idCopyAllBtn = document.getElementById('idCopyAll');
    if (idCopyAllBtn) idCopyAllBtn.onclick = (e)=>{
      e.stopPropagation();
      if (!identities) return;
      copyId([
        'SteamID64'.padEnd(15) + ': ' + identities.idSteam64,
        'SteamID'.padEnd(15) + ': ' + identities.idKlasik,
        'SteamID3'.padEnd(15) + ': ' + identities.idSteam3,
        t('Hesap numarası').padEnd(15) + ': ' + identities.idHesap,
        'Hex'.padEnd(15) + ': ' + identities.idHex,
        t('Profil adresi').padEnd(15) + ': ' + identities.idProfil,
        t('Özel adres').padEnd(15) + ': ' + (identities.idOzel || t('tanımlı değil')),
      ].join('\n'), 'Tüm kimlik biçimleri');
    };
    const idOpenProfileBtn = document.getElementById('idOpenProfile');
    if (idOpenProfileBtn) idOpenProfileBtn.onclick = (e)=>{
      e.stopPropagation();
      if (identities) window.imu.openExternal(identities.idOzel || identities.idProfil);
    };

    // ---- top bar: Notifications + Profile/Account accordion (references first, event binding after) ----
    const notifDropdown = document.getElementById('notifDropdown');
    const acctDropdown = document.getElementById('acctDropdown');
    const tbProfile = document.getElementById('tbProfile');

    function closeAcct(){ acctDropdown.classList.remove('open'); tbProfile.classList.remove('open'); }
    function closeNotif(){ notifDropdown.classList.remove('open'); }

    // Sidebar bottom status indicator: statusColor = running ? ok : warn,
    // statusLabel = running ? 'ÇALIŞIYOR' : 'HAZIR'. genel.js calls it when the state changes.
    function setSysStatus(running){
      const d = document.getElementById('sysDot'), l = document.getElementById('sysLabel');
      const c = running ? 'var(--e-ok)' : 'var(--e-warn)';
      if (d) d.style.background = c;
      if (l){ l.style.color = c; l.textContent = running ? 'ÇALIŞIYOR' : 'HAZIR'; }
    }

    // Notification badge (the red dot above the bell icon in the header): visible if there is unread
    // activity. The count is reported by genel.js's renderFeed() - since activityFeed is defined there with `const`
    // reading it directly from here carries a TDZ risk.
    let notifSeen = 0, notifCount = 0;
    function updateNotifBadge(n){
      if (typeof n === 'number') notifCount = n;
      const b = document.getElementById('tbNotifBadge');
      if (b) b.style.display = notifCount > notifSeen ? 'block' : 'none';
    }

    // reads from genel.js's real activityFeed (no made up data)
    function renderNotifList(){
      const box = document.getElementById('notifList');
      const feed = activityFeed || [];
      if (!feed.length){ box.innerHTML = '<div style="padding:14px;color:var(--muted2);font-size:12px;text-align:center">Henüz bildirim yok.</div>'; return; }
      box.innerHTML = feed.slice(0,8).map(f=>{
        const t = new Date(f.ts).toLocaleTimeString(localCode());
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
      // Badges: "Aktif" = shown in the interface, green dot = card/hour running in the background
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
    // G3: Steam connection state strip. So that a drop is not silent a persistent strip is shown
    // below the top bar; it disappears on its own when reconnected.
    // The text is built here in the interface language, not from the main process; the main process only sends the fields
    // (durum, sebep, deneme, bekleme, sinir). The strip used to say ASCII Turkish
    // "yeniden baglaniyor (deneme 2, 10 sn sonra)" in every language.
    function connectionText(d){
      if (d.durum === 'koptu') return t('Steam bağlantısı koptu.') + (d.sebep ? (' (' + d.sebep + ')') : '');
      if (d.durum === 'baglaniyor'){
        const sn = Math.max(1, Math.round((d.bekleMs || 0) / 1000));
        return d.sinir
          ? tf('Steam bağlantısı koptu. # sn sonra yeniden denenecek (deneme # / #).', sn, d.deneme || 1, d.sinir)
          : tf('Steam bağlantısı koptu. # sn sonra yeniden denenecek (deneme #).', sn, d.deneme || 1);
      }
      if (d.durum === 'vazgecildi'){
        if (d.kalici) return +d.eresult === 34
          ? t('Bu hesap başka bir oturumda açıldı; SteamEdge yeniden bağlanmıyor.')
          : t('Steam oturumu artık geçersiz; hesabı yeniden eklemen gerekiyor.');
        return d.deneme
          ? tf('Steam bağlantısı # denemede kurulamadı; yeniden bağlanma durdu.', d.deneme)
          : t('Steam bağlantısı koptu; yeniden bağlanma kapalı.');
      }
      if (d.durum === 'bagli' && d.yenidenBaglandi) return tf('Steam bağlantısı geri geldi, # oyun yeniden açıldı.', d.oyunlar || 0);
      return '';
    }
    function connectionStrip(d){
      const status = d.durum;
      const message = connectionText(d);
      let el = document.getElementById('baglantiSerit');
      if (status === 'bagli'){
        if (el) el.remove();
        return;
      }
      if (!el){
        el = document.createElement('div');
        el.id = 'baglantiSerit';
        el.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 20px;'
          + 'font-size:12px;font-weight:600;border-bottom:1px solid #B37E24;background:#1A1408;color:#B37E24';
        // The strip goes above the BODY ROW. It used to be added directly as a sibling of <main>;
        // since that row is the same flex row as the side panel the strip fell next to the sidebar instead of
        // below the top bar.
        const mainEl = document.querySelector('main');
        const rowEl = mainEl && mainEl.parentNode;                   // aside + main row
        const goal = (rowEl && rowEl.parentNode) ? rowEl : (mainEl || document.body);
        goal.parentNode.insertBefore(el, goal);
      }
      const colorVal = (status === 'koptu' || status === 'vazgecildi') ? '#B32453' : '#B37E24';
      el.style.borderBottomColor = colorVal; el.style.color = colorVal;
      el.innerHTML = '<span style="width:7px;height:7px;border-radius:12px;background:'+colorVal+';flex-shrink:0;'
        + (status === 'vazgecildi' ? '' : 'animation:e-dotPulse 1.6s ease-in-out infinite') + '"></span><span>'+esc(message||'')+'</span>'
        + (status === 'vazgecildi'
            ? '<button data-yeniden style="margin-left:auto;height:26px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid '+colorVal+';color:'+colorVal
              + ';font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;flex-shrink:0">'+esc(t('Yeniden Bağlan'))+'</button>'
            : '');
      const b = el.querySelector('[data-yeniden]');
      if (b) b.onclick = async ()=>{
        b.disabled = true;
        const r = await window.imu.engine.yenidenBaglan().catch(()=>null);
        if (!r || !r.ok){ b.disabled = false; toast('Steam Bağlantısı').fail(t((r && r.error) || 'Yeniden bağlanılamadı.')); }
      };
    }
    if (window.imu.engine && window.imu.engine.onDurum){
      window.imu.engine.onDurum((d)=>{
        if (!d || !d.aktif) return;          // only the account open on screen
        connectionStrip(d);
        if (d.durum === 'koptu'){
          if (typeof setSysStatus === 'function') setSysStatus(false);
          if (typeof pushFeed === 'function') pushFeed('hata', 'Steam Bağlantısı', connectionText(d), 'Hata');
          // If reconnecting is off "vazgeçildi" comes right after, and that gives the notification.
          if (d.sinir !== 0 && typeof notify === 'function') notify('error', 'Steam Bağlantısı Koptu', 'Yeniden bağlanılıyor...');
        } else if (d.durum === 'bagli' && d.yenidenBaglandi){
          if (typeof pushFeed === 'function') pushFeed('kart', 'Steam Bağlantısı', connectionText(d), 'Başarılı');
        }
      });
    }

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
        ['kartRows', 'Oyun listesi yükleniyor...'],
        ['envRows', 'Envanter yükleniyor...'],
        ['saatListBody', 'Kütüphane yükleniyor...'],
        ['activeBoostBox', 'Kuyruk yükleniyor...'],
        ['acBody', 'Başarımlar yükleniyor...'],
        ['grListe', 'Yükleniyor...'],
        ['gFeed', 'Yükleniyor...'],
      ];
      goals.forEach(([id, text])=>{
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">'+text+'</div>';
      });
    }
    function resetPageCaches(){
      placeSkeleton();
      if (typeof kartLoaded !== 'undefined'){ kartLoaded = false; dropGames = []; }
      if (typeof hoursLoaded !== 'undefined'){ hoursLoaded = false; ownedGames = []; selectedHours = []; }
      if (typeof envLoaded !== 'undefined'){ envLoaded = false; invMerged = null; invItems = null; detailKey = null; }
      if (typeof priceMap !== 'undefined') priceMap.clear();
      if (typeof selected !== 'undefined') selected.clear();
      if (typeof acLoaded !== 'undefined'){ acLoaded = false; acData = null; acAppid = null; }
      if (typeof grLoaded !== 'undefined'){ grLoaded = false; grGames = []; grAppid = null; grPlan = null; }
      if (typeof acCache !== 'undefined') acCache.clear();
      // Chat must not show another account's friend list
      if (typeof chLoaded !== 'undefined'){ chLoaded = false; chFriends = []; chSelected = null; chMessages.clear(); chUnread.clear(); }
      if (typeof overviewLoaded !== 'undefined') overviewLoaded = false;
      // The activity feed is account specific; the old account's history must not stay on screen
      if (typeof activityFeed !== 'undefined') activityFeed.length = 0;
      // Recent drops are account specific too
      if (typeof recentDrops !== 'undefined') recentDrops.length = 0;
    }
    // The visible tab is found from the DOM. Ayarlar and Sohbet have no link in the sidebar,
    // Realistic Mode was not in the list either: while these were open Genel Bakış was loaded when the account changed,
    // and the visible page stayed in the skeleton.
    function reloadActiveTab(){
      const tab = Object.keys(designed).find(k => designed[k] && !designed[k].classList.contains('hidden')) || 'genel';
      if (tab === 'kart' && typeof loadKart === 'function') loadKart();
      else if (tab === 'saat' && typeof loadHours === 'function') loadHours();
      else if (tab === 'env' && typeof loadEnv === 'function') loadEnv();
      else if (tab === 'basarim' && typeof loadAchievementsPage === 'function') loadAchievementsPage();
      else if (tab === 'gercekci' && typeof loadRealistic === 'function') loadRealistic();
      else if (tab === 'sohbet' && typeof loadChat === 'function') loadChat();
      else if (tab === 'ayarlar' && typeof loadSettingsPage === 'function') loadSettingsPage();
      else if (typeof loadGenel === 'function') loadGenel();
    }
    async function switchAccount(steamID){
      closeAcct();
      const r = await window.imu.accounts.switch(steamID).catch(()=>null);
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Hesap değiştirilemedi.', body:(r && r.error) ? t(r.error) : '', confirmText:'Tamam', tekDugme:true });
        return;
      }
      resetPageCaches();
      imuProfile = null; imuProfileFresh = false; loadProfile();
      reloadActiveTab();
      renderAcctList();
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
             + t('Steam hesabının kendisine hiçbir şey olmaz; istersen tekrar giriş yapabilirsin.'),
        warn:'Bu işlem geri alınamaz.',
        confirmText:'Hesabı Kaldır', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.accounts.remove(steamID).catch(()=>null);
      if (!r || !r.ok) {
        edgeConfirm({ tag:'Hata', danger:true, title:'Hesap kaldırılamadı.', body:(r && r.error) ? t(r.error) : '', confirmText:'Tamam', tekDugme:true });
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
    if (window.imu.onAccountActivity) window.imu.onAccountActivity(()=>{
      if (acctDropdown.classList.contains('open')) renderAcctList();
    });
    // Incoming Steam message: it drops into the activity feed + a toast appears on screen. The desktop notification
    // is sent in the main process (see main.js connectAccount > onChatMessage).
    if (window.imu.onChatMessage) window.imu.onChatMessage((m)=>{
      // If the chat screen is not open let the badge in the top bar show.
      if (designed.sohbet && designed.sohbet.classList.contains('hidden')){
        chPending++; chPaintBadge();
      }
      const who = m.persona || m.from;
      if (typeof pushFeed === 'function'){
        pushFeed('mesaj', t('Steam mesajı') + ' · ' + who,
                 m.message.slice(0,140) + (m.replied ? '  ·  ' + t('otomatik yanıtlandı') : ''), 'Mesaj');
      }
      if (typeof toast === 'function') toast(who).done(m.message.slice(0,120));
      if (typeof playNotifSound === 'function' && appSettings && appSettings.notifications
          && appSettings.notifyChat !== false && !(typeof inQuietHours === 'function' && inQuietHours())) playNotifSound();
    });
    // At startup connect all saved accounts in the background - parallel idling is built on this
    window.imu.accounts.connectAll().then((res)=>{
      const failed = (res||[]).filter(r=>!r.ok);
      if (failed.length && typeof pushFeed === 'function'){
        failed.forEach(f=>pushFeed('hata','Hesap bağlanamadı', f.accountName+' - '+(f.error||''), 'Hata'));
      }
    }).catch(()=>{});
    document.getElementById('acctLogoutBtn').onclick = () => {
      // ITEM 9: signing out does NOT delete permanent data, say it clearly - so the user does not hesitate
      edgeConfirm({
        tag:'Çıkış Yap',
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

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#acctDropdown') && !e.target.closest('#tbProfile')) closeAcct();
      if (!e.target.closest('#notifDropdown') && !e.target.closest('#tbNotif')) closeNotif();
    });
