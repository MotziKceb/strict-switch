import { CATEGORIES, LEVELS, applyRules, getEngaged, getSettings } from './lib/core.js';
import { companyFor, refreshEngaged } from './lib/engagement.js';
import { logEvent, recordMatch } from './lib/activity.js';

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
});

// Record caught trackers for the Trackers page. Edge reports each match live
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
    getSettings().then(applyRules);
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
  if (changes.enabled) logEvent(`Strict layer turned ${changes.enabled.newValue === false ? 'off' : 'on'}`);
}
