#!/usr/bin/env bash
# =============================================================================
# §30 — Smoke & Synthetic Tests — 4nexa Mailgun Platform
# Verifica la disponibilidad de todos los servicios críticos en producción.
# Exit code 0 = todo OK; exit code 1 = al menos un check falló.
# =============================================================================
set -euo pipefail

# ─── Configuración ─────────────────────────────────────────────────────────────
API_BASE="${API_BASE:-http://127.0.0.1:3000}"
PROMETHEUS_BASE="${PROMETHEUS_BASE:-http://127.0.0.1:9090}"
GRAFANA_BASE="${GRAFANA_BASE:-http://127.0.0.1:3003}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASS="${REDIS_PASS:-}"
TIMEOUT_SEC=10

# ─── Colores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

# ─── Helpers ───────────────────────────────────────────────────────────────────
pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

http_get() {
  # Devuelve el código HTTP de una petición GET
  curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT_SEC}" "$1" || echo "000"
}

# =============================================================================
# 1. API — Health Check
# =============================================================================
info "=== 1. Control-Plane API Health ==="

status=$(http_get "${API_BASE}/health")
if [[ "${status}" == "200" ]]; then
  pass "GET /health → 200"
else
  fail "GET /health → ${status} (esperado 200)"
fi

# Verificar que el JSON de salud contiene status:ok
body=$(curl -s --max-time "${TIMEOUT_SEC}" "${API_BASE}/health" || echo '{}')
if echo "${body}" | grep -q '"status"'; then
  pass "GET /health contiene campo 'status'"
else
  fail "GET /health — cuerpo inesperado: ${body}"
fi

# =============================================================================
# 2. API — Endpoint de métricas Prometheus
# =============================================================================
info "=== 2. Endpoint de métricas ==="

status=$(http_get "${API_BASE}/metrics")
if [[ "${status}" == "200" ]]; then
  pass "GET /metrics → 200"
else
  fail "GET /metrics → ${status} (esperado 200)"
fi

metrics_body=$(curl -s --max-time "${TIMEOUT_SEC}" "${API_BASE}/metrics" || echo '')
if echo "${metrics_body}" | grep -q 'nodejs_heap_size'; then
  pass "GET /metrics contiene métricas Node.js"
else
  fail "GET /metrics — no se encontraron métricas nodejs_heap_size"
fi

# =============================================================================
# 3. Redis — PING
# =============================================================================
info "=== 3. Redis Connectivity ==="

if command -v redis-cli &>/dev/null; then
  if [[ -n "${REDIS_PASS}" ]]; then
    pong=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASS}" PING 2>/dev/null || echo 'ERROR')
  else
    pong=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" PING 2>/dev/null || echo 'ERROR')
  fi

  if [[ "${pong}" == "PONG" ]]; then
    pass "Redis PING → PONG"
  else
    fail "Redis PING → ${pong} (esperado PONG)"
  fi
else
  info "redis-cli no disponible; omitiendo test directo de Redis"
fi

# Verificar colas BullMQ via API
queue_status=$(http_get "${API_BASE}/queue/stats")
if [[ "${queue_status}" == "200" ]]; then
  pass "GET /queue/stats → 200 (Redis + BullMQ operativos)"
else
  fail "GET /queue/stats → ${queue_status} (BullMQ no responde)"
fi

# =============================================================================
# 4. Prometheus — Self-health
# =============================================================================
info "=== 4. Prometheus ==="

status=$(http_get "${PROMETHEUS_BASE}/-/healthy")
if [[ "${status}" == "200" ]]; then
  pass "Prometheus GET /-/healthy → 200"
else
  fail "Prometheus GET /-/healthy → ${status}"
fi

# Verificar que Prometheus recibe métricas de la API
prom_targets=$(curl -s --max-time "${TIMEOUT_SEC}" \
  "${PROMETHEUS_BASE}/api/v1/targets" || echo '{}')

if echo "${prom_targets}" | grep -q '"health":"up"'; then
  pass "Prometheus tiene al menos un target 'up'"
else
  fail "Prometheus — ningún target 'up' encontrado"
fi

# =============================================================================
# 5. Grafana — Health
# =============================================================================
info "=== 5. Grafana ==="

status=$(http_get "${GRAFANA_BASE}/api/health")
if [[ "${status}" == "200" ]]; then
  pass "Grafana GET /api/health → 200"
else
  fail "Grafana GET /api/health → ${status}"
fi

# =============================================================================
# 6. Synthetic: Crear y eliminar un plan de prueba (requiere token admin)
# =============================================================================
info "=== 6. Synthetic — CRUD Plans ==="

if [[ -z "${SMOKE_ADMIN_TOKEN:-}" ]]; then
  info "SMOKE_ADMIN_TOKEN no definido; omitiendo synthetic CRUD test"
else
  # Crear plan sintético
  create_resp=$(curl -s --max-time "${TIMEOUT_SEC}" \
    -X POST "${API_BASE}/plans" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SMOKE_ADMIN_TOKEN}" \
    -d '{"name":"__smoke_test__","maxDomains":1,"maxMailboxes":1,"maxAliases":1,"priceMonthly":0}' \
    || echo '{}')

  plan_id=$(echo "${create_resp}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ -n "${plan_id}" ]]; then
    pass "Synthetic: plan creado con id=${plan_id}"

    # Eliminar plan sintético
    del_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT_SEC}" \
      -X DELETE "${API_BASE}/plans/${plan_id}" \
      -H "Authorization: Bearer ${SMOKE_ADMIN_TOKEN}" || echo '000')

    if [[ "${del_status}" == "200" || "${del_status}" == "204" ]]; then
      pass "Synthetic: plan eliminado (${del_status})"
    else
      fail "Synthetic: DELETE /plans/${plan_id} → ${del_status}"
    fi
  else
    fail "Synthetic: no se pudo crear plan — respuesta: ${create_resp}"
  fi
fi

# =============================================================================
# 7. Synthetic: Verificar reputación de nodos vía métricas
# =============================================================================
info "=== 7. Synthetic — Métricas de reputación de nodos ==="

rep_query=$(curl -s --max-time "${TIMEOUT_SEC}" \
  "${PROMETHEUS_BASE}/api/v1/query?query=4nexa_mailgun_node_reputation_score" || echo '{}')

if echo "${rep_query}" | grep -q '"result"'; then
  rep_count=$(echo "${rep_query}" | grep -o '"__name__"' | wc -l | tr -d ' ')
  pass "Prometheus reporta métricas de reputación (${rep_count} series)"
else
  fail "No se encontraron métricas 4nexa_mailgun_node_reputation_score en Prometheus"
fi

# =============================================================================
# Resumen
# =============================================================================
echo ""
echo "══════════════════════════════════════════"
echo -e " SMOKE TEST RESULTS: ${GREEN}${PASS} PASS${NC} / ${RED}${FAIL} FAIL${NC}"
echo "══════════════════════════════════════════"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0
