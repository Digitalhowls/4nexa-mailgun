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
