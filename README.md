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

### Trackers page

The Trackers page (from the popup or settings) lists every tracking company Strict Switch has caught on the sites you visit: how many requests were blocked or allowed, when, and on which sites. Each company has a clear status and a three-way switch:

| Rule | Effect |
| --- | --- |
| **Block** | Its trackers are blocked everywhere, including on the company's own sites and on Balanced sites, even if you visit the company. |
| **Auto** (default) | Blocked, but allowed on Balanced sites if you visit the company regularly. |
| **Allow** | Its trackers load on every site, including Strict ones. |

Company rules only cover the categories you have switched on in Settings, so blocking Google doesn't also block Google Fonts or "Sign in with Google" (both Tracking content) unless that category is on. Search by company name or tracker domain, filter to blocked or allowed companies, or include companies that haven't been caught yet to block them in advance. Sites on Basic always allow everything. Clicking a company in the popup opens it on the Trackers page.

### Activity log

The activity log (from the popup, the Trackers page or settings) lists every tracker request Strict Switch saw, blocked or allowed, with the site, company, address and the reason, such as "Strict layer (Advertising)", "Balanced site, you visit this company", "Your rule: Block", "Same company as the site" or "Tracking content is switched off". Permitted trackers are logged too, so nothing is hidden, and repeats of the same request are folded into one line with a count. Settings changes are logged too. Each entry has its category and falls in one of the same three groups as the popup; the log shows real trackers (blocked and allowed) by default, with filters for blocked, allowed, category off, settings changes or everything. Filter by site, company or address, then **Copy report** or **Download report** to get a text report with your settings and the matching entries, handy for bug reports.

The log keeps the last 3,000 entries, is cleared when Edge closes, and stores addresses without query strings. It's most detailed when the extension is loaded unpacked; otherwise Edge only reports which rule matched, not the address.

## Chrome and other Chromium browsers

Strict Switch also works in Chrome, Brave, Vivaldi and other Chromium-based browsers; load it the same way from their extensions page. The one difference: they don't have Edge's tracking prevention, so a site on **Basic** gets no tracker blocking at all instead of Edge's Basic protection. The settings page and popup say so when not running in Edge.

## Install

1. Download `strict-switch-*.zip` from the [latest release](../../releases/latest) and extract it to a folder you'll keep. Edge loads the extension from that folder, so don't delete it.
2. Open `edge://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the extracted folder.
4. The settings page opens. Click **Open Edge privacy settings** and set tracking prevention to **Basic**.
5. Optional: pin the extension to the toolbar from the puzzle-piece menu.

To update, extract a newer release over the same folder and click the reload button on the extension's card in `edge://extensions`. Your settings and stepped-down sites are kept.

Edge only allows installing extensions outside the Add-ons store through Developer mode, which is why there's no one-click install file.

## Use

- **Toolbar badge:** the number of requests blocked on the current tab.
- **Popup:** shows the current site's level (Strict, Balanced or Basic), with a one-click switch and a breakdown of what was blocked. The "Blocking" switch pauses the extension everywhere. The Log link opens the activity log filtered to the current site.
- **Popup:** also sums up the current page in three plain groups: **trackers blocked**, **trackers allowed** (and the companies behind them), and requests **not blocked because their category is off**. With the default settings that last group is content like videos, images and fonts from tracking companies, such as YouTube's own video and thumbnails. Every company is listed with its category.
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

Unlike Edge, Strict also blocks a company's trackers on its own sites, such as Google's ad trackers on YouTube; Edge exempts those. This can break parts of a company's own sites, such as Outlook or OneDrive (Microsoft) or Instagram (Meta): set those sites to Balanced to open them up, or turn off **Block trackers on their owners' own sites too** in settings to exempt every company's own sites like Edge does. Visiting a tracker company's site directly always works.

## How it works

- `rules/*.json` are static [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) rulesets, one per category, generated from the Disconnect list.
- `rules/observe.json` is an always-on ruleset of low-priority `allow` rules for every tracker. Block rules win wherever they apply; when nothing blocks a tracker (same company as the site, or its category is off), the observe rule lets it through and the match shows up in the log and on the Trackers page.
- Basic sites are covered by a dynamic `allowAllRequests` rule, which overrides the block rules for those pages and any frames they embed.
- Each company gets its own dynamic rules: an `allow` rule limited to Balanced sites if you visit it regularly, or an `allow` or `block` rule everywhere if you've set it to Allow or Block. Companies and their domains come from `rules/entities.json`, built from Disconnect's company list. The background worker recounts visits hourly and whenever you visit a tracker company's site.
- Caught trackers and the activity log are recorded from the extension's own rule matches: live when the extension is loaded unpacked, otherwise polled every minute. `rules/rule-index.json` maps each static rule back to its company. The list is kept in local storage and never leaves your device.
- Permissions: `declarativeNetRequest` to block, `declarativeNetRequestFeedback` to see which rules matched (for the Trackers page and popup), `storage` for settings, `activeTab` to see the current site in the popup, `history` to count visits for Balanced, and `alarms` for the periodic recount. The extension can't read page contents.

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
