    // ================= MY MARKET LISTINGS =================
    // A sheet over the Inventory page: the account's own active listings with the option to take them back.
    // Taking a listing back returns the item to the inventory, so the inventory is read again afterwards.
    let mlData = null, mlBusy = false, mlBack = null;
    const mlSelected = new Set();

    function mlClose(){
      if (!mlBack) return;
      const b = mlBack; mlBack = null;
      b.classList.remove('show');
      setTimeout(() => b.remove(), 140);
      document.removeEventListener('keydown', mlKey);
    }
    function mlKey(e){ if (e.key === 'Escape' && !mlBusy) mlClose(); }

    function mlRows(list, withBox){
      return list.map(l => {
        const on = mlSelected.has(l.listingId);
        return '<div data-ml="' + esc(l.listingId) + '" style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #101621;' + (withBox ? 'cursor:pointer' : '') + '">'
          + (withBox
              ? '<div style="width:16px;height:16px;flex-shrink:0;border-radius:6px;border:1px solid ' + (on ? '#5624B3' : '#2B3345') + ';background:' + (on ? '#5624B3' : 'transparent') + ';display:flex;align-items:center;justify-content:center"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DCE2FA" stroke-width="3.4" style="opacity:' + (on ? 1 : 0) + '"><path d="M5 13l4 4L19 7"></path></svg></div>'
              : '<span style="width:16px;flex-shrink:0"></span>')
          + '<div style="width:34px;height:34px;flex-shrink:0;border-radius:10px;border:1px solid #2B3345;background:#101621;overflow:hidden">'
            + (l.iconUrl ? '<img src="' + esc(l.iconUrl) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">' : '') + '</div>'
          + '<span style="flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(l.name) + '</span>'
          + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">'
            + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:#DCE2FA">' + esc(fmtMoney(l.buyerCents / 100)) + '</span>'
            + '<span style="font-size:11px;color:#8B8F9E">' + esc(t('eline geçecek') + ' ' + fmtMoney(l.sellerCents / 100)) + '</span>'
          + '</div>'
          + '<span style="width:74px;flex-shrink:0;text-align:right;font-family:Geist Mono,monospace;font-size:11px;color:#7F879B">' + (l.created ? new Date(l.created).toLocaleDateString(localCode()) : '') + '</span>'
          + '</div>';
      }).join('');
    }
    function mlGroup(title, list, withBox){
      if (!list.length) return '';
      return '<div style="padding:12px 4px 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#7F879B">' + esc(t(title)) + ' · ' + list.length + '</div>' + mlRows(list, withBox);
    }

    function mlPaint(){
      if (!mlBack) return;
      const body = mlBack.querySelector('[data-mlbody]');
      const cancelBtn = mlBack.querySelector('[data-mlcancel]');
      if (!mlData){ body.innerHTML = '<div style="padding:40px 0;text-align:center;font-size:12px;color:#8B8F9E">' + esc(t('Pazardaki ilanların yükleniyor…')) + '</div>'; }
      else if (mlData.error){ body.innerHTML = '<div style="padding:40px 12px;text-align:center;font-size:12px;color:#E45A86">' + esc(t(mlData.error)) + '</div>'; }
      else {
        const d = mlData;
        body.innerHTML = (d.listings.length || d.toConfirm.length || d.onHold.length)
          ? mlGroup('Satıştaki ilanlar', d.listings, true) + mlGroup('Onay bekleyenler', d.toConfirm, false) + mlGroup('Bekletmedeki ilanlar', d.onHold, false)
          : '<div style="padding:40px 0;text-align:center;font-size:12px;color:#7F879B">' + esc(t('Aktif ilan yok.')) + '</div>';
      }
      const n = mlSelected.size;
      cancelBtn.disabled = !n || mlBusy;
      cancelBtn.style.opacity = (!n || mlBusy) ? '.4' : '1';
      cancelBtn.textContent = n ? tf('# İlanı İptal Et', n) : t('İlanı İptal Et');
    }

    async function mlLoad(){
      mlData = null; mlSelected.clear(); mlPaint();
      const r = await window.imu.market.myListings().catch(e => ({ ok: false, error: e && e.message }));
      mlData = (r && r.ok) ? r.data : { listings: [], toConfirm: [], onHold: [], error: (r && r.error) || 'Pazar ilanları alınamadı.' };
      mlPaint();
    }

    async function mlCancel(){
      const all = mlData ? mlData.listings : [];
      const todo = all.filter(l => mlSelected.has(l.listingId));
      if (!todo.length || mlBusy) return;
      const ok = await edgeConfirm({ tag: 'Pazar İlanları', danger: true, title: tf('# ilan iptal edilecek', todo.length),
        body: 'İlan Steam pazarından kaldırılır; eşyalar envanterine geri döner.', confirmText: 'İptal Et', cancelText: 'Vazgeç' });
      if (!ok) return;
      mlBusy = true;
      const owner = (typeof imuProfile === 'object' && imuProfile && imuProfile.steamID) || (appSettings && appSettings.steamID) || null;
      const cancelBtn = mlBack && mlBack.querySelector('[data-mlcancel]');
      const failures = [];
      let done = 0;
      for (const l of todo){
        if (cancelBtn) cancelBtn.textContent = tf('İptal ediliyor · # / #', done, todo.length);
        const r = await window.imu.market.removeListing(l.listingId, owner).catch(e => ({ ok: false, error: e && e.message }));
        if (r && r.ok){ done++; if (l.assetId && typeof listedAssets !== 'undefined') listedAssets.delete(l.assetId); }
        else {
          failures.push(l.name + ': ' + ((r && r.error) || ''));
          if (r && r.rateLimited) break;       // Steam's request limit: the rest would only fail the same way
        }
      }
      mlBusy = false;
      if (done) toast('Pazar İlanları').done(tf('# ilan iptal edildi.', done));
      if (failures.length) edgeConfirm({ tag: 'Pazar İlanları', danger: true, title: tf('# ilan iptal edilemedi', failures.length),
        body: failures.slice(0, 5).join('\n'), confirmText: 'Tamam', singleButton: true });
      if (done){
        pushFeed('market', 'Pazar', tf('# ilan iptal edildi.', done), 'Başarılı');
        // the items are back in the inventory
        if (typeof dropKeptSources === 'function') dropKeptSources();
        selected.clear(); inventoryLoaded = false; invMerged = null; invItems = null; detailKey = null;
        loadInventory();
      }
      if (mlBack) mlLoad();
    }

    function openMyListings(){
      if (mlBack) return;
      const back = document.createElement('div');
      back.className = 'e-modal-back';
      back.setAttribute('data-page', 'inventory');
      back.innerHTML = '<div class="e-modal" role="dialog" aria-modal="true" style="width:760px">'
        + '<div class="e-modal-hd"><span class="dot" style="background:#5624B3"></span><span class="ttl">' + esc(t('Aktif İlanlarım')) + '</span></div>'
        + '<div data-mlbody style="max-height:56vh;overflow-y:auto;padding:4px 18px 10px"></div>'
        + '<div class="e-modal-ft">'
          + '<button class="cancel" data-mlrefresh>' + esc(t('Yenile')) + '</button>'
          + '<button class="cancel" data-mlclose>' + esc(t('Kapat')) + '</button>'
          + '<button class="ok danger" data-mlcancel>' + esc(t('İlanı İptal Et')) + '</button>'
        + '</div></div>';
      document.body.appendChild(back);
      mlBack = back;
      requestAnimationFrame(() => back.classList.add('show'));
      document.addEventListener('keydown', mlKey);
      back._shutdownInner = () => mlClose();           // closes on its own when the user changes the tab
      back.addEventListener('mousedown', (e) => { if (e.target === back && !mlBusy) mlClose(); });
      back.querySelector('[data-mlclose]').onclick = () => { if (!mlBusy) mlClose(); };
      back.querySelector('[data-mlrefresh]').onclick = () => { if (!mlBusy) mlLoad(); };
      back.querySelector('[data-mlcancel]').onclick = mlCancel;
      back.querySelector('[data-mlbody]').addEventListener('click', (e) => {
        const row = e.target.closest('[data-ml]');
        if (!row || mlBusy) return;
        const id = row.getAttribute('data-ml');
        if (!mlData || !mlData.listings.some(l => l.listingId === id)) return;   // only active listings can be taken back here; the others wait for the Steam app / the hold to end
        mlSelected.has(id) ? mlSelected.delete(id) : mlSelected.add(id);
        mlPaint();
      });
      mlLoad();
    }
    document.getElementById('invMyListings').onclick = openMyListings;

    // ================= CSV EXPORT =================
    // The rows of the inventory as it is filtered on the page (all items when no filter), one line per item kind with its count,
    // the prices already fetched, and the value of the stack. Prices come from the page's own price cache: nothing is fetched here.
    document.getElementById('invExportCsv').onclick = async () => {
      const list = (typeof viewRows !== 'undefined' && viewRows && viewRows.length) ? viewRows : ((typeof invMerged !== 'undefined' && invMerged) || []);
      if (!list.length){ toast('Envanter').fail('Dışa aktarılacak eşya yok.'); return; }
      // the column names stay English whatever the interface language is: spreadsheets and scripts read them by name
      const header = ['Name', 'Game', 'Type', 'Quantity', 'Marketable', 'Tradable', 'Lowest price', 'Median price', 'Unit value', 'Total value'];
      const rows = [header].concat(list.map(it => {
        const p = (typeof priceOf === 'function') ? priceOf(it) : null;
        const unit = p ? (p.medianValue != null ? p.medianValue : p.lowestValue) : null;
        const count = it.count || it.amount || 1;
        return [it.name, it.gameName || '', it.typeText || it.type || '', count, it.marketable ? 'yes' : 'no', it.tradable ? 'yes' : 'no',
                p ? (p.lowest || '') : '', p ? (p.median || '') : '', unit != null ? unit : '', unit != null ? Math.round(unit * count * 100) / 100 : ''];
      }));
      const r = await window.imu.inventory.exportCsv(rows).catch(e => ({ ok: false, error: e && e.message }));
      if (r && r.ok) toast('Envanter').done(tf('# satır dışa aktarıldı.', r.count));
      else if (r && !r.canceled) toast('Envanter').fail((r && r.error) || 'Dışa aktarılamadı.');
    };
