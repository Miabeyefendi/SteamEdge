// Inventories of other games (Counter-Strike 2, Dota 2...): the market keys, the source list read from the inventory page, and the engine reading,
// pricing and selling them against mocked replies. Run with `npm test` (tests/run.js).
const path = require('path');
const src = path.resolve(__dirname, '..', '..', 'src', 'core');
const { COMMUNITY, marketKey, splitMarketKey, validSource, sourceId, parseSourceId, parseAppContexts, FALLBACK_SOURCES } = require(path.join(src, 'inventorySources.js'));
const SteamEngine = require(path.join(src, 'steamEngine.js'));
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

// ---- market keys ----
check('a Steam community item keeps its own name as the key', marketKey(753, '440-Card A') === '440-Card A' && marketKey(0, 'x') === 'x');
check('another game puts itself in front of the name', marketKey(730, 'AK-47 | Redline (Field-Tested)') === '730|AK-47 | Redline (Field-Tested)');
check('an item without a market name has no key', marketKey(730, null) === null && marketKey(753, '') === null);
check('a key splits back into the game and the name Steam knows', JSON.stringify(splitMarketKey('730|AK-47 | Redline (Field-Tested)')) === '{"appid":730,"name":"AK-47 | Redline (Field-Tested)"}');
check('a plain community name is the community market', JSON.stringify(splitMarketKey('440-Card A')) === '{"appid":753,"name":"440-Card A"}' && splitMarketKey(null).name === '');
check('a name with a bar in it does not confuse the split', splitMarketKey('570|A|B').name === 'A|B' && splitMarketKey('570|A|B').appid === 570);
check('the key of every kind of name survives the round trip', ['440-Card', '730|StatTrak™ M4A4 | Howl (Minimal Wear)', '570|Inscribed Compendium'].every((k) => { const x = splitMarketKey(k); return marketKey(x.appid, x.name) === k; }));

// ---- what a page may ask for ----
check('no source means the community inventory', JSON.stringify(validSource(undefined)) === '{"appid":753,"contextId":"6"}' && JSON.stringify(validSource(null)) === JSON.stringify({ appid: COMMUNITY.appid, contextId: COMMUNITY.contextId }));
check('a game and a context are accepted', JSON.stringify(validSource({ appid: 730, contextId: 2 })) === '{"appid":730,"contextId":"2"}');
check('anything that is not a plain number is refused', [{ appid: '730; x', contextId: '2' }, { appid: 730, contextId: '../2' }, { appid: -1, contextId: '2' }, { appid: 1.5, contextId: '2' }, { appid: 730 }, { appid: 99999999999, contextId: '2' }, {}].every((x) => validSource(x) === null));
check('the value of the source list on the page', sourceId(730, '2') === '730:2' && JSON.stringify(parseSourceId('730:2')) === '{"appid":730,"contextId":"2"}' && parseSourceId('x') === null && parseSourceId('730:') === null);

// ---- the inventory page lists the games ----
const ctxData = {
  753: { appid: 753, name: 'Steam', asset_count: 182, rgContexts: { 1: { asset_count: 0, id: '1', name: 'Gifts' }, 6: { asset_count: 182, id: '6', name: 'Community' } } },
  730: { appid: 730, name: 'Counter-Strike 2', asset_count: 38, rgContexts: { 2: { asset_count: 38, id: '2', name: 'Backpack' } } },
  570: { appid: 570, name: 'Dota 2 {beta} "x"', asset_count: 5, rgContexts: { 2: { asset_count: 5, id: '2', name: 'Backpack' } } },
  252490: { appid: 252490, name: 'Rust', asset_count: 0, rgContexts: { 2: { asset_count: 0, id: '2', name: 'Backpack' } } },
  440: { appid: 440, name: 'Team Fortress 2', asset_count: 12, rgContexts: { 2: { asset_count: 10, id: '2', name: 'Backpack' }, 3: { asset_count: 2, id: '3', name: 'Other' } } },
};
const page = '<html><script>var g_rgWalletInfo = {"wallet_fee":1};\n  var g_rgAppContextData = ' + JSON.stringify(ctxData) + ';\n var g_other = {"a":1};</script></html>';
let list = parseAppContexts(page);
check('the games with items come back by name, the community inventory is left out, an empty game too', list && list.map((g) => g.name).join() === 'Counter-Strike 2,Dota 2 {beta} "x",Team Fortress 2', JSON.stringify(list && list.map((g) => g.name)));
check('a game keeps its contexts and the number of items', list && list[0].appid === 730 && list[0].assetCount === 38 && list[0].contexts[0].id === '2' && list[2].contexts.length === 2 && list[2].assetCount === 12);
check('braces and quotes inside a name do not end the block early', list && list[1].appid === 570 && list[1].assetCount === 5);
check('a page without the block gives null (the caller offers the usual games)', parseAppContexts('<html>nothing here</html>') === null && parseAppContexts('') === null && parseAppContexts(null) === null);
check('a block that is cut off or not JSON gives null', parseAppContexts('var g_rgAppContextData = {"730":{"appid":730') === null && parseAppContexts('var g_rgAppContextData = {not json};') === null);
check('the name must be followed by an assignment, not just mentioned', parseAppContexts('// g_rgAppContextData is read later ...........................................{"a":1}') === null);
check('the usual games are there for the day the page has no list', FALLBACK_SOURCES.map((g) => g.appid).join() === '730,570,440,252490' && FALLBACK_SOURCES.every((g) => g.contexts[0].id === '2'));

// ---- the engine ----
const e = new SteamEngine();
e.cookies = ['sessionid=abc123', 'steamLoginSecure=1||tok'];
e.steamID = '76561198000000001';
e._currency = 'USD';
SteamEngine.INVENTORY_PAGE_GAP_MS = 5;
const calls = [];
const resp = (body, init = {}) => ({ ok: init.ok !== false, status: init.status || 200, headers: { getSetCookie: () => [] }, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const desc = (id, extra) => Object.assign({ classid: String(id), instanceid: '0', icon_url: 'icon' + id, tradable: 1, marketable: 1, name: 'Name ' + id, market_name: 'Market Name ' + id, market_hash_name: 'Hash ' + id, type: 'Rifle' }, extra);
let mode = 'cs';
global.fetch = async (url, opts = {}) => {
  calls.push([opts.method || 'GET', String(url), opts.body ? String(opts.body) : '']);
  url = String(url);
  if (url.includes('/inventory/76561198000000001/730/2')) {
    if (mode === 'empty') return resp('null');
    if (mode === 'private') return resp({ success: false, error: 'private' });
    if (url.includes('start_assetid=500')) return mode === 'refuse2' ? resp({}, { ok: false, status: 429 }) : resp({ success: 1, assets: [{ assetid: '600', classid: '3', instanceid: '0', amount: '1' }], descriptions: [desc(3, { market_hash_name: 'StatTrak™ AK | Redline (Field-Tested)', market_name: 'StatTrak™ AK | Redline (Field-Tested)', marketable: 0 })], total_inventory_count: 3 });
    return resp({ success: 1, assets: [{ assetid: '400', classid: '1', instanceid: '0', amount: '1' }, { assetid: '500', classid: '2', instanceid: '0', amount: '25' }], descriptions: [desc(1), desc(2, { market_hash_name: null, marketable: 0, tradable: 0 })], more_items: 1, last_assetid: '500', total_inventory_count: 3 });
  }
  if (url.includes('/inventory/76561198000000001/753/6')) {
    return resp({ success: 1, assets: [{ assetid: '10', classid: '7', instanceid: '0', amount: '1' }], descriptions: [{ classid: '7', instanceid: '0', icon_url: 'c7', tradable: 1, marketable: 1, name: 'Card A', market_hash_name: '440-Card A', type: 'Trading Card', market_fee_app: 440, tags: [{ category: 'item_class', internal_name: 'item_class_2' }, { category: 'Game', internal_name: 'app_440', localized_tag_name: 'Team Fortress 2' }] }] });
  }
  if (url.includes('/profiles/76561198000000001/inventory/')) return resp(mode === 'nopage' ? '<html></html>' : page);
  if (url.includes('priceoverview')) return resp({ success: true, lowest_price: '$1.50', median_price: '$1.40', volume: '12' });
  if (url.includes('pricehistory')) return resp({ success: true, prices: [['Oct 01 2026 01: +0', 2.5, '4']] });
  if (url.includes('/market/listings/')) return resp('<html><title>Market Item</title></html>');
  if (url.includes('/market/sellitem/')) return resp({ success: true, requires_confirmation: 1 });
  return resp({});
};
(async () => {
  // the community inventory is read as before, with the place it lives in
  let items = await e.getInventory();
  check('the default is the community inventory: 753/6, a card with its game', calls[0][1].includes('/753/6?l=english&count=2000') && items.length === 1 && items[0].type === 'card' && items[0].gameName === 'Team Fortress 2' && items[0].appid === 440 && items[0].marketHashName === '440-Card A' && items[0].invApp === 753 && items[0].invContext === '6', JSON.stringify(items[0]));

  // a game's backpack, read in pages
  calls.length = 0;
  items = await e.getInventory(730, '2', 'Counter-Strike 2');
  check('the first page asks for the game and context, the second continues after the last asset', calls.length === 2 && calls[0][1].includes('/730/2?l=english&count=2000') && !calls[0][1].includes('start_assetid') && calls[1][1].endsWith('&start_assetid=500'), calls.map((c) => c[1].slice(-50)).join(' | '));
  check('the pages are put together in Steam\'s order', items.length === 3 && items.map((i) => i.assetId).join() === '400,500,600' && items.map((i) => i.order).join() === '0,1,2');
  check('the full market name is the item name, the key carries the game', items[0].name === 'Market Name 1' && items[0].marketHashName === '730|Hash 1' && items[0].hashName === 'Hash 1', JSON.stringify(items[0]));
  check('the game shows in the Game column, the type text of the game is kept, the type is "other"', items[0].gameName === 'Counter-Strike 2' && items[0].typeText === 'Rifle' && items[0].type === 'other' && items[0].appid === 730);
  check('where it lives is on every item (the sale needs it)', items.every((i) => i.invApp === 730 && i.invContext === '2'));
  check('an item without a market name has no key and is not marketable', items[1].marketHashName === null && items[1].marketable === false && items[1].tradable === false);
  check('a stack keeps its amount', items[1].amount === 25 && items[0].amount === 1);
  check('a name with a trademark sign gets a key too', items[2].marketHashName === '730|StatTrak™ AK | Redline (Field-Tested)' && items[2].marketable === false);
  check('a complete read is not marked incomplete', !items.incomplete);

  mode = 'refuse2';
  items = await e.getInventory(730, '2', 'Counter-Strike 2');
  check('when a later page is refused the first page still comes, marked incomplete', items.length === 2 && items.incomplete === true);
  mode = 'empty';
  items = await e.getInventory(730, '2', 'Counter-Strike 2');
  check('an empty inventory (null) gives an empty list', Array.isArray(items) && items.length === 0);
  mode = 'private';
  let threw = null; try { await e.getInventory(730, '2', 'Counter-Strike 2'); } catch (x) { threw = x; }
  check('a refused first page (private inventory) throws', !!threw);
  mode = 'cs';
  e.cookies = null; threw = null; try { await e.getInventory(730, '2'); } catch (x) { threw = x; } e.cookies = ['sessionid=abc123'];
  check('without a web session nothing is requested', !!threw);

  // the source list
  let got = await e.getInventorySources();
  check('the source list comes from the inventory page', got.found === true && got.list.map((g) => g.appid).join() === '730,570,440', JSON.stringify(got.list.map((g) => g.appid)));
  mode = 'nopage';
  got = await e.getInventorySources();
  check('a page without the list gives the usual games and says it was not found', got.found === false && got.list.length === 4 && got.list[0].appid === 730);
  mode = 'cs';

  // prices, history, order book: the game comes out of the key
  calls.length = 0;
  await e.getPrice('730|AK-47 | Redline (Field-Tested)');
  check('the price of another game asks that game\'s market with the plain name', calls[0][1].includes('priceoverview/?appid=730&') && calls[0][1].endsWith('market_hash_name=' + encodeURIComponent('AK-47 | Redline (Field-Tested)')), calls[0][1]);
  await e.getPrice('440-Card A');
  check('a community price still asks 753 with the whole name', calls[1][1].includes('priceoverview/?appid=753&') && calls[1][1].endsWith('market_hash_name=440-Card%20A'), calls[1][1]);
  await e.getPriceHistory('570|Inscribed Compendium');
  check('the sale history of another game asks that game', calls[2][1].includes('pricehistory/?appid=570&') && calls[2][1].endsWith('market_hash_name=Inscribed%20Compendium'), calls[2][1]);
  await e.getPriceHistory('440-Card A');
  check('a community history still asks 753', calls[3][1].includes('pricehistory/?appid=753&'));
  await e.getItemOrders('730|AK-47 | Redline (Field-Tested)').catch(() => null);
  check('the order book of another game is that game\'s market page', calls[4][1].startsWith('https://steamcommunity.com/market/listings/730/' + encodeURIComponent('AK-47 | Redline (Field-Tested)')), calls[4][1]);
  await e.getItemOrders('440-Card A').catch(() => null);
  check('a community order book is still the 753 page', calls[5][1].startsWith('https://steamcommunity.com/market/listings/753/440-Card%20A'), calls[5][1]);

  // selling
  calls.length = 0;
  await e.sellItem('400', 1234, 1, 730, '2');
  check('a sale in another game posts that game and context', calls[0][0] === 'POST' && calls[0][2].includes('appid=730') && calls[0][2].includes('contextid=2') && calls[0][2].includes('assetid=400') && calls[0][2].includes('price=1234'), calls[0][2]);
  await e.sellItem('10', 28);
  check('a sale without them is a community item: 753 and 6', calls[1][2].includes('appid=753') && calls[1][2].includes('contextid=6'), calls[1][2]);
  process.exit(failures ? 1 : 0);
})();
