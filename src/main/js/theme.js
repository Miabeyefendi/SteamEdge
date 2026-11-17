// ================= THEME =================
// Colours are written inline in the pages and in JS (like #0D1118). Moving them all to variables
// would have meant touching every file; instead the colours of the dark theme are swapped at run time
// for the selected palette's counterparts: inline styles, CSS rules and every node added later.
// The pages are written in the colours of the source (a navy dark). Both themes, VantaBlack and VantaWhite, are palettes of Vantagraph's own schemes mapped over it.
// Since the login screen cannot read the settings the choice is also kept in localStorage.
(function () {
  // The source is the page colours as written. VantaBlack is built from a short description (the roles below), VantaWhite is written out.
  const SURF = ['030305', '090c12', '0d1118', '101621', '151c28', '1d2432', '2b3345', '333d4d', '252a3a', '1e2836', '0e1620', '0f1720'];
  // VantaBlack: the neutral near-black of Vantagraph's VantaBlack scheme (window 040404, panel 080808, menu 171717, text F0F5F2, accent B0B5B0). The surfaces keep the
  // order of the source ones; the buttons are the light accent with dark text (ctaText), the status colours stay readable on black.
  const THEMES = {
    dark: { surf: ['040404', '080808', '0B0B0B', '0F0F0F', '141414', '1A1A1A', '242424', '2D2D2D', '1F1F1F', '181818', '0A0A0A', '080808'], title: 'F0F5F2', body: 'C5CAC6', muted: '9BA09C', dim: '8A8F8B', brand: 'B0B5B0', brandText: 'F0F5F2', brandBorder: '6E736F', focus: 'F0F5F2', info: 'B0B5B0', warn: 'C9A04A', warn2: 'D8B050', badText: 'FF4D6D', field: '5A5F5B', ctaText: '0B0B0B' },
  };
  function build(t) {
    const m = {};
    SURF.forEach((k, i) => { m[k] = t.surf[i].toLowerCase(); });
    const roles = { 'dce2fa': t.title, 'b9c0d6': t.body, '8b8f9e': t.muted, '7f879b': t.dim, '5624b3': t.brand, 'c2aaee': t.brandText, '24aeb3': t.info,
      'b37e24': t.warn, 'e0b43a': t.warn2, 'e45a86': t.badText, 'ef4444': t.badText, '555a67': t.field, '7a8a9a': t.dim, '4f8ef7': t.info, '5322ab': t.brandBorder, '7031cc': t.focus };
    for (const k in roles) m[k] = roles[k].toLowerCase();
    for (const k in (t.extra || {})) m[k] = t.extra[k].toLowerCase();
    return m;
  }
  const PALETTE = {
    dark: build(THEMES.dark),
    white: {
      '030305': 'e4e2dc', '090c12': 'f5f4f2', '0d1118': 'ffffff', '101621': 'f0eeea', '151c28': 'eceae6',
      '1d2432': 'e0ddd6', '2b3345': 'd8d4cc', '333d4d': 'c8c4bc', '252a3a': 'ddd9d2', '1e2836': 'e6e3dd',
      '0e1620': 'f2f0ec', 'dce2fa': '1a1a1a', 'b9c0d6': '3a3a3a', '8b8f9e': '595959', '7f879b': '5e5e5e',
      'c2aaee': '1a1a1a', '5624b3': '1a1a1a', '7031cc': '3a3a3a', 'e8eaf0': '1a1a1a', 'cbd5e1': '3a3a3a', '94a3b8': '595959', '0f1720': 'f5f4f2', '555a67': '9c9b99', '5322ab': '8a8a8a',
      // the status colours are text on the light surfaces too, and the light green, amber and cyan of the dark theme do not read there
      '5fb324': '30650d', 'b37e24': '7d5208', '24aeb3': '0a6a6f', 'b32453': 'a01f4a', 'e45a86': 'a01f4a', 'e0b43a': 'a87c00',
      // older pastel text colours in the page styles (light enough to vanish on white)
      '9aabbd': '595959', '6f8195': '5e5e5e', '9fb2c4': '595959', '9ca3af': '595959', '7a8a9a': '5e5e5e', 'e2e8f0': '1a1a1a', 'e5e7eb': '1a1a1a', 'f0f4ff': '1a1a1a',
      'e8eaf2': '1a1a1a', 'cdd9e5': '3a3a3a', 'a9cdff': '1b4a94', '4f8ef7': '1b57b8', '7fb0ff': '1b4a94', '93c5fd': '1b4a94', '8fb4d8': '1b4a94',
      '22c55e': '17703a', '8ee39d': '17652c', '7fd48c': '17652c', '57c66a': '17652c', 'f59e0b': '7d5208', 'e8bd6f': '7d5208', 'e8a33d': '7d5208',
      'e2703a': '9a3f12', 'ef4444': 'b01c1c', 'd5c4ff': '1a1a1a', 'bda6ff': '1a1a1a', 'a78bfa': '1a1a1a',
    },
  };
  // text on the brand buttons: white everywhere except where the brand colour is light (amber, green)
  const CTA_TEXT = {};
  for (const k in THEMES) if (THEMES[k].ctaText) CTA_TEXT[k] = THEMES[k].ctaText.toLowerCase();
  CTA_TEXT.white = 'ffffff';      // VantaWhite: the accent is the near-black of the scheme, its buttons carry white text
  // the mark of the app comes in the theme's own colours (its S is light: the white theme gets dark letters)
  // The files are src/assets/logo-mark-<name>.svg (a filter would be switched off by the light mode of the performance setting)
  const LOGO_FILE = { white: 'dark' };
  // names of earlier versions: the coloured themes and the high contrast one are gone, they become VantaBlack
  const OLD_NAMES = { midnight: 'dark', contrast: 'dark', r34: 'dark', crimson: 'dark', olive: 'dark', indigo: 'dark' };
  // 'auto' is VantaBlack (Windows' own high contrast mode is handled by the forced-colors rules in edge.css).
  function resolve(name) {
    if (OLD_NAMES[name]) name = OLD_NAMES[name];
    return PALETTE[name] ? name : 'dark';
  }
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
    if (el.tagName === 'IMG') {
      const lf = LOGO_FILE[document.documentElement.getAttribute('data-theme')], src = el.getAttribute('src');
      if (lf && src && /logo-mark\.svg$/.test(src)) el.setAttribute('src', src.replace('logo-mark.svg', 'logo-mark-' + lf + '.svg'));
    }
    for (const o of OZ) {
      const s = el.getAttribute(o);
      if (s) { const y = convert(s); if (y !== s) el.setAttribute(o, y); }
    }
  }
  function tree(rootDir) {
    if (rootDir.nodeType !== 1) return;
    elem(rootDir);
    rootDir.querySelectorAll('[style],[fill],[stroke],img').forEach(elem);
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
    try { localStorage.setItem('se_theme', name === 'auto' || PALETTE[name] || OLD_NAMES[name] ? (OLD_NAMES[name] || name) : 'dark'); } catch (_) {}
    const choice = resolve(name);
    const previous = document.documentElement.getAttribute('data-theme') || 'source';
    if (previous === choice) return;
    // Returning from another theme reloads the page: the mapping cannot be undone, the source is the colours as written.
    // If Settings is open it returns to the same section (the same key as the language change, see i18n.js).
    if (previous !== 'source') {
      try { if (typeof currentSetSec === 'string' && typeof I18N_RETURN_KEY === 'string') sessionStorage.setItem(I18N_RETURN_KEY, currentSetSec); } catch (_) {}
      location.reload(); return;
    }
    matchUp = PALETTE[choice];
    document.documentElement.setAttribute('data-theme', choice);
    document.documentElement.style.colorScheme = choice === 'white' ? 'light' : 'dark';
    rules();
    // In the white theme the light text colour turns dark; the knobs of the switches that are on stay light on the near-black accent.
    if (choice === 'white') {
      const st = document.createElement('style');
      st.textContent = '.e-toggle.on .e-knob{background:#fff !important}'
        // the inline knobs of the other switches are the title colour, which is dark in this theme: an ON knob stays light on the purple
        + 'div[style*="width:16px"][style*="margin-left:16px"],div[style*="width: 16px"][style*="margin-left: 16px"]{background:#fff !important}';
      document.head.appendChild(st);
    }
    if (CTA_TEXT[choice]) {
      const st = document.createElement('style');
      const b = PALETTE[choice]['5624b3'];
      st.textContent = '[style*="background:#' + b + '" i],[style*="background: #' + b + '" i]{color:#' + CTA_TEXT[choice] + ' !important}';
      document.head.appendChild(st);
    }
    if (document.body) tree(document.body);
    observation = new MutationObserver((ms) => { for (const m of ms) {
      if (m.type === 'attributes') elem(m.target); else m.addedNodes.forEach(tree);
    } });
    observation.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: OZ });
  }
  window.applyTheme = applyTheme;
  window.themePalettes = PALETTE;      // read by the contrast test
  window.themeCtaText = CTA_TEXT;
  let initial = 'auto'; try { initial = localStorage.getItem('se_theme') || 'auto'; } catch (_) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyTheme(initial));
  else applyTheme(initial);
})();
