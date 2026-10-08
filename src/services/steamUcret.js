// Steam market fee - calculated with Steam's OWN script.
//
// Why we have no formula of our own: on the sale page the user enters the price the BUYER pays,
// while what gets sent to Steam is the amount the SELLER keeps. Steam computes the fee in between in its own
// script (economy_common.js): the percentages, the base fee, the smallest step per currency and the
// market floor come from the account's wallet info (g_rgWalletInfo). A fixed 13% used to be deducted
// here; because of the 1+1 cent base fee, on cheap cards the listing deviated
// 10-67% from the chosen price. The rule changed in December 2025; every hand-written formula goes stale again.
//
// How: the script is downloaded from Steam's own server and run in a hidden, SANDBOXED window.
// The window has no Node access, no preload and no cookies; it cannot open new windows and
// cannot navigate to another address. So the script runs in a more restricted environment than the one it runs in
// when you open Steam in your browser. The script is only fetched from Steam's CDN.
const { BrowserWindow, session } = require('electron');
const https = require('https');

const SCRIPT_URL = 'https://community.akamai.steamstatic.com/public/javascript/economy_common.js';
const ALLOWED_HOST = /^community\.(akamai|cloudflare|fastly)\.steamstatic\.com$/;
const SHUTDOWN_MS = 5 * 60 * 1000;   // the window closes after a sale session ends

let windowObj = null;
let preparation = null;
let closeTime = null;

function downloadScript(address) {
  return new Promise((solve, rejectIt) => {
    let u;
    try { u = new URL(address); } catch (_) { rejectIt(new Error('geçersiz adres')); return; }
    if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) { rejectIt(new Error('izin verilmeyen adres')); return; }
    const request = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (r) => {
      if (r.statusCode !== 200) { r.resume(); rejectIt(new Error('HTTP ' + r.statusCode)); return; }
      let payloadData = '';
      r.setEncoding('utf8');
      r.on('data', (p) => { payloadData += p; if (payloadData.length > 2 * 1024 * 1024) request.destroy(new Error('betik beklenenden büyük')); });
      r.on('end', () => solve(payloadData));
    });
    request.on('timeout', () => request.destroy(new Error('zaman aşımı')));
    request.on('error', rejectIt);
  });
}

function shutDown() {
  if (closeTime) { clearTimeout(closeTime); closeTime = null; }
  const p = windowObj;
  windowObj = null;
  preparation = null;
  try { if (p && !p.isDestroyed()) p.destroy(); } catch (_) {}
}

function prepare() {
  if (preparation && windowObj && !windowObj.isDestroyed()) return preparation;
  preparation = (async () => {
    const text = await downloadScript(SCRIPT_URL);
    // Format check: if Steam changes the file and removes the functions, the sale stops and says why
    // instead of silently computing wrongly.
    if (!/function\s+GetItemPriceFromTotal\s*\(/.test(text) || !/function\s+GetTotalWithFees\s*\(/.test(text)) {
      throw new Error('Steam ücret betiği beklenen biçimde değil');
    }
    const sessionInfo = session.fromPartition('steamedge-ucret', { cache: false });
    sessionInfo.setPermissionRequestHandler((_w, _izin, answer) => answer(false));
    const p = new BrowserWindow({
      show: false, width: 100, height: 100,
      webPreferences: {
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        session: sessionInfo, images: false, webSecurity: true, spellcheck: false,
      },
    });
    p.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    p.webContents.on('will-navigate', (e) => e.preventDefault());
    await p.loadURL('data:text/html;charset=utf-8,<!doctype html><title>ucret</title>');
    const category = await p.webContents.executeJavaScript(text + '\n;typeof GetItemPriceFromTotal', true);
    if (category !== 'function') { p.destroy(); throw new Error('Steam ücret işlevi yüklenemedi'); }
    windowObj = p;
    return true;
  })();
  preparation.catch(() => shutDown());
  return preparation;
}

// cuzdan: the fee fields of g_rgWalletInfo. toplamlar: the amounts the buyer pays (cents).
// Returns: [{ toplam, satici, alici }] - satici: the amount to send to Steam, alici: the price at which a listing
// made with that amount will appear on the market (with Steam's own rounding).
async function compute(wallet, totals) {
  await prepare();
  if (closeTime) clearTimeout(closeTime);
  closeTime = setTimeout(shutDown, SHUTDOWN_MS);
  const listing = (totals || []).map((x) => Math.max(0, Math.round(+x || 0)));
  const scriptText = '(function(){var W=' + JSON.stringify(wallet || {}) + ';var L=' + JSON.stringify(listing) + ';'
    + 'var pp=parseFloat(W.wallet_publisher_fee_percent_default!=null?W.wallet_publisher_fee_percent_default:0.10);'
    + 'var sp=parseFloat(W.wallet_fee_percent!=null?W.wallet_fee_percent:0.05);'
    + 'return L.map(function(t){var s=GetItemPriceFromTotal(t,W);return {toplam:t,satici:s,alici:GetTotalWithFees(s,pp,sp,W)};});})()';
  const outcome = await windowObj.webContents.executeJavaScript(scriptText, true);
  if (!Array.isArray(outcome)) throw new Error('Steam ücret hesabı sonuç vermedi');
  return outcome.map((x) => ({ toplam: +x.toplam || 0, satici: +x.satici || 0, alici: +x.alici || 0 }));
}

module.exports = { hesapla: compute, kapat: shutDown };
