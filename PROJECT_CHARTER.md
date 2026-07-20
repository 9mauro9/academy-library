# Project Charter: Academy Library

## 1. Problem Statement
**Academy Library** serves as the central digital asset management system (DAM) and document repository for the entire Arista Academy ecosystem. Previously, course manuals, lab guides, slide decks, and media assets were fragmented across multiple cloud drives and local repositories.

This project unifies all training assets into a normalized, single-source-of-truth metadata repository. It provides instant content lookup, asset versioning, dependency tracking, and cross-application access for *Timeliner*, *Builder*, and *Insight*.

## 2. Primary User Personas
* **Curriculum Managers & Authors**: Upload, tag, and version course assets, lab files, and reference documentation.
* **Instructional Designers**: Discover and reuse existing curriculum modules across different tracks.
* **Integrated Applications**: *Academy Builder*, *Timeliner*, and *Insight* consuming media metadata and document links via shared SDK APIs.

## 3. Shared Firebase Backend Services (`academy-live-builder`)
* **Cloud Firestore**: Central database hosting `assets`, `media_catalog`, `document_chunks`, and version logs.
* **Firebase Storage**: Secure object storage for PDF course guides, lab topology files, and media assets.
* **Firebase Cloud Functions**: Automated thumbnail generation, metadata extraction, and index synchronization.
