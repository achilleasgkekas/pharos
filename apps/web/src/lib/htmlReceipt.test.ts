import { describe, it, expect } from 'vitest';
import { htmlReceiptToText } from './htmlReceipt';

describe('htmlReceiptToText — store-name preservation (the documented fix)', () => {
  it('prefixes the <title> so the model can read the store even when the body omits it', () => {
    const out = htmlReceiptToText('<title>Πλαίσιο</title><p>Total 50</p>');
    expect(out.startsWith('[Πλαίσιο]')).toBe(true);
    expect(out).toContain('Total 50');
  });

  it('surfaces the logo alt text as [logo: X] (store often lives ONLY there)', () => {
    const out = htmlReceiptToText('<img src="cid:x" alt="Plaisio"><p>Order confirmed</p>');
    expect(out).toContain('[logo: Plaisio]');
    expect(out).toContain('Order confirmed');
  });

  it('handles single-quoted alt attributes too', () => {
    expect(htmlReceiptToText(`<img alt='Kotsovolos'>`)).toContain('[logo: Kotsovolos]');
  });

  it('does not emit a logo marker for an <img> with no alt', () => {
    const out = htmlReceiptToText('<img src="x"><p>body</p>');
    expect(out).not.toContain('logo');
    expect(out).toBe('body');
  });

  it('adds no bracket prefix when there is no <title>', () => {
    expect(htmlReceiptToText('<p>Hello</p>')).toBe('Hello');
  });
});

describe('htmlReceiptToText — tag & whitespace normalisation', () => {
  it('turns <br> into a newline', () => {
    expect(htmlReceiptToText('<p>a<br>b</p>')).toBe('a\nb');
    expect(htmlReceiptToText('<p>a<br/>b</p>')).toBe('a\nb');
  });

  it('breaks lines on closing block tags', () => {
    // the opening <div> becomes a space, so the second row keeps a leading space
    expect(htmlReceiptToText('<div>row1</div><div>row2</div>')).toBe('row1\n row2');
  });

  it('strips generic inline tags to a space', () => {
    expect(htmlReceiptToText('<a href="http://x">link</a>')).toBe('link');
  });

  it('collapses runs of spaces/tabs into one', () => {
    expect(htmlReceiptToText('<p>a\t \t  b</p>')).toBe('a b');
  });

  it('never leaves three-or-more consecutive newlines', () => {
    const out = htmlReceiptToText('<p>a</p><p></p><p></p><p>b</p>');
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).not.toMatch(/\n\n\n/);
  });
});

describe('htmlReceiptToText — script/style/head removal', () => {
  it('removes <script> content entirely (untrusted email HTML)', () => {
    const out = htmlReceiptToText('<script>alert(1)</script><p>Hi</p>');
    expect(out).toBe('Hi');
    expect(out).not.toContain('alert');
  });

  it('removes <style> blocks', () => {
    const out = htmlReceiptToText('<style>.x{color:red}</style><p>Body</p>');
    expect(out).toBe('Body');
    expect(out).not.toContain('color');
  });

  it('removes <head> blocks (but the <title> inside is still surfaced via the prefix)', () => {
    const out = htmlReceiptToText('<head><meta charset="utf-8"><title>S</title></head><body>x</body>');
    expect(out.startsWith('[S]')).toBe(true);
    expect(out).not.toContain('charset');
  });
});

describe('htmlReceiptToText — entity decoding', () => {
  it('decodes the named entities we care about', () => {
    expect(htmlReceiptToText('<p>A &amp; B &lt;x&gt; &euro;5 &nbsp;end</p>')).toBe('A & B <x> €5 end');
  });

  it('decodes decimal numeric entities', () => {
    expect(htmlReceiptToText('<p>&#65;&#66;</p>')).toBe('AB');
  });

  it('decodes hexadecimal numeric entities (case-insensitive)', () => {
    expect(htmlReceiptToText('<p>&#x41;&#X42;</p>')).toBe('AB');
  });

  it('decodes a euro numeric entity commonly used in receipts', () => {
    expect(htmlReceiptToText('<p>Total &#8364;12,50</p>')).toBe('Total €12,50');
  });
});

describe('htmlReceiptToText — bounds & edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(htmlReceiptToText('')).toBe('');
  });

  it('caps output at 16000 chars to stay within the text model context', () => {
    const out = htmlReceiptToText('<p>' + 'a'.repeat(20000) + '</p>');
    expect(out.length).toBe(16000);
  });

  it('trims leading/trailing whitespace', () => {
    expect(htmlReceiptToText('   <p>  spaced  </p>   ')).toBe('spaced');
  });
});

describe('htmlReceiptToText — escaping edge cases (CodeQL)', () => {
  it('drops a script whose end tag carries whitespace', () => {
    expect(htmlReceiptToText('<p>Total</p><script>evil()</script ><p>€10</p>')).not.toContain('evil');
  });

  it('decodes entities once, so an escaped entity stays literal', () => {
    expect(htmlReceiptToText('<p>a &amp;lt; b</p>')).toBe('a &lt; b');
  });

  it('ignores an out-of-range numeric entity instead of throwing', () => {
    expect(htmlReceiptToText('<p>x&#99999999;y</p>')).toBe('xy');
  });
});
