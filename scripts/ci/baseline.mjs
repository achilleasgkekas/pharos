#!/usr/bin/env node
// CI baseline checks for apps/web (#331): coverage on the files a PR changes, and the size of
// the JavaScript the browser downloads. `main` publishes its numbers as the `ci-baseline`
// artifact; a PR compares against the last one.
//
//   node scripts/ci/baseline.mjs bundle <.next dir> <out.json>
//       Measure the client JS (gzip) the build produced and write it to out.json.
//
//   node scripts/ci/baseline.mjs compare <baseline dir> <coverage-summary.json> <bundle.json> <changed files>
//       Print a Markdown report (for the job summary) and exit 1 when
//         - a changed source file's line coverage dropped more than COVERAGE_TOLERANCE points
//           (default 1) below main's, or
//         - the client JS grew more than BUNDLE_BUDGET_PCT percent (default 5) over main's.
//       A missing baseline (first run, expired artifact) reports and passes.
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [mode, ...args] = process.argv.slice(2);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const readJson = (p) => (p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

if (mode === 'bundle') {
  const [nextDir, outFile] = args;
  const chunks = join(nextDir, 'static', 'chunks');
  let raw = 0;
  let gzip = 0;
  let files = 0;
  for (const f of walk(chunks)) {
    if (!f.endsWith('.js')) continue;
    const buf = readFileSync(f);
    raw += buf.length;
    gzip += gzipSync(buf).length;
    files++;
  }
  writeFileSync(outFile, JSON.stringify({ raw, gzip, files }, null, 2));
  console.log(`client JS: ${files} files, ${kb(raw)} raw, ${kb(gzip)} gzip`);
  process.exit(0);
}

if (mode !== 'compare') {
  console.error('usage: baseline.mjs bundle <.next dir> <out.json> | compare <baseline dir> <coverage-summary.json> <bundle.json> <changed files>');
  process.exit(2);
}

const [baseDir, coverageFile, bundleFile, changedFile] = args;
const tolerance = Number(process.env.COVERAGE_TOLERANCE ?? 1);
const budgetPct = Number(process.env.BUNDLE_BUDGET_PCT ?? 5);
const baseCoverage = readJson(join(baseDir, 'coverage-summary.json'));
const baseBundle = readJson(join(baseDir, 'bundle.json'));
const coverage = readJson(coverageFile);
const bundle = readJson(bundleFile);
const changed = (changedFile && existsSync(changedFile) ? readFileSync(changedFile, 'utf8') : '')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => /^apps\/web\/src\/.+\.tsx?$/.test(s) && !/\.test\.tsx?$/.test(s));

const failures = [];
const out = [];

// ── Coverage on changed files ────────────────────────────────────────────
// coverage-summary.json is keyed by absolute path; the repo-relative tail is what both runs share.
const byRepoPath = (summary) => {
  const m = new Map();
  for (const [k, v] of Object.entries(summary ?? {})) {
    if (k === 'total') continue;
    const i = k.indexOf('apps/web/src/');
    if (i >= 0) m.set(k.slice(i), v);
  }
  return m;
};
out.push('### Coverage of changed files (apps/web)', '');
if (!coverage) {
  out.push('_No coverage report from this run._');
} else if (!changed.length) {
  out.push('_No source files under `apps/web/src` changed._');
} else {
  const now = byRepoPath(coverage);
  const base = byRepoPath(baseCoverage);
  out.push('| File | main | this PR | |', '| --- | --- | --- | --- |');
  for (const f of changed) {
    const cur = now.get(f)?.lines.pct;
    const was = base.get(f)?.lines.pct;
    if (cur === undefined) continue; // deleted, or not loaded by any test
    let mark = '';
    if (was !== undefined && cur < was - tolerance) {
      mark = '❌ dropped';
      failures.push(`${f}: line coverage ${was}% → ${cur}%`);
    } else if (was === undefined) mark = baseCoverage ? 'new' : '';
    out.push(`| \`${relative('apps/web/src', f)}\` | ${was === undefined ? '–' : `${was}%`} | ${cur}% | ${mark} |`);
  }
  if (!baseCoverage) out.push('', '_No baseline from `main` yet: nothing to compare against._');
}

// ── Bundle size ─────────────────────────────────────────────────────────
out.push('', '### Client JavaScript (apps/web, gzip)', '');
if (!bundle) {
  out.push('_No bundle measurement from this run._');
} else if (!baseBundle) {
  out.push(`${kb(bundle.gzip)} in ${bundle.files} files. _No baseline from \`main\` yet._`);
} else {
  const delta = bundle.gzip - baseBundle.gzip;
  const pct = baseBundle.gzip ? (delta / baseBundle.gzip) * 100 : 0;
  const sign = delta >= 0 ? '+' : '−';
  out.push('| main | this PR | change |', '| --- | --- | --- |');
  out.push(`| ${kb(baseBundle.gzip)} | ${kb(bundle.gzip)} | ${sign}${kb(Math.abs(delta))} (${sign}${Math.abs(pct).toFixed(1)}%) |`);
  if (pct > budgetPct) failures.push(`client JS grew ${pct.toFixed(1)}% (budget ${budgetPct}%)`);
}

if (failures.length) out.push('', '**Failed:**', ...failures.map((f) => `- ${f}`));
console.log(out.join('\n'));
if (failures.length) {
  console.error(`\n${failures.join('\n')}`);
  process.exit(1);
}
