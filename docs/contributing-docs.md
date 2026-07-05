# Contributing to the docs

This guide is about writing and maintaining the documentation in `docs/`. For
contributing **code**, see the repo-root [CONTRIBUTING.md](../CONTRIBUTING.md).

The goal of the docs set is to serve two audiences from the same Markdown files:
people self-hosting Pharos (AGPL-3.0) and people onboarding to the hosted SaaS.
Keep both in mind when you write.

## Markdown-first, no build step

The docs are plain Markdown on purpose. There is **no static-site generator, no
build, and no bundler** in `docs/`. Every file must render correctly as-is on
GitHub, so that:

- a self-hoster reading the repo sees complete, correct docs without tooling;
- the same files can later feed a docs site (Docusaurus, MkDocs, etc.) with no
  rewrite.

Practical consequences:

- Use only standard GitHub-Flavored Markdown. No custom shortcodes, no MDX, no
  front-matter, no HTML beyond the occasional `<!-- comment -->`.
- Link between docs with **relative paths that include the `.md` extension**
  (`[Configuration](configuration.md)`, `[AI providers](configuration.md#ai-providers)`).
  GitHub resolves these; a future docs site can rewrite them.
- Link to repo-root files with `../` (`[README](../README.md)`).
- Images live in `docs/` next to the Markdown (for example `banner.png`). Keep
  them small; do not add screenshots that will go stale quickly.

## File layout

| File | Purpose |
| --- | --- |
| `README.md` | The docs index. Every guide is listed here with a one-line summary. |
| `architecture.md` | How the Docker services, auth surfaces, and data layer fit together. |
| `self-hosting.md` | Empty host to running instance. |
| `configuration.md` | AI providers, storage backends, notifications, i18n. |
| `features.md` | What each module does, from a user's perspective. |
| `api.md` | REST API v1 reference (see the sync rule below). |
| `openapi.yaml` | Machine-readable mirror of `api.md`. |
| `security.md`, `backup-and-restore.md`, `updating.md`, `mobile.md`, `troubleshooting.md`, `saas.md`, `faq.md`, `glossary.md` | Focused guides, each linked from `README.md`. |
| `DOCS_PROGRESS.md` | The running log of what was written and what is next. |

When you add a new guide, also add a one-line entry to `README.md` under
**Guides** so the index stays complete.

## Style

- **Language: English.** The app code and UI-facing docs are English, so the
  docs are too. (The `DOCS_PROGRESS.md` log is kept in Greek by the maintainer;
  that file is the one exception.)
- **No em-dashes.** Use commas, parentheses, or semicolons instead. This matches
  the maintainer's preference across the whole project.
- **Be accurate over complete.** If you are unsure how something behaves, read
  the code rather than guess. Route files under `apps/web/src/app/api/v1/`,
  models under `apps/web/src/models/`, and `docker-compose.yml` are the ground
  truth. If something is genuinely unknown, mark an inline `TODO:` and note it in
  `DOCS_PROGRESS.md` rather than inventing a value.
- **Never invent env-var names, endpoints, ports, or defaults.** Cross-check
  against `.env.example`, the compose file, and the route code.
- **Secrets are always placeholders.** Never paste a real token, password, or
  key, even a test one. Use `<your-secret>`, `AUTH_SECRET=<random-32-bytes>`,
  and the like.
- Prefer short sections with descriptive `##`/`###` headings so links can target
  anchors. GitHub derives an anchor from each heading (lowercased, spaces to
  hyphens): `## AI providers` becomes `#ai-providers`.
- Keep code fences balanced and language-tagged (```bash, ```yaml, ```json).

## Keeping `api.md` in sync with the routes

`api.md` and `openapi.yaml` describe the REST API that the mobile app depends
on. The **route files are the source of truth**; the docs mirror them. When API
routes change, update both docs in the same change:

1. List the routes: everything under `apps/web/src/app/api/v1/**/route.ts`.
2. For each, confirm the method(s), path, query params, and request/response
   shape by reading the handler, not by memory.
3. Update the endpoint table in `api.md` and the matching path in
   `openapi.yaml`.
4. Re-check the list envelope (`{ data, total, limit, offset }`) and the
   write-response convention (create → `201 { <resource> }`, update →
   `200 { <resource> }`, delete → `200 { ok, id }`) still hold for the changed
   route.

A quick way to spot documented-vs-actual drift:

```bash
# Every route path that exists in code
find apps/web/src/app/api/v1 -name route.ts | sed 's#apps/web/src/app##;s#/route.ts##'
```

Compare that against the paths listed in `api.md`; anything in one and not the
other is drift to fix.

## Validation before you commit

The docs have no test suite, so validate by hand. These checks are fast and
catch the common mistakes.

**Internal links resolve** (every `.md` link points at a file that exists):

```bash
for f in docs/*.md; do
  grep -oE '\]\(([a-zA-Z0-9._#/-]+\.md)[^)]*\)' "$f" \
    | sed -E 's/.*\(([a-zA-Z0-9._/-]+\.md).*/\1/' \
    | while read -r t; do [ -e "docs/$t" ] || echo "BROKEN in $f -> $t"; done
done
```

No output means all links resolve.

**Code fences are balanced** (an odd count means an unclosed block):

```bash
for f in docs/*.md; do
  n=$(grep -c '^```' "$f"); [ $((n % 2)) -eq 0 ] || echo "UNBALANCED fences in $f ($n)";
done
```

**No stray secrets** in what you are about to commit:

```bash
git diff --cached -- docs/ | grep -niE 'secret|password|token|api[_-]?key' | grep -v '<'
```

Review anything it prints; it should only ever be placeholders.

## Committing

The docs are maintained partly by an unattended hourly routine and partly by
hand, and several routines commit to `main`. To avoid clobbering each other:

- Stage **only** the specific files you changed. Never `git add -A`, `git add .`,
  or `git add -a`.
- Before committing, run `git status --short` and `git diff --cached
  --name-only`. If files you did not touch are already staged, another process is
  mid-commit — wait and re-check, or stop.
- Never force-push. If a push is rejected, `git fetch origin` then `git rebase
  origin/main` (only if the working tree has no foreign uncommitted files).

After a change, append a dated entry to `DOCS_PROGRESS.md` describing what you
wrote, what you validated, and what the next doc to improve is.

## See also

- [Docs index](README.md)
- [API reference](api.md) (the sync rule above)
- [CONTRIBUTING.md](../CONTRIBUTING.md) (contributing code)
