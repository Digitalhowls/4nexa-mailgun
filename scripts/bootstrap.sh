#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 4nexa Mailgun Platform — Bootstrap & Installer (§37)
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/Digitalhowls/4nexa-mailgun/main/scripts/bootstrap.sh | bash
#   ó localmente:
#   bash scripts/bootstrap.sh
#
# Pre-requisitos:
#   - Ubuntu 22.04 LTS / Debian 12
#   - Usuario con sudo (no root directo)
#   - Acceso a internet
#
# El script es IDEMPOTENTE: puede ejecutarse múltiples veces de forma segura.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()    { echo -e "\n${BOLD}${BLUE}══ $* ══${NC}"; }
die()     { error "$*"; exit 1; }

# ─── Constantes ───────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/4nexa"
SECRETS_FILE="${INSTALL_DIR}/.env"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.prod.yml"
GITHUB_REPO="Digitalhowls/4nexa-mailgun"
LOG_FILE="/var/log/4nexa-bootstrap.log"
MIN_RAM_MB=2048
MIN_DISK_GB=20

# ─── Inicio ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   4nexa Mailgun Platform — Bootstrap     ║"
echo "  ║   §37 Installer & Bootstrap System       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Redirigir logs
exec > >(tee -a "${LOG_FILE}") 2>&1
info "Log guardado en ${LOG_FILE}"

# ─── 1. Verificaciones previas ────────────────────────────────────────────────
step "1/9 Verificación del sistema"

# SO
if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  if [[ "${ID}" != "ubuntu" && "${ID}" != "debian" ]]; then
    die "SO no soportado: ${ID}. Se requiere Ubuntu 22.04+ o Debian 12+."
  fi
  info "SO: ${PRETTY_NAME}"
else
  die "No se puede determinar el sistema operativo."
fi

# No ejecutar como root directo (usar sudo)
if [[ "${EUID}" -eq 0 ]]; then
  warn "Ejecutando como root. Se recomienda usar un usuario con sudo."
fi

# RAM
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [[ "${RAM_MB}" -lt "${MIN_RAM_MB}" ]]; then
  die "RAM insuficiente: ${RAM_MB}MB. Se requieren al menos ${MIN_RAM_MB}MB."
fi
success "RAM: ${RAM_MB}MB"

# Disco
DISK_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
if [[ "${DISK_GB}" -lt "${MIN_DISK_GB}" ]]; then
  die "Espacio insuficiente: ${DISK_GB}GB libres. Se requieren ${MIN_DISK_GB}GB."
fi
success "Disco: ${DISK_GB}GB disponibles"

# ─── 2. Instalar dependencias del sistema ─────────────────────────────────────
step "2/9 Instalación de dependencias"

export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q \
  curl \
  wget \
  gnupg \
  ca-certificates \
  lsb-release \
  apt-transport-https \
  software-properties-common \
  ufw \
  fail2ban \
  openssl \
  jq \
  git \
  unzip

success "Dependencias del sistema instaladas"

# Docker
if ! command -v docker &>/dev/null; then
  info "Instalando Docker…"
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  success "Docker instalado: $(docker --version)"
else
  success "Docker ya instalado: $(docker --version)"
fi

# Añadir usuario actual al grupo docker
CURRENT_USER="${SUDO_USER:-${USER}}"
if [[ -n "${CURRENT_USER}" && "${CURRENT_USER}" != "root" ]]; then
  usermod -aG docker "${CURRENT_USER}" 2>/dev/null || true
  info "Usuario ${CURRENT_USER} añadido al grupo docker"
fi

# ─── 3. Configurar firewall ───────────────────────────────────────────────────
step "3/9 Configuración del firewall"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH (mantener acceso)
ufw allow ssh
ufw allow 22/tcp

# HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# SMTP/IMAP/Submission (solo si es nodo de correo)
ufw allow 25/tcp    # SMTP inbound
ufw allow 587/tcp   # SMTP submission
ufw allow 993/tcp   # IMAPS
ufw allow 465/tcp   # SMTPS

echo "y" | ufw enable
success "Firewall configurado"
ufw status verbose

# ─── 4. Fail2ban ─────────────────────────────────────────────────────────────
step "4/9 Configuración de Fail2ban"

cat > /etc/fail2ban/jail.local << 'FAIL2BAN'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s

[postfix]
enabled = true
port    = smtp,465,submission
logpath = %(postfix_log)s

[dovecot]
enabled = true
port    = pop3,pop3s,imap,imaps,submission,465
logpath = %(dovecot_log)s
FAIL2BAN

systemctl enable --now fail2ban
success "Fail2ban configurado y activo"

# ─── 5. Crear directorio de instalación ──────────────────────────────────────
step "5/9 Estructura de directorios"

mkdir -p "${INSTALL_DIR}"/{logs,backups,certs}
chmod 700 "${INSTALL_DIR}"
success "Directorio ${INSTALL_DIR} creado"

# ─── 6. Generar secretos ──────────────────────────────────────────────────────
step "6/9 Generación de secretos"

if [[ -f "${SECRETS_FILE}" ]]; then
  warn "Archivo .env ya existe — se conserva (no se sobreescriben secretos)."
  warn "Para regenerar: rm ${SECRETS_FILE} y volver a ejecutar el script."
else
  info "Generando secretos criptográficos…"

  # Función para generar token seguro
  gen_secret() { openssl rand -hex 32; }
  gen_password() { openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24; }

  POSTGRES_PASSWORD="$(gen_password)"
  REDIS_PASSWORD="$(gen_password)"
  JWT_ACCESS_SECRET="$(gen_secret)"
  JWT_REFRESH_SECRET="$(gen_secret)"
  INTERNAL_API_KEY="$(gen_secret)"

  # Solicitar datos de configuración
  read -rp "Dominio de la API (ej: api.4nexa.io): " API_DOMAIN
  read -rp "Dominio admin panel (ej: erp.4nexa.io): " ADMIN_DOMAIN
  read -rp "Dominio customer panel (ej: mail.4nexa.io): " CUSTOMER_DOMAIN
  read -rp "Email de notificaciones: " ADMIN_EMAIL

  cat > "${SECRETS_FILE}" << EOF
# 4nexa Mailgun Platform — Producción
# Generado: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
# ATENCIÓN: Nunca compartir ni commitear este archivo

# ── PostgreSQL ────────────────────────────────────────────────────
POSTGRES_DB=4nexa
POSTGRES_USER=4nexa
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# ── Redis ─────────────────────────────────────────────────────────
REDIS_PASSWORD=${REDIS_PASSWORD}

# ── JWT ───────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── API Keys internas ─────────────────────────────────────────────
INTERNAL_API_KEY=${INTERNAL_API_KEY}

# ── URLs públicas ─────────────────────────────────────────────────
API_PUBLIC_URL=https://${API_DOMAIN}
CORS_ORIGINS=https://${ADMIN_DOMAIN},https://${CUSTOMER_DOMAIN}

# ── Database URL completa ─────────────────────────────────────────
DATABASE_URL=postgresql://4nexa:${POSTGRES_PASSWORD}@postgres:5432/4nexa
EOF

  chmod 600 "${SECRETS_FILE}"
  success "Secretos generados en ${SECRETS_FILE}"

  # Guardar dominios para la siguiente etapa
  echo "API_DOMAIN=${API_DOMAIN}"          > "${INSTALL_DIR}/.bootstrap-state"
  echo "ADMIN_DOMAIN=${ADMIN_DOMAIN}"     >> "${INSTALL_DIR}/.bootstrap-state"
  echo "CUSTOMER_DOMAIN=${CUSTOMER_DOMAIN}" >> "${INSTALL_DIR}/.bootstrap-state"
  echo "ADMIN_EMAIL=${ADMIN_EMAIL}"       >> "${INSTALL_DIR}/.bootstrap-state"
fi

# ─── 7. Descargar docker-compose y configuración ─────────────────────────────
step "7/9 Descarga de configuración"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  info "Descargando docker-compose.prod.yml desde GitHub…"
  curl -fsSL \
    "https://raw.githubusercontent.com/${GITHUB_REPO}/main/docker-compose.prod.yml" \
    -o "${COMPOSE_FILE}"
  success "docker-compose.prod.yml descargado"
else
  success "docker-compose.prod.yml ya existe"
fi

# ─── 8. Pull de imágenes y primer arranque ────────────────────────────────────
step "8/9 Pull de imágenes Docker"

cd "${INSTALL_DIR}"

info "Autenticando en GHCR…"
# Las imágenes son públicas — no se necesita auth para pull
# Si son privadas: echo PAT | docker login ghcr.io -u USER --password-stdin

info "Descargando imágenes…"
docker compose -f "${COMPOSE_FILE}" --env-file "${SECRETS_FILE}" pull

info "Iniciando servicios…"
docker compose -f "${COMPOSE_FILE}" --env-file "${SECRETS_FILE}" up -d

# Esperar a que la API esté lista
info "Esperando que la API esté disponible (máx 60s)…"
for i in $(seq 1 12); do
  if curl -sf "http://localhost:3000/health" >/dev/null 2>&1; then
    success "API disponible"
    break
  fi
  if [[ "${i}" -eq 12 ]]; then
    warn "La API no respondió en 60s. Revisa los logs: docker compose -f ${COMPOSE_FILE} logs"
  fi
  sleep 5
done

# Ejecutar migraciones
info "Ejecutando migraciones de base de datos…"
docker compose -f "${COMPOSE_FILE}" --env-file "${SECRETS_FILE}" \
  run --rm control-plane-api sh -c "npx prisma migrate deploy" || \
  warn "Las migraciones fallaron. Asegúrate de que la BD esté accesible."

success "Servicios arrancados"

# ─── 9. Registro del nodo en control plane ────────────────────────────────────
step "9/9 Verificación final y registro"

docker compose -f "${COMPOSE_FILE}" --env-file "${SECRETS_FILE}" ps

# Mostrar resumen
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ✓ Bootstrap completado                                      ${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo ""

if [[ -f "${INSTALL_DIR}/.bootstrap-state" ]]; then
  # shellcheck source=/dev/null
  . "${INSTALL_DIR}/.bootstrap-state"
  echo -e "  API:           ${BLUE}https://${API_DOMAIN:-localhost:3000}${NC}"
  echo -e "  Admin Panel:   ${BLUE}https://${ADMIN_DOMAIN:-localhost:3001}${NC}"
  echo -e "  Customer Panel:${BLUE}https://${CUSTOMER_DOMAIN:-localhost:3002}${NC}"
fi

echo ""
echo -e "  Logs:        ${YELLOW}docker compose -f ${COMPOSE_FILE} logs -f${NC}"
echo -e "  Estado:      ${YELLOW}docker compose -f ${COMPOSE_FILE} ps${NC}"
echo -e "  Reiniciar:   ${YELLOW}docker compose -f ${COMPOSE_FILE} restart${NC}"
echo -e "  Configuración:${YELLOW}${SECRETS_FILE}${NC}"
echo ""
echo -e "${YELLOW}⚠  Acción requerida: Configura el reverse proxy (Caddy/Nginx) para${NC}"
echo -e "${YELLOW}   exponer los servicios en los dominios configurados.${NC}"
echo ""
