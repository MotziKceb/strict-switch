// Settings and rule handling shared by the background worker, popup and
// options page. chrome.storage.sync is the source of truth for settings;
// applyRules() mirrors it into declarativeNetRequest.

export const CATEGORIES = [
  { id: 'advertising', label: 'Advertising', description: 'Ad networks and ad tracking.', defaultOn: true },
  { id: 'analytics', label: 'Analytics', description: 'Cross-site analytics and measurement.', defaultOn: true },
  { id: 'social', label: 'Social', description: 'Social network trackers and widgets.', defaultOn: true },
  { id: 'fingerprinting', label: 'Fingerprinting', description: 'Scripts that identify your browser.', defaultOn: true },
  { id: 'cryptomining', label: 'Cryptomining', description: 'Scripts that mine cryptocurrency.', defaultOn: true },
  {
    id: 'content',
    label: 'Tracking content',
    description: 'Embedded videos, maps and fonts from tracking companies. Breaks many sites.',
    defaultOn: false,
  },
];

// Sites not listed are on Strict.
export const LEVELS = {
  strict: { label: 'Strict', short: 'Block all trackers' },
  balanced: { label: 'Balanced', short: 'Allow sites you visit' },
  basic: { label: 'Basic', short: 'Edge only' },
};

// Per-company overrides set on the Trackers page. Companies not listed are on
// auto: blocked, except on Balanced sites if you visit them regularly.
export const COMPANY_RULES = {
  block: { label: 'Block', description: 'Blocked everywhere, including its own sites and Balanced sites' },
  auto: { label: 'Auto', description: 'Blocked, but allowed on Balanced sites if you visit them regularly' },
  allow: { label: 'Allow', description: 'Allowed on every site' },
};

// Dynamic rule ids. Company rules get one rule per category, with an id that
// encodes the company's index in rules/entities.json and the category, so a
// matched rule can be traced back to both.
const BASIC_RULE_ID = 1;
const BALANCED_RULE_BASE = 100000;
const ALLOW_RULE_BASE = 200000;
const BLOCK_RULE_BASE = 300000;
const OWN_SITE_RULE_BASE = 400000;
const RULE_BASES = [
  [OWN_SITE_RULE_BASE, 'own-site'],
  [BLOCK_RULE_BASE, 'block'],
  [ALLOW_RULE_BASE, 'allow'],
  [BALANCED_RULE_BASE, 'balanced'],
];
const CATEGORY_SLOTS = 8;
const categoryIds = CATEGORIES.map((c) => c.id);
const companyRuleId = (base, companyIndex, category) =>
  base + companyIndex * CATEGORY_SLOTS + categoryIds.indexOf(category);

// Static block rules use priority 3; the always-on "observe" ruleset lets
// through what nothing blocks (priorities 1-2) so it still gets reported.
const BLOCK_PRIORITY = 3;

const DEFAULTS = {
  enabled: true,
  siteLevels: {},
  companyRules: {},
  // Strict means strict: a company's trackers are blocked on its own sites
  // too, unlike Edge. Turned off, it matches Edge's Strict mode.
  blockOwnSites: true,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get([
    'enabled', 'siteLevels', 'relaxedSites', 'categories', 'companyRules', 'blockOwnSites', 'blockOwnSitesV2',
  ]);
  return {
    enabled: stored.enabled ?? DEFAULTS.enabled,
    // Before 0.5.3 this was off by default, so only a choice made since counts.
    blockOwnSites: stored.blockOwnSitesV2 ? stored.blockOwnSites : DEFAULTS.blockOwnSites,
    companyRules: stored.companyRules ?? DEFAULTS.companyRules,
    // relaxedSites is the 0.1.0 list of sites on Basic.
    siteLevels: stored.siteLevels ?? Object.fromEntries((stored.relaxedSites ?? []).map((s) => [s, 'basic'])),
    categories: { ...DEFAULTS.categories, ...stored.categories },
  };
}

// The site key for a hostname: lowercase, without a leading "www.".
// A level set for example.com also covers its subdomains, like Edge's [*.]example.com.
export function siteKey(hostname) {
  const host = String(hostname).trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : null;
}

function covers(site, host) {
  return host === site || host.endsWith('.' + site);
}

// The listed site covering this hostname (exact or a parent domain) and its level.
export function siteLevel(hostname, siteLevels) {
  const host = String(hostname).toLowerCase();
  const site = Object.keys(siteLevels).find((s) => covers(s, host));
  return site ? { site, level: siteLevels[site] } : { site: null, level: 'strict' };
}

const loadJson = (file) => fetch(chrome.runtime.getURL(file)).then((r) => r.json());
let entitiesPromise;
let ruleIndexPromise;

// Tracker companies from rules/entities.json, by name:
// { owned: [domains], trackers: { [category id]: [domains] } }.
export function getEntities() {
  entitiesPromise ??= loadJson('rules/entities.json');
  return entitiesPromise;
}

// What a matched rule did: { company, kind, allowed, category }. kind is one of:
// - 'strict': blocked by the static blocklist (category set)
// - 'own-site': blocked on its owner's own site (blockOwnSites setting)
// - 'balanced', 'allow', 'block': the company rules
// - 'same-company': allowed because the site belongs to the same company
// - 'category-off': allowed because its category is switched off (category set)
// - 'basic': a Basic site; company is null
export async function describeRule({ ruleId, rulesetId }) {
  if (rulesetId === '_dynamic') {
    if (ruleId === BASIC_RULE_ID) return { company: null, kind: 'basic', allowed: true };
    const [base, kind] = RULE_BASES.find(([b]) => ruleId >= b) ?? [];
    if (!kind) return null;
    const offset = ruleId - base;
    const company = Object.keys(await getEntities())[Math.floor(offset / CATEGORY_SLOTS)];
    const category = categoryIds[offset % CATEGORY_SLOTS];
    return company ? { company, kind, allowed: kind === 'allow' || kind === 'balanced', category } : null;
  }
  ruleIndexPromise ??= loadJson('rules/rule-index.json');
  const entry = (await ruleIndexPromise)[rulesetId]?.[ruleId - 1];
  if (!entry) return null;
  if (rulesetId === 'observe') {
    const [company, kind, category] = entry;
    return { company, kind, allowed: true, category };
  }
  return { company: entry, kind: 'strict', allowed: false, category: rulesetId };
}

// The kind of a dynamic rule, from its id: 'basic', a company rule kind, or null.
export function dynamicRuleKind(ruleId) {
  if (ruleId === BASIC_RULE_ID) return 'basic';
  return RULE_BASES.find(([base]) => ruleId >= base)?.[1] ?? null;
}

// Which of the three groups a match falls in, in plain terms:
// - 'blocked': a tracker that was blocked
// - 'allowed': a tracker that got through (same company, Balanced, Allow, Basic)
// - 'off': not blocked because its category is switched off, which with the
//   defaults means content like videos, images and fonts
export function groupOf(match, categories) {
  if (!match.allowed) return 'blocked';
  if (match.category && !categories[match.category]) return 'off';
  return 'allowed';
}

// Plain-language reason for a match. For the 'off' group the switched-off
// category is the reason, whatever rule happened to report the request.
export function reasonFor(match, group) {
  const category = CATEGORIES.find((c) => c.id === match.category)?.label ?? 'Tracker';
  if (group === 'off') return `${category} is switched off`;
  switch (match.kind) {
    case 'strict': return `${category} tracker`;
    case 'own-site': return `${category} tracker on its owner's site (your setting)`;
    case 'block': return `You blocked ${match.company}`;
    case 'allow': return `You allowed ${match.company}`;
    case 'balanced': return `Balanced site, you visit ${match.company}`;
    case 'same-company': return `${match.company} owns this site`;
    case 'category-off': return `${category} is switched off`;
    case 'basic': return 'Site is on Basic';
    default: return '';
  }
}

// How a company's trackers are treated, for display.
export function companyStatus(name, entity, settings, engaged) {
  const rule = settings.companyRules[name] ?? 'auto';
  if (rule === 'block') return { rule, state: 'blocked', text: 'Always blocked' };
  if (rule === 'allow') return { rule, state: 'allowed', text: 'Always allowed' };
  if (!Object.keys(entity.trackers).some((c) => settings.categories[c])) {
    return { rule, state: 'allowed', text: 'Allowed (category off)' };
  }
  if (engaged.includes(name)) return { rule, state: 'partial', text: 'Allowed on Balanced sites' };
  return { rule, state: 'blocked', text: 'Blocked' };
}

// Companies you visit regularly, kept up to date by the background worker.
export async function getEngaged() {
  const { engaged = [] } = await chrome.storage.local.get('engaged');
  return engaged;
}

export function applyRules(settings) {
  // The popup, settings pages and background worker can all apply rules; a
  // lock shared across them keeps the updates from interleaving.
  return navigator.locks.request('apply-rules', () => applyRulesNow(settings));
}

async function applyRulesNow(settings) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];
  for (const { id } of CATEGORIES) {
    (settings.enabled && settings.categories[id] ? enableRulesetIds : disableRulesetIds).push(id);
  }
  (settings.enabled ? enableRulesetIds : disableRulesetIds).push('observe');
  await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });

  const addRules = settings.enabled ? await dynamicRules(settings) : [];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules });
}

async function dynamicRules(settings) {
  const sitesAt = (level) => Object.keys(settings.siteLevels).filter((s) => settings.siteLevels[s] === level);
  const basicSites = sitesAt('basic');
  const balancedSites = sitesAt('balanced');
  const rules = [];

  // Basic: let everything through in these pages (including frames they
  // embed), leaving only Edge's own protection.
  if (basicSites.length) {
    rules.push({
      id: BASIC_RULE_ID,
      priority: 100,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: basicSites, resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }

  const entities = await getEntities();
  const engaged = new Set(balancedSites.length ? await getEngaged() : []);
  Object.entries(entities).forEach(([name, { owned, trackers }], i) => {
    const rule = settings.companyRules[name];
    for (const [category, requestDomains] of Object.entries(trackers)) {
      // Company rules follow the category switches, so blocking a company
      // doesn't block e.g. its fonts while Tracking content is off.
      if (!settings.categories[category]) continue;
      const id = (base) => companyRuleId(base, i, category);
      if (rule === 'block') {
        // A company you block is blocked on its own sites too.
        rules.push({
          id: id(BLOCK_RULE_BASE),
          priority: 80,
          action: { type: 'block' },
          condition: { requestDomains, domainType: 'thirdParty' },
        });
      } else if (rule === 'allow') {
        rules.push({ id: id(ALLOW_RULE_BASE), priority: 60, action: { type: 'allow' }, condition: { requestDomains } });
      } else {
        if (engaged.has(name)) {
          // Balanced: allow companies you visit regularly, like Edge's Org
          // Engagement mitigation. Everything else stays blocked.
          rules.push({
            id: id(BALANCED_RULE_BASE),
            priority: 50,
            action: { type: 'allow' },
            condition: { requestDomains, initiatorDomains: balancedSites },
          });
        }
        if (settings.blockOwnSites) {
          // The static rules skip a company's own sites, like Edge does; this
          // blocks its trackers there too.
          rules.push({
            id: id(OWN_SITE_RULE_BASE),
            priority: BLOCK_PRIORITY,
            action: { type: 'block' },
            condition: { requestDomains, domainType: 'thirdParty', initiatorDomains: owned },
          });
        }
      }
    }
  });
  return rules;
}

async function update(changes) {
  await chrome.storage.sync.set(changes);
  const settings = await getSettings();
  await applyRules(settings);
  return settings;
}

export async function setSiteLevel(site, level) {
  const { siteLevels } = await getSettings();
  // Entries for subdomains are replaced by the one for the whole site.
  const next = Object.fromEntries(Object.entries(siteLevels).filter(([s]) => !covers(site, s)));
  if (level !== 'strict') next[site] = level;
  await chrome.storage.sync.remove('relaxedSites');
  return update({ siteLevels: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))) });
}

export async function setCategory(id, on) {
  const { categories } = await getSettings();
  return update({ categories: { ...categories, [id]: on } });
}

export async function setCompanyRule(name, rule) {
  const { companyRules } = await getSettings();
  const next = { ...companyRules };
  if (rule === 'auto') delete next[name];
  else next[name] = rule;
  return update({ companyRules: next });
}

export async function setBlockOwnSites(blockOwnSites) {
  return update({ blockOwnSites, blockOwnSitesV2: true });
}

export async function setEnabled(enabled) {
  return update({ enabled });
}
