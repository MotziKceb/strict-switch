import { CATEGORIES, getSettings, relaxedMatch, setEnabled, setRelaxed, siteKey } from '../lib/core.js';

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

function render() {
  $('enabled').checked = settings.enabled;

  if (!site) {
    $('site').textContent = isWeb ? url.hostname : 'Not a website';
    $('unavailable').hidden = false;
    return;
  }

  $('site').textContent = url.hostname.replace(/^www\./, '');
  $('controls').hidden = false;

  const match = relaxedMatch(url.hostname, settings.relaxedSites);
  const level = match ? 'basic' : 'strict';
  for (const button of levelButtons) {
    button.setAttribute('aria-checked', String(button.dataset.level === level));
    // A site relaxed through a parent domain is changed on that domain.
    button.disabled = !settings.enabled || Boolean(match && match !== site);
  }

  const note = $('note');
  if (!settings.enabled) {
    note.textContent = 'The Strict layer is off everywhere. Only Edge\'s own protection is active.';
  } else if (match && match !== site) {
    note.textContent = `Set to Basic through ${match}. Change it in Settings.`;
  } else {
    note.textContent = '';
  }
  note.hidden = !note.textContent;

  $('status').textContent = !settings.enabled ? 'Strict layer off' : match ? 'Basic on this site' : 'Strict on this site';
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
    const relax = button.dataset.level === 'basic';
    if (relax === Boolean(relaxedMatch(url.hostname, settings.relaxedSites))) return;
    settings = await setRelaxed(site, relax);
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
