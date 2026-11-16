// Two ways to run the packaged app:
//   portable   the folder was extracted by hand: data (settings, cache, logs) sits next to the exe
//   installed  the Setup put it there: the Setup writes the uninstaller `unins000.exe` into the install folder,
//              so its presence is the marker. The data (settings, cache, logs) still sits next to the exe, like a portable
//              copy: the Setup gives the users group write access to those three folders, and an update never touches them.
const fs = require('fs');
const path = require('path');

const UNINSTALLER = 'unins000.exe';

function isInstalled(exePath) {
  try { return fs.existsSync(path.join(path.dirname(exePath), UNINSTALLER)); } catch (_) { return false; }
}

// The Setup asks which language the app opens in and leaves it in this file (first install only).
const LANG_FILE = 'setup-language.txt';
const LANGS = ['tr', 'en', 'de', 'es', 'zh', 'ru'];
function setupLanguage(exePath) {
  try {
    const code = fs.readFileSync(path.join(path.dirname(exePath), LANG_FILE), 'utf8').trim().toLowerCase();
    return LANGS.includes(code) ? code : null;
  } catch (_) { return null; }
}

// The first 3.0.0 Setup kept the data of an installed copy in AppData. Since the data sits next to the exe now, a copy that finds nothing there
// but has data in AppData takes it over once (the AppData folder is left where it is). Returns the folder it took the data from, or null.
function importLegacyAppData(appDataDir, configDir, cacheDir) {
  try {
    const from = path.join(appDataDir, 'settings');
    const has = (dir) => ['settings.json', 'session.json', 'accounts.json', 'session.bak', 'accounts.bak'].some((f) => fs.existsSync(path.join(dir, f)));
    if (!has(from) || has(configDir)) return null;
    fs.cpSync(from, configDir, { recursive: true, force: true });
    const cacheFrom = path.join(appDataDir, 'cache');
    if (fs.existsSync(cacheFrom)) {
      for (const e of fs.readdirSync(cacheFrom, { withFileTypes: true })) {
        if (e.isFile()) { try { fs.copyFileSync(path.join(cacheFrom, e.name), path.join(cacheDir, e.name)); } catch (_) {} }
      }
    }
    return from;
  } catch (_) { return null; }
}

module.exports = { isInstalled, setupLanguage, importLegacyAppData, UNINSTALLER, LANG_FILE };
