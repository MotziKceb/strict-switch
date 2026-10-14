// Shared helpers for the browser tests: a local web server that plays every
// site (the browser resolves all hostnames to it), and Chromium with the
// extension loaded from this repository.

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Polls fn until it returns something truthy. Errors count as "not yet"
// (a just-started service worker can briefly lack its chrome.* APIs).
export async function waitFor(fn, { timeout = 10000, interval = 100, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let lastError;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      lastError = e;
    }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${message}${lastError ? `: ${lastError.message}` : ''}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

// page(host) returns the HTML for a site's front page. Every other request
// gets an empty response, and each request's host is recorded in hits.
export async function startServer(page) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const host = req.headers.host.split(':')[0];
    hits.push(host);
    res.setHeader('content-type', 'text/html');
    res.setHeader('cache-control', 'no-store');
    res.end(req.url === '/' ? page(host, server.address().port) : '');
  });
  await new Promise((r) => server.listen(0, r));
  return { server, hits, port: server.address().port };
}

// <img> tags requesting each host, with a cache-busting query.
export const requests = (hosts, port) =>
  hosts.map((h) => `<img src="http://${h}:${port}/t.gif?${Math.random()}">`).join('');

// A copy of the extension as the release packages it, with the optional
// cookie banner permissions already granted (as if the user had allowed
// them: headless Chromium can't click the browser's permission prompt).
export function grantedCopy() {
  const release = readFileSync(path.join(EXT, '.github/workflows/release.yml'), 'utf8');
  const files = release.match(/zip -r "[^"]+" (.+)/)[1].split(/\s+/);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'strict-switch-'));
  for (const f of files) cpSync(path.join(EXT, f), path.join(dir, f), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  manifest.permissions.push(...manifest.optional_permissions);
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_permissions;
  delete manifest.optional_host_permissions;
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

export async function launch(site, { dir = EXT } = {}) {
  const ctx = await chromium.launchPersistentContext('', {
    // The full Chromium build is needed for extensions; headless_shell can't load them.
    channel: 'chromium',
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${dir}`,
      `--load-extension=${dir}`,
      '--host-resolver-rules=MAP * 127.0.0.1',
      '--no-proxy-server',
    ],
  });
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  ctx.on('page', watch);
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const ext = (file) => `chrome-extension://${id}/${file}`;

  // The settings page opens on install; wait until the rulesets are set up.
  await waitFor(async () => (await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).includes('observe'), {
    message: 'extension setup',
  });
  // Use the settings tab the extension opens on install, once it's loaded.
  const helper = await waitFor(() => ctx.pages().find((p) => p.url() === ext('options/options.html')), {
    message: 'the settings page to open on install',
  });
  await helper.waitForLoadState('load');
  watch(helper);

  // Calls an exported function from one of the extension's modules.
  const call = (module, fn, ...args) => helper.evaluate(
    async ([module, fn, args]) => (await import(chrome.runtime.getURL(module)))[fn](...args),
    [module, fn, args],
  );
  const core = (fn, ...args) => call('lib/core.js', fn, ...args);

  const env = {
    ctx, sw, id, ext, helper, errors, core, call,
    // Loads a site's front page; returns the other hosts that were reached
    // (the ones not blocked).
    async visit(host) {
      site.hits.length = 0;
      const page = await ctx.newPage();
      await page.goto(`http://${host}:${site.port}/`);
      await page.waitForLoadState('networkidle');
      await page.close();
      return [...new Set(site.hits)].filter((h) => h !== host).sort();
    },
    // Opens a site in a tab that stays open; returns the page and its tab id.
    async openTab(host) {
      const before = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.id));
      const page = await ctx.newPage();
      await page.goto(`http://${host}:${site.port}/`);
      await page.waitForLoadState('networkidle');
      const tabId = await sw.evaluate(async (before) => (await chrome.tabs.query({})).map((t) => t.id).find((i) => !before.includes(i)), before);
      return { page, tabId };
    },
    // Opens the popup as if clicked while the given tab is active.
    async popup(tabId, host) {
      const page = await ctx.newPage();
      await page.addInitScript(([id, url]) => {
        chrome.tabs.query = async () => [{ id, url }];
        window.close = () => {};
      }, [tabId, `http://${host}:${site.port}/`]);
      await page.goto(ext('popup/popup.html'));
      return page;
    },
    // Resets all settings and recorded activity.
    async reset() {
      await sw.evaluate(async () => {
        await chrome.storage.sync.clear();
        await chrome.storage.local.remove(['seen']);
        await chrome.storage.session.clear();
      });
      await core('applyRules', await core('getSettings'));
    },
    async log() {
      return call('lib/activity.js', 'getLog');
    },
    async close() {
      await ctx.close();
    },
  };
  return env;
}
