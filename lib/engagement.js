// Works out which tracker companies you visit regularly, for the Balanced
// level. Edge uses its site engagement score for this; extensions can't read
// that, so this counts visits in your browsing history instead. Nothing
// leaves your device.

import { getEngaged, getEntities } from './core.js';

const WINDOW_DAYS = 30;
const MIN_VISITS = 3;

let indexPromise;

// Domain -> company that owns it.
function getIndex() {
  indexPromise ??= getEntities().then((entities) => {
    const index = new Map();
    for (const [name, domains] of Object.entries(entities)) {
      for (const domain of domains) if (!index.has(domain)) index.set(domain, name);
    }
    return index;
  });
  return indexPromise;
}

// Walks up the domain labels so www.facebook.com finds the owner of facebook.com.
export async function companyFor(hostname) {
  const index = await getIndex();
  for (let d = hostname.toLowerCase(); d.includes('.'); d = d.slice(d.indexOf('.') + 1)) {
    if (index.has(d)) return index.get(d);
  }
  return null;
}

// Recounts visits and stores the companies over the threshold. Returns
// whether the list changed.
export async function refreshEngaged() {
  const items = await chrome.history.search({
    text: '',
    startTime: Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
    maxResults: 100000,
  });
  const visits = new Map();
  for (const { url, visitCount } of items) {
    let host;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      host = parsed.hostname;
    } catch {
      continue;
    }
    const company = await companyFor(host);
    if (company) visits.set(company, (visits.get(company) ?? 0) + (visitCount || 1));
  }

  const engaged = [...visits].filter(([, n]) => n >= MIN_VISITS).map(([name]) => name).sort();
  const previous = await getEngaged();
  if (engaged.join('\n') === previous.join('\n')) return false;
  await chrome.storage.local.set({ engaged });
  return true;
}
