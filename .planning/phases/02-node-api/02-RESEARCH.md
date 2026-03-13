# Phase 2: Node API - Research

**Researched:** 2026-03-13
**Domain:** NestJS REST API — MikroORM upsert, Zod DTOs, transactional history snapshot
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sync trigger timing**
- `POST /api/v1/workflow/:projectId/sync` fires every auto-save (500ms debounce) integrated into WorkflowManagerService
- sync upserts only nodeId, type, projectId — **skips** status/requirement/prompt/attributes

**Status transition rules**
- Any-to-any transitions allowed; no state machine guard
- NodeStatus enum: `pending | completed | failed | review_needed`
- Every call to `PATCH /api/v1/node/:id/status` auto-snapshots current prompt+requirement into a new history record

**Execution history identity**
- `POST /api/v1/node/:id/history` body contains `executedBy` (string, e.g. `"claude-code"`); caller is trusted
- body also contains `result` (execution result description) and `status` (post-execution node status)

**API route design**
- `PATCH /api/v1/node/:id` — update requirement/prompt/attributes (no status change)
- `PATCH /api/v1/node/:id/status` — update status only, auto-write history snapshot
- `POST /api/v1/node/:id/history` — AI manually records execution result
- `GET /api/v1/node/:id/history` — reverse-chronological history list
- `POST /api/v1/workflow/:projectId/sync` — batch upsert node structure

### Claude's Discretion

- `GET /api/v1/node/:id/history` pagination (default: last 20 entries)
- Error response format (follow NestJS default exception format)
- `PATCH /api/v1/node/:id` response body (return updated full entity)

### Deferred Ideas (OUT OF SCOPE)

- API Key authentication for AI agents — v2 (FEAT-04)
- History ETag cache optimization — v2 (FEAT-05)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | `PATCH /api/v1/node/:id` — update requirement, prompt, attributes; must not touch status | `em.assign()` + `persistAndFlush()` pattern from ProjectService; Zod schema enforces field exclusion; return updated entity |
| API-02 | `PATCH /api/v1/node/:id/status` — update status, atomically snapshot prompt+requirement into a new NodeExecutionHistoryEntity row | MikroORM `em.persistAndFlush()` with two operations in same flush; `randomUUID()` from Node.js `crypto` for new history id |
| API-03 | `POST /api/v1/node/:id/history` — AI records execution result (result, executedAt, createdBy/executedBy) | Create `NodeExecutionHistoryEntity`, persist; field mapping from CONTEXT `executedBy` → entity `createdBy` confirmed via entity schema |
| API-04 | `GET /api/v1/node/:id/history` — return reverse-chronological list, default 20 entries | `em.find()` with `orderBy: { createdAt: 'desc' }` and `limit: 20`; returns array (no envelope needed for v1) |
| API-05 | `POST /api/v1/workflow/:projectId/sync` — upsert canvas node structure; skip status/requirement/prompt/attributes | `em.upsert()` with `onConflictExcludeFields` verified in `UpsertOptions`; verify projectId exists first via ProjectService |
</phase_requirements>

---

## Summary

Phase 2 implements five REST endpoints in the pre-scaffolded `src/node/` module. All infrastructure from Phase 1 is in place: `NodeMetadataEntity`, `NodeExecutionHistoryEntity`, the migration, `NodeModule` registered in `AppModule`, and empty `NodeController`/`NodeService` stubs. The work is purely filling in controller actions, service methods, and DTOs.

The most nuanced endpoint is `PATCH /api/v1/node/:id/status`, which must atomically read the current `prompt`+`requirement` from `NodeMetadataEntity` and write a new `NodeExecutionHistoryEntity` row in the same `persistAndFlush()` call. MikroORM 6.x's `EntityManager.upsert()` with `onConflictExcludeFields` solves the sync endpoint's "skip protected fields on conflict" requirement cleanly, eliminating the need for a manual find-then-conditionally-insert pattern.

The global `api/v1` prefix is applied in `main.ts` via `app.setGlobalPrefix('/api/v1')`, meaning `NodeController` uses `@Controller('node')` — not `@Controller('api/v1/node')` as it currently stubs. The same prefix pattern applies to the workflow sync route; a second controller for workflow-level routes should be `@Controller('workflow')`.

**Primary recommendation:** Implement all five endpoints in one wave: DTOs first, then NodeService methods, then wire NodeController (and a new WorkflowController for the sync route). Test each endpoint with Jest unit tests for service logic and a contract spec for the upsert exclusion invariant.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mikro-orm/core` | 6.6.8 | ORM — entity management, upsert, flush | Already installed and used for all DB access |
| `@mikro-orm/nestjs` | 6.1.1 | `@InjectRepository`, `MikroOrmModule.forFeature()` | NestJS integration layer |
| `nestjs-zod` | 5.1.1 | `createZodDto()`, `ZodValidationPipe` | All existing DTOs use this pattern |
| `zod` | 3.24.1 | Schema definition | Peer dep of nestjs-zod |
| `crypto` (Node built-in) | Node 24 | `randomUUID()` for history record IDs | Already used in ProjectService; no extra dep |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/common` | 11.x | `@Controller`, `@Body`, `@Param`, `@Patch`, `@Post`, `@Get`, `NotFoundException`, `BadRequestException` | All controller/service decorators |
| `@nestjs/testing` | 11.x | Unit test module creation | Service-layer unit tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `em.upsert()` with `onConflictExcludeFields` | Manual `findOne` + conditional `create` or `assign` | Manual approach is more code and races on concurrent inserts; `em.upsert()` is a single SQL statement |
| Plain arrays for history response | Paginated envelope (`{ data, total, page }`) | Envelope adds complexity; v1 returns plain array with default limit=20 per discretion rule |

**Installation:** No new packages needed — all dependencies are already installed.

---

## Architecture Patterns

### Module Structure (existing — no changes needed)

```
src/
├── node/
│   ├── dto/                     # Wave 0: create DTOs here
│   │   ├── update-node.dto.ts
│   │   ├── update-node-status.dto.ts
│   │   ├── create-node-history.dto.ts
│   │   └── sync-workflow.dto.ts
│   ├── entities/
│   │   ├── node-metadata.entity.ts       # EXISTS (Phase 1)
│   │   └── node-execution-history.entity.ts  # EXISTS (Phase 1)
│   ├── node.controller.ts               # EXISTS stub — fill in
│   ├── node.service.ts                  # EXISTS stub — fill in
│   └── node.module.ts                   # EXISTS — may need ProjectModule import
├── workflow/                             # NEW: separate controller for /workflow routes
│   └── workflow.controller.ts           # Only needed for API-05 sync route
```

**Alternative:** Put the `workflow/sync` route inside `NodeController` with a path like `workflow/:projectId/sync`. This avoids a new module but mixes concerns. Preferred approach: add it to NodeController using a relative path override, or create a minimal `WorkflowController` file inside `src/node/` to keep the module boundary clean.

### Pattern 1: Zod DTO Creation

All DTOs follow the same pattern as `CreateProjectDto`:

```typescript
// Source: src/project/dto/create-project.dto.ts (project pattern)
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const updateNodeSchema = z.object({
  requirement: z.string().optional(),
  prompt: z.string().optional(),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

export class UpdateNodeDto extends createZodDto(updateNodeSchema) {}
```

`ZodValidationPipe` is registered globally in `main.ts` — no per-route pipe needed.

### Pattern 2: Service Update (assign + persistAndFlush)

```typescript
// Source: src/project/project.service.ts (project pattern)
async updateNode(nodeId: string, dto: UpdateNodeDto) {
  const node = await this.findNodeOrFail(nodeId);
  this.nodeRepo.assign(node, {
    requirement: dto.requirement ?? node.requirement,
    prompt: dto.prompt ?? node.prompt,
    attributes: dto.attributes ?? node.attributes,
    // status is intentionally excluded
  });
  await this.nodeRepo.getEntityManager().persistAndFlush(node);
  return node;
}
```

### Pattern 3: Atomic Status + History Snapshot

The critical API-02 transaction: read current state, write history row, update status — all flushed together:

```typescript
// Single-flush atomic write
async updateStatus(nodeId: string, newStatus: NodeStatus) {
  const node = await this.findNodeOrFail(nodeId);
  // snapshot before changing
  const history = this.historyRepo.create({
    id: randomUUID(),
    node,
    promptSnapshot: node.prompt,
    requirementSnapshot: node.requirement,
    executedAt: new Date(),
    // result and createdBy are null for status-change snapshots
  });
  node.status = newStatus;
  const em = this.nodeRepo.getEntityManager();
  em.persist(history);      // stage history row
  em.persist(node);         // stage status update
  await em.flush();         // single atomic flush
  return node;
}
```

MikroORM flushes all staged changes in one transaction by default — no explicit `@Transactional()` decorator needed for this simple case.

### Pattern 4: MikroORM 6.x Upsert with Field Exclusion (API-05)

`UpsertOptions.onConflictExcludeFields` is the correct way to skip protected fields on conflict:

```typescript
// Source: verified from node_modules/@mikro-orm/core/drivers/IDatabaseDriver.d.ts
await em.upsert(NodeMetadataEntity, {
  nodeId: item.nodeId,
  project: projectRef,
  nodeType: item.nodeType,
}, {
  onConflictFields: ['nodeId'],       // PK conflict field
  onConflictExcludeFields: ['status', 'requirement', 'prompt', 'attributes'],
});
```

For batch sync, `em.upsertMany()` accepts an array and the same options — one round-trip for all canvas nodes.

### Pattern 5: Controller Route — Global Prefix Awareness

`main.ts` applies `app.setGlobalPrefix('/api/v1')`, so:

```typescript
// NodeController covers /api/v1/node/*
@Controller('node')
export class NodeController { ... }

// For /api/v1/workflow/:projectId/sync — options:
// Option A: add to NodeController with explicit path
@Post('workflow/:projectId/sync')   // inside @Controller('node') — WRONG path result

// Option B: separate WorkflowController
@Controller('workflow')
export class WorkflowController { ... }
// Then register it in NodeModule controllers[] — no new module needed
```

**Recommendation:** Create `src/node/workflow.controller.ts` with `@Controller('workflow')` and register it in `NodeModule`. This keeps the module boundary without creating a whole new NestJS module.

### Pattern 6: ProjectService Dependency in NodeModule

`NodeService` needs `ProjectService.findOne()` to validate `projectId` on sync. `ProjectModule` does not currently export `ProjectService`. Two options:

1. Export `ProjectService` from `ProjectModule` and import `ProjectModule` into `NodeModule`
2. Inject the `ProjectRepository` directly in `NodeService` (add `ProjectEntity` to `NodeModule`'s `forFeature`)

**Recommendation:** Option 1 — export `ProjectService` from `ProjectModule` (add `exports: [ProjectService]`). This is the NestJS standard pattern and keeps service logic in one place.

### Anti-Patterns to Avoid

- **Do not set the `api/v1` prefix on `@Controller()`** — the global prefix from `main.ts` already adds it. The existing stub `@Controller('api/v1/node')` is wrong and must be corrected to `@Controller('node')`.
- **Do not use two separate flushes for the status snapshot** — staging both `history` and updated `node` before a single `em.flush()` is atomic; two flushes could leave status updated without history written if the second flush fails.
- **Do not use `onConflictAction: 'ignore'` for sync** — this would silently skip the nodeType update for renamed nodes. Use `'merge'` with `onConflictExcludeFields` to update nodeType while protecting AI fields.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert with partial field protection | Manual `findOne` → branch on result → `create`/`assign` | `em.upsert()` with `onConflictExcludeFields` | Race condition on concurrent syncs; single SQL statement is correct by construction |
| Request body validation | Custom validation middleware | `nestjs-zod` `createZodDto` + global `ZodValidationPipe` | Already wired globally; Zod schemas compose cleanly |
| UUID generation | External `uuid` package | `import { randomUUID } from 'crypto'` | Node 24 built-in; already used in `ProjectService` |
| Transaction for atomic writes | `@Transactional()` decorator or manual `em.transactional()` | Single `em.flush()` | MikroORM wraps all persisted changes in one transaction per flush |

---

## Common Pitfalls

### Pitfall 1: Controller Prefix Doubles the Path

**What goes wrong:** Route resolves to `/api/v1/api/v1/node/:id` — 404 for all requests.
**Why it happens:** The existing stub has `@Controller('api/v1/node')` but `main.ts` already sets global prefix `/api/v1`.
**How to avoid:** Change stub to `@Controller('node')`.
**Warning signs:** Integration test hitting endpoint gets 404 or route not found.

### Pitfall 2: Missing `test-setup.ts` File

**What goes wrong:** Jest fails to start with "Cannot find module `<rootDir>/test-setup.ts`".
**Why it happens:** `package.json` jest config lists `"setupFilesAfterEach": ["<rootDir>/test-setup.ts"]` but the file does not exist in `src/`.
**How to avoid:** Create `src/test-setup.ts` (can be empty or contain jest-extended setup).
**Warning signs:** `pnpm test` fails before any test runs.

### Pitfall 3: NodeExecutionHistoryEntity.id Not Auto-Generated

**What goes wrong:** INSERT fails with "NOT NULL constraint" on `id`.
**Why it happens:** `id` is declared with `@PrimaryKey()` and `!` (required) — MikroORM does not auto-assign UUID strings unless `@PrimaryKey({ type: 'uuid' })` is used.
**How to avoid:** Explicitly set `id: randomUUID()` when creating history records (matching how `ProjectService` handles project IDs).
**Warning signs:** Runtime error on `POST /api/v1/node/:id/history` or status update calls.

### Pitfall 4: CollaborationGateway Not Exported from CollaborationModule

**What goes wrong:** Cannot inject `CollaborationGateway` into `NodeService` in Phase 2.
**Why it happens:** `CollaborationModule` exports its services but not `CollaborationGateway` itself (verified in source).
**How to avoid:** Phase 2 only reserves the interface — do NOT try to inject `CollaborationGateway` yet. Use a comment or optional injection placeholder. Phase 5 will export it and wire the broadcast.
**Warning signs:** Circular dependency or "Nest can't resolve dependencies" at startup.

### Pitfall 5: upsertMany Requires Flush for Identity Map

**What goes wrong:** `em.upsertMany()` result is returned but entity state in identity map may be stale if subsequent reads use cache.
**Why it happens:** MikroORM docs note: "If the entity is already present in current context, there won't be any queries — the entity data will be assigned and an explicit flush will be required."
**How to avoid:** After `upsertMany`, if you return entity data, re-fetch or use the returned array directly. Don't rely on a subsequent `find` in the same request hitting the database.

---

## Code Examples

### DTO: UpdateNodeDto

```typescript
// Pattern from: src/project/dto/create-project.dto.ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const updateNodeSchema = z.object({
  requirement: z.string().optional(),
  prompt: z.string().optional(),
  attributes: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional(),
});
export class UpdateNodeDto extends createZodDto(updateNodeSchema) {}
```

### DTO: SyncWorkflowDto

```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const nodeItemSchema = z.object({
  nodeId: z.string().min(1),
  nodeType: z.string().min(1),
});
export const syncWorkflowSchema = z.object({
  nodes: z.array(nodeItemSchema),
});
export class SyncWorkflowDto extends createZodDto(syncWorkflowSchema) {}
```

### Service: upsertMany for Sync

```typescript
// Source: verified from @mikro-orm/core EntityManager.d.ts + UpsertOptions interface
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';

async sync(projectId: string, nodes: Array<{ nodeId: string; nodeType: string }>) {
  const project = await this.projectService.findOne(projectId); // validates existence
  const em = this.nodeRepo.getEntityManager();
  await em.upsertMany(
    NodeMetadataEntity,
    nodes.map(n => ({
      nodeId: n.nodeId,
      project,
      nodeType: n.nodeType,
    })),
    {
      onConflictFields: ['nodeId'],
      onConflictAction: 'merge',
      onConflictExcludeFields: ['status', 'requirement', 'prompt', 'attributes'],
    },
  );
}
```

### Service: findOne with NotFoundException

```typescript
// Pattern from: src/project/project.service.ts
async findNodeOrFail(nodeId: string): Promise<NodeMetadataEntity> {
  const node = await this.nodeRepo.findOne({ nodeId });
  if (!node) throw new NotFoundException(`节点不存在: ${nodeId}`);
  return node;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual upsert (find + create/update) | `em.upsert()` / `em.upsertMany()` with `onConflictExcludeFields` | MikroORM 5.x → 6.x | Single SQL, no race conditions |
| `class-validator` + `class-transformer` DTOs | `nestjs-zod` `createZodDto()` | NestJS ecosystem shift | Zod schemas are composable; `.partial()` for update DTOs |

**Deprecated/outdated:**
- `@nestjs/swagger` `ApiProperty` decorator on every field: not needed when using `nestjs-zod` — Zod schema auto-generates OpenAPI spec via `ZodValidationPipe`.

---

## Open Questions

1. **`src/test-setup.ts` missing**
   - What we know: `package.json` jest config requires `<rootDir>/test-setup.ts`; the file does not exist
   - What's unclear: Whether Wave 0 should create an empty file or one with specific setup
   - Recommendation: Create `src/test-setup.ts` as an empty file in Wave 0 to unblock Jest

2. **WorkflowController placement**
   - What we know: sync route is `/api/v1/workflow/:projectId/sync`, clearly not `node/*`
   - What's unclear: Whether to create a separate file or a second controller in `NodeModule`
   - Recommendation: Create `src/node/workflow.controller.ts` with `@Controller('workflow')`; register in `NodeModule.controllers[]` — no new NestJS module required

3. **`em.upsertMany` and project reference handling**
   - What we know: `upsert` data must include a populated reference or the FK value
   - What's unclear: Whether `{ project: projectEntity }` (object) or `{ project: { id: projectId } }` (partial) works for the FK
   - Recommendation: Use `em.getReference(ProjectEntity, projectId)` for a lightweight reference — standard MikroORM pattern that avoids a full fetch

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest |
| Config file | `package.json` `"jest"` key; `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"` |
| Quick run command | `pnpm test -- --testPathPattern="node"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `updateNode()` updates req/prompt/attributes but not status | unit | `pnpm test -- --testPathPattern="node.service"` | Wave 0 |
| API-02 | `updateStatus()` atomically writes history snapshot + new status | unit | `pnpm test -- --testPathPattern="node.service"` | Wave 0 |
| API-03 | `createHistory()` persists executedBy + result fields | unit | `pnpm test -- --testPathPattern="node.service"` | Wave 0 |
| API-04 | `getHistory()` returns entries ordered by createdAt desc, max 20 | unit | `pnpm test -- --testPathPattern="node.service"` | Wave 0 |
| API-05 | `sync()` upserts nodeId/nodeType/projectId, skips protected fields | unit | `pnpm test -- --testPathPattern="node.service"` | Wave 0 |
| API-05 invariant | Sync cannot overwrite status/requirement/prompt/attributes | contract spec | `pnpm test -- --testPathPattern="sync.contract"` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test -- --testPathPattern="node"`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/test-setup.ts` — empty file to satisfy Jest `setupFilesAfterEnach` config; required before any test runs
- [ ] `src/node/node.service.spec.ts` — covers API-01 through API-05 service logic
- [ ] `src/node/sync.contract.spec.ts` — structural assertion that upsert options exclude the four protected fields

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@mikro-orm/core/EntityManager.d.ts` — `em.upsert()` / `em.upsertMany()` signatures confirmed present
- `node_modules/@mikro-orm/core/drivers/IDatabaseDriver.d.ts` — `UpsertOptions` interface with `onConflictExcludeFields` confirmed
- `src/project/project.service.ts` — `em.assign()` + `persistAndFlush()` + `NotFoundException` pattern
- `src/project/dto/create-project.dto.ts` — `createZodDto(z.object(...))` pattern
- `src/main.ts` — global prefix `/api/v1` confirmed; `ZodValidationPipe` global registration
- `src/app.module.ts` — `NodeModule` already imported
- `src/node/node.module.ts` — `NodeController` + `NodeService` + both entities registered
- `src/node/entities/node-metadata.entity.ts` — entity fields and types confirmed
- `src/node/entities/node-execution-history.entity.ts` — entity fields confirmed; `id` is not auto-generated
- `src/collaboration/collaboration.module.ts` — `CollaborationGateway` is NOT exported (Phase 2 must not inject it)
- `package.json` jest config — framework Jest 30, `rootDir: "src"`, missing `test-setup.ts` confirmed

### Secondary (MEDIUM confidence)

- MikroORM 6.x changelog (confirmed via installed version 6.6.8): `upsertMany` and `onConflictExcludeFields` available since MikroORM 5.7/6.0

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified from installed `node_modules`
- Architecture: HIGH — patterns taken directly from existing project source
- Pitfalls: HIGH — most discovered by reading actual source code; `test-setup.ts` gap confirmed by reading `package.json`

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable stack; MikroORM minor updates unlikely to break `upsert` API)
