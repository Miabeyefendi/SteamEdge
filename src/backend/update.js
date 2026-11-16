// Moved out of main.js unchanged (update). Everything it needs from main.js arrives through `ctx`; the names it still
// gives back are returned at the end.

module.exports = function init(ctx) {
  const { accountDataMigration, accounts, app, connectAccount, ct, dialog, flushPendingWrites, fs, hasSession, ipcMain, loadAccounts, log, logger, path, readErrors, sendRaw, session, statsHour, syncActive, update } = ctx;

  // ---- update check (issue #6) ----
  // Rule: nothing is downloaded, nothing is run on its own. The app only reads the newest release number
  // on GitHub and compares it with the installed one. The rest is up to the user.
  //
  // When it looks:
  //   1. ONCE at app startup. If there is a new version a window shows on screen; IF THE VERSION IS CURRENT
  //      nothing is shown. No timer, no daily repeat, no check wandering in the background.
  //   2. If the user presses the button in the top bar. There the result is always told - learning that
  //      it is up to date is also an answer, the button must not look dead.
  let lastUpdateStatus = null;    // the result of the last check
  let updateRunning = false;

  async function checkForUpdate(manual) {
    // Two checks must not run at the same time: the user can press the button while the startup check is running.
    if (updateRunning) return lastUpdateStatus || { ok: false, failure: 'Kontrol zaten sürüyor.' };
    updateRunning = true;
    try {
      const outcome = await update.checkNow(app.getVersion());
      lastUpdateStatus = { ...outcome, ts: Date.now(), byHand: !!manual };
      log(outcome.ok ? 'info' : 'warn', 'update check: '
        + (outcome.ok ? (outcome.isUpToDate ? 'up to date (' + outcome.installed + ')' : 'new version ' + outcome.lastOne) : outcome.failure));
      sendRaw('update:status', lastUpdateStatus);
      return lastUpdateStatus;
    } finally {
      updateRunning = false;
    }
  }

  // The single check at startup. Delayed 15 seconds so the window and the Steam session can settle.
  function startupUpdateCheck() {
    setTimeout(() => { checkForUpdate(false).catch(() => {}); }, 15000);
  }

  // ---- update install (3.0.0) ----
  // Only runs after the user pressed "Update now". The file comes from this project's GitHub release and is verified by SHA-256
  // (src/services/updater.js). Two ways, by how the app was put on the computer:
  //   installed  the app quits, a small script waits until every SteamEdge process is gone (the Setup cannot close a running
  //              copy of a quitting app and a silent Setup cancels itself then), keeps a copy of the settings, opens the Setup
  //              of the new version with its normal screens, puts back whatever settings are missing afterwards, removes
  //              the temp folder and starts the old copy again if the Setup was cancelled
  //   portable   the zip is extracted to a temp folder, then a small script waits for this process to end, copies the new
  //              files over the folder WITHOUT touching settings, cache and logs, and starts the app again
  let installing = false;

  // ASCII only: Windows PowerShell 5.1 reads a BOM-less script in the ANSI code page
  const PORTABLE_SCRIPT = [
    'param([int]$ProcId, [string]$Source, [string]$Dest, [string]$Exe, [string]$Work)',
    "$ErrorActionPreference = 'Continue'",
    'try { Wait-Process -Id $ProcId -Timeout 90 -ErrorAction SilentlyContinue } catch {}',
    'Start-Sleep -Seconds 2',
    // robocopy exit codes below 8 mean success; three tries because the old processes may still hold a file for a moment
    'for ($i = 0; $i -lt 3; $i++) {',
    '  robocopy $Source $Dest /E /XD settings cache logs /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null',
    '  if ($LASTEXITCODE -lt 8) { break }',
    '  Start-Sleep -Seconds 3',
    '}',
    'Start-Process -FilePath $Exe',
    'Start-Sleep -Seconds 3',
    'Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue',
  ].join('\r\n');

  // ASCII only (see above). Runs after the app has been told to quit.
  const INSTALL_SCRIPT = [
    'param([int]$ProcId, [string]$Setup, [string]$Exe, [string]$Work, [string]$Dest, [string]$OldVer, [string]$SetupArgs = "/SP- /CLOSEAPPLICATIONS")',
    "$ErrorActionPreference = 'Continue'",
    'try { Wait-Process -Id $ProcId -Timeout 90 -ErrorAction SilentlyContinue } catch {}',
    // every process of this exe has to be gone, or the Setup cannot replace the files
    'for ($i = 0; $i -lt 60; $i++) {',
    '  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe })',
    '  if ($left.Count -eq 0) { break }',
    '  if ($i -ge 20) { $left | Stop-Process -Force -ErrorAction SilentlyContinue }',
    '  Start-Sleep -Seconds 1',
    '}',
    // a copy of the settings next to the app (not in Temp: it holds the sign-in), put back below if the Setup lost any of it
    "$Bak = Join-Path (Join-Path $Dest 'cache') 'update-backup'",
    "robocopy (Join-Path $Dest 'settings') (Join-Path $Bak 'settings') /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null",
    '$p = Start-Process -FilePath $Setup -ArgumentList $SetupArgs -PassThru',
    '$p.WaitForExit()',
    // the Setup may hand over to an elevated copy of itself: wait for that one too
    "while (Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($Setup)) -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 1 }",
    "robocopy (Join-Path $Bak 'settings') (Join-Path $Dest 'settings') /E /XC /XN /XO /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null",
    "if ($LASTEXITCODE -lt 8) { Remove-Item -LiteralPath $Bak -Recurse -Force -ErrorAction SilentlyContinue }",
    'Start-Sleep -Seconds 1',
    'Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue',
    // the Setup was cancelled or failed: the old version has to open again
    "$now = (Get-Item -LiteralPath $Exe -ErrorAction SilentlyContinue).VersionInfo.ProductVersion",
    "if ($now -eq $OldVer -and -not (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe })) { Start-Process -FilePath $Exe }",
  ].join('\r\n');

  function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // Starts update.ps1 so that it outlives this app. A PowerShell started straight with `detached: true` (no console at all) ends at once
  // without running anything, and a plain child can end with its parent: wscript (a program without a console) starts the hidden PowerShell
  // from a one-line script, which is the way that was tried out to keep running after the app has quit.
  // params: [['ProcId', 123], ['Setup', 'C:\\x y\\Setup.exe'], ...] become -ProcId 123 -Setup "C:\\x y\\Setup.exe"
  function startScript(work, script, params) {
    const q = (v) => '""' + String(v) + '""';
    const args = params.map(([k, v]) => '-' + k + ' ' + (typeof v === 'number' ? v : q(v))).join(' ');
    const vbs = path.join(work, 'start.vbs');
    fs.writeFileSync(vbs, 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + q(script) + ' ' + args + '", 0, False\r\n', 'utf8');
    const child = require('child_process').spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore' });
    child.unref();
  }

  // Folders of an update that was started earlier and not cleaned up (the Setup cancelled, the computer switched off): our own
  // SteamEdge-update-* folders in Temp go, once they are old enough not to belong to an update that is running now
  function sweepUpdateTemp() {
    try {
      const tmp = require('os').tmpdir();
      for (const n of fs.readdirSync(tmp)) {
        if (!/^SteamEdge-update-\d+$/.test(n)) continue;
        const p = path.join(tmp, n);
        try { if (Date.now() - fs.statSync(p).mtimeMs > 10 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
      }
    } catch (_) {}
  }
  setTimeout(sweepUpdateTemp, 20000);

  ipcMain.handle('update:install', async () => {
    if (installing) return { ok: false, error: 'Güncelleme zaten sürüyor.' };
    if (!app.isPackaged || process.platform !== 'win32') return { ok: false, error: 'Kendi kendine güncelleme yalnızca paketli Windows sürümünde çalışır.' };
    const st = lastUpdateStatus;
    if (!st || !st.ok || st.isUpToDate !== false || !st.assets) return { ok: false, error: 'Önce yeni sürüm denetlenmeli.' };
    const installed = require('../core/installMode').isInstalled(app.getPath('exe'));
    const asset = installed ? st.assets.setup : st.assets.zip;
    if (!asset) return { ok: false, error: 'Bu yayında güncelleme dosyası yok, yayın sayfasından indirebilirsin.' };
    const exeDir = path.dirname(app.getPath('exe'));
    if (!installed) {
      try { const t = path.join(exeDir, '.write-test'); fs.writeFileSync(t, 'x'); fs.unlinkSync(t); }
      catch (_) { return { ok: false, error: 'Uygulama klasörüne yazılamıyor, yayın sayfasından indir.' }; }
    }
    installing = true;
    const work = path.join(require('os').tmpdir(), 'SteamEdge-update-' + Date.now());
    try {
      fs.mkdirSync(work, { recursive: true });
      const file = path.join(work, asset.name);
      log('info', 'update: downloading ' + asset.name);
      const got = await update.download(asset, file, (done, total) => sendRaw('update:progress', { phase: 'download', done, total }));
      if (!got.ok) throw new Error(got.failure);
      sendRaw('update:progress', { phase: 'install' });
      if (installed) {
        log('info', 'update: the Setup opens when the app has quit');
        const script = path.join(work, 'update.ps1');
        fs.writeFileSync(script, INSTALL_SCRIPT, 'utf8');
        startScript(work, script, [['ProcId', process.pid], ['Setup', file], ['Exe', app.getPath('exe')], ['Work', work], ['Dest', exeDir], ['OldVer', app.getVersion()]]);
      } else {
        const extract = path.join(work, 'files');
        await new Promise((resolve, reject) => {
          require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'Expand-Archive -LiteralPath ' + psQuote(file) + ' -DestinationPath ' + psQuote(extract) + ' -Force'], { windowsHide: true, timeout: 180000 }, (e) => (e ? reject(e) : resolve()));
        });
        // the zip holds one folder (SteamEdge-v<version>-win-x64); the files to copy are the ones next to SteamEdge.exe
        const top = fs.readdirSync(extract, { withFileTypes: true }).filter((d) => d.isDirectory());
        const source = fs.existsSync(path.join(extract, path.basename(app.getPath('exe')))) ? extract : (top[0] ? path.join(extract, top[0].name) : null);
        if (!source || !fs.existsSync(path.join(source, path.basename(app.getPath('exe'))))) throw new Error('Güncelleme paketi beklenen yapıda değil.');
        const script = path.join(work, 'update.ps1');
        fs.writeFileSync(script, PORTABLE_SCRIPT, 'utf8');
        log('info', 'update: portable copy over ' + exeDir);
        startScript(work, script, [['ProcId', process.pid], ['Source', source], ['Dest', exeDir], ['Exe', app.getPath('exe')], ['Work', work]]);
      }
      // let the interface show "restarting" for a moment, then close for real (the tray would otherwise keep the app alive)
      setTimeout(() => { ctx.isQuitting = true; app.quit(); }, 1200);
      return { ok: true, installed };
    } catch (e) {
      installing = false;
      try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
      log('warn', 'update install failed: ' + (e && e.message));
      return { ok: false, error: (e && e.message) || 'Güncelleme başarısız.' };
    }
  });

  ipcMain.handle('update:check', () => checkForUpdate(true));
  ipcMain.handle('update:lastStatus', () => lastUpdateStatus);
  // The app's real memory use, process by process. So that the answer to "how much RAM does it eat" is not a guess
  // Settings > Advanced shows this live. Electron runs multi process: five separate SteamEdge
  // rows show up in Task Manager, the user had to add them up one by one.
  // tek tek toplamasi gerekiyordu.
  ipcMain.handle('app:memory', () => {
    const measurements = app.getAppMetrics();
    const processes = measurements.map((p) => ({
      typeName: p.type,
      kb: (p.memory && (p.memory.privateBytes || p.memory.workingSetSize)) || 0,
    }));
    return {
      totalKb: processes.reduce((t, p) => t + p.kb, 0),
      processList: processes,
      gpuOn: ctx.settings.hwAccel !== false,
    };
  });
  // Empty the image and network cache. NO loss of settings, session or data - only things that can be
  // downloaded again go. The most direct way to win memory back in long sessions.
  ipcMain.handle('app:memoryClear', async () => {
    const earlier = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
    try {
      await session.defaultSession.clearCache();
      if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.session.clearCodeCaches({ urls: [] });
    } catch (e) { return { ok: false, error: e.message }; }
    await new Promise((r) => setTimeout(r, 600));
    const later = app.getAppMetrics().reduce((t, p) => t + ((p.memory && p.memory.workingSetSize) || 0), 0);
    log('info', 'cache cleared: ' + Math.round((earlier - later) / 1024) + ' MB');
    return { ok: true, gainKb: Math.max(0, earlier - later) };
  });

  ipcMain.handle('app:info', () => ({
    versionStr: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    packaged: app.isPackaged,
  }));

  app.on('before-quit', () => {
    ctx.isQuitting = true;
    // The jobs that are running now are what comes back at the next start: written before anything else, and the file is closed to changes after that.
    ctx.resumeSave(true);
    // Let the last minute of running jobs and the pending account writes land on disk.
    accounts.forEach((s, id) => { try { statsHour(id); } catch (_) {} });
    flushPendingWrites();
    logger.connection('-', 'stopped');   // a drop still open ends here in the connection history, not at the next start
  });
  // If a data file could not be read at startup TELL the user. It used to silently fall back to the default,
  // then the first change wrote over the intact file; the user could never learn
  // why their settings were gone.
  function reportReadErrors() {
    if (!readErrors.length) return;
    const recovered = readErrors.filter((h) => h.recoveredFlag).map((h) => h.displayName);
    const lost = readErrors.filter((h) => !h.recoveredFlag).map((h) => h.displayName);
    let bodyEl = '';
    if (recovered.length) {
      bodyEl += ct('Şu dosyalar bozuktu ve yedekten kurtarıldı:') + '\n  ' + recovered.map(ct).join('\n  ') + '\n\n';
    }
    if (lost.length) {
      bodyEl += ct('Şu dosyalar okunamadı ve yedekleri de yoktu:') + '\n  ' + lost.map(ct).join('\n  ')
        + '\n\n' + ct('Bu veriler varsayılana döndürüldü. Bozuk dosyalar ".corrupt" uzantısıyla settings klasöründe duruyor, üzerlerine yazılmadı.')
        + '\n\n' + ct('Bunun sebebi genellikle uygulama kayıt yaparken bilgisayarın kapanmasıdır.');
    }
    try {
      dialog.showMessageBox(ctx.win || null, {
        type: lost.length ? 'warning' : 'info',
        title: 'SteamEdge - ' + ct('veri dosyaları'),
        message: lost.length ? ct('Bazı ayarlar okunamadı') : ct('Ayarlar yedekten kurtarıldı'),
        detail: bodyEl.trim(),
        buttons: [ct('Tamam')],
      });
    } catch (_) {}
    readErrors.length = 0;
  }

  // Open the Steam session WITHOUT WAITING FOR THE INTERFACE.
  // The logon used to start when the interface had loaded and the first page called `engine:connect`: first
  // the HTML/CSS/JS loaded, then the connection was made and the two times stacked on top of each other.
  // But the session info is ready on disk. When started here the connection makes progress while the interface is
  // drawn; when the pages call `engine:connect` it is either ready or they share the same
  // ongoing operation (connectAccount > s.connecting).
  function earlyConnect() {
    const sess = hasSession();
    if (!sess) return;
    if (!ctx.activeSteamID) { ctx.activeSteamID = sess.steamID; accountDataMigration(); }
    const entry = loadAccounts().find((a) => a.steamID === ctx.activeSteamID) || sess;
    connectAccount(entry)
      .then((r) => {
        syncActive();
        log(r && r.ok ? 'info' : 'warn', 'startup connection: ' + (r && r.ok ? 'established' : (r && r.error)));
      })
      .catch((e) => log('warn', 'startup connection failed: ' + (e && e.message)));
  }

  // Mixed installation detection.
  // Users extract the new version OVER THE OLD folder. When the app is open at that time
  // some files are locked and do not come out of the archive: the exe is new, locales/ and app.asar
  // stay old. Electron refuses to start with a locale file whose version does not match and
  // exits WITHOUT ANY MESSAGE. From outside it looks like "the app does not work".
  // The `version` file next to it carries Electron's real version; we compare it with the running version
  // and if they do not match we say the reason.
  function isSetupConsistent() {
    if (!app.isPackaged) return { ok: true };
    try {
      const pathStr = path.join(path.dirname(app.getPath('exe')), 'version');
      if (!fs.existsSync(pathStr)) return { ok: true };          // if the file is not there make no comment
      const fileVersion = fs.readFileSync(pathStr, 'utf8').trim();
      const runningItem = process.versions.electron;
      if (fileVersion && runningItem && fileVersion !== runningItem) {
        return { ok: false, fileVersion: fileVersion, runningItem: runningItem };
      }
    } catch (_) {}
    return { ok: true };
  }


  return { earlyConnect, isSetupConsistent, reportReadErrors, startupUpdateCheck };
};
