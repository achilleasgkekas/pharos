import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P31 coverage guard.
 *
 * A read-only role is only real if EVERY write path enforces it, and there are ~230
 * exported server actions. Checking them by hand is exactly how you miss five and ship a
 * boundary that is not a boundary, which is why this file exists: it reads the source and
 * fails the build when a mutating server action does not call `assertCanWrite()`.
 *
 * The /api/v1 half needs no scan, because every route goes through the one `withAuth`
 * wrapper (see apiAuth.ts), which blocks non-read methods for viewers.
 *
 * "Mutating" is detected two ways, because either alone leaks: `revalidatePath`/`revalidateTag`
 * (how this codebase refreshes the UI after a change) OR a direct Mongoose write
 * (`.create(`, `.save()`, `updateOne`, `deleteMany`, `findOneAndUpdate`, `insertMany`, …).
 * The second detector was added after the first one was found to miss `setup/actions.ts`,
 * which creates the first admin user and never revalidates anything.
 *
 * ALLOWLIST: actions that revalidate but must stay reachable without a writable session,
 * each with the reason. Keep it short and justified; every entry is a hole.
 */
const ALLOWLIST: Record<string, string> = {
  // Per-user preference cookie, not shared data: a viewer reading the app in Greek is not
  // a change to anything anyone else sees.
  'i18nActions.ts:setLocale': 'UI language cookie, no stored state',
  // The first-run wizard creates the very first admin, so by definition it runs before any
  // session exists. It is gated by "no users yet" instead.
  'setup/actions.ts:createFirstAdmin': 'first-run, pre-session',
  // A read-only user must still be able to change their OWN password. It touches only
  // their own user document and nothing shared.
  'settings/users.actions.ts:changeOwnPassword': 'own credentials only',
  // Not user intent: these run on page load to keep derived state fresh (alerts recomputed
  // from existing data, missing PDF thumbnails rendered). Guarding them would make every
  // page a viewer opens throw. Neither can store user-supplied content.
  'notifications/actions.ts:generateNotifications': 'derived refresh on load, no user input',
  'receipts/actions.ts:backfillReceiptThumbs': 'self-heal on load, no user input',
};

/** A server action changes stored state if it refreshes the UI after itself, or if it
 *  touches Mongoose directly. Kept as one source of truth for both checks below. */
const MUTATES =
  /revalidatePath|revalidateTag|safeRevalidate|\.create\(|\.save\(|\.insertMany\(|updateOne\(|updateMany\(|deleteOne\(|deleteMany\(|findOneAndUpdate\(|findOneAndDelete\(|findByIdAndUpdate\(|findByIdAndDelete\(|bulkWrite\(/;

const ACTIONS_ROOT = join(__dirname, '..', 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Split a 'use server' file into its exported async functions (name + body text). */
function exportedActions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export\s+async\s+function\s+(\w+)/g;
  let m: RegExpExecArray | null;
  const starts: { name: string; at: number }[] = [];
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    out.push({ name: starts[i].name, body: src.slice(starts[i].at, end) });
  }
  return out;
}

describe('every mutating server action enforces the read-only role (P31)', () => {
  const files = walk(ACTIONS_ROOT).filter((f) => /^['"]use server['"]/m.test(readFileSync(f, 'utf8')));

  it('finds the server-action files (guards against the scan silently matching nothing)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('leaves no mutating action unguarded', () => {
    const unguarded: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const rel = file.split('/src/app/')[1];
      for (const { name, body } of exportedActions(src)) {
        const mutates = MUTATES.test(body);
        if (!mutates) continue;
        const guarded = /assertCanWrite\s*\(|requireAdmin\s*\(/.test(body);
        const key = `${rel}:${name}`;
        if (!guarded && !(key in ALLOWLIST)) unguarded.push(`${file.split('/src/')[1]} → ${name}()`);
      }
    }
    // Printed in full so a failure names exactly what to fix.
    expect(unguarded, `Unguarded mutating actions:\n${unguarded.join('\n')}`).toEqual([]);
  });

  it('keeps the allowlist honest: every entry still exists and still mutates', () => {
    const seen = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const rel = file.split('/src/app/')[1];
      for (const { name, body } of exportedActions(src)) {
        if (MUTATES.test(body)) seen.add(`${rel}:${name}`);
      }
    }
    for (const key of Object.keys(ALLOWLIST)) expect(seen.has(key), `stale allowlist entry: ${key}`).toBe(true);
  });
});
