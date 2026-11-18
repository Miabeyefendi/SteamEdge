    // The version badge in the top bar and the update check, window and install.
    // Loaded after common.js (main.html); like every page script it shares the global scope.

    // ---- top bar: version badge and update warning ----
    // The version is read from package.json (preload > imu.versionStr); it is written by hand nowhere.
    const APP_VERSION = (window.imu && window.imu.versionStr) || '';
    (function paintVersion(){
      const e = document.getElementById('tbVersion');
      if (e) e.textContent = APP_VERSION ? ('v' + APP_VERSION) : 'v-';
    })();

    // ---- UPDATE ----
    // The app looks ONCE at startup. If there is a new version a window opens; if the version is current
    // nothing is shown - there is no point disturbing the user just to say "everything is fine".
    // The button in the top bar repeats the same check whenever asked; there the result is told
    // in every case, because whoever pressed the button is waiting for an answer.
    // Nothing is downloaded until the user presses "Update Now": then the main process downloads the new version from
    // GitHub, verifies it and installs it (src/backend/update.js).
    let latestUpdateStatus = null;
    let updateWindowOpen = false;

    // The window that shows the download while it runs. Returns { set(text, fraction), close() }.
    function updateProgressWindow(){
      const back = document.createElement('div');
      back.className = 'e-modal-back';
      back.innerHTML =
        '<div class="e-modal" role="dialog" aria-modal="true">'
        + '<div class="e-modal-hd"><span class="dot" style="background:#5624B3"></span><span class="ttl">'+esc(t('Güncelleme'))+'</span></div>'
        + '<div class="e-modal-body"><span class="h" data-t></span>'
        + '<div style="height:8px;border-radius:12px;background:#1B2130;margin-top:12px;overflow:hidden"><div data-bar style="height:100%;width:0;background:#5624B3;transition:width .2s"></div></div></div>'
        + '</div>';
      document.body.appendChild(back);
      requestAnimationFrame(()=>back.classList.add('show'));
      const text = back.querySelector('[data-t]'), bar = back.querySelector('[data-bar]');
      return {
        set(msg, fraction){ text.textContent = msg; if (typeof fraction === 'number') bar.style.width = Math.max(0, Math.min(100, Math.round(fraction * 100))) + '%'; },
        close(){ back.classList.remove('show'); setTimeout(()=>back.remove(), 140); },
      };
    }

    async function runUpdate(d){
      const win = updateProgressWindow();
      win.set(t('İndiriliyor...'), 0);
      window.imu.updateInfo.onProgress((p)=>{
        if (!p) return;
        if (p.phase === 'download') win.set(t('İndiriliyor...') + (p.total ? ' ' + Math.round(p.done / p.total * 100) + '%' : ''), p.total ? p.done / p.total : 0);
        else if (p.phase === 'install') win.set(t('Kuruluyor...'), 1);
      });
      const r = await window.imu.updateInfo.install().catch(e=>({ ok:false, error:(e&&e.message)||'Güncelleme başarısız.' }));
      if (r && r.ok){ win.set(r.installed ? t('SteamEdge kapanıyor, Setup açılacak.') : t('Uygulama yeniden başlatılıyor.'), 1); return; }
      win.close();
      const again = await edgeConfirm({
        tag: 'Güncelleme', danger: true,
        title: 'Güncelleme tamamlanamadı',
        body: t((r && r.error) || 'Güncelleme başarısız.') + '\n' + t('Kurulu sürümün çalışmaya devam eder.'),
        confirmText: 'Yayın Sayfasını Aç',
        cancelText: 'Kapat',
      });
      if (again === true) window.imu.openExternal(d.url);
    }

    async function updateWindow(d){
      if (updateWindowOpen) return;
      updateWindowOpen = true;
      try {
        const date = d.releaseTs ? new Date(d.releaseTs).toLocaleDateString(localCode()) : '';
        const choice = await edgeConfirm({
          tag: 'Güncelleme',
          title: t('Yeni sürüm yayımlandı:') + ' v' + d.lastOne,
          body: t('Kurulu sürüm') + ' v' + d.installed + (date ? ('  ·  ' + t('yayımlanma tarihi') + ' ' + date) : '')
                + '\n' + t('Değişiklikleri yayın sayfasında okuyabilirsin.'),
          warn: 'Güncelle düğmesi yeni sürümü GitHub\'dan indirir, doğrular ve kurar. Ayarların ve hesapların korunur; uygulama kısa süre kapanıp yeniden açılır.',
          confirmText: 'Şimdi Güncelle',
          subText: 'Yayın Sayfasını Aç',
          cancelText: 'Şimdi Değil',
        });
        if (choice === true) await runUpdate(d);
        else if (choice === 'alt') window.imu.openExternal(d.url);
      } finally {
        updateWindowOpen = false;
      }
    }

    function updateStatus(d, manuallyChecked){
      latestUpdateStatus = d || null;
      const badge = document.getElementById('tbUpdateBadge');
      const hasNew = !!(d && d.ok && d.isUpToDate === false);
      // The dot above the button: lit when there is a new version, off when current.
      if (badge) badge.style.display = hasNew ? 'block' : 'none';
      const btn = document.getElementById('tbUpdate');
      if (btn) btn.title = hasNew ? (t('Yeni sürüm var:') + ' v' + d.lastOne) : 'Güncellemeleri denetle';
      if (hasNew){ updateWindow(d); return; }
      // Current or could not check: only answer if the user asked by hand.
      if (!manuallyChecked || !d || typeof toast !== 'function') return;
      if (d.ok) toast('Güncelleme').done(tf('En güncel sürümü kullanıyorsun (v#).', d.installed));
      else toast('Güncelleme').fail(t(d.failure || 'Sürüm bilgisi alınamadı.') + ' ' + t('Kurulu sürümün çalışmaya devam eder.'));
    }

    if (window.imu && window.imu.updateInfo){
      // The result of the single check at startup comes from here.
      window.imu.updateInfo.onStatus((d) => updateStatus(d, false));
      const ub = document.getElementById('tbUpdate');
      if (ub) ub.onclick = async ()=>{
        ub.disabled = true;
        const d = await window.imu.updateInfo.checkIt().catch(e=>({ ok:false, failure:(e&&e.message)||'Denetim başarısız.' }));
        ub.disabled = false;
        updateStatus(d, true);
      };
    }
