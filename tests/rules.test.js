// Checks the generated tracker lists and the manifest, without a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { EXT } from './helpers.js';
import { CATEGORIES } from '../lib/core.js';

const read = (file) => JSON.parse(readFileSync(path.join(EXT, file), 'utf8'));
const manifest = read('manifest.json');
const DOMAIN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

test('the extension asks for exactly these permissions and no site access', () => {
  // Changing these lists is a decision to make deliberately, not by accident.
  assert.deepEqual([...manifest.permissions].sort(), [
    'activeTab', 'alarms', 'declarativeNetRequest', 'declarativeNetRequestFeedback', 'history', 'storage',
  ]);
  assert.equal(manifest.host_permissions, undefined, 'no site access at install');
  assert.equal(manifest.content_scripts, undefined, 'static content scripts would grant site access at install');
  // Cookie banners: asked for only when the user switches the feature on,
  // and handed back when it's switched off or the lease ends.
  assert.deepEqual([...manifest.optional_permissions].sort(), ['notifications', 'scripting']);
  assert.deepEqual([...manifest.optional_host_permissions].sort(), ['http://*/*', 'https://*/*']);
  assert.equal(manifest.externally_connectable, undefined, 'no messaging channel for other extensions or sites');
  // A private window runs its own copy, with settings in memory only.
  assert.equal(manifest.incognito, 'split');
  assert.equal(manifest.web_accessible_resources, undefined, 'web pages can\'t load the extension\'s files');
});

test('what the cookie banner feature asks for matches the manifest', async () => {
  const banners = readFileSync(path.join(EXT, 'lib/banners.js'), 'utf8');
  assert.match(banners, /ORIGINS = \['http:\/\/\*\/\*', 'https:\/\/\*\/\*'\]/);
  assert.match(banners, /OPTIONAL_PERMISSIONS = \['notifications', 'scripting'\]/);
});

// Content scripts run in web pages, where the manifest's network lock doesn't
// apply, so they must not use the network themselves. Neither may the code
// run in pages' main world.
test('code that runs in web pages has no way to reach the network', () => {
  const files = [
    ...readdirSync(path.join(EXT, 'content')).map((f) => `content/${f}`),
    'vendor/autoconsent/autoconsent.js',
    'lib/consent-record.js',
  ];
  const network = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|RTCPeerConnection|new\s+Image\b|\.src\s*=|window\.open\s*\(|location\.(href|assign|replace)\s*=|\bimport\s*\(/;
  for (const file of files) {
    const code = readFileSync(path.join(EXT, file), 'utf8');
    assert.doesNotMatch(code, network, `${file} uses a network API`);
  }
});

test('the release package includes everything the extension loads', () => {
  const release = readFileSync(path.join(EXT, '.github/workflows/release.yml'), 'utf8');
  const zip = release.match(/zip -r "[^"]+" (.+)/)[1].split(/\s+/);
  for (const needed of ['manifest.json', 'background.js', 'lib', 'popup', 'options', 'ui', 'rules', 'icons', 'content', 'vendor', 'LICENSE']) {
    assert.ok(zip.includes(needed), `${needed} is packaged`);
  }
});

test('the extension cannot reach the network', () => {
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /default-src 'self'/);
});

test('every category has a ruleset, plus the observe ruleset', () => {
  const ids = manifest.declarative_net_request.rule_resources.map((r) => r.id).sort();
  assert.deepEqual(ids, [...CATEGORIES.map((c) => c.id), 'observe'].sort());
  for (const { path: file } of manifest.declarative_net_request.rule_resources) assert.ok(existsSync(path.join(EXT, file)), file);
});

test('rulesets are well formed and every rule maps back to a company', () => {
  const index = read('rules/rule-index.json');
  for (const { id, path: file } of manifest.declarative_net_request.rule_resources) {
    const rules = read(file);
    assert.ok(rules.length > 0, `${id} has rules`);
    assert.equal(index[id].length, rules.length, `${id} rule index matches`);
    rules.forEach((rule, i) => {
      assert.equal(rule.id, i + 1, `${id} rule ids are sequential`);
      assert.ok(rule.condition.requestDomains.length > 0);
      for (const domain of rule.condition.requestDomains) assert.match(domain, DOMAIN);
      assert.equal(rule.condition.domainType, 'thirdParty', 'only third-party requests');
      if (id === 'observe') {
        assert.equal(rule.action.type, 'allow');
        assert.ok(rule.priority < 3, 'observe rules lose to block rules');
      } else {
        assert.equal(rule.action.type, 'block');
        assert.ok(rule.priority >= 3, 'block rules beat observe rules');
        assert.ok(rule.condition.excludedInitiatorDomains?.length, 'companies are not blocked on their own sites by the static rules');
      }
    });
  }
});

test('company data covers every company in the rule index', () => {
  const entities = read('rules/entities.json');
  const index = read('rules/rule-index.json');
  const categories = new Set(CATEGORIES.map((c) => c.id));
  for (const [category, names] of Object.entries(index)) {
    for (const entry of names) {
      const name = category === 'observe' ? entry[0] : entry;
      assert.ok(entities[name], `${name} is in entities.json`);
    }
  }
  for (const [name, { owned, trackers }] of Object.entries(entities)) {
    assert.ok(owned.length > 0, `${name} owns domains`);
    for (const category of Object.keys(trackers)) assert.ok(categories.has(category), `${name}: ${category}`);
  }
});
