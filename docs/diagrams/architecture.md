# §38 — Diagramas de Arquitectura 4nexa Mailgun Platform

Este documento contiene los diagramas Mermaid de arquitectura del sistema.
Renderizable en GitHub, GitLab, Notion, y cualquier editor compatible con Mermaid.

---

## 1. Arquitectura Global

```mermaid
graph TB
    subgraph Internet
        MUA["Mail User Agent\n(Outlook / Thunderbird / webmail)"]
        ExtMTA["External MTA\n(Gmail / Office 365 / etc.)"]
        Browser["Browser\n(Admin / Customer)"]
    end

    subgraph "aaPanel Host (VPS/Bare Metal)"
        NGINX["Nginx Reverse Proxy\nTLS termination\nerp.4nexa.io | api.4nexa.io\nmetrics.4nexa.io"]

        subgraph "Docker: control-plane network"
            CP["Control Plane API\nNestJS 10 + Fastify\n:3000"]
            AdminPanel["Admin Panel\nNext.js standalone\n:3001"]
            CustPanel["Customer Panel\nNext.js standalone\n:3002"]
            PG["PostgreSQL 16\n:5432"]
            Redis["Redis 7\n:6379"]
        end

        subgraph "Docker: monitoring network"
            Prometheus["Prometheus\n:9090"]
            Grafana["Grafana\n:3003"]
            NodeExp["Node Exporter\n:9100"]
            CAdvisor["cAdvisor\n:8080"]
            RedisExp["Redis Exporter\n:9121"]
            PGExp["PG Exporter\n:9187"]
        end
    end

    subgraph "Mail Nodes (VM por tenant / multi-tenant)"
        subgraph "Mail Node 1"
            NodeAgent1["Node Agent\nNestJS mTLS\n:9001"]
            Postfix1["Postfix\n:25/:587/:465"]
            Dovecot1["Dovecot IMAP\n:143/:993"]
            Rspamd1["Rspamd\n:11334"]
        end
    end

    Browser -->|HTTPS| NGINX
    MUA -->|SMTP/IMAP| Postfix1
    MUA -->|IMAP/S| Dovecot1
    ExtMTA -->|SMTP| Postfix1

    NGINX --> AdminPanel
    NGINX --> CustPanel
    NGINX --> CP
    NGINX --> Grafana

    CP --> PG
    CP --> Redis
    CP -->|mTLS JWT| NodeAgent1

    NodeAgent1 --> Postfix1
    NodeAgent1 --> Dovecot1
    NodeAgent1 --> Rspamd1

    Prometheus -->|scrape :3000/metrics| CP
    Prometheus -->|scrape :9100| NodeExp
    Prometheus -->|scrape :8080| CAdvisor
    Prometheus -->|scrape :9121| RedisExp
    Prometheus -->|scrape :9187| PGExp
    Grafana --> Prometheus
```

---

## 2. Flujo SMTP Outbound

```mermaid
sequenceDiagram
    participant MUA as Mail Client (MUA)
    participant PF as Postfix (mail-node)
    participant RSP as Rspamd
    participant CP as Control Plane
    participant DNS as DNS (SPF/DKIM/DMARC)
    participant EXT as External MTA

    MUA->>PF: SMTP AUTH (port 587/465)
    PF->>CP: SASL lookup — verificar credenciales
    CP-->>PF: OK / REJECT
    PF->>RSP: Milter — análisis anti-spam
    RSP-->>PF: Score + headers (X-Spam-*)
    Note over RSP: Si score > umbral → REJECT
    PF->>PF: Firmar DKIM (clave del dominio)
    PF->>DNS: Resolver MX del dominio destino
    DNS-->>PF: IP del MTA destino
    PF->>EXT: SMTP (TLS) — entrega
    EXT-->>PF: 250 OK / 4xx retry / 5xx bounce
    PF->>CP: Webhook de estado de entrega
    CP->>CP: Actualizar métricas de reputación
```

---

## 3. Flujo SMTP Inbound

```mermaid
sequenceDiagram
    participant EXT as External MTA (sender)
    participant PF as Postfix (mail-node)
    participant RSP as Rspamd
    participant DV as Dovecot IMAP
    participant CP as Control Plane

    EXT->>PF: Conexión SMTP port 25
    PF->>PF: Verificar IP en blacklists (Postscreen)
    Note over PF: Postscreen: pipelining / DNSBL checks
    PF->>RSP: Milter — análisis completo
    RSP->>RSP: SPF / DKIM / DMARC / Bayes
    RSP-->>PF: Score + acción (accept/reject/quarantine)
    PF->>DV: LDA (Local Delivery Agent) → IMAP store
    DV->>DV: Almacenar en maildir del buzón
    PF->>CP: Evento inbound.received (métricas)
    CP->>CP: Actualizar billing (bytes recibidos)
```

---

## 4. Mailgun Brain — Ciclo de Vida de Celdas

```mermaid
stateDiagram-v2
    [*] --> PENDING: Evento del sistema genera\nuna celda de memoria

    PENDING --> ACTIVE: BrainService.upsertCell()\nescribe en DB

    ACTIVE --> UPDATED: upsertCell() con nueva\nversión (version++)

    ACTIVE --> EXPIRED: expiresAt < now()\n(cleanup cron)

    UPDATED --> EXPIRED: expiresAt alcanzado

    EXPIRED --> [*]: deleteExpiredCells()

    ACTIVE --> DELETED: deleteCell() manual

    state ACTIVE {
        [*] --> REPUTATION
        [*] --> DELIVERY
        [*] --> SECURITY
        [*] --> CONFIG
        [*] --> ANOMALY
        [*] --> GENERAL
    }
```

---

## 5. Arquitectura Multi-Nodo — Asignación y Drenaje

```mermaid
flowchart LR
    subgraph "Control Plane"
        CP["Control Plane API"]
        DB[(PostgreSQL)]
        Q[(Redis / BullMQ)]
    end

    subgraph "Node Pool"
        N1["Node 1\nACTIVE\nreputationScore: 95"]
        N2["Node 2\nACTIVE\nreputationScore: 87"]
        N3["Node 3\nDRAINING\nreputationScore: 42"]
        N4["Node 4\nQUARANTINE\nreputationScore: 10"]
    end

    subgraph "Tenants"
        T1["Tenant A\n(nodeId → N1)"]
        T2["Tenant B\n(nodeId → N1)"]
        T3["Tenant C\n(nodeId → N2)"]
        T4["Tenant D\n(nodeId → N3\n→ migrando a N2)"]
    end

    CP -->|assign| DB
    DB -->|read| CP
    CP -->|operations| N1
    CP -->|operations| N2
    CP -->|drain job| N3

    T1 -.->|mail via| N1
    T2 -.->|mail via| N1
    T3 -.->|mail via| N2
    T4 -.->|mail via| N3
    N3 -.->|migración colas| N2

    style N3 fill:#f90,color:#000
    style N4 fill:#f00,color:#fff
```

---

## 6. Disaster Recovery — Árbol de Decisión

```mermaid
flowchart TD
    A([Incidente detectado]) --> B{¿Tipo de incidente?}

    B -->|Fallo de nodo| C[Ejecutar node-failure.sh]
    B -->|Spam outbreak| D[Ejecutar spam-outbreak.sh]
    B -->|Buzón comprometido| E[Ejecutar compromised-mailbox.sh]
    B -->|Corrupción DB| F[Ejecutar pg-corruption.sh]
    B -->|Fallo total| G[DR completo]

    C --> C1[Nodo DRAINING]
    C1 --> C2[Tenants reasignados]
    C2 --> C3[Nodo QUARANTINE]
    C3 --> C4{¿Reparable?}
    C4 -->|Sí| C5[Reparar → ACTIVE]
    C4 -->|No| C6[Reemplazar nodo]

    D --> D1[Throttle nodo]
    D1 --> D2[Suspender tenant]
    D2 --> D3[Purgar colas]
    D3 --> D4[Análisis post-mortem]

    E --> E1[Suspender buzón]
    E1 --> E2[Rotar credenciales]
    E2 --> E3[Notificar propietario]

    F --> F1[API read-only]
    F1 --> F2[Snapshot emergencia]
    F2 --> F3{¿WAL válido?}
    F3 -->|Sí| F4[PITR restore]
    F3 -->|No| F5[Restore último backup]

    G --> G1[Activar standby region]
    G1 --> G2[DNS failover]
    G2 --> G3[Verificar servicios]
    G3 --> G4[Comunicar RTO/RPO]
```

---

## 7. Modelo de Datos — Entidades Principales

```mermaid
erDiagram
    Plan {
        uuid id PK
        string name
        int maxDomains
        int maxMailboxes
        int priceMonthly
    }

    Tenant {
        uuid id PK
        string slug
        string status
        uuid planId FK
        uuid nodeId FK
    }

    Node {
        uuid id PK
        string hostname
        string status
        int reputationScore
    }

    Domain {
        uuid id PK
        string domain
        uuid tenantId FK
        string dkimSelector
    }

    Mailbox {
        uuid id PK
        string address
        uuid tenantId FK
        uuid domainId FK
        string status
    }

    MigrationJob {
        uuid id PK
        uuid tenantId FK
        string provider
        string status
        int messagesImported
        int messagesTotal
    }

    BackupJob {
        uuid id PK
        uuid tenantId FK
        string status
        string storagePath
    }

    AuditLog {
        uuid id PK
        string action
        string entityType
        uuid entityId
        string userId
    }

    Plan ||--o{ Tenant : "planId"
    Node ||--o{ Tenant : "nodeId"
    Tenant ||--o{ Domain : "tenantId"
    Tenant ||--o{ Mailbox : "tenantId"
    Domain ||--o{ Mailbox : "domainId"
    Tenant ||--o{ MigrationJob : "tenantId"
    Tenant ||--o{ BackupJob : "tenantId"
```

---

## 8. Provisioning Flow — Nuevo Tenant/Dominio/Buzón

```mermaid
sequenceDiagram
    participant ADM as Admin (Panel)
    participant CP as Control Plane API
    participant DB as PostgreSQL
    participant Q as BullMQ (Redis)
    participant NA as Node Agent (mTLS)
    participant PF as Postfix
    participant DV as Dovecot

    ADM->>CP: POST /tenants {plan, slug, nodeId}
    CP->>DB: INSERT tenant (status=PROVISIONING)
    CP->>Q: Enqueue provisioning.tenant job
    CP-->>ADM: 201 {tenantId}

    Q->>CP: Worker procesa job
    CP->>NA: POST /operations/postfix/configure {tenant}
    NA->>PF: Escribir virtual_mailbox_domains
    PF-->>NA: OK

    ADM->>CP: POST /domains {domain, tenantId}
    CP->>DB: INSERT domain (verified=false)
    CP->>NA: POST /operations/dkim/generate {domain}
    NA->>NA: Generar par clave DKIM (2048-bit RSA)
    NA-->>CP: {selector, publicKey, privateKeyPath}
    CP->>DB: UPDATE domain (dkimSelector, dkimPublicKey)
    CP-->>ADM: 201 {domainId, dnsInstructions}

    ADM->>CP: POST /domains/:id/verify
    CP->>NA: POST /operations/dns/check {domain}
    NA->>NA: dig TXT _dmarc / SPF / DKIM
    NA-->>CP: {spf:true, dkim:true, dmarc:true}
    CP->>DB: UPDATE domain (verified=true, verifiedAt)
    CP->>NA: POST /operations/postfix/reload
    PF-->>NA: reloaded

    ADM->>CP: POST /mailboxes {address, password}
    CP->>CP: AES-256-GCM cifrar password
    CP->>DB: INSERT mailbox
    CP->>NA: POST /operations/mailbox/create {address, quota}
    NA->>DV: doveadm user create + quota set
    NA->>PF: Actualizar virtual_mailbox_maps
    NA-->>CP: OK
    CP->>DB: UPDATE mailbox (status=ACTIVE)
    CP-->>ADM: 201 {mailboxId}
```

---

## 9. Backup Flow — Ciclo Completo Restic

```mermaid
sequenceDiagram
    participant CRON as Scheduler (NestJS @Cron)
    participant CP as Control Plane API
    participant Q as BullMQ (Redis)
    participant NA as Node Agent
    participant FS as Maildir (NVMe)
    participant R as Restic
    participant S3 as S3 Compatible Storage

    CRON->>CP: Trigger backup.daily (02:00 UTC)
    CP->>Q: Enqueue backup jobs (one per tenant)

    loop Para cada tenant activo
        Q->>CP: Worker procesa backup job
        CP->>NA: POST /operations/backup/run {tenantId, type}
        NA->>FS: Snapshot /maildata/{tenantId}/
        NA->>R: restic backup --tag tenant={id}
        R->>S3: Upload chunks cifrados (AES-256)
        S3-->>R: 200 OK
        R-->>NA: {snapshotId, filesNew, totalSize}
        NA->>R: restic check --read-data-subset=5%
        R-->>NA: {status: OK, errors: 0}
        NA-->>CP: {snapshotId, sizeBytes, verified:true}
        CP->>CP: INSERT BackupJob (status=COMPLETED)
        CP->>CP: Emitir backup.completed event
    end

    Note over CP: Si algún job falla → status=FAILED\n→ event backup.failed → Alertmanager

    CP->>CP: @Weekly restore test (tenant aleatorio)
    CP->>NA: POST /operations/backup/verify {snapshotId}
    NA->>R: restic restore --target /tmp/verify-{id}/
    NA->>NA: Verificar integridad ficheros
    NA-->>CP: {filesRestored, integrity: OK}
    CP->>CP: INSERT BackupJob (type=VERIFY, status=COMPLETED)
```

---

## 10. Abuse Detection — Detección y Respuesta

```mermaid
flowchart TD
    A([Email enviado]) --> B[Postfix submission port 587]
    B --> C[Rspamd milter análisis]

    C --> D{Score Rspamd}
    D -->|score < 5| E[ACCEPT — entrega normal]
    D -->|5 ≤ score < 15| F[ACCEPT con headers X-Spam-*]
    D -->|score ≥ 15| G[REJECT — 550 spam policy]

    F --> H[Postfix envía al MTA destino]
    H --> I{Respuesta destino}
    I -->|Bounce / complaint FBL| J[Node Agent captura bounce]
    J --> K[POST /events/bounce → Control Plane]

    K --> L[Reputation Engine actualiza scores]
    L --> M{Threshold superado?}
    M -->|bounceRate > 5%| N[AUTO: throttle 50%\nsobre ese dominio]
    M -->|spamRate > 0.1%| O[AUTO: throttle nodo\n+ alert Alertmanager]
    M -->|spamRate > 0.5%| P[AUTO: suspender dominio\n+ emitir abuse.detected event]

    P --> Q[Brain registra celda ANOMALY]
    Q --> R[Admin recibe alerta Grafana]
    R --> S{Acción admin}
    S -->|spam-outbreak.sh| T[Throttle nodo\n→ suspender tenant\n→ purgar colas]
    S -->|Revisar manualmente| U[AuditLog + acción manual]

    style G fill:#f00,color:#fff
    style N fill:#f90,color:#000
    style O fill:#f90,color:#000
    style P fill:#f00,color:#fff
    style T fill:#c00,color:#fff
```

---

## 11. Tenant Isolation — Capas de Aislamiento

```mermaid
graph TB
    subgraph "Capa 1 — Autenticación y Autorización"
        JWT["JWT + JwtAuthGuard\n(cada request)"]
        RBAC["RolesGuard\n(SUPER_ADMIN / PLATFORM_ADMIN\n/ TENANT_ADMIN / TENANT_USER)"]
        OWN["Ownership check\n(tenantId del JWT\n= tenantId del recurso)"]
    end

    subgraph "Capa 2 — Base de Datos (PostgreSQL)"
        ROW["Row-level filtering\nWHERE tenantId = :tid\nen cada query Prisma"]
        FK["Foreign Keys\n(domainId → tenantId,\nmailboxId → tenantId)"]
        AUDIT["AuditLog inmutable\n(entityType + entityId\n+ userId + tenantId)"]
    end

    subgraph "Capa 3 — Sistema de Ficheros (Mail Node)"
        MDIR["Maildir separado por tenant\n/maildata/{tenantId}/{domain}/{mailbox}/"]
        QUOTA["Dovecot quota per mailbox\n(hard + soft limits)"]
        PERM["Permisos Linux\nvmail:vmail owner\nmode 700"]
    end

    subgraph "Capa 4 — Red y Configuración SMTP"
        VDOM["Postfix virtual_mailbox_domains\n(solo dominios del tenant)"]
        SASL["Dovecot SASL\n(auth solo para buzones propios)"]
        DKIM["Claves DKIM por dominio\n(no compartidas entre tenants)"]
    end

    subgraph "Capa 5 — Operaciones Node Agent"
        MTLS["mTLS entre CP y Node Agent\n(certificado por nodo, rotación automática)"]
        SCOPE["Scope validation\n(operación validada contra tenantId\nantes de ejecutar en disco)"]
    end

    JWT --> RBAC --> OWN
    OWN --> ROW
    ROW --> FK
    ROW --> AUDIT
    OWN --> SCOPE
    SCOPE --> MTLS
    SCOPE --> MDIR
    MDIR --> QUOTA
    MDIR --> PERM
    VDOM --> SASL
    SASL --> DKIM

    style JWT fill:#1a6,color:#fff
    style RBAC fill:#1a6,color:#fff
    style OWN fill:#1a6,color:#fff
    style ROW fill:#16a,color:#fff
    style FK fill:#16a,color:#fff
    style AUDIT fill:#16a,color:#fff
    style MDIR fill:#a61,color:#fff
    style QUOTA fill:#a61,color:#fff
    style PERM fill:#a61,color:#fff
    style VDOM fill:#61a,color:#fff
    style SASL fill:#61a,color:#fff
    style DKIM fill:#61a,color:#fff
    style MTLS fill:#a16,color:#fff
    style SCOPE fill:#a16,color:#fff
```
