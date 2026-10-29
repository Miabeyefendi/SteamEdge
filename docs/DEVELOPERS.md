# 🛠️ SteamEdge for developers

[← Back to the README](../README.md)

How the code is laid out, how to run and test it, and the habits the project follows. For how to send a change (license, pull requests), read [CONTRIBUTING.md](../CONTRIBUTING.md) first.

## Set up

You need Node.js 20 or newer (the project is developed on Node 24 and npm 11) and Windows 10 or newer for the packaged build.

```bash
git clone https://github.com/Miabeyefendi/SteamEdge.git
cd SteamEdge
npm install
npm start
```

| Command | What it does |
|---|---|
| `npm start` | Runs the app from the source folder |
| `npm test` | Runs every test: the Node tests in `tests/unit` and the Electron tests in `tests/integration` (`npm test -- unit`, `npm test -- integration`, or part of a file name to run less) |
| `npm run verify` | Static checks: missing and duplicated element ids, unbalanced tags, IPC channels with no counterpart, long dashes, dead setting keys |
| `npm run lang` | Audits the five interface dictionaries (missing entries, placeholders, keys that carry HTML) |
| `npm run build` | Packages the portable Windows x64 build into `releases/` |
| `npm run changelog` | Adds the notes in `build/changelog/<version>.md` that are not yet in `CHANGELOG.md` |

`npm run verify` and `npm run lang` must both pass before you open a pull request.

## Layout

```
main.js                  main process: windows, Steam connections, IPC handlers, jobs
preload.js               the bridge: window.imu.* in the page, one function per IPC channel
src/core/                logic with no page in it
  steamEngine.js         the Steam connection: sign-in, inventory, market, achievements, chat
  farmController.js      the card farming run (modes, queue, position)
  realisticPlan.js       Realistic Mode: targets, durations, unlock times
  resumeJobs.js          what was running when the app ended, and how to start it again
  windowFit.js           how the page is scaled to the window and to the interface scale
  inventorySources.js    the inventories of other games
  localProxy.js          the small local proxy that lets SOCKS5 proxies work for the window
  keyMigration.js        old setting, key and file names, read through to the new ones
  logger.js              the log files under logs/: events, the Steam connection history, crashes
  translation.js         interface translation for text made in the main process
src/services/            sign-in, the market fee script, the update check
src/utils/               csv.js (inventory export), quickNav.js (command palette ranking)
src/main/                the interface: main.html, pages/, js/, style/, fonts/
src/login/               the sign-in screen
src/main/js/lang/        the five dictionaries
build/                   build.js, verify.js, lang.js, changelog.js, changelog/ (the release notes)
tests/                   unit/, integration/, run.js
assets/, design/         badges and buttons for the README, screenshots
```

- **One window, plain scripts.** The interface is HTML and plain scripts, no bundler. The pages share one global scope, so a function in `common.js` is callable from `settings.js`. A script that needs something from another page checks `typeof fn === 'function'` first.
- **The page never touches Node.** Context isolation is on, Node integration is off, and a Content Security Policy limits what loads. Everything the page can do is a channel in `preload.js` with a handler in `main.js`; `npm run verify` fails when one side has no counterpart.
- **Steam is the only source of truth.** A number that cannot be fetched is shown as a dash, never estimated.
- **Data lives next to the executable** (`settings/`, `cache/`, `logs/`). Every JSON file is written to a temporary file, flushed, renamed over the old one, and the last good copy is kept as `.bak`.
- **Jobs run in the main process,** per account: card farming (`farmController`), the hours booster, Realistic Mode, key redemption. The page only starts, stops and displays them, so a job survives the window being hidden.

## Habits

- **Code in English:** identifiers, comments, log messages, element ids, IPC channels, setting keys and file names. Comments say why, not what.
- **Interface text is the exception.** Its source language is Turkish, and the Turkish text is the key of the dictionary entry in the five files under `src/main/js/lang/` (`en`, `de`, `es`, `zh`, `ru`). New text needs an entry in all five, then `npm run lang`. Do not use a short, general word as a key (it would translate the same word elsewhere).
- **Renaming stored data.** If you rename a key that is written under `settings/` or `cache/`, add the old name to `src/core/keyMigration.js`, so files from older versions keep working.
- **No dependencies without a reason.** The runtime needs only `steam-user`, `steam-session` and `qrcode`. Ask before adding one.
- **A secret never goes in a file that is committed.** Not a token, not a cookie, not a key. Never log one either.
- **Interface text is escaped.** Anything that came from Steam (names, messages, errors) goes through `esc()` before it is put into HTML.

## Tests

`npm test` runs everything and takes a few minutes.

- **`tests/unit`** run in Node. They cover the pure logic (the farm run, the Realistic Mode plan, resume files, market and key queues, the Steam engine against a fake connection) and some of `main.js`: the test cuts a block out between marker comments and runs it against stand-ins.
- **`tests/integration`** start Electron with a fake IPC layer built from `preload.js` and open the real pages in a window that is never shown, then click, type and read the page. A test that needs to be looked at can write screenshots (`SHOTS=<folder>`) and show its window (`SHOW=1`).
- A change to the interface comes with a check in one of these. Numbers can lie, a screenshot does not: look at it.

## Releases

Each release has a note in `build/changelog/<version>.md` (it becomes the release text and a `CHANGELOG.md` entry), a version bump with `npm version`, a build, and the SHA-256 of the `.rar` in the README and the note. Changes reach `main` through a pull request that passes CodeQL.
