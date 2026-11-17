// "Unlock achievements while farming": the wait for the next achievement counts from the account's last unlock, kept in its file, so an app that is
// closed and opened again does not start the 20 to 40 minutes over every time (an account got nothing in 13 hours that way).
// Run with `npm test` (tests/run.js).
const vm = require('vm');
const src = require('../main-source')();
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const code = src.slice(src.indexOf('function startCardWatcher(steamID, gameList)'), src.indexOf('async function watchCards(steamID)'));

const NOW = 1000000000000;
function start(accountData) {
  const writes = [];
  const slot = { watcher: null };
  const ctx = {
    console, Math, Map, Date: class { static now() { return NOW; } },
    accounts: new Map([['1', slot]]), CARD_WATCH_MS: 180000,
    setInterval: () => 1, clearInterval: () => {}, watchCards: () => {}, openCardAchievements: () => {},
    accountData: () => accountData, writeAccountDataDelayed: () => writes.push(1),
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.run = startCardWatcher;', ctx);
  ctx.run('1', [{ appid: 5, remaining: 3, name: 'g' }]);
  return { slot, writes };
}

// an account that unlocked one 50 minutes ago: after a restart the wait is already over
{
  const data = { farmAchAt: NOW - 50 * 60000 };
  const r = start(data);
  check('a restart keeps the time of the last unlock', r.slot.watcher.lastAchievement === NOW - 50 * 60000, String(r.slot.watcher.lastAchievement));
  check('and writes nothing new', r.writes.length === 0);
}
// an account that never counted: it starts counting now and keeps that time
{
  const data = { farmAchAt: 0 };
  const r = start(data);
  check('first farm: counting starts now', r.slot.watcher.lastAchievement === NOW && data.farmAchAt === NOW);
  check('and it is written to the account file', r.writes.length === 1);
}
process.exit(failures ? 1 : 0);
