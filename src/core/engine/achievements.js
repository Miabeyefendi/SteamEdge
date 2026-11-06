// Moved out of the SteamEngine class unchanged. The methods are added to its prototype in steamEngine.js.
const translation = require('../translation');
const rarityCache = require('../rarityCache');
// steam-user's internal protobufs map doesn't register the user-stats messages, so we encode/decode
// them ourselves from its generated schema and hand raw buffers to _send.
const Schema = require('steam-user/protobufs/generated/_load.js');
module.exports = function engine_achievements({ SteamEngine }) {
  return {
    async _getUserStatsRaw(appid) {
      if (!this.steamID) throw new Error(translation.t('Steam oturumu yok'));
      const resp = await this._sendRecv(818 /* ClientGetUserStats */,
        Schema.CMsgClientGetUserStats, { game_id: String(appid), crc_stats: 0, schema_local_version: 0, steam_id_for_user: this.steamID },
        Schema.CMsgClientGetUserStatsResponse);
      if (!resp || !resp.schema || !resp.schema.length) return null;
      const schemaBuf = Buffer.isBuffer(resp.schema) ? resp.schema : Buffer.from(resp.schema);
      const root = SteamEngine._parseBinaryKV(schemaBuf);
      // top level is keyed by appid; grab the object that has a "stats" child
      let appObj = root[String(appid)] || Object.values(root).find((v) => v && typeof v === 'object' && v.stats);
      const statsSchema = (appObj && appObj.stats) || {};
      // the binary schema stores a value that looks like a number as an integer (some games name their achievements "1", "2"...): every name is made text here
      const loc = (v) => { const x = (v && typeof v === 'object') ? (v.turkish || v.english || Object.values(v)[0]) : v; return x == null ? '' : String(x); };
      const defs = [];
      for (const statId of Object.keys(statsSchema)) {
        const st = statsSchema[statId];
        if (!st || typeof st !== 'object' || !st.bits) continue; // only achievement-bit stats have "bits"
        for (const endIdx of Object.keys(st.bits)) {
          const b = st.bits[endIdx];
          if (!b || typeof b !== 'object') continue;
          const disp = b.display || {};
          defs.push({
            statId: +statId, finishAt: +endIdx,
            apiName: b.name != null && b.name !== '' ? String(b.name) : (statId + '_' + endIdx),
            name: loc(disp.name) || loc(b.name) || '?',
            desc: loc(disp.desc) || '',
            icon: disp.icon || null, iconGray: disp.icon_gray || null,
            // Steam schema fields:
            //   permission bit 0 (1) = hidden achievement (its description is hidden until unlocked)
            //   permission bit 1 (2) = PROTECTED - only the game server can write it.
            // Writing protected ones from the client always returns EResult 8 (InvalidParam).
            // This field used to be ignored completely (it was dead code, `? false : false`), so the
            // user got an error without understanding why.
            hidden: (+(b.permission || 0) & 1) === 1,
            protectedFlag: (+(b.permission || 0) & 2) === 2,
          });
        }
      }
      const statValues = new Map();
      (resp.stats || []).forEach((s) => statValues.set(s.stat_id >>> 0, (s.stat_value >>> 0)));
      return { crc: resp.crc_stats >>> 0, defs, statValues, appid: +appid };
    },

    // Global unlock % per achievement (public endpoint, no auth needed) - real rarity data used for the "Rare / Ultra-Rare" filter and for the order of Realistic Mode
    // (from the most common to the rarest). Never fabricated: { map, ok, source }. ok is false only when the request failed and nothing was kept from before; a game for
    // which Steam answers with an empty list is a valid, empty answer. An answer is kept for a day and a stale one is used when Steam does not answer (see rarityCache.js).
    async fetchAchievementRarity(appid) {
      const fresh = rarityCache.get(appid, true);
      if (fresh) return { map: fresh.map, ok: true, source: 'cache' };
      for (let round = 0; round < 2; round++) {
        try {
          const url = `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`;
          const r = await this._requestItem(url, { withCookies: false, attemptCount: 3, timeoutLimitMs: 15000 }, 'Nadirlik');
          const j = await r.json().catch(() => null);
          if (j && j.achievementpercentages) {
            const list = j.achievementpercentages.achievements || [];
            const map = {};
            // NOTE - Steam returns the `percent` field as a STRING (e.g. "74.1"). If we do not convert it to a number the rarity stays null.
            list.forEach((a) => {
              const n = parseFloat(a.percent);
              if (!isNaN(n)) map[a.name] = n;
            });
            rarityCache.set(appid, map);
            return { map, ok: true, source: 'steam' };
          }
        } catch (_) { /* try once more, then fall back to what was kept */ }
        if (round === 0) await new Promise((res) => setTimeout(res, 2000));
      }
      const old = rarityCache.get(appid, false);
      if (old) return { map: old.map, ok: true, source: 'stale' };
      return { map: {}, ok: false, source: 'none' };
    },

    async getAchievementRarity(appid) {
      return (await this.fetchAchievementRarity(appid)).map;
    },

    // This account's own unlock timestamps, via the same access_token auth as getOwnedGames.
    // Best-effort: empty map on any failure (private profile, no token, endpoint down, ...).
    async getAchievementUnlockTimes(appid) {
      try {
        const token = this._accessToken();
        if (!token) return {};
        const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?access_token=${encodeURIComponent(token)}&steamid=${this.steamID}&appid=${appid}&format=json`;
        const r = await this._requestItem(url, { attemptCount: 2, timeoutLimitMs: 12000 }, 'Açılma tarihleri');
        const j = await r.json().catch(() => null);
        const list = (j && j.playerstats && j.playerstats.achievements) || [];
        const map = {};
        list.forEach((a) => { if (a.achieved && a.unlocktime) map[a.apiname] = a.unlocktime * 1000; });
        return map;
      } catch (_) { return {}; }
    },

    // Read-only view: achievement list with real unlock state. Works headless over the Steam
    // protocol (same path ASF uses), independent of profile privacy. null if game has no achievements.
    // Rarity % and unlock timestamps are best-effort extras from the Web API; null when unavailable.
    async getAchievements(appid, force) {
      if (force) this.invalidateStats(appid);
      // The same cache is shared with setAchievements: the values we wrote show up here too,
      // so when you come back to the page the tick of the achievement we unlocked is not lost.
      const raw = await this._statsCached(appid);
      if (!raw || !raw.defs.length) return null;
      const iconUrl = (f) => (f ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${f}` : null);
      const [rarity, unlockMap] = await Promise.all([
        this.fetchAchievementRarity(appid),
        this.getAchievementUnlockTimes(appid),
      ]);
      const rarityMap = rarity.map;
      const achievements = raw.defs.map((d) => {
        const val = raw.statValues.get(d.statId >>> 0) || 0;
        // the protectedFlag is carried to the interface (it is added to the object below)
        const achieved = !!((val >> d.finishAt) & 1);
        const pct = rarityMap[d.apiName];
        return {
          apiName: d.apiName, name: d.name, desc: d.desc, achieved,
          icon: iconUrl(achieved ? d.icon : (d.iconGray || d.icon)),
          unlockTime: unlockMap[d.apiName] || null,
          // In some games (e.g. CS2) Steam returns only a few achievements from this endpoint;
          // for the ones that do not match the rarity stays unknown - no made-up value is produced.
          rarityPct: Number.isFinite(pct) ? pct : null,
          // G4: an achievement that only the game server can write. The interface marks it and
          // makes it unselectable in bulk operations; sending it would always return EResult 8.
          protectedFlag: !!d.protectedFlag,
          isHidden: !!d.hidden,
        };
      });
      return { gameName: null, logo: null, total: achievements.length, unlocked: achievements.filter((a) => a.achieved).length, achievements, rarityOk: rarity.ok, rarityKnown: achievements.filter((a) => Number.isFinite(a.rarityPct)).length };
    },

    // Unlock/lock achievements headless (ASF-style: CMsgClientStoreUserStats2). `changes` is
    // [{apiName, unlock:true|false}]. Modifies the account permanently (reversible by re-locking).
    // Schema + values cache: calling ClientGetUserStats from scratch on every single achievement operation
    // made every click wait for seconds. The schema does not change; after writing stat values
    // we update them locally in the cache, so back to back operations are instant.
    async _statsCached(appid) {
      this._statsCache = this._statsCache || new Map();
      const hit = this._statsCache.get(appid);
      if (hit && Date.now() - hit.ts < 5 * 60 * 1000) return hit.raw;
      const raw = await this._getUserStatsRaw(appid);
      if (raw) this._statsCache.set(appid, { raw, ts: Date.now() });
      return raw;
    },
    invalidateStats(appid) {
      if (this._statsCache) { if (appid == null) this._statsCache.clear(); else this._statsCache.delete(appid); }
    },

    // G5: for some games Steam only accepts writing statistics while that game looks "being played".
    // It opens the game for the duration of the write and returns to the previous state when done.
    // If a card/hour job is running it is ADDED to that list, not written over it.
    async _keepGameOpen(appid, isFn) {
      const previousOnes = (this._playing || []).slice();
      const alreadyOpen = previousOnes.includes(+appid);
      if (!alreadyOpen && !this.playingBlocked) {
        try { this.user.gamesPlayed(previousOnes.concat([+appid])); } catch (_) {}
        // Steam needs a short moment to process the "playing" state
        await new Promise((r) => setTimeout(r, 1200));
      }
      try {
        return await isFn();
      } finally {
        if (!alreadyOpen && !this.playingBlocked) {
          try { this.user.gamesPlayed(previousOnes); } catch (_) {}
        }
      }
    },

    async setAchievements(appid, changes) {
      return this._keepGameOpen(appid, () => this._setAchievementsInner(appid, changes));
    },

    // Steam checks every write against the crc of the stats it holds and answers with the new crc. The old code kept the crc it had read, so the second write to a game
    // was refused (EResult 8), the cache was dropped and the third went through: about half of a run's unlocks failed (measured, 1.7.6). The answer's crc is kept now,
    // and a write refused on a crc read before the last write is tried once more on a fresh read.
    async _setAchievementsInner(appid, changes, again) {
      const raw = await this._statsCached(appid);
      if (!raw) throw new Error(translation.t('Bu oyunun başarım şeması yok'));
      const byName = new Map(raw.defs.map((d) => [d.apiName, d]));
      // G4: filter out protected achievements before sending - Steam rejects them anyway,
      // sending them only inflates the error counter and keeps the loop busy for nothing.
      const protectedOnes = changes.filter((c) => {
        const d = byName.get(c.apiName);
        return d && d.protectedFlag;
      });
      if (protectedOnes.length === changes.length && changes.length) {
        const e = new Error(translation.t('Bu başarım oyun tarafından korunuyor, dışarıdan açılamaz.'));
        e.protectedFlag = true;
        throw e;
      }
      const dirty = new Map(); // statId -> new value
      for (const c of changes) {
        const d = byName.get(c.apiName);
        if (!d || d.protectedFlag) continue;
        let val = dirty.has(d.statId) ? dirty.get(d.statId) : (raw.statValues.get(d.statId >>> 0) || 0);
        val = c.unlock ? (val | (1 << d.finishAt)) : (val & ~(1 << d.finishAt));
        dirty.set(d.statId, val >>> 0);
      }
      if (!dirty.size) return { ok: true, changed: 0 };
      const stats = [...dirty.entries()].map(([stat_id, stat_value]) => ({ stat_id, stat_value }));
      const resp = await this._sendRecv(5466 /* ClientStoreUserStats2 */,
        Schema.CMsgClientStoreUserStats2, {
          game_id: String(appid), settor_steam_id: this.steamID, settee_steam_id: this.steamID,
          crc_stats: raw.crc, explicit_reset: false, stats,
        }, Schema.CMsgClientStoreUserStatsResponse);
      const eresult = resp && typeof resp.eresult !== 'undefined' ? resp.eresult : 2;
      if (eresult !== 1) {
        this.invalidateStats(appid);   // the crc may have gone stale, fetch fresh on the next attempt
        if (eresult === 8 && !again) return this._setAchievementsInner(appid, changes, true);
        throw new Error(translation.tf('Steam kaydı reddetti (EResult #)', eresult));
      }
      // Update the values we wrote in the cache too so the next operation computes from the right base
      dirty.forEach((val, statId) => raw.statValues.set(statId >>> 0, val));
      if (resp.crc_stats != null) raw.crc = resp.crc_stats >>> 0;
      else this.invalidateStats(appid);
      return { ok: true, changed: changes.length };
    },

    // Changing the visibility live while the session is OPEN (the top bar and Settings > Privacy call it at once); a logon applies it itself.
    // persona: the account's visibility chosen in the top bar. "Hide the game name": Steam shows the game being played to everyone who can
    // see you; the only real way to hide it is to go invisible. So that switch makes you invisible ONLY while a game is being played and
    // gives back the chosen visibility when it ends. Card drops are not affected.
  };
};
