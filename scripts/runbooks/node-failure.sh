#!/usr/bin/env bash
# =============================================================================
# §35 RUNBOOK — Mail Node Failure Recovery
# Drena el nodo fallido, reasigna los tenants afectados a nodos disponibles
# y verifica la integridad de las colas antes de restaurar el servicio.
#
# Uso:
#   FAILED_NODE_ID=<uuid>  ADMIN_TOKEN=<jwt>  ./node-failure.sh
#
# Variables de entorno:
#   FAILED_NODE_ID   — ID del nodo fallido (obligatorio)
#   TARGET_NODE_ID   — ID del nodo receptor (si vacío, el sistema elige)
#   ADMIN_TOKEN      — JWT de SUPER_ADMIN (obligatorio)
#   API_BASE         — base URL del control-plane (default: http://127.0.0.1:3000)
#   DRY_RUN          — si "true", no ejecuta cambios
# =============================================================================
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"
DRY_RUN="${DRY_RUN:-false}"

# ─── Validaciones ──────────────────────────────────────────────────────────────
if [[ -z "${FAILED_NODE_ID:-}" ]]; then
  echo "[ERROR] FAILED_NODE_ID es obligatorio" >&2
  exit 1
fi
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "[ERROR] ADMIN_TOKEN es obligatorio" >&2
  exit 1
fi

echo "══════════════════════════════════════════════════════"
echo " RUNBOOK: Mail Node Failure Recovery"
echo " Failed Node: ${FAILED_NODE_ID}"
echo " Target Node: ${TARGET_NODE_ID:-auto}"
echo " DRY_RUN: ${DRY_RUN}"
echo " Iniciado: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "══════════════════════════════════════════════════════"

api_call() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY_RUN] ${method} ${API_BASE}${path} ${data}"
    echo '{}'
    return 0
  fi

  if [[ -n "${data}" ]]; then
    curl -sf --max-time 20 \
      -X "${method}" "${API_BASE}${path}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -d "${data}" || echo '[WARN]'
  else
    curl -sf --max-time 20 \
      -X "${method}" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" || echo '[WARN]'
  fi
}

# ─── Paso 1: Verificar estado actual del nodo ─────────────────────────────────
echo ""
echo "▶ Paso 1/6 — Verificar estado del nodo fallido"
node_info=$(api_call GET "/nodes/${FAILED_NODE_ID}")
node_status=$(echo "${node_info}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo 'UNKNOWN')
node_hostname=$(echo "${node_info}" | grep -o '"hostname":"[^"]*"' | cut -d'"' -f4 || echo 'UNKNOWN')
echo "[INFO] Hostname: ${node_hostname} | Status actual: ${node_status}"

tenants_in_node=$(api_call GET "/tenants?nodeId=${FAILED_NODE_ID}&limit=100")
tenant_count=$(echo "${tenants_in_node}" | grep -o '"id"' | wc -l | tr -d ' ')
echo "[INFO] Tenants afectados: ${tenant_count}"
echo "[OK] Paso 1 completado"

# ─── Paso 2: Marcar nodo como DRAINING ────────────────────────────────────────
echo ""
echo "▶ Paso 2/6 — Iniciar drenaje del nodo"
api_call PATCH "/nodes/${FAILED_NODE_ID}" \
  '{"status":"DRAINING","reason":"node_failure_runbook — automatic drain initiated"}'
echo "[OK] Nodo marcado como DRAINING"

# ─── Paso 3: Esperar vaciado de colas (máx 5 min) ─────────────────────────────
echo ""
echo "▶ Paso 3/6 — Esperar vaciado de colas de envío"
MAX_WAIT=300
WAITED=0
QUEUE_EMPTY=false

while [[ ${WAITED} -lt ${MAX_WAIT} ]]; do
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY_RUN] Asumiendo colas vacías"
    QUEUE_EMPTY=true
    break
  fi

  queue_stats=$(curl -sf --max-time 10 \
    "${API_BASE}/queue/stats" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" 2>/dev/null || echo '{}')

  # Verificar jobs activos/en espera para este nodo
  waiting=$(echo "${queue_stats}" | grep -o '"waiting":[0-9]*' | cut -d: -f2 || echo '0')
  active=$(echo "${queue_stats}" | grep -o '"active":[0-9]*' | cut -d: -f2 || echo '0')

  echo "[INFO] Colas — waiting: ${waiting}, active: ${active} (${WAITED}s/${MAX_WAIT}s)"

  if [[ "${waiting:-0}" -eq 0 && "${active:-0}" -eq 0 ]]; then
    QUEUE_EMPTY=true
    break
  fi

  sleep 10
  WAITED=$((WAITED + 10))
done

if [[ "${QUEUE_EMPTY}" == "true" ]]; then
  echo "[OK] Colas vacías"
else
  echo "[WARN] Colas no vaciadas en ${MAX_WAIT}s — continuando igualmente"
fi

# ─── Paso 4: Reasignar tenants a otro nodo ───────────────────────────────────
echo ""
echo "▶ Paso 4/6 — Reasignar tenants"

if [[ -n "${TARGET_NODE_ID:-}" ]]; then
  echo "[INFO] Reasignando a nodo destino: ${TARGET_NODE_ID}"
  api_call POST "/nodes/${FAILED_NODE_ID}/drain" \
    "{\"reason\":\"node_failure\",\"targetNodeId\":\"${TARGET_NODE_ID}\",\"migrateTenantsNow\":true}"
else
  echo "[INFO] Sin nodo destino explícito — el sistema asignará automáticamente"
  api_call POST "/nodes/${FAILED_NODE_ID}/drain" \
    '{"reason":"node_failure","migrateTenantsNow":true}'
fi
echo "[OK] Reasignación iniciada"

# ─── Paso 5: Poner nodo en QUARANTINE ────────────────────────────────────────
echo ""
echo "▶ Paso 5/6 — Poner nodo en cuarentena"
api_call PATCH "/nodes/${FAILED_NODE_ID}" \
  "{\"status\":\"QUARANTINE\",\"reason\":\"node_failure — quarantined by runbook on $(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
echo "[OK] Nodo en cuarentena"

# ─── Paso 6: Verificar integridad de asignaciones ────────────────────────────
echo ""
echo "▶ Paso 6/6 — Verificar reasignaciones"
remaining=$(api_call GET "/tenants?nodeId=${FAILED_NODE_ID}&status=ACTIVE&limit=10")
remaining_count=$(echo "${remaining}" | grep -o '"id"' | wc -l | tr -d ' ')

if [[ "${remaining_count:-0}" -eq 0 ]]; then
  echo "[OK] Todos los tenants reasignados"
else
  echo "[WARN] ${remaining_count} tenants aún en el nodo fallido — revisar manualmente"
fi

# Registrar en auditoría
api_call POST "/audit/events" \
  "{\"action\":\"runbook.node_failure\",\"resourceType\":\"Node\",\"resourceId\":\"${FAILED_NODE_ID}\",\"metadata\":{\"hostname\":\"${node_hostname}\",\"affectedTenants\":${tenant_count},\"targetNode\":\"${TARGET_NODE_ID:-auto}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"

echo ""
echo "══════════════════════════════════════════════════════"
echo " RUNBOOK COMPLETADO — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo " ACCIONES SIGUIENTES:"
echo "   1. Diagnosticar causa del fallo en el nodo:"
echo "      ssh ${node_hostname} 'journalctl -xe --since \"1 hour ago\"'"
echo "   2. Verificar disco: ssh ${node_hostname} 'df -h'"
echo "   3. Verificar Postfix/Dovecot: ssh ${node_hostname} 'systemctl status postfix dovecot'"
echo "   4. Tras reparar, reactivar nodo:"
echo "      PATCH /nodes/${FAILED_NODE_ID} status=ACTIVE"
echo "   5. Reasignar tenants de vuelta si es necesario"
echo "══════════════════════════════════════════════════════"
