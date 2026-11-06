// Moved out of the SteamEngine class unchanged. The methods are added to its prototype in steamEngine.js.
const translation = require('../translation');
module.exports = function engine_store({ SteamEngine }) {
  return {
    async claimFreeApp(appid) {
      if (!this.user || !this.isConnected) throw new Error(translation.t('Steam oturumu yok'));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Request timed out')), 30000);
        this.user.requestFreeLicense([+appid], (err, packages, apps) => {
          clearTimeout(timer);
          if (err) {
            if (err.eresult !== undefined) resolve({ ok: false, detail: err.eresult, granted: false, packages: [] });
            else reject(err);
            return;
          }
          resolve({ ok: true, granted: !!((apps && apps.length) || (packages && packages.length)), packages: packages || [] });
        });
      });
    },

    async redeemKey(key) {
      if (!this.user || !this.isConnected) throw new Error(translation.t('Steam oturumu yok'));
      try {
        const r = await this.user.redeemKey(key);
        return { ok: true, detail: r.purchaseResultDetails, packages: r.packageList || {} };
      } catch (e) {
        if (e && e.purchaseResultDetails !== undefined) {
          return { ok: false, detail: e.purchaseResultDetails, packages: e.packageList || {} };
        }
        throw e;
      }
    },

    // ---- BOOSTER PACKS ----
    async unpackBooster(assetId, appid) {
      if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
      const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
      if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
      const r = await this._fetch(`https://steamcommunity.com/profiles/${this.steamID}/ajaxunpackbooster/`, {
        method: 'POST',
        headers: {
          Cookie: this.cookieHeader(),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: `https://steamcommunity.com/profiles/${this.steamID}/inventory`,
          Origin: 'https://steamcommunity.com',
          'User-Agent': SteamEngine.UA,
        },
        body: new URLSearchParams({ sessionid: sidCookie.split('=')[1], appid: String(+appid), communityitemid: String(assetId) }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || +j.success !== 1) {
        throw new Error(translation.t('Booster paketi açılamadı'));
      }
      const items = Array.isArray(j.rgItems) ? j.rgItems.map((x) => ({ name: x.name || '?', foil: !!x.foil })) : [];
      return { ok: true, items };
    },

    // ---- STEAM FAMILY VIEW (parental PIN) ----
    // With Family View on, the web endpoints answer with the "unlock" page until the PIN has been entered.
    // The PIN is sent once per web session and Steam answers with a `steamparental` cookie that is added to ours.
    async unlockParental(pin) {
      if (!this.cookies) throw new Error(translation.t('web oturumu yok'));
      const sidCookie = this.cookies.find((c) => c.startsWith('sessionid='));
      if (!sidCookie) throw new Error(translation.t('Steam web oturumu henüz hazır değil'));
      const r = await this._fetch('https://steamcommunity.com/parental/ajaxunlock', {
        method: 'POST',
        headers: {
          Cookie: this.cookieHeader(),
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: 'https://steamcommunity.com/',
          Origin: 'https://steamcommunity.com',
          'User-Agent': SteamEngine.UA,
        },
        body: new URLSearchParams({ pin: String(pin), sessionid: sidCookie.split('=')[1] }),
      });
      const j = await r.json().catch(() => null);
      if (!j || !j.success) throw new Error(translation.t("Aile Görünümü PIN'i reddedildi"));
      const set = (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
        .map((c) => c.split(';')[0]).filter((c) => c.startsWith('steamparental='));
      if (set.length) this.cookies = this.cookies.filter((c) => !c.startsWith('steamparental=')).concat(set);
      return { ok: true };
    },

    // Low-level: encode `msgType`→buffer, send EMsg, decode the job-response buffer with `respType`.
    // We do the protobuf encode/decode ourselves because steam-user doesn't map these EMsgs.
    // Protocol request. Steam sometimes does not answer a single request at all; this used to surface directly as
    // "Steam stats reply timed out" and leave the achievements page empty.
    // Now it counts as transient and is tried once more, and the message says what to do.
  };
};
