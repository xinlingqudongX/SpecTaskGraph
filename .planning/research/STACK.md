# Technology Stack

**Project:** FlowInOne — AI-driven workflow execution extension
**Researched:** 2026-03-13
**Mode:** Brownfield — extending existing stack only

---

## Context: What Already Exists (Do Not Change)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Vue 3 | ^3.5.25 |
| Build tool | Vite | ^7.3.1 |
| Workflow canvas | @logicflow/core | ^2.1.11 |
| LF extensions | @logicflow/extension | ^2.1.15 |
| Backend framework | NestJS | ^11.1.14 |
| HTTP adapter | Fastify | ^5.7.4 |
| ORM | MikroORM | ^6.6.8 |
| Database | SQLite (better-sqlite3) | via @mikro-orm/better-sqlite |
| Validation | Zod + nestjs-zod | ^3.24.1 / ^5.1.1 |
| Real-time | ws (WebSocket) | ^8.18.0 |
| API docs | @scalar/nestjs-api-reference | ^1.0.29 |
| Frontend logging | pino / pino-pretty | ^10.3.1 / ^13.1.3 |

This is a **brownfield extension**. No framework migrations or replacements are in scope.

---

## Recommended Extensions

### 1. LogicFlow Node Model — AI Metadata Fields

**Approach: Properties bag extension (no custom node class required)**

LogicFlow 2.x stores all custom data in the `properties` object of each node. The existing code already uses `properties` as a freeform bag (`[key: string]: any`). The correct pattern for adding AI metadata fields is to **extend the TypeScript interface** for `ExtendedNodeConfig.properties` and **set/get them via `lf.setProperties(nodeId, props)` and `lf.getProperties(nodeId)`**.

**Why this approach:** The project already has `ExtendedNodeConfig` with `[key: string]: any`. Adding named fields to the interface gives type safety without changing the runtime serialization format. LogicFlow serializes the entire `properties` object to JSON when `lf.getGraphData()` is called — custom fields round-trip automatically.

**New fields to add to `ExtendedNodeConfig.properties`:**

```typescript
// Add to existing ExtendedNodeConfig.properties in logicflow.types.ts
aiRequirements?: string;       // 需求说明 — free-text for AI
aiPrompt?: string;             // AI 提示词 — the prompt sent to AI IDE
aiAttributes?: Array<{         // 结构化属性（属性节点用）
  key: string;
  value: string;
  type?: 'string' | 'number' | 'boolean' | 'json';
}>;
aiStatus?: 'pending' | 'completed' | 'failed' | 'review_needed';
aiExecutorId?: string;         // which AI agent last ran this node
aiLastRunAt?: string;          // ISO timestamp
```

**No additional frontend libraries needed.** The existing `lf.setProperties()` / `lf.getProperties()` API and the existing converter pattern handle the rest.

**Confidence: HIGH** — Based on direct codebase analysis. The `[key: string]: any` escape hatch is already in `ExtendedNodeConfig` and `NodeData.config`. This is LogicFlow's documented pattern for custom data.

---

### 2. Node Status Color Mapping

**Approach: Dynamic `getNodeStyle()` in custom node view**

Map `aiStatus` to border/fill colors in the existing `getNodeStyle()` function in `logicflow.config.ts` and propagate via node `properties.aiStatus`. The existing theme system supports per-node style overrides by returning different values from the node model's `getNodeStyle()` method.

**Status color convention:**

| Status | Border Color | Fill |
|--------|-------------|------|
| pending | `#2196f3` (blue, existing default) | `#ffffff` |
| completed | `#4caf50` (green) | `#f1f8e9` |
| failed | `#f44336` (red) | `#ffebee` |
| review_needed | `#ff9800` (orange) | `#fff3e0` |

**No additional libraries needed.**

**Confidence: HIGH** — Pattern derived from existing `logicflow.config.ts` theme system.

---

### 3. Backend — Node Metadata and Status API

**New MikroORM Entities (add to existing SQLite database)**

Two new entities are needed. Both fit cleanly into the existing MikroORM + BetterSQLite pattern.

#### NodeMetadataEntity

Stores AI fields per node, linked to a project.

```typescript
// src/node/entities/node-metadata.entity.ts
@Entity()
export class NodeMetadataEntity {
  @PrimaryKey()
  id!: string;                      // node UUID (same as LF node id)

  @Property()
  projectId!: string;               // FK to ProjectEntity.id (string)

  @Property({ nullable: true })
  aiRequirements?: string;

  @Property({ type: 'text', nullable: true })
  aiPrompt?: string;

  @Property({ type: 'json', nullable: true })
  aiAttributes?: Array<{ key: string; value: string; type?: string }>;

  @Property({ default: 'pending' })
  aiStatus: string = 'pending';     // pending | completed | failed | review_needed

  @Property({ nullable: true })
  aiExecutorId?: string;

  @Property({ nullable: true })
  aiLastRunAt?: Date;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

**Why `id` = node UUID (not auto-increment):** LogicFlow generates node IDs on the frontend. Using the same ID as the primary key avoids a join table and keeps API routes clean (`PATCH /api/v1/node/:id/status`).

**Why store `aiStatus` as string not enum column:** SQLite has no native enum type. MikroORM maps enum to string in SQLite. Using a plain string with Zod validation at the API layer is simpler and avoids migration friction when adding new statuses.

**Confidence: HIGH** — Matches existing MikroORM entity patterns in the codebase.

#### NodeExecutionHistoryEntity

Append-only log of AI execution events.

```typescript
// src/node/entities/node-execution-history.entity.ts
@Entity()
export class NodeExecutionHistoryEntity {
  @PrimaryKey()
  id!: string;                      // randomUUID()

  @Property()
  nodeId!: string;                  // FK to NodeMetadataEntity.id

  @Property()
  projectId!: string;

  @Property({ default: 'pending' })
  status!: string;                  // outcome: completed | failed | review_needed

  @Property({ type: 'text', nullable: true })
  result?: string;                  // AI output summary or error message

  @Property({ type: 'text', nullable: true })
  promptUsed?: string;              // snapshot of aiPrompt at execution time

  @Property({ nullable: true })
  executorId?: string;              // Claude Code, Cursor, etc.

  @Property({ nullable: true })
  reviewNote?: string;              // human reviewer comment on reject

  @Property()
  executedAt: Date = new Date();
}
```

**Why store `promptUsed` in history:** AI prompts change over time (reviewer can update prompt and re-trigger). Snapshotting the prompt used in each history record makes debugging reproducible.

**Confidence: HIGH** — Standard append-only audit log pattern.

---

### 4. NestJS Module Structure

**Create a new `node` module** — do not put node logic in the existing `project` module.

```
src/node/
  dto/
    update-node-status.dto.ts    # Zod: { status, executorId?, result? }
    create-execution-history.dto.ts
  entities/
    node-metadata.entity.ts
    node-execution-history.entity.ts
  node.controller.ts             # PATCH /node/:id/status, POST/GET /node/:id/history
  node.service.ts
  node.module.ts
```

**Why a separate module:** The `project` module already handles project-level CRUD. Node metadata is a different aggregate. Keeping them separate respects NestJS module boundaries and avoids bloating `ProjectService`.

**Controller routes:**

```
PATCH  /api/v1/node/:id/status
  Body: { status: 'pending'|'completed'|'failed'|'review_needed', executorId?, result?, reviewNote? }
  Response: updated NodeMetadataEntity

POST   /api/v1/node/:id/history
  Body: { status, result?, promptUsed?, executorId? }
  Response: created NodeExecutionHistoryEntity

GET    /api/v1/node/:id/history
  Query: ?limit=20&offset=0
  Response: { items: NodeExecutionHistoryEntity[], total: number }

GET    /api/v1/node/:id
  Response: NodeMetadataEntity (upsert-on-first-read)

PUT    /api/v1/node/:id
  Body: { aiRequirements?, aiPrompt?, aiAttributes? }
  Response: updated NodeMetadataEntity
```

**PATCH vs PUT rationale:** Status updates are partial updates (only change status + log entry). Full metadata writes (prompt, requirements) use PUT. This matches HTTP semantics and keeps the status audit logic isolated.

**Confidence: HIGH** — Follows existing NestJS + Zod + MikroORM patterns already in the codebase.

---

### 5. Workflow JSON Schema Export

**Approach: Dedicated export endpoint on the existing `project` module**

```
GET /api/v1/project/:id/export/schema
```

No new library needed. The export logic merges:
1. The `workflowJson` stored in `ProjectEntity` (LogicFlow graph snapshot)
2. AI metadata from `NodeMetadataEntity` for each node
3. Computes `dependencies[]` array from the edge list (topological sort)

**Output format — what AI agents (Claude Code, Cursor) need:**

```json
{
  "$schema": "https://flowinone.dev/workflow-schema/v1",
  "version": "1.0",
  "projectId": "uuid",
  "projectName": "string",
  "exportedAt": "ISO-8601",
  "nodes": [
    {
      "nodeId": "uuid",
      "type": "text|property|file|image|video|audio|root",
      "name": "string",
      "aiRequirements": "string — what to implement",
      "aiPrompt": "string — direct prompt for AI IDE",
      "aiAttributes": [{ "key": "string", "value": "string" }],
      "status": "pending|completed|failed|review_needed",
      "dependencies": ["nodeId", "nodeId"],
      "position": { "x": 0, "y": 0 }
    }
  ],
  "edges": [
    {
      "edgeId": "uuid",
      "source": "nodeId",
      "target": "nodeId",
      "type": "sequence|conditional"
    }
  ],
  "executionOrder": ["nodeId", "nodeId"]
}
```

**Key design decisions for AI parseability:**

1. **`dependencies` array on each node** — AI agents don't need to traverse edges; they get a flat list of prerequisite node IDs per node. Derived from the edge list server-side.
2. **`executionOrder` at top level** — topological sort of nodes with zero in-degree first. AI can process this linearly.
3. **`aiPrompt` separate from `aiRequirements`** — `aiRequirements` is human-readable context; `aiPrompt` is the direct instruction for the AI. Claude Code and Cursor work better with explicit task prompts.
4. **No nested graph traversal required** — flat arrays, not adjacency lists. AI agents parse JSON arrays more reliably than recursive structures.
5. **`status` field per node** — AI IDE skips `completed` nodes without needing application logic.

**Topological sort implementation:** Use Kahn's algorithm (BFS-based). No library needed — it's ~30 lines of TypeScript and avoids a dependency for trivial graph processing.

**Why not JSON Schema (json-schema.org) format:** The export is a workflow data document, not a schema validator. Calling it "JSON Schema" in the project docs is a naming convention — the actual format is a plain JSON document with a `$schema` discriminator field.

**Confidence: HIGH** — Format design based on Claude Code CLAUDE.md conventions and direct analysis of the existing `WorkflowGraph` type in `workflow.types.ts`.

---

### 6. SQLite Patterns for Rich Metadata

**Use `type: 'json'` for all structured fields** — MikroORM's `@Property({ type: 'json' })` serializes to a TEXT column in SQLite. This is already used for `techStack` and `workflowJson` in `ProjectEntity`. Apply the same for `aiAttributes`.

**Use TEXT for long strings** — `aiRequirements` and `aiPrompt` can be multi-paragraph. Declare with `@Property({ type: 'text' })` to ensure MikroORM uses `TEXT` column type (SQLite TEXT is unlimited, but being explicit prevents ambiguity in migrations).

**Index strategy for history queries:**

```typescript
// Add to NodeExecutionHistoryEntity
@Index({ properties: ['nodeId', 'executedAt'] })
```

History queries are always `WHERE nodeId = ? ORDER BY executedAt DESC LIMIT ?`. A compound index on `(nodeId, executedAt)` makes this O(log n) without full table scans.

**Do NOT use full-text search (FTS5):** The `aiRequirements` and `aiPrompt` fields don't need search in v1. FTS5 adds complexity (separate virtual tables, MikroORM doesn't support FTS natively). Plain LIKE queries are sufficient for any future simple search.

**Upsert pattern for NodeMetadataEntity:** When an AI IDE calls `GET /api/v1/node/:id`, the node may not have a metadata record yet (nodes are created on the frontend). Use MikroORM's `em.upsert()` (available since MikroORM 5.7) or a find-or-create pattern:

```typescript
async getOrCreate(nodeId: string, projectId: string): Promise<NodeMetadataEntity> {
  let node = await this.nodeRepo.findOne({ id: nodeId });
  if (!node) {
    node = this.nodeRepo.create({ id: nodeId, projectId, aiStatus: 'pending' });
    await this.em.persistAndFlush(node);
  }
  return node;
}
```

**Confidence: HIGH** — Based on MikroORM 6.x documentation knowledge and existing project patterns.

---

### 7. Zod Validation Schemas

The project already uses `nestjs-zod` for DTO validation. Apply the same pattern to new endpoints.

```typescript
// update-node-status.dto.ts
export const updateNodeStatusSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'review_needed']),
  executorId: z.string().optional(),
  result: z.string().optional(),
  reviewNote: z.string().optional(),
  promptUsed: z.string().optional(),
});

// upsert-node-metadata.dto.ts
export const upsertNodeMetadataSchema = z.object({
  projectId: z.string().min(1),
  aiRequirements: z.string().optional(),
  aiPrompt: z.string().optional(),
  aiAttributes: z.array(z.object({
    key: z.string(),
    value: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'json']).optional(),
  })).optional(),
});
```

**Confidence: HIGH** — Direct port of existing DTO pattern.

---

### 8. Human Review Workflow — No Additional Library

The review cycle (approve → `completed`, reject → `review_needed` + prompt update) is a state machine with only 4 states. Implement as a method in `NodeService`:

```typescript
async reviewNode(nodeId: string, approved: boolean, reviewNote?: string, updatedPrompt?: string) {
  const meta = await this.getOrCreate(nodeId, ...);
  meta.aiStatus = approved ? 'completed' : 'review_needed';
  if (!approved && updatedPrompt) meta.aiPrompt = updatedPrompt;
  // also log to history
  await this.createHistoryEntry(nodeId, { status: meta.aiStatus, reviewNote });
  await this.em.flush();
  return meta;
}
```

**Why not XState or a state machine library:** The state space is 4 states with 3 transitions. A library adds ~50KB and learning overhead for what is essentially a two-branch if-statement.

**Confidence: HIGH** — Proportionate to problem complexity.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Node custom data | `properties` bag + TS interface extension | Custom LogicFlow node class with `getDefaultProperties()` | Class-based approach requires registering new node types for every variant; the existing `[key: string]: any` already works and is already in production |
| Status storage | String column + Zod enum validation | MikroORM `enum` column type | SQLite has no native enum; MikroORM enum maps to string anyway; Zod at API layer provides equal safety with less migration risk |
| Execution history | Separate entity with append-only inserts | JSON array column on NodeMetadataEntity | JSON column is not queryable; would prevent pagination, filtering by status, and cross-node analytics |
| Topological sort | Kahn's algorithm (hand-rolled) | `graphlib`, `toposort` npm packages | Kahn's is ~30 lines; the graph is a simple DAG; adding a library for this is disproportionate |
| AI-readable schema | Custom flat JSON format | JSON Schema (json-schema.org) | AI Schema validators describe data shapes; this export is a data document. Claude Code expects CLAUDE.md-style instructions, not schema validators |
| State machine | Plain if/switch in service | XState | 4-state machine doesn't justify library overhead |
| Frontend node editor panel | New Vue component | LogicFlow built-in property panel | Built-in panel is basic; AI metadata fields need a custom layout (requirements, prompt, attributes table) |

---

## No New Dependencies Required

The entire feature set can be implemented without adding any new packages to either `package.json`.

**Backend:** All patterns (MikroORM entities, Zod DTOs, NestJS controllers, topological sort) use existing dependencies.

**Frontend:** LogicFlow `setProperties`/`getProperties` API handles AI field storage. A new Vue SFC for the node editor panel uses only Vue 3 reactivity and existing CSS patterns.

**This is intentional and a feature:** Every new dependency is a maintenance liability. The existing stack is fully sufficient.

---

## Migration Plan

1. Create `src/node/` module with two entities
2. Run `pnpm run migration:generate` to generate SQLite schema additions
3. Add `NodeMetadataEntity` and `NodeExecutionHistoryEntity` to `mikro-orm.config.ts` entities array
4. Implement `NodeController`, `NodeService`, `NodeModule`
5. Import `NodeModule` in `AppModule`
6. Add export endpoint to existing `ProjectController`/`ProjectService`
7. Extend `ExtendedNodeConfig.properties` TypeScript interface on frontend
8. Build new node editor panel Vue component
9. Wire status colors into existing node style system

---

## Sources

- Direct codebase analysis: `frontend/src/types/logicflow.types.ts`, `frontend/src/utils/logicflow-converter.ts`, `frontend/src/config/logicflow.config.ts`
- Direct codebase analysis: `src/project/entities/project.entity.ts`, `src/project/project.service.ts`, `src/mikro-orm.config.ts`
- Direct codebase analysis: `frontend/package.json` (LogicFlow 2.1.11/2.1.15, MikroORM 6.6.x, NestJS 11.x)
- MikroORM 6.x documentation knowledge (training data, MEDIUM confidence for specific API details)
- LogicFlow 2.x `properties` bag pattern (training data verified by converter code, HIGH confidence)
- NestJS module/controller patterns (training data, HIGH confidence for stable APIs)

**Confidence note:** WebSearch and WebFetch tools were unavailable during this research session. All findings are based on direct codebase analysis (HIGH confidence) and training knowledge of the specific library versions in use. The LogicFlow `properties` pattern is verified by the existing production code. MikroORM 6.x `type: 'json'` and `onUpdate` patterns are verified by the existing entity code.
