<div align="center">

<img src="./assets/logo-mark.svg" width="120" alt="SteamEdge">

# SteamEdge

**Collect Steam trading cards, bank playtime and manage achievements without ever opening the Steam client.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](./LICENSE)
[![Version](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=version)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![Platform](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-installation)
[![Status](https://img.shields.io/badge/status-active-22C55E?style=for-the-badge)](#)
[![Author](https://img.shields.io/badge/by-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

**English** · [Türkçe](./docs/locales/README_TR.md) · [Español](./docs/locales/README_ES.md) · [简体中文](./docs/locales/README_ZH.md) · [Русский](./docs/locales/README_RU.md)

[Install](#-installation) · [Features](./docs/FEATURES.md) · [Usage](#-quick-start) · [Tutorial](./docs/guides/TUTORIAL.md) · [Changelog](./CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="./assets/btn-download.svg" height="52" alt="Download the latest release">
</a>
<a href="./docs/guides/TUTORIAL.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-tutorial-dark.svg">
    <img src="./assets/btn-tutorial.svg" height="52" alt="Read the tutorial">
  </picture>
</a>

<img src="./design/screenshots/Overview.png" width="92%" alt="SteamEdge farming cards, boosting hours and managing achievements without the Steam client">

</div>

---

<div align="center">

<img src="./assets/security-banner.svg" width="100%" alt="Security: read this first">

</div>

## 🔐 Security and your Steam login

> [!WARNING]
> **SteamEdge can act on your Steam account: farm cards, boost hours, unlock achievements and list items on the market. Below is exactly what it does with your login, where it keeps it and what it sends over the network, so you can decide if you are comfortable using it.**

**In short:** your password is never written to disk, the app talks only to Steam, its image servers and GitHub's public list of releases, and there is no telemetry, no analytics and no server of mine. What it keeps, where, and how to check it yourself is in [Privacy and security](./docs/PRIVACY.md).

---

## ✨ Highlights

- **Card farming** - Runs your games as "playing" so trading cards drop.
- **Hours booster** - Keeps up to 32 games open at once, with optional playtime syncing that pulls a selection up to the same total.
- **Achievement manager** - Reads the real locked and unlocked state straight from Steam's protocol, then unlocks or relocks in bulk.
- **Realistic Mode** - Holds one game open and unlocks its achievements from the most common to the rarest, spread across the session, so the profile reads like it was actually played.
- **Inventory and market** - Real sale history, order book, bulk average prices and selling, all in your wallet's own currency.
- **Product keys** - Paste a list of keys and they are redeemed in the background, one at a time.
- **Multiple accounts** - Several accounts connected at once, each farming in the background, switchable without losing progress.
- **No Steam client** - Talks Steam's own network protocol.
- **Portable** - Extract and run.

**[See every feature →](./docs/FEATURES.md)**

---

## 📸 Screenshots

<div align="center">

| | |
|:-:|:-:|
| <img src="./design/screenshots/CardFarming.png" alt="Card Farming"><br><sub>Card Farming</sub> | <img src="./design/screenshots/HourBoostr.png" alt="Hour Booster"><br><sub>Hour Booster</sub> |
| <img src="./design/screenshots/Achievements.png" alt="Achievements"><br><sub>Achievements</sub> | <img src="./design/screenshots/RealisticMode.png" alt="Realistic Mode"><br><sub>Realistic Mode</sub> |
| <img src="./design/screenshots/RealisticModeAdvanced.png" alt="Realistic Mode, advanced"><br><sub>Realistic Mode, advanced</sub> | <img src="./design/screenshots/Market.png" alt="Inventory & Market"><br><sub>Inventory & Market</sub> |
| <img src="./design/screenshots/Market2.png" alt="Market, order book"><br><sub>Market, order book</sub> | <img src="./design/screenshots/Chat.png" alt="Steam chat"><br><sub>Steam chat</sub> |
| <img src="./design/screenshots/SettingsGeneral.png" alt="Settings"><br><sub>Settings</sub> |  |

</div>

---

## 📦 Installation

### Requirements

| | |
|---|---|
| Operating system | Windows 10 or newer, 64 bit |
| Steam account | With Steam Guard set up, mobile or email |
| Disk space | About 330 MB extracted |
| Steam client | Not required, and not used |

### Install

1. Download the latest `.rar` from the [releases page](https://github.com/Miabeyefendi/SteamEdge/releases/latest).
2. Extract it anywhere you like. A folder you own, not `Program Files`.
3. Run `SteamEdge.exe`. There is nothing to install and nothing is written outside that folder.
4. To update, extract the new version into an empty, new folder and copy the `settings/` folder from the old one into it. Extracting over the old folder while the app is open leaves a mix of two versions behind.

The `.rar` holds the portable Windows x64 build of this repository's source, produced by `npm run build` (`@electron/packager`, app code in `resources/app.asar`) and packed with WinRAR. Nothing in it is minified beyond what Electron itself ships.

SHA-256 of `SteamEdge-v1.5.6-win-x64.rar`:
`95db35feb592dc27876d7475ecb16679b3f059fdb779971353fde72a6fe6c6d6`

Check it in PowerShell with `Get-FileHash .\SteamEdge-v1.5.6-win-x64.rar`.

---

## 🚀 Quick Start

On first launch you get the login screen. Scan the QR code with the Steam mobile app, or switch to the password tab and enter your credentials plus a Steam Guard code. Nothing is stored anywhere except a session token in `settings/`, next to the executable.

Once you are in, the Overview shows what is running and what is available. Open **Card Farming**, refresh the list, pick a mode and press Start. Everything else can wait until you have read the [tutorial](./docs/guides/TUTORIAL.md).

---

## 📖 Documentation

- [**Features**](./docs/FEATURES.md) - everything the app does
- [**Tutorial**](./docs/guides/TUTORIAL.md) - every feature and every setting, explained in full
- [**Settings**](./docs/SETTINGS.md) - where the settings live and the keys worth knowing
- [**Privacy and security**](./docs/PRIVACY.md) - what it does with your login and what goes over the network
- [**FAQ**](./docs/FAQ.md) - bans, prices, achievements that will not unlock, updates
- [**Roadmap**](./docs/ROADMAP.md) - what is done and what is next
- [**Changelog**](./CHANGELOG.md) - what changed in each release
- [**For developers**](./docs/DEVELOPERS.md) - code layout, tests, habits (English)
- [**Contributing**](./CONTRIBUTING.md) - how to send a change
- [**Security reports**](./SECURITY.md) - how to report a vulnerability privately

---

## 🤝 Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) first. By contributing you agree to
license your work under the AGPL-3.0.

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-report-bug-dark.svg">
    <img src="./assets/btn-report-bug.svg" height="52" alt="Report a bug">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-star-dark.svg">
    <img src="./assets/btn-star.svg" height="52" alt="Star this repository">
  </picture>
</a>
</div>

---

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0
(AGPL-3.0)**, together with the supplemental terms in the [NOTICE](./NOTICE)
file. In short:

- You may use, study, modify, redistribute and even make money with this software
  for free, **as long as** you keep the complete source code available under the
  AGPL-3.0, including for any hosted, SaaS or network use (AGPL Section 13), and
  you preserve the author attribution below.
- To use this work in a closed-source or proprietary product, or to run it as a
  closed SaaS, you need a **separate written commercial license**, which may
  include a royalty or revenue share. See [NOTICE](./NOTICE), Section 8, and
  contact me.

### Attribution (required)

Per AGPL-3.0 Section 7(b), the following attribution must be preserved, visibly
and unmodified, in any copy, fork or deployment of this project:

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### Disclaimer

This software is provided "as is", without warranty of any kind. You run it
entirely at your own risk and are solely responsible for your own use, including
compliance with the terms of service of any third-party platform it interacts
with. Valve and Steam are not affiliated with or endorsed by the author; their
names and trademarks belong to their respective owners. The author accepts no
liability for account bans, data loss or any other damages, to the maximum extent
permitted by applicable law. Full terms are in the [LICENSE](./LICENSE) and
[NOTICE](./NOTICE) files.

---

## 📬 Contact

- GitHub: [@miabeyefendi](https://github.com/Miabeyefendi)
- For commercial licensing or revenue-sharing enquiries, reach me through my
  GitHub profile.
