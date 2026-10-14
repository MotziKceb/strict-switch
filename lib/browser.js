// Strict Switch runs in any Chromium browser. Browsers differ in what
// protection they have of their own, which changes what "Basic" leaves you
// with and what the settings page advises, so each gets a profile. Browsers
// that don't identify themselves (Vivaldi reports itself as Chrome) get the
// generic Chromium wording, which is true everywhere.

const brands = navigator.userAgentData?.brands?.map((b) => b.brand) ?? [];
const ua = navigator.userAgent;

function detect() {
  if (brands.includes('Microsoft Edge') || / Edg\//.test(ua)) return 'edge';
  if (navigator.brave || brands.includes('Brave')) return 'brave';
  if (brands.includes('Opera') || brands.includes('Opera GX') || / OPR\//.test(ua)) return 'opera';
  if (brands.includes('Google Chrome')) return 'chrome';
  return 'chromium';
}

const PROFILES = {
  edge: {
    name: 'Edge',
    calloutTitle: 'Set Edge to Basic',
    calloutBody: 'Strict Switch provides the Strict layer, so set Edge\'s own tracking prevention to Basic. Every site then keeps Edge\'s Basic protection, even the ones you step down.',
    settingsLabel: 'Open Edge privacy settings',
    settingsUrl: 'edge://settings/privacy',
    dntSettingsUrl: 'edge://settings/privacy',
    basicShort: 'Edge only',
    basicNote: 'Only Edge\'s own tracking prevention is active on this site.',
    pausedNote: 'The Strict layer is off everywhere. Only Edge\'s own protection is active.',
    basicLeaves: ', leaving Edge\'s own protection',
    ownSitesNote: 'Edge\'s Strict mode lets those through. ',
  },
  brave: {
    name: 'Brave',
    calloutTitle: 'Works alongside Brave Shields',
    calloutBody: 'Brave Shields blocks trackers too, and keeps running next to Strict Switch, so sites you put on Basic still have Shields. If a site breaks, check both: this popup and the Shields icon in the address bar.',
    settingsLabel: 'Open Shields settings',
    settingsUrl: 'brave://settings/shields',
    dntSettingsUrl: 'brave://settings/?search=do+not+track',
    basicShort: 'Shields only',
    basicNote: 'Only Brave Shields is active on this site.',
    pausedNote: 'The Strict layer is off everywhere. Only Brave Shields is active.',
    basicLeaves: ', leaving Brave Shields',
    ownSitesNote: '',
  },
  opera: {
    name: 'Opera',
    calloutTitle: 'Works alongside Opera\'s blocker',
    calloutBody: 'Opera has its own ad and tracker blocker. You can keep it on next to Strict Switch, so sites you put on Basic still have it. If a site breaks, check both.',
    settingsLabel: 'Open Opera settings',
    settingsUrl: 'opera://settings',
    dntSettingsUrl: 'opera://settings/?search=do+not+track',
    basicShort: 'Opera only',
    basicNote: 'Only Opera\'s own blocker (if it\'s on) is active on this site.',
    pausedNote: 'The Strict layer is off everywhere. Only Opera\'s own blocker (if it\'s on) is active.',
    basicLeaves: ', leaving Opera\'s own blocker if it\'s on',
    ownSitesNote: '',
  },
  chrome: {
    name: 'Chrome',
    calloutTitle: 'No built-in safety net',
    calloutBody: 'Chrome has no tracker blocking of its own, so sites you put on Basic get no tracker blocking at all. Blocking third-party cookies in Chrome\'s settings gives them some protection.',
    settingsLabel: 'Open cookie settings',
    settingsUrl: 'chrome://settings/cookies',
    // "Send a Do Not Track request" sits under Advanced on this page.
    dntSettingsUrl: 'chrome://settings/cookies',
    basicShort: 'No blocking',
    basicNote: 'No trackers are blocked on this site.',
    pausedNote: 'The Strict layer is off everywhere. No trackers are being blocked.',
    basicLeaves: '',
    ownSitesNote: '',
  },
  chromium: {
    name: 'your browser',
    calloutTitle: 'Your browser\'s own protection',
    calloutBody: 'Sites you put on Basic get only what your browser blocks by itself, which may be nothing. If your browser has its own tracker blocker, like Vivaldi\'s, you can keep it on next to Strict Switch. Blocking third-party cookies in its settings also helps.',
    settingsLabel: 'Open browser settings',
    settingsUrl: 'chrome://settings',
    dntSettingsUrl: 'chrome://settings/?search=do+not+track',
    basicShort: 'Browser only',
    basicNote: 'Only your browser\'s own protection, if it has any, is active on this site.',
    pausedNote: 'The Strict layer is off everywhere. Only your browser\'s own protection, if any, is active.',
    basicLeaves: '',
    ownSitesNote: '',
  },
};

export const browserId = detect();
export const browser = PROFILES[browserId];

// Fills elements marked data-browser-text="key" with this browser's wording,
// and hides the ones that end up empty.
export function showBrowserText(root = document) {
  for (const el of root.querySelectorAll('[data-browser-text]')) {
    el.textContent = browser[el.dataset.browserText] ?? '';
    if (el.dataset.hideEmpty !== undefined) el.hidden = !el.textContent;
  }
}
