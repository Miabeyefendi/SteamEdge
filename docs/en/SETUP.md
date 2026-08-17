# Setup

[English](../en/SETUP.md) · [Türkçe](../tr/SETUP.md) · [Deutsch](../de/SETUP.md) · [Español](../es/SETUP.md) · [繁體中文](../zh/SETUP.md)

Getting SteamEdge running takes about two minutes. There is no installer and nothing is
written to the Windows registry.

---

## 1. Download

Go to [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest) and download
`SteamEdge-vX.Y.Z-win-x64.rar`.

## 2. Extract

Right-click the zip → **Extract All**. Put the folder somewhere you can write to:

- Good: `Desktop`, `Documents`, `D:\Apps\SteamEdge`, a USB stick
- Avoid: `C:\Program Files` (Windows blocks writing there, so settings would fall back to
  your AppData folder instead of staying next to the app)

You will get:

```
SteamEdge/
  SteamEdge.exe        the app
  settings/            created on first run - your settings, accounts, session, stats
  cache/               created on first run - price cache and log file
  resources/           the app's own files, do not touch
  README.txt           short user note
```

## 3. First launch

Double-click `SteamEdge.exe`.

Windows SmartScreen may show **"Windows protected your PC"**. This happens because the
executable is not code-signed - a signing certificate costs several hundred dollars a
year, which a free hobby project does not have. Click **More info → Run anyway**.

If you would rather not trust a binary from a stranger, that is a completely reasonable
position: [build it yourself from source](#building-it-yourself) instead.

## 4. Sign in

You have two options.

### Option A - QR code (recommended)

1. Open the **Steam mobile app** on your phone.
2. Tap the menu → **Steam Guard** → the QR scanner icon.
3. Scan the code shown in SteamEdge.
4. Approve the login on your phone.

Your password is never typed anywhere. This is the safest option.

### Option B - Username and password

1. Type your Steam username and password.
2. Enter the Steam Guard code when asked (from the mobile app or your email).

Your password is used once to obtain a token and is **not saved**. What is saved is the
refresh token Steam issues, kept in `settings/session.json`.

> **Protect the `settings/` folder.** Anyone who copies it can sign in as you. Do not
> upload it, do not put it in a shared folder, do not include it in a bug report.

## 5. Optional - mobile authenticator file (maFile)

After signing in, SteamEdge can generate a maFile. This lets it enter Steam Guard codes
automatically, which matters if you want bulk market sales to confirm without you
approving each one on your phone.

You can skip this. Press **Skip (continue without maFile)** and everything except
auto-confirmation still works.

If you already have a maFile from another tool, use **Import maFile** instead.

## 6. Adding more accounts

SteamEdge farms several accounts at the same time.

1. Click your avatar in the top-right → **Add account**.
2. Sign in with the second account (QR or password).
3. Both accounts now farm in parallel in the background.

Switch which account the window shows from the same avatar menu. The other accounts keep
working while you are looking at one of them.

## Where your data lives

| Path | What is in it | Safe to delete? |
|---|---|---|
| `settings/settings.json` | All your preferences | Yes - resets to defaults |
| `settings/session.json` | Your login token | Yes - you will be signed out |
| `settings/accounts.json` | Saved accounts list | Yes - you will need to sign in again |
| `settings/stats.json` | Lifetime totals | Yes - loses history only |
| `settings/state.json` | Queue order, achievement log | Yes |
| `cache/prices.json` | Market price cache | Yes - prices refetch |
| `cache/steamedge.log` | Diagnostic log | Yes |
| `cache/chromium/` | Interface cache | Yes |

**Backups:** Settings → General → Backup → **Export**. This writes a single `.json` with
your preferences and statistics. Login tokens and saved accounts are deliberately **not**
included, so the backup file is safe to keep in cloud storage.

## Moving to another computer

Copy the whole folder. Your settings, accounts and session come with it. Steam may ask you
to confirm the new device on your phone.

## Uninstalling

Delete the folder. That is all - no registry keys, no leftover files elsewhere.

## Building it yourself

If you prefer not to run a downloaded binary:

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start
```

Requires [Node.js](https://nodejs.org/) 20 or newer. To produce your own portable build:

```bash
npm run build
```

The result appears in `../SteamEdge-vX.Y.Z-win-x64` next to the source folder.

---

Next: [Tutorial](./TUTORIAL.md) - farm your first cards.
