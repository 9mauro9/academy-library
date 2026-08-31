# Academy Library CMS

Core Content Management System (CMS) and Master Data Portal for Arista Academy course materials, tracks, assets, and cache invalidation.

## Live Application URL
Hosted on Firebase Hosting at: **[https://academy-library.web.app](https://academy-library.web.app)**

## Overview
Academy Library serves as the central administration portal for managing curriculum data, content assets, track hierarchies, database commit logs, and cache invalidation streams.

- **Architecture**: Single Page Application (SPA) - React 19 (`^19.2.7`) + TypeScript + Vite 8
- **Styling**: Tailwind CSS (`v3.4.17`) mapped to Arista Design Tokens (`:root` CSS variables)
- **Backend/Database**: Shared Cloud Firestore Database (`academy-live-builder`)
- **Hosting Target**: `academy-library`
- **Data Ingestion Workflow**: Automated Google Sheets API Integration (`sheets.googleapis.com`) with client-side CSV streaming fallback.

---

## Data Ingestion & Automated Google Sheets Sync
Data is pulled directly via Google Sheets API v4 (or client-side CSV export) from two master sources:

1. **Academy Master Assets**: [https://docs.google.com/spreadsheets/d/1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww/edit?usp=sharing)
2. **Academy Master Learning Paths**: [https://docs.google.com/spreadsheets/d/1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988/edit?usp=sharing)

### Ingestion Triggers:
- **Web UI**: Click **⚡ Sync Database** on the **Data Ingestion** or **Dashboard** pages.
- **CLI**: `npm run sync-sheets`

---

## Hierarchical Hybrid Storage & OLM Policy
All media binaries and documents are stored in Google Cloud Storage under **`gs://academy-content-bucket/`** (`academy-live-builder` project).

- **Full Specification Document**: [`docs/STORAGE_TAXONOMY_SPEC.md`](file:///Users/maurolollo/Desktop/Academy%20Library/docs/STORAGE_TAXONOMY_SPEC.md)

### Domain-First Path Taxonomy
- `curriculum/videos/` (`.mp4`, `.mkv`) — HD Video Lectures
- `curriculum/diagrams/` (`.svg`, `.png`) — Network Topologies & Schematics
- `curriculum/documents/` (`.ppt`, `.pdf`) — Course Slides & Lab Guides
- `marketing/documents/` (`.pdf`) — Product Decks, Whitepapers & Brochures
- `marketing/media/` (`.mp4`) — Promotional Trailers & Highlights
- `platform/exports/` (`.json`, `.csv`, `.dump`, `.tar`, `.gz`, `.zip`, `.xml`, `.bin`, `.bak`, `.sql`) — System Dumps & Exports

### Object Lifecycle Management (OLM) Rules
1. **Curriculum Videos**: Replaced/archived versions older than 30 days (`daysSinceNoncurrentTime: 30`, `numNewerVersions: 1`) transition to **`COLDLINE`** storage.
2. **Marketing Collateral**: Noncurrent versions older than 90 days with 2+ newer versions (`daysSinceNoncurrentTime: 90`, `numNewerVersions: 2`) are **`DELETED`**.
3. **Platform Exports**: Export files exceeding 14 days of age (`age: 14`) are automatically **`DELETED`**.

---

## Track Hierarchy & Ordering Rules

### Hierarchy Structure
The **Track Hierarchy Browser** renders curriculum maps according to the row structure of *Academy Master Learning Paths* and database sorting keys:

$$\text{track\_name} \to \text{sub\_track\_name} \to \text{lesson\_name} \to \text{topic\_name} \to \text{asset\_name(s)}$$

Every level displays its assigned database sorting badge:
- `#sub_track_number`
- `#lesson_number`
- `📌 #topic_number`
- `Sub-Topic #sub_topic_number` + `asset_name`

### Track Numerical Ordering & Resolution Engine
Curriculum tracks are ordered strictly by their defined numerical sequence across all client interfaces (`public/app.js`), REST endpoints (`GET /api/tracks`), and SDK background processes:

1. **Track #1**: Network Foundations (`network-foundations` / `Network Foundations`)
2. **Track #2**: Data Center (`data-center` / `Data Center`)
3. **Track #3**: Campus (`campus` / `Campus`)
4. **Track #4**: Automation (`automation` / `Automation`)
5. **Track #5**: WAN Routing (`wan-routing` / `WAN Routing`)

> [!IMPORTANT]
> **Numerical Resolution Fallback Rules**:
> Raw database documents in `curriculum_map` may contain uniform default values (e.g. `sorting.track_number = 1.0` across all rows). To prevent identical numerical values from triggering alphabetical fallback sorting (`automation` $\to$ `campus` $\to$ `data-center`), the resolution engine (`getTrackNumber`) prioritizes explicit track ID/name slug matching (`network-foundations` = 1, `data-center` = 2, `campus` = 3, `automation` = 4, `wan-routing` = 5) prior to evaluating raw document values.

---

## Dashboard Telemetry
The Dashboard overview displays three essential telemetry cards:
- **Total Assets Ingested**: `1015`
- **Curriculum Tracks**: `5`
- **SDK System Status**: `Healthy`

---

## Verification & Testing
```bash
# Run SDK integration & cache invalidation test suite
npm run verify

# Run REST management API test suite
npm run verify-frontend
```

## Deployment
```bash
npx firebase deploy --only hosting:academy-library
```

---

## Legal Disclaimer & Terms of Use
All applications across the Academy suite include an accessible, standardized **Legal Disclaimer** modal accessible via the header trigger:
- **Nature of Software**: This software constitutes an experimental, non-production build provided solely for internal testing, evaluation, and investigational use cases.
- **Assumption of Risk**: End-users assume full, sole, and unconditional responsibility and liability for any utilization, deployment, application, or misuse of the software and its outputs.
- **No Warranty & Data Accuracy**: The application is provided strictly 'as-is' and 'as-available', without warranties of any kind. It may contain defects, technical bugs, inaccuracies, and may produce erroneous calculations, data, or output.
- **Development & Support Status**: The system is actively under development, highly volatile, and explicitly unsupported by any formal service level agreements (SLAs) or dedicated maintenance channels.
- **Independence & Affiliation Disclaimer**: This project is an independent, third-party initiative and maintains no legal, commercial, operational, or content-related affiliation, endorsement, or linkage to Arista Networks, Inc. or any other original equipment manufacturer.
- **Information Classification**: The application contains strictly public, non-confidential, and non-sensitive information, and must not be used to process or store restricted, proprietary, or non-public data.



---

## 🌍 Multilingual System & Internationalization (i18n)

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
