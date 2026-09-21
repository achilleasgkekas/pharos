import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = resolve(process.cwd(), '../..');
const ALLOWED_EXAMPLES = new Set([
  'apps/extension/src/shared.js:10.0.1.5',
  'apps/extension/src/shared.test.js:10.0.1.5',
  'apps/web/src/lib/saas/f2b.test.ts:10.0.1.1',
]);

describe('repository privacy', () => {
  it('keeps private infrastructure identifiers out of committed files', () => {
    const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }).split('\0').filter(Boolean);
    const privateHostname = ['home', 'agkekas', 'gr'].join('.');
    const privateAddress = /10\.0\.1\.\d+/g;

    const leaks = trackedFiles.flatMap((file) => {
      const path = resolve(REPOSITORY_ROOT, file);
      const stat = lstatSync(path);
      const contents = stat.isSymbolicLink()
        ? readlinkSync(path)
        : readFileSync(path, 'utf8');
      const identifiers = [
        ...contents.matchAll(privateAddress),
        ...(contents.includes(privateHostname) ? [[privateHostname]] : []),
      ].map(([identifier]) => identifier);

      return identifiers
        .filter((identifier) => !ALLOWED_EXAMPLES.has(`${file}:${identifier}`))
        .map((identifier) => `${file}: ${identifier}`);
    });

    expect(leaks).toEqual([]);
  });
});
