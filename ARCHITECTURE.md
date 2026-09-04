# Architecture Blueprint: Academy Library CMS

This document outlines the visual system architecture, processing flows, caching strategies, and asset versioning engines for the **Academy Library** application and its role within the **Academy Apps** suite (**Academy Timeliner**, **Academy Library**, **Academy Builder**, **Academy Insight**, **Academy Toolkit**).

---

## 0. Standardized Frontend Architecture
- **Framework**: React 19 (`^19.2.7`) with TypeScript (`~6.0.2`) and Vite 8 (`^8.1.3`).
- **Styling Architecture**: Tailwind CSS (`^3.4.17`) + PostCSS (`^8.5.2`) + Autoprefixer (`^10.4.20`) with clean token mapping (`bg-primary`, `text-accent`, `border-border`, etc.) directly referencing `:root` Arista brand tokens.
- **Authentication**: Firebase Google Auth Provider with Admin RBAC write protections.

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
        LIB[Academy Library CMS Portal]
    end

    subgraph Firebase Shared Backend (academy-live-builder)
        FS[(Firestore: assets, curriculum_map, courses, cms_history, document_chunks, metadata)]
        ST[(Cloud Storage gs://academy-content-bucket)]
        CF[Cloud Functions - Indexer, Triggers & Debounce Engine]
        AUTH[Firebase Auth - Google OAuth & Admin RBAC]
    end

    GS1 --> GS_API
    GS2 --> GS_API
    GS_API --> SYNC
    SYNC -->|1. Pre-Sync Checkpoint| FS
    SYNC -->|2. Bulk Upsert Metadata| FS
    SYNC -->|3. Log Invalidation Event| FS

    AUTH -->|Authorize Admin Operations| LIB
    LIB -->|Trigger Automated Sync| SYNC
    LIB -->|Direct Firestore CRUD| FS
    CF -->|Extract Metadata & Embeddings| FS
    CF -->|Dispatch Event Rebuilds| FS
    
    TL -->|Fetch Asset & Track Metadata| FS
    BL -->|Link Course Assets & Maps| FS
    IN -->|Vector Search & Document Lookup| FS
```

---

## 2. Shared Multi-Site Integration

`Academy Library` operates as the central metadata backbone within the **academy-live-builder** multi-site project:

* **Central Firestore Database**: All assets and maps are indexed in `assets`, `curriculum_map`, `courses`, `cache_invalidations`, `document_chunks`, `metadata`, and `cms_history` collections.
* **Hierarchical Hybrid Storage**: Media assets are organized in `gs://academy-content-bucket/` following domain-first taxonomy (`curriculum/videos/`, `curriculum/diagrams/`, `curriculum/documents/`, `marketing/documents/`, `marketing/media/`, `platform/exports/`).
* **Numerical Track Ordering Engine**: Enforces strict track numerical ordering (1: Network Foundations $\to$ 2: Data Center $\to$ 3: Campus $\to$ 4: Automation $\to$ 5: WAN Routing) across client browsers and backend APIs via explicit slug/name fallback mapping (`getTrackNumber`).
* **Unified Security Rules**: Role-based access control permitting public read operations while restricting administrative writes to authenticated administrators.
* **Instant Asset Retrieval**: Edge-cached metadata delivery ensuring sub-millisecond load times across all client portals.

---

## 3. Event-Driven Build Pipeline & Cloud Functions
The Firebase Cloud Functions engine monitors Firestore write events across all Academy Apps:
- **Triggers**: `onCurriculumWrite`, `onAssetWrite`, `onCmsHistoryWrite`, `onDocumentChunkWrite`, and `onCourseWrite`.
- **3-Minute Debounce Lock**: Updates `metadata/build_state` to prevent unnecessary build triggers during bulk sync operations or asset uploads.
- **Automated Rebuild**: Triggers GitHub Actions workflow (`repository_dispatch` `firestore_data_updated`) to keep static portals dynamically updated.

---

## 4. 🌍 Multilingual System & Internationalization (i18n)

Compliant with **AGENTIC_ENGINEERING_STANDARD OS 2.2**, the application features a comprehensive, accessible, and reactive multilingual system.

### Supported Locales
| Language | Locale Code | Country Flag (SVG) | Native Label |
| :--- | :--- | :--- | :--- |
| **English (Default)** | `en-US` | 🇺🇸 / 🇬🇧 | English |
| **Spanish** | `es-ES` | 🇪🇸 Spain | Español |
| **Italian** | `it-IT` | 🇮🇹 Italy | Italiano |
| **French** | `fr-FR` | 🇫🇷 France | Français |
| **German** | `de-DE` | 🇩🇪 Germany | Deutsch |
| **Polish** | `pl-PL` | 🇵🇱 Poland | Polski |

### Architecture & Engineering Features
1. **Accessible UI Dropdown**: Embedded in the top-right header utility area with WAI-ARIA 1.2 compliance (`role="listbox"`, `role="option"`, full keyboard navigation).
2. **Real-Time Cross-App Sync**: Utilizes browser-native `BroadcastChannel('academy_i18n_sync')` combined with `localStorage('academy_preferred_locale')` to instantly sync language preferences across all active tabs in the Academy ecosystem.
3. **Layout Shift Prevention**: Fluid layouts designed to accommodate German and Polish text expansion (+20% to +35%) without layout breakage or clipping.
4. **Verification & 1:1 Parity**: 100% key parity across all 6 locale dictionaries verified via `npm run test:i18n`.

### 🏛️ Academy Header Utility & Language Selector UI Specification
All Academy applications (Timeliner, Toolkit, Builder, Insight, Library) adhere strictly to the following unified design token and component standard:

| Element | Specification & Design Token | Behavior & Theming |
| :--- | :--- | :--- |
| **Button Container** | Height: `32px` (`h-8`), Radius: `8px` (`rounded-lg`), Padding: `0 0.6rem` | Flex align center, gap `0.45rem`, shadow `0 1px 2px rgba(0,0,0,0.05)` |
| **Dark Theme Button** | BG: `var(--bg-tertiary, #162544)`, Border: `var(--border-color, rgba(115,138,150,0.2))` | Hover: `rgba(255,255,255,0.08)`, Border `rgba(115,138,150,0.4)` |
| **Light Theme Button** | BG: `var(--bg-tertiary, #f1f5f9)`, Border: `var(--border-color, #e2e8f0)` | Hover: `#ffffff`, Border `#cbd5e1`, full button bounding coverage |
| **Open State (`aria-expanded="true"`)** | Dark: border `#06b6d4`, ring `2px rgba(6,182,212,0.25)`; Light: border `#146095`, ring `2px rgba(20,96,149,0.2)` | Active focus/open illumination across light and dark modes |
| **Globe Icon** | Lucide `globe` 13px | Dark: `#22d3ee` (cyan-400); Light: `#0284c7` (sky-600) |
| **Chevron Indicator** | Lucide `chevron-down` 12px, transition `transform 0.15s ease, color 0.15s ease` | **Closed**: points down (`text-muted`). **Open**: rotates 180° into upward caret (`rotate(180deg)`) and illuminates cyan (`#22d3ee` / `#0284c7`) |
| **Dropdown Menu (Listbox)** | Width: `180px` (`w-44`), Radius: `12px` (`rounded-xl`), Margin-top: `6px`, Blur: `12px` | Dark: `#0f182c/95`, border `rgba(115,138,150,0.3)`. Light: `#ffffff/95`, border `#e2e8f0` |
| **Option Hover** | Dark: `rgba(255,255,255,0.08)` text `#ffffff`; Light: `rgba(15,23,42,0.06)` text `#0f172a` | High-contrast highlight across entire option width |
| **Option Selected** | Dark: `rgba(14,165,233,0.15)` text `#38bdf8` bold; Light: `rgba(14,165,233,0.12)` text `#0369a1` bold | Includes matching `check` icon (14px) and 2-letter uppercase ISO code |

#### Engineering Directives
- **Declarative Animation Over Element Mutation**: Chevron arrow rotations MUST be driven declaratively via CSS class/attribute selectors (`.lang-dropdown-btn[aria-expanded="true"] .lang-chevron { transform: rotate(180deg); }` or React state bindings) to prevent orphaned DOM node reference bugs during dynamic icon replacement.
- **Scoped DOM Icon Creation**: When rendering dynamic icon content inside dropdown options, helper methods MUST use scoped parent queries (`safeCreateIconsForParent(listbox)`) rather than unbounded global document scans to eliminate redundant DOM churn and detached node leaks.
