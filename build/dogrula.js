#!/usr/bin/env node
/**
 * SteamEdge dogrulama takimi.  Kullanim: npm run dogrula
 *
 * Derleme oncesi calisan, bagimsiz kontroller. Test cercevesi yok: her kontrol
 * kaynagi okuyup bir sey ISPATLAR ya da hangi satirda kirildigini soyler.
 *
 *   1. Sozdizimi        - her .js dosyasi ayristirilabiliyor mu
 *   2. Kayip id         - JS'in aradigi id HTML'de var mi
 *   3. Tekrarlanan id   - ayni id iki kez tanimlanmis mi
 *   4. Etiket dengesi   - sayfa parcalarinda acilmamis/kapanmamis <div> var mi
 *   5. IPC eslesmesi    - preload'un cagirdigi kanal main.js'te tanimli mi
 *   6. Uzun cizgi       - em/en dash hicbir yerde bulunmamali
 *   7. Yapimci izi      - yapimci disinda bir arac/kisi adi kaynaga sizmis mi
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
        || e.name === 'settings' || e.name === 'cache') continue;
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) dosyalar(p, uzanti, cikti);
    else if (e.name.toLowerCase().endsWith(uzanti)) cikti.push(p);
  }
  return cikti;
}
const gorece = (p) => path.relative(KOK, p).replace(/\\/g, '/');
// Bu dosyanin kendisi taranmaz: aradigi desenleri kendi icinde tasiyor, her calisirken
// kendini yakalardi.
const kendisi = (p) => gorece(p) === 'build/dogrula.js';
const oku = (p) => fs.readFileSync(p, 'utf8');
const satirNo = (metin, konum) => metin.slice(0, konum).split('\n').length;

// ---- 1. Sozdizimi ----
bolum('1. Sozdizimi');
const jsDosyalar = dosyalar(KOK, '.js');
jsDosyalar.forEach((f) => {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { hata(gorece(f) + ' ayristirilamadi\n' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')); }
});
console.log('  ' + jsDosyalar.length + ' dosya kontrol edildi');

// ---- 2 + 3. id kontrolleri ----
bolum('2. Kayip id');
const htmlDosyalar = dosyalar(KOK, '.html');
const tumIdler = new Set();
// Tekrar kontrolu BELGE bazinda: giris ekrani ile ana pencere ayri belgeler, ikisinde de
// pencere dugmesi id'leri (min/max/close) bulunmasi dogru. Cakisma ancak ayni belgede sorun.
// Ana pencere sayfa parcalarini main.html'e enjekte ettigi icin onlar tek belge sayilir.
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
// JS'in kendi urettigi id'ler de sayilir: innerHTML icinde id="X" ya da el.id = 'X'
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

// ---- 4. Etiket dengesi ----
bolum('4. Etiket dengesi (div)');
htmlDosyalar.forEach((f) => {
  // Yorumlar sayilmaz. Sayaci yorum korlugu bir kez yanlis alarm verdi: yerlesim
  // hatasini anlatan bir yorumun icinde "<div>" gectigi icin dosya dengesiz gorundu.
  // Yorum icine alinmis bir blok da ayni sekilde yanlis alarm uretirdi.
  const m = oku(f).replace(/<!--[\s\S]*?-->/g, '');
  const ac = (m.match(/<div\b/g) || []).length;
  const kapa = (m.match(/<\/div>/g) || []).length;
  if (ac !== kapa) hata(gorece(f) + ' <div> ' + ac + ' / </div> ' + kapa);
});
console.log('  ' + htmlDosyalar.length + ' sayfa kontrol edildi');

// ---- 5. IPC eslesmesi ----
bolum('5. IPC eslesmesi');
const preload = oku(path.join(KOK, 'preload.js'));
const anaSurec = oku(path.join(KOK, 'main.js'));
const tanimli = new Set();
for (const e of anaSurec.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)) tanimli.add(e[1]);
// Ana surecten arayuze giden olaylar (ipcRenderer.on) main.js'te sendRaw/send ile atilir.
const gonderilen = new Set();
for (const e of anaSurec.matchAll(/send(?:Raw)?\(\s*'([^']+)'/g)) gonderilen.add(e[1]);
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

// ---- 6. Uzun cizgi ----
bolum('6. Uzun cizgi (em/en dash)');
let cizgi = 0;
dosyalar(KOK, '.js').concat(dosyalar(KOK, '.html'), dosyalar(KOK, '.css')).forEach((f) => {
  if (kendisi(f)) return;
  const m = oku(f);
  for (const e of m.matchAll(/[–—]/g)) { cizgi++; hata(gorece(f) + ':' + satirNo(m, e.index) + ' uzun cizgi'); }
});
if (!cizgi) console.log('  temiz');

// ---- 7. Yapimci izi ----
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
// Yerel yol sizintisi: dagitilan kaynakta gelistirme makinesinin surucu yolu bulunmamali.
dosyalar(path.join(KOK, 'src'), '.js').forEach((f) => {
  const m = oku(f);
  for (const e of m.matchAll(/[A-Z]:\\(?:Coding|Users)\\/g)) { iz++; hata(gorece(f) + ':' + satirNo(m, e.index) + ' yerel yol'); }
});
if (!iz) console.log('  temiz');

// ---- 8. Olu ayar anahtari ----
// Varsayilan ayarlarda duran ama hicbir yerde okunmayan anahtar. 1.1.2'de "ignoreUpdates"
// boyle bulundu: arayuzde bir dugmesi vardi, motorda karsiligi yoktu, kullanici acip
// kapatiyor ve hicbir sey olmuyordu. Elle fark edilmesi zor, taramasi kolay.
bolum('8. Olu ayar anahtari');
{
  const ana = oku(path.join(KOK, 'main.js'));
  const blok = ana.match(/const VARSAYILAN_AYARLAR\s*=\s*\{([\s\S]*?)\n\};/)
            || ana.match(/const DEFAULT_SETTINGS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!blok) {
    console.log('  varsayilan ayar blogu bulunamadi, atlandi');
  } else {
    const anahtarlar = [...blok[1].matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
    // Tum kaynakta anahtarin gectigi yerler (varsayilan blogu haric)
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

// ---- 9. Karsiliksiz IPC kanali ----
// preload.js bir kanal aciyor ama main.js karsilamiyorsa cagri sessizce reddedilir ve
// arayuz "alinamadi" der. Tersi de olur: main'de handler durur, kimse cagirmaz.
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

  // Dinlenen olaylar icin: main tarafinda hic yollanmiyorsa olu dinleyici
  const olmayanOlay = [...dinlenen].filter((k) => !yollanan.has(k) && !ana.includes("'" + k + "'"));
  olmayanOlay.forEach((k) => uyari('preload dinliyor, main hic yollamiyor: ' + k));

  if (!eksikHandler.length && !olmayanOlay.length) {
    console.log('  ' + cagrilan.size + ' cagri + ' + dinlenen.size + ' olay, hepsinin karsiligi var');
  }
}

// ---- ozet ----
console.log('\n================================');
console.log('HATA  : ' + hataSayisi);
console.log('UYARI : ' + uyariSayisi);
console.log(hataSayisi ? 'SONUC : BASARISIZ' : 'SONUC : GECTI');
process.exit(hataSayisi ? 1 : 0);
