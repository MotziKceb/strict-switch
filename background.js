import { applyRules, getSettings } from './lib/core.js';

async function init() {
  // Show the number of blocked requests on the toolbar icon, per tab.
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  await chrome.action.setBadgeBackgroundColor({ color: '#3a5a8c' });
  // Enabled rulesets reset to the manifest defaults on update, so reapply.
  await applyRules(await getSettings());
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await init();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(init);

// Settings synced from another device.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') getSettings().then(applyRules);
});
