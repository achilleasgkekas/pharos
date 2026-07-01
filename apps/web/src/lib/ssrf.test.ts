import { afterEach, describe, expect, it, vi } from 'vitest';

// ssrf.ts guards every server-side fetch of a user / AI / scraped URL against
// SSRF: it rejects non-http(s) URLs, bare internal names, and any host that
// (literally or after DNS resolution) lands on a private / loopback / link-local
// address. The literal-IP and internal-name branches are fully deterministic and
// need no network; the hostname branch resolves via node:dns, which we mock so the
// DNS-rebinding guard can be exercised without a live resolver.

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
import { assertPublicUrl } from './ssrf';

const mockLookup = vi.mocked(lookup);

afterEach(() => {
  mockLookup.mockReset();
});

describe('assertPublicUrl — malformed / disallowed schemes', () => {
  it('rejects a string that is not a URL', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toThrow('Invalid URL');
  });

  it('rejects non-http(s) protocols', async () => {
    await expect(assertPublicUrl('ftp://example.com/file')).rejects.toThrow(
      'Only http(s) URLs are allowed',
    );
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(
      'Only http(s) URLs are allowed',
    );
    await expect(assertPublicUrl('gopher://example.com')).rejects.toThrow(
      'Only http(s) URLs are allowed',
    );
  });

  it('never touches DNS for a malformed or bad-scheme URL', async () => {
    await expect(assertPublicUrl('javascript:alert(1)')).rejects.toThrow();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('assertPublicUrl — bare internal names (no DNS)', () => {
  it('rejects localhost and its subdomains', async () => {
    await expect(assertPublicUrl('http://localhost/')).rejects.toThrow('Internal host not allowed');
    await expect(assertPublicUrl('http://api.localhost/')).rejects.toThrow(
      'Internal host not allowed',
    );
  });

  it('rejects .local mDNS names and the docker host alias', async () => {
    await expect(assertPublicUrl('http://nas.local/')).rejects.toThrow('Internal host not allowed');
    await expect(assertPublicUrl('http://host.docker.internal:3000/')).rejects.toThrow(
      'Internal host not allowed',
    );
  });

  it('does not resolve internal names via DNS', async () => {
    await expect(assertPublicUrl('http://localhost/')).rejects.toThrow();
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('assertPublicUrl — literal IPv4 addresses (no DNS)', () => {
  it.each([
    ['http://127.0.0.1/', 'loopback'],
    ['http://10.0.0.5/', 'private 10/8'],
    ['http://192.168.1.1/', 'private 192.168/16'],
    ['http://172.16.0.1/', 'private 172.16/12 low'],
    ['http://172.31.255.255/', 'private 172.16/12 high'],
    ['http://169.254.169.254/', 'link-local + cloud metadata'],
    ['http://100.64.0.1/', 'CGNAT'],
    ['http://198.18.0.1/', 'benchmark'],
    ['http://224.0.0.1/', 'multicast'],
    ['http://0.0.0.0/', 'this-net'],
  ])('rejects private/reserved %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow('Private address not allowed');
  });

  it.each([
    'http://8.8.8.8/',
    'https://1.1.1.1/',
    'http://172.15.0.1/', // just outside 172.16/12
    'http://172.32.0.1/', // just outside 172.16/12
    'http://93.184.216.34/',
  ])('allows public literal IPv4 %s', async (url) => {
    await expect(assertPublicUrl(url)).resolves.toBeUndefined();
  });

  it('never resolves DNS for a literal IP', async () => {
    await assertPublicUrl('http://8.8.8.8/');
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('assertPublicUrl — literal IPv6 addresses (no DNS)', () => {
  it.each([
    ['http://[::1]/', 'loopback'],
    ['http://[::]/', 'unspecified'],
    ['http://[fe80::1]/', 'link-local'],
    ['http://[fd00::1]/', 'unique-local fd'],
    ['http://[fc00::1]/', 'unique-local fc'],
  ])('rejects private %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow('Private address not allowed');
  });

  it.each(['http://[2606:4700:4700::1111]/', 'http://[2001:4860:4860::8888]/'])(
    'allows public literal IPv6 %s',
    async (url) => {
      await expect(assertPublicUrl(url)).resolves.toBeUndefined();
    },
  );

  // KNOWN GAP (see OSS_PROGRESS.md "Needs Achilleas" 2026-07-02): ip6IsPrivate()
  // detects IPv4-mapped addresses via a dotted-decimal regex (/^::ffff:(\d+\.\d+\.\d+\.\d+)$/),
  // but WHATWG URL normalizes `[::ffff:127.0.0.1]` → `[::ffff:7f00:1]` (hex compression),
  // so the regex never matches and an IPv4-mapped loopback/private address slips through
  // as "public". These tests LOCK the current (insecure) behavior so a future fix in
  // ssrf.ts flips them from resolve→reject visibly. Do NOT read this as "intended".
  it.each([
    ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped loopback → normalized to ::ffff:7f00:1'],
    ['http://[::ffff:10.0.0.1]/', 'IPv4-mapped private → normalized to ::ffff:a00:1'],
  ])('KNOWN GAP: currently ALLOWS %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).resolves.toBeUndefined();
  });
});

describe('assertPublicUrl — hostname resolution (mocked DNS)', () => {
  it('allows a host that resolves entirely to public addresses', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    await expect(assertPublicUrl('https://example.com/page')).resolves.toBeUndefined();
    expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  it('defeats DNS rebinding: rejects a public name resolving to a private IP', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(assertPublicUrl('http://attacker.example/')).rejects.toThrow(
      'Host resolves to a private address',
    );
  });

  it('rejects when ANY resolved address is private (mixed answers)', async () => {
    mockLookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ] as never);
    await expect(assertPublicUrl('http://mixed.example/')).rejects.toThrow(
      'Host resolves to a private address',
    );
  });

  it('rejects a host with no resolved addresses', async () => {
    mockLookup.mockResolvedValue([] as never);
    await expect(assertPublicUrl('http://empty.example/')).rejects.toThrow(
      'Host resolves to a private address',
    );
  });

  it('rejects a host that fails to resolve', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicUrl('http://nxdomain.example/')).rejects.toThrow(
      'Host did not resolve',
    );
  });
});
