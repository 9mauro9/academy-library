# Architecture Blueprint: Academy Builder

This document outlines the visual system architecture, processing flows, caching strategies, and recommendation engines for the Academy Builder application.

---

## 1. System Topology & Data Flow

```mermaid
graph TD
    subgraph Client Apps
        TL[Timeliner App]
        BL[Builder App]
        FE[Admin Dashboard UI]
    end

    subgraph Express API Server
        API[Express REST API]
        MC[MemoryCache In-Memory RAM]
    end

    subgraph Firebase Cloud
        FS[(Firestore Collections)]
        CL[(cache_invalidations Logs)]
    end

    subgraph AI Processing
        GEMINI[Gemini-2.5-Flash API]
    end

    %% Read Path
    TL -->|GET /content| API
    BL -->|GET /content| API
    FE -->|GET /api/assets| API
    API <-->|Instant Sub-ms Lookup| MC

    %% Cache warmup on boot
    API <-->|Single-Read Boot Warmup| FS

    %% Ingestion path
    FE -->|Upload Custom Sheet| API
    API -->|Send cleaned rows| GEMINI
    GEMINI -->|Structured JSON Response| API
    API -->|1. Commit Checkpoint| FS
    API -->|2. Batch Write| FS
    API -->|3. Trigger Cache Reload| MC
    API -->|4. Push Invalidation Event| CL
```

---

## 2. In-Memory Cache Optimization

To eliminate database read quotas entirely and deliver sub-millisecond response times for external API clients, the application implements an in-memory caching system:

```mermaid
sequenceDiagram
    autonumber
    actor User as Admin / Consumer App
    participant Server as Express Server
    participant Cache as MemoryCache (RAM)
    participant DB as Cloud Firestore

    Note over Server, DB: Server Startup
    Server->>DB: Load all assets & curriculum maps
    DB-->>Server: 665 assets, 803 maps
    Server->>Cache: Initialize & populate RAM cache

    Note over User, Cache: Read Request (GET /content)
    User->>Server: HTTP GET /content?track_id=automation
    Server->>Cache: Query cache in RAM (0 DB Reads)
    Cache-->>Server: Return filtered assets & maps
    Server-->>User: Return resolved JSON hierarchy (1ms response)

    Note over User, DB: Write Request (POST /api/assets)
    User->>Server: HTTP POST /api/assets {name: "New"}
    Server->>DB: Write to Firestore
    DB-->>Server: Document Created
    Server->>DB: Refresh Cache (Read complete collections)
    DB-->>Server: Full dataset updated
    Server->>Cache: Update in-memory collections
    Server-->>User: HTTP 201 Created (Success)
```

---

## 3. Database Checkpoint Snapshot & Rollback Sequence

To protect curriculum mapping integrity and provide an administrative "undo" history, the system operates as follows:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as CMS Administrator
    participant Server as Express Server
    participant History as Firestore (cms_history)
    participant Active as Firestore (Active DB)
    participant Cache as MemoryCache (RAM)

    Note over Admin, Active: Action: Revert Database State
    Admin->>Server: POST /api/revert/:commit_id
    Server->>Active: Read current active state
    Active-->>Server: Active documents
    Server->>History: 1. Create Pre-Revert checkpoint (Allows Undo)
    Server->>History: 2. Read target snapshot (commit_id)
    History-->>Server: Document snapshot states
    Server->>Active: 3. Purge active collections
    Server->>Active: 4. Write snapshot document entries
    Server->>Cache: 5. Force MemoryCache reload
    Server-->>Admin: Return success, UI timeline updates
```
