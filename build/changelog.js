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

const ROOT = path.join(__dirname, '..');
const CL = path.join(ROOT, 'CHANGELOG.md');
const DIR = path.join(__dirname, 'changelog');
const URL = 'https://github.com/Miabeyefendi/SteamEdge/releases/tag/';
const CHECK = process.argv.includes('--kontrol');

// "1.10.2" must be greater than "1.9.0"; text ordering gets this wrong.
const numeric = (v) => v.split('.').map(Number);
function compare(a, b) {
  const x = numeric(a), y = numeric(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); }
  return 0;
}

function body(version) {
  let s = fs.readFileSync(path.join(DIR, version + '.md'), 'utf8');
  s = s.replace(/^#\s+SteamEdge[^\n]*\n/, '');            // heading line
  s = s.replace(/\n\*\*As always:\*\*[^\n]*\n?/, '\n');   // closing line
  s = s.trim();
  s = s.replace(/\n+###[^\n]*$/, '');                     // last heading whose content was emptied
  return s.trim();
}

const existing = fs.readFileSync(CL, 'utf8');
const versions = fs.readdirSync(DIR)
  .filter((f) => /^\d+\.\d+\.\d+\.md$/.test(f))
  .map((f) => f.replace(/\.md$/, ''))
  .sort(compare);

const missing = versions.filter((v) => !existing.includes('## [' + v + ']'));
if (!missing.length) {
  console.log('CHANGELOG.md is up to date (' + versions.length + ' release notes, ' + (versions.length - missing.length) + ' entries).');
  process.exit(0);
}

if (CHECK) {
  console.error('CHANGELOG.md is missing: ' + missing.join(', ') + '  (npm run changelog)');
  process.exit(1);
}

// New entries are added above the newest entry already written. If there is no entry at all, to the end
// of the file. The entry text in the heading is kept.
const firstHeading = existing.search(/^## \[/m);
const place = firstHeading < 0 ? existing.length : firstHeading;
const block = missing.map((v) => '## [' + v + '](' + URL + v + ')\n\n' + body(v)).join('\n\n');
fs.writeFileSync(CL, existing.slice(0, place) + block + '\n\n' + existing.slice(place), 'utf8');
console.log('CHANGELOG.md: ' + missing.join(', ') + ' added.');
