    // ================= KEYS =================
    // The queue itself lives in the main process (main.js > PRODUCT KEYS) and keeps running while another page is
    // open; this page adds keys, shows the queue and the results, and listens to 'keys:changed'.
    let keyState = { queue: [], results: [], resultCount: 0, usedCount: 0, running: false, pausedUntil: 0, error: null };
    let keyTicker = null;

    const KY_STATUS = {
      used:      { label: 'Etkinleştirildi',        color: '#5FB324' },
      owned:     { label: 'Zaten sahip',            color: '#B37E24' },
      region:    { label: 'Bölge kilitli',          color: '#B32453' },
      invalid:   { label: 'Geçersiz anahtar',       color: '#B32453' },
      duplicate: { label: 'Daha önce kullanılmış',  color: '#B37E24' },
      needsBase: { label: 'Ana oyun gerekli',       color: '#B37E24' },
      other:     { label: 'Reddedildi',             color: '#B32453' },
    };
    const kyEl = (id) => document.getElementById(id);

    function kyIsVisible(){ return designed.keys && !designed.keys.classList.contains('hidden'); }
    function kyWait(ms){
      const sn = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(sn / 3600), m = Math.floor((sn % 3600) / 60), s = sn % 60;
      return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
    }

    async function loadKeys(){
      const st = await window.imu.keys.state().catch(()=>null);
      if (st) keyState = st;
      renderKeys();
    }

    function renderKeys(){
      if (!kyEl('kyQueue')) return;
      kyEl('kyPending').textContent = keyState.queue.length;
      kyEl('kyUsed').textContent = keyState.usedCount || 0;
      kyEl('kyRefused').textContent = Math.max(0, (keyState.resultCount || 0) - (keyState.usedCount || 0));

      const waitingMs = keyState.pausedUntil - Date.now();
      const paused = keyState.running && waitingMs > 0;
      const pill = kyEl('kyRunPill');
      pill.textContent = t(keyState.running ? (paused ? 'Bekliyor' : 'Çalışıyor') : 'Beklemede');
      pill.style.color = keyState.running ? (paused ? '#B37E24' : '#5FB324') : '#8B8F9E';
      pill.style.borderColor = pill.style.color;
      kyEl('kyStart').style.display = keyState.running ? 'none' : '';
      kyEl('kyStop').style.display = keyState.running ? '' : 'none';
      kyEl('kyStart').disabled = !keyState.queue.length;
      kyEl('kyStart').style.opacity = keyState.queue.length ? '1' : '.4';

      const banner = kyEl('kyBanner');
      if (paused){
        banner.style.display = 'flex';
        banner.innerHTML = '<span>' + esc(tf('Steam hız sınırına takıldı; # sonra devam edilecek.', kyWait(waitingMs))) + '</span>'
          + '<button id="kyTryNow" class="h-brand" style="height:26px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid #B37E24;color:#B37E24;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;flex-shrink:0">' + esc(t('Şimdi Dene')) + '</button>';
        kyEl('kyTryNow').onclick = () => window.imu.keys.start(true);
      } else if (keyState.error){
        banner.style.display = 'flex';
        banner.innerHTML = '<span>' + esc(t(keyState.error)) + '</span>';
      } else {
        banner.style.display = 'none';
      }

      kyEl('kyQueue').innerHTML = keyState.queue.length ? keyState.queue.map((q, i) =>
        '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #101621">'
        + '<span style="width:26px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:10px;color:#656D80">#' + (i + 1) + '</span>'
        + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
          + '<span style="font-family:Geist Mono,monospace;font-size:12px;font-weight:600;color:#DCE2FA">' + esc(q.key) + '</span>'
          + (q.name ? '<span style="font-size:11px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(q.name) + '</span>' : '')
        + '</div></div>').join('')
        : '<div style="padding:28px 0;text-align:center;font-size:12px;color:#656D80">' + esc(t('Kuyruk boş.')) + '</div>';

      kyEl('kyResults').innerHTML = keyState.results.length ? keyState.results.map((r) => {
        const st = KY_STATUS[r.status] || KY_STATUS.other;
        const label = r.status === 'other' ? tf('Reddedildi (kod #)', r.detail) : t(st.label);
        const games = (r.packages && r.packages.length) ? r.packages.join(', ') : (r.name || '');
        return '<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #101621">'
          + '<span style="width:7px;height:7px;border-radius:12px;background:' + st.color + ';flex-shrink:0"></span>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
            + '<span style="font-size:12.5px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(games || r.key) + '</span>'
            + '<span style="font-family:Geist Mono,monospace;font-size:10.5px;color:#656D80">' + esc(r.key) + '</span>'
          + '</div>'
          + '<span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:' + st.color + ';border:1px solid ' + st.color + ';border-radius:12px;padding:2px 8px;flex-shrink:0">' + esc(label) + '</span>'
          + '<span style="width:84px;flex-shrink:0;text-align:right;font-family:Geist Mono,monospace;font-size:10.5px;color:#8B8F9E">' + new Date(r.ts).toLocaleTimeString(localCode()) + '</span>'
          + '</div>';
      }).join('')
        : '<div style="padding:48px 0;text-align:center;font-size:12px;color:#656D80">' + esc(t('Henüz sonuç yok.')) + '</div>';

      // the countdown ticks once a second while the page is open and the queue waits for Steam
      if (paused && !keyTicker) keyTicker = setInterval(() => { if (kyIsVisible()) renderKeys(); }, 1000);
      if (!paused && keyTicker){ clearInterval(keyTicker); keyTicker = null; }
    }

    window.imu.keys.onChanged((st) => {
      keyState = st;
      if (kyIsVisible()) renderKeys();
    });

    kyEl('kyAdd').onclick = async () => {
      const text = kyEl('kyInput').value;
      if (!text.trim()) return;
      const r = await window.imu.keys.add(text).catch(()=>null);
      if (!r || !r.ok){ toast('Anahtarlar').fail((r && r.error) || 'Anahtarlar eklenemedi.'); return; }
      kyEl('kyInput').value = '';
      const bits = [];
      if (r.added) bits.push(tf('# anahtar kuyruğa eklendi.', r.added));
      if (r.duplicates) bits.push(tf('# tanesi zaten kayıtlıydı.', r.duplicates));
      if (r.invalid) bits.push(tf('# satırda anahtar bulunamadı.', r.invalid));
      kyEl('kyAddNote').textContent = bits.join(' ');
      await loadKeys();
    };
    kyEl('kyStart').onclick = async () => { await window.imu.keys.start(false); await loadKeys(); };
    kyEl('kyStop').onclick = async () => { await window.imu.keys.stop(); await loadKeys(); };
    kyEl('kyClearQueue').onclick = async () => {
      if (!keyState.queue.length) return;
      const ok = await edgeConfirm({ tag: 'Anahtarlar', danger: true, title: 'Kuyruk temizlensin mi?',
        body: 'Henüz denenmemiş anahtarlar listeden kaldırılır.', confirmText: 'Temizle' });
      if (!ok) return;
      await window.imu.keys.clear('queue');
      await loadKeys();
    };
    kyEl('kyClearResults').onclick = async () => { await window.imu.keys.clear('results'); await loadKeys(); };
