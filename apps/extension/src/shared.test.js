import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrigin, captureUrl, isCapturable, POPUP_SIZE } from './shared.js';

test('normalizeOrigin keeps a full https origin', () => {
  assert.equal(normalizeOrigin('https://pharos.example.com'), 'https://pharos.example.com');
});

test('normalizeOrigin assumes https for a bare host', () => {
  assert.equal(normalizeOrigin('pharos.example.com'), 'https://pharos.example.com');
});

test('normalizeOrigin keeps an explicit http origin (LAN / self-hosted)', () => {
  assert.equal(normalizeOrigin('http://10.0.1.5:3000'), 'http://10.0.1.5:3000');
});

test('normalizeOrigin keeps a bare host:port as https', () => {
  assert.equal(normalizeOrigin('pharos.lan:3000'), 'https://pharos.lan:3000');
});

test('normalizeOrigin drops a trailing slash, path, query and hash', () => {
  assert.equal(normalizeOrigin('https://pharos.example.com/'), 'https://pharos.example.com');
  assert.equal(normalizeOrigin('https://pharos.example.com/settings?tab=ai#x'), 'https://pharos.example.com');
});

test('normalizeOrigin trims surrounding whitespace', () => {
  assert.equal(normalizeOrigin('  https://pharos.example.com  '), 'https://pharos.example.com');
});

test('normalizeOrigin rejects empty, nullish and non-http schemes', () => {
  assert.equal(normalizeOrigin(''), '');
  assert.equal(normalizeOrigin('   '), '');
  assert.equal(normalizeOrigin(null), '');
  assert.equal(normalizeOrigin(undefined), '');
  assert.equal(normalizeOrigin('javascript://evil'), '');
  assert.equal(normalizeOrigin('file:///etc/passwd'), '');
  assert.equal(normalizeOrigin('ftp://files.example.com'), '');
});

test('captureUrl points at /capture and encodes the page URL', () => {
  assert.equal(
    captureUrl('https://pharos.example.com', 'https://shop.gr/p?id=1&x=2'),
    'https://pharos.example.com/capture?url=https%3A%2F%2Fshop.gr%2Fp%3Fid%3D1%26x%3D2',
  );
});

test('captureUrl encodes non-latin characters in the page URL', () => {
  const out = captureUrl('https://p.example.com', 'https://shop.gr/προϊόν');
  assert.ok(out.startsWith('https://p.example.com/capture?url='));
  assert.ok(!out.includes('προϊόν'));
  assert.equal(new URL(out).searchParams.get('url'), 'https://shop.gr/προϊόν');
});

test('captureUrl survives a missing page URL without throwing', () => {
  assert.equal(captureUrl('https://p.example.com', undefined), 'https://p.example.com/capture?url=');
});

test('isCapturable accepts http(s) pages only', () => {
  assert.equal(isCapturable('https://shop.gr/product'), true);
  assert.equal(isCapturable('http://shop.gr/product'), true);
  assert.equal(isCapturable('chrome://extensions'), false);
  assert.equal(isCapturable('about:blank'), false);
  assert.equal(isCapturable('file:///Users/me/page.html'), false);
  assert.equal(isCapturable(''), false);
  assert.equal(isCapturable(undefined), false);
  // A scheme with nothing after it is not a page either.
  assert.equal(isCapturable('https://'), false);
});

test('POPUP_SIZE is a sane popup geometry', () => {
  assert.ok(POPUP_SIZE.width > 320 && POPUP_SIZE.height > 400);
});
