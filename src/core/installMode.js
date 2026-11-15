// Two ways to run the packaged app:
//   portable   the folder was extracted by hand: data (settings, cache, logs) sits next to the exe
//   installed  the Setup put it there: the Setup writes the uninstaller `unins000.exe` into the install folder,
//              so its presence is the marker. Data then lives in the user's AppData, because an install folder
//              such as Program Files is not writable and an update or uninstall must never touch the data.
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

module.exports = { isInstalled, setupLanguage, UNINSTALLER, LANG_FILE };
