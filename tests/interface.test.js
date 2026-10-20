// The popup, activity log, reports, site settings, browser wording and the
// network lock.

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, requests, startServer, waitFor } from './helpers.js';

const TRACKERS = ['googleads.g.doubleclick.net', 'fonts.googleapis.com', 'static.criteo.net', 'connect.facebook.net'];

let site;
let env;

before(async () => {
  site = await startServer((host, port) => {
    if (host === 'storm.test') {
      // Hammers one blocked domain at many different addresses, like a page
      // retrying what's blocked.
      return `<script>
        for (let i = 0; i < 300; i++) new Image().src = 'http://rr1.googlevideo.com:${port}/videoplayback/' + i;
      </script>`;
    }
    // Cloudflare's human check, its visitor statistics, and a lookalike.
    if (host === 'cf.test') return requests(['challenges.cloudflare.com', 'static.cloudflareinsights.com'], port);
    if (host === 'cfstats.test') return requests(['static.cloudflareinsights.com', 'cdn1cloudflare.xyz'], port);
    return requests(TRACKERS, port);
  });
  env = await launch(site);
});
after(async () => {
  assert.deepEqual(env.errors, [], 'no page errors');
  await env.close();
  site.server.close();
});
beforeEach(() => env.reset());

// Waits until the tab's matched rules include at least n requests.
const matchedAtLeast = (tabId, n) => waitFor(async () => (await env.sw.evaluate(
  (id) => chrome.declarativeNetRequest.getMatchedRules({ tabId: id }),
  tabId,
)).rulesMatchedInfo.length >= n, { message: `${n} matched requests` });

test('popup sums up the page and offers fixes for what might break it', async () => {
  const { page, tabId } = await env.openTab('news.test');
  await matchedAtLeast(tabId, 4);
  const popup = await env.popup(tabId, 'news.test');
  await waitFor(async () => Number(await popup.textContent('#n-blocked')) > 0, { message: 'popup counts' });
  assert.equal(await popup.textContent('#n-blocked'), '3');
  assert.equal(await popup.textContent('#n-off'), '1');
  const rows = await popup.$$eval('#break-list .break-title', (l) => l.map((x) => x.textContent));
  assert.deepEqual(rows, ['Meta · Social'], 'Social on a third-party site may break it; ads are left out');
  assert.equal(await popup.isVisible('#site-settings'), true);
  await popup.close();
  await page.close();
});

test('"Page seems broken?" tries one thing at a time and puts back what didn\'t help', async () => {
  const { page, tabId } = await env.openTab('news.test');
  await matchedAtLeast(tabId, 4);
  const popup = await env.popup(tabId, 'news.test');
  await popup.evaluate(() => {
    window.openedUrls = [];
    chrome.tabs.create = async ({ url }) => window.openedUrls.push(url);
  });
  await popup.click('#fix');
  const [url] = await popup.evaluate(() => window.openedUrls);
  assert.equal(url, env.ext(`options/fix.html?site=news.test&tab=${tabId}`));
  await popup.close();

  const guide = await env.ctx.newPage();
  await guide.goto(url);
  // Social on a third-party site is the likeliest culprit; ads aren't tried.
  await waitFor(async () => (await guide.textContent('#step-title')) === 'Allow Meta (Social) on this site', { message: 'first step' });
  assert.match(await guide.textContent('#step-tradeoff'), /^If it helps: Allowing it lets Meta see that you visited this site/);
  assert.match(await guide.textContent('#step-count'), /^Step 1 of 3$/, 'Meta, then Balanced, then Basic');
  await guide.click('#apply');
  await waitFor(() => guide.isVisible('#ask-actions'), { message: 'the question' });
  assert.deepEqual((await env.core('getSettings')).siteAllows['news.test'], ['Meta:social']);
  await guide.click('#no');
  await waitFor(async () => (await guide.textContent('#step-title')) === 'Set this site to Balanced', { message: 'next step' });
  assert.equal((await env.core('getSettings')).siteAllows['news.test'], undefined, 'put back');
  await guide.click('#apply');
  await waitFor(() => guide.isVisible('#ask-actions'), { message: 'the question' });
  await guide.click('#yes');
  await waitFor(() => guide.isVisible('#fixed'), { message: 'fixed' });
  assert.equal((await env.core('getSettings')).siteLevels['news.test'], 'balanced', 'the fix is kept');
  const events = await waitFor(async () => {
    const e = (await env.log()).filter((x) => x.kind === 'event').map((x) => x.text);
    return e.includes('Site news.test set to Balanced') && e;
  }, { message: 'logged' });
  assert.ok(events.includes('Allowed Meta social on news.test'));
  await guide.close();
  await page.close();
});

test('the guide puts a blocked Cloudflare check first, and ignores Cloudflare\'s statistics and lookalikes', async () => {
  // Tracking content (where the human check lives) is off by default.
  await env.core('setSiteCategory', 'cf.test', 'content', true);
  const { page, tabId } = await env.openTab('cf.test');
  await matchedAtLeast(tabId, 2);
  const guide = await env.ctx.newPage();
  await guide.goto(env.ext(`options/fix.html?site=cf.test&tab=${tabId}`));
  await waitFor(async () => (await guide.textContent('#step-title')) === 'Allow Cloudflare\'s checks on this site', { message: 'Cloudflare first' });
  assert.match(await guide.textContent('#step-count'), /^Step 1 of 3$/, 'Cloudflare, then Balanced, then Basic: not listed twice');
  assert.match(await guide.textContent('#step-what'), /Verify you are human/);
  await guide.click('#apply');
  await waitFor(() => guide.isVisible('#ask-actions'), { message: 'the question' });
  assert.deepEqual((await env.core('getSettings')).siteAllows['cf.test'], ['Cloudflare:content']);
  await guide.click('#yes');
  await waitFor(() => guide.isVisible('#fixed'), { message: 'fixed' });
  await guide.close();
  await page.close();

  // Only the statistics beacon and the lookalike are blocked: no Cloudflare step.
  await env.core('setSiteCategory', 'cfstats.test', 'content', true);
  const other = await env.openTab('cfstats.test');
  await matchedAtLeast(other.tabId, 2);
  const second = await env.ctx.newPage();
  await second.goto(env.ext(`options/fix.html?site=cfstats.test&tab=${other.tabId}`));
  await waitFor(async () => (await second.textContent('#step-title')).length > 0, { message: 'first step' });
  assert.ok(!(await second.textContent('#step-title')).includes('Cloudflare'), 'statistics and lookalikes are not the human check');
  await second.close();
  await other.page.close();
});

test('Ctrl+click on Strict switches the site to Lockdown', async () => {
  const { page, tabId } = await env.openTab('news.test');
  const popup = await env.popup(tabId, 'news.test');
  await popup.click('[data-level=strict]', { modifiers: ['Control'] });
  await waitFor(async () => (await env.core('getSettings')).siteLevels['news.test'] === 'lockdown', { message: 'Lockdown' });
  await popup.close();
  await page.close();
});

test('the activity log explains each request, folds retry storms and records changes', async () => {
  await env.core('setSiteCategory', 'news.test', 'advertising', false);
  // Entries from earlier tests can still be on their way to the log.
  const since = Date.now();
  await env.visit('news.test');
  await env.visit('storm.test');
  const log = await waitFor(async () => {
    const entries = (await env.log()).filter((e) => e.time >= since);
    return entries.some((e) => e.site === 'storm.test' && e.count >= 300) && entries.some((e) => e.site === 'news.test') && entries;
  }, { message: 'log entries' });

  const reason = (host) => {
    const e = log.find((x) => x.site === 'news.test' && x.url?.startsWith(host));
    return `${e.group}: ${e.kind}`;
  };
  assert.equal(reason('googleads.g.doubleclick.net'), 'off: site-category-off');
  assert.equal(reason('fonts.googleapis.com'), 'off: category-off');
  assert.equal(reason('connect.facebook.net'), 'blocked: strict');
  const storm = log.filter((e) => e.site === 'storm.test');
  assert.equal(storm.length, 1, 'many addresses fold into one entry');
  assert.equal(storm[0].aggregate, true);
  const events = (await env.log()).filter((e) => e.kind === 'event').map((e) => e.text);
  assert.ok(events.includes('Advertising switched off for news.test'));
});

test('reports keep settings changes and open the right issue form', async () => {
  await env.core('setSiteLevel', 'news.test', 'balanced');
  await env.visit('news.test');
  await waitFor(async () => (await env.log()).some((e) => e.site === 'news.test'), { message: 'log entries' });
  const page = await env.ctx.newPage();
  await env.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    window.opened = [];
    chrome.tabs.create = async ({ url }) => window.opened.push(url);
  });
  await page.goto(env.ext('options/log.html'));
  await page.fill('#search', 'news.test');
  await page.click('#report');
  await waitFor(() => page.evaluate(() => window.opened.length), { message: 'issue form' });
  assert.equal(
    (await page.evaluate(() => window.opened))[0],
    'https://github.com/MotziKceb/strict-switch/issues/new?template=site-broken.yml&title=Broken%20site%3A%20news.test&site=news.test',
  );
  const report = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(report, /^# Strict Switch report/);
  assert.match(report, /Sites: news\.test \(Balanced\)/);
  assert.match(report, /\*\* Site news\.test set to Balanced/, 'settings changes are kept whatever the search');
  await page.close();
});

test('site settings say they only apply to that site', async () => {
  const page = await env.ctx.newPage();
  await page.goto(env.ext('options/site.html?site=news.test'));
  await waitFor(async () => (await page.textContent('#title')) === 'Settings for news.test', { message: 'site page' });
  assert.match(await page.textContent('#scope'), /only apply to news\.test and its subdomains/);
  await page.click('#categories input[aria-label="Advertising on news.test"]', { force: true });
  await waitFor(async () => (await env.core('getSettings')).siteCategories['news.test']?.advertising === false, { message: 'override' });
  await waitFor(async () => (await page.textContent('#categories li:first-child .state')).startsWith('Changed for this site'), { message: 'label' });
  await page.close();
});

test('wording matches each browser\'s own protection', async () => {
  const fakes = {
    'Set Edge to Basic': () => Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Microsoft Edge' }] }) }),
    'Works alongside Brave Shields': () => Object.defineProperty(navigator, 'brave', { get: () => ({}) }),
    'Works alongside Opera\'s blocker': () => Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Opera' }] }) }),
    // Vivaldi is Chrome to web pages, but lists itself in the extension's own pages.
    'Works alongside Vivaldi\'s blocker': () => Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Chromium' }, { brand: 'Vivaldi' }] }) }),
    'No built-in safety net': () => Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Google Chrome' }] }) }),
  };
  for (const [title, fake] of Object.entries(fakes)) {
    const page = await env.ctx.newPage();
    await page.addInitScript(fake);
    await page.goto(env.ext('options/options.html'));
    await waitFor(async () => (await page.textContent('.callout h2')) === title, { message: title });
    await page.close();
  }
});

test('cookie banner handling is off until switched on, and asks for nothing at install', async () => {
  const granted = await env.sw.evaluate(() => chrome.permissions.getAll());
  assert.deepEqual(granted.origins, [], 'no site access');
  assert.ok(!granted.permissions.includes('scripting') && !granted.permissions.includes('notifications'));
  assert.deepEqual(await env.sw.evaluate(() => chrome.scripting?.getRegisteredContentScripts() ?? []), []);
  await waitFor(async () => (await env.helper.textContent('#banners-status')).startsWith('Off.'), { message: 'settings status' });
  const page = await env.ctx.newPage();
  await page.goto(env.ext('options/banners.html'));
  await waitFor(() => page.isVisible('#turn-on'), { message: 'Switch on button' });
  assert.equal(await page.isVisible('#access-on'), false);
  assert.match(await page.textContent('#install'), /loaded from a folder in Developer mode/);
  await page.close();
});

// Private windows: the browser reports them through the window, which the
// tests fake (the test browser has no private window with the extension in).
const asPrivateWindow = () => {
  chrome.windows.getCurrent = async () => ({ incognito: true });
};

test('in a private window the popup is tinted, says every site starts on Strict, and stays usable', async () => {
  const { page, tabId } = await env.openTab('news.test');
  await matchedAtLeast(tabId, 4);
  const popup = await env.ctx.newPage();
  await popup.addInitScript(asPrivateWindow);
  await popup.addInitScript(([id, url]) => {
    chrome.tabs.query = async () => [{ id, url, incognito: true }];
    window.close = () => {};
  }, [tabId, `http://news.test:${site.port}/`]);
  await popup.goto(env.ext('popup/popup.html'));
  await waitFor(() => popup.isVisible('#incognito-note'), { message: 'the private window note' });
  assert.equal(await popup.evaluate(() => document.body.classList.contains('incognito')), true);
  assert.match(await popup.textContent('#incognito-note'), /^(Incognito|InPrivate|Private|Private browsing) window\. Every site starts on Strict\. Changes you make here stay in this .* window and are forgotten when it closes\.$/);
  assert.equal(await popup.isDisabled('[data-level=basic]'), false, 'settings can be changed in a private window');
  assert.equal(await popup.isVisible('#fix'), true);
  await popup.close();
  await page.close();
});

test('settings changed in a private window stay in memory and never reach normal settings or sync', async () => {
  const page = await env.ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(chrome.extension, 'inIncognitoContext', { get: () => true });
  });
  await page.goto(env.ext('options/options.html'));
  const settings = await page.evaluate(async () => {
    const core = await import(chrome.runtime.getURL('lib/core.js'));
    const before = await core.getSettings();
    await core.setSiteLevel('private.test', 'basic');
    return { before: before.siteLevels, after: (await core.getSettings()).siteLevels, area: core.settingsArea() };
  });
  assert.equal(settings.area, 'session');
  assert.deepEqual(settings.before, {}, 'a private window starts with everything on Strict');
  assert.deepEqual(settings.after, { 'private.test': 'basic' }, 'and can change it');
  const stored = await env.sw.evaluate(async () => ({
    sync: Object.keys(await chrome.storage.sync.get(null)),
    local: JSON.stringify(await chrome.storage.local.get(null)),
  }));
  assert.ok(!stored.sync.includes('siteLevels'), 'nothing in sync');
  assert.ok(!stored.local.includes('private.test'), 'nothing on disk');
  assert.equal((await env.core('getSettings')).siteLevels['private.test'], undefined, 'normal settings untouched');
  // The diagnostics box shows what the instance is doing, without values.
  await page.click('#diag summary');
  await waitFor(async () => (await page.textContent('#diag-text')).includes('settingsStore'), { message: 'diagnostics' });
  const diag = JSON.parse(await page.textContent('#diag-text'));
  assert.equal(diag.settingsStore, 'session');
  assert.ok(diag.sessionKeys.includes('siteLevels'));
  assert.ok(!JSON.stringify(diag).includes('private.test'), 'names only, no sites');
  await page.close();
});

test('private window browsing leaves no site names on disk, and its log entries go when it closes', async () => {
  const stub = await env.helper.evaluate(async () => {
    chrome.tabs.get = async () => ({ incognito: true });
    const activity = await import(chrome.runtime.getURL('lib/activity.js'));
    // Rule 1 of the Advertising ruleset, as a request from a private tab.
    await activity.recordMatch({ ruleId: 1, rulesetId: 'advertising' }, { url: 'http://tracker.test/t.gif', initiator: 'http://private-site.test', type: 'image', tabId: 4242 });
    return true;
  });
  assert.ok(stub);
  const entry = await waitFor(async () => (await env.log()).find((e) => e.site === 'private-site.test'), { message: 'the log entry' });
  assert.equal(entry.incognito, true, 'tagged as private');
  const seen = await env.sw.evaluate(async () => (await chrome.storage.local.get('seen')).seen ?? {});
  assert.ok(!JSON.stringify(seen).includes('private-site.test'), 'no site name in what\'s kept on disk');
  assert.ok(Object.keys(seen).length > 0, 'the company is still counted');
  // Shown only in private windows, and forgotten when the last one closes.
  const normal = await env.ctx.newPage();
  await normal.goto(env.ext('options/log.html?q=private-site.test'));
  await waitFor(async () => (await normal.textContent('#empty')).length > 0, { message: 'the log page' });
  assert.equal(await normal.locator('#entries tr').count(), 0, 'not shown in a normal window');
  await normal.close();
  await env.helper.evaluate(async () => (await import(chrome.runtime.getURL('lib/activity.js'))).forgetPrivateEntries());
  assert.equal((await env.log()).some((e) => e.incognito), false, 'forgotten');
});

test('private settings are cleared when the last private window closes', async () => {
  const result = await env.helper.evaluate(async () => {
    const core = await import(chrome.runtime.getURL('lib/core.js'));
    await chrome.storage.session.set({ siteLevels: { 'private.test': 'basic' }, bannerSitesOff: ['x.test'], log: [{ kind: 'event', time: 1, text: 'kept' }] });
    await core.forgetPrivateSettings();
    return chrome.storage.session.get(null);
  });
  assert.equal(result.siteLevels, undefined);
  assert.equal(result.bannerSitesOff, undefined);
  assert.ok(result.log, 'the log is handled separately');
});

test('a private session starts on Strict, or from normal settings, plus the sites you chose', async () => {
  const run = (privateStart) => env.helper.evaluate(async (privateStart) => {
    await chrome.storage.sync.set({
      siteLevels: { 'a.test': 'basic', 'b.test': 'balanced' },
      siteAllows: { 'b.test': ['Meta:social'] },
      categories: { content: true },
      bannerHandler: 'other',
      privateStart,
      privateFollowSites: ['a.test'],
    });
    const core = await import(chrome.runtime.getURL('lib/core.js'));
    await core.startPrivateSession();
    return chrome.storage.session.get(null);
  }, privateStart);
  const strict = await run('strict');
  assert.deepEqual(strict.siteLevels, { 'a.test': 'basic' }, 'only the site you chose, everything else Strict');
  assert.equal(strict.siteAllows, undefined);
  assert.equal(strict.categories, undefined, 'global settings are not carried over');
  assert.equal(strict.privateSessionStarted, true);
  const normal = await run('normal');
  assert.deepEqual(normal.siteLevels, { 'a.test': 'basic', 'b.test': 'balanced' });
  assert.deepEqual(normal.siteAllows, { 'b.test': ['Meta:social'] });
  assert.deepEqual(normal.categories, { content: true });
  assert.equal(normal.bannerHandler, undefined, 'cookie banner settings stay out of private windows');
  assert.equal(normal.privateStart, undefined);
});

test('keeping a private site in normal browsing replaces that site\'s normal settings, and nothing else', async () => {
  const sync = await env.helper.evaluate(async () => {
    await chrome.storage.sync.set({ siteLevels: { 'c.test': 'balanced', 'd.test': 'basic', 'e.test': 'lockdown' }, siteAllows: { 'd.test': ['Meta:social'] } });
    await chrome.storage.session.set({ siteLevels: { 'c.test': 'basic' }, siteAllows: { 'c.test': ['Criteo:advertising'] } });
    const core = await import(chrome.runtime.getURL('lib/core.js'));
    const mine = await core.privateSiteSettings('c.test');
    await core.keepInNormal('c.test'); // set in private: copied over
    await core.keepInNormal('d.test'); // nothing in private: back to Strict
    return { mine, sync: await chrome.storage.sync.get(['siteLevels', 'siteAllows']) };
  });
  assert.deepEqual(sync.mine, { siteLevels: 'basic', siteAllows: ['Criteo:advertising'] });
  assert.deepEqual(sync.sync.siteLevels, { 'c.test': 'basic', 'e.test': 'lockdown' }, 'c copied, d reset, e untouched');
  assert.deepEqual(sync.sync.siteAllows, { 'c.test': ['Criteo:advertising'] });
});

test('site settings: normal windows choose what private windows start with, private windows can keep a site', async () => {
  const normal = await env.ctx.newPage();
  await normal.goto(env.ext('options/site.html?site=news.test'));
  await waitFor(() => normal.isVisible('#private-follow'), { message: 'the private switch' });
  assert.equal(await normal.isVisible('#keep-section'), false, 'only private windows can keep');
  await normal.click('#private-follow', { force: true });
  await waitFor(async () => (await env.sw.evaluate(() => chrome.storage.sync.get('privateFollowSites'))).privateFollowSites?.includes('news.test'), { message: 'the site to be followed' });
  await normal.close();

  const privatePage = await env.ctx.newPage();
  await privatePage.addInitScript(() => {
    Object.defineProperty(chrome.extension, 'inIncognitoContext', { get: () => true });
    chrome.windows.getCurrent = async () => ({ incognito: true });
    window.confirm = () => true;
  });
  await privatePage.goto(env.ext('options/site.html?site=news.test'));
  await waitFor(async () => (await privatePage.textContent('#title')) === 'Settings for news.test', { message: 'site page' });
  assert.equal(await privatePage.isVisible('#private-site-section'), false, 'normal-window choice, hidden in private');
  assert.equal(await privatePage.isVisible('#keep-section'), false, 'nothing to keep yet');
  await privatePage.click('[data-level=basic]');
  await waitFor(() => privatePage.isVisible('#keep-section'), { message: 'the keep button' });
  assert.equal((await env.core('getSettings')).siteLevels['news.test'], undefined, 'not saved normally yet');
  await privatePage.click('#keep');
  await waitFor(async () => (await env.core('getSettings')).siteLevels['news.test'] === 'basic', { message: 'kept in normal settings' });
  await privatePage.close();
});

test('a site set back to Strict in a private window can still be kept in normal browsing', async () => {
  await env.helper.evaluate(async () => {
    await chrome.storage.sync.set({ siteLevels: { 'x.test': 'basic', 'y.test': 'balanced' } });
    // As if the private window started from a copy of the normal settings.
    await chrome.storage.session.set({ siteLevels: { 'x.test': 'basic', 'y.test': 'balanced' }, privateSessionStarted: true });
  });
  const page = await env.ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(chrome.extension, 'inIncognitoContext', { get: () => true });
    chrome.windows.getCurrent = async () => ({ incognito: true });
    window.confirm = () => true;
  });
  await page.goto(env.ext('options/site.html?site=x.test'));
  await waitFor(async () => (await page.textContent('#title')) === 'Settings for x.test', { message: 'site page' });
  assert.equal(await page.isVisible('#keep-section'), false, 'copied but not changed: nothing to keep');
  await page.click('[data-level=strict]');
  await waitFor(() => page.isVisible('#keep-section'), { message: 'the keep button, even though Strict leaves no entry' });
  await page.click('#keep');
  await waitFor(async () => (await env.core('getSettings')).siteLevels['x.test'] === undefined, { message: 'normal browsing back on Strict' });
  assert.equal((await env.core('getSettings')).siteLevels['y.test'], 'balanced', 'other sites untouched');
  await page.close();
});

test('settings say when the extension is switched off in private windows', async () => {
  const page = await env.ctx.newPage();
  await page.addInitScript(() => {
    chrome.extension.isAllowedIncognitoAccess = async () => false;
  });
  await page.goto(env.ext('options/options.html'));
  await waitFor(() => page.isVisible('#incognito-off'), { message: 'the notice' });
  assert.match(await page.textContent('#incognito-off h2'), /^Not switched on in (Incognito|InPrivate|Private|Private browsing) windows$/);
  await page.close();
});

test('the extension cannot reach the network', async () => {
  const page = await env.ctx.newPage();
  page.on('console', () => {}); // the refusals are logged as errors; that's expected
  await page.goto(env.ext('options/log.html'));
  const fromPage = await page.evaluate((port) => fetch(`http://example.test:${port}/`).then(() => 'reached', () => 'refused'), site.port);
  const fromWorker = await env.sw.evaluate((port) => fetch(`http://example.test:${port}/`).then(() => 'reached', () => 'refused'), site.port);
  assert.equal(fromPage, 'refused');
  assert.equal(fromWorker, 'refused');
  const ownFiles = await page.evaluate(() => fetch('../rules/meta.json').then((r) => r.ok));
  assert.equal(ownFiles, true, 'its own files still load');
  await page.close();
});
