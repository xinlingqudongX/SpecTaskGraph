---
phase: 3
slug: workflow-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.x + ts-jest 29.x |
| **Config file** | `package.json` (jest key) — rootDir: `src`, testRegex: `.*\.spec\.ts$` |
| **Quick run command** | `pnpm test -- --testPathPattern=workflow-export` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --testPathPattern=workflow-export`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | EXPORT-01..06 | unit stub | `pnpm test -- --testPathPattern=workflow-export` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | EXPORT-01 | unit (controller) | `pnpm test -- --testPathPattern=workflow.controller` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | EXPORT-01 | unit (404/empty) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | EXPORT-02 | unit (node fields) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | EXPORT-03 | unit (can_execute) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | EXPORT-04 | unit (topo sort) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | EXPORT-05 | unit (executable_now) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ W0 | ⬜ pending |
| 03-01-08 | 01 | 1 | EXPORT-06 | unit (cycle 422) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/node/workflow-export.service.spec.ts` — stubs for EXPORT-01 through EXPORT-06 (14 test cases)
- [ ] `src/node/workflow.controller.spec.ts` — covers EXPORT-01 controller routing (new file or extend existing)

*Framework already installed — Jest + ts-jest configured in package.json*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 422 body shape `{ error, cycle }` correct | EXPORT-06 | NestJS UnprocessableEntityException envelope wrapping needs smoke test | `curl -X GET /api/v1/workflow/:projectId/export` against a project with cyclic edges; verify response body has `error` and `cycle` array fields at root |
| LogicFlow edge field names in DB | EXPORT-02 | `sourceNodeId`/`targetNodeId` stated in CONTEXT.md but not confirmed in real DB | Inspect `database.sqlite` for a project with edges, confirm field names before implementation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
