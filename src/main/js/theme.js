// ================= THEME =================
// Colours are written inline in the pages and in JS (like #0D1118). Moving them all to variables
// would have meant touching every file; instead the colours of the dark theme are swapped at run time
// for the selected palette's counterparts: inline styles, CSS rules and every node added later.
// The dark theme is the source itself, there is no mapping. Palettes are from Vantagraph (R34Purple, VantaWhite).
// Since the login screen cannot read the settings the choice is also kept in localStorage.
(function () {
  // The dark theme is the source. The coloured dark themes are built from a short description each (the roles below), the White theme
  // is written out. Every coloured theme is Vantagraph's: R34 Purple and Crimson as they are in its colour.ini, Olive and Indigo in the
  // same structure (tinted surfaces, one warm or cool complement for the accents, a soft secondary text in the complement's family).
  const SURF = ['030305', '090c12', '0d1118', '101621', '151c28', '1d2432', '2b3345', '333d4d', '252a3a', '1e2836', '0e1620', '0f1720'];
  const THEMES = {
    // violet surfaces, gold secondary text, blue progress
    r34: { surf: ['060810', '090C18', '160B2A', '1B1034', '200E3C', '2C1850', '3D2468', '4A2E78', '2C1850', '261542', '120A22', '090C18'],
      title: 'F0EAF8', body: 'DDD4EE', muted: 'C8A850', dim: 'B39640', brand: '7A3FE0', brandText: 'E8CB78', info: '5B93E8', warn: 'D9A441', warn2: 'EDC35A', badText: 'FF6B85', field: '8A70C4' },
    // red-black surfaces, amber accent (the buttons are amber with dark text)
    crimson: { surf: ['060A0E', '090E14', '300C12', '3A0F17', '4D131D', '5C1822', '7A2A36', '8A3541', '3E1019', '44121C', '2A0B10', '090E14'],
      title: 'F0E4E4', body: 'DDC9CB', muted: 'BF9098', dim: 'B08990', brand: 'C8903A', brandText: 'E6B562', info: 'D9A04A', warn: 'E0A545', warn2: 'F0BE5C', badText: 'FF7A8E', field: 'B8707C', ctaText: '1A0A0D' },
    // olive panels on a violet window: green accents, purple progress
    olive: { surf: ['0B0610', '100818', '131C05', '18240A', '1E0E2E', '243408', '3B5014', '486218', '2A3A0C', '1F2E08', '0F1704', '100818'],
      title: 'F0EBE0', body: 'D8D6BE', muted: 'A8B878', dim: '98A86C', brand: '81B040', brandText: 'B5D870', info: 'A58BE0', warn: 'D9A441', warn2: 'EDC35A', badText: 'FF7B8E', field: '7E9A3E', ctaText: '0F1704' },
    // indigo surfaces, vermilion accents
    indigo: { surf: ['070B16', '0A1020', '101C38', '15244A', '182A52', '223A6E', '31508F', '3B5EA3', '1C2E5C', '16264C', '0D162C', '0A1020'],
      title: 'EAF0FA', body: 'CBD8EE', muted: '9DB4E0', dim: '8CA4D4', brand: 'C23B22', brandText: 'FF9A7A', info: '6FA8F0', warn: 'E0A545', warn2: 'F0BE5C', badText: 'FF8A9A', field: '6F8CC8',
      extra: { 'e2703a': 'F08050' } },
  };
  function build(t) {
    const m = {};
    SURF.forEach((k, i) => { m[k] = t.surf[i].toLowerCase(); });
    const roles = { 'dce2fa': t.title, 'b9c0d6': t.body, '8b8f9e': t.muted, '7f879b': t.dim, '5624b3': t.brand, 'c2aaee': t.brandText, '24aeb3': t.info,
      'b37e24': t.warn, 'e0b43a': t.warn2, 'e45a86': t.badText, 'ef4444': t.badText, '5a6580': t.field, '7a8a9a': t.dim, '4f8ef7': t.info };
    for (const k in roles) m[k] = roles[k].toLowerCase();
    for (const k in (t.extra || {})) m[k] = t.extra[k].toLowerCase();
    return m;
  }
  const PALETTE = {
    r34: build(THEMES.r34), crimson: build(THEMES.crimson), olive: build(THEMES.olive), indigo: build(THEMES.indigo),
    white: {
      '030305': 'e4e2dc', '090c12': 'f5f4f2', '0d1118': 'ffffff', '101621': 'f0eeea', '151c28': 'eceae6',
      '1d2432': 'e0ddd6', '2b3345': 'd8d4cc', '333d4d': 'c8c4bc', '252a3a': 'ddd9d2', '1e2836': 'e6e3dd',
      '0e1620': 'f2f0ec', 'dce2fa': '1a1a1a', 'b9c0d6': '3a3a3a', '8b8f9e': '595959', '7f879b': '5e5e5e',
      'c2aaee': '5624b3', 'e8eaf0': '1a1a1a', 'cbd5e1': '3a3a3a', '94a3b8': '595959', '0f1720': 'f5f4f2', '5a6580': '8a8780',
      // the status colours are text on the light surfaces too, and the light green, amber and cyan of the dark theme do not read there
      '5fb324': '30650d', 'b37e24': '7d5208', '24aeb3': '0a6a6f', 'b32453': 'a01f4a', 'e45a86': 'a01f4a', 'e0b43a': 'a87c00',
      // older pastel text colours in the page styles (light enough to vanish on white)
      '9aabbd': '595959', '6f8195': '5e5e5e', '9fb2c4': '595959', '9ca3af': '595959', '7a8a9a': '5e5e5e', 'e2e8f0': '1a1a1a', 'e5e7eb': '1a1a1a', 'f0f4ff': '1a1a1a',
      'e8eaf2': '1a1a1a', 'cdd9e5': '3a3a3a', 'a9cdff': '1b4a94', '4f8ef7': '1b57b8', '7fb0ff': '1b4a94', '93c5fd': '1b4a94', '8fb4d8': '1b4a94',
      '22c55e': '17703a', '8ee39d': '17652c', '7fd48c': '17652c', '57c66a': '17652c', 'f59e0b': '7d5208', 'e8bd6f': '7d5208', 'e8a33d': '7d5208',
      'e2703a': '9a3f12', 'ef4444': 'b01c1c', 'd5c4ff': '5624b3', 'bda6ff': '5624b3', 'a78bfa': '5624b3',
    },
  };
  // text on the brand buttons: white everywhere except where the brand colour is light (amber, green)
  const CTA_TEXT = {};
  for (const k in THEMES) if (THEMES[k].ctaText) CTA_TEXT[k] = THEMES[k].ctaText.toLowerCase();
  // the mark of the app comes in the theme's own colours (its S is light: the white theme gets dark letters); R34 Purple keeps the violet one.
  // The files are src/assets/logo-mark-<name>.svg (a filter would be switched off by the light mode of the performance setting)
  const LOGO_FILE = { white: 'dark', crimson: 'crimson', olive: 'olive', indigo: 'indigo' };
  // names of earlier versions: Midnight Purple is R34 Purple now, the high contrast theme is gone
  const OLD_NAMES = { midnight: 'r34', contrast: 'dark' };
  // 'auto' is the dark theme (Windows' own high contrast mode is handled by the forced-colors rules in edge.css).
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
    const previous = document.documentElement.getAttribute('data-theme') || 'dark';
    if (previous === choice) return;
    // Returning from another theme reloads the page: the mapping cannot be undone, the source is dark.
    // If Settings is open it returns to the same section (the same key as the language change, see i18n.js).
    if (previous !== 'dark') {
      try { if (typeof currentSetSec === 'string' && typeof I18N_RETURN_KEY === 'string') sessionStorage.setItem(I18N_RETURN_KEY, currentSetSec); } catch (_) {}
      location.reload(); return;
    }
    matchUp = PALETTE[choice];
    document.documentElement.setAttribute('data-theme', choice);
    document.documentElement.style.colorScheme = choice === 'white' ? 'light' : 'dark';
    rules();
    // In the white theme the light text colour turns dark; the text of the purple buttons and the white
    // letter in the logo must stay light.
    if (choice === 'white') {
      const st = document.createElement('style');
      st.textContent = '[style*="background:#5624B3"],[style*="background: rgb(86, 36, 179)"]{color:#fff !important}'
        + '.e-toggle.on .e-knob{background:#fff !important}'
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
  if (resolve(initial) !== 'dark') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyTheme(initial));
    else applyTheme(initial);
  }
})();
