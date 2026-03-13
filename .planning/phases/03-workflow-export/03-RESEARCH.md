# Phase 3: Workflow Export - Research

**Researched:** 2026-03-13
**Domain:** NestJS service layer, Kahn's topological sort, DAG cycle detection, HTTP exception handling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dependency Source (边依赖来源)**
- Parse edge data from `ProjectEntity.workflowJson` blob — do NOT add an EdgeEntity table or any migration
- Re-parse blob on every export request — no caching (ETag optimization is v2 FEAT-05)
- `dependencies[]` direction: **incoming edges** — node B's dependencies are [A] means A→B (A must complete before B can execute)
- Dangling edges (edge endpoints not present in NodeMetadata): silently skip, do not affect export execution

**Node Coverage (导出节点范围)**
- Export ONLY nodes that have a NodeMetadata row (nodes that have been synced); rows with `deletedAt IS NOT NULL` are fully excluded
- Unsynced canvas nodes are invisible to AI
- `can_execute` calculation: if a dependency node is not in this export scope (unsynced or deleted), treat it as **satisfied** (does not block execution)

**Export Envelope Shape (响应结构)**
- Top-level fields: `projectId`, `projectName`, `exported_at`, `total_nodes`, `nodes[]`, `execution_order[]`, `executable_now[]`
- Do NOT include `status_summary` — AI can derive from `nodes[]`
- `execution_order[]` uses standard Kahn algorithm output; same-level nodes get no extra sorting

**Error Handling (错误处理)**
- `projectId` not found: HTTP **404 Not Found**
- `workflowJson` is null (canvas never saved): return HTTP 200, empty export: `{ nodes: [], execution_order: [], executable_now: [], total_nodes: 0, ... }`
- Cyclic dependency: HTTP **422 Unprocessable Entity**, body:
  ```json
  { "error": "Cyclic dependency detected", "cycle": ["nodeA", "nodeB", "nodeA"] }
  ```

### Claude's Discretion
- WorkflowExportService concrete structure (whether to extract a separate service file)
- Kahn algorithm implementation details
- Unit test case design (cycle detection, empty graph, isolated nodes, etc.)

### Deferred Ideas (OUT OF SCOPE)
- ETag cache optimization (reduce redundant transfer on AI polling) — v2 FEAT-05
- `status_summary` statistics field — user decided not to add; AI derives it themselves
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXPORT-01 | `GET /api/v1/workflow/:projectId/export` — returns AI-parseable workflow JSON, merging canvas topology with NodeMetadataEntity data | Route added to existing `WorkflowController`; `ProjectService.findOne` retrieves project + workflowJson; `NodeMetadataRepository` retrieves synced nodes |
| EXPORT-02 | Each node in the export contains: nodeId, type, requirement, prompt, attributes, status, dependencies[] | All fields available from `NodeMetadataEntity`; `dependencies[]` built from workflowJson edges via adjacency map |
| EXPORT-03 | Each node has a `can_execute` boolean — true only when all dependency nodes are completed | Computed after building node map; a dependency absent from export scope counts as satisfied |
| EXPORT-04 | Top-level `execution_order` array — server-side Kahn algorithm pre-computes topological sort | Kahn algorithm on the filtered node set; returns 422 if cycle detected before completing the sort |
| EXPORT-05 | Top-level `executable_now` array — node IDs where `can_execute` is currently true | Filter of the node map after EXPORT-03 computation |
| EXPORT-06 | Cycle detection returns HTTP 422 with cycle path description | Kahn algorithm detects cycle when nodes remain after processing; DFS backtrack or node-coloring recovers the cycle path |
</phase_requirements>

---

## Summary

Phase 3 is a single-endpoint backend feature: `GET /api/v1/workflow/:projectId/export`. The implementation assembles data from two sources — `ProjectEntity.workflowJson` (canvas edge topology) and `NodeMetadataEntity` rows (per-node AI metadata + status) — then applies Kahn's topological sort to produce a ready-to-consume JSON payload for AI IDEs.

All foundational infrastructure is already in place from Phases 1 and 2. `WorkflowController` exists and accepts the `@Controller('workflow')` prefix. `NodeService` demonstrates the `@InjectRepository` + `EntityManager` injection pattern. `ProjectService.findOne` handles the 404 path. No new database tables, migrations, or DTOs for the request body are required.

The most nuanced piece is the cycle-detection path: Kahn's algorithm naturally detects cycles (nodes remain in the working set when the queue empties), but recovering the actual cycle *path* to return in the 422 body requires an additional DFS pass or node-coloring on the subgraph of remaining nodes after Kahn finishes.

**Primary recommendation:** Implement a `WorkflowExportService` (new injectable, added to `NodeModule` providers) with a single `exportWorkflow(projectId)` method. Add `@Get(':projectId/export')` to `WorkflowController` and delegate entirely — matching the established thin-controller pattern.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/common` | ^11.1.14 | `Injectable`, `NotFoundException`, `UnprocessableEntityException`, `Get`, `Param` | Already used throughout codebase |
| `@mikro-orm/nestjs` | ^6.1.1 | `@InjectRepository`, `EntityManager` | Established in NodeService — same injection pattern |
| `@mikro-orm/core` | ^6.6.8 | `EntityRepository`, query filters | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nestjs-zod` / `zod` | ^3.24.1 | Response shape definition | Optional — no request body, but response typing can use plain TypeScript interface |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `UnprocessableEntityException` | Custom `HttpException(422)` | `UnprocessableEntityException` is the NestJS idiomatic choice; produces correct status without custom status code |
| Kahn algorithm (BFS) | DFS topological sort | Kahn is iterative, easier to reason about in-degree; DFS works equally well but cycle recovery requires explicit coloring |

**No new installation needed** — all required packages are already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

No new files outside of `src/node/`:

```
src/node/
├── entities/
│   ├── node-metadata.entity.ts          # existing
│   └── node-execution-history.entity.ts # existing
├── dto/
│   └── sync-workflow.dto.ts             # existing
├── workflow-export.service.ts           # NEW — Kahn + data assembly
├── workflow.controller.ts               # existing — add @Get route
├── node.controller.ts                   # existing — unchanged
├── node.service.ts                      # existing — unchanged
└── node.module.ts                       # existing — add WorkflowExportService to providers
```

### Pattern 1: Thin Controller Delegation (established pattern)

**What:** Controller routes call service methods with no logic in the controller body.
**When to use:** All routes in this codebase — established in Phase 2.

```typescript
// src/node/workflow.controller.ts — add alongside existing @Post sync
@Get(':projectId/export')
async export(@Param('projectId') projectId: string) {
  return this.workflowExportService.exportWorkflow(projectId);
}
```

The controller constructor must also inject `WorkflowExportService`.

### Pattern 2: Service Injection (established pattern)

**What:** `@Injectable()` service with `@InjectRepository` and `EntityManager` — matches `NodeService`.

```typescript
// src/node/workflow-export.service.ts
@Injectable()
export class WorkflowExportService {
  constructor(
    @InjectRepository(NodeMetadataEntity)
    private readonly nodeRepo: EntityRepository<NodeMetadataEntity>,
    private readonly projectService: ProjectService,
    private readonly em: EntityManager,
  ) {}

  async exportWorkflow(projectId: string): Promise<WorkflowExportDto> {
    // 1. Fetch project (throws NotFoundException on 404)
    const project = await this.projectService.findOne(projectId);

    // 2. Handle null workflowJson
    if (!project.workflowJson) {
      return emptyExport(projectId, project.name);
    }

    // 3. Fetch synced, non-deleted nodes
    const nodes = await this.nodeRepo.find({
      project: { id: projectId },
      deletedAt: null,
    });

    // 4. Parse edges from workflowJson
    const edges: Array<{ sourceNodeId: string; targetNodeId: string }> =
      (project.workflowJson.edges ?? []).map((e: any) => ({
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
      }));

    // 5. Build nodeId set for scope checking
    const nodeIds = new Set(nodes.map((n) => n.nodeId));

    // 6. Build in-scope adjacency (filter dangling edges)
    const dependencyMap = buildDependencyMap(nodes, edges, nodeIds);

    // 7. Kahn topological sort + cycle detection
    const { order, cycle } = kahnSort(nodeIds, dependencyMap);
    if (cycle) {
      throw new UnprocessableEntityException({
        error: 'Cyclic dependency detected',
        cycle,
      });
    }

    // 8. Assemble output nodes
    const exportNodes = nodes.map((n) => ({
      nodeId: n.nodeId,
      type: n.nodeType,
      requirement: n.requirement,
      prompt: n.prompt ?? null,
      attributes: n.attributes ?? null,
      status: n.status,
      dependencies: dependencyMap.get(n.nodeId) ?? [],
      can_execute: (dependencyMap.get(n.nodeId) ?? []).every(
        (depId) => !nodeIds.has(depId) || nodeMap.get(depId)?.status === 'completed',
      ),
    }));

    return {
      projectId,
      projectName: project.name,
      exported_at: new Date().toISOString(),
      total_nodes: exportNodes.length,
      nodes: exportNodes,
      execution_order: order,
      executable_now: exportNodes.filter((n) => n.can_execute).map((n) => n.nodeId),
    };
  }
}
```

### Pattern 3: Kahn's Algorithm with Cycle Detection

**What:** BFS-based topological sort using in-degree tracking. Detects cycles when the queue empties with nodes still unprocessed.

```typescript
// Pure function — no dependencies, fully unit-testable
function kahnSort(
  nodeIds: Set<string>,
  dependencyMap: Map<string, string[]>,  // nodeId -> incomingDeps[]
): { order: string[]; cycle: string[] | null } {
  // Build in-degree map
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, 0);

  for (const [, deps] of dependencyMap) {
    for (const dep of deps) {
      if (nodeIds.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0));
        // Increment the TARGET node's in-degree
      }
    }
  }
  // Note: deps are INCOMING edges, so iterate nodeId -> deps and increment nodeId's in-degree
  for (const [nodeId, deps] of dependencyMap) {
    // nodeId depends on deps[] — so nodeId has in-degree = deps.length (in-scope only)
    const inScopeDeps = deps.filter((d) => nodeIds.has(d));
    inDegree.set(nodeId, inScopeDeps.length);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);
    // Find nodes that depend on curr (curr is a dep of them)
    for (const [nodeId, deps] of dependencyMap) {
      if (deps.includes(curr)) {
        const newDeg = (inDegree.get(nodeId) ?? 1) - 1;
        inDegree.set(nodeId, newDeg);
        if (newDeg === 0) queue.push(nodeId);
      }
    }
  }

  if (order.length < nodeIds.size) {
    // Cycle exists — recover one cycle path via DFS on remaining nodes
    const remaining = [...nodeIds].filter((id) => !order.includes(id));
    const cycle = findCyclePath(remaining, dependencyMap, nodeIds);
    return { order: [], cycle };
  }

  return { order, cycle: null };
}
```

**Cycle path recovery** — DFS with three-color marking (white/gray/black):

```typescript
function findCyclePath(
  candidates: string[],
  dependencyMap: Map<string, string[]>,
  nodeIds: Set<string>,
): string[] {
  const color = new Map<string, 'white' | 'gray' | 'black'>();
  for (const id of nodeIds) color.set(id, 'white');

  const path: string[] = [];

  function dfs(node: string): boolean {
    color.set(node, 'gray');
    path.push(node);
    for (const dep of (dependencyMap.get(node) ?? [])) {
      if (!nodeIds.has(dep)) continue;
      if (color.get(dep) === 'gray') {
        // Found cycle — trim path to the cycle
        const cycleStart = path.indexOf(dep);
        const cycle = [...path.slice(cycleStart), dep];
        return true; // signals cycle found; caller reads `cycle`
      }
      if (color.get(dep) === 'white' && dfs(dep)) return true;
    }
    path.pop();
    color.set(node, 'black');
    return false;
  }

  // Try from each candidate until cycle found
  for (const start of candidates) {
    if (color.get(start) === 'white') {
      path.length = 0;
      if (dfs(start)) {
        const cycleStart = path[path.length - 1];
        return path.slice(path.indexOf(cycleStart));
      }
    }
  }
  return candidates.slice(0, 2).concat(candidates[0]); // fallback (should not reach)
}
```

### Pattern 4: NestJS 422 Exception

**What:** `UnprocessableEntityException` from `@nestjs/common` — produces HTTP 422 with the provided body.

```typescript
// Source: NestJS documentation — built-in HTTP exceptions
import { UnprocessableEntityException } from '@nestjs/common';

throw new UnprocessableEntityException({
  error: 'Cyclic dependency detected',
  cycle: ['nodeA', 'nodeB', 'nodeA'],
});
```

Note: NestJS wraps the object in `{ statusCode: 422, message: {...} }` by default when you pass an object. To emit exactly `{ error, cycle }` without NestJS wrapper, pass a response string and use the overload:

```typescript
throw new UnprocessableEntityException(
  { error: 'Cyclic dependency detected', cycle },
  'Cyclic dependency',
);
```

However, the locked decision only specifies the body fields `error` and `cycle` — the NestJS default wrapping is acceptable unless the AI consumer requires exact shape. Recommend testing the actual response shape during smoke test.

### Anti-Patterns to Avoid

- **Caching export results in memory:** Locked decision requires re-parsing on every request. Do not add a class-level Map cache.
- **Writing edge data to a new table:** Locked decision — edges stay in workflowJson blob only.
- **Filtering nodes inside the Kahn algorithm:** Build the filtered node set *before* running Kahn. The algorithm should operate only on in-scope nodes.
- **Using `this.em.find()` with a JOIN to project:** Use `this.nodeRepo.find({ project: { id: projectId }, deletedAt: null })` — simpler, consistent with Phase 2 patterns.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP 422 status | Custom `throw new HttpException({...}, 422)` | `UnprocessableEntityException` | NestJS built-in, sets correct status + Swagger docs automatically |
| HTTP 404 status | Custom null checks with manual responses | `ProjectService.findOne` already throws `NotFoundException` | Pattern established in Phase 2; just call `findOne` and let it throw |
| Dependency resolution | Custom graph library | Inline Kahn implementation | Graph is in-memory, small (workflow nodes), no library needed — adds zero dependencies |

**Key insight:** The graph algorithm is simple enough to implement as a pure function. The complexity ceiling for a workflow DAG (dozens to low hundreds of nodes) means no performance concern; correctness and testability matter more than sophistication.

---

## Common Pitfalls

### Pitfall 1: MikroORM `deletedAt: null` Filter Syntax

**What goes wrong:** `{ deletedAt: null }` in MikroORM 6 does correctly find rows where `deletedAt IS NULL`. However, the column is nullable (`@Property({ nullable: true })`), so a row that has never been soft-deleted has `deletedAt = undefined` in the entity — which maps to `NULL` in the DB. The filter `{ deletedAt: null }` will match those rows correctly.

**How to avoid:** Use `{ project: { id: projectId }, deletedAt: null }` and verify with a unit test that excludes a node with a non-null `deletedAt`.

**Warning signs:** Deleted nodes appearing in export response.

### Pitfall 2: workflowJson Edge Field Name Mismatch

**What goes wrong:** LogicFlow stores edges differently depending on version. The CONTEXT.md specifies the format is `edges[].sourceNodeId` and `edges[].targetNodeId`. If the actual stored JSON uses `source` / `target` or `sourceId` / `targetId`, the edge parsing silently returns no dependencies.

**Why it happens:** The `workflowJson` blob is written by the frontend LogicFlow serializer. The converter in `utils/logicflow-converter.ts` may not rename these fields.

**How to avoid:** Before implementation, inspect one real `workflowJson` row in `database.sqlite` to confirm field names. Add a unit test that exercises the edge parsing with real-shaped edge objects.

**Warning signs:** All nodes show `dependencies: []` even when edges exist on the canvas.

### Pitfall 3: NestJS UnprocessableEntityException Body Shape

**What goes wrong:** `new UnprocessableEntityException({ error, cycle })` wraps the object as `{ statusCode: 422, message: { error, cycle } }` — the `error` and `cycle` fields are nested under `message`, not top-level.

**Why it happens:** NestJS 11 exception handling wraps constructor argument under `message` when it is not a string.

**How to avoid:** Verify response body shape in smoke test. If AI IDE requires top-level `{ error, cycle }`, use `new HttpException({ error, cycle }, HttpStatus.UNPROCESSABLE_ENTITY)` instead.

**Warning signs:** AI IDE cannot parse 422 response — reports `message.error` instead of `error`.

### Pitfall 4: Kahn In-Degree Initialization for Isolated Nodes

**What goes wrong:** A node with no incoming and no outgoing edges (isolated node) may not get added to the initial zero-in-degree queue if the initialization loop only iterates nodes that appear in the dependency map.

**How to avoid:** Initialize `inDegree` from the full `nodeIds` set (setting each to 0), *then* increment based on dependencies. This guarantees isolated nodes start with in-degree 0 and are added to the initial queue.

**Warning signs:** Isolated nodes missing from `execution_order`.

### Pitfall 5: can_execute When No Dependencies

**What goes wrong:** A node with an empty `dependencies[]` should have `can_execute = true` (vacuously true — no dependencies to block it). A naive `every()` check on an empty array returns `true` in JavaScript, which is correct, but a `some()` or conditional check might erroneously return `false`.

**How to avoid:** Use `Array.prototype.every()` directly: `deps.every(cond)` returns `true` for `[]`. Add a unit test: "node with no dependencies has can_execute = true".

---

## Code Examples

### Query: Non-deleted synced nodes for a project

```typescript
// Source: MikroORM 6 EntityRepository API
const nodes = await this.nodeRepo.find(
  { project: { id: projectId }, deletedAt: null },
  { orderBy: { createdAt: 'asc' } },
);
```

### Building the dependency map from workflowJson edges

```typescript
// dependencyMap: nodeId -> string[] of incoming dependency nodeIds
function buildDependencyMap(
  nodes: NodeMetadataEntity[],
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
  nodeIds: Set<string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of nodes) map.set(node.nodeId, []);

  for (const edge of edges) {
    const { sourceNodeId, targetNodeId } = edge;
    // Skip dangling edges (either endpoint not in scope)
    if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) continue;
    // targetNodeId depends on sourceNodeId (incoming edge)
    map.get(targetNodeId)!.push(sourceNodeId);
  }
  return map;
}
```

### Empty export response

```typescript
function emptyExport(projectId: string, projectName: string) {
  return {
    projectId,
    projectName,
    exported_at: new Date().toISOString(),
    total_nodes: 0,
    nodes: [],
    execution_order: [],
    executable_now: [],
  };
}
```

### Module registration (add WorkflowExportService)

```typescript
// src/node/node.module.ts
@Module({
  imports: [
    MikroOrmModule.forFeature([NodeMetadataEntity, NodeExecutionHistoryEntity]),
    ProjectModule,
  ],
  controllers: [NodeController, WorkflowController],
  providers: [NodeService, WorkflowExportService],  // add WorkflowExportService
  exports: [NodeService],
})
export class NodeModule {}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express-based NestJS exception handling | Fastify adapter, same `@nestjs/common` exceptions | Pre-existing in project | No behavior difference for exception classes — they work identically on Fastify |
| MikroORM 5 `em.find()` with raw SQL joins | MikroORM 6 property-path filters `{ project: { id } }` | MikroORM 6.0 | Cleaner query syntax without raw SQL |

---

## Open Questions

1. **Actual edge field names in workflowJson blob**
   - What we know: CONTEXT.md specifies `sourceNodeId` and `targetNodeId`
   - What's unclear: The actual LogicFlow serializer output may use different field names (LogicFlow's internal model uses `sourceNodeId`/`targetNodeId` in some versions and `source`/`target` in others)
   - Recommendation: During Wave 1 (implementation), inspect `database.sqlite` or the `logicflow-converter.ts` to confirm. Add a defensive mapping if necessary. A unit test with a real-shaped edge object will catch any mismatch immediately.

2. **UnprocessableEntityException body envelope**
   - What we know: NestJS 11 wraps objects passed to exception constructors under `message`
   - What's unclear: Whether the AI IDE consumer requires flat `{ error, cycle }` or tolerates `{ statusCode, message: { error, cycle } }`
   - Recommendation: Use `HttpException({ error, cycle }, HttpStatus.UNPROCESSABLE_ENTITY)` for exact shape; test the response shape in smoke test.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x + ts-jest 29.x |
| Config file | `package.json` (jest key) — rootDir: `src`, testRegex: `.*\.spec\.ts$` |
| Quick run command | `pnpm test -- --testPathPattern=workflow-export` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPORT-01 | GET route returns 200 with correct envelope | unit (mock service) | `pnpm test -- --testPathPattern=workflow.controller` | ❌ Wave 0 |
| EXPORT-01 | GET route returns 404 when project not found | unit (mock service) | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-01 | GET route returns 200 empty export when workflowJson is null | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-02 | Exported nodes contain all required fields | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-02 | Dangling edges are silently skipped | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-03 | can_execute=true when all deps are completed | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-03 | can_execute=true when no deps (isolated node) | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-03 | can_execute=false when at least one dep is not completed | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-03 | can_execute=true when dep is outside export scope (unsynced/deleted) | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-04 | execution_order contains all nodes in valid topological order | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-04 | Isolated nodes appear in execution_order | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-05 | executable_now contains exactly the can_execute=true node IDs | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-06 | Cyclic DAG returns 422 with error+cycle fields | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |
| EXPORT-06 | cycle array starts and ends with same node ID | unit | `pnpm test -- --testPathPattern=workflow-export.service` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern=workflow-export`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/node/workflow-export.service.spec.ts` — covers EXPORT-01 through EXPORT-06 (primary test file)
- [ ] `src/node/workflow.controller.export.spec.ts` — covers EXPORT-01 controller routing (or extend existing workflow controller test if one is created)

*(No framework gaps — Jest + ts-jest already configured in package.json)*

---

## Sources

### Primary (HIGH confidence)
- Codebase read: `src/node/node.service.ts` — injection patterns, `findNodeOrFail` convention, `em.find()` usage
- Codebase read: `src/node/workflow.controller.ts` — controller structure, thin delegation pattern
- Codebase read: `src/node/node.module.ts` — module registration pattern for providers
- Codebase read: `src/node/entities/node-metadata.entity.ts` — confirmed available fields: nodeId, nodeType, requirement, prompt, attributes, status, deletedAt
- Codebase read: `src/project/entities/project.entity.ts` — confirmed `workflowJson: Record<string, any>` is nullable
- Codebase read: `src/project/project.service.ts` — confirmed `findOne` throws `NotFoundException` on miss
- Codebase read: `src/node/node.service.spec.ts` — confirmed test pattern: plain class instantiation with jest mock objects, no NestJS testing module
- Codebase read: `package.json` — confirmed Jest 30 + ts-jest, rootDir=src, test command `pnpm test`
- `.planning/phases/03-workflow-export/03-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- NestJS built-in HTTP exceptions: `UnprocessableEntityException` wraps argument under `message` when it is not a string — verified against known NestJS 11 behavior; recommend confirming with smoke test
- MikroORM 6 `find({ deletedAt: null })` syntax — consistent with codebase patterns seen in Phase 2

### Tertiary (LOW confidence)
- LogicFlow edge field names (`sourceNodeId`/`targetNodeId`): stated in CONTEXT.md but not independently verified against a real database row or LogicFlow source — flagged as Open Question 1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already present in package.json, patterns verified in codebase
- Architecture: HIGH — follows established Phase 2 patterns exactly; no new patterns introduced
- Kahn algorithm: HIGH — well-known algorithm; the implementation sketches are illustrative, unit tests will verify correctness
- Pitfalls: MEDIUM — edge field name pitfall is LOW until confirmed; NestJS exception shape is MEDIUM pending smoke test
- Test map: HIGH — all test patterns follow the established `node.service.spec.ts` mock-object style

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable stack — NestJS + MikroORM versions pinned in package.json)
