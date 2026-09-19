    // ================= ÇOK DİLLİLİK =================
    // Kaynak dil Türkçe. Arayüzdeki metinler HTML sayfalarında ve sayfa JS'lerinde doğrudan
    // Türkçe yazılı olduğu için, her çağrı yerini t() ile sarmak yerine ÇEVİRİ DOM ÜZERİNDE
    // yapılıyor: sayfa çizildikten sonra metin düğümleri ve placeholder/title/data-tip
    // öznitelikleri sözlükten geçiriliyor. Böylece JS'in ürettiği içerik de otomatik çevriliyor.
    //
    // Sayı içeren metinler DESEN olarak tutulur: "3 oyunda kart var" -> "# oyunda kart var".
    // Çeviride de # kullanılır; uygulanırken sayılar sırayla geri yerleştirilir.
    //
    // Sözlük anahtarı = Türkçe metnin kendisi. Anahtarı olmayan metne DOKUNULMAZ (oyun adı,
    // eşya adı, kullanıcı adı gibi veriler böylece olduğu gibi kalır).
    //
    // SÖZLÜK BU DOSYADA DEĞİL. Her dil `src/main/js/lang/<kod>.json` içinde durur ve
    // yalnızca seçili olan okunur; diğerleri hiç açılmaz. Eskiden altı sözlük tek dosyada,
    // tur tur eklenmiş on dokuz ayrı blok hâlinde duruyordu: yeni dil eklemek dosyanın
    // yirmi yerine dokunmak demekti ve dil denetimi köşeli parantezli anahtarları
    // göremiyordu. Artık yeni dil = yeni dosya, denetim de JSON okuyor.

    const I18N_LANGS = { tr: 'Türkçe', en: 'English', de: 'Deutsch', es: 'Español', zh: '繁體中文', ru: 'Русский' };
    let uiLang = 'tr';

    // Yalnızca açılışta seçilen dil doldurulur. Türkçe kaynak dil olduğu için sözlüğü yoktur.
    const I18N = { en: {}, de: {}, es: {}, zh: {}, ru: {} };

    // Sözlüğü diskten okur. preload senkron okuyor (sayfa HTML'leri de aynı yoldan geliyor),
    // çünkü çeviri ilk çizimden önce hazır olmalı: asenkron beklemek ekranı bir kare Türkçe
    // gösterip sonra değiştirirdi.
    function i18nSozlukYukle(kod) {
      if (kod === 'tr' || !I18N[kod]) return false;
      if (Object.keys(I18N[kod]).length) return true;         // zaten yüklü
      try {
        const tablo = window.imu && window.imu.dil && window.imu.dil.yukle(kod);
        if (!tablo) return false;
        Object.assign(I18N[kod], tablo);
        return true;
      } catch (_) { return false; }
    }

    const i18nNormKey = (s) => s.replace(/\d[\d.,]*/g, '#');
    const i18nNums = (s) => s.match(/\d[\d.,]*/g) || [];

    // Ham Türkçe metni seçili dile çevirir. Karşılığı yoksa metni aynen döndürür.
    function t(src) {
      if (uiLang === 'tr' || !src) return src;
      const tablo = I18N[uiLang];
      if (!tablo) return src;
      const duz = String(src).replace(/\s+/g, ' ').trim();
      if (!duz) return src;
      let hedef = tablo[duz];
      if (hedef === undefined) {
        const anahtar = i18nNormKey(duz);
        hedef = tablo[anahtar];
        if (hedef === undefined) return src;
        // Sayıları sırayla geri koy
        const sayilar = i18nNums(duz);
        let i = 0;
        hedef = hedef.replace(/#/g, () => (i < sayilar.length ? sayilar[i++] : '#'));
      }
      // Orijinaldeki baştaki/sondaki boşluğu koru (satır içi metinlerde önemli)
      const bas = (String(src).match(/^\s*/) || [''])[0];
      const son = (String(src).match(/\s*$/) || [''])[0];
      return bas + hedef + son;
    }

    // Sayı taşıyan şablonlar için: t('# oyun sırada.', 5). Sayfa JS'leri metni sayıyla
    // birleştirince DOM gözlemcisi parçaları eşleştiremiyordu; şablon sözlükte '#' ile
    // durur, çevrilir, sonra değerler sırayla yerine konur.
    function tf(sablon, ...degerler) {
      let i = 0;
      return t(sablon).replace(/#/g, () => (i < degerler.length ? String(degerler[i++]) : '#'));
    }

    // DOM'u gezip metin düğümlerini ve metin taşıyan öznitelikleri çevirir.
    let i18nUyguluyor = false;
    const I18N_ATLA = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE']);
    function applyI18n(kok) {
      if (uiLang === 'tr') return;
      const alan = kok || document.body;
      if (!alan) return;
      i18nUyguluyor = true;
      try {
        const yuru = document.createTreeWalker(alan, NodeFilter.SHOW_TEXT, null);
        const isler = [];
        let n;
        while ((n = yuru.nextNode())) {
          if (!n.parentNode || I18N_ATLA.has(n.parentNode.nodeName)) continue;
          const ham = n.nodeValue;
          if (!ham || !ham.trim()) continue;
          const yeni = t(ham);
          if (yeni !== ham) isler.push([n, yeni]);
        }
        isler.forEach(([node, yeni]) => { node.nodeValue = yeni; });

        alan.querySelectorAll('[placeholder],[title],[data-tip]').forEach((el) => {
          ['placeholder', 'title', 'data-tip'].forEach((a) => {
            const v = el.getAttribute(a);
            if (!v) return;
            const yeni = t(v);
            if (yeni !== v) el.setAttribute(a, yeni);
          });
        });
      } finally { i18nUyguluyor = false; }
    }

    // Sayfa JS'leri innerHTML ile sürekli yeniden çiziyor; her çizimden sonra elle çağırmak
    // yerine değişiklikleri izliyoruz. Kendi yaptığımız değişiklik tekrar tetiklemesin diye
    // bayrakla korunuyor.
    let i18nZaman = null;
    function i18nIzle() {
      const hedef = document.body;
      if (!hedef || typeof MutationObserver === 'undefined') return;
      new MutationObserver((kayitlar) => {
        if (i18nUyguluyor || uiLang === 'tr') return;
        let dokunuldu = false;
        for (const k of kayitlar) {
          if (k.type === 'childList' && (k.addedNodes.length || k.removedNodes.length)) { dokunuldu = true; break; }
          if (k.type === 'characterData') { dokunuldu = true; break; }
        }
        if (!dokunuldu) return;
        clearTimeout(i18nZaman);
        i18nZaman = setTimeout(() => applyI18n(), 30);
      }).observe(hedef, { childList: true, subtree: true, characterData: true });
    }

    // Dil değiştirme. Türkçeye dönmek metinleri geri çeviremez (çeviri tek yönlü), bu yüzden
    // sayfa yeniden yükleniyor; diğer diller arasında geçişte de aynı sebeple yeniden yükleme
    // en güvenli yol.
    // Yeniden yükleme Genel Bakış'a düşürüyordu: kullanıcı dili değiştirip Ayarlar'ın
    // ortasında kaybolmasın diye açık bölüm sessionStorage ile bir sonraki açılışa taşınır.
    const I18N_DONUS_ANAHTARI = 'se.dilDonusBolumu';
    function setUiLang(kod, yenidenYukle) {
      const yeni = I18N_LANGS[kod] ? kod : 'tr';
      if (yeni === uiLang) return;
      if (yenidenYukle !== false) {
        try { sessionStorage.setItem(I18N_DONUS_ANAHTARI, typeof currentSetSec === 'string' ? currentSetSec : 'general'); } catch (_) {}
        location.reload(); return;
      }
      uiLang = yeni;
      i18nSozlukYukle(uiLang);
      applyI18n();
    }
    function initI18n(kod) {
      uiLang = I18N_LANGS[kod] ? kod : 'tr';
      document.documentElement.setAttribute('lang', uiLang === 'zh' ? 'zh-Hant' : uiLang);
      // Sözlük okunamazsa Türkçeye düşülür: yarısı çevrilmiş bir ekran göstermektense
      // kaynak dilde bırakmak dürüst olan.
      if (uiLang !== 'tr' && !i18nSozlukYukle(uiLang)) uiLang = 'tr';
      if (uiLang !== 'tr') applyI18n();
      i18nIzle();
    }
