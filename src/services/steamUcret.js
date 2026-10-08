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

const BETIK_URL = 'https://community.akamai.steamstatic.com/public/javascript/economy_common.js';
const IZINLI_HOST = /^community\.(akamai|cloudflare|fastly)\.steamstatic\.com$/;
const KAPATMA_MS = 5 * 60 * 1000;   // the window closes after a sale session ends

let pencere = null;
let hazirlik = null;
let kapatZamani = null;

function betikIndir(adres) {
  return new Promise((coz, reddet) => {
    let u;
    try { u = new URL(adres); } catch (_) { reddet(new Error('geçersiz adres')); return; }
    if (u.protocol !== 'https:' || !IZINLI_HOST.test(u.hostname)) { reddet(new Error('izin verilmeyen adres')); return; }
    const istek = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (r) => {
      if (r.statusCode !== 200) { r.resume(); reddet(new Error('HTTP ' + r.statusCode)); return; }
      let veri = '';
      r.setEncoding('utf8');
      r.on('data', (p) => { veri += p; if (veri.length > 2 * 1024 * 1024) istek.destroy(new Error('betik beklenenden büyük')); });
      r.on('end', () => coz(veri));
    });
    istek.on('timeout', () => istek.destroy(new Error('zaman aşımı')));
    istek.on('error', reddet);
  });
}

function kapat() {
  if (kapatZamani) { clearTimeout(kapatZamani); kapatZamani = null; }
  const p = pencere;
  pencere = null;
  hazirlik = null;
  try { if (p && !p.isDestroyed()) p.destroy(); } catch (_) {}
}

function hazirla() {
  if (hazirlik && pencere && !pencere.isDestroyed()) return hazirlik;
  hazirlik = (async () => {
    const metin = await betikIndir(BETIK_URL);
    // Format check: if Steam changes the file and removes the functions, the sale stops and says why
    // instead of silently computing wrongly.
    if (!/function\s+GetItemPriceFromTotal\s*\(/.test(metin) || !/function\s+GetTotalWithFees\s*\(/.test(metin)) {
      throw new Error('Steam ücret betiği beklenen biçimde değil');
    }
    const oturum = session.fromPartition('steamedge-ucret', { cache: false });
    oturum.setPermissionRequestHandler((_w, _izin, cevap) => cevap(false));
    const p = new BrowserWindow({
      show: false, width: 100, height: 100,
      webPreferences: {
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        session: oturum, images: false, webSecurity: true, spellcheck: false,
      },
    });
    p.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    p.webContents.on('will-navigate', (e) => e.preventDefault());
    await p.loadURL('data:text/html;charset=utf-8,<!doctype html><title>ucret</title>');
    const tur = await p.webContents.executeJavaScript(metin + '\n;typeof GetItemPriceFromTotal', true);
    if (tur !== 'function') { p.destroy(); throw new Error('Steam ücret işlevi yüklenemedi'); }
    pencere = p;
    return true;
  })();
  hazirlik.catch(() => kapat());
  return hazirlik;
}

// cuzdan: the fee fields of g_rgWalletInfo. toplamlar: the amounts the buyer pays (cents).
// Returns: [{ toplam, satici, alici }] - satici: the amount to send to Steam, alici: the price at which a listing
// made with that amount will appear on the market (with Steam's own rounding).
async function hesapla(cuzdan, toplamlar) {
  await hazirla();
  if (kapatZamani) clearTimeout(kapatZamani);
  kapatZamani = setTimeout(kapat, KAPATMA_MS);
  const liste = (toplamlar || []).map((x) => Math.max(0, Math.round(+x || 0)));
  const betik = '(function(){var W=' + JSON.stringify(cuzdan || {}) + ';var L=' + JSON.stringify(liste) + ';'
    + 'var pp=parseFloat(W.wallet_publisher_fee_percent_default!=null?W.wallet_publisher_fee_percent_default:0.10);'
    + 'var sp=parseFloat(W.wallet_fee_percent!=null?W.wallet_fee_percent:0.05);'
    + 'return L.map(function(t){var s=GetItemPriceFromTotal(t,W);return {toplam:t,satici:s,alici:GetTotalWithFees(s,pp,sp,W)};});})()';
  const sonuc = await pencere.webContents.executeJavaScript(betik, true);
  if (!Array.isArray(sonuc)) throw new Error('Steam ücret hesabı sonuç vermedi');
  return sonuc.map((x) => ({ toplam: +x.toplam || 0, satici: +x.satici || 0, alici: +x.alici || 0 }));
}

module.exports = { hesapla, kapat };
