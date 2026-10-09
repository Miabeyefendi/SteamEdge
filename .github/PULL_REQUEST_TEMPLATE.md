<!--
Thanks for contributing. Please read CONTRIBUTING.md first.
By opening this pull request you confirm the contribution is your own work and
that you license it under AGPL-3.0-or-later.
-->

## What does this change?

<!-- One or two sentences. If it fixes an issue, write "Fixes #123". -->

## Why?

<!-- The problem behind the change. -->

## Type

- [ ] Bug fix
- [ ] New feature
- [ ] Translation
- [ ] Documentation
- [ ] Refactor / cleanup

## How was it tested?

<!--
Say what you actually ran. "npm start, farmed for 20 minutes on two accounts,
cards still dropped" is worth more than "looks fine".
-->

- [ ] `npm start` runs with no console errors
- [ ] `npm run verify` and `npm run lang` pass
- [ ] I tested the affected screen by hand
- [ ] Existing behaviour on other screens is unchanged

## Checklist

- [ ] Code follows the style of the surrounding file (2-space indent) and is written in English (identifiers, comments, log messages); only user-facing text is Turkish
- [ ] No em dashes anywhere in code, comments, or UI strings
- [ ] New UI strings are added to all five dictionaries in `src/main/js/lang/` (`en`, `de`, `es`, `zh`, `ru`)
- [ ] Visual changes checked in all three themes (Dark, Midnight Purple, White)
- [ ] A renamed stored key has its old name added to `src/core/keyMigration.js`
- [ ] No secrets, tokens, `settings/` files, or personal Steam data included
- [ ] No new runtime dependency added without saying why below

## Screenshots

<!-- For any visual change. Before and after if you can. -->
