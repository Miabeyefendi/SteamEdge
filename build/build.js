#!/usr/bin/env node
/**
 *  * SteamEdge packager.
 *
 *  * What it does:
 *  *   1. Produces a runnable distribution (exe + Electron runtime) with @electron/packager.
 *  *   2. Puts the application code into app.asar - no open source files are left in the release folder.
 *  *   3. Moves the output to the "SteamEdge-v<version>-win-x64" folder and creates empty settings/ + cache/ next to it.
 *  *   4. Leaves a README.txt for the user and the CHANGELOG.md for that version.
 *
 *  * Why not electron-builder: we do not produce an installer. The user extracts the archive and
 *  * runs it directly; a portable folder distribution fits this better and
 *  * the packager pulls in far fewer dependencies.
 *
 *  * Usage:  npm run build
 */
const fs = require('fs');
const path = require('path');
// @electron/packager 20 uses named exports (not a default).
const { packager } = require('@electron/packager');

const KOK = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(KOK, 'package.json'), 'utf8'));
const CIKTI_KOK = path.join(KOK, 'releases');                    // standard tree: releases/
// The folder name is the archive name as it is: SteamEdge-v1.0.7-win-x64
// So when you right click > archive there is no need to fix the file name by hand.
const PAKET_ADI = 'SteamEdge-v' + pkg.version + '-win-x64';
const HEDEF = path.join(CIKTI_KOK, PAKET_ADI);
const GECICI = path.join(KOK, 'build', '.out');

const arg = (ad, varsayilan) => {
  const b = process.argv.find((a) => a.startsWith('--' + ad + '='));
  return b ? b.split('=')[1] : varsayilan;
};

// What does NOT go into the package. Not all of node_modules is needed; only the runtime
// dependencies go into the asar, development tools stay out.
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
  // Repository files: not needed for the app to run, keep them out of the exe.
  /^\/docs($|\/)/,
  /^\/\.github($|\/)/,
  // Standard tree folders. archive/ holds the round backups, which contain
  // built old versions; if it were not excluded the asar would grow to gigabytes.
  /^\/archive($|\/)/,
  /^\/releases($|\/)/,
  /^\/design($|\/)/,
  /^\/tests($|\/)/,
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

  // The dictionaries are verified before packaging: there is no point continuing the build if one is missing.
  sozlukKontrol();

  // Clean up leftovers of the previous output
  fs.rmSync(GECICI, { recursive: true, force: true });

  // The Windows exe icon needs .ico (build/make-icon.js produces it); if missing it falls back to png.
  const ico = path.join(KOK, 'src', 'assets', 'icon.ico');
  const ikon = fs.existsSync(ico) ? ico : path.join(KOK, 'src', 'assets', 'icon.png');
  const yollar = await packager({
    dir: KOK,
    out: GECICI,
    platform,
    arch,
    asar: true,                       // the source code goes into app.asar
    overwrite: true,
    prune: true,                      // devDependencies do not go into the package
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

  // Empty the target and move the output
  fs.rmSync(HEDEF, { recursive: true, force: true });
  fs.mkdirSync(HEDEF, { recursive: true });
  for (const ad of fs.readdirSync(uretilen)) {
    fs.renameSync(path.join(uretilen, ad), path.join(HEDEF, ad));
  }
  fs.rmSync(GECICI, { recursive: true, force: true });

  // User data folders: the app creates them on first launch anyway, but we leave them empty so that
  // whoever extracts the archive sees the structure right away.
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

// Electron leaves locale files (locales/*.pak, ~44 MB). These are Chromium's OWN interface
// texts: the right-click menu, the file picker, form error bubbles. They have nothing to do with our
// dictionary (src/main/js/i18n.js). The app offers five languages, so the
// remaining fifty files are dead weight that gets downloaded and sits on disk.
//
// en-US CANNOT BE REMOVED from the list: Chromium falls back to it when it cannot find the requested language, otherwise it dies at startup
// with "Unable to load locale pak".
const TUTULAN_DILLER = [
  'en-US',    // fallback - always stays
  'tr',       // interface languages (the same set as i18n.js)
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
  // If the fallback language is gone the package does not work. Stop the build instead of silently shipping it.
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

// Since 1.1.8 the dictionaries are in src/main/js/lang/<code>.json and since they pass through the IGNORE
// list they get in silently. What gets in silently can also silently drop out:
// if a file does not enter the package the app gives no error, the interface opens in Turkish and
// nobody notices. So the build first verifies that all of them are present in the source.
function sozlukKontrol() {
  const dizin = path.join(KOK, 'src', 'main', 'js', 'lang');
  const bekleyen = ['en', 'de', 'es', 'zh', 'ru'];
  const eksik = [];
  let toplam = 0;
  bekleyen.forEach((d) => {
    const p = path.join(dizin, d + '.json');
    if (!fs.existsSync(p)) { eksik.push(d + '.json'); return; }
    try { toplam += Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))).length; }
    catch (e) { eksik.push(d + '.json (bozuk JSON)'); }
  });
  if (eksik.length) throw new Error('sozluk eksik: ' + eksik.join(', '));
  console.log('  sozluk   : ' + bekleyen.length + ' dil, ' + toplam + ' giris');
}

// User note in the release folder (for someone who does not know code, a single page).
// Puts the change note of that version into the folder.
// Source: build/changelog/<version>.md . If the file is missing it warns but does not stop the build -
// forgetting to write the release note should not block the build, it should just be visible.
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
