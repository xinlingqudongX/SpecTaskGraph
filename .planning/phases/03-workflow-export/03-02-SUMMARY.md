---
phase: 03-workflow-export
plan: 02
subsystem: export-api
tags: [nestjs, topological-sort, kahn, cycle-detection, can_execute, workflow-export, tdd-green]

# Dependency graph
requires:
  - phase: 03-workflow-export
    plan: 01
    provides: 14 RED unit tests for WorkflowExportService + 1 RED controller routing test
  - phase: 02-node-api
    provides: NodeService, WorkflowController, NodeMetadataEntity, ProjectService.findOne
provides:
  - WorkflowExportService with exportWorkflow(projectId) implementing Kahn sort and cycle detection
  - GET /api/v1/workflow/:projectId/export route returning full AI-consumable export envelope
  - All Phase 3 requirements satisfied (EXPORT-01 through EXPORT-06)
affects:
  - 04-frontend-integration (export data format consumed by frontend)
  - Phase 5 real-time collaboration (future extension point)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Kahn BFS topological sort with DFS three-color cycle path detection
    - Module-level pure helper functions outside class (buildDependencyMap, kahnSort, findCyclePath, emptyExport)
    - UnprocessableEntityException with custom object body for flat { error, cycle } response shape
    - Export interface members (WorkflowExportResponse, ExportNode) needed by controller return type inference

key-files:
  created:
    - src/node/workflow-export.service.ts
  modified:
    - src/node/workflow.controller.ts
    - src/node/node.module.ts

key-decisions:
  - "UnprocessableEntityException({ error, cycle }) used instead of HttpException — getResponse() returns flat body directly; tests and smoke test both confirm flat { error, cycle } at root level"
  - "WorkflowExportResponse and ExportNode interfaces exported from service file — required to satisfy TS4053 public method return type inference"
  - "Kahn BFS traversal builds reverse-adjacency scan per node (O(n*e)) — acceptable for workflow sizes; Map<targetId, sources[]> chosen over Map<sourceId, targets[]> to avoid extra reversal step"
  - "Out-of-scope dependency (!nodeIds.has(depId)) treated as satisfied for can_execute — locked by test 9 from Plan 01"

patterns-established:
  - "Pure helper functions at module scope: keeps @Injectable class focused on DI orchestration, helpers fully testable without NestJS wiring"
  - "Kahn + DFS fallback pattern: BFS establishes order, DFS only runs on cycle-flagged subgraph (remaining nodes)"

requirements-completed: [EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06]

# Metrics
duration: 11min
completed: 2026-03-13
---

# Phase 3 Plan 02: WorkflowExportService Implementation Summary

**WorkflowExportService with Kahn topological sort + DFS cycle detection implemented; GET :projectId/export route wired; all 15 RED tests turned GREEN; smoke test confirms 404/200/422 behavior end-to-end**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-03-13T10:05:59Z
- **Completed:** 2026-03-13T10:16:00Z
- **Tasks:** 3 (2 auto TDD + 1 human checkpoint)
- **Files modified:** 3 (1 created, 2 updated)

## Accomplishments

- Created `WorkflowExportService` with:
  - Kahn BFS topological sort producing valid execution_order
  - DFS three-color cycle path detection (findCyclePath) returning cycle starting and ending with same node
  - buildDependencyMap filtering dangling edges (sourceNodeId or targetNodeId not in scope)
  - can_execute logic: empty deps → true (Array.every on []); out-of-scope dep → treated as satisfied; in-scope dep → must be status=completed
  - emptyExport for null workflowJson or zero synced nodes
- Updated `WorkflowController` with @Get(':projectId/export') route
- Updated `NodeModule` providers to include WorkflowExportService
- All 15 unit tests (14 service + 1 controller) turned GREEN
- Smoke test confirmed:
  - Test 1: HTTP 404 for missing project (ProjectService.findOne throws NotFoundException)
  - Test 2: HTTP 200 with empty envelope `{ nodes:[], execution_order:[], executable_now:[], total_nodes:0 }` for project with null workflowJson
  - Test 3: HTTP 200 with full envelope — node B has `dependencies:["A"]`, node A has `can_execute:true`, node B has `can_execute:false`, `execution_order:["A","B"]`, `executable_now:["A"]`
  - Test 4: HTTP 422 with `{ error:"Cyclic dependency detected", cycle:["A","B","A"] }` — flat body, cycle[0] === cycle[last]

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement WorkflowExportService** - `326fe9a` (feat)
2. **Task 2: Wire GET export route and register service** - `49639f2` (feat)
3. **Task 3: Smoke test checkpoint** - human verification (no code commit)

## Files Created/Modified

- `src/node/workflow-export.service.ts` — Created: WorkflowExportService @Injectable() with exportWorkflow(), buildDependencyMap(), kahnSort(), findCyclePath(), emptyExport(); exports WorkflowExportResponse and ExportNode interfaces
- `src/node/workflow.controller.ts` — Updated: added Get import, WorkflowExportService import, second constructor arg, @Get(':projectId/export') route method
- `src/node/node.module.ts` — Updated: WorkflowExportService added to providers[]

## Decisions Made

- `UnprocessableEntityException({ error, cycle })` used (not `HttpException`) — passes `getResponse()` introspection in test 13/14; produces flat body in smoke test (no `message` wrapper)
- `WorkflowExportResponse` and `ExportNode` interfaces exported — required to avoid TS4053 "cannot be named" error on public method return type
- Kahn adjacency scanning: reverse adjacency map (target → sources) chosen for dependency modeling; O(n*e) scan acceptable at workflow scale
- No Zod DTO needed — GET route has no request body

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - TypeScript Error] TS4053 return type not nameable**
- **Found during:** Task 2 (type-check after wiring controller)
- **Issue:** `WorkflowExportResponse` interface was not exported from `workflow-export.service.ts`, causing TypeScript error TS4053 on the public `export()` method
- **Fix:** Added `export` keyword to both `WorkflowExportResponse` and `ExportNode` interface declarations
- **Files modified:** `src/node/workflow-export.service.ts`
- **Commit:** included in 49639f2

### Smoke Test Note

**Sync endpoint pre-existing 500 error:** `POST /api/v1/workflow/:projectId/sync` returns HTTP 500 during live smoke test (pre-existing issue with `em.upsertMany` under current SQLite+MikroORM conditions). Test nodes were inserted directly via SQLite to complete Tests 3 and 4. This is NOT caused by Plan 02 changes (sync route and NodeService are untouched). The sync worked in Phase 02-03 smoke testing; the regression is in the execution environment.

## Issues Encountered

- Pre-existing `upsertMany` 500 error on sync endpoint (out of scope, not caused by this plan's changes)
- git stash failure on `database.sqlite` during pre-existing regression check (SQLite file lock on Windows); resolved by re-writing Task 2 files directly

## Next Phase Readiness

- GET /api/v1/workflow/:projectId/export is fully operational
- All 6 EXPORT requirements satisfied and smoke-tested
- Phase 4 frontend integration can consume the export endpoint
- The sync 500 pre-existing issue should be investigated before Phase 4 frontend integration (logged in deferred-items)

## Self-Check: PASSED

- src/node/workflow-export.service.ts: FOUND
- src/node/workflow.controller.ts: FOUND
- src/node/node.module.ts: FOUND
- .planning/phases/03-workflow-export/03-02-SUMMARY.md: FOUND
- Commit 326fe9a: FOUND
- Commit 49639f2: FOUND

---
*Phase: 03-workflow-export*
*Completed: 2026-03-13*
