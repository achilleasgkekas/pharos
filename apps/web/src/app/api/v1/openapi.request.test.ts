import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * OpenAPI request-body drift guard (third companion to openapi.coverage.test.ts and
 * openapi.schema.test.ts).
 *
 * Coverage proved every route is documented, and the schema guard proved the documented
 * RESPONSES are what the routes return. The request bodies were the last hand-written
 * half of the contract with nothing holding it to the code, and it had rotted the same
 * way: `POST /expenses` accepts `currency`, `fxRate`, `split`, `space`, `taxDeductible`,
 * `taxCategory` and `paymentMethod`, and the spec listed none of them. `PATCH /settings`
 * declared `additionalProperties: true` and not one property, so eleven writable
 * preferences were invisible. Multi-currency (P9) was undocumented on every money route,
 * a task's `steps` on the one route that can edit them.
 *
 * An omitted request field is worse than an omitted response field: a client reading the
 * spec does not send it, so the feature simply does not exist for them, and nothing errors.
 *
 * So the accepted keys are derived from the handler source, the same way the sibling guard
 * reads the serializers, and compared both ways. What a handler accepts is mechanically
 * legible because the mutation routes share one idiom: `const b = await readBody(req)`
 * followed by `strField(b, 'x')`-style coercion or a direct `b.x` guard. The parser also
 * follows the two variants in use, a `for (const k of ['a','b']) … b[k]` loop and a helper
 * handed the whole body (`cardFieldsFromBody`), because both hide real fields.
 *
 * Deliberately out of scope: nested property shapes (a split row, a task step), which the
 * component schemas own; multipart uploads, which carry files rather than a JSON body.
 */
const V1_ROOT = __dirname;
const SRC = join(__dirname, '..', '..', '..');
const SPEC = join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'openapi.yaml');

const METHODS = ['post', 'patch', 'put'] as const;
type Method = (typeof METHODS)[number];

/**
 * Keys a handler reads off the body and then deliberately overrides, so documenting them
 * would promise something the route ignores. Kept explicit and tiny on purpose: every
 * entry is a place where the spec is right and the parser cannot know it.
 */
const IGNORED: Record<string, string[]> = {
  // Shares cardFieldsFromBody() with PATCH, where `active` IS writable. On create the
  // route spreads the result and then pins `active: true`, so a client value is dropped.
  'post /cards': ['active'],
};

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

function specPathOf(file: string): string {
  return file.slice(V1_ROOT.length).replace(/\/route\.ts$/, '').replace(/\[(\.\.\.)?([^\]]+)\]/g, '{$2}');
}

/** Drop comments so a documented-but-unread field name never counts as accepted. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Body and parameter list of the function whose declaration starts at `at`. */
function blockAt(src: string, at: number): { body: string; params: string } {
  // The parameter list is skipped first: `{ params }: { params: … }` destructuring would
  // otherwise be mistaken for the function body and close it after one line.
  const paren = src.indexOf('(', at);
  let depth = 0;
  let afterParams = -1;
  for (let i = paren; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) { afterParams = i; break; } }
  }
  const open = src.indexOf('{', afterParams);
  depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return { body: src.slice(open, i + 1), params: src.slice(paren + 1, afterParams) }; }
  }
  return { body: src.slice(open), params: '' };
}

function handlerBody(src: string, method: Method): string | null {
  const at = src.search(new RegExp(`export\\s+(async\\s+)?function\\s+${method.toUpperCase()}\\b`));
  return at < 0 ? null : blockAt(src, at).body;
}

/** Keys read off any of `vars` (the names bound to the parsed body) inside `code`. */
function keysFrom(code: string, vars: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const v of vars) {
    for (const m of code.matchAll(new RegExp(`\\b(?:str|num|enum|bool|date)Field\\(\\s*${v}\\s*,\\s*'([^']+)'`, 'g'))) keys.add(m[1]);
    for (const m of code.matchAll(new RegExp(`\\b${v}\\??\\.([A-Za-z_$][\\w$]*)`, 'g'))) keys.add(m[1]);
    for (const m of code.matchAll(new RegExp(`\\b${v}\\[\\s*'([^']+)'\\s*\\]`, 'g'))) keys.add(m[1]);
    // `for (const k of ['total','subtotal']) … b[k]` — the idiom used where several
    // fields share one coercion. Without this the fields look unread.
    for (const m of code.matchAll(new RegExp(`\\b${v}\\[\\s*([A-Za-z_$][\\w$]*)\\s*\\]`, 'g'))) {
      const loop = code.match(new RegExp(`for\\s*\\(\\s*const\\s+${m[1]}\\s+of\\s*\\[([^\\]]*)\\]`));
      if (loop) for (const lit of loop[1].matchAll(/'([^']+)'/g)) keys.add(lit[1]);
    }
  }
  return keys;
}

/** Names bound to the parsed JSON body (`const b = await readBody(req)`). */
function bodyVars(code: string): Set<string> {
  const vars = new Set<string>();
  for (const m of code.matchAll(/(?:const|let|var)?\s*(\w+)\s*=\s*\(?\s*await\s+(?:readBody\(req\)|req\.json\(\))/g)) vars.add(m[1]);
  return vars;
}

/** Source file an imported symbol comes from, for `@/…` and relative specifiers. */
function importedFrom(fileSrc: string, file: string, name: string): string | null {
  for (const m of fileSrc.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
    if (!names.includes(name)) continue;
    const spec = m[2];
    const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(file), spec) : null;
    if (!base) return null;
    for (const cand of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

type Accepted = { keys: string[]; multipart: boolean; reads: boolean };

function acceptedKeys(file: string, method: Method): Accepted | null {
  const fileSrc = stripComments(readFileSync(file, 'utf8'));
  const body = handlerBody(fileSrc, method);
  if (!body) return null;
  const vars = bodyVars(body);
  const keys = keysFrom(body, vars);
  const destructured = body.match(/const\s*\{([^}]*)\}\s*=\s*await\s+readBody\(req\)/);
  if (destructured) {
    for (const part of destructured[1].split(',')) {
      const k = part.trim().split(':')[0].trim();
      if (k) keys.add(k);
    }
  }
  // A helper handed the whole body reads keys the handler never names itself.
  for (const v of vars) {
    for (const m of body.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\(\\s*${v}\\s*[,)]`, 'g'))) {
      const fn = m[1];
      if (/^(?:str|num|enum|bool|date)Field$/.test(fn)) continue;
      const imported = importedFrom(fileSrc, file, fn);
      for (const src2 of [fileSrc, ...(imported ? [stripComments(readFileSync(imported, 'utf8'))] : [])]) {
        const at = src2.search(new RegExp(`function\\s+${fn}\\s*\\(`));
        if (at < 0) continue;
        const { body: fnBody, params } = blockAt(src2, at);
        const first = (params.split(',')[0] || '').trim().split(':')[0].trim();
        if (first) for (const k of keysFrom(fnBody, [first])) keys.add(k);
        break;
      }
    }
  }
  return { keys: [...keys], multipart: /formData\(/.test(body), reads: vars.size > 0 || !!destructured };
}

type Required = { indent: number; keys: string[] };
type SpecOp = { props: string[]; required: string[]; requiredAt: Required[]; propIndent: number; hasBody: boolean; multipart: boolean };

/** paths → method → the requestBody's TOP-LEVEL properties (nested ones belong to their
 *  own object and are checked by no one here, on purpose). */
function specBodies(): Map<string, Map<Method, SpecOp>> {
  const lines = readFileSync(SPEC, 'utf8').split('\n');
  const out = new Map<string, Map<Method, SpecOp>>();
  let path = '';
  let method: Method | null = null;
  let cur: SpecOp | null = null;
  let inPaths = false;
  let inBody = false;
  let propIndent = -1;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break; // reached `components:`
    let m = line.match(/^ {2}(\/\S*):\s*$/);
    if (m) { path = m[1]; method = null; inBody = false; propIndent = -1; continue; }
    m = line.match(/^ {4}([a-z]+):\s*$/);
    if (m) {
      method = (METHODS as readonly string[]).includes(m[1]) ? (m[1] as Method) : null;
      inBody = false;
      propIndent = -1;
      if (method) {
        cur = { props: [], required: [], requiredAt: [], propIndent: -1, hasBody: false, multipart: false };
        if (!out.has(path)) out.set(path, new Map());
        out.get(path)!.set(method, cur);
      }
      continue;
    }
    if (!method || !cur) continue;
    if (/^ {6}requestBody:\s*$/.test(line)) { inBody = true; cur.hasBody = true; propIndent = -1; continue; }
    if (inBody && /^ {6}\S/.test(line)) inBody = false; // next sibling key of the operation
    if (!inBody) continue;
    if (/multipart\/form-data:/.test(line)) cur.multipart = true;
    m = line.match(/^(\s+)properties:\s*$/);
    if (m) { if (propIndent < 0) propIndent = m[1].length + 2; cur.propIndent = propIndent; continue; }
    // Every `required:` is kept with its indent; which one is the body's own is only
    // decidable once `properties:` has been seen, and the two appear in either order.
    // A deeper one belongs to a nested object (a gift-card use, a goal contribution)
    // whose fields are not top-level input.
    m = line.match(/^(\s+)required:\s*\[([^\]]*)\]/);
    if (m) { cur.requiredAt.push({ indent: m[1].length, keys: m[2].split(',').map((s) => s.trim()).filter(Boolean) }); continue; }
    if (propIndent > 0) {
      const prop = line.match(/^(\s+)([A-Za-z_$][\w$]*):/);
      if (prop && prop[1].length === propIndent) cur.props.push(prop[2]);
    }
  }
  // `required:` is a sibling of `properties:`, so exactly two spaces shallower.
  for (const ops of out.values()) {
    for (const op of ops.values()) op.required = op.requiredAt.find((r) => r.indent === op.propIndent - 2)?.keys ?? [];
  }
  return out;
}

const spec = specBodies();
const operations = routeFiles(V1_ROOT).flatMap((file) =>
  METHODS.map((method) => ({ file, method, path: specPathOf(file), got: acceptedKeys(file, method) }))
).filter((o): o is typeof o & { got: Accepted } => o.got !== null);

const EMPTY: SpecOp = { props: [], required: [], requiredAt: [], propIndent: -1, hasBody: false, multipart: false };
const declared = (path: string, method: Method) => spec.get(path)?.get(method) ?? EMPTY;

describe('openapi request bodies match what the routes accept', () => {
  it('reads the spec and every mutation handler (guards against a broken scan)', () => {
    // A silent parse failure would make every assertion below vacuously pass.
    expect(operations.length).toBeGreaterThan(40);
    expect(spec.size).toBeGreaterThan(30);
    expect([...spec.values()].filter((ops) => [...ops.values()].some((o) => o.props.length)).length).toBeGreaterThan(20);
  });

  for (const { path, method, file, got } of operations) {
    const label = `${method.toUpperCase()} ${path}`;
    const rel = file.slice(V1_ROOT.length + 1);

    if (got.multipart || declared(path, method).multipart) {
      it.skip(`${label} is a multipart upload, not a JSON body`, () => {});
      continue;
    }

    it(`${label} documents exactly the fields ${rel} reads`, () => {
      const s = declared(path, method);
      if (!got.reads) {
        expect(s.hasBody, `${label}: reads no body, so the spec should not declare one`).toBe(false);
        return;
      }
      expect(s.hasBody, `${label}: reads a JSON body the spec does not declare`).toBe(true);
      const ignored = IGNORED[`${method} ${path}`] ?? [];
      const accepted = got.keys.filter((k) => !ignored.includes(k));
      const undocumented = accepted.filter((k) => !s.props.includes(k)).sort();
      const phantom = s.props.filter((k) => !accepted.includes(k)).sort();
      expect(undocumented, `${label}: accepted by the route but absent from the spec`).toEqual([]);
      expect(phantom, `${label}: promised by the spec but never read`).toEqual([]);
    });
  }

  it('never marks a field required that the route does not even read', () => {
    const wrong: string[] = [];
    for (const { path, method, got } of operations) {
      const s = declared(path, method);
      if (s.multipart || got.multipart) continue;
      for (const r of s.required) if (!got.keys.includes(r)) wrong.push(`${method.toUpperCase()} ${path} → ${r}`);
    }
    expect(wrong.sort()).toEqual([]);
  });
});
