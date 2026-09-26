// Steam pazar ucreti - Steam'in KENDI betigiyle hesaplanir.
//
// Neden kendi formulumuz yok: satis sayfasinda kullanici ALICININ odeyecegi fiyati girer,
// Steam'e ise SATICIYA kalacak tutar gonderilir. Aradaki ucreti Steam kendi betiginde
// (economy_common.js) hesapliyor: yuzdeler, taban ucret, para birimine gore en kucuk adim ve
// pazar alt siniri hesabin cuzdan bilgisinden (g_rgWalletInfo) geliyor. Eskiden burada sabit
// %13 dusuluyordu; 1+1 sentlik taban ucret yuzunden ucuz kartlarda ilan, secilen fiyattan
// %10-67 sapiyordu. Kural Aralik 2025'te degisti; elle yazilmis her formul yine eskir.
//
// Nasil: betik Steam'in kendi sunucusundan indirilir ve gorunmez, KUM HAVUZLU bir pencerede
// calistirilir. Pencerenin Node erisimi, onyuklemesi, cerezi yoktur; yeni pencere acamaz,
// baska adrese gidemez. Yani betik, kullanicinin tarayicisinda Steam'i actiginda calistigi
// kosullardan daha kisitli bir ortamda calisiyor. Betik yalnizca Steam'in CDN'inden alinir.
const { BrowserWindow, session } = require('electron');
const https = require('https');

const BETIK_URL = 'https://community.akamai.steamstatic.com/public/javascript/economy_common.js';
const IZINLI_HOST = /^community\.(akamai|cloudflare|fastly)\.steamstatic\.com$/;
const KAPATMA_MS = 5 * 60 * 1000;   // bir satis oturumu bittikten sonra pencere kapanir

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
    // Bicim kontrolu: Steam dosyayi degistirip islevleri kaldirirsa sessizce yanlis hesap
    // yapmak yerine satis durur ve sebebi soylenir.
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

// cuzdan: g_rgWalletInfo'nun ucret alanlari. toplamlar: alicinin odeyecegi tutarlar (kurus).
// Donus: [{ toplam, satici, alici }] - satici: Steam'e gonderilecek tutar, alici: o tutarla
// verilen ilanin pazarda gorunecek fiyati (Steam'in kendi yuvarlamasiyla).
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
