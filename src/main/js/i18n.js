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

    // ÇOĞUL. Türkçede sayıdan sonra isim tekil kalır ("3 oyun"), diğer dillerde değişir:
    // İngilizcede "1 game / 3 games", Rusçada üç biçim ("1 игра / 3 игры / 5 игр"). Sözlük
    // değeri biçimleri '|' ile ayırarak taşır: iki biçimde "tekil|çoğul", Rusçada
    // "one|few|many". Biçim, metindeki İLK sayıya göre seçilir. Eskiden tek biçim vardı ve
    // ekranda "1 games", "2 игр" gibi yanlışlar çıkıyordu.
    function cogulSec(deger, sayi) {
      if (!deger || deger.indexOf('|') < 0) return deger;
      const bicim = deger.split('|');
      const n = Math.abs(Number(String(sayi == null ? '' : sayi).replace(/[^\d]/g, '')) || 0);
      let kat = 'other';
      try { kat = new Intl.PluralRules(yerelKod()).select(n); } catch (_) {}
      if (bicim.length >= 3) return bicim[kat === 'one' ? 0 : kat === 'few' ? 1 : 2];
      return bicim[kat === 'one' ? 0 : 1];
    }

    // Değerleri yer tutuculara koyar. Düz '#' sırayla dolar. Cümle yapısı Türkçeden farklı
    // olan dil sırayı #1, #2 ile değiştirir: "# içinde # başarım açılır." İngilizcede
    // "#2 achievements unlock within #1." olur. Eskiden yalnızca sıra vardı ve böyle bir
    // çeviride süre ile sayı yer değiştiriyordu.
    function yerTutucuDoldur(metin, degerler) {
      let i = 0;
      return String(metin).replace(/#([1-9])?/g, (_, n) => {
        if (n) return Number(n) <= degerler.length ? String(degerler[n - 1]) : '#' + n;
        return i < degerler.length ? String(degerler[i++]) : '#';
      });
    }

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
        // Sayıları geri koy (çoğul biçimi ilk sayıya göre)
        const sayilar = i18nNums(duz);
        hedef = yerTutucuDoldur(cogulSec(hedef, sayilar[0]), sayilar);
      } else hedef = cogulSec(hedef, null);
      // Orijinaldeki baştaki/sondaki boşluğu koru (satır içi metinlerde önemli)
      const bas = (String(src).match(/^\s*/) || [''])[0];
      const son = (String(src).match(/\s*$/) || [''])[0];
      return bas + hedef + son;
    }

    // Sayı taşıyan şablonlar için: tf('# oyun sırada.', 5). Sayfa JS'leri metni sayıyla
    // birleştirince DOM gözlemcisi parçaları eşleştiremiyordu; şablon sözlükte '#' ile
    // durur, çevrilir, sonra değerler sırayla yerine konur. Çoğul biçimi ilk sayısal değere göre.
    function tf(sablon, ...degerler) {
      const ham = (uiLang !== 'tr' && I18N[uiLang]) ? I18N[uiLang][String(sablon).replace(/\s+/g, ' ').trim()] : undefined;
      let ceviri;
      if (ham !== undefined){
        // Değer HTML olabilir (<b>12</b>); sayı etiketler ayıklanarak aranır.
        const sayi = degerler.map(v => String(v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()).find(v => /^\d[\d.,]*$/.test(v));
        ceviri = cogulSec(ham, sayi);
      } else ceviri = t(sablon);
      return yerTutucuDoldur(ceviri, degerler);
    }

    // Yüzde biçimi dile göre: Türkçede "%13", İngilizce/Almanca/İspanyolca/Rusçada "13%",
    // Çincede "13%". Eskiden her yerde Türkçe biçim yazılıyordu.
    function fmtYuzde(n){ return uiLang === 'tr' ? ('%' + n) : (n + '%'); }
    // Tarih, saat ve sayı biçimi de arayüz diline göre. Eskiden her yerde 'tr-TR' yazıyordu:
    // İngilizce arayüzde tarih "20.09.2026", binlik ayraç nokta çıkıyordu.
    const YEREL_KOD = { tr:'tr-TR', en:'en-US', de:'de-DE', es:'es-ES', zh:'zh-TW', ru:'ru-RU' };
    function yerelKod(){ return YEREL_KOD[uiLang] || 'tr-TR'; }
    function yerelSayi(n){ return Number(n || 0).toLocaleString(yerelKod()); }
    // Ondalık sayı arayüz dilinde: Türkçede "1,5", İngilizcede "1.5".
    function yerelOndalik(n, basamak){
      const b = basamak == null ? 1 : basamak;
      return Number(n || 0).toLocaleString(yerelKod(), { minimumFractionDigits: b, maximumFractionDigits: b });
    }
    // Süre birimi arayüz dilinde: sureBirim(3, 'sa') -> "3 sa" / "3 h". Anahtar '#' desenli
    // ("# sa"), aynı metin DOM çevirisinde de tanınır. Birimler: sa, dk, sn, gün, saat,
    // dakika, saniye. Eskiden birimler her dilde Türkçe kalıyordu ("37 dk", "1 sa 14 dk").
    function sureBirim(n, birim){ return tf('# ' + birim, n); }

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
      const yeni = I18N_LANGS[kod] ? kod : 'en';
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
      uiLang = I18N_LANGS[kod] ? kod : 'en';
      document.documentElement.setAttribute('lang', uiLang === 'zh' ? 'zh-Hant' : uiLang);
      // Sözlük okunamazsa Türkçeye düşülür: yarısı çevrilmiş bir ekran göstermektense
      // kaynak dilde bırakmak dürüst olan.
      if (uiLang !== 'tr' && !i18nSozlukYukle(uiLang)) uiLang = 'tr';
      if (uiLang !== 'tr') applyI18n();
      i18nIzle();
    }
