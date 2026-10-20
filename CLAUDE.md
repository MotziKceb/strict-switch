# Working on Strict Switch

Strict Switch is a Chromium (Manifest V3) tracker-blocking extension. Read `README.md`, `ROADMAP.md` (especially "Ground rules"), `PRIVACY.md` and `tests/` before changing behaviour.

**If a `HANDOFF.md` exists in the repo folder, read it first.** It is the maintainer's private working notes (project state, maps, how it was built and tested, decisions, open items). It is deliberately NOT in git (it is in `.gitignore`): never commit it, and never copy its contents into public files, commit messages or PRs. Keep it up to date locally when those things change.

## Writing

- **Never use em dashes.** Use " - " (space, hyphen, space) instead. This applies everywhere: code comments, UI text, docs, commit messages and PR descriptions.
- Plain language in the UI. Facts over opinions, no jargon. Deeper detail only for those who click for it (a collapsible section, a separate page).

## The four principles

Every feature is weighed against these (see `ROADMAP.md`):

- **Convenience:** one click to change a site's level, sensible defaults, no setup.
- **Control:** strict by default, opened up on demand: per site, per company, per category.
- **Transparency:** every block and every exception is visible, explained in plain language, and reportable.
- **Friendliness:** plain words over jargon.

## Ground rules

- **No network access.** The manifest's content security policy (`connect-src 'self'`) stops extension pages and the background worker from contacting any server. Content scripts are not covered by that policy, so they must never use network APIs either; `tests/rules.test.js` scans them. Data (tracker lists, autoconsent) is bundled with each release, never fetched.
- **Broad permissions are only ever opt-in.** Anything that reads web pages is an optional permission requested at runtime when the user switches the feature on, and handed back when the lease ends (see "Permission lease and reminder" in `ROADMAP.md`).
- **Hands off browser settings.** Never read or change browser settings the extension doesn't strictly need. Explain them and open the settings page; the user decides.
- **Every block or allow is explained in the activity log**, including cookie banners handled and settings changes.

## Tests

- Run `npm test`. Locally you may need `CHROMIUM_PATH=/opt/pw-browsers/chromium npm test`.
- `tests/rules.test.js` pins the exact permission list (required and optional). Changing permissions is a deliberate decision: update that test in the same change and say why.
- Browser tests run the real extension in headless Chromium against a local server that plays every site (`tests/helpers.js`).

## Releasing

- Bump `version` in `manifest.json` and merge to `main`. The Release workflow runs the tests, then packages and publishes a GitHub release for any version not yet released.
- Commits written with Claude carry a `Co-Authored-By: Claude ...` trailer (see "How this was built" in `README.md`).
- `main` is protected: work on a `cu-dev/<topic>` branch and open a pull request; never push to `main`. Do not add `Claude-Session:` links to commits or PRs.

## Test builds

After each meaningful change, zip a test build the same way the Release workflow does (the `zip -r` line in `.github/workflows/release.yml`, run from the repo root) and send it to the maintainer.

## Vendored code

- `vendor/autoconsent/` is DuckDuckGo's `@duckduckgo/autoconsent` (MPL-2.0), pinned to the exact version in `package.json`. Regenerate it with `node tools/build-autoconsent.mjs` after changing the pin; never edit its files by hand, and keep its `LICENSE`.
- Strict Switch only ever asks autoconsent to reject. It never sends `optIn` and refuses opt-in eval snippets.
