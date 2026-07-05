import { describe, it, expect } from 'vitest';
import {
  RESET_MIN_RESPONSE_MS,
  resetResponseDelayMs,
  settleMinResponseTime,
} from './resetTiming';

describe('resetResponseDelayMs', () => {
  it('returns the full floor when no time has elapsed', () => {
    expect(resetResponseDelayMs(0)).toBe(RESET_MIN_RESPONSE_MS);
  });

  it('returns the remaining time below the floor', () => {
    expect(resetResponseDelayMs(200)).toBe(RESET_MIN_RESPONSE_MS - 200);
    expect(resetResponseDelayMs(499)).toBe(1);
  });

  it('returns 0 exactly at the floor', () => {
    expect(resetResponseDelayMs(RESET_MIN_RESPONSE_MS)).toBe(0);
  });

  it('returns 0 (never negative) once past the floor', () => {
    expect(resetResponseDelayMs(700)).toBe(0);
    expect(resetResponseDelayMs(RESET_MIN_RESPONSE_MS + 1)).toBe(0);
  });

  it('fails safe toward the FULL floor for a non-finite / negative elapsed', () => {
    // elapsed = now - start is always finite in practice; a degenerate non-finite/negative
    // value is treated as 0 elapsed → the full floor (more masking, never less).
    expect(resetResponseDelayMs(-100)).toBe(RESET_MIN_RESPONSE_MS);
    expect(resetResponseDelayMs(Number.NaN)).toBe(RESET_MIN_RESPONSE_MS);
    expect(resetResponseDelayMs(Number.NEGATIVE_INFINITY)).toBe(RESET_MIN_RESPONSE_MS);
    expect(resetResponseDelayMs(Number.POSITIVE_INFINITY)).toBe(RESET_MIN_RESPONSE_MS);
  });

  it('honours a custom floor', () => {
    expect(resetResponseDelayMs(100, 300)).toBe(200);
    expect(resetResponseDelayMs(400, 300)).toBe(0);
  });

  it('disables the floor for a non-positive / non-finite floor', () => {
    expect(resetResponseDelayMs(0, 0)).toBe(0);
    expect(resetResponseDelayMs(0, -5)).toBe(0);
    expect(resetResponseDelayMs(0, Number.NaN)).toBe(0);
  });

  it('always stays within [0, floor]', () => {
    for (const elapsed of [-1000, 0, 1, 250, 499, 500, 501, 99999]) {
      const d = resetResponseDelayMs(elapsed);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(RESET_MIN_RESPONSE_MS);
    }
  });
});

describe('settleMinResponseTime', () => {
  it('resolves immediately (no hang) when the floor is already met', async () => {
    // Inject a now that is well past the floor → delay 0 → no timer scheduled.
    const start = 1_000;
    await expect(settleMinResponseTime(start, start + RESET_MIN_RESPONSE_MS + 50)).resolves.toBeUndefined();
  });

  it('waits out a small remaining delay when the floor is not yet met', async () => {
    // With a real (tiny) remaining delay it still resolves; keep the window small so the test
    // stays fast and non-flaky. We only assert it completes, not the exact wall-clock.
    const start = Date.now();
    await settleMinResponseTime(start, start + (RESET_MIN_RESPONSE_MS - 5));
    // If we got here, the timer fired and the promise settled.
    expect(true).toBe(true);
  });
});
