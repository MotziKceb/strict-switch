// Groups what happened on a page by company and category, and ranks blocked
// groups by how likely they are to break it. Shared by the popup and the
// per-site page (options/site.html).

import { CATEGORIES, describeRule, getEntities, groupOf } from './core.js';

// Plain words for what a category's requests usually are on a page.
export const CATEGORY_HINTS = {
  content: 'videos, images, fonts and page code',
  social: 'logins, comments and embedded posts',
  advertising: 'ads and ad measurement',
  analytics: 'visitor statistics',
  fingerprinting: 'browser identification',
  cryptomining: 'cryptocurrency mining',
};

export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

function ownsSite(entity, site) {
  return Boolean(site && entity?.owned.some((d) => site === d || site.endsWith('.' + d)));
}

// 0-5: content the page needs scores highest, then a company's trackers on its
// own site (often its own infrastructure), then social logins and embeds.
// Ads, analytics and the like rarely break pages.
export function breakageScore(category, company, site, entities) {
  let score = { content: 3, social: 2 }[category] ?? 0;
  if (ownsSite(entities[company], site)) score += 2;
  return Math.min(score, 5);
}

export function breakageLabel(score) {
  if (score >= 3) return 'Likely breaks the page';
  if (score >= 2) return 'May break the page';
  return null;
}

// Groups the tab's matched rules. Returns entries of
// { company, category, group, kinds, count, score, siteAllowed }, including
// per-site exceptions for this site that haven't matched yet.
export async function pageGroups(tabId, site, settings) {
  const entities = await getEntities();
  let rules = [];
  try {
    ({ rulesMatchedInfo: rules } = await chrome.declarativeNetRequest.getMatchedRules({ tabId }));
  } catch {
    // Rate limited, or no access to this tab.
  }
  const groups = new Map();
  const add = (company, category, group) => {
    const key = `${company}:${category}:${group}`;
    if (!groups.has(key)) {
      groups.set(key, {
        company,
        category,
        group,
        kinds: new Set(),
        count: 0,
        score: breakageScore(category, company, site, entities),
        siteAllowed: false,
      });
    }
    return groups.get(key);
  };
  // Count identical rules first: a page retrying blocked requests can produce
  // tens of thousands of matches from a handful of rules.
  const counts = new Map();
  for (const { rule } of rules) {
    const key = `${rule.rulesetId}/${rule.ruleId}`;
    const c = counts.get(key);
    if (c) c.n++;
    else counts.set(key, { rule, n: 1 });
  }
  for (const { rule, n } of counts.values()) {
    const match = await describeRule(rule);
    if (!match?.company) continue;
    const entry = add(match.company, match.category, groupOf(match, settings.categories));
    entry.count += n;
    entry.kinds.add(match.kind);
    if (match.kind === 'site-allow') entry.siteAllowed = true;
  }
  for (const pair of settings.siteAllows[site] ?? []) {
    const [company, category] = pair.split(':');
    const existing = [...groups.values()].find((g) => g.company === company && g.category === category && g.siteAllowed);
    if (!existing) add(company, category, 'allowed').siteAllowed = true;
  }
  return [...groups.values()];
}

// The "might break the page" list: blocked groups likely to break it, plus the
// ones you've allowed on this site, most likely first.
export function breakageList(groups) {
  return groups
    .filter((g) => g.siteAllowed || (g.group === 'blocked' && breakageLabel(g.score)))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.company.localeCompare(b.company));
}

// Every blocked group, plus allowed-on-this-site ones, in the same order: for
// the full per-site page.
export function fullList(groups) {
  return groups
    .filter((g) => g.siteAllowed || g.group === 'blocked')
    .sort((a, b) => b.score - a.score || b.count - a.count || a.company.localeCompare(b.company));
}

// One row with a toggle that allows the group on this site.
export function breakageRow(entry, onToggle) {
  const li = document.createElement('li');
  li.className = 'break-row';
  const text = document.createElement('div');
  text.className = 'break-text';
  const title = document.createElement('div');
  title.className = 'break-title';
  title.append(
    Object.assign(document.createElement('strong'), { textContent: entry.company }),
    ' · ',
    categoryLabel(entry.category),
  );
  const detail = document.createElement('div');
  detail.className = 'break-detail';
  const label = breakageLabel(entry.score);
  detail.textContent = [
    CATEGORY_HINTS[entry.category],
    entry.count ? `${entry.count} ${entry.siteAllowed ? 'allowed' : 'blocked'}` : null,
    !entry.siteAllowed && label ? label.toLowerCase() : null,
  ].filter(Boolean).join(' · ');
  text.append(title, detail);

  const toggle = document.createElement('label');
  toggle.className = 'switch';
  toggle.title = `Allow ${entry.company} ${categoryLabel(entry.category)} on this site`;
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: entry.siteAllowed });
  input.setAttribute('aria-label', toggle.title);
  input.addEventListener('change', () => onToggle(entry, input.checked));
  toggle.append(input);
  li.append(text, toggle);
  return li;
}
