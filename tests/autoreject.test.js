// Cookie banners: auto-reject with autoconsent, reading the consent record
// back, the per-site switch, the other handlers, and the permission lease
// and reminder. Runs a copy of the extension with the optional permissions
// already granted.

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { grantedCopy, launch, startServer, waitFor } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;

// A banner autoconsent knows (its "Adroll" rule), with an IAB TCF API and
// Google Consent Mode. On liar.test the site records consent whatever you
// click.
const bannerPage = (host) => `<!doctype html>
<div id="adroll_consent_container" style="position:fixed;bottom:0;left:0;right:0;padding:20px;background:#eee">
  We use cookies.
  <button id="adroll_consent_accept">Accept all</button>
  <button id="adroll_consent_reject">Reject all</button>
</div>
<p>Article text.</p>
<script>
  window.choice = null;
  let status = 'cmpuishown';
  let consents = {};
  window.__tcfapi = (command, version, callback) => {
    if (command !== 'getTCData') return;
    callback({
      tcString: window.choice === null ? '' : 'CPtest', eventStatus: status, gdprApplies: true, cmpId: 7,
      purpose: { consents, legitimateInterests: { 2: true, 7: true } },
      vendor: { consents: consents[1] ? { 1: true, 2: true } : {}, legitimateInterests: { 1: true } },
    }, true);
  };
  window.dataLayer = [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  function choose(accept) {
    window.choice = accept;
    status = 'useractioncomplete';
    const granted = accept || ${JSON.stringify(host.startsWith('liar.'))};
    consents = granted ? { 1: true, 2: true } : {};
    const v = granted ? 'granted' : 'denied';
    gtag('consent', 'update', { ad_storage: v, analytics_storage: v, ad_user_data: v, ad_personalization: v });
    document.getElementById('adroll_consent_container').remove();
  }
  document.getElementById('adroll_consent_accept').addEventListener('click', () => choose(true));
  document.getElementById('adroll_consent_reject').addEventListener('click', () => choose(false));
</script>`;

let site;
let env;
let banners;

before(async () => {
  site = await startServer((host) => bannerPage(host));
  env = await launch(site, { dir: grantedCopy() });
  // The Cookie banners page: where the feature is switched on, and the only
  // place the lease and reminder change.
  banners = await env.ctx.newPage();
  await banners.goto(env.ext('options/banners.html'));
  await banners.click('#turn-on');
  await waitFor(async () => (await env.sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 2, {
    message: 'content scripts registered',
  });
});
after(async () => {
  assert.deepEqual(env.errors, [], 'no page errors');
  await env.close();
  site.server.close();
});

const call = (module, fn, ...args) => env.call(module, fn, ...args);
const bannerLog = async (host) => (await env.log()).filter((e) => e.kind === 'banner' && e.site === host);

beforeEach(async () => {
  await env.sw.evaluate(() => chrome.storage.session.remove('log'));
  await env.sw.evaluate(() => chrome.storage.sync.remove(['bannerHandler', 'bannerSitesOff']));
  await call('lib/banners.js', 'syncContentScripts');
});

async function openSite(host) {
  site.hits.length = 0;
  const page = await env.ctx.newPage();
  await page.goto(`http://${host}:${site.port}/`);
  return page;
}

test('switching it on starts a 90-day lease with a reminder in 7 days', async () => {
  const guard = await call('lib/guard.js', 'readGuard');
  assert.ok(Math.abs(guard.expiresAt - (Date.now() + 90 * DAY)) < 60000);
  assert.ok(Math.abs(guard.remindAt - (Date.now() + 7 * DAY)) < 60000);
  assert.match(await banners.textContent('#access-dates'), /Access ends on .+ unless you click Keep\. Next reminder: /);
});

test('rejects a known banner, never accepts, and confirms it in the consent record', async () => {
  const page = await openSite('cmp.test');
  const [entry] = await waitFor(() => bannerLog('cmp.test').then((l) => l.length && l), { message: 'banner entry', timeout: 20000 });
  assert.equal(await page.evaluate(() => window.choice), false, 'rejected, not accepted');
  assert.equal(entry.platform, 'Adroll');
  assert.equal(entry.action, 'rejected');
  assert.deepEqual(entry.clicked, ['Reject all']);
  assert.equal(entry.verdict, 'confirmed');
  assert.match(entry.detail, /IAB TCF: no consent for any purpose or vendor\./);
  assert.match(entry.detail, /2 purposes and 1 vendor still claim "legitimate interest"/);
  assert.match(entry.detail, /Google Consent Mode: everything denied\./);
  assert.deepEqual([...new Set(site.hits)], ['cmp.test'], 'nothing but the page itself was requested');
  await page.close();
});

test('flags a site that records consent after the rejection', async () => {
  const page = await openSite('liar.test');
  const [entry] = await waitFor(() => bannerLog('liar.test').then((l) => l.length && l), { message: 'banner entry', timeout: 20000 });
  assert.equal(await page.evaluate(() => window.choice), false);
  assert.equal(entry.verdict, 'contradicted');
  assert.match(entry.detail, /IAB TCF: consent given for 2 purposes and 2 vendors\./);
  assert.match(entry.detail, /Google Consent Mode: ad_storage, analytics_storage, ad_user_data, ad_personalization granted\./);
  await page.close();
});

test('the per-site switch leaves that site\'s banner alone', async () => {
  await call('lib/banners.js', 'setBannerSite', 'cmp.test', false);
  const page = await openSite('www.cmp.test');
  await new Promise((r) => setTimeout(r, 4000));
  assert.equal(await page.evaluate(() => window.choice), null);
  assert.equal(await page.isVisible('#adroll_consent_container'), true);
  assert.deepEqual(await bannerLog('cmp.test'), []);
  await page.close();
});

test('when you click yourself, Strict Switch only checks the record', async () => {
  await call('lib/banners.js', 'setBannerHandler', 'nobody');
  await call('lib/banners.js', 'syncContentScripts');
  assert.deepEqual((await env.sw.evaluate(() => chrome.scripting.getRegisteredContentScripts())).map((s) => s.id), ['consent-watch']);
  const page = await openSite('cmp.test');
  await new Promise((r) => setTimeout(r, 3500)); // the watcher reads the record as the page loaded
  assert.equal(await page.evaluate(() => window.choice), null, 'the banner is left alone');
  await page.click('#adroll_consent_reject');
  const [entry] = await waitFor(() => bannerLog('cmp.test').then((l) => l.length && l), { message: 'check entry' });
  assert.equal(entry.action, 'choice');
  assert.equal(entry.by, 'you');
  assert.equal(entry.verdict, 'confirmed');
  assert.equal(entry.hint, null);
  await page.close();

  // A click made by a script, like another extension's.
  const other = await openSite('cmp.test');
  await new Promise((r) => setTimeout(r, 3500));
  await other.evaluate(() => document.getElementById('adroll_consent_reject').click());
  const entries = await waitFor(() => bannerLog('cmp.test').then((l) => l.length > 1 && l), { message: 'second check entry' });
  assert.equal(entries[1].by, 'script');
  assert.equal(entries[1].hint, 'It looks like another extension handled this banner.');
  await other.close();
});

test('the reminder can only move by a click on the Cookie banners page', async () => {
  const helperTried = await env.helper.evaluate(async () => {
    const guard = await import(chrome.runtime.getURL('lib/guard.js'));
    return guard.snooze(new MouseEvent('click'), 60).then(() => 'changed', (e) => e.message);
  });
  assert.match(helperTried, /only be changed on the Cookie banners page/);
  const scriptedClick = await banners.evaluate(async () => {
    const guard = await import(chrome.runtime.getURL('lib/guard.js'));
    return guard.snooze(new MouseEvent('click'), 60).then(() => 'changed', (e) => e.message);
  });
  assert.match(scriptedClick, /only be changed by a click/);
});

// Writes straight to the store, as something tampering with it might.
const tamper = (value) => banners.evaluate((value) => new Promise((resolve, reject) => {
  const request = indexedDB.open('strict-switch-guard', 1);
  request.onsuccess = () => {
    const tx = request.result.transaction('guard', 'readwrite');
    tx.objectStore('guard').put(value, 'banners');
    tx.oncomplete = () => { request.result.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
}), value);

const runGuardCheck = async () => {
  await env.sw.evaluate(() => chrome.alarms.create('banners-guard', { when: Date.now() }));
  await new Promise((r) => setTimeout(r, 1500));
};

test('a tampered reminder date comes sooner, shown on the badge, in the popup and on the page', async () => {
  const now = Date.now();
  await tamper({ grantedAt: now - DAY, expiresAt: now + 30 * DAY, remindAt: now + 365 * DAY });
  await runGuardCheck();
  assert.equal(await env.sw.evaluate(() => chrome.action.getBadgeText({})), '!');

  const { page, tabId } = await env.openTab('news.test');
  const popup = await env.popup(tabId, 'news.test');
  await waitFor(() => popup.isVisible('#reminder'), { message: 'popup reminder' });
  await popup.close();
  await page.close();

  await banners.reload();
  await waitFor(async () => (await banners.getAttribute('#access', 'class')).includes('due'), { message: 'due reminder' });
  assert.equal(await banners.textContent('#access-title'), 'Strict Switch can still read every site you visit.');
  await banners.selectOption('#snooze-days', '14');
  await banners.click('#snooze');
  await waitFor(async () => !(await banners.getAttribute('#access', 'class')).includes('due'), { message: 'reminder answered' });
  const guard = await call('lib/guard.js', 'readGuard');
  assert.ok(Math.abs(guard.remindAt - (Date.now() + 14 * DAY)) < 60000);
  assert.equal(await env.sw.evaluate(() => chrome.action.getBadgeText({})), '');
});

test('when the lease runs out, access is handed back', async () => {
  // Required permissions can't really be removed in this test copy, so
  // record the request instead.
  await env.sw.evaluate(() => {
    self.removed = [];
    chrome.permissions.remove = async (p) => { self.removed.push(p); return true; };
  });
  const now = Date.now();
  await tamper({ grantedAt: now - 91 * DAY, expiresAt: now - 1000, remindAt: now + DAY });
  await runGuardCheck();
  const removed = await env.sw.evaluate(() => self.removed);
  assert.deepEqual(removed, [{ permissions: ['notifications', 'scripting'], origins: ['http://*/*', 'https://*/*'] }]);
  assert.deepEqual(await env.sw.evaluate(() => chrome.scripting.getRegisteredContentScripts()), []);
  assert.equal(await call('lib/guard.js', 'readGuard'), null);
  await waitFor(async () => (await env.log()).some((e) => e.text === 'Cookie banners: access to sites ended (not renewed) and was handed back'), {
    message: 'the log entry',
  });
});
