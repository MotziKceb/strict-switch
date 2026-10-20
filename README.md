# Strict Switch

Strict tracker blocking for people who want strong privacy without learning filter lists: strict everywhere by default, opened up per site or per company in one click, and every decision explained in plain language. Built around four ideas: **convenience, control, transparency and friendliness**.

It started as a way to get Microsoft Edge's **Strict** tracking prevention with a quick way to step individual sites down. Edge's own exceptions list turns protection fully *off* for a site, and extensions can't change Edge's settings, so Strict Switch provides its own strict layer instead:

- **Your browser keeps its own protection.** In Edge, set tracking prevention to Basic; that's the floor every site always gets. Other browsers: see [Browsers](#browsers).
- **The extension adds the Strict layer.** It blocks third-party trackers using the [Disconnect tracking protection list](https://github.com/disconnectme/disconnect-tracking-protection), the same list Edge's own tracking prevention is built on.
- **One click changes a site's level.** The toolbar popup switches the current site (and its subdomains) between levels and reloads the page:

| Level | What's blocked on the site |
| --- | --- |
| **Lockdown** (Ctrl+click Strict) | Every known tracker: all categories including Tracking content, on the owner's own sites too, overriding company Allow rules. |
| **Strict** (default) | Every tracker in the categories you've enabled. |
| **Balanced** | The same, except Social and Tracking content from companies you visit regularly (configurable). Ads, analytics and the rest stay blocked. |
| **Basic** | Nothing extra. Only Edge's own Basic protection. |

### Site settings

**Site settings**, next to the site name in the popup, opens one page for everything about that site: its level, its own tracker category switches (for example Advertising off or Tracking content on for just this site, each marked "changed for this site" with a way back to the global setting), the trackers you've allowed there, and what's blocked on the open page. A site's own settings beat global ones and company rules, but not Lockdown or Basic.

### Page seems broken?

**Page seems broken?** in the popup (and in Site settings) opens a step-by-step guide for that site. It tries one change at a time, most likely first: if Cloudflare's content was blocked on the page (where its "Verify you are human" check lives), allowing that comes first; then the other blocked trackers most likely to break the page, then turning off cookie banner auto-reject if it's on, then Balanced, then Basic. After each step it reloads the page and asks whether it works now. Each step says in a line what allowing it means (for example "lets Meta see that you visited this site"), with **More about** for a longer explanation. Anything that didn't help is put back, and every change is in the activity log. If even Basic doesn't help, Strict Switch probably isn't the cause, and the guide says so.

### Private windows

A private window (InPrivate in Edge, Incognito in Chrome, Private in Brave, Opera and Vivaldi) gets its own copy of Strict Switch. By default every site starts on Strict there, whatever you've set in normal windows, and you can change anything: the changes live in memory only, never reach your normal settings or sync, and are forgotten when the last private window closes. The popup and settings pages are tinted and say so.

- **Start from your normal settings instead:** Settings, **Private windows**. The copy is taken when the first private window opens.
- **Use these settings in private windows:** a switch on a site's Site settings page (in a normal window). That site starts with its normal settings, even when everything else starts on Strict.
- **Keep in normal browsing:** found a fix in a private window and want it every day? In Site settings, or on the guide's "Fixed" screen, **Keep these settings in normal browsing** saves that site's settings to your normal ones. It asks first, because it records the site in your normal settings (and in browser sync, if it's on). Nothing else from the private window is saved.

Cookie banner handling isn't available in private windows yet. Browsers only run extensions in private windows if you allow it for each extension; the settings page tells you if you haven't. The settings page also has a "Details for testing private windows" box that shows what each copy is doing.

### Might break the page

The popup lists the blocked trackers most likely to break the current page: Tracking content (videos, images, fonts, page code) and trackers on their owner's own site first, then Social (logins, comments, embedded posts). Each is grouped by company and category with a toggle that allows it **on that site only**; flip what you need and click **Reload page to apply**. The popup shows the top four; **and N more** opens a page with the full list in the same order. Per-site exceptions are listed, and can be removed, in settings.

### About Balanced

Edge's Balanced mode allows trackers from companies you've "engaged" with, so things like embedded posts, logins and videos from sites you use keep working. Strict Switch does the same, but by default only for Social and Tracking content (the categories that break sites); ads, analytics, fingerprinting and cryptomining stay blocked. You can change which categories Balanced opens in settings. A company counts as one you visit regularly once you've visited its sites at least 3 times in the last 30 days. The settings page lists those companies.

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

### Cookie banners (optional)

Strict Switch can click **reject** on cookie banners for you, then check whether the site recorded your rejection. It's **off by default**: switching it on (Settings, **Cookie banner settings**) asks your browser to let Strict Switch read every site you visit, which is what finding and answering banners takes.

- **Reject, never accept.** Banners are recognised with DuckDuckGo's open-source [autoconsent](https://github.com/duckduckgo/autoconsent) rules, bundled with each release and never downloaded. Strict Switch only ever asks it to reject; it never clicks "accept".
- **Reject, then verify.** Afterwards it reads the site's consent record (IAB TCF, used by most EU banners, and Google Consent Mode) to see whether the rejection registered. The activity log lists every banner: the platform it was recognised as, what was clicked, and whether the record confirms the rejection, records consent anyway, or can't be checked. It also notes purposes that still claim "legitimate interest", which a rejection doesn't switch off.
- **Cookie banners are handled by** Strict Switch, another extension (like Consent-O-Matic) or nobody (you click yourself). In the last two, Strict Switch never touches banners but still checks the record after the click.
- **Per-site off switch** in the popup and in Site settings, for the rare site where auto-reject gets in the way.
- **The permission expires.** Access is handed back by itself after 90 days unless you click **Keep**, and a reminder every 7 days (snoozable for 7, 14, 30 or 60 days) says it's still on: a notification, a "!" on the toolbar icon and a banner in the popup. The reminder and the end date are kept where web pages can't reach them, and can only be changed by a click on the Cookie banners page. Anything unreadable counts as "now", so interference can only make the reminder come sooner.

## Browsers

Strict Switch works in any Chromium-based browser: Edge, Chrome, Brave, Opera, Vivaldi and others. It adapts its wording to what your browser blocks by itself, because that's what a site set to **Basic** is left with:

| Browser | Its own protection | "Basic" means |
| --- | --- | --- |
| Edge | Tracking prevention (set it to Basic) | Edge's Basic protection |
| Brave | Shields | Shields only |
| Opera | Built-in ad and tracker blocker, if on | Opera's blocker only |
| Chrome | None | No tracker blocking |
| Others (Vivaldi...) | Varies; Vivaldi has its own blocker | Your browser's own protection, if any |

## No network access

The manifest's content security policy stops the extension from contacting any server: its pages and background worker can only load the extension's own files. The scripts it adds to web pages when cookie banner handling is on aren't covered by that policy, so they're written without any network access, and the automated tests check that they stay that way. Everything stays in your browser. Tracker lists and the cookie banner rules are bundled with each release, and reports only leave your browser when you copy or download them yourself.

## Reporting problems

Open the **Log** from the popup on the affected site and click **Report a problem**. It copies a report (your settings and the log entries for that site, addresses without query strings) and opens a GitHub issue form to paste it into. Look the report over before posting; it's a public page. You can also [open an issue](https://github.com/MotziKceb/strict-switch/issues/new/choose) directly.

See [ROADMAP.md](ROADMAP.md) for what's planned, [PRIVACY.md](PRIVACY.md) for exactly what the extension stores and reads, and [BETA.md](BETA.md) if you're helping test it.

## Install

Until Strict Switch is in the extension stores, install it from a GitHub release:

1. Download `strict-switch-*.zip` from the [latest release](../../releases/latest) and extract it to a folder you'll keep. Your browser loads the extension from that folder, so don't delete it.
2. Open your browser's extensions page and turn on **Developer mode**:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
   - Vivaldi: `vivaldi://extensions`
3. Click **Load unpacked** and pick the extracted folder.
4. The settings page opens with a note about your browser's own protection. In Edge, follow it to set tracking prevention to **Basic**.
5. Optional: pin the extension to the toolbar from the puzzle-piece menu.

Browsers only allow installing extensions from outside their stores through Developer mode, which is why there's no one-click install file. Some browsers show a reminder about developer-mode extensions at startup; it's safe to dismiss.

## Updates

Strict Switch never connects to the internet, so its tracker list (and everything else) only changes when you install a new release. The settings page shows the version and when the bundled tracker list was built.

- **From a browser's extension store** (once it's listed there): updates arrive automatically.
- **From a GitHub release** (an unpacked folder): download the new zip from [Releases](../../releases/latest), extract it over the same folder, and click the reload button on the extension's card on your browser's extensions page. Your settings, sites and company choices are kept.

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
- Permissions: `declarativeNetRequest` to block, `declarativeNetRequestFeedback` to see which rules matched (for the Trackers page and popup), `storage` for settings, `activeTab` to see the current site in the popup, `history` to count visits for Balanced, and `alarms` for the periodic recount and the cookie banner reminder. Without cookie banner handling, the extension can't read page contents.
- Cookie banners: switching the feature on requests the optional permissions `http://*/*` and `https://*/*` (read sites), `scripting` (add the content scripts and read the consent record) and `notifications` (the reminder), and switching it off or the lease ending hands all of them back. `content/autoreject.js` runs DuckDuckGo's autoconsent from `vendor/autoconsent/` in every frame; `content/watch.js` asks the background worker to read the consent record after the page loads and after clicks. The lease and reminder dates are in the extension's own IndexedDB (`lib/guard.js`), which content scripts can't reach.

## How this was built

Strict Switch was designed, directed and tested by its maintainer, and the code was written with an AI coding assistant (Claude, by Anthropic). The commit history says so: commits written with it carry a `Co-Authored-By: Claude` line.

What that means in practice:

- **The decisions are human.** Strict by default, no network access, broad permissions only ever opt-in, facts over opinions, and the four principles in [ROADMAP.md](ROADMAP.md) were the maintainer's calls, often overruling the assistant's suggestions.
- **It was tested in real browsers.** Many fixes came from the maintainer's everyday browsing and activity log reports: Block not applying on a company's own sites, Balanced letting ad trackers through, browser-specific wording, and more.
- **It's checked automatically.** The test suite (`tests/`) runs real blocking in Chromium at every level, the popup, the log and reports, cookie banner rejection and verification, and pins the extension's exact permissions and its no-network policy. It runs on every change, and a release can't be published if it fails.
- **The extension itself contains no AI** and talks to no AI service, or any other server.

Everything is open for review. If you can read JavaScript, a human code review is very welcome: open an issue with what you find.

## Development

For people working on Strict Switch itself, from a checkout of this repository (Node.js 18 or newer):

- **Install the tools:** `npm install`, then `npx playwright install chromium` for the browser the tests use. The extension itself has no dependencies; these are for development only.
- **Run the tests:** `npm test` (about 30 seconds). Rules and logic are checked directly; blocking and the interface are checked in headless Chromium with the extension loaded, against a local test server that plays every site.

- **Load it:** turn on Developer mode on your browser's extensions page, click **Load unpacked** and pick the repository folder. The activity log shows full addresses when loaded this way.
- **Rebuild the tracker list** from the latest Disconnect data: `node tools/build-rules.mjs`, then reload the extension. Behind a proxy, prefix the command with `NODE_USE_ENV_PROXY=1`. To build from local copies of Disconnect's files: `node tools/build-rules.mjs --services services.json --entities entities.json`.
- **Update autoconsent:** change the exact version of `@duckduckgo/autoconsent` in `package.json`, run `npm install`, then `node tools/build-autoconsent.mjs` to refresh `vendor/autoconsent/`. Note the version and its changelog in the release notes.
- **Regenerate the icons:** `python3 tools/make-icons.py` (requires Pillow).
- **Release:** bump `version` in `manifest.json` and merge to `main`. The Release workflow packages the extension and publishes a GitHub release for any version that hasn't been released yet. (Automated weekly tracker-list releases are planned; see [ROADMAP.md](ROADMAP.md).)

## License

The extension code is licensed under the GNU GPL v3 (see `LICENSE`).

`vendor/autoconsent/` is DuckDuckGo's [autoconsent](https://github.com/duckduckgo/autoconsent), licensed under the Mozilla Public License 2.0 (see `vendor/autoconsent/LICENSE`). Its files keep that license; `autoconsent.js` is the same code wrapped to run as a content script.

The rulesets in `rules/` are derived from the Disconnect tracking protection list, which is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). That allows personal, non-commercial use. Publishing the extension commercially would need a different list or a license from Disconnect.
