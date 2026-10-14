// Real blocking in Chromium, at every level and with every override.

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, requests, startServer, waitFor } from './helpers.js';

const AD = 'googleads.g.doubleclick.net'; // Google, Advertising
const FONTS = 'fonts.googleapis.com'; // Google, Tracking content (off by default)
const CRITEO = 'static.criteo.net'; // Criteo, Advertising
const META = 'connect.facebook.net'; // Meta, Social
const NEUTRAL = 'cdn.neutral.test'; // not a tracker
const VIDEO = 'rr1.googlevideo.com'; // Google, Tracking content

let site;
let env;

before(async () => {
  site = await startServer((host, port) => (host.endsWith('youtube.com')
    ? requests([AD, VIDEO], port)
    : requests([AD, FONTS, CRITEO, META, NEUTRAL], port)));
  env = await launch(site);
});
after(async () => {
  assert.deepEqual(env.errors, [], 'no page errors');
  await env.close();
  site.server.close();
});
beforeEach(() => env.reset());

test('Strict blocks trackers but not content or other requests', async () => {
  assert.deepEqual(await env.visit('news.test'), [NEUTRAL, FONTS].sort());
});

test('Basic lets everything through', async () => {
  await env.core('setSiteLevel', 'news.test', 'basic');
  assert.deepEqual(await env.visit('www.news.test'), [AD, CRITEO, NEUTRAL, FONTS, META].sort());
  assert.deepEqual(await env.visit('other.test'), [NEUTRAL, FONTS].sort(), 'other sites unaffected');
});

test('trackers are blocked on their owner\'s own site by default, and the switch turns that off', async () => {
  assert.deepEqual(await env.visit('www.youtube.com'), [VIDEO]);
  await env.core('setBlockOwnSites', false);
  assert.deepEqual(await env.visit('www.youtube.com'), [AD, VIDEO].sort());
});

test('company Allow and Block', async () => {
  await env.core('setCompanyRule', 'Criteo', 'allow');
  assert.ok((await env.visit('news.test')).includes(CRITEO));
  await env.core('setBlockOwnSites', false);
  await env.core('setCompanyRule', 'Google', 'block');
  assert.ok(!(await env.visit('www.youtube.com')).includes(AD), 'Block applies on the company\'s own sites too');
});

test('Lockdown blocks every tracker, overriding Allow', async () => {
  await env.core('setCompanyRule', 'Criteo', 'allow');
  await env.core('setSiteLevel', 'news.test', 'lockdown');
  assert.deepEqual(await env.visit('news.test'), [NEUTRAL]);
});

test('a per-site exception allows one company and category, even in Lockdown', async () => {
  await env.core('setSiteLevel', 'news.test', 'lockdown');
  await env.core('setSiteAllow', 'news.test', 'Meta', 'social', true);
  assert.deepEqual(await env.visit('news.test'), [NEUTRAL, META].sort());
});

test('per-site categories apply to that site only, and beat company rules', async () => {
  await env.core('setCompanyRule', 'Google', 'block');
  await env.core('setSiteCategory', 'news.test', 'advertising', false);
  await env.core('setSiteCategory', 'news.test', 'content', true);
  assert.deepEqual(await env.visit('news.test'), [AD, CRITEO, NEUTRAL].sort());
  assert.deepEqual(await env.visit('other.test'), [NEUTRAL, FONTS].sort());
});

test('Balanced opens Social from companies you visit, and keeps ads blocked', async () => {
  for (let i = 0; i < 3; i++) await env.visit('www.facebook.com');
  await waitFor(async () => (await env.sw.evaluate(() => chrome.storage.local.get('engaged'))).engaged?.includes('Meta'), {
    message: 'Meta to count as visited regularly',
  });
  await env.core('setSiteLevel', 'news.test', 'balanced');
  assert.deepEqual(await env.visit('news.test'), [NEUTRAL, FONTS, META].sort());
});

test('pausing turns all blocking off', async () => {
  await env.core('setEnabled', false);
  assert.deepEqual(await env.visit('news.test'), [AD, CRITEO, NEUTRAL, FONTS, META].sort());
});
