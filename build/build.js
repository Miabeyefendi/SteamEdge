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

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT_ROOT = path.join(ROOT, 'releases');                    // standard tree: releases/
// The folder name is the archive name as it is: SteamEdge-v1.0.7-win-x64
// So when you right click > archive there is no need to fix the file name by hand.
const PACKAGE_NAME = 'SteamEdge-v' + pkg.version + '-win-x64';
const TARGET = path.join(OUT_ROOT, PACKAGE_NAME);
const TEMP_DIR = path.join(ROOT, 'build', '.out');

const arg = (name, defaultValue) => {
  const b = process.argv.find((a) => a.startsWith('--' + name + '='));
  return b ? b.split('=')[1] : defaultValue;
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

  console.log('SteamEdge ' + pkg.version + ' packaging...');
  console.log('  platform : ' + platform + ' / ' + arch);
  console.log('  source   : ' + ROOT);
  console.log('  target   : ' + TARGET);

  // The dictionaries are verified before packaging: there is no point continuing the build if one is missing.
  dictionaryCheck();

  // Clean up leftovers of the previous output
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  // The Windows exe icon needs .ico (build/make-icon.js produces it); if missing it falls back to png.
  const ico = path.join(ROOT, 'src', 'assets', 'icon.ico');
  const icon = fs.existsSync(ico) ? ico : path.join(ROOT, 'src', 'assets', 'icon.png');
  const paths = await packager({
    dir: ROOT,
    out: TEMP_DIR,
    platform,
    arch,
    asar: true,                       // the source code goes into app.asar
    overwrite: true,
    prune: true,                      // devDependencies do not go into the package
    ignore: IGNORE,
    name: pkg.productName,
    appVersion: pkg.version,
    appCopyright: 'Copyright (C) 2026 Mustafa Ihsan Albayrak (Miabeyefendi). AGPL-3.0-or-later.',
    icon: fs.existsSync(icon) ? icon : undefined,
    win32metadata: {
      CompanyName: 'Miabeyefendi',
      ProductName: pkg.productName,
      FileDescription: pkg.description,
      OriginalFilename: pkg.productName + '.exe',
    },
  });

  const produced = paths[0];
  console.log('  packaged : ' + produced);

  // Empty the target and move the output
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.mkdirSync(TARGET, { recursive: true });
  for (const name of fs.readdirSync(produced)) {
    fs.renameSync(path.join(produced, name), path.join(TARGET, name));
  }
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  // User data folders: the app creates them on first launch anyway, but we leave them empty so that
  // whoever extracts the archive sees the structure right away.
  for (const d of ['settings', 'cache']) {
    fs.mkdirSync(path.join(TARGET, d), { recursive: true });
  }
  const trimmed = trimLocales(TARGET);
  print(TARGET);
  writeChangelog(TARGET);

  const size = folderSize(TARGET);
  console.log('\nDONE.');
  console.log('  folder : ' + TARGET);
  console.log('  size   : ' + (size / 1024 / 1024).toFixed(1) + ' MB'
    + (trimmed.kazanc ? '  (with locale trimming ' + (trimmed.kazanc / 1024 / 1024).toFixed(1) + ' MB az)' : ''));
  console.log('  exe    : ' + pkg.productName + '.exe');
}

// Electron leaves locale files (locales/*.pak, ~44 MB). These are Chromium's OWN interface
// texts: the right-click menu, the file picker, form error bubbles. They have nothing to do with our
// dictionary (src/main/js/i18n.js). The app offers five languages, so the
// remaining fifty files are dead weight that gets downloaded and sits on disk.
//
// en-US CANNOT BE REMOVED from the list: Chromium falls back to it when it cannot find the requested language, otherwise it dies at startup
// with "Unable to load locale pak".
const KEPT_LOCALES = [
  'en-US',    // fallback - always stays
  'tr',       // interface languages (the same set as i18n.js)
  'de',
  'es',
  'zh-TW',
  'ru',
];
function trimLocales(target) {
  const dir = path.join(target, 'locales');
  if (!fs.existsSync(dir)) return { silinen: 0, kazanc: 0 };
  const keep = new Set(KEPT_LOCALES.map((d) => d + '.pak'));
  let removed = 0;
  let gain = 0;
  for (const name of fs.readdirSync(dir)) {
    if (keep.has(name)) continue;
    const p = path.join(dir, name);
    gain += fs.statSync(p).size;
    fs.unlinkSync(p);
    removed++;
  }
  const remaining = fs.readdirSync(dir);
  // If the fallback language is gone the package does not work. Stop the build instead of silently shipping it.
  if (!remaining.includes('en-US.pak')) {
    throw new Error('locales/en-US.pak was deleted - the package would not start, the trim list is broken');
  }
  console.log('  locale   : ' + removed + ' files deleted (' + (gain / 1024 / 1024).toFixed(1)
    + ' MB), remaining: ' + remaining.join(', '));
  return { silinen: removed, kazanc: gain };
}

function folderSize(d) {
  let t = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    t += e.isDirectory() ? folderSize(p) : fs.statSync(p).size;
  }
  return t;
}

// Since 1.1.8 the dictionaries are in src/main/js/lang/<code>.json and since they pass through the IGNORE
// list they get in silently. What gets in silently can also silently drop out:
// if a file does not enter the package the app gives no error, the interface opens in Turkish and
// nobody notices. So the build first verifies that all of them are present in the source.
function dictionaryCheck() {
  const dir = path.join(ROOT, 'src', 'main', 'js', 'lang');
  const pending = ['en', 'de', 'es', 'zh', 'ru'];
  const missing = [];
  let total = 0;
  pending.forEach((d) => {
    const p = path.join(dir, d + '.json');
    if (!fs.existsSync(p)) { missing.push(d + '.json'); return; }
    try { total += Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))).length; }
    catch (e) { missing.push(d + '.json (broken JSON)'); }
  });
  if (missing.length) throw new Error('dictionary missing: ' + missing.join(', '));
  console.log('  dictionary: ' + pending.length + ' languages, ' + total + ' entries');
}

// User note in the release folder (for someone who does not know code, a single page).
// Puts the change note of that version into the folder.
// Source: build/changelog/<version>.md . If the file is missing it warns but does not stop the build -
// forgetting to write the release note should not block the build, it should just be visible.
function writeChangelog(target) {
  const source = path.join(__dirname, 'changelog', pkg.version + '.md');
  if (!fs.existsSync(source)) {
    console.log('  WARNING: build/changelog/' + pkg.version + '.md is missing, CHANGELOG.md was not written');
    return;
  }
  fs.copyFileSync(source, path.join(target, 'CHANGELOG.md'));
  console.log('  changelog: ' + pkg.version + '.md -> CHANGELOG.md');
}

function print(target) {
  fs.writeFileSync(path.join(target, 'README.txt'),
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

main().catch((e) => { console.error('\nPACKAGING FAILED:', e && e.message ? e.message : e); process.exit(1); });
