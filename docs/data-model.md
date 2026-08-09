# Structural Data Model (Version 2)

This document serves as the single source of truth for the Academy Builder database schema (powered by the Academy Library core database architecture V2).

---

## 1. Collection: `assets` (`/assets/{assetId}`)
Contains normalized, unique, and versioned asset metadata documents.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `asset_id` | **String** (Document ID) | Slugified unique asset identifier (e.g. `asset_bgp_intro_v1`). |
| `current_title` | **String** | The display title of the asset (e.g., `EOS BGP Fundamentals & Peering`). |
| `title_aliases` | **Array of Strings** | Historical titles for traceability ("Formerly Known As"). |
| `domain` | **String** | High-level taxonomy domain (`curriculum`, `marketing`, `platform`). |
| `asset_category` | **String** | Sub-category media classification (`videos`, `diagrams`, `documents`, `media`, `exports`). |
| `gcs_uri` | **String** | Cloud Storage URI (`gs://academy-content-bucket/{domain}/{asset_category}/...`). |
| `major_version` | **Number** | Major version index (resets on complete re-record / major update). |
| `minor_version` | **Number** | Minor version index (increments on audio cleanup / re-encoding). |
| `content_hash` | **String** | SHA-256 binary checksum (e.g. `sha256:e3b0c...`). |
| `duration_seconds` | **Number** | Asset duration in seconds computed via FFmpeg on upload. |
| `last_updated` | **String** | ISO 8601 timestamp of last metadata/binary modification. |
| `status` | **String** | Asset operational state: `ACTIVE` or `ARCHIVED`. |
| `attributes` | **Map** | Additional metadata (skill tags, prerequisite formulas, difficulty scoring). |

---

## 2. Sub-collection: `Version History` (`/assets/{assetId}/history/{versionId}`)
Maintains immutable audit records and historical media pointers for asset rollbacks.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `version_id` | **String** (Document ID) | Semantic version tag (e.g. `v1.1`). |
| `major_version` | **Number** | Major version number at time of change. |
| `minor_version` | **Number** | Minor version number at time of change. |
| `title_at_time` | **String** | Display title when this version was active. |
| `change_type` | **String** | Change classification: `METADATA_ONLY`, `MINOR_EDIT`, `MAJOR_REWRITE`, `DEPRECATION`. |
| `change_description` | **String** | Changelog note provided by administrator. |
| `gcs_uri` | **String** | Cloud Storage URI pointing to the archived media blob (`/archive/...`). |
| `modified_by` | **String** | User ID or agent process committing the change. |
| `timestamp` | **String** | ISO 8601 execution timestamp. |

---

## 3. Collection: `courses` / `nodes` (`/courses/{courseId}/nodes/{nodeId}`)
Defines learning nodes and curriculum module positions decoupled from media binaries.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `node_id` | **String** (Document ID) | Unique learning node identifier (e.g. `node_bgp_01`). |
| `course_id` | **String** | Parent course identifier (e.g. `course_arista_advanced`). |
| `module_title` | **String** | Display title of the curriculum chapter module. |
| `lesson_order` | **Number** | Sequential index of the lesson within the course. |
| `asset_id` | **String** | Pointer reference to the associated `/assets/{assetId}` document. |
| `is_required` | **Boolean** | Mandatory flag for track completion. |
| `created_at` | **String** | ISO 8601 creation timestamp. |

---

## 4. Collection: `cache_invalidations`
Logs real-time change events for client SDK cache eviction.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | **String** (Document ID) | Auto-generated document ID. |
| `type` | **String** | Event classification: `asset_update`, `node_update`, `database_rollback`. |
| `doc_id` | **String** | Document ID that underwent mutation. |
| `change_type` | **String** | Mutation type: `create`, `update`, `delete`. |
| `timestamp` | **String** | ISO 8601 execution timestamp. |
| `details` | **Map** | Delta payload details (e.g., `{ updated_fields: [...] }`). |

---

## 5. Collection: `external_progress` (Optional Extension Point)
Optional downstream payload schema for external LMS systems. Not natively managed by Academy Library core.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `user_id` | **String** | External user/student identifier. |
| `node_id` | **String** | Associated learning node document ID. |
| `asset_id` | **String** | Associated asset document ID. |
| `completed` | **Boolean** | Completion status flag. |
| `completed_major_version` | **Number** | Asset major version completed by user. |
| `completed_minor_version` | **Number** | Asset minor version completed by user. |
| `completed_at` | **String** | ISO 8601 completion timestamp. |
| `watch_time_seconds` | **Number** | Total playback duration recorded for student. |
