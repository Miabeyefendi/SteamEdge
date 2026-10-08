/**
 *  * Converts icon.png -> icon.ico (for the Windows exe icon).
 *
 *  * Why by hand: we did not want to add an image library just for this. Electron's own
 *  * nativeImage does the resizing, and the ICO shell is a simple container:
 *  *   ICONDIR (6 bytes) + an ICONDIRENTRY (16 bytes) for each size + raw PNG data.
 *  * Vista and later accept PNG inside ICO, so there is no need to convert to BMP.
 *
 *  * Run:  npx electron build/make-icon.js
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const KAYNAK = path.join(__dirname, '..', 'src', 'assets', 'icon.png');
const HEDEF = path.join(__dirname, '..', 'src', 'assets', 'icon.ico');
const BOYUTLAR = [16, 24, 32, 48, 64, 128, 256];

app.whenReady().then(() => {
  const kaynak = nativeImage.createFromPath(KAYNAK);
  if (kaynak.isEmpty()) { console.error('icon.png okunamadi:', KAYNAK); app.exit(1); return; }

  const pngler = BOYUTLAR.map((n) => ({
    n,
    veri: kaynak.resize({ width: n, height: n, quality: 'best' }).toPNG(),
  }));

  const baslik = Buffer.alloc(6);
  baslik.writeUInt16LE(0, 0);              // reserved
  baslik.writeUInt16LE(1, 2);              // type: 1 = icon
  baslik.writeUInt16LE(pngler.length, 4);  // number of images

  const girdiler = Buffer.alloc(16 * pngler.length);
  let offset = baslik.length + girdiler.length;
  pngler.forEach((p, i) => {
    const o = i * 16;
    girdiler.writeUInt8(p.n >= 256 ? 0 : p.n, o + 0);   // 0 means 256 pixels
    girdiler.writeUInt8(p.n >= 256 ? 0 : p.n, o + 1);
    girdiler.writeUInt8(0, o + 2);                      // no palette
    girdiler.writeUInt8(0, o + 3);                      // reserved
    girdiler.writeUInt16LE(1, o + 4);                   // planes
    girdiler.writeUInt16LE(32, o + 6);                  // bit depth
    girdiler.writeUInt32LE(p.veri.length, o + 8);
    girdiler.writeUInt32LE(offset, o + 12);
    offset += p.veri.length;
  });

  fs.writeFileSync(HEDEF, Buffer.concat([baslik, girdiler, ...pngler.map((p) => p.veri)]));
  console.log('yazildi:', HEDEF, '(' + BOYUTLAR.join(', ') + ' px, ' +
              (fs.statSync(HEDEF).size / 1024).toFixed(1) + ' KB)');
  app.exit(0);
});
