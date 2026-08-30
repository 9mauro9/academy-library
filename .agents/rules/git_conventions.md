# Git Conventions — Binding Agent Rule (OS 2.2)

> **Scope**: All subagents and human contributors across the Academy portfolio.
> **Standard**: [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
> **Enforcement**: `commitlint` in `pre-commit` hook + `lint-commits.yml` GitHub Action.

---

## 1. Commit Message Format

All commits MUST conform to the Conventional Commits 1.0.0 specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### 1.1 Allowed Types

| Type | When to Use |
| :--- | :--- |
| `feat` | A new feature visible to the end user |
| `fix` | A bug fix |
| `docs` | Documentation-only changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding missing tests or correcting existing tests |
| `chore` | Maintenance tasks (dependency updates, config changes) |
| `perf` | A code change that improves performance |

### 1.2 Scope

The scope is optional but strongly recommended. It identifies the module or domain affected:

```
feat(auth): add Google OAuth sign-in flow
fix(firestore): correct composite index for enrollments query
docs(data-model): add learnerProfile schema definition
refactor(functions): extract sendEmail into shared utility
```

---

## 2. Breaking Changes

Breaking changes MUST be signaled in one of two ways:

**Option A — Exclamation mark suffix on the type:**
```
feat(schema)!: rename userId field to uid across all collections
```

**Option B — BREAKING CHANGE footer:**
```
feat(api): redesign enrollment endpoint response shape

BREAKING CHANGE: The `enrollmentId` field is now returned as `id`.
All consumers must update their response destructuring.
```

Both methods trigger a **MAJOR** SemVer bump via `release-please`.

---

## 3. Agent Attribution Trailer

Every commit authored or co-authored by an Antigravity subagent MUST include the following Git trailer:

```
Co-authored-by: <AgentName> <agent@antigravity.internal>
```

**Examples:**
```
feat(ui): build course enrollment card component

Co-authored-by: InterfaceBuilder <agent@antigravity.internal>
```

```
fix(firestore): add missing index for leaderboard query

Co-authored-by: BlueprintArchitect <agent@antigravity.internal>
Co-authored-by: TheGatekeeper <agent@antigravity.internal>
```

---

## 4. Branch Protection Rules

| Rule | Requirement |
| :--- | :--- |
| Direct commits to `main` | **STRICTLY PROHIBITED** for all agents and humans |
| Branch naming | `feat/<scope>`, `fix/<scope>`, `docs/<scope>`, `chore/<scope>` |
| PR merges | Require at least 1 approval + all CI checks passing |
| Force pushes to `main` | **PROHIBITED** |

---

## 5. CHANGELOG.md Governance

- `CHANGELOG.md` is **machine-generated only** by `release-please-action@v4`.
- **Manual edits to `CHANGELOG.md` are strictly prohibited** for all agents and humans.
- PRs that modify `CHANGELOG.md` directly will be automatically rejected by branch protection.
- The `release-please` bot is the only authorized author of `CHANGELOG.md` entries.

---

## 6. Prohibited Patterns

The following commit message patterns will be rejected by `commitlint`:

```
# ❌ REJECTED — No type prefix
"update the login form"

# ❌ REJECTED — Non-standard type
"update(ui): change button color"

# ❌ REJECTED — Uppercase type
"Fix(auth): correct token expiry"

# ❌ REJECTED — Period at end of description
"feat(api): add rate limiting."

# ✅ ACCEPTED
"feat(auth): add rate limiting to login endpoint"
```

---

## 7. Examples of Valid Commits

```bash
# New feature
git commit -m "feat(courses): add prerequisite validation before enrollment

Validates that a learner has completed prerequisite courses before
allowing enrollment. Returns a structured error with missing prerequisite IDs.

Co-authored-by: TheLogicEngine <agent@antigravity.internal>"

# Bug fix
git commit -m "fix(firestore): correct missing composite index for progress queries

Co-authored-by: BlueprintArchitect <agent@antigravity.internal>"

# Docs update
git commit -m "docs(data-model): add learnerProfile sub-collection schema"

# Breaking change
git commit -m "feat(api)!: replace userId with uid in all API responses

BREAKING CHANGE: All API consumers must update field references from
userId to uid. Backend migration script in scripts/migrate-uid.js."
```
