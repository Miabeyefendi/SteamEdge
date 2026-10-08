    // ================= GERÇEKÇİ MOD (REALISTIC MODE) =================
    // The page was taken from the template as is; the job here is to connect this design to real data.
    // Games are put in a queue, over the chosen time the achievements are unlocked FROM COMMON TO RARE.
    // The engine side is in main.js > the "GERCEKCI MOD" section.
    //
    // Calculations (the "Oyun Verisi · HLTB" box in the right panel):
    //   Tc  : the game's 100% time. It can be entered by hand; if not it is estimated from the current time x type multiplier (CR).
    //         This is an ESTIMATE, no external service is asked - we do not make up
    //         HLTB data, we use the number the user entered or the one that comes out of
    //         their own library.
    //   A(t): the number of unlocked achievements expected up to now = total x (t / Tc), corrected
    //         by difficulty. If the real unlocked number is below this it means "behind".
    //   Rate: A(t) / t (achievements per hour).
    let grGames = [], grLoaded = false;
    let grQueue = [];               // [{appid, name, playtimeMin, hasStats}] - selected games
    let grPlan = null;              // plan preview of the active game
    let grDurum = { calisiyor: false };
    let grTimerUI = null;
    let grAcilanlar = [];           // {name, rarityPct, ts} - those unlocked in this session
    let grPresets = [];
    // Games found to have no achievements (appid). The engine learns once and writes to disk;
    // they never show up in this page's list again. This page only unlocks achievements.
    let grBasarimsiz = new Set();
    // If the user touched the duration field by hand the automatic assignment does not kick in.
    let grSureTouched = false;
    let grPlanIstek = 0;            // request counter to prevent race conditions

    const GRC = { brand:'#5624B3', ok:'#5FB324', warn:'#B37E24', bad:'#B32453',
                  title:'#DCE2FA', muted:'#8B8F9E', off:'#656D80', bd:'#2B3345', sub:'#C2AAEE',
                  teal:'#24AEB3' };

    const grEl = (id) => document.getElementById(id);
    const grSet = (id, t) => { const e = grEl(id); if (e) e.textContent = t; };

    // ---- reading/writing settings ----
    function grVal(anahtar, varsayilan){
      const v = (typeof appSettings === 'object' && appSettings) ? appSettings[anahtar] : undefined;
      return v === undefined ? varsayilan : v;
    }
    async function grKaydet(patch){
      if (!window.imu.settings) return;
      const s = await window.imu.settings.set(patch).catch(()=>null);
      if (s) appSettings = s;
    }

    // ---- duration ----
    function grSureMs(){
      const h = Math.max(0, Math.min(999, +grEl('grRH').value || 0));
      const m = Math.max(0, Math.min(59, +grEl('grRM').value || 0));
      const s = Math.max(0, Math.min(59, +grEl('grRS').value || 0));
      return Math.max(60000, ((h * 3600) + (m * 60) + s) * 1000);
    }
    function grSureYaz(ms){
      const t = Math.max(60, Math.round(ms / 1000));
      const iki = (n) => String(n).padStart(2, '0');
      grEl('grRH').value = iki(Math.floor(t / 3600));
      grEl('grRM').value = iki(Math.floor((t % 3600) / 60));
      grEl('grRS').value = iki(t % 60);
    }
    // Duration labels with the units of the interface language (sureBirim, i18n.js)
    function grSureEtiket(ms){
      const sn = Math.round(ms / 1000);
      if (sn < 60) return sureBirim(sn, 'sn');
      const dk = Math.round(sn / 60);
      if (dk < 60) return sureBirim(dk, 'dk');
      const sa = Math.floor(dk / 60), kalanDk = dk % 60;
      return kalanDk ? (sureBirim(sa, 'sa') + ' ' + sureBirim(kalanDk, 'dk')) : sureBirim(sa, 'sa');
    }
    function grAralikEtiket(ms){
      if (!ms) return '-';
      const sn = Math.round(ms / 1000);
      if (sn < 90) return sureBirim(sn, 'sn');
      const dk = Math.round(sn / 60);
      if (dk < 90) return sureBirim(dk, 'dk');
      return sureBirim(yerelOndalik(dk / 60, 1), 'sa');
    }
    // ms since the start of the session -> "+1 sa 12 dk" format (the time in the Açılma Sırası table)
    function grZamanEtiket(ms){
      const sn = Math.round((ms || 0) / 1000);
      const sa = Math.floor(sn / 3600), dk = Math.floor((sn % 3600) / 60);
      if (sa) return '+' + sureBirim(sa, 'sa') + ' ' + sureBirim(String(dk).padStart(2, '0'), 'dk');
      const s = sn % 60;
      return '+' + sureBirim(dk, 'dk') + ' ' + sureBirim(String(s).padStart(2, '0'), 'sn');
    }
    const grSaatYaz = (dk) => sureBirim(yerelOndalik((dk || 0) / 60, 1), 'sa');

    // ---- rarity colour ----
    function grPctRenk(pct){
      if (!Number.isFinite(pct)) return GRC.off;
      if (pct < 5) return GRC.bad;
      if (pct < 10) return GRC.sub;
      if (pct < 25) return GRC.teal;
      return GRC.muted;
    }
    function grNadirEtiket(pct){
      if (!Number.isFinite(pct)) return 'Bilinmiyor';
      if (pct < 5) return 'Ultra nadir';
      if (pct < 10) return 'Nadir';
      if (pct < 25) return 'Az bulunur';
      if (pct < 50) return 'Yaygın';
      return 'Çok yaygın';
    }

    // ---- loading ----
    async function loadGercekci(){
      grToggleBoya();
      grSelectBoya();
      if (!grLoaded){
        grSureYaz((+grVal('grDurationSec', 7200)) * 1000);
        grEl('grTarget').value = String(+grVal('grTarget', 0) || 0);
      }
      grSeviyeBoya();
      grPresets = (grVal('grPresets', []) || []).slice();
      grPresetBoya();
      if (grLoaded){ grKutuphaneBoya(); grHesapBoya(); return; }
      grEl('grSearch').placeholder = t('Steam\'e bağlanılıyor...');
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ grEl('grSearch').placeholder = t('Bağlanılamadı:') + ' ' + t(con.error || ''); return; }
      const res = await E.ownedGames().catch(e=>({ ok:false, error:(e&&e.message)||'Kütüphane okunamadı.' }));
      if (!res.ok){ grEl('grSearch').placeholder = t('Kütüphane okunamadı.'); return; }
      const bs = await window.imu.gercekci.basarimsizlar().catch(()=>null);
      if (bs && bs.ok) grBasarimsiz = new Set((bs.appids||[]).map(Number));
      grGames = (res.games || []).map(g=>({
        appid: g.appid, name: g.name, playtimeMin: g.playtimeForever || 0, hasStats: !!g.hasStats,
      }));
      grLoaded = true;
      grEl('grSearch').placeholder = 'Oyun ara...';
      // Saved queue: comes from the account file, game names are completed from the library.
      const kayitli = grVal('grQueue', []) || [];
      grQueue = kayitli.map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grKutuphaneBoya();
      if (grQueue.length) grPlanCek();
      else grHesapBoya();
    }

    // ---- library search ----
    function grAranabilir(){
      // Those in the ledger are ALWAYS filtered out: it was learned by trying that they have no achievements.
      // The "Başarımsız oyunları göster" switch only loosens Steam's unreliable hasStats
      // flag, it does not bring back what was proven.
      const temiz = grGames.filter(g=>!grBasarimsiz.has(g.appid));
      return grVal('grShowNoAch', false) ? temiz : temiz.filter(g=>g.hasStats);
    }
    function grAramaBoya(){
      const q = grEl('grSearch').value.trim().toLowerCase();
      const box = grEl('grResultsBox');
      if (!q){ box.style.display = 'none'; return; }
      const secili = new Set(grQueue.map(g=>g.appid));
      const bulunan = grAranabilir().filter(g=>g.name.toLowerCase().includes(q)).slice(0, 40);
      box.style.display = 'flex';
      grEl('grNoResults').style.display = bulunan.length ? 'none' : 'block';
      grEl('grResults').innerHTML = bulunan.map(g=>{
        const icinde = secili.has(g.appid);
        return '<div class="h-s3" data-gradd="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:12px;cursor:pointer">'
          + '<div style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:#DCE2FA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + esc(grSaatYaz(g.playtimeMin) + ' · ' + t(g.hasStats ? 'başarım var' : 'başarım yok'))+'</span>'
          + '</div>'
          + '<button class="h-brand" style="width:24px;height:24px;flex-shrink:0;border-radius:12px;border:1px solid '
          + (icinde?GRC.brand:'#2B3345')+';background:'+(icinde?'#151C28':'#090C12')+';color:'+(icinde?GRC.sub:'#8B8F9E')
          + ';font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">'
          + (icinde?'✓':'+')+'</button>'
          + '</div>';
      }).join('');
    }
    grEl('grSearch').addEventListener('input', grAramaBoya);
    grEl('grSearch').addEventListener('focus', grAramaBoya);
    grEl('grSearch').addEventListener('keydown', (e)=>{
      if (e.key === 'Escape'){ grEl('grSearch').value = ''; grEl('grResultsBox').style.display = 'none'; }
      else if (e.key === 'Enter'){ const f = grEl('grResults').querySelector('[data-gradd]'); if (f) f.click(); }
    });
    // Verify a game that enters the queue IMMEDIATELY. grPlanCek only reads the schema of the NEXT game;
    // a game without achievements added second in line was not noticed until its turn - that is,
    // hours later. The schema request goes over the protocol, does not spend the market
    // quota; cached for 5 minutes on the engine side.
    async function grDogrula(oyun){
      if (!oyun) return true;
      const p = await window.imu.gercekci.plan(oyun.appid, grSureMs(), grSecenekler())
        .catch(()=>null);
      if (!p || !p.basarimsiz) return true;
      grBasarimsiz.add(oyun.appid);
      grQueue = grQueue.filter(x=>x.appid!==oyun.appid);
      grKuyrukKaydet();
      grKutuphaneBoya();
      grAramaBoya();
      if (typeof toast === 'function') toast('Gerçekçi Mod').fail(tf('#: başarımı yok, listeden çıkarıldı.', oyun.name));
      return false;
    }
    grEl('grResults').addEventListener('click', async (e)=>{
      const row = e.target.closest('[data-gradd]'); if (!row) return;
      const id = +row.getAttribute('data-gradd');
      const g = grGames.find(x=>x.appid===id);
      if (!g) return;
      const cikariliyor = grQueue.some(x=>x.appid===id);
      if (cikariliyor) grQueue = grQueue.filter(x=>x.appid!==id);
      else grQueue.push(g);
      grKuyrukKaydet();
      grKutuphaneBoya();
      grAramaBoya();
      // The first in line is already verified with grPlanCek; the rest here.
      if (!cikariliyor && grQueue[0] && grQueue[0].appid !== id){
        const kaldi = await grDogrula(g);
        if (!kaldi) return;
      }
      grPlanCek();
    });
    document.addEventListener('click', (e)=>{
      if (!e.target.closest('#grSearch') && !e.target.closest('#grResultsBox')) grEl('grResultsBox').style.display = 'none';
    });

    function grKuyrukKaydet(){ grKaydet({ grQueue: grQueue.map(g=>g.appid) }); }

    // ---- selected game list ----
    function grKutuphaneBoya(){
      grSet('grLibCount', grQueue.length + ' oyun');
      const el = grEl('grLibrary');
      if (!grQueue.length){
        el.innerHTML = '<div style="padding:30px 10px;text-align:center;font-size:11px;color:#656D80;line-height:1.6">'
          + (grLoaded ? 'Yukarıdan oyun ara ve <b style="color:#8B8F9E">+</b> ile sıraya ekle.' : 'Kütüphane yükleniyor…')
          + '</div>';
        return;
      }
      const aktifId = grDurum.calisiyor ? grDurum.appid : (grQueue[0] && grQueue[0].appid);
      el.innerHTML = grQueue.map(g=>{
        const on = g.appid === aktifId;
        const achEt = g.hasStats ? 'BAŞARIM' : 'SAAT';
        const achFg = g.hasStats ? GRC.sub : GRC.warn;
        return '<div data-grrow="'+g.appid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;border:1px solid '
          + (on?GRC.brand:'#1D2432')+';background:'+(on?'#101621':'#0D1118')+';cursor:pointer;margin-bottom:5px" class="h-bd">'
          + '<div style="width:30px;height:30px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
          + gameThumb(g.appid) + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
          + '<span style="font-size:12px;font-weight:600;color:'+(on?GRC.title:'#B9C0D6')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(g.name)+'</span>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(grSaatYaz(g.playtimeMin))+'</span>'
          + '</div>'
          + '<span style="font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:'+achFg
          + ';border:1px solid '+achFg+';border-radius:12px;padding:2px 7px;flex-shrink:0">'+achEt+'</span>'
          + '<button data-grdel="'+g.appid+'" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#0D1118;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" class="h-stop">&#8722;</button>'
          + '</div>';
      }).join('');
    }
    grEl('grLibrary').addEventListener('click', (e)=>{
      const sil = e.target.closest('[data-grdel]');
      if (sil){
        if (grDurum.calisiyor){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Çalışırken sıra değiştirilemez.'); return; }
        const id = +sil.getAttribute('data-grdel');
        grQueue = grQueue.filter(x=>x.appid!==id);
        grKuyrukKaydet(); grKutuphaneBoya(); grPlanCek();
        return;
      }
      const row = e.target.closest('[data-grrow]');
      if (row && !grDurum.calisiyor){
        // Move the clicked game to the front of the order: the preview shows its plan.
        const id = +row.getAttribute('data-grrow');
        const i = grQueue.findIndex(x=>x.appid===id);
        if (i > 0){ const [g] = grQueue.splice(i,1); grQueue.unshift(g); grKuyrukKaydet(); grKutuphaneBoya(); grPlanCek(); }
      }
    });

    // ---- options ----
    // ---- 100% COMPLETION TIME (Tc) ----
    // Kept PER GAME: Cyberpunk 180 hours, a short story game 12 hours. A single
    // general value did not fit the whole library.
    function grTcHarita(){ const h = grVal('grTcOyun', {}); return (h && typeof h === 'object') ? h : {}; }
    function grTcOku(appid){ return Math.max(0, +grTcHarita()[appid] || 0); }
    async function grTcYaz(appid, saat){
      const h = Object.assign({}, grTcHarita());
      if (saat > 0) h[appid] = saat; else delete h[appid];
      await grKaydet({ grTcOyun: h });
    }

    // Tc and the difficulty multiplier. grHesapBoya, grSecenekler and the engine's backlog computation are fed from the same
    // source, otherwise three different numbers come out in three places.
    //
    // NOTE - the structural problem of the estimate: if no value is entered by hand Tc is estimated FROM THE PLAYTIME
    // (played x type multiplier). That means the more you play a game
    // the longer its estimated completion time grows and the fewer achievements the app unlocks.
    // A 180 hour game is read as "so it is 360 hours, you are only halfway".
    // That is why a value entered by hand always takes precedence and the box is now in the simple panel.
    function grTcVeZorluk(oyun){
      const zorluk = parseFloat(grVal('grDiff', '1.2')) || 1.2;
      const crRaw = grVal('grCR', '2.0');
      const cr = crRaw === 'auto' ? 0 : (parseFloat(crRaw) || 2);
      const oynanmisSa = oyun ? (oyun.playtimeMin / 60) : 0;
      const elle = (oyun ? grTcOku(oyun.appid) : 0) || (parseFloat(grVal('grTc', '')) || 0);
      const tahmin = Math.max(2, oynanmisSa * (cr || 2) || (cr || 2) * 5);
      return { tcSa: elle > 0 ? elle : tahmin, zorluk, elleGirildi: elle > 0, oynanmisSa };
    }
    function grSecenekler(){
      const { tcSa, zorluk } = grTcVeZorluk(grQueue[0]);
      const playtime = {};
      grQueue.forEach(g=>{ playtime[g.appid] = g.playtimeMin || 0; });
      return {
        hedef: grVal('grTargetAuto', true) ? 0 : Math.max(0, +grEl('grTarget').value || 0),
        model: grVal('grModel', 'linear'),
        rastgeleAralik: !!grVal('grRandomGap', true),
        ultraNadirAtla: !!grVal('grSkipUltraRare', false),
        otoSira: !!grVal('grAuto', true),
        saatiSurdur: !!grVal('grKeepHours', true),
        gecikmisHizlandir: !!grVal('grCatchUp', true),
        hizCarpani: +grVal('grHiz', 1) || 1,
        ultraCarpan: +grVal('grUltraCarpan', 3) || 3,
        telafiPayi: (+grVal('grTelafiPay', 20) || 20) / 100,
        bitmisOran: (+grVal('grBitmisSik', 50) || 50) / 100,
        tcSa, zorluk, playtime,
      };
    }

    // ---- plan preview ----
    async function grPlanCek(){
      const ilk = grQueue[0];
      if (!ilk){
        grPlan = null;
        grListeBoya(); grHesapBoya();
        return;
      }
      const istek = ++grPlanIstek;
      grSet('grNextName', t('Başarım şeması okunuyor…'));
      // It is written to textContent: esc() here showed the name as "&amp;".
      grSet('grNextMeta', ilk.name);
      const p = await window.imu.gercekci.plan(ilk.appid, grSureMs(), grSecenekler())
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (istek !== grPlanIstek) return;      // there is a newer request, drop this one
      // If reading the schema shows "this game has no achievements" the game is removed from the queue and never
      // enters the list again. We had taken it into the list by looking at the hasStats flag, Steam was wrong.
      if (p && p.basarimsiz){
        grBasarimsiz.add(ilk.appid);
        grQueue = grQueue.filter(x=>x.appid!==ilk.appid);
        grKuyrukKaydet();
        grKutuphaneBoya();
        if (typeof toast === 'function') toast('Gerçekçi Mod').fail(tf('#: başarımı yok, listeden çıkarıldı.', ilk.name));
        grPlan = null;
        grPlanCek();          // continue with the next game
        return;
      }
      grPlan = (p && p.ok) ? p : null;
      if (!grPlan){
        grSet('grNextName', '-');
        grSet('grNextMeta', t((p && p.error) || 'Plan alınamadı'));
      }
      grListeBoya(); grHesapBoya();
    }

    // ---- middle panel ----
    function grListeBoya(){
      const oyun = grQueue[0];
      const calisiyor = !!grDurum.calisiyor;
      const basarimVar = !!(grPlan && grPlan.toplam);
      const basarimsiz = !!(oyun && grPlan && !grPlan.toplam);

      // Top summary strip
      // Steam's achievement schema sometimes gives no game name and the engine falls back to something like 'App 1091500'.
      // There is no point showing that when we have the real name from the library.
      const calisanId = calisiyor ? grDurum.appid : null;
      const kutupAd = calisanId
        ? ((grGames.find(g=>g.appid===calisanId) || {}).name || null)
        : (oyun ? oyun.name : null);
      const motorAd = calisiyor ? grDurum.oyunAdi : null;
      const motorGecerli = motorAd && !/^App \d+$/.test(motorAd);
      grSet('grGameName', kutupAd || (motorGecerli ? motorAd : null) || motorAd || '-');
      const art = grEl('grGameArt');
      const artId = calisiyor ? grDurum.appid : (oyun && oyun.appid);
      art.innerHTML = artId ? gameThumb(artId) : '';
      const acilan = calisiyor ? grDurum.acilan : 0;
      const toplam = calisiyor ? grDurum.toplam : (grPlan ? grPlan.toplam : 0);
      grSet('grOpened', acilan + ' / ' + toplam);
      grSet('grAvgGap', grAralikEtiket(calisiyor ? grDurum.ortalamaAralikMs : (grPlan ? grPlan.ortalamaAralikMs : 0)));
      const yuzde = toplam ? Math.round(acilan / toplam * 100) : 0;
      grSet('grPct', fmtYuzde(yuzde));
      grEl('grPctFill').style.width = yuzde + '%';

      // Cards of games without achievements
      grEl('grNoAch').style.display = basarimsiz ? 'flex' : 'none';
      grEl('grNoAchSummary').style.display = basarimsiz ? 'flex' : 'none';
      grEl('grHasAch').style.display = basarimsiz ? 'none' : 'flex';
      if (basarimsiz){
        // Only games that HAVE achievements but have NO locked achievement left to unlock land here.
        // A game with no achievements at all does not enter the list anyway (grPlanCek drops it).
        grSet('grFallbackLabel', 'Listeden çıkarılacak');
        grSet('grDurLabel2', grSureEtiket(grSureMs()));
        grSet('grFallbackNote', grPlan && grPlan.uygunToplam === 0 && grPlan.toplamBasarim
          ? tf('Bu oyunun # başarımının hepsi açık ya da oyun sunucusu tarafından korunuyor. Açılacak bir şey kalmadığı için sıraya alınmaz.', grPlan.toplamBasarim)
          : t('Steam bu oyun için başarım şeması vermiyor. Sıraya alınmaz.'));
      }

      // Next-in-line card
      if (basarimVar || calisiyor){
        const sira = calisiyor ? grDurum.siradaki : (grPlan.kuyruk[0] && grPlan.kuyruk[0].name);
        const siraPct = calisiyor ? grDurum.siradakiPct : (grPlan.kuyruk[0] && grPlan.kuyruk[0].rarityPct);
        const rank = calisiyor ? (grDurum.acilan + 1) : 1;
        grSet('grNextName', grDurum.basarimlarBitti ? t('Başarımlar bitti') : (sira || '-'));
        grSet('grNextMeta', grDurum.basarimlarBitti
          ? t('Süre sonuna kadar saat toplanıyor')
          : tf('yaklaşık # içinde açılacak · sıra: #', grAralikEtiket(calisiyor ? grDurum.ortalamaAralikMs : grPlan.ortalamaAralikMs), rank));
        const pctEl = grEl('grNextPct');
        pctEl.textContent = Number.isFinite(siraPct) ? fmtYuzde(yerelOndalik(siraPct, 1)) : '-';
        pctEl.style.color = grPctRenk(siraPct);
        pctEl.style.borderColor = grPctRenk(siraPct);
      }

      // Unlock order table
      grSet('grOpenedCount', acilan + ' / ' + toplam);
      const el = grEl('grList');
      if (!grPlan || !grPlan.kuyruk || !grPlan.kuyruk.length){
        el.innerHTML = '<div style="padding:36px 0;text-align:center;font-size:12px;color:#656D80">'
          + (grQueue.length ? 'Açılacak başarım yok.' : 'Soldan oyun ekle, açılma sırası burada görünecek.') + '</div>';
        return;
      }
      const acilanAdlar = new Set(grAcilanlar.map(a=>a.name));
      let html = '';
      let sonEtiket = null;
      grPlan.kuyruk.forEach((a, i)=>{
        // Divider when the rarity changes: the "isDivider" row in the template.
        const et = grNadirEtiket(a.rarityPct);
        if (et !== sonEtiket){
          sonEtiket = et;
          html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 2px 6px">'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#656D80">'+esc(et)+'</span>'
            + '<span style="flex:1;height:1px;background:#1D2432"></span>'
            + '</div>';
        }
        const renk = grPctRenk(a.rarityPct);
        const acildi = acilanAdlar.has(a.name);
        html += '<div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid #101621">'
          + '<span style="width:26px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:10px;color:#656D80">#'+(i+1)+'</span>'
          + '<div style="width:33px;height:33px;flex-shrink:0;border-radius:11px;border:1px solid '+(acildi?GRC.ok:'#2B3345')+';background:#101621;display:flex;align-items:center;justify-content:center">'
          + '<span style="width:10px;height:10px;background:'+(acildi?GRC.ok:renk)+';transform:rotate(45deg)"></span></div>'
          + '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:'+(acildi?GRC.ok:GRC.title)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.name||'')+'</span>'
          + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:'+renk+';border:1px solid '+renk+';border-radius:12px;padding:2px 8px;flex-shrink:0">'+esc(grNadirEtiket(a.rarityPct))+'</span>'
          + '<span style="width:52px;flex-shrink:0;font-family:Geist Mono,monospace;font-size:12px;font-weight:700;color:'+renk+';text-align:right">'
          + (Number.isFinite(a.rarityPct) ? fmtYuzde(yerelOndalik(a.rarityPct, 1)) : '-')+'</span>'
          + '<span style="width:92px;flex-shrink:0;white-space:nowrap;font-family:Geist Mono,monospace;font-size:11px;color:#8B8F9E;text-align:right">'
          + (acildi ? 'AÇILDI' : grZamanEtiket(a.zaman))+'</span>'
          + '</div>';
      });
      el.innerHTML = html;
    }

    // The plan summary is written from a single template. It used to be four pieces: "2 sa" + " süresinde " + "12" +
    // " başarım açılacaktır"; every language was condemned to Turkish syntax,
    // the English came out "2 h over 12 achievements will unlock".
    function grPlanCumleYaz(sureMs, hedef){
      const el = grEl('grPlanCumle');
      if (!el) return;
      el.innerHTML = tf('# içinde # başarım açılacak',
        '<span style="font-family:Geist Mono,monospace;color:#C2AAEE">' + esc(grSureEtiket(sureMs)) + '</span>',
        '<span style="font-family:Geist Mono,monospace;font-weight:700;color:#DCE2FA">' + (Number(hedef) || 0) + '</span>');
    }

    // ---- target + HLTB calculations ----
    function grHesapBoya(){
      const oyun = grQueue[0];
      let sureMs = grSureMs();
      const uygun = grPlan ? (grPlan.uygunToplam || 0) : 0;
      const oto = !!grVal('grTargetAuto', true);

      grSet('grTargetTotal', String(uygun));

      const crRaw = grVal('grCR', '2.0');
      const { tcSa: tc, zorluk: diff, elleGirildi, oynanmisSa: playtimeSa } = grTcVeZorluk(oyun);
      let sureSa = sureMs / 3600000;

      // The automatic target is made of TWO parts:
      //   1. WHAT IS BEHIND - the number that SHOULD already have been unlocked at this playtime,
      //      minus the one really unlocked. In a 180 hour game with its achievements locked
      //      this is a big number.
      //   2. SESSION SHARE - as much as will be earned in this session's own time.
      // There used to be only the 2nd part: the calculation said "how many achievements would a player who starts from zero get in this
      // time". The result was a suggestion like 2 achievements in 8 hours for a game with 180 hours played;
      // yet in that game almost all of them should already have been unlocked.
      const toplamB = grPlan ? (grPlan.toplamBasarim || 0) : 0;
      const acilmisB = grPlan ? (grPlan.acilmis || 0) : 0;
      const payda = Math.max(0.1, tc * diff);
      const olcek = toplamB || uygun;
      const beklenen = olcek ? Math.min(olcek, olcek * (playtimeSa / payda)) : 0;
      const gerideKalan = Math.max(0, Math.round(beklenen - acilmisB));
      const oturumPayi = olcek * (sureSa / payda);
      // AUTOMATIC DURATION: when the settings change not only the target but the DURATION must be recomputed.
      // The measure is how long it would take a real player to earn the achievements that are behind:
      //   (behind / total) x completion time x difficulty
      // It is clamped between 15 minutes and 12 hours. If the user typed the duration by hand it is left alone,
      // and it is left alone if the switch in Ayarlar is off.
      if (grVal('grOtoSure', true) && !grSureTouched && oyun && olcek && gerideKalan > 0){
        const gerekenSa = Math.max(0.25, Math.min(12, (gerideKalan / olcek) * payda));
        const yeniMs = Math.round(gerekenSa * 3600000);
        if (Math.abs(yeniMs - sureMs) > 60000){
          grSureYaz(yeniMs);
          sureMs = yeniMs;
          sureSa = gerekenSa;
          grKaydet({ grDurationSec: Math.round(sureMs / 1000) });
        }
      }
      const otoHedef = uygun ? Math.max(1, Math.min(uygun, Math.round(gerideKalan + oturumPayi))) : 0;
      // The two halves of the target box must look like ONE piece: the same font, the same height, the same colour.
      // It used to be a big white number on the top line and a small grey "/ total" under it.
      const hedefRengi = oto ? GRC.sub : GRC.title;
      grEl('grTarget').readOnly = oto;
      if (oto) grEl('grTarget').value = String(otoHedef);
      ['grTarget', 'grTargetSep', 'grTargetTotal'].forEach((id)=>{
        const el = grEl(id); if (el) el.style.color = hedefRengi;
      });
      const hedef = oto ? otoHedef : Math.max(0, Math.min(uygun, +grEl('grTarget').value || 0));
      grPlanCumleYaz(sureMs, hedef || (grPlan ? grPlan.toplam : 0));

      // Backlog note
      const not = grEl('grCatchUpNote');
      if (not){
        const bir = (grPlan && grPlan.birikim) || 0;
        if (bir > 0 && grVal('grCatchUp', true)){
          not.style.display = 'block';
          not.textContent = oyun
            ? tf('#: # saat oynanmış, # başarım geride kalmış. Geride kalanlar oturumun ilk beşte birinde açılır, sonrası normal ritimde sürer.', oyun.name, Math.round((oyun.playtimeMin||0)/60), bir)
            : tf('# başarım geride kalmış; oturumun ilk beşte birinde açılır.', bir);
        } else not.style.display = 'none';
      }

      // AUTO button and the border of the target box
      const ab = grEl('grAutoTarget');
      ab.style.borderColor = oto ? GRC.brand : '#2B3345';
      ab.style.background = oto ? '#151C28' : '#0D1118';
      ab.style.color = oto ? GRC.sub : GRC.muted;
      grEl('grTargetBox').style.borderColor = oto ? GRC.brand : '#2B3345';

      // Description in the simple panel
      const crEtiket = { '1.5':'kısa hikâye oyunu', '2.0':'orta uzunlukta oyun', '2.5':'uzun açık dünya oyunu', '4.0':'bitmeyen sandbox oyunu', 'auto':'elle girilen süre' };
      const diffEtiket = { '0.8':'kolay', '1.2':'normal', '2.0':'zor', '3.5':'çok zor' };
      // Make the number checkable: show which value it came from. The sentences are separate
      // templates: a single long concatenation came out fragmented and broken in every language.
      const tcKaynak = elleGirildi ? t('girdiğin değer') : tf('# varsayımı', t(crEtiket[crRaw] || 'tür tahmini'));
      grSet('grSimpleNote', oyun
        ? (tf('#: # saat oynanmış. Bitiş süresi # saat kabul edildi (#), zorluk: #.', oyun.name, Math.round(playtimeSa), Math.round(tc), tcKaynak, t(diffEtiket[String(grVal('grDiff','1.2'))] || '-'))
           + ' ' + tf('Bu kadar oynanmışken # başarım açılmış olmalıydı; açılan #, geride kalan #.', Math.round(beklenen), acilmisB, gerideKalan)
           + ' ' + tf('# içinde # başarım açılır.', grSureEtiket(sureMs), hedef))
        : t('Önce soldan bir oyun ekle.'));

      // Distribution model description
      const modelNot = {
        linear: 'Başarımlar süre boyunca eşit aralıklarla açılır. En sakin görünüm.',
        exp: 'Başta sık, sonra seyrek. Gerçek oyuncu da ilk saatlerde daha çok başarım alır.',
        pareto: 'Başarımların büyük kısmı sürenin ilk beşte birinde açılır. En hızlı, en dikkat çekici.',
      };
      grSet('grModelNote', modelNot[grVal('grModel','linear')] || '-');

      // The two Tc boxes (simple and advanced panel) show the same value.
      const tcDeger = oyun ? grTcOku(oyun.appid) : 0;
      [grEl('grTcMain'), grEl('grTc')].forEach((el)=>{
        if (!el) return;
        el.placeholder = tc.toFixed(0);
        if (document.activeElement !== el) el.value = tcDeger > 0 ? String(tcDeger) : '';
      });
      grSet('grPlaytime', oyun ? sureBirim(yerelOndalik(playtimeSa, 1), 'sa') : '-');
      // the expected number was computed once above (the first part of the automatic target), it is not
      // recomputed here - so two different numbers do not show in two places.
      const beklenenB = Math.round(beklenen);
      grSet('grExpected', toplamB ? (beklenenB + ' / ' + toplamB) : '-');
      grSet('grPace', playtimeSa > 0 && beklenenB ? yerelOndalik(beklenenB / playtimeSa, 1) : '-');
      grSet('grLeft', grPlan ? String(uygun) : '-');
      // How long the remaining achievements will take to unlock in the real game (estimate)
      const kalanSa = (uygun && toplamB) ? (uygun / toplamB) * tc * diff : 0;
      grSet('grRemainEst', kalanSa ? (kalanSa < 1 ? sureBirim(Math.round(kalanSa*60), 'dk') : sureBirim(Math.round(kalanSa), 'sa')) : '-');
      grHizBoya();
    }

    // ---- pace settings (advanced panel) ----
    const GR_HIZ_ALAN = [
      ['grHiz', 'grHiz', 1, 0.1, 4],
      ['grUltraCarpan', 'grUltraCarpan', 3, 1, 10],
      ['grTelafiPay', 'grTelafiPay', 20, 2, 90],
      ['grBitmisSik', 'grBitmisSik', 50, 5, 100],
    ];
    function grHizBoya(){
      GR_HIZ_ALAN.forEach(([id, anahtar, varsayilan])=>{
        const el = grEl(id);
        if (el && document.activeElement !== el) el.value = String(grVal(anahtar, varsayilan));
      });
      const oyun = grQueue[0];
      const not = grEl('grHizNote');
      if (!not) return;
      if (!oyun){ not.textContent = t('Önce soldan bir oyun ekle.'); return; }
      const { tcSa, oynanmisSa } = grTcVeZorluk(oyun);
      const bitmis = oynanmisSa > 0 && oynanmisSa >= tcSa;
      const sik = +grVal('grBitmisSik', 50) || 50;
      not.textContent = bitmis
        ? tf('# zaten bitmiş sayılıyor (# saat oynanmış, bitiş # saat). Çizelge %# oranına sıkıştırıldı.', oyun.name, Math.round(oynanmisSa), Math.round(tcSa), sik)
        : tf('Oyun henüz bitmemiş (# / # saat), sıkıştırma uygulanmıyor. Ultra nadir başarımlar # kat daha uzun bekler.', Math.round(oynanmisSa), Math.round(tcSa), (+grVal('grUltraCarpan', 3) || 3));
    }
    GR_HIZ_ALAN.forEach(([id, anahtar, varsayilan, alt, ust])=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const v = Math.max(alt, Math.min(ust, parseFloat(el.value) || varsayilan));
        el.value = String(v);
        await grKaydet({ [anahtar]: v });
        grPlanCek();          // the unlock times depend on these values
      });
    });

    // ---- switches (toggle) ----
    function grToggleBoya(){
      document.querySelectorAll('#tab-gercekci .gr-toggle').forEach(el=>{
        const k = el.getAttribute('data-grset');
        // grCatchUp is ON by default: if there is no backlog it changes nothing anyway.
        const on = !!grVal(k, k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours' || k === 'grCatchUp' || k === 'grOtoSure');
        el.style.background = on ? GRC.brand : '#151C28';
        el.style.borderColor = on ? GRC.brand : '#2B3345';
        const knob = el.firstElementChild;
        if (knob){ knob.style.background = on ? GRC.title : GRC.off; knob.style.marginLeft = on ? '16px' : '0px'; }
      });
    }
    document.querySelectorAll('#tab-gercekci .gr-toggle').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const k = el.getAttribute('data-grset');
        const yeni = !grVal(k, k === 'grAuto' || k === 'grRandomGap' || k === 'grKeepHours');
        await grKaydet({ [k]: yeni });
        grToggleBoya();
        if (k === 'grSkipUltraRare') grPlanCek();
        else if (k === 'grShowNoAch') grAramaBoya();
        else grListeBoya();
        grHesapBoya();
      });
    });

    // ---- dropdown lists ----
    function grSelectBoya(){
      const ata = (id, deger) => { const e = grEl(id); if (e) e.value = deger; };
      ata('grCR', grVal('grCR', '2.0'));
      ata('grCR2', grVal('grCR', '2.0'));
      ata('grDiff', grVal('grDiff', '1.2'));
      ata('grDiff2', grVal('grDiff', '1.2'));
      ata('grModel', grVal('grModel', 'linear'));
    }
    // We can change the same setting from both panels (the template does the same); the two stay in sync.
    [['grCR','grCR'], ['grCR2','grCR'], ['grDiff','grDiff'], ['grDiff2','grDiff'],
     ['grModel','grModel']].forEach(([id, anahtar])=>{
      const e = grEl(id);
      if (!e) return;
      e.addEventListener('change', async ()=>{
        await grKaydet({ [anahtar]: e.value });
        grSelectBoya();
        if (anahtar === 'grModel') grPlanCek(); else { grHesapBoya(); grListeBoya(); }
      });
    });
    // Both panels write the same value and the value is kept PER GAME. There used to be a single general
    // 'grTc' setting: writing 180 for Cyberpunk made every game in the library
    // count as 180 hours.
    ['grTcMain', 'grTc'].forEach((id)=>{
      const el = grEl(id); if (!el) return;
      el.addEventListener('change', async ()=>{
        const oyun = grQueue[0];
        const saat = Math.max(0, Math.min(20000, parseFloat(el.value) || 0));
        el.value = saat > 0 ? String(saat) : '';
        if (oyun) await grTcYaz(oyun.appid, saat);
        else await grKaydet({ grTc: saat > 0 ? String(saat) : '' });
        grPlanCek();       // the target and timing depend on this value, the plan is rebuilt
      });
    });
    ['grRH','grRM','grRS'].forEach(id=>{
      grEl(id).addEventListener('change', async ()=>{
        grSureTouched = true;         // entered by hand, automatic assignment no longer overwrites it
        const ms = grSureMs();
        grSureYaz(ms);
        await grKaydet({ grDurationSec: Math.round(ms/1000) });
        grPlanCek();
      });
    });
    grEl('grTarget').addEventListener('change', async ()=>{
      if (grVal('grTargetAuto', true)) return;
      await grKaydet({ grTarget: Math.max(0, +grEl('grTarget').value || 0) });
      grPlanCek();
    });
    grEl('grAutoTarget').onclick = async ()=>{
      await grKaydet({ grTargetAuto: !grVal('grTargetAuto', true) });
      grHesapBoya();
      grPlanCek();
    };

    // ---- simple / advanced ----
    function grSeviyeBoya(){
      const adv = grVal('grLevel', 'simple') === 'advanced';
      const s = grEl('grLvlSimple'), a = grEl('grLvlAdv');
      s.style.borderColor = adv ? 'transparent' : GRC.brand;
      s.style.background = adv ? 'transparent' : '#151C28';
      s.style.color = adv ? GRC.muted : GRC.title;
      a.style.borderColor = adv ? GRC.brand : 'transparent';
      a.style.background = adv ? '#151C28' : 'transparent';
      a.style.color = adv ? GRC.title : GRC.muted;
      grEl('grSimpleBox').style.display = adv ? 'none' : 'flex';
      grEl('grAdvBox').style.display = adv ? 'flex' : 'none';
    }
    grEl('grLvlSimple').onclick = async ()=>{ await grKaydet({ grLevel: 'simple' }); grSeviyeBoya(); };
    grEl('grLvlAdv').onclick = async ()=>{ await grKaydet({ grLevel: 'advanced' }); grSeviyeBoya(); };

    // ---- presets ----
    // The preset summary is built at draw time: the text written at save time stayed in the old language
    // when the language changed later. If old presets lack the field it falls back to the saved text.
    const GR_MODEL_AD = { linear:'doğrusal', exp:'üstel (önden yüklemeli)', pareto:'Pareto (80/20)' };
    function grPresetMeta(p){
      if (!p || !p.sureSec || !Array.isArray(p.oyunlar)) return (p && p.meta) || '';
      return grSureEtiket(p.sureSec * 1000) + ' · ' + tf('# oyun', p.oyunlar.length) + ' · ' + t(GR_MODEL_AD[p.model] || p.model || '-');
    }
    function grPresetBoya(){
      const box = grEl('grPresetsBox');
      box.style.display = grPresets.length ? 'block' : 'none';
      grEl('grPresets').innerHTML = grPresets.map((p,i)=>
        '<div data-grpreset="'+i+'" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #101621;cursor:pointer">'
        + '<span style="width:20px;height:20px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;display:flex;align-items:center;justify-content:center;font-family:Geist Mono,monospace;font-size:10px;font-weight:700;color:#C2AAEE">'+(i+1)+'</span>'
        + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">'
        + '<span style="font-size:12px;color:#B9C0D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.baslik||'-')+'</span>'
        + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#8B8F9E">'+esc(grPresetMeta(p))+'</span>'
        + '</div>'
        + '<button data-grpdel="'+i+'" class="h-stop" style="width:22px;height:22px;flex-shrink:0;border-radius:12px;border:1px solid #2B3345;background:#090C12;color:#8B8F9E;font-family:Geist Mono,monospace;font-size:14px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">&#8722;</button>'
        + '</div>').join('');
    }
    // At most this many presets are kept. If full, saving is REFUSED - silently dropping
    // the oldest would mean deleting a configuration without the user knowing.
    const GR_PRESET_SINIR = 5;
    grEl('grSavePreset').onclick = async ()=>{
      if (!grQueue.length){ if (typeof toast === 'function') toast('Preset').fail('Önce sıraya oyun ekle.'); return; }
      if (grPresets.length >= GR_PRESET_SINIR){
        if (typeof toast === 'function') toast('Preset').fail(tf('En fazla # preset tutulur. Önce birini sil.', GR_PRESET_SINIR));
        return;
      }
      const sureMs = grSureMs();
      const p = {
        baslik: grQueue.map(g=>g.name).join(', ').slice(0, 60),
        meta: '',
        oyunlar: grQueue.map(g=>g.appid),
        sureSec: Math.round(sureMs/1000),
        model: grVal('grModel','linear'),
        cr: grVal('grCR','2.0'), diff: grVal('grDiff','1.2'),
        hedefAuto: !!grVal('grTargetAuto', true), hedef: Math.max(0, +grEl('grTarget').value || 0),
        ts: Date.now(),
      };
      grPresets = [p].concat(grPresets).slice(0, GR_PRESET_SINIR);
      await grKaydet({ grPresets });
      grPresetBoya();
      if (typeof toast === 'function') toast('Preset').done('Kaydedildi.');
    };
    grEl('grPresets').addEventListener('click', async (e)=>{
      const sil = e.target.closest('[data-grpdel]');
      if (sil){
        grPresets.splice(+sil.getAttribute('data-grpdel'), 1);
        await grKaydet({ grPresets });
        grPresetBoya();
        return;
      }
      const row = e.target.closest('[data-grpreset]');
      if (!row) return;
      if (grDurum.calisiyor){ if (typeof toast === 'function') toast('Preset').fail('Çalışırken preset yüklenemez.'); return; }
      const p = grPresets[+row.getAttribute('data-grpreset')];
      if (!p) return;
      grQueue = (p.oyunlar||[]).map(id=>grGames.find(g=>g.appid===+id)).filter(Boolean);
      grSureYaz((p.sureSec||7200)*1000);
      await grKaydet({
        grQueue: grQueue.map(g=>g.appid), grDurationSec: p.sureSec||7200, grModel: p.model||'linear',
        grCR: p.cr||'2.0', grDiff: p.diff||'1.2', grTargetAuto: p.hedefAuto !== false, grTarget: p.hedef||0,
      });
      grSelectBoya(); grToggleBoya(); grKutuphaneBoya();
      grEl('grTarget').value = String(p.hedef||0);
      grPlanCek();
      if (typeof toast === 'function') toast('Preset').done('Yüklendi.');
    });

    // ---- start / stop ----
    grEl('grStart').onclick = async ()=>{
      if (grDurum.calisiyor){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Zaten çalışıyor.'); return; }
      if (!grQueue.length){ if (typeof toast === 'function') toast('Gerçekçi Mod').fail('Önce sıraya oyun ekle.'); return; }
      const sureMs = grSureMs();
      const sec = grSecenekler();
      const hedef = grPlan ? grPlan.toplam : 0;
      const ilkler = (grPlan && grPlan.kuyruk ? grPlan.kuyruk.slice(0,5) : [])
        .map(a=>'  · '+a.name+(Number.isFinite(a.rarityPct)?(' ('+fmtYuzde(yerelOndalik(a.rarityPct, 1))+')'):'')).join('\n');
      const ok = await edgeConfirm({
        tag:'Gerçekçi Mod',
        title: hedef ? tf('# başarım # süreye yayılacak', hedef, grSureEtiket(sureMs)) : tf('Başarımlar # süreye yayılacak', grSureEtiket(sureMs)),
        body: grQueue.map(g=>g.name).join(', ')
              + '\n\n' + t('Oyun sayısı:') + ' ' + grQueue.length
              + '\n' + t('Dağıtım:') + ' ' + t(GR_MODEL_AD[sec.model] || GR_MODEL_AD.linear)
              + (grPlan ? ('\n' + t('Ortalama aralık:') + ' ' + grAralikEtiket(grPlan.ortalamaAralikMs)
                          + ' ' + t(sec.rastgeleAralik ? '(her seferinde rastgele sapmalı)' : '(sabit)')) : '')
              + (ilkler ? ('\n\n' + t('İlk açılacaklar:') + '\n' + ilkler) : '')
              + (grPlan && grPlan.korumali ? ('\n\n' + tf('# başarım oyun tarafından korunduğu için atlanacak.', grPlan.korumali)) : '')
              + (grPlan && grPlan.ultraAtlanan ? ('\n' + tf('# ultra nadir başarım ayara göre atlanacak.', grPlan.ultraAtlanan)) : ''),
        warn: 'Bu işlem Steam hesabını kalıcı olarak değiştirir. Süre boyunca uygulama açık kalmalı; istediğin an durdurabilirsin.',
        confirmText:'Başlat', cancelText:'Vazgeç',
      });
      if (!ok) return;
      const r = await window.imu.gercekci.start(grQueue.map(g=>g.appid), sureMs, sec)
        .catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        edgeConfirm({ tag:'Hata', danger:true, title:'Başlatılamadı',
                      body:(r&&r.error)||'Bilinmeyen hata.', confirmText:'Tamam', tekDugme:true });
        return;
      }
      grAcilanlar = [];
      notify('boost', 'Gerçekçi Mod Başladı', (r.oyunAdi||'') + ' · ' + tf('# başarım', r.toplam));
      pushFeed('saat', 'Gerçekçi Mod',
               tf('# oyun', r.oyunSayisi) + ' · ' + tf('# başarım # süreye yayıldı.', r.toplam, grSureEtiket(sureMs)), 'Çalışıyor');
    };
    grEl('grStop').onclick = ()=>{
      if (!grDurum.calisiyor) return;
      window.imu.gercekci.stop();
      pushFeed('saat', 'Gerçekçi Mod', 'Durduruldu.', 'Durdu');
    };

    // ---- state coming from the engine ----
    function grSaatBoya(kalanSn){
      const iki = (n)=>String(n).padStart(2,'0');
      grSet('grClockH', iki(Math.floor(kalanSn/3600)));
      grSet('grClockM', iki(Math.floor((kalanSn%3600)/60)));
      grSet('grClockS', iki(kalanSn%60));
    }
    if (window.imu.gercekci && window.imu.gercekci.onTick){
      window.imu.gercekci.onTick((d)=>{
        grDurum = d || { calisiyor:false };
        if (grTimerUI){ clearInterval(grTimerUI); grTimerUI = null; }

        if (!d || !d.calisiyor){
          grSaatBoya(0);
          if (d && d.bitti){
            notify('boost', 'Gerçekçi Mod Bitti', tf('# / # başarım açıldı', d.acilan, d.toplam));
            pushFeed(d.hata?'hata':'kart', 'Gerçekçi Mod',
                     t(d.sebep || 'Bitti') + ' · ' + tf('# / # başarım', d.acilan, d.toplam), d.hata?'Hata':'Başarılı');
          }
          grKutuphaneBoya();
          grListeBoya();
          return;
        }

        const yenile = ()=> grSaatBoya(Math.max(0, Math.floor((d.bitis - Date.now())/1000)));
        yenile();
        grTimerUI = setInterval(()=>{ if (typeof uiTickAllowed !== 'function' || uiTickAllowed()) yenile(); }, 1000);
        if (d.oyunDegisti) grKutuphaneBoya();
        grListeBoya();
      });
    }
    if (window.imu.gercekci && window.imu.gercekci.onAcildi){
      window.imu.gercekci.onAcildi((a)=>{
        grAcilanlar.push({ name:a.name, rarityPct:a.rarityPct, ts:Date.now() });
        pushFeed('kart', 'Başarım açıldı', a.name + (a.oyunAdi ? (' · ' + a.oyunAdi) : ''), 'Başarılı');
        grListeBoya();
      });
    }
