# Strict Switch

A Microsoft Edge extension for people who want **Strict** tracking prevention everywhere, but a quick way to step individual sites down to **Balanced** or **Basic** when Strict breaks them.

Edge's own exceptions list turns tracking prevention fully *off* for a site, and extensions can't change Edge's tracking prevention settings. So Strict Switch works the other way round:

- **Edge itself runs on Basic.** That's the floor every site always gets, including Edge's protection against fingerprinting and cryptomining.
- **The extension adds the Strict layer.** It blocks third-party trackers using the [Disconnect tracking protection list](https://github.com/disconnectme/disconnect-tracking-protection), the same list Edge's own tracking prevention is built on.
- **One click steps a site down.** The toolbar popup switches the current site (and its subdomains) between three levels and reloads the page:

| Level | What's blocked on the site |
| --- | --- |
| **Strict** (default) | Every tracker in the categories you've enabled. |
| **Balanced** | The same, except trackers from companies you visit regularly. |
| **Basic** | Nothing extra. Only Edge's own Basic protection. |

### About Balanced

Edge's Balanced mode allows trackers from companies you've "engaged" with, so things like embedded posts, logins and videos from sites you use keep working. Strict Switch does the same: a company counts as one you visit regularly once you've visited its sites at least 3 times in the last 30 days. The settings page lists those companies.

Extensions can't read Edge's own engagement scores, so this is counted from your browsing history, which is why the extension asks for the history permission. It only reads it, on your device, and nothing is sent anywhere.

It isn't an exact copy of Edge's Balanced. Edge's version doesn't block ad and social trackers from loading (it only blocks their cookies and storage) and doesn't touch analytics at all. Strict Switch's Balanced blocks all of them unless you visit the company, so it's stricter. Since almost everyone visits Google and Microsoft sites, their trackers will usually be allowed on Balanced sites, just like in Edge.

## Install

1. Download `strict-switch-*.zip` from the [latest release](../../releases/latest) and extract it to a folder you'll keep. Edge loads the extension from that folder, so don't delete it.
2. Open `edge://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the extracted folder.
4. The settings page opens. Click **Open Edge privacy settings** and set tracking prevention to **Basic**.
5. Optional: pin the extension to the toolbar from the puzzle-piece menu.

## Use

- **Toolbar badge:** the number of requests blocked on the current tab.
- **Popup:** shows the current site's level (Strict, Balanced or Basic), with a one-click switch and a breakdown of what was blocked. The "Strict layer on" switch pauses blocking everywhere.
- **Settings:** choose which tracker categories to block, view, add or change stepped-down sites, and see which companies Balanced currently allows. You can paste a full URL; it's trimmed to the domain.

Your stepped-down sites and settings are stored with `chrome.storage.sync`, so they follow your Edge profile if sync is on.

### Categories

| Category | Default | Notes |
| --- | --- | --- |
| Advertising | On | |
| Analytics | On | |
| Social | On | Can break "Log in with..." buttons and social embeds. |
| Fingerprinting | On | |
| Cryptomining | On | |
| Tracking content | Off | Embedded videos, maps and fonts from tracking companies. Breaks many sites. |

Like Edge, trackers aren't blocked on sites owned by the same company (for example `facebook.net` on `facebook.com`), and visiting a tracker's own site directly still works.

## How it works

- `rules/*.json` are static [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) rulesets, one per category, generated from the Disconnect list.
- Basic sites are covered by a dynamic `allowAllRequests` rule, which overrides the block rules for those pages and any frames they embed.
- Balanced sites are covered by a dynamic `allow` rule for the domains owned by companies you visit regularly (`rules/entities.json`, built from Disconnect's company list). The background worker recounts visits hourly and whenever you visit a tracker company's site.
- Permissions: `declarativeNetRequest` to block, `storage` for settings, `activeTab` to see the current site in the popup, `history` to count visits for Balanced, and `alarms` for the hourly recount. The extension can't read page contents.

To update, extract a newer release over the same folder and click the reload button on the extension's card in `edge://extensions`. Your settings and stepped-down sites are kept.

Edge only allows installing extensions outside the Add-ons store through Developer mode, which is why there's no one-click install file.

## Releasing

Bump `version` in `manifest.json` and merge to `main`. The Release workflow packages the extension and publishes a release for any version that hasn't been released yet.

## Updating the blocklist

The blocklist is bundled with each release. To refresh it yourself:

```sh
node tools/build-rules.mjs
```

Then click the reload button on the extension's card in `edge://extensions`. Requires Node.js 18 or newer. Behind a proxy, prefix the command with `NODE_USE_ENV_PROXY=1`.

To regenerate the icons: `python3 tools/make-icons.py` (requires Pillow).

## License

The extension code is licensed under the GNU GPL v3 (see `LICENSE`).

The rulesets in `rules/` are derived from the Disconnect tracking protection list, which is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). That allows personal, non-commercial use. Publishing the extension commercially would need a different list or a license from Disconnect.
