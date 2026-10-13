// Strict Switch is built for Edge but also runs in Chrome and other Chromium
// browsers. Those have no tracking prevention of their own, so a site on
// Basic gets no tracker blocking there, and the wording changes to match.

export const isEdge = navigator.userAgentData?.brands?.some((b) => b.brand === 'Microsoft Edge')
  ?? / Edg\//.test(navigator.userAgent);

// Shows the elements marked data-browser="edge" or data-browser="other" that
// match this browser and hides the rest.
export function showBrowserText(root = document) {
  for (const el of root.querySelectorAll('[data-browser]')) {
    el.hidden = (el.dataset.browser === 'edge') !== isEdge;
  }
}
