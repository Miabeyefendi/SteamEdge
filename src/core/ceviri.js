// Translation for the main process. Uses the SAME dictionaries as the interface (src/main/js/lang/<code>.json):
// the key is the Turkish text itself, text that carries a number falls onto the '#' pattern (see i18n.js).
//
// Why it was needed: the tray menu, titles of file dialogs, desktop notifications and the error messages
// returned to the interface are produced in the main process and came out Turkish in every language. The Steam
// engine's error texts were also written without Turkish letters ("zaman asimina ugradi").
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
  catch (_) { dil = 'tr'; tablo = null; }   // if the dictionary cannot be read, stay in the source language
}
function secili() { return dil; }

const normAnahtar = (s) => s.replace(/\d[\d.,]*/g, '#');
const sayilar = (s) => s.match(/\d[\d.,]*/g) || [];
const YEREL = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', es: 'es-ES', zh: 'zh-TW', ru: 'ru-RU' };

// Plural form selection (same rule as i18n.js in the interface): the value can be "singular|plural" or
// "one|few|many" for Russian, and is chosen by the first number in the text.
function cogulSec(deger, sayi) {
  if (!deger || deger.indexOf('|') < 0) return deger;
  const bicim = deger.split('|');
  const n = Math.abs(Number(String(sayi == null ? '' : sayi).replace(/[^\d]/g, '')) || 0);
  let kat = 'other';
  try { kat = new Intl.PluralRules(YEREL[dil] || 'tr-TR').select(n); } catch (_) {}
  if (bicim.length >= 3) return bicim[kat === 'one' ? 0 : kat === 'few' ? 1 : 2];
  return bicim[kat === 'one' ? 0 : 1];
}

// Puts the values into the placeholders (same rule as i18n.js in the interface): a plain '#' fills in order,
// a language whose sentence structure differs swaps the order with #1, #2.
function yerTutucuDoldur(metin, degerler) {
  let i = 0;
  return String(metin).replace(/#([1-9])?/g, (_, n) => {
    if (n) return Number(n) <= degerler.length ? String(degerler[n - 1]) : '#' + n;
    return i < degerler.length ? String(degerler[i++]) : '#';
  });
}

// Translates raw Turkish text into the selected language. If there is no entry it returns the text unchanged.
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
// Template that carries values: tf('# oyun sırada.', 5). The plural form follows the first numeric value.
function tf(sablon, ...degerler) {
  const ham = (dil !== 'tr' && tablo) ? tablo[String(sablon).replace(/\s+/g, ' ').trim()] : undefined;
  let ceviri;
  if (ham !== undefined) {
    const sayi = degerler.map((v) => String(v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()).find((v) => /^\d[\d.,]*$/.test(v));
    ceviri = cogulSec(ham, sayi);
  } else ceviri = t(sablon);
  return yerTutucuDoldur(ceviri, degerler);
}

module.exports = { dilSec, secili, t, tf };
