# Roadmap: FlowInOne — AI Execution Layer

## Overview

FlowInOne already has a working canvas editor and collaboration backend. This milestone adds the AI execution layer on top: nodes gain structured AI metadata fields (requirement, prompt, attributes), a backend persistence layer tracks status and execution history per node, and an export endpoint produces self-contained JSON that AI IDEs can consume to implement features in topological dependency order. The six phases follow strict data dependencies — schema before API, API before UI, UI before visualization, all of it before the review workflow that ties everything together.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Model** - Establish the authoritative schema and resolve dual-write architectural conflicts before any code is written (4/4 success criteria met)
- [x] **Phase 2: Node API** - Expose CRUD, status transitions, execution history, and canvas sync endpoints (completed 2026-03-13)
- [x] **Phase 3: Workflow Export** - Deliver the AI IDE entry point with topological sort, can_execute flags, and cycle detection (completed 2026-03-13)
- [ ] **Phase 4: Node Edit Panel** - Build the frontend inline card editor where developers fill in requirements and prompts per node
- [ ] **Phase 5: Status Visualization** - Color-code node borders by status on the canvas and keep them in sync via WebSocket
- [ ] **Phase 6: Review Workflow** - Close the human-AI review loop with approve/reject controls and execution history display

## Phase Details

### Phase 1: Data Model
**Goal**: The database schema and architectural contracts are locked so every subsequent phase builds on stable ground
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. `node_metadata` and `node_execution_history` tables exist in SQLite and the migration runs cleanly from scratch
  2. A round-trip test passes: a node converted to workflow JSON and back retains all AI fields (requirement, prompt, attributes) without corruption
  3. The auto-save path in WorkflowManagerService provably cannot overwrite status, requirement, or prompt fields — verified by test or documented contract
  4. NodeMetadataEntity schema document exists stating nodeId is PK, status is backend-only, and sync skips AI fields
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Create NodeMetadataEntity, NodeExecutionHistoryEntity, NodeModule scaffold, register entities, generate and run migration (DATA-01, DATA-02, DATA-03)
- [x] 01-02-PLAN.md — Update NodeStatus enum across all type files, update Instructions schema, fix logicflow-converter spread bug, add round-trip tests (DATA-04, DATA-05)
- [x] 01-03-PLAN.md — Gap closure: fix validation.service.ts stale schemas, create contract spec and schema document for DATA-04 (DATA-04)

### Phase 2: Node API
**Goal**: Backend endpoints exist for all per-node operations so frontend and AI agents have a stable contract to build against
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05
**Success Criteria** (what must be TRUE):
  1. `PATCH /api/v1/node/:id` accepts requirement, prompt, and attributes and persists them without touching status
  2. `PATCH /api/v1/node/:id/status` transitions status and writes a prompt+requirement snapshot to history atomically
  3. `POST /api/v1/node/:id/history` records an AI execution result; `GET /api/v1/node/:id/history` returns entries in reverse-chronological order
  4. `POST /api/v1/workflow/:projectId/sync` upserts canvas node structure without overwriting status, requirement, prompt, or attributes
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Test scaffold (test-setup.ts, spec stubs), 4 Zod DTOs, ProjectModule exports ProjectService (API-01, API-02, API-03, API-04, API-05)
- [ ] 02-02-PLAN.md — NodeService implementation: all 5 methods with TDD RED→GREEN (API-01, API-02, API-03, API-04, API-05)
- [ ] 02-03-PLAN.md — NodeController + WorkflowController wiring, human smoke test of all 5 routes (API-01, API-02, API-03, API-04, API-05)

### Phase 3: Workflow Export
**Goal**: AI IDEs can fetch a single endpoint and get a self-contained, topologically ordered workflow JSON they can execute without any graph traversal logic
**Depends on**: Phase 2
**Requirements**: EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06
**Success Criteria** (what must be TRUE):
  1. `GET /api/v1/workflow/:projectId/export` returns JSON where every node contains nodeId, type, requirement, prompt, attributes, status, and dependencies[]
  2. Every node in the export has a `can_execute` boolean that is true only when all its dependency nodes are completed
  3. The export includes a top-level `execution_order` array (topological sort) and `executable_now` array (currently executable node IDs)
  4. Submitting a workflow with a cyclic dependency returns HTTP 422 with a description of the cycle path
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Test spec stubs (15 RED tests): workflow-export.service.spec.ts (14 cases, EXPORT-01..06) + workflow.controller.spec.ts (1 case, EXPORT-01) (EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06)
- [ ] 03-02-PLAN.md — WorkflowExportService (Kahn sort + cycle detection), GET export route in WorkflowController, NodeModule registration, human smoke test (EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05, EXPORT-06)

### Phase 4: Node Edit Panel
**Goal**: Developers can click any node on the canvas and edit its requirement, prompt, and attributes through an inline card that expands in place
**Depends on**: Phase 2
**Requirements**: EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04, EDITOR-05
**Success Criteria** (what must be TRUE):
  1. Clicking any node on the canvas toggles an inline edit area below the node summary without disrupting the canvas layout
  2. The expanded card displays and allows editing of the requirement textarea, prompt textarea, and an attributes key-value table with add/remove row controls
  3. Content changes auto-save via 500ms debounce calling `PATCH /api/v1/node/:id` with visible success ("已保存 ✓") or error ("保存失败") feedback inside the card
**Plans**: 4 plans

Plans:
- [ ] 04-01-PLAN.md — Wave 0 test scaffolds: node-card.spec.ts (8 RED tests, EDITOR-01..04) + node-api.spec.ts (5 RED tests, EDITOR-05) (EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04, EDITOR-05)
- [ ] 04-02-PLAN.md — CardNodeModel + CardNodeView (HtmlNode) + NodeApiService implementation, all 13 Wave 0 tests GREEN (EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04, EDITOR-05)
- [ ] 04-03-PLAN.md — node-card.css, logicflow.config.ts registerCardNodes, WorkflowEditor.vue node:click wiring (EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04, EDITOR-05)
- [ ] 04-04-PLAN.md — Human smoke test: canvas expand/collapse, auto-save, attributes CRUD, anchor alignment (EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04, EDITOR-05)

### Phase 5: Status Visualization
**Goal**: Node status is immediately visible on the canvas as color-coded borders and stays current without requiring a page refresh
**Depends on**: Phase 4
**Requirements**: VISUAL-01, VISUAL-02, VISUAL-03
**Success Criteria** (what must be TRUE):
  1. Node borders are gray (pending), green (completed), red (failed), and orange (review_needed) matching their current status
  2. When a canvas loads, all nodes are immediately colored according to their stored status fetched from the export endpoint
  3. When any collaborator or AI agent updates a node's status, the canvas border color updates in real time without a page refresh
**Plans**: TBD

### Phase 6: Review Workflow
**Goal**: Developers can approve or reject AI-executed nodes from the edit panel, with rejection forcing prompt refinement before the node can be re-executed
**Depends on**: Phase 5
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04
**Success Criteria** (what must be TRUE):
  1. The edit panel shows "Approve" and "Reject" buttons for nodes in any reviewable state; Approve sets status to completed
  2. Rejecting a node requires a non-empty rejection reason and sets status to review_needed
  3. A node in review_needed state allows prompt editing; saving the updated prompt resets status to pending so it can be re-executed
  4. The edit panel shows the last 5 execution history entries with timestamp, executor, and result summary for each
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

Note: Phase 3 and Phase 4 can run in parallel after Phase 2 completes — they have no cross-dependency.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Model | 3/3 | Complete    | 2026-03-13 |
| 2. Node API | 2/3 | Complete    | 2026-03-13 |
| 3. Workflow Export | 2/2 | Complete    | 2026-03-13 |
| 4. Node Edit Panel | 2/4 | In Progress|  |
| 5. Status Visualization | 0/TBD | Not started | - |
| 6. Review Workflow | 0/TBD | Not started | - |
