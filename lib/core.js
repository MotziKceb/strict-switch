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

const BASIC_RULE_ID = 1;
const BALANCED_RULE_ID = 2;

const DEFAULTS = {
  enabled: true,
  siteLevels: {},
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(['enabled', 'siteLevels', 'relaxedSites', 'categories']);
  return {
    enabled: stored.enabled ?? DEFAULTS.enabled,
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

let entitiesPromise;

// Tracker companies and the domains they own, from rules/entities.json.
export function getEntities() {
  entitiesPromise ??= fetch(chrome.runtime.getURL('rules/entities.json')).then((r) => r.json());
  return entitiesPromise;
}

// Companies you visit regularly, kept up to date by the background worker.
export async function getEngaged() {
  const { engaged = [] } = await chrome.storage.local.get('engaged');
  return engaged;
}

export async function applyRules(settings) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];
  for (const { id } of CATEGORIES) {
    (settings.enabled && settings.categories[id] ? enableRulesetIds : disableRulesetIds).push(id);
  }
  await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });

  const sitesAt = (level) => Object.keys(settings.siteLevels).filter((s) => settings.siteLevels[s] === level);
  const basicSites = sitesAt('basic');
  const balancedSites = sitesAt('balanced');
  const addRules = [];

  // Basic: let everything through in these pages (including frames they
  // embed), leaving only Edge's own protection.
  if (basicSites.length) {
    addRules.push({
      id: BASIC_RULE_ID,
      priority: 100,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: basicSites, resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }

  // Balanced: on these sites, allow trackers owned by companies you visit
  // regularly, like Edge's Org Engagement mitigation. Everything else stays blocked.
  const engaged = balancedSites.length ? await getEngaged() : [];
  if (engaged.length) {
    const entities = await getEntities();
    const requestDomains = [...new Set(engaged.flatMap((name) => entities[name] ?? []))];
    if (requestDomains.length) {
      addRules.push({
        id: BALANCED_RULE_ID,
        priority: 50,
        action: { type: 'allow' },
        condition: { requestDomains, initiatorDomains: balancedSites },
      });
    }
  }

  // Removing by fixed ids keeps this safe when the background worker and a
  // page apply the same change at once.
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [BASIC_RULE_ID, BALANCED_RULE_ID], addRules });
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

export async function setEnabled(enabled) {
  return update({ enabled });
}
