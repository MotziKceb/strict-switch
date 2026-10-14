import { CATEGORIES, COMPANY_RULES, companyStatus, getEngaged, getEntities, getSettings, setCompanyRule } from '../lib/core.js';
import { clearSeen, getSeen } from '../lib/activity.js';

const $ = (id) => document.getElementById(id);
const categoryLabels = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const entities = await getEntities();

let settings = await getSettings();
let engaged = await getEngaged();
let seen = await getSeen();
let filter = 'all';

const params = new URLSearchParams(location.search);
$('search').value = params.get('q') ?? '';

function timeAgo(time) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function row(name, entity) {
  const status = companyStatus(name, entity, settings, engaged);
  const caught = seen[name];

  const title = el('div', { className: 'company-name' },
    el('strong', { textContent: name }),
    el('span', { className: 'tag', textContent: Object.keys(entity.trackers).map((c) => categoryLabels[c]).join(', ') }),
  );

  let details = '';
  if (caught) {
    const parts = [];
    if (caught.blocked) parts.push(`${caught.blocked} blocked`);
    if (caught.allowed) parts.push(`${caught.allowed} allowed`);
    if (caught.off) parts.push(`${caught.off} not blocked (category off)`);
    details = `Total ${parts.join(', ')}, last ${timeAgo(caught.last)}`;
    if (caught.sites.length) details += ` on ${caught.sites.slice(0, 3).join(', ')}`;
    if (caught.sites.length > 3) details += ` and ${caught.sites.length - 3} more`;
  } else {
    details = 'Not caught yet';
  }

  const rule = el('div', { className: 'rule', role: 'radiogroup' });
  rule.setAttribute('aria-label', `Rule for ${name}`);
  for (const [value, { label, description }] of Object.entries(COMPANY_RULES)) {
    const button = el('button', { type: 'button', textContent: label, title: description });
    button.dataset.rule = value;
    button.dataset.company = name;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(status.rule === value));
    rule.append(button);
  }

  return el('li', { className: 'company' },
    title,
    rule,
    el('div', { className: 'details' },
      el('span', { className: `status ${status.state}`, textContent: status.text }),
      ' · ',
      details,
      ' · ',
      el('a', { className: 'log-link', href: `log.html?q=${encodeURIComponent(name)}`, textContent: 'Log' }),
    ),
  );
}

function matches(name, entity, query) {
  if (!query) return true;
  return name.toLowerCase().includes(query) || Object.values(entity.trackers).some((ds) => ds.some((d) => d.includes(query)));
}

function render() {
  $('paused').hidden = settings.enabled;
  const query = $('search').value.trim().toLowerCase();

  const candidates = Object.entries(entities).filter(
    ([name]) => $('show-all').checked || seen[name] || settings.companyRules[name],
  );
  const shown = candidates.filter(([name, entity]) => {
    if (!matches(name, entity, query)) return false;
    if (filter === 'all') return true;
    const { state } = companyStatus(name, entity, settings, engaged);
    return filter === 'blocked' ? state === 'blocked' : state !== 'blocked';
  });
  // Most recently caught first, then by name.
  shown.sort(([a], [b]) => (seen[b]?.last ?? 0) - (seen[a]?.last ?? 0) || a.localeCompare(b));

  $('companies').replaceChildren(...shown.map(([name, entity]) => row(name, entity)));
  $('count').textContent = `${shown.length} of ${candidates.length} ${candidates.length === 1 ? 'company' : 'companies'}`;

  const empty = $('empty');
  empty.hidden = shown.length > 0;
  if (!candidates.length) {
    empty.textContent = 'Nothing caught yet. Browse a few sites and trackers will show up here.';
  } else {
    empty.textContent = 'No companies match.';
  }
}

$('companies').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-rule]');
  if (!button || button.getAttribute('aria-checked') === 'true') return;
  settings = await setCompanyRule(button.dataset.company, button.dataset.rule);
  render();
});

for (const button of document.querySelectorAll('.filter button')) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    for (const b of document.querySelectorAll('.filter button')) b.setAttribute('aria-checked', String(b === button));
    render();
  });
}

$('search').addEventListener('input', render);
$('show-all').addEventListener('change', render);

$('clear').addEventListener('click', async () => {
  if (!confirm('Clear the list of caught trackers? Your Block and Allow choices are kept.')) return;
  await clearSeen();
});

// Keep up with new catches and changes made elsewhere.
let refreshTimer = null;
chrome.storage.onChanged.addListener(() => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    [settings, engaged, seen] = await Promise.all([getSettings(), getEngaged(), getSeen()]);
    render();
  }, 300);
});

render();
