# Phase 1: Data Model - Research

**Researched:** 2026-03-13
**Domain:** MikroORM 6 entity modeling + SQLite migration + TypeScript type contract + logicflow-converter fix
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Field naming (Instructions fields)**
- `NodeMetadataEntity` uses `requirement` (TEXT, NOT NULL, default empty string) and `prompt` (TEXT, nullable)
- Do NOT use the three-field structure from existing `workflow.schema.ts` (guide/logic/criteria)
- Update `workflow.schema.ts`: rename guide → requirement, logic → prompt, remove criteria
- `requirement` is NOT NULL at DB layer (default `""`), `prompt` nullable

**Data migration strategy**
- On-demand creation: upsert `NodeMetadata` rows on first sync, do not parse workflowJson in migrations
- New rows default: `requirement = ""`, `prompt = NULL`, `status = "pending"`
- Sync endpoint writes only nodeId, projectId, type (canvas structure fields); SKIPS status, requirement, prompt, attributes

**Node deletion**
- Soft delete: add `deletedAt` (nullable DateTime) to `NodeMetadataEntity`
- Canvas sync sets `deletedAt = now()` when a nodeId is absent from canvas
- Export endpoint filters `deletedAt IS NOT NULL`

**NodeStatus enum**
- Values: `pending | completed | failed | review_needed` (drop `running`, add `review_needed`)
- Update `logicflow.types.ts` NodeStatus type
- Legacy `running` values: auto-reset to `pending` on sync/load
- Color mapping locked for Phase 5: pending=grey, completed=green, failed=red, review_needed=orange/amber

### Claude's Discretion
- Exact field layout of `NodeExecutionHistoryEntity` (extra indexes, sort keys, etc.)
- MikroORM migration file naming (follow existing project conventions)
- Exact storage format of `attributes` field (JSON array `[{key, value}]` consistent with existing property node)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Create `NodeMetadataEntity` with nodeId (PK), requirement (TEXT), prompt (TEXT), attributes (JSON), status (ENUM), projectId (FK) | MikroORM entity patterns verified in codebase; `@Property({ type: 'json' })`, `@ManyToOne`, string PK all confirmed |
| DATA-02 | Create `NodeExecutionHistoryEntity` with id, nodeId (FK), promptSnapshot, requirementSnapshot, result, executedAt, createdBy | MikroORM FK pattern via `@ManyToOne` confirmed in `ProjectAsset`; auto PK via `randomUUID` confirmed |
| DATA-03 | Generate and run MikroORM migration creating `node_metadata` and `node_execution_history` tables | `pnpm run migration:generate` command confirmed; `migrations` block present in `mikro-orm.config.ts` |
| DATA-04 | Contract: node status stored only in `NodeMetadataEntity`; sync skips status/requirement/prompt/attributes | `WorkflowManagerService.saveProject` writes full `WorkflowGraph` to local file — contract is a documented guard + test |
| DATA-05 | Fix spread bug in `logicflow-converter.ts`; add requirement/prompt/attributes to `standardProps` exclusion set | Exact bug location confirmed at line 98 (`...nodeData.config`) and line 141 (`...extractCustomProperties`) |
</phase_requirements>

---

## Summary

Phase 1 is a pure backend/type layer. It adds two new MikroORM entities (`NodeMetadataEntity`, `NodeExecutionHistoryEntity`), runs a migration so the SQLite schema is stable, updates three TypeScript files to align on the new field names and status enum, and fixes a pre-existing spread-corruption bug in `logicflow-converter.ts`. No API endpoints, no frontend UI, and no canvas rendering changes are in scope.

The codebase is already using MikroORM 6.6.x with `@mikro-orm/better-sqlite`. Both `ProjectEntity` and `ProjectAsset` are concrete, working examples of every decorator pattern required. The entity discovery model is manual (`entities: [...]` in `mikro-orm.config.ts`), so the new entities must be added there explicitly. There are no existing migrations directory — migrations will be generated fresh.

The `logicflow-converter.ts` bug is confirmed: `convertNodeData` spreads `...nodeData.config` after explicit field assignments (line 98), which means any `requirement`, `prompt`, or `attributes` keys inside `config` would overwrite the explicit mapping with a raw, potentially array-corrupted value. The fix is mechanical: add the three keys to `standardProps` in `extractCustomProperties` and explicitly map them in both conversion directions.

**Primary recommendation:** Create `NodeMetadataEntity` and `NodeExecutionHistoryEntity` following the `ProjectAsset` FK pattern, register them in `mikro-orm.config.ts`, generate one migration, update the three type files, and fix the converter — in that order.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mikro-orm/core` | ^6.6.8 (in package.json) | Entity decorators, EM, migrations | Already in project — no new dependency |
| `@mikro-orm/better-sqlite` | ^6.6.9 | SQLite driver | Already in project |
| `@mikro-orm/nestjs` | ^6.1.1 | `InjectRepository`, `MikroOrmModule.forFeature` | Already in project |
| `@mikro-orm/cli` | ^6.6.8 | `migration:generate`, `migration:up` | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.0.18 (frontend) | Unit tests for converter round-trip | Frontend converter tests |
| `jest` + `ts-jest` | ^30 / ^29 (backend) | Backend unit tests | NodeMetadataEntity round-trip, spec files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| String PK (nodeId verbatim) | Auto-increment integer PK | Verbatim nodeId keeps join cost zero and avoids a mapping layer; chosen |
| Soft delete via `deletedAt` | Hard delete | Soft delete preserves history for audit; chosen |

**No new dependencies required for this phase.**

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── node/
│   ├── entities/
│   │   ├── node-metadata.entity.ts      # NodeMetadataEntity
│   │   └── node-execution-history.entity.ts  # NodeExecutionHistoryEntity
│   ├── node.module.ts
│   ├── node.controller.ts               # stub (no endpoints yet)
│   └── node.service.ts                  # stub
├── project/                             # unchanged
├── mikro-orm.config.ts                  # add two new entities
└── migrations/
    └── Migration<timestamp>.ts          # generated by CLI
```

### Pattern 1: MikroORM Entity — String PK + FK

This is the exact pattern used by `ProjectAsset`:

```typescript
// Source: src/project/entities/project-asset.entity.ts (verified)
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ProjectEntity } from './project.entity';

@Entity()
export class ProjectAsset {
  @PrimaryKey()
  id!: string;              // string PK, caller supplies value

  @ManyToOne(() => ProjectEntity)
  project!: ProjectEntity;  // FK relation
}
```

`NodeMetadataEntity` should use `nodeId` as its `@PrimaryKey()` (not `id`). The FK to `ProjectEntity` follows the same `@ManyToOne` pattern.

### Pattern 2: MikroORM Entity — JSON field + nullable + onUpdate

Confirmed in `ProjectEntity`:

```typescript
// Source: src/project/entities/project.entity.ts (verified)
@Property({ type: 'json' })
techStack!: Record<string, any>;           // non-nullable JSON

@Property({ type: 'json', nullable: true })
workflowJson?: Record<string, any>;        // nullable JSON

@Property({ onUpdate: () => new Date() })
updatedAt: Date = new Date();              // auto-update timestamp
```

`attributes` on `NodeMetadataEntity` should use `@Property({ type: 'json', nullable: true })`.

### Pattern 3: Entity Registration

All entities must be added to the `entities` array in `mikro-orm.config.ts`. This is a hard requirement — MikroORM does NOT auto-discover here.

```typescript
// Source: src/mikro-orm.config.ts (verified)
import { NodeMetadataEntity } from './node/entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './node/entities/node-execution-history.entity';

export default defineConfig({
  entities: [ProjectEntity, ProjectAsset, NodeMetadataEntity, NodeExecutionHistoryEntity],
  // ...
});
```

### Pattern 4: Module Registration with MikroOrmModule.forFeature

Confirmed in `ProjectModule`:

```typescript
// Source: src/project/project.module.ts (verified)
@Module({
  imports: [MikroOrmModule.forFeature([ProjectEntity])],
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class ProjectModule {}
```

`NodeModule` must follow the same pattern: `MikroOrmModule.forFeature([NodeMetadataEntity, NodeExecutionHistoryEntity])`.

### Pattern 5: Migration Generation

```bash
# From project root (where package.json lives)
pnpm run migration:generate
# Produces: migrations/Migration<timestamp>.ts
pnpm run migration:run
# Equivalent to mikro-orm migration:up
```

The `mikro-orm.config.ts` already has:
```typescript
migrations: {
  transactional: true,
  snapshot: false,
},
```

No additional CLI config needed.

### Pattern 6: logicflow-converter.ts Fix

The bug is `...nodeData.config` at line 98 in `convertNodeData`. Because `nodeData.config` is a free-form map, if it contains keys like `requirement` or `properties` (which it does — `properties` is a `{key,value}[]` array), the spread overwrites the explicit assignments made two lines above.

**Current broken flow:**

```typescript
// convertNodeData (broken)
properties: {
  title: nodeData.title,
  status: nodeData.status,
  // ...explicit fields...
  properties: nodeData.config.properties || [],   // ← correct array
  ...nodeData.config,                              // ← may overwrite 'properties' with corrupted value
},
```

**Fix required:**
1. Add `'requirement'`, `'prompt'`, `'attributes'` to the `standardProps` Set in `extractCustomProperties`.
2. Explicitly map `requirement`, `prompt`, `attributes` in `convertNodeData` (forward direction).
3. Explicitly map them in `convertLogicFlowNodeToNodeData` (reverse direction).
4. Verify that `...nodeData.config` no longer leaks AI fields into the LogicFlow properties object.

**Fixed forward direction sketch:**
```typescript
properties: {
  title: nodeData.title,
  status: nodeData.status,
  textContent: nodeData.config.textContent || '',
  resourceUrl: nodeData.config.resourceUrl || '',
  resourceName: nodeData.config.resourceName || '',
  properties: nodeData.config.properties || [],
  nodeType: nodeData.type,
  width,
  height,
  requirement: nodeData.config.requirement ?? '',
  prompt: nodeData.config.prompt ?? null,
  attributes: nodeData.config.attributes ?? [],
  ...this.extractCustomProperties(nodeData.config),
  // extractCustomProperties now excludes requirement/prompt/attributes
},
```

**Note:** The spread should be replaced with `extractCustomProperties` call, not `...nodeData.config`.

### Anti-Patterns to Avoid

- **Do not use `@PrimaryKey({ autoincrement: true })` for `NodeMetadataEntity.nodeId`** — nodeId is a LogicFlow-generated string like `text_uuid`; using autoincrement would force a mapping layer.
- **Do not put `running` in the new NodeStatus enum** — locked decision; legacy values must be coerced on read.
- **Do not call `em.createQueryBuilder()` for the upsert** — use `em.upsert()` (MikroORM 6 supports this on the entity manager directly).
- **Do not add `workflowJson` blob writes for AI fields** — status/requirement/prompt/attributes are backend-only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert on sync | Manual find + create/update | `em.upsert(NodeMetadataEntity, data)` (MikroORM 6) | Handles concurrency, reduces code |
| SQLite schema creation | Raw SQL CREATE TABLE | MikroORM `migration:generate` | Schema diffing, transactional, repeatable |
| JSON serialization of `attributes` | Custom serializer | `@Property({ type: 'json' })` | MikroORM handles SQLite TEXT↔JSON transparently |
| Soft-delete filter | Manual `WHERE deletedAt IS NULL` everywhere | MikroORM `@Filter` decorator (optional) or explicit `.where({ deletedAt: null })` | Consistent exclusion |

**Key insight:** MikroORM 6's `em.upsert()` is the correct tool for the sync endpoint. Verify the exact signature before Phase 2 (noted blocker in STATE.md).

---

## Common Pitfalls

### Pitfall 1: Migration generated before entities are in `mikro-orm.config.ts`
**What goes wrong:** CLI reports "no schema changes detected", migration file is empty or absent.
**Why it happens:** MikroORM's schema differ reads only entities listed in `entities: []`.
**How to avoid:** Add both entities to `mikro-orm.config.ts` FIRST, then run `migration:generate`.
**Warning signs:** Migration file body contains no `this.addSql()` calls.

### Pitfall 2: String PK for `NodeExecutionHistoryEntity`
**What goes wrong:** If the history entity also uses a caller-supplied string PK, `randomUUID()` must be called at creation time (as seen in `ProjectService.create`). Forgetting this leaves the `id` field empty.
**How to avoid:** Either use auto-UUID (if MikroORM 6 supports `@PrimaryKey({ type: 'uuid', defaultRaw: "hex(randomblob(16))" })` for SQLite) or explicitly call `randomUUID()` in the service constructor. Follow the same pattern as `ProjectService`.
**Warning signs:** `NOT NULL constraint failed: node_execution_history.id` at insert time.

### Pitfall 3: `workflow.schema.ts` and `workflow.types.ts` have separate `NodeStatus` definitions
**What goes wrong:** Updating only one leaves a type mismatch at compile time. There are THREE separate `NodeStatus` definitions:
- `frontend/src/types/logicflow.types.ts` line 10: `'pending' | 'running' | 'completed' | 'failed'`
- `frontend/src/types/workflow.types.ts` line 18: `'pending' | 'running' | 'completed' | 'failed' | 'skipped'`
- `src/schemas/workflow.schema.ts` line 24-30: Zod enum `pending|running|completed|failed|skipped`
All three must be updated to `pending | completed | failed | review_needed`.
**Warning signs:** TypeScript compile error when assigning `'review_needed'` to `NodeStatus`.

### Pitfall 4: `schemaGenerator.createForeignKeyConstraints: false` in mikro-orm config
**What goes wrong:** The existing config has `createForeignKeyConstraints: false`. This means FK relationships (`@ManyToOne`) will NOT generate a SQLite `FOREIGN KEY` constraint in the DDL. The FK column (e.g., `project_id`) will be created as a plain column.
**Why it happens:** This is intentional in the project config — SQLite FK enforcement is opt-in via `PRAGMA foreign_keys = ON`.
**How to avoid:** Do not assume FK constraint enforcement exists. The application layer must verify referential integrity.
**Warning signs:** Deleting a project does not cascade-delete `node_metadata` rows unless explicitly handled.

### Pitfall 5: `logicflow-converter.ts` spread corrupts array fields
**What goes wrong:** `nodeData.config.properties` is `Array<{key,value}>`. After spread (`...nodeData.config`), if the config object also has a raw string `properties` key from a round-trip, the array gets replaced with a string.
**How to avoid:** The fix in DATA-05 (explicit mapping + updated `standardProps`) prevents this permanently.
**Warning signs:** Round-trip test shows `properties` field as `"[object Object]"` instead of an array.

### Pitfall 6: `workflow.schema.ts` `InstructionsSchema` is used by existing tests
**What goes wrong:** Changing `guide → requirement`, `logic → prompt`, removing `criteria` will break existing schema validation specs (`schema-validation.spec.ts`, `schema-manager.service.spec.ts`).
**How to avoid:** Update the schema and all affected test fixtures in the same commit.
**Warning signs:** `pnpm test` failures in `src/services/__tests__/schema-validation.spec.ts`.

---

## Code Examples

### NodeMetadataEntity (complete)
```typescript
// Pattern derived from: ProjectEntity + ProjectAsset (verified in codebase)
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ProjectEntity } from '../../project/entities/project.entity';

export type NodeStatus = 'pending' | 'completed' | 'failed' | 'review_needed';

@Entity({ tableName: 'node_metadata' })
export class NodeMetadataEntity {
  @PrimaryKey()
  nodeId!: string;                          // LogicFlow-generated ID verbatim

  @ManyToOne(() => ProjectEntity)
  project!: ProjectEntity;                  // FK column: project_id

  @Property()
  nodeType!: string;                        // canvas type (text, image, etc.)

  @Property()
  requirement: string = '';                 // NOT NULL, default ""

  @Property({ nullable: true })
  prompt?: string;                          // nullable

  @Property({ type: 'json', nullable: true })
  attributes?: Array<{ key: string; value: string }>;

  @Property()
  status: NodeStatus = 'pending';

  @Property({ nullable: true })
  deletedAt?: Date;                         // soft delete

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

### NodeExecutionHistoryEntity (complete)
```typescript
// Pattern derived from: ProjectAsset @ManyToOne, ProjectService randomUUID
import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { NodeMetadataEntity } from './node-metadata.entity';

@Entity({ tableName: 'node_execution_history' })
export class NodeExecutionHistoryEntity {
  @PrimaryKey()
  id!: string;                              // caller supplies randomUUID()

  @ManyToOne(() => NodeMetadataEntity)
  node!: NodeMetadataEntity;               // FK to node_metadata.node_id

  @Property({ type: 'text', nullable: true })
  promptSnapshot?: string;                 // snapshot of prompt at execution time

  @Property({ type: 'text', nullable: true })
  requirementSnapshot?: string;            // snapshot of requirement at execution time

  @Property({ type: 'text', nullable: true })
  result?: string;

  @Property()
  executedAt: Date = new Date();

  @Property({ nullable: true })
  createdBy?: string;                      // AI agent identity or user ID

  @Property()
  createdAt: Date = new Date();
}
```

### mikro-orm.config.ts update (diff)
```typescript
// Add to imports:
import { NodeMetadataEntity } from './node/entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './node/entities/node-execution-history.entity';

// Change entities array:
entities: [ProjectEntity, ProjectAsset, NodeMetadataEntity, NodeExecutionHistoryEntity],
```

### NodeStatus update in logicflow.types.ts
```typescript
// Before (line 10):
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

// After:
export type NodeStatus = 'pending' | 'completed' | 'failed' | 'review_needed';
```

### workflow.schema.ts InstructionsSchema update
```typescript
// Before:
export const InstructionsSchema = z.object({
  guide: z.string().min(1, '指南不能为空'),
  logic: z.string().min(1, '执行逻辑不能为空'),
  criteria: z.string().min(1, '验收标准不能为空')
});

// After:
export const InstructionsSchema = z.object({
  requirement: z.string().default(''),
  prompt: z.string().nullable().optional(),
});
```

### workflow.schema.ts NodeStatusSchema update
```typescript
// Before:
export const NodeStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped']);

// After:
export const NodeStatusSchema = z.enum(['pending', 'completed', 'failed', 'review_needed']);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `guide/logic/criteria` Instructions fields | `requirement/prompt` | Phase 1 (now) | Simpler AI interface; existing schema tests need updating |
| `running/skipped` in NodeStatus | `review_needed` (drop running/skipped) | Phase 1 (now) | Legacy `running` values coerced to `pending` on load |
| AI fields in `workflowJson` blob | AI fields in `NodeMetadataEntity` | Phase 1 (now) | Auto-save path can never corrupt AI data |

**Deprecated/outdated:**
- `criteria` field in `InstructionsSchema`: removed in Phase 1; out-of-scope for v2
- `running` status value: removed; any existing data must be migrated on first access
- `skipped` status value: removed; was in `workflow.types.ts` and `workflow.schema.ts` but not in `logicflow.types.ts`

---

## Open Questions

1. **`em.upsert()` exact signature in MikroORM 6.6.x**
   - What we know: `em.upsert(EntityClass, data)` exists in MikroORM 6; STATE.md explicitly flags this as a blocker to confirm before Phase 2.
   - What's unclear: Whether it accepts partial data (skipping `status/requirement/prompt/attributes`) or requires all fields.
   - Recommendation: In Phase 1 stub `NodeService`, do NOT implement `em.upsert()` logic yet. Only define entities and migrations. The sync endpoint is Phase 2 (API-05). Phase 1 merely establishes the schema contract.

2. **`workflow.types.ts` `Instructions` interface update scope**
   - What we know: `workflow.types.ts` at line 46 defines `Instructions { guide, logic, criteria }`. This type is used by `TaskNode`.
   - What's unclear: Whether existing frontend code (`WorkflowManagerService`, `FileBrowser`) actually constructs `Instructions` objects with the old field names.
   - Recommendation: Search for usages before changing the interface. The type change propagates through `TaskNode` → `WorkflowGraph` → `WorkflowManagerService.saveProject`. A TypeScript compile check (`pnpm type-check`) will surface all broken sites.

3. **Existing test fixture compatibility**
   - What we know: `schema-validation.spec.ts` and `schema-manager.service.spec.ts` exist and likely contain `InstructionsSchema` fixtures with `guide/logic/criteria`.
   - What's unclear: Exact fixture content.
   - Recommendation: Read those spec files at plan time and include fixture-update tasks.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | Jest 30 + ts-jest 29 |
| Backend config | `jest` block in `package.json` (root); `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"` |
| Frontend framework | Vitest 4.0.18 |
| Frontend config | `test` block in `frontend/vite.config.ts`; `environment: jsdom` |
| Backend quick run | `pnpm test` (from project root) |
| Frontend quick run | `cd frontend && pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `NodeMetadataEntity` has correct columns; `nodeId` is PK | unit (entity schema) | `pnpm test -- --testPathPattern node-metadata` | ❌ Wave 0 |
| DATA-02 | `NodeExecutionHistoryEntity` has correct FK and snapshot fields | unit (entity schema) | `pnpm test -- --testPathPattern node-execution-history` | ❌ Wave 0 |
| DATA-03 | Migration runs cleanly from scratch (tables exist after `migration:run`) | integration (migration smoke) | `pnpm test -- --testPathPattern migration.spec` | ❌ Wave 0 |
| DATA-04 | Auto-save path does NOT overwrite status/requirement/prompt | unit (contract test) | `pnpm test -- --testPathPattern node-metadata.contract` | ❌ Wave 0 |
| DATA-05 | Round-trip: `convertNodeData → fromLogicFlowData` retains requirement/prompt/attributes without corruption | unit (converter) | `cd frontend && pnpm test -- --reporter=verbose logicflow-converter` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Run the relevant spec file only (command above)
- **Per wave merge:** `pnpm test` (backend) + `cd frontend && pnpm test` (frontend)
- **Phase gate:** Both full suites green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/node/entities/node-metadata.entity.spec.ts` — covers DATA-01
- [ ] `src/node/entities/node-execution-history.entity.spec.ts` — covers DATA-02
- [ ] `src/node/migration.spec.ts` — covers DATA-03 (integration: apply migration to in-memory SQLite, verify tables)
- [ ] `src/node/node-metadata.contract.spec.ts` — covers DATA-04 (verify sync logic skips AI fields)
- [ ] `frontend/src/tests/setup.ts` — Vitest setup file (referenced in `vite.config.ts` but does not exist)
- [ ] `frontend/src/tests/logicflow-converter.spec.ts` — covers DATA-05

---

## Sources

### Primary (HIGH confidence)
- `src/project/entities/project.entity.ts` — verified MikroORM entity patterns: `@PrimaryKey`, `@Property`, `@Property({ type: 'json' })`, `onUpdate`
- `src/project/entities/project-asset.entity.ts` — verified `@ManyToOne` FK pattern
- `src/mikro-orm.config.ts` — verified manual entity registration, `migrations` config, `schemaGenerator` config
- `src/project/project.module.ts` — verified `MikroOrmModule.forFeature` pattern
- `src/project/project.service.ts` — verified `persistAndFlush`, `randomUUID()` for string PK
- `frontend/src/utils/logicflow-converter.ts` — bug confirmed at lines 98 and 211-231
- `frontend/src/types/logicflow.types.ts` — confirmed `NodeStatus` definition to update (line 10)
- `frontend/src/types/workflow.types.ts` — confirmed `NodeStatus` (line 18) and `Instructions` (lines 46-50) to update
- `src/schemas/workflow.schema.ts` — confirmed `InstructionsSchema` (lines 63-67) and `NodeStatusSchema` (lines 24-30) to update
- `package.json` — confirmed versions: MikroORM ^6.6.8, Jest ^30, NestJS ^11
- `frontend/package.json` — confirmed Vitest ^4.0.18
- `frontend/vite.config.ts` — confirmed Vitest config location

### Secondary (MEDIUM confidence)
- `.planning/phases/01-data-model/01-CONTEXT.md` — user decisions (authoritative for this project)
- `.planning/STATE.md` — confirmed blocker: `em.upsert()` signature needs Phase 2 verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed in package.json; no new dependencies needed
- Architecture (entity patterns): HIGH — working examples present in codebase
- Migration workflow: HIGH — `migration:generate` script confirmed; `migrations` config present
- Converter bug: HIGH — exact lines confirmed by reading source
- Pitfalls: HIGH — derived from direct code inspection, not inference
- `em.upsert()` signature: LOW — noted as blocker; not relevant until Phase 2

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (MikroORM 6.x is stable; NestJS 11 is stable)
