# Contributing to PHAROS

Thanks for your interest! PHAROS is a self-hosted personal hub. Contributions of all
sizes are welcome — bug fixes, features, docs, and translations.

## Getting set up

```bash
git clone https://github.com/youruser/pharos.git
cd pharos
cp .env.example .env        # generate AUTH_SECRET + NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (see README)
docker compose up -d mongo  # just the database for local dev
cd apps/web
npm install
npm run dev                 # http://localhost:3000
```

On first load you'll get the setup wizard — create a local admin account. AI is
optional; you can develop most features with it turned off.

## Before you open a PR

```bash
cd apps/web
npm run type-check   # tsc --noEmit with TypeScript 7 (~3x faster) — must pass
npm test             # vitest — must pass
npm run lint         # eslint — no errors
npm run build        # next build — must pass
python3 ../../scripts/check-doc-links.py   # from apps/web; when you touched docs
```

`type-check` runs TypeScript 7 (the native compiler, installed as the `typescript7` alias).
The regular `typescript` package stays on 5.x because typescript-eslint does not support TS 7
yet, and `next build` type-checks with that 5.x install, so CI still covers both compilers.
If the two ever disagree, `npm run type-check:ts5` runs the old check. See issue #72.

### What CI checks

| Workflow | Job | Runs when |
| --- | --- | --- |
| CI | **CI passed** (the one to mark required): fails if any job below that the change selected failed | every PR, docs-only included |
| CI | **Type-check & build**: private-file guard, `tsc`, vitest with coverage (report on the run page and as an artifact), integration tests against MongoDB (`npm run test:integration`, needs `MONGO_URI`), eslint with a `--max-warnings` ratchet (lower the number in `apps/web/package.json` when you remove warnings), a knip dead-code report, `next build`, then the production server starts against MongoDB: the browser smoke test (`apps/web/e2e/smoke.mjs`) runs first-time setup and opens every main page, and `apps/web/e2e/flows.mjs` walks the critical paths (item, expense, bill paid → expense, fuel fill → expense, backup export → restore) and runs axe on key pages. On a PR, changed files must not lose line coverage and the client JS must not grow more than 5% against `main` (`scripts/ci/baseline.mjs`) | any non-Markdown change (docs-only PRs skip it, which counts as passing) |
| CI | Docker image builds; the `docker-compose.yml` stack starts with it and passes the browser smoke test; Trivy scan fails on a CRITICAL vulnerability that has a fix | `apps/web/`, compose files |
| CI | Docs links (relative links and `#anchors`); `docs/openapi.yaml` is valid OpenAPI 3.1 (redocly); markdownlint (`.markdownlint-cli2.yaml`); spelling in the docs and `en.ts` (typos, `_typos.toml`) | Markdown or `docs/` changes |
| CI | Workflow lint: actionlint and zizmor (policy in `.github/zizmor.yml`) | `.github/workflows/` changes |
| CI | Everything above, nightly on `main`; a failure opens (and a green night closes) one `[ci] Nightly run` issue | 03:23 UTC |
| PR title | Title has the `type(scope): subject` shape (it becomes the squash commit) | every PR, bots skipped |
| Supply chain | `npm audit` (production deps, high+) for web, landing and scraper | every PR, `main`, weekly |
| Supply chain | Dependency review (new vulnerable or incompatible-licence deps) | every PR |
| Supply chain | Secret scan (gitleaks) over the PR's commits | every PR, `main` |
| Landing | type-check, build, Lighthouse budgets (`apps/landing/lighthouserc.json`) | changes in it |
| Extension | unit tests | changes in it |
| Scraper | type-check and unit tests (`npm test` in `services/scraper`); the web tests also check its copies of `ssrf.ts`, `safeFetch.ts` and `shoppingRegion.ts` are identical to the web ones | changes in it |
| CodeQL | security analysis | every PR, `main` |
| Security scan | Semgrep, report-only weekly issue | Mondays |
| Scorecard | OpenSSF Scorecard, results in the Security tab | Mondays |

## Code style

- **TypeScript strict** — no `any`. Prefer inference; type the boundaries.
- **Server Components by default**; client components only when you need interactivity.
- **Mutations are Server Actions** (`'use server'`), not API routes.
- **Validation with Zod**, reused on both sides where it helps.
- **Comments in English**; user-facing copy can be localized.
- Match the surrounding code's naming and density. Avoid em-dashes in UI copy.
- Tailwind classes inline; extract a component when a pattern repeats.

## Project layout

- `apps/web/src/app` — routes + their server actions
- `apps/web/src/lib` — shared logic (db, auth, AI providers, OCR/PDF, …)
- `apps/web/src/models` — Mongoose schemas
- `apps/web/src/components` — UI
- `services/scraper` — the optional price-scraper worker

## AI changes

AI is pluggable and **optional**. If you touch an AI call site, make sure the feature
still degrades gracefully when AI is off or no provider is configured (gate it with
`isFeatureEnabled` from `lib/aiFeatures.server`, and hide/disable the affordance in the
UI). New user-facing AI features should be added to the registry in `lib/aiFeatures.ts`
so they get a Settings toggle.

## Commit & PR

- Keep PRs focused. One logical change per PR where possible.
- Write a clear description and note any new env vars, schema changes, or migrations.
- Be kind in review. See the [Code of Conduct](CODE_OF_CONDUCT.md).
