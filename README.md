# 4nexa Mailgun

Plataforma de correo transaccional multi-tenant con gestión completa de dominios, buzones, entregabilidad, facturación y herramientas avanzadas (BIMI, AI Engine, ORIZON, archivado RGPD).

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Requisitos](#requisitos)
- [Setup local (desarrollo)](#setup-local-desarrollo)
- [Variables de entorno](#variables-de-entorno)
- [Comandos](#comandos)
- [Módulos de la API](#módulos-de-la-api)
- [Paneles frontend](#paneles-frontend)
- [CI/CD y despliegue](#cicd-y-despliegue)
- [Monitorización](#monitorización)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Clientes                                 │
│         Admin Panel (3000)    Customer Panel (3002)             │
└──────────────────┬──────────────────────┬───────────────────────┘
                   │  HTTPS               │  HTTPS
                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│               Control Plane API — NestJS + Fastify (3001)       │
│  JWT Auth · Rate Limiting · Swagger /api/v1/docs                │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Tenants  │  │ Domains  │  │Mailboxes │  │  Billing     │   │
│  │ Plans    │  │ DNS Orch │  │ Aliases  │  │  Audit       │   │
│  │ Nodes    │  │ DKIM/SPF │  │ Anti-spam│  │  Credentials │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  BIMI    │  │ Archival │  │ AI Engine│  │   ORIZON     │   │
│  │Whitelabel│  │  RGPD    │  │ Abuse AI │  │  Webhooks    │   │
│  │Notif.    │  │LegalHolds│  │Classif.  │  │   Sync       │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  PostgreSQL + Prisma │  │  Redis + BullMQ (colas)      │    │
│  │  25 models · 23 enums│  │  DLQ + backoff exponencial   │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
└──────────────────────────────┬──────────────────────────────────┘
                               │  mTLS JWT
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              Node Agent — NestJS (3099 por nodo)                │
│  Gestión Postfix/Dovecot · DKIM · Métricas por nodo             │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:**

| Capa | Tecnología |
|---|---|
| Backend API | NestJS 10 + Fastify, TypeScript 5 |
| ORM | Prisma 5, PostgreSQL 15 |
| Colas | BullMQ + Redis 7 |
| Auth | JWT (access 15min + refresh 7d), Argon2 |
| Frontend | Next.js 15 (App Router), Tailwind CSS, shadcn/ui |
| Estado | TanStack Query v5 + Zustand |
| Tests | Jest (backend), Vitest 2 (frontend) |
| CI/CD | GitHub Actions → Docker → aaPanel |
| Monitorización | Prometheus + Grafana + node-exporter |

---

## Estructura del repositorio

```
4nexa-mailgun/
├── apps/
│   ├── admin-panel/          # Panel operador (Next.js 15, puerto 3000)
│   └── customer-panel/       # Panel cliente (Next.js 15, puerto 3002)
├── services/
│   ├── control-plane-api/    # API principal (NestJS + Fastify, puerto 3001)
│   └── node-agent/           # Agente por nodo de correo (puerto 3099)
├── packages/
│   ├── config-engine/        # Utilidades de configuración compartidas
│   ├── logger/               # Logger estructurado compartido
│   ├── types/                # Tipos TypeScript compartidos
│   └── validators/           # Validadores Zod compartidos
├── docs/
│   ├── 00-paper-tecnico/     # Especificación técnica v1–v3
│   └── diagrams/             # Diagramas de arquitectura Mermaid
├── scripts/
│   ├── bootstrap.sh          # Bootstrap inicial del entorno
│   ├── smoke-test.sh         # Tests de humo post-deploy
│   └── prod-readiness-check.sh
├── .github/workflows/
│   ├── ci.yml                # lint → typecheck → test → audit → build
│   └── deploy.yml            # Build Docker → deploy vía aaPanel
├── docker-compose.prod.yml
├── docker-compose.staging.yml
├── docker-compose.monitoring.yml
└── .env.example
```

---

## Requisitos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 20.x |
| pnpm | 9.x |
| PostgreSQL | 15.x |
| Redis | 7.x |
| Docker | 24.x (solo para producción) |

---

## Setup local (desarrollo)

```bash
# 1. Clonar el repositorio
git clone https://github.com/Digitalhowls/4nexa-mailgun.git
cd 4nexa-mailgun

# 2. Copiar variables de entorno
cp .env.example .env
# Editar .env con los valores reales (ver sección Variables de entorno)

# 3. Instalar dependencias (monorepo)
pnpm install

# 4. Levantar PostgreSQL y Redis (con Docker)
docker run -d --name pg -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=mailgun_dev \
  -p 5432:5432 postgres:15-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine

# 5. Aplicar migraciones y generar cliente Prisma
pnpm db:generate
pnpm db:migrate

# 6. (Opcional) Seed inicial con admin + nodo de ejemplo
pnpm db:seed

# 7. Arrancar todos los servicios en paralelo
pnpm dev
```

Servicios disponibles tras el arranque:

| Servicio | URL |
|---|---|
| Control Plane API | http://localhost:3001 |
| Swagger / OpenAPI | http://localhost:3001/api/v1/docs |
| Admin Panel | http://localhost:3000 |
| Customer Panel | http://localhost:3002 |

---

## Variables de entorno

Copia `.env.example` como `.env` y rellena cada valor. Las variables marcadas con `CHANGE_ME` **son obligatorias** antes del primer arranque.

### Mínimo para desarrollo

```bash
DATABASE_URL="postgresql://mailgun:changeme@localhost:5432/mailgun_dev"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET=<openssl rand -base64 64>
JWT_REFRESH_SECRET=<openssl rand -base64 64>
DKIM_ENCRYPTION_KEY=<openssl rand -hex 32>
NODE_AGENT_JWT_SECRET=<openssl rand -base64 48>
```

### Generación de secretos

```bash
# JWT secrets (mín. 64 chars)
openssl rand -base64 64

# DKIM encryption key (32 bytes hex)
openssl rand -hex 32

# Node Agent JWT secret (mín. 32 chars)
openssl rand -base64 48

# Internal API key
openssl rand -hex 32
```

---

## Comandos

Todos los comandos se ejecutan desde la raíz del monorepo con `pnpm`.

### Desarrollo

```bash
pnpm dev              # Arranca todos los servicios (Turborepo)
pnpm build            # Build de producción de todos los paquetes
pnpm lint             # ESLint en todo el monorepo
pnpm typecheck        # TypeScript check sin emitir
pnpm format           # Prettier en *.ts, *.tsx, *.json, *.md
```

### Base de datos

```bash
pnpm db:generate      # Genera el cliente Prisma
pnpm db:migrate       # Aplica migraciones pendientes (producción)
pnpm db:migrate:dev   # Crea nueva migración (desarrollo)
pnpm db:seed          # Seed inicial (admin + nodo de ejemplo)
pnpm db:studio        # Abre Prisma Studio en http://localhost:5555
```

### Tests

```bash
pnpm test                    # Todos los tests (backend Jest + frontend Vitest)

# Solo backend (desde services/control-plane-api/)
pnpm --filter control-plane-api test
pnpm --filter control-plane-api test:e2e

# Solo frontend (desde apps/admin-panel/ o apps/customer-panel/)
pnpm --filter admin-panel test
pnpm --filter customer-panel test
```

Cobertura actual:

| Suite | Tests | Estado |
|---|---|---|
| Backend (Jest) | 341 / 341 | ✅ |
| Admin Panel (Vitest) | 45 / 45 | ✅ |
| Customer Panel (Vitest) | 38 / 38 | ✅ |

---

## Módulos de la API

La API expone 38 módulos NestJS bajo el prefijo `/api/v1`. Swagger completo disponible en `/api/v1/docs`.

### Módulos core (v1–v2)

| Módulo | Descripción |
|---|---|
| `auth` | Login, refresh token, 2FA TOTP |
| `tenants` | CRUD multi-tenant, activación/suspensión |
| `plans` | Planes de suscripción con límites |
| `nodes` | Nodos de correo, health check, ping mTLS |
| `domains` | Dominios por tenant, verificación DNS |
| `mailboxes` | Buzones IMAP/SMTP por dominio |
| `aliases` | Alias de correo |
| `antispam` | Listas blancas/negras, reglas, evaluación |
| `deliverability` | Governance, warmup, scoring |
| `credentials` | DKIM keys, rotación automática |
| `billing` | Historial, transiciones de estado, exportación |
| `audit` | Trazabilidad completa de operaciones |
| `disaster-recovery` | Backup/restore, simulación de fallos |
| `dns-orchestration` | Provisión automática DNS (Cloudflare, Hetzner, OVH, Route53…) |
| `api-keys` | API keys con hash SHA-256 |
| `metrics` | Métricas Prometheus custom |

### Módulos v3 (avanzado)

| Módulo | Descripción |
|---|---|
| `whitelabel` | Marca, colores, dominio y logo personalizado por tenant |
| `notifications` | Canales de alerta: email, webhook, Slack, Teams, SMS |
| `archival` | Archivado RGPD: retención, cifrado, legal holds, exportación/olvido |
| `bimi` | BIMI DNS record + validación VMC |
| `ai-engine` | Detección de abuso, clasificación de correo, diagnóstico, extracción de facturas |
| `orizon` | Sincronización de métricas cross-tenant, webhooks HMAC |
| `webmail` | SSO para clientes webmail (tokens de sesión) |
| `groupware` | Integración con calendarios/contactos externos |

---

## Paneles frontend

### Admin Panel (`apps/admin-panel`, puerto 3000)

Interfaz para operadores y administradores de plataforma.

| Ruta | Descripción |
|---|---|
| `/dashboard` | Métricas globales: tenants, dominios, buzones, colas |
| `/tenants` | CRUD tenants, asignación de plan y nodo |
| `/plans` | CRUD planes con límites de buzones/dominios |
| `/nodes` | Nodos de correo, health check en tiempo real |
| `/domains` | Dominios por tenant, verificación DNS |
| `/mailboxes` | Buzones con quota y estado |
| `/aliases` | Alias de correo |
| `/antispam` | Listas blancas/negras y evaluación en tiempo real |
| `/deliverability` | Governance, warmup, scoring de reputación |
| `/billing` | Historial de facturación, transiciones de estado |
| `/credentials` | DKIM keys y rotación |
| `/audit` | Log de auditoría con filtros avanzados |
| `/disaster-recovery` | Backups, restore y simulación de fallos |
| `/whitelabel` | Configuración de marca por tenant |
| `/notifications` | Canales de notificación (email, webhook, Slack…) |
| `/archival` | Política de archivado y herramientas RGPD |
| `/dns` | Orquestación DNS automática |
| `/bimi` | Configuración BIMI y registro DNS generado |
| `/ai` | AI Engine: abuso, clasificación, diagnóstico, facturas |
| `/orizon` | Sincronización ORIZON y webhooks |

### Customer Panel (`apps/customer-panel`, puerto 3002)

Interfaz para clientes finales.

| Ruta | Descripción |
|---|---|
| `/dashboard` | Resumen de dominios y buzones activos |
| `/domains` | Dominios del tenant, estado de verificación |
| `/mailboxes` | Buzones con quota |
| `/aliases` | Alias de correo |
| `/profile` | Datos de perfil y cambio de contraseña |

---

## CI/CD y despliegue

### Pipeline CI (`.github/workflows/ci.yml`)

```
push/PR → lint → typecheck → test + coverage → pnpm audit → build Docker
```

### Pipeline deploy (`.github/workflows/deploy.yml`)

```
push main → build imagen Docker → deploy a aaPanel (producción: erp.4nexa.io)
```

### Despliegue manual con Docker

```bash
# Producción completa
docker compose -f docker-compose.prod.yml up -d

# Staging
docker compose -f docker-compose.staging.yml up -d

# Solo monitorización
docker compose -f docker-compose.monitoring.yml up -d
```

### Bootstrap inicial en servidor nuevo

```bash
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh

# Verificar que todo está operativo
./scripts/smoke-test.sh

# Checklist de producción
./scripts/prod-readiness-check.sh
```

---

## Monitorización

El stack de observabilidad se levanta con `docker-compose.monitoring.yml` e incluye:

| Servicio | Puerto | Descripción |
|---|---|---|
| Prometheus | 9090 | Scraping de métricas |
| Grafana | 3003 | Dashboards (usuario: admin) |
| node-exporter | 9100 | Métricas del sistema operativo |
| cadvisor | 8080 | Métricas de contenedores Docker |
| redis-exporter | 9121 | Métricas de Redis |
| postgres-exporter | 9187 | Métricas de PostgreSQL |

La API expone métricas custom en formato Prometheus en `GET /api/v1/metrics`.

---

## Modelo de datos

- **25 modelos** Prisma: `Tenant`, `Plan`, `Node`, `Domain`, `Mailbox`, `Alias`, `DkimKey`, `BillingRecord`, `AuditLog`, `AntispamRule`, `NotificationChannel`, `ArchivalPolicy`, `LegalHold`, `BimiConfig`, `DnsProvider`, `WhitelabelConfig`, `ApiKey`, `BackupJob`, `DisasterRecoveryJob`, `NodeAssignment`, `ReputationScore`, `MigrationJob`, `QueueEvent`, `OtpSecret`, `RefreshToken`
- **23 enums** (estados, tipos, roles)
- **16 migraciones** SQL versionadas
- **878 líneas** de schema Prisma

---

## Licencia

Propietario — © 2026 4nexa / Digitalhowls. Todos los derechos reservados.
