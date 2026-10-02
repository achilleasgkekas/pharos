import { describe, it, expect } from 'vitest';
import { cleanAttachmentUrl } from './attachments';

describe('cleanAttachmentUrl', () => {
  it('keeps http(s) links', () => {
    expect(cleanAttachmentUrl('https://example.com/manual.pdf')).toBe('https://example.com/manual.pdf');
    expect(cleanAttachmentUrl('  http://x.gr/a  ')).toBe('http://x.gr/a');
  });
  it('adds https:// to a bare host', () => {
    expect(cleanAttachmentUrl('support.dyson.com/v15')).toBe('https://support.dyson.com/v15');
  });
  it('drops other schemes, bare words and huge input', () => {
    expect(cleanAttachmentUrl('javascript:alert(1)')).toBe('');
    expect(cleanAttachmentUrl('data:text/html,hi')).toBe('');
    expect(cleanAttachmentUrl('file:///etc/passwd')).toBe('');
    expect(cleanAttachmentUrl('manual')).toBe('');
    expect(cleanAttachmentUrl('')).toBe('');
    expect(cleanAttachmentUrl(null)).toBe('');
    expect(cleanAttachmentUrl(`https://a.com/${'x'.repeat(2100)}`)).toBe('');
  });
});
