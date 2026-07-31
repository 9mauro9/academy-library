# Academy Library CMS

Core Content Management System (CMS) and Master Data Portal for Arista Academy course materials, tracks, assets, and cache invalidation.

## Live Application URL
Hosted on Firebase Hosting at: **[https://academy-library.web.app](https://academy-library.web.app)**

## Overview
Academy Library serves as the central administration portal for managing curriculum data, content assets, track hierarchies, database commit logs, and cache invalidation streams.

- **Architecture**: Single Page Application (SPA)
- **Backend/Database**: Shared Cloud Firestore Database (`academy-live-builder`)
- **Hosting Target**: `academy-library`

## Deployment
```bash
npx firebase deploy --only hosting:academy-library
```
