// SteamEngine web calls against mocked replies: Family View PIN, key redeem, listings.
// Run with `npm test` (tests/run.js).
const SteamEngine = require('../../src/core/steamEngine.js');
let failures = 0;
const check = (name, condition) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name); };

const e = new SteamEngine();
e.cookies = ['sessionid=abc123', 'steamLoginSecure=1||tok'];
const calls = [];
const resp = (body, init = {}) => ({ ok: init.ok !== false, status: init.status || 200, headers: { getSetCookie: () => init.setCookie || [] }, json: async () => body, text: async () => JSON.stringify(body) });
const listingA = { listingid: '111', price: 28, fee: 4, time_created: 1760000000, asset: { appid: 753, contextid: '6', id: '9001', amount: '1' } };
const listingB = { listingid: '112', price: 100, fee: 15, time_created: 1760000100, asset: { appid: 753, contextid: '6', id: '9002' } };
const assets = { 753: { 6: { 9001: { name: 'Card A', market_hash_name: '440-Card A', icon_url: 'icon1' }, 9002: { name: 'Card B (Foil)', market_hash_name: '440-Card B (Foil)', icon_url: 'icon2' } } } };
let mode = 'array';
global.fetch = async (url, opts = {}) => {
  calls.push([opts.method || 'GET', url, opts.body ? String(opts.body) : '']);
  if (url.includes('/market/mylistings/')) {
    if (mode === 'array') return resp({ success: true, total_count: 2, assets, listings: [listingA, listingB], listings_to_confirm: [{ ...listingA, listingid: '113' }], listings_on_hold: {}, buy_orders: [{}, {}] });
    if (mode === 'object') return resp({ success: true, total_count: 1, assets, listings: { 111: listingA }, listings_to_confirm: [], listings_on_hold: [], buy_orders: [] });
    return resp({ success: false });
  }
  if (url.includes('removelisting')) return resp({}, { ok: mode !== 'fail', status: mode === 'fail' ? 500 : 200 });
  if (url.includes('ajaxunpackbooster')) return resp({ success: 1, rgItems: [{ name: 'Card X', foil: true }, { name: 'Card Y' }] });
  if (url.includes('ajaxunlock')) return resp({ success: mode !== 'badpin' }, { setCookie: ['steamparental=PARENT123; Path=/; Secure', 'other=1'] });
  return resp({});
};
(async () => {
  let r = await e.getMyListings();
  check('array form: 2 listings with prices, 1 to confirm, 0 on hold, 2 buy orders', r.listings.length === 2 && r.listings[0].name === 'Card A' && r.listings[0].buyerCents === 32 && r.listings[0].sellerCents === 28 && r.listings[0].assetId === '9001' && r.toConfirm.length === 1 && r.onHold.length === 0 && r.buyOrders === 2);
  console.log('array  :', r.listings.length, r.listings[0].name, r.listings[0].buyerCents, r.listings[0].sellerCents, r.listings[0].assetId, '| confirm', r.toConfirm.length, '| hold', r.onHold.length, '| buyOrders', r.buyOrders);
  mode = 'object'; r = await e.getMyListings();
  check('object form is read too', r.listings.length === 1 && r.listings[0].listingId === '111' && r.listings[0].iconUrl.endsWith('icon1/96fx96f'));
  console.log('object :', r.listings.length, r.listings[0].listingId, r.listings[0].iconUrl.slice(-30));
  mode = 'bad'; let threw = null; try { await e.getMyListings(); } catch (x) { threw = x; } check('an unexpected reply throws', !!threw);
  mode = 'array';
  check('removing a listing posts the id and the session id', JSON.stringify(await e.removeListing('111')) === '{"ok":true}' && calls.some((c) => c[0] === 'POST' && c[1].endsWith('/removelisting/111') && c[2] === 'sessionid=abc123'));
  console.log('remove :', JSON.stringify(await e.removeListing('111')), calls.filter(c => c[1].includes('removelisting')).map(c => c[0] + ' ' + c[1].slice(-30) + ' ' + c[2]).join());
  threw = null; try { await e.removeListing('1; DROP'); } catch (x) { threw = x; } check('a listing id that is not digits is refused before any request', !!threw && !calls.some((c) => c[1].includes('DROP')));
  mode = 'fail'; threw = null; try { await e.removeListing('111'); } catch (x) { threw = x; } check('an HTTP 500 on remove throws', !!threw);
  mode = 'array';
  const unpacked = await e.unpackBooster('555', 440);
  check('booster unpack returns the cards and posts the item and app', unpacked.ok && unpacked.items.length === 2 && unpacked.items[0].foil === true && calls.some((c) => c[2] === 'sessionid=abc123&appid=440&communityitemid=555'));
  console.log('unpack :', JSON.stringify(await e.unpackBooster('555', 440)), calls.filter(c => c[1].includes('unpack')).map(c => c[2]).join());
  check('the right PIN unlocks and keeps the steamparental cookie', (await e.unlockParental('1234')).ok === true && e.cookies.includes('steamparental=PARENT123'));
  mode = 'badpin'; threw = null; try { await e.unlockParental('0000'); } catch (x) { threw = x; } check('a wrong PIN throws', !!threw);
  // redeemKey wrapper
  e.isConnected = true;
  e.user.redeemKey = async (k) => { if (k === 'OK') return { purchaseResultDetails: 0, packageList: { 1: 'Game' } }; const er = new Error('Fail'); er.purchaseResultDetails = 9; er.packageList = { 2: 'Owned game' }; if (k === 'TIMEOUT') { delete er.purchaseResultDetails; er.message = 'Request timed out'; } throw er; };
  const redeemed = await e.redeemKey('OK');
  check('a good key reports the package', redeemed.ok === true && redeemed.detail === 0 && redeemed.packages[1] === 'Game');
  const refused = await e.redeemKey('AAAAA-BBBBB-CCCCC');
  check('a refused key carries the Steam detail code', refused.ok === false && refused.detail === 9);
  // free license of an app
  e.user.requestFreeLicense = (ids, cb) => setImmediate(() => { if (ids[0] === 1) cb(null, [101], [1]); else if (ids[0] === 2) cb(null, [], []); else { const er = new Error('Fail'); er.eresult = 15; cb(er); } });
  const granted = await e.claimFreeApp(1), nothing = await e.claimFreeApp(2), refusedFree = await e.claimFreeApp(3);
  check('a free app is granted', granted.ok && granted.granted && granted.packages[0] === 101);
  check('an answer without a grant says so (already owned or not free)', nothing.ok && !nothing.granted);
  check('a Steam refusal carries the EResult', !refusedFree.ok && refusedFree.detail === 15);
  // recent purchases (refund window): only licenses from the last 14 days are looked up
  const now = Math.floor(Date.now() / 1000);
  let asked = null;
  e.user.licenses = [{ package_id: 11, time_created: now - 3 * 86400 }, { package_id: 12, time_created: now - 40 * 86400 }, { package_id: 13, time_created: now - 86400 }];
  e.user.getProductInfo = async (apps, packages) => { asked = packages.slice(); return { packages: { 11: { packageinfo: { appids: [440, 441] } }, 13: { packageinfo: { appids: [730] } } } }; };
  const recent = await e.getRecentAppIds(14);
  check('recent purchases: only the two recent packages are asked for', asked && asked.join() === '11,13');
  check('recent purchases: their apps come back', recent.size === 3 && recent.has(440) && recent.has(441) && recent.has(730));
  e.user.licenses = [{ package_id: 12, time_created: now - 40 * 86400 }]; asked = null;
  check('no recent license: nothing is looked up', (await e.getRecentAppIds(14)).size === 0 && asked === null);
  e.user.licenses = [{ package_id: 11, time_created: now }]; e.user.getProductInfo = async () => { throw new Error('no answer'); };
  threw = null; try { await e.getRecentAppIds(14); } catch (x) { threw = x; } check('a failed lookup throws (the caller then skips nothing)', !!threw);
  threw = null; try { await e.redeemKey('TIMEOUT'); } catch (x) { threw = x; } check('a request with no Steam answer throws', !!threw);
  process.exit(failures ? 1 : 0);
})();
