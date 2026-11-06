// Moved out of the SteamEngine class unchanged. The methods are added to its prototype in steamEngine.js.
const translation = require('../translation');
module.exports = function engine_chat() {
  return {
    // ================== CHAT ==================
    // Steam chat does not need the client: node-steam-user's chat component gives the friend
    // list, the history and sending over the protocol. Incoming messages were already caught
    // by the 'friendMessage' event (see above), only the interface was missing.
    //
    // NOTE: there are no Steam GROUP chats here, only one-to-one friend messages.
    // Group chat is a separate concept (chatroom groups) and needs a screen of its own.

    // Friend list. myFriends gives steamID -> relationship type; 3 = mutual friends.
    // Name and avatar come from getPersonas, all in a single request.
    async getFriends() {
      const relations = this.user.myFriends || {};
      const idler = Object.keys(relations).filter((id) => relations[id] === 3);
      if (!idler.length) return [];
      // getPersonas gets slow with many ids; we split them into groups of 100.
      const people = {};
      for (let i = 0; i < idler.length; i += 100) {
        const group = idler.slice(i, i + 100);
        // eslint-disable-next-line no-await-in-loop
        const p = await new Promise((res) => {
          try { this.user.getPersonas(group, (err, r) => res(err ? {} : (r || {}))); }
          catch (_) { res({}); }
        });
        Object.assign(people, p);
      }
      return idler.map((id) => {
        const k = people[id] || {};
        return {
          steamid: id,
          persona: k.player_name || translation.tf('Kullanıcı #', id.slice(-4)),
          avatar: k.avatar_url_medium || k.avatar_url_icon || null,
          // 0 = offline, 1 = online, others busy/away etc.
          condition: typeof k.persona_state === 'number' ? k.persona_state : 0,
          gameEntry: k.game_name || null,
        };
      }).sort((a, b) => {
        if ((b.condition > 0) !== (a.condition > 0)) return (b.condition > 0) ? 1 : -1;
        return a.persona.localeCompare(b.persona, 'tr');
      });
    },

    // Recent conversations: who we wrote with, when last, how many unread.
    async getConversations() {
      const r = await this.user.chat.getActiveFriendMessageSessions({}).catch(() => null);
      if (!r || !Array.isArray(r.sessions)) return [];
      return r.sessions.map((s) => ({
        steamid: s.steamid_friend ? s.steamid_friend.toString() : null,
        lastMessageTs: s.last_message ? new Date(s.last_message).getTime() : 0,
        unreadCount: s.unread_message_count || 0,
      })).filter((s) => s.steamid);
    },

    // A conversation with one person. Steam gives newest to oldest, it is reversed for the interface.
    async getChatHistory(steamid, count) {
      const r = await this.user.chat.getFriendMessageHistory(steamid, {
        maxCount: Math.max(1, Math.min(200, +count || 50)),
      });
      const mine = this.user.steamID ? this.user.steamID.toString() : null;
      const messages = (r && r.messages ? r.messages : []).map((m) => ({
        senderName: m.sender ? m.sender.toString() : null,
        me: !!(mine && m.sender && m.sender.toString() === mine),
        textValue: String(m.message || ''),
        ts: m.server_timestamp ? m.server_timestamp.getTime() : 0,
        unreadCount: !!m.unread,
      }));
      messages.sort((a, b) => a.ts - b.ts);
      return { messageList: messages, hasMore: !!(r && r.more_available) };
    },

    async sendChat(steamid, text) {
      const t = String(text || '').trim();
      if (!t) throw new Error(translation.t('Boş mesaj gönderilemez.'));
      await this.user.chat.sendFriendMessage(steamid, t);
      return { ts: Date.now() };
    },

    // Mark as read - so it also shows as read on Steam and does not notify again on the phone.
    async markChatRead(steamid) {
      try { await this.user.chat.ackFriendMessage(steamid, new Date()); } catch (_) { /* onemsiz */ }
      return true;
    },

    // "Typing..." notification. So the other side sees it; if it fails it does not matter.
    sendTyping(steamid) {
      try { this.user.chat.sendFriendTyping(steamid); } catch (_) {}
    },

    // Deliberate exit: NO reconnect attempt is made (so it does not collide with the G3 loop).
  };
};
