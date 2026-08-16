<div align="center">

<img src="docs/assets/social-preview.jpg" alt="SteamEdge - farm Steam trading cards, boost playtime, manage achievements and sell on the Community Market" width="860">

# SteamEdge

**Farm Steam trading cards, boost playtime hours, manage achievements and sell on the Community Market - without running the Steam client.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Miabeyefendi/steamedge?label=download)](https://github.com/Miabeyefendi/steamedge/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Miabeyefendi/steamedge/total)](https://github.com/Miabeyefendi/steamedge/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/Miabeyefendi/steamedge/releases/latest)
[![Author: Miabeyefendi](https://img.shields.io/badge/author-Miabeyefendi-black.svg)](https://github.com/Miabeyefendi)

**English** · [Türkçe](./docs/tr/README.md) · [Deutsch](./docs/de/README.md) · [Español](./docs/es/README.md) · [繁體中文](./docs/zh/README.md)

[Download](https://github.com/Miabeyefendi/steamedge/releases/latest) · [Setup guide](./docs/en/SETUP.md) · [Tutorial](./docs/en/TUTORIAL.md) · [All settings](./docs/en/INSTRUCTIONS.md) · [FAQ](./docs/en/FAQ.md)

</div>

---

## What it is

SteamEdge is a desktop app that talks to Steam over its own network protocol. It signs in
with your account, reports games as "being played", and collects the trading cards Steam
drops for them. The Steam client never has to be open, no game is ever downloaded or
launched, and nothing is injected into any process.

It also boosts playtime hours, unlocks or locks achievements, and reads real Community
Market data so you can price and sell your cards without leaving the app.

> **Not affiliated with Valve Corporation.** Steam and the Steam logo are trademarks of
> Valve. Use at your own risk - see [Disclaimer](#disclaimer).

## Features

| | |
|---|---|
| **Card farming** | Five modes: sequential, most cards, fewest cards, custom priority, and a Fast mode that understands Steam's 2-hour rule. |
| **Multiple accounts** | Sign in to several accounts at once. They farm in parallel in the background; the window shows whichever you switch to. |
| **Hour booster** | Keep up to 32 games open at once. Optional **hour sync** levels different playtimes to the same total, stage by stage. |
| **Achievements** | Read the real unlock state over the protocol, unlock or lock in bulk, with safe-mode pacing and randomised intervals. |
| **Realistic Mode** | Run one game while its achievements unlock across the session, ordered from most common to rarest at randomised intervals. Leaves an organic-looking play history instead of a burst of unlocks. |
| **Inventory & Market** | Bulk average fetching, real order book (current listings + buy orders) and real sale history. Item value comes from **completed sales**, never from a single inflated listing. |
| **No Steam client** | Everything runs over the Steam network protocol. No game files, no overlay, no injection. |
| **Portable** | Unzip and run. Settings and cache live next to the executable; nothing is written to the registry. |
| **5 languages** | English, Türkçe, Deutsch, Español, 繁體中文. |

## Quick start

1. Download the latest `SteamEdge-vX.Y.Z-win-x64.zip` from [Releases](https://github.com/Miabeyefendi/steamedge/releases/latest).
2. Extract it anywhere (Desktop, USB stick, anywhere you can write to).
3. Run `SteamEdge.exe`.
4. Scan the QR code with the Steam mobile app, or sign in with your username and password.
5. Open **Card Farming** and press **Start**.

Full walkthrough with screenshots: [Setup guide](./docs/en/SETUP.md).

## How it compares

| | SteamEdge | Idle Master | ArchiSteamFarm |
|---|---|---|---|
| Steam client required | No | Yes | No |
| Multiple accounts at once | Yes | No | Yes |
| Graphical interface | Yes | Yes | Web UI |
| Hour boosting | Yes | No | No |
| Achievement manager | Yes | No | No |
| Market selling built in | Yes | No | No |
| Portable (no install) | Yes | Yes | Yes |

This table is about scope, not quality. ArchiSteamFarm is a far more mature project and is
the better choice for large-scale, headless, multi-account farming. SteamEdge aims at a
single desktop user who wants farming, hours, achievements and selling in one window.

## How it works

Steam only drops trading cards for a game once its total playtime passes **2 hours**.
SteamEdge sends the same `ClientGamesPlayed` message the real Steam client sends, so Steam
counts the time and drops cards normally.

- **Fast mode** first brings every game under 2 hours up to the threshold - in parallel,
  because Steam accrues time for every game that is open at once - then keeps them all
  open and rotates the highlighted game every 1.5-2 minutes.
- **Item value** is the quantity-weighted median of *completed sales* from Steam's price
  history. Current listings are shown separately and never feed the value, because a
  single seller listing one item at $999,999 must not move it.
- **Prices are fetched in your own wallet currency**, read from the Steam Community
  Market, and displayed in exactly that currency. There is no conversion anywhere.

## Requirements

- Windows 10 or 11, 64-bit
- A Steam account (Steam Guard mobile authenticator recommended)
- An internet connection

Nothing else. No .NET, no Node.js, no Steam client.

## Building from source

```bash
git clone https://github.com/Miabeyefendi/steamedge.git
cd SteamEdge
npm install
npm start          # run in development
npm run build      # produce a portable build in ../Release Vx.y.z
```

Requires Node.js 20 or newer. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Documentation

| Guide | What it covers |
|---|---|
| [Setup](./docs/en/SETUP.md) | Download, first launch, signing in, adding more accounts |
| [Tutorial](./docs/en/TUTORIAL.md) | Farming your first cards, boosting hours, selling an item |
| [Instructions](./docs/en/INSTRUCTIONS.md) | Every setting, what it does, and what to set it to |
| [FAQ](./docs/en/FAQ.md) | Bans, safety, rate limits, troubleshooting |

Also available in [Türkçe](./docs/tr/), [Deutsch](./docs/de/), [Español](./docs/es/) and [繁體中文](./docs/zh/).

## Is it safe?

Read [FAQ.md](./docs/en/FAQ.md) before you decide. The short version:

- SteamEdge only sends messages the official Steam client also sends. It does not modify
  game files, does not use the Steam Web API key, and does not touch other players.
- Your password is never stored. Steam issues a refresh token; that token is kept in
  `settings/` next to the executable. Treat that folder like a password.
- Unlocking hundreds of achievements in seconds is visible on your public profile. Safe
  mode exists for a reason - leave it on.
- Automating your account is against Steam's Subscriber Agreement. Nobody can promise you
  will not be actioned. You accept that risk yourself.

## Contributing

Bug reports, translations and pull requests are welcome. Start with
[CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md).
Security issues: please follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Credits

SteamEdge is an independent application written from scratch. **No code was taken** from
the projects below; each was studied to understand how Steam works, and the problems they
solved and the approaches they chose gave us ideas.

| Project | What we learned from it | Author |
|---|---|---|
| [Idle Master](https://github.com/jshackles/idle_master) | The core idea: cards can be farmed without a Steam client, by reporting a game as "being played". | [@jshackles](https://github.com/jshackles) |
| [Idle Master Extended](https://github.com/JonasNilson/idle_master_extended) | What changed on Steam's side after the original was archived, and which settings are worth exposing. | [@JonasNilson](https://github.com/JonasNilson) |
| [HourBoostr](https://github.com/ezzpify/HourBoostr) | That several games can be held open at once, and what that means for playtime accrual. | [@ezzpify](https://github.com/ezzpify) |
| [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) | That achievements can be read and changed without launching the game. | [@gibbed](https://github.com/gibbed) |
| [ArchiSteamFarm](https://github.com/JustArchiNET/ArchiSteamFarm) | Keeping a long-running headless Steam session healthy, maFile usage, and running several accounts at once. | [@JustArchi](https://github.com/JustArchi) |

The part of the app that talks to Steam uses the open-source
[steam-user](https://github.com/DoctorMcKay/node-steam-user),
[steam-session](https://github.com/DoctorMcKay/node-steam-session),
[steam-totp](https://github.com/DoctorMcKay/node-steam-totp) and
[qrcode](https://github.com/soldair/node-qrcode) packages by
[@DoctorMcKay](https://github.com/DoctorMcKay) and contributors. All other code belongs to
SteamEdge.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**,
together with the supplemental terms in the [LICENSE](./LICENSE) file. In short:

- You may use, study, modify, redistribute, and even make money with this software for
  free, **as long as** you keep the complete source code available under the AGPL-3.0 -
  including for any hosted/SaaS/network use (AGPL Section 13) - and you preserve the
  author attribution below.
- To use this work in a closed-source or proprietary product, or to run it as a closed
  SaaS, you need a **separate written commercial license** (which may include a royalty /
  revenue share). See [LICENSE](./LICENSE), Section 8, and contact me.

### Attribution (required)

Per AGPL-3.0 Section 7(b), the following attribution must be preserved, visibly and
unmodified, in any copy, fork, or deployment of this project:

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

See the [NOTICE](./NOTICE) file.

## Disclaimer

This software is provided "as is", without warranty of any kind. You run it entirely at
your own risk and are solely responsible for your own use, including compliance with the
Steam Subscriber Agreement. Valve Corporation is not affiliated with or endorsing this
project; Steam and related marks belong to their respective owners. The author accepts no
liability for account bans, data loss, or any other damages, to the maximum extent
permitted by applicable law. Full terms are in the [LICENSE](./LICENSE) file.

## Contact

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- For commercial licensing or revenue-sharing inquiries, reach me through my GitHub profile.

---

<div align="center">
<sub>Built by <a href="https://github.com/Miabeyefendi">Miabeyefendi</a> · AGPL-3.0-or-later</sub>
</div>
