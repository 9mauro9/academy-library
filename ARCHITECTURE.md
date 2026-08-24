# Architecture Blueprint: Academy Library

This document outlines the visual system architecture, processing flows, caching strategies, and asset versioning engines for the **Academy Library** application and its role within the **Academy Apps** suite (**Academy Timeliner**, **Academy Library**, **Academy Builder**, **Academy Insight**, **Academy Toolkit**).

---

## 0. Standardized Frontend Architecture
- **Framework**: React 19 (`^19.2.7`) with TypeScript (`~6.0.2`) and Vite 8 (`^8.1.1`).
- **Styling Architecture**: Tailwind CSS (`^3.4.17`) + PostCSS (`^8.5.2`) + Autoprefixer (`^10.4.20`) with clean token mapping (`bg-primary`, `text-accent`, `border-border`, etc.) directly referencing `:root` Arista brand tokens.
- **Ecosystem Integration**: `<AcademySuiteMenu currentAppId="library" />` in `src/components/Header.tsx`.

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
        FS[(Firestore: assets, curriculum_map, courses, cms_history, document_chunks, metadata)]
        ST[(Cloud Storage gs://academy-content-bucket)]
        CF[Cloud Functions - Indexer, Triggers & Debounce Engine]
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
    CF -->|Dispatch Event Rebuilds| FS
    
    TL -->|Fetch Asset Metadata| FS
    BL -->|Link Course Assets| FS
    IN -->|Vector Search & Document Lookup| FS
```

---

## 2. Shared Multi-Site Integration

`Academy Library` operates as the central metadata backbone within the **academy-live-builder** multi-site project:

* **Central Firestore**: All assets are indexed in `assets`, `curriculum_map`, `courses`, `cache_invalidations`, `document_chunks`, `metadata`, and `cms_history` collections.
* **Hierarchical Hybrid Storage**: Media assets are organized in `gs://academy-content-bucket/` following domain-first taxonomy (`curriculum/videos/`, `curriculum/diagrams/`, `curriculum/documents/`, `marketing/documents/`, `marketing/media/`, `platform/exports/`).
* **Numerical Track Ordering Engine**: Enforces strict track numerical ordering (1: Network Foundations $\to$ 2: Data Center $\to$ 3: Campus $\to$ 4: Automation $\to$ 5: WAN Routing) across client browsers and backend APIs via explicit slug/name fallback mapping (`getTrackNumber`).
* **Unified Security Rules**: Enforces role-based read/write access across all four applications.
* **Instant Asset Retrieval**: Edge-cached metadata delivery for fast load times across all client portals.

---

## 3. Event-Driven Build Pipeline & Cloud Functions
The Firebase Cloud Functions engine monitors Firestore write events across all Academy Apps:
- **Triggers**: `onCurriculumWrite`, `onAssetWrite`, `onCmsHistoryWrite`, `onDocumentChunkWrite`, and `onCourseWrite`.
- **3-Minute Debounce Lock**: Updates `metadata/build_state` to prevent unnecessary build triggers during bulk sync operations or asset uploads.
- **Automated Rebuild**: Triggers GitHub Actions workflow (`repository_dispatch` `firestore_data_updated`) to keep static portals dynamically updated.
