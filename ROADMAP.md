# Strict Switch roadmap

Strict Switch aims to make serious tracker blocking usable by people who would never touch uBlock Origin's filter lists or Privacy Badger's settings. Four principles guide every feature:

- **Convenience:** one click to change a site's level, sensible defaults, no setup.
- **Control:** strict by default, opened up on demand: per site, per company, per category.
- **Transparency:** every block and every exception is visible, explained in plain language, and reportable.
- **Friendliness:** plain words over jargon, deeper detail only for those who click for it.

## Ground rules

These hold for every feature on this list.

- **No network access.** The manifest's content security policy stops the extension's pages and background worker from contacting any server. Tracker lists ship inside each release. Reports leave the browser only when the user copies or downloads them.
- **Broad permissions are opt-in.** The core blocker never needs to read web pages. Any feature that does (auto-reject, reading consent banners) asks for permission when it's switched on, and the permission expires unless renewed (see [Permission lease and reminder](#permission-lease-and-reminder)).
- **Hands off browser settings.** The extension never reads or changes browser settings it doesn't strictly need for blocking. Where a setting matters (like Do Not Track), it explains it and opens the settings page; the user decides.
- **Facts over opinions.** Claims about companies come from public sources (their own declarations, official registries, open research data), worded as "declares" or "is registered as", with the source named.
- **Indicators, not verdicts.** Evidence features say what was observed, how strong an indicator it is, and what it doesn't prove.

## Where we are (0.7)

- Strict, Balanced, Basic and Lockdown (Ctrl+click Strict) per site.
- Trackers blocked on their owners' own sites by default (stricter than Edge).
- Balanced opens only Social and Tracking content from companies you visit regularly, configurable.
- Per-company Block / Auto / Allow on the Trackers page.
- Popup groups blocked, allowed and category-off requests, with a "might break the page" list and per-site toggles.
- Activity log with reasons, folding of repeats and retry storms, and copy, download and "Report a problem" reports.
- Works in Edge, Chrome, Brave, Opera and other Chromium browsers, with wording that matches each browser's own protection.
- GitHub issue forms for broken sites, bugs and ideas.

## Next: friends beta

- [ ] Merge to `main` so the release workflow publishes the first GitHub release.
- [ ] A handful of testers across Edge, Chrome and Brave, for two weeks, reporting through the issue forms.
- [ ] Watch for: sites that only work on Basic, confusing wording, Lockdown and retry storms, performance on heavy sites.

## Store readiness (Chrome Web Store, Edge Add-ons)

- [ ] **Privacy policy** (`PRIVACY.md`): collects nothing, sends nothing; what is stored locally and why. The no-network manifest is the proof.
- [ ] **Permission justifications** for the listings. History and match feedback both show as "Read your browsing history"; explain both.
- [ ] **Data licensing.** Disconnect's list (and DuckDuckGo's Tracker Radar, if used) are CC BY-NC-SA 4.0: fine for a free project, unclear with donations, not fine with paid features. Before any Ko-fi or similar, email Disconnect for written permission, or plan an alternative source.
- [ ] **Automated list releases.** A scheduled workflow rebuilds the rulesets weekly, bumps the version if anything changed, and submits to both stores through their publishing APIs. Store installs update silently; sideloaded installs update manually.
- [ ] **Release checksums** (SHA-256) published with every GitHub release, so downloads can be verified.
- [ ] **Store identity.** Name check, icon, screenshots, short and long descriptions, and a Chrome-first explanation of the levels (Chrome has no Basic floor of its own).
- [ ] A `SECURITY.md` with how to report vulnerabilities privately.

## Phase 1: "I rejected", consent evidence (no new permissions)

Cookie banners' "Reject all" is often not respected. Studies (for example Matte, Bielova and Santos, "Do Cookie Banners Respect My Choice?", IEEE S&P 2020) found many sites register consent despite a refusal, or load trackers before and after it. Strict Switch already blocks most third-party trackers regardless, so this phase is about **turning the hunch into evidence**.

- [ ] **"I just rejected cookies here" button** in the popup. Marks the moment for the site; the popup and log then flag every tracker request attempted afterwards.
- [ ] **Read Google Consent Mode signals** from blocked request addresses (the `gcs` / `gcd` parameters) before the query string is stripped. A request saying "consent granted" after the user rejected is a strong indicator; "denied" pings are noted too (Google's "advanced" Consent Mode still sends cookieless pings, which is debated in the EU).
- [ ] **Evidence grading:** weak (a tracker was attempted after rejecting), moderate (repeatedly, or from vendors that need consent), strong (a consent-granted signal after rejecting). Blocked attempts are labelled as such: the site tried, nothing was sent.
- [ ] **Region-aware evidence report.** The user picks a region in settings (never detected automatically):
  - EU/EEA: ePrivacy and GDPR context, the national data protection authority (for Denmark, Datatilsynet), and noyb.
  - UK: UK GDPR and PECR, the ICO.
  - US states with universal opt-out laws: kept as a dated data file, verified at release time.
  - Always: "one observation is an indicator worth looking into, not proof".

## Phase 2: education layer

An optional layer under the existing UI: the popup stays simple; clicking a company opens an "About" card; a "Why this matters" section goes deeper.

- [x] **First explainer:** "Do Not Track: on or off?" in settings (0.7.1).
- [ ] **Category explainers** written once, in plain language: what advertising, analytics, social, fingerprinting, cryptomining and tracking content requests do.
- [ ] **Company cards** built from public data at release time:
  - What the company **declares** it uses data for (IAB Global Vendor List purposes: profiling for personalised ads, precise location, device linking...).
  - Whether it is a **registered data broker** (California and Vermont registries).
  - How **widespread** it is and whether it fingerprints (DuckDuckGo Tracker Radar).
  - Each fact with its source and date.
- [ ] Check licensing for the Global Vendor List and Tracker Radar before bundling.
- [ ] Open question: facts only, or also a simple "privacy impact" rating? Facts are safer; ratings are friendlier but invite disputes.

## Phase 3: optional "read pages" features

All of these need permission to read web pages, so they are off by default and asked for only when switched on.

- [ ] **Read the banner's consent record** (IAB TCF, used by most EU banners) to know exactly which vendors and purposes the user accepted or rejected, including "legitimate interest" toggles, and compare with what tried to load. One standard, no per-site upkeep.
- [ ] **Global Privacy Control** (`Sec-GPC` header and `navigator.globalPrivacyControl`). Legally binding in California and several other US states; not formally recognised in the EU.
- [ ] **Auto-reject, per banner vendor rather than per site.** Most banners come from a handful of vendors (OneTrust, Cookiebot, Didomi, Usercentrics, Quantcast, Sourcepoint, TrustArc and a few more), each with its own built-in "reject all" command that doesn't change when a site redesigns. That's about ten recipes to maintain instead of thousands of sites (the weak spot of rule-per-site tools like Consent-O-Matic).
  - Generic fallback, off by default and labelled "best effort": find a cookie-shaped overlay and a "Reject all" / "Afvis alle" / "Only necessary" button in common languages. Never clicks anything resembling "accept"; logs what it clicked.
  - **Reject, then verify:** read the consent record back to confirm the rejection registered, feeding Phase 1's evidence.

### Permission lease and reminder

Extensions with broad access have been sold or changed direction after years of trust. Users forget what they granted. So:

- [ ] **The permission expires.** After a set period the extension hands it back to the browser unless the user renews it. Forgetting means "it switched itself off", not "it's still on years later".
- [ ] **Recurring reminder**, every 7 days by default, snoozable for 1 to 60 days:
  > **Strict Switch can still read every site you visit.** You allowed this on [date] so auto-reject could work. It runs only on your computer, and nothing is sent anywhere unless you send a report yourself. [Keep] [Turn it off now] [Remind me in…]
- [ ] **Shown three ways** so it can't be silently missed: a system notification, a "!" badge on the toolbar icon, and a banner in the popup until acknowledged.
- [ ] **Tamper-resistant snooze:**
  - Stored where web pages and content scripts can't reach it (extension-only storage), never in the shared settings storage content scripts can write.
  - Changed only from the extension's own reminder page, by a click.
  - Stored as an absolute date the extension computes, with the choice clamped to 1 to 60 days. Anything unreadable or more than 60 days away counts as "remind now", so tampering can only make the reminder appear **sooner**.
  - No messaging channel to other extensions, so they can't touch it.
- [ ] **The reminder page explains itself.** A short apology for the odd location, and a collapsible "Why is this stored here?" explaining how auto-reject works, why page scripts are kept away from this setting, and what it means if reminders keep appearing sooner than chosen ("something may be interfering").
- [ ] **Show how the extension was installed** (store, unpacked folder...) next to the list of genuine sources:
  - the Chrome Web Store listing,
  - the Edge Add-ons listing,
  - GitHub releases from `github.com/MotziKceb/EdgeExtension`, with SHA-256 checksums.

  Anything else is a red flag.

## Ideas parked for later

- Cookie clean-up after rejecting (needs the cookies permission and broad access; can log users out).
- CNAME-cloaked tracker detection (trackers hidden behind a site's own subdomain). Extensions can't see DNS records in Chromium; would need a published list.
- Firefox port (its declarativeNetRequest support differs).
