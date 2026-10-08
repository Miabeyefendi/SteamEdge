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

const SOURCE = path.join(__dirname, '..', 'src', 'assets', 'icon.png');
const TARGET = path.join(__dirname, '..', 'src', 'assets', 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(SOURCE);
  if (source.isEmpty()) { console.error('icon.png could not be read:', SOURCE); app.exit(1); return; }

  const pngs = SIZES.map((n) => ({
    n,
    veri: source.resize({ width: n, height: n, quality: 'best' }).toPNG(),
  }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: 1 = icon
  header.writeUInt16LE(pngs.length, 4);  // number of images

  const entries = Buffer.alloc(16 * pngs.length);
  let offset = header.length + entries.length;
  pngs.forEach((p, i) => {
    const o = i * 16;
    entries.writeUInt8(p.n >= 256 ? 0 : p.n, o + 0);   // 0 means 256 pixels
    entries.writeUInt8(p.n >= 256 ? 0 : p.n, o + 1);
    entries.writeUInt8(0, o + 2);                      // no palette
    entries.writeUInt8(0, o + 3);                      // reserved
    entries.writeUInt16LE(1, o + 4);                   // planes
    entries.writeUInt16LE(32, o + 6);                  // bit depth
    entries.writeUInt32LE(p.veri.length, o + 8);
    entries.writeUInt32LE(offset, o + 12);
    offset += p.veri.length;
  });

  fs.writeFileSync(TARGET, Buffer.concat([header, entries, ...pngs.map((p) => p.veri)]));
  console.log('yazildi:', TARGET, '(' + SIZES.join(', ') + ' px, ' +
              (fs.statSync(TARGET).size / 1024).toFixed(1) + ' KB)');
  app.exit(0);
});
