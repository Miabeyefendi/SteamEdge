// The graphics defaults of main.js: the window is composited by the processor unless the user turned the graphics card on (a settings file of version 5
// or later), and an older file follows the new default once. The early settings read at the top of main.js and migrateSettings are cut out of it and
// run against stand-ins. Run with `npm test` (tests/run.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'main.js'), 'utf8');
let failures = 0;
const check = (name, condition, extra) => { if (!condition) failures++; console.log((condition ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

// ---- the early read ----
const a = src.indexOf('let earlySettings = null;');
const b = src.indexOf('// On Windows toast notifications');
check('the early settings read is in main.js', a > 0 && b > a);
const early = src.slice(a, b);

function startUp(file) {
  const switches = [];
  const log = { disabled: false };
  const ctx = {
    path, migrateKeys: (x) => x, JSON, Number,
    fs: { existsSync: () => file !== undefined, readFileSync: () => JSON.stringify(file) },
    app: {
      isPackaged: false, getPath: () => '/data', disableHardwareAcceleration: () => { log.disabled = true; },
      commandLine: { appendSwitch: (k, v) => switches.push(v === undefined ? k : k + '=' + v) },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(early, ctx);
  return { switches, disabled: log.disabled };
}
const composes = (r) => !r.switches.includes('disable-gpu-compositing');
check('a first start (no settings file) composites on the processor', !composes(startUp(undefined)));
check('a file of version 5 that has not chosen anything composites on the processor', !composes(startUp({ settingsVersion: 5, gpuComposition: false })));
check('a user who turned the graphics card on (version 5) gets it', composes(startUp({ settingsVersion: 5, gpuComposition: true })));
check('an older file that says on is not read as a choice: the new default applies', !composes(startUp({ settingsVersion: 4, gpuComposition: true })) && !composes(startUp({ gpuComposition: true })));
check('a file that says nothing about it composites on the processor', !composes(startUp({ settingsVersion: 5 })));
check('turning hardware acceleration off still works as before', startUp({ settingsVersion: 5, hwAccel: false }).disabled === true && startUp({ settingsVersion: 5 }).disabled === false);
check('the ANGLE backend choice is untouched', startUp({ settingsVersion: 5, gpuBackend: 'd3d9' }).switches.includes('use-angle=d3d9'));

// ---- low memory mode: graphics and network code inside the main process ----
const lowMem = (r) => r.switches.includes('in-process-gpu') && r.switches.includes('enable-features=NetworkServiceInProcess2');
check('low memory mode is on for a first start', lowMem(startUp(undefined)));
check('and for a file that says nothing about it', lowMem(startUp({ settingsVersion: 5 })));
check('and when it is switched on', lowMem(startUp({ settingsVersion: 5, lowMemory: true })));
const off = startUp({ settingsVersion: 5, lowMemory: false });
check('switched off, neither switch is given', !off.switches.includes('in-process-gpu') && !off.switches.some((x) => x.startsWith('enable-features')));
check('it is independent of the compositing choice', lowMem(startUp({ settingsVersion: 5, gpuComposition: true })) && !composes(startUp({ settingsVersion: 5, lowMemory: true })));
check('the default is on and a change asks for a restart', /lowMemory: true,/.test(src) && /RESTART = \[[^\]]*'lowMemory'/.test(fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'main', 'js', 'settings.js'), 'utf8')));

// ---- the migration ----
const m1 = src.indexOf('function migrateSettings(v) {');
const m2 = src.indexOf('  return hasChanged;\n}', m1) + '  return hasChanged;\n}'.length;
check('migrateSettings is in main.js', m1 > 0 && m2 > m1);
const mig = vm.createContext({ REMOVED_SETTINGS: [], nearestAchDelay: (x) => x, Number, String });
vm.runInContext(src.slice(m1, m2) + ';this.run = migrateSettings;', mig);
const old = { settingsVersion: 4, gpuComposition: true, density: 'auto' };
const changed = mig.run(old);
check('a version 4 file with the old default turns to processor compositing and to version 5', changed === true && old.gpuComposition === false && old.settingsVersion === 5);
const mine = { settingsVersion: 5, gpuComposition: true };
mig.run(mine);
check('a version 5 file keeps the choice of the user', mine.gpuComposition === true && mine.settingsVersion === 5);
const bare = { settingsVersion: 2 };
mig.run(bare);
check('a very old file ends at version 5', bare.settingsVersion === 5);

const def = src.match(/gpuComposition: (true|false),/);
check('the default is off', !!def && def[1] === 'false');
check('and the settings version of a new file is 5', /settingsVersion: 5,/.test(src));

process.exit(failures ? 1 : 0);
