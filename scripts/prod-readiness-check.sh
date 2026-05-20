#!/usr/bin/env bash
# =============================================================================
# §39 — Production Readiness Checklist — 4nexa Mailgun Platform
# Verifica todos los requisitos de preparación para producción.
# Exit code 0 = listo para producción; exit code 1 = faltan requisitos.
#
# Uso:
#   API_BASE=http://127.0.0.1:3000  ADMIN_TOKEN=<jwt>  ./prod-readiness-check.sh
#
# Variables opcionales:
#   API_BASE         — URL base del control-plane (default: http://127.0.0.1:3000)
#   PROMETHEUS_BASE  — URL de Prometheus (default: http://127.0.0.1:9090)
#   GRAFANA_BASE     — URL de Grafana (default: http://127.0.0.1:3003)
#   ADMIN_TOKEN      — JWT de SUPER_ADMIN (para checks que requieren autenticación)
#   PROJECT_ROOT     — raíz del monorepo (default: directorio padre de scripts/)
# =============================================================================
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"
PROMETHEUS_BASE="${PROMETHEUS_BASE:-http://127.0.0.1:9090}"
GRAFANA_BASE="${GRAFANA_BASE:-http://127.0.0.1:3003}"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TIMEOUT=10

# ─── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass()  { echo -e "  ${GREEN}[✓]${NC} $1"; PASS=$((PASS + 1)); }
fail()  { echo -e "  ${RED}[✗]${NC} $1"; FAIL=$((FAIL + 1)); }
warn()  { echo -e "  ${YELLOW}[!]${NC} $1"; WARN=$((WARN + 1)); }
section() { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"; }

http_ok() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT}" "$1" 2>/dev/null || echo "000")
  [[ "${code}" == "200" ]]
}

file_exists() { [[ -f "${PROJECT_ROOT}/$1" ]]; }
dir_exists()  { [[ -d "${PROJECT_ROOT}/$1" ]]; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   §39 Production Readiness Checklist — 4nexa        ║"
echo "║   $(date -u +%Y-%m-%dT%H:%M:%SZ)                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# =============================================================================
# §39.1 — Infraestructura de código
# =============================================================================
section "§39.1 Código fuente e infraestructura"

file_exists "services/control-plane-api/package.json" && \
  pass "Control Plane API: package.json existe" || fail "Control Plane API: package.json no encontrado"

file_exists "apps/admin-panel/package.json" && \
  pass "Admin Panel: package.json existe" || fail "Admin Panel: package.json no encontrado"

file_exists "apps/customer-panel/package.json" && \
  pass "Customer Panel: package.json existe" || fail "Customer Panel: package.json no encontrado"

file_exists "docker-compose.prod.yml" && \
  pass "docker-compose.prod.yml existe" || fail "docker-compose.prod.yml no encontrado"

file_exists "docker-compose.monitoring.yml" && \
  pass "docker-compose.monitoring.yml existe" || fail "docker-compose.monitoring.yml no encontrado"

file_exists "deploy/nginx/4nexa.conf" && \
  pass "Configuración Nginx existe" || fail "deploy/nginx/4nexa.conf no encontrado"

# =============================================================================
# §39.2 — Variables de entorno
# =============================================================================
section "§39.2 Variables de entorno"

ENV_FILE="${PROJECT_ROOT}/services/control-plane-api/.env"
if [[ -f "${ENV_FILE}" ]]; then
  pass ".env encontrado"

  for var in DATABASE_URL REDIS_URL JWT_SECRET DKIM_ENCRYPTION_KEY NODE_AGENT_JWT_SECRET; do
    if grep -q "^${var}=" "${ENV_FILE}" 2>/dev/null; then
      pass "  ${var} definida"
    else
      fail "  ${var} NO definida en .env"
    fi
  done

  # Verificar que JWT_SECRET tiene suficiente entropía (>= 32 chars)
  jwt_val=$(grep "^JWT_SECRET=" "${ENV_FILE}" | cut -d= -f2- | tr -d '"' || echo '')
  if [[ ${#jwt_val} -ge 32 ]]; then
    pass "  JWT_SECRET tiene longitud suficiente (${#jwt_val} chars)"
  else
    fail "  JWT_SECRET muy corta (${#jwt_val} chars, mínimo 32)"
  fi

  # Verificar que no hay valores por defecto peligrosos
  if grep -qE "^(JWT_SECRET|DKIM_ENCRYPTION_KEY)=change[-_]?me" "${ENV_FILE}" 2>/dev/null; then
    fail "  Hay valores 'change-me' en variables críticas — CAMBIAR antes de prod"
  else
    pass "  No se detectaron valores por defecto peligrosos"
  fi
else
  warn ".env no encontrado (puede estar en variables de entorno del sistema)"
fi

# =============================================================================
# §39.3 — Base de datos
# =============================================================================
section "§39.3 Base de datos (Prisma + PostgreSQL)"

file_exists "services/control-plane-api/prisma/schema.prisma" && \
  pass "schema.prisma existe" || fail "schema.prisma no encontrado"

# Verificar que existen las migraciones clave
MIGRATIONS_DIR="${PROJECT_ROOT}/services/control-plane-api/prisma/migrations"
if dir_exists "services/control-plane-api/prisma/migrations"; then
  migration_count=$(ls -d "${MIGRATIONS_DIR}"/20* 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${migration_count}" -ge 1 ]]; then
    pass "Migraciones Prisma: ${migration_count} encontradas"
  else
    fail "No se encontraron migraciones en prisma/migrations/"
  fi
else
  fail "Directorio prisma/migrations no encontrado"
fi

# Verificar migración de migration_jobs (§15)
if ls "${MIGRATIONS_DIR}"/20260520000001_add_migration_jobs/migration.sql 2>/dev/null | head -1 | grep -q migration; then
  pass "Migración §15 (migration_jobs) presente"
else
  fail "Migración §15 (migration_jobs) NO encontrada"
fi

# =============================================================================
# §39.4 — Tests
# =============================================================================
section "§39.4 Suite de tests"

# Jest config puede estar en jest.config.{ts,js} o embebido en package.json
if file_exists "services/control-plane-api/jest.config.ts" || \
   file_exists "services/control-plane-api/jest.config.js" || \
   grep -q '"jest"' "${PROJECT_ROOT}/services/control-plane-api/package.json" 2>/dev/null; then
  pass "Configuración Jest presente (package.json o jest.config.*)"
else
  fail "No se encontró configuración Jest"
fi

# Contar archivos spec
spec_count=$(find "${PROJECT_ROOT}/services/control-plane-api/src" -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
if [[ "${spec_count}" -ge 15 ]]; then
  pass "Archivos spec.ts: ${spec_count} (≥15)"
else
  warn "Archivos spec.ts: ${spec_count} (recomendado ≥15)"
fi

# =============================================================================
# §39.5 — CI/CD
# =============================================================================
section "§39.5 CI/CD (GitHub Actions)"

file_exists ".github/workflows/ci.yml" && \
  pass "ci.yml existe" || fail ".github/workflows/ci.yml no encontrado"

file_exists ".github/workflows/deploy.yml" && \
  pass "deploy.yml existe" || fail ".github/workflows/deploy.yml no encontrado"

# Verificar que ci.yml incluye lint + test (soporta pnpm test y pnpm turbo run test)
if file_exists ".github/workflows/ci.yml"; then
  if grep -qE "(pnpm test|turbo run test|jest)" "${PROJECT_ROOT}/.github/workflows/ci.yml"; then
    pass "ci.yml ejecuta tests"
  else
    fail "ci.yml no ejecuta tests"
  fi
fi

# =============================================================================
# §39.6 — Dockerfiles
# =============================================================================
section "§39.6 Dockerfiles"

for service in "services/control-plane-api" "apps/admin-panel" "apps/customer-panel"; do
  if file_exists "${service}/Dockerfile"; then
    pass "${service}/Dockerfile existe"
  else
    fail "${service}/Dockerfile no encontrado"
  fi
done

# Verificar que los Dockerfiles no usan latest tag
for df in "${PROJECT_ROOT}/services/control-plane-api/Dockerfile" \
           "${PROJECT_ROOT}/apps/admin-panel/Dockerfile" \
           "${PROJECT_ROOT}/apps/customer-panel/Dockerfile"; do
  if [[ -f "${df}" ]]; then
    if grep -qE "^FROM .*:latest" "${df}" 2>/dev/null; then
      warn "  $(basename $(dirname ${df}))/Dockerfile usa :latest — usar versión específica"
    else
      pass "  $(basename $(dirname ${df}))/Dockerfile no usa :latest"
    fi
  fi
done

# =============================================================================
# §39.7 — Observabilidad
# =============================================================================
section "§39.7 Observabilidad"

file_exists "deploy/prometheus/prometheus.yml" && \
  pass "prometheus.yml existe" || fail "deploy/prometheus/prometheus.yml no encontrado"

file_exists "deploy/prometheus/alerts/4nexa.yml" && \
  pass "Alertas Prometheus existen" || fail "deploy/prometheus/alerts/4nexa.yml no encontrado"

file_exists "deploy/grafana/provisioning/datasources/prometheus.yml" && \
  pass "Grafana datasource provisionado" || fail "Grafana datasource no encontrado"

file_exists "deploy/grafana/dashboards/overview.json" && \
  pass "Grafana dashboard overview existe" || fail "Grafana dashboard overview no encontrado"

# Check API metrics endpoint
if http_ok "${API_BASE}/metrics"; then
  pass "GET /metrics → 200"
else
  warn "GET /metrics no responde (¿está la API corriendo?)"
fi

# Check Prometheus
if http_ok "${PROMETHEUS_BASE}/-/healthy"; then
  pass "Prometheus → healthy"
else
  warn "Prometheus no responde en ${PROMETHEUS_BASE}"
fi

# Check Grafana
if http_ok "${GRAFANA_BASE}/api/health"; then
  pass "Grafana → healthy"
else
  warn "Grafana no responde en ${GRAFANA_BASE}"
fi

# =============================================================================
# §39.8 — Seguridad
# =============================================================================
section "§39.8 Seguridad"

file_exists "deploy/nginx/4nexa.conf" && {
  # Verificar TLS
  if grep -q "ssl_certificate" "${PROJECT_ROOT}/deploy/nginx/4nexa.conf"; then
    pass "Nginx tiene configuración TLS"
  else
    fail "Nginx NO tiene configuración TLS"
  fi

  # Verificar HSTS
  if grep -q "Strict-Transport-Security" "${PROJECT_ROOT}/deploy/nginx/4nexa.conf"; then
    pass "Nginx tiene HSTS configurado"
  else
    warn "Nginx no tiene HSTS — recomendado para producción"
  fi

  # Verificar que no se expone métricas al exterior sin auth
  if grep -q "auth_basic" "${PROJECT_ROOT}/deploy/nginx/4nexa.conf"; then
    pass "Endpoint de métricas protegido con auth básica"
  else
    warn "Endpoint de métricas sin auth básica — revisar exposición"
  fi
}

# Verificar que el schema Prisma tiene campos sensibles como encrypted
if grep -q "Encrypted\|encrypted" "${PROJECT_ROOT}/services/control-plane-api/prisma/schema.prisma"; then
  pass "Schema Prisma usa campos cifrados para datos sensibles"
else
  warn "Schema Prisma — verificar que contraseñas/claves no se guardan en texto plano"
fi

# =============================================================================
# §39.9 — Runbooks y documentación
# =============================================================================
section "§39.9 Runbooks y documentación"

for runbook in "scripts/runbooks/spam-outbreak.sh" \
               "scripts/runbooks/pg-corruption.sh" \
               "scripts/runbooks/compromised-mailbox.sh" \
               "scripts/runbooks/node-failure.sh"; do
  if file_exists "${runbook}"; then
    pass "${runbook} existe"
  else
    fail "${runbook} no encontrado"
  fi
done

file_exists "scripts/smoke-test.sh" && \
  pass "scripts/smoke-test.sh existe" || fail "scripts/smoke-test.sh no encontrado"

file_exists "docs/diagrams/architecture.md" && \
  pass "Diagramas de arquitectura existen" || fail "docs/diagrams/architecture.md no encontrado"

file_exists "scripts/bootstrap.sh" && \
  pass "scripts/bootstrap.sh existe" || fail "scripts/bootstrap.sh no encontrado"

# =============================================================================
# §39.10 — API Health check en vivo
# =============================================================================
section "§39.10 API Health Check"

if http_ok "${API_BASE}/health"; then
  pass "Control Plane API: GET /health → 200"
  health_body=$(curl -sf --max-time "${TIMEOUT}" "${API_BASE}/health" || echo '{}')
  if echo "${health_body}" | grep -q '"status"'; then
    pass "  Health response contiene campo 'status'"
  fi
else
  warn "Control Plane API no responde en ${API_BASE} (¿está corriendo?)"
fi

# =============================================================================
# Resumen final
# =============================================================================
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
TOTAL=$((PASS + FAIL + WARN))
echo -e " Production Readiness — ${TOTAL} checks ejecutados"
echo -e " ${GREEN}✓ PASS: ${PASS}${NC}  |  ${RED}✗ FAIL: ${FAIL}${NC}  |  ${YELLOW}! WARN: ${WARN}${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"

if [[ "${FAIL}" -eq 0 && "${WARN}" -eq 0 ]]; then
  echo -e "\n${GREEN}${BOLD}✅  SISTEMA LISTO PARA PRODUCCIÓN${NC}\n"
  exit 0
elif [[ "${FAIL}" -eq 0 ]]; then
  echo -e "\n${YELLOW}${BOLD}⚠️  LISTO CON ADVERTENCIAS — revisar los [!] antes de desplegar${NC}\n"
  exit 0
else
  echo -e "\n${RED}${BOLD}❌  NO LISTO — resolver los [✗] antes de desplegar a producción${NC}\n"
  exit 1
fi
