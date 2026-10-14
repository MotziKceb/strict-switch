// The logic behind levels, groups, reasons, the breakage ranking, the
// cookie banner reminder and reading consent records.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dynamicRuleKind, groupOf, reasonFor, siteCategoryOverrides, siteKey, siteLevel,
} from '../lib/core.js';
import { breakageLabel, breakageScore } from '../lib/breakage.js';
import { DAY, clampSnoozeDays, isDue, isExpired, normalize } from '../lib/guard.js';
import { classifyRecord, describeRecord, sanitizeRecord } from '../lib/consent-record.js';

test('siteKey normalises hostnames', () => {
  assert.equal(siteKey('WWW.Example.COM.'), 'example.com');
  assert.equal(siteKey('news.bbc.co.uk'), 'news.bbc.co.uk');
  assert.equal(siteKey('localhost'), null);
  assert.equal(siteKey('bad host'), null);
});

test('a site level covers subdomains, not lookalikes', () => {
  const levels = { 'example.com': 'balanced' };
  assert.deepEqual(siteLevel('www.example.com', levels), { site: 'example.com', level: 'balanced' });
  assert.deepEqual(siteLevel('a.b.example.com', levels), { site: 'example.com', level: 'balanced' });
  assert.equal(siteLevel('notexample.com', levels).level, 'strict');
  assert.equal(siteLevel('example.com.evil.test', levels).level, 'strict');
});

test('site category overrides cover subdomains', () => {
  const settings = { siteCategories: { 'news.test': { advertising: false } } };
  assert.deepEqual(siteCategoryOverrides('www.news.test', settings), { site: 'news.test', overrides: { advertising: false } });
  assert.deepEqual(siteCategoryOverrides('other.test', settings), { site: null, overrides: {} });
});

test('matches fall into blocked, allowed and category-off groups', () => {
  const categories = { advertising: true, content: false };
  assert.equal(groupOf({ allowed: false, kind: 'strict', category: 'advertising' }, categories), 'blocked');
  assert.equal(groupOf({ allowed: true, kind: 'same-company', category: 'advertising' }, categories), 'allowed');
  assert.equal(groupOf({ allowed: true, kind: 'same-company', category: 'content' }, categories), 'off');
  assert.equal(groupOf({ allowed: true, kind: 'site-category-off', category: 'advertising' }, categories), 'off');
  assert.equal(groupOf({ allowed: true, kind: 'basic' }, categories), 'allowed');
});

test('reasons are plain language', () => {
  const m = (kind, category = 'advertising') => ({ kind, category, company: 'Google' });
  assert.equal(reasonFor(m('strict')), 'Advertising tracker');
  assert.equal(reasonFor(m('own-site')), 'Advertising tracker on its owner\'s site (your setting)');
  assert.equal(reasonFor(m('block')), 'You blocked Google');
  assert.equal(reasonFor(m('same-company')), 'Google owns this site');
  assert.equal(reasonFor(m('same-company', 'content'), 'off'), 'Tracking content is switched off');
  assert.equal(reasonFor(m('site-category-off'), 'off'), 'Advertising is switched off for this site');
  assert.equal(reasonFor(m('lockdown', 'content')), 'Tracking content tracker (Lockdown)');
  assert.equal(reasonFor(m('site-allow', 'social')), 'You allowed Google Social on this site');
});

test('dynamic rule ids map back to their kind', () => {
  assert.equal(dynamicRuleKind(1), 'basic');
  assert.equal(dynamicRuleKind(100000 + 8 * 5 + 2), 'balanced');
  assert.equal(dynamicRuleKind(300000), 'block');
  assert.equal(dynamicRuleKind(500003), 'lockdown');
  assert.equal(dynamicRuleKind(800005), 'site-category-on');
  assert.equal(dynamicRuleKind(50), null);
});

test('breakage ranking puts content and owner-site blocks first', () => {
  const entities = { Google: { owned: ['google.com', 'youtube.com'] }, Criteo: { owned: ['criteo.com'] } };
  const score = (category, company, site) => breakageScore(category, company, site, entities);
  assert.equal(score('content', 'Google', 'news.test'), 3);
  assert.equal(score('social', 'Google', 'news.test'), 2);
  assert.equal(score('advertising', 'Criteo', 'news.test'), 0);
  assert.equal(score('advertising', 'Google', 'www.youtube.com'), 2);
  assert.equal(score('content', 'Google', 'youtube.com'), 5);
  assert.equal(breakageLabel(3), 'Likely breaks the page');
  assert.equal(breakageLabel(2), 'May break the page');
  assert.equal(breakageLabel(0), null);
});

test('the reminder and lease only ever come sooner when the store is tampered with', () => {
  const now = 1_000_000_000_000;
  assert.equal(normalize(undefined, now), null, 'nothing stored');
  const ok = normalize({ grantedAt: now - DAY, expiresAt: now + 30 * DAY, remindAt: now + 7 * DAY }, now);
  assert.deepEqual(ok, { grantedAt: now - DAY, expiresAt: now + 30 * DAY, remindAt: now + 7 * DAY });
  const far = normalize({ grantedAt: now, expiresAt: now + 91 * DAY, remindAt: now + 61 * DAY }, now);
  assert.equal(far.remindAt, now, 'more than 60 days away means remind now');
  assert.equal(far.expiresAt, now, 'more than 90 days away means access ends now');
  for (const junk of ['soon', null, NaN, Infinity, { remindAt: '2030-01-01' }]) {
    const n = normalize(typeof junk === 'object' && junk ? junk : { remindAt: junk, expiresAt: junk }, now);
    assert.equal(n.remindAt, now);
    assert.equal(n.expiresAt, now);
  }
  assert.equal(normalize('garbage', now).remindAt, now);
  assert.ok(isDue(far, now) && isExpired(far, now));
  assert.ok(!isDue(ok, now) && !isExpired(ok, now));
});

test('snoozing is clamped to 1 to 60 days', () => {
  assert.equal(clampSnoozeDays(0), 1);
  assert.equal(clampSnoozeDays(7), 7);
  assert.equal(clampSnoozeDays('30'), 30);
  assert.equal(clampSnoozeDays(365), 60);
  assert.equal(clampSnoozeDays('never'), 7);
});

test('the consent record is read as confirmed, contradicted or not verifiable', () => {
  const tcf = (over) => ({ available: true, answered: true, gdprApplies: true, cmpId: 7, eventStatus: 'useractioncomplete', hasString: true, string: 'CP', purposeConsents: [], purposeInterests: [], vendorConsents: 0, vendorInterests: 0, ...over });
  const denied = { ad_storage: 'denied', analytics_storage: 'denied' };
  assert.equal(classifyRecord({ tcf: tcf(), gcm: null }), 'confirmed');
  assert.equal(classifyRecord({ tcf: tcf({ purposeConsents: [1] }), gcm: null }), 'contradicted');
  assert.equal(classifyRecord({ tcf: tcf({ eventStatus: 'cmpuishown', hasString: false }), gcm: null }), 'no-choice', 'banner still open');
  assert.equal(classifyRecord({ tcf: null, gcm: { updated: true, state: denied } }), 'confirmed');
  assert.equal(classifyRecord({ tcf: null, gcm: { updated: false, state: denied } }), 'no-choice', 'the default alone shows no choice');
  assert.equal(classifyRecord({ tcf: tcf(), gcm: { updated: true, state: { ...denied, ad_storage: 'granted' } } }), 'contradicted');
  assert.equal(classifyRecord({ tcf: null, gcm: null }), 'no-record');
  assert.equal(describeRecord({ tcf: null, gcm: null }), 'No consent record Strict Switch can read (IAB TCF or Google Consent Mode).');
});

test('whatever the page returns, only the expected shapes are kept', () => {
  const r = sanitizeRecord({
    tcf: { available: true, answered: true, purposeConsents: [1, 'x', 500, 2], vendorConsents: -3, eventStatus: { evil: 1 }, string: 'a'.repeat(5000) },
    gcm: { updated: 'yes', state: { ad_storage: 'granted', analytics_storage: '<img>', other: 'granted' } },
  });
  assert.deepEqual(r.tcf.purposeConsents, [1, 2]);
  assert.equal(r.tcf.vendorConsents, 0);
  assert.equal(r.tcf.eventStatus, null);
  assert.equal(r.tcf.string.length, 2000);
  assert.deepEqual(r.gcm, { updated: false, state: { ad_storage: 'granted' } });
  assert.deepEqual(sanitizeRecord('nonsense'), { tcf: null, gcm: null });
});
