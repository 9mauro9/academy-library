# Academy Library Core

API-first CMS that treats "Assets" as unique, immutable nodes and "Tracks" as orchestrated curriculum paths in Firestore.

## Getting Started

### 1. Installation
Install NPM dependencies in the project root:
```bash
npm install
```

### 2. Ingest Data (ETL)
Run the extraction and upload pipeline. This parses the Excel files, validates that all asset references are valid, and batch-uploads the records to Firestore.
```bash
npm run ingest
```

### 3. Run REST API
Start the secure Express REST API server (listening on port `8080`):
```bash
npm run api
```

### 4. Run Triggers Simulator
Start the local Firestore triggers simulator. This monitors updates to `assets` and `curriculum_map` and writes invalidation tokens to `cache_invalidations`:
```bash
npm run simulator
```

### 5. Run Integration Verification
To test the REST API, client SDK caching, and event-driven cache invalidation end-to-end, start the REST API and Triggers Simulator in background terminals, then run:
```bash
npm run verify
```

## Architecture Details

- **Firestore collections**:
  - `assets`: Normalised asset documents indexed by a slugified version of their names (e.g. `introduction-to-networks`).
  - `curriculum_map`: Curriculum nodes (`track`, `sub_track`, `lesson`, `topic`) pointing to assets via Firestore `DocumentReference` fields (`asset_ref`).
  - `cache_invalidations`: Realtime cache invalidation events.
- **REST API**: Standardizes retrieval via `GET /content?track_id=XXX&version=latest` and maps resolved assets in a nested JSON structure.
- **SDK**: A client-side wrapper module with built-in in-memory caching and real-time subscription capabilities to invalidate the cache when updates occur.
- **Triggers**: Firestore `onUpdate` triggers written in `functions/index.js` for production deployment.
