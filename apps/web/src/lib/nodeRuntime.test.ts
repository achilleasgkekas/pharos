import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(process.cwd(), '../..');
const NODE_IMAGE = /^FROM node:(\d+)-alpine/gm;

function readRepoFile(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

describe('Node runtime versions', () => {
  it.each([
    'apps/web/Dockerfile',
    'apps/landing/Dockerfile',
    'services/scraper/Dockerfile',
  ])('uses Node 24 for every image in %s', (dockerfile) => {
    const versions = [...readRepoFile(dockerfile).matchAll(NODE_IMAGE)].map((match) => match[1]);

    expect(versions).not.toHaveLength(0);
    expect(new Set(versions)).toEqual(new Set(['24']));
  });

  it('keeps every CI job on the same Node major as the runtime images', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml');
    const versions = [...workflow.matchAll(/^\s*node-version:\s*['\"]?(\d+)['\"]?\s*$/gm)].map(
      (match) => match[1],
    );

    expect(versions).not.toHaveLength(0);
    expect(new Set(versions)).toEqual(new Set(['24']));
  });
});
