// CSV text for the inventory export: quoting, line ends and the guard against spreadsheet formulas.
// Run with `npm test` (tests/run.js).
const { toCsv, csvCell } = require('../../src/utils/csv');
let failures = 0;
const check = (name, condition) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name); };

check('plain text and numbers are written as they are', csvCell('Card') === 'Card' && csvCell(3) === '3' && csvCell(2.5) === '2.5');
check('empty values become empty cells', csvCell(null) === '' && csvCell(undefined) === '' && csvCell(NaN) === '');
check('a comma, a quote or a line break gets the field quoted', csvCell('a,b') === '"a,b"' && csvCell('say "hi"') === '"say ""hi"""' && csvCell('two\nlines') === '"two\nlines"');
check('a text that starts like a formula is neutralised', csvCell('=SUM(A1)') === "'=SUM(A1)" && csvCell('+1') === "'+1" && csvCell('-2') === "'-2" && csvCell('@cmd') === "'@cmd");
check('a negative number stays a number', csvCell(-2) === '-2');
check('rows are joined with CRLF and end with one', toCsv([['a', 'b'], ['c', 'd,e']]) === 'a,b\r\nc,"d,e"\r\n');
check('Turkish and other non-ASCII text is kept', csvCell('Çok şık oyun') === 'Çok şık oyun');
process.exit(failures ? 1 : 0);
