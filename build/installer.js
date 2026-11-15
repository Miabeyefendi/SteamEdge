#!/usr/bin/env node
/**
 * Makes the two extra release files from the packaged folder (npm run build calls this at its end):
 *   releases/SteamEdge-v<version>-win-x64.zip   portable copies update themselves from this
 *   releases/SteamEdge-Setup-v<version>.exe     the Setup (build/setup.iss, Inno Setup)
 * Can also be run alone after a build: npm run setup
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT = path.join(ROOT, 'releases');
const NAME = 'SteamEdge-v' + pkg.version + '-win-x64';
const SOURCE = path.join(OUT, NAME);

function find(cmd) {
  try { return execFileSync('where', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim() || null; } catch (_) { return null; }
}

// ISCC is not on PATH by default: env ISCC, PATH, Scoop, then the usual Program Files folders
function findIscc() {
  const candidates = [process.env.ISCC, find('ISCC')];
  try {
    const prefix = execFileSync('scoop', ['prefix', 'inno-setup'], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (prefix) candidates.push(path.join(prefix, 'ISCC.exe'));
  } catch (_) {}
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]) {
    if (base) for (const v of ['Inno Setup 7', 'Inno Setup 6']) candidates.push(path.join(base, v, 'ISCC.exe'));
  }
  return candidates.find((c) => c && fs.existsSync(c)) || null;
}

function makeZip() {
  const zip = path.join(OUT, NAME + '.zip');
  fs.rmSync(zip, { force: true });
  // Windows' own tar writes a standard zip (Compress-Archive of Windows PowerShell 5.1 writes backslash paths)
  // The tar of Windows by its full path: another tar earlier on PATH (Git's GNU tar) reads "A:" as a remote host
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', OUT, NAME], { stdio: 'inherit' });
  console.log('  zip      : ' + zip + ' (' + (fs.statSync(zip).size / 1024 / 1024).toFixed(1) + ' MB)');
}

function makeSetup() {
  const iscc = findIscc();
  if (!iscc) {
    console.log('  WARNING: Inno Setup (ISCC.exe) was not found, the Setup was not built. Install it: scoop install inno-setup');
    return;
  }
  execFileSync(iscc, ['/Q', '/DAppVersion=' + pkg.version, '/DSourceDir=' + SOURCE, '/DOutDir=' + OUT, path.join(__dirname, 'setup.iss')], { stdio: 'inherit' });
  const exe = path.join(OUT, 'SteamEdge-Setup-v' + pkg.version + '.exe');
  console.log('  setup    : ' + exe + ' (' + (fs.statSync(exe).size / 1024 / 1024).toFixed(1) + ' MB)');
}

function main() {
  if (!fs.existsSync(path.join(SOURCE, 'SteamEdge.exe'))) throw new Error('packaged folder not found: ' + SOURCE + ' (run npm run build first)');
  makeZip();
  makeSetup();
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('SETUP FAILED:', e && e.message ? e.message : e); process.exit(1); }
}
module.exports = { main };
