#!/bin/sh
# mail-node/postfix/entrypoint.sh
# Inicialización de Postfix antes de arrancar

set -e

# ─── Asegurar directorios de mapas virtuales ──────────────────────────────
mkdir -p /etc/postfix/virtual /etc/postfix/sasl

# ─── Crear mapas vacíos si no existen (evita errores al arrancar) ─────────
for MAP in domains mailboxes aliases; do
  FILE="/etc/postfix/virtual/${MAP}"
  if [ ! -f "${FILE}" ]; then
    touch "${FILE}"
  fi
  # Crear o actualizar el índice hash si existe contenido
  if [ -s "${FILE}" ]; then
    postmap "${FILE}"
  fi
done

# ─── Ajustar hostname si viene de variable de entorno ─────────────────────
if [ -n "${MAILNODE_HOSTNAME}" ]; then
  postconf -e "myhostname = ${MAILNODE_HOSTNAME}"
fi

# ─── Iniciar syslog para logs locales ─────────────────────────────────────
if command -v rsyslogd > /dev/null 2>&1; then
  rsyslogd
fi

exec "$@"
