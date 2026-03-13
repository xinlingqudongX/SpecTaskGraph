# Feature Landscape

**Domain:** AI-driven workflow execution pipeline (brownfield — adding to existing workflow diagram editor)
**Researched:** 2026-03-13
**Confidence:** MEDIUM — based on codebase analysis + domain knowledge of n8n, Temporal, Airflow, LangGraph patterns. WebSearch unavailable; findings from training knowledge of these systems.

---

## Context: What Already Exists

The codebase already has a functioning layer the new features build on:

- LogicFlow canvas with node types: `root`, `text`, `image`, `video`, `audio`, `file`, `property`
- Node status enum: `pending | running | completed | failed` (in `logicflow.types.ts`)
- Workflow JSON schema with `TaskNode.instructions` (`guide`, `logic`, `criteria`), `dependencies[]`, `assets[]`, `outputs[]`
- WebSocket collaboration gateway
- NestJS backend with project CRUD, SQLite via MikroORM
- Local file system read/write via File System Access API

**Gap the milestone closes:** Nodes currently have the schema fields but no backend persistence for AI metadata, no execution history, no review workflow, and no AI-oriented export endpoint.

---

## Table Stakes

Features users (AI agents + human developers) will assume are present. Missing any of these makes the pipeline non-functional.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Node AI metadata fields (prompt, requirement, attributes) | AI agents need structured input per node to know what to implement | Low | Schema partially exists (`instructions.guide/logic/criteria`). Need to surface in UI edit panel and persist to backend. |
| Explicit dependency list per node | AI must determine topological execution order | Low | Already in schema as `dependencies: string[]`. Needs validation and DAG-aware export. |
| Node status tracking: `pending / in_progress / completed / failed / review_needed` | Without status, AI cannot know which nodes to pick up or skip | Low | `NodeStatus` exists but lacks `review_needed`. Add this value. |
| GET workflow export endpoint (AI-consumable JSON) | AI IDE must pull the full DAG with all metadata in one request | Medium | `GET /api/v1/workflow/:projectId/export` — returns topologically sorted nodes with full AI fields |
| PATCH node status endpoint | AI agent reports back completion or failure | Low | `PATCH /api/v1/node/:id/status` — body `{ status, message? }` |
| Execution history per node (POST + GET) | Audit trail; humans need to see what AI did and why | Medium | `POST /api/v1/node/:id/history`, `GET /api/v1/node/:id/history`. Each record: timestamp, executor, result_summary, status_transition. |
| Frontend node edit panel | Humans fill in requirements and prompts before AI runs | Medium | Slide-out panel for selected node: fields for requirement description, AI prompt, key-value attributes |
| Node status visual indicator on canvas | Developers must see at a glance which nodes are done vs waiting | Low | Color-coded border/badge per node using existing LogicFlow style system |

---

## Differentiators

Features that are not universally expected but would give FlowInOne competitive advantage in this specific niche.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Structured `attributes` node type (key-value pairs) | Encodes entity schemas, config tables, API contracts as structured data AI can reference — not just freeform text | Low | Already has `PropertyNode` type with `properties: Array<{key, value}>`. Needs to be wired into the export as a first-class AI input field. |
| Topological sort in export response | AI IDE doesn't need to implement DAG traversal itself; can process nodes in guaranteed dependency order | Medium | Export endpoint computes topo sort server-side, returns `executionOrder: string[]` alongside full node map |
| `review_needed` status with rejection notes | Enables closed-loop: AI submits, human reviews in-app, rejects with comment, AI retries with updated prompt | Medium | Adds `reviewComment` field to status transition. Combined with history log this creates a full conversation trail. |
| Prompt refinement on rejection | When human rejects, they can edit the node's prompt inline before re-triggering | Low | UI affordance: "Edit prompt and retry" button in review panel. No backend change needed beyond existing PATCH. |
| Execution history diff view | Show what changed in the workflow between two history entries | High | Defer to later milestone. Complexity: requires snapshot storage per execution. |
| DAG completeness score | Show "8 of 12 nodes completed" as a project-level metric | Low | Computed from node statuses on the export/summary endpoint. Zero backend schema changes. |
| Orphan and cycle detection on save | Alert users when they create circular dependencies or disconnected nodes before AI tries to execute | Medium | Already partially implemented in `src/services/validation.service.ts`. Surface as UI warnings. |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| In-app AI execution (calling LLM APIs directly) | Adds API key management, rate limiting, model selection, cost tracking — a separate product surface. Out of scope per PROJECT.md. | Export JSON; let external AI IDE (Claude Code, Cursor) consume it |
| Node locking / mutex during AI execution | Workflow nodes map to distinct features; no concurrent write conflict exists. Adds complexity for zero benefit. Per PROJECT.md decision. | Trust isolation by design |
| Real-time AI execution monitoring (streaming) | WebSocket streaming of AI output is high complexity, low v1 value. Polling is sufficient. | PATCH status endpoint + manual refresh |
| User authentication / multi-tenant isolation | Current design is local-first, single-team. Adding auth is a separate milestone. | No-login operation as designed |
| Version control for workflow snapshots | Git-level diffing of JSON is high complexity. History log covers the audit need. | Per-node execution history instead |
| Mobile / responsive canvas UI | Workflow editing on mobile is not a use case for developers with AI IDEs | Web-only; focus desktop layout |
| AI-generated workflow creation (AI writes the DAG) | Inverse direction — AI consuming, not generating, the DAG. Scope creep. | Humans design the DAG; AI implements nodes |
| Drag-to-reorder execution priority | DAG topology defines order; manual priority overrides create ambiguity for AI | Topological sort is the sole ordering mechanism |

---

## Feature Dependencies

```
node_ai_metadata_fields
  → frontend_node_edit_panel          (UI to fill fields)
  → workflow_export_endpoint          (endpoint reads these fields)

node_status_tracking (add review_needed)
  → patch_status_endpoint             (API to update)
  → node_status_visual_indicator      (UI reflects state)
  → human_review_workflow             (depends on review_needed status value)

execution_history
  → patch_status_endpoint             (history created on status change)
  → frontend_history_view             (UI to show records)

workflow_export_endpoint
  → topological_sort                  (server computes execution order)
  → dag_completeness_score            (derived from node statuses in export)

orphan_cycle_detection
  → frontend_node_edit_panel          (warnings shown inline)
  → workflow_export_endpoint          (export can block on invalid DAG)
```

---

## MVP Recommendation

The minimum viable set for the AI pipeline to actually function end-to-end:

**Phase 1 — AI Metadata + Export (enables AI to read the workflow)**
1. Add `prompt` and `requirementDescription` fields to node (backend entity + frontend panel)
2. Persist node AI fields to SQLite via new `NodeEntity` or extend project metadata
3. `GET /api/v1/workflow/:projectId/export` — returns full DAG with topo sort
4. Node status visual indicator on canvas (color by status)

**Phase 2 — Execution Loop (enables AI to report back + human to review)**
5. `PATCH /api/v1/node/:id/status` — status transitions with optional message
6. `POST/GET /api/v1/node/:id/history` — per-node execution log
7. `review_needed` status value + rejection comment field
8. Frontend history view and review approval/rejection UI

**Defer:**
- Execution history diff view: snapshot storage complexity, not needed for v1
- DAG completeness score: nice-to-have dashboard metric, one-liner addition to export response whenever ready

---

## Node Metadata Fields: What AI Agents Need

Based on patterns from n8n, Temporal, and agentic pipeline designs, these are the fields an AI agent requires per task node to execute it without ambiguity:

**Mandatory for execution:**
| Field | Purpose | Maps To (existing schema) |
|-------|---------|--------------------------|
| `nodeId` | Unique reference | `TaskNode.nodeId` — exists |
| `name` | Human-readable task name | `TaskNode.name` — exists |
| `requirementDescription` | What the feature must do (business intent) | `instructions.guide` — exists, rename/clarify |
| `prompt` | AI-specific instruction (how to implement) | `instructions.logic` — exists, rename/clarify |
| `acceptanceCriteria` | How to know it's done | `instructions.criteria` — exists |
| `dependencies` | List of nodeIds that must complete first | `TaskNode.dependencies` — exists |
| `status` | Current state; AI skips non-pending nodes | `TaskNode.status` — exists, add `review_needed` |

**Optional but high value:**
| Field | Purpose | Maps To |
|-------|---------|---------|
| `attributes` | Structured key-value data (DB schema, config, API contract) | `PropertyNode` type, `config.properties[]` — exists in frontend, needs backend persistence |
| `assets[].path` | Files AI should read as context | `TaskNode.assets` — exists in schema |
| `outputs[].path` | Files AI should produce | `TaskNode.outputs` — exists in schema |
| `metadata.context` | Free-form additional context bag | `TaskNode.metadata` — exists |

**Conclusion:** The existing `TaskNode` schema in `src/types/workflow.types.ts` already defines all necessary fields. The gap is that: (a) the backend has no entity storing these fields — they only live in the local JSON file, and (b) the frontend has no edit panel to fill them in. The milestone is about wiring, not inventing new schema.

---

## Workflow JSON Schema Conventions (How Similar Tools Structure This)

Based on n8n, Temporal, and Airflow patterns:

**n8n pattern:** Each node has `parameters` (user-configured inputs), `type` (node type identifier), and `id`. Workflow has `connections` map (source → target list). No explicit `dependencies` array — connectivity is inferred from connections.

**Temporal pattern:** Activities have typed inputs/outputs. Workflow definitions are code, not JSON. Status is managed by the Temporal server, not embedded in the JSON.

**Airflow pattern:** DAGs defined in Python. `task_id`, `upstream_task_ids` (explicit dependency list), `dag_id`. No AI prompt field natively.

**FlowInOne's schema advantage:** The existing `TaskNode` structure with explicit `dependencies[]`, `instructions`, and `outputs[]` is actually more AI-friendly than any of these tools because it is declarative and self-contained. An AI agent can parse the export JSON and know exactly what to implement without any additional tooling.

**Recommended export envelope:**
```json
{
  "schemaVersion": "1.0.0",
  "projectId": "...",
  "projectName": "...",
  "exportedAt": "ISO8601",
  "executionOrder": ["node_1", "node_3", "node_2"],
  "nodes": { "node_1": { ...TaskNode }, ... },
  "edges": [ ...Edge ]
}
```
Key conventions:
- `executionOrder` array gives topological sort — AI processes in this order
- `nodes` as a map (keyed by `nodeId`) not an array — O(1) lookup by AI
- `edges` array retained for graph visualization

---

## Sources

- Codebase analysis: `src/types/workflow.types.ts`, `src/schemas/workflow.schema.ts`, `frontend/src/types/logicflow.types.ts`, `frontend/src/utils/logicflow-converter.ts`
- Project definition: `.planning/PROJECT.md`
- Domain knowledge: n8n workflow JSON structure (training knowledge, MEDIUM confidence), Temporal workflow patterns (training knowledge, MEDIUM confidence), Airflow DAG conventions (training knowledge, MEDIUM confidence), LangGraph agent patterns (training knowledge, LOW confidence — recent, may have changed)
- Note: WebSearch was unavailable. Schema conventions section is based on training data and should be validated against current official docs if precise compatibility is needed.
