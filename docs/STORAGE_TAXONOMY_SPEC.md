# Academy Library: Hierarchical Hybrid Storage & Object Lifecycle Management (OLM) Specification

* **Document Status**: Production Specification & Operational Guide (Version 1.0)
* **Target Ecosystem**: Academy Suite (*Library, Timeliner, Builder, Insight, Ask*)
* **Infrastructure Platform**: Google Cloud Platform (`academy-live-builder`), Google Cloud Storage (GCS), Firebase Admin, Google Anti-Gravity

---

## 1. Executive Summary & Storage Goals

The **Academy Library** platform utilizes a **Hierarchical Hybrid Storage Specification** for managing high-definition video materials, lab diagrams, slide decks, marketing collateral, and system dumps.

To ensure low latency, zero-entropy organization, and cost optimization at scale, all media assets are managed under a strict **domain-first, category-second folder taxonomy** coupled with automated **Object Lifecycle Management (OLM)** policies enforced at the storage bucket level.

---

## 2. Primary Bucket Infrastructure & Configuration

| Parameter | Configuration Value |
| :--- | :--- |
| **Root Bucket URI** | `gs://academy-content-bucket/` |
| **GCP Project ID** | `academy-live-builder` |
| **GCP Project Name** | `academy-apps` |
| **GCP Project Number** | `353347356715` |
| **Primary Region** | `us-central1` |
| **Access Control** | Uniform Bucket-Level Access (`--uniform-bucket-level-access`) |
| **Default Storage Class** | `STANDARD` |
| **Object Versioning** | Enabled (`versioning_enabled: true`) |

---

## 3. Path Taxonomy Specification

All uploaded media assets must comply with a strict domain-first, category-second path taxonomy. Cloud Functions and Signed URL endpoints validate destination paths and file extensions prior to upload execution.

```
gs://academy-content-bucket/
├── curriculum/
│   ├── videos/        # Core video lectures (.mp4, .mkv)
│   ├── diagrams/      # Lab topologies and diagrams (.svg, .png)
│   └── documents/     # Course slides and lab guides (.ppt, .pdf)
├── marketing/
│   ├── documents/     # Product decks, PDFs, brochures, data sheets (.pdf)
│   └── media/         # Promotional trailers and ad videos (.mp4)
└── platform/
    └── exports/       # System dumps and batch export files (.json, .csv, .dump, etc.)
```

### Taxonomy Rules Matrix

| Domain (`domain`) | Category (`asset_category`) | Prefix Path | Whitelisted File Extensions | Description |
| :--- | :--- | :--- | :--- | :--- |
| `curriculum` | `videos` | `curriculum/videos/` | `.mp4`, `.mkv` | Core HD video lectures and lab walkthroughs. |
| `curriculum` | `diagrams` | `curriculum/diagrams/` | `.svg`, `.png` | Vector topologies, rack diagrams, and network schematics. |
| `curriculum` | `documents` | `curriculum/documents/` | `.ppt`, `.pdf` | Course presentation slides, student lab guides, and notes. |
| `marketing` | `documents` | `marketing/documents/` | `.pdf` | Product decks, whitepapers, brochures, and data sheets. |
| `marketing` | `media` | `marketing/media/` | `.mp4` | Promotional trailers, feature highlight videos, and ads. |
| `platform` | `exports` | `platform/exports/` | `.json`, `.csv`, `.dump`, `.tar`, `.gz`, `.zip`, `.xml`, `.bin`, `.bak`, `.sql` | Automated system dumps, CMS database snapshots, and batch exports. |

---

## 4. Object Lifecycle Management (OLM) Policy

To optimize Cloud Storage costs while preserving historical video revisions and automating housekeeping, the `gs://academy-content-bucket/` bucket is configured with the following active OLM policy:

### Applied OLM Rules & Conditions

1. **Curriculum Videos (Cost Optimization for Legacy Revisions)**
   - **Target Prefix**: `curriculum/videos/`
   - **Condition**: Noncurrent (archived/replaced) version older than 30 days (`numNewerVersions: 1`, `daysSinceNoncurrentTime: 30`)
   - **Action**: Transition Storage Class to **`COLDLINE`**

2. **Marketing Collateral (Cleanup of Legacy Decks & Media)**
   - **Target Prefixes**: `marketing/documents/`, `marketing/media/`
   - **Condition**: Noncurrent version older than 90 days with at least 2 newer versions existing (`numNewerVersions: 2`, `daysSinceNoncurrentTime: 90`)
   - **Action**: **`DELETE`**

3. **Platform Exports (Automated Housekeeping)**
   - **Target Prefix**: `platform/exports/`
   - **Condition**: Object age exceeds 14 days (`age: 14`)
   - **Action**: **`DELETE`**

### Applied OLM JSON Policy

```json
{
  "rule": [
    {
      "action": { "type": "SetStorageClass", "storageClass": "COLDLINE" },
      "condition": {
        "matchesPrefix": ["curriculum/videos/"],
        "numNewerVersions": 1,
        "daysSinceNoncurrentTime": 30
      }
    },
    {
      "action": { "type": "Delete" },
      "condition": {
        "matchesPrefix": ["marketing/documents/", "marketing/media/"],
        "numNewerVersions": 2,
        "daysSinceNoncurrentTime": 90
      }
    },
    {
      "action": { "type": "Delete" },
      "condition": {
        "matchesPrefix": ["platform/exports/"],
        "age": 14
      }
    }
  ]
}
```

---

## 5. Event-Driven Validation & REST Endpoints

### 1. Path-Filtered Signed URL Generation (`POST /api/v1/assets/signed-url`)
Validates the destination upload path against the taxonomy prefix matrix and extension whitelist prior to generating a signed GCS upload URL.

**Request Payload:**
```json
{
  "destinationPath": "curriculum/videos/bgp_lecture.mp4",
  "contentType": "video/mp4"
}
```
**Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "destination_path": "curriculum/videos/bgp_lecture.mp4",
  "gcs_uri": "gs://academy-content-bucket/curriculum/videos/bgp_lecture.mp4",
  "domain": "curriculum",
  "asset_category": "videos",
  "signed_url": "https://storage.googleapis.com/academy-content-bucket/curriculum/videos/bgp_lecture.mp4?..."
}
```
**Rejection Response (HTTP 400 Bad Request):**
```json
{
  "error": "Taxonomy validation failed",
  "details": "File extension '.exe' is not allowed for path 'curriculum/videos/'. Allowed extensions: .mp4, .mkv"
}
```

### 2. Decoupled Asset Version Endpoint (`GET /api/v1/assets/:assetId/version`)
Returns asset versioning and storage metadata completely decoupled from LMS/student progress states.

```json
{
  "asset_id": "asset_bgp_intro_v1",
  "current_title": "EOS BGP Fundamentals & Peering",
  "title_aliases": ["Introduction to BGP"],
  "major_version": 1,
  "minor_version": 2,
  "version": 1,
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "gcs_uri": "gs://academy-content-bucket/curriculum/videos/bgp_intro_v1_2.mp4",
  "domain": "curriculum",
  "asset_category": "videos",
  "status": "ACTIVE"
}
```

### 3. Cloud Functions Storage Upload Trigger (`onMediaUpload`)
Triggered on Cloud Storage object creation (`onObjectFinalized`) targeting `academy-content-bucket`. Validates taxonomy compliance and automatically upserts `AssetRecord` documents in Firestore.
