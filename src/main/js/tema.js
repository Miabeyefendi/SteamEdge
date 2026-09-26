// ================= TEMA =================
// Renkler sayfalarda ve JS'te satır içi yazılı (#0D1118 gibi). Hepsini değişkene taşımak
// her dosyaya dokunmak demekti; bunun yerine koyu temanın renkleri çalışma anında seçili
// paletin karşılığıyla değiştirilir: satır içi stiller, CSS kuralları ve sonradan eklenen her
// düğüm. Koyu tema kaynağın kendisi, eşleme yok. Paletler Vantagraph'tan (R34Purple, VantaWhite).
// Giriş ekranı ayarları okuyamadığı için seçim localStorage'da da tutulur.
(function () {
  const PALET = {
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
  let esle = null;
  const hex2 = (n) => Number(n).toString(16).padStart(2, '0');
  function donustur(metin) {
    if (!esle || !metin) return metin;
    return metin
      .replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => { const y = esle[h.toLowerCase()]; return y ? '#' + y : m; })
      .replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (m, r, g, b) => { const y = esle[hex2(r) + hex2(g) + hex2(b)]; return y ? '#' + y : m; });
  }
  function eleman(el) {
    const s = el.getAttribute && el.getAttribute('style');
    if (s) { const y = donustur(s); if (y !== s) el.setAttribute('style', y); }
  }
  function agac(kok) {
    if (kok.nodeType !== 1) return;
    eleman(kok);
    kok.querySelectorAll('[style]').forEach(eleman);
  }
  function kurallar() {
    for (const sayfa of document.styleSheets) {
      let liste; try { liste = sayfa.cssRules; } catch (_) { continue; }
      const gez = (rs) => { for (const r of rs) {
        if (r.style) { for (let i = 0; i < r.style.length; i++) { const ad = r.style[i]; const v = r.style.getPropertyValue(ad); const y = donustur(v); if (y !== v) r.style.setProperty(ad, y, r.style.getPropertyPriority(ad)); } }
        if (r.cssRules) gez(r.cssRules);
      } };
      gez(liste);
    }
  }
  let gozlem = null;
  function temaUygula(ad) {
    const secim = PALET[ad] ? ad : 'dark';
    try { localStorage.setItem('se_tema', secim); } catch (_) {}
    const onceki = document.documentElement.getAttribute('data-tema') || 'dark';
    if (onceki === secim) return;
    // Başka bir temadan dönüş için sayfa yenilenir: eşleme geri alınamaz, kaynak koyu.
    if (onceki !== 'dark') { location.reload(); return; }
    esle = PALET[secim];
    document.documentElement.setAttribute('data-tema', secim);
    document.documentElement.style.colorScheme = secim === 'white' ? 'light' : 'dark';
    kurallar();
    // Beyaz temada açık metin rengi koyuya döner; mor düğmelerin yazısı ve logodaki beyaz
    // harf ise açık kalmalı.
    if (secim === 'white') {
      const st = document.createElement('style');
      st.textContent = '[style*="background:#5624B3"],[style*="background: rgb(86, 36, 179)"]{color:#fff !important}'
        + 'img[src*="logo"]{filter:drop-shadow(0 0 1px rgba(0,0,0,.6))}';
      document.head.appendChild(st);
    }
    if (document.body) agac(document.body);
    gozlem = new MutationObserver((ms) => { for (const m of ms) {
      if (m.type === 'attributes') eleman(m.target); else m.addedNodes.forEach(agac);
    } });
    gozlem.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  }
  window.temaUygula = temaUygula;
  let ilk = 'dark'; try { ilk = localStorage.getItem('se_tema') || 'dark'; } catch (_) {}
  if (ilk !== 'dark') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => temaUygula(ilk));
    else temaUygula(ilk);
  }
})();
