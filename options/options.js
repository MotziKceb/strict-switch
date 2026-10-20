import { browser, showBrowserText } from '../lib/browser.js';
import { ISSUES_URL, PRIVACY_URL } from '../lib/project.js';
import { HANDLERS, getBannerSettings, hasAccess } from '../lib/banners.js';
import { isDue, isExpired, readGuard } from '../lib/guard.js';
import { CATEGORIES, LEVELS, clearSiteAllows, getEngaged, getSettings, setBalancedCategory, setBlockOwnSites, setCategory, setCompanyRule, setEnabled, setSiteLevel, siteKey, siteLevel, settingsChanged } from '../lib/core.js';
import { diagnostics, extensionDetailsUrl, incognitoAllowed, initIncognito } from '../lib/incognito.js';

const $ = (id) => document.getElementById(id);

// Private windows are tinted and say so (see lib/incognito.js).
await initIncognito();
const meta = await fetch('../rules/meta.json').then((r) => r.json());

let settings = await getSettings();

function render() {
  $('enabled').checked = settings.enabled;
  $('categories').classList.toggle('off', !settings.enabled);
  $('block-own').checked = settings.blockOwnSites;
  $('block-own').disabled = !settings.enabled;

  $('categories').replaceChildren(
    ...CATEGORIES.map((c) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'checkbox',
        checked: settings.categories[c.id],
        disabled: !settings.enabled,
      });
      input.addEventListener('change', async () => {
        settings = await setCategory(c.id, input.checked);
        render();
      });
      const text = document.createElement('span');
      const domains = meta.categories[c.id]?.domains ?? 0;
      text.append(
        Object.assign(document.createElement('strong'), { textContent: c.label }),
        Object.assign(document.createElement('span'), {
          className: 'muted',
          textContent: `${c.description} ${domains.toLocaleString()} domains.`,
        }),
      );
      const label = Object.assign(document.createElement('label'), { className: 'switch' });
      label.append(input, text);
      const li = document.createElement('li');
      li.append(label);
      return li;
    }),
  );

  // Sites with a level other than Strict, or with exceptions.
  const sites = [...new Set([
    ...Object.keys(settings.siteLevels), ...Object.keys(settings.siteAllows), ...Object.keys(settings.siteCategories),
  ])].sort();
  $('sites').replaceChildren(
    ...sites.map((site) => {
      const level = settings.siteLevels[site] ?? 'strict';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Level for ${site}`);
      for (const value of ['lockdown', 'strict', 'balanced', 'basic']) {
        select.append(new Option(LEVELS[value].label, value, false, value === level));
      }
      select.addEventListener('change', async () => {
        settings = await setSiteLevel(site, select.value);
        render();
      });
      const remove = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'remove',
        textContent: 'Strict',
        title: `Set ${site} back to Strict`,
        disabled: level === 'strict',
      });
      remove.addEventListener('click', async () => {
        settings = await setSiteLevel(site, 'strict');
        render();
      });
      const actions = Object.assign(document.createElement('div'), { className: 'site-actions' });
      actions.append(select, remove);

      const name = Object.assign(document.createElement('div'), { className: 'site-name' });
      name.append(Object.assign(document.createElement('a'), {
        href: `site.html?site=${encodeURIComponent(site)}`,
        textContent: site,
        title: `Settings for ${site}`,
      }));
      const overrides = Object.entries(settings.siteCategories[site] ?? {});
      if (overrides.length) {
        name.append(Object.assign(document.createElement('span'), {
          className: 'exceptions',
          textContent: `Categories here: ${overrides.map(([id, on]) => `${CATEGORIES.find((c) => c.id === id)?.label ?? id} ${on ? 'on' : 'off'}`).join(', ')}`,
        }));
      }
      const exceptions = settings.siteAllows[site] ?? [];
      if (exceptions.length) {
        const line = Object.assign(document.createElement('span'), {
          className: 'exceptions',
          textContent: `Allowed here: ${exceptions.map((p) => {
            const [company, category] = p.split(':');
            return `${company} ${CATEGORIES.find((c) => c.id === category)?.label ?? category}`;
          }).join(', ')}`,
        });
        const clear = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Remove' });
        clear.addEventListener('click', async () => {
          settings = await clearSiteAllows(site);
          render();
        });
        line.append(clear);
        name.append(line);
      }
      const li = document.createElement('li');
      li.append(name, actions);
      return li;
    }),
  );

  $('balanced-categories').replaceChildren(
    ...CATEGORIES.map((c) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'checkbox',
        checked: settings.balancedCategories.includes(c.id),
      });
      input.addEventListener('change', async () => {
        settings = await setBalancedCategory(c.id, input.checked);
        render();
      });
      const label = Object.assign(document.createElement('label'), { className: 'switch' });
      label.append(input, c.label);
      const li = document.createElement('li');
      li.append(label);
      return li;
    }),
  );
  $('sites-empty').hidden = sites.length > 0;
}

async function renderEngaged() {
  const engaged = await getEngaged();
  $('engaged-summary').textContent = `${engaged.length} ${engaged.length === 1 ? 'company' : 'companies'}`;
  $('engaged').replaceChildren(...engaged.map((name) => {
    const li = document.createElement('li');
    const blocked = settings.companyRules[name] === 'block';
    const action = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'remove',
      textContent: blocked ? 'Unblock' : 'Block',
    });
    action.addEventListener('click', async () => {
      settings = await setCompanyRule(name, blocked ? 'auto' : 'block');
      render();
      renderEngaged();
    });
    const label = document.createElement('span');
    label.append(name);
    if (blocked) label.append(' ', Object.assign(document.createElement('span'), { className: 'blocked-note', textContent: 'Blocked' }));
    li.append(label, action);
    return li;
  }));
}

async function renderBanners() {
  const [access, guard, { handler }] = await Promise.all([hasAccess(), readGuard(), getBannerSettings()]);
  if (!access || isExpired(guard)) {
    $('banners-status').textContent = 'Off. Strict Switch can click "reject" on cookie banners for you and check that sites record it. That needs permission to read the sites you visit, so it stays off until you switch it on.';
    return;
  }
  const date = new Date(guard.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' });
  $('banners-status').textContent = `On. Cookie banners are handled by: ${HANDLERS[handler].label}. Access ends on ${date} unless you renew it.${isDue(guard) ? ' A reminder is waiting for you.' : ''}`;
}

// Accepts a bare domain or a pasted URL.
function parseSite(text) {
  const value = text.trim();
  if (!value) return null;
  try {
    return siteKey(new URL(value.includes('://') ? value : `https://${value}`).hostname);
  } catch {
    return null;
  }
}

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const site = parseSite($('add-input').value);
  $('add-error').hidden = Boolean(site);
  if (!site) {
    $('add-error').textContent = 'Enter a domain like example.com or paste a URL.';
    return;
  }
  const parent = siteLevel(site, settings.siteLevels).site;
  if (parent && parent !== site) {
    $('add-error').hidden = false;
    $('add-error').textContent = `Already covered by ${parent}.`;
    return;
  }
  settings = await setSiteLevel(site, $('add-level').value);
  $('add-input').value = '';
  render();
});

$('block-own').addEventListener('change', async (e) => {
  settings = await setBlockOwnSites(e.target.checked);
  render();
});

$('enabled').addEventListener('change', async (e) => {
  settings = await setEnabled(e.target.checked);
  render();
});

$('open-dnt-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: browser.dntSettingsUrl });
});

$('privacy').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: PRIVACY_URL });
});

$('report-issue').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: ISSUES_URL });
});

$('open-incognito-allow').addEventListener('click', () => {
  chrome.tabs.create({ url: extensionDetailsUrl() });
});
$('diag').addEventListener('toggle', async () => {
  if ($('diag').open) $('diag-text').textContent = JSON.stringify(await diagnostics(), null, 2);
});
$('diag-copy').addEventListener('click', () => navigator.clipboard.writeText($('diag-text').textContent));
incognitoAllowed().then((allowed) => ($('incognito-off').hidden = allowed));

$('open-edge-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: browser.settingsUrl });
});

// Keep in sync with changes made from the popup or the background worker.
chrome.storage.onChanged.addListener(async (changes, area) => {
  // In a private window settings are in session storage, along with the log.
  if (area === 'session' && !settingsChanged(changes, area)) return;
  settings = await getSettings();
  render();
  renderEngaged();
  renderBanners();
});
chrome.permissions.onAdded.addListener(renderBanners);
chrome.permissions.onRemoved.addListener(renderBanners);

showBrowserText();
$('version').textContent = `Version ${chrome.runtime.getManifest().version}`;

const generated = new Date(meta.generated).toLocaleDateString(undefined, { dateStyle: 'medium' });
$('list-info').textContent = `Blocklist: ${meta.source}, built ${generated}.`;

render();
renderEngaged();
renderBanners();
