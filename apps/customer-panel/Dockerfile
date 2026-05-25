# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY apps/customer-panel/package.json ./apps/customer-panel/

RUN pnpm install --frozen-lockfile --filter @4nexa/customer-panel... --prod=false

# ─── Stage 2: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/customer-panel/ ./apps/customer-panel/

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/validators/node_modules ./packages/validators/node_modules
COPY --from=deps /app/apps/customer-panel/node_modules ./apps/customer-panel/node_modules

RUN pnpm --filter @4nexa/types build
RUN pnpm --filter @4nexa/validators build

ARG NEXT_PUBLIC_API_URL
ARG BUILD_SHA=unknown

WORKDIR /app/apps/customer-panel
RUN NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} pnpm build

# ─── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache dumb-init
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder --chown=appuser:appgroup /app/apps/customer-panel/public ./public
COPY --from=builder --chown=appuser:appgroup /app/apps/customer-panel/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/apps/customer-panel/.next/static ./apps/customer-panel/.next/static

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001 || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/customer-panel/server.js"]
