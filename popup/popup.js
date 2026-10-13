import { CATEGORIES, LEVELS, getEngaged, getSettings, setEnabled, setSiteLevel, siteKey, siteLevel } from '../lib/core.js';

const $ = (id) => document.getElementById(id);
const levelButtons = document.querySelectorAll('.levels button');

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let url = null;
try {
  url = new URL(tab?.url ?? '');
} catch {}
const isWeb = url && (url.protocol === 'http:' || url.protocol === 'https:');
const site = isWeb ? siteKey(url.hostname) : null;

let settings = await getSettings();
const engagedCount = (await getEngaged()).length;

function render() {
  $('enabled').checked = settings.enabled;

  if (!site) {
    $('site').textContent = isWeb ? url.hostname : 'Not a website';
    $('unavailable').hidden = false;
    return;
  }

  $('site').textContent = url.hostname.replace(/^www\./, '');
  $('controls').hidden = false;

  const current = siteLevel(url.hostname, settings.siteLevels);
  // A level set on a parent domain is changed on that domain.
  const inherited = current.site && current.site !== site;
  for (const button of levelButtons) {
    button.setAttribute('aria-checked', String(button.dataset.level === current.level));
    button.disabled = !settings.enabled || inherited;
  }

  let note = '';
  if (!settings.enabled) {
    note = 'The Strict layer is off everywhere. Only Edge\'s own protection is active.';
  } else if (inherited) {
    note = `Set to ${LEVELS[current.level].label} through ${current.site}. Change it in Settings.`;
  } else if (current.level === 'balanced') {
    note = `Trackers from ${engagedCount} ${engagedCount === 1 ? 'company' : 'companies'} you visit regularly are allowed. All others are blocked.`;
  } else if (current.level === 'basic') {
    note = 'Only Edge\'s own tracking prevention is active on this site.';
  }
  $('note').textContent = note;
  $('note').hidden = !note;

  $('status').textContent = settings.enabled ? `${LEVELS[current.level].label} on this site` : 'Strict layer off';
}

async function renderBlocked() {
  let rules = [];
  try {
    ({ rulesMatchedInfo: rules } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id }));
  } catch {
    // Rate limited, or no access to this tab.
  }
  const counts = new Map();
  for (const { rule } of rules) {
    if (rule.rulesetId === '_dynamic') continue;
    counts.set(rule.rulesetId, (counts.get(rule.rulesetId) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  $('blocked-count').textContent = total;
  $('blocked-label').textContent = `${total === 1 ? 'request' : 'requests'} blocked on this page`;
  $('blocked-list').replaceChildren(
    ...CATEGORIES.filter((c) => counts.has(c.id)).map((c) => {
      const li = document.createElement('li');
      li.append(c.label, Object.assign(document.createElement('span'), { textContent: counts.get(c.id) }));
      return li;
    }),
  );
}

for (const button of levelButtons) {
  button.addEventListener('click', async () => {
    const level = button.dataset.level;
    if (level === siteLevel(url.hostname, settings.siteLevels).level) return;
    settings = await setSiteLevel(site, level);
    render();
    // Rules only affect new requests, so reload to apply the change.
    await chrome.tabs.reload(tab.id);
    window.close();
  });
}

$('enabled').addEventListener('change', async (e) => {
  settings = await setEnabled(e.target.checked);
  render();
});

$('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

render();
if (site) renderBlocked();
