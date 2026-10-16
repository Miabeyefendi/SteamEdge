// Quick navigation: how the command palette and the settings search rank what they find, and what the Ctrl + number shortcuts open.
// Run with `npm test` (tests/run.js).
const path = require('path');
const QN = require(path.resolve(__dirname, '..', '..', 'src', 'utils', 'quickNav.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const labels = (list) => list.map((x) => x.label).join(' | ');

// folding
check('upper and lower case are the same', QN.fold('Ayarlar') === 'ayarlar' && QN.fold('SAAT') === 'saat');
check('the Turkish dotted and dotless i are the same as i', QN.fold('İşlem') === 'islem' && QN.fold('ıslak') === 'islak' && QN.fold('ISIK') === 'isik');
check('accents and umlauts are dropped', QN.fold('Größe') === 'grosse' && QN.fold('Cuenta ñ') === 'cuenta n' && QN.fold('Ünite') === 'unite' && QN.fold('Şifre ğ') === 'sifre g');
check('white space is squeezed and trimmed, nothing is nothing', QN.fold('  a   b ') === 'a b' && QN.fold(null) === '' && QN.fold(undefined) === '');

// ranking
const items = [
  { label: 'Tema rengi ve renk düzeni', keywords: 'Genel' },
  { label: 'Tema', keywords: 'Genel' },
  { label: 'Arayüz yoğunluğu', keywords: 'Genel Satır yüksekliği ve tema' },
  { label: 'Saat biçimi', keywords: 'Genel' },
  { label: 'Hesap güvenliği tema', keywords: '' },
];
check('an empty query keeps the order of the list', labels(QN.rank('', items)) === labels(items) && QN.rank('  ', items).length === items.length);
check('a limit cuts the result, empty or not', QN.rank('', items, 2).length === 2 && QN.rank('tema', items, 2).length === 2);
check('nothing matches nothing', QN.rank('zzz', items).length === 0);
const r = QN.rank('tema', items);
check('the name that is only the query comes first, then names that start with it, then names that contain it', r[0].label === 'Tema' && r[1].label === 'Tema rengi ve renk düzeni' && r[2].label === 'Hesap güvenliği tema', labels(r));
check('a match only in the keywords comes last', r[r.length - 1].label === 'Arayüz yoğunluğu' && r.length === 4, labels(r));
check('every word of the query has to be found', labels(QN.rank('tema renk', items)) === 'Tema rengi ve renk düzeni', labels(QN.rank('tema renk', items)));
check('the order of the words does not matter', QN.rank('renk tema', items).length === 1);
check('it finds across the Turkish i: "yogunlugu" and "YOĞUNLUĞU" both find the density', QN.rank('yogunlugu', items)[0].label === 'Arayüz yoğunluğu' && QN.rank('YOĞUNLUĞU', items)[0].label === 'Arayüz yoğunluğu');
check('the section in the keywords finds a setting too', QN.rank('genel', items).length === 4);
check('a word that starts a later word ranks above a hit in the middle of a word', labels(QN.rank('ve', [{ label: 'Avenue' }, { label: 'Tema ve renk' }])) === 'Tema ve renk | Avenue');
check('equal matches keep their order', labels(QN.rank('a', [{ label: 'ab' }, { label: 'ac' }, { label: 'ad' }])) === 'ab | ac | ad');

// the shortcuts
const menu = ['overview', 'card', 'inventory', 'hours', 'realistic', 'achievements', 'keys'];
check('Ctrl+1 to Ctrl+7 are the pages of the menu in the order they are shown', menu.every((p, i) => QN.pageForShortcut(i + 1, menu, true) === p));
check('a page that is off closes up the numbers', QN.pageForShortcut(2, ['overview', 'inventory', 'keys'], true) === 'inventory' && QN.pageForShortcut(4, ['overview', 'inventory', 'keys'], true) === null);
check('Ctrl+8 is the chat when it is on and nothing when it is off', QN.pageForShortcut(8, menu, true) === 'chat' && QN.pageForShortcut(8, menu, false) === null);
check('Ctrl+9 is Settings', QN.pageForShortcut(9, menu, false) === 'settings' && QN.pageForShortcut('9', [], false) === 'settings');
check('nothing else is a shortcut', QN.pageForShortcut(0, menu, true) === null && QN.pageForShortcut(10, menu, true) === null && QN.pageForShortcut('x', menu, true) === null && QN.pageForShortcut(1.5, menu, true) === null);
const table = QN.shortcutTable(['overview', 'keys'], false);
check('the help table lists only what is there', JSON.stringify(table) === '[{"keys":"Ctrl+1","page":"overview"},{"keys":"Ctrl+2","page":"keys"},{"keys":"Ctrl+9","page":"settings"}]', JSON.stringify(table));
check('and with everything on it has nine rows', QN.shortcutTable(menu, true).length === 9);

process.exit(failures ? 1 : 0);
