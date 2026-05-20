#!/usr/bin/env bash
# =============================================================================
# §35 RUNBOOK — Spam Outbreak Response
# Detecta un brote de spam, throttlea el nodo afectado, suspende el tenant
# problemático y purga las colas de envío.
#
# Uso:
#   SPAM_NODE_ID=<uuid>  SPAM_TENANT_ID=<uuid>  ADMIN_TOKEN=<jwt>  ./spam-outbreak.sh
#
# Variables de entorno:
#   SPAM_NODE_ID    — ID del nodo de correo afectado (obligatorio)
#   SPAM_TENANT_ID  — ID del tenant spammer (opcional; si no se da, solo throttle)
#   ADMIN_TOKEN     — JWT de SUPER_ADMIN para las llamadas API
#   API_BASE        — base URL del control-plane (default: http://127.0.0.1:3000)
#   DRY_RUN         — si "true", solo muestra las acciones sin ejecutarlas
# =============================================================================
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"
DRY_RUN="${DRY_RUN:-false}"

# ─── Validaciones ──────────────────────────────────────────────────────────────
if [[ -z "${SPAM_NODE_ID:-}" ]]; then
  echo "[ERROR] SPAM_NODE_ID es obligatorio" >&2
  exit 1
fi
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "[ERROR] ADMIN_TOKEN es obligatorio" >&2
  exit 1
fi

echo "══════════════════════════════════════════════════════"
echo " RUNBOOK: Spam Outbreak Response"
echo " Node: ${SPAM_NODE_ID}"
echo " Tenant: ${SPAM_TENANT_ID:-N/A}"
echo " DRY_RUN: ${DRY_RUN}"
echo " Iniciado: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "══════════════════════════════════════════════════════"

api_call() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY_RUN] ${method} ${API_BASE}${path} ${data}"
    return 0
  fi

  if [[ -n "${data}" ]]; then
    curl -sf --max-time 15 \
      -X "${method}" "${API_BASE}${path}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -d "${data}" || { echo "[WARN] ${method} ${path} falló (continuando)"; }
  else
    curl -sf --max-time 15 \
      -X "${method}" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" || { echo "[WARN] ${method} ${path} falló (continuando)"; }
  fi
}

# ─── Paso 1: Throttle del nodo afectado ───────────────────────────────────────
echo ""
echo "▶ Paso 1/4 — Throttle nodo ${SPAM_NODE_ID} (reducir tasa de envío a 10%)"
api_call PATCH "/nodes/${SPAM_NODE_ID}" \
  '{"status":"THROTTLED","maxEmailsPerHour":100,"notes":"Throttleado automáticamente por detección de spam outbreak"}'
echo "[OK] Throttle aplicado"

# ─── Paso 2: Suspender tenant problemático ───────────────────────────────────
if [[ -n "${SPAM_TENANT_ID:-}" ]]; then
  echo ""
  echo "▶ Paso 2/4 — Suspender tenant ${SPAM_TENANT_ID}"
  api_call PATCH "/tenants/${SPAM_TENANT_ID}" \
    '{"status":"SUSPENDED","reason":"Spam outbreak detected — suspended by runbook"}'
  echo "[OK] Tenant suspendido"
else
  echo ""
  echo "▶ Paso 2/4 — Omitido (SPAM_TENANT_ID no definido)"
fi

# ─── Paso 3: Vaciar colas de envío del nodo ──────────────────────────────────
echo ""
echo "▶ Paso 3/4 — Purgar cola de envío del nodo"
api_call POST "/nodes/${SPAM_NODE_ID}/drain" \
  '{"reason":"spam_outbreak","purgeQueues":true}'
echo "[OK] Colas purgadas"

# ─── Paso 4: Registrar evento de auditoría ────────────────────────────────────
echo ""
echo "▶ Paso 4/4 — Registrar en auditoría"
api_call POST "/audit/events" \
  "{\"action\":\"runbook.spam_outbreak\",\"resourceType\":\"Node\",\"resourceId\":\"${SPAM_NODE_ID}\",\"metadata\":{\"tenantId\":\"${SPAM_TENANT_ID:-}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"
echo "[OK] Evento auditado"

echo ""
echo "══════════════════════════════════════════════════════"
echo " RUNBOOK COMPLETADO — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo " ACCIONES SIGUIENTES:"
echo "   1. Revisar logs del nodo: journalctl -u postfix --since '1 hour ago'"
echo "   2. Analizar cabeceras de correos spam con 'rspamc learn_spam <file>'"
echo "   3. Actualizar reglas rspamd si es nuevo patrón"
echo "   4. Reactivar nodo una vez limpio: PATCH /nodes/${SPAM_NODE_ID} status=ACTIVE"
echo "══════════════════════════════════════════════════════"
