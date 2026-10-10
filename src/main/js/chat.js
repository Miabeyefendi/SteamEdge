    // ================= CHAT =================
    // Steam's one-to-one friend messages. The engine side is steamEngine.js > "CHAT".
    //
    // An incoming message arrives by two paths:
    //   1. common.js was already listening to the 'chat:message' event and raising a notification (since
    //      1.0.x). Nothing was touched there.
    //   2. This page subscribes to the same event and ADDS the message to the open conversation; it also
    //      updates the unread badge in the contact list.
    //
    // Group chats are OUT OF SCOPE: in Steam they are a separate concept (chat room groups) and need a separate
    // screen and a separate permission model. Everything here goes through the friend list.
    let chFriends = [];
    let chSelected = null;                  // steamid
    let chMessages = new Map();           // steamid -> [{me, textValue, ts}]
    let chUnread = new Map();          // steamid -> count
    let chLoaded = false;
    let chRequest = 0;                      // race condition counter
    let chTypingLast = 0;

    const chEl = (id) => document.getElementById(id);
    const CHC = { brand:'#5624B3', ok:'#5FB324', title:'#DCE2FA', muted:'#8B8F9E',
                  off:'#656D80', bd:'#2B3345', s1:'#0D1118', sub:'#C2AAEE' };

    function chTime(ts){
      const d = new Date(ts || 0);
      const two = (n)=>String(n).padStart(2,'0');
      const today = new Date();
      const sameDay = d.toDateString() === today.toDateString();
      return sameDay ? (two(d.getHours()) + ':' + two(d.getMinutes()))
                     : (two(d.getDate()) + '.' + two(d.getMonth()+1) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()));
    }
    // Steam persona_state: 0 offline, 1 online, 2 busy, 3 away, 4 snooze,
    // 5/6 looking to trade/play. There is no need to show the detail, three is enough.
    function chStatusColor(d){ return d > 0 ? CHC.ok : CHC.off; }
    function chStatusName(a){
      if (a.gameEntry) return a.gameEntry;
      return a.condition > 0 ? 'Çevrimiçi' : 'Çevrimdışı';
    }

    async function loadChat(){
      if (chLoaded){ chPaintList(); return; }
      const listing = chEl('chList');
      listing.innerHTML = '<div style="color:#8B8F9E;padding:14px;font-size:12px">Arkadaş listesi alınıyor...</div>';
      const con = await E.connect().catch(e=>({ ok:false, error:(e&&e.message)||'bağlantı hatası' }));
      if (!con.ok){ listing.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc(con.error)+'</div>'; return; }
      await chFetchFriends();
      chLoaded = true;
    }

    async function chFetchFriends(){
      const listing = chEl('chList');
      const r = await window.imu.chat.friends().catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        listing.innerHTML = '<div style="color:#B32453;padding:14px;font-size:12px">'+esc((r&&r.error)||'Arkadaş listesi alınamadı.')+'</div>';
        return;
      }
      chFriends = r.friends || [];
      // Unread counts come from the recent conversations; the friend list does not have this information.
      const k = await window.imu.chat.conversations().catch(()=>null);
      if (k && k.ok){
        chUnread = new Map((k.conversationList||[]).map(x=>[x.steamid, x.unreadCount||0]));
      }
      chPaintList();
    }

    function chPaintList(){
      const q = (chEl('chSearch').value || '').trim().toLowerCase();
      const listing = chEl('chList');
      const refined = q ? chFriends.filter(a=>a.persona.toLowerCase().includes(q)) : chFriends;
      chEl('chCount').textContent = tf('# kişi', refined.length);
      chEl('chOnline').textContent = String(chFriends.filter(a=>a.condition > 0).length);
      if (!refined.length){
        listing.innerHTML = '<div style="color:#656D80;padding:14px;font-size:12px">'
          + (chFriends.length ? 'Sonuç yok.' : 'Arkadaş bulunamadı.') + '</div>';
        return;
      }
      listing.innerHTML = refined.map(a=>{
        const chosen = a.steamid === chSelected;
        const unread = chUnread.get(a.steamid) || 0;
        return '<div class="h-s3" data-chkisi="'+a.steamid+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;cursor:pointer;margin-bottom:3px;'
          + 'border:1px solid '+(chosen?CHC.brand:'transparent')+';background:'+(chosen?'#151C28':'transparent')+'">'
          + '<div style="position:relative;width:32px;height:32px;flex-shrink:0">'
            + '<div style="width:32px;height:32px;border-radius:12px;border:1px solid #2B3345;background:repeating-linear-gradient(135deg,#151C28 0 5px,#101621 5px 10px);overflow:hidden">'
            + (a.avatar ? '<img src="'+esc(a.avatar)+'" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' : '')
            + '</div>'
            + '<span style="position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:12px;border:2px solid #090C12;background:'+chStatusColor(a.condition)+'"></span>'
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">'
            + '<span style="font-size:12px;font-weight:600;color:'+(a.condition>0?CHC.title:CHC.muted)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(a.persona)+'</span>'
            + '<span style="font-size:10px;color:#8B8F9E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(chStatusName(a))+'</span>'
          + '</div>'
          + (unread
              ? '<span style="flex-shrink:0;min-width:18px;height:18px;padding:0 5px;border-radius:12px;background:'+CHC.brand+';color:#DCE2FA;font-family:Geist Mono,monospace;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">'+unread+'</span>'
              : '')
          + '</div>';
      }).join('');
    }
    chEl('chSearch').addEventListener('input', chPaintList);
    chEl('chRefresh').onclick = ()=>{ chLoaded = false; loadChat(); };

    chEl('chList').addEventListener('click', (e)=>{
      const row = e.target.closest('[data-chkisi]'); if (!row) return;
      chSelectPerson(row.getAttribute('data-chkisi'));
    });

    async function chSelectPerson(steamid){
      chSelected = steamid;
      const a = chFriends.find(x=>x.steamid===steamid);
      chEl('chName').textContent = a ? a.persona : steamid;
      chEl('chStatus').textContent = a ? chStatusName(a) : '';
      chEl('chAvatar').innerHTML = (a && a.avatar)
        ? '<img src="'+esc(a.avatar)+'" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' : '';
      chEl('chProfile').style.display = '';
      chEl('chInput').disabled = false;
      chEl('chSendBtn').disabled = false;
      chUnread.set(steamid, 0);
      chPaintList();

      const request = ++chRequest;
      chEl('chMessages').innerHTML = '<div style="color:#8B8F9E;font-size:12px">Yazışma yükleniyor...</div>';
      const r = await window.imu.chat.history(steamid, 50).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (request !== chRequest) return;                 // the user moved to another person
      if (!r || !r.ok){
        chEl('chMessages').innerHTML = '<div style="color:#B32453;font-size:12px">'+esc((r&&r.error)||'Yazışma alınamadı.')+'</div>';
        return;
      }
      chMessages.set(steamid, r.messageList || []);
      chPaintMessages();
      window.imu.chat.read(steamid).catch(()=>{});   // so it also counts as read on Steam
    }

    function chPaintMessages(){
      const container = chEl('chMessages');
      const m = chMessages.get(chSelected) || [];
      if (!m.length){
        container.innerHTML = '<div style="color:#656D80;font-size:12px">Henüz mesaj yok. İlk mesajı sen yaz.</div>';
        return;
      }
      container.innerHTML = m.map(x=>
        '<div style="display:flex;flex-direction:column;gap:3px;max-width:70%;align-self:'+(x.me?'flex-end':'flex-start')+'">'
        + '<div style="padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:break-word;'
          + (x.me ? 'background:#2A1B47;border:1px solid #5624B3;color:#DCE2FA'
                   : 'background:#0D1118;border:1px solid #2B3345;color:#B9C0D6') + '">'
          + esc(x.textValue) + '</div>'
        + '<span style="font-family:Geist Mono,monospace;font-size:10px;color:#656D80;align-self:'+(x.me?'flex-end':'flex-start')+'">'+chTime(x.ts)+'</span>'
        + '</div>').join('');
      container.scrollTop = container.scrollHeight;
    }

    async function chSend(){
      const login = chEl('chInput');
      const text = login.value.trim();
      if (!text || !chSelected) return;
      login.value = '';
      login.style.height = 'auto';
      // Optimistic drawing: show the message right away, if Steam rejects it take it back and say why.
      const listing = chMessages.get(chSelected) || [];
      const temporary = { me: true, textValue: text, ts: Date.now(), isTemporary: true };
      listing.push(temporary);
      chMessages.set(chSelected, listing);
      chPaintMessages();
      const r = await window.imu.chat.send(chSelected, text).catch(e=>({ ok:false, error:(e&&e.message) }));
      if (!r || !r.ok){
        const i = listing.indexOf(temporary);
        if (i >= 0) listing.splice(i, 1);
        chPaintMessages();
        if (typeof toast === 'function') toast('Sohbet').fail((r && r.error) || 'Mesaj gönderilemedi.');
        return;
      }
      temporary.isTemporary = false;
      temporary.ts = r.ts || temporary.ts;
      chPaintMessages();
    }
    chEl('chSendBtn').onclick = chSend;
    chEl('chInput').addEventListener('keydown', (e)=>{
      // Enter sends, Shift+Enter breaks the line - the common pattern of chat apps.
      if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); chSend(); return; }
      // "Typing..." notification: not sent more than once a second.
      if (chSelected && Date.now() - chTypingLast > 4000){
        chTypingLast = Date.now();
        window.imu.chat.typing(chSelected);
      }
    });
    // The box grows as you type, stops at 120 px (together with the CSS max-height).
    chEl('chInput').addEventListener('input', (e)=>{
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
    });
    chEl('chProfile').onclick = ()=>{
      if (chSelected) window.imu.openExternal('https://steamcommunity.com/profiles/' + chSelected);
    };

    // Incoming message: add it to the open conversation, otherwise raise the unread badge.
    if (window.imu.onChatMessage){
      window.imu.onChatMessage((m)=>{
        if (!m || !m.from) return;
        const listing = chMessages.get(m.from) || [];
        listing.push({ me: false, textValue: String(m.message || ''), ts: m.ts || Date.now() });
        chMessages.set(m.from, listing);
        if (m.from === chSelected){
          chPaintMessages();
          window.imu.chat.read(m.from).catch(()=>{});
        } else {
          chUnread.set(m.from, (chUnread.get(m.from) || 0) + 1);
          if (chLoaded) chPaintList();
        }
      });
    }
