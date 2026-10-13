// Records what the extension did, from its rule matches:
// - chrome.storage.local "seen": caught companies for the Trackers page,
//   { [company]: { blocked, allowed, off, last, sites: [recent sites] } },
//   counted by group (see groupOf in core.js).
// - chrome.storage.session "log": the activity log, newest last, cleared when
//   the browser closes. Request URLs are kept without query strings, and
//   repeats of the same request are folded into one entry with a count.

import { describeRule, getSettings, groupOf, siteKey } from './core.js';

const MAX_SITES = 10;
const MAX_LOG = 3000;
// How far back to look for an identical entry to fold a repeat into.
const FOLD_WINDOW = 200;
const FLUSH_DELAY_MS = 2000;

let categoriesPromise = null;

// Category switches, for sorting matches into groups. Refreshed on change.
function getCategories() {
  categoriesPromise ??= getSettings().then((s) => s.categories);
  return categoriesPromise;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.categories) categoriesPromise = null;
});

let pendingMatches = [];
let pendingLog = [];
let flushTimer = null;

export async function getSeen() {
  const { seen = {} } = await chrome.storage.local.get('seen');
  return seen;
}

export function clearSeen() {
  return navigator.locks.request('seen', () => chrome.storage.local.remove('seen'));
}

export async function getLog() {
  const { log = [] } = await chrome.storage.session.get('log');
  return log;
}

export function clearLog() {
  return navigator.locks.request('log', () => chrome.storage.session.remove('log'));
}

function siteOf(origin) {
  try {
    return origin ? siteKey(new URL(origin).hostname) : null;
  } catch {
    return null;
  }
}

function shortUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname.length > 80 ? pathname.slice(0, 80) + '...' : pathname;
    return hostname + path;
  } catch {
    return null;
  }
}

function scheduleFlush() {
  flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

// Queues a matched rule. request has url, initiator and type when Edge
// reports matches live; polled matches only have the rule.
export async function recordMatch(rule, request = {}, time = Date.now()) {
  const match = await describeRule(rule);
  if (!match) return;
  const group = groupOf(match, await getCategories());
  // For a Basic site the match is the page itself, not a request it made.
  const site = match.kind === 'basic' ? siteOf(request.url) : siteOf(request.initiator);
  if (match.company) pendingMatches.push({ company: match.company, group, site, time });
  pendingLog.push({
    time,
    site,
    url: request.url ? shortUrl(request.url) : null,
    type: request.type ?? null,
    company: match.company,
    kind: match.kind,
    category: match.category ?? null,
    allowed: match.allowed,
    group,
    count: 1,
  });
  scheduleFlush();
}

// Adds a non-request entry, like a settings change.
export function logEvent(text, time = Date.now()) {
  pendingLog.push({ time, kind: 'event', text });
  scheduleFlush();
}

const entryKey = (e) => [e.site, e.url, e.company, e.kind, e.category, e.group].join('|');

async function flush() {
  flushTimer = null;
  const matches = pendingMatches;
  const entries = pendingLog;
  pendingMatches = [];
  pendingLog = [];

  if (matches.length) {
    await navigator.locks.request('seen', async () => {
      const seen = await getSeen();
      for (const { company, group, site, time } of matches) {
        const entry = (seen[company] ??= { blocked: 0, allowed: 0, off: 0, last: 0, sites: [] });
        entry[group] = (entry[group] ?? 0) + 1;
        entry.last = Math.max(entry.last, time);
        if (site) entry.sites = [site, ...entry.sites.filter((s) => s !== site)].slice(0, MAX_SITES);
      }
      await chrome.storage.local.set({ seen });
    });
  }

  if (entries.length) {
    await navigator.locks.request('log', async () => {
      const log = await getLog();
      for (const entry of entries) {
        if (entry.kind !== 'event') {
          const key = entryKey(entry);
          const start = Math.max(0, log.length - FOLD_WINDOW);
          const i = log.findLastIndex((e, j) => j >= start && e.kind !== 'event' && entryKey(e) === key);
          if (i !== -1) {
            // Move the repeat to the end so the log stays in time order.
            const [previous] = log.splice(i, 1);
            entry.count = (previous.count ?? 1) + 1;
          }
        }
        log.push(entry);
      }
      await chrome.storage.session.set({ log: log.slice(-MAX_LOG) });
    });
  }
}
