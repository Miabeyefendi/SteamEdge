[← Back to the README](../README.md)

# 🧭 Roadmap

- [x] Steam chat: friend list, conversations and sending, in the app
- [x] Russian interface language, matching the documentation
- [x] Realistic Mode rebuilt to the design spec
- [x] Item-based market queue, price and average fetched together
- [x] Every runtime string translated, with plural forms in all languages (1.3.0)
- [x] Themes, login screen included (1.3.0)
- [x] Electron 41 (1.3.2)
- [x] English by default, with the remaining interface text translated (1.3.3)
- [x] The whole code base in English: identifiers, comments, ids, IPC channels, setting keys and file names (1.4.0)
- [x] A fluid layout for small screens and a window that remembers its place (1.4.9)
- [x] Modules, a light mode and a layout that fits any window (1.5.1 and 1.5.2)
- [x] Jobs that were running pick up where they left off after a restart (1.5.3)
- [x] Interface scale, readable text and keyboard use (1.5.4)
- [x] Command palette, shortcuts and a search box in Settings (1.5.5)
- [x] Realistic Mode difficulty taken from real playing times (1.5.6)
- [x] Less video memory, no constant redrawing while idle, and a smaller download (1.5.7)
- [x] A low memory mode for weak computers (1.5.8)
- [x] One light timer instead of endless animations (1.5.9)
- [x] Accounts and jobs (1.6.0): the first click on an account switches to it, what runs or has finished on each account shows in the top bar and the account list, Start and Stop follow the state of their job on every page, Realistic Mode unlocks the achievements from the most common to the rarest, and fast mode keeps the games past the threshold farming while the others are pulled up
- [x] Realistic Mode plays the games of the queue at the same time, five at a time (1.7.4 and 1.7.6)
- [x] The connection comes back by itself after a drop, with a connection history (1.7.8 and 1.8.0)
- [x] A Setup next to the portable copy, and Update Now that downloads, checks and installs a new version (3.0.0 to 4.3.2)
- [x] Two themes, VantaBlack and VantaWhite, from the Vantagraph schemes (4.3.4)
- [x] An event log, `logs/events.log`, that shows what was sent to Steam and what came back (4.3.3 and 4.3.5)
- [ ] A smaller download
- [ ] Even less graphics card and video memory use
- [ ] Even less memory (RAM)
- [ ] The remaining pages rebuilt to the design spec, one release at a time
- [ ] **Linux and macOS - help needed.** I cannot test either. If people on those systems offer to test builds I will make them; without testers I leave them alone.
- Decided against: a rewrite in another language or framework (Tauri, Wails, Rust). It was researched and the gains do not justify the risk to the features and the look. SteamEdge stays on Electron. Download size comes first, then graphics memory, then RAM.

Nothing here is a promise. This is a personal project and the list moves when my priorities move.
