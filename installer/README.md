# Windows installer for the English edition

From a clean Windows x64 checkout, run:

```powershell
npm ci
npm run dogrula
npm run dil
npm run build:win
.\installer\Build-Installer.ps1
```

The final setup program is written to `releases/SteamEdge-Setup-1.3.2-English.exe`.
The builder uses the public portable application in `releases/`, embeds an
uninstaller, and verifies that the setup contains both the app and uninstaller.
It excludes `settings/` and `cache/` from the installer even if they exist in
the portable folder, and stops if a session or account JSON file appears in
the remaining payload. The setup preserves a user's existing settings during
an upgrade. The uninstaller preserves them by default and offers an explicit
option to delete them.

The installer uses the Windows .NET Framework C# compiler supplied with the
operating system. No separate installer framework is required. It is not code
signed; Windows may show a publisher warning until a certificate is provided.

Original SteamEdge creator: Miabeyefendi (Mustafa Ihsan Albayrak).
English edition creator: [@braxffa](https://github.com/braxffa).
