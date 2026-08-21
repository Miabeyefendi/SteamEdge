#!/usr/bin/env node
/**
 * SteamEdge paketleyici.
 *
 * Ne yapar:
 *   1. @electron/packager ile calistirilabilir bir dagitim uretir (exe + Electron runtime).
 *   2. Uygulama kodunu app.asar icine koyar - Release klasorunde acik kaynak dosya kalmaz.
 *   3. Ciktiyi "SteamEdge-v<surum>-win-x64" klasorune tasir, yaninda bos settings/ + cache/ acar.
 *   4. Kullanici icin README.txt ve o surume ait CHANGELOG.md birakir.
 *
 * Neden electron-builder degil: kurulum (installer) uretmiyoruz. Kullanici .zip'i acip
 * dogrudan calistiracak; tasinabilir bir klasor dagitimi bu is icin daha uygun ve
 * paketleyici cok daha az bagimlilik cekiyor.
 *
 * Kullanim:  npm run build
 */
const fs = require('fs');
const path = require('path');
// @electron/packager 20 adlandirilmis disa aktarim kullaniyor (varsayilan degil).
const { packager } = require('@electron/packager');

const KOK = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(KOK, 'package.json'), 'utf8'));
const CIKTI_KOK = path.resolve(KOK, '..');                       // "App - SteamEdge"
// Klasor adi dogrudan arsiv adi olacak sekilde: SteamEdge-v1.0.7-win-x64
// Boylece sag tik > arsivle dendiginde dosya adini elle duzeltmeye gerek kalmiyor.
const PAKET_ADI = 'SteamEdge-v' + pkg.version + '-win-x64';
const HEDEF = path.join(CIKTI_KOK, PAKET_ADI);
const GECICI = path.join(KOK, 'build', '.out');

const arg = (ad, varsayilan) => {
  const b = process.argv.find((a) => a.startsWith('--' + ad + '='));
  return b ? b.split('=')[1] : varsayilan;
};

// Pakete GIRMEYECEKLER. node_modules'un tamami gerekli degil; sadece calisma zamani
// bagimliliklari asar'a girer, gelistirme araclari disarida kalir.
const IGNORE = [
  /^\/build($|\/)/,
  /^\/\.git($|\/)/,
  /^\/\.vscode($|\/)/,
  /^\/settings($|\/)/,
  /^\/cache($|\/)/,
  /^\/node_modules\/\.bin($|\/)/,
  /^\/node_modules\/electron($|\/)/,
  /^\/node_modules\/@electron\/packager($|\/)/,
  /^\/node_modules\/@electron\/get($|\/)/,
  /^\/node_modules\/@electron\/asar($|\/)/,
  // Depo dosyalari: uygulamanin calismasi icin gerekmez, exe'ye girmesin.
  /^\/docs($|\/)/,
  /^\/\.github($|\/)/,
  /^\/\.(gitignore|gitattributes|editorconfig)$/,
  /\.md$/i,
  /package-lock\.json$/,
];

async function main() {
  const platform = arg('platform', process.platform);
  const arch = arg('arch', process.arch);

  console.log('SteamEdge ' + pkg.version + ' paketleniyor...');
  console.log('  platform : ' + platform + ' / ' + arch);
  console.log('  kaynak   : ' + KOK);
  console.log('  hedef    : ' + HEDEF);

  // Onceki cikti kalintilarini temizle
  fs.rmSync(GECICI, { recursive: true, force: true });

  // Windows exe ikonu .ico ister (build/make-icon.js uretiyor); yoksa png'ye duser.
  const ico = path.join(KOK, 'src', 'assets', 'icon.ico');
  const ikon = fs.existsSync(ico) ? ico : path.join(KOK, 'src', 'assets', 'icon.png');
  const yollar = await packager({
    dir: KOK,
    out: GECICI,
    platform,
    arch,
    asar: true,                       // kaynak kod app.asar icine girer
    overwrite: true,
    prune: true,                      // devDependencies pakete girmez
    ignore: IGNORE,
    name: pkg.productName,
    appVersion: pkg.version,
    appCopyright: 'Copyright (C) 2026 Mustafa Ihsan Albayrak (Miabeyefendi). AGPL-3.0-or-later.',
    icon: fs.existsSync(ikon) ? ikon : undefined,
    win32metadata: {
      CompanyName: 'Miabeyefendi',
      ProductName: pkg.productName,
      FileDescription: pkg.description,
      OriginalFilename: pkg.productName + '.exe',
    },
  });

  const uretilen = yollar[0];
  console.log('  paketlendi: ' + uretilen);

  // Hedefi bosalt ve ciktiyi tasi
  fs.rmSync(HEDEF, { recursive: true, force: true });
  fs.mkdirSync(HEDEF, { recursive: true });
  for (const ad of fs.readdirSync(uretilen)) {
    fs.renameSync(path.join(uretilen, ad), path.join(HEDEF, ad));
  }
  fs.rmSync(GECICI, { recursive: true, force: true });

  // Kullanici verisi klasorleri: uygulama ilk aciliste zaten olusturuyor, ama .zip'i acan
  // kisi yapinin ne oldugunu hemen gorsun diye bos olarak birakiyoruz.
  for (const d of ['settings', 'cache']) {
    fs.mkdirSync(path.join(HEDEF, d), { recursive: true });
  }
  const kirpilan = localeKirp(HEDEF);
  yaz(HEDEF);
  changelogYaz(HEDEF);

  const boyut = klasorBoyutu(HEDEF);
  console.log('\nBITTI.');
  console.log('  klasor : ' + HEDEF);
  console.log('  boyut  : ' + (boyut / 1024 / 1024).toFixed(1) + ' MB'
    + (kirpilan.kazanc ? '  (locale kirpmasiyla ' + (kirpilan.kazanc / 1024 / 1024).toFixed(1) + ' MB az)' : ''));
  console.log('  exe    : ' + pkg.productName + '.exe');
}

// Electron 55 dil dosyasi birakiyor (locales/*.pak, ~44 MB). Bunlar Chromium'un KENDI
// arayuz metinleri: sag tik menusu, dosya secme penceresi, form hata baloncuklari. Bizim
// sozlugumuzle (src/main/js/i18n.js) ilgisi yok. Uygulama bes dil sunuyor, dolayisiyla
// geri kalan elli dosya indirilip diskte duran olu agirlik.
//
// en-US LISTEDEN CIKARILAMAZ: Chromium istenen dili bulamazsa ona duser, yoksa acilista
// "Unable to load locale pak" ile olur.
const TUTULAN_DILLER = [
  'en-US',    // yedek - her zaman kalir
  'tr',       // arayuz dilleri (i18n.js ile ayni kume)
  'de',
  'es',
  'zh-TW',
  'ru',
];
function localeKirp(hedef) {
  const dizin = path.join(hedef, 'locales');
  if (!fs.existsSync(dizin)) return { silinen: 0, kazanc: 0 };
  const tut = new Set(TUTULAN_DILLER.map((d) => d + '.pak'));
  let silinen = 0;
  let kazanc = 0;
  for (const ad of fs.readdirSync(dizin)) {
    if (tut.has(ad)) continue;
    const p = path.join(dizin, ad);
    kazanc += fs.statSync(p).size;
    fs.unlinkSync(p);
    silinen++;
  }
  const kalan = fs.readdirSync(dizin);
  // Yedek dil gitmisse paket calismaz. Sessizce sevk etmektense derlemeyi durdur.
  if (!kalan.includes('en-US.pak')) {
    throw new Error('locales/en-US.pak silinmis - paket acilmaz, kirpma listesi bozuk');
  }
  console.log('  locale   : ' + silinen + ' dosya silindi (' + (kazanc / 1024 / 1024).toFixed(1)
    + ' MB), kalan: ' + kalan.join(', '));
  return { silinen, kazanc };
}

function klasorBoyutu(d) {
  let t = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    t += e.isDirectory() ? klasorBoyutu(p) : fs.statSync(p).size;
  }
  return t;
}

// Release klasorune kullanici notu (kod bilmeyen kisi icin, tek sayfa).
// O surume ait degisiklik notunu klasore koyar.
// Kaynak: build/changelog/<surum>.md . Dosya yoksa uyarir ama derlemeyi durdurmaz -
// surum notu yazmayi unutmak derlemeyi engellememeli, sadece gorunur olmali.
function changelogYaz(hedef) {
  const kaynak = path.join(__dirname, 'changelog', pkg.version + '.md');
  if (!fs.existsSync(kaynak)) {
    console.log('  UYARI: build/changelog/' + pkg.version + '.md yok, CHANGELOG.md yazilmadi');
    return;
  }
  fs.copyFileSync(kaynak, path.join(hedef, 'CHANGELOG.md'));
  console.log('  changelog: ' + pkg.version + '.md -> CHANGELOG.md');
}

function yaz(hedef) {
  fs.writeFileSync(path.join(hedef, 'README.txt'),
`SteamEdge ${pkg.version}
================================================================

HIZLI BASLANGIC
  1. SteamEdge.exe dosyasina cift tikla.
  2. QR kodu Steam mobil uygulamasiyla okut ya da kullanici adi + sifre gir.
  3. Kart Dusur sekmesinde "Baslat" de. Hepsi bu.

KLASOR YAPISI
  SteamEdge.exe    Uygulama.
  settings/        Ayarlarin, kayitli hesaplarin, oturumun ve istatistiklerin.
  cache/           Fiyat onbellegi ve kayit dosyasi. Silmek zararsizdir.
  resources/       Uygulamanin kendi dosyalari. Elleme.

TASINABILIR
  Bu klasoru USB'ye kopyalayabilir, baska bir bilgisayarda calistirabilirsin.
  Ayarlarin ve oturumun seninle gelir; kayit defterine hicbir sey yazilmaz.

KALDIRMA
  Klasoru sil. Baska bir iz birakmaz.

GUVENLIK
  Sifren hicbir yere kaydedilmez. Steam'in verdigi yenileme anahtari
  settings/ altinda tutulur; bu klasoru kimseyle paylasma.

Lisans: AGPL-3.0-or-later.  Kaynak kod ve dokumantasyon:
https://github.com/Miabeyefendi/steamedge
`, 'utf8');
}

main().catch((e) => { console.error('\nPAKETLEME BASARISIZ:', e && e.message ? e.message : e); process.exit(1); });
