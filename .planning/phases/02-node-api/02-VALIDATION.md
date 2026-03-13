---
phase: 2
slug: node-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest |
| **Config file** | `jest` block in `package.json` (`rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`) |
| **Quick run command** | `pnpm test -- --testPathPattern="node"` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** `pnpm test -- --testPathPattern="node"`
- **After every plan wave:** `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-W0 | 02-01 | 0 | API-01–05 | setup | `pnpm test -- --testPathPattern="node"` | ❌ W0 | ⬜ pending |
| 2-01-01 | 02-01 | 1 | API-01 | unit | `pnpm test -- --testPathPattern="node.service"` | ❌ W0 | ⬜ pending |
| 2-01-02 | 02-01 | 1 | API-02 | unit | `pnpm test -- --testPathPattern="node.service"` | ❌ W0 | ⬜ pending |
| 2-01-03 | 02-01 | 1 | API-03,04 | unit | `pnpm test -- --testPathPattern="node.service"` | ❌ W0 | ⬜ pending |
| 2-01-04 | 02-01 | 1 | API-05 | unit+contract | `pnpm test -- --testPathPattern="node.service\|sync.contract"` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02-02 | 1 | API-01–05 | integration | `pnpm test -- --testPathPattern="node.controller"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test-setup.ts` — empty file to satisfy Jest `setupFilesAfterEach` config; required before any test runs
- [ ] `src/node/node.service.spec.ts` — stubs for API-01 through API-05 service logic
- [ ] `src/node/sync.contract.spec.ts` — structural assertion that upsert options exclude the four protected fields

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `PATCH /api/v1/node/:id` HTTP response shape | API-01 | Requires running server | `curl -X PATCH http://localhost:5000/api/v1/node/test-id -H 'Content-Type: application/json' -d '{"requirement":"test"}'` |
| `POST /api/v1/workflow/:projectId/sync` end-to-end | API-05 | Requires real DB + running server | Start server, POST sync payload, verify DB rows with sqlite3 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
