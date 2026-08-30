# Data Architecture — Binding Agent Rule (OS 2.2)

> **Scope**: Blueprint Architect, The Logic Engine, Interface Builder, and all subagents that read or write data.
> **SSoT Document**: `docs/data-model.md`
> **Enforcement**: Pre-commit schema drift check; Blueprint Architect gate.

---

## 1. Single Source of Truth (SSoT) — Absolute Precedence

### 1.1 The First-Mutation Rule

`docs/data-model.md` MUST be committed and merged to the working branch **before** any application code that consumes the schema is written.

**Violation examples (PROHIBITED):**
```javascript
// ❌ Writing to a collection not declared in docs/data-model.md
await db.collection('learnerSessions').doc(sessionId).set({ ... });

// ❌ Using a field name that differs from the SSoT declaration
// SSoT says field is "userId" but code uses "uid"
await db.collection('enrollments').doc(id).set({ uid: user.uid });
```

**Compliant workflow:**
```
1. Blueprint Architect updates docs/data-model.md → commits to feat-schema branch
2. PR merged, SSoT is the canonical reference
3. Logic Engine reads docs/data-model.md before writing any Firestore code
4. Interface Builder reads docs/data-model.md before binding UI to data fields
```

### 1.2 Schema Change Protocol

Any change to Firestore collections, document fields, or data types MUST:

1. Be proposed in `docs/data-model.md` first (by Blueprint Architect).
2. Include a migration strategy if existing documents are affected.
3. Be reviewed and approved before consuming code is updated.
4. Never break the existing field contract without a `BREAKING CHANGE:` commit footer.

---

## 2. Firestore Data Model Standards

### 2.1 Collection Naming

- Use `camelCase` for collection names: `enrollments`, `courseProgress`, `learnerProfiles`.
- Use `camelCase` for document field names: `userId`, `createdAt`, `courseId`.
- Use ISO 8601 strings or Firestore `Timestamp` for all date/time fields — never Unix epoch integers.

### 2.2 Document Structure Template

Every document collection declared in `docs/data-model.md` must include:

```yaml
collection: <collectionName>
description: <what this collection stores>
fields:
  - name: <fieldName>
    type: string | number | boolean | timestamp | reference | array | map
    required: true | false
    description: <field purpose>
indexes:
  - fields: [<field1>, <field2>]
    order: asc | desc
    type: composite
accessPatterns:
  - query: <description of how this collection is queried>
    index: <index name if applicable>
```

### 2.3 Sub-Collections for Historical Audits

All mutable records that require audit trails MUST use a `/history` sub-collection:

```
enrollments/{enrollmentId}/history/{changeId}
  - changedAt: Timestamp
  - changedBy: string (userId)
  - previousValue: map
  - newValue: map
  - changeReason: string
```

---

## 3. Firebase Data Connect (Relational Schema)

For relational domain entities managed via Firebase Data Connect:

- Schema `.gql` files live in `dataconnect/schema/`.
- All schema changes follow the same SSoT-first rule: declare in `docs/data-model.md` then update `.gql` files.
- GraphQL mutations must be idempotent where possible.

---

## 4. Cloud Storage Taxonomy

All GCS objects MUST follow the taxonomy defined in `docs/STORAGE_TAXONOMY_SPEC.md`:

```
gs://<bucket>/
  <entity>/<entityId>/<assetType>/<filename>

# Example:
gs://academy-assets/courses/course-abc123/thumbnails/cover.webp
gs://academy-assets/learners/uid-xyz/certificates/completion-2026.pdf
```

- Direct client uploads via Signed URLs only.
- Public objects require an explicit entry in `docs/STORAGE_TAXONOMY_SPEC.md`.
- Lifecycle rules must be configured for archive assets (>30 days → Nearline, >365 days → Archive).

---

## 5. Composite Index Management

- All Firestore composite indexes must be declared in `firestore.indexes.json`.
- Index changes must be tested against the Firebase Emulator before deploying.
- The Blueprint Architect is responsible for maintaining `firestore.indexes.json` in sync with `docs/data-model.md`.
