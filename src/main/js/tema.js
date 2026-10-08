// ================= THEME =================
// Colours are written inline in the pages and in JS (like #0D1118). Moving them all to variables
// would have meant touching every file; instead the colours of the dark theme are swapped at run time
// for the selected palette's counterparts: inline styles, CSS rules and every node added later.
// The dark theme is the source itself, there is no mapping. Palettes are from Vantagraph (R34Purple, VantaWhite).
// Since the login screen cannot read the settings the choice is also kept in localStorage.
(function () {
  const PALETTE = {
    midnight: {
      '030305': '050410', '090c12': '0c0818', '0d1118': '130b24', '101621': '160b2a', '151c28': '200e3c',
      '1d2432': '2a1648', '2b3345': '3a2060', '333d4d': '45286e', '252a3a': '2c1850', '1e2836': '231040',
      '0e1620': '120a22', 'dce2fa': 'f0eaf8', 'b9c0d6': 'd4c8ec', '8b8f9e': 'a898c8', '656d80': '7a6a9c',
      '5624b3': '7a3fe0', 'c2aaee': 'd8c4ff', '0f1720': '0c0818',
    },
    white: {
      '030305': 'e4e2dc', '090c12': 'f5f4f2', '0d1118': 'ffffff', '101621': 'f0eeea', '151c28': 'eceae6',
      '1d2432': 'e0ddd6', '2b3345': 'd8d4cc', '333d4d': 'c8c4bc', '252a3a': 'ddd9d2', '1e2836': 'e6e3dd',
      '0e1620': 'f2f0ec', 'dce2fa': '1a1a1a', 'b9c0d6': '3a3a3a', '8b8f9e': '6e6e6e', '656d80': '8a8a8a',
      'c2aaee': '5624b3', 'e8eaf0': '1a1a1a', 'cbd5e1': '3a3a3a', '94a3b8': '6e6e6e', '0f1720': 'f5f4f2',
    },
  };
  let matchUp = null;
  const hex2 = (n) => Number(n).toString(16).padStart(2, '0');
  function convert(text) {
    if (!matchUp || !text) return text;
    return text
      .replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => { const y = matchUp[h.toLowerCase()]; return y ? '#' + y : m; })
      .replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (m, r, g, b) => { const y = matchUp[hex2(r) + hex2(g) + hex2(b)]; return y ? '#' + y : m; });
  }
  // SVG icons carry their colour in the fill/stroke attribute (like the sidebar button).
  const OZ = ['style', 'fill', 'stroke'];
  function elem(el) {
    if (!el.getAttribute) return;
    for (const o of OZ) {
      const s = el.getAttribute(o);
      if (s) { const y = convert(s); if (y !== s) el.setAttribute(o, y); }
    }
  }
  function tree(rootDir) {
    if (rootDir.nodeType !== 1) return;
    elem(rootDir);
    rootDir.querySelectorAll('[style],[fill],[stroke]').forEach(elem);
  }
  function rules() {
    for (const page of document.styleSheets) {
      let listing; try { listing = page.cssRules; } catch (_) { continue; }
      const browse = (rs) => { for (const r of rs) {
        if (r.style) { for (let i = 0; i < r.style.length; i++) { const name = r.style[i]; const v = r.style.getPropertyValue(name); const y = convert(v); if (y !== v) r.style.setProperty(name, y, r.style.getPropertyPriority(name)); } }
        if (r.cssRules) browse(r.cssRules);
      } };
      browse(listing);
    }
  }
  let observation = null;
  function applyTheme(name) {
    const choice = PALETTE[name] ? name : 'dark';
    try { localStorage.setItem('se_tema', choice); } catch (_) {}
    const previous = document.documentElement.getAttribute('data-tema') || 'dark';
    if (previous === choice) return;
    // Returning from another theme reloads the page: the mapping cannot be undone, the source is dark.
    // If Settings is open it returns to the same section (the same key as the language change, see i18n.js).
    if (previous !== 'dark') {
      try { if (typeof currentSetSec === 'string' && typeof I18N_RETURN_KEY === 'string') sessionStorage.setItem(I18N_RETURN_KEY, currentSetSec); } catch (_) {}
      location.reload(); return;
    }
    matchUp = PALETTE[choice];
    document.documentElement.setAttribute('data-tema', choice);
    document.documentElement.style.colorScheme = choice === 'white' ? 'light' : 'dark';
    rules();
    // In the white theme the light text colour turns dark; the text of the purple buttons and the white
    // letter in the logo must stay light.
    if (choice === 'white') {
      const st = document.createElement('style');
      st.textContent = '[style*="background:#5624B3"],[style*="background: rgb(86, 36, 179)"]{color:#fff !important}'
        + 'img[src*="logo"]{filter:drop-shadow(0 0 1px rgba(0,0,0,.6))}';
      document.head.appendChild(st);
    }
    if (document.body) tree(document.body);
    observation = new MutationObserver((ms) => { for (const m of ms) {
      if (m.type === 'attributes') elem(m.target); else m.addedNodes.forEach(tree);
    } });
    observation.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: OZ });
  }
  window.temaUygula = applyTheme;
  let initial = 'dark'; try { initial = localStorage.getItem('se_tema') || 'dark'; } catch (_) {}
  if (initial !== 'dark') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyTheme(initial));
    else applyTheme(initial);
  }
})();
