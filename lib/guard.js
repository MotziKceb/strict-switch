// The permission lease and the reminder snooze for reading pages (cookie
// banners). Kept in the extension's own IndexedDB, not chrome.storage:
// content scripts can read and write chrome.storage, but they run in the
// pages' origins and can't reach the extension's IndexedDB. Only extension
// pages and the background worker can.
//
// Both values are absolute dates the extension computes itself. Anything
// unreadable or further away than allowed counts as "now", so tampering can
// only make the reminder appear, or the access end, sooner.
//
// The background worker only reads these (and clears them when access ends).
// They change only from the Cookie banners page, on a click.

export const DAY = 24 * 60 * 60 * 1000;
// How long access lasts before it's handed back, unless renewed with Keep.
export const LEASE_DAYS = 90;
// The default time between reminders, and the snooze limits.
export const REMIND_DAYS = 7;
export const MIN_SNOOZE_DAYS = 1;
export const MAX_SNOOZE_DAYS = 60;

const DB_NAME = 'strict-switch-guard';
const STORE = 'guard';
const KEY = 'banners';
const REMINDER_PAGE = '/options/banners.html';

// A stored date, or now if it's missing, not a number or too far away.
export function validDate(value, now, maxDays) {
  return Number.isFinite(value) && value <= now + maxDays * DAY ? value : now;
}

// The snooze choice, clamped to 1 to 60 whole days.
export function clampSnoozeDays(days) {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n)) return REMIND_DAYS;
  return Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, n));
}

// What's stored, made safe to use: { grantedAt, expiresAt, remindAt }, or null
// if nothing is stored.
export function normalize(stored, now = Date.now()) {
  if (stored === undefined || stored === null) return null;
  const s = typeof stored === 'object' ? stored : {};
  return {
    grantedAt: Number.isFinite(s.grantedAt) && s.grantedAt <= now ? s.grantedAt : null,
    expiresAt: validDate(s.expiresAt, now, LEASE_DAYS),
    remindAt: validDate(s.remindAt, now, MAX_SNOOZE_DAYS),
  };
}

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// The lease and reminder, normalized. An unreadable store counts as
// "remind now, access ends now".
export async function readGuard(now = Date.now()) {
  let stored;
  try {
    stored = await transact('readonly', (store) => store.get(KEY));
  } catch {
    stored = {};
  }
  return normalize(stored, now);
}

// Writes happen only on the Cookie banners page, from a click.
function assertReminderPage(event) {
  if (globalThis.location?.pathname !== REMINDER_PAGE) throw new Error('The reminder can only be changed on the Cookie banners page');
  if (!event?.isTrusted || event.type !== 'click') throw new Error('The reminder can only be changed by a click');
}

async function write(value) {
  await transact('readwrite', (store) => store.put(value, KEY));
  return normalize(value);
}

// Access was just granted: it lasts LEASE_DAYS, first reminder in REMIND_DAYS.
export function startLease(event, now = Date.now()) {
  assertReminderPage(event);
  return write({ grantedAt: now, expiresAt: now + LEASE_DAYS * DAY, remindAt: now + REMIND_DAYS * DAY });
}

// Keep: renews the lease and sets the next reminder REMIND_DAYS away.
export async function keep(event, now = Date.now()) {
  assertReminderPage(event);
  const current = await readGuard(now);
  return write({ grantedAt: current?.grantedAt ?? now, expiresAt: now + LEASE_DAYS * DAY, remindAt: now + REMIND_DAYS * DAY });
}

// Remind me in N days (1 to 60). The lease is unchanged.
export async function snooze(event, days, now = Date.now()) {
  assertReminderPage(event);
  const current = await readGuard(now);
  return write({ ...current, remindAt: now + clampSnoozeDays(days) * DAY });
}

// Access ended or was switched off.
export function clearGuard() {
  return transact('readwrite', (store) => store.delete(KEY));
}

export const isDue = (guard, now = Date.now()) => Boolean(guard) && guard.remindAt <= now;
export const isExpired = (guard, now = Date.now()) => !guard || guard.expiresAt <= now;
