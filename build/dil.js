/* Dil denetimi.
 *
 * Sozlukler (src/main/js/lang/<kod>.json) diller arasinda tutarli mi, arayuzdeki
 * metinlerin karsiligi var mi, bir dilde olup digerinde olmayan anahtar var mi.
 *
 * Neden gerekti: ceviri tek yonlu (kaynak Turkce, anahtar Turkce metnin kendisi) ve
 * sozluk elle buyuyor. Bir dilde unutulan anahtar sessizce Turkce kaliyor; kimse fark
 * etmiyor. Bir de test sirasinda Turkce arayuzde Cince bir bildirim goruldu; onun
 * kaynagi sozluk degilmis, Steam'in kendi yerellestirmesiymis (1.1.8'de sabitlendi).
 *
 * 1.1.8 oncesi sozluk tek bir .js dosyasinda, tur tur eklenmis on dokuz blok halindeydi
 * ve burada elle yazilmis bir ayristirici vardi. Ayristirici kosuk anahtarlari
 * ([SABIT]: 'deger') goremiyordu; Rusca eklenirken iki giris bu yuzden atlanmisti.
 * Sozluk artik JSON, ayristirici da gitti.
 *
 * BILINEN KORLUK: 7. ve 8. bolum yalnizca Turkce'ye ozgu harf (cgiosu) tasiyan JS
 * metinlerini bildiriyor (onay alanlari ve t/tf/toast cagrilari harf bakilmadan taranir).
 * Daha gevsek bir olcut kod parcalariyla dolu yuzlerce yanlis alarm uretiyordu. 6. bolum
 * (HTML) 1.3.0'dan beri harfsiz metni de tariyor; bilerek cevrilmeyen adlar CEVRILMEZ'de.
 * 10. bolum (1.3.0) her cevirinin anahtardaki # sayisini ve #1/#2 sirasini denetler.
 *
 * 1.3.0'da kapatilan korluklar: 6. bolum 80 karakterden uzun metinleri ve ipucu/baslik/yer
 * tutucu ozniteliklerini hic gormuyordu (ayar aciklamalarinin cogu bu yuzden cevrilmeden
 * kalmisti). 8. bolum ana surecin metinlerini (tepsi, pencereler, hata mesajlari) tariyor.
 * 9. bolum HTML parcasi tasiyan anahtari yakaliyor: 1.2.0'da bir aciklamanin anahtarina
 * '</span><div style=' karismisti ve metin bes dilde Turkce kalmisti.
 *
 * Calistirma:  npm run dil
 *              npm run dil -- --tam    (uzun listeleri kirpmadan)
 *              npm run dil -- --dok <dosya>   (anahtar listesini disari yaz)
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
const TAM = process.argv.includes('--tam');   // uzun listeleri kirpmadan yaz

// ---- sozlukleri oku ----
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

// Yeni bir dil eklerken cevrilecek anahtarlarin tam listesi lazim oluyor.
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
// These names and loanwords are correctly written the same way in these locales.
const INTENTIONALLY_UNCHANGED = {
  en: new Set(['Marimba', 'Siren', 'Radar ping', 'Bloop', 'Pareto · 80/20',
    'Sandbox · 4.0×', 'normal', 'Pareto (80/20)', 'Preset']),
  de: new Set(['Profil', 'Marimba', 'Bloop', 'Pareto · 80/20',
    'Sandbox · 4.0×', 'normal', 'Pareto (80/20)']),
  es: new Set(['Motor', 'Marimba', 'Bloop', 'Pareto · 80/20',
    'Sandbox · 4.0×', 'normal', 'Pareto (80/20)', 'Tema']),
};
DILLER.forEach((d) => {
  const ayni = [];
  sozluk[d].forEach((v, k) => {
    if (v === k && k.length > 3 && !INTENTIONALLY_UNCHANGED[d]?.has(k)) ayni.push(k);
  });
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

// Yorum ve script/style ayiklama, sonuc degismeyene kadar tekrarlanir. Tek gecis
// yetmiyor: ayiklanan parcanin iki yani birlesince yeni bir "<!--" olusabiliyor.
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

// Varlik cozme tek geciste yapilir. Sirayla yapinca "&amp;nbsp;" once "&nbsp;"
// olup sonra bosluga donuyordu, yani metin iki kez cozuluyordu.
const VARLIK = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function varlikCoz(metin) {
  return metin.replace(/&(?:amp|nbsp|lt|gt|quot|#39);/g, (v) => VARLIK[v]);
}
const eksikMetin = [];
// Turkce harf tasimayan metin de Turkce olabilir ("DK", "SN", "dk"). Eskiden yalnizca
// Turkce harfli metin taraniyordu; zamanlayicinin "DK : SN" etiketi bu yuzden her dilde
// Turkce kaldi ve hic yakalanmadi. Artik harfli her metin taranir; bilerek cevrilmeyen
// ozel adlar (dil adlari, marka, paket, surucu) asagidaki listede durur.
const CEVRILMEZ = new Set(['English', 'Deutsch', 'Español', 'ms', 'MB', 'BF', 'Direct3D 11', 'Direct3D 9', 'OpenGL',
  'SteamEdge', 'Steam', 'Edge', 'Miabeyefendi', 'Idle Master', 'Idle Master Extended', 'HourBoostr',
  'Steam Achievement Manager', 'ArchiSteamFarm', 'steam-user', 'steam-session', 'qrcode',
  'SteamID', 'SteamID2', 'SteamID3', 'Hex', 'APP-ID', 'HEADLESS']);
const cevrilmezMi = (t) => CEVRILMEZ.has(t) || /^@\w+$/.test(t) || /^[\w-]+ \d+(\.\d+)+$/.test(t);
// Giris ekrani sayfa klasorunun disinda duruyor ve bu yuzden yillarca hic taranmadi;
// icinde elle yazilmis "v1.0.8" gibi eskimis metinler kalmisti. Listeye alindi.
// Kabuk (kenar cubugu, ust cubuk, durum satiri) da sayfa klasorunun disinda: main.html.
const HTML_DOSYALAR = fs.readdirSync(SAYFA_DIZIN)
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ ad: f, yol: path.join(SAYFA_DIZIN, f) }))
  .concat([{ ad: 'login.html', yol: path.join(KOK, 'src', 'login', 'login.html') },
           { ad: 'main.html', yol: path.join(KOK, 'src', 'main', 'main.html') }])
  .filter((x) => fs.existsSync(x.yol));
HTML_DOSYALAR.forEach(({ ad: f, yol }) => {
  const html = fs.readFileSync(yol, 'utf8');
  const gorunur = ayikla(html);
  // Metin dugumleri (uzunluk siniri yok) ve cevrilen oznitelikler (i18n.js ile ayni liste)
  const parcalar = [];
  const re = />([^<>{}]{2,})</g;
  let m;
  while ((m = re.exec(gorunur))) parcalar.push(m[1]);
  const oz = /\s(?:title|placeholder|data-tip)="([^"]+)"/g;
  while ((m = oz.exec(gorunur))) parcalar.push(m[1]);
  parcalar.forEach((ham) => {
    const t = varlikCoz(ham).replace(/\s+/g, ' ').trim();
    if (!t || !/[A-Za-zçğıöşüÇĞİÖŞÜ]{2}/.test(t)) return;   // harf yoksa (sayi, isaret) dokunma
    if (!TR_HARF.test(t) && cevrilmezMi(t)) return;
    // Calisma zamaninda anahtar sayilardan arindiriliyor (i18nNormKey): "7 gun" ile
    // "30 gun" ayni girise duser. Ayni normalizasyon burada da uygulanmali, yoksa
    // sayi tasiyan her metin yanlislikla "eksik" gorunur.
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

// ---- 7. sayfa JS'lerinin urettigi metin ----
// 6. bolum yalnizca HTML tariyor. Uyari kutulari, bos durum metinleri ve toast'lar
// JS icinde string olarak duruyor; bunlarin karsiligi yoksa arayuz yari cevrili kalir.
// Olcut kaba oldugu icin (kod parcalari da tirnak icinde) HATA degil UYARI sayilir.
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
    // Kacis dizileri calisma zamanindaki haline cevrilir: kaynakta \' yazan metin ekranda ' olur.
    const ham = (m[1] !== undefined ? m[1] : m[2]);
    if (!ham || !TR_HARF.test(ham)) continue;
    // Etiketleri soyup yalnizca gorunur metni birak
    ham.replace(/\\(['"])/g, '$1').replace(/\\n/g, ' ').split(/<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_HARF.test(t)) return;
      if (sozluk.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsEksik.has(t)) jsEksik.set(t, f);
    });
  }
  // Sablon dizeler (`...${x}...`): degisken yerleri ayrac sayilir
  const sab = /`((?:\\.|[^`\\])*)`/g;
  while ((m = sab.exec(kaynak))) {
    m[1].split(/\$\{[^}]*\}|<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_HARF.test(t)) return;
      if (sozluk.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsEksik.has(t)) jsEksik.set(t, f);
    });
  }
  // Turkce harf tasimayan ama arayuze giden metin ("Sayfada Kal", "Kapat"): onay penceresi
  // alanlari ve cevirinin gectigi cagrilar harf bakilmadan taranir.
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

// ---- 8. ana surecin kullaniciya giden metni ----
// Tepsi menusu, dosya pencereleri, bildirimler, arayuze donen hata mesajlari ve etkinlik
// akisina giden metinler (main.js, src/core, src/services). Kayit satirlari (log) ve yorumlar
// ayiklanir; kalan Turkce harfli her metnin sozlukte karsiligi olmali (bkz src/core/ceviri.js).
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
    .replace(/\blog\((?:[^()]|\([^()]*\))*\)/g, '')          // kayit satirlari kullaniciya gitmez
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

// ---- 9. HTML parcasi tasiyan anahtar ----
bolum(9, 'HTML parcasi tasiyan anahtar');
let htmlAnahtar = 0;
sozluk.en.forEach((_v, k) => {
  if (/<\/?[a-z][^>]*>|style="/i.test(k)) { htmlAnahtar++; hata++; yaz('  HATA ' + k.slice(0, 90)); }
});
if (!htmlAnahtar) yaz('  temiz');

// ---- 10. yer tutucu ----
// Anahtardaki her '#' ceviride de bulunmali; eksikse deger kaybolur, fazlaysa ekranda '#'
// kalir. Sirayi degistiren ceviri #1, #2 yazar (bkz i18n.js yerTutucuDoldur); duz '#' ile
// karisik yazilirsa sayac kayar, o yuzden ikisi bir arada olamaz.
// Istisna: tekil bicimi yalnizca 1'e dusen dillerde (en, de, es) tekil bicim sayiyi
// yazmayabilir ("The game already has..."). Rusca tekil bicim 21, 31'i de kapsar, sayi sart.
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

// ---- ozet ----
yaz('\n================================');
yaz('HATA  : ' + hata);
yaz('UYARI : ' + uyari);
yaz('SONUC : ' + (hata ? 'BASARISIZ' : 'GECTI'));
process.exit(hata ? 1 : 0);
