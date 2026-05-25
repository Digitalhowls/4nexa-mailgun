# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Instalar pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copiar manifests del monorepo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/validators/package.json ./packages/validators/
COPY packages/config-engine/package.json ./packages/config-engine/
COPY packages/logger/package.json ./packages/logger/
COPY services/control-plane-api/package.json ./services/control-plane-api/

RUN pnpm install --frozen-lockfile --filter @4nexa/control-plane-api... --prod=false

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/control-plane-api/ ./services/control-plane-api/

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/validators/node_modules ./packages/validators/node_modules
COPY --from=deps /app/packages/config-engine/node_modules ./packages/config-engine/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/services/control-plane-api/node_modules ./services/control-plane-api/node_modules

# Build shared packages
RUN pnpm --filter @4nexa/types build
RUN pnpm --filter @4nexa/validators build
RUN pnpm --filter @4nexa/logger build

# Generate Prisma client
RUN pnpm --filter @4nexa/control-plane-api db:generate

# Build API
RUN pnpm --filter @4nexa/control-plane-api build

ARG BUILD_SHA=unknown
RUN echo "BUILD_SHA=${BUILD_SHA}" > /app/services/control-plane-api/.build-info

# ─── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Instalar dependencias de sistema mínimas
RUN apk add --no-cache dumb-init

# Usuario sin privilegios
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
ENV PORT=3000

# Copiar solo lo necesario para producción
COPY --from=builder --chown=appuser:appgroup /app/services/control-plane-api/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/services/control-plane-api/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/services/control-plane-api/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/services/control-plane-api/.build-info ./.build-info

# Prisma client generado
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.pnpm ./node_modules/.pnpm 2>/dev/null || true

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
