import { CATEGORIES, getSettings, setCategory, setEnabled, setRelaxed, siteKey } from '../lib/core.js';

const $ = (id) => document.getElementById(id);
const meta = await fetch('../rules/meta.json').then((r) => r.json());

let settings = await getSettings();

function render() {
  $('enabled').checked = settings.enabled;
  $('categories').classList.toggle('off', !settings.enabled);

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

  $('sites').replaceChildren(
    ...settings.relaxedSites.map((site) => {
      const remove = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'remove',
        textContent: 'Back to Strict',
      });
      remove.addEventListener('click', async () => {
        settings = await setRelaxed(site, false);
        render();
      });
      const li = document.createElement('li');
      li.append(site, remove);
      return li;
    }),
  );
  $('sites-empty').hidden = settings.relaxedSites.length > 0;
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
  settings = await setRelaxed(site, true);
  $('add-input').value = '';
  render();
});

$('enabled').addEventListener('change', async (e) => {
  settings = await setEnabled(e.target.checked);
  render();
});

$('open-edge-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: 'edge://settings/privacy' });
});

// Keep in sync with changes made from the popup.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  settings = await getSettings();
  render();
});

const generated = new Date(meta.generated).toLocaleDateString(undefined, { dateStyle: 'medium' });
$('list-info').textContent = `Blocklist: ${meta.source}, built ${generated}.`;

render();
