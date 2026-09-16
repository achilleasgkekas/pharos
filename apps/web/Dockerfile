# ─── Multi-stage build for Next.js 15 standalone ───────────────────────────

FROM node:24-alpine AS base
# libc6-compat for some native deps under Alpine
RUN apk add --no-cache libc6-compat

# ─── Dependencies ──────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
# `npm ci`, not `npm install`: install the lockfile EXACTLY rather than re-resolving it.
#
# This is not tidiness. On 2026-08-05 the identical source built clean in the morning and failed
# the production build in the afternoon: the deps layer happened to be cached the first time and
# re-ran the second, `npm install` re-resolved the tree, and the floating ranges (typescript
# ^5.6.3, @types/node ^22.9.0) pulled a newer toolchain that rejected code the older one had
# tolerated. A build whose result depends on whether a Docker layer was cached is not a build,
# and the failure lands at deploy time on whoever happens to be shipping.
#
# The lockfile is no longer optional (`package-lock.json*` → `package-lock.json`): with `npm ci` a
# missing lock is fatal anyway, so it should fail loudly at COPY rather than as a confusing npm
# error. --legacy-peer-deps stays for the pre-existing react RC peer conflict.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ─── Builder ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# V8 sizes its own heap ceiling from the machine's RAM, and on a small server that ceiling is
# below what `next build` needs — the build dies with "JavaScript heap out of memory" even when
# there is swap free, because this limit is V8's own, not the kernel's. Swap keeps the machine
# alive; it does not raise this.
#
# Empty by default, so every build that works today is byte-for-byte unchanged: setting a value
# here can only LOWER the ceiling on a large machine, which would turn a working build into a
# failing one. Small hosts opt in (deploy/docker-compose.prod.yml passes 3072).
ARG NODE_BUILD_MEMORY=""
RUN if [ -n "$NODE_BUILD_MEMORY" ]; then export NODE_OPTIONS="--max-old-space-size=$NODE_BUILD_MEMORY"; fi; \
    npm run build

# ─── Runner ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
# poppler-utils → `pdftoppm` (PDF page-1 thumbnail).
# tesseract + English data → OCR-first receipt parsing (image → text → text model).
# Alpine only ships ancient-greek (grc); pull MODERN greek (ell) from tessdata_best.
# osd → orientation detection (`--psm 0`) so sideways/landscape receipts auto-rotate.
# samba-client → `smbclient` CLI, the SMB backend for the File-storage mirror. Unlike
# the pure-JS smb2 lib it negotiates SMB3, so it works with SMB3-only NAS shares.
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-eng samba-client wget ca-certificates \
  && wget -q -O /usr/share/tessdata/ell.traineddata \
     https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/ell.traineddata \
  && wget -q -O /usr/share/tessdata/osd.traineddata \
     https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/osd.traineddata
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Which release this image is (P40). The release workflow passes the semver tag it is
# publishing; a plain local `docker compose build` leaves it as `dev`, and a `dev` build
# deliberately never shows an "update available" banner (see lib/versionCheck.ts).
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output: server.js + minimal node_modules
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# pdfjs-dist loads its worker file at runtime, which the standalone trace misses.
# Copy the full package so pdf.worker.mjs is present (statement + receipt PDF import).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
# sharp (auto-rotate sideways receipts before OCR) is a native module; its prebuilt
# libvips binaries live under @img/*. Copy both so the standalone keeps the .node libs.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
# nodemailer is reached through `await import('nodemailer')` (lazy, so a deployment on Resend or a
# webhook never loads it) and the standalone trace does NOT pick that up — verified by looking in
# the built image, where it was simply absent. Left out, every email fails at runtime with
# "Cannot find module", and because the mailer catches its own errors it fails SILENTLY: the
# config looks right, the provider resolves, nothing is ever delivered.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/nodemailer ./node_modules/nodemailer
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

# Storage mount point (bind-mounted in compose)
RUN mkdir -p /storage && chown nextjs:nodejs /storage

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
