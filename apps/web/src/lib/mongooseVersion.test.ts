import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(process.cwd());

type PackageManifest = {
  dependencies: Record<string, string>;
  packages?: Record<string, { dependencies?: Record<string, string>; version?: string }>;
};

function readJson(path: string): PackageManifest {
  return JSON.parse(readFileSync(resolve(WEB_ROOT, path), 'utf8'));
}

describe('Mongoose runtime version', () => {
  it('pins Mongoose 9 in both dependency manifests', () => {
    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');

    expect(packageJson.dependencies.mongoose).toMatch(/^\^9\./);
    expect(packageLock.packages?.[''].dependencies?.mongoose).toBe(
      packageJson.dependencies.mongoose,
    );
    expect(packageLock.packages?.['node_modules/mongoose'].version).toMatch(/^9\./);
  });
});
