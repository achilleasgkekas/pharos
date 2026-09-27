import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MAIN_DEFAULT,
  CLAUDE_SCRAPER_DEFAULT,
  CLAUDE_SUGGESTIONS,
  CLAUDE_SCRAPER_SUGGESTIONS,
  RETIREMENT_RULES,
  modelLifecycle,
  usableClaudeModel,
} from './claudeModels';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDER_RECOMMEND, SCRAPER_RECOMMEND, priceForModel } from './aiModels';

// #359: the app offered, recommended and fell back to Claude Haiku 3.5 months after Anthropic
// retired it. These tests keep every model the app offers usable.

describe('modelLifecycle', () => {
  it('knows the retired models by alias and by dated id, with the retirement date', () => {
    expect(modelLifecycle('claude-3-5-haiku-latest')).toEqual({ status: 'retired', retiredOn: '2026-02-19', replacement: 'claude-haiku-4-5' });
    expect(modelLifecycle('claude-3-5-haiku-20241022')).toMatchObject({ status: 'retired' });
    expect(modelLifecycle('claude-3-haiku-20240307')).toMatchObject({ status: 'retired', retiredOn: '2026-04-20' });
    expect(modelLifecycle('claude-3-5-sonnet-latest')).toMatchObject({ status: 'retired', replacement: 'claude-sonnet-5' });
    expect(modelLifecycle('claude-3-7-sonnet-20250219')).toMatchObject({ status: 'retired' });
    expect(modelLifecycle('claude-3-opus-20240229')).toMatchObject({ status: 'retired', replacement: 'claude-opus-5' });
    expect(modelLifecycle('claude-sonnet-4-20250514')).toMatchObject({ status: 'retired' });
    expect(modelLifecycle('claude-opus-4-0')).toMatchObject({ status: 'retired' });
    expect(modelLifecycle('claude-opus-4-1-20250805')).toMatchObject({ status: 'retired', retiredOn: '2026-08-05' });
    expect(modelLifecycle('claude-2.1')).toMatchObject({ status: 'retired' });
    expect(modelLifecycle('  CLAUDE-3-5-HAIKU-LATEST ')).toMatchObject({ status: 'retired' });
  });

  it('does not confuse current models with retired ones that share a prefix', () => {
    for (const id of ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-opus-4-8', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1']) {
      expect(modelLifecycle(id), id).toEqual({ status: 'active' });
    }
  });

  it('treats non-Claude and empty ids as active', () => {
    expect(modelLifecycle('qwen2.5:14b')).toEqual({ status: 'active' });
    expect(modelLifecycle('')).toEqual({ status: 'active' });
  });

  it('flags a deprecated model without blocking it', () => {
    expect(modelLifecycle('claude-mythos-preview')).toMatchObject({ status: 'deprecated' });
    expect(usableClaudeModel('claude-mythos-preview')).toBe('claude-mythos-preview');
  });
});

describe('usableClaudeModel', () => {
  it('swaps a retired id for its replacement and keeps everything else', () => {
    expect(usableClaudeModel('claude-3-5-haiku-latest')).toBe('claude-haiku-4-5');
    expect(usableClaudeModel('claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(usableClaudeModel('qwen2.5:14b')).toBe('qwen2.5:14b');
  });
});

describe('every model the app offers is usable', () => {
  const offered = [
    CLAUDE_MAIN_DEFAULT,
    CLAUDE_SCRAPER_DEFAULT,
    ...CLAUDE_SUGGESTIONS,
    ...CLAUDE_SCRAPER_SUGGESTIONS,
    PROVIDER_RECOMMEND.anthropic!.model,
    SCRAPER_RECOMMEND.anthropic!.model,
    ...RETIREMENT_RULES.map((r) => r.replacement),
  ];

  it('offers no retired model, and no replacement is itself retired', () => {
    for (const id of offered) expect(modelLifecycle(id).status, id).toBe('active');
  });

  it('has a price for every model it recommends', () => {
    for (const id of [CLAUDE_MAIN_DEFAULT, CLAUDE_SCRAPER_DEFAULT, ...CLAUDE_SUGGESTIONS, ...CLAUDE_SCRAPER_SUGGESTIONS]) {
      expect(priceForModel(id), id).not.toBeNull();
    }
  });
});

describe('the price scraper keeps the same list (services/scraper/src/claudeModels.ts)', () => {
  // Read as text, not imported: the web Docker image builds from apps/web alone and its
  // typecheck would not find the scraper package.
  const body = (file: string) => {
    const src = readFileSync(file, 'utf8');
    return src.slice(src.indexOf('/** Document parsing'));
  };

  it('has the same code after its header comment', () => {
    const web = body(join(__dirname, 'claudeModels.ts'));
    const scraper = body(join(__dirname, '..', '..', '..', '..', 'services', 'scraper', 'src', 'claudeModels.ts'));
    expect(scraper).toBe(web);
  });
});
