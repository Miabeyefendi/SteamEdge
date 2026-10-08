// Hour sync ledger.
//
// Keeps the time remaining to the target per game. Both the parallel and the sequential strategies use it;
// the per-game progress bar in the interface is fed from here too.
//
// It lives in its own file for testing: syncing takes hours and its accuracy can only be measured by
// faking the clock. The functions here take the state from outside and accept "now" as a parameter,
// so a 47 hour session can be tested without waiting for real time.

// geride: [{ appid, name, playtimeMin }] - games that are below the target
function setupLedger(behind, targetMin) {
  const gameList = new Map();
  (behind || []).forEach((g) => gameList.set(g.appid, {
    appid: g.appid,
    name: g.name || ('App ' + g.appid),
    baslangicMin: g.playtimeMin || 0,
    kalanMs: Math.max(0, (targetMin - (g.playtimeMin || 0)) * 60000),
    gecenMs: 0,
    bitti: false,
  }));
  return gameList;
}

// Adds the time elapsed since the last update to the games that are OPEN - Steam counts it the same way,
// a game that is not running earns no time. Marks the ones that reached the target and returns them.
function applyLedger(status, currentTime) {
  if (!status || !status.oyunlar) return [];
  const t = currentTime == null ? Date.now() : currentTime;
  const passed = Math.max(0, t - (status.sonHesap == null ? t : status.sonHesap));
  status.sonHesap = t;
  if (passed > 0) {
    (status.aktif || []).forEach((id) => {
      const o = status.oyunlar.get(id);
      if (o && !o.bitti) { o.kalanMs = Math.max(0, o.kalanMs - passed); o.gecenMs += passed; }
    });
  }
  const finished = [];
  status.oyunlar.forEach((o) => {
    if (!o.bitti && o.kalanMs <= 0) { o.bitti = true; finished.push(o); }
  });
  return finished;
}

// The next active set: games with the most time left go first (LPT). The bottleneck game starts
// early, so the total time comes as close to the minimum as it can.
function nextActiveSet(status) {
  if (!status || !status.oyunlar) return [];
  const remainders = [...status.oyunlar.values()].filter((o) => !o.bitti);
  remainders.sort((a, b) => b.kalanMs - a.kalanMs);
  return remainders.slice(0, Math.max(1, status.limit || 32)).map((o) => o.appid);
}

// The list sent to the interface. The ledger is only updated when a game reaches the target (or the step changes);
// the time in between is added LIVE here, otherwise the screen would not move at all between two events.
function uiList(status, currentTime) {
  if (!status || !status.oyunlar) return [];
  const t = currentTime == null ? Date.now() : currentTime;
  const activeSet = new Set(status.aktif || []);
  const pending = Math.max(0, t - (status.sonHesap == null ? t : status.sonHesap));
  return [...status.oyunlar.values()].map((o) => {
    const extra = (!o.bitti && activeSet.has(o.appid)) ? Math.min(pending, o.kalanMs) : 0;
    return {
      appid: o.appid,
      name: o.name,
      baslangicMin: o.baslangicMin,
      suankiMin: o.baslangicMin + Math.floor((o.gecenMs + extra) / 60000),
      kalanMs: Math.max(0, o.kalanMs - extra),
      aktif: activeSet.has(o.appid),
      bitti: !!o.bitti,
    };
  });
}

// The time that has to pass until the remaining work is done. Because the active set is capped by the limit,
// this is the total of the queue simulation, not "the remaining time of the game with the most left".
function remainingTotalMs(status) {
  if (!status || !status.oyunlar) return 0;
  const remaining = new Map();
  status.oyunlar.forEach((o) => { if (!o.bitti && o.kalanMs > 0) remaining.set(o.appid, o.kalanMs); });
  const container = Math.max(1, Math.min(32, status.limit || 32));
  let sumTotal = 0, security = 0;
  while (remaining.size && security++ < 500) {
    const sequential = [...remaining.entries()].sort((a, b) => b[1] - a[1]).slice(0, container);
    const dt = Math.min(...sequential.map((x) => x[1]));
    sumTotal += dt;
    sequential.forEach(([id, ms]) => {
      const newItem = ms - dt;
      if (newItem <= 0) remaining.delete(id); else remaining.set(id, newItem);
    });
  }
  return sumTotal;
}

module.exports = { defterKur: setupLedger, defteriIsle: applyLedger, siradakiAktifKume: nextActiveSet, arayuzListesi: uiList, kalanToplamMs: remainingTotalMs };
