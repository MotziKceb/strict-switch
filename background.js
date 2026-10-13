import { applyRules, getEngaged, getSettings } from './lib/core.js';
import { companyFor, refreshEngaged } from './lib/engagement.js';

async function refreshAndApply() {
  if (await refreshEngaged()) await applyRules(await getSettings());
}

async function init() {
  // Show the number of blocked requests on the toolbar icon, per tab.
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  await chrome.action.setBadgeBackgroundColor({ color: '#3a5a8c' });
  // Recount hourly so companies you stop visiting drop off.
  await chrome.alarms.create('refresh-engaged', { periodInMinutes: 60 });
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
});

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

// Settings synced from another device.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') getSettings().then(applyRules);
});
