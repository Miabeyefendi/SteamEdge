    // ================= ENVANTER & PAZAR (INVENTORY & MARKET) =================
    // The order book in the right panel is parsed structurally from the market page;
    // the realised sales come from the pricehistory endpoint.
    let invItems = null, invMerged = null, envLoaded = false;
    const priceMap = new Map();               // marketHashName -> price obj | null
    // Realised sale history and the current order book. They must be defined above:
    // helpers like medValRaw/realValue read them.
    const historyMap = new Map();
    const ordersMap  = new Map();
    const selected = new Set();               // dedupKey
    let envView = 'list';
    let fType = 'all', fState = 'all', fPrice = 'all', fGame = 'all';
    let invSort = 'value', invSortDir = 'desc';
    let groupByGame = false;
    let viewRows = [];
    let detailKey = null;
    // All sale operations are done FROM THE BOTTOM BAR; the strategy/price sections in the detail panel
    // were removed. bulkStrategy: median | undercut | match | instant | manual
    let bulkStrategy = 'median';
    let manualPrice = null;                   // the amount entered when "Kendim" is selected

    const EC = { ok:'#5FB324', teal:'#24AEB3', bad:'#B32453', brand:'#5624B3', sub:'#C2AAEE',
                 title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345', s1:'#0D1118' };

    // Amounts are in the selected currency (common.js fmtMoney). If "Fiyat gösterimi: Net" is selected
    // the listed prices are shown with Steam's commission deducted.
    const fmtLira = (n) => fmtMoney(n);
    // The "En düşük" and "Ortalama" columns in the list are the MARKET price: the same as the amount on the Steam
    // page, with no deduction at all. The amount you will get (net) is found with Steam's own
    // fee calculation (below, "SALE") and is only shown in the sale flow.
    // "Düşük değer eşiği": items below this amount are shown dimmed and are not included in "select all"
    const lowLimit = () => +((appSettings||{}).invLowValue) || 0;
    const isLowValue = (it) => { const v = medVal(it); return lowLimit() > 0 && v != null && v < lowLimit(); };
    function priceOf(it){ return it.marketHashName ? priceMap.get(it.marketHashName) : undefined; }
    function priceVal(it){ const p = priceOf(it); return p && p.lowestValue != null ? p.lowestValue : null; }
    // Median for DISPLAY: first the weighted median of REALISED sales (if any), otherwise
    // Steam's 24 hour median. The listing price on sale NEVER enters here - someone can list a single
    // piece at 999,999, that is not a "value". If there is none it is left empty.
    function medValRaw(it){
      const h = historyMap.get(it.marketHashName);
      if (h && h !== 'loading' && h !== 'none' && h.stats && h.stats.median != null) return h.stats.median;
      const p = priceOf(it);
      return p && p.medianValue != null ? p.medianValue : null;
    }
    // Median for the ACCOUNT: in places like total value/ranking the lowest listing is the last resort.
    function medVal(it){ const m = medValRaw(it); return m != null ? m : priceVal(it); }
    const TYPE_LABEL = { all:'Tümü', card:'Kart', background:'Arka Plan', emoticon:'İfade', coupon:'Kupon', profile:'Profil Öğesi', other:'Diğer' };
    // The name of Steam foil cards contains "(Foil)" - the real marker for the badge.
    const isFoil = (it) => /\(foil\)/i.test(it.name || '');
    function statusOf(it){
      if (it.marketable) return { label:'Satılabilir', fg:EC.ok };
      if (it.tradable)   return { label:'Takas',       fg:EC.teal };
      return { label:'Satılamaz', fg:EC.bad };
    }

    async function loadEnv(){
      if (envLoaded) return;
      document.getElementById('envRows').innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">Steam\'e bağlanılıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ document.getElementById('envRows').innerHTML = '<div style="padding:20px;color:#B32453;font-size:12px">'+esc(con.error)+'</div>'; return; }
      const res = await E.inventory().catch(e=>({ ok:false, error:(e&&e.message)||'Envanter okunamadı.' }));
      if (!res.ok){ document.getElementById('envRows').innerHTML = '<div style="padding:20px;color:#B32453;font-size:12px">'+esc(res.error)+'</div>'; return; }
      invItems = res.items;
      invMerged = mergeDuplicates(invItems);
      envLoaded = true;
      applyInvSettings();
      buildGameSelect();
      renderEnv();
      await fillFromCache();
      askFetchPrices();
    }

    // When the page opens first read the cache ON DISK. No request goes to Steam, it returns instantly.
    // If there is a cache the prices are already on screen and the user is asked nothing;
    // that was the reason the cache exists, it used to be fetched from scratch on every open.
    async function fillFromCache(){
      const hashes = hashesForView();
      if (!hashes.length) return;
      const res = await E.pricesForCached(hashes).catch(()=>null);
      if (res && res.ok && res.prices){
        Object.entries(res.prices).forEach(([h,p]) => priceMap.set(h,p));
        if (Object.keys(res.prices).length){
          fetchedSig = viewSignature();
          renderEnv(); paintFetchBtn();
        }
      }
      // G8: the averages are kept on disk too; if present show instantly, no request goes to Steam.
      const hres = await E.historyForCached(hashes).catch(()=>null);
      if (hres && hres.ok && hres.history){
        let added = 0;
        Object.entries(hres.history).forEach(([h,x]) => { if (x){ historyMap.set(h,x); added++; } });
        if (added){ renderEnv(); }
      }
      paintAvgBtn();
    }

    // ---- G8: BULK FETCH of the AVERAGE (realised sale median) ----
    // Why a separate button: the list price (priceoverview) cannot come in multiples in one request but it is cheap;
    // the sale history (pricehistory) needs a separate request for EVERY ITEM. Steam's limit is
    // ~20 requests / 30 seconds per account. For a 200 item inventory this takes minutes, so
    // it does not start unless the user explicitly asks and they can cancel whenever they want.
    let avgFetching = false, avgDone = 0, avgTotal = 0;
    function paintAvgBtn(){
      const b = document.getElementById('envFetchAvg');
      if (!b) return;
      const everything = hashesForView();
      const lacking = everything.filter(h => !historyMap.has(h)).length;
      if (avgFetching){
        b.disabled = false;                       // so it can be cancelled
        b.textContent = tf('İptal Et · # / #', avgDone, avgTotal);
        b.style.borderColor = '#B37E24'; b.style.color = '#B37E24';
        b.style.cursor = 'pointer';
        return;
      }
      b.disabled = false;
      b.style.cursor = 'pointer';
      if (!everything.length){ b.textContent = t('Ortalamaları Getir'); b.style.borderColor = '#2B3345'; b.style.color = '#656D80'; return; }
      if (!lacking){
        b.textContent = tf('Ortalamalar Güncel · #', everything.length);
        b.style.borderColor = '#5FB324'; b.style.color = '#5FB324';
      } else {
        b.textContent = tf('Ortalamaları Getir · #', lacking);
        b.style.borderColor = '#5624B3'; b.style.color = '#C2AAEE';
      }
    }

    async function fetchAvgForView(){
      if (avgFetching){ E.historyCancel(); return; }
      const everything = hashesForView();
      const lacking = everything.filter(h => !historyMap.has(h));
      if (!lacking.length){
        if (typeof toast === 'function') toast('Ortalama').done('Bu filtredeki tüm ortalamalar zaten var.');
        return;
      }
      // It can take long because of Steam's limit - tell the user the duration BEFOREHAND.
      const estimateSec = Math.ceil(lacking.length * 1.6);
      const ok = await edgeConfirm({
        tag:'Ortalama Fiyatlar',
        title: tf('# öğe için gerçekleşen satış geçmişi çekilecek', lacking.length),
        body: t('Ortalama (medyan) değer, Steam pazarında gerçekleşen satışlardan hesaplanır. Liste fiyatının aksine her öğe için ayrı istek gerekir.')
              + '\n\n' + t('Tahmini süre:') + ' ' + (estimateSec > 90 ? durationUnit(Math.ceil(estimateSec/60), 'dakika') : durationUnit(estimateSec, 'saniye')),
        warn: 'Steam hesap başına yaklaşık 30 saniyede 20 istek sınırı uygular. İşlem sürerken uygulamayı kullanmaya devam edebilir, istediğin an iptal edebilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok) return;
      avgFetching = true; avgDone = 0; avgTotal = lacking.length;
      paintAvgBtn();
      const res = await E.historyFor(lacking).catch(()=>null);
      if (!res || !res.ok){
        avgFetching = false; paintAvgBtn();
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
        avgDone = d.yapilan || 0; avgTotal = d.toplam || avgTotal;
        if (d.bitti){
          avgFetching = false;
          renderEnv(); paintAvgBtn();
          if (typeof toast === 'function'){
            if (d.iptal) toast('Ortalama').done(tf('İptal edildi · # öğe alındı.', avgDone));
            else toast('Ortalama').done(tf('# öğenin ortalaması güncellendi.', avgDone));
          }
          return;
        }
        paintAvgBtn();
        // Refresh the list every 10 items - so progress is visible without drawing constantly
        if (avgDone % 10 === 0) renderEnv();
      });
    }

    // The Envanter preferences on the Settings screen (default sort, low value threshold etc.)
    // When Ayarlar > Genel > "Para birimi" changes the FIXED ₺ texts on the page must be updated too
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
        ['envStatValue','bulkGross','bulkNet'].forEach(id=>{
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
        // "Varsayılan satış fiyatı" - the starting strategy of the detail panel and the bottom bar
        const map = { median:'median', lowest:'match', undercut:'undercut', match:'match', manual:'manual' };
        const s = map[appSettings.saleMode];
        if (s) bulkStrategy = s;
      }
      const sel = document.getElementById('efState'); if (sel) sel.value = fState;
      paintGroupBtn();
      armPriceAutoRefresh();
    }

    // "Fiyatları otomatik yenile" + "Fiyat yenileme aralığı" - refreshes in the background while Envanter is open
    let priceRefreshTimer = null;
    function armPriceAutoRefresh(){
      if (priceRefreshTimer){ clearInterval(priceRefreshTimer); priceRefreshTimer = null; }
      if (!appSettings || !appSettings.autoRefreshPrices) return;
      const mins = Math.max(1, +appSettings.priceRefreshMin || 15);
      priceRefreshTimer = setInterval(()=>{
        const visible = document.getElementById('tab-env') && !document.getElementById('tab-env').classList.contains('hidden');
        if (visible && invMerged && !priceFetching) fetchPricesForView();
      }, mins * 60 * 1000);
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
    // as soon as the page opened hit the limit and the boxes filled with "alınamadı". Now:
    //   1) On first entering the page it asks "fetch now?".
    //   2) If the answer is no the user sets up the filter and presses the "Fiyatları Getir" button.
    //   3) Only the items that match the CURRENT filter are fetched, the button stays locked until all are done.
    //   4) If the filter changes the button opens again (a new list needs a new request).
    let priceFetching = false;      // the request sequence is running
    let fetchedSig = null;          // the signature of the filter fetched last
    function viewSignature(){
      return [fType, fState, fPrice, fGame, (document.getElementById('envSearch')||{}).value||''].join('|');
    }
    function hashesForView(){
      const list = (viewRows && viewRows.length) ? viewRows : (invMerged || []);
      return [...new Set(list.filter(i=>i.marketable && i.marketHashName).map(i=>i.marketHashName))];
    }
    (function bindAvgBtn(){
      const b = document.getElementById('envFetchAvg');
      if (b) b.onclick = fetchAvgForView;
    })();

    function paintFetchBtn(){
      const b = document.getElementById('envFetchPrices');
      if (!b) return;
      const total = hashesForView().length;
      const done  = hashesForView().filter(h=>priceMap.has(h)).length;
      if (priceFetching){
        b.disabled = true;
        b.textContent = tf('Getiriliyor # / #', done, total);
        b.style.opacity = '0.6'; b.style.cursor = 'not-allowed';
        b.style.borderColor = '#B37E24'; b.style.color = '#B37E24';
        return;
      }
      b.disabled = false;
      b.style.opacity = '1'; b.style.cursor = 'pointer';
      const current = (fetchedSig === viewSignature()) && done >= total && total > 0;
      b.textContent = current ? tf('Fiyatlar Güncel · #', total) : tf('Fiyatları Getir · #', total);
      b.style.borderColor = current ? '#5FB324' : '#24AEB3';
      b.style.color       = current ? '#5FB324' : '#24AEB3';
    }
    async function fetchPricesForView(){
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
      if (!res || !res.queued){ priceFetching = false; }
      renderEnv(); paintFetchBtn();
    }
    // First entering the page: ask the user. But ONLY if there are items that are not in the cache.
    let priceAsked = false;
    async function askFetchPrices(){
      if (priceAsked) return;
      // The question is asked only while Envanter is on screen. If the user moved to another tab while the cache was being read
      // the window used to open on top of that tab; it is asked the next time they enter.
      const envVisible = () => designed.env && !designed.env.classList.contains('hidden');
      if (!envVisible()) return;
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
          // Since Turkish suffixes change with the number ("80'inin", "3'ünün") no suffix is attached to the number.
          return lacking < everything
            ? (tf('Toplam # öğenin # tanesinin fiyatı önbellekte.', everything, everything - lacking) + ' '
               + tf('Kalan # öğe için Steam pazar fiyatı çekilecek.', lacking))
            : tf('Envanterindeki # farklı öğe için Steam pazar fiyatı çekilecek.', everything);
        })(),
        warn: 'Steam pazar isteklerini sınırlıyor. Çok sayıda öğede bu işlem uzun sürer; önce filtre uygulayıp yalnızca ilgilendiğin öğeleri çekmek daha hızlıdır.',
        confirmText: 'Evet, Getir',
        cancelText: 'Hayır, Sonra',
        sayfa: 'env',
      });
      if (ok) fetchPricesForView();
      else if (typeof toast === 'function') toast('Fiyat').done('Filtreni kur, sonra alttaki "Fiyatları Getir" düğmesine bas.');
      paintFetchBtn();
    }
    // "Fiyat düşüşü uyarısı": when the lowest listing drops below Steam's 24 hour average by the threshold
    // (see SALE > checkPriceDrop). It used to look at the difference between two measurements
    // and was tied to the "error" notification: it never came if the error notification was off.
    E.onPriceOne(({ hashName, price }) => {
      priceMap.set(hashName, price);
      checkPriceDrop(hashName, price);
      scheduleRender();
    });
    E.onPriceProgress(({ remaining, cooldown }) => {
      const el = document.getElementById('envPriceProg');
      if (el) el.textContent = remaining > 0
        ? (tf('# kaldı', remaining) + (cooldown ? (' · ' + t('Steam sınırı')) : ''))
        : new Date().toLocaleTimeString(localCode());
      if (remaining === 0){
        priceFetching = false;
        if (invMerged) renderEnv();
        if (typeof renderGenelStats==='function') renderGenelStats();
      }
      paintFetchBtn();
    });
    let renderTimer = null;
    function scheduleRender(){ if (renderTimer) return; renderTimer = setTimeout(()=>{ renderTimer=null; if(invMerged) renderEnv(); }, 400); }

    // ---- filters (the selects in the top bar) ----
    function buildGameSelect(){
      const sel = document.getElementById('efGame');
      const games = [...new Set(invMerged.map(i=>i.gameName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      sel.innerHTML = '<option value="all">Tüm oyunlar</option>' + games.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('');
    }
    document.getElementById('efType').addEventListener('change', e=>{ fType=e.target.value; renderEnv(); });
    document.getElementById('efGame').addEventListener('change', e=>{ fGame=e.target.value; renderEnv(); });
    document.getElementById('efState').addEventListener('change', e=>{ fState=e.target.value; renderEnv(); });
    document.getElementById('efPrice').addEventListener('change', e=>{ fPrice=e.target.value; renderEnv(); });
    document.getElementById('envSearch').addEventListener('input', renderEnv);
    document.getElementById('efReset').onclick = ()=>{
      fType='all'; fState='all'; fPrice='all'; fGame='all'; invSort='value'; invSortDir='desc'; groupByGame=false;
      ['efType','efGame','efState','efPrice'].forEach(id=>document.getElementById(id).value='all');
      document.getElementById('envSearch').value='';
      paintGroupBtn(); renderEnv();
    };

    function paintView(){
      const l = document.getElementById('vList'), g = document.getElementById('vGrid');
      const on = { background:EC.brand, borderColor:EC.brand, color:EC.title };
      const off = { background:'transparent', borderColor:'transparent', color:EC.muted };
      Object.assign(l.style, envView==='list'?on:off);
      Object.assign(g.style, envView==='grid'?on:off);
    }
    document.getElementById('vList').onclick = ()=>{ envView='list'; paintView(); renderEnv(); };
    document.getElementById('vGrid').onclick = ()=>{ envView='grid'; paintView(); renderEnv(); };
    paintView();

    function paintGroupBtn(){
      const b = document.getElementById('envGroup');
      b.style.background = groupByGame ? EC.brand : 'transparent';
      b.style.borderColor = groupByGame ? EC.brand : EC.bd;
      b.style.color = groupByGame ? EC.title : EC.muted;
    }
    document.getElementById('envGroup').onclick = ()=>{ groupByGame = !groupByGame; paintGroupBtn(); renderEnv(); };

    // ---- column sort ----
    function toggleInvSort(key){
      if (invSort === key) invSortDir = invSortDir==='asc' ? 'desc' : 'asc';
      else { invSort = key; invSortDir = (key==='name'||key==='game') ? 'asc' : 'desc'; }
      renderEnv();
    }
    [['envSortName','name'],['envSortGame','game'],['envSortQty','qty'],['envSortLow','low'],['envSortMed','med'],['envSortStatus','status']]
      .forEach(([id,key])=>{ document.getElementById(id).onclick = ()=>toggleInvSort(key); });

    function applyFilters(){
      const q = document.getElementById('envSearch').value.trim().toLowerCase();
      const buckets = { all:[0,Infinity], '0-1':[0,1], '1-5':[1,5], '5-10':[5,10], '10-':[10,Infinity] };
      const pb = buckets[fPrice] || buckets.all;
      let out = invMerged.filter(i=>{
        // "Satılan öğeyi envanterden gizle": the copies put on sale in this session are subtracted;
        // if all were put on sale the row is hidden. The Steam inventory is sometimes updated late.
        if (appSettings && appSettings.hideAfterSell && i.assetIds.every(a=>listedAssets.has(a))) return false;
        if (fType !== 'all' && i.type !== fType) return false;
        if (fGame !== 'all' && i.gameName !== fGame) return false;
        if (fState === 'marketable' && !i.marketable) return false;
        if (fState === 'notmarketable' && i.marketable) return false;
        if (fState === 'tradable' && !i.tradable) return false;
        if (fState === 'nottradable' && i.tradable) return false;
        if (q && !(i.name.toLowerCase().includes(q) || (i.gameName||'').toLowerCase().includes(q))) return false;
        if (fPrice !== 'all'){
          const v = medVal(i);
          if (v == null || v < pb[0] || v > pb[1]) return false;
        }
        return true;
      });
      const dir = invSortDir === 'asc' ? 1 : -1;
      const cmp = {
        name:  (a,b)=>a.name.localeCompare(b.name)*dir,
        game:  (a,b)=>String(a.gameName||'').localeCompare(String(b.gameName||''))*dir,
        qty:   (a,b)=>(a.count-b.count)*dir,
        low:   (a,b)=>((priceVal(a)??-1)-(priceVal(b)??-1))*dir,
        med:   (a,b)=>((medVal(a)??-1)-(medVal(b)??-1))*dir,
        value: (a,b)=>((medVal(a)??-1)-(medVal(b)??-1))*dir,
        status:(a,b)=>((a.marketable?2:a.tradable?1:0)-(b.marketable?2:b.tradable?1:0))*dir,
        steam: (a,b)=>a.order-b.order,
      }[invSort];
      out = cmp ? out.slice().sort(cmp) : out;
      if (groupByGame) out = out.slice().sort((a,b)=>String(a.gameName||'').localeCompare(String(b.gameName||'')));
      return out;
    }

    function renderStats(){
      let total=0, sellable=0, tradable=0, value=0;
      invMerged.forEach(i=>{
        total += i.count;
        if (i.marketable) sellable += i.count;
        if (i.tradable) tradable += i.count;
        const v = medVal(i);
        if (i.marketable && v != null) value += v * i.count;
      });
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('envStatTotal', total.toLocaleString(localCode()));
      set('envStatSellable', sellable.toLocaleString(localCode()));
      set('envStatTradable', tradable.toLocaleString(localCode()));
      set('envStatValue', fmtLira(value));
    }

    function arrows(){
      const a = (k)=>invSort===k ? (invSortDir==='asc'?'▲':'▼') : '';
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('arrName',a('name')); set('arrGame',a('game')); set('arrQty',a('qty'));
      set('arrLow',a('low')); set('arrMed',a('med'));
    }

    const ROW_H = () => (appSettings && appSettings.compactRows) ? 34 : 46;
    const GRID_COLS = '34px 14px 44px minmax(220px,1.6fr) minmax(150px,1.1fr) 92px 116px 116px';

    // G9: the "half the rows stay grey" complaint. This is not a bug: items below Ayarlar > Envanter >
    // Düşük değer eşiği are shown dimmed. Since it was written nowhere the user
    // thought it was a sort and got confused. Now there is a small explanation in the top bar.
    function drawThresholdBadge(){
      const el = document.getElementById('envEsikNot');
      if (!el) return;
      const threshold = lowLimit();
      const faded = (viewRows || []).filter(isLowValue).length;
      if (!threshold || !faded){ el.style.display = 'none'; return; }
      el.style.display = 'flex';
      el.title = 'Ayarlar > Envanter > Düşük değer eşiği ile değiştirilir.';
      el.innerHTML = '<span style="width:6px;height:6px;border-radius:12px;background:#656D80;flex-shrink:0"></span>'
        + '<span>' + esc(tf('Soluk satırlar: # altındaki # öğe', fmtLira(threshold), faded)) + '</span>';
    }

    function rowHTML(it){
      const st = statusOf(it);
      const on = selected.has(it.dedupKey);
      const p = priceOf(it);
      const low = p === undefined ? '…' : (priceVal(it)!=null ? fmtLira(priceVal(it)) : '-');
      const dropEvent = priceDrop(it);
      const med = p === undefined ? '…' : (medValRaw(it)!=null ? fmtLira(medValRaw(it)) : '-');
      const foil = isFoil(it);
      return '<div data-k="'+esc(it.dedupKey)+'" class="h-row" style="display:grid;grid-template-columns:'+GRID_COLS+';gap:0;align-items:center;height:'+ROW_H()+'px;padding:0 22px 0 44px;border-bottom:1px solid #101621;cursor:pointer;background:'+(on?'#101621':'transparent')+';opacity:'+(isLowValue(it)?0.55:1)+'">'
        + '<div data-a="check" style="width:16px;height:16px;border-radius:12px;border:1px solid '+(on?EC.brand:EC.bd)+';background:'+(on?EC.brand:'transparent')+';display:flex;align-items:center;justify-content:center;cursor:pointer">'
          + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#030305" stroke-width="3.4" style="opacity:'+(on?1:0)+'"><path d="M5 13l4 4L19 7"></path></svg></div>'
        + '<div title="'+st.label+'" style="width:7px;height:7px;border-radius:12px;background:'+st.fg+';flex-shrink:0"></div>'
        + '<div style="width:32px;height:32px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + (it.iconUrl?'<img src="'+esc(it.iconUrl)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover">':'') + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;min-width:0;padding-right:12px">'
          + '<span style="font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.name)+'</span>'
          + '<span style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+EC.sub+';border:1px solid '+EC.brand+';border-radius:12px;padding:2px 7px;flex-shrink:0;opacity:'+(foil?1:0)+'">Foil</span>'
        + '</div>'
        + '<span style="font-size:12px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:9px;padding-right:12px">'+esc(it.gameName||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#DCE2FA;text-align:center">'+it.count+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+(dropEvent?'#B32453':'#C2AAEE')+';text-align:center"'
          + (dropEvent ? (' title="'+esc(tf('Steam\'in 24 saatlik ortalamasının # altında', fmtPercent(Math.round(dropEvent*100))))+'"') : '') + '>'
          + (dropEvent ? '▼ ' : '') + low+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#DCE2FA;text-align:center">'+med+'</span>'
        + '</div>';
    }

    function gridHTML(it){
      const st = statusOf(it);
      const on = selected.has(it.dedupKey);
      const med = medValRaw(it)!=null ? fmtLira(medValRaw(it)) : '-';
      const foil = isFoil(it);
      return '<div data-k="'+esc(it.dedupKey)+'" class="h-bd" style="border:1px solid '+(on?EC.brand:EC.bd)+';border-radius:12px;background:#0D1118;padding:10px;cursor:pointer;display:flex;flex-direction:column;gap:8px">'
        + '<div style="aspect-ratio:1;border-radius:12px;background:repeating-linear-gradient(135deg,#151C28 0 6px,#101621 6px 12px);border:1px solid #1D2432;position:relative;overflow:hidden">'
          + (it.iconUrl?'<img src="'+esc(it.iconUrl)+'" loading="lazy" style="width:100%;height:100%;object-fit:contain">':'')
          + '<div data-a="check" style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:12px;border:1px solid '+(on?EC.brand:EC.bd)+';background:'+(on?EC.brand:'#090C12')+';display:flex;align-items:center;justify-content:center;cursor:pointer">'
            + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#030305" stroke-width="3.4" style="opacity:'+(on?1:0)+'"><path d="M5 13l4 4L19 7"></path></svg></div>'
          + '<span style="position:absolute;top:6px;right:6px;font-size:9px;font-weight:700;letter-spacing:0.06em;color:'+EC.sub+';background:#090C12;border:1px solid '+EC.brand+';border-radius:12px;padding:2px 6px;opacity:'+(foil?1:0)+'">Foil</span>'
        + '</div>'
        + '<span style="font-size:11px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.name)+'</span>'
        + '<div style="display:flex;align-items:center;justify-content:space-between">'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#24AEB3">'+med+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#DCE2FA">×'+it.count+'</span>'
        + '</div>'
        + '<span style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:'+st.fg+'">'+st.label+'</span>'
        + '</div>';
    }

    function renderEnv(){
      applyCurrencyLabels();
      if (!invMerged) return;
      renderStats(); arrows();
      viewRows = applyFilters();
      setTimeout(drawThresholdBadge, 0);   // so the count is right after the rows are drawn
      setTimeout(paintAvgBtn, 0);     // when the filter changes the missing count changes too
      paintFetchBtn();   // when the filter changes "Fiyatları Getir" becomes active again
      const scroll = document.getElementById('envScroll');
      const rows = document.getElementById('envRows');
      document.getElementById('envCount').textContent = viewRows.length + ' / ' + invMerged.length + ' öğe';
      if (!viewRows.length){
        rows.removeAttribute('style');
        rows.innerHTML = '<div style="padding:64px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Filtrelere uyan öğe yok</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Fiyat aralığını genişlet ya da filtreleri sıfırla.</span></div>';
      } else if (envView === 'grid'){
        rows.setAttribute('style','padding:16px 22px 16px 44px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;align-content:start');
        rows.innerHTML = viewRows.map(gridHTML).join('');
      } else {
        rows.removeAttribute('style');
        rows.innerHTML = viewRows.map(rowHTML).join('');
      }
      scroll.scrollTop = Math.min(scroll.scrollTop, scroll.scrollHeight);
      renderBulk(); renderDetail();
    }

    // a single delegate: row selection + detail
    // Note: instead of redrawing the whole list only the related row is updated - with 2000+ items
    // rebuilding innerHTML from scratch was both slow and reset the scroll position.
    function paintRowSelection(host, on){
      const box = host.querySelector('[data-a="check"]');
      if (box){
        box.style.borderColor = on ? EC.brand : EC.bd;
        box.style.background  = on ? EC.brand : (envView==='grid' ? '#090C12' : 'transparent');
        const tick = box.querySelector('svg'); if (tick) tick.style.opacity = on ? 1 : 0;
      }
      if (envView === 'grid') host.style.borderColor = on ? EC.brand : EC.bd;
      else host.style.background = on ? '#101621' : 'transparent';
    }
    document.getElementById('envRows').addEventListener('click', (e)=>{
      const host = e.target.closest('[data-k]');
      if (!host) return;
      const key = host.getAttribute('data-k');
      if (e.target.closest('[data-a="check"]')){
        const on = !selected.has(key);
        on ? selected.add(key) : selected.delete(key);
        paintRowSelection(host, on);
        renderBulk();
        return;
      }
      detailKey = key;
      renderDetail();
    });
    document.getElementById('envRows').addEventListener('dblclick', (e)=>{
      const host = e.target.closest('[data-k]'); if (!host) return;
      const it = invMerged.find(x=>x.dedupKey===host.getAttribute('data-k')); if (!it) return;
      const action = (appSettings && appSettings.dblAction) || 'open';
      if (action==='steam' || action==='open') window.imu.openExternal('https://steamcommunity.com/market/listings/753/'+encodeURIComponent(it.marketHashName||''));
      else if (action==='detail'){ detailKey = it.dedupKey; renderEnv(); }
      else if (action==='sell' || action==='now') sellFlow([it], bulkStrategy);
      else if (action==='copy') navigator.clipboard.writeText(it.name);
    });

    document.getElementById('selAll').onclick = ()=>{
      const all = viewRows.length && viewRows.every(i=>selected.has(i.dedupKey));
      viewRows.forEach(i => { if (all) selected.delete(i.dedupKey); else if (!isLowValue(i)) selected.add(i.dedupKey); });
      const box = document.getElementById('selAll');
      box.style.background = all ? 'transparent' : EC.brand;
      box.style.borderColor = all ? EC.bd : EC.brand;
      document.querySelectorAll('#envRows [data-k]').forEach(h=>paintRowSelection(h, selected.has(h.getAttribute('data-k'))));
      renderBulk();
    };
    document.getElementById('bulkClear').onclick = ()=>{
      selected.clear();
      document.querySelectorAll('#envRows [data-k]').forEach(h=>paintRowSelection(h, false));
      const box = document.getElementById('selAll');
      box.style.background = 'transparent'; box.style.borderColor = EC.bd;
      renderBulk();
    };

    // ---- sale price strategies (computed from the real price) ----
    function strategyPrice(it, strat){
      // "Altına in" / "En ucuzla aynı" look at the CURRENT listings (that is where the competition is).
      // "Ortalama" comes from REALISED sales - so that an outlier listing on sale
      // does not inflate it. It never goes below Steam's lower limit (0.03 etc.).
      const ord = ordersMap.get(it.marketHashName);
      const bookLow = (ord && ord !== 'loading' && ord !== 'none' && ord.lowestSell != null) ? ord.lowestSell : null;
      const low = bookLow != null ? bookLow : priceVal(it);
      const cents = ((appSettings && +appSettings.undercutCents) || 1) / 100;
      const floor = (typeof marketMin === 'function') ? marketMin() : 0.03;
      const clamp = (v) => (v == null ? null : Math.max(floor, v));
      if (strat === 'manual')   return clamp(manualPrice);
      if (strat === 'undercut') return low != null ? clamp(low - cents) : null;
      if (strat === 'match')    return clamp(low);
      // "Hemen sat": you sell to the highest waiting buy order, it goes instantly.
      // If there is no waiting order the value is not ignored; instantPrice falls back to the last sale/the average.
      if (strat === 'instant')  return clamp(instantPrice(it).value);
      return clamp(realValue(it).value);   // average (from realised sales)
    }

    // The "Hemen Sat" value. The priority is a real buy order; if there is none it does NOT mean the item is worthless,
    // only that there is no buyer waiting at that moment. In that case it falls back to the last realised sale, and if
    // there is none to the sale average and the source is stated clearly. (It used to be that for items
    // with no order no price was produced and dozens of items stayed empty.)
    function instantPrice(it){
      const o = ordersMap.get(it.marketHashName);
      if (o && o !== 'loading' && !o.failed && o.highestBuy != null){
        return { value: o.highestBuy, src: 'order' };
      }
      const h = historyMap.get(it.marketHashName);
      if (h && h !== 'loading' && h !== 'none'){
        if (h.last != null) return { value: h.last, src: 'lastSale', ts: h.lastDate };
        if (h.stats && h.stats.median != null) return { value: h.stats.median, src: 'avg', days: h.stats.days };
      }
      const rv = realValue(it);
      return rv.value != null ? { value: rv.value, src: rv.src === 'sales' ? 'avg' : rv.src } : { value: null, src: null };
    }

    function renderBulk(){
      const items = invMerged.filter(i=>selected.has(i.dedupKey));
      const gross = items.reduce((s,i)=>{ const v=strategyPrice(i, bulkStrategy); return s + (v!=null ? v*i.count : 0); },0);
      const units = items.reduce((s,i)=>s+i.count,0);
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('bulkCount', units); set('bulkCount2', units);
      set('bulkGross', fmtLira(gross));
      // What you will get: Steam's own fee calculation per item. "…" if it has not arrived yet.
      let net = 0, missingNet = false;
      const needed = [];
      items.forEach(i=>{
        const v = strategyPrice(i, bulkStrategy);
        if (v == null) return;
        const sn = sellerAmount(v);
        if (sn == null){ missingNet = true; needed.push(v); } else net += sn * i.count;
      });
      set('bulkNet', missingNet ? '…' : fmtLira(net));
      if (needed.length) prepareNet(needed);
      document.querySelectorAll('#bulkStrat button[data-bs]').forEach(b=>{
        const on = b.getAttribute('data-bs')===bulkStrategy;
        b.style.background = on ? EC.brand : 'transparent';
        b.style.borderColor = on ? EC.brand : 'transparent';
        b.style.color = on ? EC.title : EC.muted;
      });
      // The manual price box is visible only while "Kendim" is selected
      const mi = document.getElementById('bulkManual');
      if (mi) mi.style.display = (bulkStrategy === 'manual') ? '' : 'none';
      paintBulkWarn(items);
    }

    // PRICE DEVIATION WARNING. If the selected price is far from the real market value
    // it says so: if too high the item will not sell, if too low money is lost.
    function paintBulkWarn(items){
      const w = document.getElementById('bulkWarn');
      if (!w) return;
      let high = 0, lowVal = 0, unpriced = 0;
      items.forEach(i=>{
        const p = strategyPrice(i, bulkStrategy);
        if (p == null){ unpriced++; return; }
        const actual = realValue(i).value;
        if (actual == null || actual <= 0) return;
        const difference = (p - actual) / actual;
        if (difference > 0.25) high++;
        else if (difference < -0.25) lowVal++;
      });
      const pieces = [];
      if (unpriced) pieces.push(tf('# öğenin fiyatı yok (önce fiyatları getir)', unpriced));
      if (high)   pieces.push(tf('# öğe piyasanın %25+ üstünde, geç satılabilir', high));
      if (lowVal)    pieces.push(tf('# öğe piyasanın %25+ altında, zararına gidebilir', lowVal));
      if (!pieces.length){ w.style.display = 'none'; return; }
      w.style.display = 'flex';
      w.innerHTML = '<span style="width:6px;height:6px;border-radius:12px;background:#B37E24;flex-shrink:0"></span>'
                  + '<span>' + esc(pieces.join(' · ')) + '</span>';
    }

    document.querySelectorAll('#bulkStrat button[data-bs]').forEach(b=>b.addEventListener('click', ()=>{
      bulkStrategy = b.getAttribute('data-bs');
      if (bulkStrategy === 'manual'){
        // If the box is empty put the selected item's real value as the starting value
        const mi = document.getElementById('bulkManual');
        if (mi && !mi.value){
          const initial = invMerged.find(i=>selected.has(i.dedupKey));
          const v = initial ? realValue(initial).value : null;
          if (v != null) mi.value = v.toFixed(2);
          manualPrice = v;
        }
      }
      renderBulk();
    }));
    const bulkManualEl = document.getElementById('bulkManual');
    if (bulkManualEl) bulkManualEl.addEventListener('input', ()=>{
      const v = parseFloat(String(bulkManualEl.value).replace(',','.'));
      manualPrice = Number.isFinite(v) && v > 0 ? v : null;
      renderBulk();
    });
    document.getElementById('bulkSellNow').onclick = ()=> sellFlow(invMerged.filter(i=>selected.has(i.dedupKey)), bulkStrategy);
    // "Fiyatları Getir": fetches only those that match the current filter, locked until done.
    document.getElementById('envFetchPrices').onclick = fetchPricesForView;

    // ---- right detail panel ----
    // TWO SEPARATE DATA SOURCES, TWO SEPARATE MEANINGS:
    //   historyMap → REALISED sales (pricehistory). This is an item's real value.
    //   ordersMap  → the CURRENT order book (itemordershistogram): listings on sale and
    //                buy orders. Listings are not binding - someone can list a single piece at
    //                999,999 - so they are not used in the VALUE computation,
    //                they are only shown as "what would happen right now" information.
    async function ensureHistory(it){
      if (!it.marketHashName || !it.marketable) return;
      if (historyMap.has(it.marketHashName)) return;
      historyMap.set(it.marketHashName, 'loading');
      const res = await E.priceHistory(it.marketHashName).catch(()=>null);
      const h = res && res.ok && res.history && !res.history.rateLimited ? res.history : 'none';
      historyMap.set(it.marketHashName, h);
      if (detailKey === it.dedupKey) renderDetail();
    }
    async function ensureOrders(it, force){
      if (!it.marketHashName || !it.marketable) return;
      if (!force && ordersMap.has(it.marketHashName)) return;
      ordersMap.set(it.marketHashName, 'loading');
      if (detailKey === it.dedupKey) renderDetail();
      const res = await E.itemOrders(it.marketHashName).catch(e=>({ ok:false, error:(e&&e.message) }));
      let o;
      if (!res || !res.ok) o = { failed: true, reason: (res && res.error) || 'Uygulama içi iletişim hatası' };
      else if (!res.orders) o = { failed: true, reason: 'Steam boş yanıt döndürdü' };
      else if (res.orders.noCurrency) o = { failed: true, reason: 'hesabın pazar kuru henüz okunmadı' };
      // Keep the reason: saying "alınamadı" is not enough, WHY it could not be fetched must be written.
      else if (res.orders.error || res.orders.rateLimited) o = { failed: true, reason: res.orders.error || 'Steam istek sınırı', rateLimited: !!res.orders.rateLimited };
      else o = res.orders;
      ordersMap.set(it.marketHashName, o);
      if (detailKey === it.dedupKey) renderDetail();
    }
    // An item's REAL market value: the quantity weighted median of realised sales.
    // In order: 30/90 day sale median → Steam's 24 hour median → (last resort) the lowest
    // listing. Which one was used is stated clearly in the interface, the estimate is not hidden.
    function realValue(it){
      const h = historyMap.get(it.marketHashName);
      if (h && h !== 'loading' && h !== 'none' && h.stats && h.stats.median != null){
        return { value: h.stats.median, src: 'sales', days: h.stats.days, volume: h.stats.volume };
      }
      const m = medValRaw(it);
      if (m != null) return { value: m, src: 'steam24' };
      const l = priceVal(it);
      if (l != null) return { value: l, src: 'listing' };
      return { value: null, src: null };
    }

    function renderDetail(){
      const box = document.getElementById('envDetail');
      const it = detailKey ? invMerged.find(x=>x.dedupKey===detailKey) : null;
      if (!it){
        box.innerHTML = '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E">Eşya İncelemesi</span>'
          + '<div style="height:150px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 8px,#101621 8px 16px);display:flex;align-items:center;justify-content:center">'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#656D80">ÖĞE SEÇİLMEDİ</span></div>'
          + '<span style="font-size:12px;color:#8B8F9E">Detay için listeden bir öğeye tıkla.</span>';
        return;
      }
      const hist = it.marketHashName ? historyMap.get(it.marketHashName) : undefined;
      const ord  = it.marketHashName ? ordersMap.get(it.marketHashName)  : undefined;
      const p = priceOf(it);
      const depth = Math.max(3, +((appSettings||{}).bookDepth) || 5);

      // Shared box skeleton: title strip + Price/Quantity table
      const ordRetryBtn = () => '<button data-ordretry style="height:26px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #24AEB3;color:#24AEB3;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Tekrar Dene</button>';
      const histRetryBtn = () => '<button data-histretry style="height:26px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #C2AAEE;color:#C2AAEE;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Tekrar Dene</button>';
      const priceQtyBox = (title, dotColor, headline, rows, empty) =>
        '<div style="border:1px solid #2B3345;border-radius:12px;background:#090C12;overflow:hidden">'
        + '<div style="height:34px;padding:0 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #1D2432;background:#0D1118">'
          + '<span style="width:6px;height:6px;border-radius:12px;background:'+dotColor+';flex-shrink:0"></span>'
          + '<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8B8F9E">'+title+'</span></div>'
        + '<div style="padding:10px 14px 4px;font-size:11px;color:#8B8F9E;line-height:1.5">'+headline+'</div>'
        + (rows
            ? ('<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 14px 4px">'
               + '<span style="font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#656D80">Fiyat</span>'
               + '<span style="font-size:9.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#656D80">Miktar</span></div>'
               + '<div style="padding:0 14px 10px">'+rows+'</div>')
            : '<div style="padding:0 14px 12px;font-size:11px;color:#656D80">'+empty+'</div>')
        + '</div>';
      // The bold value inside the sentence. The sentence is translated by template, the value goes into the placeholder:
      // each language builds its own syntax (the sentence used to be split into pieces and translated separately).
      const thick = (v, colorVal) => '<b style="color:'+(colorVal||'#DCE2FA')+'">'+v+'</b>';
      const pqRows = (list, color) => list.map(r =>
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #101621">'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:'+color+'">'+fmtLira(r.price)+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:#8B8F9E">'+(r.qty)+'</span></div>').join('');

      // --- BOX 1: LISTINGS CURRENTLY ON SALE (the prices users ask) ---
      let sellBox;
      if (!it.marketable) sellBox = priceQtyBox('Satıştaki İlanlar', '#656D80', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (ord === 'loading' || ord === undefined) sellBox = priceQtyBox('Satıştaki İlanlar', '#5FB324', 'Sipariş defteri yükleniyor…', '', '');
      else if (ord.failed) sellBox = priceQtyBox('Satıştaki İlanlar', '#B37E24', esc(t('Sipariş defteri alınamadı:')) + ' ' + thick(esc(t(ord.reason||'bilinmeyen hata')), '#B37E24'), '', ordRetryBtn());
      else {
        const rows = (ord.sell||[]).filter(r=>r.qty>0).slice(0, depth);
        sellBox = priceQtyBox('Satıştaki İlanlar', '#5FB324',
          (ord.lowestSell!=null ? tf('# fiyatından başlayan # ilan var', thick(fmtLira(ord.lowestSell)), thick(ord.sellCount)) : esc(t('Satışta ilan yok.'))),
          rows.length ? pqRows(rows, '#5FB324') : '', 'Satışta ilan yok.');
      }

      // --- BOX 2: HEMEN SAT (buy orders - the highest price that would be paid right now) ---
      let buyBox;
      if (!it.marketable) buyBox = priceQtyBox('Hemen Sat', '#656D80', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (ord === 'loading' || ord === undefined) buyBox = priceQtyBox('Hemen Sat', '#24AEB3', 'Alım talimatları yükleniyor…', '', '');
      else if (ord.failed) buyBox = priceQtyBox('Hemen Sat', '#B37E24', esc(t('Alım talimatları alınamadı:')) + ' ' + thick(esc(t(ord.reason||'bilinmeyen hata')), '#B37E24'), '', ordRetryBtn());
      else if (ord.highestBuy != null) {
        const rows = (ord.buy||[]).filter(r=>r.qty>0).slice(0, depth);
        buyBox = priceQtyBox('Hemen Sat', '#24AEB3',
          tf('Şu an # fiyatına anında satabilirsin · toplam # alım talimatı', thick(fmtLira(ord.highestBuy)), thick(ord.buyCount)),
          rows.length ? pqRows(rows, '#24AEB3') : '', 'Bekleyen alım talimatı yok.');
      }
      else {
        // NO BUY ORDER WAITING. This does NOT mean the item is worthless; it only means
        // there is no buyer waiting at that moment. Instead of leaving the box empty we show the last realised
        // sale (the sale average if there is none) as a reference, and we state the
        // source clearly. Otherwise no price came out for items with no buy order.
        const ip = instantPrice(it);
        if (ip.value == null){
          buyBox = priceQtyBox('Hemen Sat', '#656D80', 'Bekleyen alım talimatı yok ve referans alınacak satış geçmişi de yok.', '', '-');
        } else {
          const source = ip.src === 'lastSale'
            ? (tf('son satış #', thick(fmtLira(ip.value))) + (ip.ts ? (' (' + new Date(ip.ts).toLocaleDateString(localCode()) + ')') : ''))
            : tf('satış ortalaması #', thick(fmtLira(ip.value)));
          buyBox = priceQtyBox('Hemen Sat', '#B37E24',
            thick(esc(t('Şu an bekleyen alım talimatı yok.')), '#B37E24') + '<br>'
            + tf('Referans: #. Bu fiyata anında satamazsın; satışa koyup bir alıcı beklemen gerekir.', source),
            '', '');
        }
      }

      // --- BOX 3: REALISED SALES (where the value comes from) ---
      let saleBox;
      if (!it.marketable) saleBox = priceQtyBox('Gerçekleşen Satışlar', '#656D80', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (hist === 'loading' || hist === undefined) saleBox = priceQtyBox('Gerçekleşen Satışlar', '#C2AAEE', 'Satış geçmişi yükleniyor…', '', '');
      else if (hist === 'none') saleBox = priceQtyBox('Gerçekleşen Satışlar', '#B37E24', 'Satış geçmişi alınamadı (Steam istek limiti olabilir).', '', histRetryBtn());
      else {
        const st = hist.stats || {};
        const win = st.days ? tf('son # gün', st.days) : t('tüm zamanlar');
        const rows = (hist.recent||[]).slice().reverse().slice(0, depth);
        saleBox = priceQtyBox('Gerçekleşen Satışlar', '#C2AAEE',
          tf('Gerçek piyasa değeri # · # içinde # adet satılmış', thick(fmtLira(st.median)), esc(win), thick(st.volume||0))
          + (st.min!=null && st.max!=null ? ('<br>' + esc(tf('aralık # - #', fmtLira(st.min), fmtLira(st.max)))) : ''),
          rows.length ? pqRows(rows, '#C2AAEE') : '', 'Kayıtlı satış yok.');
      }
      const obBoxes = sellBox + buyBox + saleBox;
      box.innerHTML = '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E">Eşya İncelemesi</span>'
        + '<div style="height:150px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 8px,#101621 8px 16px);display:flex;align-items:center;justify-content:center;overflow:hidden">'
          + (it.iconUrl?'<img src="'+esc(it.iconUrl)+'" style="max-width:100%;max-height:100%;object-fit:contain">':'') + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'
          + '<span style="font-size:16px;font-weight:700;color:#DCE2FA">'+esc(it.name)+'</span>'
          + '<span style="font-size:12px;color:#8B8F9E">'+esc(it.gameName||'-')+' · '+esc(t(TYPE_LABEL[it.type]||'Diğer'))+' · ×'+it.count+'</span>'
        + '</div>'
        // Three boxes: listings on sale · hemen sat · realised sales
        + '<div style="display:flex;flex-direction:column;gap:10px">' + obBoxes + '</div>'
        // NOTE: the "Satış Stratejisi" and "Satış fiyatı" sections were REMOVED from this panel.
        // All sale operations are done from the bottom bar (bulk or single, manual price included).
        ;

      // The "Tekrar Dene" buttons in the failed boxes: force-refresh the cache.
      const rOrd = box.querySelector('[data-ordretry]');
      if (rOrd) rOrd.onclick = ()=>{ ordersMap.delete(it.marketHashName); ensureOrders(it, true); };
      const rHist = box.querySelector('[data-histretry]');
      if (rHist) rHist.onclick = ()=>{ historyMap.delete(it.marketHashName); ensureHistory(it); };
      if (!hist) ensureHistory(it);
      if (!ord)  ensureOrders(it);
    }

    // "Pazarda Otomatik Satış" (Kart Düşür > Otomasyon) - when a card drops in a game it lists that game's
    // new sellable cards at the average price. It refreshes the inventory and finds the cards that were not in the PREVIOUS snapshot;
    // so it does not touch the old cards you have.
    let autoSellSeen = null;   // dedupKey -> count (last known inventory)
    // The baseline is taken when card farming STARTS. It used to be taken at the first drop: at that moment the new card
    // was already in the inventory so the first card that dropped was never sold.
    async function autoSellFloor(){
      if (!appSettings || !appSettings.farmAutoSell) return;
      const res = await E.inventory().catch(()=>null);
      if (res && res.ok) autoSellSeen = new Map(mergeDuplicates(res.items).map(i=>[i.dedupKey, i.count]));
    }
    async function autoSellDropped(gameName){
      if (!appSettings || !appSettings.farmAutoSell) return;
      const res = await E.inventory().catch(()=>null);
      if (!res || !res.ok) return;
      const merged = mergeDuplicates(res.items);
      const prev = autoSellSeen;
      autoSellSeen = new Map(merged.map(i=>[i.dedupKey, i.count]));
      if (!prev) return;                       // if the baseline could not be taken at all: count this round only as the baseline
      const fresh = merged.filter(i =>
        i.type === 'card' && i.marketable && i.marketHashName &&
        (!gameName || i.gameName === gameName) &&
        (i.count > (prev.get(i.dedupKey) || 0)));
      if (!fresh.length) return;
      // fetch the prices, then sell from the median
      invMerged = merged;
      await E.pricesFor(fresh.map(i=>i.marketHashName)).then(r=>{
        if (r && r.ok) Object.entries(r.prices).forEach(([h,p]) => priceMap.set(h,p));
      }).catch(()=>{});
      const priced = fresh.filter(i=>medVal(i) != null);
      if (!priced.length) return;
      pushFeed('pazar', 'Otomatik satış', tf('# yeni kart ortalama fiyattan satışa sunuluyor.', priced.length), 'Çalışıyor');
      await sellFlow(priced, 'median');
    }

    // ================= SALE =================
    // The price the user chooses is the price the BUYER pays (the one shown on the Steam market). What goes to Steam
    // is the amount the SELLER keeps; Steam's OWN script computes the fee in between
    // (main.js > engine:satisUcreti). A fixed 13% used to be deducted; because of Steam's base fee
    // on cheap cards the listing deviated 10-67% from the chosen price ($0.05 when $0.03 was chosen).
    //
    // The computed amounts are kept in memory in cents: buyer price -> { satici, alici }.
    const feeCache = new Map();
    let feeRequest = null;
    const subunit = (v) => Math.max(0, Math.round((+v || 0) * 100));
    async function prepareFees(buyerSubunits){
      const lacking = [...new Set(buyerSubunits.filter(k => k > 0 && !feeCache.has(k)))];
      if (!lacking.length) return true;
      const r = await E.satisUcreti(lacking).catch(e => ({ ok:false, error:(e && e.message) }));
      if (!r || !r.ok || !Array.isArray(r.sonuc)) return (r && r.error) || 'Steam ücret hesabı yüklenemedi.';
      r.sonuc.forEach(x => feeCache.set(x.toplam, { satici: x.satici, alici: x.alici }));
      return true;
    }
    // The amount you will get (in currency units). null if the account has not arrived yet.
    function sellerAmount(buyerValue){
      const u = feeCache.get(subunit(buyerValue));
      return u ? u.satici / 100 : null;
    }
    // "Eline geçecek" in the bottom bar: if the fee calculation has not arrived it is requested in the background and drawn when it arrives.
    // If the calculation failed (could not reach Steam) it is not tried again for a minute; otherwise every
    // draw would send a new request.
    let feeErrorTime = 0;
    function prepareNet(degerler){
      if (Date.now() - feeErrorTime < 60000) return;
      const needed = degerler.map(subunit).filter(k => k > 0 && !feeCache.has(k));
      if (!needed.length || feeRequest) return;
      feeRequest = prepareFees(needed)
        .then((r)=>{ if (r !== true) feeErrorTime = Date.now(); })
        .finally(()=>{ feeRequest = null; if (invMerged) renderBulk(); if (typeof renderGenelStats === 'function') renderGenelStats(); });
    }

    // ---- price drop ----
    // Items that drop clearly below Steam's 24 hour average. The notification is tied to
    // its own key ("Fiyat düşüşü uyarısı"), it does not go quiet when the error notification is turned off.
    // The same item is notified once a day. It is also warned with a red line in the sale confirmation.
    const priceDrops = new Map();          // marketHashName -> { yuzde, ts }
    function priceDropThreshold(){ return Math.max(1, +((appSettings || {}).priceDropThreshold) || 10) / 100; }
    function priceDrop(it){
      const p = priceOf(it);
      if (!p || !(p.lowestValue > 0) || !(p.medianValue > 0)) return null;
      const d = (p.medianValue - p.lowestValue) / p.medianValue;
      return d >= priceDropThreshold() ? d : null;
    }
    function checkPriceDrop(hashName, price){
      if (!price || !(price.lowestValue > 0) || !(price.medianValue > 0)) return;
      const d = (price.medianValue - price.lowestValue) / price.medianValue;
      if (d < priceDropThreshold()) { priceDrops.delete(hashName); return; }
      const earlier = priceDrops.get(hashName);
      priceDrops.set(hashName, { yuzde: Math.round(d * 100), ts: earlier ? earlier.ts : Date.now() });
      if (earlier && Date.now() - earlier.ts < 24 * 3600 * 1000) return;
      if (!appSettings || !appSettings.notifyPriceDrop) return;
      const it = invMerged && invMerged.find(x => x.marketHashName === hashName);
      const name = it ? it.name : hashName;
      const title = tf('Fiyat düştü · #', fmtPercent(Math.round(d * 100)));
      const bodyEl = name + ' · ' + fmtLira(price.medianValue) + ' → ' + fmtLira(price.lowestValue);
      notify('fiyat', title, bodyEl);
      pushFeed('hata', title, bodyEl, 'Hata');
    }

    // ---- sale job ----
    // Steam limits listing by the account's trustworthiness: a new account can be stopped after 10-15
    // listings, an old account can list 80+ at once. So:
    //   - When Steam returns an error the job STOPS and the reason is told; no blind continuing.
    //   - If wanted it is split into batches (Ayarlar > Pazar > Parti büyüklüğü). When a batch ends
    //     it either waits for the set time and continues or asks the user.
    // Nearly every listing lands in the Steam Guard mobile confirmation; when the job ends it is said how many
    // are waiting for confirmation. The two step "type SAT" confirmation was removed: prompt() never
    // worked in Electron and the real second step is already Steam Guard.
    let saleTask = null;
    const listedAssets = new Set();     // the assetIds put on sale in this session
    // The batch settings are read live while the job runs: the new value saved in Ayarlar takes effect
    // at the next batch limit. 0 = do not split into batches, list until Steam stops it.
    function saleBatchSize(){ const n = +((appSettings || {}).bulkSellLimit); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; }
    function saleBatchWait(){ return Math.max(0, +((appSettings || {}).sellBatchWaitMin) || 0); }
    const cancellableWait = (ms, g) => new Promise((solve)=>{
      const latest = Date.now() + ms;
      const t = setInterval(()=>{ if (g.iptal || g.simdiDevam || Date.now() >= latest){ clearInterval(t); solve(); } else drawSaleStatus(); }, 1000);
    });

    function drawSaleStatus(){
      let el = document.getElementById('satisGorev');
      const g = saleTask;
      if (!g){ if (el) el.remove(); return; }
      if (!el){
        el = document.createElement('div');
        el.id = 'satisGorev';
        el.style.cssText = 'position:absolute;right:26px;bottom:88px;z-index:20;display:flex;align-items:center;gap:12px;'
          + 'padding:12px 14px;border-radius:12px;background:#0D1118;border:1px solid #5624B3;box-shadow:0 8px 28px rgba(0,0,0,.45);max-width:560px';
        const container = document.getElementById('tab-env');
        if (container){ if (getComputedStyle(container).position === 'static') container.style.position = 'relative'; container.appendChild(el); }
        el.addEventListener('click', (e)=>{
          const b = e.target.closest('[data-sg]'); if (!b || !saleTask) return;
          const a = b.getAttribute('data-sg');
          if (a === 'durdur'){ saleTask.iptal = true; drawSaleStatus(); }
          else if (a === 'devam'){ saleTask.simdiDevam = true; }
        });
      }
      const remaining = g.plan.length - g.i;
      let text, buttons = '';
      if (g.bekleme){
        const sn = Math.max(0, Math.round((g.bekleme - Date.now()) / 1000));
        text = tf('Parti tamamlandı · sonraki parti # sonra', fmtDuration(sn)) + ' · ' + tf('# öğe bekliyor', remaining);
        buttons = '<button data-sg="devam" class="h-brand" style="'+SG_BTN+'">'+esc(t('Şimdi Devam Et'))+'</button>';
      } else if (g.soruyor){
        text = tf('Parti tamamlandı · # öğe bekliyor', remaining);
        buttons = '<button data-sg="devam" class="h-brand" style="'+SG_BTN+'">'+esc(t('Sonraki Partiyi Listele'))+'</button>';
      } else {
        text = tf('Satışa sunuluyor · # / #', g.i, g.plan.length);
      }
      if (g.mobilOnay) text += ' · ' + tf('# ilan Steam Guard onayı bekliyor', g.mobilOnay);
      el.innerHTML = '<span style="width:7px;height:7px;border-radius:12px;background:#5624B3;flex-shrink:0;animation:e-dotPulse 1.6s ease-in-out infinite"></span>'
        + '<span style="font-size:12px;color:#DCE2FA;line-height:1.5">' + esc(text) + '</span>'
        + buttons
        + '<button data-sg="durdur" class="h-stop" style="'+SG_BTN.replace('#5624B3','#B32453').replace('#C2AAEE','#B32453')+'">'+esc(t('Durdur'))+'</button>';
    }
    const SG_BTN = 'height:28px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #5624B3;color:#C2AAEE;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;flex-shrink:0;white-space:nowrap';
    function fmtDuration(sn){ const d = Math.floor(sn/60), s = sn%60; return d ? (d+':'+String(s).padStart(2,'0')) : (s+' sn'); }

    async function sellFlow(items, strat){
      if (saleTask){ toast('Satış').fail('Önceki satış işlemi sürüyor.'); return; }
      const sellable = items.filter(i=>i.marketable && i.marketHashName && strategyPrice(i,strat)!=null);
      if (!sellable.length){ toast('Satış').fail('Seçilen öğelerin fiyatı henüz yüklenmedi veya satılabilir değil.'); return; }
      const t0 = toast('Steam ücretleri hesaplanıyor…');
      const ready = await prepareFees(sellable.map(i => subunit(strategyPrice(i, strat))));
      if (ready !== true){ t0.fail(t(ready)); return; }
      t0.done('Steam ücretleri hesaplandı.');
      const plan = [], rowsList = [], dropList = [];
      let totalBuyer = 0, totalSeller = 0;
      sellable.forEach(i=>{
        const u = feeCache.get(subunit(strategyPrice(i, strat)));
        if (!u || !(u.satici > 0)) return;
        const assets = i.assetIds.filter(a => !listedAssets.has(a));
        if (!assets.length) return;
        assets.forEach(aid => plan.push({ assetId: aid, satici: u.satici, alici: u.alici, name: i.name, dedupKey: i.dedupKey }));
        totalBuyer += u.alici * assets.length; totalSeller += u.satici * assets.length;
        rowsList.push('• ' + i.name + ' ×' + assets.length + ' → ' + fmtLira(u.alici/100) + ' (' + t('eline geçecek') + ' ' + fmtLira(u.satici/100) + ')');
        // Warn if the selected price is clearly below Steam's 24 hour average
        const p = priceOf(i);
        if (p && p.medianValue > 0){
          const d = (p.medianValue - u.alici/100) / p.medianValue;
          if (d >= priceDropThreshold()) dropList.push(i.name + ': ' + fmtLira(u.alici/100) + ' < ' + fmtLira(p.medianValue) + ' (' + t('24 saatlik ortalama') + ', -' + fmtPercent(Math.round(d*100)) + ')');
        }
      });
      if (!plan.length){ toast('Satış').fail('Listelenecek geçerli fiyat bulunamadı.'); return; }
      const lot = saleBatchSize();
      const waitMin = saleBatchWait();
      if (!appSettings || appSettings.confirmBeforeSell !== false){
        const batchNote = (lot && plan.length > lot)
          ? ('\n\n' + tf('# öğe, # öğelik partiler hâlinde listelenecek.', plan.length, lot) + ' '
             + (waitMin ? tf('Partiler arasında # dakika beklenir.', waitMin) : t('Her parti bitince devam etmek için onayın istenir.')))
          : '';
        const ok = await edgeConfirm({
          tag: 'Pazarda Sat', danger: true,
          title: tf('# öğe satışa sunulacak', plan.length),
          body: rowsList.slice(0,12).join('\n') + (rowsList.length > 12 ? ('\n' + tf('… ve # tane daha', rowsList.length - 12)) : '')
                + '\n\n' + t('Alıcının ödeyeceği toplam:') + ' ' + fmtLira(totalBuyer/100)
                + '\n' + t('Steam kesintisi sonrası eline geçecek:') + ' ' + fmtLira(totalSeller/100)
                + batchNote,
          uyariKirmizi: dropList.length
            ? (t('Dikkat: bu öğelerin fiyatı Steam\'in 24 saatlik ortalamasının belirgin şekilde altında. Acele etme, fiyatı kontrol et.') + '\n' + dropList.slice(0,6).join('\n'))
            : '',
          warn: 'Satışa sunulan öğe geri alınamaz; ilanı iptal etmek için Steam\'e girmen gerekir. Mobil doğrulayıcı açıksa her ilanı Steam uygulamasından onaylaman gerekir.',
          confirmText: 'Satışa Sun', cancelText: 'Vazgeç',
        });
        if (!ok) return;
      }
      saleTask = { plan, i: 0, basarili: 0, mobilOnay: 0, epostaOnay: 0, eposta: null,
                      hatalar: [], atlanan: 0, limit: null, iptal: false, ardisik: 0, bekleme: null, soruyor: false, simdiDevam: false };
      drawSaleStatus();
      await runSaleTask(saleTask);
    }

    async function runSaleTask(g){
      let perBatch = g.i;
      while (g.i < g.plan.length && !g.iptal){
        const p = g.plan[g.i];
        const r = await E.sellItem(p.assetId, p.satici, 1).catch(e=>({ ok:false, error:(e && e.message), tur:'genel' }));
        g.i++;
        if (r && r.ok){
          g.basarili++; g.ardisik = 0;
          listedAssets.add(p.assetId);
          const s = r.result || {};
          if (s.needs_mobile_confirmation || s.requires_confirmation) g.mobilOnay++;
          if (s.needs_email_confirmation){ g.epostaOnay++; g.eposta = s.email_domain || g.eposta; }
        } else {
          const category = (r && r.tur) || 'genel';
          if (category === 'atla'){ g.atlanan++; g.hatalar.push(p.name + ': ' + (r.error || '')); }
          else {
            g.ardisik++;
            g.hatalar.push(p.name + ': ' + ((r && r.error) || ''));
            // If Steam stopped there is no point sending the remaining requests: it only piles up errors
            // and narrows the account's limit even more.
            if (category === 'limit' || g.ardisik >= 2){ g.limit = (r && r.error) || t('Steam listelemeyi durdurdu.'); g.i--; g.basarisizAsset = p.assetId; break; }
          }
        }
        drawSaleStatus();
        if (g.i < g.plan.length && !g.iptal){
          // Batch limit (the setting is read live)
          const lot = saleBatchSize();
          if (lot && g.i - perBatch >= lot){
            perBatch = g.i;
            const waitMin = saleBatchWait();
            if (waitMin > 0){
              g.bekleme = Date.now() + waitMin * 60000; drawSaleStatus();
              await cancellableWait(waitMin * 60000, g);
              g.bekleme = null; g.simdiDevam = false;
            } else {
              g.soruyor = true; drawSaleStatus();
              await new Promise((solve)=>{ const t = setInterval(()=>{ if (g.iptal || g.simdiDevam){ clearInterval(t); solve(); } }, 300); });
              g.soruyor = false; g.simdiDevam = false;
            }
            if (g.iptal) break;
          }
          await new Promise(r2=>setTimeout(r2, 400));
        }
      }
      saleTask = null;
      drawSaleStatus();
      saleResult(g);
      selected.clear(); envLoaded = false; invMerged = null; invItems = null; detailKey = null;
      loadEnv();
    }

    function saleResult(g){
      const remaining = g.plan.length - g.i;
      const rowsList = [];
      if (g.mobilOnay) rowsList.push(tf('# ilan Steam Guard onayı bekliyor: Steam mobil uygulamasında Onaylar bölümünden onayla.', g.mobilOnay));
      if (g.epostaOnay) rowsList.push(tf('# ilan e-posta onayı bekliyor (#).', g.epostaOnay, g.eposta || 'e-posta'));
      if (g.atlanan) rowsList.push(tf('# öğe atlandı (zaten onay bekleyen ilanı var ya da envanterde yok).', g.atlanan));
      if (remaining) rowsList.push(tf('# öğe listelenmedi.', remaining));
      if (g.hatalar.length) rowsList.push('\n' + t('Steam yanıtları:') + '\n' + g.hatalar.slice(0, 5).map(x=>'  · ' + x).join('\n'));
      const title = g.basarili ? tf('# öğe satışa sunuldu', g.basarili) : t('Hiçbir öğe satışa sunulamadı');
      pushFeed(g.limit ? 'hata' : 'pazar', 'Satış', title + (g.mobilOnay ? (' · ' + tf('# Steam Guard onayı bekliyor', g.mobilOnay)) : ''), g.limit ? 'Uyarı' : 'Başarılı');
      edgeConfirm({
        tag: g.limit ? 'Steam Sınırı' : 'Satış', danger: !!g.limit,
        title: title,
        body: rowsList.join('\n') || t('Tüm ilanlar gönderildi.'),
        warn: g.limit
          ? (t('Steam listelemeyi durdurdu:') + ' ' + g.limit + '\n' + t('Steam bu sınırı hesabın yaşına, seviyesine ve güvenilirliğine göre belirliyor. Onay bekleyen ilanları onayla ya da birkaç saat sonra kalanları tekrar dene. Ayarlar > Pazar > Parti büyüklüğü ile daha küçük partiler seçebilirsin.'))
          : (g.iptal ? t('İşlemi sen durdurdun.') : ''),
        confirmText: 'Tamam', tekDugme: true,
      });
    }
