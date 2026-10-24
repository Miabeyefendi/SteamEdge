# Changelog

Every released version of SteamEdge, newest first. Each entry is the release note
published with that build; the archives live on the
[releases page](https://github.com/Miabeyefendi/SteamEdge/releases).

Versions 1.0.0 to 1.0.4 were withdrawn over Electron 33 vulnerabilities and their
archives deleted on purpose. Their notes are not reproduced here.

## [1.7.2](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.7.2)

The app now runs on the newest Electron (45.0.0) and the dependency warnings are gone.

### Changed

- **Electron 41 / 42 is now 45.0.0.** The 42.11.3 that 1.7.1 shipped had four published vulnerabilities (pointer lock attributed to the wrong frame, two cases of trusting GPU-supplied frame geometry, a certificate mitigation). 45.0.0 is the newest stable release and has none of them. The 53 tests pass on it.
- **Two build and proxy dependencies updated inside their version range** (`npm audit fix`): `undici` 7.30.0 to 7.30.1 (used by the build tool only) and `ip-address` 10.7.3 to 10.7.4 (used by the proxy support). `npm audit` now reports 0 vulnerabilities.
- The build no longer requires `libEGL.dll` and `libGLESv2.dll` when Electron does not ship them: Electron 45 links them into `electron.exe`, so the old check refused to package. It still stops if a file that Electron does ship is missing.
- The package is 300 MB, the same as 1.7.1.


SHA-256 (`SteamEdge-v1.7.2-win-x64.rar`): `8ea5faece85bc21a9cc086b091b612a15c8e037f04940f3cd25555f4551b22b9`

## [1.7.1](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.7.1)

Realistic Mode now counts the hours a game has already been played, shows what its settings really do, and the minimise button sends the window to the tray.

### Fixed

- **A game that was already played for its whole completion time still planned that whole time again.** With the automatic duration, a game with a 26 hour completion time and 26 hours played planned another 26 hours of unlocks, although a real player with that many hours would already have all of them. The playtime now counts: the achievements it already covers (the backlog) get a few minutes each, at most 3 hours for the whole game, and only the rest gets the hours a real player would need. A game played to its completion time plans about 2 to 3 hours, a game played halfway plans the other half in full plus the short catch-up, a game never played is unchanged. With "Catch up on overdue achievements" off nothing is shortened.
- **Changing the difficulty or the game type did not rebuild the plan.** The unlock times on screen stayed as they were until another setting was touched. Both (and the model, which already did) now ask the engine for a new plan.
- **The "will unlock in about ..." text did not follow the settings.** It showed the average gap over the whole duration, so a duration of 1 hour and one of 16 hours could read the same, and a finished game, a squeezed backlog or the speed setting changed nothing on screen. The page now measures the plan itself: the first unlock is when the first achievement really comes, the average gap and the "N achievements in ..." sentences use the time the last unlock really comes.

### Changed

- **The minimise button sends the window to the notification area (tray) instead of the taskbar.** The tray icon (click, or "Show window" in its menu) brings it back. If the tray icon cannot be made, the window is minimised as before.
- **Built on Electron 42.11.3** (the update merged in PR #50); the 53 tests pass on it.
- `npm test` covers the playtime rule (never played, half played, played to the completion time, far past it, catch-up off) and the plan being rebuilt when the difficulty or game type changes.


SHA-256 (`SteamEdge-v1.7.1-win-x64.rar`): `b6ff12b058c5b8cf0928c1d0260d742f33517e7b4fa261341ed6a95727731e96`

## [1.7.0](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.7.0)

The Spanish, Traditional Chinese and English texts of the app are corrected the same way the Turkish, Russian and German ones were in 1.6.7 to 1.6.9, and with that every language of the app has been read sentence by sentence.

### Changed

- **83 texts rewritten by hand** after reading all 1525 texts of each language next to the Turkish source. These three languages were already close to the source, so there are fewer fixes than before; what was fixed:
  - **Spanish (34):** "Farmeo de cromos" everywhere (the schedule texts said "cartas" and "recolección"), "plantilla" instead of "preset" and "preajuste", "Inventario unificado" instead of "Centro unificado", "Editor" instead of "Publicador", "precio mediano" instead of "precio medio" for the median, "grindeo" replaced by plain words, the setting that unlocks achievements while farming cards no longer talks about hours, the card threshold sentence with two counts no longer breaks for one game, and long or clumsy explanations cut down.
  - **Traditional Chinese (25):** one word for card farming ("掛卡" instead of the mixed "集卡"), "卡牌" instead of "卡片", "庫存" instead of "物品庫", "市集價格" instead of "市場價格", "中位價" for the median price, "所選項目中最高者" under one name in both places, and a few clumsy sentences (window drawing, sync note) rewritten.
  - **English (24):** British spelling throughout ("favourite", "licence", "recognised" were still American), "Sync playtimes" under one name, "median" where the Turkish text says median, the setting that unlocks achievements while farming cards no longer talks about hours, "Unified inventory" instead of "Unified hub", comma splices turned into proper sentences, and a plural-safe version of the sentence with two counts.
- The meaning of every text is unchanged, so no other language is touched by a fix in one language.


SHA-256 (`SteamEdge-v1.7.0-win-x64.rar`): `a9a55c55ed8060d5bae72d44d91781a809073b5297c4851a28a513751b0c7d0d`

## [1.6.9](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.9)

The German texts of the app are corrected the same way the Turkish ones were in 1.6.7 and the Russian ones in 1.6.8: one term for one thing, shorter explanations, no borrowed slang, and sentences that say what the setting really does.

### Changed

- **About 115 German texts rewritten by hand** after reading all 1525 German texts sentence by sentence next to the Turkish source. What was fixed:
  - one term for one thing: "Gegenstand" for items everywhere (it was a mix of "Objekt" and "Gegenstand"; Steam itself says "Gegenstand"), "Errungenschaften" instead of the mixed "Erfolge", "Kartenfarmen" instead of the mixed "Kartensammeln", "Vorlage" instead of "Preset", "Anmelde-Token" instead of "Login-Token", "Sperrliste" and "Erlaubnisliste" instead of "Sperrliste" next to "Whitelist", "Ultraselten" in one spelling;
  - borrowed words replaced: "Drop" and "droppen" ("Nächster Drop" is now "Nächste Karte", "Kartendrops" is now "Kartenerhalt"), "erfordert Grind" is now "kostet viel Mühe";
  - sentences that said something else than the Turkish text: the setting that opens achievements while farming cards spoke of collecting hours, "Medianpreis" was "Durchschnittspreis", the start page note asked to pick a "Bildschirm" for a tab, the equalise note named a target that does not exist under that name;
  - wrong or awkward forms: "Zentrale" is now "Gesamtinventar", "Verkaufbar" is now "Verkäuflich", "# Jahr" has a plural, the card threshold sentence with two counts no longer breaks for one game, the cancel-listing note says what happens in the order it happens;
  - over-long explanations cut down (start tab, language, window drawing, image cache and the schedule texts).
- The meaning of every text is unchanged, so the other five languages keep their translations.


SHA-256 (`SteamEdge-v1.6.9-win-x64.rar`): `4982f6c74d00cccd8a77da0d360ea7229fd7ec0d9dd88bc5e3b0b922868e3bac`

## [1.6.8](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.8)

The Russian texts of the app are corrected the same way the Turkish ones were in 1.6.7: shorter explanations, one term for one thing, no borrowed slang, and sentences that say what the setting really does.

### Changed

- **51 Russian texts rewritten by hand** after reading all 1525 Russian texts sentence by sentence next to the Turkish source. What was fixed:
  - wordy explanations cut down (the language, start tab, side bar, notification and storage descriptions);
  - sentences that no longer matched the Turkish text after 1.6.7 (the language note, the hidden-features note, the update button note, the usage of `Ayarlar > Envanter > Düşük değer`);
  - one term for one thing: "шаблон" for the saved settings set instead of the English "пресет", "фарм карточек" for card farming everywhere (the schedule texts said "сбор карточек"), "сверхредкие" instead of "ультраредкие", "выпадение" instead of "дроп", "Единый инвентарь" instead of "Единый центр";
  - slang and loan words replaced ("нужен гринд" is now "потребуется много усилий", "Не давать уснуть" is now "Не уходить в спящий режим");
  - wrong or awkward forms: "Разбитие" is now "Разбивание", "# год" now has all three plural forms, the price loading note names a count that agrees with the noun ("Для # предмета ... цена" and "Для # разных предметов ... цены").
- The meaning of every text is unchanged, so the other five languages keep their translations.


SHA-256 (`SteamEdge-v1.6.8-win-x64.rar`): `859f4419d1bddbc6fc768539dfba520cb4b9284fa3e03f12500e68d8896a74c6`

## [1.6.7](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.7)

The Turkish texts of the app are corrected: fewer inverted and hanging sentences, matching subjects and verbs, one term for one thing, and shorter explanations.

### Changed

- **About 125 Turkish texts rewritten by hand** after reading all 1526 texts twice, sentence by sentence (menus, setting descriptions, notices, dialogs, credits). What was fixed:
  - inverted word order ("Menüler, etiketler ve bildirim metinleri seçilen dilde gösterilir. Değişiklik kaydedince hemen uygulanır." is now "Menüler, etiketler ve bildirimler bu dilde görünür. Değişiklik, kaydedince hemen geçerli olur.");
  - subjects and verbs that did not agree ("İşlem sürerken uygulamayı kullanmaya devam edebilir, istediğin an iptal edebilirsin" and the sales statistics sentence);
  - sentences that hung in the air, said the wrong thing or changed their subject in the middle (the update note that said "indirir, çıkarır, kopyalarsın"; "alıcı beklemesi uzar" is now "satış gecikir"; the credits);
  - one term for one thing: "eş zamanlı", "sınır" instead of "limit", "ön ayar" instead of "preset", "para birimi" instead of "kur" for the market currency, "Pazar" instead of "Market";
  - mixed forms of address ("hesabınız" among "hesabın"), loan words and slang ("farm edilir" is now "kart düşürülür", "Hub", "Statü", "grind") and over-long explanations.
- The meaning of every text is unchanged, so the other five languages keep their translations.


SHA-256 (`SteamEdge-v1.6.7-win-x64.rar`): `805be256a73c966f0d5a159e503a7e5971a38984110c2086912129c06564c743`

## [1.6.6](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.6)

The "reconnecting" notice at the top no longer hangs after the connection is back.

### Fixed

- **"Reconnecting (attempt 2)" stayed on screen although Steam was connected again.** Two things could leave it there:
  - The strip showed what the last event said. If the event that says "connected again" never reached the page (it belonged to an account that was not on screen at that moment, or the account was changed in between), nothing took the strip away. The page now asks for the real state of the account on screen whenever any account reports something, after an account switch, and every 15 seconds while the strip shows.
  - The engine itself could stay on "reconnecting" with a live session: Steam sometimes logs the account on again by itself, and the attempt of the app's own timer, or an error that arrived after the logon, then marked the live session as not connected. The engine now checks whether Steam has a session before it logs on, and every minute with its heartbeat; if it has, it reports "connected" once, reopens the games and clears the attempt counter.

### Changed

- `npm test` runs 53 tests (new: the engine recovers a session that is back; the account switch test checks that the strip goes when the connection is back and the event for the account on screen is missing).


SHA-256 (`SteamEdge-v1.6.6-win-x64.rar`): `82c0f0bd7d7169771070c7dbd7a54b8d0fc4d2cfb799febfa2c6fd51431d338d`

## [1.6.5](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.5)

A job that runs on another account can now be seen from the account on screen: the Overview, the Hour Booster page and the recent activity name it, with its account and its game.

### Fixed

- **"1 job resumed" and nothing anywhere.** At startup the jobs of the last session are resumed on every account, but the pages only show the account on screen. A boost resumed on the other account ran on Steam while the notice only said "1 job resumed", the recent activity had nothing, and the Hour Booster page and the Active task panel said nothing was running. Now:
  - the notice and the recent activity say what was resumed and where: "[account] Resumed where it left off: Hour boosting (Counter-Strike 2)";
  - the Active task panel of the Overview says "Nothing is running on this account" and lists what runs on the other accounts, each with its job, its game and a button that opens that account;
  - the Hour Booster page of an account with nothing running shows the same list;
  - the account list names the game of each running job ("Hour boosting: Counter-Strike 2").

- **A job resumed on the account on screen could stay invisible too.** If it was resumed before the app knew which account is on screen (or before the page was listening), its state was never sent to the page. The pages now ask for the live state of the account on screen when they are ready and every time that account starts or stops something, so a resumed boost shows on the Hour Booster page and in the Active task panel of its own account. (1.6.4 fixed the other half: the state that did arrive was wiped by the empty state of sequential idling.)

### Changed

- `npm test` runs 52 tests (new: the job and game names of an account; the account switch test now checks the Overview, the Hour Booster page and the recent activity for a job of another account, and a resumed job whose state never reached the page).


SHA-256 (`SteamEdge-v1.6.5-win-x64.rar`): `d7980ee9db4ca56b67c8a86a90cdc57470e17a86e6b7977deabd1a4c0e47af31`

## [1.6.4](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.4)

A running hour boost no longer disappears from the screen when the account changes or when a job is resumed at startup.

### Fixed

- **"1 job resumed" but nothing on screen.** When the account on screen changes, and when the jobs of the last session are resumed, the app sends the state of every kind of job, the idle ones empty. The Hour Booster page kept simultaneous boosting and sequential idling in one state, and the empty sequential state that came right after a running boost wiped it: the boost ran on Steam, the page said nothing was running, and Start was open, so one click started it again from zero (a 24 hour session lost its 6 hours). The two kinds now keep their own state and the running one is shown, so the boost is on the page, Stop is open and Start is closed.

### Changed

- `npm test` runs 51 tests (the account switch test now sends the job states the way the app does and checks that a running boost stays on screen).


SHA-256 (`SteamEdge-v1.6.4-win-x64.rar`): `a313c4e771c63aa06a2582f47b70b250f8306d0b4db37da017a92de412e0f9d3`

## [1.6.3](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.3)

Every account now keeps its own job settings, and a page of one account can no longer write into another.

### Fixed

- **The Realistic Mode queue of one account replaced the queue of the other.** After a switch the pages kept the values they had read for the first account (its Realistic Mode queue and presets, its hour list, its card lists, its favourites), showed them on the second account and saved them into its file, so the second account's own game disappeared. The pages now read the settings of the new account the moment the switch is done and drop what they kept of the old one, and every write names the account its values belong to: a write from a page of another account is not taken into the account on screen.
- Unsaved changes on the Settings page are dropped when the account changes; they belonged to the other account.

### Added

- **Settings per account.** The settings of the jobs are kept with each account: card farming (mode, time per game, games at once, the fast mode threshold and the rest of the section), the Hour Booster section, Realistic Mode (duration, target, difficulty, model and the other switches), the Achievements section, and the schedules of card farming and Realistic Mode. Two accounts can now run Realistic Mode with different settings, and a change made on one account changes and restarts only that account's jobs. An account that never changed a setting uses the general value, so nothing changes on the first start. The sections that work this way say "This account only". The look, the language, notifications, the market, the network and the app's behaviour stay general.
- Backups include each account's own job settings.

### Changed

- `npm test` runs 51 tests (new: settings per account; the account switch test now checks that the page holds the new account's queue and that its writes name that account).


SHA-256 (`SteamEdge-v1.6.3-win-x64.rar`): `93cf59401d8a94a72c0ed4cd91da738bca00ce63fe0e4feac78bc0564496c53e`

## [1.6.2](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.2)

Realistic Mode names its rarity bands by proportion again, and the engine uses the same bands as the list.

### Fixed

- **1.6.1 made every achievement look common.** It measured rarity against the most common achievement of the game, so in a game where all of them sit between 3% and 7% nothing was "ultra rare" any more, and in others almost nothing was rare. The bands are now proportions of the game's own achievements, in the order of their percentages: the most common 20% are "Very common", the next 30% "Common", the next 20% "Uncommon", the next 20% "Rare" and the last 10% "Ultra rare". Every game has all five, whatever Steam's numbers are. Steam's own client only has a "Rare" badge (under about 10%), so these names are SteamEdge's.
- **The list and the engine use the same bands.** The last tenth is what "Skip ultra rare achievements" skips, what waits the "Ultra-rare wait" longer, and what is always unlocked last. The backlog squeeze ("Catch up on delayed achievements") only takes the first 35% of a game's achievements, about what a story gives, and never an ultra rare one. The place of an achievement is worked out on the whole list of the game, so it does not change while achievements are being unlocked.

- **The same percentage could carry two names.** Steam gives the percentages with one decimal only (a game with 500 achievements can have 28 different values), so hundreds of achievements read exactly 3.1% and a band edge fell in the middle of them: some showed "Uncommon", some "Rare" and some "Ultra rare" for the same number. Achievements that read the same now share one band, the one of the middle of their group; they still unlock in the order of the game's schema.

### Changed

- `npm test` runs 50 tests (the Realistic Mode tests now cover the proportions, a game with every achievement between 3% and 7%, the squeeze limit and the labels in the list).


SHA-256 (`SteamEdge-v1.6.2-win-x64.rar`): `7f62f24623a4f98470725d507805088357d7b0939f33c5b354cc6cd915767b5c`

## [1.6.1](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.1)

Realistic Mode no longer refuses to start without rarity data, judges "ultra rare" against the game itself, and never unlocks an ultra rare achievement early.

### Fixed

- **Ultra rare achievements were unlocked early.** The squeeze of the overdue backlog ("Catch up on delayed achievements") could reach into the rarest part of the queue, and "ultra rare" was decided from Steam's raw percentage. That percentage is the share of the owners of a game, and many owners never really start it: in one game the most common achievement is held by 33% of the owners, in another by 97%. In a game where every achievement sits between 3% and 7%, all of them counted as ultra rare, so the setting did nothing useful. Rarity is now measured against the game's own most common achievement: under a twentieth of it is ultra rare (about 8% of a game's achievements, measured on 42 games). The backlog squeeze only takes common achievements, never ultra rare ones and never the ones rarer than the end of a story (30% of the best). The ultra rare ones are always the last of the run, whatever the model, and still wait the "Ultra-rare wait" longer.
- **Realistic Mode refused to start when Steam did not answer with the percentages (1.6.0).** It starts now. The order falls back to the schema order with the hidden achievements last (usually the end of the story and the grind), nothing is squeezed, and a notice says so.

- **The list said "ULTRA RARE" for almost everything in some games, and the order inside a group of equal percentages shuffled.** The label and the colour of every row now follow the same relative rarity the engine uses, so a game whose achievements all sit between 3% and 7% shows them as common instead of ultra rare. The order of achievements whose percentage reads the same at one decimal (the "single run #1 to #5" tiers) keeps the schema order, so the preview and the run agree even though Steam moves the percentages a little between two reads.

### Changed

- **The gaps are even again.** 1.6.0 widened the gap in front of every rarer achievement. Fitted against the Steam percentages and the HowLongToBeat times of 42 games, that fitted worse than plain even spacing along the queue (error 0.69 against 0.44): at the end of a story a player has about 34% of a game's achievements after about 38% of the time it takes to get all of them. Only the ultra rare wait is left as an extra gap.
- The "Ultra-rare wait" and "Skip ultra rare achievements" settings use the new definition.
- `npm test` runs 50 tests (the Realistic Mode tests now cover the 100 achievement case, the squeeze, a model that bends the curve, a small game and a game without rarity data).


SHA-256 (`SteamEdge-v1.6.1-win-x64.rar`): `095d08f365dfe4341f6d6593b1995dd2fd0d65d352b3fb86583cf530b4ce7c60`

## [1.6.0](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.6.0)

Several accounts now behave the way they look: one click switches, what runs on each account can be seen without opening it, the Start and Stop buttons say what is possible, Realistic Mode unlocks from the most common achievement to the rarest, and fast mode farms every game it should.

### Fixed

- **Switching accounts took several clicks and showed the wrong account's data.** The account on screen used to change the moment you clicked, while the connection of the new account was still being made. Until then the pages kept using the old account, so games and jobs of the first account appeared under the second one. Now the old account stays on screen until the new one is connected, the page is dimmed with a "Switching to ..." notice meanwhile, a second click on another row takes over, and a failed connection says why and changes nothing. The list of accounts is no longer redrawn when nothing in it changed, and a row is chosen when the button goes down, so a click cannot be lost to a redraw.
- **Fast mode skipped games on the second account.** While games under the threshold were being pulled up, the games already past it were not opened at all, so no cards dropped from them for the whole warm-up. They now stay open and take turns as the featured game, and their cards keep dropping while the others catch up. The quick Start on the Overview page also sent the games without their playing time, which made every game look under the threshold; it now sends it like the Card Farming page does.
- **Realistic Mode could unlock the rarest achievements first.** The order depends on the global unlock percentages, and when Steam did not answer, the percentages were silently empty and the queue fell back to the order of the game's schema. The percentages are now kept for a day (`cache/achievement-rarity.json`), asked for again once on failure, and an older answer is used when Steam stays silent. If there is nothing to go by the run is refused with the reason instead of started in the wrong order.
- **Start and Stop were not closed when they made no sense.** Card Farming, Hour Booster and Realistic Mode now close Start while their job runs (or has just been started and the first answer has not come, or the question is open) and close Stop while nothing runs. The same on the Overview panel: its Start is closed while card farming runs even when another job is the one shown. A double click starts once.
- The achievement queue of Realistic Mode names the game from the library of the account instead of "App 123456" when Steam does not give a name.

### Added

- **What runs on each account is visible without opening it.** A chip in the top bar counts the accounts that run something and the ones that finished while they were in the background; the account list names the jobs of every account (Card farming, Hour boosting, Realistic Mode) and says when a finished one ended. It clears when you open that account.

### Changed

- **Realistic Mode weights rarity smoothly.** The time between unlocks used to jump at the edges of a few rarity classes; it now grows with the logarithm of how rare an achievement is, and the ultra rare ones (under 5 %) keep their extra wait. The queue is ordered by global unlock percentage from the highest (obtained easily, early) to the lowest (late).
- `npm test` runs 50 tests (new: fast mode warm-up, rarity cache and refusal, account switching, accounts and Start / Stop in the interface).


SHA-256 (`SteamEdge-v1.6.0-win-x64.rar`): `181270127ff1ae5ae6bf64f6633e2307bb5507a99c8a0b3e2ad9504f2075ca5e`

## [1.5.9](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.9)

A running job no longer costs the window a quarter to three quarters of a processor core: the pulsing dots are driven by one slow timer instead of endless CSS animations.

### Changed

- **The dots beat from one timer, not from animations.** An animation that never ends makes Chromium draw the window 30 to 60 times a second, and with the processor compositing the window (the default since 1.5.7) a 7 px pulsing dot cost about three quarters of a processor core while a job ran and the window was in front; on the graphics card it cost a fifth. One timer now flips the dots every 0.8 seconds. Measured on the real page with the same method: **72 % of a core down to 1.4 % with the processor compositing, 16 to 20 % down to 3 % on the graphics card.** The look changes from a smooth fade to a two step blink.
- The timer runs only while it can be seen: the window focused and visible, not in light mode, and a dot on screen. An unfocused window, a minimized one, light mode and a page with nothing running stop it altogether, so a game next to the app has nothing to compete with.
- The same goes for every pulsing dot of the app: the side menu status, the running pills, the card page, the account list, the connection bar, the price fetch and the hour sync bar.
- Left as they were: the turning circles of toasts, the achievement page and the sign-in screen (about 5 % of a core while an operation runs).
- `npm test` runs 46 tests (the idle drawing test now covers the beat).

SHA-256 (`SteamEdge-v1.5.9-win-x64.rar`): `ccfe5f4a15bd86e9f4029719f5889f4d8024fdc0506b3ffe0e9804c895b1ee90`

## [1.5.8](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.8)

Two processes fewer: the app takes about 100 MB less memory.

### Changed

- **Low memory mode (Settings > Advanced & data, on by default).** Chromium ran the graphics and the network code in two helper processes of their own; they now run inside the main process. On the overview page that is 2 processes instead of 4, and 313 MB of working set instead of 411 MB (measured with Electron's own process metrics). The price: a graphics driver that crashes takes the app down with it instead of just a helper process, so it can be switched off if you see garbled graphics or sudden closes (it asks for a restart). Every page test of the app passes with it on.
- The two graphics settings of 1.5.7 (GPU compositing, low memory mode) are in the configuration reference of the tutorial.
- `npm test` runs 46 tests (the graphics defaults test now covers low memory mode).

**What did not move.** The part of the memory that the app itself owns is small: the main process holds 15 MB of JavaScript and the page 8 MB, with 7,000 elements. The rest is Chromium, so loading pages lazily would save a few megabytes, not tens, and was left out. GPU use while the window is shown, as Windows counts it, is 0% in every configuration, and the desktop compositor's share is around a tenth of a percent either way; the part that was worth cutting was the video memory (1.5.7).

SHA-256 (`SteamEdge-v1.5.8-win-x64.rar`): `a8526335d54c6d8fcb1efba9eb5030f85dfeab2bb2d729e5bad93b76abc4449c`

## [1.5.7](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.7)

Lighter on the graphics card and on the disk: the window no longer redraws itself while nothing is happening, it holds a fraction of the video memory it did, and the download is 37 MB smaller.

### Changed

- **Video memory: about 67 MB down to 9 MB.** The window is now composited by the processor by default (Settings > Advanced & data > GPU compositing, off), measured on the overview page with Windows' own GPU counters. Next to a full screen game that is memory the game keeps, and the game's presentation path stays free. It costs a few points of processor time while something moves and none while the window is still. Settings files written before this follow the new default once; turn the setting on again if you prefer the graphics card (it asks for a restart).
- **The window no longer draws forever.** With the full visual mode on, a pulsing "ready" dot in the side menu and in the pills of the pages kept Chromium drawing about 30 frames a second on every page, with nothing running (239 frames in 8 seconds, measured). Those dots now stand still and only pulse while a job runs. A window that starts without the focus (started with Windows while a game is open) is also calm from the first moment; before, it was calmed only after a focus and a blur had happened. An idle window now produces no frames at all.
- **A smaller download.** 327 MB extracted becomes 288 MB, and the .rar 105 MB becomes 95 MB: the shader compiler of WebGPU and the software Vulkan that Electron ships (31 MB), which the app never loads, and the type definitions, source maps and tests that the dependencies carry (6 MB). The app starts and draws its pages with the processor compositing, the graphics card compositing and hardware acceleration off, checked on a copy of Electron without those files.
- `npm test` runs 46 tests (new: the graphics defaults and their migration, the idle drawing).

SHA-256 (`SteamEdge-v1.5.7-win-x64.rar`): `4108353f3383d1da87c9196efa19af9f6581c77c132c71a0c91693190559de62`

## [1.5.6](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.6)

Realistic Mode takes the difficulty from real playing times: an easy story no longer turns a 12 hour game into 4 hours.

### Fixed

- **Realistic Mode: the difficulty shrank a long completion time far too much.** "Easy" took a third off the time that was entered (12 hours became 8 and, with half the achievements left, 4) and "very hard" added two thirds, with nothing to stop a 300 hour game from becoming 500.

### Changed

- **The difficulty now follows how long real players take.** The curves are fitted to HowLongToBeat data for 47 games, from 5 to 435 hours: a player who rushes needs 0.68 of the average 100% time (0.57 to 0.77), one who takes their time needs 2.4 times (never under 1.6 times).
  - **Easy** is the fast player: about 0.75 of the entered time on a short game and 0.63 on a long one (12 hours become 9, 100 become 67, 300 become 196, 800 become 507).
  - **Normal** is the entered time itself.
  - **Hard** is halfway between normal and very hard on a log scale: 1.38 times on a short game, 1.26 times on a long one (12 hours become 17, 100 become 132, 300 become 388).
  - **Very hard** is the completionist who takes their time: 1.9 times on a short game falling to 1.6 times on a long one (12 hours become 23, 100 become 175, 300 become 501). The 999 hour limit of the duration still holds.
- The four options in the advanced panel now say what they stand for (fast player, average player, takes their time, completionist) instead of the old multipliers.
- `npm test` runs 44 tests (new: the difficulty curves).

SHA-256 (`SteamEdge-v1.5.6-win-x64.rar`): `95db35feb592dc27876d7475ecb16679b3f059fdb779971353fde72a6fe6c6d6`

## [1.5.5](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.5)

Finding things is quicker: a command palette, number shortcuts for the pages, a search box in Settings, and marks on the sections you changed.

### Added

- **Command palette (Ctrl+K).** Type to find a page, a section of Settings, a single setting, another account or an action of the open page (Start or Stop, for example) and press Enter. The arrows move through the list, Esc or Ctrl+K again closes it. The search ignores case, accents and the Turkish dotted and dotless i, every word you type has to be found, and a name that starts with what you typed comes before one that only contains it. An empty palette shows the short list people open most; single settings appear once you type.
- **Ctrl+1 to Ctrl+9.** Ctrl+1 to Ctrl+7 open the pages of the side menu in the order they are shown (a page you switched off closes up the numbers), Ctrl+8 opens the chat when it is on, Ctrl+9 opens Settings. They wait while a question window is open, so a shortcut never answers a question by accident.
- **Shortcut list.** `?` (when you are not typing in a box) or Ctrl+/ shows the shortcuts with the numbers as they are now.
- **Search box in Settings.** It sits above the sections, finds a single setting by its name or by what its help text says, opens its section, scrolls to the row and lights it for a moment.
- **Marks on the sections.** A section of Settings with changes you have not saved carries a dot. After Save the sections that were saved show a tick for a few seconds, and the message names them.

### Changed

- `npm test` runs 43 tests (new: the ranking and the shortcut numbering, and the palette, the shortcuts, the search box and the section marks in the page).

SHA-256 (`SteamEdge-v1.5.5-win-x64.rar`): `d8c0dd38d5783859ef67c0df720829da2eda7f8c6285cc69416d31db83fb48ea`

## [1.5.4](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.4)

The interface is easier to read and to use: its size can be chosen, a high contrast theme is added, dim text is brighter and the keyboard reaches everything it should.

### Added

- **Interface scale (Settings > General).** 80, 90, 100, 110, 125 or 150 percent for the whole interface, 100 by default. Ctrl + / - / 0 change it too (they stepped the page zoom before and were switched off in 1.5.2), and the window that opens on the first start asks for it. If the window is too small for the layout at the chosen scale, the scale shrinks to what fits, so nothing is cut off at the edge.
- **High contrast theme.** Black surfaces, white text and borders, bright accents; every text colour is 7 : 1 or better. The theme choice now has **Automatic** (the default for new settings): it uses High contrast when the system asks for more contrast and the dark theme otherwise. Windows' own contrast themes (forced colors) are followed too: switches, focus rings and the active menu item use the system colours.
- **Keyboard and screen reader.** The switches and the side menu items can be reached with Tab and pressed with Enter or Space. They are announced as switches and buttons, a switch says whether it is on, and the open page is marked as the current one.

### Changed

- **Dim text is readable in every theme.** The dim grey text (3.3 : 1 on the dark surfaces) and about forty other low contrast text colours are now 4.5 : 1 or better against their surfaces, red text is a lighter red, and the light theme's old pastel text colours (the side menu, small labels, status colours) are dark enough to read on white.
- **No text is smaller than 11 pixels.** About 180 places used 7 to 10 pixel text; the hour, minute and second boxes were made a little taller so their labels fit under the digits.
- The interface font falls back to the system's Traditional and Simplified Chinese fonts after Geist and Segoe UI.
- `npm test` runs 41 tests (new: theme contrast and source colours of the four themes, the keyboard, the scale in the window and in the welcome window).

SHA-256 (`SteamEdge-v1.5.4-win-x64.rar`): `1868520b70fe8816048c7d8588c7a5002ff29669b66454d7d07346b735a1b56d`

## [1.5.3](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.3)

A job that was running when the app ended no longer has to be started again by hand: it comes back where it left off.

### Added

- **Unfinished jobs resume at startup.** If the PC is shut down, the app is closed or it crashes while a card farm, an hour boost (all at once or one by one) or a Realistic Mode run is going, the job is written to `settings/resume.json` and starts again as soon as the account connects at the next start. A card farm comes back at its game and its minute, a boost with the time it had left, a Realistic Mode run with what was left of its target over the time that was left. The time the app was not running does not count: a boost with three hours left has three hours left again. A boost that synchronises hours reads the playtimes again, because they moved while it ran.
- The file is written when a job starts or ends and every half minute while one runs, so a power cut loses at most half a minute. Jobs you stopped by hand or that finished are not resumed. Jobs the schedule started are left to the schedule, an entry older than a week is dropped, and if you start something on the account yourself before the page is up, the old entry is dropped. The activity feed and a notification say how many jobs came back.
- **Settings > General > Resume unfinished jobs at startup** switches it off (on by default); the file is then removed.

### Changed

- Realistic Mode can take a fixed number of achievements per game, which is what lets a resumed run continue with exactly what was left.
- `npm test` runs 39 tests (new: the resume file and its plan, and the part of the main process that writes, reads and restarts the jobs).

SHA-256 (`SteamEdge-v1.5.3-win-x64.rar`): `0256cd0ba2e6555daa5df2d9509af845a068b35151a8642b4e1e483b5baa4885`

## [1.5.2](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.2)

Four problems people hit are fixed, the inventory page now shows every game's items and not only the Steam ones, and the modules get their small switches.

### Added

- **Counter-Strike 2, Dota 2 and every other game's inventory (Inventory & Market).** A selector at the start of the filter bar lists the games the account has items in. Pick one and its items load into the same table with the same tools: prices, sale history, order book, selling and CSV export. Steam never blocked these items: the page only ever asked for the Steam community inventory (cards, backgrounds, emoticons, gems) and never for a game's backpack. What was read is kept, so going back and forth costs no request. A game's items are priced by name only (wear, pattern and stickers are not part of the price), and the sale question says so in red. An inventory bigger than 2000 items is read page by page; if Steam refuses a later page, the part that was read is shown and the page tells you it is a part.
- **Small features and top bar items can be switched off (Settings > Modules).** Small features: the activity box on the overview, the favorite stars, the My listings button, the CSV export button and the selector of the other games' inventories (switched off, they are not asked for at all). Top bar: the search box, the notification button and the update button. The settings and account buttons always stay. Everything is on until you switch it off.
- **A window smaller than the layout scales the page.** The layout is drawn for 900 x 560 (the sign-in screen 900 x 640). Below that the whole page is scaled to fit, down to three quarters, so every button keeps its shape and nothing runs off the edge. The smallest window is now 675 x 420 (sign-in 675 x 480).

### Fixed

- **Realistic Mode: a game that takes 60 hours now gets 60 hours.** With the automatic duration on, the page showed one target and duration and sent something else to the engine: all achievements were unlocked within the 2 hours in the field. The engine now works out the target and the duration together, from the completion time, the share of achievements that will be unlocked and the difficulty, and the page shows exactly what will run. A duration typed by hand is respected and brings back the "what a real player would earn in that time" target. The difficulty "normal" no longer adds 20% on top of the completion time (60 hours showed as 72). A game that counts as finished does not get the compression on top of an automatic duration.
- **The automatic duration and catch-up switches needed two clicks.** They showed "on" while the setting was empty, and the first click wrote "on" again.
- **The top bar buttons were ellipses.** In a narrow window the round buttons were squeezed sideways. They keep their size now and the search box gives way instead.
- **Buttons and rows inside scrolling columns were squeezed flat** when the column was short; they keep their height and the column scrolls.

### Changed

- Ctrl + / - / 0 no longer zoom the page: the window sets the zoom itself so the layout always fits.
- `npm test` runs 37 tests (new: window fit, inventories of other games in the engine, in the page and in the sell guard, the small switches, the Realistic Mode plan and page).

SHA-256 (`SteamEdge-v1.5.2-win-x64.rar`): `b79aa73bcdc19da6ec11d2a8ddd1b0b8f0da09e01d3559fef65143e74670674a`

## [1.5.1](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.5.1)

Two things for people who want the app their own way: pages you can switch off, and a light mode for weak computers.

### Added

- **Modules (Settings > Modules).** Switch off the pages you do not use: cards, inventory, hour booster, Realistic Mode, achievements, keys and chat. A page that is off leaves the side menu, the overview tiles and the top bar, cannot be opened by any road (menu, overview, start page), and asks Steam for nothing. The arrows move the pages up and down, so the side menu follows your own order. Scheduled jobs (farming and Realistic Mode schedules) keep running in the background according to their settings. The edge tab of the menu follows the active item wherever it is now.
- **Welcome window on a first start.** The first time the app starts it asks which pages you want and which performance mode. Existing installs are not asked.
- **Performance mode (Settings > Modules > Performance): Automatic, Full or Light.** Light turns off animations, transitions, blur, filters and shadows. Automatic switches it on when the system's "reduce motion" setting is on or the computer is weak (2 cores or 2 GB of memory, or 4 cores and 4 GB at most). **Set up for this computer** shows the cores and memory it found and picks a mode for them.
- **A long inventory is drawn in the background.** The first 200 rows appear at once and the rest follow in small steps, and rows that are off screen are not laid out, so a 3000 item inventory no longer blocks the page.

### Changed

- `npm test` runs 31 tests (new: modules, performance mode, the welcome window and the background drawing of a long inventory, all in one test).

SHA-256 (`SteamEdge-v1.5.1-win-x64.rar`): `5a49eb53277959805d7a2b7c3141bde505d27e767454a9e001ed8585c261ecd5`

## [1.4.10](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.10)

Follow-up to 1.4.9: one price button and a rebuilt sell flow on the inventory page, and an escaping fix found in a security review.

### Changed

- **Inventory & Market has one price button.** "Fetch prices" now gets the market prices and then, by itself, the sale averages of the same items. The separate "Fetch averages" button and its question are gone. While the averages come, the same button shows the progress and cancels them. It says "Prices up to date" only when both the prices and the averages are in.
- **Selling is rebuilt around one rule: Sell sells.** The amounts ("You pay" and "You receive") are worked out on the spot from the wallet's fee rule, so they are on screen the moment prices are in and change at once when you pick another strategy (average, undercut, match lowest, instant, manual). A "~" in front of a figure means it is the estimate; Steam's own exact numbers replace it as soon as they arrive. The "Calculating Steam fees" step on the Sell button is gone: it opens the one question ("N items will be listed") straight away and starts listing when you confirm. If Steam's fee calculation cannot be reached, the question says the amounts are estimates.
- **The sale has a live progress panel.** One row for every item with its state (queued, sending, listed, awaiting Steam Guard confirmation, skipped, refused), the reason Steam gave when a request is refused, a progress bar and the counters (listed, failed, left). It follows the request that is going out and stays on screen after the job ends until you close it.
- **The README opens with a security section** (all five languages): what happens to your password, Steam Guard codes and session token, where they are stored, what goes over the network and what does not, and how to check and protect yourself.

### Fixed

- **Sell no longer hangs on "Calculating".** The fee calculation had no time limit and could wait for Steam forever, and no listing could start. Every step has a limit now and the estimate takes over.
- **Pressing Sell again and again can no longer send extra requests.** The button locks while a sale runs. In the main process every listing goes through the market gate (one at a time, at least 1.5 seconds apart, in line with the price requests) and an item that is being listed, or was listed in the last 10 minutes, is refused a second time instead of being sent to Steam again.
- **Achievement names are escaped on the Overview page.** The name of the next achievement (Realistic Mode) and of the one being sent (bulk unlock) came from the game's own data and was put into the page as HTML. A crafted name could run script inside the app window. It is plain text now.

SHA-256 (`SteamEdge-v1.4.10-win-x64.rar`): `b2e1bf8b421c35061e505cb1d59ab2f0ac8e4e644f5b1cc87dbdefbe34304570`

## [1.4.9](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.9)

First of a short series about the interface. The layout now follows the size of the window, so the app looks right on a small laptop screen as well as on a large monitor.

### Fixed

- **Pages were cut off on small screens.** The content area could not get narrower than 1180 pixels, so on a 1366x768 laptop (and on any screen scaled to 125 % or 150 %) the right side of the pages was out of view. It now shrinks with the window, down to 900 x 560.
- **The window can no longer start bigger than the screen.** The default size fits the work area, the smallest size is cut to the screen, and a taskbar on the top or the left side is taken into account.
- **Tooltips stay inside the window.** The little `?` boxes were clipped by scrolling panels and ran out of the window near its edges. They are now one floating box that stays in view and turns below the sign when there is no room above it.
- The tab on the edge of the side menu stays beside the active item in compact density (it drifted away before).
- **Inventory & Market: the box at the top of the list now ticks every row in view.** It used to skip the dimmed (low value) rows, so with the default threshold it picked almost nothing. The box also shows all, some or none.
- **Inventory & Market: Shift + click ticks a range.** Click a row, then Shift + click another one, and everything between them is ticked (or cleared when that row was already ticked).
- On a narrow window the side panels of Card Farming and Inventory & Market moved under the list but squeezed the list and stretched its column headers. They are laid out correctly now.

### Changed

- **Card Farming:** a queue row that does not fit wraps its buttons onto a second line, and the filter chips wrap too. The column headers line up with the rows.
- **Inventory & Market:** the columns share the width, the Game column leaves a narrow list, the statistics and the buttons wrap, and on a short window the page scrolls as a whole while the sale bar stays in view.
- **Overview, Hour Booster, Settings:** the activity list drops the status word in a narrow panel, the Hour Booster library hides the thumbnails in a narrow column, and Settings puts the account card under the form (and turns its menu into a row of chips) when the window is narrow.
- **Top bar:** the search box gives way first; below 760 pixels the version badge goes, below 640 pixels the search box goes.
- **The side menu closes by itself** on a window narrower than 1000 pixels. The `<` button still works, and your saved choice comes back on a wide window.
- **Interface density has a new choice, Automatic, and it is the default.** It turns compact while the window is short (under about 720 pixels) and relaxes again when the window is taller. A settings file that still holds the old default (Comfortable) moves to Automatic.
- **The window remembers its size, its place and whether it was maximized** (`settings/window.json`). A place on a screen that is no longer connected is not used.
- `npm test` runs 27 tests (new: the layout of every page at five window sizes, the window place, and the inventory selection).

SHA-256 (`SteamEdge-v1.4.9-win-x64.rar`): `b4ba2a0c439f761f4bf6ef757495bd3489c7a3f4c7dea1a109c7b539c751e1ff`

## [1.4.8](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.8)

Follow-up release: the fonts ship with the app, the proxy covers the rest of the traffic, and the Keys page learns two new tricks.

### Added

- **Pass on owned keys** (Keys page). With the switch on, a key the account already owns is tried on the next connected account that has not seen it, and so on, so a spare key is not wasted. The result shows where the key went, and a key never goes round in a circle.
- **Free games from a store link** (Keys page). A Steam store link of a free game (or `app/123`) on a line of its own asks Steam for that app's free license. The result says whether it was added to the account or no license was granted (already owned, or not free).
- **Proxy server for sign-in** (Settings > Privacy & security). Adding an account and signing in can go through a proxy of their own, because an account's own proxy is only known once it is signed in. The address is kept as plain text in the settings file and is not part of the settings export.

### Changed

- **The fonts are inside the app.** Geist and Geist Mono (SIL Open Font License, about 125 KB for all eight files) load from the app's own files instead of Google Fonts, so the pages ask no font server for anything, work offline and no longer tell Google that you opened the app. The font credit is in `NOTICE`, the license text next to the fonts.
- **The proxy now covers the rest.** While an account is on screen, the page images, the market fee script download and the update check go through its proxy too. The window talks to a small proxy on 127.0.0.1 that carries on to your proxy with its login, which also makes a SOCKS5 login work for the images.
- The README and the tutorial describe the lists, favorites, CSV export, schedules, key forwarding and the wider proxy coverage in all six languages.
- `npm test` runs 24 tests (new: local proxy, window proxy, fonts, key forwarding, free licenses).


SHA-256 (`SteamEdge-v1.4.8-win-x64.rar`): `9c749c51b822475b52c33e68b594b30e54fc61e83e794baeee5fece86bc2fd0d`

## [1.4.7](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.7)

Convenience release: a refund window filter, favorite games, an inventory CSV export and a schedule for Realistic Mode.

### Added

- **Skip games in the refund window** (Card Farming page, and Settings > Card farming). Games bought in the last 14 days and played under 2 hours are left out of the card queue, because Steam keeps the right to a refund for them up to that hour limit and farming cards would end it. The purchase date is read from your Steam license records; if it cannot be read, no game is skipped. The card schedule follows the same filter. It is off by default.
- **Favorite games.** A star on a game in the Hour Booster library, the Achievements game list and the Realistic Mode search puts it at the top of those lists; in Realistic Mode an empty search shows your starred games. Favorites belong to the account.
- **Export CSV** (Inventory & Market). Writes the items the page shows to a CSV file you choose: name, game, type, quantity, marketable, tradable, the lowest and median price already fetched, the unit value and the value of the stack. Column names are always English, and names that start like a formula are marked so a spreadsheet does not run them.
- **Realistic Mode schedule** (Settings > Achievements). Realistic Mode starts by itself inside its own time range on every connected account, repeating that account's last start made by hand (games, duration, options). The run is cut to what is left of the range and stops when the range closes. A run started by hand is never stopped, an account with something else running is left alone, and an account with no saved start gets a note in the activity feed.

### Changed

- The tutorial describes the four features and their settings in all six languages.
- `npm test` runs 19 tests (new: CSV, the Realistic Mode schedule, the recent purchase lookup, favorites, the refund filter and the export button).


SHA-256 (`SteamEdge-v1.4.7-win-x64.rar`): `ab40188b70189e4bc179aaa2cefb9a878a3b36d302b00a737341bdb4a4ad04cc`

## [1.4.6](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.6)

Fix release: the hour sync and the achievement interval no longer get in the way of each other.

### Fixed

- **Hour sync with a single game.** With "Level the playtimes" on, the duration and the "Concurrent limit" controls were locked even when only one game was selected, although there is nothing to level with one game. Now the lock only applies when the sync has something to equalise: two or more games for the "Highest of the selected" target. With one game a note explains it and the duration and limit stay free; a manual hour target or the library's highest still works for a single game. The switch is on by default, so two or more games sync without a trip to the settings.
- **Hour sync opened games in groups of 3.** The parallel sync used the leftover "Concurrent limit" value from an earlier choice (for example 3) even though the page locked that control and promised up to 32, and the page sent only that many games to the sync. It now takes every selected game and runs up to Steam's 32 together; a game that reaches the target drops out and the next one joins.
- **Unlock interval choices.** The list jumped from 1 second to 1 minute and carried eleven odd steps. It is now 15, 30 and 45 seconds, 1, 2, 5, 10 and 30 minutes and 1 hour; the 1 second choice is gone. A saved value moves to the nearest new choice, and the default is 15 seconds.

### Changed

- "Hide game name" is greyed out while "Appear offline" is on, because the name is not visible then anyway.
- The unlock interval tooltip says that while farming cards "Unlock achievements" works at most once a minute.
- The tutorial describes the hour sync, the interval choices and the two settings rows in all six languages.
- The tests moved into the project: `npm test` runs 16 unit and integration tests (`tests/`).


SHA-256 (`SteamEdge-v1.4.6-win-x64.rar`): `24b2bc9fe3cf329b7c3e4b8e107004b22c15f1d5b32757570eb825cdafec87b8`

## [1.4.5](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.5)

Card queue release: a permanent blacklist, a whitelist mode, and a way to chain card farming into hour boosting.

### Added

- **Blacklist** (Card Farming page). The red button on a queue row puts a game on the blacklist; it is never farmed, by hand or by the schedule, until you take it off in the new **Blacklist** tab. The list belongs to the account.
- **Whitelist and "Whitelist only".** The star on a queue row puts a game on the whitelist, and with **Whitelist only** switched on (Automation box) only the starred games farm. The queue shows a notice while the mode is on, and the schedule follows it too.
- **Start hour boosting** as a choice for "When all cards are collected" (Settings > Card farming). When an account's cards are done, its remembered hour boosting list starts, limited to the "Max games at once" setting. With an empty list nothing starts and the activity feed says so.

### Fixed

- **The removed-games list no longer expires.** Games taken out of the queue were kept with the queue state, which is cleaned after the data retention period (90 days by default): after that many days without a change they silently came back into the queue. They now live in the blacklist, which never expires; games removed before this version are moved there automatically.

### Changed

- The tutorial describes the lists and the new choice in all six languages.


SHA-256 (`SteamEdge-v1.4.5-win-x64.rar`): `7784f3eb011e7e143e8ae5299ecfc931e391dbee63e2d75a08e0545579516112`

## [1.4.4](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.4)

Hardening release: a Content-Security-Policy for the app pages and a locked app window.

### Added

- **Content-Security-Policy.** Both pages (login and main) now declare which sources they may load: the app's own files, Google Fonts and https images, and nothing else. No other connections, frames or objects.

### Changed

- The app window no longer opens popups and never navigates away from its own pages, so injected markup could neither load a web page nor send data to another host.
- The tooltips of the Family View PIN and Proxy server settings now say that the values are encrypted while **Encrypt login tokens** is on, instead of calling them plain text.


SHA-256 (`SteamEdge-v1.4.4-win-x64.rar`): `35dd7ee5bfd42e56c3b5a63dd854243c676faa7ccb36ce125f0a1882b8afd78a`

## [1.4.3](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.3)

Security and operations release: encrypted login tokens, a card farming schedule and a proxy for each account.

### Added

- **Encrypt login tokens** (Settings > Privacy & security). The saved sign-in tokens in `settings/accounts.json` and `settings/session.json` are stored encrypted with Windows DPAPI, so a copy of the folder is useless on another computer or under another Windows user. Turning it on rewrites both files and deletes the `.bak` copies that still held plain text. It is off by default and is not part of the settings export. An account whose token was sealed for another user or computer asks for a fresh sign-in instead of failing silently.
- **Card farming schedule** (Settings > Card farming). Card farming starts by itself on every connected account when a time range opens and the farms it started stop when it closes. The range can pass midnight. The queue is built like a manual start. A farm you started by hand is never stopped by the schedule, and stopping one by hand inside the range keeps it stopped until the next range.
- **Proxy server** (Settings > Privacy & security). Each account can use its own `http://`, `https://` or `socks5://` proxy, with optional `user:password@`. The account's Steam connection and its market, inventory and key requests go through it; with SOCKS5 the proxy resolves host names. A proxy that is down stops the account from connecting rather than falling back to a direct connection. The sign-in itself, update checks, the fee script download and item images stay direct. The password is stored in plain text in the account's file.

### Changed

- Tutorial and README describe the three features; the file layout notes cover token protection.


SHA-256 (`SteamEdge-v1.4.3-win-x64.rar`): `4d661abc5f52a72c519c1fa022cdc36e619c709d17ddb62208d3312bafef4c11`

## [1.4.2](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.2)

Market and account tools release: a product key queue, your own market listings with the option to take them back, booster pack and gem types with opening, and Family View support.

### Added

- **Keys page.** Paste a list of product keys (one per line, or game name, Tab, key) and they are redeemed one at a time in the background, even while another page is open. Every key gets a result: redeemed, already owned, region locked, invalid, already used, base game required, or the code Steam sent. When Steam's hourly limit is reached the queue waits an hour and carries on by itself. The queue and the results are saved per account.
- **My listings** (Inventory & Market). Shows your active market listings, the ones waiting for confirmation and the ones on hold, and takes selected active listings back. Cancelling a listing used to mean opening Steam.
- **Booster packs and gems** have their own item types in the inventory filter, and a booster pack can be opened from the detail panel.
- **Family View PIN** (Settings > Privacy & security). With Family View on, Steam refuses web pages until the PIN is entered, so the inventory, market and badge pages stayed empty. The PIN is stored per account in plain text, is never exported, and unlocks every new web session.

### Changed

- Tutorial and README describe the new pages; the file layout notes the key queue in the account file.

## [1.4.1](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.1)

Card farming options release: the card drop threshold is now a setting, there are two new queue orders, and farming can leave out unplayed games or close the app when it is done.

### Added

- **Card drop threshold** (Settings > Card farming). Steam only holds back cards until a game passes a certain playtime on accounts with restricted card drops, usually 2 hours. The value Fast mode warms games up to was hidden in the settings file; it is now a setting, and `0` skips the warm-up for accounts that get cards from the first minutes.
- **Least played first / Most played first.** Two new queue orders for card farming, available on the Card Farming page and as the default mode in Settings.
- **Skip games that were never played.** Leaves games with no recorded playtime out of the queue.
- **When all cards are collected.** Choose between doing nothing and closing the app. Closing waits 20 seconds and only happens when no other account has a job running.

### Changed

- **Fast mode text and warnings.** The hint and the start message no longer say "2 hours" as if it were fixed, and the hint now warns that a newly bought game can no longer be refunded once it passes 2 hours.
- **Tutorial and README** now say the playtime threshold applies to accounts with restricted card drops and is something to test on your own account, instead of presenting it as a rule for everyone.
- **Code leftovers in English.** The learned list of games without achievements moved from `cache/basarimsiz.json` to `cache/no-achievements.json` (the old file is renamed on first start, nothing is lost), the settings export defaults to `steamedge-settings-*.json`, and every code comment is English now (quoted interface labels in comments use the English names).

## [1.4.0](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.4.0)

Code cleanup release: the whole source code is now in English. No feature changes, and the interface language is unchanged.

### Changed

- **Source code in English.** Identifiers, comments, log messages, element ids, IPC channel names, setting keys, file names and the build scripts are all English now, so contributors who do not read Turkish can follow the code. The interface text still starts from Turkish and keeps its five translations.
- **npm scripts renamed.** `npm run dogrula` is now `npm run verify`, and `npm run dil` is now `npm run lang`. Their output is in English too.
- **Stored files are migrated.** Settings, statistics, saved state and cache files written by older versions have their keys (and a few values) renamed the first time they are read. There is nothing to do on your side. Going back to 1.3.x afterwards is not supported, because older versions do not know the new keys; copy your `settings/` folder first if you want a way back.

## [1.3.3](https://github.com/Miabeyefendi/SteamEdge/compare/1.3.2...1.4.0)

Never published as a release of its own: these changes ship as part of 1.4.0. New installs start in English, and about forty pieces of text that stayed Turkish in English, German, Spanish, Chinese and Russian are translated.

### Changed

- **New installs start in English.** An existing install keeps the language saved in its settings, so nothing changes if you already use SteamEdge. The language is still chosen in Settings > General.

### Fixed

- **The sign-in screen was partly Turkish.** Status messages such as "Connecting..." and "Enter the code.", the Steam Guard labels, the Add button, the extra account tag and the "signed in, preparing..." line had no translation. A rejected Steam Guard code is reported in your language too.
- **Achievements, inventory and card farming.** The Legendary and Ultra rare tiers, the Lock and Lock all buttons, the Background and Coupon inventory types, the running indicator, the inventory refresh message and "No games match this filter." are translated.
- **The empty library explanation was unreadable.** When Steam returns no games because the profile's Game details are private, the app explains how to fix it. That explanation was Turkish written without Turkish letters; it is now written properly and translated.
- **Realistic Mode results on background accounts.** When Realistic Mode finished on an account that was not on screen, its activity feed entry stayed Turkish.
- **The Details button on the Overview** read "Detay: Kart" in every language.
- **Connection strip.** A connection drop found by the heartbeat check showed its reason in Turkish.
- **Data recovery dialog.** The names of recovered files ("Saved accounts", "Saved state") stayed Turkish.
- **Language audit.** `npm run dil` now also checks the scripts inside the HTML pages, where the sign-in screen's text lives. Most of the sign-in text above was missed because of this.

## [1.3.2](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.3.2)

Security update: Electron 41 and patched build tools. No feature changes.

### Fixed

- **Electron 39 had five high severity advisories.** Popups and windows opened from sandboxed pages could drop the sandbox, file and HTTP handlers allowed cross-origin reads, and `<webview>` could enable Node.js in workers. SteamEdge moves to Electron 41.10.7, where all five are fixed. Electron 41 also drops the old download chain (`@electron/get`, `got`, `extract-zip`), which removes about sixty build-time packages.
- **Build-time advisories.** `undici` (six advisories) and `brace-expansion` (one) are only used by the packager and never ship in the app; both are pinned to patched versions through `overrides`. `ip-address`, used by the Steam connection's proxy support, moves to 10.7.3.
- **Two code scanning warnings.** The plural form picker strips markup from a value to find its number; the stripping now also removes stray angle brackets. The value was never written back as HTML, so this closes a warning rather than a hole.

## [1.3.1](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.3.1)

Three fixes on top of the new themes.

### Fixed

- **Saving a theme change threw you out of Settings.** Switching away from Midnight Purple or White reloads the page, and the reload landed on the Overview. It now returns to the Settings section you were on, the same way a language change does.
- **The sidebar collapse tab stayed black in the White theme.** Icons that carry their colour in SVG `fill` and `stroke` attributes were not recoloured; they are now.
- **The login screenshots showed an old version and untranslated QR labels.** The README images were taken with a test version number and before "QR code" and "Refresh code" were translated. Retaken.

## [1.3.0](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.3.0)

Settings that wait for Save and then reach running jobs at once, selling that follows Steam's own fee rules and stops honestly at Steam's limit, statistics per account, a translation pass over all five languages, and a window that opens about twice as fast.

### Fixed

- **Card farming looped on the last game.** When every game in the queue was out of cards, or "Move to the next game" was off, the farmer kept restarting the same game. It now stops and says why.
- **Listing prices drifted from the price you picked.** The app subtracted a fixed 13% fee, but Steam charges a minimum fee per side, so cheap cards were listed 10-67% off the chosen price. The fee is now computed by Steam's own script (`economy_common.js`), downloaded from Steam's CDN and run in a hidden, sandboxed window with no Node access, no cookies and no navigation. The price you pick is the price buyers see.
- **Bulk selling kept going after Steam stopped it.** Steam limits listings per account: new accounts can be stopped after 10-15 listings, older ones can list 80 or more. When Steam refuses a listing the run now stops and the dialog says what Steam returned. Settings > Market has a batch size (default 50) and a wait between batches; with no wait set, you are asked after each batch.
- **Selling asked you to type SAT to confirm.** The typed step is gone. If the mobile authenticator is on, the result tells you how many listings are waiting for confirmation in the Steam app.
- **Windows-style alert boxes.** The last native pop-ups (account switch errors, empty selections, the test notification, selling results) use the app's own dialogs now.
- **Settings were saved before you pressed Save.** Some controls wrote to disk the moment they changed. The page now keeps a draft; Save writes only what changed, and leaving with unsaved changes asks first.
- **Saved settings did not reach running jobs.** Card farming and the Hour Booster now pause for about five seconds after Save and resume from the same game and position with the new values.
- **Reset switched the language to Turkish.** Reset loads the defaults into the page, keeps the app language, and applies nothing until Save.
- **Dependent settings stayed active when their parent was off.** Every option that only works with another one enabled is now greyed out with a note saying which switch it depends on.
- **"Connected" and "Last sync" in Settings were not live.** Both now come from the actual connection state of the account on screen.
- **Price-drop alerts were silent or wrong.** The alert compared two price samples and was tied to error notifications, so turning those off muted it. It now fires when the lowest listing is at least the threshold in Settings > Market (default 10%) below Steam's 24-hour average, at most once a day per item, and shows in red.
- **Card farming and the Hour Booster stopped each other's games.** Starting one replaced the list of games Steam saw as running. Each job now keeps its own set and the union is sent to Steam, capped at Steam's limit of 32.
- **Reconnecting after a dropped connection.** SteamEdge now runs its own reconnect loop with the limit from Settings (unlimited, 10, 3 or off). When Steam ends the session for good, for example because the account signed in elsewhere, it stops retrying, says so, and offers a Reconnect button.
- **Text from the main process stayed Turkish.** The tray menu, file dialogs, desktop notifications, startup warnings and error messages returned to the interface now follow the app language.
- **Translation.** German uses "Errungenschaften" throughout; about 35 Spanish strings had lost their accents; Chinese uses one term for card farming and the real tab names; Russian and Chinese terms are consistent. Timer and unit labels (MIN, SEC, min, s) were Turkish in every language. Percentages are written the local way (12% instead of %12). Counts use plural forms ("1 game", "2 games"; three forms in Russian). Where a language orders a sentence differently, values no longer swap places ("5 listings from $0.10" used to come out as "$0.10 listings from 5"). The Realistic Mode summary is translated as one sentence instead of four fragments.
- **The price filter showed ₺ on every account.** It now uses the account's wallet currency.
- **Two tooltips promised something the app does not do.** "Prevent sleep" does not stop the screen from locking, and "Start with Windows" opens the window rather than starting hidden in the tray. Both now describe what actually happens.
- **Realistic Mode's unlock time wrapped onto a second line.**

### Changed

- **The window opens about 0.65 s sooner.** The Steam libraries took about 0.8 s to load before the window could appear. They now load when first needed, after the window is on screen.
- **Statistics are per account.** Best day, average sale price and longest uninterrupted run are new; the Overview and Settings show the totals of the account on screen. Backups now include each account's statistics, Hour Booster list and Realistic Mode queue and presets.
- **Settings reorganised.** Reconnecting and retrying are one setting; log level and debug logging are one select; the session timeout moved to Advanced; shuffling applies only to sequential idling; a set Hour Booster duration stops when it runs out and Unlimited runs until you stop it; the market request interval can be changed, since Steam's limit differs per account; fast card farming runs up to 32 games at once by default.
- **123 unused dictionary entries removed.** The language check now also looks at text without Turkish letters, the main window shell, and whether every translation carries all the values of its source text.

## [1.2.0](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.2.0)

A vector logo, a language switch that stays where you left it, the first big cut into the untranslated text, and eleven dependency advisories closed.

### Fixed

- **Eleven Dependabot advisories closed.** `@xmldom/xmldom` (nine high, two moderate; only used by the packager, never shipped in the exe) moves to 0.9.12, and `adm-zip` (one high, one moderate; used by `steam-user` for CDN compression, so this one does ship) moves to 0.6.1. Both through `overrides` in package.json, since neither is a direct dependency. The two that remain, `extract-zip` and Electron itself, have no fixed release yet and are build-time only; they wait.
- **The CI build failed at the zip step.** The build output moved from the parent folder to `releases/` in 1.1.11 and the workflow was still zipping the old location. The build itself was fine; only the verification artifact was lost.
- **Changing the app language threw you back to the Overview.** The switch reloads the page because a translated screen cannot be translated back, and the reload always landed on the first tab. The open Settings section is now carried across the reload, so you pick a language and stay in Settings, on the same section, reading it in the new language.
- **Status badges, feed entries and figures stayed Turkish in every other language.** RUNNING, STOPPED, MESSAGE, "Steam message · name", "Started with 5 games", session time, next drop, the system indicator at the bottom of the sidebar, update dialogs, the account removal and sign-out prompts, backup and reset messages, and the Windows notifications. Text that is built in code with a number in it went past the translator, which only looks at finished text; those strings are now translated as templates before the number is filled in. 157 entries added to each of the five dictionaries; the count of untranslated code strings drops from 381 to 260. The rest is on the Inventory, Achievements, Realistic Mode, Hour Booster and Card Farming pages and follows in the next releases.
- **Fourteen labels the language check could not see.** "Account no.", "Copy IDs", "Target hours", "Speed", "AUTO", "None", the hours suffix in Realistic Mode and a few more are plain ASCII, so the check that looks for Turkish letters walked past them. Found by rendering the English interface and listing what stayed Turkish; all translated now. One Hour Booster tooltip had drifted from its dictionary entry and showed Turkish; re-keyed.

### Changed

- **The logo is a vector.** The header and the login screen drew a 186 pixel PNG scaled down, blurry on any high resolution display. Both now load a 2 KB SVG straight from the design file, sharp at any size. The unused banner PNG is gone.
- **README screenshots.** Ten screens of the current interface replace the single image from 1.0.5, which predated Realistic Mode, the active task panel and chat. The Overview leads, the other nine follow in a grid, in all five README languages.

## [1.1.10](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.10)

Layout fixes across four screens, and three achievement settings that were quietly overruling each other.

### Fixed

- **A Realistic Mode row rendered one letter per line, and the panel scrolled sideways.** Two separate causes. The "Set the duration from the settings" row had been added inside the next row's still-open `<div>`, so one row held three flex children instead of two and the labels were squeezed to a character wide. Separately, the tooltip bubble is 264 pixels wide and absolutely positioned, and an absolutely positioned box still counts towards its scrolling ancestor's width, so the side column grew a horizontal scrollbar it was never meant to have. The rows are siblings now, tooltips in narrow columns open leftwards, the column clips horizontally, and labels beside a tooltip are allowed to wrap instead of refusing to shrink. Measured at 1200, 1400 and 1716 pixels: no overflow left on any of the six tabs.
- **The 100% completion time box was narrower than everything below it.** It was an input and a "hours" label sitting side by side, so it lost the label's width against the full-width dropdowns beneath it. The unit sits inside the field now and the box matches.
- **Two Details buttons for one task.** The active task row carried its own Details button that did exactly what the one at the bottom of the panel does. The one in the row is gone; the one by Start and Stop already follows whichever task the arrows are showing.
- **The icons in the task detail rows were three different sizes.** They were Unicode characters, and the font sized and baselined each one differently: small, uneven, and hard to identify at all on a high resolution display. They are inline SVG now, one 16 pixel frame and one stroke weight for all of them.
- **The unlock interval was ignored unless safe mode was on.** With safe mode off every achievement went out in a single request, so an interval of 55 minutes unlocked the lot in about a second. The interval now always applies and achievements always go one at a time. Safe mode is what decides whether that interval is randomised: off means the exact interval, on means it varies around it, and "Spread unlocks over time" widens that variation. Three settings, three separate effects, none of them silently overruling another. The confirmation dialog now spells out the interval and the estimated total before you start.
- **"Repeat the queue" did nothing outside sequential mode.** There is no queue when games run in parallel, so the switch was inert but looked live. It is dimmed and inactive while sequential idling is off, and says why. Same for "Spread unlocks over time" while safe mode is off.
- **`npm run dogrula` counted `<div>` inside comments.** A comment that mentions markup, or a block commented out, made a balanced file look broken. Comments are stripped before counting.

### Changed

- **The active task panel is larger and better packed.** Cover art goes from 85x40 to 116x54, the title and the figures grow, the progress bar goes from 6 to 8 pixels and now carries its own percentage. Where a task knows when it started, the row shows the time, in whichever clock format is set.
- **The Achievements toolbar starts with the game.** Game names are long and you have to pick one before anything else on the screen means much, so it is first and it is the widest field. Achievement search follows it, shorter, with a placeholder to match. The filter and sort dropdowns are wider.
- **Sorting has a direction.** A single button next to the sort dropdown, with an arrow that shows which way the list runs. It is inert on the default order, which has no direction. Date starts newest first and rarity starts rarest first, because that is the order you want to see first; the button flips either.
- **The Inventory toolbar matches the Achievements one:** game first, then search. The two screens used to put the same two controls in opposite places.

## [1.1.9](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.9)

The login screen no longer describes an app from nine releases ago, and the maFile step that did nothing is gone.

### Removed

- **maFile.** Signing in used to interrupt itself to ask for a code sent to your phone, so it could write a mobile authenticator file. That file was never read back: nothing in the app generated Steam Guard codes from it and nothing used it to confirm anything. `steam-totp` was listed as a dependency and never imported. The prompt, the skip link behind it, the three IPC channels, the generate, finalise and import paths, and the dependency are all gone. Signing in is now QR or password and nothing else. If a maFile was written next to your settings it is simply unused; deleting it changes nothing.

### Fixed

- **The login screen said `v1.0.8`.** The version was typed into the page by hand and never updated. It reads from the package version now, the same source as everywhere else.
- **The login screen was never checked by the translation audit.** It sits outside `src/main/pages/`, so it had gone unscanned since the audit was written. Adding it found four untranslated strings straight away, including the window title, which was never translated at all because the translator only walks the page body. The title is handled explicitly now. Six entries added across all five languages.
- **A sentence was split around a bold word and only half of it was translated.** The QR instructions put `Steam Guard` in bold, which cut the sentence into two dictionary entries; one was translated, the other stayed Turkish, and the pattern cannot survive translation anyway since each language puts the name somewhere different. It is one sentence now.

### Changed

- The login screen describes the whole app rather than card farming alone: "Cards, hours, achievements and the market", not "card farming, inventory and market". The eyebrow above it read "Steam card farming package", which stopped being true around 1.0.3.
- The credits no longer list `steam-totp` among the packages the app uses, and the ArchiSteamFarm entry no longer credits it for the maFile idea, since that idea is no longer in the app. What it did inspire, running several accounts at once, still stands.

## [1.1.8](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.8)

Raw JavaScript errors no longer land on your screen mid-game, the active task panel shows the task you are actually looking at, and the dictionary moved out of the code.

### Fixed

- **Uncaught errors were shown to you as maFile notifications.** The safety net that keeps a `steam-totp` failure from killing the app was catching everything and routing all of it to one place: any error anywhere in the main process arrived on screen as `maFile atlandı:` followed by a raw JavaScript error string. It shows up while you are playing, and it says nothing useful. Only errors during an actual maFile operation reach that notification now, with a message a person can read. Everything else goes to the log, and it goes there whether or not debug logging is on, so there is something to read the next time instead of nothing.
- **The active task panel showed the card queue no matter which task you were on.** With two jobs running you page between them with the arrows, the top row changed and the box underneath did not: it was hard-wired to card farming. Looking at an achievement run with an empty card queue, the panel said "the queue is empty" underneath. That box now follows the task on screen. Card farming shows the queue as before; the Hour Booster shows the games it is holding open, on the shared timeline the booster page uses; Realistic Mode shows what unlocks next and when, plus how much of the session is left; an achievement run shows the achievement being sent, the counter and an estimate of the time remaining. Every row carries its own progress bar.
- **A Steam error could arrive in a language you do not speak.** Pressing refresh repeatedly hits Steam's rate limit, and Steam localises its own error text. That is where the Chinese notification in a Turkish interface came from: not the dictionary, which was clean, but Steam. Every community and market request is now pinned to English through both the `Steam_Language` cookie and an `l=english` parameter, and a Steam-supplied message written in an alphabet the app did not ask for is replaced with our own text rather than passed through.
- **`esc()` did not escape quotes.** It handled `&`, `<` and `>`, but its output is used inside HTML attributes throughout the app, where a `"` in the value escapes the attribute. Reported by code scanning against the chat avatar; the one-line fix covers every call site.

### Changed

- **The dictionary lives in `src/main/js/lang/<code>.json`, one file per language.** It used to be six dictionaries in a single 288 KB script, in nineteen blocks appended one release at a time, and all six loaded whether you needed them or not. Only the selected language is read now. The immediate benefit is not speed, it is that adding a language is adding a file, and that the audit reads JSON instead of parsing JavaScript with a hand-written parser that could not see computed keys. Two entries were skipped when Russian was added for exactly that reason. `i18n.js` is 132 lines and holds only the translation logic.
- **`npm run build` refuses to package without the dictionaries.** They reach the archive through a deny list, so a missing file would not fail the build: the app would just open in Turkish and nobody would notice. It is checked before packaging now, the same as the locale trimming guard.
- **The CI workflow was broken in two ways and is fixed.** It triggered on `v*` tags while releases are tagged without the `v`, and it looked for an output folder named `Release V*`, a name that has not existed since the repository was renamed. It now runs the static checks and the language audit as well.

### Update note

Ten gigabytes of old build folders and backups were cleared out of the working tree, and the build now lives inside its own backup rather than beside the source. This changes nothing about the app; it is noted because the release archives for 1.0.5 through 1.1.6 are only on the releases page from here on.

## [1.1.7](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.7)

Steam chat comes to the app, and the interface speaks Russian.

### Added

- **Chat.** A Chat button sits at the top right and opens a two-column screen: your friend list on the left, the conversation on the right. Messages are sent and received over the Steam network protocol, the same one everything else here runs on, so the Steam client is still not needed. Friends come back sorted with the online ones first, unread counts show as a badge on the row, and the top bar carries its own badge so a message that lands while you are on another tab does not go unnoticed. Enter sends, Shift+Enter starts a new line, and the person you are writing to sees the typing indicator. Opening a conversation marks it read on Steam. Group chats are out of scope: they are a separate concept in the protocol and want a screen of their own.
- **Russian interface.** The sixth language, and the first added since the app shipped. 707 entries, every one of them checked against the other five so no screen falls back to Turkish half way through.

### Changed

- **`npm run dil` gained a check for text that lives in JavaScript.** The audit only ever read the page HTML, so every dialog, toast and empty-state message written inside a page script was invisible to it. That blind spot is now measured: 379 such strings have no dictionary entry and stay Turkish in the other five languages. Seven of them were visible on the main tabs and are translated in this release; the rest are counted and reported rather than quietly ignored.
- **The audit understands Cyrillic.** Its wrong-alphabet check treated any Cyrillic value as an error, which was correct until this release. It now expects Cyrillic in the Russian block and flags the reverse instead: a Russian entry left sitting in Latin script, which is what an untranslated entry looks like.
- Two long tooltips, the hardware acceleration one and the update warning, are stored under computed keys the audit's parser cannot read, so the Russian pass skipped them. They are translated, and a runtime test now compares the dictionaries as the app actually loads them rather than as the file parses.

## [1.1.6](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.6)

Stop the interface drawing when you are not looking at it, so a fullscreen game keeps its frame rate, and expose the graphics knobs that used to be compiled in.

### Added

- **Stop drawing when unfocused.** Chromium only throttles a window that is hidden or covered. A window sitting on screen without focus keeps repainting every second and keeps its animations spinning, and that is enough to cost a fullscreen game its presentation path: the desktop compositor takes it back and the frame rate drops. Measured on Dota 2 under Vulkan, with SteamEdge reading 0% GPU the whole time, which is the point. The per-second updates and every running animation now stop the moment the window loses focus and resume when it returns. Background work, farming, syncing, unlocking, is untouched. On by default, switchable in Settings.
- **Graphics backend.** Chromium draws through Direct3D 11 on Windows, and some Intel and older AMD drivers stall on that path. You can now pick Direct3D 9 or OpenGL instead of waiting for a driver update.
- **GPU compositing switch.** Turn it off and the window's frames are composited on the processor, leaving the graphics card entirely to whatever you are playing, for a few points of CPU.
- **Clear the image cache.** Cover art and downloaded page assets build up over a long session. The button drops them from memory and disk and reports how much came back. Nothing else is touched: no settings, no session, no statistics.

### Fixed

- **Settings that need a restart now say so.** Hardware acceleration is handed to Chromium before the app finishes starting, so changing it did nothing until the next launch, silently. It, the new graphics backend and the compositing switch all report what they are waiting for.

### Changed

- The disk cache is capped at 50 MB. It had no practical limit, and a large library fills it with cover art.
- **`npm run dogrula` gained two checks.** One lists settings keys that are defined but never read anywhere: that is how the dead "ignore updates" switch was found by hand in 1.1.2, and it will not need finding by hand again. The other matches every IPC channel the preload opens against what the main process actually answers, in both directions. Both report clean: 108 keys all used, 74 calls and 15 events all answered.

### Update note

Memory was measured before and after and did not move: 442.7 MB against 446.8 MB after visiting every tab in a synthetic session. Forcing garbage collection returns three megabytes of eighty-eight, so what is held is Chromium's own per-page rendering state rather than anything leaking. The cache cap and the clear button are real, but their effect only shows against a real Steam library with real cover art, which the test harness has no network to fetch.

## [1.1.5](https://github.com/Miabeyefendi/SteamEdge/releases/tag/1.1.5)

Interface fixes from testing, a queue that lets you drop one game instead of all of them, and a language audit that found every untranslated string in the app.

### Added

- **Remove one game from the Hours Booster queue.** There was only Clear queue, so dropping a single game meant rebuilding the whole selection. Each row now carries a minus button, matching Realistic Mode. It is refused while a session is running, because the engine was started with that list and editing only the screen would put the two out of step.
- **The session length follows the settings.** Change the completion time, the difficulty or the game type and the duration is recalculated along with the target: how long a real player would need to earn what you are behind by, clamped between fifteen minutes and twelve hours. Type a duration by hand and automatic assignment stands down for that session. There is a switch for it in the advanced panel.
- **`npm run dil`, a language audit.** Reports dictionary size per language, keys present in one language and missing in another, entries whose translation is identical to the source, values written in the wrong alphabet, whether the Chinese is consistently one variant, and every visible Turkish string in the pages that has no dictionary entry at all. It knows about the runtime's number normalisation, so `7 days` and `30 days` count as one entry rather than two gaps.

### Fixed

- **Twenty-two interface strings had no translation.** They stayed Turkish in English, German, Spanish and Chinese: the whole speed section of Realistic Mode, several settings labels, the market and hours-sync controls. All four languages now cover them, and the audit reports the app clean.
- **The 100% completion time appeared in two places.** 1.1.4 put a labelled box on the main panel while the old `Tc` field stayed in the advanced panel, both writing the same value, neither showing which one was in charge. The advanced copy is gone.
- **Labels in the right panel spilled out of their row.** A label sitting next to a switch is a flex item, and a flex item does not shrink below its content by default, so long Turkish labels pushed the row wider than the 352 pixel column. They wrap now. Tooltips in the narrow panels are anchored to the right rather than centred, so a hidden tooltip no longer extends past the panel edge.

### Changed

- The dictionary is written in one style again. One block had been generated as JSON, with quoted language keys, which the new audit could not read and which no other block used.

### Update note

Below roughly 1390 pixels of window width the page still scrolls sideways. That is the layout's declared minimum content width, not a regression, and lifting it belongs with the page rebuild rather than a patch.

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
