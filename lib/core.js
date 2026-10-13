// Settings and rule handling shared by the background worker, popup and
// options page. chrome.storage.sync is the source of truth; applyRules()
// mirrors it into declarativeNetRequest.

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

const EXCEPTION_RULE_ID = 1;

const DEFAULTS = {
  enabled: true,
  relaxedSites: [],
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, c.defaultOn])),
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(['enabled', 'relaxedSites', 'categories']);
  return {
    enabled: stored.enabled ?? DEFAULTS.enabled,
    relaxedSites: stored.relaxedSites ?? DEFAULTS.relaxedSites,
    categories: { ...DEFAULTS.categories, ...stored.categories },
  };
}

// The site key for a hostname: lowercase, without a leading "www.".
// Relaxing example.com also covers its subdomains, like Edge's [*.]example.com.
export function siteKey(hostname) {
  const host = String(hostname).trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : null;
}

// The relaxed site covering this hostname, if any (exact or a parent domain).
export function relaxedMatch(hostname, relaxedSites) {
  const host = String(hostname).toLowerCase();
  return relaxedSites.find((site) => host === site || host.endsWith('.' + site)) ?? null;
}

export async function applyRules(settings) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];
  for (const { id } of CATEGORIES) {
    (settings.enabled && settings.categories[id] ? enableRulesetIds : disableRulesetIds).push(id);
  }
  await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });

  // One allowAllRequests rule lets everything through in pages from relaxed
  // sites (including frames they embed), leaving Edge's own Basic protection.
  // Removing by fixed id keeps this safe when the background worker and a page
  // apply the same change at once.
  const addRules = settings.relaxedSites.length
    ? [{
        id: EXCEPTION_RULE_ID,
        priority: 100,
        action: { type: 'allowAllRequests' },
        condition: { requestDomains: settings.relaxedSites, resourceTypes: ['main_frame', 'sub_frame'] },
      }]
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [EXCEPTION_RULE_ID], addRules });
}

async function update(changes) {
  await chrome.storage.sync.set(changes);
  const settings = await getSettings();
  await applyRules(settings);
  return settings;
}

export async function setRelaxed(site, relaxed) {
  const { relaxedSites } = await getSettings();
  const others = relaxedSites.filter((s) => s !== site);
  return update({ relaxedSites: relaxed ? [...others, site].sort() : others });
}

export async function setCategory(id, on) {
  const { categories } = await getSettings();
  return update({ categories: { ...categories, [id]: on } });
}

export async function setEnabled(enabled) {
  return update({ enabled });
}
