    // ================= INVENTORY & MARKET =================
    // The order book in the right panel is parsed structurally from the market page;
    // the realised sales come from the pricehistory endpoint.
    let invItems = null, invMerged = null, inventoryLoaded = false;
    const priceMap = new Map();               // marketHashName -> price obj | null
    // Realised sale history and the current order book. They must be defined above:
    // helpers like medValRaw/realValue read them.
    const historyMap = new Map();
    const ordersMap  = new Map();
    const selected = new Set();               // dedupKey
    let lastTicked = null;                    // the row ticked last: the anchor of a Shift + click range
    let inventoryView = 'list';
    let fType = 'all', fState = 'all', fPrice = 'all', fGame = 'all';
    let invSort = 'value', invSortDir = 'desc';
    let groupByGame = false;
    let viewRows = [];
    let detailKey = null;
    // All sale operations are done FROM THE BOTTOM BAR; the strategy/price sections in the detail panel
    // were removed. bulkStrategy: median | undercut | match | instant | manual
    let bulkStrategy = 'median';
    let manualPrice = null;                   // the amount entered when "Kendim" is selected

    // ---- which inventory is on screen ----
    // The Steam community inventory (cards, backgrounds, emoticons, gems: 753/6) is the default. The games the account has items in
    // (Counter-Strike 2, Dota 2...) are listed in a select next to the filters; one is on screen at a time. What was read is kept per
    // source, so going back and forth costs no request, and the Overview keeps its numbers from the community inventory.
    const COMMUNITY_ID = '753:6';
    let invSource = COMMUNITY_ID;
    let invSources = null;                    // the games with items (engine:inventorySources), null until known
    let sourcesAsked = false;
    const sourceState = new Map();            // source id -> { items, merged }
    const onCommunity = () => invSource === COMMUNITY_ID;
    function communityMerged(){ const k = sourceState.get(COMMUNITY_ID); return k ? k.merged : null; }
    const sourceOf = (it) => ((it && it.invApp) || 753) + ':' + ((it && it.invContext) || '6');
    // an asset number is only unique inside its game: the ones of other games carry the game in front
    const assetTag = (it, assetId) => ((((it && it.invApp) || 753) === 753) ? '' : it.invApp + ':') + assetId;
    function marketUrl(it){ return 'https://steamcommunity.com/market/listings/' + ((it && it.invApp) || 753) + '/' + encodeURIComponent((it && (it.hashName || it.marketHashName)) || ''); }
    function sourceRequest(){
      const m = /^(\d+):(\d+)$/.exec(invSource) || [];
      const game = (invSources || []).find(g => String(g.appid) === m[1]);
      return { appid: +m[1], contextId: m[2], appName: game ? game.name : null };
    }

    const EC = { brandBd:'#5322AB', ok:'#5FB324', teal:'#24AEB3', bad:'#E45A86', brand:'#5624B3', sub:'#C2AAEE',
                 title:'#DCE2FA', muted:'#8B8F9E', off:'#7F879B', bd:'#2B3345', s1:'#0D1118' };

    // Amounts are in the selected currency (common.js fmtMoney). If "Price display: Net" is selected
    // the listed prices are shown with Steam's commission deducted.
    const fmtLira = (n) => fmtMoney(n);
    // The "Lowest" and "Average" columns in the list are the MARKET price: the same as the amount on the Steam
    // page, with no deduction at all. The amount you will get (net) is found with Steam's own
    // fee calculation (below, "SALE") and is only shown in the sale flow.
    // "Low-value threshold": items below this amount are shown dimmed and are not included in "select all"
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
    const TYPE_LABEL = { all:'Tümü', card:'Kart', background:'Arka Plan', emoticon:'İfade', coupon:'Kupon', profile:'Profil Öğesi', booster:'Booster Paketi', gems:'Gem', other:'Diğer' };
    // The name of Steam foil cards contains "(Foil)" - the real marker for the badge.
    const isFoil = (it) => /\(foil\)/i.test(it.name || '');
    function statusOf(it){
      if (it.marketable) return { label:'Satılabilir', fg:EC.ok };
      if (it.tradable)   return { label:'Takas',       fg:EC.teal };
      return { label:'Satılamaz', fg:EC.bad };
    }

    async function loadInventory(){
      if (inventoryLoaded) return;
      const source = invSource;
      document.getElementById('invRows').innerHTML = '<div style="padding:20px;color:#8B8F9E;font-size:12px">Steam\'e bağlanılıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (source !== invSource) return;        // another inventory was chosen meanwhile: its own load puts it on screen
      if (!con.ok){ document.getElementById('invRows').innerHTML = '<div style="padding:20px;color:#E45A86;font-size:12px">'+esc(con.error)+'</div>'; return; }
      const res = await E.inventory(onCommunity() ? undefined : sourceRequest()).catch(e=>({ ok:false, error:(e&&e.message)||'Envanter okunamadı.' }));
      if (source !== invSource) return;
      if (!res.ok){ document.getElementById('invRows').innerHTML = '<div style="padding:20px;color:#E45A86;font-size:12px">'+esc(res.error)+'</div>'; return; }
      invItems = res.items;
      invMerged = mergeDuplicates(invItems);
      sourceState.set(source, { items: invItems, merged: invMerged });
      inventoryLoaded = true;
      applyInvSettings();
      buildGameSelect();
      renderInventory();
      if (res.incomplete && typeof toast === 'function') toast('Envanter').fail('Envanterin yalnızca bir bölümü okunabildi (Steam istek sınırı). Birkaç dakika sonra yeniden dene.');
      loadSources();
      await fillFromCache();
      if (onCommunity()) askFetchPrices();     // the prices of a game's items are fetched with the button: there can be hundreds of kinds
    }

    // The games the account has items in, once per account: they fill the select next to the filters.
    async function loadSources(){
      if (sourcesAsked || !E.inventorySources || !featureOn('games')) return;
      sourcesAsked = true;
      const res = await E.inventorySources().catch(()=>null);
      if (!res || !res.ok || !Array.isArray(res.list)){ sourcesAsked = false; return; }
      invSources = res.list;
      buildSourceSelect();
    }
    function buildSourceSelect(){
      const sel = document.getElementById('efSource');
      if (!sel) return;
      const rows = [];
      (invSources || []).forEach(g => (g.contexts || []).forEach(c => rows.push({
        id: g.appid + ':' + c.id,
        label: g.name + ((g.contexts.length > 1 && c.name) ? ' · ' + c.name : '') + (c.assetCount ? ' (' + c.assetCount + ')' : ''),
      })));
      if (!rows.length || !featureOn('games')){ sel.style.display = 'none'; return; }
      sel.innerHTML = '<option value="' + COMMUNITY_ID + '">' + esc(t('Steam (kartlar, arka planlar, ifadeler)')) + '</option>'
        + rows.map(r => '<option value="' + esc(r.id) + '">' + esc(r.label) + '</option>').join('');
      if (![...sel.options].some(o => o.value === invSource)) invSource = COMMUNITY_ID;
      sel.value = invSource;
      sel.style.display = '';
    }
    // The type and game filters and the grouping belong to the Steam inventory (one game, many kinds of item): a game's backpack has neither.
    function paintSourceUI(){
      ['efType', 'efGame', 'invGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.dataset.shown === undefined) el.dataset.shown = el.style.display;
        el.style.display = onCommunity() ? el.dataset.shown : 'none';
      });
    }
    // Puts another inventory on screen. One that was read before comes back at once; a new one is loaded. quiet: the caller loads it itself.
    function switchSource(id, quiet){
      if (!/^\d+:\d+$/.test(String(id)) || id === invSource) return;
      if (!quiet && (saleBusy || saleTask)){
        toast('Satış').fail('Önceki satış işlemi sürüyor.');
        const back = document.getElementById('efSource'); if (back) back.value = invSource;
        return;
      }
      invSource = id;
      selected.clear(); lastTicked = null; detailKey = null;
      fType = 'all'; fGame = 'all'; fPrice = 'all'; fState = (appSettings && appSettings.hideUnsellable) ? 'marketable' : 'all';
      ['efType', 'efGame', 'efPrice'].forEach(k => { const el = document.getElementById(k); if (el) el.value = 'all'; });
      const stateSel = document.getElementById('efState'); if (stateSel) stateSel.value = fState;
      const search = document.getElementById('invSearch'); if (search) search.value = '';
      const picker = document.getElementById('efSource'); if (picker) picker.value = id;
      const kept = sourceState.get(id);
      invItems = kept ? kept.items : null;
      invMerged = kept ? kept.merged : null;
      inventoryLoaded = !!kept;
      paintSourceUI();
      if (kept){ buildGameSelect(); renderInventory(); return; }
      ['invStatTotal', 'invStatSellable', 'invStatTradable', 'invStatValue', 'invCount'].forEach(k => { const el = document.getElementById(k); if (el) el.textContent = '-'; });
      if (!quiet) loadInventory();
    }
    // Settings > Modules > "Other games' inventories": switched off, the select goes and the Steam inventory comes back; on again, the games are read.
    function syncOtherGames(){
      const sel = document.getElementById('efSource');
      if (!sel) return;
      if (!featureOn('games')){
        sel.style.display = 'none';
        if (!onCommunity()) switchSource(COMMUNITY_ID);
      } else if (invSources) buildSourceSelect();
      else if (inventoryLoaded) loadSources();
    }
    // The Overview and its quick actions are about the Steam inventory: they put it back on screen first.
    function useCommunitySource(){ if (!onCommunity()) switchSource(COMMUNITY_ID, true); }
    // A new account starts with the community inventory and its own list of games.
    function resetInventorySources(){
      sourceState.clear(); invSource = COMMUNITY_ID; invSources = null; sourcesAsked = false;
      const sel = document.getElementById('efSource'); if (sel){ sel.style.display = 'none'; sel.innerHTML = ''; }
      paintSourceUI();
    }
    // Something changed in more than one inventory (a listing came back): what was kept is stale.
    function dropKeptSources(){ sourceState.clear(); }
    document.getElementById('efSource').addEventListener('change', e => switchSource(e.target.value));

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
          renderInventory(); paintFetchBtn();
        }
      }
      // G8: the averages are kept on disk too; if present show instantly, no request goes to Steam.
      const hres = await E.historyForCached(hashes).catch(()=>null);
      if (hres && hres.ok && hres.history){
        let added = 0;
        Object.entries(hres.history).forEach(([h,x]) => { if (x){ historyMap.set(h,x); added++; } });
        if (added){ renderInventory(); }
      }
      paintFetchBtn();
    }

    // ---- filters (the selects in the top bar) ----
    function buildGameSelect(){
      const sel = document.getElementById('efGame');
      const games = [...new Set(invMerged.map(i=>i.gameName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      sel.innerHTML = '<option value="all">Tüm oyunlar</option>' + games.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('');
    }
    document.getElementById('efType').addEventListener('change', e=>{ fType=e.target.value; renderInventory(); });
    document.getElementById('efGame').addEventListener('change', e=>{ fGame=e.target.value; renderInventory(); });
    document.getElementById('efState').addEventListener('change', e=>{ fState=e.target.value; renderInventory(); });
    document.getElementById('efPrice').addEventListener('change', e=>{ fPrice=e.target.value; renderInventory(); });
    document.getElementById('invSearch').addEventListener('input', renderInventory);
    document.getElementById('efReset').onclick = ()=>{
      fType='all'; fState='all'; fPrice='all'; fGame='all'; invSort='value'; invSortDir='desc'; groupByGame=false;
      ['efType','efGame','efState','efPrice'].forEach(id=>document.getElementById(id).value='all');
      document.getElementById('invSearch').value='';
      paintGroupBtn(); renderInventory();
    };

    function paintView(){
      const l = document.getElementById('vList'), g = document.getElementById('vGrid');
      const on = { background:EC.brand, borderColor:EC.brandBd, color:EC.title };
      const off = { background:'transparent', borderColor:'transparent', color:EC.muted };
      Object.assign(l.style, inventoryView==='list'?on:off);
      Object.assign(g.style, inventoryView==='grid'?on:off);
    }
    document.getElementById('vList').onclick = ()=>{ inventoryView='list'; paintView(); renderInventory(); };
    document.getElementById('vGrid').onclick = ()=>{ inventoryView='grid'; paintView(); renderInventory(); };
    paintView();

    function paintGroupBtn(){
      const b = document.getElementById('invGroup');
      b.style.background = groupByGame ? EC.brand : 'transparent';
      b.style.borderColor = groupByGame ? EC.brandBd : EC.bd;
      b.style.color = groupByGame ? EC.title : EC.muted;
    }
    document.getElementById('invGroup').onclick = ()=>{ groupByGame = !groupByGame; paintGroupBtn(); renderInventory(); };

    // ---- column sort ----
    function toggleInvSort(key){
      if (invSort === key) invSortDir = invSortDir==='asc' ? 'desc' : 'asc';
      else { invSort = key; invSortDir = (key==='name'||key==='game') ? 'asc' : 'desc'; }
      renderInventory();
    }
    [['invSortName','name'],['invSortGame','game'],['invSortQty','qty'],['invSortLow','low'],['invSortMed','med'],['invSortStatus','status']]
      .forEach(([id,key])=>{ document.getElementById(id).onclick = ()=>toggleInvSort(key); });

    function applyFilters(){
      const q = document.getElementById('invSearch').value.trim().toLowerCase();
      const buckets = { all:[0,Infinity], '0-1':[0,1], '1-5':[1,5], '5-10':[5,10], '10-':[10,Infinity] };
      const pb = buckets[fPrice] || buckets.all;
      let out = invMerged.filter(i=>{
        // "Hide sold items from the inventory": the copies put on sale in this session are subtracted;
        // if all were put on sale the row is hidden. The Steam inventory is sometimes updated late.
        if (appSettings && appSettings.hideAfterSell && i.assetIds.every(a=>listedAssets.has(assetTag(i, a)))) return false;
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
      set('invStatTotal', total.toLocaleString(localCode()));
      set('invStatSellable', sellable.toLocaleString(localCode()));
      set('invStatTradable', tradable.toLocaleString(localCode()));
      set('invStatValue', fmtLira(value));
    }

    function arrows(){
      const a = (k)=>invSort===k ? (invSortDir==='asc'?'▲':'▼') : '';
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('arrName',a('name')); set('arrGame',a('game')); set('arrQty',a('qty'));
      set('arrLow',a('low')); set('arrMed',a('med'));
    }

    const ROW_H = () => document.body.classList.contains('e-compact') ? 34 : 46;
    const GRID_COLS = '34px 14px 44px minmax(130px,1.6fr) minmax(90px,1.1fr) 76px 104px 104px';

    // G9: the "half the rows stay grey" complaint. This is not a bug: items below Settings > Inventory >
    // Low-value threshold are shown dimmed. Since it was written nowhere the user
    // thought it was a sort and got confused. Now there is a small explanation in the top bar.
    function drawThresholdBadge(){
      const el = document.getElementById('invThresholdNote');
      if (!el) return;
      const threshold = lowLimit();
      const faded = (viewRows || []).filter(isLowValue).length;
      if (!threshold || !faded){ el.style.display = 'none'; return; }
      el.style.display = 'flex';
      el.title = 'Ayarlar > Envanter > Düşük değer eşiğinden değiştirilir.';
      el.innerHTML = '<span style="width:6px;height:6px;border-radius:12px;background:#7F879B;flex-shrink:0"></span>'
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
      return '<div data-k="'+esc(it.dedupKey)+'" class="h-row inv-row" style="display:grid;grid-template-columns:'+GRID_COLS+';gap:0;align-items:center;height:'+ROW_H()+'px;padding:0 22px 0 44px;border-bottom:1px solid #101621;cursor:pointer;background:'+(on?'#101621':'transparent')+';opacity:'+(isLowValue(it)?0.55:1)+'">'
        + '<div data-a="check" style="width:16px;height:16px;border-radius:12px;border:1px solid '+(on?EC.brand:EC.bd)+';background:'+(on?EC.brand:'transparent')+';display:flex;align-items:center;justify-content:center;cursor:pointer">'
          + '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#030305" stroke-width="3.4" style="opacity:'+(on?1:0)+'"><path d="M5 13l4 4L19 7"></path></svg></div>'
        + '<div title="'+st.label+'" style="width:7px;height:7px;border-radius:12px;background:'+st.fg+';flex-shrink:0"></div>'
        + '<div style="width:32px;height:32px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + (it.iconUrl?'<img src="'+esc(it.iconUrl)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover">':'') + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;min-width:0;padding-right:12px">'
          + '<span style="font-size:13px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.name)+'</span>'
          + '<span style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+EC.sub+';border:1px solid '+EC.brand+';border-radius:12px;padding:2px 7px;flex-shrink:0;opacity:'+(foil?1:0)+'">Foil</span>'
        + '</div>'
        + '<span style="font-size:12px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:9px;padding-right:12px">'+esc(it.gameName||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#DCE2FA;text-align:center">'+it.count+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+(dropEvent?'#E45A86':'#C2AAEE')+';text-align:center"'
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
          + '<span style="position:absolute;top:6px;right:6px;font-size:12px;font-weight:700;letter-spacing:0.06em;color:'+EC.sub+';background:#090C12;border:1px solid '+EC.brand+';border-radius:12px;padding:2px 6px;opacity:'+(foil?1:0)+'">Foil</span>'
        + '</div>'
        + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(it.name)+'</span>'
        + '<div style="display:flex;align-items:center;justify-content:space-between">'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#24AEB3">'+med+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#DCE2FA">×'+it.count+'</span>'
        + '</div>'
        + '<span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:'+st.fg+'">'+st.label+'</span>'
        + '</div>';
    }

    const ROW_CHUNK = 200;
    let rowFillToken = 0;
    function fillRowsLater(host, list, from){
      const token = ++rowFillToken;
      const step = () => {
        if (token !== rowFillToken || from >= list.length) return;
        host.insertAdjacentHTML('beforeend', list.slice(from, from + 300).map(rowHTML).join(''));
        from += 300;
        setTimeout(step, 30);
      };
      setTimeout(step, 30);
    }

    function renderInventory(){
      applyCurrencyLabels();
      if (!invMerged) return;
      warmFees();
      renderStats(); arrows();
      viewRows = applyFilters();
      setTimeout(drawThresholdBadge, 0);   // so the count is right after the rows are drawn
      paintFetchBtn();   // when the filter changes "Fetch prices" becomes active again
      const scroll = document.getElementById('invScroll');
      const rows = document.getElementById('invRows');
      document.getElementById('invCount').textContent = viewRows.length + ' / ' + invMerged.length + ' öğe';
      rowFillToken++;                      // a drawing that is still going on is cancelled
      if (!viewRows.length){
        rows.removeAttribute('style');
        rows.innerHTML = '<div style="padding:64px 22px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">'
          + '<span style="font-size:14px;font-weight:700;color:#B9C0D6">Filtrelere uyan öğe yok</span>'
          + '<span style="font-size:12px;color:#8B8F9E;max-width:280px">Fiyat aralığını genişlet ya da filtreleri sıfırla.</span></div>';
      } else if (inventoryView === 'grid'){
        rows.setAttribute('style','padding:16px 22px 16px 44px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;align-content:start');
        rows.innerHTML = viewRows.map(gridHTML).join('');
      } else {
        rows.removeAttribute('style');
        // The first screenfuls at once, the rest in the background: a 3000 item inventory no longer blocks the page while it is drawn.
        rows.innerHTML = viewRows.slice(0, ROW_CHUNK).map(rowHTML).join('');
        fillRowsLater(rows, viewRows, ROW_CHUNK);
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
        box.style.borderColor = on ? EC.brandBd : EC.bd;
        box.style.background  = on ? EC.brand : (inventoryView==='grid' ? '#090C12' : 'transparent');
        const tick = box.querySelector('svg'); if (tick) tick.style.opacity = on ? 1 : 0;
      }
      if (inventoryView === 'grid') host.style.borderColor = on ? EC.brandBd : EC.bd;
      else host.style.background = on ? '#101621' : 'transparent';
    }
    document.getElementById('invRows').addEventListener('click', (e)=>{
      const host = e.target.closest('[data-k]');
      if (!host) return;
      const key = host.getAttribute('data-k');
      // Shift + click: every row between the last ticked one and this one gets the state this click gives (the usual list behaviour).
      if (e.shiftKey && lastTicked && lastTicked !== key){
        const a = viewRows.findIndex(i=>i.dedupKey===lastTicked), b = viewRows.findIndex(i=>i.dedupKey===key);
        if (a >= 0 && b >= 0){
          const on = !selected.has(key);
          viewRows.slice(Math.min(a,b), Math.max(a,b)+1).forEach(i=>{ on ? selected.add(i.dedupKey) : selected.delete(i.dedupKey); });
          document.querySelectorAll('#invRows [data-k]').forEach(h=>paintRowSelection(h, selected.has(h.getAttribute('data-k'))));
          lastTicked = key;
          renderBulk();
          return;
        }
      }
      if (e.target.closest('[data-a="check"]')){
        const on = !selected.has(key);
        on ? selected.add(key) : selected.delete(key);
        paintRowSelection(host, on);
        lastTicked = key;
        renderBulk();
        return;
      }
      detailKey = key;
      renderDetail();
    });
    // Shift + click would also start a text selection across the rows
    document.getElementById('invRows').addEventListener('mousedown', (e)=>{ if (e.shiftKey) e.preventDefault(); });
    document.getElementById('invRows').addEventListener('dblclick', (e)=>{
      const host = e.target.closest('[data-k]'); if (!host) return;
      const it = invMerged.find(x=>x.dedupKey===host.getAttribute('data-k')); if (!it) return;
      const action = (appSettings && appSettings.dblAction) || 'open';
      if (action==='steam' || action==='open') window.imu.openExternal(marketUrl(it));
      else if (action==='detail'){ detailKey = it.dedupKey; renderInventory(); }
      else if (action==='sell' || action==='now') sellFlow([it], bulkStrategy);
      else if (action==='copy') navigator.clipboard.writeText(it.name);
    });

    document.getElementById('selAll').onclick = ()=>{
      const all = viewRows.length && viewRows.every(i=>selected.has(i.dedupKey));
      viewRows.forEach(i => { if (all) selected.delete(i.dedupKey); else selected.add(i.dedupKey); });
      document.querySelectorAll('#invRows [data-k]').forEach(h=>paintRowSelection(h, selected.has(h.getAttribute('data-k'))));
      renderBulk();
    };
    document.getElementById('bulkClear').onclick = ()=>{
      selected.clear();
      document.querySelectorAll('#invRows [data-k]').forEach(h=>paintRowSelection(h, false));
      renderBulk();
    };

    // ---- sale price strategies (computed from the real price) ----
    function strategyPrice(it, strat){
      // "Undercut" / "Match lowest" look at the CURRENT listings (that is where the competition is).
      // "Average" comes from REALISED sales - so that an outlier listing on sale
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

    // The box in the header follows the selection: filled when every row in view is ticked, outlined in the brand colour when only some are
    function syncSelAll(){
      const box = document.getElementById('selAll'); if (!box) return;
      const n = viewRows.filter(i=>selected.has(i.dedupKey)).length;
      const all = viewRows.length > 0 && n === viewRows.length;
      box.style.background = all ? EC.brand : 'transparent';
      box.style.borderColor = n ? EC.brandBd : EC.bd;
    }
    function renderBulk(){
      syncSelAll();
      const items = invMerged.filter(i=>selected.has(i.dedupKey));
      const gross = items.reduce((s,i)=>{ const v=strategyPrice(i, bulkStrategy); return s + (v!=null ? v*i.count : 0); },0);
      const units = items.reduce((s,i)=>s+i.count,0);
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('bulkCount', units); set('bulkCount2', units);
      set('bulkGross', fmtLira(gross));
      // What you will get: Steam's own fee calculation per item. "…" if it has not arrived yet.
      let net = 0, estimated = false;
      const needed = [];
      items.forEach(i=>{
        const v = strategyPrice(i, bulkStrategy);
        if (v == null) return;
        if (!feeCache.has(subunit(v))){ estimated = true; needed.push(v); }
        net += sellerAmount(v) * i.count;
      });
      set('bulkNet', (estimated ? '~' : '') + fmtLira(net));
      if (needed.length) prepareNet(needed);
      document.querySelectorAll('#bulkStrat button[data-bs]').forEach(b=>{
        const on = b.getAttribute('data-bs')===bulkStrategy;
        b.style.background = on ? EC.brand : 'transparent';
        b.style.borderColor = on ? EC.brandBd : 'transparent';
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
    // "Fetch prices": fetches only those that match the current filter, locked until done.
    document.getElementById('invFetchPrices').onclick = fetchPricesForView;

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
      else if (res.orders.noCurrency) o = { failed: true, reason: 'hesabın pazar para birimi henüz okunmadı' };
      // Keep the reason: saying "could not be fetched" is not enough, WHY it could not be fetched must be written.
      else if (res.orders.error || res.orders.rateLimited) o = { failed: true, reason: res.orders.error || 'Steam istek sınırı', rateLimited: !!res.orders.rateLimited };
      else o = res.orders;
      ordersMap.set(it.marketHashName, o);
      if (detailKey === it.dedupKey) renderDetail();
    }
    // Opens one booster pack of the selected row. The cards that come out are added to the inventory, so it is read again.
    async function unpackBooster(it){
      const ok = await edgeConfirm({ tag: 'Booster Paketi', title: 'Booster paketi açılsın mı?',
        body: 'Paket kalıcı olarak açılır, içinden çıkan kartlar envanterine eklenir. Bu işlem geri alınamaz.', confirmText: 'Aç' });
      if (!ok) return;
      const tt = toast('Booster paketi açılıyor…');
      const r = await E.unpackBooster(it.assetIds[0], it.appid).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){ tt.fail((r && r.error) || 'Booster paketi açılamadı.'); return; }
      tt.done(tf('Çıkan kartlar: #', (r.items || []).map(x => x.name + (x.foil ? ' (Foil)' : '')).join(', ') || '-'));
      pushFeed('inventory', 'Booster Paketi', it.name, 'Başarılı');
      selected.clear(); inventoryLoaded = false; invMerged = null; invItems = null; detailKey = null;
      loadInventory();
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
      const box = document.getElementById('invDetail');
      const it = detailKey ? invMerged.find(x=>x.dedupKey===detailKey) : null;
      if (!it){
        box.innerHTML = '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E">Eşya İncelemesi</span>'
          + '<div style="height:150px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 8px,#101621 8px 16px);display:flex;align-items:center;justify-content:center">'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:#7F879B">ÖĞE SEÇİLMEDİ</span></div>'
          + '<span style="font-size:12px;color:#8B8F9E">Detay için listeden bir öğeye tıkla.</span>';
        return;
      }
      const hist = it.marketHashName ? historyMap.get(it.marketHashName) : undefined;
      const ord  = it.marketHashName ? ordersMap.get(it.marketHashName)  : undefined;
      const p = priceOf(it);
      const depth = Math.max(3, +((appSettings||{}).bookDepth) || 5);

      // Shared box skeleton: title strip + Price/Quantity table
      const ordRetryBtn = () => '<button data-ordretry style="height:28px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #24AEB3;color:#24AEB3;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Tekrar Dene</button>';
      const histRetryBtn = () => '<button data-histretry style="height:28px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #C2AAEE;color:#C2AAEE;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer">Tekrar Dene</button>';
      const priceQtyBox = (title, dotColor, headline, rows, empty) =>
        '<div style="border:1px solid #2B3345;border-radius:12px;background:#090C12;overflow:hidden">'
        + '<div style="height:34px;padding:0 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #1D2432;background:#0D1118">'
          + '<span style="width:6px;height:6px;border-radius:12px;background:'+dotColor+';flex-shrink:0"></span>'
          + '<span style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8B8F9E">'+title+'</span></div>'
        + '<div style="padding:10px 14px 4px;font-size:12px;color:#8B8F9E;line-height:1.5">'+headline+'</div>'
        + (rows
            ? ('<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 14px 4px">'
               + '<span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7F879B">Fiyat</span>'
               + '<span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7F879B">Miktar</span></div>'
               + '<div style="padding:0 14px 10px">'+rows+'</div>')
            : '<div style="padding:0 14px 12px;font-size:12px;color:#7F879B">'+empty+'</div>')
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
      if (!it.marketable) sellBox = priceQtyBox('Satıştaki İlanlar', '#7F879B', 'Bu öğe pazarda satılamaz.', '', '-');
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
      if (!it.marketable) buyBox = priceQtyBox('Hemen Sat', '#7F879B', 'Bu öğe pazarda satılamaz.', '', '-');
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
          buyBox = priceQtyBox('Hemen Sat', '#7F879B', 'Bekleyen alım talimatı yok ve referans alınacak satış geçmişi de yok.', '', '-');
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
      if (!it.marketable) saleBox = priceQtyBox('Gerçekleşen Satışlar', '#7F879B', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (hist === 'loading' || hist === undefined) saleBox = priceQtyBox('Gerçekleşen Satışlar', '#C2AAEE', 'Satış geçmişi yükleniyor…', '', '');
      else if (hist === 'none') saleBox = priceQtyBox('Gerçekleşen Satışlar', '#B37E24', 'Satış geçmişi alınamadı (Steam istek sınırı olabilir).', '', histRetryBtn());
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
          + '<span style="font-size:12px;color:#8B8F9E">'+esc(it.gameName||'-')+' · '+(it.typeText ? esc(it.typeText) : esc(t(TYPE_LABEL[it.type]||'Diğer')))+' · ×'+it.count+'</span>'
        + '</div>'
        // A booster pack can be opened right here (only when the game it belongs to is known)
        + (it.type === 'booster' && it.appid
            ? '<button data-unpack class="h-brand" style="height:36px;border-radius:999px;background:#090C12;border:1px solid #5322AB;color:#C2AAEE;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer">' + esc(t('Booster Paketini Aç')) + '</button>'
            : '')
        // Three boxes: listings on sale · hemen sat · realised sales
        + '<div style="display:flex;flex-direction:column;gap:10px">' + obBoxes + '</div>'
        // NOTE: the "Sale strategy" and "Sale price" sections were REMOVED from this panel.
        // All sale operations are done from the bottom bar (bulk or single, manual price included).
        ;

      // The "Tekrar Dene" buttons in the failed boxes: force-refresh the cache.
      const unpackBtn = box.querySelector('[data-unpack]');
      if (unpackBtn) unpackBtn.onclick = () => unpackBooster(it);
      const rOrd = box.querySelector('[data-ordretry]');
      if (rOrd) rOrd.onclick = ()=>{ ordersMap.delete(it.marketHashName); ensureOrders(it, true); };
      const rHist = box.querySelector('[data-histretry]');
      if (rHist) rHist.onclick = ()=>{ historyMap.delete(it.marketHashName); ensureHistory(it); };
      if (!hist) ensureHistory(it);
      if (!ord)  ensureOrders(it);
    }

    // "Auto-list on the market" (Card Farming > Automation) - when a card drops in a game it lists that game's
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
      if (onCommunity()) invMerged = merged;
      await E.pricesFor(fresh.map(i=>i.marketHashName)).then(r=>{
        if (r && r.ok) Object.entries(r.prices).forEach(([h,p]) => priceMap.set(h,p));
      }).catch(()=>{});
      const priced = fresh.filter(i=>medVal(i) != null);
      if (!priced.length) return;
      pushFeed('market', 'Otomatik satış', tf('# yeni kart ortalama fiyattan satışa sunuluyor.', priced.length), 'Çalışıyor');
      await sellFlow(priced, 'median');
    }
