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
  block: { label: 'Block', description: 'Blocked everywhere, even on Balanced sites' },
  auto: { label: 'Auto', description: 'Blocked, but allowed on Balanced sites if you visit them regularly' },
  allow: { label: 'Allow', description: 'Allowed on every site' },
};

// Dynamic rule ids. Company rules are offset by the company's index in
// rules/entities.json so a matched rule can be traced back to its company.
const BASIC_RULE_ID = 1;
const BALANCED_RULE_BASE = 10000;
const ALLOW_RULE_BASE = 20000;
const BLOCK_RULE_BASE = 30000;
const OWN_SITE_RULE_BASE = 40000;

// Static block rules use priority 3; the always-on "observe" ruleset lets
// through what nothing blocks (priorities 1-2) so it still gets reported.
const BLOCK_PRIORITY = 3;

const DEFAULTS = {
  enabled: true,
  siteLevels: {},
  companyRules: {},
  blockOwnSites: false,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get([
    'enabled', 'siteLevels', 'relaxedSites', 'categories', 'companyRules', 'blockOwnSites',
  ]);
  return {
    enabled: stored.enabled ?? DEFAULTS.enabled,
    blockOwnSites: stored.blockOwnSites ?? DEFAULTS.blockOwnSites,
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
    const ranges = [
      [OWN_SITE_RULE_BASE, 'own-site'],
      [BLOCK_RULE_BASE, 'block'],
      [ALLOW_RULE_BASE, 'allow'],
      [BALANCED_RULE_BASE, 'balanced'],
    ];
    const [base, kind] = ranges.find(([b]) => ruleId >= b) ?? [];
    if (!kind) return null;
    const company = Object.keys(await getEntities())[ruleId - base];
    return company ? { company, kind, allowed: kind === 'allow' || kind === 'balanced' } : null;
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
  Object.entries(entities).forEach(([name, { owned, trackers: byCategory }], i) => {
    // Company rules follow the category switches, so blocking a company
    // doesn't block e.g. its fonts while Tracking content is off.
    const trackers = [...new Set(
      Object.entries(byCategory).flatMap(([category, domains]) => (settings.categories[category] ? domains : [])),
    )];
    if (!trackers.length) return;
    const rule = settings.companyRules[name];
    if (settings.blockOwnSites && !rule) {
      // The static rules skip a company's own sites, like Edge does; this
      // blocks its trackers there too.
      rules.push({
        id: OWN_SITE_RULE_BASE + i,
        priority: BLOCK_PRIORITY,
        action: { type: 'block' },
        condition: { requestDomains: trackers, domainType: 'thirdParty', initiatorDomains: owned },
      });
    }
    if (rule === 'block') {
      const condition = { requestDomains: trackers, domainType: 'thirdParty' };
      if (!settings.blockOwnSites) condition.excludedInitiatorDomains = owned;
      rules.push({ id: BLOCK_RULE_BASE + i, priority: 80, action: { type: 'block' }, condition });
    } else if (rule === 'allow') {
      rules.push({ id: ALLOW_RULE_BASE + i, priority: 60, action: { type: 'allow' }, condition: { requestDomains: trackers } });
    } else if (engaged.has(name)) {
      // Balanced: allow companies you visit regularly, like Edge's Org
      // Engagement mitigation. Everything else stays blocked.
      rules.push({
        id: BALANCED_RULE_BASE + i,
        priority: 50,
        action: { type: 'allow' },
        condition: { requestDomains: trackers, initiatorDomains: balancedSites },
      });
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
  return update({ blockOwnSites });
}

export async function setEnabled(enabled) {
  return update({ enabled });
}
