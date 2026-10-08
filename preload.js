const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// The version comes from ONE source: package.json. It used to be typed in several places by hand and one of them
// was forgotten whenever the version moved. It is read synchronously here because main.html's <script>
// blocks run right away; the badge in the top bar must show the correct value on the first paint.
let PAKET_SURUM = '';
try { PAKET_SURUM = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || ''; }
catch (_) { PAKET_SURUM = ''; }

contextBridge.exposeInMainWorld('imu', {
  surum: PAKET_SURUM,
  // Update check: only LOOKS. No download, no automatic install - the interface just links to
  // the release page. Runs once at startup and once more from the top bar button.
  guncelleme: {
    kontrol: () => ipcRenderer.invoke('guncelleme:kontrol'),
    sonDurum: () => ipcRenderer.invoke('guncelleme:sonDurum'),
    onDurum: (cb) => ipcRenderer.on('guncelleme:durum', (_e, d) => cb(d)),
  },
  appBilgi: () => ipcRenderer.invoke('app:bilgi'),
  appBellek: () => ipcRenderer.invoke('app:bellek'),
  // Clears the image and network cache. No settings or session are lost.
  appBellekTemizle: () => ipcRenderer.invoke('app:bellekTemizle'),
  pages: {
    // Reads the page HTML fragments synchronously - they must be injected into the DOM BEFORE main.html's
    // <script> tags run (those scripts bind to the matching ids immediately).
    load: (name) => {
      try { return fs.readFileSync(path.join(__dirname, 'src', 'main', 'pages', name + '.html'), 'utf8'); }
      catch (_) { return ''; }
    },
  },
  dil: {
    // Reads only the selected language's dictionary; the other five files are never opened. Synchronous like
    // the page HTML, because the translation must be ready before the first paint.
    // The file name comes from outside: only letters are accepted and the folder is fixed, otherwise
    // a code containing "../" could make this read any file on disk.
    yukle: (kod) => {
      if (!/^[a-z]{2}$/.test(String(kod || ''))) return null;
      try {
        const p = path.join(__dirname, 'src', 'main', 'js', 'lang', kod + '.json');
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (_) { return null; }
    },
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    fit: (h) => ipcRenderer.send('win:fit', h),
    setWidth: (w) => ipcRenderer.send('win:setWidth', w),
  },
  // Every method takes a slotId - each (+) box on login.html advances its own independent Steam session
  // (main.js keeps a separate SteamAuth instance per slotId).
  auth: {
    startQR: (slotId) => ipcRenderer.send('auth:startQR', { slotId }),
    startCredentials: (slotId, accountName, password) => ipcRenderer.send('auth:startCredentials', { slotId, accountName, password }),
    submitGuard: (slotId, code) => ipcRenderer.send('auth:submitGuard', { slotId, code }),
    cancel: (slotId) => ipcRenderer.send('auth:cancel', { slotId }),
    loginCookie: (slotId, o) => ipcRenderer.send('auth:loginCookie', { slotId, ...o }),
    // event: 'qr' | 'guard' | 'status' | 'authenticated' | 'error' - data.slotId tells which box it belongs to
    on: (event, cb) => ipcRenderer.on('auth:' + event, (_e, data) => cb(data)),
  },
  goDashboard: () => ipcRenderer.send('go:dashboard'),
  logout: () => ipcRenderer.send('auth:logout'),
  // Resets the session timeout counter (reports that the user interacted)
  activity: () => ipcRenderer.send('session:activity'),
  log: {
    write: (level, msg) => ipcRenderer.invoke('log:write', { level, msg }),
    open: () => ipcRenderer.invoke('log:open'),
  },
  // Desktop notification (main process - Windows toasts need an AppUserModelID)
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    switch: (steamID) => ipcRenderer.invoke('accounts:switch', steamID),
    remove: (steamID) => ipcRenderer.invoke('accounts:remove', steamID),
    startAdd: () => ipcRenderer.send('accounts:startAdd'),
    connectAll: () => ipcRenderer.invoke('accounts:connectAll'),
    disconnect: (steamID) => ipcRenderer.invoke('accounts:disconnect', steamID),
  },
  openExternal: (url) => ipcRenderer.send('open:external', url),
  onAccountActivity: (cb) => ipcRenderer.on('accounts:activity', (_e, d) => cb(d)),
  // Friend message from Steam (nobody could see it while running headless)
  onChatMessage: (cb) => ipcRenderer.on('chat:message', (_e, d) => cb(d)),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    // Save button of the Settings page: only changed keys are sent; the reply says which
    // running jobs will continue with the new settings.
    kaydet: (patch) => ipcRenderer.invoke('settings:kaydet', patch),
    // Defaults: Reset loads them into the page's draft and writes nothing.
    varsayilanlar: () => ipcRenderer.invoke('settings:varsayilanlar'),
    bilgi: () => ipcRenderer.invoke('settings:bilgi'),
    clearPriceCache: () => ipcRenderer.invoke('settings:clearPriceCache'),
    openConfigFolder: () => ipcRenderer.invoke('settings:openConfigFolder'),
    export: () => ipcRenderer.invoke('settings:export'),
    import: () => ipcRenderer.invoke('settings:import'),
    wipeAll: () => ipcRenderer.invoke('settings:wipeAll'),
  },
  // Statistics are counted in the main process, per account; the interface only reads them.
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    reset: () => ipcRenderer.invoke('stats:reset'),
    onDegisti: (cb) => ipcRenderer.on('stats:degisti', (_e, d) => cb(d)),
  },
  // Account events (card dropped, cards finished, achievement unlocked, time ran out...). Events of
  // background accounts arrive too; the notification is shown from here.
  onHesapOlayi: (cb) => ipcRenderer.on('hesap:olay', (_e, d) => cb(d)),
  // Remembered data (selected games, achievement log). Retention is set in Settings > Backup.
  state: {
    get: (key) => ipcRenderer.invoke('state:get', key),
    set: (key, value) => ipcRenderer.invoke('state:set', { key, value }),
    achLog: (entry) => ipcRenderer.invoke('state:achLog', entry),
    achLogGet: (appid) => ipcRenderer.invoke('state:achLogGet', appid),
    clear: () => ipcRenderer.invoke('state:clear'),
  },
  // G2: Realistic Mode - one game open, achievements unlocked spread from common to rare
  gercekci: {
    // G11: duration in milliseconds, options = { hedef, model, rastgeleAralik, ultraNadirAtla,
    // otoSira, saatiSurdur, gecikmisHizlandir }. oyunlar = array of appids (the queue).
    plan: (appid, sureMs, secenekler) => ipcRenderer.invoke('gercekci:plan', { appid, sureMs, secenekler }),
    start: (oyunlar, sureMs, secenekler) => ipcRenderer.invoke('gercekci:start', { oyunlar, sureMs, secenekler }),
    stop: () => ipcRenderer.send('gercekci:stop'),
    // Games found to have no achievements. Learned once, written to disk, and that game
    // never shows up in this page's list again.
    basarimsizlar: () => ipcRenderer.invoke('gercekci:basarimsizlar'),
    basarimsizTemizle: () => ipcRenderer.invoke('gercekci:basarimsizTemizle'),
    onTick: (cb) => ipcRenderer.on('gercekci:tick', (_e, d) => cb(d)),
    onAcildi: (cb) => ipcRenderer.on('gercekci:acildi', (_e, d) => cb(d)),
  },
  // Steam chat - one-to-one friend messages. Group chat is out of scope.
  sohbet: {
    friends: () => ipcRenderer.invoke('chat:friends'),
    conversations: () => ipcRenderer.invoke('chat:conversations'),
    history: (steamid, adet) => ipcRenderer.invoke('chat:history', { steamid, adet }),
    send: (steamid, metin) => ipcRenderer.invoke('chat:send', { steamid, metin }),
    read: (steamid) => ipcRenderer.invoke('chat:read', steamid),
    typing: (steamid) => ipcRenderer.send('chat:typing', steamid),
  },
  engine: {
    connect: () => ipcRenderer.invoke('engine:connect'),
    dropGames: () => ipcRenderer.invoke('engine:dropGames'),
    // Last fetched card/library lists - makes no request to Steam, reads from disk.
    sonListeler: () => ipcRenderer.invoke('engine:sonListeler'),
    inventory: () => ipcRenderer.invoke('engine:inventory'),
    pricesFor: (hashNames) => ipcRenderer.invoke('engine:pricesFor', hashNames),
    // Makes no request to Steam, only reads the cache on disk (used when the inventory opens)
    pricesForCached: (hashNames) => ipcRenderer.invoke('engine:pricesFor', { hashNames, sadeceOnbellek: true }),
    onPriceOne: (cb) => ipcRenderer.on('price:one', (_e, data) => cb(data)),
    onPriceProgress: (cb) => ipcRenderer.on('price:progress', (_e, data) => cb(data)),
    priceHistory: (hashName) => ipcRenderer.invoke('engine:priceHistory', hashName),
    // G8: fetch the sale history (average/median) in BULK. It goes through the same market gate
    // as the price queue, so it never exceeds Steam's limit. Progress arrives through history:progress.
    historyFor: (hashNames) => ipcRenderer.invoke('engine:historyFor', hashNames),
    historyForCached: (hashNames) => ipcRenderer.invoke('engine:historyFor', { hashNames, sadeceOnbellek: true }),
    historyCancel: () => ipcRenderer.send('engine:historyCancel'),
    onHistoryOne: (cb) => ipcRenderer.on('history:one', (_e, d) => cb(d)),
    onHistoryProgress: (cb) => ipcRenderer.on('history:progress', (_e, d) => cb(d)),
    itemOrders: (hashName) => ipcRenderer.invoke('engine:itemOrders', hashName),
    sellItem: (assetId, priceCents, amount) => ipcRenderer.invoke('engine:sellItem', { assetId, priceCents, amount }),
    // Steam's own fee calculation: the amounts the buyer pays (cents) -> what the seller keeps
    satisUcreti: (toplamlar) => ipcRenderer.invoke('engine:satisUcreti', toplamlar),
    ownedGames: () => ipcRenderer.invoke('engine:ownedGames'),
    profile: () => ipcRenderer.invoke('engine:profile'),
    // The custom profile address is separate: it needs a web request, so name/avatar must not wait for it.
    vanity: () => ipcRenderer.invoke('engine:vanity'),
    // With taze=true the 5 minute schema cache is skipped; used after a bulk operation
    // to verify what Steam actually saved.
    achievements: (appid, taze) => ipcRenderer.invoke('engine:achievements', { appid, taze }),
    setAchievements: (appid, changes) => ipcRenderer.invoke('engine:setAchievements', { appid, changes }),
    startFarm: (mode, games, durationMs) => ipcRenderer.send('engine:startFarm', { mode, games, durationMs }),
    stopFarm: () => ipcRenderer.send('engine:stopFarm'),
    onTick: (cb) => ipcRenderer.on('farm:tick', (_e, data) => cb(data)),
    // The main process badge watcher's current card list (for the account on screen).
    onFarmListe: (cb) => ipcRenderer.on('farm:liste', (_e, data) => cb(data)),
    // games: [{appid, playtimeMin}] - needed to build the hour sync steps.
    // tumu: every selected game; if the "at most at once" limit changes while a job runs, the list is cut from here.
    boostStart: (appids, durationMs, games, tumu) => ipcRenderer.send('engine:boostStart', { appids, durationMs, games, tumu }),
    boostSyncPlan: (games, mode, targetHours) => ipcRenderer.invoke('engine:boostSyncPlan', { games, mode, targetHours }),
    onBoostSync: (cb) => ipcRenderer.on('boost:sync', (_e, d) => cb(d)),
    // G3: Steam connection state (bagli | koptu | baglaniyor | vazgecildi)
    onDurum: (cb) => ipcRenderer.on('engine:durum', (_e, d) => cb(d)),
    baglantiDurumu: () => ipcRenderer.invoke('engine:baglantiDurumu'),
    // Retries a connection that has run out of attempts or was permanently dropped.
    yenidenBaglan: () => ipcRenderer.invoke('engine:yenidenBaglan'),
    boostStop: () => ipcRenderer.send('engine:boostStop'),
    onBoostTick: (cb) => ipcRenderer.on('boost:tick', (_e, data) => cb(data)),
    boostStartSeq: (games, durationMs, loop) => ipcRenderer.send('engine:boostStartSeq', { games, durationMs, loop }),
    boostStopSeq: () => ipcRenderer.send('engine:boostStopSeq'),
    onSaatFarmTick: (cb) => ipcRenderer.on('saatFarm:tick', (_e, data) => cb(data)),
  },
});
