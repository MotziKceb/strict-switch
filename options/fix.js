// "Page seems broken?": a guided fix for one site. Tries one change at a
// time, most likely first: allowing the blocked trackers most likely to
// break the page, then turning off cookie banner auto-reject, then Balanced,
// then Basic. After each, the user says whether the page works; anything
// that didn't help is put back. Every change goes through the usual
// settings functions, so it's in the activity log.

import { CATEGORY_HINTS, breakageList, categoryLabel, pageGroups } from '../lib/breakage.js';
import { browser } from '../lib/browser.js';
import { bannerSiteOff, bannersActive, getBannerSettings, setBannerSite } from '../lib/banners.js';
import { getSettings, setSiteAllow, setSiteLevel, siteLevel } from '../lib/core.js';
import { ALLOW_MEANS, CATEGORY_DETAILS } from '../lib/explain.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const site = params.get('site');
const tabId = params.has('tab') ? Number(params.get('tab')) : null;
// Trackers to try one by one before the bigger steps.
const MAX_TRACKER_STEPS = 5;

async function buildSteps() {
  const settings = await getSettings();
  const steps = [];
  const level = siteLevel(site, settings.siteLevels);
  // A level set on a parent domain is changed there, not here.
  const ownLevel = !level.site || level.site === site;

  if (level.level === 'lockdown' && ownLevel) {
    steps.push({
      title: 'Go back from Lockdown to Strict',
      what: 'Lockdown blocks every known tracker on this site, including videos, fonts and logins that pages often need.',
      tradeoff: 'Strict still blocks trackers in the categories you\'ve switched on.',
      apply: () => setSiteLevel(site, 'strict'),
      undo: () => setSiteLevel(site, 'lockdown'),
      fixed: 'This site is back on Strict.',
    });
  }

  if (tabId !== null && level.level !== 'basic') {
    const suspects = breakageList(await pageGroups(tabId, site, settings)).filter((g) => !g.siteAllowed).slice(0, MAX_TRACKER_STEPS);
    for (const { company, category } of suspects) {
      steps.push({
        title: `Allow ${company} (${categoryLabel(category)}) on this site`,
        what: `Blocked here: ${CATEGORY_HINTS[category]} from ${company}.`,
        tradeoff: ALLOW_MEANS[category]?.(company) ?? '',
        moreTitle: `More about ${categoryLabel(category)}`,
        moreText: CATEGORY_DETAILS[category],
        apply: () => setSiteAllow(site, company, category, true),
        undo: () => setSiteAllow(site, company, category, false),
        fixed: `${company} (${categoryLabel(category)}) is now allowed on ${site}, and only there. Everything else stays blocked.`,
      });
    }
  }

  const banners = await getBannerSettings();
  if (await bannersActive() && banners.handler === 'self' && !bannerSiteOff(site, banners.sitesOff)) {
    steps.push({
      title: 'Turn off cookie banner auto-reject here',
      what: 'Strict Switch clicks "reject" on this site\'s cookie banner. Now and then a site misbehaves after that.',
      tradeoff: 'You\'ll see the site\'s cookie banner again and answer it yourself. Strict Switch still checks the consent record.',
      apply: () => setBannerSite(site, false),
      undo: () => setBannerSite(site, true),
      fixed: `Auto-reject is off for ${site}. You'll answer its cookie banner yourself.`,
    });
  }

  if (ownLevel && ['strict', 'lockdown'].includes(level.level)) {
    steps.push({
      title: 'Set this site to Balanced',
      what: 'Balanced lets through logins, comments, videos and similar from companies you visit regularly. Ads and the rest stay blocked.',
      tradeoff: 'Those companies can see that you visit this site.',
      apply: () => setSiteLevel(site, 'balanced'),
      undo: () => setSiteLevel(site, level.level),
      fixed: `${site} is now on Balanced.`,
    });
  }
  if (ownLevel && level.level !== 'basic') {
    steps.push({
      title: 'Set this site to Basic',
      what: `Basic turns off Strict Switch's blocking for this site${browser.basicLeaves}. If the page works now, something Strict Switch blocks is needed. If not, Strict Switch isn't the cause.`,
      tradeoff: 'Every tracker on this site can load and see your visit.',
      apply: () => setSiteLevel(site, 'basic'),
      undo: () => setSiteLevel(site, level.level),
      fixed: `${site} is on Basic: Strict Switch blocks nothing there. If you'd like some blocking back, try Balanced or allow single trackers in Site settings.`,
      last: true,
    });
  }
  return steps;
}

let steps = [];
let index = 0;

function show(id) {
  for (const s of ['step', 'fixed', 'not-us']) $(s).hidden = s !== id;
}

function renderStep() {
  const step = steps[index];
  if (!step) {
    // Only Basic (all blocking off) shows Strict Switch isn't the cause.
    $('not-us-text').textContent = steps.at(-1)?.last
      ? 'The page didn\'t work even with all of Strict Switch\'s blocking off for this site, so everything has been put back. The problem may be the site itself, another extension, or your browser\'s own protection.'
      : 'None of these helped, so everything has been put back. The problem may be the site itself, another extension, or your browser\'s own protection.';
    show('not-us');
    return;
  }
  show('step');
  $('step-count').textContent = `Step ${index + 1} of ${steps.length}`;
  $('step-title').textContent = step.title;
  $('step-what').textContent = step.what;
  $('step-tradeoff').textContent = step.tradeoff ? `If it helps: ${step.tradeoff}` : '';
  $('step-tradeoff').hidden = !step.tradeoff;
  $('step-more').hidden = !step.moreText;
  $('step-more').open = false;
  if (step.moreText) {
    $('step-more-title').textContent = step.moreTitle;
    $('step-more-text').textContent = step.moreText;
  }
  $('try-actions').hidden = false;
  $('ask-actions').hidden = true;
  $('tab-gone').hidden = true;
}

// Rules only affect new requests, so reload the page to show the change.
async function reloadPage() {
  if (tabId === null) return false;
  try {
    await chrome.tabs.reload(tabId);
    return true;
  } catch {
    return false;
  }
}

$('apply').addEventListener('click', async () => {
  $('apply').disabled = true;
  await steps[index].apply();
  const reloaded = await reloadPage();
  $('apply').disabled = false;
  $('tab-gone').hidden = reloaded || tabId === null;
  $('try-actions').hidden = true;
  $('ask-actions').hidden = false;
});

$('skip').addEventListener('click', () => {
  index++;
  renderStep();
});

$('yes').addEventListener('click', () => {
  $('fixed-text').textContent = steps[index].fixed;
  show('fixed');
});

$('no').addEventListener('click', async () => {
  $('no').disabled = true;
  await steps[index].undo();
  $('no').disabled = false;
  index++;
  if (!steps[index]) await reloadPage();
  renderStep();
});

$('undo').addEventListener('click', async () => {
  await steps[index].undo();
  await reloadPage();
  index++;
  renderStep();
});

$('report').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL(`options/log.html?q=${encodeURIComponent(site)}`) });
});

if (!site) {
  document.querySelector('main').textContent = 'No site given. Open this page from the Strict Switch popup.';
} else {
  document.title = `Strict Switch: ${site} seems broken?`;
  $('title').textContent = `Is ${site} not working right?`;
  const siteUrl = `site.html?site=${encodeURIComponent(site)}${tabId !== null ? `&tab=${tabId}` : ''}`;
  $('site-link').href = siteUrl;
  $('fixed-site-link').href = siteUrl;
  steps = await buildSteps();
  if (tabId === null) $('intro').append(' Open this from the popup on the broken page to also try single trackers.');
  renderStep();
}
