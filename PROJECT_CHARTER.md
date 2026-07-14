# Project Charter: Academy Builder

## 1. Problem Statement
The Academy Builder serves as the unified Content Management System (CMS) and learning path recommendation engine for the Academy curriculum. Previously, course assets and curriculum hierarchy were tightly coupled, leading to duplicate content, broken links, and manual overhead when managing curriculum updates. 

This project normalizes the schema by separating **Assets** (immutable content nodes) from the **Curriculum Structure** (orchestrated learning paths). It provides a secure, high-performance REST API with database versioning, rollbacks, and AI-powered spreadsheet ingestion.

## 2. Primary User Personas
* **Content Administrators**: Non-technical curriculum managers uploading Excel track sheets and modifying specific assets.
* **Developer Consumers**: Developers of consumer applications like *Timeliner* and *Builder* who rely on the SDK to fetch curriculum paths by ID.

## 3. Firebase & GCP Services
* **Cloud Firestore**: Database for assets, curriculum maps, cache invalidation signals, and snapshot version history.
* **Firebase Admin SDK**: Performs high-performance batch writes, transaction management, and collection restores.
* **Google Gemini API (`gemini-2.5-flash`)**: Extracts structural assets and topics from custom, unstructured spreadsheet layouts.
