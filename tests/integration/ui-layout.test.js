// Every page fits every window size we support: nothing runs off the right edge, nothing is clipped by its own panel, no horizontal scrollbar
// appears, the Start and Stop buttons stay in view, the rail and the density follow the window, and a tooltip near the edge stays inside the window.
// Windows smaller than the layout was drawn for (900x560) get the zoom the app gives them (src/core/windowFit.js): the page then still has the whole
// design size, so everything fits and keeps its shape.
// Needs Electron: run with `npm test` (tests/run.js) or `electron <file> --user-data-dir=<temp folder>`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs'), vm = require('vm');
const ROOT = require('path').resolve(__dirname, '..', '..');
const windowFit = require(ROOT + '/src/core/windowFit.js');
const src = fs.readFileSync(ROOT + '/main.js', 'utf8');
const DEFAULTS = vm.runInNewContext('(' + src.match(/const DEFAULT_SETTINGS = (\{[\s\S]*?\n\});/)[1] + ')');
const settings = { ...DEFAULTS, language: process.env.LANGX || 'en', accountCurrency: 'USD', steamID: '76561198000000000', persona: 'tester', parentalPin: '' };
const items = Array.from({ length: 14 }, (_, i) => ({ assetId: String(i + 1), order: i, dedupKey: 'k_' + i, name: i % 3 === 0 ? 'Some Rather Long Trading Card Name ' + i : 'Card ' + i, marketHashName: '440-Card ' + i, iconUrl: null, tradable: i % 2 === 0, marketable: true, type: i % 5 === 0 ? 'booster' : 'card', gameName: 'Game Number ' + (i % 7), appid: 440 + (i % 7), amount: 1 + (i % 4) }));
const games = ['Alpha Game', 'Beta Game With A Much Longer Name Than Usual', 'Gamma Game', 'Delta', 'Epsilon Game'].map((name, i) => ({ appid: 10 * (i + 1), name, remaining: 1 + i, playtimeMin: 500 - 20 * i }));
const answers = {
  'settings:get': () => settings, 'settings:defaults': () => { const d = { ...DEFAULTS }; delete d.settingsVersion; return d; }, 'settings:info': () => ({ saveTime: null }),
  'settings:save': (_e, patch) => { Object.assign(settings, patch); return { ok: true, settings, saveTime: Date.now(), appliedOne: [], pauseMs: 5000 }; },
  'settings:set': (_e, patch) => { Object.assign(settings, patch); return settings; },
  'engine:connect': () => ({ ok: true }), 'engine:dropGames': () => ({ ok: true, games, refundIds: [] }), 'engine:lastLists': () => ({ ok: true, drop: [], owned: [] }),
  'engine:ownedGames': () => ({ ok: true, games: games.map((g, i) => ({ appid: g.appid, name: g.name, playtimeForever: 600 - 40 * i, hasStats: true })) }),
  'engine:profile': () => ({ ok: true, profile: { persona: 'tester', level: 5 } }), 'engine:vanity': () => ({ ok: true }),
  'engine:connectionStatus': () => ({ condition: 'connected' }), 'state:get': () => ({ value: null }), 'stats:get': () => ({}), 'accounts:list': () => [], 'accounts:connectAll': () => [],
  'engine:inventorySources': () => ({ ok: true, found: true, list: [{ appid: 730, name: 'Counter-Strike 2', assetCount: 3, contexts: [{ id: '2', name: 'Backpack', assetCount: 3 }] }, { appid: 570, name: 'Dota 2', assetCount: 5, contexts: [{ id: '2', name: 'Backpack', assetCount: 5 }] }] }),
  'engine:inventory': () => ({ ok: true, items }), 'engine:pricesFor': () => ({ ok: true, prices: {}, queued: 0 }), 'engine:historyFor': () => ({ ok: true, history: {} }),
  'engine:itemOrders': () => ({ ok: true, orders: { error: 'x' } }), 'engine:priceHistory': () => ({ ok: true, history: null }), 'engine:saleFee': () => ({ ok: true, outcomeData: [] }),
  'market:myListings': () => ({ ok: true, data: { listings: [], toConfirm: [], onHold: [], buyOrders: 0 } }),
  'keys:state': () => ({ queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null }),
  'app:info': () => ({ versionStr: '1.4.9' }), 'app:memory': () => null, 'update:lastStatus': () => null, 'realistic:noAchievementsList': () => ({ ok: true, appids: [] }),
};
const preload = fs.readFileSync(ROOT + '/preload.js', 'utf8');
[...preload.matchAll(/invoke\('([^']+)'/g)].forEach((m) => { try { ipcMain.handle(m[1], answers[m[1]] || (() => ({ ok: true }))); } catch (_) {} });
[...preload.matchAll(/send\('([^']+)'/g)].forEach((m) => ipcMain.on(m[1], () => {}));
const consoleErr = [];
const log = console.log;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: process.env.SHOW === '1', width: 1716, height: 1000, useContentSize: true, webPreferences: { preload: ROOT + '/preload.js', sandbox: false, contextIsolation: true, backgroundThrottling: false } });
  w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2 && !/Electron Security Warning/.test(msg)) consoleErr.push(msg.slice(0, 200)); });
  await w.loadFile(ROOT + '/src/main/main.html');
  const js = (k) => w.webContents.executeJavaScript(k).catch((e) => { log('[js error] ' + e.message); return null; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => { if (!process.env.SHOTS) return; w.webContents.invalidate(); await w.webContents.capturePage(); await wait(350); w.webContents.invalidate(); fs.writeFileSync(process.env.SHOTS + '/' + name + '.png', (await w.webContents.capturePage()).toPNG()); };
  let failures = 0;
  const check = (name, condition, extra) => { if (!condition) failures++; log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  await wait(1500);

  // What is wrong with the page on screen: the lists hold up to 6 examples each, empty arrays mean a healthy page.
  const MEASURE = `(() => {
    const iw = innerWidth;
    const cut = [], clipped = [], bars = [];
    const label = (e) => { const tx = (e.children.length === 0 ? (e.textContent || '').trim().slice(0, 18) : ''); return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '') + (tx ? '[' + tx + ']' : ''); };
    const sec = document.querySelector('main section:not(.hidden)');
    [...document.querySelectorAll('body *')].forEach((e) => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (e.closest('.hidden') || e.closest('svg') || e.closest('.e-tipbox') || e.closest('#toastBox')) return;
      if (r.right > iw + 2) cut.push(label(e) + ':' + Math.round(r.right));
      if (!sec || !sec.contains(e)) return;
      let a = e.parentElement;
      while (a && a !== document.body) {
        if (getComputedStyle(a).overflowX !== 'visible') { const ar = a.getBoundingClientRect(); if (ar.width > 0 && r.right > ar.right + 2) clipped.push(label(e) + ' in ' + label(a)); break; }
        a = a.parentElement;
      }
    });
    if (sec) sec.querySelectorAll('*').forEach((e) => { const cs = getComputedStyle(e); if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) bars.push(label(e) + ' ' + e.scrollWidth + '>' + e.clientWidth); });
    // Controls that were squeezed out of shape: the round buttons of the top bar must be round, and a button never gets shorter than the height it asks for.
    const deformed = [...document.querySelectorAll('.e-icon-btn')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && Math.abs(r.width - r.height) > 0.6; }).map((e) => label(e) + ' ' + e.getBoundingClientRect().width.toFixed(1) + 'x' + e.getBoundingClientRect().height.toFixed(1));
    document.querySelectorAll('.e-header button, main section:not(.hidden) button').forEach((e) => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || e.closest('.hidden')) return;
      const m = /^([0-9.]+)px$/.exec(e.style.height || '');
      if (m && r.height < parseFloat(m[1]) - 1.5) deformed.push(label(e) + ' height ' + Math.round(r.height) + '<' + m[1]);
    });
    const header = document.querySelector('.e-header');
    const inView = (id) => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= iw && r.width > 0 && r.top >= 0; };
    const ids = { 'tab-card': ['btnStart', 'btnStop'], 'tab-hours': ['btnBoostStart', 'btnBoostStop'], 'tab-realistic': ['grStart', 'grStop'] }[sec && sec.id];
    return JSON.stringify({ cut: [...new Set(cut)].slice(0, 6), clipped: [...new Set(clipped)].slice(0, 6), bars: [...new Set(bars)].slice(0, 6), deformed: [...new Set(deformed)].slice(0, 6), headerH: header ? header.getBoundingClientRect().height : 0,
      docX: document.documentElement.scrollWidth > iw + 1, startStop: !ids || ids.every(inView) });
  })()`;

  const SIZES = [[900, 560], [1093, 614], [1280, 680], [1366, 700], [1920, 1040], [675, 420], [720, 450], [1000, 540]];
  const TABS = ['overview', 'card', 'inventory', 'hours', 'realistic', 'achievements', 'keys', 'chat', 'settings'];
  for (const [W, H] of SIZES) {
    const zoom = windowFit.fitZoom(W, H, windowFit.DESIGN.dash);
    const cssW = Math.round(W / zoom), cssH = Math.round(H / zoom);      // what the page sees
    w.setContentSize(W, H);
    w.webContents.setZoomFactor(zoom);
    for (let i = 0; i < 20 && Math.abs((await js('innerWidth')) - cssW) > 1; i++) await wait(150);
    await wait(500);
    const label = W + 'x' + H + (zoom < 1 ? ' (zoom ' + zoom + ')' : '');
    if (zoom < 1) check(label + ': the page has the whole design size', (await js('innerWidth')) >= 900 - 1 && (await js('innerHeight')) >= 560 - 1, (await js('innerWidth')) + 'x' + (await js('innerHeight')));
    const rail = await js(`document.getElementById('sideNav').getBoundingClientRect().width`);
    check(label + ': the rail is ' + (cssW < 1000 ? 'closed by itself' : 'open'), cssW < 1000 ? rail < 100 : rail > 150, 'width ' + rail);
    check(label + ': density is ' + (cssH < 720 ? 'compact' : 'comfortable') + ' on automatic', (await js(`document.body.classList.contains('e-compact')`)) === (cssH < 720));
    for (const tab of TABS) {
      if (tab === 'settings') await js("openSettingsPage('general')");
      else if (tab === 'chat') await js("document.getElementById('tbChat').click()");
      else await js("document.querySelector('.nav a[data-tab=" + tab + "]').click()");
      await wait(800);
      const m = JSON.parse(await js(MEASURE));
      const problems = [].concat(m.cut.map((x) => 'cut ' + x), m.clipped.map((x) => 'clipped ' + x), m.bars.map((x) => 'bar ' + x), m.docX ? ['page scrolls sideways'] : []);
      check(label + ' ' + tab + ': fits the window', problems.length === 0, problems.join(' | '));
      check(label + ' ' + tab + ': the top bar stays on one row', m.headerH > 0 && m.headerH <= 64, 'height ' + m.headerH);
      check(label + ' ' + tab + ': round buttons are round and no button is squeezed flat', m.deformed.length === 0, m.deformed.join(' | '));
      if (tab === 'card' || tab === 'hours' || tab === 'realistic') check(label + ' ' + tab + ': Start and Stop are in view', m.startStop === true);
      if (process.env.SHOTS) await shot('layout-' + W + 'x' + H + '-' + tab);
    }
  }

  // A tooltip next to the right edge and next to the left edge stays inside the window
  w.setContentSize(1280, 700); w.webContents.setZoomFactor(1); await wait(500);
  await js("document.querySelector('.nav a[data-tab=card]').click()"); await wait(800);
  const tip = await js(`(() => {
    const out = [];
    const host = document.createElement('span'); host.setAttribute('data-tip', 'A long explanation that needs more than one line to be written out in full, so the box is tall.'); host.textContent = '?';
    host.style.cssText = 'position:fixed;top:300px;width:14px;height:14px;z-index:5';
    document.body.appendChild(host);
    for (const x of [2, 640, 1262]) {
      host.style.left = x + 'px';
      host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      const b = document.querySelector('.e-tipbox').getBoundingClientRect();
      out.push([Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom), document.querySelector('.e-tipbox').classList.contains('on')]);
    }
    host.style.top = '4px'; host.style.left = '640px';
    host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const b2 = document.querySelector('.e-tipbox').getBoundingClientRect();
    out.push([Math.round(b2.top), Math.round(b2.bottom)]);
    host.remove();
    return JSON.stringify({ out, w: innerWidth, h: innerHeight });
  })()`);
  const tp = JSON.parse(tip);
  check('a tooltip at the left edge, the middle and the right edge stays inside the window', tp.out.slice(0, 3).every((b) => b[0] >= 0 && b[1] <= tp.w && b[4] === true), JSON.stringify(tp.out.slice(0, 3)));
  check('a tooltip above the first pixels turns below its element and stays inside', tp.out[3][0] >= 0 && tp.out[3][1] <= tp.h && tp.out[3][0] > 4, JSON.stringify(tp.out[3]));

  log('console errors', JSON.stringify(consoleErr));
  if (consoleErr.length) failures++;
  app.exit(failures ? 1 : 0);
});
