# Paper Técnico v1 — Plataforma Propia de Correo Gestionado

**Nombre provisional:** ORIZON Mail Core
**Alternativas:** NexaMail Core, ConfiMail Platform, MailForge, NovaMail Suite.

---

## 1. Resumen ejecutivo

El objetivo del proyecto es diseñar y desarrollar una plataforma propia de correo electrónico gestionado, inspirada conceptualmente en soluciones como Mailcow, Mailu, iRedMail, IONOS Mail, Zoho Mail o Fastmail, pero construida desde cero bajo una arquitectura propia, modular, escalable y comercializable.

La plataforma no debe ser un fork de Mailcow ni una personalización de su código. El enfoque correcto es realizar un diseño clean-room, estudiando patrones técnicos de plataformas existentes, pero desarrollando código, panel, APIs, orquestación, automatización, documentación, branding y lógica comercial completamente propios.

La finalidad comercial es ofrecer correo empresarial gestionado a clientes propios, pymes, proyectos web, clientes de ORIZON/ORIGO y empresas que necesiten una alternativa profesional a los proveedores tradicionales.

El producto debe combinar:
- correo profesional multi-dominio;
- panel de administración SaaS;
- panel para clientes;
- facturación integrada;
- automatización de despliegue;
- control de reputación IP;
- backups verificables;
- monitorización;
- seguridad avanzada;
- integración futura con IA, ERP, CRM y gestión documental.

La infraestructura inicial recomendada se basa en servidores dedicados de Hetzner Server Auction, con Ubuntu Server, contenedores Docker/Podman, almacenamiento redundante y despliegue automatizado.

---

## 2. Principios rectores del proyecto

### 2.1. No copiar código GPL de terceros

Aunque se auditen soluciones como Mailcow, el proyecto debe evitar copiar código, estructura interna exacta, scripts, nombres, assets, textos o lógica propietaria de otros proyectos.

La plataforma debe usar componentes open source maduros, pero integrados mediante configuración y código propio.

### 2.2. Producto propio, no "Mailcow revendible"

El objetivo no es vender Mailcow, sino crear una suite propia:

> Panel propio + Control Plane + Mail Nodes + Automatización + Billing + IA

Los componentes de bajo nivel, como Postfix, Dovecot o Rspamd, son piezas técnicas internas. El valor comercial estará en la experiencia, estabilidad, automatización, soporte, integración y servicio gestionado.

### 2.3. Modularidad antes que monolito

La plataforma debe poder crecer por módulos:
- SMTP;
- IMAP;
- antispam;
- antivirus;
- webmail;
- calendario/contactos;
- panel admin;
- panel cliente;
- API;
- billing;
- backups;
- monitorización;
- IA;
- auditoría;
- multi-nodo.

### 2.4. Seguridad por diseño

El correo electrónico es una infraestructura crítica. Un error puede provocar:
- relay abierto;
- fuga de datos;
- cuentas comprometidas;
- spam saliente;
- bloqueo de IPs;
- pérdida de reputación;
- pérdida de correos;
- incumplimiento normativo.

La seguridad no debe añadirse al final. Debe estar en la arquitectura desde el inicio.

### 2.5. Operación comercial realista

La plataforma debe diseñarse pensando en vender servicio, no solo en funcionar técnicamente.

Por tanto, debe incluir:
- planes;
- límites;
- cuotas;
- suspensión automática;
- métricas por cliente;
- facturación;
- trazabilidad;
- soporte;
- alertas;
- restauración;
- control de abuso.

---

## 3. Objetivo funcional

Crear una plataforma capaz de ofrecer:

1. Alta de clientes.
2. Alta de dominios.
3. Verificación DNS.
4. Creación de buzones.
5. Gestión de aliases.
6. Gestión de cuotas.
7. Webmail.
8. IMAP/SMTP seguro.
9. Antispam.
10. Antivirus.
11. DKIM/SPF/DMARC asistidos.
12. Monitorización de colas.
13. Control de reputación.
14. Backups por buzón/dominio/cliente.
15. Restauración granular.
16. Facturación por plan.
17. Soporte técnico.
18. API de automatización.
19. Escalado por nodos.
20. Integración futura con IA.

---

## 4. Alcance de la versión 1

La versión 1 debe ser funcional, segura y comercializable en entorno controlado.

### 4.1. Incluido en v1

- Nodo único de correo.
- Instalación automatizada en Ubuntu Server.
- Docker Compose o Podman Compose.
- SMTP entrante y saliente.
- IMAP seguro.
- Panel admin básico.
- Panel cliente básico.
- Gestión de dominios.
- Gestión de buzones.
- Gestión de aliases.
- Antispam con Rspamd.
- Antivirus opcional con ClamAV.
- Webmail.
- Certificados TLS automáticos.
- Backups automatizados.
- API interna.
- Monitorización básica.
- Logs centralizados básicos.
- Sistema de planes y cuotas.
- Comprobador DNS.

### 4.2. No incluido en v1

- Alta disponibilidad real.
- Multi-nodo automático completo.
- Migración automática entre nodos.
- IA avanzada.
- Marketplace.
- Aplicación móvil.
- Kubernetes.
- Clustering complejo.
- MTA distribuido.

---

## 5. Alcance de la versión 2

La versión 2 debe convertir el producto en una plataforma escalable.

Incluye:
- Control Plane multi-nodo.
- Provisioning remoto de nodos.
- Balanceo de clientes por nodo.
- Métricas centralizadas.
- Reputación IP por nodo.
- Sistema de alertas avanzado.
- Backups externos cifrados.
- Portal de soporte.
- Facturación completa.
- Integración con ORIZON/ORIGO.
- API pública.
- Importación desde otros proveedores.
- Auditoría de entregabilidad.

---

## 6. Alcance de la versión 3

La versión 3 debe diferenciar el producto frente a proveedores genéricos.

Incluye:
- IA para clasificación de correo.
- IA para extracción de facturas.
- IA para detección de abuso.
- IA para soporte técnico.
- Workflows empresariales.
- Integración con CRM/ERP.
- Archivado legal.
- Auditoría documental.
- Panel avanzado de reputación.
- Motor de reglas visuales.
- Servicio white-label para agencias.

---

## 7. Auditoría conceptual de Mailcow como referencia

Mailcow demuestra que una suite moderna de correo puede construirse mediante contenedores conectados en una red interna.

Conceptualmente, su valor está en:
- empaquetar componentes maduros;
- automatizar configuración;
- ofrecer panel de administración;
- gestionar dominios, usuarios, aliases y cuotas;
- integrar antispam, antivirus, webmail y certificados;
- simplificar una infraestructura históricamente compleja.

### 7.1. Lecciones positivas

- Docker reduce fricción de instalación.
- La integración de Postfix + Dovecot + Rspamd es sólida.
- Un panel web mejora enormemente la administración.
- El enfoque all-in-one acelera adopción.
- La API permite automatización.
- El sistema de actualización es clave.

### 7.2. Limitaciones a superar

- Arquitectura demasiado centrada en instancia única.
- Dificultad para convertirlo directamente en SaaS multi-nodo.
- Panel más técnico que comercial.
- Billing inexistente de forma nativa.
- Multi-tenant comercial limitado.
- Escalado horizontal no nativo.
- Personalización profunda condicionada por licencia/marca.

### 7.3. Conclusión de auditoría

Mailcow es una excelente referencia técnica, pero no debe ser el producto final si el objetivo es crear una plataforma propia vendible. La oportunidad está en construir una arquitectura inspirada en el concepto, pero pensada desde el primer día como producto SaaS gestionado.

---

## 8. Arquitectura general propuesta

```
[Cliente final]
      │
      ▼
[Panel Cliente]
      │
      ▼
[API Plataforma]
      │
      ├── Billing Service
      ├── Tenant Service
      ├── Domain Service
      ├── Mailbox Service
      ├── DNS Verification Service
      ├── Backup Service
      ├── Monitoring Service
      ├── Abuse Control Service
      └── Node Orchestrator
              │
              ▼
        [Mail Node]
              │
              ├── SMTP Service
              ├── IMAP Service
              ├── Antispam Service
              ├── Antivirus Service
              ├── Webmail Service
              ├── Cert Service
              ├── Local DB
              ├── Queue Monitor
              └── Backup Agent
```

---

## 9. División entre Control Plane y Mail Nodes

### 9.1. Control Plane

El Control Plane es el cerebro de la plataforma.

Responsabilidades:
- gestionar clientes;
- gestionar planes;
- asignar clientes a nodos;
- crear dominios;
- crear buzones;
- gestionar cuotas;
- verificar DNS;
- recibir métricas;
- gestionar facturación;
- suspender servicios;
- activar restauraciones;
- controlar abuso;
- desplegar nuevos nodos.

Debe poder vivir en un servidor separado del correo.

### 9.2. Mail Node

El Mail Node es el servidor que realmente procesa correo.

Responsabilidades:
- recibir correo;
- enviar correo;
- almacenar buzones;
- servir IMAP;
- servir webmail;
- filtrar spam;
- aplicar antivirus;
- reportar métricas;
- ejecutar backups;
- aplicar configuración enviada por el Control Plane.

### 9.3. Ventaja de esta separación

Permite crecer así:

```
Control Plane único
    ├── Mail Node 1
    ├── Mail Node 2
    ├── Mail Node 3
    └── Mail Node N
```

Esto evita que la plataforma nazca bloqueada en una sola máquina.

---

## 10. Stack técnico recomendado

### 10.1. Sistema operativo

- Ubuntu Server 24.04 LTS.
- Instalación mínima.
- SSH por llave.
- Sin paneles externos tipo Plesk/cPanel en los nodos de correo.

### 10.2. Contenedores

Opción inicial:
- Docker Engine.
- Docker Compose.

Opción futura:
- Podman.
- Nomad.
- Kubernetes solo si la escala lo justifica.

### 10.3. SMTP

**Postfix.**

Motivos:
- madurez;
- estabilidad;
- documentación amplia;
- soporte para políticas, mapas, restricciones y colas;
- excelente integración con Dovecot y Rspamd.

### 10.4. IMAP/POP3

**Dovecot.**

Motivos:
- estándar de facto;
- soporte Maildir;
- LMTP;
- cuotas;
- Sieve;
- autenticación flexible;
- rendimiento sólido.

### 10.5. Antispam

**Rspamd.**

Motivos:
- moderno;
- rápido;
- flexible;
- integración DKIM/DMARC/SPF;
- scoring avanzado;
- posibilidad de aprendizaje.

### 10.6. Antivirus

**ClamAV** como opción activable por plan.

No todos los clientes necesitarán antivirus pesado. Debe poder activarse/desactivarse para optimizar recursos.

### 10.7. Webmail

Opciones:
1. SnappyMail.
2. Roundcube.
3. SOGo.

Recomendación v1: SnappyMail o Roundcube para webmail simple.
SOGo en v2/v3 para groupware completo.

### 10.8. Calendarios/contactos

Opciones:
- Radicale.
- Baïkal.
- SOGo.

Recomendación:
- v1: opcional.
- v2: Radicale/Baïkal.
- v3: groupware completo.

### 10.9. Base de datos

Para Control Plane: PostgreSQL.
Para Mail Node: PostgreSQL o MariaDB.

Recomendación: PostgreSQL como base estratégica del producto propio.

### 10.10. Cache y eventos

- Redis.
- NATS opcional en v2.

### 10.11. Proxy web

- Caddy o Nginx.

Recomendación: Caddy para simplificar certificados en v1. Nginx si se necesita mayor control.

### 10.12. Backups

- Restic.
- BorgBackup como alternativa.

Recomendación: Restic por simplicidad, cifrado y compatibilidad con S3.

### 10.13. Monitorización

v1:
- Node Exporter.
- cAdvisor.
- logs Docker.
- health checks propios.

v2:
- Prometheus.
- Grafana.
- Loki.
- Alertmanager.

---

## 11. Estructura del repositorio propio

```
orizon-mail-core/
├── README.md
├── LICENSE
├── docs/
│   ├── architecture/
│   ├── deployment/
│   ├── security/
│   ├── api/
│   ├── operations/
│   └── commercial/
├── deploy/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── docker-compose.dev.yml
│   ├── ansible/
│   ├── terraform/
│   └── hetzner/
├── services/
│   ├── control-plane-api/
│   ├── admin-ui/
│   ├── customer-ui/
│   ├── node-agent/
│   ├── dns-checker/
│   ├── billing-service/
│   ├── backup-service/
│   ├── abuse-service/
│   ├── monitoring-service/
│   └── migration-service/
├── mail-node/
│   ├── postfix/
│   ├── dovecot/
│   ├── rspamd/
│   ├── clamav/
│   ├── webmail/
│   ├── proxy/
│   ├── certs/
│   └── templates/
├── packages/
│   ├── shared-types/
│   ├── sdk-js/
│   └── config-engine/
├── scripts/
│   ├── install.sh
│   ├── update.sh
│   ├── backup.sh
│   ├── restore.sh
│   ├── healthcheck.sh
│   └── rotate-keys.sh
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── deliverability/
└── .github/
    └── workflows/
```

---

## 12. Modelo de datos principal

### 12.1. Tenant

Representa un cliente comercial.

Campos:
- id;
- name;
- legal_name;
- billing_email;
- status;
- plan_id;
- node_id;
- created_at;
- suspended_at;
- notes.

Estados:
- active;
- trial;
- suspended;
- cancelled;
- pending_dns;
- pending_payment.

### 12.2. Domain

Representa un dominio gestionado.

Campos:
- id;
- tenant_id;
- domain;
- status;
- dkim_selector;
- dkim_public_key;
- dns_verified_at;
- mx_verified;
- spf_verified;
- dkim_verified;
- dmarc_verified;
- created_at.

### 12.3. Mailbox

Representa un buzón.

Campos:
- id;
- tenant_id;
- domain_id;
- local_part;
- email;
- quota_mb;
- used_mb;
- status;
- password_hash_ref;
- force_password_reset;
- last_login_at;
- created_at.

### 12.4. Alias

Campos:
- id;
- tenant_id;
- domain_id;
- source;
- destination;
- active;
- created_at.

### 12.5. Plan

Campos:
- id;
- name;
- max_domains;
- max_mailboxes;
- storage_total_mb;
- storage_per_mailbox_mb;
- outbound_daily_limit;
- antivirus_enabled;
- backup_retention_days;
- price_monthly;
- price_yearly.

### 12.6. Node

Campos:
- id;
- hostname;
- ip_v4;
- ip_v6;
- provider;
- region;
- status;
- capacity_score;
- reputation_score;
- max_tenants;
- current_tenants;
- created_at;
- last_seen_at.

### 12.7. BackupJob

Campos:
- id;
- tenant_id;
- domain_id;
- mailbox_id;
- node_id;
- type;
- status;
- started_at;
- completed_at;
- size_mb;
- repository;
- error_message.

### 12.8. AbuseEvent

Campos:
- id;
- tenant_id;
- mailbox_id;
- node_id;
- type;
- severity;
- message;
- detected_at;
- action_taken;
- resolved_at.

---

## 13. API propuesta

### 13.1. Tenants

```
POST   /api/v1/tenants
GET    /api/v1/tenants
GET    /api/v1/tenants/{id}
PATCH  /api/v1/tenants/{id}
POST   /api/v1/tenants/{id}/suspend
POST   /api/v1/tenants/{id}/reactivate
```

### 13.2. Domains

```
POST   /api/v1/domains
GET    /api/v1/domains
GET    /api/v1/domains/{id}
DELETE /api/v1/domains/{id}
POST   /api/v1/domains/{id}/verify-dns
GET    /api/v1/domains/{id}/dns-instructions
```

### 13.3. Mailboxes

```
POST   /api/v1/mailboxes
GET    /api/v1/mailboxes
GET    /api/v1/mailboxes/{id}
PATCH  /api/v1/mailboxes/{id}
POST   /api/v1/mailboxes/{id}/reset-password
POST   /api/v1/mailboxes/{id}/suspend
DELETE /api/v1/mailboxes/{id}
```

### 13.4. Aliases

```
POST   /api/v1/aliases
GET    /api/v1/aliases
PATCH  /api/v1/aliases/{id}
DELETE /api/v1/aliases/{id}
```

### 13.5. Nodes

```
POST /api/v1/nodes
GET  /api/v1/nodes
GET  /api/v1/nodes/{id}/health
GET  /api/v1/nodes/{id}/capacity
GET  /api/v1/nodes/{id}/reputation
POST /api/v1/nodes/{id}/maintenance
```

### 13.6. Backups

```
POST /api/v1/backups/run
GET  /api/v1/backups/jobs
POST /api/v1/backups/{id}/restore
GET  /api/v1/backups/status
```

### 13.7. Deliverability

```
GET  /api/v1/deliverability/domain/{domain_id}
GET  /api/v1/deliverability/node/{node_id}
POST /api/v1/deliverability/test
```

---

## 14. Servicios internos

### 14.1. Control Plane API

Responsable de toda la lógica central.

Tecnologías recomendadas:
- NestJS + TypeScript; o
- FastAPI + Python.

Recomendación para este proyecto: **NestJS + PostgreSQL + Prisma**

### 14.2. Admin UI

Panel interno para operadores.

Tecnologías: `Next.js + TailwindCSS + Shadcn/UI + Zustand`

Secciones:
- dashboard global;
- clientes;
- dominios;
- buzones;
- nodos;
- colas;
- reputación;
- backups;
- facturación;
- alertas;
- logs;
- abuso;
- soporte.

### 14.3. Customer UI

Panel para cliente final.

Funciones:
- ver dominios;
- crear buzones;
- crear aliases;
- cambiar contraseñas;
- ver instrucciones DNS;
- ver uso de almacenamiento;
- abrir tickets;
- ver facturas;
- acceder al webmail.

### 14.4. Node Agent

Servicio instalado en cada Mail Node.

Responsabilidades:
- recibir configuración desde Control Plane;
- renderizar plantillas Postfix/Dovecot/Rspamd;
- aplicar cambios de forma transaccional;
- reiniciar servicios solo cuando sea necesario;
- reportar salud;
- reportar almacenamiento;
- reportar cola SMTP;
- ejecutar backups;
- detectar abuso;
- aplicar suspensión de buzones/dominios.

**Seguridad obligatoria:**
- autenticación mTLS;
- tokens rotatorios;
- permisos mínimos;
- logs auditables;
- comandos permitidos explícitos;
- sin ejecución arbitraria remota.

### 14.5. DNS Checker

Servicio encargado de verificar:
- A;
- AAAA;
- MX;
- SPF;
- DKIM;
- DMARC;
- PTR;
- MTA-STS;
- TLS-RPT.

Debe mostrar al cliente instrucciones exactas y estado visual.

### 14.6. Backup Service

Responsable de:
- programar backups;
- comprobar integridad;
- registrar resultados;
- permitir restauración;
- alertar si falla;
- gestionar retención.

### 14.7. Abuse Service

Responsable de detectar:
- envío masivo anómalo;
- credenciales comprometidas;
- rebotes excesivos;
- spam saliente;
- autenticaciones fallidas;
- conexiones sospechosas;
- uso abusivo por cliente.

Acciones:
- limitar envío;
- bloquear buzón;
- suspender dominio;
- notificar administrador;
- abrir incidente.

---

## 15. Configuración del Mail Node

### 15.1. Servicios mínimos

```
mail-node/
├── postfix
├── dovecot
├── rspamd
├── redis
├── postgres
├── webmail
├── caddy/nginx
├── cert-manager
├── node-agent
└── backup-agent
```

### 15.2. Puertos requeridos

```
25    SMTP entrante
465   SMTPS
587   Submission
993   IMAPS
995   POP3S opcional
80    HTTP ACME
443   HTTPS panel/webmail
4190  ManageSieve opcional
```

### 15.3. Puertos no expuestos públicamente

- PostgreSQL;
- Redis;
- Rspamd backend;
- APIs internas;
- métricas internas.

Todos deben quedar en red privada del nodo o accesibles solo por WireGuard/mTLS.

---

## 16. Motor de configuración

### 16.1. Principios

- No escribir configuración directamente desde formularios.
- Validar todos los cambios.
- Renderizar plantillas.
- Probar sintaxis antes de aplicar.
- Aplicar cambios de forma atómica.
- Poder hacer rollback.

### 16.2. Flujo recomendado

```
Cambio solicitado
    ↓
Validación API
    ↓
Persistencia en DB
    ↓
Evento hacia Node Agent
    ↓
Renderizado de plantillas
    ↓
Validación sintáctica
    ↓
Aplicación a staging path
    ↓
Reload controlado
    ↓
Health check
    ↓
Confirmación al Control Plane
```

### 16.3. Prevención de bugs

Cada cambio debe tener:
- schema validation;
- test unitario;
- test de plantilla;
- validación en contenedor;
- rollback si falla.

---

## 17. Seguridad

### 17.1. Seguridad del servidor

- SSH solo por llave.
- Root login deshabilitado.
- UFW o nftables.
- Fail2Ban/CrowdSec.
- Actualizaciones automáticas de seguridad.
- Kernel livepatch si aplica.
- Backups externos.
- Monitorización de disco.
- Alertas por CPU/RAM/cola.

### 17.2. Seguridad del correo

- No permitir open relay.
- Submission autenticado obligatorio.
- TLS obligatorio en submission.
- DKIM por dominio.
- SPF asistido.
- DMARC recomendado.
- Rate limits por buzón.
- Rate limits por dominio.
- Bloqueo tras intentos fallidos.
- Password policy.
- 2FA en paneles.

### 17.3. Seguridad de API

- JWT de corta duración.
- Refresh tokens seguros.
- mTLS entre Control Plane y Node Agents.
- API keys rotables.
- Scopes por servicio.
- Auditoría de acciones.
- Protección CSRF en UI.
- Rate limiting.

### 17.4. Seguridad multi-tenant

Cada tenant debe estar lógicamente aislado:
- cuotas separadas;
- dominios separados;
- buzones separados;
- permisos separados;
- logs filtrados por tenant;
- backups restaurables por tenant.

---

## 18. Entregabilidad

### 18.1. Requisitos mínimos por dominio

- MX correcto.
- SPF correcto.
- DKIM activo.
- DMARC activo.
- TLS válido.
- HELO/EHLO consistente.

### 18.2. Requisitos mínimos por nodo

- PTR/rDNS correcto.
- Hostname coherente.
- IP limpia.
- Sin listas negras.
- Cola controlada.
- Rebotes monitorizados.
- No enviar campañas desde nodos compartidos sin control.

### 18.3. Panel de entregabilidad

Debe mostrar:
- estado DNS;
- estado DKIM;
- estado DMARC;
- reputación IP;
- blacklist check;
- volumen saliente;
- tasa de rebote;
- tasa de deferred;
- cola SMTP;
- alertas Microsoft/Gmail si se integran.

### 18.4. Warm-up de IP

Para nuevos nodos:
- limitar envío diario;
- priorizar correos reales;
- evitar newsletters;
- monitorizar bounces;
- subir límites progresivamente.

---

## 19. Backups y restauración

### 19.1. Tipos de backup

- backup completo del nodo;
- backup de configuración;
- backup de base de datos;
- backup de buzones;
- backup por tenant;
- backup por dominio;
- backup por buzón.

### 19.2. Retención sugerida

| Plan | Retención |
|------|-----------|
| Básico | 7 días |
| Business | 30 días |
| Premium | 90 días |

### 19.3. Restauración

Debe permitir:
- restaurar buzón completo;
- restaurar dominio;
- restaurar cliente;
- restaurar configuración;
- exportar buzón;
- restaurar en ubicación alternativa.

### 19.4. Prevención de bugs en backups

> **Regla fundamental: Un backup no probado no existe.**

Por tanto:
- test de restauración semanal automatizado;
- checksum;
- alerta si no hay backup reciente;
- alerta si backup pesa 0;
- alerta si cambia demasiado el tamaño;
- simulacro de disaster recovery mensual.

---

## 20. Monitorización

### 20.1. Métricas de nodo

- CPU;
- RAM;
- disco;
- inodes;
- red;
- contenedores activos;
- reinicios;
- latencia;
- certificados próximos a expirar.

### 20.2. Métricas de correo

- mensajes entrantes;
- mensajes salientes;
- cola;
- deferred;
- bounced;
- rejected;
- spam detectado;
- virus detectados;
- autenticaciones fallidas;
- logins IMAP;
- uso por buzón.

### 20.3. Alertas críticas

- disco > 85%;
- cola SMTP creciendo;
- muchos deferred hacia Microsoft/Gmail;
- certificado expirando;
- backup fallido;
- contenedor caído;
- IP listada en blacklist;
- spam saliente anómalo;
- contraseña comprometida;
- demasiados intentos de login.

---

## 21. Sistema de facturación

### 21.1. Entidades

- Customer.
- Subscription.
- Plan.
- Invoice.
- Payment.
- UsageRecord.
- Addon.

### 21.2. Integración recomendada

- Stripe para pagos internacionales.
- Facturación propia integrada en ORIZON para España/UE.

### 21.3. Suspensión automática

```
Factura vencida
    ↓
Recordatorio 1
    ↓
Recordatorio 2
    ↓
Suspensión parcial
    ↓
Suspensión total
    ↓
Retención temporal
    ↓
Eliminación programada
```

La suspensión debe evitar pérdida accidental de datos.

---

## 22. Panel de administración

### 22.1. Dashboard global

Debe mostrar:
- clientes activos;
- dominios activos;
- buzones activos;
- nodos;
- almacenamiento usado;
- estado de backups;
- alertas;
- cola SMTP;
- reputación IP.

### 22.2. Clientes

Funciones: alta, edición, suspensión, cambio de plan, ver uso, ver facturas, ver dominios, ver buzones, ver tickets.

### 22.3. Dominios

Funciones: alta dominio, instrucciones DNS, verificación, DKIM, aliases globales, catch-all controlado, logs por dominio.

### 22.4. Buzones

Funciones: crear, suspender, reset password, cambiar cuota, ver uso, ver últimos accesos, ver alertas de abuso.

### 22.5. Nodos

Funciones: ver salud, ver capacidad, ver reputación, ver colas, poner en mantenimiento, asignar nuevos clientes, bloquear altas.

---

## 23. Panel de cliente

### 23.1. Funciones mínimas

- dashboard;
- dominios;
- buzones;
- aliases;
- webmail;
- consumo;
- DNS;
- facturas;
- soporte;
- seguridad.

### 23.2. Seguridad del cliente

- 2FA;
- usuarios con roles;
- logs de acciones;
- cambio de contraseña;
- recuperación segura.

Roles sugeridos:
- propietario;
- administrador;
- técnico;
- usuario buzón;
- facturación.

---

## 24. Sistema de roles

### 24.1. Roles internos

- Super Admin.
- Platform Admin.
- Support Agent.
- Billing Agent.
- Abuse Analyst.
- Read-only Auditor.

### 24.2. Roles cliente

- Owner.
- Admin.
- Billing.
- Mail Manager.
- Mailbox User.

### 24.3. Prevención de bugs de permisos

Todos los endpoints deben comprobar:
- identidad;
- tenant;
- rol;
- scope;
- estado del cliente;
- estado del recurso.

> Nunca confiar solo en la UI.

---

## 25. Sistema de eventos

La plataforma debe registrar eventos importantes:
- cliente creado;
- dominio verificado;
- buzón creado;
- contraseña cambiada;
- backup completado;
- backup fallido;
- abuso detectado;
- nodo caído;
- factura vencida;
- servicio suspendido.

Estos eventos alimentarán: logs, auditoría, notificaciones, automatizaciones, IA futura.

---

## 26. Estrategia de despliegue

### 26.1. Instalación inicial v1

1. Crear servidor Hetzner Auction
2. Instalar Ubuntu Server 24.04
3. Configurar hostname
4. Configurar SSH seguro
5. Configurar firewall
6. Instalar Docker
7. Desplegar Mail Node
8. Desplegar Control Plane
9. Configurar DNS base
10. Verificar PTR/rDNS
11. Ejecutar tests de salud
12. Crear primer dominio
13. Enviar prueba de correo
14. Verificar entregabilidad
15. Activar backups

### 26.2. Automatización

- Ansible para configuración.
- Terraform para infraestructura si se usa API de proveedor.
- Scripts Bash solo para bootstrap.

### 26.3. Principio de idempotencia

Los scripts deben poder ejecutarse varias veces sin romper el servidor.

---

## 27. Testing

### 27.1. Tests unitarios

- validadores de dominios;
- validadores de email;
- límites de plan;
- permisos;
- generación de configuración;
- cálculo de cuotas;
- lógica de suspensión.

### 27.2. Tests de integración

- crear tenant;
- crear dominio;
- crear buzón;
- enviar correo local;
- recibir correo local;
- autenticar IMAP;
- aplicar alias;
- ejecutar backup;
- restaurar backup.

### 27.3. Tests de seguridad

- relay abierto;
- bypass de tenant;
- fuerza bruta;
- API sin token;
- token caducado;
- usuario suspendido;
- dominio suspendido;
- subida de cuota no permitida.

### 27.4. Tests de entregabilidad

- SPF válido;
- DKIM firma;
- DMARC pasa;
- PTR correcto;
- TLS correcto;
- HELO coherente.

### 27.5. Tests E2E

Flujo completo:

> Alta cliente → dominio → DNS → buzón → login webmail → envío → recepción → backup → suspensión → reactivación

---

## 28. Prevención de bugs críticos

### 28.1. Bug: open relay

Prevención:
- test automático en CI;
- test post-deploy;
- bloqueo de envío sin autenticación;
- configuración Postfix generada desde plantilla validada.

### 28.2. Bug: borrar buzones accidentalmente

Prevención:
- soft delete;
- período de retención;
- confirmación doble;
- backup previo a eliminación;
- auditoría.

### 28.3. Bug: configuración DNS incorrecta

Prevención:
- generador DNS centralizado;
- verificador DNS;
- instrucciones por proveedor;
- warnings claros.

### 28.4. Bug: saturación de disco

Prevención:
- cuotas duras;
- alertas al 70/85/95%;
- bloqueo preventivo;
- limpieza de temporales;
- monitor de inodes.

### 28.5. Bug: spam saliente masivo

Prevención:
- rate limits;
- anomaly detection;
- bloqueo automático;
- reputación por buzón;
- alertas.

### 28.6. Bug: update rompe producción

Prevención:
- entorno staging;
- snapshots;
- actualización por oleadas;
- health checks;
- rollback documentado.

---

## 29. Roadmap de desarrollo

### Fase 0 — Investigación y diseño

- Auditoría de Mailcow, Mailu, iRedMail.
- Decisión stack.
- Diseño arquitectura.
- Diseño modelo datos.
- Diseño APIs.
- Diseño UI.

### Fase 1 — MVP técnico

- Mail Node básico.
- SMTP/IMAP funcional.
- Rspamd.
- Webmail.
- Certificados.
- Primer panel admin.
- Primer API.
- Creación de dominios/buzones.

### Fase 2 — MVP comercial

- Clientes.
- Planes.
- Cuotas.
- Billing básico.
- Panel cliente.
- Backups.
- Monitorización.
- DNS checker.

### Fase 3 — Producción controlada

- Primeros clientes reales.
- Soporte.
- Alertas.
- Hardening.
- Documentación.
- Procedimientos de recuperación.

### Fase 4 — Multi-nodo

- Node Agent.
- Provisioning remoto.
- Balanceo por capacidad.
- Métricas centralizadas.
- Reputación por nodo.

### Fase 5 — Diferenciación IA

- Clasificación de correo.
- Extracción de facturas.
- Integración ORIZON.
- Workflows.
- Soporte técnico asistido.

---

## 30. Infraestructura recomendada inicial

### 30.1. Servidor Hetzner Auction

Especificación recomendada:
- CPU Ryzen o Xeon moderno.
- 32 GB RAM mínimo.
- 2x NVMe.
- RAID1.
- IPv4 dedicada.
- IPv6 disponible.
- Ubuntu Server 24.04.

### 30.2. Separación recomendada

- **Servidor 1:** Mail Node + Control Plane v1.
- **Servidor 2 futuro:** Backups externos + monitorización.
- **Servidor 3 futuro:** Segundo Mail Node.

---

## 31. Estrategia comercial

### 31.1. Posicionamiento

> Correo empresarial gestionado, seguro e inteligente para pymes, agencias y negocios que necesitan soporte real, automatización y control.

### 31.2. Clientes ideales iniciales

- clientes de desarrollo web;
- pymes locales;
- restaurantes;
- distribuidores;
- clientes ORIZON;
- clientes ORIGO;
- empresas que usan hosting tradicional malo;
- empresas que necesitan correo + facturación + documentos.

### 31.3. Planes iniciales

**Starter**
- 1 dominio;
- 5 buzones;
- 5 GB por buzón;
- backups 7 días;
- soporte básico.

**Business**
- 3 dominios;
- 25 buzones;
- 15 GB por buzón;
- backups 30 días;
- soporte prioritario.

**Pro IA**
- dominios ampliados;
- buzones ampliados;
- IA documental;
- OCR facturas;
- integración ORIZON;
- backups 90 días.

---

## 32. Diferenciación frente a Mailcow/Mailu/iRedMail

La plataforma no competirá como software self-hosted, sino como servicio gestionado.

Diferencias clave:
- multi-nodo desde diseño;
- billing nativo;
- panel cliente comercial;
- integración ORIZON/ORIGO;
- IA aplicada;
- auditoría de entregabilidad;
- gestión de reputación;
- automatización de servidores;
- soporte gestionado;
- restauración granular orientada a cliente.

---

## 33. Licenciamiento del producto propio

### 33.1. Código cerrado

Ventaja: mayor control comercial.
Riesgo: hay que revisar licencias de componentes integrados.

### 33.2. Open core

Parte abierta: Mail Node básico.
Parte cerrada: Control Plane SaaS, billing, multi-nodo, IA, panel avanzado.

### 33.3. Recomendación

**Open core limitado + SaaS comercial propietario**

Pero evitando incorporar código GPL de terceros dentro del core propietario.

---

## 34. Normativa y cumplimiento

### 34.1. RGPD

Debe contemplarse:
- contrato de encargado de tratamiento;
- ubicación de datos;
- derecho de supresión;
- exportación de datos;
- seguridad;
- registro de accesos;
- brechas de seguridad.

### 34.2. Políticas necesarias

- política de uso aceptable;
- política anti-spam;
- política de privacidad;
- términos del servicio;
- SLA;
- política de backups;
- política de eliminación de datos.

---

## 35. SLA inicial recomendado

- disponibilidad objetivo: 99,5%;
- soporte en horario laboral;
- restauración bajo solicitud;
- backups diarios;
- retención según plan;
- mantenimiento programado avisado.

> No prometer 99,99% hasta tener HA real.

---

## 36. Riesgos principales

### 36.1. Riesgo técnico

- mala entregabilidad;
- abuso por clientes;
- errores de configuración;
- pérdida de datos;
- bugs de actualización;
- saturación de disco.

### 36.2. Riesgo comercial

- competir por precio;
- alto coste de soporte;
- clientes con poca cultura técnica;
- incidencias críticas fuera de horario.

### 36.3. Riesgo legal

- tratamiento de datos personales;
- spam;
- acceso indebido a correos;
- falta de contratos adecuados.

### 36.4. Mitigación

- empezar con pocos clientes;
- contratos claros;
- backups probados;
- monitorización fuerte;
- límites estrictos;
- soporte bien definido;
- automatización desde el inicio.

---

## 37. Decisiones técnicas recomendadas

| # | Decisión |
|---|---------|
| 1 | Usar Postfix + Dovecot + Rspamd como base técnica. |
| 2 | Crear panel propio con Next.js + Shadcn/UI. |
| 3 | Crear API con NestJS + PostgreSQL + Prisma. |
| 4 | Crear Node Agent propio para aplicar configuración. |
| 5 | Separar Control Plane y Mail Node desde la arquitectura. |
| 6 | Usar Restic para backups cifrados. |
| 7 | No usar Kubernetes en v1. |
| 8 | No prometer alta disponibilidad hasta v2/v3. |
| 9 | No permitir campañas masivas en la plataforma inicial. |
| 10 | Diseñar todo con logs, auditoría y rollback. |

---

## 38. MVP recomendado

El MVP debe demostrar:
1. Crear cliente.
2. Crear dominio.
3. Mostrar DNS requerido.
4. Verificar DNS.
5. Crear buzón.
6. Acceder vía webmail.
7. Enviar correo.
8. Recibir correo.
9. Filtrar spam básico.
10. Hacer backup.
11. Restaurar buzón.
12. Suspender cliente.
13. Reactivar cliente.
14. Ver métricas básicas.

---

## 39. Criterios de éxito de v1

La versión 1 se considerará válida si:
- no existe open relay;
- SPF/DKIM/DMARC funcionan;
- se puede crear cliente/dominio/buzón desde panel;
- se puede enviar y recibir correo;
- los backups funcionan;
- la restauración funciona;
- hay logs auditables;
- hay límites por plan;
- el servidor alerta antes de saturarse;
- el sistema puede actualizarse sin intervención manual peligrosa;
- la documentación permite reinstalar todo desde cero.

---

### 39.1. Arquitectura avanzada de almacenamiento de correo

#### 39.1.1. Estrategia recomendada v1

**Maildir + EXT4/XFS + NVMe + RAID1**

Motivos:
- extremadamente probado;
- compatible con Dovecot;
- simple de restaurar;
- excelente compatibilidad IMAP;
- backups sencillos;
- snapshots simples;
- menos riesgo operacional;
- fácil debugging.

#### 39.1.2. No usar inicialmente

No se recomienda en v1:
- Ceph;
- GlusterFS;
- NFS distribuido;
- almacenamiento S3 directo para buzones;
- arquitecturas distribuidas complejas.

#### 39.1.3. Estructura de almacenamiento propuesta

```
/mail-storage/
├── tenants/
│   ├── tenant-a/
│   │   ├── domains/
│   │   │   ├── example.com/
│   │   │   │   ├── user1/
│   │   │   │   ├── user2/
│   │   │   │   └── shared/
│   │   │   └── example.net/
│   │   └── backups/
│   └── tenant-b/
├── quarantine/
├── sieve/
├── indexes/
└── tmp/
```

#### 39.1.4. Índices IMAP

- índices fuera del Maildir principal;
- compresión opcional;
- regeneración automática;
- verificación periódica.

#### 39.1.5. Estrategia futura v3

- archivado frío;
- deduplicación adjuntos;
- object storage para attachments;
- snapshots incrementales;
- almacenamiento híbrido caliente/frío.

---

### 39.2. Arquitectura avanzada de colas SMTP

#### 39.2.1. Funciones necesarias

- inspección de cola;
- requeue;
- flush;
- purge;
- deferred analysis;
- retry controlado;
- quarantine outbound;
- quarantine inbound;
- métricas por dominio;
- métricas por buzón.

#### 39.2.2. Queue Engine

Funciones:
- lectura de cola;
- clasificación;
- detección anomalías;
- análisis deferred;
- análisis de bounces;
- scoring reputacional;
- rate limiting dinámico.

#### 39.2.3. Prevención de spam saliente

Cada buzón debe tener:
- límite horario;
- límite diario;
- detección de comportamiento anómalo;
- reputación interna;
- score dinámico.

Ejemplo:
```
Usuario normal: 30 emails/día
Usuario marketing validado: 500 emails/día
```

#### 39.2.4. Protección de IP

Acciones automáticas:
- reducir velocidad;
- bloquear envío;
- mover cola a cuarentena;
- alertar administradores;
- suspender tenant.

---

### 39.3. Motor de reputación IP y entregabilidad

#### 39.3.1. Reputation Engine

Debe existir un servicio dedicado a:
- medir reputación;
- analizar rebotes;
- detectar deferred;
- comprobar blacklists;
- analizar spam complaints;
- generar score reputacional.

#### 39.3.2. Métricas críticas

- bounce rate;
- deferred rate;
- reject rate;
- spam complaint rate;
- blacklist status;
- outbound volume;
- TLS usage;
- authentication failures.

#### 39.3.3. Integraciones futuras

- Microsoft SNDS;
- Gmail Postmaster Tools;
- Spamhaus;
- Barracuda;
- Cisco Talos.

#### 39.3.4. Score reputacional

```
Reputation Score (nodo): 0-100
Tenant Trust Score: 0-100
```

---

### 39.4. Arquitectura avanzada de backups

#### 39.4.1. Principios

- backup cifrado;
- verificable;
- restaurable;
- incremental;
- aislado;
- automatizado.

#### 39.4.2. Niveles de backup

| Nivel | Contenido |
|-------|-----------|
| Nodo | configuración, Docker Compose, certificados, bases de datos |
| Tenant | dominios, buzones, aliases, configuraciones |
| Buzón | Maildir individual, índices, filtros Sieve |

#### 39.4.3. Estrategia recomendada

**Restic + almacenamiento S3 compatible**

Opciones: Backblaze B2, Wasabi, MinIO, Hetzner Storage Box.

#### 39.4.4. Disaster Recovery

Objetivos iniciales:
- RPO: < 24h
- RTO: < 4h

---

### 39.5. Arquitectura de observabilidad

#### 39.5.1. Métricas

Prometheus + Grafana

#### 39.5.2. Logs

Loki + Promtail

#### 39.5.3. Eventos críticos

- login failures;
- spam outbreaks;
- queue spikes;
- disk pressure;
- deferred spikes;
- backup failures;
- certificate expiration.

#### 39.5.4. Dashboards mínimos

**Infraestructura:** CPU, RAM, disco, red, Docker.
**Correo:** inbound, outbound, deferred, rejected, spam, antivirus, reputation.
**Comercial:** tenants, buzones, almacenamiento, facturación.

---

### 39.6. Node Agent Protocol

#### 39.6.1. Capacidades

- recibir configuración;
- validar configuración;
- renderizar plantillas;
- aplicar cambios;
- reiniciar servicios;
- enviar métricas;
- ejecutar backups;
- enviar eventos.

#### 39.6.2. Seguridad obligatoria

- mTLS;
- certificados rotatorios;
- scopes;
- logs auditables;
- deny by default.

#### 39.6.3. Comunicación

Recomendación: HTTPS + JSON + mTLS. Futuro: gRPC opcional.

#### 39.6.4. Operaciones prohibidas

El agente jamás debe permitir:
- ejecución arbitraria shell;
- acceso root remoto genérico;
- modificación fuera de paths permitidos.

---

### 39.7. Estrategia de actualización

#### 39.7.1. Flujo recomendado

```
Nueva versión
    ↓
Tests CI
    ↓
Staging node
    ↓
Health checks
    ↓
Backup snapshot
    ↓
Rolling deployment
    ↓
Monitoring post-update
```

#### 39.7.2. Política de versiones

- stable;
- rc;
- nightly interno.

> Nunca desplegar nightly en clientes reales.

---

### 39.8. Estrategia anti-sobreingeniería

#### 39.8.1. No hacer inicialmente

- Kubernetes;
- Ceph;
- microservicios extremos;
- HA compleja;
- cluster SMTP;
- replicación multi-master;
- geo-distribución.

#### 39.8.2. Prioridad correcta

```
estabilidad → seguridad → entregabilidad → automatización → escalabilidad → IA
```

#### 39.8.3. Filosofía operacional

El correo premia: simplicidad, estabilidad, previsibilidad, recuperación rápida.

---

### 39.9. Arquitectura SMTP profunda

#### 39.9.1. Flujo SMTP entrante

```
Internet
   ↓
Postscreen
   ↓
Connection Policy Engine
   ↓
Postfix Ingress
   ↓
Rspamd Milter
   ↓
SPF/DKIM/DMARC Validation
   ↓
Antivirus Pipeline
   ↓
Policy Engine
   ↓
Queue Engine
   ↓
Dovecot LMTP
   ↓
Mailbox Storage
```

#### 39.9.2. Postscreen

Debe actuar como primera barrera:
- DNSBL;
- greylisting opcional;
- anti-bot;
- HELO validation;
- pregreet;
- reputation prechecks.

#### 39.9.3. Policy Engine

Responsable de:
- límites;
- reputación;
- reglas tenant;
- bloqueo dinámico;
- routing;
- restricciones país/IP;
- políticas TLS.

#### 39.9.4. Flujo SMTP saliente

```
Authenticated Submission
    ↓
Policy Validation
    ↓
DKIM Signing
    ↓
Outbound Queue
    ↓
Rate Limiting
    ↓
Reputation Engine
    ↓
Delivery Engine
    ↓
Remote MX
```

#### 39.9.5. Bounce & DSN Engine

Subsistema dedicado para:
- parsing de bounces;
- detección hard bounce;
- detección soft bounce;
- detección spam complaints;
- detección deferred persistentes;
- scoring reputacional.

#### 39.9.6. Quarantine Engine

Tipos:
- inbound quarantine;
- outbound quarantine;
- malware quarantine;
- reputation quarantine.

Las cuarentenas deben: expirar automáticamente, generar logs, permitir revisión, soportar restauración.

---

### 39.10. Arquitectura de identidad y autenticación

#### 39.10.1. Métodos de autenticación

| Versión | Métodos |
|---------|---------|
| v1 | email/password, TOTP MFA |
| v2 | WebAuthn, FIDO2, OAuth2, OpenID Connect |
| v3 | SAML, LDAP empresarial |

#### 39.10.2. Password policy

- longitud mínima;
- bloqueo por intentos;
- hash Argon2id;
- rotación opcional;
- detección de credenciales filtradas.

---

### 39.11. Migration Engine

#### 39.11.1. Orígenes soportados

Google Workspace, Microsoft 365, cPanel, Plesk, Zimbra, Exchange, IMAP genérico.

#### 39.11.2. Flujo recomendado

```
Import wizard
    ↓
Credential validation
    ↓
Mailbox discovery
    ↓
DNS preparation
    ↓
Incremental sync
    ↓
Final cutover
    ↓
Verification
```

---

### 39.12. Arquitectura de Webmail y Groupware

| Versión | Solución |
|---------|---------|
| v1 | SnappyMail |
| v2/v3 | SOGo Groupware Pack (ActiveSync, calendarios, contactos, tareas) |

---

### 39.13. Storage Quota Engine

#### 39.13.1. Tipos de cuota

- hard quota;
- soft quota;
- attachment limit;
- tenant storage limit.

#### 39.13.2. Thresholds

Alertas: 70%, 85%, 95%, bloqueo preventivo.

---

### 39.14. DNS Orchestration Engine

#### 39.14.1. Registros soportados

MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, BIMI futuro.

#### 39.14.2. Integraciones futuras

Cloudflare, Route53, OVH DNS, Hetzner DNS, PowerDNS.

---

### 39.15. Billing Engine detallado

#### 39.15.1. Estados de suscripción

active, grace, suspended, archived, cancelled.

#### 39.15.2. Metering

El sistema debe medir: almacenamiento, dominios, buzones, tráfico saliente, backups, ActiveSync, antivirus.

#### 39.15.3. Protección operacional

> Nunca suspender instantáneamente.

Debe existir: grace period, notificaciones, backup previo, reactivación simple.

---

### 39.16. Auditoría y compliance

#### 39.16.1. Audit subsystem

Debe registrar: logins, cambios configuración, restauraciones, exportaciones, resets, acciones administrativas.

#### 39.16.2. Logs inmutables

Eventos críticos deben almacenarse de forma: append-only, verificable, exportable.

---

### 39.17. Estrategia de alta disponibilidad futura

> No implementar HA hasta tener estabilidad, métricas y automatización sólida.

---

### 39.18. Sistema de plugins y extensiones

Tipos de módulos: IA, archivado, CRM, ERP, compliance, analytics, ticketing.

Principios: sandboxing, versionado, permisos, aislamiento.

---

### 39.19. Estrategia API y versionado

```
/api/v1/
/api/v2/
```

Seguridad: tenant isolation, scopes, rate limits, audit logs.

---

### 39.20. Tenant Isolation Strategy

#### 39.20.1. Niveles de aislamiento

| Nivel | Uso |
|-------|-----|
| Shared Node | Clientes pequeños |
| Dedicated IP | Clientes premium |
| Dedicated Node | Clientes enterprise |

---

### 39.21. Mailgun Brain — Arquitectura cognitiva especializada

4nexa Mailgun incorporará progresivamente un sistema de memoria cognitiva operacional.

**Objetivo:** Construir una memoria operacional especializada en correo empresarial capaz de:
- mejorar entregabilidad;
- detectar abuso;
- consolidar conocimiento técnico;
- aprender de incidencias;
- mejorar migraciones;
- optimizar reputación;
- asistir operaciones;
- prevenir problemas repetitivos.

#### 39.21.1. Principios arquitectónicos

Mailgun Brain debe:
- ser trazable;
- ser auditable;
- evitar comportamiento opaco;
- evitar automatizaciones destructivas sin aprobación;
- usar memoria estructurada;
- priorizar eventos reales.

La IA jamás debe comprometer: privacidad, tenant isolation, reputación, integridad operacional.

#### 39.21.2. Regla fundamental de privacidad

Mailgun Brain **NO** debe almacenar contenido completo de emails salvo casos autorizados.

La memoria debe basarse en: eventos, metadatos, patrones, resultados, incidencias, reputación, comportamiento, métricas.

#### 39.21.3. Tipos de memoria

| Tipo | Ejemplos |
|------|---------|
| **Episódica** | tenant provocó spam, nodo cayó en blacklist, restauración exitosa |
| **Semántica** | tenants nuevos requieren límites bajos, IP nueva requiere warm-up |
| **Procedural** | recuperación de blacklist, restauración buzón, migración Gmail |
| **Experimental** | distintos límites SMTP, pruebas antispam, estrategias warm-up |

#### 39.21.4. Dominios cognitivos

```
smtp_queue | mailbox_security | spam_abuse | ip_reputation | domain_reputation
deliverability | dns_health | migration | backup_restore | support_incident
tenant_behavior | configuration_pattern | warmup_strategy | blacklist_recovery | billing_risk
```

#### 39.21.5. Memory Cells — Modelo

```
MailgunMemoryCell
├── id
├── tenant_id / domain_id / mailbox_id / node_id / ip_address
├── memory_type
├── cognitive_domain
├── concept / summary
├── source_type / source_id
├── confidence / severity / importance
├── activation_score / usage_frequency
├── validation_status
├── relations / evidence_links
└── created_at / updated_at / last_activation
```

#### 39.21.6. Arquitectura progresiva

| Versión | Componentes |
|---------|------------|
| **V1** | PostgreSQL JSONB, Audit/Mail/Abuse/Queue Events |
| **V1.5** | Episodic Memory, Tenant/Domain/Node/IP/Incident Memory |
| **V2** | mailgun_memory_cells, relations, activation_logs, context_snapshots |
| **V2.5** | pgvector para búsqueda semántica (dentro de PostgreSQL) |
| **V3** | Consolidation Engine, Adaptive Reputation, Predictive Abuse Engine |

#### 39.21.7. Reglas de seguridad

Mailgun Brain jamás debe:
- suspender tenants automáticamente sin reglas;
- eliminar datos críticos;
- modificar DNS automáticamente sin confirmación;
- leer correos completos indiscriminadamente;
- generar cambios irreversibles;
- romper tenant isolation.

#### 39.21.8. Arquitectura recomendada

```
PostgreSQL + JSONB + Events + Memory Cells + pgvector opcional futuro
```

**NO:** Qdrant, Milvus, Pinecone, infraestructura RAG compleja.

---

### 39.22. Stack tecnológico cerrado para desarrollo

#### 39.22.1. Frontend

| Tecnología | Uso |
|-----------|-----|
| Next.js 15+ | Paneles web |
| React 19+ / TypeScript | Base |
| TailwindCSS | Estilos |
| Shadcn/UI | Componentes base |
| Zustand | Estado local |
| TanStack Query | Datos remotos |
| Zod | Validación compartida |
| React Hook Form | Formularios |
| Recharts | Dashboards |
| Lucide Icons | Iconografía |

#### 39.22.2. Backend

| Tecnología | Uso |
|-----------|-----|
| NestJS / TypeScript | API principal |
| PostgreSQL | Base de datos central |
| Prisma ORM | Modelo de datos |
| Redis | Cache, locks, jobs |
| BullMQ | Colas background |
| OpenAPI | Documentación |
| JWT | Autenticación |
| Argon2id | Hashes |

#### 39.22.3. Infraestructura

Ubuntu Server 24.04 LTS, Docker Engine, Docker Compose, Ansible, Terraform opcional, Restic, Prometheus, Grafana, Loki, Caddy o Nginx.

#### 39.22.4. Mail Node

Postfix, Dovecot, Rspamd, ClamAV opcional, SnappyMail v1, SOGo opcional v2/v3, OpenDKIM vía Rspamd.

#### 39.22.5. Testing

Vitest, Jest opcional, Playwright, Supertest, Testcontainers, ESLint, Prettier, TypeScript strict mode.

---

### 39.23. Estructura definitiva del monorepo

```
4nexa-mailgun/
├── README.md
├── LICENSE.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── .gitignore
├── docs/
│   ├── 00-paper-tecnico/
│   ├── 01-arquitectura/
│   ├── 02-api/
│   ├── 03-frontend/
│   ├── 04-backend/
│   ├── 05-mail-node/
│   ├── 06-seguridad/
│   ├── 07-operaciones/
│   ├── 08-runbooks/
│   ├── 09-compliance/
│   └── 10-agentic-development/
├── apps/
│   ├── admin-panel/
│   ├── customer-panel/
│   ├── webmail-portal/
│   └── marketing-site/
├── services/
│   ├── control-plane-api/
│   ├── node-agent/
│   ├── dns-checker/
│   ├── billing-service/
│   ├── abuse-service/
│   ├── backup-service/
│   ├── reputation-service/
│   ├── migration-service/
│   ├── notification-service/
│   └── audit-service/
├── packages/
│   ├── ui/
│   ├── config/
│   ├── types/
│   ├── validators/
│   ├── api-client/
│   ├── logger/
│   ├── auth/
│   ├── mail-config-engine/
│   └── test-utils/
├── mail-node/
│   ├── postfix/
│   │   ├── templates/
│   │   ├── policies/
│   │   └── tests/
│   ├── dovecot/
│   │   ├── templates/
│   │   ├── sieve/
│   │   └── tests/
│   ├── rspamd/
│   │   ├── templates/
│   │   ├── rules/
│   │   └── tests/
│   ├── clamav/
│   ├── webmail/
│   ├── proxy/
│   ├── certs/
│   └── compose/
├── infra/
│   ├── docker/
│   ├── ansible/
│   ├── terraform/
│   ├── hetzner/
│   ├── monitoring/
│   ├── logging/
│   └── backup/
├── scripts/
│   ├── bootstrap.sh
│   ├── install-node.sh
│   ├── deploy.sh
│   ├── backup.sh
│   ├── restore.sh
│   ├── healthcheck.sh
│   ├── rotate-secrets.sh
│   └── smoke-test.sh
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   ├── deliverability/
│   └── performance/
└── tools/
    ├── generators/
    ├── seeders/
    ├── fixtures/
    └── devops/
```

---

### 39.24. Arquitectura frontend detallada

#### 39.24.1. Admin Panel — Rutas principales

```
/admin
/admin/dashboard
/admin/tenants
/admin/tenants/:id
/admin/domains
/admin/mailboxes
/admin/nodes
/admin/queues
/admin/reputation
/admin/backups
/admin/billing
/admin/abuse
/admin/audit
/admin/settings
/admin/support
```

#### 39.24.2. Customer Panel — Rutas principales

```
/app
/app/dashboard
/app/domains
/app/domains/:id
/app/mailboxes
/app/mailboxes/:id
/app/aliases
/app/dns
/app/security
/app/billing
/app/support
/app/audit
/app/settings
```

#### 39.24.3. Marketing Site

```
/
/pricing
/features
/security
/migrations
/contact
/legal/privacy
/legal/terms
/legal/anti-spam
```

#### 39.24.4. Componentes UI obligatorios

DataTable, ResourceForm, StatusBadge, QuotaBar, DnsRecordCard, HealthIndicator, MetricCard, AuditTimeline, QueueInspector, ReputationScore, BackupStatus, TenantSwitcher, RoleGuard, ConfirmDangerDialog.

#### 39.24.5. Reglas frontend

- No lógica crítica solo en frontend.
- Todas las operaciones peligrosas requieren confirmación.
- Formularios con Zod.
- Estados loading/error/empty obligatorios.
- Componentes reutilizables.
- Acciones destructivas con doble confirmación.
- Accesibilidad básica obligatoria.

---

### 39.25. Flujos exactos de funcionalidad

#### 39.25.1. Alta de cliente

```
Admin crea tenant → validación plan → asignación nodo → creación DB → generación límites → invitación → activación
```

#### 39.25.2. Alta de dominio

```
Cliente introduce dominio → validación formato → estado pending_dns → generación DKIM → instrucciones DNS → configuración cliente → DNS Checker → estado active → Node Agent aplica config
```

#### 39.25.3. Creación de buzón

```
Solicitud → validación plan/cuota → validación dominio activo → creación Mailbox → Config Engine → Node Agent → Dovecot crea Maildir → confirmación
```

#### 39.25.4. Envío de correo

```
Auth SMTP → Postfix valida → Policy Engine → Rspamd DKIM → Queue Engine → Reputation Engine → entrega MX → registro resultado
```

#### 39.25.5. Recepción de correo

```
MX conecta → Postscreen → Postfix → Rspamd → ClamAV → Policy Engine → Maildir vía LMTP → Dovecot índices → evento registrado
```

#### 39.25.6. Suspensión de cliente

```
Solicitud → tenant suspended → Node Agent bloquea SMTP auth → recepción según política → panel limitado → notificación cliente
```

Política recomendada: suspender envío primero, mantener recepción temporalmente, no borrar datos sin retención.

#### 39.25.7. Backup

```
Scheduler → Backup Service → snapshot lógico → dump DB → snapshot Maildir → Restic cifra y sube → verificación → registro BackupJob → alerta si falla
```

#### 39.25.8. Restauración

```
Solicitud → validación permisos → puntos disponibles → confirmación → staging → validación integridad → aplicación controlada → evento auditado
```

#### 39.25.9. Detección abuso

```
Anomalía detectada → evaluación severidad → rate limit o bloqueo → evento → notificación admin → incidente abierto
```

---

### 39.26. Guardarraíles para programación agéntica

#### 39.26.1. Principio general

> El agente debe construir siguiendo el paper como fuente de verdad. Si una funcionalidad no está definida: NO inventar comportamiento crítico. Crear propuesta documentada y marcar como pendiente de aprobación.

#### 39.26.2. Orden obligatorio de desarrollo

1. Base del monorepo
2. Tipos compartidos
3. Validadores
4. Backend core
5. Modelo de datos
6. Auth y RBAC
7. Control Plane API
8. Node Agent mock
9. Config Engine
10. Frontend Admin
11. Frontend Cliente
12. Mail Node local
13. Tests integración
14. Seguridad
15. Observabilidad
16. Despliegue

#### 39.26.3. Reglas de código

- TypeScript strict mode obligatorio.
- No usar `any` salvo justificación documentada.
- Validación Zod en entrada/salida.
- DTOs explícitos.
- Errores tipados.
- Logs estructurados.
- Tests mínimos por módulo.
- Migraciones Prisma versionadas.
- Sin secretos hardcodeados.
- Sin comandos shell arbitrarios.

#### 39.26.4. Reglas de seguridad

El agente nunca debe:
- crear open relay;
- exponer PostgreSQL públicamente;
- exponer Redis públicamente;
- permitir ejecución remota arbitraria;
- desactivar TLS;
- guardar passwords en texto plano;
- mezclar tenants sin validación;
- eliminar buzones físicamente sin soft delete.

#### 39.26.5. Reglas de backend

Cada endpoint debe incluir: autenticación, autorización, validación, tenant isolation, audit log, manejo de errores, tests.

#### 39.26.6. Reglas de frontend

Cada pantalla debe incluir: loading state, error state, empty state, confirmación en acciones peligrosas, validación cliente, validación servidor, control de permisos.

#### 39.26.7. Reglas de infraestructura

Todo script debe ser: idempotente, reversible cuando sea posible, documentado, con dry-run si aplica, con logs claros.

#### 39.26.8. Criterios de finalización por módulo

Un módulo solo se considera terminado si tiene:
- código funcional;
- tests;
- documentación;
- validación de seguridad;
- integración frontend/backend si aplica;
- migraciones;
- logs;
- errores controlados.

#### 39.26.9. Prohibiciones de sobreingeniería v1

No introducir en v1: Kubernetes, Ceph, microservicios innecesarios, IA avanzada, HA compleja, multi-region, colas distribuidas complejas.

#### 39.26.10. Prompt base para agente desarrollador

> Actúa como arquitecto senior y desarrollador principal de 4nexa Mailgun. Usa este paper técnico como única fuente de verdad. Implementa el sistema de forma incremental, segura y testeada. No inventes funcionalidades críticas no definidas. Prioriza backend, modelo de datos, seguridad, validación, tests y después frontend. Cada módulo debe quedar funcional, documentado y validado antes de pasar al siguiente. Nunca comprometas seguridad, tenant isolation, entregabilidad ni integridad de datos.

---

### 39.27. Matriz de módulos y estado de definición

| Módulo | Estado actual | Falta |
|--------|--------------|-------|
| Arquitectura general | Definido | Diagramas técnicos finales |
| Stack tecnológico | Definido | Versiones exactas en package manager |
| Backend | Definido | Contratos DTO completos |
| Frontend | Definido | Wireframes detallados |
| Mail Node | Definido | Plantillas exactas Postfix/Dovecot |
| SMTP flow | Definido | Configuración concreta por entorno |
| IMAP flow | Definido | Tuning Dovecot |
| DNS | Definido | Integraciones proveedor por proveedor |
| Billing | Definido | Integración fiscal completa |
| Backups | Definido | Runbooks paso a paso |
| Observabilidad | Definido | Dashboards JSON finales |
| Seguridad | Definido | Checklist hardening final |
| Testing | Definido | Suites concretas por paquete |
| Agentes IA | Definido | Prompts por fase/módulo |
| Compliance | Parcial | Documentos legales completos |

---

## 40. Conclusión

Crear una alternativa propia tipo Mailcow es técnicamente viable y comercialmente interesante si se enfoca correctamente.

La oportunidad no está en replicar un servidor de correo autohospedado más, sino en crear una **plataforma comercial de correo gestionado** que combine:
- infraestructura propia;
- automatización;
- panel SaaS;
- facturación;
- seguridad;
- reputación;
- backups;
- IA;
- integración con ORIZON/ORIGO.

La primera versión debe ser conservadora, estable y segura. La diferenciación vendrá después con multi-nodo, IA, integración empresarial y automatización avanzada.

**La prioridad absoluta debe ser:**

```
estabilidad > seguridad > entregabilidad > automatización > escalabilidad > funcionalidades avanzadas
```

Solo siguiendo ese orden el producto podrá convertirse en un servicio vendible y profesional.
