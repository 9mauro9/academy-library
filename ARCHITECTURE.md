# Architecture Blueprint: Academy Library

This document outlines the visual system architecture, processing flows, caching strategies, and asset versioning engines for the **Academy Library** application.

---

## 1. System Topology & Data Flow

```mermaid
graph TD
    subgraph Data Sources
        GS1[Google Sheets: Master Assets]
        GS2[Google Sheets: Master Learning Paths]
    end

    subgraph Ingestion & ETL Engine
        SYNC[Automated Sync Engine: sync_sheets.cjs / API]
        GS_API[Google Sheets API v4: sheets.googleapis.com]
    end

    subgraph Client Applications
        TL[Academy Timeliner]
        BL[Academy Builder]
        IN[Academy Insight RAG]
        LIB[Academy Library Portal]
    end

    subgraph Firebase Shared Backend (academy-live-builder)
        FS[(Firestore assets, curriculum_map, courses, cache_invalidations, cms_history)]
        ST[(Cloud Storage gs://academy-content-bucket)]
        CF[Cloud Functions - Indexer & Processing]
        EXT[(Optional external_progress LMS)]
    end

    GS1 --> GS_API
    GS2 --> GS_API
    GS_API --> SYNC
    SYNC -->|1. Pre-Sync Checkpoint| FS
    SYNC -->|2. Bulk Upsert Metadata| FS
    SYNC -->|3. Log Invalidation Event| FS

    LIB -->|Trigger Automated Sync| SYNC
    LIB -->|Manage Assets| FS
    CF -->|Extract Metadata & Embeddings| FS
    
    TL -->|Fetch Asset Metadata| FS
    BL -->|Link Course Assets| FS
    IN -->|Vector Search & Document Lookup| FS
```

---

## 2. Shared Multi-Site Integration

`Academy Library` operates as the central metadata backbone within the **academy-live-builder** multi-site project:

* **Central Firestore**: All assets are indexed in `assets`, `curriculum_map`, `courses`, `cache_invalidations`, and `cms_history` collections, with decoupled optional integration for `external_progress`.
* **Hierarchical Hybrid Storage**: Media assets are organized in `gs://academy-content-bucket/` following domain-first taxonomy (`curriculum/videos/`, `curriculum/diagrams/`, `curriculum/documents/`, `marketing/documents/`, `marketing/media/`, `platform/exports/`).
* **Unified Security Rules**: Enforces role-based read/write access across all four applications.
* **Instant Asset Retrieval**: Edge-cached metadata delivery for fast load times across all client portals.
