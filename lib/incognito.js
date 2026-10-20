// Private windows (Incognito in Chrome, InPrivate in Edge, Private in Brave,
// Opera and Vivaldi). A private window runs its own copy of the extension
// (manifest "incognito": "split") whose settings are in memory only, start
// empty (every site on Strict) and are gone when the window closes. See
// settingsStore in core.js. Pages in a private window are tinted and say so.
//
// Browsers only run extensions in private windows if the user allows it for
// each extension, so there's also a check for that.

import { browser } from './browser.js';
import { inPrivateWindow, settingsArea } from './core.js';

// Whether this page is in a private window. The window says so, in every
// Chromium browser, with no extra permission.
export async function inIncognito() {
  try {
    return (await chrome.windows.getCurrent()).incognito === true;
  } catch {
    return inPrivateWindow();
  }
}

// Whether the user has allowed Strict Switch in private windows. If not, it
// isn't running there at all.
export async function incognitoAllowed() {
  try {
    return await chrome.extension.isAllowedIncognitoAccess();
  } catch {
    return true;
  }
}

export const extensionDetailsUrl = () => `${browser.extensionsScheme}://extensions/?id=${chrome.runtime.id}`;

export const NOTE = (name) => `${name} window. Every site starts on Strict. Changes you make here stay in this ${name} window and are forgotten when it closes.`;

// Opens the settings page. The browser's own "open options" opens it in a
// normal window, so in a private window the page is opened in this one.
export async function openSettings() {
  if (await inIncognito()) await chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  else await chrome.runtime.openOptionsPage();
}

// Tints the page and adds a note. Returns whether the window is private. With
// { lock: true }, also switches off everything that would change a setting,
// except what's marked data-incognito-ok (for pages whose feature isn't
// available in private windows).
export async function initIncognito({ lock = false, note = NOTE(browser.incognitoName) } = {}) {
  if (!(await inIncognito())) return false;
  document.body.classList.add('incognito');
  // A page can put the note where it wants with an #incognito-note element.
  let el = document.getElementById('incognito-note');
  if (!el) {
    el = Object.assign(document.createElement('p'), { className: 'incognito-note', id: 'incognito-note' });
    (document.querySelector('main') ?? document.body).prepend(el);
  }
  el.textContent = note;
  el.hidden = false;
  if (lock) lockControls(document.body);
  return true;
}

// Switches off form controls and buttons now and as the page redraws.
export function lockControls(root) {
  const lock = () => {
    for (const el of root.querySelectorAll('input, select, textarea, button')) {
      if (el.closest('[data-incognito-ok]') || el.disabled) continue;
      el.disabled = true;
      el.dataset.lockedByIncognito = '';
    }
  };
  lock();
  new MutationObserver(lock).observe(root, { childList: true, subtree: true });
}

// What a private window's instance is actually doing, for checking that it
// is separate from the normal one. Names only: no values, no site names.
export async function diagnostics() {
  const keys = async (area) => {
    try {
      return Object.keys(await chrome.storage[area].get(null)).sort();
    } catch (e) {
      return `error: ${e.message}`;
    }
  };
  let rules = null;
  let rulesets = null;
  try {
    rules = (await chrome.declarativeNetRequest.getDynamicRules()).length;
    rulesets = (await chrome.declarativeNetRequest.getEnabledRulesets()).join(', ');
  } catch (e) {
    rules = `error: ${e.message}`;
  }
  return {
    version: chrome.runtime.getManifest().version,
    browser: navigator.userAgent,
    inIncognitoContext: chrome.extension?.inIncognitoContext,
    windowIncognito: await inIncognito(),
    settingsStore: settingsArea(),
    syncKeys: await keys('sync'),
    localKeys: await keys('local'),
    sessionKeys: await keys('session'),
    dynamicRules: rules,
    enabledRulesets: rulesets,
  };
}
