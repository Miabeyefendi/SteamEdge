/* Language audit.
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
 *  * Run:  npm run lang
 *  *       npm run lang -- --full    (without truncating long lists)
 *  *       npm run lang -- --dump <file>   (write the key list out)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'src', 'main', 'js', 'lang');
const PAGES_DIR = path.join(ROOT, 'src', 'main', 'pages');
const JS_DIR = path.join(ROOT, 'src', 'main', 'js');
const LANGS = ['en', 'de', 'es', 'zh', 'ru'];

let fail = 0;
let warn = 0;
const print = (s) => process.stdout.write(s + '\n');
const section = (n, b) => print('\n' + n + '. ' + b);
const FULL = process.argv.includes('--full');   // write long lists without truncating

// ---- read the dictionaries ----
const dictionary = {};
LANGS.forEach((d) => {
  const p = path.join(LANG_DIR, d + '.json');
  if (!fs.existsSync(p)) {
    fail++;
    print('ERROR dictionary missing: ' + path.relative(ROOT, p));
    dictionary[d] = new Map();
    return;
  }
  try {
    dictionary[d] = new Map(Object.entries(JSON.parse(fs.readFileSync(p, 'utf8'))));
  } catch (e) {
    fail++;
    print('ERROR broken JSON: ' + path.relative(ROOT, p) + ' - ' + e.message);
    dictionary[d] = new Map();
  }
});

// When adding a new language the full list of keys to translate is needed.
const dumpIdx = process.argv.indexOf('--dump');
if (dumpIdx > 0 && process.argv[dumpIdx + 1]) {
  const lines = [...dictionary.en.entries()]
    .map(([k, v]) => JSON.stringify({ k, en: v }))
    .join('\n');
  fs.writeFileSync(process.argv[dumpIdx + 1], lines, 'utf8');
  print('key: ' + dictionary.en.size + ', character: ' + lines.length);
  process.exit(0);
}

section(1, 'Dictionary size');
LANGS.forEach((d) => print('  ' + d + ': ' + dictionary[d].size + ' keys'));

// ---- 2. consistency between languages ----
section(2, 'Keys missing between languages');
const allKeys = new Set();
LANGS.forEach((d) => dictionary[d].forEach((_v, k) => allKeys.add(k)));
let missingTotal = 0;
LANGS.forEach((d) => {
  const missing = [...allKeys].filter((k) => !dictionary[d].has(k));
  if (missing.length) {
    missingTotal += missing.length;
    warn++;
    print('  ' + d + ': ' + missing.length + ' missing');
    missing.slice(0, 8).forEach((k) => print('      ' + k.slice(0, 70)));
    if (missing.length > 8) print('      ... and ' + (missing.length - 8) + ' more');
  }
});
if (!missingTotal) print('  all languages have the same key set');

// ---- 3. untranslated: the value is the same as the key ----
section(3, 'Untranslated entries (value equals the key)');
let sameTotal = 0;
LANGS.forEach((d) => {
  const same = [];
  dictionary[d].forEach((v, k) => { if (v === k && k.length > 3) same.push(k); });
  if (same.length) {
    sameTotal += same.length;
    warn++;
    print('  ' + d + ': ' + same.length + ' entries untranslated');
    same.slice(0, 6).forEach((k) => print('      ' + k.slice(0, 70)));
  }
});
if (!sameTotal) print('  no untranslated entries');

// ---- 4. language mix-up: another alphabet in one language's value ----
// A Chinese notification was seen in the Turkish interface; this can happen when a value from the wrong
// alphabet sits in a language's block.
section(4, 'Wrong script (language block and value do not match)');
const CJK = /[一-鿿]/;
const KIRIL = /[Ѐ-ӿ]/;
let mixed = 0;
LANGS.forEach((d) => {
  dictionary[d].forEach((v, k) => {
    const cjk = CJK.test(v), cyrillic = KIRIL.test(v);
    if (d !== 'zh' && cjk) { mixed++; fail++; print('  ERROR ' + d + ' block has a Chinese value: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40)); }
    if (d !== 'ru' && cyrillic) { mixed++; fail++; print('  ERROR ' + d + ' block has a Cyrillic value: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40)); }
    if (d === 'ru' && !cyrillic && v !== k && /[A-Za-z]{4}/.test(v)) {
      // A Russian value that carries no Cyrillic shows that the entry was left untranslated.
      // Brand names (SteamEdge, HLTB) and numbers are outside this criterion.
      mixed++; fail++; print('  ERROR ru block has a Latin value: ' + k.slice(0, 40) + ' -> ' + v.slice(0, 40));
    }
  });
});
if (!mixed) print('  every language block uses its own script');

// ---- 5. Chinese variant consistency ----
// The app ships with the zh-TW (Traditional) package. The values in the dictionary must be in the same
// variant too, otherwise the interface becomes half Traditional, half Simplified.
section(5, 'Chinese variant');
const SIMPLIFIED_MARKS = ['设', '页', '这', '时', '开', '关', '数', '经', '过', '选', '记', '认'];
const TRADITIONAL_MARKS = ['設', '頁', '這', '時', '開', '關', '數', '經', '過', '選', '記', '認'];
let simplified = 0, traditional = 0;
dictionary.zh.forEach((v) => {
  SIMPLIFIED_MARKS.forEach((c) => { if (v.indexOf(c) >= 0) simplified++; });
  TRADITIONAL_MARKS.forEach((c) => { if (v.indexOf(c) >= 0) traditional++; });
});
print('  simplified marks: ' + simplified + ', traditional marks: ' + traditional);
if (simplified && traditional) { fail++; print('  ERROR the two variants are mixed'); }
else print('  variant is consistent');

// ---- 6. text in the interface that is not in the dictionary ----
// The visible Turkish texts in the page HTML. Every text without a key stays Turkish
// in the languages other than Turkish.
section(6, 'Interface text without a dictionary entry');
const TR_LETTER = /[çğıöşüÇĞİÖŞÜ]/;

// Removes <!-- ... --> comments (an unterminated one stays). Same result as .replace(/<!--[\s\S]*?-->/g, '')
// but done with a plain scan.
function stripHtmlComments(s) {
  let out = '';
  let i = 0;
  for (;;) {
    const a = s.indexOf('<!--', i);
    if (a < 0) return out + s.slice(i);
    const b = s.indexOf('-->', a + 4);
    if (b < 0) return out + s.slice(i);
    out += s.slice(i, a);
    i = b + 3;
  }
}

// Removes <script>...</script> and <style>...</style> blocks. Same result as
// .replace(/<(script|style)[\s\S]*?<\/\1>/g, '') but done with a plain scan.
function stripBlocks(s) {
  let out = '';
  let i = 0;
  for (;;) {
    const p = s.indexOf('<script', i);
    const q = s.indexOf('<style', i);
    let a = -1;
    let tag = '';
    if (p >= 0 && (q < 0 || p < q)) { a = p; tag = 'script'; } else if (q >= 0) { a = q; tag = 'style'; }
    if (a < 0) return out + s.slice(i);
    const e = s.indexOf('</' + tag + '>', a + 1 + tag.length);
    if (e < 0) { out += s.slice(i, a + 1); i = a + 1; continue; }
    out += s.slice(i, a);
    i = e + tag.length + 3;
  }
}

// Stripping comments and script/style is repeated until the result stops changing. A single pass
// is not enough: when the stripped part's two sides join a new "<!--" can form.
function extract(text) {
  let previous;
  do {
    previous = text;
    text = stripBlocks(stripHtmlComments(text));
  } while (text !== previous);
  return text;
}

// Entity decoding is done in a single pass. Doing it in sequence turned "&amp;nbsp;" first into "&nbsp;"
// and then into a space, so the text was decoded twice.
const ENTITIES = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function decodeEntities(text) {
  return text.replace(/&(?:amp|nbsp|lt|gt|quot|#39);/g, (v) => ENTITIES[v]);
}
const missingText = [];
// Text that carries no Turkish letter can be Turkish too ("DK", "SN", "dk"). Before, only
// text with Turkish letters was scanned; the timer's "DK : SN" label stayed Turkish in every language because of this and
// was never caught. Now every text that has letters is scanned; the special names that are deliberately not translated
// (language names, brand, package, driver) are in the list below.
const UNTRANSLATABLE = new Set(['English', 'Deutsch', 'Español', 'ms', 'MB', 'Direct3D 11', 'Direct3D 9', 'OpenGL',
  'SteamEdge', 'Steam', 'Edge', 'Miabeyefendi', 'Idle Master', 'Idle Master Extended', 'HourBoostr',
  'Steam Achievement Manager', 'ArchiSteamFarm', 'steam-user', 'steam-session', 'qrcode',
  'SteamID', 'SteamID2', 'SteamID3', 'Hex', 'APP-ID', 'HEADLESS']);
const isUntranslatable = (t) => UNTRANSLATABLE.has(t) || /^@\w+$/.test(t) || /^[\w-]+ \d+(\.\d+)+$/.test(t);
// The login screen sits outside the page folder and so for years it was never scanned;
// it still held outdated hand-written text like "v1.0.8". It was added to the list.
// The shell (sidebar, top bar, status line) is also outside the page folder: main.html.
const HTML_FILES = fs.readdirSync(PAGES_DIR)
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ ad: f, yol: path.join(PAGES_DIR, f) }))
  .concat([{ ad: 'login.html', yol: path.join(ROOT, 'src', 'login', 'login.html') },
           { ad: 'main.html', yol: path.join(ROOT, 'src', 'main', 'main.html') }])
  .filter((x) => fs.existsSync(x.yol));
HTML_FILES.forEach(({ ad: f, yol: pathStr }) => {
  const html = fs.readFileSync(pathStr, 'utf8');
  const visible = extract(html);
  // Text nodes (no length limit) and translated attributes (the same list as i18n.js)
  const parts = [];
  const re = />([^<>{}]{2,})</g;
  let m;
  while ((m = re.exec(visible))) parts.push(m[1]);
  const own = /\s(?:title|placeholder|data-tip)="([^"]+)"/g;
  while ((m = own.exec(visible))) parts.push(m[1]);
  parts.forEach((raw) => {
    const t = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    if (!t || !/[A-Za-zçğıöşüÇĞİÖŞÜ]{2}/.test(t)) return;   // if there are no letters (numbers, signs) leave it alone
    if (!TR_LETTER.test(t) && isUntranslatable(t)) return;
    // At run time the key is stripped of numbers (i18nNormKey): "7 gun" and
    // "30 gun" fall onto the same entry. The same normalisation must be applied here, otherwise
    // every text that carries a number would wrongly look "missing".
    const norm = (x) => x.replace(/\d[\d.,]*/g, '#');
    if (dictionary.en.has(t) || dictionary.en.has(norm(t))) return;
    if ([...dictionary.en.keys()].some((k) => norm(k) === norm(t))) return;
    missingText.push(f + ': ' + (FULL ? t : t.slice(0, 60)));
  });
});
if (missingText.length) {
  warn++;
  print('  ' + missingText.length + ' texts have no dictionary entry');
  const list = [...new Set(missingText)];
  (FULL ? list : list.slice(0, 12)).forEach((x) => print('      ' + x));
  if (!FULL && list.length > 12) print('      ... and ' + (list.length - 12) + ' more (npm run lang -- --full)');
} else print('  every Turkish interface text has an entry');

// ---- 7. text produced by the page JS files ----
// Section 6 only scans HTML. Warning boxes, empty-state texts and toasts sit inside JS as
// strings; without a translation for them the interface stays half translated.
// Because the criterion is coarse (code fragments are also in quotes) it counts as a WARNING, not an ERROR.
section(7, 'Page JS texts (no dictionary entry)');
const normA = (x) => x.replace(/\d[\d.,]*/g, '#');
const enNorm = new Set([...dictionary.en.keys()].map(normA));
const jsMissing = new Map();
// The <script> blocks inside HTML are scanned too. The whole logic of the sign-in screen lives inside
// login.html; section 6 strips the scripts, so status texts such as "Kod gönderiliyor..." and
// "Bağlanılıyor..." never showed up in any section until 1.3.3 and stayed Turkish in every language.
const jsSources = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js') && f !== 'i18n.js')
  .map((f) => ({ displayName: f, text: fs.readFileSync(path.join(JS_DIR, f), 'utf8') }));
HTML_FILES.forEach(({ ad: displayName, yol: pathStr }) => {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const html = fs.readFileSync(pathStr, 'utf8');
  let m;
  while ((m = re.exec(html))) jsSources.push({ displayName, text: m[1] });
});
jsSources.forEach(({ displayName: f, text }) => {
  const source = text
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"/g;
  let m;
  while ((m = re.exec(source))) {
    // Escape sequences are turned into their run time form: text written as \' in the source becomes ' on screen.
    const raw = (m[1] !== undefined ? m[1] : m[2]);
    if (!raw || !TR_LETTER.test(raw)) continue;
    // Strip the tags and keep only the visible text. A piece can start and end in the middle of a tag
    // ('">Giriş yap', '<span style="'): the remains of a half tag do not count as text.
    const visible = raw.replace(/\\(['"])/g, '$1').replace(/\\n/g, ' ')
      .replace(/^[^<>]*"[^<>]*>/, '').replace(/<[^>]*$/, '');
    visible.split(/<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_LETTER.test(t)) return;
      if (dictionary.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsMissing.has(t)) jsMissing.set(t, f);
    });
  }
  // Template strings (`...${x}...`): the variable places count as separators
  const constant = /`((?:\\.|[^`\\])*)`/g;
  while ((m = constant.exec(source))) {
    m[1].split(/\$\{[^}]*\}|<[^>]*>/).forEach((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (t.length < 4 || !TR_LETTER.test(t)) return;
      if (dictionary.en.has(t) || enNorm.has(normA(t))) return;
      if (!jsMissing.has(t)) jsMissing.set(t, f);
    });
  }
  // Text that carries no Turkish letter but goes to the interface ("Sayfada Kal", "Kapat"): confirm dialog
  // fields and the calls translation passes through are scanned without looking at letters.
  const ui = /\b(?:confirmText|cancelText|altText|tag|title|body|warn)\s*:\s*'((?:\\.|[^'\\\n])+)'|\b(?:t|tf|toast)\(\s*'((?:\\.|[^'\\\n])+)'/g;
  while ((m = ui.exec(source))) {
    const t = (m[1] !== undefined ? m[1] : m[2]).replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
    if (t.length < 3 || /^#[0-9A-Fa-f]{3,8}$/.test(t) || !/[a-zA-Z]{3}/.test(t) || /^[\w.-]+$/.test(t) && !/\s/.test(t) && /[a-z][A-Z]|_|^[a-z]+$/.test(t)) continue;
    if (dictionary.en.has(t) || enNorm.has(normA(t))) continue;
    if (!jsMissing.has(t)) jsMissing.set(t, f);
  }
});
if (jsMissing.size) {
  warn++;
  print('  ' + jsMissing.size + ' texts have no dictionary entry');
  const list = [...jsMissing].map(([t, f]) => f + ': ' + (FULL ? t : t.slice(0, 70)));
  (FULL ? list : list.slice(0, 12)).forEach((x) => print('      ' + x));
  if (!FULL && list.length > 12) print('      ... and ' + (list.length - 12) + ' more (npm run lang -- --full)');
} else print('  every Turkish text inside JS has an entry');

// ---- 8. the main process text that goes to the user ----
// The tray menu, file dialogs, notifications, error messages returned to the interface and the texts that go to the
// activity feed (main.js, src/core, src/services). Log lines and comments are stripped;
// every remaining text with Turkish letters must have a dictionary entry (see src/core/translation.js).
section(8, 'Main process texts (no dictionary entry)');
const mainMissing = new Map();
const mainFiles = [path.join(ROOT, 'main.js')]
  .concat(fs.readdirSync(path.join(ROOT, 'src', 'core')).map((f) => path.join(ROOT, 'src', 'core', f)))
  .concat(fs.readdirSync(path.join(ROOT, 'src', 'services')).map((f) => path.join(ROOT, 'src', 'services', f)))
  .filter((f) => f.endsWith('.js') && !f.endsWith('translation.js'));
mainFiles.forEach((pathStr) => {
  const f = path.relative(ROOT, pathStr).replace(/\\/g, '/');
  const source = fs.readFileSync(pathStr, 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\blog\((?:[^()]|\([^()]*\))*\)/g, '')          // log lines do not go to the user
    .replace(/\bwriteCrash\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/'\s*\+\s*'/g, '');                            // a text split across lines is one key
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"/g;
  let m;
  while ((m = re.exec(source))) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    if (!raw || !TR_LETTER.test(raw)) continue;
    const t = raw.replace(/\\(['"])/g, '$1').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 3) continue;
    if (dictionary.en.has(t) || enNorm.has(normA(t))) continue;
    if (!mainMissing.has(t)) mainMissing.set(t, f);
  }
});
if (mainMissing.size) {
  warn++;
  print('  ' + mainMissing.size + ' texts have no dictionary entry');
  const list = [...mainMissing].map(([t, f]) => f + ': ' + (FULL ? t : t.slice(0, 70)));
  (FULL ? list : list.slice(0, 12)).forEach((x) => print('      ' + x));
  if (!FULL && list.length > 12) print('      ... and ' + (list.length - 12) + ' more (npm run lang -- --full)');
} else print('  every Turkish text of the main process has an entry');

// ---- 9. a key that carries an HTML fragment ----
section(9, 'Key that carries an HTML fragment');
let htmlKey = 0;
dictionary.en.forEach((_v, k) => {
  if (/<\/?[a-z][^>]*>|style="/i.test(k)) { htmlKey++; fail++; print('  ERROR ' + k.slice(0, 90)); }
});
if (!htmlKey) print('  clean');

// ---- 10. placeholder ----
// Every '#' in the key must be in the translation too; if it is missing the value is lost, if there are extra a '#'
// stays on screen. A translation that changes the order writes #1, #2 (see i18n.js yerTutucuDoldur); if it is mixed
// with a plain '#' the counter slips, so the two cannot be together.
// Exception: in languages where the singular covers only 1 (en, de, es) the singular form may
// leave out the number ("The game already has..."). The Russian singular also covers 21 and 31, so the number is required.
const SINGULAR_ONE = new Set(['en', 'de', 'es']);
section(10, 'Placeholders (# count and #1, #2 order)');
let placeholderError = 0;
LANGS.forEach((d) => {
  dictionary[d].forEach((v, k) => {
    const n = (k.match(/#/g) || []).length;
    const formats = String(v).split('|');
    formats.forEach((format, order) => {
      const singularless = SINGULAR_ONE.has(d) && formats.length > 1 && order === 0;
      const ordered = format.match(/#[1-9]/g) || [];
      const flat = (format.match(/#(?![1-9])/g) || []).length;
      let problem = '';
      if (ordered.length && flat) problem = 'plain # mixed with #1';
      else if (ordered.length) {
        const group = new Set(ordered);
        if (ordered.some((x) => Number(x[1]) > n)) problem = 'order not present in the key';
        else if (group.size !== n) problem = n + ' values, ' + group.size + ' ordered placeholders';
      } else if (flat !== n && !(singularless && flat === n - 1)) problem = n + ' values, in the translation ' + flat;
      if (problem) { placeholderError++; fail++; print('  ERROR ' + d + ' ' + JSON.stringify(k).slice(0, 70) + ': ' + problem); }
    });
  });
});
if (!placeholderError) print('  every translation carries the values of its key');

// ---- summary ----
print('\n================================');
print('ERRORS  : ' + fail);
print('WARNINGS: ' + warn);
print('RESULT  : ' + (fail ? 'FAILED' : 'PASSED'));
process.exit(fail ? 1 : 0);
