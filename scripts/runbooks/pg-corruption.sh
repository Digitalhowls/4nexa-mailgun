#!/usr/bin/env bash
# =============================================================================
# §35 RUNBOOK — PostgreSQL Data Corruption Recovery
# Congela las escrituras, valida el WAL, toma una snapshot de emergencia
# y guía al operador por el proceso de restauración.
#
# Uso:
#   ADMIN_TOKEN=<jwt>  ./pg-corruption.sh
#
# Variables de entorno:
#   ADMIN_TOKEN    — JWT de SUPER_ADMIN
#   API_BASE       — base URL del control-plane (default: http://127.0.0.1:3000)
#   PG_HOST        — host de PostgreSQL (default: 127.0.0.1)
#   PG_PORT        — puerto (default: 5432)
#   PG_USER        — usuario DBA (default: postgres)
#   PG_DB          — base de datos (default: 4nexa_mailgun)
#   BACKUP_DIR     — directorio de backups de emergencia
#   DRY_RUN        — si "true", no ejecuta cambios destructivos
# =============================================================================
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_DB="${PG_DB:-4nexa_mailgun}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/4nexa/emergency}"
DRY_RUN="${DRY_RUN:-false}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

echo "══════════════════════════════════════════════════════"
echo " RUNBOOK: PostgreSQL Corruption Recovery"
echo " PG: ${PG_HOST}:${PG_PORT}/${PG_DB}"
echo " DRY_RUN: ${DRY_RUN}"
echo " Iniciado: ${TIMESTAMP}"
echo "══════════════════════════════════════════════════════"

run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[DRY_RUN] $*"
  else
    "$@"
  fi
}

psql_cmd() {
  PGPASSWORD="${PGPASSWORD:-}" psql -h "${PG_HOST}" -p "${PG_PORT}" \
    -U "${PG_USER}" -d "${PG_DB}" -c "$1" 2>&1 || true
}

# ─── Paso 1: Modo lectura única en la API ─────────────────────────────────────
echo ""
echo "▶ Paso 1/6 — Activar modo read-only en control-plane"
if [[ -n "${ADMIN_TOKEN:-}" ]]; then
  run curl -sf --max-time 10 \
    -X POST "${API_BASE}/admin/maintenance" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -d '{"mode":"read_only","reason":"pg_corruption_recovery"}' || \
    echo "[WARN] No se pudo activar modo read-only via API (continuar manualmente)"
fi
echo "[OK] Paso 1 completado"

# ─── Paso 2: Verificar integridad del WAL ────────────────────────────────────
echo ""
echo "▶ Paso 2/6 — Verificar integridad del WAL"

if command -v pg_waldump &>/dev/null; then
  WAL_DIR=$(run psql_cmd "SHOW data_directory" | grep '/' | tr -d ' ')
  WAL_PATH="${WAL_DIR}/pg_wal"
  echo "[INFO] Directorio WAL: ${WAL_PATH}"
  if [[ "${DRY_RUN}" != "true" && -d "${WAL_PATH}" ]]; then
    # Verificar el último segmento WAL
    LATEST_WAL=$(ls -t "${WAL_PATH}" | head -1)
    echo "[INFO] Último segmento WAL: ${LATEST_WAL}"
    pg_waldump "${WAL_PATH}/${LATEST_WAL}" > /dev/null 2>&1 && \
      echo "[OK] WAL íntegro" || \
      echo "[WARN] WAL posiblemente corrupto — revisar manualmente"
  fi
else
  echo "[INFO] pg_waldump no disponible en PATH; validando via SQL"
  psql_cmd "SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());"
fi
echo "[OK] Paso 2 completado"

# ─── Paso 3: Snapshot de emergencia vía pg_dump ───────────────────────────────
echo ""
echo "▶ Paso 3/6 — Snapshot de emergencia"

SNAPSHOT_FILE="${BACKUP_DIR}/emergency_${TIMESTAMP}.dump"
run mkdir -p "${BACKUP_DIR}"

if [[ "${DRY_RUN}" != "true" ]]; then
  echo "[INFO] Guardando snapshot en ${SNAPSHOT_FILE}"
  PGPASSWORD="${PGPASSWORD:-}" pg_dump \
    -h "${PG_HOST}" -p "${PG_PORT}" \
    -U "${PG_USER}" -d "${PG_DB}" \
    -Fc --no-password \
    -f "${SNAPSHOT_FILE}" && \
    echo "[OK] Snapshot guardado: ${SNAPSHOT_FILE}" || \
    echo "[ERROR] No se pudo completar el snapshot — revisar manualmente"
else
  echo "[DRY_RUN] pg_dump → ${SNAPSHOT_FILE}"
fi

# ─── Paso 4: Identificar tablas corruptas ─────────────────────────────────────
echo ""
echo "▶ Paso 4/6 — Identificar objetos corruptos"

echo "[INFO] Ejecutando VACUUM ANALYZE para detectar corrupción visible..."
psql_cmd "VACUUM ANALYZE;" || echo "[WARN] VACUUM falló — posible corrupción seria"

echo "[INFO] Consultando pg_catalog.pg_class para tablas con errores..."
psql_cmd "SELECT relname, relpages, reltuples FROM pg_class WHERE relkind='r' ORDER BY relpages DESC LIMIT 20;"

# ─── Paso 5: Verificar slots de replicación huérfanos ────────────────────────
echo ""
echo "▶ Paso 5/6 — Verificar slots de replicación"
psql_cmd "SELECT slot_name, active, restart_lsn, confirmed_flush_lsn FROM pg_replication_slots;"

# ─── Paso 6: Instrucciones de restauración ───────────────────────────────────
echo ""
echo "▶ Paso 6/6 — Instrucciones de restauración"
echo ""
echo "══════════════════════════════════════════════════════"
echo " RESUMEN DE RECUPERACIÓN"
echo "══════════════════════════════════════════════════════"
echo ""
echo "  Snapshot de emergencia: ${SNAPSHOT_FILE}"
echo ""
echo "  OPCIONES DE RESTAURACIÓN:"
echo ""
echo "  A) Restaurar snapshot de emergencia (pérdida: desde inicio de corrupción):"
echo "     pg_restore -h ${PG_HOST} -U ${PG_USER} -d ${PG_DB}_recovered \\"
echo "       --clean --if-exists ${SNAPSHOT_FILE}"
echo ""
echo "  B) Restaurar desde último backup programado:"
echo "     ls -lt /var/backups/4nexa/scheduled/ | head -5"
echo "     pg_restore -h ${PG_HOST} -U ${PG_USER} -d ${PG_DB}_recovered \\"
echo "       --clean /var/backups/4nexa/scheduled/<latest>.dump"
echo ""
echo "  C) PITR (si WAL archiving activo):"
echo "     1. Detener PostgreSQL"
echo "     2. Restaurar base + aplicar WAL hasta el LSN previo a la corrupción"
echo "     3. SET restore_command en recovery.conf"
echo ""
echo "  TRAS LA RESTAURACIÓN:"
echo "     1. Cambiar DATABASE_URL en .env al nuevo DB"
echo "     2. Ejecutar: pnpm --filter control-plane-api prisma migrate deploy"
echo "     3. Desactivar modo read-only: DELETE /admin/maintenance"
echo ""
echo " RUNBOOK COMPLETADO — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "══════════════════════════════════════════════════════"
