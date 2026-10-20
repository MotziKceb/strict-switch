import { CATEGORIES, LEVELS, dynamicRuleKind, getEngaged, getSettings, reasonFor } from '../lib/core.js';
import { clearLog, getLog } from '../lib/activity.js';
import { brokenSiteIssueUrl } from '../lib/project.js';
import { initIncognito, inIncognito } from '../lib/incognito.js';
import { VERDICTS } from '../lib/consent-record.js';
import { HANDLERS, bannersActive, getBannerSettings } from '../lib/banners.js';

const $ = (id) => document.getElementById(id);

// Private windows get the tint. The log stays usable: it only reads.
await initIncognito();
const privateWindow = await inIncognito();
// Entries from private windows only show in private windows.
const visible = (entries) => entries.filter((e) => privateWindow || !e.incognito);
const categoryLabels = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
const MAX_SHOWN = 1000;
const MAX_REPORT = 500;

let log = visible(await getLog());
let filter = 'trackers';
$('search').value = new URLSearchParams(location.search).get('q') ?? '';

// Entries from before 0.5.1 have no group.
const groupOf = (e) => e.group ?? (e.allowed ? 'allowed' : 'blocked');
const GROUP_LABELS = { blocked: 'Blocked', allowed: 'Allowed', off: 'Category off' };

const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour12: false });

function matchesQuery(e, query) {
  return !query || [e.site, e.company, e.url, e.text, e.platform, e.detail].some((v) => v?.toLowerCase().includes(query));
}

// Cookie banner entries, in plain words.
const BANNER_STATUS = { confirmed: 'allowed', 'vendors-left': 'partial', contradicted: 'blocked' };
function bannerAction(e) {
  if (e.action === 'choice') return e.by === 'you' ? 'Consent record changed after your click' : 'Consent record changed after a click by a script';
  const clicked = e.clicked?.length ? `Clicked: ${e.clicked.map((c) => `"${c}"`).join(', ')}` : e.clicks ? `Clicked ${e.clicks} ${e.clicks === 1 ? 'time' : 'times'}` : '';
  if (e.action === 'failed') return `Couldn't finish rejecting${clicked ? `. ${clicked}` : ''}`;
  return `Rejected${clicked ? `. ${clicked}` : ''}`;
}
function bannerWhy(e) {
  const test = e.selfTest === true ? ' Autoconsent\'s own check passed.' : e.selfTest === false ? ' Autoconsent\'s own check failed.' : '';
  return `${e.detail ?? ''}${test}${e.hint ? ` ${e.hint}` : ''}`.trim();
}

function filtered({ withEvents = false } = {}) {
  const query = $('search').value.trim().toLowerCase();
  return log.filter((e) => {
    // Reports keep settings changes for context, whatever the filter.
    // Changes also show among trackers, to explain why a tracker flips.
    if (e.kind === 'event') return withEvents || (['event', 'trackers', 'all'].includes(filter) && matchesQuery(e, query));
    if (e.kind === 'banner') return ['banners', 'trackers', 'all'].includes(filter) && matchesQuery(e, query);
    if (filter === 'event' || filter === 'banners') return false;
    const group = groupOf(e);
    if (filter === 'trackers' && group === 'off') return false;
    if (['blocked', 'allowed', 'off'].includes(filter) && group !== filter) return false;
    return matchesQuery(e, query);
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
    text.colSpan = 5;
    tr.append(cell('col-time', time(e.time)), text);
    return tr;
  }
  if (e.kind === 'banner') {
    tr.className = 'cookie-banner';
    const status = Object.assign(document.createElement('span'), {
      className: `status ${BANNER_STATUS[e.verdict] ?? 'off'}`,
      textContent: VERDICTS[e.verdict] ?? VERDICTS.pending,
    });
    tr.append(
      cell('col-time', time(e.time)),
      cell('col-site', e.site ?? ''),
      cell('col-company', e.platform ?? ''),
      cell('col-category', 'Cookie banner'),
      cell('col-request', bannerAction(e)),
      cell('col-result', status, Object.assign(document.createElement('span'), { className: 'why', textContent: bannerWhy(e) })),
    );
    return tr;
  }
  const repeats = e.count > 1 ? [' ', Object.assign(document.createElement('span'), { className: 'repeat', textContent: `×${e.count.toLocaleString()}` })] : [];
  if (e.aggregate) repeats.unshift(' ', Object.assign(document.createElement('span'), { className: 'type', textContent: '(many addresses)' }));
  const request = e.url
    ? [e.url, ' ', Object.assign(document.createElement('span'), { className: 'type', textContent: e.type ?? '' }), ...repeats]
    : [Object.assign(document.createElement('span'), { className: 'type', textContent: e.kind === 'basic' ? 'page' : 'details not available' })];
  const group = groupOf(e);
  tr.className = group;
  const status = Object.assign(document.createElement('span'), { className: `status ${group}`, textContent: GROUP_LABELS[group] });
  tr.append(
    cell('col-time', time(e.time)),
    cell('col-site', e.site ?? ''),
    cell('col-company', e.company ?? ''),
    cell('col-category', categoryLabels[e.category] ?? ''),
    cell('col-request', ...request),
    cell('col-result', status, Object.assign(document.createElement('span'), { className: 'why', textContent: reasonFor(e, groupOf(e)) })),
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

// Request counts per group for the search, whatever the group filter.
function summary(query) {
  const totals = { blocked: 0, allowed: 0, off: 0 };
  for (const e of log) {
    if (e.kind !== 'event' && e.kind !== 'banner' && matchesQuery(e, query.toLowerCase())) totals[groupOf(e)] += e.count ?? 1;
  }
  return `${totals.blocked} blocked, ${totals.allowed} allowed, ${totals.off} category off`;
}

async function buildReport() {
  const [settings, engaged, rulesets, dynamic, bannersOn, banners] = await Promise.all([
    getSettings(),
    getEngaged(),
    chrome.declarativeNetRequest.getEnabledRulesets(),
    chrome.declarativeNetRequest.getDynamicRules(),
    bannersActive(),
    getBannerSettings(),
  ]);
  const matching = filtered({ withEvents: true });
  // Unless the category-off group is what's being reported, summarize it per
  // site and domain: it's mostly a site's own content with unique file names.
  const summarizeOff = filter !== 'off';
  const isRequest = (e) => e.kind !== 'event' && e.kind !== 'banner';
  const entries = matching.filter((e) => !(summarizeOff && isRequest(e) && groupOf(e) === 'off')).slice(-MAX_REPORT);
  const offSummary = new Map();
  if (summarizeOff) {
    for (const e of matching) {
      if (!isRequest(e) || groupOf(e) !== 'off') continue;
      const host = e.url?.split('/')[0] ?? '-';
      const key = [e.site ?? '-', e.company ?? '-', categoryLabels[e.category] ?? '-', host].join(' | ');
      offSummary.set(key, (offSummary.get(key) ?? 0) + (e.count ?? 1));
    }
  }
  const ruleCounts = {};
  for (const { id } of dynamic) {
    const kind = dynamicRuleKind(id) ?? 'other';
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
    `- Totals for this search: ${summary(query)}`,
    '',
    '## Settings',
    '',
    `- Strict layer: ${settings.enabled ? 'on' : 'off'}`,
    `- Categories on: ${CATEGORIES.filter((c) => settings.categories[c.id]).map((c) => c.label).join(', ') || 'none'}`,
    `- Sites: ${Object.entries(settings.siteLevels).map(([s, l]) => `${s} (${LEVELS[l].label})`).join(', ') || 'none (all Strict)'}`,
    `- Block on owners' own sites: ${settings.blockOwnSites ? 'on' : 'off'}`,
    `- Company rules: ${Object.entries(settings.companyRules).map(([c, r]) => `${c} (${r})`).join(', ') || 'none (all Auto)'}`,
    `- Visited regularly: ${engaged.join(', ') || 'none'}`,
    `- Cookie banners: ${bannersOn ? `on, handled by ${HANDLERS[banners.handler].label}${banners.sitesOff.length ? `, auto-reject off for ${banners.sitesOff.join(', ')}` : ''}` : 'off'}`,
    `- Enabled rulesets: ${rulesets.join(', ') || 'none'}`,
    `- Dynamic rules: ${Object.entries(ruleCounts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
    '',
    '## Log',
    '',
    ...(summarizeOff ? ['Trackers and settings changes. Requests not blocked because their category is off are summarized below.', ''] : []),
    '```',
    ...entries.map((e) => e.kind === 'event'
      ? `${time(e.time)}  ** ${e.text}`
      : e.kind === 'banner'
        ? `${time(e.time)}  ${e.site ?? '-'} | ${e.platform ?? '-'} | Cookie banner | ${bannerAction(e)} | ${(VERDICTS[e.verdict] ?? VERDICTS.pending).toUpperCase()}: ${bannerWhy(e)}`
      : `${time(e.time)}  ${e.site ?? '-'} | ${e.company ?? '-'} | ${categoryLabels[e.category] ?? '-'} | ${e.url ?? '-'} ${e.aggregate ? '(many addresses) ' : ''}${e.type ?? ''}${e.count > 1 ? ` x${e.count}` : ''} | ${GROUP_LABELS[groupOf(e)].toUpperCase()}: ${reasonFor(e, groupOf(e))}`),
    '```',
  ];
  if (offSummary.size) {
    lines.push(
      '',
      '## Not blocked, category off (summary)',
      '',
      '```',
      ...[...offSummary].sort(([, a], [, b]) => b - a).map(([key, n]) => `${key} | ${n} ${n === 1 ? 'request' : 'requests'}`),
      '```',
    );
  }
  return lines.join('\n') + '\n';
}

function flash(text) {
  $('copied').textContent = text;
  $('copied').hidden = false;
  setTimeout(() => ($('copied').hidden = true), 3000);
}

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(await buildReport());
  flash('Report copied. Paste it wherever you need it.');
});

// Copies the report, then opens the GitHub issue form for the user to paste
// it into. Nothing is sent by the extension.
$('report').addEventListener('click', async () => {
  await navigator.clipboard.writeText(await buildReport());
  const query = $('search').value.trim();
  chrome.tabs.create({ url: brokenSiteIssueUrl(/^[a-z0-9.-]+\.[a-z]+$/i.test(query) ? query : null) });
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
    log = visible(await getLog());
    render();
  }, 300);
});

render();
