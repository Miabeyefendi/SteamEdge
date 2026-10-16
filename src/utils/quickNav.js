'use strict';
// Quick navigation: the search that ranks commands and settings, and the numbering of the Ctrl + number shortcuts.
// Plain functions, no page in here: the command palette and the settings search (src/main/js/palette.js) use them, and
// tests/unit/quick-nav.test.js runs them in Node. Loaded by main.html as a script (global QuickNav) and by Node with require.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuickNav = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Text as it is compared: lower case, without accents, and the Turkish dotted and dotless i the same ("Ayarlar" finds "ayarlar",
  // "İşlem" finds "islem" and "ıslak" finds "islak").
  function fold(text) {
    return String(text == null ? '' : text)
      .replace(/İ/g, 'i').replace(/ı/g, 'i').replace(/I/g, 'i')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/đ/g, 'd').replace(/ł/g, 'l')
      .replace(/\s+/g, ' ').trim();
  }

  // How well a query matches a text, 0 when it does not. Every word of the query has to be in the text; a text that starts with the query,
  // or has a word that starts with it, ranks above one that only contains it. `folded` is the text already folded.
  function scoreOne(queryWords, folded) {
    let total = 0;
    for (const w of queryWords) {
      const at = folded.indexOf(w);
      if (at < 0) return 0;
      if (at === 0) total += 100;
      else if (folded.charAt(at - 1) === ' ') total += 70;
      else total += 30;
    }
    // shorter texts first among equals: "Tema" before "Tema rengi ve renk düzeni"
    return total + Math.max(0, 20 - Math.floor(folded.length / 4));
  }

  // items: [{ label, keywords?, ... }]. An empty query keeps the order of the list. `limit` cuts the result.
  function rank(query, items, limit) {
    const q = fold(query);
    if (!q) return typeof limit === 'number' ? items.slice(0, limit) : items.slice();
    const words = q.split(' ');
    const out = [];
    items.forEach((item, order) => {
      const label = fold(item.label);
      let score = scoreOne(words, label);
      if (!score && item.keywords) {
        // a match only in the keywords (the help text of a setting, the section it is in) ranks below any match in the name
        const s = scoreOne(words, label + ' ' + fold(item.keywords));
        score = s ? Math.max(1, Math.floor(s / 4)) : 0;
      }
      if (score) out.push({ item, score, order });
    });
    out.sort((a, b) => (b.score - a.score) || (a.order - b.order));
    const list = out.map(x => x.item);
    return typeof limit === 'number' ? list.slice(0, limit) : list;
  }

  // The page a Ctrl + number opens. 1 to 7 are the pages of the side menu in the order they are shown now (a page that is switched off is not
  // in the list, so the numbers close up), 8 is the chat when it is on, 9 is Settings. null when there is nothing on that number.
  function pageForShortcut(number, menuPages, chatOn) {
    const n = Number(number);
    if (!(n >= 1 && n <= 9) || n !== Math.floor(n)) return null;
    if (n <= 7) return n <= menuPages.length ? menuPages[n - 1] : null;
    if (n === 8) return chatOn ? 'chat' : null;
    return 'settings';
  }

  // The same numbers as a list for the help window: [{ keys: 'Ctrl+3', page }]
  function shortcutTable(menuPages, chatOn) {
    const rows = [];
    for (let n = 1; n <= 9; n++) {
      const page = pageForShortcut(n, menuPages, chatOn);
      if (page) rows.push({ keys: 'Ctrl+' + n, page });
    }
    return rows;
  }

  return { fold, rank, pageForShortcut, shortcutTable };
});
