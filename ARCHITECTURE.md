# Architecture Blueprint: Academy Library

This document outlines the visual system architecture, processing flows, caching strategies, and asset versioning engines for the **Academy Library** application.

---

## 1. System Topology & Data Flow

```mermaid
graph TD
    subgraph Client Applications
        TL[Academy Timeliner]
        BL[Academy Builder]
        IN[Academy Insight RAG]
        LIB[Academy Library Portal]
    end

    subgraph Firebase Shared Backend (academy-live-builder)
        FS[(Firestore assets & media_catalog)]
        ST[(Cloud Storage for Docs & Media)]
        CF[Cloud Functions - Indexer & Processing]
    end

    LIB -->|Upload & Manage Assets| ST
    LIB -->|Write Metadata & Tags| FS
    CF -->|Extract Metadata & Embeddings| FS
    
    TL -->|Fetch Asset Metadata| FS
    BL -->|Link Course Assets| FS
    IN -->|Vector Search & Document Lookup| FS
```

---

## 2. Shared Multi-Site Integration

`Academy Library` operates as the central metadata backbone within the **academy-live-builder** multi-site project:

* **Central Firestore**: All assets are indexed in `assets` and `media_catalog` collections.
* **Unified Security Rules**: Enforces role-based read/write access across all four applications.
* **Instant Asset Retrieval**: Edge-cached metadata delivery for fast load times across all client portals.
