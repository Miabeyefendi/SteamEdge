// Translation for the main process. Uses the SAME dictionaries as the interface (src/main/js/lang/<code>.json):
// the key is the Turkish text itself, text that carries a number falls onto the '#' pattern (see i18n.js).
//
// Why it was needed: the tray menu, titles of file dialogs, desktop notifications and the error messages
// returned to the interface are produced in the main process and came out Turkish in every language. The Steam
// engine's error texts were also written without Turkish letters ("zaman asimina ugradi").
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'main', 'js', 'lang');
const LANGS = ['tr', 'en', 'de', 'es', 'zh', 'ru'];
let lang = 'tr';
let table = null;

function pickLang(codeStr) {
  const newItem = LANGS.includes(codeStr) ? codeStr : 'en';
  if (newItem === lang && (newItem === 'tr' || table)) return;
  lang = newItem;
  table = null;
  if (lang === 'tr') return;
  try { table = JSON.parse(fs.readFileSync(path.join(DIR, lang + '.json'), 'utf8')); }
  catch (_) { lang = 'tr'; table = null; }   // if the dictionary cannot be read, stay in the source language
}
function chosen() { return lang; }

const normKey = (s) => s.replace(/\d[\d.,]*/g, '#');
const numbers = (s) => s.match(/\d[\d.,]*/g) || [];
const LOCAL = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', es: 'es-ES', zh: 'zh-TW', ru: 'ru-RU' };

// Plural form selection (same rule as i18n.js in the interface): the value can be "singular|plural" or
// "one|few|many" for Russian, and is chosen by the first number in the text.
function pluralPick(rawValue, num) {
  if (!rawValue || rawValue.indexOf('|') < 0) return rawValue;
  const formatStr = rawValue.split('|');
  const n = Math.abs(Number(String(num == null ? '' : num).replace(/[^\d]/g, '')) || 0);
  let layer = 'other';
  try { layer = new Intl.PluralRules(LOCAL[lang] || 'tr-TR').select(n); } catch (_) {}
  if (formatStr.length >= 3) return formatStr[layer === 'one' ? 0 : layer === 'few' ? 1 : 2];
  return formatStr[layer === 'one' ? 0 : 1];
}

// Puts the values into the placeholders (same rule as i18n.js in the interface): a plain '#' fills in order,
// a language whose sentence structure differs swaps the order with #1, #2.
function fillPlaceholder(text, degerler) {
  let i = 0;
  return String(text).replace(/#([1-9])?/g, (_, n) => {
    if (n) return Number(n) <= degerler.length ? String(degerler[n - 1]) : '#' + n;
    return i < degerler.length ? String(degerler[i++]) : '#';
  });
}

// Translates raw Turkish text into the selected language. If there is no entry it returns the text unchanged.
function t(src) {
  if (lang === 'tr' || !table || !src || typeof src !== 'string') return src;
  const flat = src.replace(/\s+/g, ' ').trim();
  if (!flat) return src;
  let goal = table[flat];
  if (goal === undefined) {
    goal = table[normKey(flat)];
    if (goal === undefined) return src;
    const s = numbers(flat);
    goal = fillPlaceholder(pluralPick(goal, s[0]), s);
  } else goal = pluralPick(goal, null);
  return goal;
}
// Template that carries values: tf('# oyun sırada.', 5). The plural form follows the first numeric value.
function tf(template, ...degerler) {
  const rawText = (lang !== 'tr' && table) ? table[String(template).replace(/\s+/g, ' ').trim()] : undefined;
  let translation;
  if (rawText !== undefined) {
    const num = degerler.map((v) => String(v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()).find((v) => /^\d[\d.,]*$/.test(v));
    translation = pluralPick(rawText, num);
  } else translation = t(template);
  return fillPlaceholder(translation, degerler);
}

module.exports = { pickLang: pickLang, chosenOne: chosen, t, tf };
