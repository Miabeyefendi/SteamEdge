    // Inventory prices: the bulk fetch of list prices and sale averages, and the gate that keeps it under Steam's request limit.
    // Loaded before inventory.js (main.html): inventory.js binds its buttons to these functions as it loads.

    // ---- G8: BULK FETCH of the AVERAGE (realised sale median) ----
    // It has no button of its own any more: "Fetch prices" gets the list prices first and then the averages of the same items.
    // The list price (priceoverview) is cheap, the sale history (pricehistory) needs a separate request for EVERY ITEM and Steam
    // allows ~20 requests / 30 seconds per account, so for a big inventory this part takes minutes. The same button shows the progress
    // and cancels it.
    let avgFetching = false, avgDone = 0, avgTotal = 0;
    async function fetchAvgForView(){
      if (avgFetching) return;
      const lacking = hashesForView().filter(h => !historyMap.has(h));
      if (!lacking.length) return;
      avgFetching = true; avgDone = 0; avgTotal = lacking.length;
      paintFetchBtn();
      const res = await E.historyFor(lacking).catch(()=>null);
      if (!res || !res.ok){
        avgFetching = false; paintFetchBtn();
        if (typeof toast === 'function') toast('Ortalama').fail((res && res.error) || 'İstek başarısız.');
      }
    }

    if (E.onHistoryOne){
      E.onHistoryOne((d)=>{
        if (d && d.hashName && d.history) historyMap.set(d.hashName, d.history);
        // Redrawing one by one is expensive with 200 items; we redraw in bulk on the progress event.
      });
    }
    if (E.onHistoryProgress){
      E.onHistoryProgress((d)=>{
        if (!d) return;
        avgDone = d.doneOnes || 0; avgTotal = d.totalSum || avgTotal;
        if (d.isFinished){
          avgFetching = false;
          renderInventory(); paintFetchBtn();
          if (typeof toast === 'function'){
            if (d.abandon) toast('Ortalama').done(tf('İptal edildi · # öğe alındı.', avgDone));
            else toast('Ortalama').done(tf('# öğenin ortalaması güncellendi.', avgDone));
          }
          return;
        }
        paintFetchBtn();
        // Refresh the list every 10 items - so progress is visible without drawing constantly
        if (avgDone % 10 === 0) renderInventory();
      });
    }

    // The Inventory preferences on the Settings screen (default sort, low value threshold etc.)
    // When Settings > General > "Currency" changes the FIXED ₺ texts on the page must be updated too
    // (the price range options and empty state values were written fixed in the HTML - that is why
    // the ₺ stayed in the list after switching to USD).
    function applyCurrencyLabels(){
      // The symbol sits in the same place as fmtMoney (in front): "₺0 - ₺1", "$10 and above". If the currency is not
      // known yet it stays without a symbol; since a fixed ₺ was written in the HTML a ₺ also showed on a USD account.
      const sym = (typeof curSym === 'function') ? curSym() : '';
      const sel = document.getElementById('efPrice');
      if (sel){
        const labels = { all:t('Tüm fiyatlar'), '0-1':sym+'0 - '+sym+'1', '1-5':sym+'1 - '+sym+'5', '5-10':sym+'5 - '+sym+'10', '10-':tf('# ve üzeri', sym+'10') };
        [...sel.options].forEach(o=>{ if (labels[o.value]) o.textContent = labels[o.value]; });
      }
      if (!invMerged){
        ['invStatValue','bulkGross','bulkNet'].forEach(id=>{
          const e = document.getElementById(id);
          if (e) e.textContent = fmtMoney(0);
        });
      }
    }

    function applyInvSettings(){
      if (typeof appSettings !== 'object' || !appSettings) return;
      applyCurrencyLabels();
      if (appSettings.invDefaultSort) invSort = appSettings.invDefaultSort;
      if (appSettings.hideUnsellable) fState = 'marketable';
      if (appSettings.groupByGame) groupByGame = true;
      if (appSettings.saleMode){
        // "Default selling price" - the starting strategy of the detail panel and the bottom bar
        const map = { median:'median', lowest:'match', undercut:'undercut', match:'match', manual:'manual' };
        const s = map[appSettings.saleMode];
        if (s) bulkStrategy = s;
      }
      const sel = document.getElementById('efState'); if (sel) sel.value = fState;
      paintGroupBtn();
    }

    function mergeDuplicates(items){
      const map = new Map();
      items.forEach(it=>{
        const ex = map.get(it.dedupKey);
        if (ex){ ex.count += it.amount; ex.assetIds.push(it.assetId); }
        else map.set(it.dedupKey, Object.assign({}, it, { count: it.amount, assetIds: [it.assetId] }));
      });
      return [...map.values()];
    }

    // ================= PRICE FETCH GATE =================
    // Steam market requests are limited to ~20 requests / 30 seconds. Asking the whole inventory
    // as soon as the page opened hit the limit and the boxes filled with "could not be fetched". Now:
    //   1) On first entering the page it asks "fetch now?".
    //   2) If the answer is no the user sets up the filter and presses the "Fetch prices" button.
    //   3) Only the items that match the CURRENT filter are fetched, the button stays locked until all are done.
    //   4) If the filter changes the button opens again (a new list needs a new request).
    let priceFetching = false;      // the request sequence is running
    let fetchedSig = null;          // the signature of the filter fetched last
    function viewSignature(){
      return [fType, fState, fPrice, fGame, (document.getElementById('invSearch')||{}).value||''].join('|');
    }
    function hashesForView(){
      const list = (viewRows && viewRows.length) ? viewRows : (invMerged || []);
      return [...new Set(list.filter(i=>i.marketable && i.marketHashName).map(i=>i.marketHashName))];
    }
    function paintFetchBtn(){
      const b = document.getElementById('invFetchPrices');
      if (!b) return;
      const total = hashesForView().length;
      const done  = hashesForView().filter(h=>priceMap.has(h)).length;
      if (avgFetching){
        b.disabled = false;                       // so it can be cancelled
        b.textContent = tf('İptal Et · # / #', avgDone, avgTotal);
        b.style.opacity = '1'; b.style.cursor = 'pointer';
        b.style.borderColor = '#B37E24'; b.style.color = '#B37E24';
        return;
      }
      if (priceFetching){
        b.disabled = true;
        b.textContent = tf('Getiriliyor # / #', done, total);
        b.style.opacity = '0.6'; b.style.cursor = 'not-allowed';
        b.style.borderColor = '#B37E24'; b.style.color = '#B37E24';
        return;
      }
      b.disabled = false;
      b.style.opacity = '1'; b.style.cursor = 'pointer';
      const current = (fetchedSig === viewSignature()) && done >= total && total > 0 && hashesForView().every(h => historyMap.has(h));
      b.textContent = current ? tf('Fiyatlar Güncel · #', total) : tf('Fiyatları Getir · #', total);
      b.style.borderColor = current ? '#5FB324' : '#24AEB3';
      b.style.color       = current ? '#5FB324' : '#24AEB3';
    }
    async function fetchPricesForView(){
      if (avgFetching){ E.historyCancel(); return; }   // the same button cancels the average part
      if (priceFetching || !invMerged) return;
      const hashes = hashesForView();
      if (!hashes.length){
        if (typeof toast === 'function') toast('Fiyat').fail('Bu filtrede satılabilir öğe yok.');
        return;
      }
      priceFetching = true; fetchedSig = viewSignature();
      paintFetchBtn();
      const res = await E.pricesFor(hashes).catch(()=>null);
      if (res && res.ok && res.prices){ Object.entries(res.prices).forEach(([h,p]) => priceMap.set(h,p)); }
      // The queue may be running on the main side; it is released when price:progress says remaining=0.
      // In the case that returns instantly (all from the cache) it is closed here.
      if (!res || !res.queued){ priceFetching = false; fetchAvgForView(); }
      renderInventory(); paintFetchBtn();
    }
    // First entering the page: ask the user. But ONLY if there are items that are not in the cache.
    let priceAsked = false;
    async function askFetchPrices(){
      if (priceAsked) return;
      // The question is asked only while Inventory is on screen. If the user moved to another tab while the cache was being read
      // the window used to open on top of that tab; it is asked the next time they enter.
      const inventoryVisible = () => designed.inventory && !designed.inventory.classList.contains('hidden');
      if (!inventoryVisible()) return;
      const everything = hashesForView();
      const lacking = everything.filter(h => !priceMap.has(h));
      // If the cache is full enough do not ask at all; the user can fetch with the button below if they want.
      if (!lacking.length){
        paintFetchBtn();
        return;
      }
      priceAsked = true;
      const ok = await edgeConfirm({
        tag: 'Pazar Fiyatları',
        title: 'Fiyatlar hemen getirilsin mi?',
        body: (function(){
          const everything = hashesForView().length;
          const lacking = hashesForView().filter(h => !priceMap.has(h)).length;
          // Since Turkish suffixes change with the number, no suffix is attached to the number.
          return lacking < everything
            ? (tf('Toplam # öğenin # tanesinin fiyatı önbellekte.', everything, everything - lacking) + ' '
               + tf('Kalan # öğe için Steam pazar fiyatı çekilecek.', lacking))
            : tf('Envanterindeki # farklı öğe için Steam pazar fiyatı çekilecek.', everything);
        })(),
        warn: 'Steam pazar isteklerini sınırlıyor. Çok sayıda öğede bu işlem uzun sürer; önce filtre uygulayıp yalnızca ilgilendiğin öğeleri çekmek daha hızlıdır.',
        confirmText: 'Evet, Getir',
        cancelText: 'Hayır, Sonra',
        pageName: 'inventory',
      });
      if (ok) fetchPricesForView();
      else if (typeof toast === 'function') toast('Fiyat').done('Filtreni kur, sonra alttaki "Fiyatları Getir" düğmesine bas.');
      paintFetchBtn();
    }
    // "Price drop alert": when the lowest listing drops below Steam's 24 hour average by the threshold
    // (see SALE > checkPriceDrop). It used to look at the difference between two measurements
    // and was tied to the "error" notification: it never came if the error notification was off.
    E.onPriceOne(({ hashName, price }) => {
      priceMap.set(hashName, price);
      checkPriceDrop(hashName, price);
      scheduleRender();
    });
    E.onPriceProgress(({ remaining, cooldown }) => {
      const el = document.getElementById('invPriceProg');
      if (el) el.textContent = remaining > 0
        ? (tf('# kaldı', remaining) + (cooldown ? (' · ' + t('Steam sınırı')) : ''))
        : new Date().toLocaleTimeString(localCode());
      if (remaining === 0){
        const wasFetching = priceFetching;
        priceFetching = false;
        if (wasFetching) fetchAvgForView();   // prices are in: the averages of the same items follow
        if (invMerged) renderInventory();
        if (typeof renderOverviewStats==='function') renderOverviewStats();
      }
      paintFetchBtn();
    });
    let renderTimer = null;
    function scheduleRender(){ if (renderTimer) return; renderTimer = setTimeout(()=>{ renderTimer=null; if(invMerged) renderInventory(); }, 400); }
