'use strict';
// Runs every test under tests/unit with Node and every test under tests/integration with the project's Electron.
// A test fails when it exits with a non-zero code, prints FAIL, or (page tests) reports console errors.
// `npm test` runs all of them; `npm test -- unit` or `npm test -- integration` runs one group; any other argument
// is a part of a file name (`npm test -- proxy`).
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Electron is started through its own cli.js with Node: no shell, so the spaces in the project path need no quoting
const electronCli = path.join(ROOT, 'node_modules', 'electron', 'cli.js');
// These print `true` / `false` per check instead of PASS / FAIL
const BOOLEAN_STYLE = ['token-protection.test.js', 'account-secrets.test.js'];

const wanted = process.argv.slice(2);
const groups = [['unit', 'node'], ['integration', 'electron']];

let failed = 0, total = 0;
for (const [group, runner] of groups) {
  const dir = path.join(__dirname, group);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
    if (wanted.length && !wanted.includes(group) && !wanted.some((w) => file.includes(w))) continue;
    total++;
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'steamedge-test-'));
    // --mute-audio: the page tests send notifications and play their sounds; a test run must not make noise on the machine it runs on
    const args = runner === 'node' ? [path.join(dir, file)] : [electronCli, path.join(dir, file), '--user-data-dir=' + data, '--mute-audio'];
    let r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    // Electron sometimes dies with an access violation while it quits, after the test has already printed its results:
    // that is not a failed check, so such a run is repeated once
    if (r.status === 3221225477) r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    fs.rmSync(data, { recursive: true, force: true });
    const out = (r.stdout || '') + (r.stderr || '');
    const bad = [];
    if (r.status !== 0) bad.push('exit code ' + r.status);
    if (/\bFAIL(ED)?\b/.test(out)) bad.push('FAIL in the output');
    if (/console errors \["/.test(out)) bad.push('console errors');
    if (BOOLEAN_STYLE.includes(file) && /:\s*false\b|\|\s*false\b/.test(out)) bad.push('a check printed false');
    if (bad.length) { failed++; console.log('FAIL  ' + group + '/' + file + '  (' + bad.join(', ') + ')'); console.log(out.split('\n').slice(-12).join('\n')); }
    else console.log('ok    ' + group + '/' + file);
  }
}
console.log('\n' + (total - failed) + ' of ' + total + ' passed');
process.exit(failed ? 1 : 0);
