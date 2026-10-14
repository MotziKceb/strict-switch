// The logic behind levels, groups, reasons and the breakage ranking.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dynamicRuleKind, groupOf, reasonFor, siteCategoryOverrides, siteKey, siteLevel,
} from '../lib/core.js';
import { breakageLabel, breakageScore } from '../lib/breakage.js';

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
