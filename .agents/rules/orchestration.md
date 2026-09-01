# Orchestration Rules (OS 2.2.1)

## Non-Negotiable Constraints
1. No subagent may be spawned before Stage 1 Pre-Flight Profiling completes successfully.
2. All subagents performing writes must operate in an isolated Git worktree (`branch` mode).
3. File ownership is declared in `.agents/orchestration-manifest.json`; violations are blocked.
4. Barrel files, route registries, and shared config manifests are orchestrator-exclusive.
5. QA/Security Gate must clear every branch before integration — no exceptions.
6. Zero suppressions (@ts-ignore, eslint-disable) in any merged diff.
7. Secret patterns in diffs = immediate FAILED status; no override possible.
8. Subagent depth cap: 2. Tool budget cap: 10 iterations per task.
9. Port assignment: Base + (Subagent_Index × 10). Managed by Sandbox Manager.
10. Merge order is fixed: Contracts → Logic → UI → Docs.
11. Ephemeral worktrees must be pruned immediately after successful merge.
12. All handoffs use the structured JSON schema defined in §11.3.
