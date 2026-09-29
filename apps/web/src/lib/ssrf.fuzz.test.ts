import fc from 'fast-check';
import type { LookupAddress } from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { assertPublicUrl, publicLookup } from './ssrf';

const mockLookup = vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>);
const octet = fc.integer({ min: 0, max: 255 });
const privateIp = fc.oneof(
  fc.tuple(fc.constantFrom(0, 10, 127), octet, octet, octet),
  fc.tuple(fc.constant(172), fc.integer({ min: 16, max: 31 }), octet, octet),
  fc.tuple(fc.constant(192), fc.constant(168), octet, octet),
  fc.tuple(fc.constant(169), fc.constant(254), octet, octet),
  fc.tuple(fc.constant(100), fc.integer({ min: 64, max: 127 }), octet, octet),
);
// Reproducible failures; fast-check also reports the seed and minimized counterexample.
const options = { seed: 20260930, numRuns: 1000 };
afterEach(() => mockLookup.mockReset());

describe('SSRF guard fuzzing', () => {
  it('blocks private IPv4 addresses in canonical and WHATWG alternate forms', async () => {
    await fc.assert(fc.asyncProperty(privateIp, async (parts) => {
      const value = parts.reduce((acc, part) => acc * 256 + part, 0);
      for (const host of [parts.join('.'), String(value), `0x${value.toString(16)}`]) {
        await expect(assertPublicUrl(`http://${host}/`)).rejects.toThrow();
      }
    }), options);
  });

  it('blocks private IPv4 addresses mapped into compressed and expanded IPv6', async () => {
    await fc.assert(fc.asyncProperty(privateIp, async ([a, b, c, d]) => {
      const high = ((a << 8) | b).toString(16);
      const low = ((c << 8) | d).toString(16);
      for (const host of [`::ffff:${a}.${b}.${c}.${d}`, `::ffff:${high}:${low}`, `0:0:0:0:0:ffff:${high}:${low}`]) {
        await expect(assertPublicUrl(`https://[${host}]/`)).rejects.toThrow();
      }
    }), options);
  });

  it('blocks every generated unique-local IPv6 address', async () => {
    await fc.assert(fc.asyncProperty(
      fc.integer({ min: 0xfc00, max: 0xfdff }),
      fc.array(fc.integer({ min: 0, max: 65535 }), { minLength: 7, maxLength: 7 }),
      async (first, rest) => {
        const host = [first, ...rest].map((part) => part.toString(16)).join(':');
        await expect(assertPublicUrl(`http://[${host}]/`)).rejects.toThrow();
      },
    ), options);
  });

  it('rejects a private DNS answer even when mixed with a public answer', async () => {
    await fc.assert(fc.asyncProperty(privateIp, fc.boolean(), async (parts, reverse) => {
      const answers = [{ address: '8.8.8.8', family: 4 }, { address: parts.join('.'), family: 4 }];
      mockLookup.mockResolvedValueOnce(reverse ? answers.reverse() : answers);
      await expect(assertPublicUrl('https://example.com/')).rejects.toThrow('private address');
    }), options);
  });

  it('rejects private addresses returned at socket connection time', async () => {
    await fc.assert(fc.asyncProperty(privateIp, async (parts) => {
      mockLookup.mockResolvedValueOnce([{ address: parts.join('.'), family: 4 }]);
      const error = await new Promise<Error | null>((resolve) => {
        publicLookup('example.com', { family: 4 }, (err) => resolve(err));
      });
      expect(error).toBeInstanceOf(Error);
    }), options);
  });

  it('continues to accept generated globally routable IPv4 literals', async () => {
    await fc.assert(fc.asyncProperty(fc.tuple(fc.constant(8), octet, octet, octet), async (parts) => {
      await expect(assertPublicUrl(`https://${parts.join('.')}/`)).resolves.toBeUndefined();
    }), options);
  });
});
