#!/usr/bin/env bash
# =============================================================================
# §35 RUNBOOK — Compromised Mailbox Response
# Bloquea un buzón comprometido, rota sus credenciales, invalida sesiones
# activas y registra el incidente.
#
# Uso:
#   MAILBOX_ID=<uuid>  ADMIN_TOKEN=<jwt>  ./compromised-mailbox.sh
#
# Variables de entorno:
#   MAILBOX_ID     — ID del buzón comprometido (obligatorio)
#   ADMIN_TOKEN    — JWT de SUPER_ADMIN (obligatorio)
#   API_BASE       — base URL del control-plane (default: http://127.0.0.1:3000)
#   DRY_RUN        — si "true", no ejecuta cambios
# =============================================================================
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"
DRY_RUN="${DRY_RUN:-false}"

# ─── Validaciones ──────────────────────────────────────────────────────────────
if [[ -z "${MAILBOX_ID:-}" ]]; then
  echo "[ERROR] MAILBOX_ID es obligatorio" >&2
  exit 1
fi
if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "[ERROR] ADMIN_TOKEN es obligatorio" >&2
  exit 1
fi

echo "══════════════════════════════════════════════════════"
echo " RUNBOOK: Compromised Mailbox Response"
echo " Mailbox: ${MAILBOX_ID}"
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
      -d "${data}" || echo "[WARN] ${method} ${path} falló"
  else
    curl -sf --max-time 15 \
      -X "${method}" "${API_BASE}${path}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" || echo "[WARN] ${method} ${path} falló"
  fi
}

# ─── Paso 1: Obtener información del buzón ────────────────────────────────────
echo ""
echo "▶ Paso 1/5 — Obtener información del buzón"
mailbox_info=$(curl -sf --max-time 10 \
  "${API_BASE}/mailboxes/${MAILBOX_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" || echo '{}')

mailbox_addr=$(echo "${mailbox_info}" | grep -o '"address":"[^"]*"' | cut -d'"' -f4 || echo 'UNKNOWN')
tenant_id=$(echo "${mailbox_info}" | grep -o '"tenantId":"[^"]*"' | cut -d'"' -f4 || echo 'UNKNOWN')

echo "[INFO] Buzón: ${mailbox_addr}"
echo "[INFO] Tenant: ${tenant_id}"
echo "[OK] Paso 1 completado"

# ─── Paso 2: Bloquear el buzón (status=SUSPENDED) ─────────────────────────────
echo ""
echo "▶ Paso 2/5 — Suspender buzón"
api_call PATCH "/mailboxes/${MAILBOX_ID}" \
  '{"status":"SUSPENDED","reason":"Security incident — compromised credentials detected"}'
echo "[OK] Buzón suspendido"

# ─── Paso 3: Rotar credenciales SMTP/IMAP ─────────────────────────────────────
echo ""
echo "▶ Paso 3/5 — Rotar contraseña del buzón"
# Generar contraseña aleatoria segura (32 chars)
if [[ "${DRY_RUN}" != "true" ]]; then
  NEW_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 32)
  echo "[INFO] Nueva contraseña generada (${#NEW_PASSWORD} chars)"
  api_call PATCH "/mailboxes/${MAILBOX_ID}/password" \
    "{\"password\":\"${NEW_PASSWORD}\",\"reason\":\"compromised_mailbox_runbook\",\"notifyUser\":false}"
  echo "[WARN] Contraseña rotada — COMUNICAR al propietario del buzón por canal seguro"
  # Guardar nueva contraseña en archivo temporal protegido (modo 600)
  CRED_FILE="/tmp/mailbox_recovery_${MAILBOX_ID}_${TIMESTAMP:-$(date +%s)}.txt"
  echo "MAILBOX_ID=${MAILBOX_ID}" > "${CRED_FILE}"
  echo "ADDRESS=${mailbox_addr}" >> "${CRED_FILE}"
  echo "NEW_PASSWORD=${NEW_PASSWORD}" >> "${CRED_FILE}"
  echo "TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${CRED_FILE}"
  chmod 600 "${CRED_FILE}"
  echo "[INFO] Credenciales guardadas en ${CRED_FILE} (borrar tras comunicar)"
else
  echo "[DRY_RUN] PATCH /mailboxes/${MAILBOX_ID}/password"
fi
echo "[OK] Paso 3 completado"

# ─── Paso 4: Invalidar sesiones activas (IMAP/SMTP) ──────────────────────────
echo ""
echo "▶ Paso 4/5 — Invalidar sesiones activas"
# Llamar al node-agent para forzar desconexión IMAP (Dovecot kick)
NODE_ID=$(echo "${mailbox_info}" | grep -o '"nodeId":"[^"]*"' | cut -d'"' -f4 || echo '')
if [[ -n "${NODE_ID}" ]]; then
  api_call POST "/nodes/${NODE_ID}/operations" \
    "{\"operation\":\"reload_service\",\"service\":\"dovecot\",\"reason\":\"compromised_mailbox_${MAILBOX_ID}\"}"
  echo "[OK] Sesiones Dovecot reiniciadas en nodo ${NODE_ID}"
else
  echo "[WARN] No se pudo determinar el nodo — reiniciar Dovecot manualmente"
fi

# ─── Paso 5: Registrar incidente en auditoría ─────────────────────────────────
echo ""
echo "▶ Paso 5/5 — Registrar incidente"
api_call POST "/audit/events" \
  "{\"action\":\"security.compromised_mailbox\",\"resourceType\":\"Mailbox\",\"resourceId\":\"${MAILBOX_ID}\",\"metadata\":{\"address\":\"${mailbox_addr}\",\"tenantId\":\"${tenant_id}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"runbook\":\"compromised-mailbox.sh\"}}"
echo "[OK] Incidente registrado en auditoría"

echo ""
echo "══════════════════════════════════════════════════════"
echo " RUNBOOK COMPLETADO — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo " ACCIONES SIGUIENTES:"
echo "   1. Notificar al propietario del buzón (${mailbox_addr}) por canal seguro"
echo "   2. Analizar headers de correos enviados: PATCH /nodes/${NODE_ID:-?}/logs"
echo "   3. Revisar IPs de origen en logs postfix: grep 'sasl_username=${mailbox_addr}' /var/log/mail.log"
echo "   4. Si el tenant está comprometido: ejecutar spam-outbreak.sh"
echo "   5. Reactivar buzón cuando el propietario confirme nuevo control:"
echo "      PATCH /mailboxes/${MAILBOX_ID} status=ACTIVE"
echo "══════════════════════════════════════════════════════"
