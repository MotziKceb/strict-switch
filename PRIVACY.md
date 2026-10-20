# Strict Switch privacy policy

*Last updated: 20 October 2026. Applies to Strict Switch 0.9 and later; the private window settings described below are from 0.9.1.*

**The short version:** Strict Switch collects nothing and sends nothing. It has no servers, no analytics and no accounts. Everything it knows stays in your browser, and you can see and delete it.

## Strict Switch can't contact the internet

The extension's manifest (`manifest.json`) contains a content security policy that stops its pages and its background worker from connecting to any server. Only the extension's own files can be loaded. Anyone can check this; it's one line, and the automated tests fail if it's ever removed.

If you switch on cookie banner handling, Strict Switch also adds scripts to the pages you visit. That policy doesn't cover scripts inside web pages, so they're written without any way to reach the network, and the automated tests fail if one ever uses a network function.

This means:

- No analytics, crash reports, telemetry or "phone home" of any kind.
- No remote tracker lists or cookie banner rules. Both are bundled with each release and only change when you install a new version.
- Links in the extension (to GitHub, for example) open in a normal browser tab, only when you click them.

## What it stores, and where

All of this is stored by your browser, for this extension only.

| What | Where | Why | Kept |
| --- | --- | --- | --- |
| **Your settings:** tracker categories, the level and category switches you've set for particular sites (by domain name), companies you've set to Block or Allow, exceptions you've allowed on particular sites, and the on/off switches | Browser **sync** storage | So your choices apply everywhere and survive restarts | Until you change them or remove the extension |
| **Companies you visit regularly:** a list of company names (like "Google" or "Meta") | Local storage | Balanced mode opens up categories for these | Recounted every hour |
| **Caught trackers:** for each tracking company seen, how many requests were blocked or allowed, when it was last seen, and up to 10 site domains where it was seen recently | Local storage | The Trackers page | Until you click **Clear caught list** on the Trackers page or remove the extension |
| **Activity log:** the last 3,000 tracker requests (time, site domain, tracker address *without* its query string, company, category, what happened and why), your settings changes, and cookie banners handled or checked (site domain, banner platform, the labels of the buttons clicked, and what the site's consent record said) | Session storage (memory only) | The activity log and reports | **Deleted automatically when the browser closes**, or when you click **Clear log** |
| **Private window settings:** how private windows start (from Strict, or from your normal settings) and the sites (by domain name) you switched "Use these settings in private windows" on for | Browser **sync** storage | So private windows start the way you chose | Until you change them or remove the extension |
| **Settings changed in a private window:** the levels, exceptions and so on you set there | Session storage (memory only), in the private window's own copy of the extension | So you can change things in a private window | **Deleted when the last private window closes** |
| **Cookie banner settings:** who handles banners, and the sites (by domain name) where auto-reject is off | Browser **sync** storage | So your choices apply everywhere | Until you change them or remove the extension |
| **Cookie banner access dates:** when you allowed reading sites, when that access ends, and when the next reminder is due | The extension's own database (IndexedDB), which web pages can't reach | The permission lease and reminder | Until access ends or you switch it off |

### About browser sync

Your settings are kept in your browser's sync storage. **If you have browser sync turned on** (signed in to Edge with a Microsoft account, or to Chrome with a Google account, and so on), your browser copies these settings to your other devices through its own sync service. That includes the domain names of sites you've given their own settings.

That copying is done by your browser, under your browser account's sync settings, not by Strict Switch. If you'd rather it didn't happen, turn off extension sync in your browser's sync settings. Your caught trackers, the companies you visit regularly, the cookie banner access dates and the activity log are never synced.

## What it reads, and why

These are the permissions Strict Switch asks for. Your browser describes several of them as "read your browsing history"; this is what each one is actually used for.

| Permission | What it's used for |
| --- | --- |
| **Block content** (`declarativeNetRequest`) | Blocking trackers with rules your browser enforces. Strict Switch never sees the content of pages or requests. |
| **Rule matches** (`declarativeNetRequestFeedback`) | Seeing which of its own rules matched, so the popup, Trackers page and log can show what was blocked or allowed and why. |
| **Browsing history** (`history`) | Counting how often you've visited tracking companies' own sites in the last 30 days, on your device, so Balanced mode knows which companies you use. Only the resulting company names are stored; your history itself is never stored or copied. |
| **Current tab** (`activeTab`) | Seeing which site you're on when you open the popup. |
| **Storage** (`storage`) | Keeping your settings and the data in the table above. |
| **Alarms** (`alarms`) | Recounting the companies you visit regularly, once an hour, and checking the cookie banner reminder. |

### Only if you switch on cookie banner handling

Cookie banner handling is off by default. Switching it on asks your browser for these, and switching it off, or the access ending after 90 days without renewal, hands them back:

| Permission | What it's used for |
| --- | --- |
| **Read and change all your data on all websites** (`http://*/*`, `https://*/*`) | Finding cookie banners and clicking "reject" (only when Strict Switch handles banners), and reading the site's consent record afterwards. |
| **Scripting** (`scripting`) | Adding those scripts to pages, and reading the consent record (IAB TCF and Google Consent Mode) from the page. |
| **Notifications** (`notifications`) | The reminder that the access is still on, and the notice when it's handed back. |

While it's on, the scripts look at each page for a cookie banner and read what the site's consent record says. For some banners they also check the cookie the banner sets to remember your choice, to confirm the rejection stuck. They don't read what you type. The only thing kept is the activity log entry described above, and nothing is sent anywhere.

Without cookie banner handling, Strict Switch **can't** read or change the content of web pages or read cookies. It never sees what you type or changes your browser's own settings. Where a browser setting matters (like Do Not Track), the extension only explains it and opens the settings page for you.

### Private windows

Settings you change in a private window are never saved to your normal settings or to sync, and are forgotten when the last private window closes. The one exception is a button you click yourself, **Keep these settings in normal browsing**: it saves that one site's settings (including the site's domain name) to your normal settings, and so to sync if it's on. It asks first and says so. Sites you visit in a private window are not added to the Trackers page, and cookie banner handling is off there.

## Reports

The activity log can make a report for troubleshooting. A report includes your settings and the log entries you've filtered to, so it lists sites you've visited.

- **Copy report** and **Download report** put the report on your clipboard or in a file. Nothing is sent.
- **Report a problem** copies the report and opens a GitHub issue form in a new tab. You choose whether to paste it, and can edit it first. Issues on GitHub are **public**, so check the report before posting.

## Deleting your data

- **Activity log:** cleared when you close the browser, or click **Clear log**.
- **Caught trackers:** click **Clear caught list** on the Trackers page.
- **Cookie banner access dates:** click **Turn it off now** on the Cookie banners page.
- **Everything:** removing the extension deletes all of its stored data. If you use browser sync, your browser removes the synced settings too.

## Children

Strict Switch collects no personal data from anyone, including children.

## Changes to this policy

Changes are made in this file, in the public repository, so every version and every change is visible in its history. If a future version ever needed to collect or send anything, it would need a new permission or a change to the no-network line in the manifest. Both are visible in the code, and both fail the automated tests until deliberately changed. For installs from an extension store, a new permission also makes your browser ask you before the update is applied; installs from a GitHub release never update by themselves.

## Contact

Questions or concerns: [open an issue](https://github.com/MotziKceb/strict-switch/issues/new/choose) on GitHub. For anything you'd rather not discuss publicly, contact the maintainer through their [GitHub profile](https://github.com/MotziKceb).
