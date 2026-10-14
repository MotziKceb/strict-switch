// Runs DuckDuckGo's autoconsent (vendor/autoconsent/autoconsent.js, loaded
// just before this file) in this frame, to reject cookie banners. Registered
// only while the user has switched auto-reject on.
//
// Only ever rejects: the configuration from the background worker is forced
// to opt-out here too, and messages asking for anything else are dropped.
// Talks only to Strict Switch's own background worker, and never uses the
// network.

(() => {
  const ALLOWED = new Set(['initResp', 'evalResp', 'selfTest']);

  // What autoconsent clicked (its clicks are made by script, so they aren't
  // "trusted"), for the activity log: the button's label, shortened.
  const clicked = [];
  document.addEventListener('click', (e) => {
    if (e.isTrusted) return;
    const el = e.composedPath()[0];
    const label = (el?.getAttribute?.('aria-label') || el?.innerText || el?.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (label) clicked.push(label);
    if (clicked.length > 5) clicked.shift();
  }, { capture: true, passive: true });

  const send = (message) => {
    if (message?.type === 'optOutResult' || message?.type === 'autoconsentDone') message = { ...message, clicked: [...clicked] };
    return chrome.runtime.sendMessage(message).catch(() => {});
  };
  const consent = new globalThis.StrictSwitchAutoConsent(send, null, null);

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !ALLOWED.has(message.type)) return;
    if (message.type === 'initResp') {
      message.config = {
        ...message.config,
        autoAction: 'optOut',
        heuristicMode: message.config?.heuristicMode === 'reject' ? 'reject' : 'off',
      };
    }
    consent.receiveMessageCallback(message);
  });
})();
