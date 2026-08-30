# Software Hygiene — Binding Agent Rule (OS 2.2)

> **Scope**: All subagents operating on the Academy portfolio.
> **Enforcement**: `oxlint --deny-warnings` (post-edit hook) + DevOps/SRE Agent review.

---

## 1. Zero-Symptom-Masking (MANDATORY)

**This rule has zero exceptions.**

### 1.1 Exception Handling

Exceptions, errors, and rejected Promises MUST be propagated or explicitly logged with full context. They must NEVER be:

- Swallowed silently in empty `catch` blocks
- Replaced with fallback dummy data
- Masked with generic error messages that hide the root cause
- Caught and ignored to avoid surface-level breakage

```javascript
// ❌ PROHIBITED — Swallowed exception
try {
  const data = await fetchCourseData(courseId);
  return data;
} catch (e) {
  return []; // Silent fallback — STRICTLY FORBIDDEN
}

// ❌ PROHIBITED — Caught and ignored
async function syncEnrollments() {
  try {
    await firestoreSync();
  } catch {} // Empty catch — STRICTLY FORBIDDEN
}

// ✅ REQUIRED — Propagate with structured log
import { logger } from 'firebase-functions/v2';

try {
  const data = await fetchCourseData(courseId);
  return data;
} catch (error) {
  logger.error('fetchCourseData failed', {
    courseId,
    errorMessage: error.message,
    stack: error.stack,
  });
  throw error; // Re-throw — upstream caller handles or CI fails fast
}
```

### 1.2 Null / Undefined Payloads

Functions returning data from Firestore, Cloud Storage, or external APIs must validate the response before consuming it:

```javascript
// ❌ PROHIBITED — No null check, silent undefined propagation
const course = snapshot.data();
return course.title; // Crashes silently if document doesn't exist

// ✅ REQUIRED — Explicit guard with structured error
const course = snapshot.data();
if (!course) {
  throw new Error(`Course document not found: ${courseId}`);
}
return course.title;
```

### 1.3 Dummy / Stub Return Values

Returning hardcoded stub data in production code paths is prohibited:

```javascript
// ❌ PROHIBITED — Stub fallback in production logic
async function getUserRole(uid) {
  try {
    return await getRole(uid);
  } catch {
    return 'viewer'; // Dummy role — security risk + symptom masking
  }
}

// ✅ REQUIRED — Fail loudly
async function getUserRole(uid) {
  const role = await getRole(uid); // Will throw on network/auth failure
  return role;
}
```

---

## 2. Empirical Verification Precedence

### 2.1 Task Completion Criteria

No subagent turn, PR, or deployment is declared **complete** unless ALL of the following are true:

- [ ] A specific test suite was executed (not mocked or skipped).
- [ ] The test output (pass/fail log) is un-truncated and attached as evidence.
- [ ] For UI tasks: Chrome DevTools screenshots or Lighthouse scores are included.
- [ ] For Firestore tasks: Firebase Emulator logs confirming rule evaluation are attached.

### 2.2 Verification Output Protocol

**All** verification logs, test summaries, emulator output, and UI walkthrough proof MUST be directed to `$GITHUB_STEP_SUMMARY`:

```yaml
# In GitHub Actions steps:
- name: Run Emulator Test Suite
  run: firebase emulators:exec --only firestore,functions 'npm test'
  
- name: Post Test Summary
  if: always()
  run: |
    echo "## Test Results" >> $GITHUB_STEP_SUMMARY
    echo "$(cat test-results.txt)" >> $GITHUB_STEP_SUMMARY
```

**PROHIBITED** — Do NOT commit loose verification files to the workspace root:
```
# These MUST NOT appear as committed files in the repo root:
verification_log.md     ❌
test_summary.md         ❌
ui_walkthrough.md       ❌
emulator_output.md      ❌
```

Use `$GITHUB_STEP_SUMMARY` or attach as PR comments. Artifacts should use the designated `/artifacts` path structure.

---

## 3. Logging Standards

### 3.1 Structured JSON Logging

All Cloud Functions and Cloud Run services must emit **structured JSON logs**:

```javascript
// ✅ REQUIRED — Structured log with context
import { logger } from 'firebase-functions/v2';

logger.info('Enrollment processed', {
  userId: uid,
  courseId,
  duration: Date.now() - startTime,
  operation: 'enrollUserInCourse',
});

logger.error('Firestore write failed', {
  collection: 'enrollments',
  docId: enrollmentId,
  errorCode: error.code,
  errorMessage: error.message,
});
```

### 3.2 Log Verbosity Levels

| Level | When to Use |
| :--- | :--- |
| `logger.debug` | Internal tracing during development only (stripped in prod) |
| `logger.info` | Successful business operations (enrollment, upload, auth) |
| `logger.warn` | Recoverable anomalies (retry triggered, deprecated API used) |
| `logger.error` | All errors — must include `errorMessage` and `stack` fields |

---

## 4. Test Validation Rules

- Unit tests must run against the **Firebase Local Emulator** — not production Firestore.
- Mock stubs for external services (GCS, Pub/Sub) are acceptable in unit tests but must be labeled clearly with `// MOCK:` comments.
- Integration tests must use the real emulator suite: `firebase emulators:exec --only firestore,functions`.
- 100% of pre-commit hooks must pass before any branch is pushed to origin.

---

## 5. Dependency & Security Hygiene

- All `npm` packages must be pinned to exact versions in production (`--save-exact`).
- `npm audit` must pass with zero high or critical vulnerabilities before any deploy.
- API keys and secrets must be stored in **Google Cloud Secret Manager** — never in `.env` files committed to git.
