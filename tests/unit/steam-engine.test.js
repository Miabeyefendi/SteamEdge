// SteamEngine web calls against mocked replies: Family View PIN, key redeem, listings.
// Run with `npm test` (tests/run.js).
const SteamEngine = require('../../src/core/steamEngine.js');
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
  console.log('array  :', r.listings.length, r.listings[0].name, r.listings[0].buyerCents, r.listings[0].sellerCents, r.listings[0].assetId, '| confirm', r.toConfirm.length, '| hold', r.onHold.length, '| buyOrders', r.buyOrders);
  mode = 'object'; r = await e.getMyListings();
  console.log('object :', r.listings.length, r.listings[0].listingId, r.listings[0].iconUrl.slice(-30));
  mode = 'bad'; try { await e.getMyListings(); } catch (x) { console.log('bad    : throws ->', x.message); }
  mode = 'array';
  console.log('remove :', JSON.stringify(await e.removeListing('111')), calls.filter(c => c[1].includes('removelisting')).map(c => c[0] + ' ' + c[1].slice(-30) + ' ' + c[2]).join());
  try { await e.removeListing('1; DROP'); } catch (x) { console.log('remove bad id ->', x.message); }
  mode = 'fail'; try { await e.removeListing('111'); } catch (x) { console.log('remove 500 ->', x.message); }
  mode = 'array';
  console.log('unpack :', JSON.stringify(await e.unpackBooster('555', 440)), calls.filter(c => c[1].includes('unpack')).map(c => c[2]).join());
  console.log('parental ok :', JSON.stringify(await e.unlockParental('1234')), '| cookies:', e.cookies.join(' ; '));
  mode = 'badpin'; try { await e.unlockParental('0000'); } catch (x) { console.log('parental bad ->', x.message); }
  // redeemKey wrapper
  e.isConnected = true;
  e.user.redeemKey = async (k) => { if (k === 'OK') return { purchaseResultDetails: 0, packageList: { 1: 'Game' } }; const er = new Error('Fail'); er.purchaseResultDetails = 9; er.packageList = { 2: 'Owned game' }; if (k === 'TIMEOUT') { delete er.purchaseResultDetails; er.message = 'Request timed out'; } throw er; };
  console.log('redeem ok  :', JSON.stringify(await e.redeemKey('OK')));
  console.log('redeem fail:', JSON.stringify(await e.redeemKey('AAAAA-BBBBB-CCCCC')));
  try { await e.redeemKey('TIMEOUT'); } catch (x) { console.log('redeem timeout -> throws:', x.message); }
  process.exit(0);
})();
