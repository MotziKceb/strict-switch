// Copies DuckDuckGo's autoconsent library (MPL-2.0) from node_modules into
// vendor/autoconsent, at the exact version pinned in package.json. The
// extension never fetches it: it ships inside each release.
//
//   npm install
//   node tools/build-autoconsent.mjs
//
// Writes:
// - autoconsent.esm.js: the library, unchanged, for the background worker.
// - autoconsent.js: the same code wrapped as a classic script for the content
//   script (content scripts can't be modules). Only the wrapper is added.
// - compact-rules.json: the rules, unchanged.
// - opt-in-snippets.json: the library's main-world snippets that are only
//   used to accept. The background worker refuses to run these.
// - LICENSE and VERSION.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules/@duckduckgo/autoconsent');
const out = path.join(root, 'vendor/autoconsent');

const read = (file) => readFileSync(path.join(source, file), 'utf8');

export function buildVendorFiles() {
  const pinned = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies['@duckduckgo/autoconsent'];
  const { version } = JSON.parse(read('package.json'));
  if (version !== pinned) throw new Error(`node_modules has autoconsent ${version}, package.json pins ${pinned}. Run npm install.`);

  const esm = read('dist/autoconsent.esm.js');
  const rules = read('rules/compact-rules.json');
  const full = JSON.parse(read('rules/rules.json')).autoconsent;
  return {
    'autoconsent.esm.js': esm,
    'autoconsent.js': classicScript(esm, version),
    'compact-rules.json': rules,
    'opt-in-snippets.json': JSON.stringify(optInOnlySnippets(esm, full), null, 2) + '\n',
    LICENSE: read('LICENSE'),
    VERSION: version + '\n',
  };
}

// Wraps the ES module as a classic script that exposes the AutoConsent class
// as StrictSwitchAutoConsent in the content script's own (isolated) world,
// where page scripts can't see it.
function classicScript(esm, version) {
  const exportBlock = /\nexport \{[^}]*\};\s*$/;
  if (!exportBlock.test(esm)) throw new Error('Unexpected autoconsent.esm.js layout: no final export block');
  const match = esm.match(/AutoConsent as default/);
  if (!match) throw new Error('Unexpected autoconsent.esm.js layout: no default export');
  return [
    `// @duckduckgo/autoconsent ${version}, https://github.com/duckduckgo/autoconsent`,
    '// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.',
    '// If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.',
    '// autoconsent.esm.js wrapped as a classic script by tools/build-autoconsent.mjs. The code inside is unchanged.',
    '(() => {',
    esm.replace(exportBlock, '\n'),
    'globalThis.StrictSwitchAutoConsent = AutoConsent;',
    '})();',
    '',
  ].join('\n');
}

// Snippet names referenced only by opt-in steps, in the JSON rules and in the
// code-based rules' optIn() methods.
function optInOnlySnippets(esm, fullRules) {
  const names = (text) => new Set(text.match(/EVAL_[A-Z0-9_]+/g) ?? []);
  const optInJson = fullRules.map((r) => JSON.stringify(r.optIn ?? [])).join('\n');
  const otherJson = fullRules.map((r) => JSON.stringify({ ...r, optIn: undefined })).join('\n');

  // Code-based rules: class methods are indented two spaces.
  const optInBodies = [];
  const rest = esm
    .replace(/\nvar snippets = \{[\s\S]*?\n\};\n/, '\n')
    .replace(/\n {2}(?:async )?optIn\(\) \{[\s\S]*?\n {2}\}\n/g, (body) => {
      optInBodies.push(body);
      return '\n';
    });
  const optIn = new Set([...names(optInJson), ...names(optInBodies.join('\n'))]);
  const elsewhere = new Set([...names(otherJson), ...names(rest)]);
  return [...optIn].filter((n) => !elsewhere.has(n)).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(out, { recursive: true });
  const files = buildVendorFiles();
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(out, name), content);
  console.log(`vendor/autoconsent: autoconsent ${files.VERSION.trim()}, ${JSON.parse(files['opt-in-snippets.json']).length} opt-in snippets refused`);
}
