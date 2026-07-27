import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OpenAPI drift guard.
 *
 * `docs/openapi.yaml` is the machine-readable contract third-party clients and code
 * generators build against, but nothing forced it to keep up with the routes: it was
 * written once against 50 paths and eleven endpoints (bills, gift cards, goals, loyalty
 * cards, barcode lookup, the AI settings route, plan merge) shipped afterwards without a
 * line of spec, so a generated client simply did not know they existed. Documentation
 * that silently rots is worse than none, because it reads as complete.
 *
 * So this test derives the truth from the filesystem, the same way the spec claims to:
 * every `route.ts` under `app/api/v1` is one path, and every exported HTTP handler in it
 * is one operation. Both directions fail — an undocumented route AND a documented path
 * that no longer exists — because a stale entry misleads just as badly as a missing one.
 *
 * The YAML is scanned as text rather than parsed: no YAML parser is a direct dependency
 * of this app, and the two things being checked (top-level path keys, operation keys one
 * level in) are unambiguous at fixed indentation in a file this spec's own formatting
 * already follows.
 */
const V1_ROOT = __dirname;
const SPEC = join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'openapi.yaml');

const METHODS = ['get', 'post', 'patch', 'delete', 'put'] as const;
type Method = (typeof METHODS)[number];

/** Every route.ts under app/api/v1, as a spec-style path (`/items/{id}`). */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

function specPathOf(file: string): string {
  const rel = file.slice(V1_ROOT.length).replace(/\/route\.ts$/, '');
  // Next's `[id]` dynamic segment is `{id}` in OpenAPI.
  return rel.replace(/\[(\.\.\.)?([^\]]+)\]/g, '{$2}');
}

/** Exported HTTP handlers, e.g. `export async function PATCH(` → ['patch']. */
function handlersIn(file: string): Method[] {
  const src = readFileSync(file, 'utf8');
  return METHODS.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m.toUpperCase()}\\b`).test(src));
}

/** Top-level `paths:` entries of the spec → the operations declared under each. */
function specOperations(): Map<string, Set<Method>> {
  const lines = readFileSync(SPEC, 'utf8').split('\n');
  const out = new Map<string, Set<Method>>();
  let current: Set<Method> | null = null;
  let inPaths = false;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (!inPaths) continue;
    // A new top-level key (`components:`) ends the paths block.
    if (/^\S/.test(line)) break;
    const path = line.match(/^ {2}(\/\S*):\s*$/);
    if (path) { current = new Set<Method>(); out.set(path[1], current); continue; }
    const op = line.match(/^ {4}([a-z]+):\s*$/);
    if (op && current && (METHODS as readonly string[]).includes(op[1])) current.add(op[1] as Method);
  }
  return out;
}

const routes = routeFiles(V1_ROOT).map((f) => ({ path: specPathOf(f), methods: handlersIn(f) }));
const spec = specOperations();

describe('docs/openapi.yaml mirrors the /api/v1 routes', () => {
  it('finds routes and spec paths at all (guards against a broken scan)', () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(spec.size).toBeGreaterThan(50);
  });

  it('documents every route file', () => {
    const undocumented = routes.map((r) => r.path).filter((p) => !spec.has(p)).sort();
    expect(undocumented).toEqual([]);
  });

  it('has no path that no route serves', () => {
    const live = new Set(routes.map((r) => r.path));
    const orphaned = [...spec.keys()].filter((p) => !live.has(p)).sort();
    expect(orphaned).toEqual([]);
  });

  it('documents every exported HTTP method of every route', () => {
    const missing: string[] = [];
    for (const r of routes) {
      const documented = spec.get(r.path);
      if (!documented) continue; // already reported by the path test above
      for (const m of r.methods) if (!documented.has(m)) missing.push(`${m.toUpperCase()} ${r.path}`);
    }
    expect(missing.sort()).toEqual([]);
  });

  it('declares no operation the route does not export', () => {
    const byPath = new Map(routes.map((r) => [r.path, r.methods]));
    const extra: string[] = [];
    for (const [path, ops] of spec) {
      const live = byPath.get(path);
      if (!live) continue; // already reported by the orphan test above
      for (const m of ops) if (!live.includes(m)) extra.push(`${m.toUpperCase()} ${path}`);
    }
    expect(extra.sort()).toEqual([]);
  });
});
