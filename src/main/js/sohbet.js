    // ================= SOHBET =================
    // Steam'in birebir arkadas mesajlari. Motor tarafi steamEngine.js > "SOHBET".
    //
    // Gelen mesaj iki yoldan geliyor:
    //   1. common.js zaten 'chat:message' olayini dinleyip bildirim cikariyordu (1.0.x'ten
    //      beri var). Orada dokunulmadi.
    //   2. Bu sayfa ayni olaya abone olup acik yazismaya mesaji EKLIYOR; kisi listesindeki
    //      okunmamis rozetini de o guncelliyor.
    //
    // Grup sohbetleri KAPSAM DISI: Steam'de ayri bir kavram (chat room groups), ayri bir
    // ekran ve ayri bir izin modeli ister. Buradaki her sey arkadas listesi uzerinden.
    let chArkadaslar = [];
    let chSecili = null;                  // steamid
    let chMesajlar = new Map();           // steamid -> [{ben, metin, ts}]
    let chOkunmamis = new Map();          // steamid -> sayi
    let chYuklendi = false;
    let chIstek = 0;                      // yaris kosulu sayaci
    let chYaziyorSon = 0;

    const chEl = (id) => document.getElementById(id);
    const CHC = { brand:'#5624B3', ok:'#5FB324', title:'#DCE2FA', muted:'#8B8F9E',
                  off:'#656D80', bd:'#2B3345', s1:'#0D1118', sub:'#C2AAEE' };

    function chSaat(ts){
      const d = new Date(ts || 0);
      const iki = (n)=>String(n).padStart(2,'0');
      const bugun = new Date();
      const ayniGun = d.toDateString() === bugun.toDateString();
      return ayniGun ? (iki(d.getHours()) + ':' + iki(d.getMinutes()))
                     : (iki(d.getDate()) + '.' + iki(d.getMonth()+1) + ' ' + iki(d.getHours()) + ':' + iki(d.getMinutes()));
    }
    // Steam persona_state: 0 cevrimdisi, 1 cevrimici, 2 mesgul, 3 uzakta, 4 uyku,
    // 5/6 takas/oyun arayan. Ayrintiyi gostermeye gerek yok, ucu yeter.
    function chDurumRenk(d){ return d > 0 ? CHC.ok : CHC.off; }
    function chDurumAd(a){
      if (a.oyun) return a.oyun;
      return a.durum > 0 ? 'Çevrimiçi' : 'Çevrimdışı';
    }

    async function loadSohbet(){
      if (chYuklendi){ chListeBoya(); return; }
      const liste = chEl('chListe');
      liste.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Arkadaş listesi alınıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ liste.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(con.error)+'</div>'; return; }
      await chArkadaslariCek();
      chYuklendi = true;
    }

    async function chArkadaslariCek(){
      const liste = chEl('chListe');
      const r = await window.imu.sohbet.friends().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        liste.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc((r&&r.error)||'Arkadaş listesi alınamadı.')+'</div>';
        return;
      }
      chArkadaslar = r.friends || [];
      // Okunmamis sayilari son konusmalardan gelir; arkadas listesinde bu bilgi yok.
      const k = await window.imu.sohbet.conversations().catch(()=>null);
      if (k && k.ok){
        chOkunmamis = new Map((k.konusmalar||[]).map(x=>[x.steamid, x.okunmamis||0]));
      }
      chListeBoya();
    }

    function chListeBoya(){
      const q = (chEl('chAra').value || '').trim().toLowerCase();
      const liste = chEl('chListe');
      const suzulmus = q ? chArkadaslar.filter(a=>a.persona.toLowerCase().includes(q)) : chArkadaslar;
      chEl('chSayi').textContent = suzulmus.length + ' kişi';
      chEl('chOnline').textContent = String(chArkadaslar.filter(a=>a.durum > 0).length);
      if (!suzulmus.length){
        liste.innerHTML = '<div style="color:#656D80;padding:14px;font-size:12px">'
          + (chArkadaslar.length ? 'Sonuç yok.' : 'Arkadaş bulunamadı.') + '</div>';
        return;
      }
      liste.innerHTML = suzulmus.map(a=>{
        const secili = a.steamid === chSecili;
        const okunmamis = chOkunmamis.get(a.steamid) || 0;
        return '<div class="h-s3" data-chkisi="'+a.steamid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;cursor:pointer;margin-bottom:3px;'
          + 'border:1px solid '+(secili?CHC.brand:'transparent')+';background:'+(secili?'#151C28':'transparent')+'">'
          + '<div style="position:relative;width:32px;height:32px;flex-shrink:0">'
            + '<div style="width:32px;height:32px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
            + (a.avatar ? '<img src="'+esc(a.avatar)+'" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' : '')
            + '</div>'
            + '<span style="position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:12px;border:2px solid #090C12;background:'+chDurumRenk(a.durum)+'"></span>'
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
            + '<span style="font-size:12px;font-weight:600;color:'+(a.durum>0?CHC.title:CHC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.persona)+'</span>'
            + '<span style="font-size:10px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(chDurumAd(a))+'</span>'
          + '</div>'
          + (okunmamis
              ? '<span style="flex-shrink:0;min-width:18px;height:18px;padding:0 5px;border-radius:12px;background:'+CHC.brand+';color:#DCE2FA;font-family:Geist Mono,monospace;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">'+okunmamis+'</span>'
              : '')
          + '</div>';
      }).join('');
    }
    chEl('chAra').addEventListener('input', chListeBoya);
    chEl('chYenile').onclick = ()=>{ chYuklendi = false; loadSohbet(); };

    chEl('chListe').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-chkisi]'); if (!row) return;
      chKisiSec(row.getAttribute('data-chkisi'));
    });

    async function chKisiSec(steamid){
      chSecili = steamid;
      const a = chArkadaslar.find(x=>x.steamid===steamid);
      chEl('chAd').textContent = a ? a.persona : steamid;
      chEl('chDurum').textContent = a ? chDurumAd(a) : '';
      chEl('chAvatar').innerHTML = (a && a.avatar)
        ? '<img src="'+esc(a.avatar)+'" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' : '';
      chEl('chProfil').style.display = '';
      chEl('chGiris').disabled = false;
      chEl('chGonder').disabled = false;
      chOkunmamis.set(steamid, 0);
      chListeBoya();

      const istek = ++chIstek;
      chEl('chMesajlar').innerHTML = '<div style="color:#8B8F9E;font-size:12px">Yazışma yükleniyor...</div>';
      const r = await window.imu.sohbet.history(steamid, 50).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (istek !== chIstek) return;                 // kullanici baska kisiye gecti
      if (!r || !r.ok){
        chEl('chMesajlar').innerHTML = '<div style="color:#B32453;font-size:12px">'+esc((r&&r.error)||'Yazışma alınamadı.')+'</div>';
        return;
      }
      chMesajlar.set(steamid, r.mesajlar || []);
      chMesajBoya();
      window.imu.sohbet.read(steamid).catch(()=>{});   // Steam'de de okundu sayilsin
    }

    function chMesajBoya(){
      const kap = chEl('chMesajlar');
      const m = chMesajlar.get(chSecili) || [];
      if (!m.length){
        kap.innerHTML = '<div style="color:#656D80;font-size:12px">Henüz mesaj yok. İlk mesajı sen yaz.</div>';
        return;
      }
      kap.innerHTML = m.map(x=>
        '<div style="display:flex;flex-direction:column;gap:3px;max-width:70%;align-self:'+(x.ben?'flex-end':'flex-start')+'">'
        + '<div style="padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:break-word;'
          + (x.ben ? 'background:#2A1B47;border:1px solid #5624B3;color:#DCE2FA'
                   : 'background:#0D1118;border:1px solid #2B3345;color:#B9C0D6') + '">'
          + esc(x.metin) + '</div>'
        + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#656D80;align-self:'+(x.ben?'flex-end':'flex-start')+'">'+chSaat(x.ts)+'</span>'
        + '</div>').join('');
      kap.scrollTop = kap.scrollHeight;
    }

    async function chGonder(){
      const giris = chEl('chGiris');
      const metin = giris.value.trim();
      if (!metin || !chSecili) return;
      giris.value = '';
      giris.style.height = 'auto';
      // Iyimser cizim: mesaji hemen goster, Steam reddederse geri al ve sebebini soyle.
      const liste = chMesajlar.get(chSecili) || [];
      const gecici = { ben: true, metin, ts: Date.now(), gecici: true };
      liste.push(gecici);
      chMesajlar.set(chSecili, liste);
      chMesajBoya();
      const r = await window.imu.sohbet.send(chSecili, metin).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        const i = liste.indexOf(gecici);
        if (i >= 0) liste.splice(i, 1);
        chMesajBoya();
        if (typeof toast === 'function') toast('Sohbet').fail((r && r.error) || 'Mesaj gönderilemedi.');
        return;
      }
      gecici.gecici = false;
      gecici.ts = r.ts || gecici.ts;
      chMesajBoya();
    }
    chEl('chGonder').onclick = chGonder;
    chEl('chGiris').addEventListener('keydown', (e)=>{
      // Enter gonderir, Shift+Enter satir atlar - sohbet uygulamalarinin ortak kalibi.
      if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); chGonder(); return; }
      // "Yaziyor..." bildirimi: saniyede birden fazla gonderilmez.
      if (chSecili && Date.now() - chYaziyorSon > 4000){
        chYaziyorSon = Date.now();
        window.imu.sohbet.typing(chSecili);
      }
    });
    // Kutu yazdikca buyusun, 120 px'te dursun (CSS max-height ile birlikte).
    chEl('chGiris').addEventListener('input', (e)=>{
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
    });
    chEl('chProfil').onclick = ()=>{
      if (chSecili) window.imu.openExternal('https://steamcommunity.com/profiles/' + chSecili);
    };

    // Gelen mesaj: acik yazismaya ekle, degilse okunmamis rozetini artir.
    if (window.imu.onChatMessage){
      window.imu.onChatMessage((m)=>{
        if (!m || !m.from) return;
        const liste = chMesajlar.get(m.from) || [];
        liste.push({ ben: false, metin: String(m.message || ''), ts: m.ts || Date.now() });
        chMesajlar.set(m.from, liste);
        if (m.from === chSecili){
          chMesajBoya();
          window.imu.sohbet.read(m.from).catch(()=>{});
        } else {
          chOkunmamis.set(m.from, (chOkunmamis.get(m.from) || 0) + 1);
          if (chYuklendi) chListeBoya();
        }
      });
    }
