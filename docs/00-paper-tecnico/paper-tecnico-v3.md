# Paper Técnico v3 — 4nexa Mailgun Platform

**Versión:** 3.0
**Fecha:** 20 de mayo de 2026
**Estado:** Especificación operacional enterprise — diferenciación IA + groupware + integraciones

---

## 1. Filosofía v3 — Diferenciación Competitiva

La versión 3 transforma la plataforma de correo gestionado en una **infraestructura cognitiva de comunicaciones empresariales**.

v1 resolvió: _correo funciona._
v2 resolvió: _correo opera de forma multi-tenant, escalable y observable._
v3 resuelve: **correo entiende, aprende y se integra.**

Los tres vectores de diferenciación:

```
1. Inteligencia operacional (IA real, no decorativa)
2. Groupware completo (webmail + calendario + contactos)
3. Integración con el ecosistema 4nexa (ORIZON/ORIGO)
```

---

## 2. Principios v3

### 2.1. IA útil o no hay IA

No añadir IA si no mejora una métrica operacional concreta:
- reducción de falsos negativos spam;
- reducción de tiempo de resolución de incidentes;
- automatización de tareas de soporte repetitivas.

### 2.2. Groupware sin reinventar la rueda

Integrar soluciones probadas (Snappymail, SOGo) en lugar de construir desde cero.
El Control Plane orquesta; no implementa protocolos de correo.

### 2.3. API primero

Toda funcionalidad de v3 debe ser accesible por API antes que por UI.
La API pública es el producto para integradores y white-label.

### 2.4. Extensión, no ruptura

v3 extiende el modelo de datos y la arquitectura de v2.
No hay breaking changes en contratos v2.
Los módulos v3 son opcionales y activables por tenant.

### 2.5. Privacidad por diseño

Cualquier funcionalidad IA que procese contenido de correos:
- debe ser opt-in por tenant;
- no puede enviar contenido a APIs externas sin consentimiento explícito;
- debe procesarse on-premise o en infraestructura controlada.

---

## 3. Arquitectura v3 — Extensión del Control Plane

### 3.1. Nuevos servicios

```
Control Plane API (v2)
  ├── [NUEVO] AI Engine Module
  │     ├── abuse-classifier.service
  │     ├── mail-classifier.service
  │     ├── invoice-extractor.service
  │     └── support-assistant.service
  ├── [NUEVO] DNS Orchestration Module
  ├── [NUEVO] Archival Module
  ├── [NUEVO] API Key Module
  ├── [NUEVO] White-label Module
  └── [NUEVO] BIMI Module

Nuevas apps:
  ├── webmail-proxy        (Snappymail reverse proxy + auth)
  └── marketing-site       (Next.js — landing page pública)

Nuevos servicios externos integrados:
  ├── SOGo                 (groupware — CalDAV/CardDAV/ActiveSync)
  ├── Snappymail           (webmail)
  └── Ollama / OpenAI      (LLM inference — configurable)
```

### 3.2. Stack adicional v3

| Componente | Tecnología | Uso |
|-----------|-----------|-----|
| LLM inference | Ollama (local) / OpenAI API | Clasificación, soporte |
| Vector DB | pgvector (extensión PostgreSQL) | Embeddings semánticos |
| Webmail | Snappymail 1.x | Acceso web a buzones |
| Groupware | SOGo 5.x | CalDAV/CardDAV/EAS |
| DNS API | Cloudflare API / Hetzner DNS API | Orquestación DNS |
| PDF extraction | pdf-parse + LLM | Extracción facturas |

### 3.3. Prohibiciones v3

No introducir en v3:
- Kubernetes (aún no);
- Ceph / GlusterFS;
- Microservicios fragmentados para IA;
- LLMs cloud para contenido de correos sin opt-in explícito;
- ActiveSync propio (delegar en SOGo).

---

## 4. Mailgun Brain v2 — IA Operacional

### 4.1. Objetivo

Convertir el Brain de sistema de memoria operacional a **sistema de inteligencia operacional** con capacidad de:
- clasificar patrones de abuso con precisión > 95%;
- detectar anomalías de entregabilidad antes de que impacten;
- asistir al soporte técnico con contexto semántico.

### 4.2. pgvector — Embeddings en PostgreSQL

```sql
-- Extensión en el schema Prisma
-- CREATE EXTENSION IF NOT EXISTS vector;

model BrainCell {
  -- campos existentes v2 --
  embedding  Unsupported("vector(1536)")?  -- OpenAI ada-002 / nomic-embed
}
```

Uso de embeddings:
- búsqueda semántica de incidentes similares;
- clustering de patrones de abuso;
- recuperación de contexto para el asistente de soporte.

### 4.3. Pipeline de inferencia

```
Evento del sistema
  ↓
Extracción de features (metadata, scores, timestamps)
  ↓
Embedding (Ollama nomic-embed / OpenAI text-embedding-ada-002)
  ↓
Almacenamiento en BrainCell.embedding (pgvector)
  ↓
Indexado HNSW (cosine similarity)
  ↓
Disponible para consultas semánticas
```

### 4.4. Reglas críticas IA

**Nunca:**
- procesar el cuerpo de emails para embeddings sin opt-in del tenant;
- enviar IPs, dominios o patrones a APIs externas sin configuración explícita;
- tomar decisiones de suspensión de forma autónoma sin umbral configurable.

**Siempre:**
- registrar en AuditLog cada inferencia que derive en acción;
- permitir override manual de cualquier decisión IA;
- mantener explicabilidad (score + features que lo generaron).

---

## 5. AI Abuse Detection — Clasificador de Abuso

### 5.1. Problema a resolver

El sistema actual usa umbrales estáticos (bounceRate, spamRate).
v3 añade clasificación dinámica basada en patrones aprendidos.

### 5.2. Features de entrada

```typescript
interface AbuseFeatures {
  bouncesLast1h: number;
  bouncesLast24h: number;
  spamReportsLast24h: number;
  uniqueRecipientsLast1h: number;
  avgRecipientListSize: number;
  dkimPassRate: number;
  spfPassRate: number;
  dmarcPassRate: number;
  hourOfDay: number;
  dayOfWeek: number;
  tenantAgedays: number;
  reputationScore: number;
}
```

### 5.3. Modelos soportados

- **Umbral estático** (v2, siempre activo): reglas hard-coded;
- **Reglas configurables** (v3): admin define umbrales por tenant;
- **ML local** (v3 avanzado): modelo ONNX entrenado con histórico;
- **LLM assist** (v3 opcional): GPT-4o / Ollama para análisis contextual.

### 5.4. Acciones automáticas

| Nivel | Trigger | Acción |
|-------|---------|--------|
| WARNING | score ≥ 60 | Alerta admin + Brain ANOMALY cell |
| THROTTLE | score ≥ 75 | Reducir throughput 50% |
| SUSPEND | score ≥ 90 | Suspender dominio + notificar tenant |
| BLOCK | score = 100 | Suspender tenant + purgar colas |

---

## 6. AI Mail Classification — Clasificación de Correo

### 6.1. Objetivo

Clasificar correos entrantes automáticamente para:
- filtrado inteligente más allá de spam/ham;
- categorización: factura, soporte, newsletter, transaccional;
- enrutamiento a carpetas IMAP automático (Sieve rules generadas por IA).

### 6.2. Categorías base

```typescript
enum MailCategory {
  INVOICE        = 'invoice',
  SUPPORT_TICKET = 'support_ticket',
  NEWSLETTER     = 'newsletter',
  TRANSACTIONAL  = 'transactional',
  PERSONAL       = 'personal',
  SPAM           = 'spam',
  PHISHING       = 'phishing',
  UNKNOWN        = 'unknown',
}
```

### 6.3. Arquitectura

```
Email recibido (POST-DATA milter)
  ↓
Header extraction (From, Subject, Content-Type)
  ↓
LLM classify prompt:
  "Classify this email into one of: [categories]
   From: {from} Subject: {subject}
   Snippet: {first_500_chars}"  ← nunca el cuerpo completo
  ↓
Respuesta: { category, confidence, reasoning }
  ↓
Dovecot: generar/actualizar regla Sieve
  ↓
Entregar en carpeta correcta
```

### 6.4. Privacidad

Solo se procesa: remitente, asunto, primeros 500 caracteres del cuerpo.
El LLM nunca recibe el email completo salvo opt-in explícito del tenant.

---

## 7. AI Invoice Extraction — Extracción de Facturas

### 7.1. Objetivo

Detectar facturas en adjuntos de correo y extraer datos estructurados:
- número de factura;
- emisor + NIF/CIF;
- importe total + IVA;
- fecha;
- concepto.

### 7.2. Pipeline

```
Email con adjunto PDF / imagen
  ↓
Detectar mime-type (application/pdf, image/*)
  ↓
pdf-parse → texto plano
  ↓
LLM extraction prompt:
  "Extract invoice fields from: {text}"
  ↓
Validar con Zod schema InvoiceExtractDto
  ↓
Almacenar en ExtractedInvoice (DB)
  ↓
Webhook opcional al ERP (ORIZON/ORIGO)
```

### 7.3. Modelo de datos

```prisma
model ExtractedInvoice {
  id            String   @id @default(uuid())
  tenantId      String
  mailboxId     String
  messageId     String
  invoiceNumber String?
  issuerName    String?
  issuerTaxId   String?
  totalAmount   Decimal?
  vatAmount     Decimal?
  currency      String   @default("EUR")
  invoiceDate   DateTime?
  rawText       String?
  confidence    Float
  status        InvoiceExtractionStatus
  createdAt     DateTime @default(now())

  tenant   Tenant  @relation(fields: [tenantId], references: [id])
  mailbox  Mailbox @relation(fields: [mailboxId], references: [id])
}

enum InvoiceExtractionStatus {
  PENDING
  EXTRACTED
  FAILED
  REVIEWED
  EXPORTED
}
```

---

## 8. AI Support Assistant — Asistente de Soporte

### 8.1. Objetivo

Asistir al operador de soporte con:
- diagnóstico de problemas de entregabilidad en lenguaje natural;
- búsqueda semántica en el historial de incidentes (pgvector);
- generación de respuestas draft para tickets de soporte.

### 8.2. Endpoint

```
POST /support/ai-diagnose
{
  "query": "El dominio empresa.com no puede enviar a Gmail",
  "tenantId": "uuid",
  "context": {
    "domain": "empresa.com",
    "lastBounceRate": 8.2,
    "dkimStatus": "fail"
  }
}

Response:
{
  "diagnosis": "El fallo DKIM combinado con bounceRate 8.2% indica...",
  "suggestedActions": ["verificar selector DKIM", "rotar claves"],
  "similarIncidents": [...],  // pgvector similarity search
  "confidence": 0.87
}
```

### 8.3. Contexto inyectado al LLM

El asistente recibe como contexto:
- BrainCells activas del tenant (tipo REPUTATION, DELIVERY, SECURITY);
- últimas 10 entradas de AuditLog del tenant;
- scores de reputación actuales;
- configuración DNS del dominio.

Nunca recibe: contenido de emails, contraseñas, claves privadas.

---

## 9. Webmail — Snappymail Integration

### 9.1. Stack elegido

**Snappymail 2.x** (sucesor de RainLoop).

Criterios de selección vs Roundcube:
- más ligero (sin PHP pesado);
- soporte IMAP nativo + OAuth2;
- fácil de dockerizar;
- plugins para firma, cifrado, categorías.

### 9.2. Arquitectura de integración

```
Browser (tenant user)
  ↓
Customer Panel /app/webmail
  ↓ (iframe o redirect con token SSO)
Snappymail Docker container (:8888)
  ↓ (IMAPS :993 / SMTPS :587)
Dovecot / Postfix (Mail Node)
```

### 9.3. SSO con Control Plane

```
1. Customer Panel → POST /auth/webmail-token {userId}
2. Control Plane genera JWT corta duración (15 min) con {imap_host, imap_user}
3. Snappymail plugin verifica JWT → auto-login
4. Token destruido tras login exitoso
```

### 9.4. Docker service nuevo

```yaml
# docker-compose.prod.yml
snappymail:
  image: djmaze/snappymail:latest
  environment:
    SNAPPYMAIL_ADMIN_PASSWORD: ${SNAPPYMAIL_ADMIN_PASS}
  volumes:
    - snappymail_data:/var/lib/snappymail
  networks:
    - control-plane
```

### 9.5. Configuración por dominio

Cada dominio configurado en la plataforma tiene entrada automática en Snappymail:
- servidor IMAP: hostname del mail-node;
- puerto: 993 (SSL) / 143 (STARTTLS);
- servidor SMTP: hostname del mail-node;
- puerto: 587 (STARTTLS).

---

## 10. Groupware — SOGo CalDAV/CardDAV

### 10.1. Stack

**SOGo 5.x** — servidor groupware open source probado.

Funcionalidades:
- CalDAV (calendarios sincronizables con iOS/Android/Outlook);
- CardDAV (contactos sincronizables);
- ActiveSync (EAS para móviles);
- webmail propio (opcional, puede desactivarse si se usa Snappymail).

### 10.2. Arquitectura

```
Mail Node
  ├── SOGo daemon (:20000)
  ├── PostgreSQL de SOGo (BD separada: sogo_db)
  └── Nginx proxy /SOGo/ → SOGo daemon
```

### 10.3. Aprovisionamiento automático

Cuando se crea un buzón en la plataforma:
```
Node Agent: POST /operations/sogo/provision
  → INSERT INTO sogo_users (c_uid, c_password, c_cn, c_mail)
  → Crear calendario default "Personal"
  → Crear libreta contactos "Contacts"
```

### 10.4. Endpoints Control Plane nuevos

```
POST   /mailboxes/:id/calendar        Crear calendario
GET    /mailboxes/:id/calendars       Listar calendarios
DELETE /mailboxes/:id/calendar/:calId Eliminar calendario
POST   /mailboxes/:id/addressbook     Crear libreta
GET    /domains/:id/free-busy         Consultar disponibilidad
```

### 10.5. Modelo de datos

```prisma
model CalendarConfig {
  id         String  @id @default(uuid())
  mailboxId  String  @unique
  enabled    Boolean @default(true)
  easEnabled Boolean @default(false)
  shareType  CalendarShareType @default(PRIVATE)
  createdAt  DateTime @default(now())

  mailbox Mailbox @relation(fields: [mailboxId], references: [id])
}

enum CalendarShareType {
  PRIVATE
  TENANT_READ
  TENANT_WRITE
  PUBLIC_READ
}
```

---

## 11. DNS Orchestration — Gestión Automática de DNS

### 11.1. Objetivo

Automatizar la verificación y configuración DNS para:
- SPF, DKIM, DMARC, MTA-STS, TLS-RPT, BIMI;
- eliminar el paso manual de "copiar registros DNS";
- notificar cuando un registro se desalinea.

### 11.2. Proveedores soportados (v3)

| Proveedor | API | Autenticación |
|-----------|-----|--------------|
| Cloudflare | CF API v4 | API Token (scoped) |
| Hetzner DNS | Hetzner DNS API | API Key |
| OVH | OVH API v1 | OAuth1 consumer key |
| Route53 | AWS SDK | IAM role / access key |
| PowerDNS | PDNS REST API | API Key |

### 11.3. Modelo de datos

```prisma
model DnsProvider {
  id           String   @id @default(uuid())
  tenantId     String
  provider     DnsProviderType
  encApiKey    String   -- AES-256-GCM
  encApiSecret String?  -- AES-256-GCM (si requiere)
  zoneId       String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())

  tenant  Tenant    @relation(fields: [tenantId], references: [id])
  domains Domain[]
}

enum DnsProviderType {
  CLOUDFLARE
  HETZNER
  OVH
  ROUTE53
  POWERDNS
  MANUAL
}
```

### 11.4. Flujo de orquestación

```
1. Tenant conecta proveedor DNS (POST /dns-providers)
2. CP cifra credenciales AES-256-GCM
3. Al añadir dominio: CP llama DnsOrchestrationService.provision(domain)
4. Servicio crea/actualiza registros:
   - MX: mail-node-hostname (prioridad 10)
   - SPF: v=spf1 ip4:{node-ip} ~all
   - DKIM: selector._domainkey TXT {public-key}
   - DMARC: _dmarc TXT v=DMARC1;p=quarantine;...
   - MTA-STS: _mta-sts TXT v=STSv1;id={ts}
5. Cron de verificación cada 6h: confirmar que registros siguen correctos
6. Si desalineación detectada: evento dns.drift → alerta + auto-corrección
```

### 11.5. Seguridad

- credenciales siempre cifradas, nunca en logs;
- permisos mínimos: solo zonas del dominio (no acceso total a cuenta DNS);
- audit log de cada operación DNS.

---

## 12. API Pública — OpenAPI 3.1

### 12.1. Objetivo

Exponer una API REST documentada y autenticada para:
- integradores externos;
- white-label (agencias gestionando múltiples tenants);
- automatización CLI/scripts de clientes.

### 12.2. Autenticación API Keys

```typescript
// Nuevo modelo
model ApiKey {
  id          String    @id @default(uuid())
  tenantId    String
  name        String
  keyHash     String    @unique  -- bcrypt del valor real
  keyPrefix   String             -- primeros 8 chars para identificación
  scopes      String[]           -- ['read:mailboxes', 'write:mailboxes', ...]
  rateLimit   Int       @default(1000)  -- requests/hora
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  createdBy   String

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

### 12.3. Scopes disponibles

```
read:tenants        write:tenants
read:domains        write:domains
read:mailboxes      write:mailboxes
read:aliases        write:aliases
read:billing        write:billing
read:backups        exec:backups
read:audit          read:metrics
exec:migrations     exec:dns
admin:*             (solo SUPER_ADMIN)
```

### 12.4. Rate limiting

- por API key: configurable (default 1000 req/h);
- por IP de origen: 10.000 req/h global;
- headers de respuesta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`;
- implementado con Redis sliding window.

### 12.5. Documentación OpenAPI

- endpoint `GET /api-docs` → Swagger UI;
- endpoint `GET /api-docs.json` → especificación JSON;
- generada automáticamente con `@nestjs/swagger`;
- versionada: `/v1/`, `/v2/` (para futuras versiones).

---

## 13. White-label Engine

### 13.1. Objetivo

Permitir que agencias/revendedores ofrezcan la plataforma bajo su propia marca:
- dominio propio para el panel (panel.agencia.com);
- logo, colores, nombre de marca personalizado;
- emails del sistema con la marca de la agencia.

### 13.2. Modelo de datos

```prisma
model WhitelabelConfig {
  id              String  @id @default(uuid())
  tenantId        String  @unique
  brandName       String
  brandDomain     String  @unique
  logoUrl         String?
  primaryColor    String  @default("#3B82F6")
  accentColor     String  @default("#10B981")
  supportEmail    String?
  customCss       String? @db.Text
  smtpFromName    String?
  smtpFromEmail   String?
  isActive        Boolean @default(true)
  createdAt       DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

### 13.3. Implementación

- el Customer Panel lee `WhitelabelConfig` en SSR (Next.js) basándose en el hostname;
- Nginx: wildcard TLS para `*.customers.4nexa.io` + gestión de dominios custom (Let's Encrypt);
- los emails transaccionales inyectan los campos `smtpFromName` / `smtpFromEmail` del config;
- el panel admin tiene sección "Marca" para configurar white-label si el plan lo incluye.

---

## 14. Integración ORIZON/ORIGO

### 14.1. Objetivo

Sincronización bidireccional entre la plataforma de correo y el ERP/CRM 4nexa:
- alta de cliente en ORIGO → crear tenant automáticamente;
- factura generada en ORIZON → webhook a la plataforma de correo;
- datos de uso (buzones, almacenamiento) → sincronizados a ORIGO para billing.

### 14.2. Webhook entrante (ORIZON → plataforma)

```
POST /integrations/orizon/webhook
Authorization: HMAC-SHA256 signature (shared secret)

{
  "event": "customer.created" | "invoice.paid" | "plan.changed",
  "data": { ... }
}
```

### 14.3. Webhook saliente (plataforma → ORIGO)

Eventos que la plataforma envía a ORIGO:
- `tenant.created`, `tenant.suspended`, `tenant.deleted`;
- `domain.verified`, `domain.dkim_failed`;
- `billing.usage_updated` (mensual);
- `abuse.detected`, `backup.failed`.

### 14.4. Sincronización de uso

```typescript
// Cron mensual: @Cron('0 0 1 * *')
async syncUsageToOrigo() {
  const tenants = await this.prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
  for (const tenant of tenants) {
    const usage = await this.collectUsage(tenant.id);
    await this.origoClient.post('/billing/usage', {
      tenantId: tenant.origoCustomerId,
      mailboxes: usage.mailboxCount,
      storageGb: usage.storageGb,
      domainsActive: usage.domainCount,
      period: getCurrentBillingPeriod(),
    });
  }
}
```

### 14.5. Seguridad

- webhooks entrantes validados con HMAC-SHA256;
- credenciales ORIGO/ORIZON en env vars cifradas;
- timeouts de 5s + retry x3 con backoff exponencial;
- fallos no bloquean operaciones del correo (degradación elegante).

---

## 15. Archivado Legal — Retención y Compliance

### 15.1. Objetivo

Cumplir con requisitos legales de retención de correos:
- retención configurable por tenant (1, 3, 5, 7 años);
- legal hold: congelar buzones durante investigaciones;
- exportación eDiscovery (formato MBOX / EML / PST);
- RGPD: derecho al olvido + exportación de datos personales.

### 15.2. Modelo de datos

```prisma
model ArchivalPolicy {
  id              String  @id @default(uuid())
  tenantId        String  @unique
  retentionYears  Int     @default(3)
  autoDeleteAfter Boolean @default(false)
  encryptArchive  Boolean @default(true)
  storageBackend  ArchivalStorageType @default(LOCAL_S3)
  isActive        Boolean @default(true)
  createdAt       DateTime @default(now())

  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  legalHolds LegalHold[]
}

model LegalHold {
  id          String    @id @default(uuid())
  tenantId    String
  mailboxIds  String[]
  reason      String
  requestedBy String
  startDate   DateTime  @default(now())
  endDate     DateTime?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())

  archivalPolicy ArchivalPolicy @relation(fields: [tenantId], references: [tenantId])
}

enum ArchivalStorageType {
  LOCAL_S3
  EXTERNAL_S3
  GLACIER
  AZURE_BLOB
}
```

### 15.3. RGPD — Derecho al olvido

```
DELETE /tenants/:id/gdpr/forget
  → Anonimizar datos personales en DB (nombre → [DELETED], email → hash)
  → Purgar archivos de correo del filesystem
  → Purgar backups si retención expirada
  → Registrar en GdprRequest (fecha, solicitante, acción)
  → No eliminar registros de facturación (obligación fiscal)
```

### 15.4. Exportación eDiscovery

```
POST /tenants/:id/gdpr/export
  → Generar archivo MBOX de todos los buzones del tenant
  → Cifrar con GPG (clave pública del solicitante)
  → Disponible para descarga durante 7 días
  → Registrar en AuditLog
```

---

## 16. BIMI — Brand Indicators for Message Identification

### 16.1. Objetivo

Mostrar el logo de la empresa en clientes de correo compatibles (Gmail, Apple Mail, Yahoo).

Requisitos:
- dominio con DMARC en política `reject` o `quarantine`;
- logo en formato SVG (tiny PS subset);
- certificado VMC (opcional para Gmail);
- registro DNS: `default._bimi TXT v=BIMI1;l={svg-url};a={vmc-url}`.

### 16.2. Flujo de habilitación

```
1. Admin activa BIMI para dominio (POST /domains/:id/bimi/enable)
2. CP verifica:
   - DMARC policy ≥ quarantine
   - SPF y DKIM válidos
3. Tenant sube SVG (POST /domains/:id/bimi/logo)
4. CP valida SVG (tiny PS subset, < 32KB)
5. CP almacena SVG en storage público (/bimi/{domain}/logo.svg)
6. Si DnsProvider configurado: CP crea registro BIMI automáticamente
7. Si no: CP muestra instrucciones de registro manual
8. Cron verifica cada 24h que el registro BIMI es accesible
```

### 16.3. Modelo de datos

```prisma
model BimiConfig {
  id          String  @id @default(uuid())
  domainId    String  @unique
  svgUrl      String
  vmcUrl      String?
  isActive    Boolean @default(false)
  verified    Boolean @default(false)
  verifiedAt  DateTime?
  createdAt   DateTime @default(now())

  domain Domain @relation(fields: [domainId], references: [id])
}
```

---

## 17. Advanced Analytics — Panel de Reputación

### 17.1. Dashboards nuevos en Grafana

- **Deliverability Trends**: tasa de entrega por dominio (7d / 30d / 90d);
- **Inbox Placement**: porcentaje estimado inbox vs spam;
- **Bounce Analysis**: breakdown por tipo (hard/soft/complaint);
- **Queue Heatmap**: volumen de cola por hora del día;
- **Tenant Health Matrix**: semáforo por tenant (verde/amarillo/rojo);
- **AI Insights**: predicciones del clasificador de abuso.

### 17.2. API de analytics

```
GET /analytics/domains/:id/deliverability?period=30d
GET /analytics/tenants/:id/health
GET /analytics/nodes/:id/throughput?period=7d
GET /analytics/platform/overview
```

### 17.3. Exportación de informes

- PDF generado con puppeteer (headless Chromium);
- CSV para análisis en hojas de cálculo;
- programación de envío automático por email (mensual / semanal).

---

## 18. Notificaciones Multicanal

### 18.1. Canales soportados

| Canal | Casos de uso |
|-------|-------------|
| Email | Alertas críticas, informes de uso, billing |
| Webhook | Integraciones externas, ORIZON |
| Slack | Alertas de operaciones para el equipo 4nexa |
| Microsoft Teams | Alternativa a Slack |
| SMS (Twilio) | Alertas críticas solo (backup failure, node down) |

### 18.2. Modelo de datos

```prisma
model NotificationChannel {
  id        String  @id @default(uuid())
  tenantId  String
  type      NotificationType
  config    Json    -- {webhookUrl, slackChannel, email, phone...}
  events    String[] -- ['backup.failed', 'node.down', 'abuse.detected']
  isActive  Boolean @default(true)
  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
}

enum NotificationType {
  EMAIL
  WEBHOOK
  SLACK
  TEAMS
  SMS
}
```

### 18.3. Motor de notificaciones

```typescript
@Injectable()
class NotificationService {
  // Escucha todos los eventos del EventBus
  // Filtra por suscripciones de cada tenant
  // Despacha al canal correcto con retry + DLQ
}
```

---

## 19. Modelo de Datos v3 — Extensiones

### 19.1. Resumen de tablas nuevas

| Tabla | Módulo |
|-------|--------|
| `BrainCell.embedding` | §4 — pgvector field añadido |
| `ExtractedInvoice` | §7 — AI Invoice |
| `DnsProvider` | §11 — DNS Orchestration |
| `ApiKey` | §12 — API Pública |
| `WhitelabelConfig` | §13 — White-label |
| `CalendarConfig` | §10 — SOGo |
| `ArchivalPolicy` | §15 — Archivado legal |
| `LegalHold` | §15 — Archivado legal |
| `BimiConfig` | §16 — BIMI |
| `NotificationChannel` | §18 — Notificaciones |

### 19.2. Campos nuevos en tablas existentes

```prisma
// Tenant — campos nuevos
model Tenant {
  // ... campos v2 ...
  origoCustomerId    String?          // §14 integración ORIZON
  whitelabelConfig   WhitelabelConfig?
  archivalPolicy     ArchivalPolicy?
  notificationChs    NotificationChannel[]
  apiKeys            ApiKey[]
  dnsProviders       DnsProvider[]
  extractedInvoices  ExtractedInvoice[]
}

// Domain — campos nuevos
model Domain {
  // ... campos v2 ...
  dnsProviderId  String?    // §11 DNS Orchestration
  bimiConfig     BimiConfig?
  dnsProvider    DnsProvider? @relation(fields: [dnsProviderId], references: [id])
}

// Mailbox — campos nuevos
model Mailbox {
  // ... campos v2 ...
  calendarConfig    CalendarConfig?
  extractedInvoices ExtractedInvoice[]
}
```

---

## 20. Contratos API v3

### 20.1. Nuevos endpoints

```
-- IA --
POST   /ai/abuse-analyze           Analizar riesgo de abuso de un tenant
POST   /ai/support-diagnose        Asistente de soporte
POST   /ai/classify-mail           Clasificar un email (metadata only)
GET    /ai/model-status            Estado de los modelos disponibles

-- DNS Orchestration --
POST   /dns-providers              Conectar proveedor DNS
GET    /dns-providers              Listar proveedores
DELETE /dns-providers/:id          Desconectar proveedor
POST   /domains/:id/dns/provision  Crear registros automáticamente
POST   /domains/:id/dns/verify     Verificar registros
GET    /domains/:id/dns/status     Estado de todos los registros DNS

-- API Keys --
POST   /api-keys                   Crear API key
GET    /api-keys                   Listar API keys del tenant
DELETE /api-keys/:id               Revocar API key
PATCH  /api-keys/:id/rotate        Rotar API key

-- Webmail --
POST   /auth/webmail-token         Generar token SSO para Snappymail

-- Groupware --
POST   /mailboxes/:id/calendar     Habilitar calendario
GET    /mailboxes/:id/calendars    Listar calendarios
POST   /domains/:id/free-busy      Consultar disponibilidad

-- BIMI --
POST   /domains/:id/bimi/enable    Habilitar BIMI
POST   /domains/:id/bimi/logo      Subir logo SVG
GET    /domains/:id/bimi/status    Estado BIMI

-- Archivado --
GET    /tenants/:id/archival       Política de archivado
PUT    /tenants/:id/archival       Actualizar política
POST   /tenants/:id/legal-hold     Crear legal hold
DELETE /tenants/:id/legal-hold/:id Levantar legal hold
POST   /tenants/:id/gdpr/export    Exportar datos (RGPD)
DELETE /tenants/:id/gdpr/forget    Derecho al olvido

-- White-label --
GET    /tenants/:id/whitelabel     Configuración white-label
PUT    /tenants/:id/whitelabel     Actualizar white-label

-- Analytics --
GET    /analytics/domains/:id/deliverability
GET    /analytics/tenants/:id/health
GET    /analytics/platform/overview

-- Notificaciones --
POST   /notification-channels      Crear canal
GET    /notification-channels      Listar canales
DELETE /notification-channels/:id  Eliminar canal
POST   /notification-channels/test Probar canal

-- Integraciones --
POST   /integrations/orizon/webhook  Webhook entrante ORIZON
GET    /integrations/orizon/status   Estado de sincronización
```

---

## 21. Node Agent v3 — Nuevas Operaciones

### 21.1. Operaciones nuevas requeridas

```
-- SOGo --
POST /operations/sogo/provision     Crear usuario SOGo
DELETE /operations/sogo/deprovision Eliminar usuario SOGo
POST /operations/sogo/calendar      Crear calendario
POST /operations/sogo/reload        Recargar SOGo

-- Snappymail --
POST /operations/webmail/configure  Configurar dominio en Snappymail

-- Archivado --
POST /operations/archive/export     Exportar MBOX de buzón
POST /operations/archive/purge      Purgar correos por fecha

-- BIMI --
POST /operations/bimi/serve-svg     Publicar SVG en URL pública

-- Sieve (clasificación IA) --
POST /operations/sieve/update       Actualizar reglas Sieve de un buzón
GET  /operations/sieve/get          Leer reglas Sieve actuales
```

---

## 22. Frontend v3 — Nuevas Páginas

### 22.1. Admin Panel — rutas nuevas

```
/admin/ai                      Dashboard IA (modelos, inferencias, anomalías)
/admin/ai/abuse-monitor        Monitor de abuso con clasificador
/admin/ai/invoices             Facturas extraídas (vista global)
/admin/dns-providers           Gestión proveedores DNS
/admin/whitelabel              Configuración white-label global
/admin/integrations            Integraciones externas (ORIZON, webhooks)
/admin/analytics               Analytics avanzadas
/admin/api-keys                API keys de admin
```

### 22.2. Customer Panel — rutas nuevas

```
/app/webmail                   Acceso webmail (Snappymail SSO)
/app/calendar                  CalDAV (instrucciones / configuración)
/app/contacts                  CardDAV (instrucciones / configuración)
/app/domains/:id/bimi          Configuración BIMI por dominio
/app/domains/:id/dns           Orquestación DNS (si proveedor conectado)
/app/ai/invoices               Facturas extraídas del buzón
/app/api-keys                  Gestión de API keys del tenant
/app/data-privacy              RGPD: exportar / derecho al olvido
/app/notifications             Configurar canales de notificación
```

---

## 23. Arquitectura Testing v3

### 23.1. Nuevas suites

| Suite | Tipo | Mínimo |
|-------|------|--------|
| AI Engine | Unit | 20 tests |
| DNS Orchestration | Unit + Integration mock | 15 tests |
| API Keys + Rate Limit | Unit | 12 tests |
| White-label | Unit | 8 tests |
| BIMI | Unit | 8 tests |
| Archival / RGPD | Unit | 15 tests |
| Notification Channels | Unit | 10 tests |
| Integración ORIZON | Unit + mock webhook | 12 tests |

### 23.2. E2E nuevos

- flujo completo de onboarding con DNS automático;
- flujo SSO webmail;
- flujo extracción factura;
- flujo derecho al olvido RGPD.

---

## 24. CI/CD v3 — Extensiones

### 24.1. Nuevos jobs en ci.yml

```yaml
ai-model-check:
  # Verifica que los modelos ONNX / Ollama están disponibles
  # Solo en entorno staging

snappymail-health:
  # Smoke test del webmail (login + IMAP connection)

dns-provider-mock:
  # Tests de integración contra mock de Cloudflare API

orizon-webhook-test:
  # Tests de validación HMAC y procesamiento de webhooks
```

### 24.2. Gestión de secretos adicionales

Nuevas env vars requeridas:
```
OPENAI_API_KEY          (si se usa OpenAI)
OLLAMA_BASE_URL         (si se usa Ollama local)
CLOUDFLARE_API_TOKEN    (DNS provider)
ORIZON_WEBHOOK_SECRET   (HMAC validation)
ORIGO_API_URL           (URL del ERP)
ORIGO_API_KEY           (credencial ERP)
TWILIO_ACCOUNT_SID      (SMS opcional)
TWILIO_AUTH_TOKEN       (SMS opcional)
SNAPPYMAIL_ADMIN_PASS   (webmail admin)
```

---

## 25. Migration Guide v2 → v3

### 25.1. Migraciones de base de datos

```bash
# Aplicar en orden
prisma migrate deploy  # aplica migrations pendientes de v3
```

Nuevas migrations:
```
20260601000001_add_pgvector_extension
20260601000002_add_brain_cell_embedding
20260601000003_add_extracted_invoices
20260601000004_add_dns_providers
20260601000005_add_api_keys
20260601000006_add_whitelabel_config
20260601000007_add_calendar_config
20260601000008_add_archival_policy
20260601000009_add_legal_hold
20260601000010_add_bimi_config
20260601000011_add_notification_channels
20260601000012_add_tenant_v3_fields
```

### 25.2. Configuración nueva en .env

Todas las nuevas env vars son **opcionales** con degradación elegante:
- sin `OPENAI_API_KEY` ni `OLLAMA_BASE_URL`: módulo IA deshabilitado;
- sin `CLOUDFLARE_API_TOKEN`: DNS en modo manual;
- sin `ORIGO_API_URL`: integración ORIZON deshabilitada.

### 25.3. Activación por feature flag

```typescript
// services/control-plane-api/src/config/features.config.ts
export const FEATURES = {
  AI_ENGINE:        process.env.FEATURE_AI === 'true',
  DNS_ORCHESTRATION: process.env.FEATURE_DNS_ORCH === 'true',
  WEBMAIL:          process.env.FEATURE_WEBMAIL === 'true',
  GROUPWARE:        process.env.FEATURE_GROUPWARE === 'true',
  BIMI:             process.env.FEATURE_BIMI === 'true',
  ARCHIVAL:         process.env.FEATURE_ARCHIVAL === 'true',
  WHITELABEL:       process.env.FEATURE_WHITELABEL === 'true',
  ORIZON:           process.env.FEATURE_ORIZON === 'true',
};
```

---

## 26. Diagramas v3

Debe existir versión visual de:
- arquitectura v3 global (extensión del diagrama v2);
- pipeline IA (event → embedding → inference → action);
- flujo DNS automático (provisioning → verify → drift detection);
- flujo webmail SSO (Customer Panel → Snappymail → IMAP);
- arquitectura groupware SOGo (CalDAV/CardDAV sync);
- flujo RGPD (export + forget);
- integración ORIZON bidireccional.

---

## 27. Production Readiness Checklist v3

### 27.1. IA

- [ ] modelo LLM configurado (Ollama local recomendado en producción);
- [ ] pgvector extensión habilitada en PostgreSQL;
- [ ] umbrales de abuse classifier revisados y calibrados;
- [ ] opt-in de tenants para clasificación de correo documentado.

### 27.2. Webmail / Groupware

- [ ] Snappymail desplegado y accesible;
- [ ] SOGo desplegado y accesible;
- [ ] SSO funcional (token → auto-login);
- [ ] TLS en todos los endpoints de groupware.

### 27.3. DNS Orchestration

- [ ] credenciales de DNS providers cifradas en DB;
- [ ] cron de verificación DNS activo;
- [ ] alertas de dns.drift configuradas en Alertmanager.

### 27.4. Compliance

- [ ] política de archivado configurada por tenant;
- [ ] proceso de derecho al olvido documentado y probado;
- [ ] legal hold probado en staging;
- [ ] exportación eDiscovery verificada.

### 27.5. API Pública

- [ ] Swagger UI accesible en /api-docs;
- [ ] rate limiting validado con prueba de carga;
- [ ] rotación de API keys probada;
- [ ] scopes validados (no privilege escalation).

---

## 28. Arquitectura de Seguridad v3

### 28.1. Nuevas superficies de ataque

| Superficie | Mitigación |
|-----------|-----------|
| API Keys en BD | Solo hash bcrypt almacenado, valor solo en creación |
| Credenciales DNS | AES-256-GCM + audit log por operación |
| LLM prompts | Sanitización de inputs, no incluir secrets en prompts |
| Webhook entrante ORIZON | HMAC-SHA256 verificación obligatoria |
| SSO Snappymail | JWT corta duración (15 min), single-use |
| Archivos SVG BIMI | Validación MIME + tamaño + formato tiny PS |

### 28.2. OWASP Top 10 — checklist v3

- **A01 Broken Access Control**: scopes en API keys, ownership en todos los endpoints;
- **A02 Cryptographic Failures**: bcrypt para API keys, AES-256-GCM para DNS creds;
- **A03 Injection**: Zod validation en todos los DTOs, no SQL dinámico;
- **A04 Insecure Design**: rate limiting, no exposición de stack traces;
- **A05 Security Misconfiguration**: feature flags off by default en prod;
- **A06 Vulnerable Components**: npm audit en CI/CD;
- **A07 Auth Failures**: API keys no reutilizables, expiry configurable;
- **A09 Logging Failures**: audit log de todas las operaciones sensibles.

---

## 29. SLA v3

- disponibilidad objetivo: **99,9%** (v2 era 99,5%);
- módulos IA: best-effort (no SLA de latencia de inferencia);
- DNS Orchestration: propagación < 60s tras crear registro;
- Webmail: misma disponibilidad que el stack de correo;
- soporte: horario laboral (v3 no cambia esto).

---

## 30. Roadmap de implementación v3

### Fase 1 — Fundamentos (prerequisito para todo lo demás)

- pgvector en PostgreSQL + extensión Brain;
- API Keys + rate limiting;
- feature flags system.

### Fase 2 — Groupware básico

- Snappymail (webmail);
- SOGo (CalDAV/CardDAV);
- SSO básico.

### Fase 3 — IA Operacional

- AI Abuse Detection (clasificador ML);
- AI Mail Classification;
- Support Assistant (pgvector + LLM).

### Fase 4 — Integraciones

- DNS Orchestration (Cloudflare + Hetzner DNS);
- Notificaciones multicanal;
- Integración ORIZON/ORIGO.

### Fase 5 — Compliance y Diferenciación

- Archivado legal + RGPD avanzado;
- BIMI;
- AI Invoice Extraction;
- White-label completo;
- API pública OpenAPI.

---

## 31. Conclusión

El Paper Técnico v3 define la evolución de 4nexa Mailgun de **plataforma operacional** a **plataforma cognitiva de comunicaciones empresariales**.

v3 introduce:
- inteligencia real (IA operacional, pgvector, LLMs);
- groupware completo (webmail + CalDAV/CardDAV);
- superficie de integración (API pública, ORIZON, DNS automático);
- compliance enterprise (archivado legal, RGPD, BIMI);
- modelo white-label para agencias.

Todo ello manteniendo los principios de v2:
- sin sobreingeniería;
- rollback controlado;
- observabilidad primero;
- aislamiento multi-tenant.

4nexa Mailgun v3 queda definido como:

> **infraestructura cognitiva de correo empresarial — diferenciada, integrada y conforme.**
