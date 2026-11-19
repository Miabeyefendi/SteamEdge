// The license page of the Setup (Inno Setup) draws the text in a small box with a proportional font. NOTICE and LICENSE are written in 80 columns with
// hard line breaks, so every line was wrapped a second time by the box, the rules of "=" ran over, and the page looked broken. This makes the text fit the
// box without touching a word: the lines of a paragraph that was wrapped by hand are joined (the box wraps them where it must), list items, headings and
// short lines keep their own line, and the rule lines are shortened. Only spaces and line breaks change; the test (tests/unit/setup-license.test.js) checks it.
const RULE_WIDTH = 48;       // "=" is a wide character: 48 of them leave room on the right of the box at the usual screen scalings
const WRAPPED_AT = 60;       // a line this long, with more text under it, was wrapped by hand

const isRule = (l) => /^\s*([=\-_*])\1{9,}\s*$/.test(l);
// a new list item or a label such as "EN:" starts its own line
const isItem = (l) => /^\s*(\(?[0-9a-zA-Z]{1,3}[.)]\s|[-*\u2022]\s|[A-Z]{2}:\s)/.test(l);

function fitLicense(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (isRule(lines[i])) { out.push(lines[i].trim()[0].repeat(RULE_WIDTH)); continue; }
    let cur = lines[i].replace(/\s+$/, '');
    // join while the line just taken is long and the next one continues it
    while (i + 1 < lines.length && lines[i].trim().length >= WRAPPED_AT) {
      const next = lines[i + 1];
      if (!next.trim() || isRule(next) || isItem(next)) break;
      // a word broken at its hyphen ("closed-" / "source") is joined without a space
      cur += (/[A-Za-z]-$/.test(cur) && /^\s*[a-z]/.test(next) ? '' : ' ') + next.trim();
      i++;
    }
    out.push(cur);
  }
  return out.join('\r\n');
}

module.exports = { fitLicense, RULE_WIDTH };
