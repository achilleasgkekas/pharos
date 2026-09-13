# ─── Multi-stage build for the PHAROS landing site (Next.js 15 standalone) ──
# The marketing/pricing site has no database, no OCR, and no native modules, so
# this stays much smaller than apps/web: just build the standalone server and
# copy it into a clean runner.

FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat

# ─── Dependencies ──────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
# `npm ci`, not `npm install` — same reason as apps/web/Dockerfile: install the lockfile exactly,
# so a cached-vs-cold deps layer can never change what gets built. The landing site has not been
# bitten by this yet; it has the same floating ranges, so it is the same trap.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ─── Builder ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Same reason as apps/web/Dockerfile: V8 sizes its own heap ceiling from the machine's RAM, and
# on a small server `next build` hits it and dies with "JavaScript heap out of memory" even with
# swap free — that limit is V8's, not the kernel's. Empty by default so existing builds are
# unchanged (a fixed value could only LOWER the ceiling on a big machine); the production
# compose opts in.
ARG NODE_BUILD_MEMORY=""
RUN if [ -n "$NODE_BUILD_MEMORY" ]; then export NODE_OPTIONS="--max-old-space-size=$NODE_BUILD_MEMORY"; fi; \
    npm run build

# ─── Runner ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output: server.js + minimal traced node_modules.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
