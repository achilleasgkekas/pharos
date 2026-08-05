import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OpenAPI response-schema drift guard (companion to openapi.coverage.test.ts).
 *
 * The coverage test proves every route is documented. This one proves the documented
 * SHAPES are the shapes the routes actually return, which they were not: the original
 * schemas were written by hand and then the serializers moved on. Nine of them still
 * declared `_id` while every REST-native v1 resource has returned `id` from day one, so
 * a generated client read the identifier of an item, receipt, expense, statement,
 * subscription, voucher or task as `undefined`. `Statement.total` did not exist at all
 * (it is `totalAmount`), `LineItem.quantity` is `qty`, `ShoppingListItem.quantity` is
 * free text and not a number, and every multi-currency, split, tax, trial and derived
 * field added since (P9/P33/P34/P35, `itemCount`, `txnCount`, `anomaly`, `returnDaysLeft`)
 * was missing. `additionalProperties: true` hid all of it: the spec stayed valid while
 * describing a different API.
 *
 * So the shapes are derived from the serializers, the same single-source-of-truth
 * functions the routes call, and compared both ways: a key the code returns but the
 * spec omits, and a key the spec promises but the code no longer returns. Both mislead.
 *
 * The serializer is read as source rather than imported and called, because most of them
 * live inside a `route.ts` (Next only wants HTTP handlers exported from those) and two
 * are web server-action modules with `'use server'`. Reading the returned object literal
 * needs no module graph, no mocks and no DB. It is deliberately narrow: one named
 * function, its first returned object literal, the keys at depth 1.
 */
const V1_ROOT = __dirname;
const SRC = join(__dirname, '..', '..', '..');
const SPEC = join(__dirname, '..', '..', '..', '..', '..', '..', 'docs', 'openapi.yaml');

/** schema name in the spec → the function that produces that JSON shape. */
const SERIALIZERS: { schema: string; file: string; fn: string }[] = [
  { schema: 'Item', file: 'app/api/v1/items/route.ts', fn: 'trim' },
  { schema: 'Receipt', file: 'app/api/v1/receipts/serialize.ts', fn: 'trimReceipt' },
  { schema: 'LineItem', file: 'app/api/v1/receipts/serialize.ts', fn: 'serializeLineItems' },
  { schema: 'Expense', file: 'app/api/v1/expenses/serialize.ts', fn: 'trimExpense' },
  { schema: 'Statement', file: 'app/api/v1/statements/route.ts', fn: 'trim' },
  { schema: 'Subscription', file: 'app/api/v1/subscriptions/serialize.ts', fn: 'trim' },
  { schema: 'Voucher', file: 'app/api/v1/vouchers/serialize.ts', fn: 'trim' },
  { schema: 'Task', file: 'app/api/v1/tasks/route.ts', fn: 'trim' },
  { schema: 'Bill', file: 'app/api/v1/bills/serialize.ts', fn: 'trim' },
  { schema: 'GiftCard', file: 'app/api/v1/giftcards/serialize.ts', fn: 'trim' },
  { schema: 'Goal', file: 'app/api/v1/goals/serialize.ts', fn: 'trim' },
  { schema: 'LoyaltyCard', file: 'app/api/v1/loyaltycards/serialize.ts', fn: 'trim' },
  // Shared with the web UI, hence `_id` instead of `id` — documented as such in the spec.
  { schema: 'ShoppingListItem', file: 'app/shopping-list/actions.ts', fn: 'serialize' },
  { schema: 'Notification', file: 'app/notifications/actions.ts', fn: 'serialize' },
];

const OPENERS = '{[(';
const CLOSERS = '}])';

/** Drop comments so braces/parens inside prose never move the depth counter. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Keys of the first object literal returned by `fn` — `return { … }` or the arrow
 * form `=> ({ … })` (serializeLineItems maps rows). Depth-1 keys only, plus the
 * conditional-spread idiom `...(x !== undefined ? { key } : {})` used for the derived
 * optional fields (`anomaly`, `returnDaysLeft`).
 */
function serializerKeys(file: string, fn: string): string[] {
  const src = stripComments(readFileSync(join(SRC, file), 'utf8'));
  const at = src.search(new RegExp(`function\\s+${fn}\\s*\\(`));
  expect(at, `${fn}() not found in ${file}`).toBeGreaterThanOrEqual(0);
  const after = src.slice(at);
  const ret = after.search(/return\s*\{|=>\s*\(\{/);
  expect(ret, `no returned object literal in ${fn}() of ${file}`).toBeGreaterThanOrEqual(0);
  const open = after.indexOf('{', ret);

  // Body of the literal, up to its matching close.
  let depth = 0;
  let close = -1;
  for (let i = open; i < after.length; i++) {
    const c = after[i];
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  expect(close, `unbalanced object literal in ${fn}() of ${file}`).toBeGreaterThan(open);

  // A key is named by text sitting at depth 0 of the body; anything deeper belongs to a
  // nested object (a task's steps, a gift card's uses, a goal's contributions, a split
  // row) and is documented by its own schema. Nested literals are written inline on one
  // line here, so the filtering is per character, not per line.
  const keys: string[] = [];
  let depthHere = 0;
  for (const line of after.slice(open + 1, close).split('\n')) {
    const startedFlat = depthHere === 0;
    let flat = '';
    for (const c of line) {
      if (depthHere === 0) flat += c;
      if (OPENERS.includes(c)) depthHere++;
      else if (CLOSERS.includes(c)) depthHere--;
    }
    for (const m of flat.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) keys.push(m[1]);
    // `...(x !== undefined ? { key } : {})` — the derived optional fields. Spans the
    // parens, so it is matched against the whole line.
    if (startedFlat) for (const m of line.matchAll(/\.\.\.\([^)]*\?\s*\{\s*([A-Za-z_$][\w$]*)/g)) keys.push(m[1]);
  }
  return [...new Set(keys)];
}

/** `components.schemas` → declared property names, in declaration order. */
function specSchemas(): Map<string, string[]> {
  const lines = readFileSync(SPEC, 'utf8').split('\n');
  const out = new Map<string, string[]>();
  let inSchemas = false;
  let current: string[] | null = null;
  let inProps = false;
  for (const line of lines) {
    if (/^ {2}schemas:\s*$/.test(line)) { inSchemas = true; continue; }
    if (!inSchemas) continue;
    if (/^\S/.test(line)) break; // left `components:` entirely
    const schema = line.match(/^ {4}([A-Za-z][\w]*):\s*$/);
    if (schema) { current = []; out.set(schema[1], current); inProps = false; continue; }
    if (!current) continue;
    if (/^ {6}properties:\s*$/.test(line)) { inProps = true; continue; }
    if (!inProps) continue;
    const prop = line.match(/^ {8}([A-Za-z_$][\w$]*):/);
    if (prop) current.push(prop[1]);
    else if (/^ {6}\S/.test(line)) inProps = false; // next sibling key of the schema
  }
  return out;
}

describe('openapi response schemas match the serializers', () => {
  const schemas = specSchemas();

  it('reads the spec and every registered serializer', () => {
    // A silent parse failure would make every assertion below vacuously pass.
    expect(schemas.size).toBeGreaterThan(20);
    expect(V1_ROOT.endsWith(join('api', 'v1'))).toBe(true);
    for (const s of SERIALIZERS) expect(serializerKeys(s.file, s.fn).length, s.schema).toBeGreaterThan(3);
  });

  for (const { schema, file, fn } of SERIALIZERS) {
    it(`${schema} documents exactly what ${fn}() in ${file} returns`, () => {
      const declared = schemas.get(schema);
      expect(declared, `schema ${schema} missing from docs/openapi.yaml`).toBeTruthy();
      const returned = serializerKeys(file, fn);
      const undocumented = returned.filter((k) => !declared!.includes(k));
      const phantom = declared!.filter((k) => !returned.includes(k));
      expect(undocumented, `${schema}: returned by the API but absent from the spec`).toEqual([]);
      expect(phantom, `${schema}: promised by the spec but no longer returned`).toEqual([]);
    });
  }

  it('keeps `id` on the REST-native resources and `_id` only on the two web-shared shapes', () => {
    // The mismatch that started this guard: nine schemas said `_id` while the routes
    // returned `id`. Shopping list + notifications genuinely reuse the web serializers.
    const webShared = new Set(['ShoppingListItem', 'Notification']);
    for (const { schema, file, fn } of SERIALIZERS) {
      const props = schemas.get(schema)!;
      // Nested value objects (a receipt line) carry no identifier of their own.
      if (!serializerKeys(file, fn).some((k) => k === 'id' || k === '_id')) continue;
      expect(props.includes(webShared.has(schema) ? '_id' : 'id'), `${schema} id field`).toBe(true);
      if (!webShared.has(schema)) expect(props).not.toContain('_id');
    }
  });
});
