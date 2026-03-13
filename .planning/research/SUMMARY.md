# Project Research Summary

**Project:** FlowInOne — AI-driven workflow execution extension
**Domain:** AI orchestration pipeline layered onto an existing workflow diagram editor (brownfield)
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

FlowInOne is a brownfield extension of an existing Vue 3 + LogicFlow + NestJS workflow editor. The milestone adds an AI execution layer: nodes gain structured AI metadata fields (requirements, prompts, attributes), a backend persistence layer tracks status and execution history per node, and an export endpoint produces self-contained JSON that AI IDEs (Claude Code, Cursor) can consume to implement features node-by-node in topological dependency order. The human developer fills in requirements on each node via a new sidebar panel, triggering an AI agent that marks nodes complete or submits them for review. All of this is achievable without adding any new npm dependencies to either the frontend or backend packages.

The recommended approach is strictly additive: extend the existing `ExtendedNodeConfig.properties` TypeScript interface for AI fields, create a new `NodeModule` with two MikroORM entities (`NodeMetadataEntity`, `NodeExecutionHistoryEntity`), and add a workflow export endpoint that pre-computes topological sort and `can_execute` flags so AI agents need zero graph-traversal logic. The entire feature set fits cleanly into established NestJS module boundaries, existing Zod DTO patterns, and LogicFlow's `setProperties`/`getProperties` API.

The dominant risk is architectural, not technical: the codebase currently has two incompatible node type systems (canvas-oriented vs. execution-oriented), and node status can be written from two paths (local file auto-save and the new status API). Both of these must be resolved explicitly in Phase 1 before any API work begins. A `NodeMetadataEntity` table with `nodeId` as primary key is the single most important database decision in the milestone — it prevents the race condition that would silently drop AI agent status updates under concurrent writes.

---

## Key Findings

### Recommended Stack

This is a fully brownfield extension. The existing stack — Vue 3, LogicFlow 2.x, NestJS 11 + Fastify, MikroORM 6 + SQLite, Zod + nestjs-zod, and the WebSocket collaboration gateway — is sufficient for every feature in scope. No new libraries are required.

**Core technologies and their roles in this milestone:**
- **LogicFlow `properties` bag** — stores AI fields per node in-memory; existing `[key: string]: any` escape hatch accommodates new typed fields without runtime change
- **MikroORM `NodeMetadataEntity`** — authoritative persistence for `requirement`, `prompt`, `attributes`, `status` per node; separate from the workflow JSON blob to enable row-level updates
- **MikroORM `NodeExecutionHistoryEntity`** — append-only audit log with `promptSnapshot` column; enables prompt rollback comparison across review cycles
- **Zod + nestjs-zod DTOs** — validates the 4-state `aiStatus` enum at the API boundary; no library-level enum column needed (SQLite maps MikroORM enums to TEXT anyway)
- **WebSocket CollaborationGateway (existing)** — reused to broadcast `node:status:changed` events to connected browsers when AI agents PATCH status; no new notification infrastructure needed
- **Kahn's algorithm (hand-rolled, ~30 lines)** — topological sort for `execution_order` and `executable_now` in the export response; no graph library dependency justified for a simple DAG

### Expected Features

**Must have (table stakes) — Phase 1 + 2:**
- Node AI metadata fields: `requirement`, `prompt`, `attributes` — nodes without these cannot be sent to AI agents
- Node status tracking: `pending | completed | failed | review_needed` — AI agents skip non-pending nodes; must be backend-authoritative
- `GET /api/v1/workflow/:projectId/export` — AI IDE entry point; returns topologically sorted, self-contained JSON
- `PATCH /api/v1/node/:id/status` — AI agent reports completion or failure
- `POST /api/v1/node/:id/history` + `GET /api/v1/node/:id/history` — execution audit trail
- Frontend `NodeEditPanel.vue` — human fills requirements and prompts before AI runs
- Node status visual indicator (color-coded borders by status) — developer situational awareness on canvas

**Should have (competitive differentiators):**
- `executable_now` array in export response — pre-computed list of nodes whose dependencies are all `completed`; eliminates AI-side graph traversal
- `can_execute` boolean per node in export — single-node eligibility flag for AI without list scan
- `review_needed` with rejection notes + prompt refinement UI — closed-loop human-AI review cycle
- DAG cycle detection in export endpoint (422 on cyclic graph) — prevents infinite recursion in AI agent dependency resolver
- WebSocket push for `node:status:changed` — status visible on canvas instantly without page refresh

**Defer (v2+):**
- Execution history diff view (snapshot storage, high complexity)
- DAG completeness score dashboard metric (one-liner addition when ready)
- AI agent polling optimization (ETag / `?status=pending` filter)
- Multiple AI agent coordination (`claimed_by` + optimistic locking)
- Mobile/responsive canvas layout
- AI-generated workflow creation

### Architecture Approach

The extension introduces a clean separation of concerns: the LogicFlow canvas remains the source of truth for graph topology (which nodes exist and how they connect), while the new `NodeMetadataEntity` table is the authoritative source for AI execution state (status, prompts, history). The two are reconciled in the export endpoint via a `POST /api/v1/workflow/:projectId/sync` call that upserts node rows from canvas structure on every save without touching backend-owned fields. This avoids the critical race condition of embedding mutable AI state inside the monolithic `workflowJson` JSON blob.

**Major components:**
1. **`NodeModule` (NestJS, new)** — `NodeController`, `NodeService`, `NodeMetadataEntity`, `NodeExecutionHistoryEntity`; handles all per-node CRUD, status transitions, history, and metadata
2. **`WorkflowExportController` (NestJS, new)** — assembles AI-consumable export JSON: JOINs canvas topology from `workflowJson` with AI metadata from `NodeMetadataEntity`, computes topological sort, derives `can_execute` per node
3. **`NodeEditPanel.vue` (Vue 3, new)** — right-side slide-in panel triggered by `node:click`; fields for `requirement`, `prompt`, `attributes` key-value table, status dropdown, execution history list with approval/rejection controls
4. **`logicflow.config.ts` (frontend, extended)** — status-to-color mapping in `getNodeStyle()`: gray (pending), green (completed), red (failed), amber (review_needed), blue/pulse (running)
5. **`CollaborationGateway` (NestJS, existing, extended)** — receives `node:status:changed` event from `NodeService` and broadcasts to all clients in the project room; no new WebSocket infrastructure needed
6. **SQLite `node` + `node_execution_history` tables (new)** — separate from the existing `project.workflow_json` blob; enables per-row status updates without full-document read-modify-write

### Critical Pitfalls

1. **Dual NodeType enum conflict** — `logicflow.types.ts` uses canvas types (`text`, `image`, `property`) while `workflow.types.ts` uses execution types (`task`, `decision`). The export endpoint must use LogicFlow `nodeId` values verbatim as primary keys — no re-mapping. Audit `logicflow-converter.ts` round-trip identity before any API work. Write a round-trip test as acceptance criterion.

2. **Dual write path — status reversion** — The 500ms auto-save in `WorkflowManagerService` will overwrite SQLite with stale `pending` status if node status lives in both the local JSON file and `NodeEntity`. Decision required in Phase 1: status is backend-only (`NodeEntity`), never written to the local JSON file. The sync endpoint (`POST /sync`) must explicitly skip status/requirement/prompt fields when upserting.

3. **JSON blob race condition under concurrent AI updates** — If AI metadata is stored in `ProjectEntity.workflowJson`, concurrent PATCH requests from two AI agents on different nodes cause a last-write-wins data loss. `NodeMetadataEntity` as a separate table with `nodeId` PK makes every status update a single-row write with no conflict.

4. **Prompt not captured in execution history** — When a reviewer rejects a node and revises the prompt, the previous prompt is irrecoverably lost. Add `promptSnapshot TEXT` and `requirementSnapshot TEXT` columns to `NodeExecutionHistoryEntity` and populate them from the pre-update `NodeMetadataEntity` state on every status transition.

5. **Converter spread operator corrupting new AI fields** — The `...nodeData.config` spread in `logicflow-converter.ts` will flow structured objects (`attributes: [{key, value}]`) through LogicFlow's text label system, silently coercing arrays to `"[object Object]"`. New AI fields must be added to the `standardProps` exclusion set AND explicitly mapped in both converter functions — never rely on the spread for structured data.

---

## Implications for Roadmap

Based on the dependency graph established by architecture and pitfall research, the following 6-phase structure is recommended. Each phase has a hard dependency on the prior phase completing.

### Phase 1: Data Model and Architecture Decisions
**Rationale:** The two critical architectural decisions (authoritative status source, canonical nodeId identity) must be locked before any code is written. Every subsequent phase depends on these contracts. Building API code before resolving them requires rewrites.
**Delivers:** Finalized `NodeMetadataEntity` and `NodeExecutionHistoryEntity` schemas; MikroORM migration run; canonical nodeId identity documented; auto-save/status write path decision documented; `logicflow-converter.ts` audit complete with round-trip test passing.
**Addresses:** Table-stakes node status tracking; prevents Pitfalls 1, 4, 5, 9.
**Avoids:** Dual write path status reversion; JSON blob race conditions; converter corruption of AI fields.

### Phase 2: Core Node API Endpoints
**Rationale:** Frontend panel and AI agent integration are both blocked until these endpoints exist. Building them before the frontend avoids designing UI against imagined APIs.
**Delivers:** `PATCH /api/v1/node/:id/status`, `POST /api/v1/node/:id/history`, `GET /api/v1/node/:id/history`, `PATCH /api/v1/node/:id` (AI metadata), `POST /api/v1/workflow/:projectId/sync`.
**Uses:** NestJS `NodeModule`, Zod DTOs, MikroORM entities from Phase 1.
**Implements:** `NodeController`, `NodeService` with state machine for status transitions; prompt snapshot on every status write (addresses Pitfall 3).

### Phase 3: Workflow Export Endpoint
**Rationale:** The export endpoint depends on node rows existing (Phase 1) and being populated via the sync endpoint (Phase 2). It is the AI IDE entry point — must be stable before any end-to-end testing with Claude Code or Cursor.
**Delivers:** `GET /api/v1/workflow/:projectId/export` with topological sort, `execution_order`, `can_execute` per node, `executable_now` list; DAG cycle detection returning 422 on invalid input; allowlist-based field filtering (no rendering metadata in output).
**Addresses:** Differentiator features (topo sort, `executable_now`); Pitfalls 2 (UI field noise), 7 (cycle detection), 8 (prompt injection structural markers).
**Research flag:** This phase may benefit from validating the export format against actual Claude Code CLAUDE.md consumption patterns before finalizing.

### Phase 4: Frontend NodeEditPanel
**Rationale:** Depends on Phase 2 APIs being stable. Building UI after API avoids breaking changes to the component interface. The right-side panel layout change affects `WorkflowEditor.vue` layout but not its core canvas logic.
**Delivers:** `NodeEditPanel.vue` component with `requirement` textarea, `prompt` textarea, `attributes` key-value table (add/remove rows), status dropdown; wired to Phase 2 PATCH endpoints on Save; canvas `node:click` handler in `WorkflowEditor.vue` that opens panel.
**Uses:** Vue 3 reactivity only; no new frontend libraries; LogicFlow `getProperties`/`setProperties` for reading canvas state into panel.
**Implements:** Frontend side of the authoring flow data path (per ARCHITECTURE.md section "Authoring Flow").

### Phase 5: Node Status Visualization
**Rationale:** Enhancement over the working data flow. Canvas color coding requires the same Phase 2 status API and Phase 4 panel to be in place to observe the full cycle. Implementing colors before the data layer works gives false confidence.
**Delivers:** Status-to-color mapping in `logicflow.config.ts` `getNodeStyle()`; canvas load calls export endpoint and applies `lf.setProperties(nodeId, { status })` for all nodes; WebSocket `node:status:changed` handler in `WorkflowEditor.vue` updates canvas without page refresh.
**Addresses:** Table-stakes status visual indicator; Pitfall 11 (status invisible without refresh) via WebSocket broadcast from `CollaborationGateway`.
**Standard patterns:** LogicFlow `getNodeStyle()` overrides are well-documented; WebSocket event wiring follows existing collaboration gateway pattern. Skip deep phase research.

### Phase 6: Execution History Panel and Human Review Workflow
**Rationale:** Final phase because it depends on all prior phases: history data (Phase 2), status transitions (Phase 2), canvas feedback (Phase 5), and the edit panel container (Phase 4).
**Delivers:** Execution history list embedded in `NodeEditPanel.vue` (last 5 entries, "view all"); Approve/Reject buttons; rejection comment field (enforced minimum length to prevent rubber-stamping); criteria field displayed prominently in review mode; prompt refinement on rejection.
**Addresses:** Differentiator `review_needed` closed loop; Pitfall 6 (rubber-stamping) by surfacing `criteria` as primary review element.

### Phase Ordering Rationale

- Phases 1-2 are strictly sequential: no API is buildable before the schema and identity model are finalized.
- Phases 3-4 can run in parallel after Phase 2 completes (export endpoint and frontend panel have no cross-dependency).
- Phase 5 depends on Phase 4 (canvas must reflect panel state), but can partially start after Phase 2 (status color mapping in `logicflow.config.ts` has no UI dependencies).
- Phase 6 requires Phase 4 (panel container) and Phase 2 (history data) — it is always last.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Export Endpoint):** The AI-consumable JSON format should be validated against actual Claude Code consumption behavior. The `CLAUDE.md`-style conventions for how Claude Code parses structured JSON task inputs are partially documented but worth confirming before the format is locked.
- **Phase 1 (MikroORM migration strategy):** MikroORM 6.x upsert API details (`em.upsert()` vs find-or-create) should be confirmed against exact version in use (6.6.8) before Phase 2 implementation.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Core API):** NestJS module/controller/Zod DTO pattern is used throughout the existing codebase. No research needed.
- **Phase 4 (Frontend Panel):** Vue 3 component with REST calls — entirely standard patterns already in the codebase.
- **Phase 5 (Status Visualization):** LogicFlow `getNodeStyle()` and `setProperties` patterns are verified by existing production code in `logicflow.config.ts` and the converter.
- **Phase 6 (Review UI):** Standard Vue 3 form component; no novel patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations derived from direct codebase analysis; no new dependencies needed; all patterns already used in production code |
| Features | MEDIUM | Table-stakes features are well-defined from codebase gap analysis; differentiators are inferred from n8n/Temporal/Airflow domain knowledge (WebSearch unavailable) |
| Architecture | HIGH | Component boundaries, data flows, and anti-patterns all derived from direct code inspection of `WorkflowEditor.vue`, existing entities, and `logicflow-converter.ts` |
| Pitfalls | HIGH | All 5 critical pitfalls are grounded in actual code patterns found in the repository; the race condition and converter spread issue are verified by reading the source |

**Overall confidence:** HIGH

### Gaps to Address

- **Export format AI consumption validation:** The exact JSON structure that produces best results for Claude Code as a task consumer is inferred from training knowledge. Validate with a live test during Phase 3 planning — export a real workflow and run it through Claude Code to confirm the `prompt` / `requirement` / `attributes` fields are consumed as intended.
- **`instructions.guide/logic/criteria` consolidation:** The existing schema splits requirements into three subfields with `min(1)` validation. Research recommends collapsing to two fields (`requirement` + `prompt`) for reduced friction. This schema change should be confirmed with the product owner before Phase 1 migration is generated — it has downstream effects on the existing backend Zod schema in `workflow.schema.ts`.
- **MikroORM 6.6.8 upsert exact API:** Training knowledge covers MikroORM 6.x `em.upsert()` availability since 5.7. The exact signature in 6.6.8 should be confirmed against the installed package before Phase 2 implementation to avoid runtime surprises.

---

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `frontend/src/types/logicflow.types.ts` — confirmed dual NodeType enum conflict
- `frontend/src/utils/logicflow-converter.ts` — confirmed spread operator risk and `standardProps` exclusion set pattern
- `frontend/src/config/logicflow.config.ts` — confirmed `getNodeStyle()` per-node style override pattern
- `src/project/entities/project.entity.ts` — confirmed JSON blob storage and existing MikroORM entity patterns
- `src/schemas/workflow.schema.ts` — confirmed existing AI field structure (`instructions.guide/logic/criteria`) and missing cycle detection
- `src/mikro-orm.config.ts` — confirmed entity scanning and SQLite configuration
- `src/collaboration/collaboration.gateway.ts` — confirmed WebSocket room infrastructure available for reuse
- `frontend/src/services/workflow-manager.service.ts` — confirmed 500ms auto-save debounce and dirty flag pattern
- `frontend/package.json` — confirmed LogicFlow 2.1.11, MikroORM 6.6.8, NestJS 11.x exact versions

### Secondary (MEDIUM confidence — training knowledge of specific versions)
- NestJS 11 module/controller patterns
- MikroORM 6.x `em.upsert()`, `@Property({ type: 'json' })`, `onUpdate` callbacks
- LogicFlow 2.x `properties` bag round-trip behavior (verified by production converter code)

### Tertiary (MEDIUM confidence — domain knowledge, WebSearch unavailable)
- n8n workflow JSON structure — informed export format design
- Temporal workflow patterns — informed execution status model
- Airflow DAG conventions — informed `execution_order` / `executable_now` design
- LangGraph agent patterns — informed AI field naming; LOW confidence (recent, rapidly changing)

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
