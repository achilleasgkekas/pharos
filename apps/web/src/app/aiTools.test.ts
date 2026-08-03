import { describe, expect, it } from 'vitest';
import { TOOLS, today } from './aiTools';

// aiTools.ts is the shared AI tool registry: both the chat command bar (runAiCommand) and the
// MCP route dispatch against this exact `TOOLS` array, and Anthropic tool-calling validates the
// model's tool_use blocks against these JSON schemas. A malformed schema here (a `required` key
// with no matching property, a duplicate tool name, an empty enum) does not fail a build — it
// silently breaks tool-calling at runtime. This module pulls in Mongoose models, so we exercise
// ONLY its pure, deterministic exports (the static registry + the `today()` date helper); the
// `execute()` dispatcher needs a live DB and is out of scope for a node unit test.

// Canonical tool-name set (mirrors the source). Adding/removing/renaming a tool must update this
// list too — that is the point: the registry is a contract the mobile app + MCP clients depend on.
const EXPECTED_NAMES = [
  'add_expense',
  'add_income',
  'add_subscription',
  'add_task',
  'add_to_list',
  'add_item',
  'log_price',
  'get_overview',
  'search_data',
  'update_record',
  'delete_record',
];

describe('TOOLS registry', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TOOLS)).toBe(true);
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it('exposes exactly the canonical tool set', () => {
    const names = TOOLS.map((t) => t.name);
    expect([...names].sort()).toEqual([...EXPECTED_NAMES].sort());
  });

  it('has unique tool names', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every tool a non-empty name and description', () => {
    for (const t of TOOLS) {
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect((t.description ?? '').length).toBeGreaterThan(0);
    }
  });

  it('declares every input_schema as a JSON-schema object with properties', () => {
    for (const t of TOOLS) {
      expect(t.input_schema).toBeTruthy();
      expect(t.input_schema.type).toBe('object');
      const props = t.input_schema.properties as Record<string, unknown> | undefined;
      expect(typeof props).toBe('object');
      expect(props).not.toBeNull();
    }
  });

  it('only lists `required` keys that exist in `properties`', () => {
    for (const t of TOOLS) {
      const props = (t.input_schema.properties ?? {}) as Record<string, unknown>;
      const required = (t.input_schema.required ?? []) as string[];
      expect(Array.isArray(required)).toBe(true);
      for (const key of required) {
        expect(Object.prototype.hasOwnProperty.call(props, key)).toBe(true);
      }
    }
  });

  it('gives every enum a non-empty array of string options', () => {
    for (const t of TOOLS) {
      const props = (t.input_schema.properties ?? {}) as Record<string, { enum?: unknown }>;
      for (const [, spec] of Object.entries(props)) {
        if (spec && 'enum' in spec && spec.enum !== undefined) {
          expect(Array.isArray(spec.enum)).toBe(true);
          expect((spec.enum as unknown[]).length).toBeGreaterThan(0);
          for (const opt of spec.enum as unknown[]) expect(typeof opt).toBe('string');
        }
      }
    }
  });

  it('locks the key mutation tools to a valid record type + id', () => {
    // update_record and delete_record are the only destructive tools; their `type` enum must
    // stay in sync with the modelFor() dispatcher or edits/deletes 404. Widened from
    // item/task/subscription to the ten user-authored models in P66 — receipts and statements
    // stay OUT on purpose (see EDITABLE_MODELS in aiTools.ts: statements have no soft-delete,
    // so "recoverable from Trash" could not be honoured, and both are parsed documents).
    for (const name of ['update_record', 'delete_record']) {
      const tool = TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      const props = tool!.input_schema.properties as Record<string, { enum?: string[] }>;
      expect([...(props.type.enum ?? [])].sort()).toEqual(
        ['bill', 'expense', 'giftcard', 'goal', 'item', 'loyaltycard', 'shoppinglist', 'subscription', 'task', 'voucher'].sort()
      );
      expect(props.type.enum).not.toContain('statement');
      expect(props.type.enum).not.toContain('receipt');
      expect((tool!.input_schema.required as string[]).includes('type')).toBe(true);
      expect((tool!.input_schema.required as string[]).includes('id')).toBe(true);
    }
  });

  it('requires vendor + amount to record an expense', () => {
    const addExpense = TOOLS.find((t) => t.name === 'add_expense');
    expect(addExpense).toBeDefined();
    expect([...(addExpense!.input_schema.required as string[])].sort()).toEqual(['amount', 'vendor']);
  });
});

describe('today()', () => {
  it('returns an ISO YYYY-MM-DD date string', () => {
    const d = today();
    expect(typeof d).toBe('string');
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d).toHaveLength(10);
  });

  it('matches the current UTC date (the ISO date slice)', () => {
    expect(today()).toBe(new Date().toISOString().slice(0, 10));
  });
});
