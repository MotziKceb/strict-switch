# Strict Switch

A Microsoft Edge extension for people who want **Strict** tracking prevention everywhere, but a quick way to step individual sites down to **Basic** when Strict breaks them.

Edge's own exceptions list turns tracking prevention fully *off* for a site, and extensions can't change Edge's tracking prevention settings. So Strict Switch works the other way round:

- **Edge itself runs on Basic.** That's the floor every site always gets, including Edge's protection against fingerprinting and cryptomining.
- **The extension adds the Strict layer.** It blocks third-party trackers using the [Disconnect tracking protection list](https://github.com/disconnectme/disconnect-tracking-protection), the same list Edge's own tracking prevention is built on.
- **One click steps a site down to Basic.** The toolbar popup turns the Strict layer off for the current site (and its subdomains) and reloads the page. The site still keeps Edge's Basic protection.

## Install

1. Download this repository (Code > Download ZIP) and unzip it, or clone it.
2. Open `edge://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.
4. The settings page opens. Click **Open Edge privacy settings** and set tracking prevention to **Basic**.
5. Optional: pin the extension to the toolbar from the puzzle-piece menu.

## Use

- **Toolbar badge:** the number of requests blocked on the current tab.
- **Popup:** shows whether the current site is on Strict or Basic, with a one-click switch and a breakdown of what was blocked. The "Strict layer on" switch pauses blocking everywhere.
- **Settings:** choose which tracker categories to block, and view, add or remove sites on Basic. You can paste a full URL; it's trimmed to the domain.

Your Basic sites and settings are stored with `chrome.storage.sync`, so they follow your Edge profile if sync is on.

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
- Sites on Basic are covered by a single dynamic `allowAllRequests` rule, which overrides the block rules for those pages and any frames they embed.
- The extension asks for `declarativeNetRequest`, `storage` and `activeTab` only. It can't read page contents or your browsing history.

## Updating the blocklist

Extensions loaded from source don't update automatically. To refresh the tracker list:

```sh
node tools/build-rules.mjs
```

Then click the reload button on the extension's card in `edge://extensions`. Requires Node.js 18 or newer. Behind a proxy, prefix the command with `NODE_USE_ENV_PROXY=1`.

To regenerate the icons: `python3 tools/make-icons.py` (requires Pillow).

## License

The extension code is licensed under the GNU GPL v3 (see `LICENSE`).

The rulesets in `rules/` are derived from the Disconnect tracking protection list, which is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). That allows personal, non-commercial use. Publishing the extension commercially would need a different list or a license from Disconnect.
