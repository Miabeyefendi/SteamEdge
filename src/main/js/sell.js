    // Inventory sale: Steam's fee, price drops, the sale job and its progress panel.
    // Loaded before inventory.js (main.html): inventory.js binds its buttons to these functions as it loads.

    // ================= SALE =================
    // The price the user chooses is the price the BUYER pays (the one shown on the Steam market). What goes to Steam
    // is the amount the SELLER keeps; Steam's OWN script computes the fee in between
    // (main.js > engine:saleFee). A fixed 13% used to be deducted; because of Steam's base fee
    // on cheap cards the listing deviated 10-67% from the chosen price ($0.05 when $0.03 was chosen).
    //
    // The computed amounts are kept in memory in cents: buyer price -> { seller, buyer }.
    const feeCache = new Map();          // buyer subunits -> { seller, buyer }: exact, from Steam's own script
    // The fee fields of the wallet (Steam's usual values until the real ones arrive). With them the amounts are worked out HERE, at once:
    // nothing waits for the network when a strategy is chosen or the price changes. The exact numbers from Steam's script replace
    // the estimate as soon as they arrive (and are what the sale uses when they are there).
    let feeParams = { pct: 0.05, pubPct: 0.10, min: 1, base: 0 };
    let feeRequest = null;
    const subunit = (v) => Math.max(0, Math.round((+v || 0) * 100));
    // total: what the buyer pays (subunits). Largest seller amount whose total with fees does not pass it.
    function estimateFee(total){
      const f = feeParams;
      const feesOf = (x) => Math.floor(Math.max(x * f.pct, f.min) + f.base) + (f.pubPct > 0 ? Math.floor(Math.max(x * f.pubPct, 1)) : 0);
      let x = Math.max(0, Math.floor((total - f.base) / (1 + f.pct + f.pubPct)));
      while (x > 0 && x + feesOf(x) > total) x--;
      while (x + 1 + feesOf(x + 1) <= total) x++;
      return { seller: x, buyer: x + feesOf(x), estimated: true };
    }
    const feeFor = (buyerSub) => feeCache.get(buyerSub) || estimateFee(buyerSub);
    async function prepareFees(buyerSubunits){
      const lacking = [...new Set(buyerSubunits.filter(k => k > 0 && !feeCache.has(k)))];
      if (!lacking.length) return true;
      const r = await E.saleFee(lacking).catch(e => ({ ok:false, error:(e && e.message) }));
      if (r && r.fee && Number.isFinite(r.fee.pct) && Number.isFinite(r.fee.pubPct)) feeParams = r.fee;
      if (!r || !r.ok || !Array.isArray(r.outcomeData)) return (r && r.error) || 'Steam ücret hesabı yüklenemedi.';
      r.outcomeData.forEach(x => feeCache.set(x.totalSum, { seller: x.seller, buyer: x.buyer }));
      return true;
    }
    // The amount you will get (in currency units): Steam's exact number if it is there, the estimate otherwise.
    function sellerAmount(buyerValue){ return feeFor(subunit(buyerValue)).seller / 100; }
    // The exact numbers are asked for in the background and drawn when they arrive. If Steam could not be reached it is not tried
    // again for a minute; otherwise every draw would send a new request.
    let feeErrorTime = 0;
    function prepareNet(values){
      if (Date.now() - feeErrorTime < 60000) return;
      const needed = values.map(subunit).filter(k => k > 0 && !feeCache.has(k));
      if (!needed.length || feeRequest) return;
      feeRequest = prepareFees(needed)
        .then((r)=>{ if (r !== true) feeErrorTime = Date.now(); })
        .finally(()=>{ feeRequest = null; if (invMerged) renderBulk(); if (typeof renderOverviewStats === 'function') renderOverviewStats(); });
    }
    // Once per page: learn the wallet's fee fields and wake Steam's script while the user is still choosing.
    let feesWarmed = false;
    function warmFees(){
      if (feesWarmed) return;
      feesWarmed = true;
      E.saleFee([]).then((r)=>{
        if (r && r.fee && Number.isFinite(r.fee.pct) && Number.isFinite(r.fee.pubPct)){ feeParams = r.fee; if (invMerged) renderBulk(); }
        else feesWarmed = false;
      }).catch(()=>{ feesWarmed = false; });
    }

    // ---- price drop ----
    // Items that drop clearly below Steam's 24 hour average. The notification is tied to
    // its own key ("Price drop alert"), it does not go quiet when the error notification is turned off.
    // The same item is notified once a day. It is also warned with a red line in the sale confirmation.
    const priceDrops = new Map();          // marketHashName -> { percentValue, ts }
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
      priceDrops.set(hashName, { percentValue: Math.round(d * 100), ts: earlier ? earlier.ts : Date.now() });
      if (earlier && Date.now() - earlier.ts < 24 * 3600 * 1000) return;
      if (!appSettings || !appSettings.notifyPriceDrop) return;
      const it = invMerged && invMerged.find(x => x.marketHashName === hashName);
      const name = it ? it.name : hashName;
      const title = tf('Fiyat düştü · #', fmtPercent(Math.round(d * 100)));
      const bodyEl = name + ' · ' + fmtLira(price.medianValue) + ' → ' + fmtLira(price.lowestValue);
      notify('price', title, bodyEl);
      pushFeed('error', title, bodyEl, 'Hata');
    }

    // ---- sale job ----
    // Steam limits listing by the account's trustworthiness: a new account can be stopped after 10-15
    // listings, an old account can list 80+ at once. So:
    //   - When Steam returns an error the job STOPS and the reason is told; no blind continuing.
    //   - If wanted it is split into batches (Settings > Market > Batch size). When a batch ends
    //     it either waits for the set time and continues or asks the user.
    // Nearly every listing lands in the Steam Guard mobile confirmation; when the job ends it is said how many
    // are waiting for confirmation. The two step "type SAT" confirmation was removed: prompt() never
    // worked in Electron and the real second step is already Steam Guard.
    let saleTask = null;
    let salePanel = null;               // the task whose progress is on screen (stays after the job ends until it is closed)
    let saleBusy = false;               // from the click on Sell until the job ends: a second click cannot start a second flow
    const listedAssets = new Set();     // the assetIds put on sale in this session
    // The batch settings are read live while the job runs: the new value saved in Settings takes effect
    // at the next batch limit. 0 = do not split into batches, list until Steam stops it.
    function saleBatchSize(){ const n = +((appSettings || {}).bulkSellLimit); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; }
    function saleBatchWait(){ return Math.max(1, +((appSettings || {}).sellBatchWaitMin) || 5); }
    const cancellableWait = (ms, g) => new Promise((solve)=>{
      const latest = Date.now() + ms;
      const t = setInterval(()=>{ if (g.abandon || g.continueNow || Date.now() >= latest){ clearInterval(t); solve(); } else drawSaleStatus(); }, 1000);
    });
    function setSellBusy(on){
      saleBusy = on;
      const b = document.getElementById('bulkSellNow');
      if (b){ b.disabled = on; b.style.opacity = on ? '0.5' : '1'; b.style.cursor = on ? 'not-allowed' : 'pointer'; }
    }

    // ---- the progress panel: every item of the job, one row each, updated as the requests go out ----
    const SG_BTN = 'height:28px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #5322AB;color:#C2AAEE;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;flex-shrink:0;white-space:nowrap';
    const SP_STATE = { wait:['Sırada','#7F879B'], send:['Gönderiliyor','#C2AAEE'], ok:['Satışa sunuldu','#5FB324'], conf:['Onay bekliyor','#B37E24'], skip:['Atlandı','#B37E24'], fail:['Reddedildi','#E45A86'] };
    function paintSaleRow(g, i){
      const p = g.plan[i];
      const row = document.querySelector('#salePanel [data-r="'+i+'"]');
      if (!row) return;
      const key = p.st + '|' + (p.msg || '');
      if (row._k === key) return;
      row._k = key;
      const st = SP_STATE[p.st] || SP_STATE.wait;
      row.style.background = p.st === 'send' ? '#151C28' : 'transparent';
      row.querySelector('[data-c="dot"]').style.background = st[1];
      const label = row.querySelector('[data-c="st"]');
      label.textContent = t(st[0]); label.style.color = st[1];
      const msg = row.querySelector('[data-c="msg"]');
      msg.textContent = p.msg || ''; msg.style.display = p.msg ? 'block' : 'none';
      if (p.st === 'send'){ const list = document.getElementById('salePanelList'); if (list) list.scrollTop = Math.max(0, row.offsetTop - 70); }
    }
    function drawSaleStatus(){
      let el = document.getElementById('salePanel');
      const g = salePanel;
      if (!g){ if (el) el.remove(); return; }
      if (!el || el._g !== g){
        if (el) el.remove();
        el = document.createElement('div');
        el.id = 'salePanel'; el._g = g;
        el.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:150;width:440px;max-width:calc(100vw - 48px);display:flex;flex-direction:column;gap:10px;'
          + 'padding:14px;border-radius:12px;background:#0D1118;border:1px solid #5322AB;box-shadow:0 8px 28px rgba(0,0,0,.55)';
        el.innerHTML = '<div style="display:flex;align-items:center;gap:10px">'
            + '<span class="e-pulse" data-sp="dot" style="width:7px;height:7px;border-radius:12px;background:#5624B3;flex-shrink:0"></span>'
            + '<span data-sp="title" style="flex:1;min-width:0;font-size:12px;font-weight:600;color:#DCE2FA;line-height:1.4"></span>'
            + '<span data-sp="btns" style="display:flex;gap:6px;flex-shrink:0"></span></div>'
          + '<div style="height:5px;border-radius:999px;background:#090C12;border:1px solid #1D2432;overflow:hidden"><div data-sp="bar" style="height:100%;width:0;border-radius:999px;background:#5624B3;transition:width .2s"></div></div>'
          + '<div data-sp="counts" style="font-size:12px;color:#8B8F9E"></div>'
          + '<div id="salePanelList" style="max-height:240px;overflow-y:auto;border:1px solid #1D2432;border-radius:10px;background:#090C12">'
          + g.plan.map((p, n) => '<div data-r="'+n+'" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #101621">'
              + '<span data-c="dot" style="width:6px;height:6px;border-radius:12px;background:#7F879B;flex-shrink:0"></span>'
              + '<span style="flex:1;min-width:0"><span style="display:block;font-size:12px;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.name)+'</span>'
              + '<span data-c="msg" style="display:none;font-size:12px;color:#B37E24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span></span>'
              + '<span style="font-family:Geist Mono,monospace;font-size:12px;color:#8B8F9E;flex-shrink:0">'+esc(fmtLira(p.buyer/100))+'</span>'
              + '<span data-c="st" style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;flex-shrink:0;min-width:92px;text-align:right"></span></div>').join('')
          + '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', (e)=>{
          const b = e.target.closest('[data-sg]'); if (!b || !salePanel) return;
          const a = b.getAttribute('data-sg');
          if (a === 'stop'){ salePanel.abandon = true; drawSaleStatus(); }
          else if (a === 'resume'){ salePanel.continueNow = true; }
          else if (a === 'close'){ salePanel = null; drawSaleStatus(); }
        });
      }
      const q = (k) => el.querySelector('[data-sp="'+k+'"]');
      const remaining = g.plan.filter(p => p.st === 'wait' || p.st === 'send').length;
      const okN = g.plan.filter(p => p.st === 'ok' || p.st === 'conf').length;
      const badN = g.plan.filter(p => p.st === 'fail' || p.st === 'skip').length;
      let title, buttons = '';
      if (g.done){
        title = g.successful ? tf('# öğe satışa sunuldu', g.successful) : t('Hiçbir öğe satışa sunulamadı');
        buttons = '<button data-sg="close" class="h-brand" style="'+SG_BTN+'">'+esc(t('Kapat'))+'</button>';
      } else if (g.waiting){
        const seconds = Math.max(0, Math.round((g.waiting - Date.now()) / 1000));
        title = tf('Parti tamamlandı · sonraki parti # sonra', fmtDuration(seconds)) + ' · ' + tf('# öğe bekliyor', remaining);
        buttons = '<button data-sg="resume" class="h-brand" style="'+SG_BTN+'">'+esc(t('Şimdi Devam Et'))+'</button>';
      } else {
        title = tf('Satışa sunuluyor · # / #', g.i, g.plan.length);
      }
      if (!g.done) buttons += '<button data-sg="stop" class="h-stop" style="'+SG_BTN.replace('#5624B3','#B32453').replace('#C2AAEE','#E45A86')+'">'+esc(t('Durdur'))+'</button>';
      q('title').textContent = title;
      q('btns').innerHTML = buttons;
      q('dot').style.animation = g.done ? 'none' : '';
      q('bar').style.width = (g.plan.length ? Math.round((okN + badN) / g.plan.length * 100) : 0) + '%';
      q('counts').textContent = tf('# satışta · # hata · # kaldı', okN, badN, remaining)
        + (g.mobileConfirm ? ' · ' + tf('# ilan Steam Guard onayı bekliyor', g.mobileConfirm) : '');
      g.plan.forEach((_p, n) => paintSaleRow(g, n));
    }
    function fmtDuration(seconds){ const d = Math.floor(seconds/60), s = seconds%60; return d ? (d+':'+String(s).padStart(2,'0')) : (s+' sn'); }

    // Sell: no calculation step. The amounts are already on screen (worked out at once, Steam's exact numbers replace them when they are there);
    // the button asks the one question and starts listing.
    async function sellFlow(items, strat){
      if (saleBusy || saleTask){ toast('Satış').fail('Önceki satış işlemi sürüyor.'); return; }
      setSellBusy(true);
      try { await sellFlowRun(items, strat); } finally { setSellBusy(false); }
    }
    async function sellFlowRun(items, strat){
      const sellable = items.filter(i=>i.marketable && i.marketHashName && strategyPrice(i,strat)!=null);
      if (!sellable.length){ toast('Satış').fail('Seçilen öğelerin fiyatı henüz yüklenmedi veya satılabilir değil.'); return; }
      // Steam's exact numbers, if they are not in yet: a short silent wait, then the estimate is used and the question says so.
      const subs = sellable.map(i => subunit(strategyPrice(i, strat)));
      if (subs.some(k => k > 0 && !feeCache.has(k))) await Promise.race([prepareFees(subs).catch(()=>null), new Promise(r => setTimeout(r, 2500))]);
      const plan = [], rowsList = [];
      sellable.forEach(i=>{
        const u = feeFor(subunit(strategyPrice(i, strat)));
        if (!u || !(u.seller > 0)) return;
        const assets = i.assetIds.filter(a => !listedAssets.has(assetTag(i, a)));
        if (!assets.length) return;
        assets.forEach(aid => plan.push({ assetId: aid, tag: assetTag(i, aid), app: i.invApp || 753, ctx: i.invContext || '6', seller: u.seller, buyer: u.buyer, name: i.name, dedupKey: i.dedupKey, st: 'wait', msg: '' }));
        // One sentence per item: the lowest price on the market now against the price it is listed at
        const p = priceOf(i);
        rowsList.push('• ' + i.name + ' ×' + assets.length + ': ' + (p && p.lowestValue > 0
          ? tf('Pazardaki en düşük fiyat #, siz # fiyatından satıyorsunuz.', fmtLira(p.lowestValue), fmtLira(u.buyer/100))
          : tf('Siz # fiyatından satıyorsunuz.', fmtLira(u.buyer/100))));
      });
      if (!plan.length){ toast('Satış').fail('Listelenecek geçerli fiyat bulunamadı.'); return; }
      if (!appSettings || appSettings.confirmBeforeSell !== false){
        const ok = await edgeConfirm({
          tag: 'Pazarda Sat', danger: true,
          title: tf('# öğe satışa sunulacak', plan.length),
          body: rowsList.slice(0,12).join('\n') + (rowsList.length > 12 ? ('\n' + tf('… ve # tane daha', rowsList.length - 12)) : ''),
          warn: 'Onaylamadan önce fiyatları kontrol edin.',
          confirmText: 'Satışa Sun', cancelText: 'Vazgeç',
        });
        if (!ok) return;
      }
      // the account the items belong to: the batches of a sale can wait minutes, the account on screen may change meanwhile
      const owner = (typeof imuProfile === 'object' && imuProfile && imuProfile.steamID) || (appSettings && appSettings.steamID) || null;
      saleTask = { owner, source: sourceOf(sellable[0]), plan, i: 0, successful: 0, mobileConfirm: 0, emailConfirm: 0, emailAddr: null,
                      failures: [], skipped: 0, limit: null, abandon: false, consecutive: 0, waiting: null, continueNow: false, done: false };
      salePanel = saleTask;
      drawSaleStatus();
      await runSaleTask(saleTask);
    }

    async function runSaleTask(g){
      let perBatch = g.i;
      while (g.i < g.plan.length && !g.abandon){
        const p = g.plan[g.i];
        p.st = 'send'; drawSaleStatus();
        // The main process spaces the requests (market gate, 1.5 s apart) and refuses to send the same asset twice.
        const r = await E.sellItem(p.assetId, p.seller, 1, p.app, p.ctx, g.owner).catch(e=>({ ok:false, error:(e && e.message), typeName:'general' }));
        g.i++;
        if (r && r.ok){
          g.successful++; g.consecutive = 0;
          listedAssets.add(p.tag);
          const s = r.result || {};
          p.st = 'ok';
          if (s.needs_mobile_confirmation || s.requires_confirmation){ g.mobileConfirm++; p.st = 'conf'; }
          if (s.needs_email_confirmation){ g.emailConfirm++; g.emailAddr = s.email_domain || g.emailAddr; p.st = 'conf'; }
        } else {
          const category = (r && r.typeName) || 'general';
          p.msg = (r && r.error) || '';
          if (category === 'skip'){ g.skipped++; g.failures.push(p.name + ': ' + (r.error || '')); p.st = 'skip'; }
          else {
            g.consecutive++;
            g.failures.push(p.name + ': ' + ((r && r.error) || ''));
            p.st = 'fail';
            // If Steam stopped there is no point sending the remaining requests: it only piles up errors
            // and narrows the account's limit even more.
            if (category === 'limit' || g.consecutive >= 2){ g.limit = (r && r.error) || t('Steam listelemeyi durdurdu.'); g.i--; g.failedAsset = p.assetId; break; }
          }
        }
        drawSaleStatus();
        if (g.i < g.plan.length && !g.abandon){
          // Batch limit (the setting is read live)
          const lot = saleBatchSize();
          if (lot && g.i - perBatch >= lot){
            perBatch = g.i;
            const waitMin = saleBatchWait();
            g.waiting = Date.now() + waitMin * 60000; drawSaleStatus();
            await cancellableWait(waitMin * 60000, g);
            g.waiting = null; g.continueNow = false;
            if (g.abandon) break;
          }
        }
      }
      g.done = true;
      saleTask = null;
      drawSaleStatus();
      saleResult(g);
      // The inventory the items came from is read again (the sold ones are gone). If another one is on screen only the kept copy is dropped.
      sourceState.delete(g.source);
      if (g.source === invSource){
        selected.clear(); inventoryLoaded = false; invMerged = null; invItems = null; detailKey = null;
        loadInventory();
      }
    }

    function saleResult(g){
      const remaining = g.plan.length - g.i;
      const rowsList = [];
      if (g.mobileConfirm) rowsList.push(tf('# ilan Steam Guard onayı bekliyor: Steam mobil uygulamasında Onaylar bölümünden onayla.', g.mobileConfirm));
      if (g.emailConfirm) rowsList.push(tf('# ilan e-posta onayı bekliyor (#).', g.emailConfirm, g.emailAddr || 'e-posta'));
      if (g.skipped) rowsList.push(tf('# öğe atlandı (zaten onay bekleyen ilanı var ya da envanterde yok).', g.skipped));
      if (remaining) rowsList.push(tf('# öğe listelenmedi.', remaining));
      if (g.failures.length) rowsList.push('\n' + t('Steam yanıtları:') + '\n' + g.failures.slice(0, 5).map(x=>'  · ' + x).join('\n'));
      const title = g.successful ? tf('# öğe satışa sunuldu', g.successful) : t('Hiçbir öğe satışa sunulamadı');
      pushFeed(g.limit ? 'error' : 'market', 'Satış', title + (g.mobileConfirm ? (' · ' + tf('# Steam Guard onayı bekliyor', g.mobileConfirm)) : ''), g.limit ? 'Uyarı' : 'Başarılı');
      edgeConfirm({
        tag: g.limit ? 'Steam Sınırı' : 'Satış', danger: !!g.limit,
        title: title,
        body: rowsList.join('\n') || t('Tüm ilanlar gönderildi.'),
        warn: g.limit
          ? (t('Steam listelemeyi durdurdu:') + ' ' + g.limit + '\n' + t('Steam bu sınırı hesabın yaşına, seviyesine ve güvenilirliğine göre belirliyor. Onay bekleyen ilanları onayla ya da birkaç saat sonra kalanları tekrar dene. Ayarlar > Pazar > Parti büyüklüğü ile daha küçük partiler seçebilirsin.'))
          : (g.abandon ? t('İşlemi sen durdurdun.') : ''),
        confirmText: 'Tamam', singleButton: true,
      });
    }
