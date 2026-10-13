import { CATEGORIES, LEVELS, getEngaged, getSettings } from '../lib/core.js';
import { clearLog, getLog } from '../lib/activity.js';

const $ = (id) => document.getElementById(id);
const categoryLabels = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const MAX_SHOWN = 1000;
const MAX_REPORT = 500;

let log = await getLog();
let filter = 'all';
$('search').value = new URLSearchParams(location.search).get('q') ?? '';

function why(entry) {
  switch (entry.kind) {
    case 'strict': return `Strict layer (${categoryLabels[entry.category] ?? entry.category})`;
    case 'own-site': return 'Owner\'s own site, blocked by your setting';
    case 'same-company': return 'Same company as the site';
    case 'category-off': return `${categoryLabels[entry.category] ?? entry.category} is switched off`;
    case 'balanced': return 'Balanced site, you visit this company';
    case 'allow': return 'Your rule: Allow';
    case 'block': return 'Your rule: Block';
    case 'basic': return 'Basic site, everything allowed';
    default: return '';
  }
}

const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour12: false });

function filtered() {
  const query = $('search').value.trim().toLowerCase();
  return log.filter((e) => {
    if (filter === 'event' && e.kind !== 'event') return false;
    if (filter === 'blocked' && (e.kind === 'event' || e.allowed)) return false;
    if (filter === 'allowed' && (e.kind === 'event' || !e.allowed)) return false;
    if (!query) return true;
    return [e.site, e.company, e.url, e.text].some((v) => v?.toLowerCase().includes(query));
  });
}

function cell(className, ...children) {
  const td = document.createElement('td');
  td.className = className;
  td.append(...children);
  return td;
}

function row(e) {
  const tr = document.createElement('tr');
  if (e.kind === 'event') {
    tr.className = 'event';
    const text = cell('col-text', e.text);
    text.colSpan = 4;
    tr.append(cell('col-time', time(e.time)), text);
    return tr;
  }
  const repeats = e.count > 1 ? [' ', Object.assign(document.createElement('span'), { className: 'repeat', textContent: `×${e.count}` })] : [];
  const request = e.url
    ? [e.url, ' ', Object.assign(document.createElement('span'), { className: 'type', textContent: e.type ?? '' }), ...repeats]
    : [Object.assign(document.createElement('span'), { className: 'type', textContent: e.kind === 'basic' ? 'page' : 'details not available' })];
  const status = Object.assign(document.createElement('span'), {
    className: `status ${e.allowed ? 'allowed' : 'blocked'}`,
    textContent: e.allowed ? 'Allowed' : 'Blocked',
  });
  tr.append(
    cell('col-time', time(e.time)),
    cell('col-site', e.site ?? ''),
    cell('col-company', e.company ?? ''),
    cell('col-request', ...request),
    cell('col-result', status, Object.assign(document.createElement('span'), { className: 'why', textContent: why(e) })),
  );
  return tr;
}

function render() {
  const entries = filtered();
  const shown = entries.slice(-MAX_SHOWN).reverse();
  $('entries').replaceChildren(...shown.map(row));
  $('count').textContent = entries.length > MAX_SHOWN
    ? `Newest ${MAX_SHOWN} of ${entries.length} entries`
    : `${entries.length} of ${log.length} entries`;
  $('empty').hidden = entries.length > 0;
  $('empty').textContent = log.length ? 'No entries match.' : 'Nothing logged yet. Browse a site and entries will appear here.';
}

async function buildReport() {
  const [settings, engaged, rulesets, dynamic] = await Promise.all([
    getSettings(),
    getEngaged(),
    chrome.declarativeNetRequest.getEnabledRulesets(),
    chrome.declarativeNetRequest.getDynamicRules(),
  ]);
  const entries = filtered().slice(-MAX_REPORT);
  const ranges = [[4e4, 'own-site'], [3e4, 'block'], [2e4, 'allow'], [1e4, 'balanced'], [0, 'basic']];
  const ruleCounts = {};
  for (const { id } of dynamic) {
    const kind = ranges.find(([base]) => id >= base)[1];
    ruleCounts[kind] = (ruleCounts[kind] ?? 0) + 1;
  }
  const query = $('search').value.trim();

  const lines = [
    '# Strict Switch report',
    '',
    `- Version: ${chrome.runtime.getManifest().version}`,
    `- Browser: ${navigator.userAgent}`,
    `- Created: ${new Date().toString()}`,
    `- Filter: ${filter}${query ? `, "${query}"` : ''} (${entries.length} entries)`,
    '',
    '## Settings',
    '',
    `- Strict layer: ${settings.enabled ? 'on' : 'off'}`,
    `- Categories on: ${CATEGORIES.filter((c) => settings.categories[c.id]).map((c) => c.label).join(', ') || 'none'}`,
    `- Sites: ${Object.entries(settings.siteLevels).map(([s, l]) => `${s} (${LEVELS[l].label})`).join(', ') || 'none (all Strict)'}`,
    `- Block on owners' own sites: ${settings.blockOwnSites ? 'on' : 'off'}`,
    `- Company rules: ${Object.entries(settings.companyRules).map(([c, r]) => `${c} (${r})`).join(', ') || 'none (all Auto)'}`,
    `- Visited regularly: ${engaged.join(', ') || 'none'}`,
    `- Enabled rulesets: ${rulesets.join(', ') || 'none'}`,
    `- Dynamic rules: ${Object.entries(ruleCounts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
    '',
    '## Log',
    '',
    '```',
    ...entries.map((e) => e.kind === 'event'
      ? `${time(e.time)}  ** ${e.text}`
      : `${time(e.time)}  ${e.site ?? '-'} | ${e.company ?? '-'} | ${e.url ?? '-'} ${e.type ?? ''}${e.count > 1 ? ` x${e.count}` : ''} | ${e.allowed ? 'ALLOWED' : 'BLOCKED'}: ${why(e)}`),
    '```',
  ];
  return lines.join('\n') + '\n';
}

function flash(text) {
  $('copied').textContent = text;
  $('copied').hidden = false;
  setTimeout(() => ($('copied').hidden = true), 3000);
}

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(await buildReport());
  flash('Report copied. Paste it into your chat with Claude.');
});

$('download').addEventListener('click', async () => {
  const blob = new Blob([await buildReport()], { type: 'text/markdown' });
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `strict-switch-report-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`,
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Clear the activity log?')) return;
  await clearLog();
});

for (const button of document.querySelectorAll('.filter button')) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    for (const b of document.querySelectorAll('.filter button')) b.setAttribute('aria-checked', String(b === button));
    render();
  });
}

$('search').addEventListener('input', render);

let refreshTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes.log) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    log = await getLog();
    render();
  }, 300);
});

render();
