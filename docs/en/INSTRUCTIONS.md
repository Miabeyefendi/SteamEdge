# Instructions - every setting explained

[English](../en/INSTRUCTIONS.md) · [Türkçe](../tr/INSTRUCTIONS.md) · [Deutsch](../de/INSTRUCTIONS.md) · [Español](../es/INSTRUCTIONS.md) · [繁體中文](../zh/INSTRUCTIONS.md)

Open settings with the gear icon in the top-right. Settings are **app-wide**, not
per-account. Every row has a **?** you can hover for the same explanation shown here.

Changes save immediately. **Reset to defaults** is at the top of the screen.

---

## General

| Setting | Default | What it does |
|---|---|---|
| **App language** | Türkçe | English, Türkçe, Deutsch, Español, 繁體中文. The app reloads when you change it. |
| **Start page** | Overview | Which tab opens on launch. |
| **Interface density** | Comfortable | Compact reduces row height, fitting about a third more rows per screen. |
| **Time format** | 24-hour | Applies to session timers, log timestamps and quiet hours. |
| **Start with Windows** | Off | Launches SteamEdge at login, silently into the tray. |
| **Minimise to tray on close** | Off | Closing the window keeps farming running in the background. |
| **Prevent sleep** | Off | Stops the PC sleeping and the screen locking while farming or boosting. |
| **Start with the sidebar collapsed** | Off | Icon-only sidebar; the content area gains 128 pixels. |

### Backup

| Setting | Default | What it does |
|---|---|---|
| **Export / Import** | - | Writes all preferences and lifetime statistics to one `.json`. **Login tokens and saved accounts are deliberately excluded**, so the file is safe to store in the cloud. |
| **How long remembered data is kept** | 90 days | Applies to queue order, removed games and the achievement log. Expired entries are deleted at startup. Your settings are not affected. |

### Danger zone

**Delete all data** removes session, saved accounts, settings, statistics and price cache,
then returns to the login screen. Your Steam account is untouched. Two confirmations
required.

---

## Card Farming

| Setting | Default | What it does |
|---|---|---|
| **Default priority mode** | Sequential | Which mode the Card Farming tab opens with. |
| **Default queue order** | Default | Which column the queue is sorted by on open. |
| **Max games at once** | 10 | How many games count as running simultaneously. The known Steam client limit is 32 - this is server-side behaviour, not a limit in this app. Lower values use fewer resources. |
| **Max time per game** | 5 min | When this elapses the queue moves on even if no card dropped. `0` disables the limit. |
| **Retry after error** | 3 | How many times a dropped Steam connection is retried. The delay doubles each attempt. |
| **Reconnect automatically** | On | Restores the session after an internet or Steam outage and resumes the queue. |
| **Move to the next game when cards run out** | On | Off means you start each game manually. |

### Automation

| Setting | Default | What it does |
|---|---|---|
| **Auto-list on the market** | Off | Lists newly dropped cards at the average price. **Changes your account permanently** - off by default. |
| **Farm in the background** | Off | Skips per-second interface redraws while the window is hidden. The engine is unaffected. |
| **Unlock achievements while hours accrue** | Off | Unlocks locked achievements at intervals during farming. **Changes your account permanently.** |
| **Notify on card drop** | Off | Desktop notification for every card. |

---

## Market

| Setting | Default | What it does |
|---|---|---|
| **Default selling price** | Average | The starting strategy for the sell bar: average, undercut, match lowest, sell instantly, or custom. |
| **Undercut amount** | 1 cent | How far below the cheapest listing "Undercut" goes. Small protects profit, large sells faster. |
| **Max items per bulk sale** | 50 | Higher values can trigger a temporary restriction on Steam's side. |
| **Order book depth** | 5 | How many price levels the detail panel lists. |
| **Price refresh interval** | 15 min | How often prices re-fetch while the Inventory tab is open. |
| **Refresh prices automatically** | Off | Enables the interval above. |
| **Ask for confirmation before selling** | On | Shows item count, gross and net before listing. |
| **Two-step confirmation when selling** | Off | Requires the Steam Guard mobile code for bulk sales. |
| **Price drop alert** | Off | Notifies when an item falls below its recent median. |

> **Prices always match Steam.** There is no currency conversion and no fee deduction in
> the list columns. The amount shown is exactly the amount on the Steam market page. The
> net figure - what reaches your wallet after Steam's cut - is shown separately in the
> selling flow.

---

## Inventory

| Setting | Default | What it does |
|---|---|---|
| **Default sorting** | By value | Which column the table opens sorted by. |
| **Double-click action** | Open details | What double-clicking an item does. "Sell instantly" skips confirmation - be careful. |
| **Low-value threshold** | 1 | Items below this are dimmed so they stand out during bulk selection. |
| **Hide items that cannot be sold** | Off | Removes coupons, gifts and non-tradable items. |
| **Hide sold items** | On | Listed items move to Pending so you do not list them twice. |
| **Group by game** | Off | Opens with grouping enabled. |
| **Compact rows** | Off | Row height 60 → 40 pixels. |

---

## Hour Booster

| Setting | Default | What it does |
|---|---|---|
| **Default target duration** | 1 hour | The duration the tab opens with. Unlimited runs until you stop it. |
| **Max games at once** | 32 | The known limit. Steam does not count time for games beyond it. |
| **Game start interval** | 5 s | Games start one by one at this spacing rather than all at once. |
| **Remember the game list** | On | Your selection is restored next launch. |
| **Stop automatically when the time is up** | On | Off keeps games open past the target. |
| **Shuffle the game order** | Off | Different order each session, spreading hours evenly. |
| **Pause farming while boosting** | Off | Avoids running both engines against Steam at once. |

### Hour sync

| Setting | Default | What it does |
|---|---|---|
| **Sync playtimes** | **Off** | Levels the total playtime of selected games in stages. See [Tutorial](./TUTORIAL.md#hour-sync). |
| **Target** | Highest of the selected | Or manually entered hours, or the highest in your whole library. |
| **Manual target hours** | 100 | Only used when the target is "Manually entered hours". |

---

## Achievements

| Setting | Default | What it does |
|---|---|---|
| **Unlock interval** | 1 second | The wait between two unlocks. The real delay varies randomly around it (±40%) so no fixed rhythm forms. Longer options go up to 90 minutes. |
| **Default sorting** | Default | Rarity sorting puts the least-unlocked achievements first. |
| **Safe mode** | On | Unlocks one at a time using the interval. Leave it on. |
| **Spread unlocks over time** | Off | Much wider randomisation - looks natural, takes far longer. |
| **Ask for confirmation on single changes** | On | Off lets you toggle instantly with a double-click. |
| **I ticked "do not ask again"** | Off | Appears here if you dismissed the confirmation dialog. Turn it off to bring the dialog back. |

> Unlocking achievements changes your Steam account permanently. Re-locking is possible,
> but the original unlock date cannot be restored.

---

## Notifications

| Setting | Default | What it does |
|---|---|---|
| **Show desktop notifications** | On | Master switch. Off silences everything below; in-app records continue. |
| **Card farming started / stopped** | On | Includes the card count. |
| **Hour boosting started / stopped** | On | Start, target reached, and stop. |
| **When an achievement unlocks** | On | |
| **When an error occurs** | On | Connection drops, rejected logins, sale failures. Not recommended to disable. |
| **Notification sound** | Chime | 23 sounds, all generated in-app - no files, no licensing issues. Selecting one plays it. |
| **Quiet hours** | Off | No notifications in the range you set, errors included. |

### Steam chat

| Setting | Default | What it does |
|---|---|---|
| **Notify me on new messages** | On | Friends messaging you on Steam reach you even while the app runs in the background. |
| **Send an automatic reply** | Off | Auto-replies to whoever messages you. |
| **Automatic reply text** | *(a short away message)* | Leave empty to disable. |
| **Cooldown before replying again** | 1 hour | Prevents spamming someone who writes repeatedly. |

---

## Privacy & security

| Setting | Default | What it does |
|---|---|---|
| **Appear offline** | Off | Friends do not see you playing; activity is not published to your profile. |
| **Hide the game name** | Off | You appear online, but which game is running stays hidden. |
| **Session timeout** | Never | Signs out after this much inactivity. Active farming or boosting resets the timer. |
| **Two-step confirmation when selling** | Off | Steam Guard code for bulk sales. Protects your inventory if the account is compromised. |

---

## Statistics

Lifetime totals: runtime, cards dropped, cards sold, boost time, best day, average sale,
and when tracking started. **Reset statistics** clears them.

> XP and badge counts are not tracked - Steam does not expose them to headless access.
> Card, sale and time figures are real measurements.

---

## Advanced & data

| Setting | Default | What it does |
|---|---|---|
| **Log level** | Errors only | Verbose noticeably increases disk usage. Use it only while troubleshooting. |
| **Keep debug logs** | Off | Writes all protocol traffic to `cache/steamedge.log`. Attach it to bug reports. |
| **Hardware acceleration** | On | Turning it off shrinks the graphics process and cut memory use by roughly 45 MB in our measurements, at the cost of drawing on the CPU. Turn it off and restart if you see graphical glitches or freezes as well. |
| **Memory in use** | - | Total across every SteamEdge process, with a per-process breakdown. Read from the process metrics, not estimated. |
| **API request interval** | 350 ms | Minimum gap between Steam requests. Below 350 ms risks a temporary rate limit. |
| **Open data folder** | - | Opens the folder holding `settings/` and `cache/`. |
| **Clear price cache** | - | Forces all prices to refetch. |

---

## Account card

The panel on the right of Settings. Steam level, connection status and every identity
format for the signed-in account: **SteamID** (the 17-digit one), **SteamID2**
(`STEAM_1:...`), **SteamID3** (`[U:1:...]`), **account number**, **hex** and the **custom
address** if the profile has one. Click any row to copy it. All of them are derived locally
from the SteamID - nothing is asked of Steam - except the custom address, which is read
from the profile page.

**Copy identities** puts all of them on the clipboard at once; **Open profile** opens the
profile in your browser.

---

## Updates

SteamEdge checks the release list **once at start-up** and shows a window **only** when a
newer version exists. If you are up to date, nothing appears.

The download button in the top bar, between the bell and the gear, repeats the check
whenever you want; there the result is always reported, up to date included.

The app reads a version number and nothing else. It never downloads, installs or replaces
itself - you decide what to install and when. To upgrade: extract the new archive into an
**empty, new folder** and copy your old `settings/` folder next to it.

---

## About

Version, credits, and links to the projects that inspired SteamEdge. **No code was taken
from any of them** - see [README](../../README.md#credits).

---

## Recommended starting point

If you just want it to work without thinking:

- Card Farming: **Fast** mode, max games **10**
- Achievements: **Safe mode on**, interval **1 second**
- Market: **Ask for confirmation before selling on**
- Privacy: **Appear offline on** if you have friends who will notice
- Notifications: **Quiet hours on** for your sleeping hours

---

Questions about safety, bans or errors: [FAQ](./FAQ.md).
