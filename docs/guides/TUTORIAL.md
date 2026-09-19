<div align="center">

# 📖 SteamEdge Tutorial

**English** · [Türkçe](../locales/TUTORIAL_TR.md) · [Deutsch](../locales/TUTORIAL_DE.md) · [Español](../locales/TUTORIAL_ES.md) · [简体中文](../locales/TUTORIAL_ZH.md) · [Русский](../locales/TUTORIAL_RU.md)

[Back to the README](../../README.md) · [Changelog](../../CHANGELOG.md)

</div>

---

## 📑 Contents

- [Overview](#-overview)
- [Installation](#-installation)
- [Interface tour](#️-interface-tour)
- [Feature reference](#-feature-reference)
- [Configuration reference](#️-configuration-reference)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [Glossary](#-glossary)

---

## 🔭 Overview

### What it does

SteamEdge keeps your Steam games "running" without running them. It collects trading cards, banks playtime, reads and writes achievements, and prices your inventory against the real market. Every one of those things normally needs the Steam client open; none of them do here.

### How it works

The application speaks Steam's own network protocol, the same one the client uses. It logs in with a session token, tells Steam which games are being played, and reads back badge pages, inventories, market data and achievement schemas.

Two consequences follow from that, and they explain most of the app's behaviour:

- **Steam is the only source of truth.** Nothing is estimated or invented. If a number cannot be fetched, the box shows a dash rather than a guess.
- **Steam's limits are the app's limits.** Market requests are capped at roughly 20 per 30 seconds per account, and every part of the app that touches the market shares that one budget. Card drops only begin after a game passes two hours of total playtime. These are measured facts, not settings.

### File layout

Everything lives next to the executable. Nothing is written to the registry, `AppData` or `Program Files`.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              general settings
    accounts.json              saved accounts
    session.json               active session token
    accounts/<steamID>.json    per-account data: queues, presets, stats
  cache/
    prices.json                market prices, 24 hour lifetime
    history.json               realised sale averages, 72 hour lifetime
    basarimsiz.json            games found to have no achievements
    steamedge.log              the log to attach to a bug report
```

> **`settings/` is the sensitive one.** `session.json` holds a token that is enough to use your account. Do not put it in a backup you share, an archive you upload or a screenshot.

---

## 📦 Installation

### Requirements

Windows 10 or newer, 64 bit. A Steam account with Steam Guard enabled. About 320 MB of disk space once extracted. The Steam client is not required and is never launched.

### Step by step

1. Download the latest `.rar` from the [releases page](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extract it to a folder you own. Not `Program Files`, because the app writes its settings next to itself.
3. Run `SteamEdge.exe`.
4. Log in. The QR tab is the easier route: scan the code with the Steam mobile app and approve. The password tab wants your username, password and a Steam Guard code.

### Verifying the install

The bottom left of the window shows `SYSTEM: RUNNING` once a session is live, and the account badge in the top right fills in with your name, avatar and level. If the badge stays blank, the session did not come up; see [troubleshooting](#-troubleshooting).

### Updating

The app checks the published version number and tells you when a newer release exists. It does not download or install anything, on purpose. To update, extract the new archive over the old folder and keep your `settings/` and `cache/` folders.

### Uninstalling

Delete the folder. That is the whole procedure.

---

## 🖥️ Interface tour

### Overview

The landing page. The **Active Task** panel shows whatever is actually running, one job at a time, with arrows to step between them when several run at once. Start, Stop and Details act on the job you are looking at, not on a fixed page.

Below it, the queue and the activity feed. On the right, stat tiles for cards, library size, inventory value, hours booster and achievements. A tile shows a dash when its page has not been loaded yet, which is a statement about what has been fetched, not about your account.

### Card Farming

The list of games with cards still to drop, scraped from your badge pages. Pick a mode, set a session length, press Start.

### Inventory & Market

Your Steam inventory, merged so duplicates count as one row. Prices and realised sale averages are fetched in the background, one item at a time, both values together. The detail panel shows the order book and lets you list an item for sale.

### Hours Booster

Your whole library, searchable. Select games, set a concurrent limit and a duration, press Start. Optional hour syncing pulls a selection up to a common total.

### Realistic Mode

A three column workspace. The queue and session length on the left, the unlock order in the middle, settings on the right, split into a Simple and an Advanced panel.

### Achievements

Per game, the real locked and unlocked state read from the protocol. Select achievements and unlock or relock them in bulk, with live progress and a stop button that takes effect mid-wait.

### Settings

Everything the app can be told to do, grouped: general, card farming, market, hours booster, realistic mode, privacy, account identity, backup.

### Chat

Opened from the Chat button at the top right, not the sidebar. Friends on the left with the online ones first, the conversation on the right. Enter sends, Shift+Enter starts a new line. Unread counts show on the friend row and on the top bar button.

---

## 🧩 Feature reference

### Card farming

Steam does not drop cards until a game passes **two hours** of total playtime. Every mode except one ignores that and simply runs games; **Fast mode** knows it, and rotates games that are already past the threshold so time is not spent on games that cannot drop anything yet.

The modes:

| Mode | What it does |
|---|---|
| Sequential | One game at a time, in list order |
| Most cards | Games with the most remaining cards first |
| Fewest cards | Games closest to finishing first |
| Priority | Your own order |
| Fast | Only games already past two hours, rotated on a short interval |

Cards do not arrive on a schedule and Steam sends no "a card dropped" event. The app measures the remaining-card total periodically and reports the honest difference rather than a made-up counter.

### Hours booster

Runs up to 32 games at once. Steam counts time against every open game separately, so 32 games open for an hour is 32 hours of playtime.

**Hour syncing** pulls a selection up to the same total. Two methods:

- **All at once** - every selected game runs simultaneously and drops off as it reaches the target. Fastest possible route: the whole job takes as long as the game furthest behind.
- **One by one** - the game furthest behind is pulled forward alone, and once it catches the next one they continue together. Slower, but the games stay level with each other along the way.

Progress bars sit on a shared timeline: a bar is one minus the game's remaining time over the length of the whole job. A game finishing four hours into a thirty-five hour run starts nearly full; one running to the end starts empty. Each reaches 100% exactly when it hits the target.

### Achievements

Achievements are read and written over the protocol, not by scraping your public profile. A private profile makes no difference.

Two categories cannot be touched, and the app detects both from the schema rather than failing repeatedly:

- **Protected achievements** are written by the game server. Steam rejects any client that tries.
- **Games with no stats over this protocol** (some large multiplayer titles) report `0 / N`. That is correct, not a bug.

Some games only accept achievement writes while the game is open. The app opens the game for the write and then restores whatever was running before.

### Realistic Mode

Holds one game open and unlocks its achievements across the session, from the most common to the rarest. The point is the trail it leaves: hundreds of achievements appearing in a minute is obvious on a profile and on third party sites.

**100% completion time** is the number the whole page is built on: how many hours it takes to finish this game with all its achievements. Enter it and it is remembered for that game. Leave it empty and it is estimated from the game type, but that estimate is your own playtime times a factor, so it inflates on games you have played a lot.

**Target count** is worked out from two parts: what should already be unlocked at your playtime minus what actually is, plus this session's own share. The panel spells the arithmetic out so you can check it.

**Distribution model** shapes the spacing. Linear is even, exponential front-loads the way a real player's first hours look, Pareto puts most of them in the first fifth.

**Pacing** is weighted by rarity. Only achievements under 5% wait noticeably longer; everything above that keeps an even, quick rhythm. A game played past its completion time compresses the whole schedule, since there is no learning curve left to imitate.

**Games with no achievements** are dropped from the queue the moment that is discovered, written to `cache/basarimsiz.json` and never offered on this page again. The library flag Steam publishes is not reliable; only the schema request is.

### Inventory and market

Item value is the **quantity-weighted median of realised sales**, not the lowest active listing. One person listing a card at 999,999 does not move it.

Prices arrive in your account's **wallet currency** and are shown exactly as they arrive. There is no conversion, deliberately: converting would mean inventing an exchange rate.

Price and sale average are fetched **per item, together**, then the queue moves to the next item. Both share Steam's single market budget, and the rate limit is counted in requests rather than items.

### Chat

Friend messages run over the same network protocol as everything else here, so no Steam client is involved. Opening a conversation marks it read on Steam, and the person you are writing to sees the typing indicator.

**Group chats are out of scope.** They are a separate concept in the protocol (chat room groups) and want a screen of their own.

### Multiple accounts

Several accounts can be connected at once. Each keeps its own engine, its own queues and its own data file. Switching accounts does not restart the app or interrupt what the other accounts are doing.

---

## ⚙️ Configuration reference

Settings live in `settings/settings.json`. Everything below is editable from the Settings page.

### General

| Key | Default | What it does |
|---|---|---|
| `language` | `tr` | Interface language: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Start with Windows |
| `preventSleep` | `true` | Keep the machine awake while something is running |
| `sessionTimeout` | `never` | Disconnect after this many idle minutes. Background jobs do not reset the timer; only your interaction does |

### Card farming

| Key | Default | What it does |
|---|---|---|
| `autoNextGame` | `true` | Move to the next game when one finishes |
| `cardMaxGames` | `32` | Games open at once |
| `fastMinPlaytimeMin` | `120` | Fast mode ignores games below this playtime |
| `pauseFarmOnBoost` | `false` | Stop farming when the hours booster starts |

### Market

| Key | Default | What it does |
|---|---|---|
| `priceRefreshHours` | `24` | How long a fetched price stays fresh |
| `historyRefreshHours` | `72` | How long a sale average stays fresh |
| `fetchAvgWithPrice` | `true` | Fetch the average in the same pass as the price. Off means one request per item and averages only via the Average button |
| `bookDepth` | `5` | Order book rows in the detail panel |

### Hours booster

| Key | Default | What it does |
|---|---|---|
| `boostMaxGames` | `32` | Games open at once |
| `boostDurationSec` | `3600` | Session length |
| `boostSync` | `false` | Pull the selection up to a common total |
| `boostSyncMode` | `highest` | Target: `highest` selected, `manual` hours, or `library` highest |
| `boostSyncStrategy` | `parallel` | `parallel` is all at once, `staged` is one by one |
| `boostAutoRestart` | `false` | Start the queue again when the session ends |
| `rememberBoostList` | `false` | Keep the selection between sessions |

### Realistic Mode

| Key | Default | What it does |
|---|---|---|
| `grDurationSec` | `7200` | Session length |
| `grModel` | `linear` | Distribution model |
| `grTcOyun` | `{}` | 100% completion time per game, in hours |
| `grCatchUp` | `true` | Compress the overdue backlog into the start of the session |
| `grHiz` | `1` | Speed multiplier for the whole schedule |
| `grUltraCarpan` | `3` | How much longer sub-5% achievements wait |
| `grTelafiPay` | `20` | Percentage of the session the catch-up burst gets |
| `grBitmisSik` | `50` | How far the schedule compresses on a finished game |
| `grKeepHours` | `true` | Keep collecting hours after the unlocks finish |
| `grSkipUltraRare` | `false` | Skip achievements under 5% entirely |

### Privacy

| Key | Default | What it does |
|---|---|---|
| `offlineMode` | `false` | Appear offline while running |
| `hideGameName` | `false` | Share that you are online but not which game |

> Appearing offline changes what friends see. It can also change whether Steam counts you as playing, so test it before relying on it for a long session.

### Where the settings are stored

General settings in `settings/settings.json`. Anything that belongs to one account, the hours booster selection, the Realistic Mode queue and presets, the achievement log and the statistics, lives in `settings/accounts/<steamID>.json`. Caches are separate, under `cache/`, and can be deleted at any time without losing configuration.

---

## 🔧 Troubleshooting

### The app opens and closes immediately

Another copy is already running. SteamEdge allows one instance. Check for `SteamEdge.exe` in Task Manager and close it first.

### The account badge stays empty and nothing loads

The Steam session did not come up. A banner appears under the top bar when the connection drops or is retrying. If it persists, check that Steam itself is reachable, then look at `cache/steamedge.log` for the reason.

### "40 cards left" but only a handful dropped

Cards only drop after a game passes two hours of total playtime, and each game has its own limited number of drops. A long session on games that are all under two hours produces nothing at all; use Fast mode, which only picks games past the threshold.

### Prices show a dash, or fill in very slowly

Steam allows roughly 20 market requests per 30 seconds per account, shared across prices, sale averages and listings. A large inventory takes a while by design. With `fetchAvgWithPrice` on, each item costs two requests, so a full inventory takes twice as long but you do not wait a second pass for the averages.

### An achievement will not unlock

Either it is protected, meaning the game server writes it and no client may, or the game keeps no stats over this protocol. Both are detected and reported rather than retried. The bulk operation stops after three consecutive failures and tells you why instead of looking like it hung.

### Realistic Mode suggests only one or two unlocks

The completion time is too high. Left empty it is estimated from your playtime, so a game you have played for a long time reads as an enormously long game. Enter the real 100% completion time in the box on the main panel.

### Collecting a log for a bug report

The log is `cache/steamedge.log` next to the executable, or open it from Settings. It records connection events, queue decisions and errors. It does **not** contain your password or session token, so it is safe to attach; skim it anyway before you post it.

---

## ❓ FAQ

<details>
<summary><b>Does it need the Steam client?</b></summary>

No, and it never launches it.

</details>

<details>
<summary><b>Can I run several accounts at once?</b></summary>

Yes. Each keeps its own connection and its own data, and background accounts keep working while you look at another one.

</details>

<details>
<summary><b>Is there an auto-updater?</b></summary>

No, deliberately. The app reads the published version number and tells you when a newer one exists. It downloads nothing and modifies nothing.

</details>

<details>
<summary><b>Why is everything in my wallet currency?</b></summary>

Because that is how Steam sends it. Converting would mean inventing a rate.

</details>

<details>
<summary><b>Can I move my setup to another machine?</b></summary>

Copy the folder. Everything is in it. Remember that `settings/` includes your session token, so copy it privately.

</details>

---

## 📕 Glossary

| Term | Meaning |
|---|---|
| **AppID** | Steam's numeric id for a game, for example 1091500 for Cyberpunk 2077 |
| **Badge page** | The Steam page listing how many card drops a game has left |
| **Drop** | A trading card granted for playtime |
| **market_hash_name** | The exact name the market uses for an item |
| **Order book** | The live table of buy orders and sell listings for one item |
| **Protected achievement** | One only the game server may set; no client can |
| **Realised sale** | A completed transaction, as opposed to an active listing |
| **Schema** | Steam's definition of a game's achievements and statistics |
| **Session token** | The credential that keeps you logged in. Treat it like a password |
| **Tc** | 100% completion time: hours to finish a game with all achievements |

---

<div align="center">

[Back to the README](../../README.md) · [Report a bug](https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml)

</div>
