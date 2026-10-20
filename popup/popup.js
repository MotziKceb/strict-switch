import { browser, showBrowserText } from '../lib/browser.js';
import { breakageList, breakageRow, categoryLabel, pageGroups } from '../lib/breakage.js';
import { bannerSiteOff, bannersActive, getBannerSettings, setBannerSite } from '../lib/banners.js';
import { isDue, readGuard } from '../lib/guard.js';
import { initIncognito, openSettings } from '../lib/incognito.js';
import { LEVELS, getEngaged, getSettings, setEnabled, setSiteAllow, setSiteLevel, siteCategoryOverrides, siteKey, siteLevel } from '../lib/core.js';

const $ = (id) => document.getElementById(id);
const levelButtons = document.querySelectorAll('.levels button');
const MAX_COMPANIES = 6;
const MAX_BREAKAGE = 4;

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
  $('site-settings').hidden = false;

  const current = siteLevel(url.hostname, settings.siteLevels);
  // A level set on a parent domain is changed on that domain.
  const inherited = current.site && current.site !== site;
  // Lockdown shows on the Strict button, which reached it.
  const lockdown = current.level === 'lockdown';
  const shown = lockdown ? 'strict' : current.level;
  for (const button of levelButtons) {
    button.setAttribute('aria-checked', String(button.dataset.level === shown));
    button.disabled = !settings.enabled || inherited;
  }
  const strict = document.querySelector('[data-level="strict"]');
  strict.classList.toggle('lockdown', lockdown);
  $('strict-label').textContent = lockdown ? 'Lockdown' : 'Strict';
  $('strict-sub').textContent = lockdown ? 'Every tracker' : 'All trackers';

  let note = '';
  if (!settings.enabled) {
    note = browser.pausedNote;
  } else if (inherited) {
    note = `Set to ${LEVELS[current.level].label} through ${current.site}. Change it in Settings.`;
  } else if (lockdown) {
    note = 'Every known tracker is blocked on this site, including content and the owner\'s own trackers. Click Strict to go back.';
  } else if (current.level === 'balanced') {
    const opened = settings.balancedCategories.map(categoryLabel).join(' and ') || 'nothing';
    note = `Opens ${opened} from ${engagedCount} ${engagedCount === 1 ? 'company' : 'companies'} you visit regularly. Everything else stays blocked.`;
  } else if (current.level === 'basic') {
    note = browser.basicNote;
  } else {
    note = 'Ctrl+click Strict to block every known tracker on this site.';
  }
  $('note').textContent = note;
  $('note').hidden = !note;

  const customised = Object.keys(siteCategoryOverrides(url.hostname, settings).overrides).length;
  $('status').textContent = settings.enabled
    ? `${LEVELS[current.level].label} on this site${customised ? ', with its own category settings' : ''}`
    : 'Strict layer off';
}

// The cookie banner reminder, until answered, and this site's auto-reject switch.
async function renderBanners() {
  if (!(await bannersActive())) return;
  $('reminder').hidden = !isDue(await readGuard());
  const { handler, sitesOff } = await getBannerSettings();
  if (!site || handler !== 'self') return;
  const owner = bannerSiteOff(url.hostname, sitesOff);
  $('banner-row').hidden = false;
  $('banner-site').checked = !owner;
  // Switched off through a parent domain: changed in that site's settings.
  $('banner-site').disabled = Boolean(owner && owner !== site);
}

$('banner-site').addEventListener('change', async (e) => {
  await setBannerSite(site, e.target.checked);
  $('banner-reload').hidden = false;
});

$('reminder-open').addEventListener('click', () => openPage('options/banners.html'));

function openPage(file, params = {}) {
  const query = new URLSearchParams(params).toString();
  chrome.tabs.create({ url: chrome.runtime.getURL(file) + (query ? `?${query}` : '') });
  window.close();
}

const openTrackers = (q) => openPage('options/trackers.html', q ? { q } : {});

const GROUPS = [
  { id: 'blocked', title: 'Blocked' },
  { id: 'allowed', title: 'Allowed' },
  { id: 'off', title: 'Not blocked, category off' },
];

async function toggleAllow(entry, allowed) {
  settings = await setSiteAllow(site, entry.company, entry.category, allowed);
  $('reload').hidden = false;
}

// What happened on this page: a summary, the blocked groups most likely to
// break it (with per-site toggles), then everything by group and company.
async function renderPage() {
  const groups = await pageGroups(tab.id, site, settings);

  const total = (id) => groups.filter((g) => g.group === id).reduce((n, g) => n + g.count, 0);
  const totals = { blocked: total('blocked'), allowed: total('allowed'), off: total('off') };
  $('n-blocked').textContent = totals.blocked;
  $('l-blocked').textContent = totals.blocked === 1 ? 'tracker blocked' : 'trackers blocked';
  $('n-allowed').textContent = totals.allowed;
  $('l-allowed').textContent = totals.allowed === 1 ? 'tracker allowed' : 'trackers allowed';
  $('n-off').textContent = totals.off;
  const offCategories = new Set(groups.filter((g) => g.group === 'off').map((g) => g.category));
  $('l-off').textContent = offCategories.size === 1 && offCategories.has('content')
    ? 'content requests (videos, images, fonts), not blocked'
    : 'not blocked, category off';

  const breakage = breakageList(groups);
  $('breakage').hidden = !breakage.length;
  $('break-list').replaceChildren(...breakage.slice(0, MAX_BREAKAGE).map((e) => breakageRow(e, toggleAllow)));
  const more = breakage.length - MAX_BREAKAGE;
  $('break-more').hidden = more <= 0;
  $('break-more').textContent = `and ${more} more`;

  // The company lists below skip what the breakage list already shows.
  const inBreakage = new Set(breakage.map((e) => e));
  $('groups').replaceChildren(...GROUPS.map((g) => {
    const companies = new Map();
    for (const entry of groups) {
      if (entry.group !== g.id || inBreakage.has(entry) || !entry.count) continue;
      const c = companies.get(entry.company) ?? { count: 0, categories: new Set() };
      c.count += entry.count;
      c.categories.add(entry.category);
      companies.set(entry.company, c);
    }
    if (!companies.size) return null;
    const sorted = [...companies].sort(([, a], [, b]) => b.count - a.count);
    const items = sorted.slice(0, MAX_COMPANIES).map(([name, { count, categories }]) => {
      const label = document.createElement('span');
      label.className = 'name';
      label.append(name, ' ', Object.assign(document.createElement('span'), {
        className: 'cats',
        textContent: [...categories].map(categoryLabel).join(', '),
      }));
      const button = Object.assign(document.createElement('button'), { type: 'button', title: `Manage ${name} on the Trackers page` });
      button.append(label, Object.assign(document.createElement('span'), { className: 'count', textContent: count }));
      button.addEventListener('click', () => openTrackers(name));
      const li = document.createElement('li');
      li.append(button);
      return li;
    });
    if (sorted.length > MAX_COMPANIES) {
      items.push(Object.assign(document.createElement('li'), { className: 'more', textContent: `and ${sorted.length - MAX_COMPANIES} more` }));
    }
    const section = document.createElement('div');
    section.className = `group ${g.id}`;
    const list = document.createElement('ul');
    list.append(...items);
    section.append(Object.assign(document.createElement('h3'), { textContent: g.title }), list);
    return section;
  }).filter(Boolean));
}

for (const button of levelButtons) {
  button.addEventListener('click', async (e) => {
    let level = button.dataset.level;
    // Ctrl+click (Cmd+click on a Mac) on Strict is Lockdown.
    if (level === 'strict' && (e.ctrlKey || e.metaKey)) level = 'lockdown';
    if (level === siteLevel(url.hostname, settings.siteLevels).level) return;
    settings = await setSiteLevel(site, level);
    render();
    // Rules only affect new requests, so reload to apply the change.
    await chrome.tabs.reload(tab.id);
    window.close();
  });
}

$('fix').addEventListener('click', () => openPage('options/fix.html', { site, tab: tab.id }));
$('break-more').addEventListener('click', () => openPage('options/site.html', { site, tab: tab.id }));
$('site-settings').addEventListener('click', () => openPage('options/site.html', { site, tab: tab.id }));

$('reload').addEventListener('click', async () => {
  await chrome.tabs.reload(tab.id);
  window.close();
});

$('enabled').addEventListener('change', async (e) => {
  settings = await setEnabled(e.target.checked);
  render();
});

$('open-trackers').addEventListener('click', () => openTrackers());
$('open-log').addEventListener('click', () => openPage('options/log.html', { q: site }));

$('open-options').addEventListener('click', async () => {
  await openSettings();
  window.close();
});

showBrowserText();
render();
// Private windows are tinted and say so (see lib/incognito.js).
await initIncognito();
renderBanners();
if (site) renderPage();
