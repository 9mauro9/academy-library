# Academy Library: Content Management System & Asset Lifecycle Architecture Specification

* **Document Status**: Architecture & Implementation Guide (Version 2)
* **Target Ecosystem**: Academy Suite (*Library, Timeliner, Builder, Insight, Ask*)
* **Infrastructure Platform**: Google Cloud Platform (Firestore, GCS, Cloud Functions/Run) & Google Anti-Gravity Orchestration

---

## 1. Executive Summary & Architectural Goals

The **Academy Library** acts as the centralized database and asset management core for the entire suite of network engineering training applications. As the volume of video assets scales into hundreds and thousands of items, managing asset lifecycles, title changes, and partial media revisions becomes a critical operational challenge.

Without a robust architecture, minor video tweaks or title modifications can obscure whether materials have been updated or replaced. This document outlines the architectural strategy to extend the Academy Library platform, ensuring granular asset lifecycle tracking, metadata integrity, and high operational performance leveraging Google Cloud Platform and Google Anti-Gravity orchestration.

> [!NOTE]
> **Important Architectural Note on Student Progress Data:**
> The Academy Library system does not natively own, store, or require direct access to student progress information or completion states. Student tracking and LMS state are external concerns. In this architecture, connecting student progress data to the Academy Library database is strictly an optional extension point, enabled via external integrations or decoupled downstream consumers if required.

### Key Architectural Objectives
* **Logical Decoupling**: Completely isolate curriculum structure (learning nodes) from metadata assets and binary storage blobs.
* **Decoupled LMS / Progress Integration**: Provide version-aware metadata endpoints for external student progress tracking without hard dependencies on user database schemas.
* **Title & Metadata Alias History**: Preserve historical context (e.g., "Formerly Known As") to maintain content traceability across title updates.
* **Immutable Audit Trails**: Record all media edits, replacements, and metadata changes in append-only Firestore sub-collections.
* **Autonomous Orchestration**: Support Anti-Gravity agents performing background asset syncing, metadata verification, and lifecycle enforcement.

---

## 2. High-Level System Architecture & Google Cloud Integration

The architecture relies on a multi-tier cloud topology where Google Cloud components handle persistence, processing, and distribution, while Google Anti-Gravity orchestrates background tasks and automated maintenance routines.

| Component | Technology Stack | Architectural Role & Function |
| :--- | :--- | :--- |
| **Central Database** | Google Cloud Firestore | Stores structured JSON metadata, curriculum trees, and version histories with low latency. Optionally links external progress payloads. |
| **Media Storage** | Google Cloud Storage (GCS) | Houses high-definition video binaries, downloadable assets, lab diagrams, and archived video blobs across regional storage buckets. |
| **Compute & Events** | Cloud Functions / Cloud Run | Executes asynchronous triggers on GCS file upload to generate checksums, update metadata, and calculate video durations. |
| **Hosting & Routing** | Firebase Multi-Site Hosting | Provides secure, SSL-encrypted edge distribution for front-end modules (*Timeliner, Builder, Insight, Ask*). |
| **Orchestration Layer** | Google Anti-Gravity | Orchestrates automated asset ingestion, AI-driven content tagging, transcription indexing for *Academy Ask*, and lifecycle maintenance. |

---

## 3. Data Model & Entity Relationship Specification

To prevent breaking course links when assets are updated or renamed, entities are split into abstraction layers: **Learning Node** (curriculum position), **Asset Record** (metadata and active version pointer), and **Version History** (historical records). An optional **Student Progress Payload** schema is defined for external consumers.

### Firestore Document Schemas

#### A. Learning Node Document (`/courses/{courseId}/nodes/{nodeId}`)
```json
{
  "node_id": "node_bgp_01",
  "course_id": "course_arista_advanced",
  "module_title": "Border Gateway Protocol",
  "lesson_order": 3,
  "asset_id": "asset_bgp_intro_v1",
  "is_required": true,
  "created_at": "2026-08-01T10:00:00Z"
}
```

#### B. Asset Record Document (`/assets/{assetId}`)
```json
{
  "asset_id": "asset_bgp_intro_v1",
  "current_title": "EOS BGP Fundamentals & Peering",
  "title_aliases": [
    "Introduction to BGP",
    "Arista BGP Setup Basics"
  ],
  "domain": "curriculum",
  "asset_category": "videos",
  "major_version": 1,
  "minor_version": 2,
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "gcs_uri": "gs://academy-content-bucket/curriculum/videos/bgp_intro_v1_2.mp4",
  "duration_seconds": 845,
  "last_updated": "2026-08-06T08:30:00Z",
  "status": "ACTIVE"
}
```

#### C. Version History Sub-collection (`/assets/{assetId}/history/{versionId}`)
```json
{
  "version_id": "v1.1",
  "major_version": 1,
  "minor_version": 1,
  "title_at_time": "Introduction to BGP",
  "change_type": "MINOR_EDIT",
  "change_description": "Trimmed audio gap at 04:12 and re-rendered 1080p stream.",
  "gcs_uri": "gs://academy-content-bucket/platform/exports/archive_bgp_intro_v1_1.mp4",
  "modified_by": "admin_user_01",
  "timestamp": "2026-08-03T14:20:00Z"
}
```

#### D. Optional Student Progress Payload Schema (`/external_progress/{userId_nodeId}`) [OPTIONAL CONNECTION]
```json
{
  "_note": "OPTIONAL CONNECTION - Academy Library does not manage or require student state natively.",
  "user_id": "usr_9876",
  "node_id": "node_bgp_01",
  "asset_id": "asset_bgp_intro_v1",
  "completed": true,
  "completed_major_version": 1,
  "completed_minor_version": 0,
  "completed_at": "2026-08-02T11:15:00Z",
  "watch_time_seconds": 840
}
```

---

## 4. Asset Lifecycle Framework & Change Matrix

To bring complete clarity to content creators and external front-end systems, changes are categorized into four standard operations. Each operation triggers specific system rules governing versioning.

| Category | Trigger Scenario | Database & Versioning Action | External Progress Impact (If Connected) |
| :--- | :--- | :--- | :--- |
| **Metadata Only** | Fixing typos in title, updating descriptions, or tweaking tags. Media binary untouched. | Append previous title to `title_aliases` if title changed. Version remains unchanged (e.g., `v1.2`). | Completion state unaffected. External UI can optionally display "Formerly Known As" subtitle. |
| **Minor Edit** | Audio cleanup, fixing a minor slide typo, re-encoding video without altering core lesson content. | Increment minor version (`v1.2` $\rightarrow$ `v1.3`). Store previous media blob reference in history. | Completion state unaffected. External UI may show a blue "Updated Content" indicator. |
| **Major Rewrite** | Significant content re-record (e.g., protocol updates, major UI overhauls in EOS). | Increment major version (`v1.3` $\rightarrow$ `v2.0`). Reset minor version to `0`. Log version transition. | External system can flag progress as "Outdated / Re-watch Suggested" based on major version discrepancy. |
| **Replacement / Deprecation** | Topic completely replaced or deprecated in favor of a new architectural standard. | Set asset status to `ARCHIVED`. Create new asset document and update node pointer. | External system sees a new node/asset mapping and resets progress state to Unread. |

---

## 5. UX & Metadata Resolution (Optional Progress Integration)

Because the Academy Library does not directly maintain student records, consuming applications or optional external databases can evaluate asset metadata updates using the following decoupling patterns:

1. **Optional Version Comparison Endpoint**:
   * Academy Library exposes public metadata endpoints (`GET /api/v1/assets/{assetId}/version`).
   * External LMS/Progress tools query the current major/minor version and determine independently if user progress needs to be flagged as updated or requiring review.

2. **Title Alias Resolution**:
   * If an asset title changes, external systems query `title_aliases` to resolve legacy course certificates or historical user watch logs without breaking user reference chains:
     > **EOS BGP Fundamentals & Peering**  
     > *(Formerly: Introduction to BGP)* — Resolved via Title Aliases Endpoint

---

## 6. Ingestion, Sync & Anti-Gravity Automation Workflows

The ingestion and synchronization pipeline ensures zero manual overhead for tracking technical metadata.

### Automated Upload & Sync Steps:
1. **Signed URL Request**: The CMS admin requests a secure GCS upload URL from the Cloud Run API.
2. **Direct Storage Upload**: Media binaries are uploaded directly from the browser/client to Google Cloud Storage, bypassing app servers.
3. **Cloud Event Trigger**: Upon upload completion, a GCS `Finalize` event fires a Cloud Function.
4. **Metadata Extraction & Hash Calculation**: The function computes the SHA-256 checksum, checks duration via FFmpeg, and writes technical metadata into Firestore.
5. **Anti-Gravity Inspection**: Anti-Gravity agents inspect the upload payload, extract transcriptions for search indexing in **Academy Ask**, and verify that all static node IDs remain linked.

---

## 7. Future Extensibility & Operational Considerations

* **Firestore Query Optimization**: Sub-collections are utilized for historical versions (`/history`) to ensure main asset queries stay lightweight and low-latency. Composite indexes are configured for `(course_id, lesson_order)`.
* **GCS Storage Lifecycle Policies**: Configure GCS lifecycle rules to transition archived media blobs (`/archive/*`) from Standard storage to Nearline or Coldline storage after 30 days of inactivity, drastically reducing storage costs.
* **Content Creator Guardrails**: The CMS upload form explicitly mandates selecting a change classification (Metadata Only, Minor Edit, or Major Rewrite) with mandatory changelog notes before saving updates.

This architecture provides an extensible, maintainable, and high-performance blueprint for the Academy Library suite, built for long-term scalability on Google Cloud Platform.
