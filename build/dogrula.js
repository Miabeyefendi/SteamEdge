#!/usr/bin/env node
/**
 *  * SteamEdge verification suite.  Usage: npm run dogrula
 *
 *  * Independent checks that run before the build. No test framework: each check reads the
 *  * source and PROVES something or says on which line it broke.
 *
 *  *   1. Syntax           - can every .js file be parsed
 *  *   2. Missing id       - is the id the JS looks for present in the HTML
 *  *   3. Duplicate id     - is the same id defined twice
 *  *   4. Tag balance      - is there an unopened/unclosed <div> in the page fragments
 *  *   5. IPC match        - is the channel preload calls defined in main.js
 *  *   6. Long dash        - an em/en dash must not be found anywhere
 *  *   7. Author trace     - has a tool/person name other than the author leaked into the source
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const KOK = path.join(__dirname, '..');
let hataSayisi = 0;
let uyariSayisi = 0;

const hata = (m) => { hataSayisi++; console.log('  HATA   ' + m); };
const uyari = (m) => { uyariSayisi++; console.log('  UYARI  ' + m); };
const bolum = (m) => console.log('\n' + m);

function dosyalar(dizin, uzanti, cikti = []) {
  for (const e of fs.readdirSync(dizin, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.out'
        || e.name === 'settings' || e.name === 'cache'
        || e.name === 'archive' || e.name === 'releases') continue;
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) dosyalar(p, uzanti, cikti);
    else if (e.name.toLowerCase().endsWith(uzanti)) cikti.push(p);
  }
  return cikti;
}
const gorece = (p) => path.relative(KOK, p).replace(/\\/g, '/');
// This file itself is not scanned: it carries the patterns it looks for, it would
// catch itself on every run.
const kendisi = (p) => gorece(p) === 'build/dogrula.js';
const oku = (p) => fs.readFileSync(p, 'utf8');
const satirNo = (metin, konum) => metin.slice(0, konum).split('\n').length;

// ---- 1. Syntax ----
bolum('1. Sozdizimi');
const jsDosyalar = dosyalar(KOK, '.js');
jsDosyalar.forEach((f) => {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { hata(gorece(f) + ' ayristirilamadi\n' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')); }
});
console.log('  ' + jsDosyalar.length + ' dosya kontrol edildi');

// ---- 2 + 3. id checks ----
bolum('2. Kayip id');
const htmlDosyalar = dosyalar(KOK, '.html');
const tumIdler = new Set();
// The duplicate check is per DOCUMENT: the login screen and the main window are separate documents, and it is correct for both to have
// the window button ids (min/max/close). A clash is only a problem in the same document.
// Since the main window injects the page fragments into main.html they count as a single document.
const belgeIdleri = new Map();
const belgeAdi = (p) => (gorece(p).startsWith('src/main/') ? 'ana pencere' : gorece(p));
htmlDosyalar.forEach((f) => {
  const m = oku(f);
  const belge = belgeAdi(f);
  if (!belgeIdleri.has(belge)) belgeIdleri.set(belge, new Map());
  const sayac = belgeIdleri.get(belge);
  for (const eslesme of m.matchAll(/\bid="([^"]+)"/g)) {
    tumIdler.add(eslesme[1]);
    sayac.set(eslesme[1], (sayac.get(eslesme[1]) || 0) + 1);
  }
});
// Ids the JS produces itself are counted too: id="X" inside innerHTML or el.id = 'X'
const arayuzJs = dosyalar(path.join(KOK, 'src', 'main', 'js'), '.js');
arayuzJs.forEach((f) => {
  const m = oku(f);
  for (const e of m.matchAll(/\bid="([^"'{}$]+)"/g)) tumIdler.add(e[1]);
  for (const e of m.matchAll(/\.id\s*=\s*'([^']+)'/g)) tumIdler.add(e[1]);
  for (const e of m.matchAll(/\.id\s*=\s*"([^"]+)"/g)) tumIdler.add(e[1]);
});
let aranan = 0;
arayuzJs.concat(dosyalar(path.join(KOK, 'src', 'login'), '.html')).forEach((f) => {
  const m = oku(f);
  for (const e of m.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
    aranan++;
    if (!tumIdler.has(e[1])) hata(gorece(f) + ':' + satirNo(m, e.index) + ' id yok: ' + e[1]);
  }
});
console.log('  ' + aranan + ' getElementById cagrisi, ' + tumIdler.size + ' tanimli id');

bolum('3. Tekrarlanan id');
let tekrar = 0;
belgeIdleri.forEach((sayac, belge) => {
  sayac.forEach((n, id) => { if (n > 1) { tekrar++; hata(belge + ': id ' + n + ' kez tanimli: ' + id); } });
});
if (!tekrar) console.log('  tekrar yok');

// ---- 4. Tag balance ----
bolum('4. Etiket dengesi (div)');
htmlDosyalar.forEach((f) => {
  // Comments are not counted. The counter once gave a false alarm because of comment blindness: a comment describing a layout
  // bug contained "<div>" so the file looked unbalanced.
  // A block wrapped in a comment would produce a false alarm the same way.
  const m = oku(f).replace(/<!--[\s\S]*?-->/g, '');
  const ac = (m.match(/<div\b/g) || []).length;
  const kapa = (m.match(/<\/div>/g) || []).length;
  if (ac !== kapa) hata(gorece(f) + ' <div> ' + ac + ' / </div> ' + kapa);
});
console.log('  ' + htmlDosyalar.length + ' sayfa kontrol edildi');

// ---- 5. IPC match ----
bolum('5. IPC eslesmesi');
const preload = oku(path.join(KOK, 'preload.js'));
const anaSurec = oku(path.join(KOK, 'main.js'));
const tanimli = new Set();
for (const e of anaSurec.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)) tanimli.add(e[1]);
// Events that go from the main process to the interface (ipcRenderer.on) are sent from main.js with sendRaw/send.
const gonderilen = new Set();
for (const e of anaSurec.matchAll(/send(?:Raw)?\(\s*'([^']+)'/g)) gonderilen.add(e[1]);
// Per-account jobs send their events with hesapYayini(...)('channel', ...) or yay('channel', ...);
// FarmController sends its own 'farm:tick' event with emit. Those count as sent too.
for (const e of anaSurec.matchAll(/(?:hesapYayini\([^)]*\)|yay)\(\s*'([^']+)'/g)) gonderilen.add(e[1]);
for (const e of anaSurec.matchAll(/IS_KANALLARI\s*=\s*\[([^\]]*)\]/g)) {
  for (const k of e[1].matchAll(/'([^']+)'/g)) gonderilen.add(k[1]);
}
for (const e of oku(path.join(KOK, 'src', 'core', 'farmController.js')).matchAll(/this\.emit\(\s*'([^']+)'/g)) gonderilen.add(e[1]);
let cagri = 0;
for (const e of preload.matchAll(/ipcRenderer\.(invoke|send)\(\s*'([^']+)'/g)) {
  cagri++;
  if (!tanimli.has(e[2])) hata('preload.js:' + satirNo(preload, e.index) + ' main.js karsiligi yok: ' + e[2]);
}
for (const e of preload.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)) {
  cagri++;
  if (!gonderilen.has(e[1])) uyari('preload.js:' + satirNo(preload, e.index) + ' main.js bu olayi hic gondermiyor: ' + e[1]);
}
console.log('  ' + cagri + ' kanal, main.js tarafinda ' + tanimli.size + ' tanim');

// ---- 6. Long dash ----
bolum('6. Uzun cizgi (em/en dash)');
let cizgi = 0;
// Dictionaries (.json) and documents (.md) are scanned too: seven long dashes stayed unnoticed in the Russian dictionary
// because of this.
dosyalar(KOK, '.js').concat(dosyalar(KOK, '.html'), dosyalar(KOK, '.css'), dosyalar(KOK, '.json'), dosyalar(KOK, '.md')).forEach((f) => {
  if (kendisi(f)) return;
  const m = oku(f);
  for (const e of m.matchAll(/[–—]/g)) { cizgi++; hata(gorece(f) + ':' + satirNo(m, e.index) + ' uzun cizgi'); }
});
if (!cizgi) console.log('  temiz');

// ---- 7. Author trace ----
bolum('7. Yapimci izi');
const YASAK = /claude|anthropic|copilot|chatgpt|openai|gemini|cursor\.so|scratchpad/i;
let iz = 0;
dosyalar(KOK, '.js').concat(dosyalar(KOK, '.html'), dosyalar(KOK, '.css'), dosyalar(KOK, '.json')).forEach((f) => {
  if (kendisi(f) || gorece(f).startsWith('package-lock')) return;
  const m = oku(f);
  m.split('\n').forEach((satir, i) => {
    if (YASAK.test(satir)) { iz++; hata(gorece(f) + ':' + (i + 1) + ' ' + satir.trim().slice(0, 100)); }
  });
});
// Local path leak: the distributed source must not contain the development machine's drive path.
dosyalar(path.join(KOK, 'src'), '.js').forEach((f) => {
  const m = oku(f);
  for (const e of m.matchAll(/[A-Z]:\\(?:Coding|Users)\\/g)) { iz++; hata(gorece(f) + ':' + satirNo(m, e.index) + ' yerel yol'); }
});
if (!iz) console.log('  temiz');

// ---- 8. Dead setting key ----
// A key that sits in the default settings but is read nowhere. "ignoreUpdates" was found this way
// in 1.1.2: it had a button in the interface and no counterpart in the engine, the user turned it on and
// off and nothing happened. Hard to notice by hand, easy to scan for.
bolum('8. Olu ayar anahtari');
{
  const ana = oku(path.join(KOK, 'main.js'));
  const blok = ana.match(/const VARSAYILAN_AYARLAR\s*=\s*\{([\s\S]*?)\n\};/)
            || ana.match(/const DEFAULT_SETTINGS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!blok) {
    console.log('  varsayilan ayar blogu bulunamadi, atlandi');
  } else {
    const anahtarlar = [...blok[1].matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
    // Everywhere in the whole source where the key appears (except the defaults block)
    const govde = dosyalar(KOK, '.js')
      .concat(dosyalar(KOK, '.html'))
      .filter((f) => !kendisi(f) && !gorece(f).startsWith('package-lock'))
      .map((f) => (gorece(f) === 'main.js' ? ana.replace(blok[0], '') : oku(f)))
      .join('\n');
    const olu = anahtarlar.filter((k) => {
      const re = new RegExp('[."\'\\[]' + k + '\\b');
      return !re.test(govde);
    });
    if (olu.length) {
      olu.forEach((k) => uyari('okunmayan ayar: ' + k));
      console.log('  ' + anahtarlar.length + ' anahtar, ' + olu.length + ' tanesi hicbir yerde okunmuyor');
    } else {
      console.log('  ' + anahtarlar.length + ' anahtarin hepsi kullaniliyor');
    }
  }
}

// ---- 9. Unanswered IPC channel ----
// If preload.js opens a channel but main.js does not answer it, the call is silently rejected and the
// interface says "could not be fetched". The reverse happens too: a handler sits in main and nobody calls it.
bolum('9. Karsiliksiz IPC kanali');
{
  const on = oku(path.join(KOK, 'preload.js'));
  const ana = oku(path.join(KOK, 'main.js'));
  const cagrilan = new Set([...on.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g)].map((m) => m[1]));
  const dinlenen = new Set([...on.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)].map((m) => m[1]));
  const karsilanan = new Set([...ana.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)].map((m) => m[1]));
  const yollanan = new Set([...ana.matchAll(/sendRaw\(\s*'([^']+)'|webContents\.send\(\s*'([^']+)'/g)]
    .map((m) => m[1] || m[2]).filter(Boolean));

  const eksikHandler = [...cagrilan].filter((k) => !karsilanan.has(k));
  eksikHandler.forEach((k) => hata('preload cagiriyor, main karsilamiyor: ' + k));

  // For listened events: a dead listener if main never sends it
  const olmayanOlay = [...dinlenen].filter((k) => !yollanan.has(k) && !ana.includes("'" + k + "'"));
  olmayanOlay.forEach((k) => uyari('preload dinliyor, main hic yollamiyor: ' + k));

  if (!eksikHandler.length && !olmayanOlay.length) {
    console.log('  ' + cagrilan.size + ' cagri + ' + dinlenen.size + ' olay, hepsinin karsiligi var');
  }
}

// ---- summary ----
console.log('\n================================');
console.log('HATA  : ' + hataSayisi);
console.log('UYARI : ' + uyariSayisi);
console.log(hataSayisi ? 'SONUC : BASARISIZ' : 'SONUC : GECTI');
process.exit(hataSayisi ? 1 : 0);
