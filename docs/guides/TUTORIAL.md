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
- **Steam's limits are the app's limits.** Market requests are capped at roughly 20 per 30 seconds per account, and every part of the app that touches the market shares that one budget. Listing has its own per-account limit that Steam does not publish. On accounts with restricted card drops, cards only begin to drop after a game passes a certain playtime, usually two hours. The limits themselves are Steam's; the app only lets you set the threshold it assumes.

### File layout

Everything lives next to the executable. Nothing is written to the registry or `Program Files`; `AppData` is used only as a fallback when the folder next to the executable cannot be written to.

```
SteamEdge/
  SteamEdge.exe
  settings/
    settings.json              general settings
    accounts.json              saved accounts
    session.json               active session token
    window.json                window size, position, maximized state
    resume.json                jobs that were running when the app ended, written again every half minute while one runs
    accounts/<steamID>.json    per-account data: statistics, queues, key queue, presets, achievement log
    stats.json, state.json     older versions only: read once, never written again
    *.bak, *.bozuk             automatic backup copy and set-aside damaged file
  cache/
    prices.json                market prices, 24 hour lifetime
    history.json               realised sale averages, 72 hour lifetime
    no-achievements.json            games found to have no achievements
    chromium/                  image and page cache
    steamedge.log              the log to attach to a bug report
```

> **`settings/` is the sensitive one.** `session.json` holds a token that is enough to use your account. Do not put it in a backup you share, an archive you upload or a screenshot. With **Encrypt login tokens** on (Settings > Privacy & security) the tokens are stored encrypted, but keep `settings/` private anyway.

---

## 📦 Installation

### Requirements

Windows 10 or newer, 64 bit. A Steam account with Steam Guard enabled. About 290 MB of disk space once extracted. The Steam client is not required and is never launched.

### Step by step

1. Download the latest `.rar` from the [releases page](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extract it to a folder you own. Not `Program Files`, because the app writes its settings next to itself.
3. Run `SteamEdge.exe`.
4. Log in. The QR tab is the easier route: scan the code with the Steam mobile app and approve. The password tab wants your username, password and a Steam Guard code.

### Verifying the install

The bottom left of the window shows `SYSTEM: READY` once a session is live, and `SYSTEM: RUNNING` while a job runs, and the account badge in the top right fills in with your name, avatar and level. If the badge stays blank, the session did not come up; see [troubleshooting](#-troubleshooting).

### Updating

The app checks the published version number a few seconds after startup, and again whenever you press the update button in the top bar, and tells you when a newer release exists. It does not download or install anything, on purpose. To update, close SteamEdge, extract the new archive into an **empty, new folder**, and copy the `settings/` folder from the old one into it. Extracting over the old folder while the app is open leaves files from two versions mixed; the app detects the common case and tells you at startup.

Files written by an older version are converted the first time they are read, so copying `settings/` over is all it takes. The conversion goes one way: once 1.4.0 has opened a `settings/` folder, 1.3.x can no longer use it, so keep a copy if you may want to go back.

### Uninstalling

Delete the folder. That is the whole procedure.

---

## 🖥️ Interface tour

### Overview

The landing page. The **Active Task** panel shows whatever is actually running, one job at a time, with arrows to step between them when several run at once. Start, Stop and Details act on the job you are looking at, not on a fixed page.

Above it, six tiles: total cards left, library size, this session, inventory value, hours booster and achievements. **Recent activity** on the left lists what happened, with status and time (the last 30 entries, kept between sessions); **Quick actions** under the Active Task panel refresh the game list, inventory or market and open Settings. A tile shows a dash when its page has not been loaded yet, which is a statement about what has been fetched, not about your account.

### Card Farming

The queue of games with cards still to drop, scraped from your badge pages, with a filter for 1-2 or 3+ cards left. Reorder with the arrows or **Move to top** (the mode switches to Priority), remove a game with ✕; the order and the removals are remembered. On the right: the farming mode, the per-game timer (how long each game runs before the next one takes over, with quick presets; Fast mode sets its own rhythm and dims it), **Automation** (auto-list dropped cards on the market, farm in the background, notify on card drop, unlock achievements while hours accrue) and **Recent drops**. Press Start.

### Inventory & Market

Your Steam inventory, merged so duplicates count as one row, filterable by game, name, type, state and price, optionally grouped by game. **Fetch prices** loads the market prices of what the current filter shows, by default together with each item's sale average; the averages come right after the prices, from the same button, which shows their progress and cancels them. The detail panel shows current listings, the price you can sell for instantly and completed sales. The bar at the bottom totals the selection, gross and what you receive, and offers the sale modes (from the average, undercut, match the lowest, sell instantly, your own price) before **Sell**. **My listings** (top right) opens your active listings, and booster packs and gems have their own types in the type filter. A selector at the start of the filter bar switches to the items of other games (Counter-Strike 2, Dota 2 and more), which load into the same table with the same tools.

### Hours Booster

Your whole library on the left, searchable (at most 300 rows are drawn at a time, so search to narrow it); the active queue in the middle. On the right: **Hour sync** (target and method), the concurrent limit (2, 8, 16, 32 or custom), the duration with presets (6, 12, 18 or 24 hours, ∞ or custom), behaviour toggles and appear offline. A set duration stops the session when it runs out; ∞ runs until you stop it. A selection can be saved as a preset.

### Realistic Mode

A three column workspace under a strip that shows the game, unlocked count, average gap and overall progress. The queue and session length on the left with the AUTO target, the unlock order in the middle with the next achievement on top, settings on the right, split into a Simple and an Advanced panel.

### Achievements

Per game, the real locked and unlocked state read from the protocol, with totals at the top and filters for state and rarity, a grid or list view and a detail panel. Select achievements and unlock or relock them in bulk; the bar at the bottom shows the selection, the estimated time and whether safe mode spaces the unlocks. Progress is live and Stop takes effect mid-wait.

### Keys

Paste product keys, one per line or as "game name, Tab, key", and press **Add to queue**. The keys are redeemed one at a time in the background, even while another page is open. The page shows the queue, the counters and the answer for every key: redeemed, already owned, region locked, invalid, already used, base game required, or the code number Steam sent. When Steam says too many keys were tried (about 50 an hour), the queue waits an hour by itself; **Try now** skips the wait. The queue and the results are saved per account and carry on after a restart.

### Settings

Everything the app can be told to do, grouped: General, Card farming, Market, Inventory, Hour Booster, Achievements, Notifications, Privacy & security, Statistics, Advanced & data and About. The right column shows the account (level, connection status, Steam IDs to copy) and the configuration (last save, unsaved changes).

Changes stay in the page until you press **Save**. Nothing is written before that, and leaving the page with unsaved changes asks first. After Save, a running card farm or hours booster that the changed settings affect pauses for about five seconds and continues from the same game with the new values; settings that do not touch a running job apply at once. **Reset** loads the defaults into the page and also waits for Save; it keeps the app language.

The theme (Automatic, Dark, Midnight Purple, White, High contrast) is under General and applies to the login screen as well. Automatic uses High contrast when the system asks for more contrast and Dark otherwise. **Interface scale** (80 to 150 percent, 100 by default) enlarges or shrinks the whole interface; Ctrl + / - / 0 change it too, and the window that opens on the first start asks for it. If the window is too small for the layout at the chosen scale, the scale shrinks to what fits. Dim text reads at 4.5 : 1 or better against its surface in every theme (7 : 1 in High contrast), no text is smaller than 11 pixels, and the contrast themes of Windows (forced colors) are followed.

The switches and the side menu work from the keyboard: Tab moves between them, Enter or Space presses one, and a screen reader announces them as switches and buttons, with the open page marked as the current one.

The interface density is Automatic by default: it turns compact while the window is short (under about 720 pixels) and relaxes again when you make the window taller. The side menu closes by itself on a window narrower than 1000 pixels, and the window remembers its size, its place and whether it was maximized. Below 900 x 560 pixels (the sign-in screen 900 x 640) the layout does not squeeze any further: the whole page is scaled to fit, down to three quarters, so even a window of 675 x 420 shows every button.

Under **Modules** you can switch pages off (cards, hours, inventory, Realistic Mode, achievements, keys, chat) and move the rest up or down. A page that is off leaves the menu, the overview and the top bar, cannot be opened, and asks Steam for nothing; scheduled jobs keep running in the background according to their settings. **Performance mode** is Automatic, Full or Light. Light turns off animations, transitions, blur and shadows; Automatic switches it on when the system asks for less motion or the computer is weak, and **Set up for this computer** picks a mode from the cores and memory it finds. The first time the app starts it asks which pages you want. A long inventory is drawn in the background, so the page stays usable while 3000 rows appear. Two more cards switch off small features (the activity box on the overview, the favorite stars, the My listings and Export CSV buttons, the selector of the other games' inventories) and top bar items (the search box, the notification button, the update button); the settings and account buttons always stay.

### Chat

Opened from the Chat button at the top right, not the sidebar. Friends on the left with the online ones first, the conversation on the right (the latest 50 messages load when you open it). Enter sends, Shift+Enter starts a new line. Unread counts show on the friend row and on the top bar button.

---

## 🧩 Feature reference

### Card farming

On accounts with restricted card drops, Steam does not drop cards until a game passes a certain total playtime, usually **two hours** (Settings > Card farming > **Card drop threshold**). Reportedly some older accounts have no such restriction and get cards within the first minutes; set the threshold to 0 there. This is not a fixed rule for everyone, so test it on your own account. Every mode except one ignores that and simply runs games; **Fast mode** knows it, and lifts the games still under the threshold above it before it starts rotating.

In every mode but Fast, one game runs at a time for the **Time per game** you set (Settings > Card farming, default 5 minutes; the timer on the Card Farming page starts from it and can be changed per run), then the next game takes over. A game whose cards run out is dropped from the queue and the next one starts at once. When every game in the queue is out of cards, or **Move on when a game is done** is off and the current game's time is up or its cards run out, farming stops and says why instead of restarting the last game. Card farming and the hours booster can run together: each keeps its own set of games and Steam sees both, up to its limit of 32.

**Fast mode** works in two phases. First a warm-up: games under the threshold (`fastMinPlaytimeMin`, 120 minutes) are opened together, in batches of up to **Max games at once**, and stay open until the whole batch has crossed it, because Steam credits time to every open game at the same moment. Then every game that still has cards stays open together, up to the same limit, and the app changes the featured game every 90 to 120 seconds, a random gap each time.

The modes:

| Mode | What it does |
|---|---|
| Sequential | One game at a time, in list order |
| Most cards | Games with the most remaining cards first |
| Fewest cards | Games closest to finishing first |
| Least played first | One at a time, the game with the least playtime first |
| Most played first | One at a time, the game with the most playtime first |
| Priority | Your own order |
| Fast | Warm-up for games under the threshold, then every game open together with a rotating featured game |

Cards do not arrive on a schedule and Steam sends no "a card dropped" event. The app re-reads each account's badge pages every three minutes and reports the honest difference in the remaining-card total rather than a made-up counter.

**Blacklist and whitelist.** The red button on a queue row puts the game on the blacklist: it never farms, by hand or by the schedule, until you take it off in the **Blacklist** tab. The star puts it on the whitelist, and with **Whitelist only** on (Card farming page, Automation box) only the starred games farm. A game is never on both lists. Both lists belong to the account and, unlike the rest of the queue state, never expire with the retention period; games you removed from the queue before 1.4.5 were moved to the blacklist automatically.

**When all cards are collected** can also be set to **Start hour boosting**: the account's remembered hour boosting list starts running, limited to **Max games at once**. With an empty list nothing starts and the activity feed says so.

**Refund window.** With **Skip games in the refund window** on (Card Farming page, or Settings > Card farming), games bought in the last 14 days and played under 2 hours are left out of the queue: Steam keeps the right to a refund for them up to that hour limit, and farming cards would end it. The purchase date comes from your Steam license records; if it cannot be read, no game is skipped. The schedule follows the same filter.

### Hours booster

Runs up to 32 games at once. Steam counts time against every open game separately, so 32 games open for an hour is 32 hours of playtime. **Sequential idling mode** (a toggle on the page) instead cycles the queue one game at a time, with the set duration applying to each game, so ∞ is not available there and hour syncing is not used.

**Hour syncing** pulls a selection up to the same total. Two methods:

- **All at once** - every selected game runs simultaneously and drops off as it reaches the target. Fastest possible route: the whole job takes as long as the game furthest behind.
- **One by one** - the game furthest behind is pulled forward alone, and once it catches the next one they continue together. Slower, but the games stay level with each other along the way.

Progress bars sit on a shared timeline: a bar is one minus the game's remaining time over the length of the whole job. A game finishing four hours into a thirty-five hour run starts nearly full; one running to the end starts empty. Each reaches 100% exactly when it hits the target.

**Level the playtimes** (Hour Booster page) pulls the selected games up to a common total. The **Highest of the selected** target needs two or more selected games: with a single game there is nothing to level, so the duration and the limit stay yours. A manual hour target or the library's highest still works for one game. With **All at once**, every selected game runs together, up to Steam's 32, whatever **Concurrent limit** says, and a game that reaches the target drops out of the list; **One by one** pulls the game furthest behind up alone and lets the next one join when it catches up. The switch is on by default.

### Achievements

Achievements are read and written over the protocol, not by scraping your public profile. A private profile makes no difference.

Two categories cannot be touched, and the app detects both from the schema rather than failing repeatedly:

- **Protected achievements** are written by the game server. Steam rejects any client that tries.
- **Games with no stats over this protocol** (some large multiplayer titles) report `0 / N`. That is correct, not a bug.

Some games only accept achievement writes while the game is open. The app opens the game for the write and then restores whatever was running before.

**Bulk unlock and relock** act on the selected achievements, or on everything the current filter shows when nothing is selected. They are always sent one by one at the **Unlock interval** (Settings > Achievements), never as one burst. With **Safe mode** on, each wait varies randomly by up to 40% either way, or from 40% to 160% of the interval with **Spread unlocks over time**; with Safe mode off the interval is exact. The confirmation shows the interval and the estimated total time, a bulk run stops after three failures in a row, and when it ends the app re-reads the game from Steam and corrects any mark Steam did not actually save. A single unlock asks first unless you ticked Don't ask again (**Ask for confirmation on single changes** in Settings turns it back on); bulk runs always ask. Rarity follows Steam's global unlock percentage in five steps: under 1% Legendary, under 5% Ultra rare, under 10% Rare, under 25% Uncommon, the rest Common. The interval choices are 15, 30 and 45 seconds, 1, 2, 5, 10 and 30 minutes, and 1 hour. While farming cards, **Unlock achievements** works at most once a minute, so shorter values behave like 1 minute there.

### Realistic Mode

Holds one game open and unlocks its achievements across the session, from the most common to the rarest. The point is the trail it leaves: hundreds of achievements appearing in a minute is obvious on a profile and on third party sites.

**100% completion time** is the number the whole page is built on: how many hours it takes to finish this game with all its achievements. Enter it and it is remembered for that game. Leave it empty and it is estimated from the game type, but that estimate is your own playtime times a factor, so it inflates on games you have played a lot.

**Target count** and **duration** are planned together, by the same code that runs the session, so the numbers in the boxes are the numbers that run. With **Set the duration from the settings** on and no duration typed by hand, the target is everything that is left and the session lasts as long as a real player would need for it: the 100% completion time, times the share of the achievements that will be unlocked, times the difficulty (normal is the completion time itself), kept between 15 minutes and 999 hours. A game that takes 60 hours gets 60 hours for all its achievements; with several games in the queue the duration is the sum of the games, each with its own completion time. If you type a duration it stays, and the target becomes what a real player would earn in that time: what should already be unlocked at your playtime minus what actually is, plus the share of those hours. The panel spells the arithmetic out so you can check it. The difficulty follows how long real players take, from HowLongToBeat data for 47 games: Easy is a fast player (about 0.7 of the time, a little less in a long game: 12 hours become 9, 300 become 196), Normal is the time itself, and Hard and Very hard are players who take their time (Hard about 1.3 to 1.4 times the time, Very hard 1.9 times on a short game and 1.6 times on a long one).

**Distribution model** shapes the spacing. Linear is even, exponential front-loads the way a real player's first hours look, Pareto puts most of them in the first fifth.

**Pacing** is weighted by rarity. Only achievements under 5% wait noticeably longer; everything above that keeps an even, quick rhythm. A game played past its completion time compresses the whole schedule, since there is no learning curve left to imitate.

**Games with no achievements** are dropped from the queue the moment that is discovered, written to `cache/no-achievements.json` and never offered on this page again. The library flag Steam publishes is not reliable; only the schema request is.

With **Randomised gaps** on, unlock gaps vary by up to 40% either way and are never shorter than three seconds. With several games in the queue the remaining time is shared out by achievement count, and the queue advances on its own when **Start the queue automatically** is on. If the time runs out with achievements left, the run stops and says how many were not unlocked instead of forcing them; a card farm that was paused for the run resumes afterwards.

**Schedule.** With **Realistic Mode schedule** on (Settings > Achievements), Realistic Mode starts by itself inside its own time range on every connected account, repeating that account's last start made by hand (games, duration, options). The run is cut to what is left of the range and stops when the range closes. An account with something else running is left alone, a run started by hand is never stopped, and an account with no saved start gets a note in the activity feed.

### Inventory and market

Item value is the **quantity-weighted median of realised sales**, not the lowest active listing. One person listing a card at 999,999 does not move it.

Prices arrive in your account's **wallet currency** and are shown exactly as they arrive. There is no conversion, deliberately: converting would mean inventing an exchange rate.

Price and sale average are fetched **per item, together**, then the queue moves to the next item. Both share Steam's single market budget, and the rate limit is counted in requests rather than items; the app sends 18 requests at a time and then waits out Steam's cooldown of about 32 seconds. The interval between requests is under Settings > Advanced & data; Steam's tolerance differs per account.

**Selling.** You choose the price the buyer pays; what you receive is worked out by Steam's own fee script, downloaded from Steam and run in a sandboxed window, so the two match what the Steam site would show. A bulk sale stops when Steam signals a limit or refuses two listings in a row, and the dialog quotes Steam's reason: new accounts can be stopped after 10-15 listings, older ones list 80 or more. Items Steam says cannot be listed right now (for example ones that already have a pending listing) do not stop the run; they are skipped and counted. **Batch size** and **Wait between batches** (Settings > Market) split a large sale; with no wait set, you are asked after each batch. With the mobile authenticator on, every listing still has to be confirmed in the Steam app.

**Price drop alert.** When an item's cheapest listing is at least the **Price drop threshold** (default 10%) below Steam's 24-hour average, it is marked with a red ▼, the sale confirmation warns in red, and with the alert enabled you get a notification, at most once a day per item.

**My listings.** The button at the top of the page lists your active market listings, the ones waiting for a confirmation and the ones on hold, with the price the buyer pays and what you receive. Select active listings and take them back; the items return to your inventory and the inventory is read again. Listings waiting for confirmation are confirmed or cancelled in the Steam app, and listings on hold return by themselves when the hold ends.

**Booster packs and gems** have their own types. A booster pack can be opened from the detail panel; the cards that come out are added to the inventory. Opening a pack is permanent.

**Export CSV.** The button at the top of the page writes the items the page shows (the current filter, or everything) to a CSV file you choose: name, game, type, quantity, marketable, tradable, the lowest and median price already fetched, the unit value and the value of the stack. Prices are not fetched for the export, so fetch them first if you want them in the file. The column names are always English, and a name that starts like a formula is marked with an apostrophe so a spreadsheet does not run it.

**Other games' inventories.** The selector at the start of the filter bar lists the games the account has items in, read from the inventory page. Pick one and its backpack loads into the same table: the type and game filters step aside, and prices, sale history, the order book, selling and the CSV export work as for Steam items; a double click opens the item's own market page. What was read is kept until you sell or refresh, so going back and forth costs no request. Prices are fetched with the button and not on their own, because a backpack can hold hundreds of kinds of item and Steam allows about 20 requests in 30 seconds. A game's items are priced by name only, so wear (float), pattern and stickers are not part of the price; check the price of expensive items on Steam, the sale question warns about it. An inventory bigger than 2000 items is read page by page, and if Steam refuses a later page the part that was read is shown with a notice. Steam does not block these items; the selector can be switched off under Settings > Modules.

### Product keys

Keys go into a per-account queue that runs in the background. A key is accepted in the usual form of three to six groups of four to six capital letters or digits, separated by hyphens; a line can also carry a game name before the key. Keys that are already in the queue or in the results are skipped. After each answer there is a short pause, and when Steam reports that too many keys were tried the whole queue waits an hour before continuing. A key that Steam refuses is not retried; a key whose answer did not arrive (no connection, timeout) stays in the queue and is tried again shortly. The newest 1000 results are kept. Keys that are already owned are not forwarded to your other accounts.

**Pass on owned keys.** With **Pass on owned keys** on (Keys page), a key the account already owns is tried on the next connected account that has not seen it, and so on, so a spare key is not wasted; the result shows where it went. **Free games:** a Steam store link of a free game (or `app/123`) on a line of its own asks Steam for that app's free license; the result says whether it was added to the account or no license was granted (already owned, or not free).

### Family View

If the Steam account uses Family View, Steam does not serve web pages until the PIN is entered, so the inventory, the market and the badge pages fail to load. Enter the PIN at Settings > Privacy & security > **Family View PIN** and SteamEdge unlocks every new web session with it. The PIN is kept as plain text in the account's file under `settings/accounts/` and is not part of exported backups. It is sealed when **Encrypt login tokens** is on.

### Card farming schedule

With **Card farming schedule** on (Settings > Card farming), card farming starts by itself on every connected account when the time range opens, and the farms it started stop when the range closes. The range can pass midnight, for example 22:00 - 07:00. The queue is built the way a manual start builds it: your **Default priority mode**, the games you removed from the queue, **Skip games that were never played** and **Time per game**.

A farm you started by hand is never stopped by the schedule, and an account is started at most once per range: if you stop it by hand inside the range it stays stopped until the next range. Only accounts that are connected are started; the schedule does not sign anyone in.

### Quick navigation

**Ctrl+K** opens the command palette: type to find a page, a section of Settings, a single setting, another account or an action of the open page (Start or Stop, for example) and press Enter. The arrows move through the list and Esc closes it. **Ctrl+1** to **Ctrl+7** open the pages of the side menu in the order they are shown (a page that is switched off closes up the numbers), **Ctrl+8** opens the chat when it is on and **Ctrl+9** opens Settings. **?** or **Ctrl+/** lists the shortcuts, with the numbers as they are now. The shortcuts wait while a question window is open.

In Settings the **Search settings** box above the sections finds a single setting by its name or by what its help text says, opens its section and lights the row. A section with changes you have not saved carries a dot; after Save the sections that were saved show a tick for a few seconds and are named in the message.

### Resuming unfinished jobs

A job that is running when the app ends (the PC shuts down, the app is closed, it crashes) is written to `settings/resume.json`, and when the account connects at the next start it continues where it left off: a card farm at its game and its minute, an hour boost (all at once or one by one) with the time it had left, a Realistic Mode run with what was left of its target over the time that was left. The time the app was not running does not count: a boost with three hours left has three hours left again. A boost that synchronises hours reads the playtimes again, because they moved while it ran. The file is written when a job starts or ends and every half minute while one runs, so a power cut loses at most half a minute.

Jobs you stopped by hand or that finished are not resumed. Jobs the schedule started are left to the schedule (it starts them itself inside its time range), and an entry older than a week is dropped. If you start something on the account yourself before the page is up, the old entry is dropped. The activity feed and a notification say how many jobs came back. Switch it off under Settings > General > **Resume unfinished jobs at startup**; the file is then removed.

### Login token protection

The saved sign-in tokens in `settings/accounts.json` and `settings/session.json` are plain text by default. With **Encrypt login tokens** on (Settings > Privacy & security) they are stored encrypted with Windows DPAPI, so a copy of the folder is useless on another computer or under another Windows user. Switching it on rewrites both files at once and deletes the `.bak` copies that still held the plain text; switching it off writes plain text again. Encrypted tokens are read whatever the setting is, so nothing is lost either way.

The catch: if you move the folder to another computer or Windows user, or reinstall Windows, those accounts need a fresh sign-in. The Family View PIN and the proxy address (which can hold a password) in `settings/accounts/<steamID>.json` are sealed the same way.

### Proxy

Each account can have its own proxy under Settings > Privacy & security > **Proxy server**: `http://host:port`, `https://host:port` or `socks5://host:port`, with `user:password@` in front of the host when it needs a login. The account's Steam connection and its market, inventory and key requests go through it, and with SOCKS5 the proxy resolves host names. If the proxy is down the account does not connect; it never falls back to a direct connection. A change applies when the account reconnects.

While the account is on screen, the page images, the fee script download and the update check go through it too, by way of a small proxy on 127.0.0.1 that carries on to your proxy with its login (this also makes a SOCKS5 login work for the images). The sign-in has its own **Proxy server for sign-in** setting, because an account's own proxy is only known once it is signed in; that address is stored as plain text in `settings/settings.json` and is not part of the settings export.

### Favorite games

The star on a game in the Hour Booster library, the Achievements game list and the Realistic Mode search puts it at the top of those lists, and in Realistic Mode an empty search shows your starred games. Favorites belong to the account.

### Chat

Friend messages run over the same network protocol as everything else here, so no Steam client is involved. Opening a conversation marks it read on Steam, and the person you are writing to sees the typing indicator.

**Group chats are out of scope.** They are a separate concept in the protocol (chat room groups) and want a screen of their own.

### Multiple accounts

Several accounts can be connected at once. Each keeps its own engine, its own queues, its own statistics and its own data file. Switching accounts does not restart the app or interrupt what the other accounts are doing. Backups exported from Settings include every account's statistics, hours booster list and Realistic Mode queue and presets.

### Connection

When the connection drops, SteamEdge reconnects on its own and running jobs continue where they were. **Reconnect if the connection drops** (Settings > Advanced & data) sets the limit: unlimited, 10 attempts, 3 attempts or off. If Steam ends the session for good, for example because the account signed in somewhere else, retrying stops and a banner offers a Reconnect button.

---

## ⚙️ Configuration reference

Settings live in `settings/settings.json`. Most keys below are controls on the Settings page; the job specific ones (hours booster duration and sync method, Realistic Mode values) sit on the page of their feature. Keys marked * have no control at all and are changed only by editing the file while the app is closed. The tables list the keys worth knowing about; the rest are the other controls on those pages, and the file is rewritten whenever you press Save.

### General

| Key | Default | What it does |
|---|---|---|
| `language` | `en` | Interface language: `tr`, `en`, `de`, `es`, `zh`, `ru` |
| `autoLaunch` | `false` | Start with Windows |
| `theme` | `auto` | Colour theme: `auto` (high contrast when the system asks for it, dark otherwise), `dark`, `midnight` (Midnight Purple), `white`, `contrast` (High contrast) |
| `density` | `auto` | Spacing and row height: `auto` (compact while the window is short), `comfortable`, `compact` |
| `uiScale` | `100` | Interface scale in percent: `80`, `90`, `100`, `110`, `125`, `150`. A window too small for the layout at that scale shrinks it to what fits |
| `perfMode` | `auto` | Performance: `auto`, `full`, `light` (no animations, blur or shadows) |
| `moduleCard`, `moduleInventory`, `moduleHours`, `moduleRealistic`, `moduleAchievements`, `moduleKeys`, `moduleChat` | `true` | Whether each page is in use. A page that is off leaves the menu and makes no Steam request |
| `navOrder` | `overview,card,inventory,hours,realistic,achievements,keys` | The order of the side menu |
| `featFeed`, `featFavorites`, `featListings`, `featCsv`, `featOtherGames` | `true` | Small features that can be switched off: the overview activity box, the favorite stars, My listings, Export CSV, the other games' inventories |
| `topSearch`, `topNotif`, `topUpdate` | `true` | Top bar items that can be switched off: the search box, the notification button, the update button |
| `preventSleep` | `false` | Keep the computer from sleeping while card farming, hours boosting or Realistic Mode runs. The screen can still turn off and lock |
| `resumeJobs` | `true` | Jobs that were running when the app ended start again where they left off (card farming, hour boosting, Realistic Mode) |
| `gpuComposition` | `false` | Composite the window on the graphics card (`true`) or on the processor (`false`: 9 MB of video memory instead of 67 and the card is left to a game). Needs a restart |
| `lowMemory` | `true` | Run the graphics and network code inside the main process: two processes fewer and about 100 MB less memory. Turn it off if you see garbled graphics or sudden closes. Needs a restart |

### Card farming

| Key | Default | What it does |
|---|---|---|
| `autoNextGame` | `true` | Move to the next game when one finishes. Off: farming stops after the current game |
| `farmSkipUnplayed` | `false` | Leave games with no recorded playtime out of the queue |
| `keyForwardOwned` | `false` | Try a key the account already owns on the next connected account |
| `farmSkipRecent` | `false` | Leave games out that were bought in the last 14 days and played under 2 hours |
| `farmFinishedAction` | `none` | `none`, `exit` or `boost`: close the app 20 seconds after every card is collected, if no other job is running, or start the account's remembered hour boosting list |
| `farmScheduleEnabled` | `false` | Start card farming by itself inside the time range below |
| `farmScheduleFrom` | `22:00` | Start of the range |
| `farmScheduleTo` | `07:00` | End of the range. An end before the start means the range passes midnight |
| `farmExcluded` | empty | Card farming blacklist (app ids). Stored per account, never expires, never exported |
| `farmWhitelist` | empty | App ids card farming is limited to while `farmWhitelistOnly` is on. Stored per account |
| `farmWhitelistOnly` | `false` | Farm only the whitelisted games. Stored per account |
| `cardMaxGames` | `32` | Games open at once |
| `farmMaxMinutes` | `5` | Minutes each game runs before the next one takes over. Fast mode sets its own rhythm |
| `fastMinPlaytimeMin` | `120` | Card drop threshold in minutes. Fast mode lifts games under it above it first, then rotates all of them. `0` skips the warm-up |

### Market

| Key | Default | What it does |
|---|---|---|
| `priceRefreshHours`* | `24` | How long a fetched price stays fresh |
| `historyRefreshHours`* | `72` | How long a sale average stays fresh |
| `fetchAvgWithPrice` | `true` | Fetch the average in the same pass as the price. Off means one request per item and averages only via the Average button |
| `bookDepth` | `5` | Order book rows in the detail panel |
| `bulkSellLimit` | `50` | Bulk sales are split into batches of this many items. `0` lists until Steam stops it |
| `sellBatchWaitMin` | `0` | Minutes to wait between batches. `0` asks after each batch |
| `priceDropThreshold` | `10` | Percent below Steam's 24-hour average that counts as a price drop |

### Hours booster

| `boostMaxGames` | `32` | Games open at once. Not used while the hour sync runs: it opens up to 32 itself |
|---|---|---|
| `boostSync` | `true` | Pull the selection up to a common total. The `highest` target only applies when two or more games are selected |
| `boostDurationSec` | `3600` | Session length |
| `boostSync` | `false` | Pull the selection up to a common total |
| `boostSyncMode` | `highest` | Target: `highest` selected, `manual` hours, or `library` highest |
| `boostSyncStrategy` | `parallel` | `parallel` is all at once, `staged` is one by one |
| `boostAutoRestart` | `false` | Start the queue again when the session ends |
| `rememberBoostList` | `true` | Keep the selection between sessions |
| `pauseFarmOnBoost` | `false` | Pause farming while the hours booster or Realistic Mode runs, then resume where it was |
| `favoriteGames` | empty | Starred games of the account, shown first in the Hour Booster, Achievements and Realistic Mode lists. Stored per account, never exported |

### Realistic Mode

| Key | Default | What it does |
|---|---|---|
| `grDurationSec` | `7200` | Session length |
| `grModel` | `linear` | Distribution model |
| `grTcGame` | `{}` | 100% completion time per game, in hours |
| `grCatchUp` | `true` | Compress the overdue backlog into the start of the session |
| `grSpeed` | `1` | Speed multiplier for the whole schedule |
| `grUltraMultiplier` | `3` | How much longer sub-5% achievements wait |
| `grCatchUpShare` | `20` | Percentage of the session the catch-up burst gets |
| `grFinishedRatio` | `50` | How far the schedule compresses on a finished game |
| `grKeepHours` | `true` | Keep collecting hours after the unlocks finish |
| `grSkipUltraRare` | `false` | Skip achievements under 5% entirely |
| `grScheduleEnabled` | `false` | Start Realistic Mode by itself inside the time range below, repeating the account's last start |
| `grScheduleFrom` | `22:00` | Start of the range |
| `grScheduleTo` | `07:00` | End of the range. An end before the start means the range passes midnight |

### Privacy

| Key | Default | What it does |
|---|---|---|
| `offlineMode` | `false` | Appear offline while running |
| `hideGameName` | `false` | Share that you are online but not which game |
| `parentalPin` | empty | Steam Family View PIN of the account, used to unlock web pages. Stored per account, never exported |
| `protectTokens` | `false` | Store the saved sign-in tokens encrypted with Windows DPAPI. Specific to this Windows user and computer, never exported |
| `proxyUrl` | empty | Proxy of the account: `http://`, `https://` or `socks5://`, with an optional `user:password@`. The password is stored in the account's file, sealed when **Encrypt login tokens** is on. Stored per account, never exported |
| `loginProxyUrl` | empty | Proxy the sign-in goes through (`http://`, `https://` or `socks5://`). Plain text in the settings file, never exported |

> Appearing offline changes what friends see. It can also change whether Steam counts you as playing, so test it before relying on it for a long session.

### Advanced

| Key | Default | What it does |
|---|---|---|
| `reconnectPolicy` | `unlimited` | Reconnect after a dropped connection: `unlimited`, `10`, `3`, `off` |
| `sessionTimeout` | `never` | Close every session after this many idle minutes (30, 120 or 480). Running jobs do not count as idle; only your own interaction resets the timer. When it fires, all accounts disconnect, the active session is forgotten and the sign-in screen opens |
| `apiRequestDelayMs` | `350` | Shortest gap between market requests. Lower is faster but closer to Steam's rate limit (HTTP 429) |
| `logLevel` | `error` | What goes into `cache/steamedge.log`: `off`, `error`, `warn`, `info`, `debug` |

### Where the settings are stored

General settings in `settings/settings.json`. Anything that belongs to one account, the hours booster selection, the Realistic Mode queue and presets, the achievement log and the statistics, lives in `settings/accounts/<steamID>.json`. Caches are separate, under `cache/`, and can be deleted at any time without losing configuration. Every JSON file is written to a temporary file and swapped in at once, with the previous good copy kept beside it as `.bak`. If a file cannot be read the `.bak` is used; if that is damaged too, the file is left untouched, a copy is set aside as `.bozuk`, the app tells you at startup and the affected data starts from defaults. `stats.json` and `state.json` exist only in folders from older versions; their content moves into the account file the first time and they are never written again.

---

## 🔧 Troubleshooting

### The app opens and closes immediately

Another copy is already running. SteamEdge allows one instance. Check for `SteamEdge.exe` in Task Manager and close it first.

### The account badge stays empty and nothing loads

The Steam session did not come up. A banner appears under the top bar when the connection drops or is retrying; if Steam ended the session for good, the banner says so and offers a Reconnect button. If it persists, check that Steam itself is reachable, then look at `cache/steamedge.log` for the reason.

### Bulk selling stopped halfway

Steam limits how many listings an account may create, and the limit depends on the account's age, level and standing. The dialog quotes what Steam returned. Confirm the pending listings in the Steam app, wait a few hours, or pick a smaller **Batch size** with a wait between batches.

### "40 cards left" but only a handful dropped

On accounts with restricted card drops, cards only drop after a game passes the Card drop threshold (usually two hours of total playtime), and each game has its own limited number of drops. A long session in the other modes on games that are all under two hours produces nothing until they cross it; Fast mode lifts them all above the threshold together first.

### Counter-Strike 2 or Dota 2 items are missing

Pick the game in the selector at the start of the filter bar on the Inventory & Market page; only the Steam inventory opens by itself. If the selector is not there, check that Settings > Modules > Other games' inventories is on and that the game has items in the account. A notice that only a part of the inventory could be read means Steam refused a later page (request limit): wait a few minutes and pick the game again.

### Prices show a dash, or fill in very slowly

Steam allows roughly 20 market requests per 30 seconds per account, shared across prices, sale averages and listings. A large inventory takes a while by design. With `fetchAvgWithPrice` on, each item costs two requests, so a full inventory takes twice as long but you do not wait a second pass for the averages.

### An achievement will not unlock

Either it is protected, meaning the game server writes it and no client may, or the game keeps no stats over this protocol. Both are detected and reported rather than retried. The bulk operation stops after three consecutive failures and tells you why instead of looking like it hung.

### Realistic Mode suggests only one or two unlocks

The completion time is too high. Left empty it is estimated from your playtime, so a game you have played for a long time reads as an enormously long game. Enter the real 100% completion time in the box on the main panel.

### SteamEdge says a file could not be read

If a settings or data file is damaged, SteamEdge restores the automatic `.bak` copy. If that is damaged too, the file is left exactly as it is, a copy is set aside next to it with the `.bozuk` extension, the affected data starts from defaults and the app tells you at startup. Nothing is overwritten, so you can put the file back by hand.

### Inventory, market or badge pages stay empty on a Family View account

Steam keeps web pages locked until the Family View PIN is entered. Put the PIN under Settings > Privacy & security > **Family View PIN** and reconnect.

### A key comes back as "Refused (code N)"

Steam sent a refusal reason that the app does not know by name. The common reasons (already owned, region locked, invalid, already used, base game required) are shown by name. Check the key on the Steam website; a refused key is not retried.

### An account says its session is encrypted for another Windows user

The settings folder was copied to another computer or Windows user while **Encrypt login tokens** was on. Windows encryption keys do not travel, so the saved tokens cannot be opened. Sign in to the account again; the new token is stored for the current user.

### Collecting a log for a bug report

The log is `cache/steamedge.log` next to the executable, or open it from Settings. By default only errors are written; set Settings > Advanced & data > **Log file** to **Verbose (debug)**, reproduce the problem, then attach the file. It records connection events, queue decisions and errors. It does **not** contain your password or session token, so it is safe to attach; skim it anyway before you post it. The log is capped: past 2 MB it is moved aside as `steamedge.log.1` and a new file starts, so one older part is always kept.

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

Copy the folder. Everything is in it. Remember that `settings/` includes your session token, so copy it privately. The Backup box under Settings > General can also export settings and per-account data to a single file, without the session token. With **Encrypt login tokens** on, the tokens do not open on another computer or Windows user, so sign in again there.

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
