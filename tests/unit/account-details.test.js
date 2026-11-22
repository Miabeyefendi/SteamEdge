// The account card in Settings shows what Steam says about the account (SteamEngine.getAccountDetails): the protocol part (country, account type,
// friends and groups) and the profile page part (member since, real name, privacy...). A part that fails is left out. Bans, Steam Guard and the e-mail are not part of it.
// Run with `npm test` (tests/run.js).
const path = require('path');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const { createFakeSteam, loadEngine } = require('./fake-steam-user.js');

(async () => {
  const { FakeSteamUser } = createFakeSteam();
  const SteamEngine = loadEngine(FakeSteamUser);

  const make = (xml) => {
    const eng = new SteamEngine();
    eng.cookies = ['steamLoginSecure=x']; eng.steamID = '76561198000000001';
    eng.xmlCalls = 0;
    eng._requestItem = async () => { eng.xmlCalls++; if (xml instanceof Error) throw xml; return { text: async () => xml }; };
    eng.user.accountInfo = { name: 'tester', country: 'TR', authedMachines: 3 };
    eng.user.limitations = { limited: false, communityBanned: false, locked: false, canInviteFriends: true };
    eng.user.myFriends = { a: 3, b: 3, c: 2 };
    eng.user.myGroups = { g: 3 };
    return eng;
  };

  const xml = '<profile><privacyState>public</privacyState><realname><![CDATA[Test Person]]></realname><location><![CDATA[Istanbul]]></location>'
    + '<memberSince>November 5, 2011</memberSince><tradeBanState>None</tradeBanState><hoursPlayed2Wk>12.5</hoursPlayed2Wk><customURL><![CDATA[my_name]]></customURL></profile>';
  let eng = make(xml);
  let d = await eng.getAccountDetails();
  check('the protocol part is read', d.country === 'TR' && d.authedMachines === 3 && d.limited === false && d.friends === 2 && d.groups === 1, JSON.stringify(d));
  check('bans, Steam Guard and the e-mail are not returned', !('email' in d) && !('steamGuard' in d) && !('vacBans' in d) && !('communityBanned' in d) && !('tradeBan' in d), JSON.stringify(d));
  check('the profile page part is read', d.memberSince === 'November 5, 2011' && d.realName === 'Test Person' && d.location === 'Istanbul' && d.privacy === 'public' && d.hours2Weeks === 12.5, JSON.stringify(d));
  await eng.getVanityURL();
  check('the custom address and the details share one page request', eng.xmlCalls === 1, String(eng.xmlCalls));

  // the page does not answer: only what is known is returned
  eng = make(new Error('offline'));
  d = await eng.getAccountDetails();
  check('a part that fails is left out, not invented', d.friends === 2 && d.memberSince === undefined && d.country === 'TR', JSON.stringify(d));

  eng = new SteamEngine();
  let refused = false;
  try { await eng.getAccountDetails(); } catch (_) { refused = true; }
  check('without a session it refuses', refused);

  process.exit(failures ? 1 : 0);
})();
