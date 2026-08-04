import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Coverage guard: no /api/v1 route may reach a COOKIE-SESSION guard.
 *
 * The two halves of the app authenticate differently. The web pages and server actions
 * carry a session cookie; any MCP/API client sends `Authorization: Bearer
 * <token>` and no cookie at all. `requireUser()` and `requireAdmin()` resolve the cookie
 * and `redirect('/login')` when there is none.
 *
 * Put one of those on a Bearer path and it does not deny the caller, it BREAKS the
 * endpoint: `redirect()` throws NEXT_REDIRECT, which `withAuth`'s catch turns into a 500,
 * for admins and members alike. That is not a hypothetical. `POST /api/v1/settings/
 * test-notify` shipped that way and was dead for every API caller until 2026-07-29,
 * because it delegated to the `sendTestNtfy` server action, whose `requireAdmin()` had
 * been added for the WEB Settings screen. Its own test mocked the action, so the suite
 * stayed green over a path that could not work.
 *
 * The lesson that this file encodes: a route handler must apply the guard its transport
 * can actually evaluate (`canAdmin(user.role)` on the Bearer user from `withAuth`), and
 * shared business logic must carry no authorisation of its own, so each caller can guard
 * it its own way. See `runNtfyTest` in lib/notify.ts for the shape.
 *
 * What is deliberately NOT flagged:
 *  - `assertCanWrite()`, which documents and handles the no-session case by returning
 *    (viewers on API paths are already blocked by `withAuth` on the HTTP method), and
 *  - bare `getCurrentUser()`, which returns null rather than throwing.
 * Only the two redirecting helpers break a Bearer request.
 *
 * SCOPE: one level of indirection (route → the actions it imports). A guard hidden two
 * hops deep would slip through. That is a deliberate trade for a scan with no false
 * positives; the first hop is where every real case has been.
 */
const SESSION_GUARDS = /\brequireAdmin\s*\(|\brequireUser\s*\(/;

const SRC = join(__dirname, '..');
const API_ROOT = join(SRC, 'app', 'api', 'v1');

/** Drop comments before scanning. Without this the guard is self-defeating: the routes and
 *  helpers that got this right are exactly the ones whose comments EXPLAIN requireAdmin and
 *  why they avoid it, and every one of them would be reported as an offender. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Split a module into its exported async functions (name + body text). Same approach as
 *  writeGuard.coverage.test.ts: the body runs to the next export, which is coarse but only
 *  ever over-includes, so a guard can never be missed by it. */
function exportedFns(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /export\s+async\s+function\s+(\w+)/g;
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    out.set(starts[i].name, src.slice(starts[i].at, end));
  }
  return out;
}

/** Every `import { a, b } from '@/app/...'` in a route, as (module path, symbols). */
function appImports(src: string): { spec: string; names: string[] }[] {
  const out: { spec: string; names: string[] }[] = [];
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]@\/(app\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const names = m[1]
      .split(',')
      .map((s) => s.replace(/\btype\b/, '').trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ spec: m[2], names });
  }
  return out;
}

function resolve(spec: string): string | null {
  for (const ext of ['.ts', '.tsx', '/index.ts']) {
    const p = join(SRC, spec + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

describe('no /api/v1 route reaches a cookie-session guard', () => {
  const routes = walk(API_ROOT).filter((f) => /\/route\.tsx?$/.test(f) && !/\.test\./.test(f));

  it('finds the route files (guards against the scan silently matching nothing)', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it('no route handler calls requireAdmin/requireUser directly', () => {
    const bad = routes.filter((f) => SESSION_GUARDS.test(stripComments(readFileSync(f, 'utf8'))));
    expect(bad.map((f) => f.split('/src/')[1]), 'Routes using a cookie guard').toEqual([]);
  });

  it('no route imports a server action that is gated by requireAdmin/requireUser', () => {
    const offenders: string[] = [];
    for (const route of routes) {
      for (const { spec, names } of appImports(readFileSync(route, 'utf8'))) {
        const target = resolve(spec);
        if (!target) continue;
        const fns = exportedFns(stripComments(readFileSync(target, 'utf8')));
        for (const name of names) {
          const body = fns.get(name);
          if (body && SESSION_GUARDS.test(body)) {
            offenders.push(`${route.split('/src/')[1]} → ${name}() in ${spec}`);
          }
        }
      }
    }
    expect(
      offenders,
      `These endpoints throw NEXT_REDIRECT for EVERY Bearer caller, admins included.\n` +
        `Guard the route with canAdmin(user.role) and move the shared body somewhere ` +
        `authorisation-free instead:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  // The scan is only worth having if it can actually see into an actions module. If the
  // import parser or the resolver ever breaks, the test above passes vacuously — so pin
  // that at least one route→action edge really is being followed.
  it('actually resolves route→action imports (guards against a vacuous pass)', () => {
    let edges = 0;
    for (const route of routes) {
      for (const { spec, names } of appImports(readFileSync(route, 'utf8'))) {
        const target = resolve(spec);
        if (!target) continue;
        const fns = exportedFns(stripComments(readFileSync(target, 'utf8')));
        edges += names.filter((n) => fns.has(n)).length;
      }
    }
    expect(edges).toBeGreaterThan(15);
  });
});
