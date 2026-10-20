// The bundled copy of DuckDuckGo's autoconsent: the pinned version, its
// license, unchanged, and set up to only ever reject.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EXT } from './helpers.js';
import { buildVendorFiles } from '../tools/build-autoconsent.mjs';

const vendor = (file) => readFileSync(path.join(EXT, 'vendor/autoconsent', file), 'utf8');
const pinned = JSON.parse(readFileSync(path.join(EXT, 'package.json'), 'utf8')).devDependencies['@duckduckgo/autoconsent'];

test('autoconsent is pinned to an exact version and bundled at that version', () => {
  assert.match(pinned, /^\d+\.\d+\.\d+$/, 'an exact version, not a range');
  assert.equal(vendor('VERSION').trim(), pinned);
  assert.match(vendor('autoconsent.js'), new RegExp(`^// @duckduckgo/autoconsent ${pinned.replace(/\./g, '\\.')},`));
});

test('autoconsent keeps its MPL-2.0 license notice', () => {
  assert.match(vendor('LICENSE'), /Mozilla Public License Version 2\.0/);
  assert.match(vendor('autoconsent.js'), /Mozilla Public License, v\. 2\.0/);
});

test('the bundled files match the pinned package exactly', { skip: !existsSync(path.join(EXT, 'node_modules/@duckduckgo/autoconsent')) && 'npm install first' }, () => {
  for (const [name, content] of Object.entries(buildVendorFiles())) {
    assert.equal(vendor(name), content, `vendor/autoconsent/${name} is out of date: run node tools/build-autoconsent.mjs`);
  }
});

test('opt-in snippets are refused', () => {
  const refused = JSON.parse(vendor('opt-in-snippets.json'));
  // Known accept-only snippets.
  for (const name of ['EVAL_CONSENTMANAGER_4', 'EVAL_CONSENTMANAGER_NCMP_ACCEPT', 'EVAL_USERCENTRICS_API_3']) assert.ok(refused.includes(name), name);
  // Snippets used to detect banners and reject stay allowed.
  for (const name of ['EVAL_COOKIEBOT_3', 'EVAL_CONSENTMANAGER_2', 'EVAL_USERCENTRICS_API_1']) assert.ok(!refused.includes(name), name);
});

test('Strict Switch never asks autoconsent to accept', () => {
  const background = readFileSync(path.join(EXT, 'lib/autoreject.js'), 'utf8');
  const content = readFileSync(path.join(EXT, 'content/autoreject.js'), 'utf8');
  assert.doesNotMatch(background, /optIn/, 'the background worker never sends optIn');
  assert.match(background, /autoAction: 'optOut'/);
  assert.match(background, /heuristicMode: 'reject'/);
  assert.match(content, /autoAction: 'optOut'/, 'the content script forces opt-out too');
  assert.doesNotMatch(content, /'optIn'/, 'and drops optIn messages');
});
