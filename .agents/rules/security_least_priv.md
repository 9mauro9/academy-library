# Security & Least-Privilege — Binding Agent Rule (OS 2.2)

> **Scope**: The Gatekeeper, Blueprint Architect, and all subagents modifying `firestore.rules`, IAM policies, or Secret Manager configurations.
> **Enforcement**: Firebase Local Emulator validation required before any security rule deploy.

---

## 1. The Gatekeeper Protocol

The Gatekeeper subagent is the sole authorized author of changes to:
- `firestore.rules`
- Firebase Storage security rules
- Cloud IAM role bindings
- Secret Manager secret configurations

No other subagent may modify security rule files without The Gatekeeper's explicit approval.

---

## 2. Least-Privilege Firestore Security Rules

### 2.1 Default-Deny Posture

All Firestore security rules MUST start from a default-deny posture:

```javascript
// ✅ REQUIRED — Explicit default deny at root
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default: deny everything unless explicitly matched below
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 2.2 Prohibited Rule Patterns

The following patterns are **STRICTLY PROHIBITED** as they violate least-privilege:

```javascript
// ❌ PROHIBITED — Open wildcard write access
match /enrollments/{id} {
  allow write: if true;
}

// ❌ PROHIBITED — Auth check only, no role validation
match /courses/{courseId} {
  allow write: if request.auth != null; // Anyone authenticated can write
}

// ❌ PROHIBITED — Overly broad resource access
match /{collection}/{document=**} {
  allow read, write: if request.auth != null;
}
```

### 2.3 Required Rule Patterns

```javascript
// ✅ REQUIRED — Role-based access with ownership check
match /enrollments/{enrollmentId} {
  allow read: if request.auth != null
    && (request.auth.uid == resource.data.userId
        || request.auth.token.role == 'admin');

  allow create: if request.auth != null
    && request.auth.uid == request.resource.data.userId
    && request.resource.data.keys().hasAll(['userId', 'courseId', 'createdAt']);

  allow update: if request.auth != null
    && request.auth.uid == resource.data.userId
    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['userId', 'courseId']);

  allow delete: if request.auth.token.role == 'admin';
}
```

---

## 3. Firebase Emulator Validation Protocol

### 3.1 Mandatory Pre-Deploy Validation

**ALL security rule changes MUST be validated against the Firebase Local Emulator before any deploy to production.**

```bash
# Start emulator with security rules
firebase emulators:start --only firestore

# Run security rules test suite
npm run test:rules

# Example test using @firebase/rules-unit-testing
```

```javascript
// test/firestore.rules.test.js
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

describe('Firestore Security Rules', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-academy-library',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  test('unauthenticated user cannot read enrollments', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('enrollments').get());
  });

  test('learner can read own enrollment', async () => {
    const db = testEnv.authenticatedContext('learner-uid-123').firestore();
    await assertSucceeds(
      db.collection('enrollments').where('userId', '==', 'learner-uid-123').get()
    );
  });

  test('learner cannot read another learners enrollment', async () => {
    const db = testEnv.authenticatedContext('learner-uid-456').firestore();
    await assertFails(
      db.collection('enrollments').doc('enrollment-owned-by-123').get()
    );
  });
});
```

### 3.2 Emulator Test Coverage Requirements

Before any security rule PR is approved, the following must be tested and logged:

| Test Case | Required |
| :--- | :--- |
| Unauthenticated access → deny | ✅ Mandatory |
| Authenticated user accessing own data → allow | ✅ Mandatory |
| Authenticated user accessing others' data → deny | ✅ Mandatory |
| Admin role → allow elevated access | ✅ Mandatory if admin role used |
| Write with invalid/missing fields → deny | ✅ Mandatory |
| Immutable field modification → deny | ✅ Mandatory |

---

## 4. IAM Least-Privilege Standards

### 4.1 Cloud Functions Service Account

Cloud Functions 2nd Gen must run under a dedicated service account with only the permissions it needs:

```bash
# Create dedicated service account
gcloud iam service-accounts create academy-functions-sa \
  --display-name="Academy Cloud Functions Service Account"

# Grant only required roles (example for a function that reads Firestore + writes GCS)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:academy-functions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:academy-functions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

**PROHIBITED**: Assigning `roles/editor` or `roles/owner` to any service account.

### 4.2 Secret Manager Protocol

- All API keys, service account JSON, and sensitive configuration MUST live in **Google Cloud Secret Manager**.
- Secrets are never stored in `.env` files committed to git (`.env` must be in `.gitignore`).
- Functions access secrets via the Secret Manager MCP or `firebase functions:secrets:access`.
- Secret access is logged and audited via Cloud Audit Logs.

---

## 5. Security Rule Change Governance

| Step | Action | Owner |
| :- | :--- | :--- |
| 1 | Propose rule changes in a `feat-security` branch | The Gatekeeper |
| 2 | Write emulator test cases covering the new rules | The Gatekeeper |
| 3 | Run `npm run test:rules` — 100% pass required | DevOps/SRE Agent |
| 4 | Post emulator test log to `$GITHUB_STEP_SUMMARY` | DevOps/SRE Agent |
| 5 | PR reviewed and approved | Lead Architect |
| 6 | Merge triggers `firebase deploy --only firestore:rules` | CI/CD Pipeline |
