// Generates the static declarativeNetRequest rulesets in rules/ from the
// Disconnect tracking protection list (the same list Edge's own tracking
// prevention is based on).
//
//   node tools/build-rules.mjs
//   node tools/build-rules.mjs --services services.json --entities entities.json
//
// Behind a proxy, run with NODE_USE_ENV_PROXY=1.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rules');

// Extension category id -> Disconnect categories it is built from.
const CATEGORIES = {
  advertising: ['Advertising'],
  analytics: ['Analytics'],
  social: ['Social'],
  fingerprinting: ['FingerprintingInvasive', 'FingerprintingGeneral'],
  cryptomining: ['Cryptomining'],
  content: ['Content'],
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

async function load(file, fallbackName) {
  if (file) return JSON.parse(await readFile(file, 'utf8'));
  const res = await fetch(BASE + fallbackName);
  if (!res.ok) throw new Error(`Fetching ${fallbackName} failed: ${res.status}`);
  return res.json();
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

function cleanDomain(d) {
  const domain = String(d).trim().toLowerCase().replace(/\.$/, '');
  return DOMAIN_RE.test(domain) ? domain : null;
}

// Walks up the domain labels so sub.tracker.com finds the entity of tracker.com.
function lookup(map, domain) {
  for (let d = domain; d.includes('.'); d = d.slice(d.indexOf('.') + 1)) {
    if (map.has(d)) return map.get(d);
  }
  return null;
}

const services = await load(arg('--services'), 'services.json');
const entities = await load(arg('--entities'), 'entities.json');

// domain -> entity name, and entity name -> every domain it owns.
const entityOf = new Map();
const entityDomains = new Map();
for (const [name, { properties = [], resources = [] }] of Object.entries(entities.entities)) {
  const owned = new Set();
  for (const d of [...properties, ...resources]) {
    const domain = cleanDomain(d);
    if (!domain) continue;
    owned.add(domain);
    if (!entityOf.has(domain)) entityOf.set(domain, name);
  }
  entityDomains.set(name, owned);
}

// Companies with trackers, keyed by name: the domains they own, their tracker
// domains and the categories those are in. A tracker domain without a known
// owner counts as its own company. Used by the Balanced level and the
// Trackers page.
const trackerEntities = {};

// For each category, the company behind each rule (rule id - 1), so matched
// rules can be traced back to a company.
const ruleIndex = {};

const meta = { source: 'Disconnect tracking protection list', generated: new Date().toISOString(), categories: {} };

for (const [id, sourceCategories] of Object.entries(CATEGORIES)) {
  // Group domains by owning entity so a company's trackers are not blocked on
  // its own sites (Edge does the same, e.g. facebook.net on facebook.com).
  const groups = new Map();
  for (const sourceCategory of sourceCategories) {
    for (const service of services.categories[sourceCategory] ?? []) {
      for (const urls of Object.values(service)) {
        for (const domains of Object.values(urls)) {
          if (!Array.isArray(domains)) continue;
          for (const d of domains) {
            const domain = cleanDomain(d);
            if (!domain) continue;
            const entity = lookup(entityOf, domain) ?? domain;
            if (!groups.has(entity)) groups.set(entity, new Set());
            groups.get(entity).add(domain);
          }
        }
      }
    }
  }

  const rules = [];
  let domainCount = 0;
  for (const [entity, domains] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const condition = {
      requestDomains: [...domains].sort(),
      domainType: 'thirdParty',
    };
    const owned = [...(entityDomains.get(entity) ?? [entity])].sort();
    condition.excludedInitiatorDomains = owned;
    rules.push({ id: rules.length + 1, priority: 1, action: { type: 'block' }, condition });
    trackerEntities[entity] ??= { owned, trackers: new Set(), categories: [] };
    for (const domain of domains) trackerEntities[entity].trackers.add(domain);
    trackerEntities[entity].categories.push(id);
    domainCount += domains.size;
  }

  ruleIndex[id] = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  // One rule per line keeps the files compact and the diffs readable.
  await writeFile(path.join(OUT_DIR, `${id}.json`), '[\n' + rules.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
  meta.categories[id] = { domains: domainCount, rules: rules.length };
  console.log(`${id}: ${domainCount} domains in ${rules.length} rules`);
}

const sortedEntities = Object.entries(trackerEntities)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, e]) => [name, { ...e, trackers: [...e.trackers].sort() }]);
await writeFile(
  path.join(OUT_DIR, 'entities.json'),
  '{\n' + sortedEntities.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n') + '\n}\n',
);
await writeFile(path.join(OUT_DIR, 'rule-index.json'), JSON.stringify(ruleIndex) + '\n');
console.log(`companies: ${sortedEntities.length}`);

await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
