# Architecture Patterns

**Domain:** AI-driven workflow execution system (brownfield extension)
**Researched:** 2026-03-13
**Confidence:** HIGH — based on direct codebase inspection

---

## Existing Architecture (Baseline)

Before defining what to build, the current system must be understood exactly.

### What Exists Today

```
Browser (Vue 3 + LogicFlow)
  |-- WorkflowEditor.vue     Canvas, node CRUD, undo/redo
  |-- FileBrowser.vue        File tree via File System Access API
  |-- WorkspaceManager.vue   Directory picker
  |
  |-- filesystem.service.ts  Read/write .json files to local disk
  |-- workflow-manager.service.ts  Open/save lifecycle, 500ms debounce
  |
  [REST /api/v1/project/*] --> NestJS 11 + Fastify (port 5000)
                                |-- ProjectEntity (id, name, basePath, workflowJson, techStack)
                                |-- ProjectAsset (filePath, fileRole, lastHash)
                                |-- SQLite via MikroORM
  [WebSocket ws://localhost:5000/ws] --> CollaborationGateway
                                          |-- rooms, users, operation logs
```

**Critical observation:** Nodes do NOT have their own backend entity. They exist only as:
1. JSON embedded in `ProjectEntity.workflowJson` (a JSON blob column)
2. Local `.json` files on disk (the authoritative workflow snapshot)

There is no per-node persistence in the backend today.

### Existing Workflow JSON Schema (src/schemas/workflow.schema.ts)

The backend already defines a rich Zod schema for workflows:

```
WorkflowGraph
  projectId, projectName, version, createdAt, updatedAt
  nodes: TaskNode[]
    nodeId, type (start/task/decision/parallel/end)
    name, description
    instructions: { guide, logic, criteria }   <-- AI fields PARTIALLY exist
    dependencies: string[]                      <-- DAG edges already modeled
    assets: Asset[]  { path, role, description }
    outputs: Output[] { name, type, path }
    status: pending | running | completed | failed | skipped
    position: { x, y }
    metadata: Record<string, unknown>           <-- extensible catch-all
  edges: Edge[]
    edgeId, source, target, type, condition, label
```

The frontend uses a DIFFERENT, lighter schema in `frontend/src/types/logicflow.types.ts`:
- Node `properties` is a loose bag: `{ title, status, textContent, resourceUrl, properties: [{key, value}], ... }`
- Node types are `root | text | image | video | audio | file | property` (media-focused)
- These do NOT match the backend TaskNode schema

**This schema divergence is the primary architectural challenge.**

---

## Recommended Architecture for AI Execution Layer

### System Component Map

```
[AI IDE: Claude Code / Cursor]
  |-- GET /api/v1/workflow/:projectId/export   (poll for work)
  |-- POST /api/v1/node/:nodeId/history        (report result)
  |-- PATCH /api/v1/node/:nodeId/status        (update state)

[Browser: Vue 3]
  WorkflowEditor.vue
    |-- NodeEditPanel.vue (NEW)   AI fields editor
    |-- NodeStatusBadge (NEW)     Visual status indicator
    |-- ExecutionHistoryPanel (NEW) Per-node history viewer
    |
    [REST] --> NestJS backend
    [WebSocket] --> CollaborationGateway (existing)

[NestJS Backend]
  ProjectModule (existing, extend)
  NodeModule (NEW)
    |-- NodeEntity         (NEW MikroORM entity)
    |-- NodeHistoryEntity  (NEW MikroORM entity)
    |-- WorkflowExportController (NEW)
    |-- NodeStatusController (NEW)
  CollaborationModule (existing)
    --> broadcast node status changes to connected browsers

[SQLite]
  project (existing)
  project_asset (existing)
  node (NEW)
  node_execution_history (NEW)
```

---

## Database Schema Design

### Decision: Separate Node Table (not JSON extension)

**Rationale:** The `ProjectEntity.workflowJson` blob cannot be queried per-node without loading the entire workflow. Node status, execution history, and AI metadata need:
- Per-node updates (`PATCH /node/:id/status`) without rewriting the whole JSON
- Execution history as a separate time-series (`N` records per node)
- Indexing by status for AI polling ("give me all pending nodes")

Extending the JSON blob would require reading-and-rewriting the whole document on every status update, creating race conditions in multi-user scenarios.

**Schema:**

```sql
-- New: node table
CREATE TABLE node (
  id          TEXT PRIMARY KEY,         -- matches LogicFlow node id
  project_id  TEXT NOT NULL REFERENCES project(id),
  node_type   TEXT NOT NULL,            -- text | image | video | audio | file | property
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed | review_needed
  -- AI metadata fields
  requirement TEXT,                     -- 需求说明 (plain text, maps to instructions.guide)
  prompt      TEXT,                     -- AI Prompt (maps to instructions.logic)
  -- Attribute data for 'property' node type
  attributes  TEXT,                     -- JSON: [{key: string, value: string}]
  -- Canvas position (denormalized for export speed)
  pos_x       REAL,
  pos_y       REAL,
  -- Audit
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- New: node_execution_history table
CREATE TABLE node_execution_history (
  id          TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL REFERENCES node(id),
  project_id  TEXT NOT NULL,            -- denormalized for faster project-level queries
  executor    TEXT NOT NULL,            -- who ran it: "claude-code", "cursor", "human:alice"
  result      TEXT NOT NULL,            -- completed | failed | review_needed
  summary     TEXT,                     -- short outcome description
  output_ref  TEXT,                     -- optional: file path or URL of produced output
  ran_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**MikroORM entity strategy:** Create `NodeEntity` and `NodeExecutionHistoryEntity` in `src/node/entities/`. Register in `mikro-orm.config.ts`. Generate migration.

### Node Sync Strategy (Canvas <-> Backend)

The LogicFlow canvas is the source of truth for graph topology (which nodes exist, how they connect). The backend is the source of truth for AI metadata and execution state.

On every canvas save:
1. Frontend calls `POST /api/v1/workflow/:projectId/sync` with the current LogicFlow graph
2. Backend upserts `NodeEntity` rows for all nodes in the payload (by node id)
3. Backend does NOT overwrite `status`, `requirement`, `prompt`, `attributes` during sync — those are backend-owned fields
4. Nodes deleted from the canvas are soft-deleted (add `deleted_at` column) not hard-deleted, to preserve history

---

## API Design

### New Endpoints

All prefixed `/api/v1` per project convention.

#### Workflow Export (for AI IDE polling)

```
GET /api/v1/workflow/:projectId/export

Response 200:
{
  "schema_version": "1.0.0",
  "project_id": "...",
  "project_name": "...",
  "exported_at": "ISO8601",
  "nodes": [
    {
      "id": "node-abc",
      "type": "text",
      "title": "User Authentication",
      "status": "pending",
      "requirement": "Implement JWT-based login",
      "prompt": "Create a NestJS AuthModule with passport-jwt...",
      "attributes": [],
      "dependencies": ["node-xyz"],  // derived from edges
      "position": { "x": 100, "y": 200 }
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-xyz", "target": "node-abc" }
  ],
  "execution_order": ["node-xyz", "node-abc"]  // topological sort, pre-computed
}
```

The `execution_order` field eliminates DAG computation from the AI agent side. Nodes whose dependencies all have status `completed` are immediately executable.

#### Node Status Update

```
PATCH /api/v1/node/:nodeId/status
Body: { "status": "completed" | "failed" | "review_needed" }
Response 200: { "id": "...", "status": "...", "updated_at": "..." }
```

#### Node Execution History

```
POST /api/v1/node/:nodeId/history
Body: {
  "executor": "claude-code",
  "result": "completed",
  "summary": "Implemented JWT auth module with tests",
  "output_ref": "src/auth/"
}
Response 201: { "id": "...", "ran_at": "..." }

GET /api/v1/node/:nodeId/history
Response 200: {
  "node_id": "...",
  "history": [
    { "id": "...", "executor": "...", "result": "...", "summary": "...", "ran_at": "..." }
  ]
}
```

#### Node AI Metadata Update (from frontend panel)

```
PATCH /api/v1/node/:nodeId
Body: {
  "requirement": "...",
  "prompt": "...",
  "attributes": [{ "key": "tableName", "value": "users" }]
}
Response 200: { full node object }
```

#### Workflow Sync (canvas save → backend)

```
POST /api/v1/workflow/:projectId/sync
Body: { LogicFlow graph JSON with all nodes and edges }
Response 200: { "synced_nodes": 12, "deleted_nodes": 0 }
```

### Existing Endpoints (unchanged)

```
GET    /api/v1/project
POST   /api/v1/project
GET    /api/v1/project/:id
PATCH  /api/v1/project/:id
DELETE /api/v1/project/:id
```

---

## Frontend Panel Design

### Where AI Fields Live

The existing `WorkflowEditor.vue` has a toolbar + full-height canvas. There is no right-side panel today. The pattern for LogicFlow editors is a slide-in properties panel triggered by node click.

**Recommended layout change:**

```
+--toolbar------------------------------------------+
|  [node buttons] [save] [export]                   |
+--sidebar-------+--canvas-----------+--ai-panel---+
| FileBrowser    | LogicFlow canvas  | NodeEditPanel|
| (existing)     | (existing)        | (NEW, 320px) |
|                |                   | visible when |
|                |                   | node selected|
+----------------+-------------------+--------------+
```

**NodeEditPanel.vue** (new component, slides in on `node:click` event):

```
Node: [title, editable inline]
Type: [text badge]
Status: [dropdown: pending / completed / failed / review_needed]

---- AI Fields ----
Requirement:
[textarea - plain text requirement description]

AI Prompt:
[textarea - the prompt sent to AI IDE]

---- Attributes (property node type only) ----
[key-value table with add/remove rows]

---- Execution History ----
[CollapsibleSection]
  executor | result | time | summary
  (last 5 entries, "view all" link)

[Save] [Cancel]
```

**Node status visual indicators:**

Extend `logicflow.config.ts` node style configuration:

```
pending       → gray border, no fill tint
completed     → green border (#22c55e), light green fill
failed        → red border (#ef4444), light red fill
review_needed → amber border (#f59e0b), light amber fill
running       → blue border (#3b82f6), animated pulse
```

Status is stored in `NodeEntity.status` (backend). On canvas load, the frontend fetches node status from `GET /api/v1/workflow/:projectId/export` and applies styles via LogicFlow's `setProperties` API.

### Data Flow for Node Status

```
1. AI IDE calls PATCH /node/:id/status { status: "completed" }
2. Backend updates NodeEntity
3. Backend emits WebSocket event: { type: "node:status:changed", nodeId, status }
4. CollaborationGateway broadcasts to project room
5. Frontend WorkflowEditor receives event
6. Frontend calls lf.setProperties(nodeId, { status }) to update canvas style
7. NodeEditPanel (if open for that node) reactively updates
```

This is real-time without polling. The existing WebSocket infrastructure handles step 3-6.

---

## Workflow JSON Schema for AI Export

The exported JSON must be self-contained: an AI agent reading it needs zero additional API calls to understand the full task graph.

```json
{
  "schema_version": "1.0.0",
  "exported_at": "2026-03-13T10:00:00Z",
  "project": {
    "id": "proj-123",
    "name": "E-commerce Platform",
    "tech_stack": {}
  },
  "nodes": [
    {
      "id": "node-001",
      "type": "text",
      "title": "User Authentication Module",
      "status": "pending",
      "requirement": "Implement secure JWT-based login with refresh tokens",
      "prompt": "Create a NestJS AuthModule. Use @nestjs/passport with passport-jwt strategy. Include: POST /auth/login, POST /auth/refresh, GET /auth/me. Store refresh tokens in Redis. Write unit tests.",
      "attributes": [],
      "dependencies": [],
      "can_execute": true
    },
    {
      "id": "node-002",
      "type": "property",
      "title": "User Table Schema",
      "status": "pending",
      "requirement": "Define the users database table",
      "prompt": "",
      "attributes": [
        { "key": "id", "value": "uuid primary key" },
        { "key": "email", "value": "varchar(255) unique not null" },
        { "key": "password_hash", "value": "varchar(255) not null" }
      ],
      "dependencies": [],
      "can_execute": true
    },
    {
      "id": "node-003",
      "type": "text",
      "title": "Protected Routes Middleware",
      "status": "pending",
      "requirement": "Add JWT guard to all protected API routes",
      "prompt": "Apply JwtAuthGuard to all controllers except AuthController...",
      "attributes": [],
      "dependencies": ["node-001"],
      "can_execute": false
    }
  ],
  "edges": [
    {
      "id": "edge-001",
      "source": "node-001",
      "target": "node-003",
      "label": ""
    }
  ],
  "execution_order": ["node-001", "node-002", "node-003"],
  "executable_now": ["node-001", "node-002"]
}
```

**Key fields explained:**
- `can_execute` — pre-computed: true if all dependencies have status `completed`
- `executable_now` — list of node IDs the AI can start immediately (saves AI-side graph traversal)
- `execution_order` — topological sort of the full DAG
- `attributes` — key-value pairs for `property` nodes, empty array for others
- `prompt` — empty string is valid; AI IDEs should handle gracefully

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| WorkflowEditor.vue | Canvas rendering, node CRUD, connection to WebSocket | NodeEditPanel (events), backend REST, WebSocket |
| NodeEditPanel.vue (NEW) | Display/edit AI fields for selected node | WorkflowEditor (receives selected node), backend REST |
| NodeStatusBadge (NEW) | Render status-appropriate color on LogicFlow node | LogicFlow canvas theme system |
| ExecutionHistoryPanel (NEW) | Show per-node history | NodeEditPanel (embedded), backend REST |
| NodeModule (NEW backend) | Node CRUD, status, history, export | ProjectModule (project FK), CollaborationGateway (broadcast) |
| WorkflowExportController (NEW) | Assemble export JSON with DAG sort | NodeModule, ProjectModule |
| CollaborationGateway (existing) | Broadcast node status changes | NodeModule (receives status events) |

---

## Data Flow

### Authoring Flow (human fills AI fields)

```
User clicks node on canvas
  --> WorkflowEditor emits node:click
  --> NodeEditPanel opens with nodeId
  --> NodeEditPanel fetches GET /api/v1/node/:id (or from export cache)
  --> User edits requirement / prompt / attributes
  --> User clicks Save
  --> PATCH /api/v1/node/:id { requirement, prompt, attributes }
  --> Backend updates NodeEntity
  --> NodeEditPanel shows success
```

### AI Execution Flow

```
AI IDE polls GET /api/v1/workflow/:projectId/export
  --> Gets list of executable_now nodes
  --> Picks a node, reads requirement + prompt + attributes
  --> Implements the feature
  --> POST /api/v1/node/:nodeId/history { executor, result, summary }
  --> PATCH /api/v1/node/:nodeId/status { status: "review_needed" }
  --> Backend broadcasts WebSocket: { type: "node:status:changed" }
  --> Frontend canvas updates node color to amber (review_needed)
```

### Human Review Flow

```
Developer sees amber node on canvas
  --> Clicks node, NodeEditPanel shows execution history
  --> Reviews AI output
  --> Clicks "Approve" in NodeEditPanel
  --> PATCH /api/v1/node/:nodeId/status { status: "completed" }
  --> Node turns green on canvas
  --> Downstream nodes become eligible (can_execute: true on next export)

  OR:
  --> Clicks "Reject", optionally edits prompt
  --> PATCH /api/v1/node/:nodeId/status { status: "failed" }
  --> Node turns red; AI IDE sees it on next poll and can re-attempt
```

### Canvas Sync Flow

```
User modifies graph structure (add/delete/move nodes)
  --> WorkflowEditor auto-saves (500ms debounce, existing behavior)
  --> filesystem.service.ts writes to local .json (existing)
  --> ALSO: POST /api/v1/workflow/:projectId/sync (NEW)
  --> Backend upserts NodeEntity rows (does not touch status/requirement/prompt)
```

---

## Suggested Build Order

Dependencies determine the correct phase sequence:

### Phase 1: Backend Data Layer
**Build first** — everything else depends on having node storage.
- Create `NodeEntity` and `NodeExecutionHistoryEntity`
- Add to MikroORM config, run migration
- Basic CRUD service for NodeEntity

**Why first:** No frontend panel or AI polling is possible without the node table.

### Phase 2: Core API Endpoints
**Build second** — unblocks both frontend and AI agents.
- `PATCH /api/v1/node/:id/status`
- `POST /api/v1/node/:id/history`
- `GET /api/v1/node/:id/history`
- `PATCH /api/v1/node/:id` (AI metadata fields)
- `POST /api/v1/workflow/:projectId/sync`

**Why second:** Frontend panels and AI IDE integration can't function without these.

### Phase 3: Workflow Export Endpoint
**Build third** — depends on Phase 1+2 data being populated.
- `GET /api/v1/workflow/:projectId/export`
- Topological sort algorithm (DAG walk on edges)
- `can_execute` and `executable_now` pre-computation

**Why third:** Requires nodes and their statuses to exist before export is meaningful.

### Phase 4: Frontend NodeEditPanel
**Build fourth** — depends on Phase 2 APIs.
- `NodeEditPanel.vue` component
- Node click handler in `WorkflowEditor.vue`
- AI field editing (requirement, prompt, attributes)
- Status dropdown control

**Why fourth:** API layer must be stable before building UI against it.

### Phase 5: Node Status Visualization
**Build fifth** — extends Phase 4.
- Status-based node colors in `logicflow.config.ts`
- Load status from export endpoint on canvas open
- WebSocket status change handler in `WorkflowEditor.vue`

**Why fifth:** Visual indicators are enhancement; core data flow should work first.

### Phase 6: Execution History Panel
**Build sixth** — pure UI, depends on Phase 2 APIs.
- History list inside `NodeEditPanel.vue`
- Human review approval/rejection controls

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding AI State in workflowJson Blob
**What:** Storing `status`, `requirement`, `prompt` inside `ProjectEntity.workflowJson` JSON column.
**Why bad:** Cannot update a single node's status without reading and rewriting the entire workflow JSON. Creates race conditions when AI agent and human update simultaneously. Cannot query "all failed nodes across project."
**Instead:** Separate `NodeEntity` table with proper columns.

### Anti-Pattern 2: Making Frontend the Status Authority
**What:** Storing node status only in LogicFlow's in-memory `properties` and saving to local file.
**Why bad:** Local files are per-user; AI agents cannot write to the user's local filesystem. Status would be lost on browser refresh if not backed by API.
**Instead:** Backend `NodeEntity.status` is authoritative; frontend is a view that syncs from backend.

### Anti-Pattern 3: Tight Coupling of Canvas Save and Node Sync
**What:** Triggering the full sync API call on every keystroke or mini-edit.
**Why bad:** The existing 500ms debounce auto-save is already optimized. Adding an API call to every save doubles the latency and adds failure modes.
**Instead:** Sync on explicit save. Decouple AI metadata saves (PATCH /node/:id) from canvas structure saves.

### Anti-Pattern 4: Recomputing Topological Sort in AI Agent
**What:** Exporting raw nodes + edges and making the AI compute the execution order.
**Why bad:** Every AI agent consuming the API must implement graph algorithms. Fragile, wasteful.
**Instead:** Backend pre-computes `execution_order` and `executable_now` arrays in the export endpoint.

### Anti-Pattern 5: Separate Node Types for AI-Enabled Nodes
**What:** Creating new node types like `ai-text`, `ai-image` to distinguish AI-enabled nodes.
**Why bad:** Requires refactoring all existing node rendering, type guards, and converter logic.
**Instead:** AI fields are additive properties on existing node types. All nodes get `requirement` and `prompt` fields; they default to empty string. The `property` node type already exists for attribute data.

---

## Scalability Considerations

| Concern | Current (v1) | Future |
|---------|-------------|--------|
| Node status updates | Direct PATCH + WebSocket broadcast | Same (SQLite handles concurrent writes fine up to ~100 nodes/project) |
| AI agent polling | Per-project export endpoint | Add ETag/If-None-Match for bandwidth; add filter: `?status=pending` |
| Execution history | Unbounded rows per node | Add `LIMIT` pagination to GET history; archive old records |
| Multiple AI agents | No coordination needed (node-level isolation) | If same node claimed by 2 agents: add `claimed_by` field + optimistic locking |

---

## Sources

- Direct codebase inspection: `src/schemas/workflow.schema.ts` (existing Zod schema)
- Direct codebase inspection: `src/project/entities/project.entity.ts` (existing MikroORM entity)
- Direct codebase inspection: `frontend/src/types/logicflow.types.ts` (existing frontend types)
- Direct codebase inspection: `frontend/src/components/WorkflowEditor.vue` (existing UI)
- Direct codebase inspection: `src/mikro-orm.config.ts` (database configuration)
- Confidence: HIGH — all design decisions derived from verified codebase state
