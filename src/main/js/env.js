    // ================= ENVANTER & PAZAR =================
    // Sağ paneldeki sipariş defteri pazar sayfasından yapısal olarak ayrıştırılıyor;
    // gerçekleşen satışlar ise pricehistory ucundan geliyor.
    let invItems = null, invMerged = null, envLoaded = false;
    const priceMap = new Map();               // marketHashName -> price obj | null
    // Gerçekleşmiş satış geçmişi ve şu anki sipariş defteri. Yukarıda tanımlı olmaları
    // gerekiyor: medValRaw/realValue gibi yardımcılar bunları okuyor.
    const historyMap = new Map();
    const ordersMap  = new Map();
    const selected = new Set();               // dedupKey
    let envView = 'list';
    let fType = 'all', fState = 'all', fPrice = 'all', fGame = 'all';
    let invSort = 'value', invSortDir = 'desc';
    let groupByGame = false;
    let viewRows = [];
    let detailKey = null;
    // Tum satis islemleri ALT BARDAN yapilir; detay panelindeki strateji/fiyat bolumleri
    // kaldirildi. bulkStrategy: median | undercut | match | instant | manual
    let bulkStrategy = 'median';
    let manualPrice = null;                   // "Kendim" secildiginde girilen tutar
    const STEAM_FEE = 0.13;

    const EC = { ok:'#5FB324', teal:'#24AEB3', bad:'#B32453', brand:'#5624B3', sub:'#C2AAEE',
                 title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345', s1:'#0D1118' };

    // Tutarlar seçili para biriminde (common.js fmtMoney). "Fiyat gösterimi: Net" seçiliyse
    // listelenen fiyatlardan Steam komisyonu düşülmüş hali gösterilir.
    const fmtTL = (n) => fmtMoney(n);
    // Listedeki "En dusuk" ve "Ortalama" sutunlari PAZAR fiyatidir: Steam sayfasinda yazan
    // tutarin aynisi, uzerinde hicbir kesinti yok. Komisyon dusulmus (net) tutar, satan
    // kisiye kalan paradir ve sadece satis akisinda gosterilir - ilan fiyatini net
    // gostermek Steam ile karsilastirmayi imkansiz kiliyordu (feeMode ayari kaldirildi).
    const netOf = (v) => (v == null ? null : v * (1 - STEAM_FEE));
    const soldKeys = new Set();   // "Satılan öğeyi envanterden gizle" için
    // "Düşük değer eşiği": bu tutarın altındaki öğeler soluk gösterilir ve "tümünü seç"e girmez
    const lowLimit = () => +((appSettings||{}).invLowValue) || 0;
    const isLowValue = (it) => { const v = medVal(it); return lowLimit() > 0 && v != null && v < lowLimit(); };
    function priceOf(it){ return it.marketHashName ? priceMap.get(it.marketHashName) : undefined; }
    function priceVal(it){ const p = priceOf(it); return p && p.lowestValue != null ? p.lowestValue : null; }
    // GÖSTERİM için ortanca: önce GERÇEKLEŞMİŞ satışların ağırlıklı medyanı (varsa), yoksa
    // Steam'in 24 saatlik medyanı. Satıştaki ilan fiyatı buraya ASLA girmez - biri tek
    // parçayı 999.999'a listeleyebilir, bu "değer" değildir. Hiçbiri yoksa boş bırakılır.
    function medValRaw(it){
      const h = historyMap.get(it.marketHashName);
      if (h && h !== 'loading' && h !== 'none' && h.stats && h.stats.median != null) return h.stats.median;
      const p = priceOf(it);
      return p && p.medianValue != null ? p.medianValue : null;
    }
    // HESAP için ortanca: toplam değer/sıralama gibi yerlerde son çare en düşük ilandır.
    function medVal(it){ const m = medValRaw(it); return m != null ? m : priceVal(it); }
    const TYPE_LABEL = { all:'Tümü', card:'Kart', background:'Arka Plan', emoticon:'İfade', coupon:'Kupon', profile:'Profil Öğesi', other:'Diğer' };
    // Steam foil kartların adında "(Foil)" geçer - rozet için gerçek işaret.
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
      const res = await E.inventory().catch(e=>({ ok:false, error:(e&&e.message)||'envanter hatası' }));
      if (!res.ok){ document.getElementById('envRows').innerHTML = '<div style="padding:20px;color:#B32453;font-size:12px">'+esc(res.error)+'</div>'; return; }
      invItems = res.items;
      invMerged = mergeDuplicates(invItems);
      envLoaded = true;
      applyInvSettings();
      buildGameSelect();
      renderEnv();
      await onbellektenDoldur();
      askFetchPrices();
    }

    // Sayfa acilirken once DISKTEKI onbellegi oku. Steam'e istek gitmez, aninda doner.
    // Onbellek varsa fiyatlar zaten ekranda olur ve kullaniciya bir sey sorulmaz;
    // onbellegin var olma sebebi buydu, eskiden her acilista bastan cekiliyordu.
    async function onbellektenDoldur(){
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
      // G8: ortalamalar da diskte tutuluyor; varsa aninda goster, Steam'e istek gitmez.
      const hres = await E.historyForCached(hashes).catch(()=>null);
      if (hres && hres.ok && hres.history){
        let eklendi = 0;
        Object.entries(hres.history).forEach(([h,x]) => { if (x){ historyMap.set(h,x); eklendi++; } });
        if (eklendi){ renderEnv(); }
      }
      paintAvgBtn();
    }

    // ---- G8: ORTALAMA (gerceklesen satis medyani) TOPLU CEKME ----
    // Neden ayri dugme: liste fiyati (priceoverview) tek istekte coklu gelmiyor ama ucuz;
    // satis gecmisi (pricehistory) HER OGE icin ayri istek istiyor. Steam limiti hesap
    // basina ~20 istek / 30 saniye. 200 ogelik envanterde bu dakikalar surer, o yuzden
    // kullanici acikca istemeden baslamiyor ve istedigi an iptal edebiliyor.
    let avgCekiliyor = false, avgYapilan = 0, avgToplam = 0;
    function paintAvgBtn(){
      const b = document.getElementById('envFetchAvg');
      if (!b) return;
      const hepsi = hashesForView();
      const eksik = hepsi.filter(h => !historyMap.has(h)).length;
      if (avgCekiliyor){
        b.disabled = false;                       // iptal edilebilsin
        b.textContent = 'İptal Et · ' + avgYapilan + ' / ' + avgToplam;
        b.style.borderColor = '#B37E24'; b.style.color = '#B37E24';
        b.style.cursor = 'pointer';
        return;
      }
      b.disabled = false;
      b.style.cursor = 'pointer';
      if (!hepsi.length){ b.textContent = 'Ortalamaları Getir'; b.style.borderColor = '#2B3345'; b.style.color = '#656D80'; return; }
      if (!eksik){
        b.textContent = 'Ortalamalar Güncel · ' + hepsi.length;
        b.style.borderColor = '#5FB324'; b.style.color = '#5FB324';
      } else {
        b.textContent = 'Ortalamaları Getir · ' + eksik;
        b.style.borderColor = '#5624B3'; b.style.color = '#C2AAEE';
      }
    }

    async function fetchAvgForView(){
      if (avgCekiliyor){ E.historyCancel(); return; }
      const hepsi = hashesForView();
      const eksik = hepsi.filter(h => !historyMap.has(h));
      if (!eksik.length){
        if (typeof toast === 'function') toast('Ortalama').done('Bu filtredeki tüm ortalamalar zaten var.');
        return;
      }
      // Steam limiti yuzunden uzun surebilir - kullaniciya sureyi ONCEDEN soyle.
      const tahminSn = Math.ceil(eksik.length * 1.6);
      const ok = await edgeConfirm({
        tag:'Ortalama Fiyatlar',
        title: eksik.length + ' öğe için gerçekleşen satış geçmişi çekilecek',
        body: 'Ortalama (medyan) değer, Steam pazarında GERÇEKLEŞEN satışlardan hesaplanır. '
              + 'Liste fiyatının aksine her öğe için ayrı istek gerekir.\n\n'
              + 'Tahmini süre: ' + (tahminSn > 90 ? (Math.ceil(tahminSn/60) + ' dakika') : (tahminSn + ' saniye')),
        warn: 'Steam hesap başına yaklaşık 20 istek / 30 saniye sınırı uygular. '
              + 'İşlem sürerken uygulamayı kullanmaya devam edebilir, istediğin an iptal edebilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok) return;
      avgCekiliyor = true; avgYapilan = 0; avgToplam = eksik.length;
      paintAvgBtn();
      const res = await E.historyFor(eksik).catch(()=>null);
      if (!res || !res.ok){
        avgCekiliyor = false; paintAvgBtn();
        if (typeof toast === 'function') toast('Ortalama').fail((res && res.error) || 'İstek başarısız.');
      }
    }

    if (E.onHistoryOne){
      E.onHistoryOne((d)=>{
        if (d && d.hashName && d.history) historyMap.set(d.hashName, d.history);
        // Tek tek yeniden cizmek 200 ogede pahali; ilerleme olayinda toplu ciziyoruz.
      });
    }
    if (E.onHistoryProgress){
      E.onHistoryProgress((d)=>{
        if (!d) return;
        avgYapilan = d.yapilan || 0; avgToplam = d.toplam || avgToplam;
        if (d.bitti){
          avgCekiliyor = false;
          renderEnv(); paintAvgBtn();
          if (typeof toast === 'function'){
            if (d.iptal) toast('Ortalama').done('İptal edildi · ' + avgYapilan + ' öğe alındı.');
            else toast('Ortalama').done(avgYapilan + ' öğenin ortalaması güncellendi.');
          }
          return;
        }
        paintAvgBtn();
        // Her 10 ogede bir listeyi tazele - surekli cizim yapmadan ilerleme gorunsun
        if (avgYapilan % 10 === 0) renderEnv();
      });
    }

    // Ayarlar ekranındaki Envanter tercihleri (varsayılan sıralama, düşük değer eşiği vb.)
    // Ayarlar > Genel > "Para birimi" değişince sayfadaki SABİT ₺ metinleri de güncellenmeli
    // (fiyat aralığı seçenekleri ve boş durum değerleri HTML'de sabit yazılıydı - bu yüzden
    // USD'ye geçince listede ₺ kalıyordu).
    function applyCurrencyLabels(){
      const sym = (typeof curSym === 'function') ? curSym() : '₺';
      const sel = document.getElementById('efPrice');
      if (sel){
        const labels = { all:'Tüm fiyatlar', '0-1':'0 - 1 '+sym, '1-5':'1 - 5 '+sym, '5-10':'5 - 10 '+sym, '10-':'10 '+sym+' ve üzeri' };
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
        // "Varsayılan satış fiyatı" - detay panelinin ve alt barın başlangıç stratejisi
        const map = { median:'median', lowest:'match', undercut:'undercut', match:'match', manual:'manual' };
        const s = map[appSettings.saleMode];
        if (s) bulkStrategy = s;
      }
      const sel = document.getElementById('efState'); if (sel) sel.value = fState;
      paintGroupBtn();
      armPriceAutoRefresh();
    }

    // "Fiyatları otomatik yenile" + "Fiyat yenileme aralığı" - Envanter açıkken arka planda tazeler
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

    // ================= FİYAT ÇEKME KAPISI =================
    // Steam pazar istekleri ~20 istek / 30 saniye ile sınırlı. Sayfa açılır açılmaz tüm
    // envanteri sormak limite takılıyor ve kutular "alınamadı" ile doluyordu. Artık:
    //   1) Sayfaya ilk girişte "hemen getirilsin mi?" diye soruluyor.
    //   2) Hayır denirse kullanıcı filtresini kurar, "Fiyatları Getir" düğmesine basar.
    //   3) Yalnız O ANKİ filtreye uyan öğeler çekilir, tamamı bitene kadar düğme kilitli.
    //   4) Filtre değişirse düğme yeniden açılır (yeni liste için yeni istek gerekir).
    let priceFetching = false;      // istek dizisi sürüyor
    let fetchedSig = null;          // en son çekilen filtre imzası
    function viewSignature(){
      return [fType, fState, fPrice, fGame, (document.getElementById('envSearch')||{}).value||''].join('|');
    }
    function hashesForView(){
      const list = (viewRows && viewRows.length) ? viewRows : (invMerged || []);
      return [...new Set(list.filter(i=>i.marketable && i.marketHashName).map(i=>i.marketHashName))];
    }
    (function baglaAvgBtn(){
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
        b.textContent = 'Getiriliyor ' + done + ' / ' + total;
        b.style.opacity = '0.6'; b.style.cursor = 'not-allowed';
        b.style.borderColor = '#B37E24'; b.style.color = '#B37E24';
        return;
      }
      b.disabled = false;
      b.style.opacity = '1'; b.style.cursor = 'pointer';
      const guncel = (fetchedSig === viewSignature()) && done >= total && total > 0;
      b.textContent = guncel ? ('Fiyatlar Güncel · ' + total) : ('Fiyatları Getir · ' + total);
      b.style.borderColor = guncel ? '#5FB324' : '#24AEB3';
      b.style.color       = guncel ? '#5FB324' : '#24AEB3';
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
      // Kuyruk main tarafında sürüyor olabilir; price:progress remaining=0 deyince serbest
      // bırakılır. Anında dönen (tamamı önbellekten) durumda burada kapatılır.
      if (!res || !res.queued){ priceFetching = false; }
      renderEnv(); paintFetchBtn();
    }
    // Sayfaya ilk giriş: kullanıcıya sor. Ama SADECE onbellekte olmayan oge varsa.
    let priceAsked = false;
    async function askFetchPrices(){
      if (priceAsked) return;
      const hepsi = hashesForView();
      const eksik = hepsi.filter(h => !priceMap.has(h));
      // Onbellek yeterince doluysa hic sorma; kullanici isterse alttaki dugmeyle ceker.
      if (!eksik.length){
        paintFetchBtn();
        return;
      }
      priceAsked = true;
      const ok = await edgeConfirm({
        tag: 'Pazar Fiyatları',
        title: 'Fiyatlar hemen getirilsin mi?',
        body: (function(){
          const hepsi = hashesForView().length;
          const eksik = hashesForView().filter(h => !priceMap.has(h)).length;
          return eksik < hepsi
            ? (hepsi + ' öğeden ' + (hepsi - eksik) + ' tanesinin fiyatı önbellekten geldi. '
               + 'Kalan ' + eksik + ' öğe için Steam pazar fiyatı çekilecek.')
            : ('Envanterindeki ' + hepsi + ' farklı öğe için Steam pazar fiyatı çekilecek.');
        })(),
        warn: 'Steam pazar isteklerini sınırlıyor. Çok sayıda öğede bu işlem uzun sürer; '
              + 'önce filtre uygulayıp sadece ilgilendiğin öğeleri çekmek daha hızlıdır.',
        confirmText: 'Evet, Getir',
        cancelText: 'Hayır, Sonra',
      });
      if (ok) fetchPricesForView();
      else if (typeof toast === 'function') toast('Fiyat').done('Filtreni kur, sonra alttaki "Fiyatları Getir" düğmesine bas.');
      paintFetchBtn();
    }
    // "Fiyat düşüşü uyarısı" - envanterindeki bir öğenin fiyatı önceki ölçüme göre %10'dan
    // fazla düştüyse haber verir (ayrı bir takip listesi gerekmiyor, envanterin kendisi liste).
    E.onPriceOne(({ hashName, price }) => {
      const prev = priceMap.get(hashName);
      priceMap.set(hashName, price);
      if (appSettings && appSettings.notifyPriceDrop && prev && price
          && prev.medianValue != null && price.medianValue != null && prev.medianValue > 0){
        const drop = (prev.medianValue - price.medianValue) / prev.medianValue;
        if (drop >= 0.10){
          const it = invMerged && invMerged.find(x=>x.marketHashName === hashName);
          notify('error', 'Fiyat düşüşü · %'+Math.round(drop*100),
                 (it?it.name:hashName)+' - '+fmtTL(prev.medianValue)+' → '+fmtTL(price.medianValue));
        }
      }
      scheduleRender();
    });
    E.onPriceProgress(({ remaining, cooldown }) => {
      const el = document.getElementById('envPriceProg');
      if (el) el.textContent = remaining > 0
        ? (remaining + ' kaldı' + (cooldown ? ' · Steam limiti' : ''))
        : new Date().toLocaleTimeString('tr-TR');
      if (remaining === 0){
        priceFetching = false;
        if (invMerged) renderEnv();
        if (typeof renderGenelStats==='function') renderGenelStats();
      }
      paintFetchBtn();
    });
    let renderTimer = null;
    function scheduleRender(){ if (renderTimer) return; renderTimer = setTimeout(()=>{ renderTimer=null; if(invMerged) renderEnv(); }, 400); }

    // ---- filtreler (üst bardaki select'ler) ----
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

    // ---- sütun sıralama ----
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
        if (appSettings && appSettings.hideAfterSell && soldKeys.has(i.dedupKey)) return false;
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
      set('envStatTotal', total.toLocaleString('tr-TR'));
      set('envStatSellable', sellable.toLocaleString('tr-TR'));
      set('envStatTradable', tradable.toLocaleString('tr-TR'));
      set('envStatValue', fmtTL(value));
    }

    function arrows(){
      const a = (k)=>invSort===k ? (invSortDir==='asc'?'▲':'▼') : '';
      const set=(id,t)=>{ const e=document.getElementById(id); if(e) e.textContent=t; };
      set('arrName',a('name')); set('arrGame',a('game')); set('arrQty',a('qty'));
      set('arrLow',a('low')); set('arrMed',a('med'));
    }

    const ROW_H = () => (appSettings && appSettings.compactRows) ? 34 : 46;
    const GRID_COLS = '34px 14px 44px minmax(220px,1.6fr) minmax(150px,1.1fr) 92px 116px 116px';

    // G9: "Yarisi gri kalan satirlar" sikayeti. Bu bir hata degil: Ayarlar > Envanter >
    // Dusuk deger esigi altindaki ogeler soluk gosteriliyor. Hicbir yerde yazmadigi icin
    // kullanici siralama sanip kafasi karisiyordu. Artik ust barda kucuk bir aciklama var.
    function esikRozetiCiz(){
      const el = document.getElementById('envEsikNot');
      if (!el) return;
      const esik = lowLimit();
      const solmus = (viewRows || []).filter(isLowValue).length;
      if (!esik || !solmus){ el.style.display = 'none'; return; }
      el.style.display = 'flex';
      el.title = 'Ayarlar > Envanter > Düşük değer eşiği ile değiştirilir.';
      el.innerHTML = '<span style="width:6px;height:6px;border-radius:12px;background:#656D80;flex-shrink:0"></span>'
        + '<span>Soluk satırlar: ' + fmtTL(esik) + ' altındaki ' + solmus + ' öğe</span>';
    }

    function rowHTML(it){
      const st = statusOf(it);
      const on = selected.has(it.dedupKey);
      const p = priceOf(it);
      const low = p === undefined ? '…' : (priceVal(it)!=null ? fmtTL(priceVal(it)) : '-');
      const med = p === undefined ? '…' : (medValRaw(it)!=null ? fmtTL(medValRaw(it)) : '-');
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
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#C2AAEE;text-align:center">'+low+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#DCE2FA;text-align:center">'+med+'</span>'
        + '</div>';
    }

    function gridHTML(it){
      const st = statusOf(it);
      const on = selected.has(it.dedupKey);
      const med = medValRaw(it)!=null ? fmtTL(medValRaw(it)) : '-';
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
      setTimeout(esikRozetiCiz, 0);   // satirlar cizildikten sonra sayim dogru olsun
      setTimeout(paintAvgBtn, 0);     // filtre degisince eksik sayisi da degisir
      paintFetchBtn();   // filtre degisince "Fiyatlari Getir" yeniden aktiflesir
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

    // tek delege: satır seçimi + detay
    // Not: tüm listeyi yeniden çizmek yerine sadece ilgili satır güncelleniyor - 2000+ öğede
    // innerHTML'i baştan kurmak hem yavaş hem de kaydırma konumunu sıfırlıyordu.
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

    // ---- satış fiyatı stratejileri (gerçek fiyattan hesaplanır) ----
    function strategyPrice(it, strat){
      // "Altına in" / "En ucuzla aynı" ŞU ANKİ ilanlara bakar (rekabet oradadır).
      // "Ortalama" ise GERÇEKLEŞMİŞ satışlardan gelir - satıştaki uç bir ilan fiyatı
      // şişirmesin. Steam alt sınırının (0,03 vb.) altına asla inilmez.
      const ord = ordersMap.get(it.marketHashName);
      const bookLow = (ord && ord !== 'loading' && ord !== 'none' && ord.lowestSell != null) ? ord.lowestSell : null;
      const low = bookLow != null ? bookLow : priceVal(it);
      const cents = ((appSettings && +appSettings.undercutCents) || 1) / 100;
      const floor = (typeof marketMin === 'function') ? marketMin() : 0.03;
      const clamp = (v) => (v == null ? null : Math.max(floor, v));
      if (strat === 'manual')   return clamp(manualPrice);
      if (strat === 'undercut') return low != null ? clamp(low - cents) : null;
      if (strat === 'match')    return clamp(low);
      // "Hemen sat": bekleyen en yüksek alım talimatına satarsın, anında gider.
      // Bekleyen talimat yoksa değer yok sayılmaz; instantPrice son satış/ortalamaya düşer.
      if (strat === 'instant')  return clamp(instantPrice(it).value);
      return clamp(realValue(it).value);   // ortalama (gerçekleşmiş satışlardan)
    }

    // "Hemen Sat" değeri. Öncelik gerçek alım talimatı; yoksa öğe değersiz demek DEĞİL,
    // yalnızca o an bekleyen alıcı yok demek. Bu durumda son gerçekleşen satışa, o da
    // yoksa satış ortalamasına düşülür ve kaynağı açıkça belirtilir. (Eskiden talimat
    // olmayan öğeler için hiçbir fiyat üretilmiyordu, onlarca öğe boş kalıyordu.)
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
      set('bulkGross', fmtTL(gross));
      set('bulkNet', fmtTL(netOf(gross)));
      document.querySelectorAll('#bulkStrat button[data-bs]').forEach(b=>{
        const on = b.getAttribute('data-bs')===bulkStrategy;
        b.style.background = on ? EC.brand : 'transparent';
        b.style.borderColor = on ? EC.brand : 'transparent';
        b.style.color = on ? EC.title : EC.muted;
      });
      // Manuel fiyat kutusu yalnız "Kendim" seçiliyken görünür
      const mi = document.getElementById('bulkManual');
      if (mi) mi.style.display = (bulkStrategy === 'manual') ? '' : 'none';
      paintBulkWarn(items);
    }

    // FİYAT SAPMA UYARISI. Seçilen fiyat gerçek piyasa değerinden belirgin şekilde
    // uzaksa haber verir: çok yüksekse öğe satılmaz, çok düşükse para kaybedilir.
    function paintBulkWarn(items){
      const w = document.getElementById('bulkWarn');
      if (!w) return;
      let yuksek = 0, dusuk = 0, fiyatsiz = 0;
      items.forEach(i=>{
        const p = strategyPrice(i, bulkStrategy);
        if (p == null){ fiyatsiz++; return; }
        const gercek = realValue(i).value;
        if (gercek == null || gercek <= 0) return;
        const fark = (p - gercek) / gercek;
        if (fark > 0.25) yuksek++;
        else if (fark < -0.25) dusuk++;
      });
      const parcalar = [];
      if (fiyatsiz) parcalar.push(fiyatsiz + ' öğenin fiyatı yok (önce fiyatları getir)');
      if (yuksek)   parcalar.push(yuksek + ' öğe piyasanın %25+ üstünde, geç satabilir');
      if (dusuk)    parcalar.push(dusuk + ' öğe piyasanın %25+ altında, zararına gidebilir');
      if (!parcalar.length){ w.style.display = 'none'; return; }
      w.style.display = 'flex';
      w.innerHTML = '<span style="width:6px;height:6px;border-radius:12px;background:#B37E24;flex-shrink:0"></span>'
                  + '<span>' + esc(parcalar.join(' · ')) + '</span>';
    }

    document.querySelectorAll('#bulkStrat button[data-bs]').forEach(b=>b.addEventListener('click', ()=>{
      bulkStrategy = b.getAttribute('data-bs');
      if (bulkStrategy === 'manual'){
        // Kutu boşsa seçili öğenin gerçek değerini başlangıç olarak koy
        const mi = document.getElementById('bulkManual');
        if (mi && !mi.value){
          const ilk = invMerged.find(i=>selected.has(i.dedupKey));
          const v = ilk ? realValue(ilk).value : null;
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
    // "Fiyatlari Getir": yalniz su anki filtreye uyanlari ceker, bitene kadar kilitli.
    document.getElementById('envFetchPrices').onclick = fetchPricesForView;

    // ---- sağ detay paneli ----
    // İKİ AYRI VERİ KAYNAĞI, İKİ AYRI ANLAM:
    //   historyMap → GERÇEKLEŞMİŞ satışlar (pricehistory). Bir eşyanın gerçek değeri budur.
    //   ordersMap  → ŞU ANKİ sipariş defteri (itemordershistogram): satıştaki ilanlar ve
    //                alım talimatları. İlanlar bağlayıcı değildir - biri tek parçayı
    //                999.999'a listeleyebilir - bu yüzden DEĞER hesabında kullanılmaz,
    //                yalnızca "şu an ne olur" bilgisi olarak gösterilir.
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
      if (!res || !res.ok) o = { failed: true, reason: (res && res.error) || 'IPC hatası' };
      else if (!res.orders) o = { failed: true, reason: 'yanıt boş' };
      else if (res.orders.noCurrency) o = { failed: true, reason: 'hesabın pazar kuru henüz okunmadı' };
      // Sebebi sakla: "alınamadı" demek yetmiyor, NEDEN alınamadığı yazılmalı.
      else if (res.orders.error || res.orders.rateLimited) o = { failed: true, reason: res.orders.error || 'Steam istek limiti', rateLimited: !!res.orders.rateLimited };
      else o = res.orders;
      ordersMap.set(it.marketHashName, o);
      if (detailKey === it.dedupKey) renderDetail();
    }
    // Bir eşyanın GERÇEK piyasa değeri: gerçekleşmiş satışların adetle ağırlıklı medyanı.
    // Sırasıyla: 30/90 günlük satış medyanı → Steam'in 24 saatlik medyanı → (son çare) en
    // düşük ilan. Hangisinin kullanıldığı arayüzde açıkça yazılır, tahmin gizlenmez.
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

      // Ortak kutu iskeleti: başlık şeridi + Fiyat/Miktar tablosu
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
      const pqRows = (list, color) => list.map(r =>
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #101621">'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:'+color+'">'+fmtTL(r.price)+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:#8B8F9E">'+(r.qty)+'</span></div>').join('');

      // --- KUTU 1: ŞU AN SATIŞTA OLAN İLANLAR (kullanıcıların istediği fiyatlar) ---
      let sellBox;
      if (!it.marketable) sellBox = priceQtyBox('Satıştaki İlanlar', '#656D80', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (ord === 'loading' || ord === undefined) sellBox = priceQtyBox('Satıştaki İlanlar', '#5FB324', 'Sipariş defteri yükleniyor…', '', '');
      else if (ord.failed) sellBox = priceQtyBox('Satıştaki İlanlar', '#B37E24', 'Sipariş defteri alınamadı: <b style="color:#B37E24">'+esc(ord.reason||'bilinmeyen')+'</b>', '', ordRetryBtn());
      else {
        const rows = (ord.sell||[]).filter(r=>r.qty>0).slice(0, depth);
        sellBox = priceQtyBox('Satıştaki İlanlar', '#5FB324',
          (ord.lowestSell!=null ? '<b style="color:#DCE2FA">'+fmtTL(ord.lowestSell)+'</b> fiyatından başlayan <b style="color:#DCE2FA">'+ord.sellCount+'</b> ilan var' : 'Satışta ilan yok'),
          rows.length ? pqRows(rows, '#5FB324') : '', 'Satışta ilan yok.');
      }

      // --- KUTU 2: HEMEN SAT (alım talimatları - şu an ödenecek en yüksek fiyat) ---
      let buyBox;
      if (!it.marketable) buyBox = priceQtyBox('Hemen Sat', '#656D80', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (ord === 'loading' || ord === undefined) buyBox = priceQtyBox('Hemen Sat', '#24AEB3', 'Alım talimatları yükleniyor…', '', '');
      else if (ord.failed) buyBox = priceQtyBox('Hemen Sat', '#B37E24', 'Alım talimatları alınamadı: <b style="color:#B37E24">'+esc(ord.reason||'bilinmeyen')+'</b>', '', ordRetryBtn());
      else if (ord.highestBuy != null) {
        const rows = (ord.buy||[]).filter(r=>r.qty>0).slice(0, depth);
        buyBox = priceQtyBox('Hemen Sat', '#24AEB3',
          'Şu an <b style="color:#DCE2FA">'+fmtTL(ord.highestBuy)+'</b> fiyatına anında satabilirsin · toplam '
          + '<b style="color:#DCE2FA">'+ord.buyCount+'</b> alım talimatı',
          rows.length ? pqRows(rows, '#24AEB3') : '', 'Bekleyen alım talimatı yok.');
      }
      else {
        // BEKLEYEN ALIM TALİMATI YOK. Bu, öğenin değersiz olduğu anlamına GELMEZ; yalnızca
        // o an bekleyen alıcı yok demektir. Kutuyu boş bırakmak yerine son gerçekleşen
        // satışı (yoksa satış ortalamasını) referans olarak gösteriyoruz, kaynağını da
        // açıkça yazıyoruz. Aksi halde alım talimatı olmayan öğelerde hiçbir fiyat çıkmıyordu.
        const ip = instantPrice(it);
        if (ip.value == null){
          buyBox = priceQtyBox('Hemen Sat', '#656D80', 'Bekleyen alım talimatı yok ve referans alınacak satış geçmişi de yok.', '', '-');
        } else {
          const kaynak = ip.src === 'lastSale'
            ? ('en son <b style="color:#DCE2FA">' + fmtTL(ip.value) + '</b> fiyatından satılmış'
               + (ip.ts ? (' (' + new Date(ip.ts).toLocaleDateString('tr-TR') + ')') : ''))
            : ('satış ortalaması <b style="color:#DCE2FA">' + fmtTL(ip.value) + '</b>');
          buyBox = priceQtyBox('Hemen Sat', '#B37E24',
            '<b style="color:#B37E24">Şu an bekleyen alım talimatı yok.</b><br>'
            + 'Referans olarak ' + kaynak + '. Bu fiyata anında satamazsın; '
            + 'satışa koyup alıcı beklemen gerekir.',
            '', '');
        }
      }

      // --- KUTU 3: GERÇEKLEŞMİŞ SATIŞLAR (değerin geldiği yer) ---
      let saleBox;
      if (!it.marketable) saleBox = priceQtyBox('Gerçekleşen Satışlar', '#656D80', 'Bu öğe pazarda satılamaz.', '', '-');
      else if (hist === 'loading' || hist === undefined) saleBox = priceQtyBox('Gerçekleşen Satışlar', '#C2AAEE', 'Satış geçmişi yükleniyor…', '', '');
      else if (hist === 'none') saleBox = priceQtyBox('Gerçekleşen Satışlar', '#B37E24', 'Satış geçmişi alınamadı (Steam istek limiti olabilir).', '', histRetryBtn());
      else {
        const st = hist.stats || {};
        const win = st.days ? ('son '+st.days+' gün') : 'tüm zamanlar';
        const rows = (hist.recent||[]).slice().reverse().slice(0, depth);
        saleBox = priceQtyBox('Gerçekleşen Satışlar', '#C2AAEE',
          'Gerçek piyasa değeri <b style="color:#DCE2FA">'+fmtTL(st.median)+'</b> · '+win+' içinde '
          + '<b style="color:#DCE2FA">'+(st.volume||0)+'</b> adet satılmış'
          + (st.min!=null && st.max!=null ? '<br>aralık '+fmtTL(st.min)+' - '+fmtTL(st.max) : ''),
          rows.length ? pqRows(rows, '#C2AAEE') : '', 'Kayıtlı satış yok.');
      }
      const obBoxes = sellBox + buyBox + saleBox;
      box.innerHTML = '<span style="font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#8B8F9E">Eşya İncelemesi</span>'
        + '<div style="height:150px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 8px,#101621 8px 16px);display:flex;align-items:center;justify-content:center;overflow:hidden">'
          + (it.iconUrl?'<img src="'+esc(it.iconUrl)+'" style="max-width:100%;max-height:100%;object-fit:contain">':'') + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'
          + '<span style="font-size:16px;font-weight:700;color:#DCE2FA">'+esc(it.name)+'</span>'
          + '<span style="font-size:12px;color:#8B8F9E">'+esc(it.gameName||'-')+' · '+(TYPE_LABEL[it.type]||'Diğer')+' · ×'+it.count+'</span>'
        + '</div>'
        // Üç kutu: satıştaki ilanlar · hemen sat · gerçekleşen satışlar
        + '<div style="display:flex;flex-direction:column;gap:10px">' + obBoxes + '</div>'
        // NOT: "Satis Stratejisi" ve "Satis fiyati" bolumleri bu panelden KALDIRILDI.
        // Tum satis islemleri alt bardan yapiliyor (toplu ya da tekli, manuel fiyat dahil).
        ;

      // Basarisiz kutulardaki "Tekrar Dene" dugmeleri: onbellegi zorla tazeler.
      const rOrd = box.querySelector('[data-ordretry]');
      if (rOrd) rOrd.onclick = ()=>{ ordersMap.delete(it.marketHashName); ensureOrders(it, true); };
      const rHist = box.querySelector('[data-histretry]');
      if (rHist) rHist.onclick = ()=>{ historyMap.delete(it.marketHashName); ensureHistory(it); };
      if (!hist) ensureHistory(it);
      if (!ord)  ensureOrders(it);
    }

    // "Otomatik Pazarda Satış" (Kart Düşür > Otomasyon) - bir oyunda kart düştüğünde o oyunun
    // yeni satılabilir kartlarını ortalama fiyattan listeler. Envanteri tazeler, ÖNCEKİ anlık
    // görüntüde olmayan kartları bulur; böylece elindeki eski kartlara dokunmaz.
    let autoSellSeen = null;   // dedupKey -> adet (son bilinen envanter)
    async function autoSellDropped(gameName){
      if (!appSettings || !appSettings.farmAutoSell) return;
      const res = await E.inventory().catch(()=>null);
      if (!res || !res.ok) return;
      const merged = mergeDuplicates(res.items);
      const prev = autoSellSeen;
      autoSellSeen = new Map(merged.map(i=>[i.dedupKey, i.count]));
      if (!prev) return;                       // ilk ölçüm: sadece taban al
      const fresh = merged.filter(i =>
        i.type === 'card' && i.marketable && i.marketHashName &&
        (!gameName || i.gameName === gameName) &&
        (i.count > (prev.get(i.dedupKey) || 0)));
      if (!fresh.length) return;
      // fiyatları çek, sonra medyandan sat
      invMerged = merged;
      await E.pricesFor(fresh.map(i=>i.marketHashName)).then(r=>{
        if (r && r.ok) Object.entries(r.prices).forEach(([h,p]) => priceMap.set(h,p));
      }).catch(()=>{});
      const priced = fresh.filter(i=>medVal(i) != null);
      if (!priced.length) return;
      pushFeed('pazar', 'Otomatik satış', priced.length+' yeni kart ortalama fiyattan listeleniyor.', 'Çalışıyor');
      await sellFlow(priced, 'median');
    }

    // ---- Satış: gerçek para işlemi → her zaman açık onay iste ----
    async function sellFlow(items, strat, manualPrice){
      const sellable = items.filter(i=>i.marketable && i.marketHashName && (manualPrice!=null || strategyPrice(i,strat)!=null));
      if (!sellable.length){ alert('Seçilen öğelerin fiyatı henüz yüklenmedi veya satılabilir değil.'); return; }
      const limit = (appSettings && +appSettings.bulkSellLimit) || 50;
      const lines = [], plan = [];
      sellable.forEach(i=>{
        const val = manualPrice != null ? manualPrice : strategyPrice(i, strat);
        if (val == null || !(val > 0)) return;
        const net = val*(1-STEAM_FEE);
        i.assetIds.forEach(aid => { if (plan.length < limit) plan.push({ assetId: aid, cents: Math.max(1, Math.round(net*100)), name: i.name }); });
        lines.push('• '+i.name+' ×'+i.count+' → '+fmtTL(val)+' (net '+fmtTL(net)+')');
      });
      if (!plan.length){ alert('Listelenecek geçerli fiyat bulunamadı.'); return; }
      const totalNet = plan.reduce((s,p)=>s+p.cents,0)/100;
      if (!appSettings || appSettings.confirmBeforeSell !== false){
        // MADDE 9: yerel confirm() yerine tema uyumlu ve ne olacagini acikca yazan onay.
        // Satis geri alinamaz bir islem; kullanici neyi ne fiyata sattigini gormeli.
        const toplamBrut = plan.reduce((t,pl)=>t+pl.cents,0)/100/(1-STEAM_FEE);
        const ok = await edgeConfirm({
          tag:'Pazarda Sat', danger:true,
          title: plan.length + ' öğe satışa sunulacak',
          body: lines.slice(0,12).join('\n') + (lines.length>12 ? ('\n… ve '+(lines.length-12)+' tane daha') : '')
                + '\n\nAlıcının ödeyeceği toplam: ' + fmtTL(toplamBrut)
                + '\nSteam kesintisi sonrası eline geçecek: ' + fmtTL(totalNet),
          warn: 'Satışa sunulan öğe geri alınamaz; ilan iptali Steam üzerinden ayrıca yapılır. '
                + 'Hesabında mobil doğrulayıcı açıksa her listelemeyi Steam uygulamasından onaylaman gerekir.',
          confirmText:'Satışa Sun', cancelText:'Vazgeç',
        });
        if (!ok) return;
      }
      // "Satışta iki adımlı onay" - toplu işlemlerde ayrıca yazarak doğrulama ister
      if (appSettings && appSettings.twoStepSell && plan.length > 1){
        const typed = prompt('İKİ ADIMLI ONAY\n\n'+plan.length+' öğe satışa sunulacak.\nOnaylamak için SAT yazıp Tamam\'a bas:');
        if (String(typed||'').trim().toUpperCase() !== 'SAT'){ alert('Onay alınamadı, işlem iptal edildi.'); return; }
      }
      let done=0, fail=0;
      for (const p of plan){
        const r = await E.sellItem(p.assetId, p.cents, 1).catch(()=>({ ok:false }));
        r.ok ? done++ : fail++;
        document.getElementById('bulkCount').textContent = done+'/'+plan.length;
        await new Promise(r2=>setTimeout(r2, 400));
      }
      // "Satılan öğeyi envanterden gizle" - aynı öğeyi iki kez listelemeyi önler
      if (done > 0) sellable.forEach(i=>soldKeys.add(i.dedupKey));
      alert('Listeleme bitti.\nBaşarılı: '+done+'\nHatalı: '+fail+'\n\nSteam mobil uygulamandan onayla.');
      pushFeed(fail?'hata':'pazar', 'Satış', done+' öğe satışa sunuldu'+(fail?(', '+fail+' hata'):'')+'.', fail?'Hata':'Başarılı');
      if (done>0) addLifeStats({ cardsSold: done });
      selected.clear(); envLoaded=false; invMerged=null; invItems=null; detailKey=null;
      loadEnv();
    }
