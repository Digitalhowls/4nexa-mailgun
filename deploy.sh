#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy.sh — Instalador de 4nexa Mailgun Platform
# Uso: curl -sL https://raw.githubusercontent.com/Digitalhowls/4nexa-mailgun/main/deploy.sh | bash
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="Digitalhowls/4nexa-mailgun"
BRANCH="main"
RAW_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
INSTALL_DIR="/opt/4nexa-mailgun"
COMPOSE_FILE="docker-compose.prod.yml"
GHCR_REGISTRY="ghcr.io"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 0. Root check ────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || error "Ejecutar como root: sudo bash deploy.sh"

echo ""
echo "  4nexa Mailgun Platform — Instalador"
echo "  ======================================"
echo ""

# ── 1. Instalar Docker si no existe ──────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    info "Instalando Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker --now
    success "Docker instalado"
else
    success "Docker ya está instalado: $(docker --version)"
fi

# ── 2. Crear directorio de instalación ───────────────────────────────────────
info "Creando directorio de instalación: ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}/backups/postgres"
cd "${INSTALL_DIR}"

# ── 3. Descargar docker-compose.prod.yml ─────────────────────────────────────
info "Descargando ${COMPOSE_FILE}..."
curl -fsSL "${RAW_URL}/${COMPOSE_FILE}" -o "${COMPOSE_FILE}"

# ── 4. Descargar archivos de nginx ────────────────────────────────────────────
info "Descargando configuración de nginx..."
mkdir -p docker/nginx
curl -fsSL "${RAW_URL}/docker/nginx/nginx.conf" -o docker/nginx/nginx.conf
curl -fsSL "${RAW_URL}/docker/nginx/maintenance.html" -o docker/nginx/maintenance.html

# ── 5. Configurar .env si no existe ──────────────────────────────────────────
if [ ! -f ".env" ]; then
    info "Generando .env con credenciales aleatorias..."

    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 40)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | head -c 40)
    JWT_ACCESS_SECRET=$(openssl rand -base64 64 | tr -d '=/+' | head -c 80)
    JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '=/+' | head -c 80)
    INTERNAL_API_KEY=$(openssl rand -base64 32 | tr -d '=/+' | head -c 40)

    cat > .env << ENVEOF
# ── Generado automáticamente el $(date -u '+%Y-%m-%dT%H:%M:%SZ') ──

# PostgreSQL
POSTGRES_DB=mailgun
POSTGRES_USER=mailgun
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}

# JWT
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API
INTERNAL_API_KEY=${INTERNAL_API_KEY}
API_PUBLIC_URL=https://api.mail.4nexa.io/api/v1
CORS_ORIGINS=https://admin.mail.4nexa.io,https://app.mail.4nexa.io

# Puertos (HTTP interno — aaPanel gestiona SSL)
APP_PORT_HTTP=80
APP_PORT_HTTPS=443
ENVEOF
    success ".env generado"
else
    warn ".env ya existe — no se sobreescribe"
fi

# ── 6. Login en GHCR (requiere token con packages:read) ──────────────────────
echo ""
warn "Para descargar las imágenes de GHCR necesitas un Personal Access Token."
warn "Ve a: https://github.com/settings/tokens → New token → packages:read"
echo ""
read -rp "  GitHub username: " GHCR_USER
read -rsp "  GitHub PAT (packages:read): " GHCR_TOKEN
echo ""

echo "${GHCR_TOKEN}" | docker login "${GHCR_REGISTRY}" -u "${GHCR_USER}" --password-stdin
success "Autenticado en GHCR"

# ── 7. Pull de imágenes y arranque ────────────────────────────────────────────
info "Descargando imágenes..."
docker compose -f "${COMPOSE_FILE}" pull

info "Arrancando servicios..."
docker compose -f "${COMPOSE_FILE}" up -d

# ── 8. Esperar que la API esté healthy ───────────────────────────────────────
info "Esperando que la API esté healthy..."
for i in $(seq 1 30); do
    HSTATUS=$(docker inspect mailgun_api --format '{{.State.Health.Status}}' 2>/dev/null || echo "pending")
    if [ "${HSTATUS}" = "healthy" ]; then
        success "mailgun_api healthy"
        break
    fi
    echo "  ($i/30) Estado: ${HSTATUS} — esperando 10s..."
    sleep 10
done

# ── 9. Estado final ───────────────────────────────────────────────────────────
echo ""
docker compose -f "${COMPOSE_FILE}" ps
echo ""
success "¡Instalación completada!"
echo ""
echo "  Próximos pasos:"
echo "  1. Configura los dominios en aaPanel → apunta a este servidor"
echo "  2. Instala certificados SSL en aaPanel para los dominios:"
echo "     - api.mail.4nexa.io"
echo "     - admin.mail.4nexa.io"
echo "     - app.mail.4nexa.io"
echo "  3. Configura el cron de deploy en aaPanel (ver README)"
echo ""
