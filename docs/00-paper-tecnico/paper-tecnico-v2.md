# Paper Técnico v2 — 4nexa Mailgun Arquitectura Operacional Avanzada

## Relación con el Paper v1

Este documento **NO** sustituye el Paper Técnico v1.

El Paper v1 permanece como: **base fundacional estratégica y arquitectónica**

El presente documento define:
- especificaciones operacionales avanzadas;
- contratos técnicos;
- runbooks;
- arquitectura de ejecución;
- criterios de hardening;
- patrones de escalabilidad.

Debe entenderse como: **continuación técnica operacional del v1**

Manteniendo:
- coherencia arquitectónica;
- continuidad conceptual;
- stack definido;
- prioridades originales;
- principios anti-sobreingeniería.

---

## 1. Filosofía operacional definitiva

4nexa Mailgun debe diseñarse como:

> **infraestructura de correo empresarial gestionada**

no como:

> hosting SMTP improvisado

La prioridad absoluta del sistema debe ser:

```
estabilidad
→ reputación
→ seguridad
→ entregabilidad
→ observabilidad
→ automatización
→ inteligencia operacional
```

Nunca al revés.

---

## 2. Principios operacionales obligatorios

### 2.1. Simplicidad operacional

Toda decisión técnica debe reducir:
- complejidad;
- riesgo;
- superficie de fallo;
- tiempo de recuperación;
- dependencia humana.

### 2.2. Rollback obligatorio

Todo cambio debe permitir **rollback controlado** antes de aplicarse en producción.

### 2.3. Observabilidad primero

Ningún servicio crítico debe ejecutarse sin:
- logs;
- métricas;
- health checks;
- alertas.

### 2.4. Seguridad por aislamiento

Todo tenant debe permanecer **aislado lógica y operacionalmente**.

### 2.5. Configuración declarativa

Toda configuración debe derivarse de **estado persistido en PostgreSQL**.

Nunca de modificaciones manuales persistentes.

---

## 3. Arquitectura operacional consolidada

### 3.1. Arquitectura oficial

```
Frontend
   ↓
Control Plane API
   ↓
PostgreSQL
Redis
BullMQ
Event System
   ↓
Node Agent
   ↓
Mail Nodes
(Postfix + Dovecot + Rspamd)
```

### 3.2. Separación crítica

**Control Plane** — Responsable de:
- tenants;
- billing;
- auditoría;
- orchestration;
- reputación;
- backups;
- observabilidad;
- API;
- IA operacional.

**Mail Node** — Responsable de:
- SMTP;
- IMAP;
- almacenamiento;
- colas;
- filtrado;
- entrega;
- aplicación de configuración.

---

## 4. Arquitectura de eventos

### 4.1. Filosofía

4nexa Mailgun debe operar mediante **event-driven operational architecture** sin caer en microservicios hiperfragmentados.

### 4.2. Eventos mínimos obligatorios

```
tenant.created
tenant.suspended
domain.created
domain.verified
mailbox.created
mailbox.suspended
mail.sent
mail.deferred
mail.bounced
abuse.detected
backup.completed
backup.failed
node.unhealthy
queue.threshold_exceeded
reputation.degraded
```

### 4.3. Bus de eventos

v1/v2: **Redis + BullMQ**
Opcional futuro: NATS

---

## 5. Config Engine definitivo

### 5.1. Objetivo

Convertir estado persistido en **configuración válida y verificable**.

### 5.2. Reglas críticas

**Nunca:**
- escribir directamente archivos productivos;
- aplicar configuración sin validación;
- reiniciar servicios innecesariamente.

### 5.3. Pipeline oficial

```
DB State
↓
DTO Validation
↓
Template Rendering
↓
Static Validation
↓
Staging Apply
↓
Health Validation
↓
Atomic Promotion
↓
Controlled Reload
```

---

## 6. Arquitectura avanzada Node Agent

### 6.1. Filosofía

El Node Agent debe ser: **mínimo, seguro, determinista**

Nunca: shell remoto genérico.

### 6.2. Capacidades permitidas

- aplicar configuración;
- ejecutar validaciones;
- reportar métricas;
- ejecutar backups;
- ejecutar health checks;
- reiniciar servicios permitidos.

### 6.3. Capacidades prohibidas

- shell arbitrario;
- modificación fuera de paths permitidos;
- instalación dinámica no auditada;
- acceso root remoto abierto.

### 6.4. Seguridad obligatoria

- mTLS;
- JWT rotatorio;
- allowlist operaciones;
- logs auditables.

---

## 7. Arquitectura de reputación

### 7.1. Filosofía

La reputación es **activo crítico de negocio**.

### 7.2. Reputation Engine

Responsable de:
- score IP;
- score tenant;
- score dominio;
- bounce analysis;
- deferred analysis;
- blacklist tracking;
- throttling dinámico.

### 7.3. Métricas críticas

```
bounce_rate
deferred_rate
complaint_rate
blacklist_status
smtp_volume
```

### 7.4. Scores oficiales

| Score | Rango |
|-------|-------|
| Node Reputation Score | 0-100 |
| Tenant Trust Score | 0-100 |
| Domain Health Score | 0-100 |

---

## 8. Queue Engine avanzado

### 8.1. Capacidades

- queue inspection;
- retry control;
- purge control;
- quarantine;
- rate limiting;
- bounce parsing.

### 8.2. Reglas críticas

**Nunca:**
- eliminar colas automáticamente sin auditoría;
- liberar cuarentenas masivas automáticamente;
- ignorar deferred spikes.

---

## 9. Deliverability Governance

### 9.1. Reglas operacionales

- warm-up obligatorio;
- límites iniciales bajos;
- throttling adaptativo;
- aislamiento reputacional.

### 9.2. Integraciones futuras

SNDS, Google Postmaster, Spamhaus, Cisco Talos, Barracuda.

---

## 10. Arquitectura de backups definitiva

### 10.1. Filosofía

> Un backup solo existe si puede restaurarse.

### 10.2. Estrategia oficial

**Restic + almacenamiento S3 compatible**

### 10.3. Tipos

- nodo;
- tenant;
- dominio;
- buzón;
- configuración;
- PostgreSQL.

### 10.4. Reglas críticas

- backups cifrados;
- verificación automática;
- restore tests periódicos;
- checksums obligatorios.

---

## 11. Arquitectura de observabilidad

### 11.1. Stack oficial

Prometheus, Grafana, Loki, Alertmanager.

### 11.2. Métricas mínimas

**Infraestructura:** CPU, RAM, disco, inodes, red.

**SMTP:** inbound, outbound, deferred, bounced, rejected.

**Operacional:** backups, reputación, abuse, queue size.

---

## 12. Arquitectura de seguridad consolidada

### 12.1. Seguridad infraestructura

Obligatorio:
- SSH keys only;
- Firewall;
- mTLS;
- Secrets rotation;
- Immutable audit logs.

### 12.2. Seguridad SMTP

- no open relay;
- submission autenticado;
- TLS obligatorio;
- DKIM;
- SPF;
- DMARC.

### 12.3. Seguridad multi-tenant

Cada operación debe validar: tenant, scope, rol, ownership.

---

## 13. Arquitectura de almacenamiento definitiva

### 13.1. Estrategia oficial

**Maildir + NVMe + RAID1**

### 13.2. No permitido inicialmente

- Ceph;
- GlusterFS;
- S3 directo Maildir;
- Kubernetes storage complejo.

---

## 14. Arquitectura cognitiva Mailgun Brain

### 14.1. Objetivo

Mailgun Brain debe comportarse como **memoria operacional especializada**.

### 14.2. Prioridades

reputación, entregabilidad, soporte, abuso, recuperación, migraciones.

### 14.3. Reglas críticas

**Nunca:**
- almacenar emails completos indiscriminadamente;
- actuar autónomamente sin trazabilidad;
- romper tenant isolation.

### 14.4. Arquitectura oficial

```
PostgreSQL + JSONB + Events + Memory Cells + pgvector opcional futuro
```

---

## 15. Arquitectura de migraciones

### 15.1. Orígenes soportados

Google Workspace, Microsoft 365, cPanel, Plesk, Zimbra, Generic IMAP.

### 15.2. Filosofía

Migraciones: **incrementales, auditables, reversibles**.

---

## 16. Arquitectura frontend consolidada

### 16.1. Stack oficial

Next.js, TypeScript, TailwindCSS, Shadcn/UI, Zustand, TanStack Query.

### 16.2. Reglas UX

Toda pantalla debe tener: loading, empty, error, success.

### 16.3. Acciones peligrosas

**Obligatorio: doble confirmación** para:
- suspensiones;
- restores;
- eliminaciones;
- cambios DNS críticos.

---

## 17. Estrategia anti-sobreingeniería reforzada

### 17.1. Prohibiciones iniciales

No introducir en v1/v2:
- Kubernetes;
- Ceph;
- Service mesh;
- Microservicios extremos;
- HA distribuida compleja.

### 17.2. Filosofía correcta

El correo premia: **simplicidad, predictibilidad, recuperación rápida**.

---

## 18. Runbooks operacionales obligatorios

Debe existir documentación exacta para:
- blacklist recovery;
- spam outbreak;
- queue explosion;
- compromised mailbox;
- backup recovery;
- node replacement;
- certificate expiration;
- postgres corruption.

---

## 19. Principios finales de ingeniería

4nexa Mailgun debe mantenerse:
- estable;
- modular;
- auditado;
- predictivo;
- multi-tenant;
- operacionalmente simple.

**Nunca:** opaco, sobreautomatizado, hiperdistribuido, arquitectónicamente inestable.

---

## 20. Arquitectura avanzada PostgreSQL

### 20.1. Filosofía

PostgreSQL debe actuar como **source of truth operacional**.

### 20.2. Estrategia oficial

- Versión mínima: PostgreSQL 16.
- NVMe.
- WAL separado.
- checksums activados.

### 20.3. Componentes críticos

PostgreSQL almacenará:
- tenants;
- domains;
- mailboxes;
- eventos;
- auditoría;
- reputación;
- jobs metadata;
- configuraciones;
- Memory Cells;
- métricas agregadas.

### 20.4. Estrategia de particionado

Tablas masivas deben soportar partitioning por fecha:
- mail_events;
- reputation_events;
- audit_logs;
- abuse_events.

### 20.5. WAL Strategy

Obligatorio: **PITR compatible** mediante WAL archiving, snapshots, integrity verification.

### 20.6. Pooling

**PgBouncer** en modo transaction pooling.

### 20.7. Índices críticos

```
tenant_id
domain_id
mailbox_id
event_type
created_at
status
```

### 20.8. Vacuum Strategy

Autovacuum obligatorio con optimización específica para tablas calientes, eventos masivos y logs.

---

## 21. Arquitectura avanzada Redis & BullMQ

### 21.1. Filosofía

Redis debe utilizarse como **motor operacional efímero**.

Nunca como source of truth.

### 21.2. Uso oficial

Redis gestionará:
- jobs;
- caché;
- locks;
- throttling;
- eventos temporales;
- colas.

### 21.3. BullMQ

BullMQ será el sistema oficial de **background jobs**.

### 21.4. Tipos de cola

```
critical
high
default
low
maintenance
```

### 21.5. Dead-letter queues

Obligatorias. Todo job fallido persistentemente debe terminar en DLQ.

### 21.6. Locks distribuidos

Obligatorio para:
- DKIM rotation;
- backups;
- deploys;
- mailbox restore;
- tenant migrations.

### 21.7. Retry Strategy

**Exponential backoff.** Nunca retries infinitos.

---

## 22. Arquitectura avanzada de observabilidad

### 22.1. Filosofía

Todo incidente debe ser: **detectable, trazable, correlacionable**.

### 22.2. Stack oficial

Prometheus, Grafana, Loki, Alertmanager.

### 22.3. Naming convention

```
4nexa_mailgun_<service>_<metric>
```

### 22.4. Labels obligatorios

```
node_id
tenant_id
domain_id
service
region
provider
```

### 22.5. Logs estructurados

Formato obligatorio: **JSON structured logs**.

### 22.6. Retention

Logs críticos: 30-180 días según compliance.

---

## 23. Arquitectura de secretos y credenciales

### 23.1. Filosofía

Nunca almacenar secretos:
- hardcodeados;
- sin cifrado;
- fuera de control operacional.

### 23.2. Secretos críticos

- JWT secrets;
- DKIM private keys;
- backup keys;
- SMTP credentials;
- API tokens;
- database passwords.

### 23.3. Estrategia inicial

`.env` + encrypted storage.

### 23.4. Evolución futura

Compatibilidad prevista: Hashicorp Vault, Cloud KMS.

### 23.5. Rotación obligatoria

- JWT signing;
- DKIM;
- backup keys;
- internal tokens.

---

## 24. Arquitectura multi-node avanzada

### 24.1. Node Assignment Engine

Factores de asignación:
- reputation score;
- region;
- capacity;
- warmup status;
- provider;
- risk profile.

### 24.2. Node Draining

Modo **drain** para: mantenimiento, migraciones, incidentes.

### 24.3. Node Quarantine

Nodos comprometidos o degradados deben poder **quedar aislados automáticamente**.

---

## 25. Arquitectura Disaster Recovery

### 25.1. Recovery Objectives

| Métrica | Objetivo inicial |
|---------|-----------------|
| RPO | < 15 minutos |
| RTO | < 1 hora |

### 25.2. Disaster Scenarios

Debe existir recovery documentado para:
- pérdida nodo;
- corrupción PostgreSQL;
- pérdida Redis;
- corrupción Maildir;
- pérdida DNS;
- pérdida certificados.

### 25.3. Restore Ordering

```
PostgreSQL
↓
Redis
↓
Config Engine
↓
Maildir
↓
Node Validation
↓
Traffic Restore
```

---

## 26. Arquitectura de networking

### 26.1. Networking recomendado

**WireGuard mesh privada** entre nodos.

### 26.2. Firewall segmentation

Obligatorio: SMTP, IMAP, management, monitoring.

### 26.3. IPv6

Compatibilidad obligatoria.

### 26.4. Anti-DDoS

Preferencia: proveedor upstream + rate limiting.

---

## 27. Arquitectura avanzada antispam

### 27.1. Stack oficial

Rspamd, Redis, DNSBL, Bayesian learning.

### 27.2. Quarantine Flow

```
Mail Received
↓
Rspamd Analysis
↓
Policy Evaluation
↓
Quarantine or Delivery
↓
Audit Event
```

### 27.3. Bayesian learning

Permitido: training controlado, learning tenant-aware.

**Nunca:** poisoning automático indiscriminado.

### 27.4. Tenant overrides

Dominios premium pueden: endurecer políticas, suavizar thresholds, configurar whitelists.

---

## 28. Arquitectura avanzada billing

### 28.1. Filosofía

Billing debe ser: **auditado, predecible, reconciliable**.

### 28.2. Metering Engine

Debe medir:
- mailboxes;
- storage;
- outbound volume;
- migrations;
- backups;
- domains.

### 28.3. Grace workflows

```
active → grace → restricted → suspended
```

### 28.4. Anti-fraud

Billing debe integrarse con: Reputation Engine, Abuse Engine.

---

## 29. Arquitectura avanzada auditoría

### 29.1. Filosofía

Los logs críticos deben ser **append-only**.

### 29.2. Eventos obligatorios

- login;
- restore;
- DKIM rotation;
- node assignment;
- mailbox deletion;
- migration;
- policy changes.

### 29.3. Tamper detection

Audit logs deben soportar **integrity verification**.

---

## 30. Arquitectura testing continuo

### 30.1. Testing mínimo

- unit;
- integration;
- SMTP flow;
- IMAP flow;
- DNS validation;
- backup restore.

### 30.2. Smoke testing

Después de deploy: **health checks automáticos**.

### 30.3. Synthetic monitoring

Debe simular:
- SMTP inbound;
- SMTP outbound;
- IMAP login;
- queue delivery.

---

## 31. Modelo de datos definitivo

### 31.1. Filosofía

Toda entidad crítica debe:
- soportar auditoría;
- soportar soft delete;
- incluir ownership;
- soportar timestamps;
- permitir trazabilidad.

### 31.2. Tabla tenants

```
tenants
├── id
├── name
├── slug
├── status
├── reputation_score
├── billing_status
├── created_at
├── updated_at
└── deleted_at
```

### 31.3. Tabla domains

```
domains
├── id
├── tenant_id
├── domain
├── verification_status
├── dkim_selector
├── reputation_score
├── node_id
├── created_at
└── updated_at
```

### 31.4. Tabla mailboxes

```
mailboxes
├── id
├── tenant_id
├── domain_id
├── email
├── quota_bytes
├── mailbox_status
├── reputation_score
├── created_at
├── updated_at
└── deleted_at
```

### 31.5. Tabla mail_events

```
mail_events
├── id
├── tenant_id
├── domain_id
├── mailbox_id
├── event_type
├── provider
├── payload
└── created_at
```

Particionado: **mensual**.

### 31.6. Tabla audit_logs

```
audit_logs
├── id
├── tenant_id
├── actor_id
├── event_type
├── entity_type
├── entity_id
├── metadata
├── ip_address
└── created_at
```

### 31.7. Constraints obligatorios

- foreign keys;
- unique indexes;
- tenant scoping;
- ownership validation.

---

## 32. Contratos API definitivos

### 32.1. Prefijo oficial

```
/api/v1
```

### 32.2. Response envelope

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

### 32.3. Error contract

```json
{
  "success": false,
  "error": {
    "code": "DOMAIN_NOT_VERIFIED",
    "message": "Domain verification failed"
  }
}
```

### 32.4. API rules

**Nunca:**
- devolver HTML;
- devolver stack traces;
- exponer secretos;
- romper tenant isolation.

---

## 33. Node Agent Contracts

### 33.1. Operaciones permitidas

```
apply_config
reload_service
health_check
backup_execute
metrics_report
queue_stats
```

### 33.2. Payload ejemplo

```json
{
  "operation": "apply_config",
  "node_id": "uuid",
  "correlation_id": "uuid",
  "payload": {}
}
```

### 33.3. Reglas

- timeouts obligatorios;
- retries limitados;
- idempotencia;
- logs obligatorios.

---

## 34. Plantillas técnicas base

### 34.1. Filosofía

Toda configuración debe derivarse de **templates versionados**.

### 34.2. Postfix

Debe soportar: multi-domain, DKIM, rate limiting, TLS, submission.

### 34.3. Dovecot

Debe soportar: IMAP, quotas, sieve, shared mailboxes.

### 34.4. Rspamd

Debe soportar: Bayesian, DKIM validation, DNSBL, quarantine.

### 34.5. Docker Compose stacks separados

```
control-plane
mail-node
monitoring
backup
```

---

## 35. Runbooks operacionales detallados

### 35.1. Spam outbreak

```
Detect
↓
Throttle
↓
Suspend source
↓
Analyze logs
↓
Purge queues
↓
Audit
↓
Recovery
```

### 35.2. PostgreSQL corruption

```
Freeze writes
↓
Validate WAL
↓
Restore PITR
↓
Integrity validation
↓
Controlled restore
```

### 35.3. Compromised mailbox

```
Lock mailbox
↓
Reset credentials
↓
Revoke sessions
↓
Analyze outbound
↓
Audit
```

### 35.4. Node failure

```
Drain traffic
↓
Restore node
↓
Validate queues
↓
Restore mail services
↓
Reputation validation
```

---

## 36. Arquitectura CI/CD definitiva

### 36.1. Filosofía

> No desplegar código no validado.

### 36.2. Pipeline mínimo

```
Lint
↓
Unit Tests
↓
Integration Tests
↓
Security Scan
↓
Build
↓
Staging Deploy
↓
Smoke Tests
↓
Production Approval
↓
Production Deploy
```

### 36.3. Gates obligatorios

- tests mínimos;
- security scan;
- migration validation;
- linting.

### 36.4. Rollback

Todo deploy debe permitir **rollback inmediato**.

---

## 37. Installer & Bootstrap System

### 37.1. Filosofía

El despliegue debe ser: **determinista, repetible, automatizable**.

### 37.2. Bootstrap flow

```
Provision VPS
↓
Install dependencies
↓
Generate secrets
↓
Configure firewall
↓
Register node
↓
Deploy services
↓
Health validation
↓
Ready
```

### 37.3. Reglas críticas

**Nunca:**
- dejar credenciales por defecto;
- abrir servicios innecesarios;
- omitir validaciones.

---

## 38. Diagramas finales requeridos

Debe existir versión visual de:
- arquitectura global;
- SMTP inbound;
- SMTP outbound;
- provisioning;
- backup flow;
- DR flow;
- abuse detection;
- tenant isolation;
- Mailgun Brain;
- multi-node.

---

## 39. Production Readiness Checklist

### 39.1. Infraestructura

- [ ] backups verificados;
- [ ] monitoring activo;
- [ ] alertas configuradas;
- [ ] firewall validado;
- [ ] DKIM/SPF/DMARC funcionales.

### 39.2. Seguridad

- [ ] MFA admins;
- [ ] secret rotation;
- [ ] audit logs;
- [ ] TLS validado.

### 39.3. SMTP

- [ ] PTR correcto;
- [ ] warm-up activo;
- [ ] rate limits;
- [ ] queue monitoring.

### 39.4. Operacional

- [ ] restore tests;
- [ ] smoke tests;
- [ ] rollback validado;
- [ ] node recovery validado.

---

## 40. Conclusión

El Paper Técnico v2 queda consolidado como:

> **especificación operacional enterprise completa para 4nexa Mailgun**

El sistema queda preparado para:
- desarrollo agéntico controlado;
- despliegues reales;
- operaciones multi-tenant;
- crecimiento progresivo;
- automatización segura;
- reputación SMTP enterprise.

4nexa Mailgun queda definido como:

> **infraestructura SaaS de correo empresarial, modular, operacionalmente estable, orientada a reputación y entregabilidad**

capaz de evolucionar progresivamente sin romper:
- simplicidad operacional;
- estabilidad;
- seguridad;
- tenant isolation;
- observabilidad;
- capacidad de recuperación.

Toda evolución futura debe respetar:

```
estabilidad
→ reputación
→ seguridad
→ entregabilidad
→ automatización
→ inteligencia operacional
```

como eje central de la plataforma.
