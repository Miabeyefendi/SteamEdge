// Colour contrast of the four themes (dark, night purple, white, high contrast) and the rules the pages follow for readable text.
// theme.js is loaded the way a page loads it (with stand-ins for the browser) and its palettes are read back from it.
// Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..', '..');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

const sandbox = {
  window: { matchMedia: () => ({ matches: false }) },
  document: { readyState: 'complete', addEventListener() {}, documentElement: { getAttribute: () => null, setAttribute() {}, style: {} }, styleSheets: [], body: null, createElement: () => ({}), head: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: function () { this.observe = () => {}; },
};
sandbox.window.localStorage = sandbox.localStorage;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'main', 'js', 'theme.js'), 'utf8'), sandbox);
const PAL = sandbox.window.themePalettes;
check('theme.js hands its palettes over (midnight, white, contrast)', !!PAL && !!PAL.midnight && !!PAL.white && !!PAL.contrast);

const lum = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// the colours of the dark theme, which is the source; every other theme maps them
const TEXT = { title: 'dce2fa', body: 'b9c0d6', muted: '8b8f9e', dim: '7f879b', accent: 'c2aaee', ok: '5fb324', warn: 'b37e24', info: '24aeb3', red: 'e45a86' };
const SURFACE = { page: '030305', alt: '090c12', card: '0d1118', raised: '101621', field: '151c28' };
const themes = { dark: {}, midnight: PAL.midnight, white: PAL.white, contrast: PAL.contrast };
for (const [name, map] of Object.entries(themes)) {
  const to = (h) => (map && map[h]) || h;
  const need = name === 'contrast' ? 7 : 4.5;
  let worst = Infinity, worstAt = '';
  for (const [tn, tc] of Object.entries(TEXT)) {
    for (const [sn, sc] of Object.entries(SURFACE)) {
      const r = ratio(to(tc), to(sc));
      if (r < worst) { worst = r; worstAt = tn + ' on ' + sn + ' (' + to(tc) + ' / ' + to(sc) + ')'; }
    }
  }
  check(name + ': every text colour is ' + need + ' : 1 or better on every surface', worst >= need, 'worst ' + worst.toFixed(2) + ' ' + worstAt);
  // white text on the brand button and on the red button (the red one is also a background, see the source colours)
  const onBrand = ratio('ffffff', to('5624b3')), onRed = ratio('ffffff', to('b32453'));
  check(name + ': white text on the purple and red buttons is 4.5 : 1 or better', onBrand >= 4.5 && onRed >= 4.5, onBrand.toFixed(2) + ' / ' + onRed.toFixed(2));
  // borders of controls: 3 : 1 against the surface they sit on (WCAG 1.4.11) for the high contrast theme
  if (name === 'contrast') check('contrast: the border of a control is 3 : 1 or better against the page', ratio(to('2b3345'), to('030305')) >= 3 && ratio(to('2b3345'), to('151c28')) >= 3);
}

// the source: no text smaller than 11 px, none of the old dim colour, red text uses the readable red
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'lang' && e.name !== 'fonts') walk(p); }
    else if (/\.(html|js|css)$/.test(e.name)) files.push(p);
  }
})(path.join(root, 'src'));
let small = [], oldDim = [], redText = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f);
  for (const m of s.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) if (parseFloat(m[1]) < 11) small.push(rel + ' ' + m[0]);
  if (!f.endsWith('theme.js') && /#656D80/i.test(s)) oldDim.push(rel);
  for (const m of s.matchAll(/(^|[^-\w])color\s*:\s*['"]?#B32453/gi)) redText.push(rel);
}
// every text colour the source writes, as each theme draws it, reads 4.5 : 1 on that theme's surfaces, except dark text on bright fills, the purple
// (used on the light theme's surfaces) and the unfilled star of the ratings (a symbol, not text)
const NOT_TEXT = ['030305', '5624b3', '33465a'];
const textColours = new Set();
for (const f of files) {
  if (f.endsWith('theme.js')) continue;
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?<![-w])colors*:s*['"]?#([0-9a-fA-F]{6})/g)) if (!NOT_TEXT.includes(m[1].toLowerCase())) textColours.add(m[1].toLowerCase());
}
for (const [name, map] of Object.entries(themes)) {
  const to = (h) => (map && map[h]) || h;
  const need = name === 'contrast' ? 7 : 4.5;
  const dim = {};
  for (const h of textColours) {
    const r = Math.min(...Object.values(SURFACE).map((sc) => ratio(to(h), to(sc))));
    if (r < need) dim[h + ' -> ' + to(h)] = r.toFixed(2);
  }
  check(name + ': every text colour in the source reads ' + need + ' : 1 on its surfaces', Object.keys(dim).length === 0, JSON.stringify(dim));
}
check('no text under 11 px in the pages, styles and scripts', small.length === 0, small.slice(0, 3).join('; '));
check('the old dim colour #656D80 (3.3 : 1) is gone from the source', oldDim.length === 0, oldDim.join(', '));
check('red text uses #E45A86; #B32453 stays for backgrounds and borders', redText.length === 0, redText.slice(0, 3).join(', '));

process.exit(failures ? 1 : 0);
