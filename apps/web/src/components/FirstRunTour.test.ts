import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./FirstRunTour.tsx', import.meta.url)), 'utf8');

describe('FirstRunTour accessibility', () => {
  it('uses the modal dialog primitive to isolate and contain keyboard focus', () => {
    expect(source).toContain("import * as Dialog from '@radix-ui/react-dialog'");
    expect(source).toContain('<Dialog.Root open');
    expect(source).toContain('<Dialog.Overlay');
    expect(source).toContain('<Dialog.Content');
    expect(source).toContain('<Dialog.Title');
    expect(source).toContain('<Dialog.Description');
    expect(source).not.toContain('createPortal');
  });
});
