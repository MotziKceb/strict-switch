// Settings for one site: its level, its own category switches, the trackers
// allowed on it, and (when opened from the popup) what's blocked on the open
// page right now.

import { CATEGORY_HINTS, breakageRow, fullList, pageGroups } from '../lib/breakage.js';
import { browser } from '../lib/browser.js';
import { bannerSiteOff, bannersActive, getBannerSettings, setBannerSite } from '../lib/banners.js';
import {
  CATEGORIES, LEVELS, clearSiteAllows, getPrivateOptions, getSettings, privateSiteSettings, setPrivateFollowSite, setSiteAllow, setSiteCategory, setSiteLevel, siteCategoryOverrides, siteLevel,
} from '../lib/core.js';
import { initIncognito, keepSiteInNormal } from '../lib/incognito.js';

const $ = (id) => document.getElementById(id);

// Private windows are tinted and say so (see lib/incognito.js).
const privateWindow = await initIncognito();
const params = new URLSearchParams(location.search);
const site = params.get('site');
const tabId = params.has('tab') ? Number(params.get('tab')) : null;

let settings = await getSettings();

const LEVEL_ORDER = ['lockdown', 'strict', 'balanced', 'basic'];

function renderLevel() {
  const current = siteLevel(site, settings.siteLevels);
  const inherited = current.site && current.site !== site;
  $('levels').replaceChildren(...LEVEL_ORDER.map((level) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.level = level;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(current.level === level));
    button.disabled = inherited;
    button.append(
      Object.assign(document.createElement('strong'), { textContent: LEVELS[level].label }),
      Object.assign(document.createElement('span'), { textContent: level === 'basic' ? browser.basicShort : LEVELS[level].short }),
    );
    button.addEventListener('click', async () => {
      // Lockdown builds thousands of rules; show the click registered.
      for (const b of $('levels').children) b.setAttribute('aria-checked', String(b === button));
      $('level-note').textContent = 'Applying...';
      settings = await setSiteLevel(site, level);
      render();
    });
    return button;
  }));
  $('level-note').textContent = inherited
    ? `Set to ${LEVELS[current.level].label} through ${current.site}; change it there.`
    : 'Reload the site to apply a change.';
  return current.level;
}

function renderCategories(level) {
  const { site: owner, overrides } = siteCategoryOverrides(site, settings);
  const inherited = owner && owner !== site;
  const notApplicable = level === 'lockdown' || level === 'basic';
  $('categories-note').textContent = level === 'lockdown'
    ? 'This site is on Lockdown, which blocks every category whatever these switches say.'
    : level === 'basic'
      ? 'This site is on Basic, so Strict Switch blocks nothing here whatever these switches say.'
      : inherited
        ? `These switches come from ${owner}; change them there.`
        : 'Switch a category off to let it through on this site only, or on to block it here even if it\'s off everywhere else.';
  $('categories').classList.toggle('off', notApplicable);

  $('categories').replaceChildren(...CATEGORIES.map((c) => {
    const global = settings.categories[c.id];
    const changed = c.id in overrides;
    const on = changed ? overrides[c.id] : global;
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on, disabled: notApplicable || inherited });
    input.setAttribute('aria-label', `${c.label} on ${site}`);
    input.addEventListener('change', async () => {
      // Matching the global switch again means no override.
      settings = await setSiteCategory(site, c.id, input.checked === global ? null : input.checked);
      render();
    });
    const text = document.createElement('span');
    text.append(
      Object.assign(document.createElement('strong'), { textContent: c.label }),
      Object.assign(document.createElement('span'), { className: 'muted', textContent: `${CATEGORY_HINTS[c.id][0].toUpperCase()}${CATEGORY_HINTS[c.id].slice(1)}.` }),
    );
    const label = Object.assign(document.createElement('label'), { className: 'switch' });
    label.append(input, text);

    const state = Object.assign(document.createElement('span'), {
      className: `state${changed ? ' changed' : ''}`,
      textContent: changed ? `Changed for this site (globally ${global ? 'on' : 'off'})` : `Same as global (${global ? 'on' : 'off'})`,
    });
    if (changed && !inherited) {
      const reset = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Use global setting' });
      reset.addEventListener('click', async () => {
        settings = await setSiteCategory(site, c.id, null);
        render();
      });
      state.append(reset);
    }
    const li = document.createElement('li');
    li.append(label, state);
    return li;
  }));
  $('reset-categories').hidden = inherited || !Object.keys(overrides).length;
}

async function toggleAllow(entry, allowed) {
  settings = await setSiteAllow(site, entry.company, entry.category, allowed);
  renderExceptions();
}

function renderExceptions() {
  const pairs = settings.siteAllows[site] ?? [];
  $('exceptions').replaceChildren(...pairs.map((pair) => {
    const [company, category] = pair.split(':');
    return breakageRow({ company, category, count: 0, score: 0, siteAllowed: true }, toggleAllow);
  }));
  $('exceptions-empty').hidden = pairs.length > 0;
  $('clear').hidden = !pairs.length;
}

// Normal windows choose what private windows start with; private windows can
// keep this site's settings in normal browsing.
async function renderPrivate() {
  $('private-site-section').hidden = privateWindow;
  $('keep-section').hidden = true;
  if (privateWindow) {
    $('keep-section').hidden = !Object.keys(await privateSiteSettings(site)).length;
    return;
  }
  const { start, followSites } = await getPrivateOptions();
  $('private-follow').checked = start === 'normal' || followSites.includes(site);
  $('private-follow').disabled = start === 'normal';
  $('private-follow-note').textContent = start === 'normal'
    ? 'Private windows start from all your normal settings (see Private windows in Settings), so this is already on. '
    : followSites.includes(site)
      ? 'On: private windows start with this site\'s settings as they are when the window opens. '
      : 'Off: this site starts on Strict in private windows. On: private windows start with its settings as they are when the window opens. ';
}

$('private-follow').addEventListener('change', async (e) => {
  await setPrivateFollowSite(site, e.target.checked);
  renderPrivate();
});

$('keep').addEventListener('click', async () => {
  if (await keepSiteInNormal(site)) {
    $('kept').hidden = false;
  }
});

$('fix-link').href = `fix.html?site=${encodeURIComponent(site)}${tabId !== null ? `&tab=${tabId}` : ''}`;

async function renderBanners() {
  const [active, { handler, sitesOff }] = await Promise.all([bannersActive(), getBannerSettings()]);
  const owner = bannerSiteOff(site, sitesOff);
  const inherited = owner && owner !== site;
  $('banner-site').checked = !owner;
  $('banner-site').disabled = Boolean(inherited) || !active || handler !== 'self';
  $('banner-note').replaceChildren(
    !active ? 'Auto-reject is off everywhere. Switch it on under Cookie banners in Settings. '
      : handler !== 'self' ? 'Cookie banners are handled by someone else (see Cookie banners in Settings), so Strict Switch never clicks them. '
        : inherited ? `Switched off through ${owner}; change it there. `
          : owner ? 'Off here: Strict Switch won\'t click banners on this site, but still checks the consent record. '
            : 'Strict Switch clicks "reject" on this site\'s cookie banner. Switch off if it gets in the way. ',
    Object.assign(document.createElement('a'), { href: 'banners.html', textContent: 'Cookie banner settings' }),
  );
}

$('banner-site').addEventListener('change', async (e) => {
  await setBannerSite(site, e.target.checked);
  renderBanners();
});

async function renderPage() {
  $('page-section').hidden = tabId === null;
  if (tabId === null) return;
  const list = fullList(await pageGroups(tabId, site, settings)).filter((e) => !e.siteAllowed);
  $('list').replaceChildren(...list.map((e) => breakageRow(e, async (entry, allowed) => {
    await toggleAllow(entry, allowed);
  })));
  $('empty').hidden = list.length > 0;
}

async function render() {
  document.title = `Strict Switch: ${site}`;
  $('title').textContent = `Settings for ${site}`;
  $('scope').textContent = `Changes here only apply to ${site} and its subdomains. Everything else follows your global settings.`;
  const level = renderLevel();
  renderCategories(level);
  renderExceptions();
  renderBanners();
  renderPrivate();
  await renderPage();
}

$('reset-categories').addEventListener('click', async () => {
  for (const id of Object.keys(siteCategoryOverrides(site, settings).overrides)) {
    settings = await setSiteCategory(site, id, null);
  }
  render();
});

$('clear').addEventListener('click', async () => {
  if (!confirm(`Remove everything you've allowed on ${site}?`)) return;
  settings = await clearSiteAllows(site);
  render();
});

$('reload').addEventListener('click', async () => {
  try {
    await chrome.tabs.reload(tabId);
    $('done').textContent = 'Page reloaded. Refreshing this list...';
    $('done').hidden = false;
    setTimeout(async () => {
      settings = await getSettings();
      await renderPage();
      $('done').hidden = true;
    }, 2500);
  } catch {
    $('done').textContent = 'That tab is gone. Reload the site yourself to apply your changes.';
    $('done').hidden = false;
  }
});

if (!site) {
  document.querySelector('main').textContent = 'No site given. Open this page from the Strict Switch popup or settings.';
} else {
  await render();
}
