import { CATEGORIES, LEVELS, applyRules, getEngaged, getSettings } from './lib/core.js';
import { companyFor, refreshEngaged } from './lib/engagement.js';
import { logEvent, recordMatch } from './lib/activity.js';
import { checkGuard, onContentMessage, watchAccess } from './lib/autoreject.js';
import { HANDLERS } from './lib/banners.js';

async function refreshAndApply() {
  if (await refreshEngaged()) await applyRules(await getSettings());
}

async function init() {
  // Show the number of blocked requests on the toolbar icon, per tab.
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  await chrome.action.setBadgeBackgroundColor({ color: '#3a5a8c' });
  // Recount hourly so companies you stop visiting drop off.
  await chrome.alarms.create('refresh-engaged', { periodInMinutes: 60 });
  if (!liveMatches) await chrome.alarms.create('collect-matches', { periodInMinutes: 1 });
  // Cookie banners: hand access back when the lease ends, remind when due.
  await chrome.alarms.create('banners-guard', { periodInMinutes: 15 });
  await checkGuard().catch(() => {});
  await refreshEngaged();
  // Enabled rulesets reset to the manifest defaults on update, so reapply.
  await applyRules(await getSettings());
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await init();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(init);

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === 'refresh-engaged') refreshAndApply();
  if (name === 'collect-matches') collectMatches();
  if (name === 'banners-guard') checkGuard();
});

// Cookie banners. Only Strict Switch's own content scripts can send these;
// there's no channel for other extensions or web pages.
chrome.runtime.onMessage.addListener((message, sender) => {
  onContentMessage(message, sender);
});
watchAccess();

// Record caught trackers for the Trackers page. The browser reports each match live
// for extensions loaded unpacked; otherwise poll the recent matches.
const liveMatches = chrome.declarativeNetRequest.onRuleMatchedDebug;
liveMatches?.addListener(({ rule, request }) => recordMatch(rule, request));

async function collectMatches() {
  const { lastCollected = Date.now() - 60 * 1000 } = await chrome.storage.local.get('lastCollected');
  const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: lastCollected + 1 });
  let latest = lastCollected;
  for (const { rule, timeStamp } of rulesMatchedInfo) {
    await recordMatch(rule, {}, timeStamp);
    latest = Math.max(latest, timeStamp);
  }
  await chrome.storage.local.set({ lastCollected: latest });
}

// A visit to a tracker company's site might push it over the threshold.
chrome.history.onVisited.addListener(async ({ url }) => {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  const company = await companyFor(host);
  if (company && !(await getEngaged()).includes(company)) refreshAndApply();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    // Settings changed here or synced from another device.
    if (Object.keys(changes).some((k) => !k.startsWith('banner'))) getSettings().then(applyRules);
    if (changes.bannerHandler) checkGuard();
    logSettingsChanges(changes);
  }
  if (area === 'local' && changes.engaged) {
    const { oldValue = [], newValue = [] } = changes.engaged;
    const added = newValue.filter((c) => !oldValue.includes(c));
    const removed = oldValue.filter((c) => !newValue.includes(c));
    if (added.length) logEvent(`Now visited regularly: ${added.join(', ')}`);
    if (removed.length) logEvent(`No longer visited regularly: ${removed.join(', ')}`);
  }
});

// Settings changes go in the activity log, so a report shows what was changed when.
function logSettingsChanges(changes) {
  const diff = (key) => {
    const { oldValue = {}, newValue = {} } = changes[key] ?? {};
    return [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])]
      .filter((k) => oldValue[k] !== newValue[k])
      .map((k) => [k, newValue[k]]);
  };
  for (const [site, level] of diff('siteLevels')) {
    logEvent(`Site ${site} set to ${LEVELS[level ?? 'strict'].label}`);
  }
  for (const [company, rule] of diff('companyRules')) {
    logEvent(`Company ${company} set to ${rule === 'block' ? 'Block' : rule === 'allow' ? 'Allow' : 'Auto'}`);
  }
  for (const [id, on] of diff('categories')) {
    logEvent(`Category ${CATEGORIES.find((c) => c.id === id)?.label ?? id} turned ${on ? 'on' : 'off'}`);
  }
  for (const [site, pairs] of diff('siteAllows')) {
    const before = changes.siteAllows.oldValue?.[site] ?? [];
    const after = pairs ?? [];
    const label = (p) => p.replace(':', ' ');
    for (const p of after.filter((x) => !before.includes(x))) logEvent(`Allowed ${label(p)} on ${site}`);
    for (const p of before.filter((x) => !after.includes(x))) logEvent(`Blocked ${label(p)} on ${site} again`);
  }
  for (const [site, overrides] of diff('siteCategories')) {
    const before = changes.siteCategories.oldValue?.[site] ?? {};
    const after = overrides ?? {};
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[id] === after[id]) continue;
      const label = CATEGORIES.find((c) => c.id === id)?.label ?? id;
      logEvent(id in after
        ? `${label} switched ${after[id] ? 'on' : 'off'} for ${site}`
        : `${label} on ${site} follows the global setting again`);
    }
  }
  if (changes.balancedCategories) {
    logEvent(`Balanced now opens: ${changes.balancedCategories.newValue.join(', ') || 'nothing'}`);
  }
  if (changes.blockOwnSites) {
    logEvent(`Blocking on owners' own sites turned ${changes.blockOwnSites.newValue ? 'on' : 'off'}`);
  }
  if (changes.bannerHandler) {
    logEvent(`Cookie banners are now handled by: ${HANDLERS[changes.bannerHandler.newValue ?? 'self']?.label ?? 'Strict Switch'}`);
  }
  if (changes.bannerSitesOff) {
    const before = changes.bannerSitesOff.oldValue ?? [];
    const after = changes.bannerSitesOff.newValue ?? [];
    for (const site of after.filter((s) => !before.includes(s))) logEvent(`Auto-reject switched off for ${site}`);
    for (const site of before.filter((s) => !after.includes(s))) logEvent(`Auto-reject switched back on for ${site}`);
  }
  if (changes.enabled) logEvent(`Strict layer turned ${changes.enabled.newValue === false ? 'off' : 'on'}`);
}
