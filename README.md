# Academy Library CMS

Core Content Management System (CMS) and Master Data Portal for Arista Academy course materials, tracks, assets, and cache invalidation.

## Live Application URL
Hosted on Firebase Hosting at: **[https://academy-library.web.app](https://academy-library.web.app)**

## Overview
Academy Library serves as the central administration portal for managing curriculum data, content assets, track hierarchies, database commit logs, and cache invalidation streams.

- **Architecture**: Single Page Application (SPA)
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

## Track Hierarchy & Ordering Rules

### Hierarchy Structure
The **Track Hierarchy Browser** renders curriculum maps according to the row structure of *Academy Master Learning Paths* and database sorting keys:

$$\text{track\_name} \to \text{sub\_track\_name} \to \text{lesson\_name} \to \text{topic\_name} \to \text{asset\_name(s)}$$

Every level displays its assigned database sorting badge:
- `#sub_track_number`
- `#lesson_number`
- `📌 #topic_number`
- `Sub-Topic #sub_topic_number` + `asset_name`

### Track Numerical Ordering
Curriculum tracks are ordered strictly by their database `track_number`:

1. **Track #1**: Network Foundations (`network-foundations`)
2. **Track #2**: Data Center (`data-center`)
3. **Track #3**: Campus (`campus`)
4. **Track #4**: Automation (`automation`)
5. **Track #5**: WAN Routing (`wan-routing`)

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

