// The settings every account starts from (the keys, the defaults, what each one means). Plain data, no code: main.js reads it
// at the top and the settings module builds its migrations on it. Tests read this file as part of the main process text (tests/main-source.js).
const DEFAULT_SETTINGS = {
  // General
  autoLaunch: false,        // start with Windows
  startInTray: true,        // started by Windows: the window stays closed, the app runs in the tray (only with autoLaunch)
  closeToTray: false,       // minimise to the system tray on close
  preventSleep: false,      // prevent sleep while the app is open
  resumeJobs: true,         // a job that was running when the app ended starts again where it left off (src/core/resumeJobs.js)
  language: 'en',
  // Card farming
  grScheduleEnabled: false,   // Realistic Mode runs the last setup by itself inside the time range below
  grScheduleFrom: '22:00',
  grScheduleTo: '07:00',
  farmScheduleEnabled: false, // card farming runs by itself inside the time window below
  farmScheduleFrom: '22:00',
  farmScheduleTo: '07:00',
  keyForwardOwned: false,     // a key the account already owns is tried on the next connected account
  loginProxyUrl: '',          // proxy the sign-in goes through (an account's own proxy is only known after it is signed in)
  protectTokens: false,       // seal the saved login tokens with Windows DPAPI (safeStorage)
  cardPriorityMode: 'sequential',
  farmSkipUnplayed: false,    // leave games with no recorded playtime out of the queue
  farmSkipRecent: false,      // leave games out that can still be refunded (bought in the last 14 days, under 2 hours played)
  farmFinishedAction: 'none', // none | exit | boost: what to do when every card has been collected
  cardMaxGames: 32,         // games open at once in fast mode (Steam's known upper limit is 32)
  notifyCardDrop: false,    // desktop notification as cards drop (Card Farming > Automation)
  // Card Farming > Automation. All three really work; two affect the account permanently so
  // the default is OFF and the sale flow follows the "Ask for confirmation before selling" setting.
  farmAutoSell: false,      // puts the dropped card on sale at the median price
  farmAchUnlock: false,     // unlocks locked achievements at intervals during farming
  // Sale (inside Inventory - the separate Market tab was removed)
  saleMode: 'median',       // median | lowest
  confirmBeforeSell: true,  // ask for confirmation before selling
  // Sale batches. Steam limits listing by the age and trustworthiness of the account:
  // a new account can be stopped after 10-15 listings, an old account can list 80+ at once.
  bulkSellLimit: 50,        // batch size (0 = do not split, list until Steam stops it)
  sellBatchWaitMin: 5,      // wait between batches (min); the next batch always starts by itself
  priceDropThreshold: 10,   // warn if the lowest listing is this percent below the 24 hour average
  priceRefreshHours: 24,    // how many hours until the price cache goes stale
  historyRefreshHours: 72,  // how many hours until the sale history (average) cache goes stale
  // Should the average be fetched in the same round while an item's lowest price is fetched.
  // On: two requests per item, but no second round is waited for the average.
  fetchAvgWithPrice: true,
  // Hour Booster
  boostMaxGames: 32,
  rememberBoostList: true,
  pauseFarmOnBoost: false,  // automatically stop Card Farming when boosting starts
  // Achievements
  achConfirmSingle: true,   // ask for confirmation on a single unlock/lock (confirmation is ALWAYS asked for bulk operations)
  // Notifications
  notifications: true,      // master (the renderer reads it)
  notifyFarm: true,
  notifyBoost: true,
  notifyError: true,
  notifyAch: true,
  quietHoursEnabled: false, // show no notification at all in this range
  quietFrom: '23:00',
  quietTo: '08:00',
  // Privacy & Security (the visibility on Steam is chosen per account in the top bar: account data personaState)
  // Advanced & Data
  apiRequestDelayMs: 350,   // wait per price request (Steam's limit - lowering it raises the 429 risk)
  hwAccel: false,           // GPU hardware acceleration: off, SteamEdge does not touch the graphics card at all (turning it on asks for a restart)
  lightMode: true,           // stop drawing and animations when the window is not focused
  gpuBackend: 'auto',        // ANGLE backend: auto | d3d11 | d3d9 | gl (asks for a restart)
  lowMemory: true,          // the graphics and network code run inside the main process: two processes fewer, about 100 MB less (asks for a restart)
  gpuComposition: false,    // false = the processor composites the window: 9 MB of video memory instead of 67 and no clash with a game (asks for a restart)

  // ---- The rest of the fields on the Settings screen ----
  // All are written/read persistently. Those marked (*) are NOT tied to a behaviour YET -
  // either there is no real infrastructure (telemetry server, updater, logger) or Steam does not
  // provide the data (order book). Marked so we do not present anything made up as if it worked.
  // The currency key was REMOVED. There is no currency choice: amounts are fetched in the account's Steam MARKET currency
  // and shown exactly in that currency (steamEngine.detectMarketCurrency).
  dataRetentionDays: 90,    // how many days the remembered data (selected games, achievement log) is kept (0 = forever)
  // Steam chat - to be able to see/reply to messages that arrive while running headless
  notifyChat: true,         // desktop notification when a message arrives
  chatAutoReply: false,     // send an automatic reply
  chatReplyText: 'Şu an bilgisayarımın başında değilim, en kısa sürede döneceğim.',
  chatReplyCooldown: 60,    // an automatic reply to the same person at most once in this many minutes
  startPage: 'overview',
  // Modules: a page that is switched off leaves the side menu and the overview and makes no Steam request of its own.
  // Settings and the overview are always there. navOrder is the order of the side menu.
  moduleCard: true, moduleInventory: true, moduleHours: true, moduleRealistic: true, moduleAchievements: true, moduleKeys: true, moduleChat: true,
  navOrder: 'overview,card,inventory,hours,realistic,achievements,keys',
  perfMode: 'auto',         // auto | full | light: light turns off animations, transitions, blur and shadows (see edge.css .e-light)
  setupDone: true,          // false only on a first start: the welcome window asks which pages to use (see common.js showSetup)
  // Small features and top bar items that can be switched off (Settings > Modules, common.js FEATURES); everything is on until the setting says false
  featFeed: true, featFavorites: true, featListings: true, featCsv: true, featOtherGames: true,
  topSearch: true, topNotif: true, topUpdate: true,
  theme: 'auto',            // auto | dark | white | r34 | crimson | olive | indigo (see src/main/js/theme.js); auto = dark
  density: 'auto',          // auto | comfortable | compact (*)
  uiScale: 100,             // percent, one of windowFit.SCALES; the window zooms the page to this while the layout still fits (applyFitZoom)
  timeFormat: '24',
  sidebarCollapsed: false,
  queueSort: 'default',
  // minRemainCards was REMOVED - there is no card threshold any more, every game with cards left joins the queue
  farmMaxMinutes: 5,     // upper time per game (min) - fast mode overrides this with its own rhythm
  // Fast mode: Steam starts dropping cards once a game passes 2 hours. Those below are first
  // run in parallel and pulled to the threshold, then the featured game changes at this interval.
  fastMinPlaytimeMin: 120,
  fastRotateMinSec: 10,
  fastRotateMaxSec: 15,
  autoNextGame: true,
  // If the connection drops: 'unlimited' | '10' | '3' | 'off'. "Automatic reconnect"
  // and "retry" used to be two separate settings and both only affected the first logon.
  reconnectPolicy: 'unlimited',
  // feeMode was REMOVED: list prices are always the amount on the Steam market.
  // The amount you will get after commission is shown as a separate line in the sale flow.
  bookDepth: 5,             // how many levels in the order book in the detail panel
  undercutCents: 1,
  hideAfterSell: true,
  invDefaultSort: 'value',
  dblAction: 'steam',       // double click behaviour in the inventory (inventory.js reads it)
  invLowValue: 1,
  hideUnsellable: false,
  groupByGame: false,       // the inventory "Grupla" button opens pressed
  boostTarget: '2',
  boostStagger: 5,          // in simultaneous boosting the games are opened one after another at this interval (s)
  shuffleBoost: false,      // only in sequential idling: the game order is shuffled every round
  // The Behaviour/Privacy switches on the Hour Booster page and the preset
  // Hour sync - brings the total times of the selected games to the same point (default OFF)
  boostSync: true,              // equalise the selected games; only applies when two or more are selected
  boostSyncMode: 'highest',     // highest | manual | library
  boostSyncTargetHours: 100,    // target hours when 'manual' is selected
  boostSyncLibraryMaxMin: 0,    // the library's highest time last computed for 'library' (min)
  // parallel = all together, the one that reaches the target drops off the list (fast, default)
  // staged   = step by step, keeps the games level along the way (slow)
  boostSyncStrategy: 'parallel',
  boostAutoRestart: false,  // restart the session on its own when the time is up
  seqIdle: false,           // sequential idling (off = all simultaneous)
  loopQueue: true,          // in sequential mode start over when the queue ends
  boostDurationSec: 3600,
  boostGameIds: [],         // the selected games when "Remember the game list" is on
  // Achievement unlock interval (SECONDS). 1 = fastest; the real wait is computed with a random
  // deviation on every unlock, so no fixed rhythm forms (achievements.js > acNextDelayMs).
  // Realistic Mode (G11: the page was renewed according to the template)
  grDurationSec: 7200,      // session duration (2 hours)
  grTargetAuto: true,       // let the app pick the target achievement count
  grTarget: 0,              // manual target (0 = all)
  grCR: '2.0',              // game length multiplier ('auto' = manual Tc)
  grDiff: '1.2',            // multiplier for the difficulty of the achievements left
  grTc: '',                 // 100% time (hours) - the old single-field value, for backwards
  grTcGame: {},             // appid -> 100% completion time (hours). Per game, entered by hand
  grModel: 'linear',        // distribution model: linear | exp | pareto
  grAuto: true,             // start the queue automatically (move on to the next game in the queue)
  grRandomGap: true,        // random deviation in unlock intervals
  grSkipUltraRare: false,   // skip achievements under 5%
  grKeepHours: true,        // when the achievements are done collect hours until the end of the time
  grCatchUp: true,          // squeeze the overdue achievement backlog into the start of the session
  grAutoDuration: true,          // assign the duration on its own according to the settings (left alone if typed by hand)
  grParallel: true,              // Realistic Mode plays the games of the queue at the same time (off: one after the other)
  grSpeed: 1,                 // speed multiplier: compresses/stretches the whole schedule
  grUltraMultiplier: 3,         // achievements under 5% wait this many times longer
  grCatchUpShare: 20,          // in what first percent of the time the ones left behind are unlocked
  grFinishedRatio: 50,          // if the game is finished the schedule drops to this ratio (percent)
  grLevel: 'simple',        // right panel: simple | advanced
  achDelay: '15',               // seconds between two unlocks: 15, 30, 45, 60, 120, 300, 600, 1800 or 3600
  achOrder: 'default',
  achSafeMode: true,
  achSpread: false,
  notifyPriceDrop: false,   // when an item in the inventory drops below the 24 hour average by the threshold
  notifSound: 'knock',      // five plain tones, produced with Web Audio (common.js > NOTIF_SOUNDS)
  sessionTimeout: 'never',  // idle time (min), does not apply while a job runs - 'never' = off
  hideGameName: false,      // become invisible while playing (so the game name does not show on the profile). Chosen per account now; this is only what an account without a choice starts from
  logLevel: 'error',        // log file: off | error | warn | info | debug
  settingsVersion: 6,            // format of the settings file; migrations are in migrateSettings
};

module.exports = DEFAULT_SETTINGS;
