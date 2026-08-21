/* Dil denetimi.
 *
 * Sozluk (src/main/js/i18n.js) diller arasinda tutarli mi, arayuzdeki metinlerin
 * karsiligi var mi, bir dilde olup digerinde olmayan anahtar var mi.
 *
 * Neden gerekti: ceviri tek yonlu (kaynak Turkce, anahtar Turkce metnin kendisi) ve
 * sozluk elle buyuyor. Bir dilde unutulan anahtar sessizce Turkce kaliyor; kimse fark
 * etmiyor. Bir de test sirasinda Turkce arayuzde Cince bir bildirim goruldu, yani
 * anahtarlar arasinda beklenmedik bir eslesme olabiliyor.
 *
 * BILINEN KORLUK: 6. bolum yalnizca Turkce'ye ozgu harf (cgiosu) tasiyan metinleri
 * bildiriyor. "Grafik arka ucu" gibi saf ASCII bir Turkce baslik gozden kacar. Daha
 * gevsek bir olcut, ingilizce kod parcalari ve sayilarla dolu yuzlerce yanlis alarm
 * uretiyordu; yeni metin eklerken bunu akilda tut.
 *
 * Calistirma:  npm run dil
 *              npm run dil -- --tam    (uzun listeleri kirpmadan)
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const I18N_DOSYA = path.join(KOK, 'src', 'main', 'js', 'i18n.js');
const SAYFA_DIZIN = path.join(KOK, 'src', 'main', 'pages');
const DILLER = ['en', 'de', 'es', 'zh', 'ru'];

let hata = 0;
let uyari = 0;
const yaz = (s) => process.stdout.write(s + '\n');
const bolum = (n, b) => yaz('\n' + n + '. ' + b);
const TAM = process.argv.includes('--tam');   // uzun listeleri kirpmadan yaz

// ---- sozlugu oku ----
// Dosya tarayici kapsaminda calisan bir betik, require edilemez. Dil bloklari
// "  en: {" ... "  }," bicimini izliyor; parantez sayarak cikariliyor.
function dilBloklari(kaynak) {
  const sonuc = {};
  DILLER.forEach((d) => { sonuc[d] = []; });
  const re = new RegExp("(^|\\n)\\s*(" + DILLER.join('|') + ")\\s*:\\s*\\{", 'g');
  let m;
  while ((m = re.exec(kaynak))) {
    const dil = m[2];
    let i = kaynak.indexOf('{', m.index + m[0].length - 1);
    let derinlik = 0, j = i, tirnak = null;
    for (; j < kaynak.length; j++) {
      const c = kaynak[j], onceki = kaynak[j - 1];
      if (tirnak) { if (c === tirnak && onceki !== '\\') tirnak = null; continue; }
      if (c === "'" || c === '"' || c === '`') { tirnak = c; continue; }
      if (c === '{') derinlik++;
      else if (c === '}') { derinlik--; if (!derinlik) break; }
    }
    sonuc[dil].push(kaynak.slice(i + 1, j));
  }
  return sonuc;
}

// Bir blok icindeki 'anahtar': 'deger' ciftleri
function ciftler(blok) {
  const out = new Map();
  const re = /(^|[\n,])\s*(['"])((?:\\.|(?!\2)[^\\])*)\2\s*:\s*(['"])((?:\\.|(?!\4)[^\\])*)\4/g;
  let m;
  while ((m = re.exec(blok))) {
    const anahtar = m[3].replace(/\\'/g, "'").replace(/\\"/g, '"');
    const deger = m[5].replace(/\\'/g, "'").replace(/\\"/g, '"');
    out.set(anahtar, deger);
  }
  return out;
}

const kaynak = fs.readFileSync(I18N_DOSYA, 'utf8');
const bloklar = dilBloklari(kaynak);
const sozluk = {};
DILLER.forEach((d) => {
  sozluk[d] = new Map();
  bloklar[d].forEach((b) => { ciftler(b).forEach((v, k) => sozluk[d].set(k, v)); });
});

// Bazi girisler blok icinde degil, atama satiri olarak ekleniyor:
//   I18N_G14['en']['anahtar'] = 'deger';
// Bunlar da sozlugun parcasi; saymazsak var olan ceviriyi "eksik" diye raporlariz.
const atamaRe = new RegExp(
  "I18N_G\\d+\\s*\\[\\s*(['\"])(\\w+)\\1\\s*\\]\\s*"        // dil
  + "\\[\\s*(['\"])((?:\\\\.|(?!\\3)[^\\\\])*)\\3\\s*\\]"   // anahtar
  + "\\s*=\\s*(['\"])((?:\\\\.|(?!\\5)[^\\\\])*)\\5",       // deger
  'g');
let am;
while ((am = atamaRe.exec(kaynak))) {
  const dil = am[2];
  if (!sozluk[dil]) continue;
  const coz = (x) => x.replace(/\\'/g, "'").replace(/\\"/g, '"');
  sozluk[dil].set(coz(am[4]), coz(am[6]));
}

// Yeni bir dil eklerken cevrilecek anahtarlarin tam listesi lazim oluyor. Elle toplamak
// hem hataya acik hem de bu dosyada zaten dogru calisan bir ayristirici var.
//   npm run dil -- --dok <dosya>
const dokIdx = process.argv.indexOf('--dok');
if (dokIdx > 0 && process.argv[dokIdx + 1]) {
  const satirlar = [...sozluk.en.entries()]
    .map(([k, v]) => JSON.stringify({ k, en: v }))
    .join('\n');
  fs.writeFileSync(process.argv[dokIdx + 1], satirlar, 'utf8');
  yaz('anahtar: ' + sozluk.en.size + ', karakter: ' + satirlar.length);
  process.exit(0);
}

bolum(1, 'Sozluk buyuklugu');
DILLER.forEach((d) => yaz('  ' + d + ': ' + sozluk[d].size + ' anahtar'));

// ---- 2. diller arasi tutarlilik ----
bolum(2, 'Diller arasi eksik anahtar');
const tumAnahtar = new Set();
DILLER.forEach((d) => sozluk[d].forEach((_v, k) => tumAnahtar.add(k)));
let eksikToplam = 0;
DILLER.forEach((d) => {
  const eksik = [...tumAnahtar].filter((k) => !sozluk[d].has(k));
  if (eksik.length) {
    eksikToplam += eksik.length;
    uyari++;
    yaz('  ' + d + ': ' + eksik.length + ' eksik');
    eksik.slice(0, 8).forEach((k) => yaz('      ' + k.slice(0, 70)));
    if (eksik.length > 8) yaz('      ... ve ' + (eksik.length - 8) + ' tane daha');
  }
});
if (!eksikToplam) yaz('  tum diller ayni anahtar kumesine sahip');

// ---- 3. cevrilmemis: deger anahtarin aynisi ----
bolum(3, 'Cevrilmemis giris (deger anahtarla ayni)');
let ayniToplam = 0;
DILLER.forEach((d) => {
  const ayni = [];
  sozluk[d].forEach((v, k) => { if (v === k && k.length > 3) ayni.push(k); });
  if (ayni.length) {
    ayniToplam += ayni.length;
    uyari++;
    yaz('  ' + d + ': ' + ayni.length + ' giris cevrilmemis');
    ayni.slice(0, 6).forEach((k) => yaz('      ' + k.slice(0, 70)));
  }
});
if (!ayniToplam) yaz('  cevrilmemis giris yok');

// ---- 4. dil karisikligi: bir dilin degerinde baska bir alfabe ----
// Turkce arayuzde Cince bir bildirim gorulmustu; bu, bir dilin blogunda yanlis
// alfabeden bir degerin durmasiyla olusabilir.
bolum(4, 'Yanlis alfabe (dil blogu ile deger uyusmuyor)');
const CJK = /[一-鿿]/;
const KIRIL = /[Ѐ-ӿ]/;
let karisik = 0;
DILLER.forEach((d) => {
  sozluk[d].forEach((v, k) => {
    const cjk = CJK.test(v), kiril = KIRIL.test(v);
    if (d !== 'zh' && cjk) { karisik++; hata++; yaz('  HATA ' + d + ' blogunda Cince deger: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40)); }
    if (d !== 'ru' && kiril) { karisik++; hata++; yaz('  HATA ' + d + ' blogunda Kiril deger: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40)); }
    if (d === 'ru' && !kiril && v !== k && /[A-Za-z]{4}/.test(v)) {
      // Rusca degerin Kiril tasimamasi, o girisin cevrilmeden kaldigini gosterir.
      // Marka adlari (SteamEdge, HLTB) ve sayilar bu olcutun disinda kaliyor.
      karisik++; hata++; yaz('  HATA ru blogunda Latin deger: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40));
    }
  });
});
if (!karisik) yaz('  her dil blogu kendi alfabesinde');

// ---- 5. Cince varyant tutarliligi ----
// Uygulama zh-TW (Geleneksel) paketiyle geliyor. Sozlukteki degerlerin de ayni
// varyantta olmasi gerekiyor, yoksa arayuz yari Geleneksel yari Basitlestirilmis olur.
bolum(5, 'Cince varyant');
const BASIT_ISARET = ['设', '页', '这', '时', '开', '关', '数', '经', '过', '选', '记', '认'];
const GELENEK_ISARET = ['設', '頁', '這', '時', '開', '關', '數', '經', '過', '選', '記', '認'];
let basit = 0, gelenek = 0;
sozluk.zh.forEach((v) => {
  BASIT_ISARET.forEach((c) => { if (v.indexOf(c) >= 0) basit++; });
  GELENEK_ISARET.forEach((c) => { if (v.indexOf(c) >= 0) gelenek++; });
});
yaz('  basitlestirilmis isaret: ' + basit + ', geleneksel isaret: ' + gelenek);
if (basit && gelenek) { hata++; yaz('  HATA iki varyant karisik duruyor'); }
else yaz('  varyant tutarli');

// ---- 6. arayuzde sozlukte olmayan metin ----
// Sayfa HTML'lerindeki gorunur Turkce metinler. Anahtari olmayan her metin, Turkce
// disindaki dillerde Turkce kalir.
bolum(6, 'Sozlukte karsiligi olmayan arayuz metni');
const TR_HARF = /[çğıöşüÇĞİÖŞÜ]/;
const eksikMetin = [];
fs.readdirSync(SAYFA_DIZIN).filter((f) => f.endsWith('.html')).forEach((f) => {
  const html = fs.readFileSync(path.join(SAYFA_DIZIN, f), 'utf8');
  const gorunur = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const re = />([^<>{}]{4,80})</g;
  let m;
  while ((m = re.exec(gorunur))) {
    const t = m[1].replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || !TR_HARF.test(t)) continue;               // Turkce harfi yoksa dokunma
    if (/^[\d\s.,:/%+-]+$/.test(t)) continue;
    // Calisma zamaninda anahtar sayilardan arindiriliyor (i18nNormKey): "7 gun" ile
    // "30 gun" ayni girise duser. Ayni normalizasyon burada da uygulanmali, yoksa
    // sayi tasiyan her metin yanlislikla "eksik" gorunur.
    const norm = (x) => x.replace(/\d[\d.,]*/g, '#');
    if (sozluk.en.has(t) || sozluk.en.has(norm(t))) continue;
    if ([...sozluk.en.keys()].some((k) => norm(k) === norm(t))) continue;
    eksikMetin.push(f + ': ' + t.slice(0, 60));
  }
});
if (eksikMetin.length) {
  uyari++;
  yaz('  ' + eksikMetin.length + ' metnin sozlukte karsiligi yok');
  const liste = [...new Set(eksikMetin)];
  (TAM ? liste : liste.slice(0, 12)).forEach((x) => yaz('      ' + x));
  if (!TAM && liste.length > 12) yaz('      ... ve ' + (liste.length - 12) + ' tane daha (npm run dil -- --tam)');
} else yaz('  arayuzdeki her Turkce metnin karsiligi var');

// ---- 7. sayfa JS'lerinin urettigi metin ----
// 6. bolum yalnizca HTML tariyor. Uyari kutulari, bos durum metinleri ve toast'lar
// JS icinde string olarak duruyor; bunlarin karsiligi yoksa arayuz yari cevrili kalir.
// Olcut kaba oldugu icin (kod parcalari da tirnak icinde) HATA degil UYARI sayilir.
bolum(7, 'Sayfa JS metinleri (sozlukte karsiligi yok)');
const JS_DIZIN = path.join(KOK, 'src', 'main', 'js');
const normA = (x) => x.replace(/\d[\d.,]*/g, '#');
const enNorm = new Set([...sozluk.en.keys()].map(normA));
const jsEksik = new Map();
fs.readdirSync(JS_DIZIN).filter((f) => f.endsWith('.js') && f !== 'i18n.js').forEach((f) => {
  const kaynak = fs.readFileSync(path.join(JS_DIZIN, f), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"/g;
  let m;
  while ((m = re.exec(kaynak))) {
    const ham = m[1] !== undefined ? m[1] : m[2];
    if (!ham || !TR_HARF.test(ham)) continue;
    // Etiketleri soyup yalnizca gorunur metni birak
    ham.split(/<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_HARF.test(t)) return;
      if (sozluk.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsEksik.has(t)) jsEksik.set(t, f);
    });
  }
});
if (jsEksik.size) {
  uyari++;
  yaz('  ' + jsEksik.size + ' metnin sozlukte karsiligi yok');
  const liste = [...jsEksik].map(([t, f]) => f + ': ' + t.slice(0, 70));
  (TAM ? liste : liste.slice(0, 12)).forEach((x) => yaz('      ' + x));
  if (!TAM && liste.length > 12) yaz('      ... ve ' + (liste.length - 12) + ' tane daha (npm run dil -- --tam)');
} else yaz('  JS icindeki her Turkce metnin karsiligi var');

// ---- ozet ----
yaz('\n================================');
yaz('HATA  : ' + hata);
yaz('UYARI : ' + uyari);
yaz('SONUC : ' + (hata ? 'BASARISIZ' : 'GECTI'));
process.exit(hata ? 1 : 0);
