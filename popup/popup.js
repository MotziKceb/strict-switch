import { isEdge, showBrowserText } from '../lib/browser.js';
import { LEVELS, describeRule, getEngaged, getSettings, setEnabled, setSiteLevel, siteKey, siteLevel } from '../lib/core.js';

const $ = (id) => document.getElementById(id);
const levelButtons = document.querySelectorAll('.levels button');
const MAX_COMPANIES = 6;

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
    note = isEdge
      ? 'The Strict layer is off everywhere. Only Edge\'s own protection is active.'
      : 'The Strict layer is off everywhere. No trackers are being blocked.';
  } else if (inherited) {
    note = `Set to ${LEVELS[current.level].label} through ${current.site}. Change it in Settings.`;
  } else if (current.level === 'balanced') {
    note = `Trackers from ${engagedCount} ${engagedCount === 1 ? 'company' : 'companies'} you visit regularly are allowed, unless you've blocked them. All others are blocked.`;
  } else if (current.level === 'basic') {
    note = isEdge
      ? 'Only Edge\'s own tracking prevention is active on this site.'
      : 'No trackers are blocked on this site.';
  }
  $('note').textContent = note;
  $('note').hidden = !note;

  $('status').textContent = settings.enabled ? `${LEVELS[current.level].label} on this site` : 'Strict layer off';
}

function openPage(file, query) {
  chrome.tabs.create({ url: chrome.runtime.getURL(file) + (query ? `?q=${encodeURIComponent(query)}` : '') });
  window.close();
}

const openTrackers = (query) => openPage('options/trackers.html', query);

// Tracker companies caught on this page, with blocked and allowed counts.
async function renderBlocked() {
  let rules = [];
  try {
    ({ rulesMatchedInfo: rules } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id }));
  } catch {
    // Rate limited, or no access to this tab.
  }
  const companies = new Map();
  for (const { rule } of rules) {
    const match = await describeRule(rule);
    if (!match?.company) continue;
    const entry = companies.get(match.company) ?? { blocked: 0, allowed: 0 };
    entry[match.allowed ? 'allowed' : 'blocked']++;
    companies.set(match.company, entry);
  }
  const total = [...companies.values()].reduce((sum, c) => sum + c.blocked, 0);
  const allowed = [...companies.values()].reduce((sum, c) => sum + c.allowed, 0);
  $('blocked-count').textContent = total;
  $('blocked-label').textContent = `${total === 1 ? 'tracker' : 'trackers'} blocked on this page`
    + (allowed ? `, ${allowed} allowed` : '');

  const sorted = [...companies].sort(([, a], [, b]) => b.blocked + b.allowed - (a.blocked + a.allowed));
  const items = sorted.slice(0, MAX_COMPANIES).map(([name, { blocked, allowed }]) => {
    const count = Object.assign(document.createElement('span'), {
      className: `count ${blocked ? 'is-blocked' : 'is-allowed'}`,
      textContent: [blocked && `${blocked} blocked`, allowed && `${allowed} allowed`].filter(Boolean).join(', '),
    });
    const button = Object.assign(document.createElement('button'), { type: 'button', title: `Manage ${name} on the Trackers page` });
    button.append(Object.assign(document.createElement('span'), { className: 'name', textContent: name }), count);
    button.addEventListener('click', () => openTrackers(name));
    const li = document.createElement('li');
    li.append(button);
    return li;
  });
  if (sorted.length > MAX_COMPANIES) {
    items.push(Object.assign(document.createElement('li'), {
      className: 'more',
      textContent: `and ${sorted.length - MAX_COMPANIES} more`,
    }));
  }
  $('blocked-list').replaceChildren(...items);
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

$('open-trackers').addEventListener('click', () => openTrackers());
$('open-log').addEventListener('click', () => openPage('options/log.html', site));

$('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

showBrowserText();
render();
if (site) renderBlocked();
