/* /* Language audit.
 *
 *  * Are the dictionaries (src/main/js/lang/<code>.json) consistent between languages, does every text
 *  * in the interface have a translation, is there a key that exists in one language and not in another.
 *
 *  * Why it was needed: translation is one-way (source Turkish, the key is the Turkish text itself) and the
 *  * dictionary grows by hand. A key forgotten in one language silently stays Turkish; nobody
 *  * notices. Also, during testing a Chinese notification was seen in the Turkish interface; its
 *  * source turned out not to be the dictionary but Steam's own localisation (pinned in 1.1.8).
 *
 *  * Before 1.1.8 the dictionary was in a single .js file, nineteen blocks added round by round,
 *  * and there was a hand-written parser here. The parser could not see keys written as
 *  * ([CONSTANT]: 'value'); two entries were missed because of this when Russian was added.
 *  * The dictionary is JSON now and the parser is gone.
 *
 *  * KNOWN BLIND SPOT: sections 7 and 8 only report JS texts that carry a letter specific to Turkish
 *  * (cgiosu) (confirm-dialog fields and t/tf/toast calls are scanned without looking at letters).
 *  * A looser criterion produced hundreds of false alarms full of code fragments. Since 1.3.0 section 6
 *  * (HTML) scans text without such letters too; names that are deliberately not translated are in CEVRILMEZ.
 *  * Section 10 (1.3.0) checks each translation's count of # from the key and the #1/#2 order.
 *
 *  * Blind spots closed in 1.3.0: section 6 did not see texts longer than 80 characters or the tooltip/title/
 *  * placeholder attributes at all (so most setting descriptions had stayed untranslated). Section 8 scans
 *  * the main process texts (tray, windows, error messages).
 *  * Section 9 catches a key that carries an HTML fragment: in 1.2.0 '</span><div style=' got mixed into the key of a
 *  * description and the text stayed Turkish in five languages.
 *
 *  * Run:  npm run dil
 *  *       npm run dil -- --tam    (without truncating long lists)
 *  *       npm run dil -- --dok <file>   (write the key list out)
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const DIL_DIZIN = path.join(KOK, 'src', 'main', 'js', 'lang');
const SAYFA_DIZIN = path.join(KOK, 'src', 'main', 'pages');
const JS_DIZIN = path.join(KOK, 'src', 'main', 'js');
const DILLER = ['en', 'de', 'es', 'zh', 'ru'];

let hata = 0;
let uyari = 0;
const yaz = (s) => process.stdout.write(s + '\n');
const bolum = (n, b) => yaz('\n' + n + '. ' + b);
const TAM = process.argv.includes('--tam');   // write long lists without truncating

// ---- read the dictionaries ----
const sozluk = {};
DILLER.forEach((d) => {
  const p = path.join(DIL_DIZIN, d + '.json');
  if (!fs.existsSync(p)) {
    hata++;
    yaz('HATA sozluk yok: ' + path.relative(KOK, p));
    sozluk[d] = new Map();
    return;
  }
  try {
    sozluk[d] = new Map(Object.entries(JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch (e) {
    hata++;
    yaz('HATA bozuk JSON: ' + path.relative(KOK, p) + ' - ' + e.message);
    sozluk[d] = new Map();
  }
});

// When adding a new language the full list of keys to translate is needed.
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

// ---- 2. consistency between languages ----
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

// ---- 3. untranslated: the value is the same as the key ----
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

// ---- 4. language mix-up: another alphabet in one language's value ----
// A Chinese notification was seen in the Turkish interface; this can happen when a value from the wrong
// alphabet sits in a language's block.
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
      // A Russian value that carries no Cyrillic shows that the entry was left untranslated.
      // Brand names (SteamEdge, HLTB) and numbers are outside this criterion.
      karisik++; hata++; yaz('  HATA ru blogunda Latin deger: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40));
    }
  });
});
if (!karisik) yaz('  her dil blogu kendi alfabesinde');

// ---- 5. Chinese variant consistency ----
// The app ships with the zh-TW (Traditional) package. The values in the dictionary must be in the same
// variant too, otherwise the interface becomes half Traditional, half Simplified.
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

// ---- 6. text in the interface that is not in the dictionary ----
// The visible Turkish texts in the page HTML. Every text without a key stays Turkish
// in the languages other than Turkish.
bolum(6, 'Sozlukte karsiligi olmayan arayuz metni');
const TR_HARF = /[çğıöşüÇĞİÖŞÜ]/;

// Stripping comments and script/style is repeated until the result stops changing. A single pass
// is not enough: when the stripped part's two sides join a new "<!--" can form.
function ayikla(metin) {
  let onceki;
  do {
    onceki = metin;
    metin = metin
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  } while (metin !== onceki);
  return metin;
}

// Entity decoding is done in a single pass. Doing it in sequence turned "&amp;nbsp;" first into "&nbsp;"
// and then into a space, so the text was decoded twice.
const VARLIK = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function varlikCoz(metin) {
  return metin.replace(/&(?:amp|nbsp|lt|gt|quot|#39);/g, (v) => VARLIK[v]);
}
const eksikMetin = [];
// Text that carries no Turkish letter can be Turkish too ("DK", "SN", "dk"). Before, only
// text with Turkish letters was scanned; the timer's "DK : SN" label stayed Turkish in every language because of this and
// was never caught. Now every text that has letters is scanned; the special names that are deliberately not translated
// (language names, brand, package, driver) are in the list below.
const CEVRILMEZ = new Set(['English', 'Deutsch', 'Español', 'ms', 'MB', 'Direct3D 11', 'Direct3D 9', 'OpenGL',
  'SteamEdge', 'Steam', 'Edge', 'Miabeyefendi', 'Idle Master', 'Idle Master Extended', 'HourBoostr',
  'Steam Achievement Manager', 'ArchiSteamFarm', 'steam-user', 'steam-session', 'qrcode',
  'SteamID', 'SteamID2', 'SteamID3', 'Hex', 'APP-ID', 'HEADLESS']);
const cevrilmezMi = (t) => CEVRILMEZ.has(t) || /^@\w+$/.test(t) || /^[\w-]+ \d+(\.\d+)+$/.test(t);
// The login screen sits outside the page folder and so for years it was never scanned;
// it still held outdated hand-written text like "v1.0.8". It was added to the list.
// The shell (sidebar, top bar, status line) is also outside the page folder: main.html.
const HTML_DOSYALAR = fs.readdirSync(SAYFA_DIZIN)
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ ad: f, yol: path.join(SAYFA_DIZIN, f) }))
  .concat([{ ad: 'login.html', yol: path.join(KOK, 'src', 'login', 'login.html') },
           { ad: 'main.html', yol: path.join(KOK, 'src', 'main', 'main.html') }])
  .filter((x) => fs.existsSync(x.yol));
HTML_DOSYALAR.forEach(({ ad: f, yol }) => {
  const html = fs.readFileSync(yol, 'utf8');
  const gorunur = ayikla(html);
  // Text nodes (no length limit) and translated attributes (the same list as i18n.js)
  const parcalar = [];
  const re = />([^<>{}]{2,})</g;
  let m;
  while ((m = re.exec(gorunur))) parcalar.push(m[1]);
  const oz = /\s(?:title|placeholder|data-tip)="([^"]+)"/g;
  while ((m = oz.exec(gorunur))) parcalar.push(m[1]);
  parcalar.forEach((ham) => {
    const t = varlikCoz(ham).replace(/\s+/g, ' ').trim();
    if (!t || !/[A-Za-zçğıöşüÇĞİÖŞÜ]{2}/.test(t)) return;   // if there are no letters (numbers, signs) leave it alone
    if (!TR_HARF.test(t) && cevrilmezMi(t)) return;
    // At run time the key is stripped of numbers (i18nNormKey): "7 gun" and
    // "30 gun" fall onto the same entry. The same normalisation must be applied here, otherwise
    // every text that carries a number would wrongly look "missing".
    const norm = (x) => x.replace(/\d[\d.,]*/g, '#');
    if (sozluk.en.has(t) || sozluk.en.has(norm(t))) return;
    if ([...sozluk.en.keys()].some((k) => norm(k) === norm(t))) return;
    eksikMetin.push(f + ': ' + (TAM ? t : t.slice(0, 60)));
  });
});
if (eksikMetin.length) {
  uyari++;
  yaz('  ' + eksikMetin.length + ' metnin sozlukte karsiligi yok');
  const liste = [...new Set(eksikMetin)];
  (TAM ? liste : liste.slice(0, 12)).forEach((x) => yaz('      ' + x));
  if (!TAM && liste.length > 12) yaz('      ... ve ' + (liste.length - 12) + ' tane daha (npm run dil -- --tam)');
} else yaz('  arayuzdeki her Turkce metnin karsiligi var');

// ---- 7. text produced by the page JS files ----
// Section 6 only scans HTML. Warning boxes, empty-state texts and toasts sit inside JS as
// strings; without a translation for them the interface stays half translated.
// Because the criterion is coarse (code fragments are also in quotes) it counts as a WARNING, not an ERROR.
bolum(7, 'Sayfa JS metinleri (sozlukte karsiligi yok)');
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
    // Escape sequences are turned into their run time form: text written as \' in the source becomes ' on screen.
    const ham = (m[1] !== undefined ? m[1] : m[2]);
    if (!ham || !TR_HARF.test(ham)) continue;
    // Strip the tags and keep only the visible text
    ham.replace(/\\(['"])/g, '$1').replace(/\\n/g, ' ').split(/<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_HARF.test(t)) return;
      if (sozluk.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsEksik.has(t)) jsEksik.set(t, f);
    });
  }
  // Template strings (`...${x}...`): the variable places count as separators
  const sab = /`((?:\\.|[^`\\])*)`/g;
  while ((m = sab.exec(kaynak))) {
    m[1].split(/\$\{[^}]*\}|<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_HARF.test(t)) return;
      if (sozluk.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsEksik.has(t)) jsEksik.set(t, f);
    });
  }
  // Text that carries no Turkish letter but goes to the interface ("Sayfada Kal", "Kapat"): confirm dialog
  // fields and the calls translation passes through are scanned without looking at letters.
  const arayuz = /\b(?:confirmText|cancelText|altText|tag|title|body|warn)\s*:\s*'((?:\\.|[^'\\\n])+)'|\b(?:t|tf|toast)\(\s*'((?:\\.|[^'\\\n])+)'/g;
  while ((m = arayuz.exec(kaynak))) {
    const t = (m[1] !== undefined ? m[1] : m[2]).replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
    if (t.length < 3 || /^#[0-9A-Fa-f]{3,8}$/.test(t) || !/[a-zA-Z]{3}/.test(t) || /^[\w.-]+$/.test(t) && !/\s/.test(t) && /[a-z][A-Z]|_|^[a-z]+$/.test(t)) continue;
    if (sozluk.en.has(t) || enNorm.has(normA(t))) continue;
    if (!jsEksik.has(t)) jsEksik.set(t, f);
  }
});
if (jsEksik.size) {
  uyari++;
  yaz('  ' + jsEksik.size + ' metnin sozlukte karsiligi yok');
  const liste = [...jsEksik].map(([t, f]) => f + ': ' + (TAM ? t : t.slice(0, 70)));
  (TAM ? liste : liste.slice(0, 12)).forEach((x) => yaz('      ' + x));
  if (!TAM && liste.length > 12) yaz('      ... ve ' + (liste.length - 12) + ' tane daha (npm run dil -- --tam)');
} else yaz('  JS icindeki her Turkce metnin karsiligi var');

// ---- 8. the main process text that goes to the user ----
// The tray menu, file dialogs, notifications, error messages returned to the interface and the texts that go to the
// activity feed (main.js, src/core, src/services). Log lines and comments are stripped;
// every remaining text with Turkish letters must have a dictionary entry (see src/core/ceviri.js).
bolum(8, 'Ana surec metinleri (sozlukte karsiligi yok)');
const anaEksik = new Map();
const anaDosyalar = [path.join(KOK, 'main.js')]
  .concat(fs.readdirSync(path.join(KOK, 'src', 'core')).map((f) => path.join(KOK, 'src', 'core', f)))
  .concat(fs.readdirSync(path.join(KOK, 'src', 'services')).map((f) => path.join(KOK, 'src', 'services', f)))
  .filter((f) => f.endsWith('.js') && !f.endsWith('ceviri.js'));
anaDosyalar.forEach((yol) => {
  const f = path.relative(KOK, yol).replace(/\\/g, '/');
  const kaynak = fs.readFileSync(yol, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\blog\((?:[^()]|\([^()]*\))*\)/g, '')          // log lines do not go to the user
    .replace(/\bcokmeYaz\((?:[^()]|\([^()]*\))*\)/g, '');
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"/g;
  let m;
  while ((m = re.exec(kaynak))) {
    const ham = m[1] !== undefined ? m[1] : m[2];
    if (!ham || !TR_HARF.test(ham)) continue;
    const t = ham.replace(/\\(['"])/g, '$1').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 3) continue;
    if (sozluk.en.has(t) || enNorm.has(normA(t))) continue;
    if (!anaEksik.has(t)) anaEksik.set(t, f);
  }
});
if (anaEksik.size) {
  uyari++;
  yaz('  ' + anaEksik.size + ' metnin sozlukte karsiligi yok');
  const liste = [...anaEksik].map(([t, f]) => f + ': ' + (TAM ? t : t.slice(0, 70)));
  (TAM ? liste : liste.slice(0, 12)).forEach((x) => yaz('      ' + x));
  if (!TAM && liste.length > 12) yaz('      ... ve ' + (liste.length - 12) + ' tane daha (npm run dil -- --tam)');
} else yaz('  ana surecin her Turkce metninin karsiligi var');

// ---- 9. a key that carries an HTML fragment ----
bolum(9, 'HTML parcasi tasiyan anahtar');
let htmlAnahtar = 0;
sozluk.en.forEach((_v, k) => {
  if (/<\/?[a-z][^>]*>|style="/i.test(k)) { htmlAnahtar++; hata++; yaz('  HATA ' + k.slice(0, 90)); }
});
if (!htmlAnahtar) yaz('  temiz');

// ---- 10. placeholder ----
// Every '#' in the key must be in the translation too; if it is missing the value is lost, if there are extra a '#'
// stays on screen. A translation that changes the order writes #1, #2 (see i18n.js yerTutucuDoldur); if it is mixed
// with a plain '#' the counter slips, so the two cannot be together.
// Exception: in languages where the singular covers only 1 (en, de, es) the singular form may
// leave out the number ("The game already has..."). The Russian singular also covers 21 and 31, so the number is required.
const TEKIL_BIR = new Set(['en', 'de', 'es']);
bolum(10, 'Yer tutucu (# sayisi ve #1, #2 sirasi)');
let ytHata = 0;
DILLER.forEach((d) => {
  sozluk[d].forEach((v, k) => {
    const n = (k.match(/#/g) || []).length;
    const bicimler = String(v).split('|');
    bicimler.forEach((bicim, sira) => {
      const tekilSayisiz = TEKIL_BIR.has(d) && bicimler.length > 1 && sira === 0;
      const sirali = bicim.match(/#[1-9]/g) || [];
      const duz = (bicim.match(/#(?![1-9])/g) || []).length;
      let sorun = '';
      if (sirali.length && duz) sorun = 'duz # ile #1 karisik';
      else if (sirali.length) {
        const kume = new Set(sirali);
        if (sirali.some((x) => Number(x[1]) > n)) sorun = 'anahtarda olmayan sira';
        else if (kume.size !== n) sorun = n + ' deger, ' + kume.size + ' sirali yer tutucu';
      } else if (duz !== n && !(tekilSayisiz && duz === n - 1)) sorun = n + ' deger, ceviride ' + duz;
      if (sorun) { ytHata++; hata++; yaz('  HATA ' + d + ' ' + JSON.stringify(k).slice(0, 70) + ': ' + sorun); }
    });
  });
});
if (!ytHata) yaz('  her ceviri anahtarin degerlerini tasiyor');

// ---- summary ----
yaz('\n================================');
yaz('HATA  : ' + hata);
yaz('UYARI : ' + uyari);
yaz('SONUC : ' + (hata ? 'BASARISIZ' : 'GECTI'));
process.exit(hata ? 1 : 0);
