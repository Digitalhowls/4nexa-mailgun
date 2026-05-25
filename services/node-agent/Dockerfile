# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Manifests del monorepo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json    ./packages/types/
COPY packages/logger/package.json   ./packages/logger/
COPY services/node-agent/package.json ./services/node-agent/

RUN pnpm install --frozen-lockfile --filter @4nexa/node-agent... --prod=false

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/node-agent/ ./services/node-agent/

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/types/node_modules  ./packages/types/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/services/node-agent/node_modules ./services/node-agent/node_modules

# Build shared packages
RUN pnpm --filter @4nexa/types build
RUN pnpm --filter @4nexa/logger build

# Build node-agent
RUN pnpm --filter @4nexa/node-agent build

ARG BUILD_SHA=unknown
RUN echo "BUILD_SHA=${BUILD_SHA}" > /app/services/node-agent/.build-info

# ─── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# dumb-init para señales correctas + herramientas mínimas de diagnóstico
RUN apk add --no-cache dumb-init

# Usuario sin privilegios (el agente no necesita root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
ENV AGENT_PORT=3099
ENV AGENT_HOST=0.0.0.0
# AGENT_MODE debe sobreescribirse en el compose/k8s: 'docker' o 'native'
ENV AGENT_MODE=native

COPY --from=builder --chown=appuser:appgroup /app/services/node-agent/dist       ./dist
COPY --from=builder --chown=appuser:appgroup /app/services/node-agent/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=appuser:appgroup /app/services/node-agent/.build-info ./.build-info

USER appuser

EXPOSE 3099

# El endpoint /agent/health está implementado en health.controller.ts
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3099/agent/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main"]
