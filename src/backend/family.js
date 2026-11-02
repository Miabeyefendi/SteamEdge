// Moved out of main.js unchanged (family). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { accountData, accountName, accounts, ipcMain, log, shell, storeLists } = ctx;

  // ================== FAMILY VIEW PIN ==================
  // The PIN is unlocked on every new web session (see steamEngine webSession). When it is changed in Settings the
  // running session is unlocked again right away.
  function applyParentalPin(steamID) {
    const s = accounts.get(steamID);
    const pin = accountData(steamID).parentalPin || '';
    if (!s || !s.engine) return;
    s.engine.parentalPin = pin;
    if (!pin || !s.engine.cookies) return;
    s.engine.unlockParental(pin)
      .then(() => { s.engine.parentalState = 'unlocked'; log('info', `[${accountName(steamID)}] Family View unlocked`); })
      .catch((e) => { s.engine.parentalState = 'rejected'; log('warn', `[${accountName(steamID)}] Family View PIN: ${(e && e.message) || 'rejected'}`); });
  }

  // External links - only the expected domain names (so a random URL cannot be opened).
  ipcMain.on('open:external', (_e, url) => {
    if (typeof url !== 'string') return;
    // The "Open release page" button of the update window opens the release address; the allow
    // list used to recognise only the profile address and the button silently did nothing.
    if (/^https:\/\/steamcommunity\.com\//.test(url) || /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/?$/.test(url)
        || /^https:\/\/github\.com\/Miabeyefendi\/SteamEdge\/releases(\/[A-Za-z0-9_.\/-]*)?$/.test(url)) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle('engine:ownedGames', async () => {
    if (!ctx.engineReady || !ctx.engine) return { ok: false, error: 'Bağlı değil.' };
    try {
      const games = await ctx.engine.getOwnedGames();
      storeLists('owned', games);
      return { ok: true, games };
    } catch (e) { return { ok: false, error: e.message }; }
  });


  return { applyParentalPin };
};
