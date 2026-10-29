[← Back to the README](../README.md)

# ❓ FAQ

<details>
<summary><b>Do I need the Steam client running?</b></summary>

No. SteamEdge speaks Steam's own network protocol directly. The client is never launched, and having it open changes nothing.

</details>

<details>
<summary><b>Can this get my account banned?</b></summary>

Idling games and unlocking achievements over the protocol is what a great many tools do, and Valve has never publicly committed to a position on it. That is not the same as it being safe. You run this at your own risk. Read the disclaimer below before you decide.

</details>

<details>
<summary><b>Why are prices not converted to my currency?</b></summary>

They are already in it. Prices come from Steam in your account's wallet currency and are shown exactly as they arrive. Converting them would mean inventing an exchange rate, and a made-up number is worse than no number.

</details>

<details>
<summary><b>An achievement will not unlock. Why?</b></summary>

Some achievements are written by the game server, not the client, and Steam refuses to let any client set them. SteamEdge detects those from the schema and skips them instead of failing over and over. A few games also keep no stats over this protocol at all, in which case you will see `0 / N` and nothing to do about it.

</details>

<details>
<summary><b>It stopped working after an update. What now?</b></summary>

Make sure the new version was extracted into an empty, new folder with only `settings/` copied over; extracting over the old folder leaves files from two versions mixed, and the app tells you so at startup. Then check the [troubleshooting section](./guides/TUTORIAL.md#-troubleshooting) of the tutorial and the logs in the `logs/` folder (set Settings > Advanced & data > Log file to Verbose first). If it is still broken, open a bug report and attach those logs.

</details>
