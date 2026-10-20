// The Cookie banners page: switching the feature on and off, the permission
// lease and reminder, who handles banners, and the sites it's off for. This
// is the only place the lease and the reminder can change, and only by a
// click (see lib/guard.js).

import {
  ACCESS, HANDLERS, getBannerSettings, hasAccess, revokeAccess, setBannerHandler, setBannerSite, showReminderBadge, syncContentScripts,
} from '../lib/banners.js';
import {
  REMIND_DAYS, SNOOZE_CHOICES, clearGuard, isDue, isExpired, keep, readGuard, snooze, startLease,
} from '../lib/guard.js';
import { REPO_URL } from '../lib/project.js';
import { initIncognito } from '../lib/incognito.js';

const $ = (id) => document.getElementById(id);

// In a private window nothing here may change a setting (see lib/incognito.js).
await initIncognito();
const dateText = (t) => new Date(t).toLocaleDateString(undefined, { dateStyle: 'long' });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

for (const d of SNOOZE_CHOICES) {
  $('snooze-days').append(new Option(plural(d, 'day'), d, false, d === REMIND_DAYS));
}

function flash(text) {
  $('saved').textContent = text;
  $('saved').hidden = false;
}

async function render() {
  const now = Date.now();
  const [access, guard, settings] = await Promise.all([hasAccess(), readGuard(now), getBannerSettings()]);
  const on = access && !isExpired(guard, now);
  const due = on && isDue(guard, now);
  $('access-off').hidden = on;
  $('access-on').hidden = !on;
  $('access').classList.toggle('due', due);
  if (on) {
    const what = settings.handler === 'self' ? 'auto-reject' : 'cookie banner checks';
    $('access-title').textContent = due ? 'Strict Switch can still read every site you visit.' : 'On: Strict Switch can read every site you visit';
    $('access-text').textContent = `You allowed this on ${dateText(guard.grantedAt ?? now)} so ${what} could work. It runs only on your computer, and nothing is sent anywhere unless you send a report yourself.`;
    $('access-dates').textContent = `Access ends on ${dateText(guard.expiresAt)} unless you click Keep. ${due ? 'This reminder stays until you answer it.' : `Next reminder: ${dateText(guard.remindAt)}.`}`;
  }

  $('handlers').replaceChildren(...Object.entries(HANDLERS).map(([id, { label, description }]) => {
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'handler', value: id, checked: settings.handler === id });
    input.addEventListener('change', async () => {
      await setBannerHandler(id);
      await syncContentScripts();
      render();
    });
    const text = document.createElement('span');
    text.append(
      Object.assign(document.createElement('strong'), { textContent: label }),
      Object.assign(document.createElement('span'), { className: 'muted', textContent: description }),
    );
    const labelEl = Object.assign(document.createElement('label'), { className: 'switch' });
    labelEl.append(input, text);
    const li = document.createElement('li');
    li.append(labelEl);
    return li;
  }));

  $('sites-off').replaceChildren(...settings.sitesOff.map((site) => {
    const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'remove', textContent: 'Switch back on' });
    remove.addEventListener('click', async () => {
      await setBannerSite(site, true);
      render();
    });
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { textContent: site }), remove);
    return li;
  }));
  $('sites-off-empty').hidden = settings.sitesOff.length > 0;
}

$('turn-on').addEventListener('click', async (e) => {
  $('turn-on-error').hidden = true;
  // Ask straight away, while the click still counts, and record the lease
  // as the browser asks, so the background worker finds it when access
  // arrives.
  const granted = chrome.permissions.request(ACCESS).catch(() => false);
  const lease = startLease(e);
  const ok = await granted;
  await lease;
  if (!ok) {
    await clearGuard();
    $('turn-on-error').textContent = 'Not switched on: your browser didn\'t give the permission.';
    $('turn-on-error').hidden = false;
    return;
  }
  await syncContentScripts();
  await showReminderBadge(false);
  render();
});

$('keep').addEventListener('click', async (e) => {
  const guard = await keep(e);
  await showReminderBadge(false);
  await render();
  flash(`Kept. Access now ends on ${dateText(guard.expiresAt)}, next reminder on ${dateText(guard.remindAt)}.`);
});

$('snooze').addEventListener('click', async (e) => {
  const guard = await snooze(e, $('snooze-days').value);
  await showReminderBadge(false);
  await render();
  flash(`You'll be reminded on ${dateText(guard.remindAt)}.`);
});

$('turn-off').addEventListener('click', async () => {
  await revokeAccess();
  await showReminderBadge(false);
  $('saved').hidden = true;
  render();
});

$('releases').href = `${REPO_URL}/releases`;
$('releases').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: `${REPO_URL}/releases` });
});

// How this copy was installed, from the browser's own record.
async function renderInstall() {
  let info = {};
  try {
    info = await chrome.management.getSelf();
  } catch {}
  const update = info.updateUrl ?? '';
  const how = {
    development: 'This copy was loaded from a folder in Developer mode. That\'s how GitHub releases are installed; make sure yours came from the GitHub page below.',
    sideload: 'This copy was installed by another program on your computer, not from a store or a GitHub release. That\'s a red flag.',
    admin: 'This copy was installed by your organisation\'s policy.',
  }[info.installType];
  $('install').textContent = how
    ?? (info.installType === 'normal'
      ? (update.includes('google.com') ? 'This copy was installed from the Chrome Web Store.'
        : update.includes('microsoft.com') ? 'This copy was installed from Microsoft Edge Add-ons.'
          : 'This copy was installed from an extension store.')
      : 'Your browser didn\'t say how this copy was installed.');
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some((k) => k.startsWith('banner'))) render();
});
chrome.permissions.onAdded.addListener(render);
chrome.permissions.onRemoved.addListener(render);

render();
renderInstall();
