/* /* Builds the root CHANGELOG.md from the build/changelog/<version>.md files.
 *
 *  * Why it became a script: this step was done by hand and was forgotten in rounds 1.1.5 and 1.1.6.
 *  * The root changelog stayed two versions behind and nobody noticed. Now `npm run changelog`
 *  * finds what is missing and adds it, and leaves what is already written alone.
 *
 *  * Format: each entry is a "## [version](releases/tag/version)" heading with the body of the release note
 *  * under it. Dropped from the body: the "# SteamEdge x.y.z" heading, the closing
 *  * "**As always:**" line and a last "###" heading whose content was emptied.
 *
 *  * Run:  npm run changelog
 *  *       npm run changelog -- --kontrol   (does not write, returns 1 if something is missing)
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const CL = path.join(KOK, 'CHANGELOG.md');
const DIZIN = path.join(__dirname, 'changelog');
const URL = 'https://github.com/Miabeyefendi/SteamEdge/releases/tag/';
const KONTROL = process.argv.includes('--kontrol');

// "1.10.2" must be greater than "1.9.0"; text ordering gets this wrong.
const sayisal = (v) => v.split('.').map(Number);
function karsilastir(a, b) {
  const x = sayisal(a), y = sayisal(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); }
  return 0;
}

function govde(surum) {
  let s = fs.readFileSync(path.join(DIZIN, surum + '.md'), 'utf8');
  s = s.replace(/^#\s+SteamEdge[^\n]*\n/, '');            // heading line
  s = s.replace(/\n\*\*As always:\*\*[^\n]*\n?/, '\n');   // closing line
  s = s.trim();
  s = s.replace(/\n+###[^\n]*$/, '');                     // last heading whose content was emptied
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

// New entries are added above the newest entry already written. If there is no entry at all, to the end
// of the file. The entry text in the heading is kept.
const ilkBaslik = mevcut.search(/^## \[/m);
const yer = ilkBaslik < 0 ? mevcut.length : ilkBaslik;
const blok = eksik.map((v) => '## [' + v + '](' + URL + v + ')\n\n' + govde(v)).join('\n\n');
fs.writeFileSync(CL, mevcut.slice(0, yer) + blok + '\n\n' + mevcut.slice(yer), 'utf8');
console.log('CHANGELOG.md: ' + eksik.join(', ') + ' eklendi.');
