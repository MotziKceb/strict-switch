// Reading a site's consent record back, to check whether a cookie banner
// choice registered. Two standards cover most sites:
// - IAB TCF (most EU banners): the page's __tcfapi says which purposes and
//   vendors have consent, and which still claim "legitimate interest".
// - Google Consent Mode: what the page told Google's tags (ad_storage,
//   analytics_storage, ad_user_data, ad_personalization).
// The record is the site's own claim. It shows what the site says it will
// do, not what its trackers actually do.

export const GCM_TYPES = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];

// Runs in the page's main world (chrome.scripting.executeScript), so it must
// be self-contained. It only reads, and returns plain values.
export function readConsentRecord() {
  const TYPES = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
  const count = (o) => (o && typeof o === 'object' ? Object.values(o).filter((v) => v === true).length : 0);
  const trueKeys = (o) => (o && typeof o === 'object' ? Object.keys(o).filter((k) => o[k] === true).map(Number).filter(Number.isInteger) : []);

  const gcm = () => {
    const state = {};
    let updated = false;
    let found = false;
    const value = (v) => (v === true || v === 'granted' ? 'granted' : v === false || v === 'denied' ? 'denied' : null);
    // gtag's own state, when the page uses Google's tag.
    const entries = window.google_tag_data?.ics?.entries;
    if (entries && typeof entries === 'object') {
      for (const type of TYPES) {
        const e = entries[type];
        if (!e || typeof e !== 'object') continue;
        found = true;
        const update = value(e.update);
        if (update) updated = true;
        state[type] = update ?? value(e.default);
      }
    }
    // Otherwise the consent commands the page queued for it.
    if (!found && Array.isArray(window.dataLayer)) {
      for (const item of window.dataLayer) {
        if (!item || typeof item !== 'object' || item[0] !== 'consent') continue;
        const command = item[1];
        const values = item[2];
        if ((command !== 'default' && command !== 'update') || !values || typeof values !== 'object') continue;
        found = true;
        for (const type of TYPES) {
          const v = value(values[type]);
          if (!v) continue;
          if (command === 'update') {
            state[type] = v;
            updated = true;
          } else if (!(type in state)) {
            state[type] = v;
          }
        }
      }
    }
    return found ? { updated, state } : null;
  };

  const tcf = () => new Promise((resolve) => {
    if (typeof window.__tcfapi !== 'function') return resolve(null);
    const timer = setTimeout(() => resolve({ available: true, answered: false }), 1500);
    try {
      window.__tcfapi('getTCData', 2, (data, success) => {
        clearTimeout(timer);
        if (!success || !data || typeof data !== 'object') return resolve({ available: true, answered: false });
        resolve({
          available: true,
          answered: true,
          gdprApplies: data.gdprApplies === true ? true : data.gdprApplies === false ? false : null,
          cmpId: Number.isInteger(data.cmpId) ? data.cmpId : null,
          eventStatus: typeof data.eventStatus === 'string' ? data.eventStatus.slice(0, 40) : null,
          hasString: typeof data.tcString === 'string' && data.tcString.length > 0,
          string: typeof data.tcString === 'string' ? data.tcString.slice(0, 2000) : '',
          purposeConsents: trueKeys(data.purpose?.consents),
          purposeInterests: trueKeys(data.purpose?.legitimateInterests),
          vendorConsents: count(data.vendor?.consents),
          vendorInterests: count(data.vendor?.legitimateInterests),
        });
      });
    } catch {
      clearTimeout(timer);
      resolve({ available: true, answered: false });
    }
  });

  return tcf().then((t) => ({ tcf: t, gcm: gcm() }));
}

const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const ids = (v) => (Array.isArray(v) ? v.filter((x) => Number.isInteger(x) && x > 0 && x < 100).slice(0, 30) : []);

// The page's answer is untrusted: keep only the expected shapes.
export function sanitizeRecord(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  let tcf = null;
  if (r.tcf && typeof r.tcf === 'object' && r.tcf.available === true) {
    const t = r.tcf;
    tcf = t.answered === true
      ? {
        available: true,
        answered: true,
        gdprApplies: typeof t.gdprApplies === 'boolean' ? t.gdprApplies : null,
        cmpId: Number.isInteger(t.cmpId) ? t.cmpId : null,
        eventStatus: typeof t.eventStatus === 'string' ? t.eventStatus.slice(0, 40) : null,
        hasString: t.hasString === true,
        string: typeof t.string === 'string' ? t.string.slice(0, 2000) : '',
        purposeConsents: ids(t.purposeConsents),
        purposeInterests: ids(t.purposeInterests),
        vendorConsents: int(t.vendorConsents),
        vendorInterests: int(t.vendorInterests),
      }
      : { available: true, answered: false };
  }
  let gcm = null;
  if (r.gcm && typeof r.gcm === 'object' && r.gcm.state && typeof r.gcm.state === 'object') {
    const state = {};
    for (const type of GCM_TYPES) {
      if (r.gcm.state[type] === 'granted' || r.gcm.state[type] === 'denied') state[type] = r.gcm.state[type];
    }
    gcm = { updated: r.gcm.updated === true, state };
  }
  return { tcf, gcm };
}

// A short fingerprint of the record, to notice when it changes.
export function recordSignature({ tcf, gcm }) {
  return JSON.stringify([
    tcf?.answered ? [tcf.eventStatus === 'cmpuishown' ? '' : tcf.string, tcf.purposeConsents, tcf.vendorConsents] : null,
    gcm ? [gcm.updated, GCM_TYPES.map((t) => gcm.state[t] ?? null)] : null,
  ]);
}

// What the record says, as one of:
// - 'confirmed': the record holds a choice, and it gives no consent
// - 'contradicted': the record says consent was given
// - 'vendors-left': no purpose has consent, but vendors are still marked as
//   consented. Under the TCF's rules a vendor needs consent for a purpose
//   as well as for itself, so this alone gives no consent, but the
//   rejection didn't clear everything.
// - 'no-choice': there is a record, but it doesn't show a choice yet
// - 'no-record': nothing Strict Switch can read on this site
export function classifyRecord({ tcf, gcm }) {
  const tcfChoice = Boolean(tcf?.answered && tcf.hasString && tcf.eventStatus !== 'cmpuishown');
  const tcfGranted = Boolean(tcf?.answered && tcf.purposeConsents.length);
  const gcmGranted = Boolean(gcm && Object.values(gcm.state).includes('granted'));
  if ((tcfChoice && tcfGranted) || gcmGranted) return 'contradicted';
  if (tcfChoice && tcf.vendorConsents) return 'vendors-left';
  if (tcfChoice || gcm?.updated) return 'confirmed';
  if (tcf || gcm) return 'no-choice';
  return 'no-record';
}

export const VERDICTS = {
  confirmed: 'Rejection confirmed',
  contradicted: 'Site records consent',
  'vendors-left': 'Rejected, vendors still marked',
  'no-choice': 'No choice recorded',
  'no-record': 'Not verifiable',
  pending: 'Not checked',
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Plain-language summary of the record, one sentence per standard.
export function describeRecord({ tcf, gcm }) {
  const parts = [];
  if (tcf && !tcf.answered) {
    parts.push('The site has an IAB TCF consent record, but it didn\'t answer.');
  } else if (tcf) {
    if (!tcf.hasString || tcf.eventStatus === 'cmpuishown') {
      parts.push('IAB TCF: no choice recorded yet.');
    } else if (tcf.purposeConsents.length) {
      parts.push(`IAB TCF: consent given for ${plural(tcf.purposeConsents.length, 'purpose')} and ${plural(tcf.vendorConsents, 'vendor')}.`);
    } else if (tcf.vendorConsents) {
      parts.push(`IAB TCF: no consent for any purpose, but ${plural(tcf.vendorConsents, 'vendor is', 'vendors are')} still marked as consented. Under the TCF's rules a vendor needs consent for a purpose as well as for itself, so no purpose has consent here, but the rejection didn't clear the vendor list.`);
    } else {
      parts.push('IAB TCF: no consent for any purpose or vendor.');
    }
    if (tcf.hasString && tcf.purposeInterests.length) {
      parts.push(`${plural(tcf.purposeInterests.length, 'purpose')} and ${plural(tcf.vendorInterests, 'vendor')} still claim "legitimate interest", which a rejection doesn't switch off.`);
    }
  }
  if (gcm) {
    const types = GCM_TYPES.filter((t) => gcm.state[t]);
    const granted = types.filter((t) => gcm.state[t] === 'granted');
    if (!types.length) parts.push('Google Consent Mode: no values set.');
    else if (granted.length) parts.push(`Google Consent Mode: ${granted.join(', ')} granted.`);
    else parts.push(`Google Consent Mode: everything denied${gcm.updated ? '' : ' (the site\'s default; no update seen)'}.`);
  }
  if (!parts.length) parts.push('No consent record Strict Switch can read (IAB TCF or Google Consent Mode).');
  return parts.join(' ');
}
