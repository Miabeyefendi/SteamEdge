// ================= QUICK NAVIGATION =================
// Ctrl+K opens a command palette: pages, settings sections and single settings, accounts and the actions of the open page, found by typing.
// Ctrl+1..9 open pages by number, Ctrl+/ or ? lists the shortcuts, and the box at the top of Settings finds a single setting.
// The ranking and the numbering are in src/utils/quickNav.js (global QuickNav); this file is the part that touches the page.
(function () {
  const QN = window.QuickNav;
  if (!QN) return;

  // ---- what there is to find ----
  const GROUPS = ['Sayfalar', 'Ayarlar', 'Hesap', 'İşlemler'];
  // The start and stop buttons of the page that is open (a command for each one that can be pressed now)
  const PAGE_BUTTONS = {
    overview: ['gStart', 'gStop'], card: ['btnStart', 'btnStop'], hours: ['btnBoostStart', 'btnBoostStop'],
    realistic: ['grStart', 'grStop'], keys: ['kyStart', 'kyStop'], achievements: ['acStop'],
  };
  let accountList = [];       // the saved accounts, read when the palette opens

  function navLink(tab) { return document.querySelector('.nav a[data-tab="' + tab + '"]'); }
  function linkText(el) { return el ? (el.textContent || '').trim() : ''; }
  function chatOn() { const b = document.getElementById('tbChat'); return moduleOn('chat') && !!b && getComputedStyle(b).display !== 'none'; }
  // The pages of the side menu that are on, in the order they are shown
  function menuPages() {
    return [...document.querySelectorAll('.nav a[data-tab]:not(.e-logout)')]
      .filter(a => a.style.display !== 'none' && moduleOn(a.getAttribute('data-tab')))
      .map(a => a.getAttribute('data-tab'));
  }
  function currentPage() {
    for (const [tab, el] of Object.entries(designed)) if (el && !el.classList.contains('hidden')) return tab;
    return 'overview';
  }
  function goPage(tab) {
    if (tab === 'settings') return openSettingsPage();
    if (tab === 'chat') { const b = document.getElementById('tbChat'); if (b) b.click(); return; }
    openTab(tab, navLink(tab));
  }

  // Settings: the sections (the left column) and every row of every section
  function sectionButtons() { return [...document.querySelectorAll('#tab-settings [data-secbtn]')]; }
  function sectionLabel(btn) {
    // the label is the text of the button itself, the small marks inside it are not part of it
    return [...btn.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  }
  function sectionName(sec) {
    const btn = document.querySelector('#tab-settings [data-secbtn="' + sec + '"]');
    return btn ? sectionLabel(btn) : sec;
  }
  function settingRows() {
    const out = [];
    document.querySelectorAll('#tab-settings .setpanel').forEach(panel => {
      const sec = panel.getAttribute('data-sec');
      const secName = sectionName(sec);
      panel.querySelectorAll('[data-setting-row]').forEach(row => {
        const nameEl = row.querySelector('span[style*="font-weight:600"]');
        if (!nameEl) return;
        const tip = row.querySelector('[data-tip]');
        out.push({ label: nameEl.textContent.trim(), keywords: secName + ' ' + (tip ? tip.getAttribute('data-tip') : ''), section: sec, sectionName: secName, row });
      });
    });
    return out;
  }
  // Opens the section a setting is in and shows the row: scrolled into view and lit for a moment
  function jumpToSetting(found) {
    openSettingsPage(found.section);
    setTimeout(() => {
      if (!found.row.isConnected) return;
      found.row.scrollIntoView({ block: 'center' });
      found.row.classList.add('e-flash');
      setTimeout(() => found.row.classList.remove('e-flash'), 1800);
    }, 60);
  }

  function commands() {
    const list = [];
    const pages = menuPages();
    const keys = {};
    QN.shortcutTable(pages, chatOn()).forEach(r => { keys[r.page] = r.keys; });
    pages.forEach(tab => list.push({ group: 'Sayfalar', label: linkText(navLink(tab)), hint: keys[tab] || '', run: () => goPage(tab) }));
    if (chatOn()) list.push({ group: 'Sayfalar', label: t('Sohbet'), hint: keys.chat || '', run: () => goPage('chat') });
    list.push({ group: 'Sayfalar', label: t('Ayarlar'), hint: keys.settings || '', run: () => goPage('settings') });
    sectionButtons().forEach(btn => list.push({ group: 'Ayarlar', label: sectionLabel(btn), hint: t('Ayarlar'), run: () => openSettingsPage(btn.getAttribute('data-secbtn')) }));
    accountList.filter(a => !a.active).forEach(a => list.push({ group: 'Hesap', label: t('Hesaba geç') + ': ' + (a.accountName || a.steamID), run: () => switchAccount(a.steamID) }));
    const add = document.getElementById('acctAddBtn'), out = document.getElementById('acctLogoutBtn');
    if (add) list.push({ group: 'Hesap', label: linkText(add), run: () => add.click() });
    if (out) list.push({ group: 'Hesap', label: linkText(out.querySelector('.e-acct-signout-lbl') || out), run: () => out.click() });
    const page = currentPage();
    (PAGE_BUTTONS[page] || []).forEach(id => {
      const b = document.getElementById(id);
      if (b && !b.disabled && b.offsetParent !== null) list.push({ group: 'İşlemler', label: linkText(b) + ' · ' + linkText(navLink(page) || document.querySelector('.nav a[data-tab="' + page + '"]')), run: () => b.click() });
    });
    const upd = document.getElementById('tbUpdate'), notif = document.getElementById('tbNotif');
    if (upd) list.push({ group: 'İşlemler', label: upd.getAttribute('title') || '', run: () => upd.click() });
    if (notif) list.push({ group: 'İşlemler', label: notif.getAttribute('title') || '', run: () => notif.click() });
    list.push({ group: 'İşlemler', label: t('Kısayolları göster'), hint: '?', run: () => openHelp() });
    return list.filter(c => c.label);
  }

  // ---- the window ----
  let pal = null;
  function otherModalOpen() {
    return [...document.querySelectorAll('.e-modal-back')].some(m => m !== (pal && pal.back) && m.id !== 'helpBack');
  }
  function openPalette() {
    if (pal) return;
    if (otherModalOpen()) return;
    const back = document.createElement('div');
    back.className = 'e-modal-back e-pal-back'; back.id = 'palBack';
    back.innerHTML = '<div class="e-palette" role="dialog" aria-modal="true" aria-label="' + esc(t('Komut paleti')) + '">'
      + '<input id="palInput" type="text" role="combobox" aria-expanded="true" aria-controls="palList" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="' + esc(t('Komut ara...')) + '">'
      + '<div id="palList" role="listbox"></div></div>';
    document.body.appendChild(back);
    pal = { back, input: back.querySelector('#palInput'), list: back.querySelector('#palList'), shown: [], index: 0, before: document.activeElement, all: [] };
    requestAnimationFrame(() => back.classList.add('show'));
    pal.all = commands();
    pal.input.addEventListener('input', paintPalette);
    pal.input.addEventListener('keydown', paletteKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) closePalette(); });
    pal.input.focus();
    paintPalette();
    // the accounts come from the main process; the list is drawn again when they are there
    window.imu.accounts.list().then((l) => { accountList = l || []; if (pal) { pal.all = commands(); paintPalette(); } }).catch(() => {});
  }
  function closePalette() {
    if (!pal) return;
    const { back, before } = pal;
    pal = null;
    back.classList.remove('show');
    setTimeout(() => back.remove(), 140);
    if (before && before.isConnected && before.focus) before.focus();
  }
  function paintPalette() {
    const q = pal.input.value;
    // single settings only appear once something is typed: the empty palette is the short list of what people open most
    const pool = q.trim() ? pal.all.concat(settingRows().map(r => ({ group: 'Ayarlar', label: r.label, keywords: r.keywords, hint: r.sectionName, run: () => jumpToSetting(r) }))) : pal.all;
    const ranked = QN.rank(q, pool);
    const byGroup = {};
    ranked.forEach(c => { (byGroup[c.group] = byGroup[c.group] || []).push(c); });
    pal.shown = [];
    let html = '';
    GROUPS.forEach(g => {
      const items = (byGroup[g] || []).slice(0, q.trim() ? 8 : 12);
      if (!items.length) return;
      html += '<div class="e-pal-grp">' + esc(t(g)) + '</div>';
      items.forEach(c => {
        const i = pal.shown.length;
        pal.shown.push(c);
        html += '<div class="e-pal-item" role="option" id="palOpt' + i + '" data-i="' + i + '"><span class="l">' + esc(c.label) + '</span>' + (c.hint ? '<span class="k">' + esc(c.hint) + '</span>' : '') + '</div>';
      });
    });
    if (!pal.shown.length) html = '<div class="e-pal-none">' + esc(t('Sonuç yok.')) + '</div>';
    pal.list.innerHTML = html;
    pal.index = 0;
    paintActive();
    pal.list.querySelectorAll('.e-pal-item').forEach(el => {
      el.addEventListener('mousemove', () => { const i = +el.getAttribute('data-i'); if (i !== pal.index) { pal.index = i; paintActive(); } });
      el.addEventListener('click', () => runPalette(+el.getAttribute('data-i')));
    });
  }
  function paintActive() {
    pal.list.querySelectorAll('.e-pal-item').forEach(el => el.classList.toggle('on', +el.getAttribute('data-i') === pal.index));
    const cur = pal.list.querySelector('#palOpt' + pal.index);
    if (cur) { pal.input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else pal.input.removeAttribute('aria-activedescendant');
  }
  function runPalette(i) {
    const c = pal && pal.shown[i];
    if (!c) return;
    closePalette();
    c.run();
  }
  function paletteKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = pal.shown.length;
      if (n) { pal.index = (pal.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; paintActive(); }
    } else if (e.key === 'Enter') { e.preventDefault(); runPalette(pal.index); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'Tab') e.preventDefault();      // the list is walked with the arrows; Tab must not leave the window
  }

  // ---- the shortcut list ----
  let help = null;
  function openHelp() {
    if (help) return;
    const pages = menuPages();
    const rows = [['Ctrl+K', t('Komut paleti')], ['Ctrl+/  ·  ?', t('Kısayollar')]];
    QN.shortcutTable(pages, chatOn()).forEach(r => rows.push([r.keys, r.page === 'settings' ? t('Ayarlar') : r.page === 'chat' ? t('Sohbet') : linkText(navLink(r.page))]));
    rows.push(['Ctrl + / - / 0', t('Arayüz ölçeği')], ['Esc', t('Pencereyi kapat')]);
    const back = document.createElement('div');
    back.className = 'e-modal-back'; back.id = 'helpBack';
    back.innerHTML = '<div class="e-modal e-help" role="dialog" aria-modal="true" aria-label="' + esc(t('Kısayollar')) + '">'
      + '<div class="e-modal-hd"><span class="dot" style="background:#5624B3"></span><span class="ttl">' + esc(t('Kısayollar')) + '</span></div>'
      + '<div class="e-help-rows">' + rows.map(r => '<div class="e-help-row"><kbd>' + esc(r[0]) + '</kbd><span>' + esc(r[1]) + '</span></div>').join('') + '</div></div>';
    document.body.appendChild(back);
    help = { back, before: document.activeElement };
    requestAnimationFrame(() => back.classList.add('show'));
    back.addEventListener('mousedown', closeHelp);
    // the window has nothing to focus; focus is kept on it so Esc reaches the page's key handler below
    back.setAttribute('tabindex', '-1'); back.focus();
  }
  function closeHelp() {
    if (!help) return;
    const { back, before } = help;
    help = null;
    back.classList.remove('show');
    setTimeout(() => back.remove(), 140);
    if (before && before.isConnected && before.focus) before.focus();
  }

  // ---- the keys ----
  function typing(el) {
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape' && help) { e.preventDefault(); closeHelp(); return; }
    if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (pal) closePalette(); else openPalette();
      return;
    }
    const helpKey = (mod && e.key === '/') || (e.key === '?' && !mod && !typing(e.target));
    if (helpKey && !pal && !otherModalOpen()) { e.preventDefault(); if (help) closeHelp(); else openHelp(); return; }
    if (pal || help || otherModalOpen()) return;
    if (mod && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
      const tab = QN.pageForShortcut(e.key, menuPages(), chatOn());
      if (tab) { e.preventDefault(); goPage(tab); }
      return;
    }
  }, true);

  // ---- the box at the top of Settings ----
  const box = document.getElementById('setSearch');
  const found = document.getElementById('setFound');
  if (box && found) {
    let hits = [], at = 0;
    const clear = () => { box.value = ''; found.style.display = 'none'; found.innerHTML = ''; hits = []; box.removeAttribute('aria-activedescendant'); };
    const paintHits = () => {
      found.querySelectorAll('.e-pal-item').forEach(el => el.classList.toggle('on', +el.getAttribute('data-i') === at));
      const cur = found.querySelector('#setHit' + at);
      if (cur) box.setAttribute('aria-activedescendant', cur.id); else box.removeAttribute('aria-activedescendant');
    };
    const go = (i) => { const h = hits[i]; if (!h) return; clear(); jumpToSetting(h); };
    box.addEventListener('input', () => {
      if (!box.value.trim()) { clear(); return; }
      hits = QN.rank(box.value, settingRows(), 8);
      at = 0;
      found.style.display = '';
      found.innerHTML = hits.length
        ? hits.map((h, i) => '<div class="e-pal-item" role="option" id="setHit' + i + '" data-i="' + i + '"><span class="l">' + esc(h.label) + '</span><span class="k">' + esc(h.sectionName) + '</span></div>').join('')
        : '<div class="e-pal-none">' + esc(t('Sonuç yok.')) + '</div>';
      found.querySelectorAll('.e-pal-item').forEach(el => el.addEventListener('click', () => go(+el.getAttribute('data-i'))));
      paintHits();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (hits.length) { at = (at + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; paintHits(); }
      } else if (e.key === 'Enter') { e.preventDefault(); go(at); }
      else if (e.key === 'Escape') { e.preventDefault(); clear(); }
    });
    found.addEventListener('mousedown', (e) => e.preventDefault());      // a click on a result must not take the focus (and close the list) first
    box.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== box && !found.contains(document.activeElement)) { found.style.display = 'none'; } }, 150));
    box.addEventListener('focus', () => { if (hits.length && box.value.trim()) found.style.display = ''; });
  }

  // the settings page and the pages above use these from their own scripts
  window.openPalette = openPalette;
  window.openShortcutHelp = openHelp;
})();
