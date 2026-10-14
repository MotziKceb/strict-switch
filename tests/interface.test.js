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
