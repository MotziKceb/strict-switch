import { breakageRow, fullList, pageGroups } from '../lib/breakage.js';
import { LEVELS, clearSiteAllows, getSettings, setSiteAllow, siteLevel } from '../lib/core.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const site = params.get('site');
const tabId = Number(params.get('tab'));

let settings = await getSettings();

async function toggleAllow(entry, allowed) {
  settings = await setSiteAllow(site, entry.company, entry.category, allowed);
  $('clear').hidden = !(settings.siteAllows[site] ?? []).length;
}

async function render() {
  document.title = `Strict Switch: ${site}`;
  $('title').textContent = `Trackers on ${site}`;
  $('level').textContent = `${LEVELS[siteLevel(site, settings.siteLevels).level].label} on this site.`;
  const list = fullList(await pageGroups(tabId, site, settings));
  $('list').replaceChildren(...list.map((e) => breakageRow(e, toggleAllow)));
  $('count').textContent = `${list.length} ${list.length === 1 ? 'group' : 'groups'}`;
  $('empty').hidden = list.length > 0;
  $('clear').hidden = !(settings.siteAllows[site] ?? []).length;
}

$('reload').addEventListener('click', async () => {
  try {
    await chrome.tabs.reload(tabId);
    $('done').textContent = 'Page reloaded. Refreshing this list...';
    $('done').hidden = false;
    setTimeout(async () => {
      await render();
      $('done').hidden = true;
    }, 2500);
  } catch {
    $('done').textContent = 'That tab is gone. Reload the site yourself to apply your changes.';
    $('done').hidden = false;
  }
});

$('clear').addEventListener('click', async () => {
  if (!confirm(`Remove all exceptions for ${site}?`)) return;
  settings = await clearSiteAllows(site);
  await render();
});

await render();
