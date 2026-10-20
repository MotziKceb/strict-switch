// Private windows (Incognito in Chrome, InPrivate in Edge, Private in Brave,
// Opera and Vivaldi). Strict Switch can tell when it's in one, tints its
// pages, and keeps changes made there from being saved: anything saved
// would outlive the private window.
//
// Browsers only run extensions in private windows if the user allows it for
// each extension, so there's also a check for that.

import { browser } from './browser.js';

// Whether this page is in a private window. The window says so, in every
// Chromium browser, with no extra permission.
export async function inIncognito() {
  try {
    return (await chrome.windows.getCurrent()).incognito === true;
  } catch {
    return chrome.extension?.inIncognitoContext === true;
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

export const NOTE = (name) => `${name} window. Settings are read-only here for now, so nothing from private browsing is saved. Change them in a normal window.`;

// Tints the page and adds the name as a faint watermark. Returns whether the
// window is private. With { lock: true }, also adds the note and switches off
// everything that would change a setting, except what's marked
// data-incognito-ok (links to other pages, and so on).
export async function initIncognito({ lock = true } = {}) {
  if (!(await inIncognito())) return false;
  document.body.classList.add('incognito');
  document.body.dataset.incognito = browser.incognitoName;
  if (lock) {
    // A page can put the note where it wants with an #incognito-note element.
    let note = document.getElementById('incognito-note');
    if (!note) {
      note = Object.assign(document.createElement('p'), { className: 'incognito-note', id: 'incognito-note' });
      (document.querySelector('main') ?? document.body).prepend(note);
    }
    note.textContent = NOTE(browser.incognitoName);
    note.hidden = false;
    lockControls(document.body);
  }
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
