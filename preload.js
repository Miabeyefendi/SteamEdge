const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// The version comes from ONE source: package.json. It used to be typed in several places by hand and one of them
// was forgotten whenever the version moved. It is read synchronously here because main.html's <script>
// blocks run right away; the badge in the top bar must show the correct value on the first paint.
let PACKAGE_VERSION = '';
try { PACKAGE_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version || ''; }
catch (_) { PACKAGE_VERSION = ''; }

// The account the settings on the page belong to (settings.forAccount)
let settingsAccount = null;
contextBridge.exposeInMainWorld('imu', {
  versionStr: PACKAGE_VERSION,
  // Update check: only LOOKS. No download, no automatic install - the interface just links to
  // the release page. Runs once at startup and once more from the top bar button.
  updateInfo: {
    checkIt: () => ipcRenderer.invoke('update:check'),
    lastStatus: () => ipcRenderer.invoke('update:lastStatus'),
    onStatus: (cb) => ipcRenderer.on('update:status', (_e, d) => cb(d)),
  },
  appInfo: () => ipcRenderer.invoke('app:info'),
  hardware: () => ipcRenderer.invoke('app:hardware'),
  appMemory: () => ipcRenderer.invoke('app:memory'),
  // Clears the image and network cache. No settings or session are lost.
  appMemoryClear: () => ipcRenderer.invoke('app:memoryClear'),
  pages: {
    // Reads the page HTML fragments synchronously - they must be injected into the DOM BEFORE main.html's
    // <script> tags run (those scripts bind to the matching ids immediately).
    load: (name) => {
      try { return fs.readFileSync(path.join(__dirname, 'src', 'main', 'pages', name + '.html'), 'utf8'); }
      catch (_) { return ''; }
    },
  },
  lang: {
    // Reads only the selected language's dictionary; the other five files are never opened. Synchronous like
    // the page HTML, because the translation must be ready before the first paint.
    // The file name comes from outside: only letters are accepted and the folder is fixed, otherwise
    // a code containing "../" could make this read any file on disk.
    loadIt: (codeStr) => {
      if (!/^[a-z]{2}$/.test(String(codeStr || ''))) return null;
      try {
        const p = path.join(__dirname, 'src', 'main', 'js', 'lang', codeStr + '.json');
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
    // the logs folder (src/core/logger.js), connection.log on its own, and the last 24 hours of the account on screen from it
    open: () => ipcRenderer.invoke('log:open'),
    openConnection: () => ipcRenderer.invoke('log:openConnection'),
    connectionSummary: () => ipcRenderer.invoke('log:connectionSummary'),
  },
  // Desktop notification (main process - Windows toasts need an AppUserModelID)
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  // the live state of the jobs of the account on screen, sent on the usual job channels (main.js sendJobStatus)
  jobs: { status: () => ipcRenderer.invoke('jobs:status') },
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
    // Every write says which account the page's values belong to (see main.js applySettingPatch): the page tells it after every read with forAccount()
    set: (patch) => ipcRenderer.invoke('settings:set', patch, settingsAccount),
    forAccount: (steamID) => { settingsAccount = steamID == null ? null : String(steamID); },
    // Save button of the Settings page: only changed keys are sent; the reply says which
    // running jobs will continue with the new settings.
    saveIt: (patch) => ipcRenderer.invoke('settings:save', patch, settingsAccount),
    // Defaults: Reset loads them into the page's draft and writes nothing.
    defaultsMap: () => ipcRenderer.invoke('settings:defaults'),
    details: () => ipcRenderer.invoke('settings:info'),
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
    onChanged: (cb) => ipcRenderer.on('stats:changed', (_e, d) => cb(d)),
  },
  // Account events (card dropped, cards finished, achievement unlocked, time ran out...). Events of
  // background accounts arrive too; the notification is shown from here.
  onAccountEvent: (cb) => ipcRenderer.on('account:event', (_e, d) => cb(d)),
  // Remembered data (selected games, achievement log). Retention is set in Settings > Backup.
  state: {
    get: (key) => ipcRenderer.invoke('state:get', key),
    set: (key, value) => ipcRenderer.invoke('state:set', { key, value }),
    achLog: (entry) => ipcRenderer.invoke('state:achLog', entry),
    achLogGet: (appid) => ipcRenderer.invoke('state:achLogGet', appid),
    clear: () => ipcRenderer.invoke('state:clear'),
  },
  // G2: Realistic Mode - one game open, achievements unlocked spread from common to rare
  realistic: {
    // G11: duration in milliseconds, options = { goalValue, goalAuto, autoSpan, model, randomInterval, ultraRareSkip,
    // autoOrder, ... } (main.js realisticOptions). gameList = array of appids (the queue).
    plan: (appid, durationMs, options, queueIds) => ipcRenderer.invoke('realistic:plan', { appid, spanMs: durationMs, optionList: options, queueIds }),
    start: (gameList, durationMs, options) => ipcRenderer.invoke('realistic:start', { gameEntries: gameList, spanMs: durationMs, optionList: options }),
    stop: () => ipcRenderer.send('realistic:stop'),
    // Games found to have no achievements. Learned once, written to disk, and that game
    // never shows up in this page's list again.
    noAchievementsList: () => ipcRenderer.invoke('realistic:noAchievementsList'),
    // games with nothing left to unlock (this account), and a check of the ones the search shows
    completedList: () => ipcRenderer.invoke('realistic:completedList'),
    checkCompleted: (appids) => ipcRenderer.invoke('realistic:checkCompleted', appids),
    noAchievementsClear: () => ipcRenderer.invoke('realistic:noAchievementsClear'),
    onTick: (cb) => ipcRenderer.on('realistic:tick', (_e, d) => cb(d)),
    onOpened: (cb) => ipcRenderer.on('realistic:opened', (_e, d) => cb(d)),
    // the saved queue lost a game with nothing left to unlock: { steamID, grQueue }
    onQueue: (cb) => ipcRenderer.on('realistic:queue', (_e, d) => cb(d)),
  },
  // Own active market listings (list and take back)
  market: {
    myListings: () => ipcRenderer.invoke('market:myListings'),
    removeListing: (listingId, steamID) => ipcRenderer.invoke('market:removeListing', steamID ? { listingId, steamID } : listingId),
  },
  // Writes the inventory rows the page built into a CSV file the user picks
  inventory: {
    exportCsv: (rows) => ipcRenderer.invoke('inventory:exportCsv', rows),
  },
  // Product key queue of the account on screen, worked off in the main process
  keys: {
    state: () => ipcRenderer.invoke('keys:state'),
    add: (text) => ipcRenderer.invoke('keys:add', text),
    start: (skipWait) => ipcRenderer.invoke('keys:start', !!skipWait),
    stop: () => ipcRenderer.invoke('keys:stop'),
    clear: (what) => ipcRenderer.invoke('keys:clear', what),
    onChanged: (cb) => ipcRenderer.on('keys:changed', (_e, d) => cb(d)),
  },
  // Steam chat - one-to-one friend messages. Group chat is out of scope.
  chat: {
    friends: () => ipcRenderer.invoke('chat:friends'),
    conversations: () => ipcRenderer.invoke('chat:conversations'),
    history: (steamid, count) => ipcRenderer.invoke('chat:history', { steamid, itemCount: count }),
    send: (steamid, text) => ipcRenderer.invoke('chat:send', { steamid, textValue: text }),
    read: (steamid) => ipcRenderer.invoke('chat:read', steamid),
    typing: (steamid) => ipcRenderer.send('chat:typing', steamid),
  },
  engine: {
    connect: () => ipcRenderer.invoke('engine:connect'),
    dropGames: () => ipcRenderer.invoke('engine:dropGames'),
    // Last fetched card/library lists - makes no request to Steam, reads from disk.
    lastLists: () => ipcRenderer.invoke('engine:lastLists'),
    // source (optional): { appid, contextId, appName } - a game's backpack instead of the Steam community inventory
    inventory: (source) => ipcRenderer.invoke('engine:inventory', source),
    // The games the account has items in
    inventorySources: () => ipcRenderer.invoke('engine:inventorySources'),
    pricesFor: (hashNames) => ipcRenderer.invoke('engine:pricesFor', hashNames),
    // Makes no request to Steam, only reads the cache on disk (used when the inventory opens)
    pricesForCached: (hashNames) => ipcRenderer.invoke('engine:pricesFor', { hashNames, cacheOnly: true }),
    onPriceOne: (cb) => ipcRenderer.on('price:one', (_e, data) => cb(data)),
    onPriceProgress: (cb) => ipcRenderer.on('price:progress', (_e, data) => cb(data)),
    priceHistory: (hashName) => ipcRenderer.invoke('engine:priceHistory', hashName),
    // G8: fetch the sale history (average/median) in BULK. It goes through the same market gate
    // as the price queue, so it never exceeds Steam's limit. Progress arrives through history:progress.
    historyFor: (hashNames) => ipcRenderer.invoke('engine:historyFor', hashNames),
    historyForCached: (hashNames) => ipcRenderer.invoke('engine:historyFor', { hashNames, cacheOnly: true }),
    historyCancel: () => ipcRenderer.send('engine:historyCancel'),
    onHistoryOne: (cb) => ipcRenderer.on('history:one', (_e, d) => cb(d)),
    onHistoryProgress: (cb) => ipcRenderer.on('history:progress', (_e, d) => cb(d)),
    itemOrders: (hashName) => ipcRenderer.invoke('engine:itemOrders', hashName),
    // steamID: the account the sale started on (its batches can wait minutes; the account on screen may have changed by then)
    sellItem: (assetId, priceCents, amount, appid, contextId, steamID) => ipcRenderer.invoke('engine:sellItem', { assetId, priceCents, amount, appid, contextId, steamID }),
    unpackBooster: (assetId, appid) => ipcRenderer.invoke('engine:unpackBooster', { assetId, appid }),
    // Steam's own fee calculation: the amounts the buyer pays (cents) -> what the seller keeps
    saleFee: (totals) => ipcRenderer.invoke('engine:saleFee', totals),
    ownedGames: () => ipcRenderer.invoke('engine:ownedGames'),
    profile: () => ipcRenderer.invoke('engine:profile'),
    // The custom profile address is separate: it needs a web request, so name/avatar must not wait for it.
    vanity: () => ipcRenderer.invoke('engine:vanity'),
    // With isFresh=true the 5 minute schema cache is skipped; used after a bulk operation
    // to verify what Steam actually saved.
    // steamID (optional): the account a running bulk operation belongs to, so a switch to another account in the middle does not send the rest there
    achievements: (appid, isFresh, steamID) => ipcRenderer.invoke('engine:achievements', { appid, freshFlag: isFresh, steamID }),
    setAchievements: (appid, changes, steamID) => ipcRenderer.invoke('engine:setAchievements', { appid, changes, steamID }),
    startFarm: (mode, games, durationMs) => ipcRenderer.send('engine:startFarm', { mode, games, durationMs }),
    stopFarm: () => ipcRenderer.send('engine:stopFarm'),
    onTick: (cb) => ipcRenderer.on('farm:tick', (_e, data) => cb(data)),
    // The main process badge watcher's current card list (for the account on screen).
    onFarmList: (cb) => ipcRenderer.on('farm:list', (_e, data) => cb(data)),
    // games: [{appid, playtimeMin}] - needed to build the hour sync steps.
    // allItems: every selected game; if the "at most at once" limit changes while a job runs, the list is cut from here.
    boostStart: (appids, durationMs, games, allOfIt) => ipcRenderer.send('engine:boostStart', { appids, durationMs, games, allItems: allOfIt }),
    boostSyncPlan: (games, mode, targetHours) => ipcRenderer.invoke('engine:boostSyncPlan', { games, mode, targetHours }),
    onBoostSync: (cb) => ipcRenderer.on('boost:sync', (_e, d) => cb(d)),
    // G3: Steam connection state (connected | dropped | connecting | abandoned)
    onStatus: (cb) => ipcRenderer.on('engine:status', (_e, d) => cb(d)),
    connectionStatus: () => ipcRenderer.invoke('engine:connectionStatus'),
    // a game of the account is open on another device: { steamID, blocked, appid, activeIds }
    onPlaying: (cb) => ipcRenderer.on('engine:playing', (_e, d) => cb(d)),
    // Retries a connection that has run out of attempts or was permanently dropped.
    reconnect: () => ipcRenderer.invoke('engine:reconnect'),
    boostStop: () => ipcRenderer.send('engine:boostStop'),
    onBoostTick: (cb) => ipcRenderer.on('boost:tick', (_e, data) => cb(data)),
    boostStartSeq: (games, durationMs, loop) => ipcRenderer.send('engine:boostStartSeq', { games, durationMs, loop }),
    boostStopSeq: () => ipcRenderer.send('engine:boostStopSeq'),
    onHourFarmTick: (cb) => ipcRenderer.on('hoursFarm:tick', (_e, data) => cb(data)),
  },
});
