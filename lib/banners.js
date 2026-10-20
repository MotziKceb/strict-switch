// Cookie banners: settings shared by the background worker and the pages.
//
// Reading pages needs the broad "read all sites" permission, which is
// optional: requested when the user switches the feature on (on the Cookie
// banners page), handed back when switched off or when the lease runs out
// (see guard.js). Nothing here runs without it.

import { settingsStore, inPrivateWindow } from './core.js';
import { clearGuard, isExpired, readGuard } from './guard.js';

export const ORIGINS = ['http://*/*', 'https://*/*'];
// scripting registers the content scripts and reads the consent record;
// notifications shows the reminder. Both are asked for with the origins and
// handed back with them.
export const OPTIONAL_PERMISSIONS = ['notifications', 'scripting'];
export const ACCESS = { permissions: OPTIONAL_PERMISSIONS, origins: ORIGINS };

export const HANDLERS = {
  self: {
    label: 'Strict Switch',
    description: 'Strict Switch clicks "reject" for you, using DuckDuckGo\'s autoconsent, then checks the site\'s consent record to see whether the rejection registered.',
  },
  other: {
    label: 'Another extension, e.g. Consent-O-Matic',
    description: 'Strict Switch never touches cookie banners. After the other extension clicks, it checks the site\'s consent record to see whether the choice registered.',
  },
  nobody: {
    label: 'Nobody, I click myself',
    description: 'Strict Switch never touches cookie banners. After you click, it checks the site\'s consent record to see whether your choice registered.',
  },
};

const SCRIPTS = {
  autoreject: {
    id: 'autoreject',
    js: ['vendor/autoconsent/autoconsent.js', 'content/autoreject.js'],
    matches: ORIGINS,
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: 'document_start',
  },
  watch: {
    id: 'consent-watch',
    js: ['content/watch.js'],
    matches: ORIGINS,
    allFrames: false,
    runAt: 'document_idle',
  },
};

export async function getBannerSettings() {
  const { bannerHandler, bannerSitesOff } = await settingsStore().get(['bannerHandler', 'bannerSitesOff']);
  return {
    handler: HANDLERS[bannerHandler] ? bannerHandler : 'self',
    sitesOff: Array.isArray(bannerSitesOff) ? bannerSitesOff : [],
  };
}

export function setBannerHandler(handler) {
  if (!HANDLERS[handler]) throw new Error(`Unknown handler ${handler}`);
  return settingsStore().set({ bannerHandler: handler });
}

// Turns auto-reject off (on = false) or back on for one site and its subdomains.
export async function setBannerSite(site, on) {
  const { sitesOff } = await getBannerSettings();
  const next = sitesOff.filter((s) => s !== site);
  if (!on) next.push(site);
  await settingsStore().set({ bannerSitesOff: next.sort() });
}

// The site entry switching auto-reject off for this hostname, if any.
export function bannerSiteOff(hostname, sitesOff) {
  const host = String(hostname).toLowerCase();
  return sitesOff.find((s) => host === s || host.endsWith('.' + s)) ?? null;
}

// Whether the user has granted access (all of it: a single site granted from
// the browser's own menu doesn't switch the feature on).
export async function hasAccess() {
  // Cookie banner handling isn't available in private windows yet: their
  // instance has no lease or reminder of its own, and must never hand back
  // the access granted in normal windows.
  if (inPrivateWindow()) return false;
  try {
    return await chrome.permissions.contains(ACCESS);
  } catch {
    return false;
  }
}

// On means: access granted and the lease still running.
export async function bannersActive(now = Date.now()) {
  return (await hasAccess()) && !isExpired(await readGuard(now), now);
}

// Hands the permission back and forgets the lease.
export async function revokeAccess() {
  await unregisterScripts();
  try {
    await chrome.permissions.remove(ACCESS);
  } finally {
    await clearGuard();
  }
}

// The settings pages and the background worker can all change the
// registrations; a lock shared across them keeps them from interleaving.
const scriptsLock = (fn) => navigator.locks.request('banner-scripts', fn);

function unregisterScripts() {
  if (inPrivateWindow() || !chrome.scripting?.getRegisteredContentScripts) return Promise.resolve();
  return scriptsLock(async () => {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: registered.map((s) => s.id) });
  });
}

// Registers the content scripts that match the current state: autoconsent
// only when Strict Switch handles banners, the consent watcher whenever the
// feature is on, nothing when it's off.
export async function syncContentScripts() {
  if (inPrivateWindow()) return;
  const active = await bannersActive();
  if (!active) return unregisterScripts();
  const { handler } = await getBannerSettings();
  const wanted = [SCRIPTS.watch, ...(handler === 'self' ? [SCRIPTS.autoreject] : [])];
  return scriptsLock(async () => {
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const same = registered.length === wanted.length && wanted.every((w) => registered.some((r) => r.id === w.id));
    if (same) return;
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: registered.map((s) => s.id) });
    await chrome.scripting.registerContentScripts(wanted);
  });
}

// The "!" on the toolbar icon while a reminder is due. It replaces the
// blocked-request count until the reminder is answered.
export async function showReminderBadge(due) {
  await chrome.action.setBadgeText({ text: due ? '!' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: due ? '#b3261e' : '#3a5a8c' });
}

// Names autoconsent gives banners, in plain words.
export function platformLabel(cmp) {
  if (!cmp) return 'Unknown banner';
  if (cmp.startsWith('HEURISTIC')) return 'Unrecognised banner (found by its wording)';
  return cmp;
}
