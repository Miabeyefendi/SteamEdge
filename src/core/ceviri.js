// Ana sürecin çevirisi. Arayüzle AYNI sözlükleri kullanır (src/main/js/lang/<kod>.json):
// anahtar Türkçe metnin kendisi, sayı taşıyan metin '#' desenine düşer (bkz i18n.js).
//
// Neden gerekti: tepsi menüsü, dosya pencerelerinin başlıkları, masaüstü bildirimleri ve
// arayüze dönen hata mesajları ana süreçte üretiliyor ve her dilde Türkçe çıkıyordu. Steam
// motorunun hata metinleri de Türkçe harf kullanmadan yazılmıştı ("zaman asimina ugradi").
const fs = require('fs');
const path = require('path');

const DIZIN = path.join(__dirname, '..', 'main', 'js', 'lang');
const DILLER = ['tr', 'en', 'de', 'es', 'zh', 'ru'];
let dil = 'tr';
let tablo = null;

function dilSec(kod) {
  const yeni = DILLER.includes(kod) ? kod : 'tr';
  if (yeni === dil && (yeni === 'tr' || tablo)) return;
  dil = yeni;
  tablo = null;
  if (dil === 'tr') return;
  try { tablo = JSON.parse(fs.readFileSync(path.join(DIZIN, dil + '.json'), 'utf8')); }
  catch (_) { dil = 'tr'; tablo = null; }   // sözlük okunamazsa kaynak dilde kal
}
function secili() { return dil; }

const normAnahtar = (s) => s.replace(/\d[\d.,]*/g, '#');
const sayilar = (s) => s.match(/\d[\d.,]*/g) || [];
const YEREL = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', es: 'es-ES', zh: 'zh-TW', ru: 'ru-RU' };

// Çoğul biçim seçimi (arayüzdeki i18n.js ile aynı kural): değer "tekil|çoğul" ya da
// Rusçada "one|few|many" olabilir, metindeki ilk sayıya göre seçilir.
function cogulSec(deger, sayi) {
  if (!deger || deger.indexOf('|') < 0) return deger;
  const bicim = deger.split('|');
  const n = Math.abs(Number(String(sayi == null ? '' : sayi).replace(/[^\d]/g, '')) || 0);
  let kat = 'other';
  try { kat = new Intl.PluralRules(YEREL[dil] || 'tr-TR').select(n); } catch (_) {}
  if (bicim.length >= 3) return bicim[kat === 'one' ? 0 : kat === 'few' ? 1 : 2];
  return bicim[kat === 'one' ? 0 : 1];
}

// Değerleri yer tutuculara koyar (arayüzdeki i18n.js ile aynı kural): düz '#' sırayla dolar,
// cümle yapısı farklı olan dil sırayı #1, #2 ile değiştirir.
function yerTutucuDoldur(metin, degerler) {
  let i = 0;
  return String(metin).replace(/#([1-9])?/g, (_, n) => {
    if (n) return Number(n) <= degerler.length ? String(degerler[n - 1]) : '#' + n;
    return i < degerler.length ? String(degerler[i++]) : '#';
  });
}

// Ham Türkçe metni seçili dile çevirir. Karşılığı yoksa metni aynen döndürür.
function t(src) {
  if (dil === 'tr' || !tablo || !src || typeof src !== 'string') return src;
  const duz = src.replace(/\s+/g, ' ').trim();
  if (!duz) return src;
  let hedef = tablo[duz];
  if (hedef === undefined) {
    hedef = tablo[normAnahtar(duz)];
    if (hedef === undefined) return src;
    const s = sayilar(duz);
    hedef = yerTutucuDoldur(cogulSec(hedef, s[0]), s);
  } else hedef = cogulSec(hedef, null);
  return hedef;
}
// Değer taşıyan şablon: tf('# oyun sırada.', 5). Çoğul biçimi ilk sayısal değere göre.
function tf(sablon, ...degerler) {
  const ham = (dil !== 'tr' && tablo) ? tablo[String(sablon).replace(/\s+/g, ' ').trim()] : undefined;
  let ceviri;
  if (ham !== undefined) {
    const sayi = degerler.map((v) => String(v).replace(/<[^>]*>/g, '').trim()).find((v) => /^\d[\d.,]*$/.test(v));
    ceviri = cogulSec(ham, sayi);
  } else ceviri = t(sablon);
  return yerTutucuDoldur(ceviri, degerler);
}

module.exports = { dilSec, secili, t, tf };
