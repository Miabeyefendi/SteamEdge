/* Kokteki CHANGELOG.md'yi build/changelog/<surum>.md dosyalarindan derler.
 *
 * Neden betik oldu: bu adim elle yapiliyordu ve 1.1.5 ile 1.1.6 turlarinda unutuldu.
 * Kok changelog iki surum geride kaldi, kimse fark etmedi. Artik `npm run changelog`
 * eksik olani bulup ekliyor, zaten yazili olana dokunmuyor.
 *
 * Bicim: her giris "## [surum](releases/tag/surum)" basligi, altinda surum notunun
 * govdesi. Govdeden atilanlar: "# SteamEdge x.y.z" basligi, kapanistaki
 * "**As always:**" satiri ve icerigi bosalmis son "###" basligi.
 *
 * Calistirma:  npm run changelog
 *              npm run changelog -- --kontrol   (yazmaz, eksik varsa 1 doner)
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const CL = path.join(KOK, 'CHANGELOG.md');
const DIZIN = path.join(__dirname, 'changelog');
const URL = 'https://github.com/Miabeyefendi/SteamEdge/releases/tag/';
const KONTROL = process.argv.includes('--kontrol');

// "1.10.2" > "1.9.0" olmali; metin siralamasi bunu yanlis yapiyor.
const sayisal = (v) => v.split('.').map(Number);
function karsilastir(a, b) {
  const x = sayisal(a), y = sayisal(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); }
  return 0;
}

function govde(surum) {
  let s = fs.readFileSync(path.join(DIZIN, surum + '.md'), 'utf8');
  s = s.replace(/^#\s+SteamEdge[^\n]*\n/, '');            // baslik satiri
  s = s.replace(/\n\*\*As always:\*\*[^\n]*\n?/, '\n');   // kapanis satiri
  s = s.trim();
  s = s.replace(/\n+###[^\n]*$/, '');                     // icerigi bosalmis son baslik
  return s.trim();
}

const mevcut = fs.readFileSync(CL, 'utf8');
const surumler = fs.readdirSync(DIZIN)
  .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
  .map((f) => f.replace(/\.md$/, ''))
  .sort(karsilastir);

const eksik = surumler.filter((v) => !mevcut.includes('## [' + v + ']'));
if (!eksik.length) {
  console.log('CHANGELOG.md guncel (' + surumler.length + ' surum notu, ' + (surumler.length - eksik.length) + ' giris).');
  process.exit(0);
}

if (KONTROL) {
  console.error('CHANGELOG.md eksik: ' + eksik.join(', ') + '  (npm run changelog)');
  process.exit(1);
}

// Yeni girisler, halihazirda yazili en yeni girisin ustune eklenir. Hic giris yoksa
// dosyanin sonuna. Basliktaki giris metni korunur.
const ilkBaslik = mevcut.search(/^## \[/m);
const yer = ilkBaslik < 0 ? mevcut.length : ilkBaslik;
const blok = eksik.map((v) => '## [' + v + '](' + URL + v + ')\n\n' + govde(v)).join('\n\n');
fs.writeFileSync(CL, mevcut.slice(0, yer) + blok + '\n\n' + mevcut.slice(yer), 'utf8');
console.log('CHANGELOG.md: ' + eksik.join(', ') + ' eklendi.');
