    // The top bar: Settings and Chat buttons, notifications, the sidebar status, the Start/Stop button state and the account visibility menu.
    // Loaded after common.js (main.html); like every page script it shares the global scope.

    // ---- top bar: Settings (gear) ----
    document.getElementById('tbSettings').onclick = () => {
      document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
      openSettingsPage();
    };

    // ---- top bar: Chat ----
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
      openTab('chat');
    };

    // ---- top bar: Notifications + Profile/Account accordion (references first, event binding after) ----
    const notifDropdown = document.getElementById('notifDropdown');
    const acctDropdown = document.getElementById('acctDropdown');
    const tbProfile = document.getElementById('tbProfile');

    function closeAcct(){ acctDropdown.classList.remove('open'); tbProfile.classList.remove('open'); }
    function closeNotif(){ notifDropdown.classList.remove('open'); }

    // Sidebar bottom status indicator: statusColor = running ? ok : warn,
    // statusLabel = the running / ready text. overview.js calls it when the state changes.
    function setSysStatus(running){
      const d = document.getElementById('sysDot'), l = document.getElementById('sysLabel');
      const c = running ? 'var(--e-ok)' : 'var(--e-warn)';
      if (d){ d.style.background = c; d.classList.toggle('e-pulse', !!running); }
      if (l){ l.style.color = c; l.textContent = running ? 'ÇALIŞIYOR' : 'HAZIR'; }
    }

    // Notification badge (the red dot above the bell icon in the header): visible if there is unread
    // activity. The count is reported by overview.js's renderFeed() - since activityFeed is defined there with `const`
    // reading it directly from here carries a TDZ risk.
    let notifSeen = 0, notifCount = 0;
    function updateNotifBadge(n){
      if (typeof n === 'number') notifCount = n;
      const b = document.getElementById('tbNotifBadge');
      if (b) b.style.display = notifCount > notifSeen ? 'block' : 'none';
    }

    // reads from overview.js's real activityFeed (no made up data)
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

    // ---- START / STOP BUTTONS: one place decides which of them can be pressed ----
    // Start is closed while its job runs (or was just started and the first answer has not come), Stop is closed while nothing runs. The pages used to paint this
    // themselves, each in its own way (or not at all), so a job could be started twice or "stopped" when nothing ran.
    const runBusy = {};                 // kind -> until when a start that has been pressed counts as running
    function runBegin(kind, ms){ runBusy[kind] = Date.now() + (ms || 4000); paintRunButtons(); setTimeout(paintRunButtons, (ms || 4000) + 60); }
    function runEnd(kind){ delete runBusy[kind]; paintRunButtons(); }
    function runIsOn(kind){
      if (kind === 'card') return typeof lastTick !== 'undefined' && !!(lastTick && lastTick.running);
      if (kind === 'hours') return typeof boostState !== 'undefined' && !!(boostState && boostState.running);
      if (kind === 'realistic') return typeof grStatus !== 'undefined' && !!(grStatus && grStatus.runningFlag);
      return false;
    }
    function closeButton(id, closed){
      const el = document.getElementById(id);
      if (!el || el.disabled === closed) return;
      el.disabled = closed;
      el.classList.toggle('is-off', closed);
    }
    function paintRunButtons(){
      const pairs = [['card', 'btnStart', 'btnStop'], ['hours', 'btnBoostStart', 'btnBoostStop'], ['realistic', 'grStart', 'grStop']];
      pairs.forEach(([kind, start, stop]) => {
        const on = runIsOn(kind);
        closeButton(start, on || (runBusy[kind] || 0) > Date.now());
        closeButton(stop, !on);
      });
      if (typeof paintPanelButtons === 'function') paintPanelButtons();
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#acctDropdown') && !e.target.closest('#tbProfile')) closeAcct();
      if (!e.target.closest('#notifDropdown') && !e.target.closest('#tbNotif')) closeNotif();
      if (!e.target.closest('#tbVis')) closeVis();
    });

    // ---- Account visibility (top bar) ----
    // What friends see on Steam for the account on screen. The choice is the account's own (main.js personaState) and the engine sends it again on
    // every logon, reconnect and game change. It replaced the "Appear offline" switch, which a game opened by a job or a reconnect could undo.
    const VIS_NAMES = { online:'Çevrimiçi', away:'Dışarıda', invisible:'Görünmez' };
    const tbVis = document.getElementById('tbVis');
    function visState(){ return (typeof appSettings === 'object' && appSettings && VIS_NAMES[appSettings.personaState]) ? appSettings.personaState : 'online'; }
    function paintVisibility(){
      if (!tbVis) return;
      const state = visState();
      tbVis.setAttribute('data-state', state);
      document.getElementById('tbVisText').textContent = t(VIS_NAMES[state]);
      tbVis.querySelectorAll('[data-vis]').forEach(b => b.setAttribute('aria-checked', String(b.getAttribute('data-vis') === state)));
    }
    function closeVis(){
      if (!tbVis) return;
      tbVis.classList.remove('open');
      document.getElementById('tbVisBtn').setAttribute('aria-expanded', 'false');
    }
    if (tbVis){
      document.getElementById('tbVisBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !tbVis.classList.contains('open');
        closeAcct(); closeNotif();
        tbVis.classList.toggle('open', willOpen);
        document.getElementById('tbVisBtn').setAttribute('aria-expanded', String(willOpen));
      });
      tbVis.querySelectorAll('[data-vis]').forEach(b => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        closeVis();
        const state = b.getAttribute('data-vis'), before = visState();
        // The same choice again is sent too: the page may show a state Steam does not have (an account that was switched to), and this is how it is set right
        appSettings.personaState = state;
        paintVisibility();
        // The answer is what was really saved: a page of another account (a switch under way) gets that account's value back, not this one
        const s = await window.imu.settings.set({ personaState: state }).catch(() => null);
        if (s){ appSettings = s; paintVisibility(); return; }
        appSettings.personaState = before;
        paintVisibility();
        toast('Hesap görünürlüğü').fail(t('Görünürlük değiştirilemedi.'));
      }));
    }
