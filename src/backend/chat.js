// Moved out of main.js unchanged (chat). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { ipcMain, log } = ctx;

  // ---- CHAT ----
  // All of it goes through the ACTIVE account's engine. The chat of background accounts is not looked at:
  // there is a single identity on screen, showing two accounts' conversations in the same list would be confusing.
  function chatEngine() {
    if (!ctx.engineReady || !ctx.engine) return null;
    return ctx.engine;
  }
  ipcMain.handle('chat:friends', async () => {
    const e = chatEngine();
    if (!e) return { ok: false, error: 'Bağlı değil.' };
    try { return { ok: true, friends: await e.getFriends() }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('chat:conversations', async () => {
    const e = chatEngine();
    if (!e) return { ok: false, error: 'Bağlı değil.' };
    try { return { ok: true, conversationList: await e.getConversations() }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('chat:history', async (_ev, arg) => {
    const e = chatEngine();
    if (!e) return { ok: false, error: 'Bağlı değil.' };
    const { steamid, itemCount: count } = arg || {};
    if (!steamid) return { ok: false, error: 'Kişi seçilmedi.' };
    try { return Object.assign({ ok: true }, await e.getChatHistory(steamid, count)); }
    catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('chat:send', async (_ev, arg) => {
    const e = chatEngine();
    if (!e) return { ok: false, error: 'Bağlı değil.' };
    const { steamid, textValue: text } = arg || {};
    try {
      const r = await e.sendChat(steamid, text);
      log('info', 'chat: message sent -> ' + steamid);
      return { ok: true, ts: r.ts };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  ipcMain.handle('chat:read', async (_ev, steamid) => {
    const e = chatEngine();
    if (!e) return { ok: false };
    await e.markChatRead(steamid);
    return { ok: true };
  });
  ipcMain.on('chat:typing', (_ev, steamid) => {
    const e = chatEngine();
    if (e && steamid) e.sendTyping(steamid);
  });


  return {};
};
