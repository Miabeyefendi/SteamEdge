const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, powerSaveBlocker, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const SteamAuth = require('./src/auth/steamAuth');
const SteamEngine = require('./src/engine/steamEngine');
const FarmController = require('./src/engine/farmController');
const guncelleme = require('./src/update/guncelleme');

// hwAccel ayarı 'gpu hızlandırmayı kapat' derse app.whenReady()'den ÖNCE etki etmesi gerekir -
// normal settings.json yüklemesi (loadSettings) whenReady içinde olduğu için burada senkron,
// erken bir okuma yapıyoruz (sadece bu tek bayrak için).
try {
  // Paketlenmis surumde ayarlar exe'nin yanindaki settings/ klasorunde; gelistirmede AppData'da.
  // (Ayni yol asagida DATA_ROOT olarak yeniden kuruluyor; burada app hazir olmadan gerekiyor.)
  const erkenKok = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getPath('userData');
  const erkenYol = app.isPackaged
    ? path.join(erkenKok, 'settings', 'settings.json')
    : path.join(erkenKok, 'config', 'settings.json');
  const early = JSON.parse(fs.readFileSync(erkenYol, 'utf8'));
  if (early && early.hwAccel === false) app.disableHardwareAcceleration();
} catch (_) {}

// Windows'ta toast bildirimleri AppUserModelID olmadan sessizce düşürülür - HTML5
// `new Notification(...)` hiçbir hata vermeden hiçbir şey göstermiyordu. Bu yüzden kimlik
// burada set ediliyor ve bildirimler ana süreçteki Electron Notification'a taşındı.
const APP_ID = 'com.miabeyefendi.steamedge';
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// TEK ÖRNEK KİLİDİ. İkinci bir SteamEdge açıldığında Steam, aynı hesabın ilk oturumunu
// düşürüyordu (LogonSessionReplaced) - motor bağlantısız kalıyor, Başarımlar/Envanter gibi
// sayfalar "Bağlı değil." ile boş açılıyordu. Artık ikinci örnek hemen kapanır ve
// var olan pencere öne getirilir.
if (!app.requestSingleInstanceLock()) {
  // SESSİZCE ÇIKMA. Önceki sürüm burada hiçbir şey yazmadan kapanıyordu: kullanıcı `npm start`
  // yazıyor, konsolda yalnızca Chromium'un önbellek uyarıları görünüyor ve uygulama hemen
  // sonlanıyordu. Açık olan ESKİ pencere ekranda durduğu için yeni kodun hiç çalışmadığı
  // anlaşılmıyordu. Artık sebep açıkça yazılıyor.
  console.log('\n============================================================');
  console.log(' SteamEdge ZATEN AÇIK - bu ikinci kopya kapatıldı.');
  console.log(' Açık olan pencere öne getirildi; o pencere ESKİ koddur.');
  console.log(' Yaptığın değişiklikleri görmek için o pencereyi KAPAT,');
  console.log(' sonra "npm start" komutunu tekrar çalıştır.');
  console.log('============================================================\n');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

// Chromium'un GPU/gölgelendirici disk önbelleği, aynı userData klasörünü kullanan başka bir
// kopya varken kilitli kalıyor ve konsolu "Unable to move the cache: Access is denied"
// satırlarıyla dolduruyordu. Bu önbellek yalnızca bir başlatma hızlandırmasıdır; kapatmak
// uygulamanın çalışmasını etkilemez, karşılığında konsol temiz kalır.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

let win = null;
// Çoklu-hesap paralel giriş: login ekranındaki her (+) kutusu kendi bağımsız SteamAuth
// oturumunu alır (slotId -> instance). Slot "0" her zaman ana kutu; "Panele Geç" navigasyonu
// SADECE slot 0 başarıyla bitince tetiklenir, diğer kutular arka planda çalışmaya devam edebilir.
const authSlots = new Map();
// "Add Account" akışıyla login.html'e dönüldüğünde true olur - o oturumdaki HİÇBİR slot
// (slot 0 dahil) mevcut aktif session.json'ın üzerine yazmaz.
let addingAccountMode = false;
function getAuthSlot(slotId) {
  const id = String(slotId == null ? '0' : slotId);
  if (!authSlots.has(id)) {
    const inst = new SteamAuth(CONFIG_DIR, makeAuthSend(id));
    inst.addingAccount = addingAccountMode || id !== '0';
    authSlots.set(id, inst);
  }
  return authSlots.get(id);
}
function makeAuthSend(slotId) {
  return (event, data) => { if (win && !win.isDestroyed()) win.webContents.send('auth:' + event, { ...data, slotId }); };
}
let tray = null;
let isQuitting = false;
let psbId = null;

// ================== VERİ KLASÖRLERİ (TAŞINABİLİR) ==================
// Paketlenmiş sürümde uygulama, verisini AppData'ya değil KENDİ KLASÖRÜNÜN yanına yazar.
// Böylece indirilen .zip'i nereye açarsan aç, ayarların ve önbelleğin yanında durur:
//
//   SteamEdge/
//     SteamEdge.exe
//     settings/     ayarlar, kayıtlı hesaplar, oturum, istatistikler, hatırlanan veri
//     cache/        fiyat önbelleği, kayıt dosyası, Chromium önbelleği
//
// Klasör salt okunur bir yere kurulduysa (ör. Program Files) yazma denemesi başarısız olur;
// o durumda sessizce AppData'ya düşülür, uygulama yine çalışır.
// Geliştirme sırasında (paketlenmemiş) her zaman AppData kullanılır ki depo kirlenmesin.
function portableRoot() {
  if (!app.isPackaged) return null;
  const yan = path.join(path.dirname(app.getPath('exe')));
  try {
    fs.mkdirSync(yan, { recursive: true });
    const deneme = path.join(yan, '.yazma-testi');
    fs.writeFileSync(deneme, 'x');
    fs.unlinkSync(deneme);
    return yan;
  } catch (_) { return null; }
}
const PORTABLE_ROOT = portableRoot();
const DATA_ROOT = PORTABLE_ROOT || app.getPath('userData');
const CONFIG_DIR = path.join(DATA_ROOT, 'settings');
const CACHE_DIR = path.join(DATA_ROOT, 'cache');
try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (_) {}
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (_) {}
// Chromium'un kendi önbelleği de cache/ altına alınır; yoksa exe'nin yanına
// "Cache", "GPUCache", "Local Storage" gibi klasörler saçılıyordu.
try { app.setPath('userData', path.join(CACHE_DIR, 'chromium')); } catch (_) {}
try { app.setPath('sessionData', path.join(CACHE_DIR, 'chromium')); } catch (_) {}

// ---- DAYANIKLI JSON DEPOLAMA ----
// Eski surumde her kayit duz fs.writeFileSync ile yapiliyordu. Bu atomik degildir: Windows
// kapanirken uygulama yazmanin ortasinda sonlandirilirsa dosya yarim kalir, acilista
// JSON.parse patlar ve ayarlar sessizce varsayilana doner. Ardindan yapilan ilk degisiklik
// saglam dosyanin uzerine varsayilanlari yazip veriyi kalici olarak yok ederdi.
//
// Cozum uc katmanli:
//   1. Yazma once .tmp dosyasina yapilir, fsync ile diske indirilir, sonra rename edilir.
//      rename dosya sistemi seviyesinde atomiktir; yarim dosya olusamaz.
//   2. Her yazmadan once mevcut saglam dosya .bak olarak saklanir.
//   3. Okuma basarisiz olursa .bak denenir. Ikisi de bozuksa dosya "okunamadi" isaretlenir
//      ve UZERINE YAZILMAZ - kullaniciya bildirilir. Sessizce veri yok etmek yok.
const bozukDosyalar = new Set();   // okunamayan ve bu yuzden yazilmasi yasak dosyalar

function jsonYaz(dosya, veri, bicimli) {
  if (bozukDosyalar.has(dosya)) {
    log('warn', 'yazma engellendi (dosya okunamamisti, veri korunuyor): ' + path.basename(dosya));
    return false;
  }
  const metin = bicimli ? JSON.stringify(veri, null, 2) : JSON.stringify(veri);
  const tmp = dosya + '.tmp';
  const bak = dosya + '.bak';
  try {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, metin, 'utf8');
      fs.fsyncSync(fd);              // veriyi diske indir, isletim sistemi onbelleginde birakma
    } finally { fs.closeSync(fd); }
    try { if (fs.existsSync(dosya)) fs.copyFileSync(dosya, bak); } catch (_) {}
    fs.renameSync(tmp, dosya);       // atomik yer degistirme
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    log('warn', 'yazma hatasi ' + path.basename(dosya) + ': ' + (e && e.message));
    return false;
  }
}

// Donus: { ok:true, veri } | { ok:true, veri, yedekten:true } | { ok:false, yok:true } | { ok:false, bozuk:true }
function jsonOku(dosya) {
  const dene = (p) => {
    const ham = fs.readFileSync(p, 'utf8');
    if (!ham.trim()) throw new Error('bos dosya');
    return JSON.parse(ham);
  };
  try { return { ok: true, veri: dene(dosya) }; }
  catch (e1) {
    if (e1 && e1.code === 'ENOENT') return { ok: false, yok: true };
    log('warn', path.basename(dosya) + ' okunamadi (' + (e1 && e1.message) + '), yedek deneniyor');
    try {
      const veri = dene(dosya + '.bak');
      log('info', path.basename(dosya) + ' yedekten kurtarildi');
      return { ok: true, veri, yedekten: true };
    } catch (_) {
      // Bozuk dosyayi silme, incelenebilsin diye kenara al ve uzerine yazmayi yasakla
      try { fs.copyFileSync(dosya, dosya + '.bozuk'); } catch (_) {}
      bozukDosyalar.add(dosya);
      log('warn', path.basename(dosya) + ' KURTARILAMADI, uzerine yazilmayacak');
      return { ok: false, bozuk: true };
    }
  }
}

// Acilista okunamayan dosyalar burada toplanir, pencere hazir olunca kullaniciya gosterilir.
const okumaHatalari = [];

// ---- persistent app settings ----
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const DEFAULT_SETTINGS = {
  // Genel
  autoLaunch: false,        // Windows açılışında başlat
  closeToTray: false,       // kapatınca sistem tepsisine küçült
  preventSleep: false,      // uygulama açıkken uykuyu engelle
  language: 'tr',
  // Kart Düşürme
  cardPriorityMode: 'sequential',
  cardMaxGames: 10,      // aynı anda kaç oyun açık sayılır
  autoReconnect: true,      // bağlantı koparsa yeniden bağlan
  notifyCardDrop: false,    // kart düştükçe masaüstü bildirimi (Kart Düşür > Otomasyon)
  // Kart Düşür > Otomasyon. Üçü de gerçekten çalışır; ikisi hesabı kalıcı etkilediği için
  // varsayılan KAPALI ve satış akışı "Satış öncesi onay iste" ayarına uyar.
  farmAutoSell: false,      // düşen kartı medyan fiyattan satışa sunar
  farmSilent: false,        // pencere görünmezken arayüz yenilemelerini durdurur
  farmAchUnlock: false,     // farm sırasında kilitli başarımları aralıklı açar
  // Satış (Envanter içinde - ayrı Pazar sekmesi kaldırıldı)
  saleMode: 'median',       // median | lowest
  confirmBeforeSell: true,  // satış öncesi onay iste
  bulkSellLimit: 50,        // tek toplu satışta en fazla kaç öğe listelenir
  priceRefreshHours: 24,    // fiyat önbelleği kaç saat sonra bayatlar
  historyRefreshHours: 72,  // satış geçmişi (ortalama) önbelleği kaç saat sonra bayatlar
  // Saat Yükseltici
  boostMaxGames: 32,
  rememberBoostList: true,
  pauseFarmOnBoost: false,  // boost başlarken Kart Düşür'ü otomatik durdur
  // Başarımlar
  achConfirmSingle: true,   // tekli aç/kilitle işleminde onay iste (toplu işlemde onay HER ZAMAN sorulur)
  // Bildirimler
  notifications: true,      // master (renderer okur)
  notifyFarm: true,
  notifyBoost: true,
  notifyError: true,
  notifyAch: true,
  quietHoursEnabled: false, // bu aralıkta hiç bildirim gösterme
  quietFrom: '23:00',
  quietTo: '08:00',
  // Gizlilik & Güvenlik
  offlineMode: false,       // Steam'de "Çevrimdışı" görün - arkadaşların ne oynadığını göremez
  // Gelişmiş & Veri
  apiRequestDelayMs: 350,   // fiyat isteği başına bekleme (Steam limiti - düşürmek 429 riskini artırır)
  hwAccel: true,            // GPU donanım hızlandırma - kapatmak yeniden başlatma ister
  debugLogs: false,

  // ---- Ayarlar ekranının geri kalan alanları ----
  // Hepsi kalıcı yazılır/okunur. Yanında (*) olanlar HENÜZ bir davranışa bağlı değil -
  // ya gerçek altyapı yok (telemetri sunucusu, güncelleyici, logger) ya da Steam bu veriyi
  // vermiyor (sipariş defteri). Uydurma çalışıyormuş gibi göstermemek için işaretli.
  // currency anahtarı KALDIRILDI. Kur seçimi yok: tutarlar hesabın Steam PAZAR kurunda
  // çekilir ve aynen o kurda gösterilir (steamEngine.detectMarketCurrency).
  dataRetentionDays: 90,    // hatırlanan veri (seçili oyunlar, başarım günlüğü) kaç gün saklanır (0 = süresiz)
  // Steam sohbeti - headless çalışırken gelen mesajları görebilmek/yanıtlayabilmek için
  notifyChat: true,         // mesaj gelince masaüstü bildirimi
  chatAutoReply: false,     // otomatik yanıt gönder
  chatReplyText: 'Şu an bilgisayarımın başında değilim, en kısa sürede döneceğim.',
  chatReplyCooldown: 60,    // aynı kişiye en fazla bu dakikada bir otomatik yanıt
  startPage: 'overview',
  density: 'comfortable',   // (*)
  timeFormat: '24',
  sidebarCollapsed: false,
  queueSort: 'default',
  // minRemainCards KALDIRILDI - kart eşiği artık yok, kartı kalan her oyun kuyruğa girer
  farmMaxMinutes: 5,     // oyun başı üst süre (dk) - hızlı mod bunu kendi ritmiyle ezer
  // Hızlı mod: Steam kart düşürmeye oyun 2 saati geçince başlar. Altında kalanlar önce
  // paralel çalıştırılıp eşiğe çekilir, sonra öne çıkan oyun bu aralıkta değişir.
  fastMinPlaytimeMin: 120,
  fastRotateMinSec: 90,
  fastRotateMaxSec: 120,
  farmRetry: 3,             // (*) yeniden deneme mantığı yok
  autoNextGame: true,
  // feeMode KALDIRILDI: liste fiyatlari her zaman Steam pazarindaki tutardir.
  // Komisyon sonrasi ele gececek tutar, satis akisinda ayri satir olarak gosterilir.
  priceRefreshMin: 15,      // Envanter açıkken fiyatların arka planda tazelenme aralığı
  bookDepth: 5,             // (*) Steam sipariş defterini API'den vermiyor
  undercutCents: 1,
  autoRefreshPrices: false,
  hideAfterSell: true,
  invDefaultSort: 'value',
  dblAction: 'open',        // envanterde çift tıklama davranışı (env.js okuyor)
  invLowValue: 1,
  hideUnsellable: false,
  groupByGame: false,       // (*) envanterde gruplama yok
  compactRows: false,
  boostTarget: '2',
  boostStagger: 5,          // (*) sıralı başlatma aralığı uygulanmıyor
  autoStopBoost: true,
  shuffleBoost: false,
  // Saat Yükseltici sayfasındaki Davranış/Gizlilik anahtarları ve preset
  // Saat eşitleme - seçili oyunların toplam sürelerini aynı noktada buluşturur (varsayılan KAPALI)
  boostSync: false,
  boostSyncMode: 'highest',     // highest | manual | library
  boostSyncTargetHours: 100,    // 'manual' seçiliyken hedef saat
  boostSyncLibraryMaxMin: 0,    // 'library' için son hesaplanan kütüphane en yüksek süresi (dk)
  // parallel = hepsi birlikte, hedefe ulasan listeden duser (hizli, varsayilan)
  // staged   = kademeli, oyunlari yol boyunca esit tutar (yavas)
  boostSyncStrategy: 'parallel',
  boostAutoRestart: false,  // süre dolunca oturumu kendiliğinden yeniden başlat
  seqIdle: false,           // sıralı bekletme (kapalı = tümü eşzamanlı)
  loopQueue: true,          // sıralı modda kuyruk bitince baştan başla
  boostDurationSec: 3600,
  boostGameIds: [],         // "Oyun listesini hatırla" açıkken seçili oyunlar
  // Başarım açılış aralığı (SANİYE). 1 = en hızlı; gerçek bekleme her açılışta rastgele
  // sapmayla hesaplanır, sabit ritim oluşmaz (basarim.js > acNextDelayMs).
  // Gerçekçi Mod (G11: sayfa şablona göre yenilendi)
  grDurationSec: 7200,      // oturum süresi (2 saat)
  grTargetAuto: true,       // hedef başarım sayısını uygulama seçsin
  grTarget: 0,              // elle hedef (0 = hepsi)
  grCR: '2.0',              // oyun uzunluğu çarpanı ('auto' = elle Tc)
  grDiff: '1.2',            // kalan başarım zorluğu çarpanı
  grTc: '',                 // %100 süresi (saat) - elle girilen
  grModel: 'linear',        // dağıtım modeli: linear | exp | pareto
  grAuto: true,             // sırayı otomatik başlat (kuyruktaki sonraki oyuna geç)
  grRandomGap: true,        // açılış aralıklarına rastgele sapma
  grSkipUltraRare: false,   // %5 altı başarımları atla
  grNoAchMode: 'hours',     // başarımı olmayan oyun: hours | skip | stop
  grKeepHours: true,        // başarımlar bitince süre sonuna kadar saat topla
  grShowNoAch: false,       // başarımsız oyunlar oyun listesinde görünsün
  grLevel: 'simple',        // sağ panel: simple | advanced
  achDelay: '1',
  achOrder: 'default',
  achSafeMode: true,
  achSpread: false,
  dontAsk_achSingle: false, // onay penceresinde "bir daha sorma" işaretlendiyse true
  notifyPriceDrop: false,   // (*) takip listesi altyapısı yok
  notifSound: 'chime',      // 20 ton, Web Audio ile üretiliyor (common.js > NOTIF_SOUNDS)
  sessionTimeout: 'never',  // boşta kalma süresi (dk) - 'never' = kapalı
  hideGameName: false,      // oynarken görünmez ol (oyun adı profilde görünmesin)
  twoStepSell: false,       // toplu satışta yazarak ek onay
  logLevel: 'error',
};
let settings = { ...DEFAULT_SETTINGS };

// ---- seviyeli kayıt (Ayarlar > Gelişmiş: "Kayıt seviyesi" + "Hata ayıklama kayıtlarını tut") ----
// debugLogs açıkken kayıtlar config klasöründeki steamedge.log dosyasına da yazılır.
const LOG_FILE = path.join(CACHE_DIR, 'steamedge.log');   // kayit dosyasi onbellek tarafinda
const LOG_RANK = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, msg) {
  const want = LOG_RANK[settings.logLevel] != null ? LOG_RANK[settings.logLevel] : 0;
  if ((LOG_RANK[level] != null ? LOG_RANK[level] : 0) > want) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
  if (!settings.debugLogs) return;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    // 2 MB'ı aşarsa döndür (tek yedek) - disk şişmesin
    try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch (_) {}
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}
// NOT: Döviz kuru çevirisi TAMAMEN KALDIRILDI. Tutarlar Steam Topluluk Pazarı'ndan
// hesabın kendi pazar kurunda çekilir ve aynen o kurda gösterilir. Çeviri, kullanıcının
// Steam'de gördüğü sayı ile uygulamada gördüğü sayının farklı olmasına yol açıyordu.

ipcMain.handle('log:write', (_e, { level, msg }) => { log(level || 'info', '[ui] ' + msg); return true; });
ipcMain.handle('log:open', () => { shell.openPath(LOG_FILE); return { ok: true }; });

// Masaüstü bildirimi - renderer'daki HTML5 Notification yerine ana süreçten gönderilir.
// Sonuç renderer'a döner ki "Test bildirimi" butonu gerçekten ne olduğunu söyleyebilsin.
const NOTIF_ICON = path.join(__dirname, 'src', 'assets', 'icon.png');
ipcMain.handle('notify:show', (_e, { title, body }) => {
  if (!Notification.isSupported()) {
    log('warn', 'bildirim desteklenmiyor (isSupported=false)');
    return { ok: false, error: 'İşletim sistemi bildirimleri desteklemiyor.' };
  }
  try {
    const n = new Notification({
      title: title || 'SteamEdge',
      body: body || '',
      icon: fs.existsSync(NOTIF_ICON) ? NOTIF_ICON : undefined,
      silent: true,   // sesi kendimiz çalıyoruz (ayarlardan seçilen ton)
    });
    n.on('click', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
    n.show();
    log('debug', 'bildirim gonderildi: ' + (title || ''));
    return { ok: true };
  } catch (e) {
    log('warn', 'bildirim hatasi: ' + (e && e.message));
    return { ok: false, error: (e && e.message) || 'bilinmeyen hata' };
  }
});
function loadSettings() {
  const r = jsonOku(SETTINGS_FILE);
  if (r.ok) {
    settings = { ...DEFAULT_SETTINGS, ...r.veri };
    if (r.yedekten) okumaHatalari.push({ ad: 'Ayarlar', kurtarildi: true });
  } else {
    settings = { ...DEFAULT_SETTINGS };
    // yok = ilk calistirma, normal. bozuk = gercek sorun, kullaniciya soyle.
    if (r.bozuk) okumaHatalari.push({ ad: 'Ayarlar', kurtarildi: false });
  }
}
function saveSettings() { jsonYaz(SETTINGS_FILE, settings, true); }
function applySettings() {
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autoLaunch }); } catch (_) {}
  try {
    if (settings.preventSleep && psbId === null) psbId = powerSaveBlocker.start('prevent-app-suspension');
    else if (!settings.preventSleep && psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
  } catch (_) {}
  // Çevrimdışı görün / oyun adını gizle - bağlıyken anında uygulanır
  try { if (engineReady && engine) engine.applyPrivacy(settings.offlineMode, settings.hideGameName); } catch (_) {}
  // Sohbet otomatik yanıtı - TÜM bağlı hesaplara uygulanır
  accounts.forEach((s) => { if (s.engine) applyChatSettings(s.engine); });
  if (typeof armIdleTimer === 'function') armIdleTimer();
}

// Otomatik yanıt yalnızca `chatAutoReply` açıkken ve metin doluyken devreye girer;
// aynı kişiye `chatReplyCooldown` dakika içinde ikinci kez yazılmaz (spam olmasın).
function applyChatSettings(eng) {
  try {
    eng.setAutoReply(settings.chatAutoReply ? settings.chatReplyText : null, settings.chatReplyCooldown);
  } catch (_) {}
}

function ensureTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'src', 'assets', 'icon.png'));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
    tray.setToolTip('SteamEdge');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Göster', click: () => { if (win) { win.show(); win.focus(); } } },
      { type: 'separator' },
      { label: 'Çıkış', click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', () => { if (win) { win.isVisible() ? win.hide() : (win.show(), win.focus()); } });
  } catch (_) {}
}

function send(event, data) {
  if (win && !win.isDestroyed()) win.webContents.send('auth:' + event, data);
}
function sendRaw(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// Safety net: some steam-user/steam-totp paths throw asynchronously (e.g. enableTwoFactor on an
// account that already has an authenticator) and would otherwise crash the whole app. Swallow,
// report, keep running.
process.on('uncaughtException', (e) => { console.error('uncaughtException:', e && e.message); send('mafile', { ok: false, message: 'maFile atlandı: ' + (e && e.message) }); });
process.on('unhandledRejection', (e) => { console.error('unhandledRejection:', e && (e.message || e)); });

function hasSession() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'session.json'), 'utf8'));
    return s && s.refreshToken ? s : null;
  } catch (_) { return null; }
}

// ---- çoklu hesap deposu (accounts.json) - session.json her zaman "aktif" hesabı yansıtır ----
const ACCOUNTS_FILE = path.join(CONFIG_DIR, 'accounts.json');
function loadAccounts() {
  const r = jsonOku(ACCOUNTS_FILE);
  if (r.ok) {
    if (r.yedekten) okumaHatalari.push({ ad: 'Kayitli hesaplar', kurtarildi: true });
    return Array.isArray(r.veri) ? r.veri : [];
  }
  if (r.bozuk) okumaHatalari.push({ ad: 'Kayitli hesaplar', kurtarildi: false });
  return [];
}
function saveAccounts(list) { jsonYaz(ACCOUNTS_FILE, list, true); }
// Bu hesabı aktif oturum yapar (session.json) ve motoru sıfırlar - bir sonraki engine:connect
// bu hesabın refreshToken'ıyla yeniden bağlanır. Renderer, çağıran taraf reload edecek.
// session.json = "uygulama açılışında hangi hesap görünsün". Motoru SIFIRLAMAZ - hesaplar
// birbirinden bağımsız çalıştığı için geçiş yapmak diğerlerini etkilemez.
function makeActiveSession(entry) {
  jsonYaz(path.join(CONFIG_DIR, 'session.json'), {
    accountName: entry.accountName, steamID: entry.steamID, refreshToken: entry.refreshToken,
  }, true);
}

// Sabit açılış boyutu - login ve panel için aynı (3:2 oran). Pencereyi ortalayan/yeniden boyutlayan
// her yer (logout, dashboard'a geçiş, hesap silme, veri silme) bu sabitleri kullanır ki tek yerden
// değişsin.
const WIN_W = 1716;
const WIN_H = 1144;
// Pencereyi ekranda ortalayıp WIN_W x WIN_H yapar. Ekran küçükse çalışma alanına sığdırır.
function centerDefaultSize() {
  if (!win) return;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(WIN_W, workAreaSize.width - 24);
  const height = Math.min(WIN_H, workAreaSize.height - 24);
  win.setBounds({ width, height, x: Math.round((workAreaSize.width - width) / 2), y: Math.round((workAreaSize.height - height) / 2) });
}

function createWindow() {
  const sess = hasSession();               // saved refresh token → auto-login straight to dashboard
  const size = sess
    ? { w: WIN_W, h: WIN_H, minW: 1120, minH: 700 }
    : { w: WIN_W, h: WIN_H, minW: 900, minH: 700 };

  win = new BrowserWindow({
    width: size.w, height: size.h, minWidth: size.minW, minHeight: size.minH,
    frame: false, backgroundColor: '#0f1720', show: false,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });

  win.loadFile(path.join(__dirname, ...(sess ? ['src', 'main', 'main.html'] : ['src', 'login', 'login.html'])));
  win.once('ready-to-show', () => { win.center(); win.show(); });
  win.on('close', (e) => {
    if (!isQuitting && settings.closeToTray) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
}

// window controls
ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('win:close', () => win && win.close());
ipcMain.on('win:fit', (_e, h) => {
  if (!win || win.isMaximized()) return;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = win.getBounds().width;
  const height = Math.min(Math.ceil(h), workAreaSize.height - 24);
  win.setBounds({ x: Math.round((workAreaSize.width - width) / 2), y: Math.round((workAreaSize.height - height) / 2), width, height });
});
// Login ekranında (+) ile yeni hesap kutusu eklendikçe pencereyi genişletir (yan yana sığsınlar diye).
ipcMain.on('win:setWidth', (_e, w) => {
  if (!win || win.isMaximized()) return;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(Math.ceil(w), workAreaSize.width - 24);
  const height = win.getBounds().height;
  win.setBounds({ x: Math.round((workAreaSize.width - width) / 2), y: Math.round((workAreaSize.height - height) / 2), width, height });
});

// auth - her çağrı {slotId, ...} taşır; her (+) kutusu login.html'de kendi bağımsız
// SteamAuth örneğini kullanır (bkz getAuthSlot).
ipcMain.on('auth:startQR', (_e, { slotId } = {}) => getAuthSlot(slotId).startQR());
ipcMain.on('auth:startCredentials', (_e, { slotId, accountName, password }) => getAuthSlot(slotId).startCredentials(accountName, password));
ipcMain.on('auth:submitGuard', (_e, { slotId, code }) => getAuthSlot(slotId).submitGuard(code));
ipcMain.on('auth:cancel', (_e, { slotId } = {}) => getAuthSlot(slotId).cancel());
ipcMain.on('auth:loginCookie', (_e, { slotId, sessionid, steamLoginSecure, steamparental }) => getAuthSlot(slotId).loginCookie(sessionid, steamLoginSecure, steamparental));
ipcMain.on('auth:generateMaFile', (_e, { slotId } = {}) => getAuthSlot(slotId).generateMaFile());
ipcMain.on('auth:finalizeMaFile', (_e, { slotId, code }) => getAuthSlot(slotId).finalizeMaFile(code));
ipcMain.on('auth:importMaFile', (_e, { slotId, json }) => getAuthSlot(slotId).importMaFile(json));

// logout: clear saved session, back to login
ipcMain.on('auth:logout', () => {
  // "Tüm hesaplardan çık" - arka planda çalışanlar dahil hepsi kapanır
  disconnectAll();
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'web-session.json')); } catch (_) {}
  authSlots.clear(); addingAccountMode = false;
  if (!win) return;
  win.setMinimumSize(900, 700);
  centerDefaultSize();
  win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
});

// login -> dashboard (sadece slot 0 başarıyla bitince login.html bunu çağırır)
ipcMain.on('go:dashboard', () => {
  if (!win) return;
  authSlots.clear(); addingAccountMode = false; // "Add Account" akışı bittiyse bayrağı sıfırla
  win.setMinimumSize(900, 640);
  centerDefaultSize();
  win.loadFile(path.join(__dirname, 'src', 'main', 'main.html'));
});

// ---- çoklu hesap yönetimi (soldaki barın kaldırılan profilinin yerine üst çubuk hesap değiştirici) ----
// Kayıtlı hesapları listeler (refreshToken sızdırılmaz - sadece main process kullanır).
// Aktif oturum accounts.json'da yoksa (ör. çoklu-hesap özelliğinden ÖNCE giriş yapılmış eski
// session.json) burada kendiliğinden ekler - aksi halde login olduğun hesap listede görünmezdi.
ipcMain.handle('accounts:list', () => {
  const sess = hasSession();
  let list = loadAccounts();
  if (sess && !list.some((a) => a.steamID === sess.steamID)) {
    list = [...list, { accountName: sess.accountName, steamID: sess.steamID, refreshToken: sess.refreshToken, addedAt: Date.now() }];
    saveAccounts(list);
  }
  if (!activeSteamID && sess) { activeSteamID = sess.steamID; hesapVerisiGecisi(); }
  return list.map((a) => {
    const s = accounts.get(a.steamID);
    return {
      steamID: a.steamID,
      accountName: a.accountName,
      active: a.steamID === activeSteamID,        // arayüzde görüntülenen
      connected: !!(s && s.ready),                // Steam oturumu açık
      running: !!(s && s.lastTick && s.lastTick.running),   // kart/saat çalışıyor
    };
  });
});

// Hesap değiştir: YENİDEN YÜKLEME YOK. Sadece arayüzün gösterdiği hesap değişir; önceki
// hesabın kart toplama/saat yükseltme işi arka planda kesintisiz devam eder.
ipcMain.handle('accounts:switch', async (_e, steamID) => {
  const entry = loadAccounts().find((a) => a.steamID === steamID);
  if (!entry) return { ok: false, error: 'Hesap bulunamadı.' };
  activeSteamID = steamID;
  // session.json her zaman "arayüzde açık olan" hesabı yansıtsın (yeniden başlatmada o açılır)
  makeActiveSession(entry);
  const r = await connectAccount(entry);
  syncActive();
  if (!r.ok) return r;
  const s = accounts.get(steamID);
  // Renderer geçtiği hesabın mevcut durumunu hemen görsün
  if (s && s.lastTick) sendRaw('farm:tick', s.lastTick);
  return { ok: true, persona: r.persona, steamID, softSwitch: true };
});

// Tüm kayıtlı hesapları arka planda bağlar (paralel idle için).
ipcMain.handle('accounts:connectAll', async () => {
  const list = loadAccounts();
  const out = [];
  for (const a of list) {
    const r = await connectAccount(a);
    out.push({ steamID: a.steamID, accountName: a.accountName, ok: r.ok, error: r.error });
  }
  syncActive();
  return out;
});

// Belirli bir hesabın oturumunu kapatır (listeden silmez).
ipcMain.handle('accounts:disconnect', (_e, steamID) => {
  const s = accounts.get(steamID);
  if (!s) return { ok: false, error: 'Hesap bağlı değil.' };
  try { if (s.farm) s.farm.stop(); } catch (_) {}
  try { if (s.farmSaat) s.farmSaat.stop(); } catch (_) {}
  try { if (s.engine) s.engine.logOff(); } catch (_) {}
  accounts.delete(steamID);
  syncActive();
  return { ok: true };
});
// Kayıtlı hesabı listeden siler. Aktif hesap silindiyse: kalan hesap varsa ona geçer, yoksa
// oturumu tamamen kapatıp giriş ekranına döner.
ipcMain.handle('accounts:remove', async (_e, steamID) => {
  const list = loadAccounts();
  const idx = list.findIndex((a) => a.steamID === steamID);
  if (idx < 0) return { ok: false, error: 'Hesap bulunamadı.' };
  // Hesabin kendi verisi de gitsin, yoksa ayni hesap tekrar eklendiginde eski
  // kuyrugu/istatistigi geri gelir ve kullanici sildim sanir.
  hesapVerileri.delete(steamID);
  ['', '.bak', '.bozuk', '.tmp'].forEach((ek) => {
    try { fs.unlinkSync(hesapDosyasi(steamID) + ek); } catch (_) {}
  });
  const wasActive = steamID === activeSteamID;
  // Silinen hesabın arka plan işini de durdur
  const s = accounts.get(steamID);
  if (s) {
    try { if (s.farm) s.farm.stop(); } catch (_) {}
    try { if (s.farmSaat) s.farmSaat.stop(); } catch (_) {}
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
    accounts.delete(steamID);
  }
  list.splice(idx, 1);
  saveAccounts(list);
  if (!wasActive) { syncActive(); return { ok: true, softSwitch: true }; }
  if (list.length) {
    activeSteamID = list[0].steamID;
    makeActiveSession(list[0]);
    await connectAccount(list[0]);
    syncActive();
    return { ok: true, softSwitch: true };
  }
  try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
  if (win) {
    win.setMinimumSize(900, 700);
    centerDefaultSize();
    win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
  }
  return { ok: true, loggedOut: true };
});
// "Add Account": giriş ekranına geçer ama aktif oturumu DEĞİŞTİRMEZ - yeni hesap sadece listeye
// eklenir, kullanıcı mevcut hesabında kalmaya devam eder (steamAuth.addingAccount bayrağı).
ipcMain.on('accounts:startAdd', () => {
  if (!win) return;
  addingAccountMode = true; authSlots.clear();
  win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
});

// ================= ÇOKLU HESAP MOTORU =================
// Her Steam hesabı KENDİ SteamEngine + FarmController örneklerini alır ve birbirinden bağımsız
// çalışır: A hesabı kart toplarken B'ye geçmek A'yı durdurmaz. "Aktif hesap" sadece arayüzün
// hangi hesabın verisini gösterdiğini belirler.
//
// Geriye dönük uyum için `engine`/`engineReady`/`farm`/`farmSaat` değişkenleri AKTİF hesabın
// nesnelerini işaret eder (aşağıdaki syncActive ile güncellenir), böylece mevcut IPC
// işleyicileri olduğu gibi çalışmaya devam eder.
const accounts = new Map();      // steamID -> { engine, farm, farmSaat, ready, accountName }
let activeSteamID = null;
let engine = null;
let engineReady = false;
let farm = null;
let farmSaat = null;

function slotOf(steamID) {
  if (!accounts.has(steamID)) accounts.set(steamID, { engine: null, farm: null, farmSaat: null, ready: false, accountName: null });
  return accounts.get(steamID);
}

// G3: Motor baglanti durumunu arayuze tasir. Eskiden calisma aninda kopan baglanti
// hicbir yere bildirilmiyordu; kullanici saatlerce "calisiyor" yazisina bakip
// aslinda hicbir sey kazanmiyordu.
function baglantiDurumunuBagla(eng, steamID) {
  eng.onDurum = (durum, ek) => {
    const s = accounts.get(steamID);
    if (s) s.ready = (durum === 'bagli');
    if (steamID === activeSteamID) { engineReady = (durum === 'bagli'); }
    const mesaj = durum === 'koptu'
      ? ('Steam baglantisi koptu: ' + (ek.sebep || '?'))
      : durum === 'baglaniyor'
        ? ('yeniden baglaniyor (deneme ' + ek.deneme + ', ' + Math.round((ek.bekleMs || 0) / 1000) + ' sn sonra)')
        : durum === 'bagli' && ek.yenidenBaglandi
          ? ('yeniden baglandi, ' + (ek.oyunlar || 0) + ' oyun geri acildi')
          : 'baglandi';
    log(durum === 'koptu' ? 'warn' : 'info', '[' + steamID + '] ' + mesaj);
    sendRaw('engine:durum', { steamID, durum, mesaj, aktif: steamID === activeSteamID, ...ek });
  };
}

// ================== HESABA OZEL VERI DEPOSU ==================
// Eskiden saat yukseltici oyun listesi, kuyruk sirasi, basarim gunlugu ve istatistikler
// uygulama geneli dosyalarda tutuluyordu. Coklu hesapta bu, hesaplarin birbirinin verisini
// gormesine yol aciyordu: User 1'in secili oyunlari User 2'de de gorunuyordu.
// Artik her hesap kendi dosyasinda: settings/accounts/<steamID>.json
const HESAP_DIZINI = path.join(CONFIG_DIR, 'accounts');
// settings:set uzerinden gelen ama aslinda hesaba ozel olan anahtarlar.
// Renderer tarafi degismesin diye burada ayikliyoruz.
// 'profil': son bilinen isim/avatar/seviye/ozel adres. Arayuze settings ile birlikte gider,
// boylece acilista Steam oturumu beklenmeden ekrana yazilabilir.
// 'grQueue' ve 'grPresets': Gercekci Mod'un oyun kuyrugu ve kayitli presetleri. Hesaba
// ozel, cunku kutuphane ve basarim durumu hesaba gore degisiyor.
const HESAP_AYAR_ANAHTARLARI = ['boostGameIds', 'profil', 'grQueue', 'grPresets'];
const VARSAYILAN_HESAP_VERISI = {
  boostGameIds: [], entries: {}, achLog: [], stats: null, profil: null,
  grQueue: [], grPresets: [],
};

const hesapVerileri = new Map();   // steamID -> veri

function hesapDosyasi(steamID) { return path.join(HESAP_DIZINI, String(steamID) + '.json'); }

function hesapVerisi(steamID) {
  if (!steamID) return { ...VARSAYILAN_HESAP_VERISI, entries: {}, achLog: [] };
  if (hesapVerileri.has(steamID)) return hesapVerileri.get(steamID);
  const r = jsonOku(hesapDosyasi(steamID));
  const v = r.ok
    ? { ...VARSAYILAN_HESAP_VERISI, ...r.veri }
    : { ...VARSAYILAN_HESAP_VERISI, entries: {}, achLog: [] };
  if (r.ok && r.yedekten) okumaHatalari.push({ ad: 'Hesap verisi (' + steamID + ')', kurtarildi: true });
  if (r.bozuk) okumaHatalari.push({ ad: 'Hesap verisi (' + steamID + ')', kurtarildi: false });
  hesapVerileri.set(steamID, v);
  return v;
}
function hesapVerisiYaz(steamID) {
  if (!steamID) return;
  jsonYaz(hesapDosyasi(steamID), hesapVerisi(steamID), true);
}
// Aktif hesabin verisi. Hicbir hesap yoksa gecici bir kap doner (diske yazilmaz).
function aktifHesapVerisi() { return hesapVerisi(activeSteamID); }

// ---- Tek seferlik gecis: eski genel dosyalardan aktif hesabin dosyasina tasi ----
// Kullanici surum yukseltince verisini kaybetmesin diye. Tasindiktan sonra genel
// dosyalardaki kopyalar okunmaz; silmiyoruz ki geri donus gerekirse elde kalsin.
function hesapVerisiGecisi() {
  if (!activeSteamID) return;
  if (settings.hesapVerisiTasindi) return;
  const v = hesapVerisi(activeSteamID);
  let tasinan = [];
  if (Array.isArray(settings.boostGameIds) && settings.boostGameIds.length && !v.boostGameIds.length) {
    v.boostGameIds = settings.boostGameIds.slice();
    tasinan.push(v.boostGameIds.length + ' saat yukseltici oyunu');
  }
  if (appState && appState.entries && Object.keys(appState.entries).length && !Object.keys(v.entries).length) {
    v.entries = JSON.parse(JSON.stringify(appState.entries));
    tasinan.push(Object.keys(v.entries).length + ' kayitli durum');
  }
  if (appState && Array.isArray(appState.achLog) && appState.achLog.length && !v.achLog.length) {
    v.achLog = appState.achLog.slice();
    tasinan.push(v.achLog.length + ' basarim kaydi');
  }
  if (!v.stats && lifeStats) { v.stats = { ...lifeStats }; tasinan.push('istatistikler'); }
  hesapVerisiYaz(activeSteamID);
  settings.hesapVerisiTasindi = true; saveSettings();
  if (tasinan.length) log('info', 'hesap verisi tasindi (' + activeSteamID + '): ' + tasinan.join(', '));
}
// Modül seviyesindeki kısayolları aktif hesaba bağlar.
function syncActive() {
  const s = activeSteamID ? accounts.get(activeSteamID) : null;
  engine = s ? s.engine : null;
  engineReady = !!(s && s.ready);
  farm = s ? s.farm : null;
  farmSaat = s ? s.farmSaat : null;
}
// Bir hesabın farm/boost olayları - sadece AKTİF hesabınkiler arayüze gider; arka plandakiler
// yalnızca "hangi hesap çalışıyor" rozetini besler.
function accountEmit(steamID) {
  return (channel, data) => {
    const s = accounts.get(steamID);
    if (s) s.lastTick = data;
    if (steamID === activeSteamID) sendRaw(channel, data);
    sendRaw('accounts:activity', { steamID, running: !!(data && data.running) });
  };
}
// Tüm hesapların işini durdurup oturumlarını kapatır (çıkış / zaman aşımı / veri silme).
function disconnectAll() {
  accounts.forEach((s) => {
    try { if (s.farm) s.farm.stop(); } catch (_) {}
    try { if (s.farmSaat) s.farmSaat.stop(); } catch (_) {}
    try { if (s.engine) s.engine.logOff(); } catch (_) {}
  });
  accounts.clear();
  activeSteamID = null;
  syncActive();
}

// Hesabı (gerekiyorsa) bağlar. Zaten bağlıysa mevcut motoru döndürür.
async function connectAccount(entry) {
  const s = slotOf(entry.steamID);
  s.accountName = entry.accountName;
  if (s.ready && s.engine) return { ok: true, persona: s.engine.persona, steamID: s.engine.steamID };
  // AYNI HESAP İÇİN İKİNCİ LOGON AÇMA. Eski kod yalnızca oturum TAMAMLANMIŞSA kısa devre
  // yapıyordu; açılış sırasında `accounts:connectAll` ile sayfaların `engine:connect`
  // çağrısı çakışınca iki SteamEngine birden logon oluyordu. Steam bir hesap için ikinci
  // istemci oturumunu görünce ilkini düşürüyor → LogonSessionReplaced, motor bağlantısız
  // kalıyor ve sayfalar "Bağlı değil." diyordu. Devam eden bağlantı varsa onun sonucu paylaşılır.
  if (s.connecting) return s.connecting;
  s.connecting = (async () => {
  const tries = settings.autoReconnect ? Math.max(1, +settings.farmRetry || 1) : 1;
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i - 1)));
    // Kur AYARDAN değil, hesabın cüzdanından gelir (logon'daki 'wallet' olayı doldurur).
    // Kur, Steam pazar oturumundan okunur; ayarlardan seçilemez.
    const eng = new SteamEngine();
    // G3: kopma/yeniden baglanma olaylarini arayuze tasi
    baglantiDurumunuBagla(eng, entry.steamID);
    applyChatSettings(eng);
    // Gelen sohbet mesajı: hangi hesaba geldiyse onun adıyla arayüze ve bildirime düşer.
    eng.onChatMessage = (m) => {
      log('info', `[${entry.accountName}] mesaj: ${m.persona || m.from}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('chat:message', { ...m, account: entry.accountName, steamID: entry.steamID });
      }
      if (settings.notifyChat !== false) {
        try {
          if (Notification.isSupported()) {
            new Notification({
              title: (m.persona || 'Steam') + (m.replied ? ' · otomatik yanıtlandı' : ''),
              body: m.message.slice(0, 220),
              icon: fs.existsSync(NOTIF_ICON) ? NOTIF_ICON : undefined,
            }).show();
          }
        } catch (_) {}
      }
    };
    try {
      const info = await eng.logOn(entry.refreshToken, settings.offlineMode);
      s.engine = eng; s.ready = true;
      log('info', `[${entry.accountName}] oturum açıldı`);
      syncActive();
      return { ok: true, persona: info.persona, steamID: info.steamID };
    } catch (e) {
      lastErr = e;
      log('error', `[${entry.accountName}] logOn hatası: ${e.message}`);
      // Başarısız denemenin soketi arkada açık kalmasın - sonraki deneme temiz başlasın
      try { eng.user.logOff(); } catch (_) {}
    }
  }
  s.ready = false;
  return { ok: false, error: lastErr ? lastErr.message : 'Bağlanılamadı.' };
  })();
  try { return await s.connecting; }
  finally { s.connecting = null; }
}

// Aktif hesabı bağlar. (Diğer hesaplar accounts:connectAll / hesap değiştirme ile bağlanır.)
ipcMain.handle('engine:connect', async () => {
  const sess = hasSession();
  if (!sess) return { ok: false, error: 'Oturum yok, tekrar giriş yapın.' };
  if (!activeSteamID) { activeSteamID = sess.steamID; hesapVerisiGecisi(); }
  const entry = loadAccounts().find((a) => a.steamID === activeSteamID) || sess;
  const r = await connectAccount(entry);
  syncActive();
  return r;
});

// Son cekilen listeler hesabin kendi dosyasinda saklanir. Amac: acilista Genel Bakis'in
// bos beklememesi. Rozet sayfasi ve kutuphane cagrisi birkac saniye suruyor; o sure
// boyunca "Toplam Kart" ve "Kutuphane" tire gosteriyordu. Artik son bilinen degerler
// aninda ciziliyor, taze veri gelince ustune yaziliyor.
function listeleriSakla(alan, veri) {
  const v = aktifHesapVerisi();
  v.listeler = { ...(v.listeler || {}), [alan]: veri, [alan + 'Ts']: Date.now() };
  hesapVerisiYaz(activeSteamID);
}
ipcMain.handle('engine:sonListeler', () => {
  const v = aktifHesapVerisi();
  return { ok: true, ...(v.listeler || {}) };
});

ipcMain.handle('engine:dropGames', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const games = await engine.getDropGames();
    // Rozet sayfası oynama süresini vermiyor; Hızlı mod ise "2 saat" kuralı için buna
    // muhtaç (Steam kart düşürmeye ancak oyun 2 saati geçince başlar). Sahip olunan oyun
    // listesinden süreyi birleştiriyoruz. Alınamazsa oyunlar süresiz sayılır (0 dk).
    let mins = new Map();
    try {
      const owned = await engine.getOwnedGames();
      owned.forEach((o) => mins.set(o.appid, o.playtimeForever || 0));
    } catch (e) { log('warn', 'oynama suresi alinamadi: ' + e.message); }
    const cikti = games.map((g) => ({ ...g, playtimeMin: mins.get(g.appid) || 0 }));
    listeleriSakla('drop', cikti);
    return { ok: true, games: cikti };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('engine:inventory', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, items: await engine.getInventory() }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ---- price cache + throttled fetcher ----
// MEASURED: Steam serves 20 priceoverview requests then 429s; the window clears after ~30s.
// So we fetch in batches of 18 (safety margin) with a 32s cooldown, and persist results to disk
// so a full library scan only happens once (prices are re-checked after settings.priceRefreshHours).
const PRICE_FILE = path.join(CACHE_DIR, 'prices.json');   // fiyat onbellegi
// G8: gerceklesen satis gecmisi onbellegi (ortalama/medyan buradan gelir).
// Fiyattan AYRI tutuluyor: pricehistory ucu her oge icin ayri istek istiyor ve cok daha
// pahali. Kullanici "ortalamalari getir" demeden hic doldurulmaz.
const HISTORY_FILE = path.join(CACHE_DIR, 'history.json');
const BATCH_SIZE = 18;
const BATCH_COOLDOWN_MS = 32000;

let priceCache = new Map();   // hashName -> { price, ts }
let priceQueue = [];
let priceRunning = false;

// ---- G8: satis gecmisi kuyrugu ----
let historyCache = new Map();  // hashName -> { hist, ts, cur }
let historyQueue = [];
let historyRunning = false;
let historyIptal = false;
const historyTries = new Map();
const MAX_HISTORY_TRIES = 2;
const HISTORY_CACHE_VERSION = 1;

function loadPriceCache() {
  const r = jsonOku(PRICE_FILE);
  priceCache = (r.ok && r.veri && typeof r.veri === 'object') ? new Map(Object.entries(r.veri)) : new Map();
}
// NOT: fiyat onbellegi CACHE_DIR altinda durur; eskiden yanlislikla CONFIG_DIR olusturuluyordu.
function savePriceCache() { jsonYaz(PRICE_FILE, Object.fromEntries(priceCache), false); }

function loadHistoryCache() {
  const r = jsonOku(HISTORY_FILE);
  historyCache = (r.ok && r.veri && typeof r.veri === 'object') ? new Map(Object.entries(r.veri)) : new Map();
}
function saveHistoryCache() { jsonYaz(HISTORY_FILE, Object.fromEntries(historyCache), false); }

// Gecmis, fiyattan daha yavas eskir: gerceklesen satislarin medyani gun icinde pek
// oynamaz. Yine de kur degisirse (hesap farkli bolgeye gecerse) atilir.
function cachedHistory(h) {
  const e = historyCache.get(h);
  if (!e) return undefined;
  if (e.v !== HISTORY_CACHE_VERSION) return undefined;
  const cur = currentPriceCurrency();
  if (!cur || e.cur !== cur) return undefined;
  const ttl = (settings.historyRefreshHours || 72) * 60 * 60 * 1000;
  if (Date.now() - e.ts > ttl) return undefined;
  return e.hist;
}

async function runHistoryQueue() {
  if (historyRunning) return;
  historyRunning = true;
  historyIptal = false;
  const toplam = historyQueue.length;
  let yapilan = 0;
  try {
    while (historyQueue.length) {
      if (historyIptal) { historyQueue.length = 0; break; }
      const h = historyQueue.shift();
      if (cachedHistory(h) !== undefined) { yapilan++; continue; }
      const deneme = (historyTries.get(h) || 0) + 1;
      historyTries.set(h, deneme);

      let hist = null;
      try { hist = await marketGate(() => engine.getPriceHistory(h)); } catch (_) { hist = null; }

      if (hist && hist.rateLimited && deneme < MAX_HISTORY_TRIES) {
        historyQueue.push(h);       // sona at, digerleri ilerlesin
        sendRaw('history:progress', { toplam, yapilan, kalan: historyQueue.length, bekliyor: true });
        await new Promise((r) => setTimeout(r, BATCH_COOLDOWN_MS));
        continue;
      }
      if (hist && hist.rateLimited) {
        log('warn', 'satis gecmisi alinamadi (istek limiti): ' + h);
        hist = null;
      }
      historyTries.delete(h);
      historyCache.set(h, { hist, ts: Date.now(), cur: currentPriceCurrency(), v: HISTORY_CACHE_VERSION });
      yapilan++;
      sendRaw('history:one', { hashName: h, history: hist });
      if (yapilan % 10 === 0) saveHistoryCache();
      sendRaw('history:progress', { toplam, yapilan, kalan: historyQueue.length, bekliyor: false });
    }
  } finally {
    historyRunning = false;
    historyTries.clear();
    saveHistoryCache();
    sendRaw('history:progress', { toplam, yapilan, kalan: 0, bitti: true, iptal: historyIptal });
    historyIptal = false;
  }
}

// sadeceOnbellek=true: Steam'e hic istek atmaz, diskteki gecmisi doner.
ipcMain.handle('engine:historyFor', (_e, arg) => {
  const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
  const sadeceOnbellek = !Array.isArray(arg) && !!(arg && arg.sadeceOnbellek);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const out = {};
  const eksik = [];
  [...new Set(hashNames || [])].forEach((h) => {
    if (!h) return;
    const c = cachedHistory(h);
    if (c !== undefined) out[h] = c;
    else if (!historyQueue.includes(h)) eksik.push(h);
  });
  if (sadeceOnbellek) return { ok: true, history: out, eksik: eksik.length, kuyruk: 0 };
  historyQueue.push(...eksik);
  if (historyQueue.length) runHistoryQueue();
  return { ok: true, history: out, eksik: eksik.length, kuyruk: historyQueue.length };
});

ipcMain.on('engine:historyCancel', () => {
  if (historyRunning) { historyIptal = true; log('info', 'satis gecmisi cekimi iptal edildi'); }
  historyQueue.length = 0;
});
// Önbellek girdisi HANGİ PARA BİRİMİNDE çekildiyse onunla damgalanır. Farklı bir kurdaki
// eski girdi kullanılırsa tutar tamamen yanlış görünür (ör. TRY kayıt USD sanılırsa ~40 kat
// sapma) - bu yüzden kur eşleşmiyorsa girdi yok sayılır ve yeniden çekilir.
// Kurun TEK kaynağı motordur (cüzdan olayı). null = henüz bilinmiyor → fiyat çekilmez.
function currentPriceCurrency() {
  return (engine && engine.currencyCode && engine.currencyCode()) || null;
}
// Önbellek biçim sürümü. v2 öncesi girdiler, kur etiketi doğru olsa bile TUTARLARI yanlış
// kurda çekilmiş olabilir (getPrice hesabın kurunu yok sayıp hep TRY istiyordu), bu yüzden
// hepsi bir kereliğine atılır ve doğru kurla yeniden çekilir.
const PRICE_CACHE_VERSION = 2;
function cachedPrice(h) {
  const e = priceCache.get(h);
  if (!e) return undefined;
  if (e.v !== PRICE_CACHE_VERSION) return undefined;
  const cur = currentPriceCurrency();
  if (!cur || e.cur !== cur) return undefined;
  const ttl = (settings.priceRefreshHours || 24) * 60 * 60 * 1000;
  if (Date.now() - e.ts > ttl) return undefined;
  return e.price;
}

// ---- TEK PAZAR KAPISI ----
// Steam Topluluk Pazarı istekleri hesap başına ~20 istek / 30 saniye ile sınırlı. Fiyat
// kuyruğu, satış geçmişi ve sipariş defteri AYNI limiti paylaşıyor; birbirinden habersiz
// istek atınca hepsi 429 yiyor ve "alınamadı" kutuları çıkıyordu. Tüm pazar istekleri
// buradan sırayla ve aralıklı geçer.
let marketChain = Promise.resolve();
let lastMarketAt = 0;
function marketGate(fn) {
  const run = async () => {
    const gap = (settings.apiRequestDelayMs || 350);
    const wait = Math.max(0, lastMarketAt + gap - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastMarketAt = Date.now();
    return fn();
  };
  marketChain = marketChain.then(run, run);
  return marketChain;
}

const priceTries = new Map();     // hash -> kaç kez denendi
const MAX_PRICE_TRIES = 3;

async function runPriceQueue() {
  if (priceRunning) return;
  priceRunning = true;
  try {
    while (priceQueue.length) {
      const batch = priceQueue.splice(0, BATCH_SIZE);
      let hitLimit = false;
      for (const h of batch) {
        if (cachedPrice(h) !== undefined) continue;
        // DENEME SINIRI: eskiden başarısız istek sınırsız kez kuyruğa geri konuyordu.
        // Kur bilinmiyorsa ya da Steam sürekli 429 dönüyorsa kuyruk hiç boşalmıyor,
        // arayüzdeki "Getiriliyor 1/9" sonsuza kadar kilitli kalıyordu.
        const n = (priceTries.get(h) || 0) + 1;
        priceTries.set(h, n);
        let p = null;
        try { p = await marketGate(() => engine.getPrice(h)); } catch (_) { p = null; }

        const geciciHata = p && (p.rateLimited || p.noCurrency);
        if (geciciHata && n < MAX_PRICE_TRIES) {
          priceQueue.push(h);          // sona at, sıradakiler ilerlesin
          hitLimit = !!p.rateLimited;
          if (p.noCurrency) log('warn', 'pazar kuru henuz okunmadi, fiyat ertelendi: ' + h);
          continue;
        }
        if (geciciHata) {
          // Pes et: null önbelleğe yazılır, arayüz "-" gösterir ve kuyruk ilerler.
          log('warn', `fiyat alinamadi (${n} deneme): ${h} - ${p.rateLimited ? 'istek limiti' : 'kur yok'}`);
          p = null;
        }
        priceTries.delete(h);
        priceCache.set(h, { price: p, ts: Date.now(), cur: currentPriceCurrency(), v: PRICE_CACHE_VERSION });
        sendRaw('price:one', { hashName: h, price: p });
      }
      savePriceCache();
      sendRaw('price:progress', { remaining: priceQueue.length, cooldown: priceQueue.length > 0 });
      if (priceQueue.length) await new Promise((r) => setTimeout(r, hitLimit ? BATCH_COOLDOWN_MS + 8000 : BATCH_COOLDOWN_MS));
    }
  } finally {
    priceRunning = false;
    priceTries.clear();
    sendRaw('price:progress', { remaining: 0, cooldown: false });
  }
}

// Renderer sends every marketable hash it cares about; we answer instantly from cache and
// queue whatever is missing for background fetching.
// sadeceOnbellek=true iken Steam'e HIC istek atilmaz, yalnizca diskteki onbellek okunur.
// Envanter sayfasi acilirken bunu kullanir: onbellek doluysa kullaniciya "fiyatlar
// getirilsin mi" diye sormaya gerek kalmaz, fiyatlar zaten aninda gelir.
ipcMain.handle('engine:pricesFor', (_e, arg) => {
  const hashNames = Array.isArray(arg) ? arg : (arg && arg.hashNames);
  const sadeceOnbellek = !Array.isArray(arg) && !!(arg && arg.sadeceOnbellek);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const out = {};
  const missing = [];
  [...new Set(hashNames || [])].forEach((h) => {
    if (!h) return;
    const c = cachedPrice(h);
    if (c !== undefined) out[h] = c;
    else if (!priceQueue.includes(h)) missing.push(h);
  });
  if (sadeceOnbellek) return { ok: true, prices: out, queued: 0, eksik: missing.length };
  priceQueue.push(...missing);
  if (priceQueue.length) runPriceQueue();
  return { ok: true, prices: out, queued: priceQueue.length };
});

// On-demand: only for the item currently open in the detail panel (see rate-limit note in engine).
ipcMain.handle('engine:priceHistory', async (_e, hashName) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  // Ayni pazar kapisindan gecer - fiyat kuyruguyla yarismaz (bkz marketGate)
  try { return { ok: true, history: await marketGate(() => engine.getPriceHistory(hashName)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Sipariş defteri: satıştaki ilanlar + alım talimatları. Pazar istek limitine dahil olduğu
// için yalnızca kullanıcının seçtiği tek öğe için, istek üzerine çağrılır.
ipcMain.handle('engine:itemOrders', async (_e, hashName) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, orders: await marketGate(() => engine.getItemOrders(hashName)) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('engine:achievements', async (_e, arg) => {
  const appid = (arg && typeof arg === 'object') ? arg.appid : arg;
  const taze = !!(arg && typeof arg === 'object' && arg.taze);
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  // taze=true: sema/deger onbellegini at, Steam'den yeniden oku. Toplu islem sonrasi
  // dogrulama bunu kullanir; onbellekten okumak bizim kendi tahminimizi geri verirdi.
  if (taze) { try { engine.invalidateStats(appid); } catch (_) {} }
  try { return { ok: true, data: await engine.getAchievements(appid) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Own Steam profile (avatar/name/level) via protocol.
ipcMain.handle('engine:profile', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const profil = await engine.getProfile();
    // Son bilinen profili hesabın kendi dosyasına yaz. Bir sonraki açılışta arayüz, Steam
    // oturumu kurulmayı beklemeden isim, avatar ve seviyeyi gösterebilsin diye: oturum
    // açma saniyeler sürüyor ve o süre boyunca ekranda tire duruyordu.
    const v = aktifHesapVerisi();
    v.profil = { ...(v.profil || {}), ...profil, ts: Date.now() };
    hesapVerisiYaz(activeSteamID);
    return { ok: true, profile: v.profil };
  } catch (e) { return { ok: false, error: e.message }; }
});
// Özel profil adresi (steamcommunity.com/id/<ad>). Profil çağrısından ayrı: protokolde
// yok, web sayfasından okunuyor ve kimse onun için isim/avatarı bekletmemeli.
ipcMain.handle('engine:vanity', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const vanity = await engine.getVanityURL();
    const v = aktifHesapVerisi();
    v.profil = { ...(v.profil || {}), vanity };
    hesapVerisiYaz(activeSteamID);
    return { ok: true, vanity };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---- persistent lifetime stats (survive app restarts) ----
const STATS_FILE = path.join(CONFIG_DIR, 'stats.json');
const DEFAULT_STATS = { totalRuntimeMs: 0, cardsDropped: 0, cardsSold: 0, boostRuntimeMs: 0, sessions: 0, since: Date.now() };
let lifeStats = { ...DEFAULT_STATS };
function loadStats() {
  const r = jsonOku(STATS_FILE);
  if (r.ok) {
    lifeStats = { ...DEFAULT_STATS, ...r.veri };
    if (r.yedekten) okumaHatalari.push({ ad: 'Istatistikler', kurtarildi: true });
  } else {
    lifeStats = { ...DEFAULT_STATS, since: Date.now() };
    if (r.bozuk) okumaHatalari.push({ ad: 'Istatistikler', kurtarildi: false });
  }
}
function saveStats() { jsonYaz(STATS_FILE, lifeStats, false); }
// Istatistikler de hesaba ozeldir: iki hesabin dusen karti tek sayacta toplanmamali.
function aktifIstatistik() {
  const v = aktifHesapVerisi();
  if (!v.stats) v.stats = { ...DEFAULT_STATS, since: Date.now() };
  return v.stats;
}
ipcMain.handle('stats:get', () => ({ ...aktifIstatistik() }));
ipcMain.handle('stats:add', (_e, patch) => {
  const st = aktifIstatistik();
  Object.keys(patch || {}).forEach((k) => { if (typeof st[k] === 'number') st[k] += (+patch[k] || 0); });
  hesapVerisiYaz(activeSteamID);
  return { ...st };
});
ipcMain.handle('stats:reset', () => {
  const v = aktifHesapVerisi();
  v.stats = { ...DEFAULT_STATS, since: Date.now() };
  hesapVerisiYaz(activeSteamID);
  return { ...v.stats };
});

// ================== KALICI DURUM DEPOSU (state.json) ==================
// Ayarlardan farklı olarak burada "hatırlanan" veriler durur: seçili oyunlar, son
// görüntülenen oyun, açılan başarım günlüğü. Her kayıt zaman damgalı; `dataRetentionDays`
// ayarındaki süreyi geçenler açılışta ve her yazımda temizlenir (0 = süresiz sakla).
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');
const DEFAULT_STATE = { entries: {}, achLog: [] };
let appState = { ...DEFAULT_STATE };

function retentionMs() {
  const d = +(settings && settings.dataRetentionDays);
  return Number.isFinite(d) && d > 0 ? d * 24 * 60 * 60 * 1000 : 0;   // 0 = süresiz
}
function pruneState() {
  const ttl = retentionMs();
  if (!ttl) return 0;
  const cut = Date.now() - ttl;
  let n = 0;
  Object.keys(appState.entries).forEach((k) => {
    const e = appState.entries[k];
    if (!e || !(e.ts > cut)) { delete appState.entries[k]; n++; }
  });
  const before = appState.achLog.length;
  appState.achLog = appState.achLog.filter((r) => r && r.ts > cut);
  return n + (before - appState.achLog.length);
}
function loadState() {
  const r = jsonOku(STATE_FILE);
  if (r.ok) {
    const raw = r.veri;
    appState = {
      entries: (raw && typeof raw.entries === 'object' && raw.entries) || {},
      achLog: Array.isArray(raw && raw.achLog) ? raw.achLog : [],
    };
    if (r.yedekten) okumaHatalari.push({ ad: 'Kayitli durum', kurtarildi: true });
  } else {
    appState = { entries: {}, achLog: [] };
    if (r.bozuk) okumaHatalari.push({ ad: 'Kayitli durum', kurtarildi: false });
  }
  const dropped = pruneState();
  if (dropped) log('info', 'saklama suresi dolan ' + dropped + ' kayit silindi');
}
function saveState() { jsonYaz(STATE_FILE, appState, false); }
// Saklama suresi dolmus kayitlari HESAP verisinden temizler.
function hesapKayitlariniBudama(v) {
  const ttl = retentionMs();
  if (!ttl || !v) return 0;
  const cut = Date.now() - ttl;
  let n = 0;
  Object.keys(v.entries || {}).forEach((k) => {
    const e = v.entries[k];
    if (!e || !(e.ts > cut)) { delete v.entries[k]; n++; }
  });
  const once = (v.achLog || []).length;
  v.achLog = (v.achLog || []).filter((r) => r && r.ts > cut);
  return n + (once - v.achLog.length);
}

// Bir anahtarı oku - süresi dolmuşsa undefined döner (çağıran taraf varsayılanına düşer).
// AKTIF HESABIN kendi deposundan okur; hesaplar birbirinin secimini gormez.
ipcMain.handle('state:get', (_e, key) => {
  const v = aktifHesapVerisi();
  hesapKayitlariniBudama(v);
  const e = v.entries[key];
  return { ok: true, value: e ? e.v : undefined, ts: e ? e.ts : null };
});
ipcMain.handle('state:set', (_e, { key, value }) => {
  const v = aktifHesapVerisi();
  v.entries[key] = { v: value, ts: Date.now() };
  hesapKayitlariniBudama(v); hesapVerisiYaz(activeSteamID);
  return { ok: true };
});
// Açılan/kilitlenen başarımlar: hangi oyunda ne zaman ne yaptığımızın kalıcı kaydı.
ipcMain.handle('state:achLog', (_e, entry) => {
  const v = aktifHesapVerisi();
  v.achLog.unshift({ ...entry, ts: Date.now() });
  if (v.achLog.length > 2000) v.achLog.length = 2000;
  hesapKayitlariniBudama(v); hesapVerisiYaz(activeSteamID);
  return { ok: true };
});
ipcMain.handle('state:achLogGet', (_e, appid) => {
  const v = aktifHesapVerisi();
  hesapKayitlariniBudama(v);
  const list = appid ? v.achLog.filter((r) => r.appid === appid) : v.achLog;
  return { ok: true, list };
});
ipcMain.handle('state:clear', () => {
  const v = aktifHesapVerisi();
  v.entries = {}; v.achLog = [];
  hesapVerisiYaz(activeSteamID);
  return { ok: true };
});

ipcMain.handle('engine:setAchievements', async (_e, { appid, changes }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, result: await engine.setAchievements(appid, changes) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('engine:sellItem', async (_e, { assetId, priceCents, amount }) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try { return { ok: true, result: await engine.sellItem(assetId, priceCents, amount || 1) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Dış bağlantılar - yalnızca beklenen alan adları (rastgele URL açılmasın).
ipcMain.on('open:external', (_e, url) => {
  if (typeof url !== 'string') return;
  if (/^https:\/\/steamcommunity\.com\//.test(url) || /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/?$/.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('engine:ownedGames', async () => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  try {
    const games = await engine.getOwnedGames();
    listeleriSakla('owned', games);
    return { ok: true, games };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Saat Yükseltici: simple simultaneous boost (no rotation) - play the whole selection at once
// for a fixed session length, unlike the card-farm's per-mode round robin.
let boostTimer = null;
let staggerTimers = [];
function clearStagger() { staggerTimers.forEach((t) => clearTimeout(t)); staggerTimers = []; }
// ================== SAAT EŞİTLEME ==================
// Amaç: seçili oyunların TOPLAM oynanma sürelerini aynı noktada buluşturmak.
// Steam eşzamanlı açık her oyuna süre işlediği için, en geride kalan grubu birlikte
// çalıştırmak onları eşit biçimde yukarı taşır. Bu yüzden kademeli ilerlenir:
//   ör. 8sa / 11sa / 101sa seçiliyse → önce yalnız 8sa'lık oyun 11sa'ya çıkarılır,
//   sonra ikisi birlikte 101sa'ya çıkarılır, ardından üçü birden devam eder.
// Hedef: 'highest' (seçililerin en yükseği) · 'manual' (elle girilen saat) ·
//        'library' (kütüphanedeki en yüksek süre).
let syncState = null;    // { steps:[{ids,fromMin,toMin}], i, startedAt, stepMs, targetMin }
let syncTimer = null;
function clearSync() { if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; } syncState = null; }

// ---- PARALEL ESITLEME (varsayilan) ----
// Kademeli yontem oyunlari yol boyunca esit tutar ama sabit bir hedefe (or. 400 saat)
// gitmek icin gereksiz yavastir: 12 farkli sureli oyunda 12 kademe olusur, ilk kademede
// tek oyun calisir. Steam ES ZAMANLI acik HER oyuna sure isledigi icin dogru yaklasim
// hepsini birlikte calistirip hedefe ulasani listeden dusurmektir. Toplam sure, en geride
// kalan oyunun hedefe ulasma suresine iner.
//
// Es zamanli limit asilirsa en cok suresi kalan oyunlar oncelik alir (LPT); boylece
// darbogaz olan oyunlar erken baslar ve toplam sure en aza yaklasir.
function esitlemeSimule(games, targetMin, limit) {
  const kalan = new Map();
  (games || []).forEach((g) => {
    const eksik = targetMin - (g.playtimeMin || 0);
    if (eksik > 0) kalan.set(g.appid, eksik * 60000);
  });
  const asamalar = [];
  let toplamMs = 0;
  const kap = Math.max(1, Math.min(32, limit || 32));
  let guvenlik = 0;
  while (kalan.size && guvenlik++ < 500) {
    const sirali = [...kalan.entries()].sort((a, b) => b[1] - a[1]);
    const aktif = sirali.slice(0, kap);
    const dt = Math.min(...aktif.map((x) => x[1]));
    asamalar.push({ ids: aktif.map((x) => x[0]), sureMs: dt, aktifSayi: aktif.length });
    aktif.forEach(([id, ms]) => {
      const yeni = ms - dt;
      if (yeni <= 0) kalan.delete(id); else kalan.set(id, yeni);
    });
    toplamMs += dt;
  }
  return { toplamMs, asamalar };
}

// Calisan paralel esitlemenin bir adimini planlar: gecen sureyi aktif oyunlardan duser,
// hedefe ulasanlari listeden cikarir, kalanlardan yeni aktif kumeyi kurar.
function esitlemePlanla() {
  if (!syncState || syncState.strateji !== 'parallel') return;
  if (!engineReady || !engine) { clearSync(); return; }
  const simdi = Date.now();
  const gecen = Math.max(0, simdi - syncState.sonHesap);
  syncState.sonHesap = simdi;

  // Gecen sure yalnizca ACIK olan oyunlara islenir - Steam de boyle sayar.
  if (gecen > 0) {
    syncState.aktif.forEach((id) => {
      const o = syncState.oyunlar.get(id);
      if (o && !o.bitti) { o.kalanMs = Math.max(0, o.kalanMs - gecen); o.gecenMs += gecen; }
    });
  }
  const yeniBitenler = [];
  syncState.oyunlar.forEach((o) => {
    if (!o.bitti && o.kalanMs <= 0) { o.bitti = true; yeniBitenler.push(o); }
  });
  yeniBitenler.forEach((o) => log('info', 'saat esitleme: ' + o.name + ' hedefe ulasti, listeden cikarildi'));

  const kalanlar = [...syncState.oyunlar.values()].filter((o) => !o.bitti);
  if (!kalanlar.length) {
    log('info', 'saat esitleme tamamlandi: tum oyunlar hedefe ulasti');
    engine.stop();
    syncEmit(false, { done: true });
    clearSync();
    sendRaw('boost:tick', { running: false });
    return;
  }
  // En cok suresi kalanlar once (darbogazi erken baslat)
  kalanlar.sort((a, b) => b.kalanMs - a.kalanMs);
  syncState.aktif = kalanlar.slice(0, syncState.limit).map((o) => o.appid);
  engine.play(syncState.aktif);

  const enKisa = Math.min(...syncState.aktif.map((id) => syncState.oyunlar.get(id).kalanMs));
  syncEmit(true);
  sendRaw('boost:tick', {
    running: true, appids: syncState.aktif, activeAppids: engine.playing,
    startedAt: syncState.baslangic, durationMs: 0, sync: true,
  });
  syncTimer = setTimeout(esitlemePlanla, Math.max(1000, enKisa));
}

// Arayuze giden oyun listesi: her oyunun GUNCEL toplam suresi ve hedefe kalani.
// (Madde 15: eskiden yalniz o oturumda gecen sure gorunuyordu.)
function esitlemeOyunlari() {
  if (!syncState || !syncState.oyunlar) return [];
  const aktifSet = new Set(syncState.aktif || []);
  return [...syncState.oyunlar.values()].map((o) => ({
    appid: o.appid,
    name: o.name,
    baslangicMin: o.baslangicMin,
    suankiMin: o.baslangicMin + Math.floor(o.gecenMs / 60000),
    kalanMs: o.kalanMs,
    aktif: aktifSet.has(o.appid),
    bitti: !!o.bitti,
  }));
}

function buildSyncSteps(games, targetMin) {
  // games: [{appid, playtimeMin}] - hedefi zaten geçmiş olanlar en baştan "hazır" sayılır
  const sorted = games.slice().sort((a, b) => (a.playtimeMin || 0) - (b.playtimeMin || 0));
  const levels = [...new Set(sorted.map((g) => g.playtimeMin || 0))].filter((v) => v < targetMin).sort((a, b) => a - b);
  const steps = [];
  for (let i = 0; i < levels.length; i++) {
    const from = levels[i];
    const to = Math.min(levels[i + 1] != null ? levels[i + 1] : targetMin, targetMin);
    if (to <= from) continue;
    const ids = sorted.filter((g) => (g.playtimeMin || 0) <= from).map((g) => g.appid);
    if (ids.length) steps.push({ ids, fromMin: from, toMin: to });
  }
  return steps;
}
function syncEmit(running, extra) {
  const paralel = syncState && syncState.strateji === 'parallel';
  if (paralel) {
    const oyunlar = esitlemeOyunlari();
    const kalanlar = oyunlar.filter((o) => !o.bitti);
    sendRaw('boost:sync', Object.assign({
      running,
      strateji: 'parallel',
      targetMin: syncState.targetMin,
      toplam: oyunlar.length,
      biten: oyunlar.length - kalanlar.length,
      aktifSayi: (syncState.aktif || []).length,
      ids: (syncState.aktif || []).slice(),
      oyunlar,
      // En geride kalan oyunun bitisi = tum isin bitisi (limit yeterliyse)
      kalanMs: kalanlar.length ? Math.max(...kalanlar.map((o) => o.kalanMs)) : 0,
      startedAt: syncState.baslangic,
    }, extra || {}));
    return;
  }
  sendRaw('boost:sync', Object.assign({
    running,
    strateji: 'staged',
    step: syncState ? syncState.i + 1 : 0,
    steps: syncState ? syncState.steps.length : 0,
    targetMin: syncState ? syncState.targetMin : 0,
    ids: syncState && syncState.steps[syncState.i] ? syncState.steps[syncState.i].ids : [],
    fromMin: syncState && syncState.steps[syncState.i] ? syncState.steps[syncState.i].fromMin : 0,
    toMin: syncState && syncState.steps[syncState.i] ? syncState.steps[syncState.i].toMin : 0,
    startedAt: syncState ? syncState.startedAt : 0,
    stepMs: syncState ? syncState.stepMs : 0,
  }, extra || {}));
}
function runSyncStep(allIds, afterDurationMs) {
  if (!syncState || !engineReady || !engine) return;
  const st = syncState.steps[syncState.i];
  if (!st) {
    // Tüm kademeler bitti → hepsi eşit, artık birlikte devam
    log('info', 'saat esitleme tamamlandi, tum oyunlar birlikte calisiyor');
    syncEmit(false, { done: true });
    clearSync();
    engine.play(allIds);
    sendRaw('boost:tick', { running: true, appids: allIds, activeAppids: engine.playing, startedAt: Date.now(), durationMs: afterDurationMs || 0 });
    if (afterDurationMs) boostTimer = setTimeout(() => { engine.stop(); sendRaw('boost:tick', { running: false }); }, afterDurationMs);
    return;
  }
  syncState.stepMs = (st.toMin - st.fromMin) * 60000;
  syncState.startedAt = Date.now();
  engine.play(st.ids);
  log('info', `saat esitleme adim ${syncState.i + 1}/${syncState.steps.length}: ${st.ids.length} oyun ${st.fromMin}dk -> ${st.toMin}dk`);
  syncEmit(true);
  sendRaw('boost:tick', { running: true, appids: st.ids, activeAppids: engine.playing, startedAt: syncState.startedAt, durationMs: syncState.stepMs, sync: true });
  syncTimer = setTimeout(() => { if (!syncState) return; syncState.i++; runSyncStep(allIds, afterDurationMs); }, syncState.stepMs);
}

ipcMain.on('engine:boostStart', (_e, { appids, durationMs, games }) => {
  if (!engineReady || !engine) return;
  if (settings.pauseFarmOnBoost && farm) farm.stop();
  if (boostTimer) { clearTimeout(boostTimer); boostTimer = null; }
  clearStagger();
  clearSync();

  // Eşitleme açıksa hedefe gore calis. Iki strateji var:
  //   parallel (varsayilan) - hepsi birlikte, hedefe ulasani listeden dus. En hizlisi.
  //   staged                - kademeli, oyunlari yol boyunca esit tutar. Yavas ama kademeli.
  if (settings.boostSync && Array.isArray(games) && games.length) {
    const mode = settings.boostSyncMode || 'highest';
    let targetMin;
    if (mode === 'manual') targetMin = Math.max(0, Math.round((+settings.boostSyncTargetHours || 0) * 60));
    else if (mode === 'library') targetMin = Math.max(0, +settings.boostSyncLibraryMaxMin || 0);
    else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

    const geride = games.filter((g) => (g.playtimeMin || 0) < targetMin);
    if (!geride.length) {
      log('info', 'saat esitleme: tum oyunlar zaten hedefte, dogrudan birlikte baslatiliyor');
    } else if ((settings.boostSyncStrategy || 'parallel') === 'staged') {
      const steps = buildSyncSteps(games, targetMin);
      if (steps.length) {
        syncState = { strateji: 'staged', steps, i: 0, startedAt: 0, stepMs: 0, targetMin };
        runSyncStep(games.map((g) => g.appid), settings.autoStopBoost === false ? 0 : (durationMs || 0));
        return;
      }
    } else {
      // Esitleme kendi suresini hesaplar; "yukseltme suresi" ayari burada gecersizdir.
      const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
      const oyunlar = new Map();
      geride.forEach((g) => oyunlar.set(g.appid, {
        appid: g.appid,
        name: g.name || ('App ' + g.appid),
        baslangicMin: g.playtimeMin || 0,
        kalanMs: (targetMin - (g.playtimeMin || 0)) * 60000,
        gecenMs: 0,
        bitti: false,
      }));
      syncState = {
        strateji: 'parallel', targetMin, limit, oyunlar,
        aktif: [], baslangic: Date.now(), sonHesap: Date.now(),
      };
      log('info', 'saat esitleme (paralel): ' + oyunlar.size + ' oyun, hedef ' + targetMin + ' dk, limit ' + limit);
      esitlemePlanla();
      return;
    }
  }

  let list = (appids || []).slice();
  // "Oyun sırasını karıştır": her oturumda farklı sırayla başlat (süre listeye dengeli dağılsın)
  if (settings.shuffleBoost) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  }
  const startedAt = Date.now();
  // "Süre dolunca otomatik durdur" kapalıysa süresiz çalışır
  const dur = settings.autoStopBoost === false ? 0 : (durationMs || 0);
  const stagger = Math.max(0, +settings.boostStagger || 0) * 1000;

  const emit = (running) => sendRaw('boost:tick', { running, appids: list, activeAppids: engine.playing, startedAt, durationMs: dur });
  if (!stagger || list.length <= 1) {
    engine.play(list);
    emit(true);
  } else {
    // "Oyun başlatma aralığı": hepsi birden değil, bu aralıkla sırayla eklenir
    log('info', `boost: ${list.length} oyun ${stagger}ms aralıkla başlatılıyor`);
    list.forEach((id, i) => {
      staggerTimers.push(setTimeout(() => {
        engine.play(list.slice(0, i + 1));
        emit(true);
      }, i * stagger));
    });
  }
  if (dur) boostTimer = setTimeout(() => { clearStagger(); engine.stop(); sendRaw('boost:tick', { running: false }); }, dur);
});
// ================== GERCEKCI MOD (G2) ==================
// Amac: tek bir oyunu acik tutup, secilen sure boyunca basarimlari GENELDEN NADIRE dogru,
// rastgele araliklarla acmak. Oyunu gercekten oynamis gibi bir iz birakir: once herkesin
// actigi basarimlar, sonra nadir olanlar; hepsi ayni anda degil, sureye yayilmis halde.
//
// Neden nadirlik sirasi: gercek oyuncuda da once giris seviyesi basarimlar acilir. Yuzlerce
// basarimi bir dakikada acmak profilde ve ucuncu parti sitelerde hemen goze carpar.
// G11: sayfa sablona gore yenilendi. Motor artik su fazlasini yapiyor:
//   - OYUN KUYRUGU: birden fazla oyun sirayla islenir ("Sirayi otomatik baslat" kapaliysa
//     ilk oyundan sonra durur).
//   - HEDEF SAYI: kullanici "su kadar basarim acilsin" diyebilir; kuyruk basa dogru kirpilir.
//   - DAGITIM MODELI: acilis zamanlari dogrusal, ustel ya da Pareto egrisine gore yerlesir.
//   - BASARIMI OLMAYAN OYUN: sadece saat topla / atla / sirayi durdur.
let gercekciDurum = null;

function gercekciTemizle() {
  if (gercekciDurum && gercekciDurum.timer) clearTimeout(gercekciDurum.timer);
  gercekciDurum = null;
}

// Modele gore i. acilisin oturum icindeki oransal zamani (0..1).
// linear : esit aralik
// exp    : basta sik, sonra seyrek (gercek oyuncu ilk saatlerde daha cok basarim alir)
// pareto : basarimlarin %80'i surenin %20'sinde - "hepsini bastan sifirla" gorunumu
function gercekciModelOran(p, model) {
  const q = Math.min(1, Math.max(0, p));
  if (model === 'exp') {
    const k = 2.5;
    return (1 - Math.exp(-k * q)) / (1 - Math.exp(-k));
  }
  if (model === 'pareto') {
    // 0.8 -> 0.2 eslemesi: q^(ln0.2/ln0.8)
    return Math.pow(q, Math.log(0.2) / Math.log(0.8));
  }
  return q;
}

// Kuyruga acilis zamanlarini yazar (oturum baslangicina gore ms).
function gercekciZamanlariYerlestir(kuyruk, sureMs, model) {
  const n = kuyruk.length;
  kuyruk.forEach((a, i) => {
    a.zaman = Math.round(sureMs * gercekciModelOran((i + 1) / n, model));
  });
  return kuyruk;
}

function gercekciAktif() { return gercekciDurum ? gercekciDurum.aktif : null; }

function gercekciBildir(ek) {
  const d = gercekciDurum;
  const a = gercekciAktif();
  sendRaw('gercekci:tick', Object.assign({
    calisiyor: !!d,
    appid: a ? a.appid : null,
    oyunAdi: a ? a.oyunAdi : null,
    // toplam/acilan TUM oturumu anlatir; kuyrukta birden fazla oyun olabilir.
    toplam: d ? d.toplamHedef : 0,
    acilan: d ? d.toplamAcilan : 0,
    hata: d ? d.toplamHata : 0,
    baslangic: d ? d.baslangic : 0,
    bitis: d ? d.bitis : 0,
    siradaki: a && a.kuyruk[a.indeks] ? a.kuyruk[a.indeks].name : null,
    siradakiPct: a && a.kuyruk[a.indeks] ? a.kuyruk[a.indeks].rarityPct : null,
    siradakiZaman: d ? d.siradakiZaman : 0,
    oyunSayisi: d ? d.oyunlar.length : 0,
    oyunIndeks: d ? d.oyunIndeks : 0,
    ortalamaAralikMs: d ? d.ortalamaAralikMs : 0,
  }, ek || {}));
}

// Bir sonraki acilisin ne zaman olacagini hesaplar. Modelin verdigi hedef zamana gore
// bekler; "Rastgele aralik" acikken uzerine +-%40 sapma binder - sabit ritim olusmasin.
function gercekciSonrakiGecikme(d) {
  const a = d.aktif;
  const kalanAdet = a.kuyruk.length - a.indeks;
  if (kalanAdet <= 0) return 0;
  const hedefZaman = a.baslangic + (a.kuyruk[a.indeks].zaman || 0);
  let g = hedefZaman - Date.now();
  if (!(g > 0)) {
    // Model zamani gecmis (baslangicta ya da gecikmede olur): kalan sureyi bol.
    g = Math.max(0, a.bitis - Date.now()) / kalanAdet;
  }
  if (d.secenekler.rastgeleAralik) {
    const sapma = g * 0.4;
    g = g - sapma + Math.random() * sapma * 2;
  }
  return Math.max(3000, Math.round(g));   // en az 3 saniye
}

async function gercekciAdim() {
  const d = gercekciDurum;
  if (!d || !engineReady || !engine) { gercekciTemizle(); gercekciBildir({ calisiyor: false }); return; }
  const a = d.aktif;
  const hedef = a.kuyruk[a.indeks];
  if (!hedef) {
    // Bu oyunun basarimlari bitti. Kuyrukta baska oyun varsa ona gecilir; yoksa "Basarimlar
    // bitince saati surdur" acikken oyun sure sonuna kadar acik kalir (saat kasmaya devam).
    log('info', 'gercekci mod: ' + a.oyunAdi + ' basarimlari bitti');
    gercekciBildir({ basarimlarBitti: true });
    if (gercekciSonrakiOyun()) return;
    if (d.secenekler.saatiSurdur && Date.now() < d.bitis) {
      d.timer = setTimeout(() => { if (gercekciDurum) gercekciBitir('sure doldu'); }, d.bitis - Date.now());
    } else {
      gercekciBitir(Date.now() >= d.bitis ? 'sure doldu' : 'tum basarimlar acildi');
    }
    return;
  }

  try {
    await engine.setAchievements(a.appid, [{ apiName: hedef.apiName, unlock: true }]);
    a.acilan++; d.toplamAcilan++;
    log('info', 'gercekci mod: acildi -> ' + hedef.name + ' (%' + (hedef.rarityPct != null ? hedef.rarityPct.toFixed(1) : '?') + ')');
    sendRaw('gercekci:acildi', {
      appid: a.appid, oyunAdi: a.oyunAdi, apiName: hedef.apiName,
      name: hedef.name, rarityPct: hedef.rarityPct,
    });
  } catch (e) {
    a.hata++; d.toplamHata++;
    log('warn', 'gercekci mod: acilamadi -> ' + hedef.name + ': ' + (e && e.message));
  }
  a.indeks++;

  if (Date.now() >= d.bitis && a.indeks < a.kuyruk.length) {
    // Sure doldu ama basarim kaldi - kalanlari zorlamiyoruz, kullaniciya soyluyoruz.
    gercekciBitir('sure doldu, ' + (a.kuyruk.length - a.indeks) + ' basarim acilmadi');
    return;
  }
  const gecikme = gercekciSonrakiGecikme(d);
  d.siradakiZaman = Date.now() + gecikme;
  gercekciBildir();
  d.timer = setTimeout(gercekciAdim, gecikme);
}

// Kuyruktaki bir sonraki oyuna gecer. Gecis yapildiysa true doner.
function gercekciSonrakiOyun() {
  const d = gercekciDurum;
  if (!d) return false;
  if (!d.secenekler.otoSira) return false;             // "Sirayi otomatik baslat" kapali
  while (d.oyunIndeks + 1 < d.oyunlar.length) {
    d.oyunIndeks++;
    const o = d.oyunlar[d.oyunIndeks];
    const kalanSure = d.bitis - Date.now();
    if (kalanSure <= 5000) return false;               // sure bitti, gecmenin anlami yok
    const hazir = d.hazirlanan[o.appid];
    if (!hazir) continue;
    if (!hazir.kuyruk.length) {
      // Bu oyunda acilacak basarim yok. Davranis kullanicinin secimine bagli.
      if (d.secenekler.basarimsizMod === 'skip') { log('info', 'gercekci mod: ' + o.name + ' atlandi (basarim yok)'); continue; }
      if (d.secenekler.basarimsizMod === 'stop') { gercekciBitir(o.name + ' basarimsiz, sira durduruldu'); return true; }
      // 'hours': oyunu acip kalan surenin payini saat olarak topla
    }
    // Kalan sureyi kalan oyunlara basarim sayisina gore boluyoruz.
    const kalanOyunlar = d.oyunlar.slice(d.oyunIndeks);
    const kalanToplamAdet = kalanOyunlar.reduce((t, x) => t + ((d.hazirlanan[x.appid] || { kuyruk: [] }).kuyruk.length || 1), 0);
    const buAdet = hazir.kuyruk.length || 1;
    const pay = Math.max(60000, Math.round(kalanSure * (buAdet / kalanToplamAdet)));
    const simdi = Date.now();
    d.aktif = {
      appid: o.appid, oyunAdi: o.name, kuyruk: gercekciZamanlariYerlestir(hazir.kuyruk, pay, d.secenekler.model),
      indeks: 0, acilan: 0, hata: 0, baslangic: simdi, bitis: simdi + pay,
    };
    try { engine.play([o.appid]); } catch (_) {}
    log('info', 'gercekci mod: sirada ' + o.name + ' (' + hazir.kuyruk.length + ' basarim, '
      + (pay / 60000).toFixed(0) + ' dk)');
    const gecikme = hazir.kuyruk.length ? gercekciSonrakiGecikme(d) : Math.max(0, d.aktif.bitis - Date.now());
    d.siradakiZaman = Date.now() + gecikme;
    gercekciBildir({ oyunDegisti: true });
    d.timer = setTimeout(hazir.kuyruk.length ? gercekciAdim : () => { if (gercekciDurum) gercekciAdim(); }, gecikme);
    return true;
  }
  return false;
}

function gercekciBitir(sebep) {
  const d = gercekciDurum;
  if (!d) return;
  const ozet = { acilan: d.toplamAcilan, hata: d.toplamHata, toplam: d.toplamHedef, sebep };
  try { if (engine) engine.stop(); } catch (_) {}
  gercekciTemizle();
  log('info', 'gercekci mod bitti: ' + sebep + ' (' + ozet.acilan + '/' + ozet.toplam + ')');
  sendRaw('gercekci:tick', Object.assign({ calisiyor: false, bitti: true }, ozet));
}

// Bir oyunun acilabilir basarim kuyrugunu hazirlar (siralama + kirpma).
// GENELDEN NADIRE: rarityPct BUYUK olan daha yaygin demek, once o acilir.
async function gercekciKuyrukHazirla(appid, secenekler) {
  const data = await engine.getAchievements(appid);
  const hepsi = (data && Array.isArray(data.achievements)) ? data.achievements : null;
  if (!hepsi) return { ok: false, error: 'Bu oyunun başarım şeması yok.', oyunAdi: null };
  // Kilitli + korumali olmayanlar. Korumalilar Steam tarafindan reddedilir (bkz G4).
  let uygun = hepsi.filter((a) => !a.achieved && !a.korumali);
  const korumali = hepsi.filter((a) => !a.achieved && a.korumali).length;
  // "Ultra Nadir Basarimlari Atla": %5'in altindakiler profilde en cok dikkat cekenler.
  let ultraAtlanan = 0;
  if (secenekler.ultraNadirAtla) {
    const once = uygun.length;
    uygun = uygun.filter((a) => !Number.isFinite(a.rarityPct) || a.rarityPct >= 5);
    ultraAtlanan = once - uygun.length;
  }
  uygun.sort((x, y) => {
    const a = Number.isFinite(x.rarityPct) ? x.rarityPct : -1;
    const b = Number.isFinite(y.rarityPct) ? y.rarityPct : -1;
    return b - a;
  });
  // Hedef sayi: bastan (en yaygin) itibaren kirpilir.
  const hedef = +secenekler.hedef || 0;
  const kirpilan = (hedef > 0 && hedef < uygun.length) ? uygun.slice(0, hedef) : uygun;
  return {
    ok: true,
    oyunAdi: data.gameName || ('App ' + appid),
    kuyruk: kirpilan.map((a) => ({ apiName: a.apiName, name: a.name, rarityPct: a.rarityPct })),
    uygunToplam: uygun.length,
    korumali,
    ultraAtlanan,
    toplamBasarim: hepsi.length,
    acilmis: hepsi.filter((a) => a.achieved).length,
  };
}

// Gelen seceneklerin tamamlanmis hali. Arayuz eksik gonderse de motor tutarli calisir.
function gercekciSecenekler(s) {
  const g = s || {};
  return {
    hedef: Math.max(0, +g.hedef || 0),                       // 0 = hepsi
    model: ['linear', 'exp', 'pareto'].includes(g.model) ? g.model : 'linear',
    rastgeleAralik: g.rastgeleAralik !== false,
    ultraNadirAtla: !!g.ultraNadirAtla,
    otoSira: g.otoSira !== false,
    saatiSurdur: g.saatiSurdur !== false,
    basarimsizMod: ['hours', 'skip', 'stop'].includes(g.basarimsizMod) ? g.basarimsizMod : 'hours',
  };
}

// Onizleme: kac basarim, hangi sirada, hangi dakikada acilacak.
// sureMs verilmezse saat alani kullanilir (eski cagri bicimi de calisir).
ipcMain.handle('gercekci:plan', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  const { appid, saat, sureMs } = arg || {};
  const sec = gercekciSecenekler(arg && arg.secenekler);
  const sure = Math.max(60000, +sureMs || (Math.max(1, +saat || 1) * 3600000));
  try {
    const h = await gercekciKuyrukHazirla(appid, sec);
    if (!h.ok) return h;
    gercekciZamanlariYerlestir(h.kuyruk, sure, sec.model);
    return {
      ok: true,
      appid: +appid,
      oyunAdi: h.oyunAdi,
      toplam: h.kuyruk.length,          // acilacak (hedefe gore kirpilmis)
      uygunToplam: h.uygunToplam,       // acilabilir olanlarin tamami
      toplamBasarim: h.toplamBasarim,
      acilmis: h.acilmis,
      korumali: h.korumali,
      ultraAtlanan: h.ultraAtlanan,
      sureMs: sure,
      model: sec.model,
      ortalamaAralikMs: h.kuyruk.length ? Math.round(sure / h.kuyruk.length) : 0,
      // Tam liste: arayuz "Acilma Sirasi" tablosunu bundan ciziyor.
      kuyruk: h.kuyruk.map((a) => ({ name: a.name, rarityPct: a.rarityPct, zaman: a.zaman })),
    };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Baslat. oyunlar: [appid, ...] - kuyruk. Tek oyun da ayni yoldan gecer.
ipcMain.handle('gercekci:start', async (_e, arg) => {
  if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
  if (gercekciDurum) return { ok: false, error: 'Zaten çalışıyor.' };
  const { appid, saat, sureMs } = arg || {};
  const sec = gercekciSecenekler(arg && arg.secenekler);
  const sure = Math.max(60000, +sureMs || (Math.max(1, +saat || 1) * 3600000));
  const liste = (Array.isArray(arg && arg.oyunlar) && arg.oyunlar.length)
    ? arg.oyunlar.map((x) => +x)
    : [+appid];
  if (!liste.length || !liste[0]) return { ok: false, error: 'Oyun seçilmedi.' };
  try {
    // Tum oyunlarin kuyruklari ONCE hazirlanir: sure paylasimi ancak hepsinin basarim
    // sayisi bilinince dogru yapilabilir, ve ilk oyun baslamadan hata gorulur.
    const hazirlanan = {};
    const oyunlar = [];
    for (const id of liste) {
      const h = await gercekciKuyrukHazirla(id, sec);
      if (!h.ok) {
        if (sec.basarimsizMod === 'stop') return { ok: false, error: h.error };
        continue;
      }
      hazirlanan[id] = h;
      oyunlar.push({ appid: id, name: h.oyunAdi });
    }
    if (!oyunlar.length) return { ok: false, error: 'Seçilen oyunların başarım şeması okunamadı.' };

    // Basarimi olmayanlar: 'skip' ise kuyruktan cikar, 'stop' ise ilkinde durur.
    const calisacak = oyunlar.filter((o) => hazirlanan[o.appid].kuyruk.length || sec.basarimsizMod !== 'skip');
    if (!calisacak.length) return { ok: false, error: 'Seçilen oyunlarda açılabilecek kilitli başarım yok.' };

    const toplamHedef = calisacak.reduce((t, o) => t + hazirlanan[o.appid].kuyruk.length, 0);
    const toplamAdet = calisacak.reduce((t, o) => t + (hazirlanan[o.appid].kuyruk.length || 1), 0);

    // Kart toplama ile ayni anda calisirsa ikisi de ayni oyun listesini yaziyor; carpismasin.
    if (settings.pauseFarmOnBoost && farm) farm.stop();

    const ilkOyun = calisacak[0];
    const ilkHazir = hazirlanan[ilkOyun.appid];
    const ilkPay = Math.max(60000, Math.round(sure * ((ilkHazir.kuyruk.length || 1) / toplamAdet)));
    const simdi = Date.now();
    engine.play([ilkOyun.appid]);
    gercekciDurum = {
      oyunlar: calisacak,
      oyunIndeks: 0,
      hazirlanan,
      secenekler: sec,
      toplamHedef,
      toplamAcilan: 0,
      toplamHata: 0,
      ortalamaAralikMs: toplamHedef ? Math.round(sure / toplamHedef) : 0,
      baslangic: simdi,
      bitis: simdi + sure,
      timer: null,
      siradakiZaman: 0,
      aktif: {
        appid: ilkOyun.appid, oyunAdi: ilkOyun.name,
        kuyruk: gercekciZamanlariYerlestir(ilkHazir.kuyruk, ilkPay, sec.model),
        indeks: 0, acilan: 0, hata: 0,
        baslangic: simdi, bitis: simdi + ilkPay,
      },
    };
    log('info', 'gercekci mod basladi: ' + calisacak.length + ' oyun, ' + toplamHedef + ' basarim, '
      + (sure / 3600000).toFixed(2) + ' saat, model=' + sec.model);
    // Ilk acilis hemen degil - oyunu acar acmaz basarim gelmesi gercekci degil.
    const ilk = ilkHazir.kuyruk.length
      ? gercekciSonrakiGecikme(gercekciDurum)
      : Math.max(0, gercekciDurum.aktif.bitis - Date.now());
    gercekciDurum.siradakiZaman = Date.now() + ilk;
    gercekciBildir();
    gercekciDurum.timer = setTimeout(gercekciAdim, ilk);
    return { ok: true, toplam: toplamHedef, oyunSayisi: calisacak.length, oyunAdi: ilkOyun.name };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.on('gercekci:stop', () => { if (gercekciDurum) gercekciBitir('kullanici durdurdu'); });

ipcMain.on('engine:boostStop', () => {
  if (boostTimer) { clearTimeout(boostTimer); boostTimer = null; }
  clearStagger();
  clearSync();
  syncEmit(false);
  if (engineReady && engine) engine.stop();
  sendRaw('boost:tick', { running: false });
});

// Eşitleme önizlemesi: başlatmadan önce kaç kademe ve ne kadar süre gerektiğini gösterir.
ipcMain.handle('engine:boostSyncPlan', async (_e, { games, mode, targetHours }) => {
  if (!Array.isArray(games) || !games.length) return { ok: false, error: 'Oyun seçilmedi.' };
  let targetMin;
  if (mode === 'manual') targetMin = Math.max(0, Math.round((+targetHours || 0) * 60));
  else if (mode === 'library') {
    if (!engineReady || !engine) return { ok: false, error: 'Bağlı değil.' };
    try {
      const owned = await engine.getOwnedGames();
      targetMin = owned.reduce((m, g) => Math.max(m, g.playtimeForever || 0), 0);
      settings.boostSyncLibraryMaxMin = targetMin; saveSettings();
    } catch (e) { return { ok: false, error: e.message }; }
  } else targetMin = Math.max(...games.map((g) => g.playtimeMin || 0));

  const geride = games.filter((g) => (g.playtimeMin || 0) < targetMin);
  const strateji = settings.boostSyncStrategy || 'parallel';

  if (strateji === 'parallel') {
    const limit = Math.max(1, Math.min(32, +settings.boostMaxGames || 32));
    const sim = esitlemeSimule(games, targetMin, limit);
    // Hangi oyunun ne kadar sonra bitecegini de ver: kullanici plani gorup onaylayacak.
    const bitisler = [];
    const kalan = new Map(geride.map((g) => [g.appid, (targetMin - (g.playtimeMin || 0)) * 60000]));
    let t = 0;
    for (const as of sim.asamalar) {
      t += as.sureMs;
      as.ids.forEach((id) => {
        const k = kalan.get(id);
        if (k == null) return;
        const yeni = k - as.sureMs;
        if (yeni <= 0) { bitisler.push({ appid: id, bitisMs: t }); kalan.delete(id); }
        else kalan.set(id, yeni);
      });
    }
    return {
      ok: true, strateji: 'parallel', targetMin, totalMs: sim.toplamMs, limit,
      behind: geride.length,
      asamaSayisi: sim.asamalar.length,
      ilkAktif: Math.min(geride.length, limit),
      bitisler: bitisler.sort((a, b) => a.bitisMs - b.bitisMs).map((x) => {
        const g = games.find((y) => y.appid === x.appid);
        return { appid: x.appid, name: (g && g.name) || ('App ' + x.appid), bitisMs: x.bitisMs };
      }),
      steps: [],
    };
  }

  const steps = buildSyncSteps(games, targetMin);
  const totalMs = steps.reduce((s, st) => s + (st.toMin - st.fromMin) * 60000, 0);
  return {
    ok: true, strateji: 'staged', targetMin, totalMs,
    steps: steps.map((st) => ({ count: st.ids.length, ids: st.ids, fromMin: st.fromMin, toMin: st.toMin })),
    behind: geride.length,
  };
});

// Saat Yükseltici, "eş zamanlı" kapalı: one game at a time, `durationMs` each, loops until stopped
// (reuses FarmController's 'sequential' mode; a separate instance so it never collides with the
// Kart Düşür farm running on the same engine).
ipcMain.on('engine:boostStartSeq', (_e, { games, durationMs, loop }) => {
  if (!engineReady || !engine) return;
  if (settings.pauseFarmOnBoost && farm) farm.stop();
  const s = slotOf(activeSteamID);
  if (!s.farmSaat) s.farmSaat = new FarmController(s.engine, (_ev, data) => {
    if (activeSteamID === s.engine.steamID) sendRaw('saatFarm:tick', data);
    sendRaw('accounts:activity', { steamID: s.engine.steamID, running: !!(data && data.running) });
  });
  farmSaat = s.farmSaat;
  farmSaat.start('sequential', games || [], durationMs, { loop: loop !== false });
});
ipcMain.on('engine:boostStopSeq', () => { if (farmSaat) farmSaat.stop(); });

ipcMain.on('engine:startFarm', (_e, { mode, games, durationMs }) => {
  if (!engineReady || !engine) return;
  const s = slotOf(activeSteamID);
  if (!s.farm) s.farm = new FarmController(s.engine, accountEmit(activeSteamID));
  farm = s.farm;
  // Kart eşiği KALDIRILDI: kartı kalan her oyun kuyruğa girer. Eşik, tek kartı kalan
  // oyunları sessizce atlayıp "neden düşmüyor" sorusuna yol açıyordu.
  const list = games || [];
  log('info', `farm start: mode=${mode} oyun=${list.length} süre=${durationMs}ms`);
  farm.start(mode, list, durationMs, {
    autoNext: settings.autoNextGame !== false,
    maxGames: settings.cardMaxGames,
    fastMinPlaytimeMin: settings.fastMinPlaytimeMin,
    fastRotateMinSec: settings.fastRotateMinSec,
    fastRotateMaxSec: settings.fastRotateMaxSec,
  });
});
ipcMain.on('engine:stopFarm', () => { if (farm) farm.stop(); });
ipcMain.handle('engine:playing', () => (engineReady && engine) ? engine.playing : []);

// ---- Oturum zaman aşımı (Ayarlar > Gizlilik) ----
// Renderer her kullanıcı etkileşiminde 'session:activity' yollar. Belirlenen süre boyunca
// etkileşim olmazsa Steam oturumu kapatılır. Çalışan kart toplama/saat yükseltme sayacı
// SIFIRLAMAZ - ayarın açıklaması "işlem yapılmazsa" diyor, arka plan işi değil kullanıcı işi.
let idleTimer = null;
function armIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const mins = parseInt(settings.sessionTimeout, 10);
  if (!mins || isNaN(mins)) return;             // 'never'
  idleTimer = setTimeout(() => {
    log('warn', `Oturum ${mins} dk işlemsiz kaldı - TÜM hesaplar kapatılıyor`);
    disconnectAll();
    try { fs.unlinkSync(path.join(CONFIG_DIR, 'session.json')); } catch (_) {}
    if (win) {
      win.setMinimumSize(900, 700);
      centerDefaultSize();
      win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
    }
  }, mins * 60 * 1000);
}
ipcMain.on('session:activity', armIdleTimer);

// ---- settings IPC ----
// Renderer'a giden ayar nesnesi. accountCurrency = hesabın Steam cüzdan kuru (fiyatlar bu
// kurda çekilir ve TAM OLARAK bu kurda gösterilir; çeviri yapılmaz).
function publicSettings() {
  // getPrice ile aynı kaynak - arayüzün gösterdiği simge, tutarın gerçekten çekildiği kur.
  const accountCurrency = currentPriceCurrency();
  return {
    ...settings,
    persona: engine && engine.persona,
    steamID: engine && engine.steamID,
    accountCurrency,
  };
}
// Arayuze giden ayarlar: genel ayarlarin uzerine AKTIF HESABIN kendi degerleri bindirilir.
// Boylece renderer tarafi hicbir sey bilmeden dogru hesabin verisini gorur.
function hesapAyarlariEklenmis(temel) {
  const v = aktifHesapVerisi();
  const cikti = { ...temel };
  HESAP_AYAR_ANAHTARLARI.forEach((k) => { if (k in v) cikti[k] = v[k]; });
  return cikti;
}
ipcMain.handle('settings:get', () => {
  return hesapAyarlariEklenmis(publicSettings());
});
ipcMain.handle('settings:set', (_e, patch) => {
  const gelen = { ...(patch || {}) };
  // Hesaba ozel anahtarlari ayikla, genel ayar dosyasina yazma
  let hesabaYazildi = false;
  HESAP_AYAR_ANAHTARLARI.forEach((k) => {
    if (k in gelen) {
      aktifHesapVerisi()[k] = gelen[k];
      delete gelen[k];
      hesabaYazildi = true;
    }
  });
  if (hesabaYazildi) hesapVerisiYaz(activeSteamID);
  if (Object.keys(gelen).length) { settings = { ...settings, ...gelen }; saveSettings(); applySettings(); }
  // Saklama süresi kısaldıysa fazlalık kayıtlar hemen silinir (açılışı beklemez).
  if ('dataRetentionDays' in gelen) {
    const n = hesapKayitlariniBudama(aktifHesapVerisi());
    if (n) { hesapVerisiYaz(activeSteamID); log('info', 'saklama suresi degisti, ' + n + ' kayit silindi'); }
  }
  return hesapAyarlariEklenmis(publicSettings());
});
ipcMain.handle('settings:reset', () => { settings = { ...DEFAULT_SETTINGS }; saveSettings(); applySettings(); return settings; });
ipcMain.handle('settings:clearPriceCache', () => {
  ['', '.bak', '.bozuk', '.tmp'].forEach((ek) => {
    try { fs.unlinkSync(PRICE_FILE + ek); } catch (_) {}
    try { fs.unlinkSync(HISTORY_FILE + ek); } catch (_) {}
  });
  priceCache = new Map();
  historyCache = new Map();
  return { ok: true };
});
ipcMain.handle('settings:openConfigFolder', () => { shell.openPath(DATA_ROOT); return { ok: true }; });
// ---- Yedekleme (dışa/içe aktarma) ----
// Yedeğe SADECE tercihler + kalıcı istatistikler girer. Oturum anahtarı, refresh token,
// kayıtlı hesaplar ve o anki oturuma ait alanlar (persona/steamID/kur) BİLEREK dışarıda
// bırakılır - yedek dosyası başkasının eline geçerse hesaba erişim vermemeli.
const EXPORT_SKIP = ['persona', 'steamID', 'accountCurrency'];
function exportPayload() {
  const out = {};
  Object.keys(settings).forEach((k) => { if (!EXPORT_SKIP.includes(k)) out[k] = settings[k]; });
  return {
    app: 'SteamEdge',
    format: 1,
    version: app.getVersion(),
    exportedAt: new Date().toISOString(),
    settings: out,
    stats: lifeStats,
  };
}
ipcMain.handle('settings:export', async () => {
  saveSettings();
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: 'SteamEdge ayarlarını dışa aktar',
    defaultPath: path.join(app.getPath('documents'), 'steamedge-ayarlar-' + stamp + '.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(r.filePath, JSON.stringify(exportPayload(), null, 2), 'utf8');
    log('info', 'ayarlar disa aktarildi: ' + r.filePath);
    return { ok: true, file: r.filePath };
  } catch (e) {
    log('warn', 'disa aktarma hatasi: ' + (e && e.message));
    return { ok: false, error: (e && e.message) || 'dosya yazılamadı' };
  }
});
ipcMain.handle('settings:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'SteamEdge yedeği seç',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, canceled: true };
  const file = r.filePaths[0];
  try {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Hem yeni ({app,settings,stats}) hem de eski (düz ayar nesnesi) biçimi kabul edilir.
    const incoming = (obj && obj.settings && typeof obj.settings === 'object') ? obj.settings : obj;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { ok: false, error: 'Dosya bir SteamEdge yedeği değil.' };
    }
    // Bilinmeyen anahtarlar atılır; oturuma ait alanlar korunur (yedekten gelmez).
    const clean = {};
    Object.keys(DEFAULT_SETTINGS).forEach((k) => {
      if (EXPORT_SKIP.includes(k)) return;
      if (Object.prototype.hasOwnProperty.call(incoming, k)) clean[k] = incoming[k];
    });
    const applied = Object.keys(clean).length;
    if (!applied) return { ok: false, error: 'Dosyada tanınan hiçbir ayar yok.' };
    const keep = {}; EXPORT_SKIP.forEach((k) => { if (k in settings) keep[k] = settings[k]; });
    settings = { ...DEFAULT_SETTINGS, ...clean, ...keep };
    saveSettings(); applySettings();
    if (obj && obj.stats && typeof obj.stats === 'object') {
      lifeStats = { ...DEFAULT_STATS, ...obj.stats };
      saveStats();
    }
    log('info', 'ayarlar ice aktarildi (' + applied + ' anahtar): ' + file);
    return { ok: true, applied, settings: publicSettings(), file };
  } catch (e) {
    return { ok: false, error: 'Dosya okunamadı: ' + ((e && e.message) || '') };
  }
});
// Tehlikeli bölge: tüm yerel veriyi (oturum, hesaplar, ayarlar, istatistik, fiyat önbelleği) siler
// ve giriş ekranına döner - renderer zaten güçlü bir confirm() gösterdikten sonra çağırır.
ipcMain.handle('settings:wipeAll', () => {
  disconnectAll();
  // Ayarlar tarafi
  ['session.json', 'web-session.json', 'accounts.json', 'settings.json', 'stats.json', 'state.json'].forEach((f) => {
    ['', '.bak', '.bozuk', '.tmp'].forEach((ek) => {
      try { fs.unlinkSync(path.join(CONFIG_DIR, f + ek)); } catch (_) {}
    });
  });
  // Hesaba ozel depolarin tamami
  try { fs.rmSync(HESAP_DIZINI, { recursive: true, force: true }); } catch (_) {}
  hesapVerileri.clear(); bozukDosyalar.clear();
  // Onbellek tarafi (prices.json ve kayit dosyasi artik cache/ altinda)
  ['prices.json', 'history.json', 'steamedge.log', 'steamedge.log.1'].forEach((f) => {
    try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (_) {}
  });
  settings = { ...DEFAULT_SETTINGS }; lifeStats = { ...DEFAULT_STATS, since: Date.now() }; priceCache = new Map();
  activeSteamID = null;
  authSlots.clear(); addingAccountMode = false;
  if (win) {
    win.setMinimumSize(900, 700);
    centerDefaultSize();
    win.loadFile(path.join(__dirname, 'src', 'login', 'login.html'));
  }
  return { ok: true };
});

// ---- guncelleme kontrolu (issue #6) ----
// Kural: hicbir sey indirilmez, hicbir sey kendiliginden calistirilmaz. Uygulama sadece
// GitHub'daki en yeni yayin numarasini okur ve kuruluyla karsilastirir. Gerisi kullanicinin.
//
// Ne zaman bakilir:
//   1. Uygulama acilisinda BIR KEZ. Yeni surum varsa ekrana pencere gelir; SURUM GUNCELSE
//      hicbir sey gosterilmez. Zamanlayici, gunluk tekrar, arka planda dolasan kontrol yok.
//   2. Kullanici ust cubuktaki dugmeye basarsa. Orada sonuc her turlu soylenir - guncel
//      oldugunu ogrenmek de bir cevaptir, dugmenin oluye donmemesi gerekir.
let guncellemeSonDurum = null;    // son kontrolun sonucu
let guncellemeCalisiyor = false;

async function guncellemeKontrolEt(elle) {
  // Ayni anda iki kontrol calismasin: acilis kontrolu surerken kullanici dugmeye basabilir.
  if (guncellemeCalisiyor) return guncellemeSonDurum || { ok: false, hata: 'Kontrol zaten suruyor.' };
  guncellemeCalisiyor = true;
  try {
    const sonuc = await guncelleme.kontrolEt(app.getVersion());
    guncellemeSonDurum = { ...sonuc, ts: Date.now(), elle: !!elle };
    log(sonuc.ok ? 'info' : 'warn', 'guncelleme kontrolu: '
      + (sonuc.ok ? (sonuc.guncelMi ? 'guncel (' + sonuc.kurulu + ')' : 'yeni surum ' + sonuc.son) : sonuc.hata));
    sendRaw('guncelleme:durum', guncellemeSonDurum);
    return guncellemeSonDurum;
  } finally {
    guncellemeCalisiyor = false;
  }
}

// Acilistaki tek kontrol. Pencere ve Steam oturumu rahat etsin diye 15 saniye gecikmeli.
function acilisGuncellemeKontrolu() {
  setTimeout(() => { guncellemeKontrolEt(false).catch(() => {}); }, 15000);
}

ipcMain.handle('guncelleme:kontrol', () => guncellemeKontrolEt(true));
ipcMain.handle('guncelleme:sonDurum', () => guncellemeSonDurum);
// Uygulamanin gercek bellek kullanimi, surec surec. "Ne kadar RAM yiyor" sorusunun
// cevabi tahmin olmasin diye Ayarlar > Gelismis bunu canli gosteriyor. Electron cok
// surecli calisir: Gorev Yoneticisi'nde bes ayri SteamEdge satiri gorunur, kullanicinin
// tek tek toplamasi gerekiyordu.
ipcMain.handle('app:bellek', () => {
  const olcumler = app.getAppMetrics();
  const surecler = olcumler.map((p) => ({
    tur: p.type,
    kb: (p.memory && (p.memory.privateBytes || p.memory.workingSetSize)) || 0,
  }));
  return {
    toplamKb: surecler.reduce((t, p) => t + p.kb, 0),
    surecler,
    gpuAcik: settings.hwAccel !== false,
  };
});
ipcMain.handle('app:bilgi', () => ({
  surum: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  paketli: app.isPackaged,
}));

app.on('before-quit', () => { isQuitting = true; });
// Acilista bir veri dosyasi okunamadiysa kullaniciya SOYLE. Eskiden sessizce varsayilana
// donuluyor, ardindan ilk degisiklik saglam dosyanin uzerine yaziyordu; kullanici ayarlarinin
// neden gittigini hic ogrenemiyordu.
function okumaHatalariniBildir() {
  if (!okumaHatalari.length) return;
  const kurtarilan = okumaHatalari.filter((h) => h.kurtarildi).map((h) => h.ad);
  const kayip = okumaHatalari.filter((h) => !h.kurtarildi).map((h) => h.ad);
  let govde = '';
  if (kurtarilan.length) {
    govde += 'Su dosyalar bozuktu ve yedekten kurtarildi:\n  ' + kurtarilan.join('\n  ') + '\n\n';
  }
  if (kayip.length) {
    govde += 'Su dosyalar okunamadi ve yedegi de yoktu:\n  ' + kayip.join('\n  ')
      + '\n\nBu veriler varsayilana donduruldu. Bozuk dosyalar ".bozuk" uzantisiyla '
      + 'settings klasorunde duruyor, uzerlerine YAZILMADI.\n\n'
      + 'Genellikle sebebi, uygulama kayit yaparken bilgisayarin kapanmasidir.';
  }
  try {
    dialog.showMessageBox(win || null, {
      type: kayip.length ? 'warning' : 'info',
      title: 'SteamEdge - veri dosyalari',
      message: kayip.length ? 'Bazi ayarlar okunamadi' : 'Ayarlar yedekten kurtarildi',
      detail: govde.trim(),
      buttons: ['Tamam'],
    });
  } catch (_) {}
  okumaHatalari.length = 0;
}

// Steam oturumunu ARAYUZU BEKLEMEDEN ac.
// Eskiden logon, arayuz yuklenip ilk sayfa `engine:connect` cagirinca basliyordu: once
// HTML/CSS/JS yukleniyor, sonra bagalanti kuruluyordu ve iki sure ust uste biniyordu.
// Oysa oturum bilgisi diskte hazir. Burada baslatinca baglanti, arayuz cizilirken yol
// aliyor; sayfalar `engine:connect` cagirdiginda ya hazir oluyor ya da devam eden ayni
// islemi paylasiyorlar (connectAccount > s.connecting).
function erkenBaglan() {
  const sess = hasSession();
  if (!sess) return;
  if (!activeSteamID) { activeSteamID = sess.steamID; hesapVerisiGecisi(); }
  const entry = loadAccounts().find((a) => a.steamID === activeSteamID) || sess;
  connectAccount(entry)
    .then((r) => {
      syncActive();
      log(r && r.ok ? 'info' : 'warn', 'acilis baglantisi: ' + (r && r.ok ? 'kuruldu' : (r && r.error)));
    })
    .catch((e) => log('warn', 'acilis baglantisi basarisiz: ' + (e && e.message)));
}

// Karisik kurulum tespiti.
// Kullanicilar yeni surumu ESKI klasorun uzerine cikariyor. Uygulama o sirada acikken
// bazi dosyalar kilitli oluyor ve arsivden cikarilmiyor: exe yeni, locales/ ve app.asar
// eski kaliyor. Electron surumu uyusmayan locale dosyasiyla acilmayi reddediyor ve
// HICBIR MESAJ VERMEDEN cikiyor. Disaridan "uygulama calismiyor" gibi gorunuyor.
// Yaninda duran `version` dosyasi Electron'un gercek surumunu tasiyor; calisan surumle
// karsilastirip uyusmazsa sebebini soyluyoruz.
function kurulumTutarliMi() {
  if (!app.isPackaged) return { ok: true };
  try {
    const yol = path.join(path.dirname(app.getPath('exe')), 'version');
    if (!fs.existsSync(yol)) return { ok: true };          // dosya yoksa yorum yapma
    const dosyaSurum = fs.readFileSync(yol, 'utf8').trim();
    const calisan = process.versions.electron;
    if (dosyaSurum && calisan && dosyaSurum !== calisan) {
      return { ok: false, dosyaSurum, calisan };
    }
  } catch (_) {}
  return { ok: true };
}

app.whenReady().then(() => {
  const kurulum = kurulumTutarliMi();
  if (!kurulum.ok) {
    log('error', 'karisik kurulum: version=' + kurulum.dosyaSurum + ' calisan=' + kurulum.calisan);
    try {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'SteamEdge - kurulum bozuk',
        message: 'Bu klasorde iki farkli surumun dosyalari karisik',
        detail: 'Klasordeki bazi dosyalar eski surumden kalmis '
          + '(beklenen ' + kurulum.calisan + ', bulunan ' + kurulum.dosyaSurum + ').\n\n'
          + 'Bu genellikle yeni surum ESKI klasorun uzerine cikarildiginda ve uygulama o sirada '
          + 'acik oldugunda olur: acik program bazi dosyalari kilitler, arsiv onlari atlar.\n\n'
          + 'Cozum:\n'
          + '  1. SteamEdge tamamen kapali olsun.\n'
          + '  2. Arsivi BOS ve YENI bir klasore cikar.\n'
          + '  3. Eski klasordeki settings klasorunu yeni klasore kopyala.\n\n'
          + 'settings klasoru ayarlarini ve Steam oturumunu tasir; kopyalarsan hicbir sey kaybetmezsin.',
        buttons: ['Tamam'],
      });
    } catch (_) {}
    app.quit();
    return;
  }
  loadSettings(); applySettings(); loadStats(); loadState(); loadPriceCache(); loadHistoryCache();
  createWindow(); ensureTray();
  setTimeout(okumaHatalariniBildir, 1200);
  acilisGuncellemeKontrolu();
  erkenBaglan();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !settings.closeToTray) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
