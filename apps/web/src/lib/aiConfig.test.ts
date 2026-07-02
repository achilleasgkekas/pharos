import { describe, expect, it } from 'vitest';
import { isVisionModel } from './aiConfig';

// isVisionModel(name) is the pure model-name classifier that lets an explicitly-chosen
// Ollama active model double as the vision model (and drives the safe vision fallback in
// getAiConfig). It is a case-insensitive SUBSTRING regex — /vl|vision|llava|minicpm-v|
// moondream|bakllava|llama3.2-vision/i — with no word boundaries, so any name that CONTAINS
// one of those hints is treated as vision-capable. These tests pin that contract, including
// the deliberate substring behaviour (a false positive on unrelated names containing "vl" is
// preferred over a false negative that would silently break receipt image parsing). Importing
// the module is side-effect free: connectDB is only invoked lazily inside getAiConfig, so no
// Mongo connection happens here.

describe('isVisionModel', () => {
  it('matches real Ollama vision model tags', () => {
    expect(isVisionModel('qwen2.5vl:7b')).toBe(true); // "vl"
    expect(isVisionModel('qwen2-vl')).toBe(true); // "vl"
    expect(isVisionModel('llava:13b')).toBe(true);
    expect(isVisionModel('llava-llama3')).toBe(true);
    expect(isVisionModel('minicpm-v:8b')).toBe(true);
    expect(isVisionModel('moondream')).toBe(true);
    expect(isVisionModel('bakllava')).toBe(true);
    expect(isVisionModel('llama3.2-vision:11b')).toBe(true);
  });

  it('matches on the generic "vision" hint regardless of vendor', () => {
    expect(isVisionModel('gpt-4-vision-preview')).toBe(true);
    expect(isVisionModel('some-custom-vision-model')).toBe(true);
    expect(isVisionModel('vision')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isVisionModel('Qwen2.5-VL')).toBe(true);
    expect(isVisionModel('LLaVA')).toBe(true);
    expect(isVisionModel('Llama3.2-Vision')).toBe(true);
    expect(isVisionModel('MINICPM-V')).toBe(true);
    expect(isVisionModel('MoonDream')).toBe(true);
  });

  it('classifies text-only models as non-vision', () => {
    expect(isVisionModel('qwen2.5:14b')).toBe(false);
    expect(isVisionModel('llama3.1:8b')).toBe(false);
    expect(isVisionModel('mistral')).toBe(false);
    expect(isVisionModel('gemma2:9b')).toBe(false);
    expect(isVisionModel('phi3')).toBe(false);
    expect(isVisionModel('deepseek-r1')).toBe(false);
  });

  it('treats the empty string as non-vision', () => {
    expect(isVisionModel('')).toBe(false);
  });

  it('matches the bare "vl" hint on its own', () => {
    expect(isVisionModel('vl')).toBe(true);
    expect(isVisionModel('VL')).toBe(true);
  });

  it('documents the substring (no-word-boundary) behaviour', () => {
    // These are NOT vision models, but they contain the literal substring "vl", so the
    // heuristic flags them true. This is an accepted trade-off: over-including here only
    // means an extra vision candidate, never a broken image parse. Pinned so any future
    // tightening (e.g. adding word boundaries) is a conscious, visible change.
    expect(isVisionModel('vllm')).toBe(true); // "vl" prefix
    expect(isVisionModel('vlan-model')).toBe(true); // "vl" prefix

    // …but a name with no hint substring at all stays false, even if it looks image-y.
    expect(isVisionModel('novel-text-model')).toBe(false); // "vel", not "vl"
    expect(isVisionModel('swivel')).toBe(false); // "vel", not "vl"
    expect(isVisionModel('gpt-4o')).toBe(false); // multimodal in reality, but no hint token
  });

  it('matches when the hint sits mid-string with surrounding tokens', () => {
    expect(isVisionModel('registry.example.com/library/llava:latest')).toBe(true);
    expect(isVisionModel('my-org/qwen2.5vl-custom:q4')).toBe(true);
  });
});
