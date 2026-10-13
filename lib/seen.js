// Records which tracker companies the extension has caught, for the Trackers
// page. Stored in chrome.storage.local as
// { seen: { [company]: { blocked, allowed, last, sites: [recent sites] } } }.

import { companyForRule, siteKey } from './core.js';

const MAX_SITES = 10;
const FLUSH_DELAY_MS = 2000;

let pending = [];
let flushTimer = null;

export async function getSeen() {
  const { seen = {} } = await chrome.storage.local.get('seen');
  return seen;
}

export function clearSeen() {
  return navigator.locks.request('seen', () => chrome.storage.local.remove('seen'));
}

// Queues a matched rule. initiator is the page origin, when known.
export async function recordMatch(rule, initiator, time = Date.now()) {
  const match = await companyForRule(rule);
  if (!match) return;
  let site = null;
  try {
    site = initiator ? siteKey(new URL(initiator).hostname) : null;
  } catch {}
  pending.push({ ...match, site, time });
  flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

async function flush() {
  flushTimer = null;
  const batch = pending;
  pending = [];
  await navigator.locks.request('seen', async () => {
    const seen = await getSeen();
    for (const { company, allowed, site, time } of batch) {
      const entry = (seen[company] ??= { blocked: 0, allowed: 0, last: 0, sites: [] });
      entry[allowed ? 'allowed' : 'blocked']++;
      entry.last = Math.max(entry.last, time);
      if (site) entry.sites = [site, ...entry.sites.filter((s) => s !== site)].slice(0, MAX_SITES);
    }
    await chrome.storage.local.set({ seen });
  });
}
