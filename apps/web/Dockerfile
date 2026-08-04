# ─── Multi-stage build for Next.js 15 standalone ───────────────────────────

FROM node:20-alpine AS base
# libc6-compat for some native deps under Alpine
RUN apk add --no-cache libc6-compat

# ─── Dependencies ──────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

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
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

# Storage mount point (bind-mounted in compose)
RUN mkdir -p /storage && chown nextjs:nodejs /storage

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
