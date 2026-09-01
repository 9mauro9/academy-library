# Project Charter: Academy Library

## 1. Vision & Problem Statement

### The "Why"
Educational assets, curriculum maps, course slide decks, lab topology diagrams, and track hierarchies were historically fragmented across disparate Google Drives, local filesystems, and static Excel sheets. Maintaining consistent track numbering, preventing asset duplication, enforcing write permissions, and distributing reliable real-time metadata to consumer applications (*Timeliner*, *Builder*, *Insight*) created significant operational friction.

### The "What"
**Academy Library** is the centralized Content Management System (CMS), Master Data Portal, and Digital Asset Management (DAM) platform for the Arista Academy ecosystem. Following its OS 2.2 architectural upgrade, it provides a 100% Firestore-native administration interface, Google OAuth authentication with role-based access control (RBAC), automated Google Sheets API v4 synchronization, hierarchical Cloud Storage integration with Object Lifecycle Management (OLM), and strict numerical track ordering.

---

## 2. Target Personas & User Journeys

### Persona: Curriculum Administrators & Authors
* **Needs**: Authenticate securely, upload and tag digital course assets, edit topic metadata directly, and trigger Google Sheets synchronization.
* **Journey**: Sign in with Google Auth, browse the Track Hierarchy, make live edits guarded by admin RBAC, trigger sheet sync via `⚡ Sync Database`, and monitor dashboard telemetry.

### Persona: Instructional Designers & Course Planners
* **Needs**: Rapidly inspect curriculum maps, verify track sequences (1: Network Foundations $\to$ 5: WAN Routing), and ensure asset links are active.
* **Journey**: Filter assets by track/module in the Library catalog, review media taxonomy tags, and inspect database snapshot version history.

### Persona: Integrated Consumer Applications (*Timeliner*, *Builder*, *Insight*)
* **Needs**: Dependable Single-Source-of-Truth (SSoT) metadata, deterministic track sorting, and automatic cache invalidation.
* **Journey**: Ingest real-time updates from `curriculum_map` and `assets` collections with zero schema drift.

---

## 3. Technology Stack & Cloud Infrastructure

* **Frontend Framework**: React 19 (`^19.2.7`) with TypeScript (`~6.0.2`) and Vite 8 (`^8.1.3`).
* **Styling & Design System**: Tailwind CSS (`v3.4.17`), Arista Design Tokens (`:root` CSS variables), Lucide Icons.
* **Authentication & Authorization**: Firebase Authentication with Google Auth Provider and admin RBAC write guard.
* **Backend & Serverless Infrastructure (`academy-live-builder`)**:
  - **Cloud Firestore**: Database hosting `assets`, `curriculum_map`, `courses`, `cms_history`, `document_chunks`, `metadata`, and `cache_invalidations`.
  - **Google Cloud Storage (GCS)**: `gs://academy-content-bucket/` with domain-first taxonomy and OLM retention rules.
  - **Google Sheets API v4**: Real-time two-way synchronization with Master Assets and Learning Paths sheets.
  - **Firebase Cloud Functions**: 3-minute debounce lock (`metadata/build_state`) triggering GitHub Actions repository dispatch events (`firestore_data_updated`).
  - **Firebase Hosting**: High-speed edge CDN deployment on target `academy-library`.
* **Internationalization (i18n)**:
  - 6 supported locales: English (`en-US`), Spanish (`es-ES`), Italian (`it-IT`), French (`fr-FR`), German (`de-DE`), Polish (`pl-PL`).
  - Cross-tab `BroadcastChannel('academy_i18n_sync')` and WAI-ARIA 1.2 compliant selector.

---

## 4. Kanban Decomposition & Core Capabilities

### Epic 1: OS 2.2 Firestore-Native Architecture (Status: Complete)
* Complete transition to native Firestore SDK operations with optimistic concurrency, transaction guards, and real-time state synchronization.

### Epic 2: Google Authentication & RBAC Write Guard (Status: Complete)
* Robust identity verification restricting administrative mutations, sheet synchronizations, and asset updates to verified administrators while allowing public read access.

### Epic 3: Automated Google Sheets API Sync & CSV Fallback (Status: Complete)
* Bidirectional integration syncing master spreadsheets (`1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww` and `1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988`) with automated schema normalization.

### Epic 4: Hierarchical GCS Taxonomy & OLM Policies (Status: Complete)
* Structured domain storage (`curriculum/videos/`, `curriculum/diagrams/`, `marketing/documents/`, `platform/exports/`) with automated coldline transitions and aging deletion rules.

### Epic 5: Multilingual & Universal Accessibility Standard (Status: Complete)
* OS 2.2 compliant i18n engine with 1:1 translation parity, high-contrast theme tokens, and standardized Legal Disclaimer modal.
