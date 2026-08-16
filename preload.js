const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('imu', {
  pages: {
    // Sayfa HTML parçalarını senkron okur - main.html'in <script> etiketleri çalışmadan ÖNCE
    // DOM'a enjekte edilmesi gerekir (o script'ler ilgili id'lere anında bağlanıyor).
    load: (name) => {
      try { return fs.readFileSync(path.join(__dirname, 'src', 'main', 'pages', name + '.html'), 'utf8'); }
      catch (_) { return ''; }
    },
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    fit: (h) => ipcRenderer.send('win:fit', h),
    setWidth: (w) => ipcRenderer.send('win:setWidth', w),
  },
  // Her metod slotId alır - login.html'deki her (+) kutusu kendi bağımsız Steam oturumunu
  // ilerletir (main.js'te slotId'ye göre ayrı bir SteamAuth örneği tutulur).
  auth: {
    startQR: (slotId) => ipcRenderer.send('auth:startQR', { slotId }),
    startCredentials: (slotId, accountName, password) => ipcRenderer.send('auth:startCredentials', { slotId, accountName, password }),
    submitGuard: (slotId, code) => ipcRenderer.send('auth:submitGuard', { slotId, code }),
    cancel: (slotId) => ipcRenderer.send('auth:cancel', { slotId }),
    loginCookie: (slotId, o) => ipcRenderer.send('auth:loginCookie', { slotId, ...o }),
    generateMaFile: (slotId) => ipcRenderer.send('auth:generateMaFile', { slotId }),
    finalizeMaFile: (slotId, code) => ipcRenderer.send('auth:finalizeMaFile', { slotId, code }),
    importMaFile: (slotId, json) => ipcRenderer.send('auth:importMaFile', { slotId, json }),
    // event: 'qr' | 'guard' | 'status' | 'authenticated' | 'error' | 'mafile' | 'mafileGuard' - data.slotId ile hangi kutuya ait olduğu ayırt edilir
    on: (event, cb) => ipcRenderer.on('auth:' + event, (_e, data) => cb(data)),
  },
  goDashboard: () => ipcRenderer.send('go:dashboard'),
  logout: () => ipcRenderer.send('auth:logout'),
  // Oturum zaman aşımı sayacını sıfırlar (kullanıcı etkileşimi olduğunu bildirir)
  activity: () => ipcRenderer.send('session:activity'),
  log: {
    write: (level, msg) => ipcRenderer.invoke('log:write', { level, msg }),
    open: () => ipcRenderer.invoke('log:open'),
  },
  // Masaüstü bildirimi (ana süreç - Windows toast'ları için AppUserModelID gerekir)
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
  // Steam'den gelen arkadaş mesajı (headless çalışırken kimse göremiyordu)
  onChatMessage: (cb) => ipcRenderer.on('chat:message', (_e, d) => cb(d)),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    clearPriceCache: () => ipcRenderer.invoke('settings:clearPriceCache'),
    openConfigFolder: () => ipcRenderer.invoke('settings:openConfigFolder'),
    export: () => ipcRenderer.invoke('settings:export'),
    import: () => ipcRenderer.invoke('settings:import'),
    wipeAll: () => ipcRenderer.invoke('settings:wipeAll'),
  },
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    add: (patch) => ipcRenderer.invoke('stats:add', patch),
    reset: () => ipcRenderer.invoke('stats:reset'),
  },
  // Hatırlanan veri (seçili oyunlar, başarım günlüğü). Saklama süresi Ayarlar > Yedekleme.
  state: {
    get: (key) => ipcRenderer.invoke('state:get', key),
    set: (key, value) => ipcRenderer.invoke('state:set', { key, value }),
    achLog: (entry) => ipcRenderer.invoke('state:achLog', entry),
    achLogGet: (appid) => ipcRenderer.invoke('state:achLogGet', appid),
    clear: () => ipcRenderer.invoke('state:clear'),
  },
  // G2: Gercekci Mod - tek oyun acik, basarimlar genelden nadire yayilarak acilir
  gercekci: {
    plan: (appid, saat) => ipcRenderer.invoke('gercekci:plan', { appid, saat }),
    start: (appid, saat) => ipcRenderer.invoke('gercekci:start', { appid, saat }),
    stop: () => ipcRenderer.send('gercekci:stop'),
    onTick: (cb) => ipcRenderer.on('gercekci:tick', (_e, d) => cb(d)),
    onAcildi: (cb) => ipcRenderer.on('gercekci:acildi', (_e, d) => cb(d)),
  },
  engine: {
    connect: () => ipcRenderer.invoke('engine:connect'),
    dropGames: () => ipcRenderer.invoke('engine:dropGames'),
    inventory: () => ipcRenderer.invoke('engine:inventory'),
    pricesFor: (hashNames) => ipcRenderer.invoke('engine:pricesFor', hashNames),
    // Steam'e istek atmaz, sadece diskteki onbellegi okur (envanter acilisinda kullanilir)
    pricesForCached: (hashNames) => ipcRenderer.invoke('engine:pricesFor', { hashNames, sadeceOnbellek: true }),
    onPriceOne: (cb) => ipcRenderer.on('price:one', (_e, data) => cb(data)),
    onPriceProgress: (cb) => ipcRenderer.on('price:progress', (_e, data) => cb(data)),
    priceHistory: (hashName) => ipcRenderer.invoke('engine:priceHistory', hashName),
    // G8: satis gecmisini (ortalama/medyan) TOPLU cek. Fiyat kuyruguyla ayni pazar
    // kapisindan gecer, Steam limitini asmaz. Ilerleme history:progress ile gelir.
    historyFor: (hashNames) => ipcRenderer.invoke('engine:historyFor', hashNames),
    historyForCached: (hashNames) => ipcRenderer.invoke('engine:historyFor', { hashNames, sadeceOnbellek: true }),
    historyCancel: () => ipcRenderer.send('engine:historyCancel'),
    onHistoryOne: (cb) => ipcRenderer.on('history:one', (_e, d) => cb(d)),
    onHistoryProgress: (cb) => ipcRenderer.on('history:progress', (_e, d) => cb(d)),
    itemOrders: (hashName) => ipcRenderer.invoke('engine:itemOrders', hashName),
    sellItem: (assetId, priceCents, amount) => ipcRenderer.invoke('engine:sellItem', { assetId, priceCents, amount }),
    ownedGames: () => ipcRenderer.invoke('engine:ownedGames'),
    profile: () => ipcRenderer.invoke('engine:profile'),
    // taze=true iken 5 dakikalik sema onbellegi atlanir; toplu islem sonrasi
    // Steam'in gercekten ne kaydettigini dogrulamak icin kullanilir.
    achievements: (appid, taze) => ipcRenderer.invoke('engine:achievements', { appid, taze }),
    setAchievements: (appid, changes) => ipcRenderer.invoke('engine:setAchievements', { appid, changes }),
    startFarm: (mode, games, durationMs) => ipcRenderer.send('engine:startFarm', { mode, games, durationMs }),
    stopFarm: () => ipcRenderer.send('engine:stopFarm'),
    onTick: (cb) => ipcRenderer.on('farm:tick', (_e, data) => cb(data)),
    // games: [{appid, playtimeMin}] - saat eşitleme kademelerini kurmak için gerekli
    boostStart: (appids, durationMs, games) => ipcRenderer.send('engine:boostStart', { appids, durationMs, games }),
    boostSyncPlan: (games, mode, targetHours) => ipcRenderer.invoke('engine:boostSyncPlan', { games, mode, targetHours }),
    onBoostSync: (cb) => ipcRenderer.on('boost:sync', (_e, d) => cb(d)),
    // G3: Steam baglanti durumu (bagli | koptu | baglaniyor)
    onDurum: (cb) => ipcRenderer.on('engine:durum', (_e, d) => cb(d)),
    boostStop: () => ipcRenderer.send('engine:boostStop'),
    onBoostTick: (cb) => ipcRenderer.on('boost:tick', (_e, data) => cb(data)),
    boostStartSeq: (games, durationMs, loop) => ipcRenderer.send('engine:boostStartSeq', { games, durationMs, loop }),
    boostStopSeq: () => ipcRenderer.send('engine:boostStopSeq'),
    onSaatFarmTick: (cb) => ipcRenderer.on('saatFarm:tick', (_e, data) => cb(data)),
  },
});
