# Changelog

Every released version of SteamEdge, newest first. Each entry is the release note
published with that build; the archives live on the
[releases page](https://github.com/Miabeyefendi/SteamEdge/releases).

Versions 1.0.0 to 1.0.4 were withdrawn over Electron 33 vulnerabilities and their
archives deleted on purpose. Their notes are not reproduced here.


## [1.1.4](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.4)

Realistic Mode stops pretending to be an hour farm, and the market fetches an item's price and its average together instead of making two passes over your inventory.

### Added

- **Catch up on overdue achievements.** A game with a hundred hours on it and nothing unlocked has a backlog: a real player would have earned plenty by now. With this on, that backlog is cleared during the first fifth of the session and the pace then settles into the chosen model. How large the backlog is comes from the playtime, so a one hour game gets a couple of quick unlocks and a hundred hour game gets a burst. The panel tells you how many are counted as overdue before you start.
- **A 100% completion time box, in plain sight.** How many achievements a session should unlock was worked out from an estimated completion time, and that estimate was your own playtime multiplied by a game-type factor. The more you played a game, the longer the app assumed it was, and the fewer achievements it was willing to unlock: a hundred and eighty hour game read as "three hundred and sixty hours long, you are halfway through". There was a field for entering the real number, but it was labelled `Tc`, buried in the advanced panel and only usable after picking a specific option from a dropdown. It is now a labelled box on the main panel, always editable, and the value is remembered per game.
- **Speed controls in the advanced panel.** A speed multiplier for the whole schedule, how much longer ultra rare achievements wait, what share of the session the catch-up burst gets, and how far the schedule compresses on a finished game. All four were fixed numbers in the code before.
- **Games without achievements are remembered.** Steam's library flag claims some games have stats when they do not, and the truth only arrives with the schema request. Once a game is found to have no achievements it is dropped from the queue, written to disk, and never offered on this page again. A game added behind another in the queue is now checked the moment you add it rather than hours later when its turn comes.

### Fixed

- **Rare achievements were paced like ultra rare ones.** The session was divided equally across the queue, and since the queue runs from common to rarest, everything in the back half crawled regardless of how rare it actually was. Time is now weighted: only achievements under 5% wait noticeably longer, and the rest keep an even, quick rhythm. What stands out on a profile is how fast the ultra rare ones arrive, not a 10% one.
- **A finished game was paced as if it had just been started.** Playing past the completion time you entered means there is no learning curve left to imitate, so the schedule now compresses (half by default). Hours keep accruing to the end of the session when that switch is on.
- **The connection banner landed in the sidebar.** It was inserted next to the page body instead of above the row holding it, so a dropped connection printed its message down the left column.
- **The summary strip could show `App 1091500` instead of the game's name.** Steam's achievement schema does not always carry a name and the engine fell back to the app id, even though the library name was already on screen.
- **The automatic target ignored everything you had already played.** It asked "how many achievements would a player earn in this session, starting from nothing", so an eight hour session on a game with a hundred and eighty hours on it and almost nothing unlocked suggested two. It now counts what should already be unlocked at that playtime, subtracts what actually is, and adds the session's own share on top. The panel spells the arithmetic out so the number can be checked.
- **The target box read as two different things.** A large white number sat above a small grey `/ total` in a different size and colour. Both halves are now the same font, size and colour, side by side.
- **The price queue made two passes over the inventory.** Every item's lowest price was fetched first, then the whole list was walked again for the averages, so an item you were looking at could show a price for twenty minutes before its average appeared. Both now go out for the same item back to back, then the queue moves on. The two queues also shared one Steam quota without knowing about each other; there is a single queue now, and the rate limit is counted in requests rather than items. Turn it off in Settings > Market if you would rather fill prices at the old speed.

### Changed

- **Presets are capped at five.** Saving a sixth is refused with a note rather than silently dropping the oldest.
- **Removed "Games without achievements: collect hours / skip / stop the queue".** This page unlocks achievements; collecting hours belongs to the Hours Booster, and the other two options describe a game that should not be in the list at all.

## [1.1.3](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.3)

Hour sync now reports what it is actually doing, and the concurrent limit you pick is the one the engine uses.

### Fixed

- **Every game in a sync showed the same progress bar.** Six games with anywhere from four to thirty-five hours left all drew an identical empty bar, because the bar measured how much of the whole session had elapsed rather than anything about the game. The bars now sit on a shared timeline: a game that finishes four hours into a thirty-five hour job starts nearly full, a game that runs to the very end starts empty, and each one reaches 100% at the moment it hits the target. Bars can be compared against each other, so the queue tells you at a glance what finishes when.
- **The interface heard nothing for hours at a time.** A sync only reported when a game reached the target. On a two day job that meant one update at the start and silence until the first game finished. The engine now sends its state on a timer, and the figures move between those events instead of freezing.
- **One by one sync sent no per-game figures at all**, so every row fell back to the session percentage. Both methods now keep the same ledger.
- **The concurrent limit did not survive leaving the page.** Picking a limit only changed it in memory; opening another tab and coming back reset it to 32, because the page re-reads the stored value on every visit. It is now written the moment you pick it, and a stored value never overwrites a choice you just made.
- **The limit the sync used could differ from the one on screen.** The engine reads the concurrent limit from settings, and settings only heard about it when you pressed Save as preset. The panel could read 8 while the sync ran 32 games.
- **Saved durations were written and never read.** The preset stored a session length that nothing loaded back, so returning to the page always showed the default target from Settings.

### Changed

- The sync ledger moved into its own module so a multi-day session can be verified against a simulated clock rather than by waiting for it.

## [1.1.2](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.2)

The Overview panel now follows whatever is actually running, and a handful of controls that promised something they never delivered are gone.

### Added

- **Realistic Mode shows up on the Overview.** It was the one job the panel never tracked. Running it on its own left the panel saying nothing was running, and the Start button would quietly start card farming instead. It now gets its own row with unlocked count, time left and what is coming next.
- **Job navigation.** When several jobs run at once the panel steps through them one at a time with the arrows instead of stacking them and squeezing the queue underneath.

### Fixed

- **Start, Stop and Details act on the job you are looking at.** All three were wired straight to card farming, so pressing Details while the Hours Booster was running opened the Card Farming page. Stop now stops the job on screen, Details opens its page, and Start is only offered when nothing is running.
- **The loading spinner spins.** The toast spinner asked for an animation that was never defined anywhere in the stylesheets, so it sat there as a static half circle on every quick action.
- **Inventory value and achievement counts reset when you switch accounts.** Both tiles were only written when data existed, so after switching they kept showing the previous account's numbers until you opened the matching tab.

### Changed

- **The sync method is named in plain language.** "Parallel" and "Staged" are now "All at once" and "One by one", and the explanations describe what actually happens to your games rather than the algorithm behind it.
- **Removed "Ignore updates"** from the Hours Booster. It wrote a setting that no part of the engine ever read.
- **Removed the duplicate "Hide game name"** switch from the Hours Booster. The working one lives in Settings > Privacy, with its explanation, and having it in two places made it unclear which one applied.

## [1.1.1](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.1)

Realistic Mode rebuilt to the design spec: a three-column workspace with a game queue, a real unlock schedule and the numbers behind it.

### Added

- **Game queue.** Realistic Mode used to take one game. It now takes as many as you like: search, add, reorder, remove. The session time is split between them by how many achievements each one has, and when a game is done the next one starts. Turning off **Start the queue automatically** stops after the first game instead.
- **Unlock order with times.** The middle column lists every achievement in the order it will unlock, grouped by rarity, each with its percentage and the minute it is due. The **Up next** card shows what is coming and how rare it is.
- **Target count.** Decide how many achievements the session should unlock. Left on **AUTO**, the app works it out from the session length, the game's estimated completion time and the difficulty you picked, so a two-hour session does not empty a 200-achievement game.
- **Distribution model.** Linear spreads unlocks evenly, exponential front-loads them the way a real player's first hours look, and Pareto puts most of them in the first fifth of the session.
- **Game data panel.** Completion time (Tc) either entered by hand or estimated from your playtime and the game type multiplier, your current playtime, the expected number of unlocks at that point, your unlock rate, and how long the remaining achievements would take at that pace. All computed locally - nothing is fetched from any third-party service.
- **Behaviour switches.** Randomised gaps, skipping ultra rare achievements (below 5%), keeping the hours running after the unlocks finish, and what to do with a game that has no achievements: collect hours, skip it, or stop the queue.
- **Presets.** Save a queue with its duration, model and difficulty, and load it back with one click.

### Changed

- **Duration is now hours, minutes and seconds** instead of a whole number of hours, so a session can be as short as a minute or as long as you like.
- Achievements a game protects server-side, and ultra rare ones when that switch is on, are counted and reported before you start rather than failing silently during the run.

## [1.1.0](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.0)

Smaller download, lighter on memory, and the update check and account identity now sit where they belong.

### Changed

- **The update check is no longer a settings page.** The app looks once at start-up and opens a window only when a newer version exists; when you are up to date it says nothing at all. The version card in Settings is gone, and so is the daily background check. A button in the top bar, between the bell and the gear, repeats the check whenever you want - and there the answer is always given, since being up to date is an answer too. Nothing is downloaded or installed either way.
- **Account identity moved into the Account card.** SteamID2, SteamID3, account number, hex and custom address now sit in the Account card on the right of Settings, in the same row pattern as the Steam level and status lines above them: label left, value right, same divider. Click a row to copy it; **Copy identities** and **Open profile** sit under the card.
- **Your name, avatar and level appear immediately.** They could only be fetched once the Steam session was up, which takes seconds, and until then the account badge and the Account card showed dashes. The last known profile is now stored per account and drawn on the first frame, with the live values replacing it as soon as the session connects. The custom profile address, which needs a web request, no longer holds up the rest of the profile: it is fetched separately and fills in when it arrives. Measured against a slow session, the account badge went from 2.6 s to 0.9 s.
- **The overview no longer waits for Steam to fill its boxes.** Total cards and library size came from two calls that only start after the session is up, so the panel sat on dashes for the best part of ten seconds - long enough that reselecting your own account, which forces a reload, looked like the thing that fixed it. Both lists are now kept per account and drawn from disk at once, then refreshed from Steam in the background. Same slow-session measurement: 9.4 s to 0.5 s from the second launch onwards.
- **The Steam session starts with the app, not with the interface.** Logging on used to begin only when the first page asked for it, after the window and all its scripts had loaded. It now starts as soon as the app does, so connecting happens while the interface is still being drawn.

- **41 MB smaller.** Electron ships 55 interface translations of its own (`locales/*.pak`, 44 MB) covering languages the app does not offer. Those are Chromium's own strings - right-click menus, file dialogs, form validation bubbles - and have nothing to do with the app's dictionary. The five that match the languages SteamEdge speaks are kept, the other fifty are gone. The build refuses to finish if the English fallback is ever dropped by mistake, since the app would not start without it.
- **Lists of hidden tabs no longer sit in memory.** A 400-game farming queue is about 9,600 elements, and every tab you had visited kept its own set alive. Switching tabs now releases the list you left and redraws it when you come back. Measured on a 400-game queue plus a 1,500-game library, the page went from 13,458 elements down to 1,758. Nothing is re-fetched from Steam and nothing is lost: sorting, filters and selections live in memory, not in the page.
- **Redrawing stops while the window is hidden.** The per-second counters used to keep running behind a minimised window. They now pause whenever the window is not visible and refresh once when it comes back, so you never look at a stale counter. Card farming, hour boosting and achievements are unaffected - they run in the background process, not in the interface.
- **"Farm in background" now lives up to its name.** It used to skip a few redraws; it now also releases the open tab's list when the window is hidden, which is what "lowest processor and memory use" implied.

### Added

- **Update window at start-up.** When a newer release exists you get one window naming both versions, with a link to the release page and a reminder of how to upgrade safely: extract into an empty new folder and copy your `settings` folder across. If you are current, nothing appears.
- **Memory usage in Settings > Advanced.** Electron runs as several processes, so Task Manager shows five separate SteamEdge rows and you had to add them up yourself. The app now shows the total with a per-process breakdown - main, interface, graphics and network - read from the process metrics, not estimated.
- **Hardware acceleration now states its cost.** Turning it off shrinks the graphics process: in our measurements the total dropped from 212 MB to 163 MB. The setting's description says so, so the trade-off against CPU drawing is yours to make with real numbers.

## [1.0.9](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.0.9)

Patch release. Adds an update check, shows your account identity in every Steam format, and reads the version number from a single place.

### Added

- **Update check.** Settings > About now has an **Update** card showing the installed version and the latest published version side by side, with a **Check for updates** button. If a newer version exists, a button appears in the top bar and a **Open release page** link takes you there. The app only reads the version number: it downloads nothing, installs nothing and never modifies itself. Off-line and rate-limit cases are stated plainly instead of failing silently, and a failed check does not count as the daily check, so it retries as soon as you are back on-line.
- **Once-a-day silent check**, switchable in the same card. It runs twenty seconds after start-up at the earliest, and once per day after that. The top bar reminder appears once per version: dismiss it and that version stays dismissed.
- **Account identity, all seven formats.** A new **Account Identity** section in Settings lists SteamID64, classic SteamID, SteamID3, account number, hexadecimal, profile address and custom address, each with a copy button, plus **Copy all**. Every value is derived from a single number locally with no network request; only the custom address is read from your profile. Trading sites, achievement tools and community pages each want a different one of these, and until now you had to convert them by hand.

### Changed

- **The version number now comes from one place.** It was written by hand in four separate files, and a release could ship with two different numbers on screen. The top bar badge, both Settings rows and the update comparison all read it from `package.json` at runtime.
- **`npm run dogrula`** runs the checks that were previously done by hand before a build: syntax on every script, cross-referencing element ids between pages and their code, duplicate ids, tag balance, IPC channels declared on one side but missing on the other, and a scan for stray characters and local paths.

## [1.0.8](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.0.8)

Patch release. Restores QR sign-in, fixes toggle switches that rendered as plain boxes, and makes the window usable at narrow sizes.

### Added

- **QR code sign-in.** The backend already supported it, but the login screen had no UI for it at all - password was the only way in. Each account box now has a **QR Code / Password** tab pair, with QR as the default. Scan the code from the Steam mobile app and approve; your password is never typed. A **Refresh Code** button requests a new one if it expires.

### Fixed

- **Toggle switches rendered as solid boxes instead of sliders.** Both the track and the knob are `<span>` elements, which default to `display: inline` - and inline boxes ignore `width` and `height`. The knob was being laid out at zero size, so all that remained was a pill that changed colour. The switches on the Hour Booster, Achievements and Settings pages all looked wrong because of this one rule. Track and knob now declare their display explicitly, and the knob slides again.
- **Window did not adapt to narrow sizes.** There were no media queries anywhere in the stylesheet. Below roughly 1280 px the fixed 290-320 px side panels and the 44 px left gutters squeezed the content and forced horizontal scrolling. Three breakpoints were added: at 1280 px gutters and side panels shrink, at 1080 px they shrink further and the top bar tightens, and at 940 px side panels move below the content and the page switches to vertical flow. The page body never scrolls horizontally now - oversized tables scroll inside their own container.
- **Minimum window width lowered** from 1120 to 900 px, since the layout now handles that size.

### Changed

- **Release folder is now named `SteamEdge-v<version>-win-x64`.** Right-click to archive produces a correctly named `.rar` with no manual renaming.
- **Each release folder now contains its own `CHANGELOG.md`** describing only that version.

## [1.0.7](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.0.7)

Patch release. Average market values are now fetched in bulk instead of one item at a time.

### Added

- **Bulk average price fetching.** Average (median) value comes from Steam's completed-sales history, and that endpoint needs one request per item - so the column stayed empty unless you opened each item's detail panel. There is now a **Fetch Averages** button next to Fetch Prices. It shows how many items are missing, asks for confirmation with a time estimate, and can be cancelled mid-run.
- **Separate average cache.** Stored in `cache/history.json` with a 72-hour lifetime (prices use 24 h). Completed-sale medians barely move during a day, so refetching them is wasted requests. Opening the Inventory page reads this cache and sends no requests at all.
- **Cancel and live progress.** While running, the button turns into **Cancel · 12 / 40**. The list refreshes every 10 items rather than on every single one, so large inventories stay responsive.

### Changed

- **Both price queues share one rate limiter.** Prices and averages now pass through the same market gate, so together they stay under Steam's ~20 requests / 30 seconds limit instead of competing with each other.
- **Clearing the price cache also clears averages.** "Clear price cache" and "Delete all data" now include `history.json`.

---

**As always:** never share your `settings/` folder. It holds your Steam login token.
