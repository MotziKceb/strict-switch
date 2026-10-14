# Strict Switch beta: tester guide

Thanks for trying Strict Switch! This guide gets you set up in five minutes, shows you around, and explains what feedback helps most.

**What it is:** a browser extension that blocks trackers strictly by default, lets you loosen things per site or per company in a click when something breaks, and explains every decision in plain language. It never connects to the internet and collects nothing (see [PRIVACY.md](PRIVACY.md)).

**What we're testing:** whether it's easy to live with day to day. Sites that break, wording that confuses you and moments where you weren't sure what happened all count as useful findings. You don't need to know anything about trackers.

## 1. Install (5 minutes)

Strict Switch isn't in the extension stores yet, so it's installed from a folder.

1. Download `strict-switch-*.zip` from the [latest release](https://github.com/MotziKceb/Strict-Switch/releases/latest).
2. Extract it to a folder you'll **keep**, for example `Documents\Strict Switch`. Your browser runs the extension from that folder, so don't delete it.
3. Open your browser's extensions page by typing this in the address bar:
   - Edge: `edge://extensions`
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
   - Vivaldi: `vivaldi://extensions`
4. Turn on **Developer mode** (a switch on that page; in Edge it's on the left).
5. Click **Load unpacked** and choose the folder from step 2.
6. A settings page opens with a note about your browser's own protection.
   - **Edge users:** follow it and set Edge's tracking prevention to **Basic**. Strict Switch takes over the strict part.
7. Pin the extension: click the puzzle-piece icon next to the address bar, then the pin next to **Strict Switch**.

Your browser may show a reminder about developer-mode extensions when it starts. It's safe to dismiss.

## 2. A quick tour (5 minutes)

Open a news site (they're full of trackers) and click the Strict Switch icon.

- **The number on the icon** is how many requests were blocked on this tab.
- **The levels:** Strict (the default) blocks trackers. **Balanced** relaxes things for companies you use a lot, to fix broken logins or videos. **Basic** turns Strict Switch off for this site. **Ctrl+click Strict** (Cmd+click on a Mac) for **Lockdown**, which blocks absolutely every known tracker on that site.
- **The summary:** trackers blocked, trackers allowed, and requests not blocked because their category is switched off (usually videos, images and fonts).
- **"Might break the page":** if something on the site doesn't work, this is where to look. Each row has a switch that allows just that one thing on just this site. Flip it, then click **Reload page to apply**.
- **Site settings** (next to the site name): everything for this one site, including its own tracker categories.
- **Trackers** (bottom): every tracking company caught so far. Search for one and set it to Block, Auto or Allow.
- **Log** (bottom): every request on this site, what happened and why, in plain words.

## 3. Your first week

Just browse as usual. Along the way, try these when they come up naturally:

- [ ] **A site breaks.** Something doesn't load, a login button does nothing, comments are missing. Try the "might break the page" switches first, then Balanced, then Basic. Note what fixed it.
- [ ] **A login with Google, Facebook or Apple.**
- [ ] **A video site and a shop**, including a checkout page if you're buying something anyway.
- [ ] **Lockdown** on a site you don't trust much (Ctrl+click Strict).
- [ ] **Block a company** you'd rather not be tracked by, on the Trackers page.
- [ ] **Send one report**, even if nothing went wrong, so we know reporting works for you (see below).

## 4. Reporting a problem

1. On the site with the problem, open the Strict Switch popup and click **Log**.
2. Click **Report a problem**. It copies a report and opens a form on GitHub.
3. Fill in what broke and what fixed it, and paste the report into the last box.
4. **Read the report before posting.** GitHub issues are public, and the report lists sites from your log. Delete any lines you don't want to share.

You need a free GitHub account to post. If you don't have one, use **Download report** in the log instead and send the file to whoever invited you.

Ideas and "this was confusing" count as feedback too. There's a form for ideas on the same GitHub page.

## 5. Things we already know

- **It's installed in developer mode** until it's in the stores. That's normal for testing.
- **It doesn't update itself.** When there's a new release: download it, extract it over the same folder, and click the reload button on the extension's card on your extensions page. Your settings are kept.
- **The log empties when you close the browser.** That's deliberate (less stored about you), so make reports before closing.
- **In Chrome, "Basic" means no tracker blocking at all.** Chrome has no tracker blocking of its own, unlike Edge, Brave or Opera.
- **Some sites retry what's blocked.** YouTube in Lockdown can rack up thousands of blocked requests. That's the site, not the extension.
- **Some logins are slower on Strict.** For example, Instagram waits a moment for blocked Facebook lookups before carrying on. Balanced fixes it if it bothers you.

## 6. Questions we'd love answered

After a week or two, a few sentences on any of these help a lot:

1. Did a site break that you couldn't fix with the popup? Which one?
2. Was there a moment you didn't understand what Strict Switch did or why?
3. Which part did you actually use: the levels, "might break the page", site settings, the Trackers page, the log?
4. Is anything in the popup clutter you'd remove?
5. Would you keep using it after the beta?

## 7. Leaving the beta

Remove Strict Switch on your extensions page; that deletes everything it stored. **Edge users:** set Edge's tracking prevention back to Balanced or Strict afterwards (Settings > Privacy, search and services), since you set it to Basic during setup.

Thank you!
