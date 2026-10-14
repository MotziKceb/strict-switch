// Notices when a cookie banner choice may have been made, so the background
// worker can read the site's consent record and check whether it registered.
// Registered only while the user has switched cookie banner checks on.
//
// It only tells the background worker "check now", after the page loads and
// after clicks (yours, or another extension's). The background worker reads
// the record itself. Never uses the network.

(() => {
  const CHECK_DELAY_MS = 1500;
  let timer = null;
  let trusted = false;

  const send = (message) => chrome.runtime.sendMessage(message).catch(() => {});

  // The record as the page loaded, to compare against later.
  setTimeout(() => send({ type: 'consentBaseline' }), CHECK_DELAY_MS);

  // A click by you is "trusted"; a click made by a script (another
  // extension, say) isn't. Checked shortly after the clicks stop.
  document.addEventListener('click', (e) => {
    trusted ||= e.isTrusted;
    clearTimeout(timer);
    timer = setTimeout(() => {
      send({ type: 'consentCheck', trusted });
      trusted = false;
    }, CHECK_DELAY_MS);
  }, { capture: true, passive: true });
})();
