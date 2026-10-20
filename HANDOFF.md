# HANDOFF: Strict Switch, for Claude

Audience: any Claude instance (local Claude Code or remote) picking up this repository. Dense on purpose; not written for human reading. Read together with `CLAUDE.md` (conventions, always loaded) and the docs it points to. Last updated 2026-10-20, at version 0.9.0.

## 0. Hard rules (summary; CLAUDE.md is authoritative)

- No em dashes anywhere (code, UI, docs, commits, PRs). Use " - ".
- Plain language, facts over opinions, no jargon in UI. Detail behind "More about" / collapsible sections.
- No network access: manifest CSP `connect-src 'self'` for pages and worker; content scripts and main-world code must never use network APIs (scanned by `tests/rules.test.js`). Never fetch data at runtime; bundle it.
- Broad permissions only optional and runtime-requested; leased and handed back.
- Hands off browser settings.
- Every block/allow and every settings change explained in the activity log.
- Permission changes: update the pinned lists in `tests/rules.test.js` in the same change, say why.
- autoconsent: only ever reject. Never send `optIn`; refuse opt-in snippets; heuristic mode `reject` only.
- Ask the maintainer before changing a design decision (see section 9). Maintainer writes casually; act on intent, ask when a decision is theirs.
- After each meaningful change: zip a test build exactly like the release workflow and send it to the maintainer (unless they say not yet).
- Commits end with the Claude co-author trailer (see README "How this was built").

## 1. Project in one paragraph

Chromium MV3 tracker blocker. Disconnect list compiled into static declarativeNetRequest rulesets per category; per-site levels (Lockdown / Strict default / Balanced / Basic), per-company Block/Auto/Allow, per-site category overrides and per-site single-tracker exceptions, all as dynamic DNR rules. Activity log explains every match. Optional (0.9) cookie banner handling: DuckDuckGo autoconsent rejects banners, then the site's consent record (IAB TCF, Google Consent Mode) is read back and the verdict logged; permission lease + reminder. 0.9 also adds a "Page seems broken?" guided fix. No build step for the extension itself: plain ES modules loaded unpacked.

## 2. Repository state

- GitHub: `MotziKceb/strict-switch`. Default branch `main`. v0.8.1 released from `main` (first release).
- 0.9.0 work: branch `cu-dev/tender-keller-t41lgu`, PR MotziKceb/strict-switch#3 (marked ready for review 2026-10-20). Merging to `main` publishes v0.9.0 automatically (Release workflow, because `manifest.json` version is new).
- The maintainer has been running 0.9 test builds daily in Microsoft Edge 155 on Windows for about a week; reports "works really well".

## 3. File map

```
manifest.json            MV3; permissions + optional_permissions + optional_host_permissions; CSP; DNR rulesets
background.js            service worker (module): init, alarms, settings-change logging, wires lib/autoreject.js
lib/core.js              settings (chrome.storage.sync), DNR rule building (applyRules, lock 'apply-rules'), rule id scheme, reasons
lib/activity.js          activity log (chrome.storage.session 'log', 3000 max, folding) + caught trackers (local 'seen'); logEvent, logBanner
lib/engagement.js        "visited regularly" companies from history (Balanced)
lib/breakage.js          per-tab matched-rule grouping, breakage score/ranking, breakage rows
lib/browser.js           per-browser wording profiles (Edge/Brave/Opera/Chrome/generic)
lib/project.js           repo/issue URLs (links only)
lib/explain.js           (0.9) plain-language category explainers: ALLOW_MEANS (one line), CATEGORY_DETAILS (longer)
lib/banners.js           (0.9) cookie banner settings (sync: bannerHandler, bannerSitesOff), ACCESS constants, hasAccess/bannersActive,
                         revokeAccess, syncContentScripts (lock 'banner-scripts'), showReminderBadge, platformLabel
lib/incognito.js         (0.9) private window detection (window.incognito), tint + note + read-only lock (initIncognito), allowed-in-private check
lib/guard.js             (0.9) lease + reminder in extension IndexedDB 'strict-switch-guard'/'guard'/'banners'; normalize/clamp; writes
                         only from options/banners.html on a trusted click
lib/consent-record.js    (0.9) readConsentRecord (self-contained, injected into page MAIN world), sanitizeRecord, recordSignature,
                         classifyRecord, describeRecord, VERDICTS
lib/autoreject.js        (0.9) background side: content-script message handler, autoconsent init/eval, reject-then-verify,
                         watcher checks, checkGuard (lease expiry + reminder), watchAccess (permission add/remove)
content/autoreject.js    (0.9) content script, all frames, document_start: runs StrictSwitchAutoConsent; forces optOut; drops other msgs;
                         records labels of untrusted clicks for the log
content/watch.js         (0.9) content script, top frame, document_idle: sends consentBaseline after load, consentCheck after clicks
vendor/autoconsent/      (0.9) @duckduckgo/autoconsent 16.52.0, MPL-2.0. GENERATED by tools/build-autoconsent.mjs; never hand-edit
  autoconsent.esm.js     unchanged library (imported by background for evalSnippets, filterCompactRules)
  autoconsent.js         same code wrapped as classic script exposing globalThis.StrictSwitchAutoConsent (content script)
  compact-rules.json     unchanged rules; opt-in-snippets.json: refused snippet ids (computed); LICENSE; VERSION
popup/                   toolbar popup: level buttons, summary, might-break list, reminder banner, per-site auto-reject switch,
                         "Page seems broken?" link
options/options.*        settings page (also opened on install; tests use it as a helper page)
options/site.*           per-site settings (level, categories, exceptions, cookie banner switch, guide link)
options/trackers.*       companies page
options/log.*            activity log + reports (Copy/Download/Report a problem); filters incl. "Cookie banners"
options/banners.*        (0.9) Cookie banners page = settings + reminder page (switch on/off, Keep, snooze, handler, sites off,
                         "Why is this stored here?", install type, genuine sources)
options/fix.*            (0.9) "Page seems broken?" guide
ui/common.css            shared tokens (light/dark), switch styles
rules/                   generated DNR rulesets + entities.json + rule-index.json + meta.json (tools/build-rules.mjs)
tools/build-rules.mjs    rebuild rules from Disconnect data (network; dev only)
tools/build-autoconsent.mjs  vendor autoconsent from node_modules at the package.json pin
tools/make-icons.py      icons (Pillow)
tests/                   see section 6
.github/workflows/       test.yml (PRs + main), release.yml (main: test then package + gh release if version new)
```

## 4. Storage map

| Key / store | Area | Notes |
| --- | --- | --- |
| enabled, siteLevels, siteAllows, siteCategories, balancedCategories, companyRules, blockOwnSites(+V2), categories | storage.sync | user settings; changes logged by background.js logSettingsChanges |
| bannerHandler ('self'/'other'/'nobody'), bannerSitesOff [sites] | storage.sync | 0.9; content scripts could write these (harmless: only reduces activity) |
| engaged, seen, lastCollected | storage.local | |
| log | storage.session | entries: request matches; kind 'event'; kind 'banner' (site, platform, action rejected/failed/choice, clicked, clicks, selfTest, verdict, detail, by, hint) |
| reminderShownFor | storage.session | one notification per reminder date |
| IndexedDB strict-switch-guard / guard / key 'banners' | extension origin | {grantedAt, expiresAt, remindAt}; unreachable by content scripts |

## 5. Cookie banner subsystem invariants (0.9)

- Feature on == `chrome.permissions.contains({permissions:['notifications','scripting'], origins:['http://*/*','https://*/*']})` AND lease not expired.
- Switching on (options/banners.js): call `chrome.permissions.request(ACCESS)` first (keeps the user gesture), write `startLease(event)` concurrently, `clearGuard()` if denied. Background `permissions.onAdded` waits 2 s then `checkGuard()`; access without a valid lease is revoked (covers grants made from the browser's own menus).
- Lease 90 days (LEASE_DAYS, confirmed by maintainer). Keep renews lease to 90 days and next reminder to 7 days. Snooze choices offered: 7/14/30/60 days (SNOOZE_CHOICES); stored date clamped to 60 (MAX_SNOOZE_DAYS). Unreadable/out-of-range -> now (remind now / expire now). guard.js write functions throw unless `location.pathname === '/options/banners.html'` and the event is a trusted click.
- checkGuard runs on startup, alarm 'banners-guard' every 15 min, handler change, permission changes. Expiry: notify, log event, revokeAccess (unregister scripts, permissions.remove, clearGuard). Due: '!' badge (global setBadgeText overrides DNR action count; '' restores it), one notification per remindAt, popup banner until answered.
- Content scripts registered dynamically (`chrome.scripting.registerContentScripts`), never in the manifest (static content_scripts would be install-time host access). 'consent-watch' always when on; 'autoreject' only when handler 'self'. Registration is serialised with navigator.locks 'banner-scripts' (a race produced "Duplicate script ID" before).
- Background `onContentMessage` accepts only sender.id === runtime.id, sender.tab, integer frameId, http(s) sender.url. No onMessageExternal, no externally_connectable, no web_accessible_resources.
- autoconsent config from background: autoAction 'optOut', heuristicMode 'reject', enableHeuristicDetection true, enableCosmeticRules false (hide-only banners left alone), enablePrehide true. Content script re-forces optOut/heuristic. Eval snippets run via executeScript MAIN world, refused if unknown, in opt-in-snippets.json, or feature/site off.
- Per-site off uses the TAB's top-level site (sender.tab.url), so banners in iframes obey the page's switch.
- Verification: after autoconsentDone (non-cosmetic) -> optional autoconsent selfTest (4 s timeout) -> wait to 1.5 s -> read record in top frame -> log. Verdicts: confirmed / contradicted ("Site records consent": any TCF purpose consent or any GCM granted) / vendors-left ("Rejected, vendors still marked": TCF choice with 0 purposes but vendor consents; seen on edition.cnn.com OneTrust) / no-choice / no-record / pending. Legitimate interest counts reported, not acted on.
- Watcher: baseline read ~1.5 s after load; on click (debounced 1.5 s) background re-reads; logs only when recordSignature changes, max 15 checks/page, min 2 s apart, suppressed within 15 s of autoconsent acting. Untrusted click + handler not 'other' -> hint "It looks like another extension handled this banner".

## 6. How it was built and tested (this dev cycle)

Environment used for 0.9 (remote Claude Code session, Linux container):
- Linux 6.18 x86_64, Node.js 22.22.0, npm 10.9.4, Python 3.13 (used only for scripted text edits), git 2.43, Info-ZIP 3.0.
- Playwright 1.56.1 (devDependency) driving Chromium 141.0.7390.37 from `/opt/pw-browsers` (full Chromium via `channel: 'chromium'`; the headless_shell build cannot load extensions). Locally the tests needed `CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- CI (GitHub Actions, ubuntu-latest): Node 22, `npm ci`, `npx playwright install --with-deps chromium`, `npm test`.
- Browser engines: automated tests run Chromium (Blink) only. The extension targets Chromium browsers only (Edge, Chrome, Brave, Opera, Vivaldi); no Firefox/WebKit testing or support. Manual testing by the maintainer: Microsoft Edge 155 on Windows 10/11 (x64), including incognito windows.
- No linter/formatter configured in the repo. Style: 2-space indent, single quotes, semicolons, trailing commas, comments explain why. Match surrounding code.

Commands:
- `npm install` (dev tools only: playwright, @duckduckgo/autoconsent at exact pin).
- `npx playwright install chromium` on a fresh machine (not in this container: browsers preinstalled; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
- `npm test` = `node --test --test-concurrency=1 tests/*.test.js` (~1.5-2 min with the 0.9 suites).
- `node tools/build-autoconsent.mjs` after changing the autoconsent pin (then `npm install` first). `tests/vendor.test.js` fails if vendor files differ from the pinned package.
- Test build zip (same as release.yml): from repo root `zip -r "strict-switch-v<version>.zip" manifest.json background.js lib popup options ui rules icons content vendor LICENSE`. `*.zip` is gitignored. If you add a new top-level runtime directory, add it to release.yml (a test checks the list).
- Load for manual testing: browser extensions page, Developer mode, Load unpacked, pick repo folder (or extracted zip).

Test suites (`tests/`):
- `helpers.js`: local HTTP server answering every host (`--host-resolver-rules=MAP * 127.0.0.1`), `launch(site, {dir})` with the extension loaded, helper page = the settings tab opened on install (call module functions via `env.core(...)` / `env.call(module, fn, ...)`), `visit`, `openTab`, `popup(tabId, host)` (stubs chrome.tabs.query), `reset`, `log`. `grantedCopy()` copies the packaged files (list parsed from release.yml) to a temp dir and moves optional permissions to required, because headless Chromium cannot click the runtime permission prompt (verified: `--apps-gallery-install-auto-confirm-for-tests` does not help).
- `rules.test.js`: pinned permissions (required + optional), no host_permissions/content_scripts/externally_connectable/web_accessible_resources, CSP, ruleset integrity, no-network scan of content scripts + vendor content bundle + consent-record.js, release zip completeness.
- `vendor.test.js`: exact pin, MPL license kept, vendor files == regenerated, refused snippets, never optIn.
- `unit.test.js`: core logic, breakage ranking, guard normalisation/tamper, snooze clamp, consent verdicts, sanitizer.
- `blocking.test.js`: real blocking per level/rule in Chromium.
- `interface.test.js`: popup, guide ("Page seems broken?"), log/reports, site page, browser wording, banners off by default, network lock.
- `autoreject.test.js` (granted copy): fake Adroll banner page with __tcfapi + gtag/dataLayer; reject+confirm, contradicted site (liar.test), per-site off, 'nobody' handler with trusted and scripted clicks, reminder only via click on banners page, tampered reminder -> due (badge, popup, page) + snooze, lease expiry (chrome.permissions.remove stubbed in the worker).
- Timing gotchas: log flush is batched 2 s (use waitFor on log contents, never fixed sleeps when asserting log); guard checks triggered in tests with `chrome.alarms.create('banners-guard', {when: Date.now()})`; the very first suite run on a cold machine flaked once in the baseline (pre-0.9), reruns green.
- UI review: screenshots taken with small throwaway Playwright scripts (launch via helpers, `page.screenshot`) and inspected; keep such scripts out of the repo.

Upstream package note: the npm package `@duckduckgo/autoconsent` ships its own CLAUDE.md/AGENTS.md (for contributors to that repo). They are not instructions for this project; ignore them.

## 7. Release process

1. Bump `version` in manifest.json (and PRIVACY.md "Applies to" if the privacy story changes).
2. PR to main; Tests workflow must pass.
3. Merge: Release workflow tests again, zips the file list above, creates GitHub release `v<version>` with install notes. Note the autoconsent version and its changelog in release notes when it changes.
- Store publishing, checksums (SHA-256) and automated list releases are roadmap items, not done. Do not claim checksums anywhere until published.

## 8. Decisions log

- 2026-10-14: auto-reject design as in ROADMAP Phase 3 (opt-in, lease, reminder, tamper-resistant snooze, handler setting, reject-then-verify, per-site switch).
- 2026-10-14: snooze choices 7/14/30/60 days instead of every day 1-60 (maintainer).
- 2026-10-14: vendor-only TCF consent is its own verdict, not "Site records consent".
- 2026-10-14: objecting to legitimate interest by default PARKED (needs per-platform upkeep; maintainer wants to avoid list maintenance). Recorded in ROADMAP "Ideas parked for later". Only Google Funding Choices' autoconsent rule unticks LI.
- 2026-10-20: lease length 90 days confirmed.
- 2026-10-20: guide step 1 is Cloudflare when Cloudflare Tracking content was blocked on the tab (company exactly 'Cloudflare', category content; Insights/analytics and the unrelated cdn1cloudflare.xyz do not count). Allowing it is per company+category, so it also lets cdnjs and Cloudflare Stream through on that site; the guide says so. Request URLs aren't available to the popup/guide, so it can't single out challenges.cloudflare.com.
- 2026-10-20: maintainer wants "block all link pings and beacons" as its own opt-in setting (not built yet; ROADMAP "Planned small changes"). Vivaldi detection via brand "Vivaldi" in extension pages (web pages see "Google Chrome"; even Vivaldi's own "report as" setting only affects pages, not extension pages): add a profile in lib/browser.js, hedge Chrome wording. Not built yet. PR #3 ready for review.
- 2026-10-20: "Page seems broken?" guide added (maintainer request): short layman wording, one change at a time, explain the trade-off in one line, details behind "More about".
- Implemented without explicit confirmation (raised in PR #3, maintainer silent so far): cosmetic (hide-only) rules off; settings and reminder on one page; checksums not claimed.

## 9. Open questions for the maintainer

- Incognito, agreed direction (maintainer, 2026-10-20): any change made in a private window must stay in that private window (nothing persisted, nothing synced); a temporary on-disk file while the private window runs is fine if nothing remains after it closes; blocking takes priority over logging. Default for private windows should be Strict for every site (fresh start), because users may expect anonymity and a page that breaks is fixable with the guide while silent tracking is not. Planned: global setting "In private windows, start from my normal settings" (off by default); per-site "Use these settings in private windows"; a user-clicked "use these rules in normal browsing"; log reason "InPrivate: starts on Strict". Open: whether a fresh private start keeps tightening/general settings (category switches, companies set to Block, block-on-own-sites) and drops loosening ones (per-site levels/exceptions, company Allow): proposed yes, awaiting answer.
- Approach to prototype on its own branch: a separate private-window instance (manifest `incognito: "split"`) vs rules scoped to private tabs. Unverified, needs a real browser: is split storage separate and removed when the last private window closes; can the private instance read normal settings; can it write to them on an explicit click. Headless Playwright can't test private windows with the extension; the maintainer tests in InPrivate and checks the profile folder afterwards.
- PROTOTYPE (branch cu-dev/private-own-settings, unverified in a real private window; headless Playwright can't test it, a toggle of "Allow in incognito" reloads and then disables the extension in the container): manifest `incognito: "split"`; in the private instance (`chrome.extension.inIncognitoContext`) settings live in `chrome.storage.session` (core.js settingsStore/settingsArea/SETTINGS_KEYS/settingsChanged), start empty (everything Strict), changeable there, gone with the window. Private instance skips: engaged/history counting, cookie banner lease/guard/scripts (hasAccess false; it must never revoke the normal instance's permission), install-time options page. Popup 'Settings' opens options.html with tabs.create in private windows because openOptionsPage opens a normal window. Options page has a diagnostics box (names only) to compare normal vs private: storage areas' keys, dynamic rule count, enabled rulesets. FIRST REAL-BROWSER RESULT (Vivaldi 8.1 / Chromium 150, 2026-10-20): the private instance has SEPARATE dynamic rules (2031 vs 2032 with a normal-side Basic site) and its own settings (shows Strict for a site Basic in normal; its own changes don't reach normal); chrome.storage.sync and local are SHARED with the normal instance (private page sees normal's siteLevels in sync and engaged/seen in local; private never writes sync; it writes only company counts to local 'seen'); chrome.storage.session lives until the whole browser closes, NOT until the last private window closes, so core.js forgetPrivateSettings() is called by background.js on windows.onRemoved (no private windows left) and windows.onCreated (first private window). Not yet re-verified after that fix. To verify in InPrivate: separate storage? session store really emptied at close? dynamic rules separate (dynamicRules count, no normal rules)? sync/local keys shared with normal? Still to do: start from normal settings option, per-site 'use these settings in private windows', explicit transfer, cookie banners in private windows.
- Built before (stopgap in 0.9.0, read-only lock; replaced by the prototype above): detection, tint and note (the watermark was dropped: maintainer found it silly), controls disabled in private windows, no site names from private windows in the Trackers page list, private log entries tagged, shown only in private windows and dropped when the last private window closes, and a notice when the extension is not allowed in private windows. Behaviour in private windows is otherwise the same as normal (shared settings).

## 10. Maintainer's longer-term ideas (context only: DO NOT build unless explicitly asked)

- A website on the maintainer's own server now, a domain bought when the extension goes public. Theme: privacy education, easily digestible information on what data people give up when browsing.
- Extension feature: time-limited detailed logging of trackers blocked and allowed, exported in a human-readable format, cleaned of personal data (when and where a tracker was seen).
- Website offers an offline tool to open such an export, search sites and addresses, and delete entries before sharing (e.g. remove visits to sites the user doesn't want others to see).
- Goal: give people the tools and means to understand and act on tracking. Any of this would also have to respect the no-network rule inside the extension.
