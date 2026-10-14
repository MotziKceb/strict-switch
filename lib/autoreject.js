// The background worker's side of cookie banners: answers the content
// scripts, runs autoconsent's main-world snippets, reads the consent record
// back after a banner is handled, and records everything in the activity log.
// Also enforces the permission lease and shows the reminder.
//
// Messages come only from Strict Switch's own content scripts: the manifest
// has no externally_connectable, and this never listens to other extensions.
// Nothing here can change the lease or the reminder; that only happens on
// the Cookie banners page, on a click.

import { evalSnippets, filterCompactRules } from '../vendor/autoconsent/autoconsent.esm.js';
import { logBanner, logEvent } from './activity.js';
import {
  bannerSiteOff, bannersActive, getBannerSettings, hasAccess, platformLabel, revokeAccess, showReminderBadge, syncContentScripts,
} from './banners.js';
import { classifyRecord, describeRecord, readConsentRecord, recordSignature, sanitizeRecord } from './consent-record.js';
import { clearGuard, isDue, isExpired, readGuard } from './guard.js';
import { siteKey } from './core.js';

const REMINDER_PAGE = 'options/banners.html';
// How long after a banner is handled to read the record: CMPs save it
// asynchronously.
const VERIFY_DELAY_MS = 1500;
const SELF_TEST_TIMEOUT_MS = 4000;
// Watcher checks: at most one per this interval and this many per page load.
const CHECK_INTERVAL_MS = 2000;
const MAX_CHECKS = 15;
// After autoconsent acts, record changes are its doing, not someone else's.
const ACTING_WINDOW_MS = 15000;

const loadJson = (file) => fetch(chrome.runtime.getURL(file)).then((r) => r.json());
let rulesPromise;
let refusedSnippetsPromise;
const getRules = () => (rulesPromise ??= loadJson('vendor/autoconsent/compact-rules.json'));
const getRefusedSnippets = () => (refusedSnippetsPromise ??= loadJson('vendor/autoconsent/opt-in-snippets.json').then((l) => new Set(l)));

// Per-tab state for the current page load. Kept in memory: if the worker
// restarts mid-page, the next check simply starts afresh.
const tabs = new Map();
function tabState(tabId) {
  let s = tabs.get(tabId);
  if (!s) tabs.set(tabId, (s = { baseline: undefined, lastCheck: 0, checks: 0, acting: 0, selfTests: new Map() }));
  return s;
}
chrome.tabs.onRemoved.addListener((tabId) => tabs.delete(tabId));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function siteOfTab(tab) {
  try {
    const url = new URL(tab.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? siteKey(url.hostname) : null;
  } catch {
    return null;
  }
}

// The site's consent record, read in the page's top frame, or null if it
// couldn't be read (the page went away, say).
async function readRecord(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: readConsentRecord,
    });
    return sanitizeRecord(injection?.result);
  } catch {
    return null;
  }
}

// Whether autoconsent may act on this tab's site.
async function autoRejectFor(tab) {
  if (!(await bannersActive())) return false;
  const { handler, sitesOff } = await getBannerSettings();
  const site = siteOfTab(tab);
  return handler === 'self' && Boolean(site) && !bannerSiteOff(site, sitesOff);
}

function sendToFrame(tabId, frameId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => {});
}

// Labels of what autoconsent clicked, from the content script. Untrusted page
// text, so kept short.
const clickedLabels = (list) => (Array.isArray(list) ? list.filter((l) => typeof l === 'string').map((l) => l.slice(0, 60)).slice(0, 5) : []);

async function onInit(tab, frameId, url) {
  const enabled = await autoRejectFor(tab);
  const rules = enabled ? { autoconsent: [], compact: filterCompactRules(await getRules(), { url, mainFrame: frameId === 0 }) } : null;
  await sendToFrame(tab.id, frameId, {
    type: 'initResp',
    rules,
    config: {
      enabled,
      // Only ever reject.
      autoAction: 'optOut',
      heuristicMode: 'reject',
      enableHeuristicDetection: true,
      // Hiding a banner without answering it isn't a rejection, so only real
      // reject flows run.
      enableCosmeticRules: false,
      enablePrehide: true,
      detectRetries: 20,
      logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false },
    },
  });
}

async function onEval(tab, frameId, { id, snippetId }) {
  const refused = !Object.hasOwn(evalSnippets, snippetId) || (await getRefusedSnippets()).has(snippetId) || !(await autoRejectFor(tab));
  let result = false;
  if (!refused) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [frameId] },
        world: 'MAIN',
        func: evalSnippets[snippetId],
      });
      result = injection?.result ?? false;
    } catch {
      result = false;
    }
  }
  await sendToFrame(tab.id, frameId, { type: 'evalResp', id, result });
}

// Asks the frame to run autoconsent's own check for this platform (a cookie
// it should have set, say), if it has one.
function selfTest(tabId, frameId) {
  const state = tabState(tabId);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.selfTests.delete(frameId);
      resolve(null);
    }, SELF_TEST_TIMEOUT_MS);
    state.selfTests.set(frameId, (result) => {
      clearTimeout(timer);
      resolve(result === true);
    });
    sendToFrame(tabId, frameId, { type: 'selfTest' });
  });
}

// Reject, then verify: after autoconsent reports the banner handled, run its
// own check, read the consent record back, and log the lot.
async function verifyRejection(tab, frameId, message) {
  const started = Date.now();
  const state = tabState(tab.id);
  state.acting = Date.now();
  const test = message.scheduleSelfTest ? await selfTest(tab.id, frameId) : null;
  await sleep(Math.max(0, VERIFY_DELAY_MS - (Date.now() - started)));
  const record = await readRecord(tab.id);
  state.acting = Date.now();
  if (record) state.baseline = recordSignature(record);
  logBanner({
    site: siteOfTab(tab),
    platform: platformLabel(message.cmp),
    action: 'rejected',
    clicked: clickedLabels(message.clicked),
    clicks: Number.isInteger(message.totalClicks) ? message.totalClicks : null,
    selfTest: test,
    verdict: record ? classifyRecord(record) : 'pending',
    detail: record ? describeRecord(record) : 'The page closed or changed before its consent record could be read.',
  });
}

// The watcher saw the page load or a click: compare the record with how it
// was, and log a change.
async function onConsentCheck(tab, message) {
  const state = tabState(tab.id);
  const now = Date.now();
  if (message.type === 'consentBaseline') {
    Object.assign(state, { baseline: undefined, checks: 0, lastCheck: 0 });
  } else if (now - state.lastCheck < CHECK_INTERVAL_MS || state.checks >= MAX_CHECKS) {
    return;
  }
  state.lastCheck = now;
  state.checks++;
  const record = await readRecord(tab.id);
  if (!record) return;
  const signature = recordSignature(record);
  const before = state.baseline;
  state.baseline = signature;
  if (message.type === 'consentBaseline' || before === undefined || before === signature) return;
  // Autoconsent's own clicks are logged by verifyRejection.
  if (Date.now() - state.acting < ACTING_WINDOW_MS) return;

  const { handler } = await getBannerSettings();
  const byYou = message.trusted === true;
  let hint = null;
  if (!byYou && handler !== 'other') hint = 'It looks like another extension handled this banner.';
  logBanner({
    site: siteOfTab(tab),
    platform: null,
    action: 'choice',
    by: byYou ? 'you' : 'script',
    verdict: classifyRecord(record),
    detail: describeRecord(record),
    hint,
  });
}

// Messages from Strict Switch's own content scripts in web pages.
export function onContentMessage(message, sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || !Number.isInteger(sender.frameId)) return;
  if (!/^https?:/.test(sender.url ?? '') || !message || typeof message.type !== 'string') return;
  const { tab, frameId } = sender;
  switch (message.type) {
    case 'init':
      if (frameId === 0) tabs.delete(tab.id);
      onInit(tab, frameId, sender.url);
      break;
    case 'eval':
      onEval(tab, frameId, message);
      break;
    case 'popupFound':
      tabState(tab.id).acting = Date.now();
      break;
    case 'optOutResult':
      tabState(tab.id).acting = Date.now();
      if (!message.result) {
        logBanner({
          site: siteOfTab(tab),
          platform: platformLabel(message.cmp),
          action: 'failed',
          clicked: clickedLabels(message.clicked),
          verdict: 'pending',
          detail: 'Strict Switch found the banner but couldn\'t finish rejecting it. Nothing was accepted; the banner may still be showing.',
        });
      }
      break;
    case 'autoconsentDone':
      if (!message.isCosmetic) verifyRejection(tab, frameId, message);
      break;
    case 'selfTestResult':
      tabState(tab.id).selfTests.get(frameId)?.(message.result);
      tabState(tab.id).selfTests.delete(frameId);
      break;
    case 'consentBaseline':
    case 'consentCheck':
      if (frameId === 0) bannersActive().then((on) => on && onConsentCheck(tab, message));
      break;
    default:
      break;
  }
}

// --- Lease and reminder ---

export const reminderUrl = () => chrome.runtime.getURL(REMINDER_PAGE);

let notificationClicks = false;
function notify(id, title, message) {
  if (!chrome.notifications) return;
  if (!notificationClicks) {
    notificationClicks = true;
    chrome.notifications.onClicked.addListener((clicked) => {
      if (clicked.startsWith('strict-switch-banners')) chrome.tabs.create({ url: reminderUrl() });
      chrome.notifications.clear(clicked);
    });
  }
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
    priority: 2,
    requireInteraction: true,
  });
}

// Set while Strict Switch hands access back itself, so that isn't logged twice.
let handingBack = false;

const dateText = (t) => new Date(t).toLocaleDateString(undefined, { dateStyle: 'long' });

// Hands the permission back when the lease has run out, and shows the
// reminder when it's due. Runs on startup, every few minutes and when access
// changes.
export async function checkGuard(now = Date.now()) {
  if (!(await hasAccess())) {
    await showReminderBadge(false);
    await syncContentScripts().catch(() => {});
    return;
  }
  const guard = await readGuard(now);
  if (isExpired(guard, now)) {
    notify(
      'strict-switch-banners-ended',
      'Strict Switch handed back its access to the sites you visit',
      guard?.grantedAt
        ? `You allowed it on ${dateText(guard.grantedAt)} and didn't renew it, so cookie banner handling switched itself off. Turn it back on any time on the Cookie banners page.`
        : 'Access was granted outside the Cookie banners page, so Strict Switch gave it back. Turn cookie banner handling on from the Cookie banners page.',
    );
    logEvent(guard?.grantedAt ? 'Cookie banners: access to sites ended (not renewed) and was handed back' : 'Cookie banners: access granted outside the Cookie banners page was handed back');
    handingBack = true;
    await revokeAccess().catch(() => {});
    handingBack = false;
    await showReminderBadge(false);
    return;
  }
  await syncContentScripts();
  const due = isDue(guard, now);
  await showReminderBadge(due);
  if (!due) return;
  // One notification per reminder; the badge and popup banner stay until
  // it's answered.
  const { reminderShownFor } = await chrome.storage.session.get('reminderShownFor');
  if (reminderShownFor === guard.remindAt) return;
  await chrome.storage.session.set({ reminderShownFor: guard.remindAt });
  const { handler } = await getBannerSettings();
  notify(
    'strict-switch-banners-reminder',
    'Strict Switch can still read every site you visit',
    `You allowed this on ${dateText(guard.grantedAt ?? now)} so ${handler === 'self' ? 'auto-reject' : 'cookie banner checks'} could work. It runs only on your computer, and nothing is sent anywhere unless you send a report yourself. Click to keep it, turn it off or be reminded later.`,
  );
}

// Access added or removed outside the Cookie banners page (from the browser's
// own extension menu, say).
export function watchAccess() {
  chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
    if (!origins.length) return;
    if (handingBack || (await hasAccess())) return;
    await clearGuard();
    logEvent('Cookie banners: switched off, access to sites handed back');
    await checkGuard();
  });
  chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
    if (!origins.length) return;
    // The Cookie banners page records the lease as it asks; give it a moment.
    await sleep(2000);
    if (await bannersActive()) logEvent('Cookie banners: access to sites granted');
    await checkGuard();
  });
}
