// The license page of the Setup draws NOTICE and LICENSE in a small box with a proportional font; the files are written in 80 columns with hard line
// breaks, so the box wrapped every line a second time and the "=" rules ran over (seen in 4.4.0). build/licenseFit.js makes the text fit without touching a
// word. Checked here: not one character of the text changes (only spaces, line breaks and the length of the rules), the rules are short, list items and
// labels keep their own line, a word broken at its hyphen is whole again, and the long lines that remain are paragraphs the box wraps itself.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const { fitLicense, RULE_WIDTH } = require(path.join(root, 'build', 'licenseFit.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const isRule = (l) => /^\s*([=\-_*])\1{9,}\s*$/.test(l);
const letters = (t) => t.split(/\r?\n/).filter((l) => !isRule(l)).join('').replace(/\s+/g, '');

for (const f of ['NOTICE', 'LICENSE']) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  const fit = fitLicense(text);
  const lines = fit.split('\r\n');
  check(f + ': not a character changes (only spaces, line breaks and the length of the rules)', letters(fit) === letters(text));
  check(f + ': the rules fit the box (' + RULE_WIDTH + ' characters)', lines.filter(isRule).every((l) => l.length === RULE_WIDTH) && lines.filter(isRule).length === text.split(/\r?\n/).filter(isRule).length);
  check(f + ': the lines are joined with Windows line breaks only', !/(^|[^\r])\n/.test(fit));
  const items = text.split(/\r?\n/).filter((l) => /^\s*(\(?[0-9a-zA-Z]{1,3}[.)]\s|[-*•]\s|[A-Z]{2}:\s)/.test(l)).map((l) => l.trim());
  check(f + ': every list item and label still starts its own line (' + items.length + ')', items.every((it) => lines.some((l) => l.trim().startsWith(it.slice(0, 40)))));
  check(f + ': blank lines between paragraphs stay', lines.filter((l) => !l.trim()).length >= text.split(/\r?\n/).filter((l) => !l.trim()).length * 0.95, lines.filter((l) => !l.trim()).length + ' of ' + text.split(/\r?\n/).filter((l) => !l.trim()).length);
}

// a small made-up text with the cases
const sample = [
  '==========================================================================',
  'TITLE',
  '==========================================================================',
  '',
  'This paragraph was wrapped by hand in eighty columns, like the files are, and it has to',
  'be joined with the next line, which is long as well, so it goes on with a closed-',
  'source word broken at its hyphen, and the last short line.',
  '',
  'EN: a label starts its own line, and a long long long long long long long long long line',
  'TR: the second label too',
  '(a) an item that follows a short one',
  '(b) and the next item',
].join('\n');
const out = fitLicense(sample).split('\r\n');
check('sample: the rule is shortened', out[0] === '='.repeat(RULE_WIDTH) && out[2] === '='.repeat(RULE_WIDTH));
check('sample: a hand-wrapped paragraph becomes one line', out[4].startsWith('This paragraph was wrapped') && out[4].endsWith('and the last short line.') && out[5] === '');
check('sample: a word broken at its hyphen is whole again', out[4].includes('closed-source word') && !out[4].includes('closed- source'));
check('sample: labels and items keep their own lines', out[6].startsWith('EN: a label') && out[7] === 'TR: the second label too' && out[8].startsWith('(a) ') && out[9].startsWith('(b) '), JSON.stringify(out.slice(6)));
process.exit(failures ? 1 : 0);
