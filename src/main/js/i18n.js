    // ================= MULTILINGUAL SUPPORT =================
    // The source language is Turkish. Since the texts in the interface are written directly in Turkish in the HTML pages and
    // in the page JS files, instead of wrapping every call site with t() the TRANSLATION IS DONE ON THE DOM:
    // after the page is drawn the text nodes and the placeholder/title/data-tip
    // attributes are passed through the dictionary. So the content JS produces is translated automatically too.
    //
    // Text that carries a number is kept as a PATTERN: "3 oyunda kart var" -> "# oyunda kart var".
    // The translation uses # too; when applied the numbers are put back in order.
    //
    // Dictionary key = the Turkish text itself. Text without a key is LEFT ALONE (game name,
    // item name, user name and the like stay as they are).
    //
    // THE DICTIONARY IS NOT IN THIS FILE. Each language lives in `src/main/js/lang/<code>.json` and
    // only the selected one is read; the others are never opened. The six dictionaries used to be in a single file,
    // nineteen separate blocks added round by round: adding a language meant touching twenty places in the file
    // and the language audit could not see keys in square brackets.
    // Now a new language = a new file, and the audit reads JSON.

    const I18N_LANGS = { tr: 'Türkçe', en: 'English', de: 'Deutsch', es: 'Español', zh: '繁體中文', ru: 'Русский' };
    let uiLang = 'tr';

    // Only the language selected at startup is filled. Turkish is the source language so it has no dictionary.
    const I18N = { en: {}, de: {}, es: {}, zh: {}, ru: {} };

    // Reads the dictionary from disk. preload reads synchronously (the page HTMLs come the same way),
    // because the translation must be ready before the first paint: waiting asynchronously would show the screen
    // in Turkish for one frame and then change it.
    function i18nLoadDictionary(codeStr) {
      if (codeStr === 'tr' || !I18N[codeStr]) return false;
      if (Object.keys(I18N[codeStr]).length) return true;         // already loaded
      try {
        const table = window.imu && window.imu.lang && window.imu.lang.loadIt(codeStr);
        if (!table) return false;
        Object.assign(I18N[codeStr], table);
        return true;
      } catch (_) { return false; }
    }

    const i18nNormKey = (s) => s.replace(/\d[\d.,]*/g, '#');
    const i18nNums = (s) => s.match(/\d[\d.,]*/g) || [];

    // PLURAL. In Turkish the noun stays singular after a number ("3 oyun"), in other languages it changes:
    // in English "1 game / 3 games", in Russian three forms ("1 игра / 3 игры / 5 игр"). The dictionary
    // value carries the forms separated by '|': "singular|plural" for two forms, in Russian
    // "one|few|many". The form is chosen by the FIRST number in the text. There used to be a single form and
    // wrong things like "1 games", "2 игр" came out on screen.
    function pluralPick(rawValue, num) {
      if (!rawValue || rawValue.indexOf('|') < 0) return rawValue;
      const formatStr = rawValue.split('|');
      const n = Math.abs(Number(String(num == null ? '' : num).replace(/[^\d]/g, '')) || 0);
      let layer = 'other';
      try { layer = new Intl.PluralRules(localCode()).select(n); } catch (_) {}
      if (formatStr.length >= 3) return formatStr[layer === 'one' ? 0 : layer === 'few' ? 1 : 2];
      return formatStr[layer === 'one' ? 0 : 1];
    }

    // Puts the values into the placeholders. A plain '#' fills in order. A language whose sentence structure
    // differs from Turkish swaps the order with #1, #2: "# içinde # başarım açılır." becomes
    // "#2 achievements unlock within #1." in English. There used to be only the order and in such a
    // translation the duration and the number swapped places.
    function fillPlaceholder(text, degerler) {
      let i = 0;
      return String(text).replace(/#([1-9])?/g, (_, n) => {
        if (n) return Number(n) <= degerler.length ? String(degerler[n - 1]) : '#' + n;
        return i < degerler.length ? String(degerler[i++]) : '#';
      });
    }

    // Translates raw Turkish text into the selected language. If there is no entry it returns the text unchanged.
    function t(src) {
      if (uiLang === 'tr' || !src) return src;
      const table = I18N[uiLang];
      if (!table) return src;
      const flat = String(src).replace(/\s+/g, ' ').trim();
      if (!flat) return src;
      let goal = table[flat];
      if (goal === undefined) {
        const keyName = i18nNormKey(flat);
        goal = table[keyName];
        if (goal === undefined) return src;
        // Put the numbers back (the plural form follows the first number)
        const numbers = i18nNums(flat);
        goal = fillPlaceholder(pluralPick(goal, numbers[0]), numbers);
      } else goal = pluralPick(goal, null);
      // Keep the leading/trailing whitespace of the original (important in inline texts)
      const begin = (String(src).match(/^\s*/) || [''])[0];
      const latest = (String(src).match(/\s*$/) || [''])[0];
      return begin + goal + latest;
    }

    // For templates that carry numbers: tf('# oyun sırada.', 5). When page JS files joined the text with the number
    // the DOM observer could not match the pieces; the template stays in the dictionary with '#', gets translated,
    // then the values are put in order. The plural form follows the first numeric value.
    function tf(template, ...degerler) {
      const rawText = (uiLang !== 'tr' && I18N[uiLang]) ? I18N[uiLang][String(template).replace(/\s+/g, ' ').trim()] : undefined;
      let translation;
      if (rawText !== undefined){
        // The value can be HTML (<b>12</b>); the number is searched for with the tags stripped.
        const num = degerler.map(v => String(v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()).find(v => /^\d[\d.,]*$/.test(v));
        translation = pluralPick(rawText, num);
      } else translation = t(template);
      return fillPlaceholder(translation, degerler);
    }

    // Percent format by language: in Turkish "%13", in English/German/Spanish/Russian "13%",
    // in Chinese "13%". The Turkish format used to be written everywhere.
    function fmtPercent(n){ return uiLang === 'tr' ? ('%' + n) : (n + '%'); }
    // Date, time and number format follow the interface language too. 'tr-TR' used to be written everywhere:
    // in the English interface the date came out "20.09.2026" and the thousands separator was a dot.
    const LOCAL_CODE = { tr:'tr-TR', en:'en-US', de:'de-DE', es:'es-ES', zh:'zh-TW', ru:'ru-RU' };
    function localCode(){ return LOCAL_CODE[uiLang] || 'tr-TR'; }
    function localNumber(n){ return Number(n || 0).toLocaleString(localCode()); }
    // Decimal number in the interface language: in Turkish "1,5", in English "1.5".
    function localDecimal(n, digit){
      const b = digit == null ? 1 : digit;
      return Number(n || 0).toLocaleString(localCode(), { minimumFractionDigits: b, maximumFractionDigits: b });
    }
    // Time unit in the interface language: durationUnit(3, 'sa') -> "3 sa" / "3 h". The key is a '#' pattern
    // ("# sa"), the same text is recognised in the DOM translation too. Units: sa, dk, sn, gün, saat,
    // dakika, saniye. The units used to stay Turkish in every language ("37 dk", "1 sa 14 dk").
    function durationUnit(n, unit){ return tf('# ' + unit, n); }

    // Walks the DOM and translates the text nodes and the attributes that carry text.
    let i18nApplying = false;
    const I18N_SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE']);
    function applyI18n(rootDir) {
      if (uiLang === 'tr') return;
      const field = rootDir || document.body;
      if (!field) return;
      i18nApplying = true;
      try {
        const walk = document.createTreeWalker(field, NodeFilter.SHOW_TEXT, null);
        const jobs = [];
        let n;
        while ((n = walk.nextNode())) {
          if (!n.parentNode || I18N_SKIP.has(n.parentNode.nodeName)) continue;
          const rawText = n.nodeValue;
          if (!rawText || !rawText.trim()) continue;
          const newItem = t(rawText);
          if (newItem !== rawText) jobs.push([n, newItem]);
        }
        jobs.forEach(([node, newItem]) => { node.nodeValue = newItem; });

        field.querySelectorAll('[placeholder],[title],[data-tip]').forEach((el) => {
          ['placeholder', 'title', 'data-tip'].forEach((a) => {
            const v = el.getAttribute(a);
            if (!v) return;
            const newItem = t(v);
            if (newItem !== v) el.setAttribute(a, newItem);
          });
        });
      } finally { i18nApplying = false; }
    }

    // Page JS files keep redrawing with innerHTML; instead of calling it by hand after every draw
    // we watch the changes. Our own change is protected with a flag
    // so it does not trigger again.
    let i18nTime = null;
    function i18nWatch() {
      const goal = document.body;
      if (!goal || typeof MutationObserver === 'undefined') return;
      new MutationObserver((records) => {
        if (i18nApplying || uiLang === 'tr') return;
        let touched = false;
        for (const k of records) {
          if (k.type === 'childList' && (k.addedNodes.length || k.removedNodes.length)) { touched = true; break; }
          if (k.type === 'characterData') { touched = true; break; }
        }
        if (!touched) return;
        clearTimeout(i18nTime);
        i18nTime = setTimeout(() => applyI18n(), 30);
      }).observe(goal, { childList: true, subtree: true, characterData: true });
    }

    // Language change. Going back to Turkish cannot translate the texts back (translation is one-way), so
    // the page is reloaded; switching between other languages is also safest with a reload
    // for the same reason.
    // The reload used to drop you on the Overview: so the user does not get lost in the middle of Settings after changing the language,
    // the open section is carried to the next startup with sessionStorage.
    const I18N_RETURN_KEY = 'se.langReturnSection';
    function setUiLang(codeStr, reload) {
      const newItem = I18N_LANGS[codeStr] ? codeStr : 'tr';
      if (newItem === uiLang) return;
      if (reload !== false) {
        try { sessionStorage.setItem(I18N_RETURN_KEY, typeof currentSetSec === 'string' ? currentSetSec : 'general'); } catch (_) {}
        location.reload(); return;
      }
      uiLang = newItem;
      i18nLoadDictionary(uiLang);
      applyI18n();
    }
    function initI18n(codeStr) {
      uiLang = I18N_LANGS[codeStr] ? codeStr : 'tr';
      document.documentElement.setAttribute('lang', uiLang === 'zh' ? 'zh-Hant' : uiLang);
      // If the dictionary cannot be read it falls back to Turkish: rather than showing a half translated screen
      // leaving it in the source language is the honest thing.
      if (uiLang !== 'tr' && !i18nLoadDictionary(uiLang)) uiLang = 'tr';
      if (uiLang !== 'tr') applyI18n();
      i18nWatch();
    }
