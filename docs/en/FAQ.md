# FAQ

[English](../en/FAQ.md) · [Türkçe](../tr/FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [繁體中文](../zh/FAQ.md)

---

## Safety and bans

### Will I get banned?

Nobody can promise you will not be. Here is what is actually true, so you can decide for
yourself.

**What SteamEdge does:** it sends the same `ClientGamesPlayed` message the official Steam
client sends when you launch a game. Steam sees a game as running and drops cards
normally. That is the entire mechanism.

**What it does not do:** it does not modify game files, does not inject into any process,
does not use the Steam Web API key, does not touch other players, does not trade or gift
on your behalf, and does not interact with VAC-protected games in any way.

**The honest risk:** automating your account is against the
[Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/). Tools
like this have existed for over a decade and mass bans for card farming have not happened,
but "has not happened" is not "cannot happen". Valve can change policy whenever they like.
You accept that risk yourself.

### Is VAC involved?

No. VAC bans are issued for cheating in a running game process. SteamEdge never launches a
game, so there is no process for VAC to inspect.

### What actually gets people in trouble?

Not the card farming itself. The things that draw attention:

- **Unlocking hundreds of achievements in minutes.** This is public on your profile and
  third-party sites track it. Use safe mode and a real interval.
- **Trade and market abuse** - not something this app does, but people who automate
  farming often automate other things too.
- **Sharing your `settings/` folder.** That folder contains your login token. Anyone with
  it is you.

### Is my password stored?

No. With QR login your password is never typed. With password login it is used once to
obtain a token and then discarded. What is stored is the refresh token Steam issues, kept
in `settings/session.json`.

Treat `settings/` like a password: do not upload it, do not put it in a shared folder, do
not attach it to a bug report.

---

## Common problems

### Windows says "Windows protected your PC"

The executable is not code-signed. A certificate costs several hundred dollars a year,
which a free hobby project does not have. Click **More info → Run anyway**, or
[build it yourself from source](./SETUP.md#building-it-yourself).

### "SteamEdge is already open" appears and the app closes

Only one copy can run at a time. If two ran together, Steam would drop the first session
(`LogonSessionReplaced`) and pages would show "Not connected". Close the open window and
start again.

### Achievements or Inventory show "Not connected"

The Steam session was taken over by another login. Usually this means the Steam client is
open on the same account, or another copy of SteamEdge is running. Close the other one and
press **Retry**.

### "Steam rate limit" in the market boxes

Steam allows roughly 20 market requests per 30 seconds, per account. SteamEdge queues
everything through a single gate so requests never overlap, but you can still hit the
limit if you open many item details quickly.

Just wait a minute and press **Retry**. To avoid it, filter first and use **Fetch prices**
instead of loading your whole inventory.

### Prices look wrong

Prices are fetched in your Steam wallet's own currency, read from the Community Market,
and shown in exactly that currency. There is no conversion.

If a number looks wrong, check which box you are reading:

- **Current listings** is what sellers ask, and can be absurd - one person can list an
  item at $999,999.
- **Completed sales** is what it actually sold for. That is the real value.

### Cards are not dropping

Check, in order:

1. **Does the game still have drops left?** Press Refresh game list.
2. **Is the game past 2 hours of playtime?** Steam does not drop cards before that. Fast
   mode handles this automatically.
3. **Is the account eligible?** Steam requires at least one $5 purchase on the account
   before it can receive card drops.
4. **Is another Steam session interfering?** Close the Steam client.

### The app is using a lot of memory

That is Electron: it runs as several processes, so Task Manager shows several SteamEdge
rows. Settings → Advanced → **Memory in use** adds them up for you and shows which process
holds what. On our machine a typical session sits at 200-240 MB total.

Two things bring it down:

- **Hardware acceleration off** (Settings → Advanced). The graphics process shrinks; total
  went from 212 MB to 163 MB in our measurement. Drawing then happens on the CPU.
- **Farm in the background** (Card Farming → Automation). While the window is hidden, the
  open tab's list is released from memory and redrawn when you come back.

Lists of tabs you are not looking at are already released automatically, and redrawing
stops entirely while the window is hidden.

### How do I update?

SteamEdge checks the release list once at start-up and shows a window only if a newer
version exists; when you are current it stays quiet. The download button in the top bar
repeats the check on demand.

It never updates itself. Download the new archive from the releases page, extract it into
an **empty, new folder**, then copy your old `settings/` folder next to the new
`SteamEdge.exe`. Your settings, saved accounts and session come with it.

Extracting a new version **over** an old folder is the one thing to avoid: files that are
in use are skipped, you end up with a mix of two versions, and the app refuses to start.

### Where are my files?

Next to `SteamEdge.exe`, in `settings/` and `cache/`. Settings → Advanced → **Open data
folder** takes you there.

If you extracted the app into `C:\Program Files`, Windows blocks writing there and the app
falls back to your AppData folder. Move the folder somewhere writable to get the portable
layout back.

---

## Features

### Can I run several accounts at once?

Yes. Avatar menu → **Add account**. All signed-in accounts farm in parallel in the
background; the window shows whichever one you switch to.

### Does hour boosting really work?

Yes - Steam counts playtime for every game open at once, up to a known limit of 32. The
limit is enforced by Steam's servers, not by this app.

### What is hour sync?

It levels the total playtime of several games to the same number, in stages. See the
[Tutorial](./TUTORIAL.md#hour-sync).

### Can I lock an achievement again?

Yes. The original unlock date is lost permanently, though.

### Does it work without the Steam mobile app?

Yes, but you will need to enter Steam Guard codes manually, and bulk market listings will
each need confirming in whatever way your account is set up.

### Linux / macOS?

Only Windows is built at the moment. The code is plain Electron with no Windows-specific
dependencies, so `npm run build -- --platform=linux` will likely produce a working build,
but it is untested and unsupported.

---

## Project

### Is this a fork of Idle Master / ASF?

No. It was written from scratch. Those projects were studied to understand how Steam
works - no code was copied. Full credits in the [README](../../README.md#credits).

### Why AGPL-3.0?

So that anyone who redistributes it, or runs a modified version as a service, has to keep
the source open. If you want to use it in a closed product, contact the author about a
commercial licence.

### How do I report a bug?

Open an issue with:

1. What you did, what you expected, what happened.
2. Your SteamEdge version (Settings → About).
3. Your Windows version.
4. The log: Settings → Advanced → turn on **Keep debug logs**, reproduce the problem, then
   attach `cache/steamedge.log`.

**Never attach `settings/session.json` or `settings/accounts.json`.** They contain your
login token.

Security vulnerabilities: follow [SECURITY.md](../../SECURITY.md) instead of opening a
public issue.

### How can I help?

Translations, bug reports and pull requests are all welcome - see
[CONTRIBUTING.md](../../CONTRIBUTING.md). The interface dictionary lives in
`src/main/js/i18n.js`; adding a language means adding one column.
