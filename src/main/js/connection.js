    // The strips under the top bar: the Steam connection state and a game of the account open on another device.
    // Loaded after common.js (main.html); like every page script it shares the global scope.

    // G3: Steam connection state strip. So that a drop is not silent a persistent strip is shown
    // below the top bar; it disappears on its own when reconnected.
    // The text is built here in the interface language, not from the main process; the main process only sends the fields
    // (condition, cause, attemptCount, waitMs, limitValue). The strip used to show a fixed Turkish text
    // such as "reconnecting (attempt 2, in 10 s)" in every language.
    function connectionText(d){
      if (d.condition === 'dropped') return t('Steam bağlantısı koptu.') + (d.cause ? (' (' + t(d.cause) + ')') : '');
      if (d.condition === 'connecting'){
        // an attempt under way, or the wait until the next one counted down from its time (a fixed "in 300 s" looked the same for hours)
        if (d.trying) return tf('Steam bağlantısı koptu. Bağlanılıyor (deneme #)...', d.attemptCount || 1);
        const seconds = Math.max(1, Math.round(((d.nextAt ? d.nextAt - Date.now() : d.waitMs) || 0) / 1000));
        // past the quick attempts of a limit the loop goes on every five minutes: "attempt 4 / 3" would read as a mistake
        return d.limitValue && (d.attemptCount || 1) <= d.limitValue
          ? tf('Steam bağlantısı koptu. # sn sonra yeniden denenecek (deneme # / #).', seconds, d.attemptCount || 1, d.limitValue)
          : tf('Steam bağlantısı koptu. # sn sonra yeniden denenecek (deneme #).', seconds, d.attemptCount || 1);
      }
      if (d.condition === 'abandoned'){
        if (d.permanent) return +d.eresult === 34
          ? t('Bu hesap başka bir oturumda açıldı; SteamEdge yeniden bağlanmıyor.')
          : t('Steam oturumu artık geçersiz; hesabı yeniden eklemen gerekiyor.');
        return d.attemptCount
          ? tf('Steam bağlantısı # denemede kurulamadı; yeniden bağlanma durdu.', d.attemptCount)
          : t('Steam bağlantısı koptu; yeniden bağlanma kapalı.');
      }
      if (d.condition === 'connected' && d.reconnected) return tf('Steam bağlantısı geri geldi, # oyun yeniden açıldı.', d.gameEntries || 0);
      return '';
    }
    function connectionStrip(d){
      stripLast = d;
      const status = d.condition;
      const message = connectionText(d);
      let el = document.getElementById('connectionStrip');
      if (status === 'connected'){
        if (el) el.remove();
        return;
      }
      if (!el){
        el = document.createElement('div');
        el.id = 'connectionStrip';
        el.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 20px;'
          + 'font-size:12px;font-weight:600;border-bottom:1px solid #B37E24;background:#1A1408;color:#B37E24';
        // The strip goes above the BODY ROW. It used to be added directly as a sibling of <main>;
        // since that row is the same flex row as the side panel the strip fell next to the sidebar instead of
        // below the top bar.
        const mainEl = document.querySelector('main');
        const rowEl = mainEl && mainEl.parentNode;                   // aside + main row
        const goal = (rowEl && rowEl.parentNode) ? rowEl : (mainEl || document.body);
        goal.parentNode.insertBefore(el, goal);
      }
      const colorVal = (status === 'dropped' || status === 'abandoned') ? '#B32453' : '#B37E24';
      el.style.borderBottomColor = colorVal; el.style.color = colorVal;
      el.innerHTML = '<span' + (status === 'abandoned' ? '' : ' class="e-pulse"') + ' style="width:7px;height:7px;border-radius:12px;background:'+colorVal+';flex-shrink:0"></span><span>'+esc(message||'')+'</span>'
        + (status === 'abandoned'
            ? '<button data-reconnect style="margin-left:auto;height:28px;padding:0 12px;border-radius:999px;background:transparent;border:1px solid '+colorVal+';color:'+colorVal
              + ';font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;flex-shrink:0">'+esc(t('Yeniden Bağlan'))+'</button>'
            : '');
      const b = el.querySelector('[data-reconnect]');
      if (b) b.onclick = async ()=>{
        b.disabled = true;
        const r = await window.imu.engine.reconnect().catch(()=>null);
        if (!r || !r.ok){ b.disabled = false; toast('Steam Bağlantısı').fail(t((r && r.error) || 'Yeniden bağlanılamadı.')); }
      };
    }
    // The strip says what the connection of the account on screen IS, not what the last event said: it hung on "reconnecting" after the connection had come back
    // when the event that said so was missed (it belonged to the account that was not on screen at that moment, or the account was changed in between).
    // The state is asked for from the main process whenever any account reports something, after a switch, and every 15 seconds while the strip shows.
    let stripTimer = null, stripCountdown = null, stripLast = null;
    async function reconcileConnection(){
      const d = await window.imu.engine.connectionStatus().catch(()=>null);
      playingStrip(!!(d && d.playingBlocked));
      if (!d || d.condition === 'none') { connectionStrip({ condition: 'connected' }); return; }
      connectionStrip(d);
    }
    // A game of the account on screen is open on another device (the Steam client): Steam lets one session play, so the jobs' games wait for it to end.
    // Up to 1.8.1 the app logged on again every few seconds and opened its games over that one.
    function playingStrip(blocked){
      let el = document.getElementById('playingStrip');
      if (!blocked){ if (el) el.remove(); return; }
      if (el) return;
      el = document.createElement('div');
      el.id = 'playingStrip';
      el.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:10px;padding:9px 20px;font-size:12px;font-weight:600;border-bottom:1px solid #B37E24;background:#1A1408;color:#B37E24';
      el.innerHTML = '<span style="width:7px;height:7px;border-radius:12px;background:#B37E24;flex-shrink:0"></span><span>'
        + esc(t('Bu hesapta başka bir cihazda oyun açık. SteamEdge kendi oyunlarını o oyun kapanınca yeniden açacak.')) + '</span>';
      const mainEl = document.querySelector('main');
      const rowEl = mainEl && mainEl.parentNode;
      const goal = (rowEl && rowEl.parentNode) ? rowEl : (mainEl || document.body);
      goal.parentNode.insertBefore(el, goal);
    }
    // once when the page loads: a reload (a language change) must not lose a strip whose event came before it
    if (window.imu.engine && window.imu.engine.connectionStatus) reconcileConnection().then(armStripTimer);
    if (window.imu.engine && window.imu.engine.onPlaying){
      window.imu.engine.onPlaying((d)=>{
        if (!d) return;
        if (!d.activeIds){ reconcileConnection(); return; }
        playingStrip(d.blocked);
        if (typeof pushFeed === 'function') pushFeed('card', 'Steam Bağlantısı', t(d.blocked
          ? 'Hesapta başka bir cihazda oyun açıldı; SteamEdge oyunlarını beklemeye aldı.'
          : 'Diğer cihazdaki oyun kapandı; SteamEdge oyunlarını yeniden açtı.'), d.blocked ? 'Uyarı' : 'Başarılı');
      });
    }
    function armStripTimer(){
      const shown = !!document.getElementById('connectionStrip');
      if (shown && !stripTimer) stripTimer = setInterval(reconcileConnection, 15000);
      if (!shown && stripTimer){ clearInterval(stripTimer); stripTimer = null; }
      // the countdown to the next attempt goes down every second
      if (shown && !stripCountdown) stripCountdown = setInterval(()=>{
        const el = document.getElementById('connectionStrip');
        if (!el || !stripLast || stripLast.condition !== 'connecting' || stripLast.trying || !stripLast.nextAt) return;
        const span = el.querySelector('span:not(.e-pulse)');
        if (span) span.textContent = connectionText(stripLast);
      }, 1000);
      if (!shown && stripCountdown){ clearInterval(stripCountdown); stripCountdown = null; }
    }
    if (window.imu.engine && window.imu.engine.onStatus){
      window.imu.engine.onStatus((d)=>{
        if (!d) return;
        if (!d.activeIds){ reconcileConnection().then(armStripTimer); return; }   // another account: the one on screen may have changed state too
        connectionStrip(d);
        armStripTimer();
        if (d.condition === 'dropped'){
          if (typeof setSysStatus === 'function') setSysStatus(false);
          if (typeof pushFeed === 'function') pushFeed('error', 'Steam Bağlantısı', connectionText(d), 'Hata');
          // If reconnecting is off "abandoned" comes right after, and that gives the notification.
          if (d.limitValue !== 0 && typeof notify === 'function') notify('error', 'Steam Bağlantısı Koptu', 'Yeniden bağlanılıyor...');
        } else if (d.condition === 'connected' && d.reconnected){
          if (typeof pushFeed === 'function') pushFeed('card', 'Steam Bağlantısı', connectionText(d), 'Başarılı');
        }
      });
    }
