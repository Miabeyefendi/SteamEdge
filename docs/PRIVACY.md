[← Back to the README](../README.md)

# 🔐 Security and your Steam login

> [!WARNING]
> **SteamEdge can act on your Steam account: farm cards, boost hours, unlock achievements and list items on the market. Below is exactly what it does with your login, where it keeps it and what it sends over the network, so you can decide if you are comfortable using it.**

| What | What happens |
|---|---|
| **Password** | Typed on the sign-in screen and handed straight to Steam's own sign-in service over HTTPS. It stays in memory only for that call. It is **never written to disk** and never logged. |
| **Steam Guard codes** | Sent to Steam once and dropped. Not stored. The app holds none of your authenticator secrets (the old maFile feature was removed in 1.1.9), so it cannot approve mobile confirmations for you. |
| **Session token** | After sign-in Steam gives the app a refresh token so it does not ask again. It is not your password. It is saved in `settings/session.json` and `settings/accounts.json`, next to the exe. **It is plain text by default.** Turn on *Settings > Privacy & security > Encrypt login tokens* to seal it with Windows DPAPI, so only your Windows user on this PC can read it. Web cookies live in memory only. |
| **Cookie sign-in (fallback)** | If you use the cookie login instead of the normal one, `settings/web-session.json` keeps those cookies in plain text until you sign out. |
| **Log file** | `cache/steamedge.log` holds events, never passwords, tokens or cookies. |
| **Exports** | The settings export leaves out tokens, proxy addresses (with their passwords) and the parental PIN. |

**What goes over the network**

- **Steam itself**: the same connections the Steam client makes (sign-in, chat, "playing" status), through the `steam-user` and `steam-session` libraries.
- **`steamcommunity.com`**: inventory, market, listings and achievement pages, with your session.
- **`api.steampowered.com`**: sign-in and session calls.
- **`*.steamstatic.com`**: game images and Steam's own market fee script (it runs in a hidden, sandboxed window with no Node access).
- **`api.github.com`**: once at startup, and when you press the update button, to read the public list of releases. It sends nothing about you and never downloads or installs anything.
- **Your own proxy**, only if you set one per account or for sign-in.
- Nothing else. **No server of mine, no analytics, no telemetry, no crash reports, no ads.** The fonts are bundled, so no font servers either.

**Selling**: listings go to Steam's market the way the website does it. With the mobile authenticator on, every listing waits for your approval in the Steam app, and SteamEdge cannot give that approval. The app spaces its requests (at least 1.5 seconds apart) and never sends the same item twice.

**How the app window is locked down**: it can only load its own files, it cannot open web pages, and Node access is off inside it (context isolation and a Content Security Policy).

**How to check all this yourself**: the code is open (AGPL-3.0), every change is scanned by CodeQL, the SHA-256 of each release file is published, and you can build it yourself with `npm run build`.

**Protect yourself**
- Never share your `settings/` folder (zip files, screenshots, support requests). It can hold your token.
- Turn on token encryption (above), and use *Sign out* when you stop using the app on a PC.
- To cut off every saved session, use Steam's own *sign out of all other devices* in the Steam Guard settings.

**Honest limits**: this is a personal project by one person, it is not made by or connected to Valve, and automating an account can go against Steam's rules. Use it at your own risk.

## 🛡️ Security

Found a vulnerability? Do not open a public issue. Follow the private process in
[SECURITY.md](../SECURITY.md).
