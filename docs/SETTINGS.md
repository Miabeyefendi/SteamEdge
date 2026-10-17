[← Back to the README](../README.md)

# ⚙️ Configuration

Settings live in `settings/settings.json` next to the executable, and per-account data in `settings/accounts/<steamID>.json`. Nearly all of it is editable from the in-app Settings page and the pages of the features themselves; there is no reason to touch the files by hand. Changes on the Settings page are applied only when you press Save, and running jobs pick them up within a few seconds.

> **Never share the `settings/` folder.** It holds your Steam session token, which is enough to use your account.

| Key | Default | What it does |
|---|---|---|
| `boostMaxGames` | `32` | How many games the hours booster keeps open at once |
| `boostSync` | `false` | Pull selected games up to the same total playtime |
| `fetchAvgWithPrice` | `true` | Fetch an item's sale average in the same pass as its price |
| `pauseFarmOnBoost` | `false` | Pause card farming while the hours booster or Realistic Mode runs |
| `bulkSellLimit` | `50` | Bulk sales are split into batches of this many items; `0` lists until Steam stops it |
| `priceDropThreshold` | `10` | Percent below Steam's 24-hour average that marks a price drop |
| `reconnectPolicy` | `unlimited` | Reconnect after a dropped connection: `unlimited`, `10`, `3` or `off` |
| `sessionTimeout` | `never` | Close all sessions after this many idle minutes; running jobs do not count as idle |
| `theme` | `dark` | Colour theme: `dark`, `midnight`, `white` |
| `language` | `en` | Interface language: `tr`, `en`, `de`, `es`, `zh`, `ru` |

The [configuration reference](./guides/TUTORIAL.md#️-configuration-reference) covers the keys worth knowing about; the rest are the other controls on the Settings page.
