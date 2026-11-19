// Steam answers /profiles/<id>/... of an account with a custom address by redirecting to /id/<name>/..., and Chromium's network stack drops the Cookie
// header we set by hand when it follows that redirect: the badge page came back as seen by a visitor and card farming could not read its list (November
// 2026; found with the real accounts). The pages of the account itself are asked for at the final address, and an account without a custom address keeps
// the /profiles/ form. A custom address that could not be read (no network) is not kept for good.
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
    eng.urls = [];
    eng.calls = 0;
    eng._requestItem = async (url) => {
      eng.urls.push(url);
      if (/\?xml=1/.test(url)) { eng.calls++; if (xml instanceof Error) throw xml; return { text: async () => xml }; }
      return { text: async () => 'g_steamID = "76561198000000001"; <div class="badge_row"><a href="steam://run/5"></a>2 card drops remaining</div>' };
    };
    return eng;
  };

  let eng = make('<profile><customURL><![CDATA[my_name]]></customURL></profile>');
  let r = await eng.getDropGames(true);
  check('an account with a custom address reads its badge page at /id/<name>/', eng.urls.some((u) => u === 'https://steamcommunity.com/id/my_name/badges/?l=english&p=1') && !eng.urls.some((u) => /profiles\/\d+\/badges/.test(u)), JSON.stringify(eng.urls));
  check('and the read works', r.gameEntries.length === 1 && r.complete === true);
  await eng.getInventorySources();
  check('the inventory page and the wallet fallback use the same address', eng.urls.some((u) => u === 'https://steamcommunity.com/id/my_name/inventory/?l=english'));
  check('the custom address is asked for once', eng.calls === 1, String(eng.calls));

  eng = make('<profile><steamID64>76561198000000001</steamID64><customURL></customURL></profile>');
  await eng.getDropGames(true);
  check('an account without a custom address keeps /profiles/<id>/', eng.urls.includes('https://steamcommunity.com/profiles/76561198000000001/badges/?l=english&p=1'), JSON.stringify(eng.urls));

  eng = make(new Error('fetch failed'));
  await eng.getDropGames(true);
  check('no network for the custom address: the page is still asked, at /profiles/', eng.urls.some((u) => /profiles\/\d+\/badges/.test(u)));
  await eng.getDropGames(true);
  check('a custom address that could not be read is not kept for good: it is asked for again', eng.calls === 2, String(eng.calls));

  eng = make('<profile><customURL>a b/c</customURL></profile>');
  await eng.getDropGames(true);
  check('the name is escaped in the address', eng.urls.some((u) => u.startsWith('https://steamcommunity.com/id/a%20b%2Fc/badges/')), JSON.stringify(eng.urls));

  // opening a booster pack posts to the account's own address too
  eng = make('<profile><customURL>my_name</customURL></profile>');
  const posted = [];
  eng.cookies = ['steamLoginSecure=x', 'sessionid=abc'];
  eng._fetch = async (url, o) => { posted.push([url, o.headers.Referer]); return { ok: true, json: async () => ({ success: 1, rgItems: [] }) }; };
  await eng.unpackBooster('1', 440);
  check('a booster pack is opened at /id/<name>/ajaxunpackbooster/', posted[0] && posted[0][0] === 'https://steamcommunity.com/id/my_name/ajaxunpackbooster/' && posted[0][1] === 'https://steamcommunity.com/id/my_name/inventory', JSON.stringify(posted));

  // the message of the refused page says what happened
  eng = make('<profile></profile>');
  eng._requestItem = async () => ({ text: async () => 'g_steamID = false; <div class="badge_row"></div>' });
  const events = [];
  eng.onEvent = (n, d) => events.push(n + ' ' + d);
  let msg = '';
  try { await eng.getDropGames(true); } catch (e) { msg = e.message; }
  check('a page seen as a visitor is refused with a message that says what it means', /rozet sayfas|badge page/i.test(msg) && !/oturum açılmadan/.test(msg), msg);
  check('and events.log gets a line for it', events.some((e) => /^badges\.fail not the owner view \(g_steamID false\)/.test(e)), JSON.stringify(events));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + (e && e.stack)); process.exit(1); });
