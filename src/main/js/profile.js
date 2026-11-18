    // The Steam profile of the account on screen (avatar, name, level), its lifetime statistics and the identity formats in the account menu.
    // Loaded after common.js (main.html); like every page script it shares the global scope.

    // ---- Steam profile (avatar/name/level) ----
    // The profile can only be fetched AFTER the Steam session is established and opening a session takes
    // seconds. During that time a dash stood in the top right and in the account card in Settings.
    // Now the last known profile is kept in the account's own file (main.js > engine:profile)
    // and comes instantly with the settings: the screen opens full on the first frame, when the connection is made
    // fresh data is written over it. The custom address comes last, with a separate request.
    let imuProfile = null;
    let imuProfileFresh = false;      // did it come from the cache or from Steam

    function cachedProfile(){
      const p = (typeof appSettings === 'object' && appSettings && appSettings.profileInfo) || null;
      if (!p || (!p.persona && !p.avatar)) return false;
      imuProfile = { ...p };
      applyProfile();
      return true;
    }

    async function loadProfile(){
      // If there is something at hand show it right away; if it is not fresh keep refreshing in the background.
      if (imuProfile) applyProfile(); else cachedProfile();
      if (!imuProfileFresh){
        const r = await E.profile().catch(()=>null);
        if (r && r.ok && r.profile){
          imuProfile = { ...(imuProfile || {}), ...r.profile };
          imuProfileFresh = true;
          applyProfile();
        }
      }
      // The custom address is read from the profile page; a separate request so it does not hold up the name and avatar.
      if (imuProfile && !imuProfile.vanity){
        E.vanity().then(v=>{
          if (v && v.ok && v.vanity){
            imuProfile.vanity = v.vanity;
            if (typeof paintIds === 'function') paintIds();
          }
        }).catch(()=>{});
      }
    }
    function applyProfile(){
      if (!imuProfile) return;
      const nm = imuProfile.persona || '-';
      const av = imuProfile.avatar;
      const sName = document.getElementById('sideName'); if (sName) sName.textContent = nm;
      const sLvl = document.getElementById('sideLevel'); if (sLvl) sLvl.textContent = imuProfile.level!=null ? ('Seviye '+imuProfile.level) : 'Çevrimiçi';
      // If there is an avatar an image, otherwise an initial badge (e.g. "VE")
      const sAv = document.getElementById('sideAvatar');
      if (sAv) {
        const initials = (nm.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '-').toUpperCase();
        sAv.innerHTML = av ? '<img src="' + esc(av) + '" onerror="this.parentNode.textContent=\'' + initials + '\'">' : initials;
      }
      const setP = document.getElementById('setPersona'); if (setP) setP.textContent = nm;
      const setLevelRow = document.getElementById('setLevel'); if (setLevelRow) setLevelRow.textContent = imuProfile.level!=null ? imuProfile.level : '-';
      // The identity rows also show the custom address that comes from the profile; so it refreshes when the account changes.
      if (typeof paintIds === 'function') paintIds();
    }

    // ---- lifetime statistics (main.js stats.json) ----
    let lifeStats = null;
    function fmtHrs(ms){ const h=ms/3600000; return h>=1 ? (h.toLocaleString(localCode(), { maximumFractionDigits:1 })+' '+t('saat')) : (Math.round(ms/60000)+' '+t('dk')); }
    // if data is given no IPC is made (the main process's 'stats:degisti' event already carries the current data).
    // All of them are the real measurement of the account on screen counted in the main process. "Best day", "Average sale" and "Uninterrupted run" used to never be filled, they always showed a dash.
    async function renderLifeStats(payloadData){
      lifeStats = payloadData || await window.imu.stats.get().catch(()=>null);
      if (!lifeStats) return;
      const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
      set('lifeRuntime', fmtHrs(lifeStats.totalRuntimeMs||0));
      set('lifeCards', localNumber(lifeStats.cardsDropped||0));
      set('lifeSold', localNumber(lifeStats.cardsSold||0));
      set('lifeBoost', fmtHrs(lifeStats.boostRuntimeMs||0));
      const days = Object.entries(lifeStats.dailyCards || {}).filter(x => x[1] > 0);
      if (days.length){
        const [day, count] = days.reduce((m, x) => (x[1] > m[1] ? x : m));
        const [y, a, g] = day.split('-').map(Number);
        set('lifeBestDay', new Date(y, a - 1, g).toLocaleDateString(localCode()) + ' · ' + tf('# kart', count));
      } else set('lifeBestDay', '-');
      set('lifeAvgSale', (lifeStats.pricedForSale > 0 && typeof fmtMoney === 'function')
        ? fmtMoney(lifeStats.saleAmount / lifeStats.pricedForSale / 100) : '-');
      set('lifeStreak', lifeStats.longestRunMs >= 60000 ? fmtHrs(lifeStats.longestRunMs) : '-');
      set('lifeSince', lifeStats.since ? new Date(lifeStats.since).toLocaleDateString(localCode()) : '-');
      const h = document.getElementById('lifeAccount');
      if (h) h.textContent = (typeof appSettings === 'object' && appSettings && appSettings.persona) ? appSettings.persona : '';
    }
    // Statistics are counted in the main process; they come here as they change (only for the account on screen).
    if (window.imu.stats.onChanged) window.imu.stats.onChanged((d)=>renderLifeStats(d));

    // ---- ACCOUNT IDENTITY (the account menu top right) ----
    // All seven of Steam's formats derive from a SINGLE number: SteamID64. Nothing is asked from the network.
    //   account number = SteamID64 - 76561197960265728   (universe 1, the "individual" account base)
    //   classic        = STEAM_1:<last bit of the number>:<half of the number>
    //   SteamID3       = [U:1:<account number>]
    // BigInt is used because whole numbers exceed 53 bits; with Number the last digits get corrupted.
    const STEAM64_BASE = 76561197960265728n;
    let identities = null;

    function idFormats(steamID64, vanity){
      const rawText = String(steamID64 || '').trim();
      if (!/^\d{17}$/.test(rawText)) return null;
      let sid;
      try { sid = BigInt(rawText); } catch (_) { return null; }
      if (sid < STEAM64_BASE) return null;
      const accountRef = sid - STEAM64_BASE;
      return {
        idSteam64: rawText,
        idClassic : 'STEAM_1:' + (accountRef % 2n) + ':' + (accountRef / 2n),
        idSteam3 : '[U:1:' + accountRef + ']',
        idAccount  : String(accountRef),
        idHex    : '0x' + sid.toString(16).toUpperCase().padStart(16, '0'),
        idProfile : 'https://steamcommunity.com/profiles/' + rawText,
        idCustom   : vanity ? ('https://steamcommunity.com/id/' + vanity) : null,
      };
    }

    function paintIds(){
      const sid = (imuProfile && imuProfile.steamID)
        || (typeof appSettings === 'object' && appSettings && appSettings.steamID) || null;
      identities = idFormats(sid, imuProfile && imuProfile.vanity);
      ['idSteam64','idClassic','idSteam3','idAccount','idHex','idProfile','idCustom'].forEach(id=>{
        const e = document.getElementById(id);
        if (!e) return;
        const v = identities ? identities[id] : null;
        // The menu is 268 px: the full address did not fit the row and was cut with an ellipsis. In the addresses
        // the "https://steamcommunity.com" part is the same on every row anyway, so only the
        // path is shown. The value that is COPIED and OPENED stays the full address.
        // The address is compared by PARSING, not by cutting the beginning: not every string that STARTS with "steamcommunity.com"
        // is Steam (like steamcommunity.com.someothersite.tr).
        // Here the value is already an address we produced ourselves, but this is the right way to compare and
        // the code scan was rightly flagging it.
        let shown = v;
        if (v) {
          try {
            const u = new URL(v);
            if (u.origin === 'https://steamcommunity.com') shown = u.pathname + u.search + u.hash;
          } catch (_) { /* not an address: shown as it is */ }
        }
        // An empty dash looks "broken"; a row with no value should write the reason.
        e.textContent = shown || (identities ? 'tanımlı değil' : 'hesap bağlı değil');
        e.classList.toggle('empty', !v);
        if (v) e.parentNode.title = v;      // the full value shows when hovered
      });
      document.querySelectorAll('#identityBox [data-copy]').forEach(b=>{
        const v = identities && identities[b.getAttribute('data-copy')];
        b.disabled = !v;
        b.style.opacity = v ? '1' : '0.45';
      });
      const everything = document.getElementById('idCopyAll');
      const profileData = document.getElementById('idOpenProfile');
      if (everything) everything.disabled = !identities;
      if (profileData) profileData.disabled = !identities;
    }

    function copyId(text, labelText){
      navigator.clipboard.writeText(text).then(()=>{
        if (typeof toast === 'function') toast('Kopyalandı').done(t(labelText || 'Değer') + ' ' + t('panoya kopyalandı.'));
      }).catch(()=>{});
    }

    document.querySelectorAll('#identityBox [data-copy]').forEach(b=>{
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const v = identities && identities[b.getAttribute('data-copy')];
        if (v) copyId(v, 'Kimlik');
      });
    });
    const idCopyAllBtn = document.getElementById('idCopyAll');
    if (idCopyAllBtn) idCopyAllBtn.onclick = (e)=>{
      e.stopPropagation();
      if (!identities) return;
      copyId([
        'SteamID64'.padEnd(15) + ': ' + identities.idSteam64,
        'SteamID'.padEnd(15) + ': ' + identities.idClassic,
        'SteamID3'.padEnd(15) + ': ' + identities.idSteam3,
        t('Hesap numarası').padEnd(15) + ': ' + identities.idAccount,
        'Hex'.padEnd(15) + ': ' + identities.idHex,
        t('Profil adresi').padEnd(15) + ': ' + identities.idProfile,
        t('Özel adres').padEnd(15) + ': ' + (identities.idCustom || t('tanımlı değil')),
      ].join('\n'), 'Tüm kimlik biçimleri');
    };
    const idOpenProfileBtn = document.getElementById('idOpenProfile');
    if (idOpenProfileBtn) idOpenProfileBtn.onclick = (e)=>{
      e.stopPropagation();
      if (identities) window.imu.openExternal(identities.idCustom || identities.idProfile);
    };
