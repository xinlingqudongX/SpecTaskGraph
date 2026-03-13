---
phase: 01-data-model
plan: 02
subsystem: types
tags: [typescript, zod, logicflow, workflow-schema, node-status]

requires:
  - phase: 01-data-model
    provides: "NodeMetadataEntity + ProjectEntity schema from plan 01-01"

provides:
  - "Locked NodeStatus enum: pending|completed|failed|review_needed across all 3 type files"
  - "New Instructions interface: requirement+prompt (no guide/logic/criteria)"
  - "Updated InstructionsSchema with z.string().default('') + z.string().nullable().optional()"
  - "logicflow-converter.ts spread bug fixed: explicit AI field mappings replace ...nodeData.config"
  - "Round-trip tests for requirement/prompt/attributes in logicflow-converter.spec.ts"

affects:
  - 02-sync-api
  - 03-export
  - frontend-workflow-editor

tech-stack:
  added: []
  patterns:
    - "AI fields (requirement/prompt/attributes) are explicit properties in converter, never spread"
    - "extractCustomProperties standardProps excludes all known fields including typeKey/requirement/prompt/attributes"
    - "Instructions type uses requirement+prompt; backend migration adds defaults when missing"

key-files:
  created:
    - frontend/src/tests/logicflow-converter.spec.ts
  modified:
    - frontend/src/types/logicflow.types.ts
    - frontend/src/types/workflow.types.ts
    - src/schemas/workflow.schema.ts
    - src/types/workflow.types.ts
    - src/services/schema-manager.service.ts
    - src/services/__tests__/schema-manager.service.spec.ts
    - src/examples/validation-usage.example.ts
    - src/services/demo.ts
    - src/utils/workflow.utils.ts
    - frontend/src/utils/logicflow-converter.ts

key-decisions:
  - "NodeStatus locked to 4 values: pending|completed|failed|review_needed — no running/skipped anywhere"
  - "Instructions simplified to requirement+prompt; guide/logic/criteria are removed from all files"
  - "Spread bug fix: ...nodeData.config removed from convertNodeData; explicit AI fields added"
  - "typeKey added to extractCustomProperties standardProps to prevent it leaking as custom prop"
  - "schema-validation.spec.ts failures (missing example-project.json) are pre-existing, not fixed"

patterns-established:
  - "Converter rule: all known properties must be in standardProps Set; use explicit mapping not spread"
  - "Migration rule: when Instructions shape changes, update migrateTo1_0_0 defaults simultaneously"

requirements-completed:
  - DATA-04
  - DATA-05

duration: 7min
completed: 2026-03-13
---

# Phase 1 Plan 2: NodeStatus + Instructions + Converter Fix Summary

**Locked NodeStatus to 4-value enum across 3 files, replaced Instructions guide/logic/criteria with requirement+prompt, and fixed logicflow-converter spread bug that would corrupt array properties in round-trips**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T05:47:15Z
- **Completed:** 2026-03-13T05:53:39Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- NodeStatus in `logicflow.types.ts`, `workflow.types.ts` (both frontend and backend), and `workflow.schema.ts` now contain exactly `pending|completed|failed|review_needed` with no `running` or `skipped`
- Instructions interface updated to `{ requirement: string; prompt?: string }` and InstructionsSchema updated to match; all 9 downstream files updated
- `logicflow-converter.ts` spread bug fixed: `...nodeData.config` removed from `convertNodeData`; `requirement`, `prompt`, `attributes` now explicitly mapped in both directions; `typeKey` added to `standardProps`
- 5 round-trip tests added in `logicflow-converter.spec.ts` covering requirement, prompt, attributes array, properties array, and empty-requirement cases — all pass

## Task Commits

1. **Task 1: Update NodeStatus enum and Instructions type** - `b52dc13` (feat)
2. **Task 2: Fix logicflow-converter spread bug and add round-trip tests** - `e954b35` (feat)

## Files Created/Modified

- `frontend/src/types/logicflow.types.ts` - NodeStatus enum updated; AI fields added to ExtendedNodeConfig.properties and NodeData.config
- `frontend/src/types/workflow.types.ts` - NodeStatus enum updated; Instructions changed to requirement+prompt
- `src/schemas/workflow.schema.ts` - NodeStatusSchema and InstructionsSchema updated
- `src/types/workflow.types.ts` - NodeStatus enum updated; Instructions changed to requirement+prompt
- `src/services/schema-manager.service.ts` - migrateTo1_0_0 migration logic updated for new Instructions shape
- `src/services/__tests__/schema-manager.service.spec.ts` - Test fixtures updated from guide/logic/criteria to requirement/prompt
- `src/examples/validation-usage.example.ts` - Example code updated
- `src/services/demo.ts` - Demo code updated
- `src/utils/workflow.utils.ts` - createStartNode/createEndNode updated
- `frontend/src/utils/logicflow-converter.ts` - Spread bug fixed; AI fields explicitly mapped; standardProps expanded
- `frontend/src/tests/logicflow-converter.spec.ts` - New: 5 round-trip tests for DATA-05

## Decisions Made

- **Instructions simplified:** Removed guide/logic/criteria three-field structure in favor of requirement (required) + prompt (optional). The old triple-field structure was designed for human-centric documentation but the new design treats requirement as the AI instruction and prompt as optional override.
- **Spread bug fix approach:** Replaced `...nodeData.config` with `...this.extractCustomProperties(nodeData.config)` and added `typeKey/requirement/prompt/attributes` to the standardProps exclusion set. This prevents double-entry and array corruption.
- **schema-validation.spec.ts:** The 3 tests fail because `src/data/workflow/example-project.json` does not exist — this is a pre-existing issue not caused by Plan 02 changes. Deferred.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated src/types/workflow.types.ts (backend)**
- **Found during:** Task 1 (type-check verification)
- **Issue:** Backend `src/types/workflow.types.ts` also had the old NodeStatus (running/skipped) and Instructions (guide/logic/criteria) — not mentioned in the plan's files list but required by schema-manager.service.ts
- **Fix:** Updated NodeStatus and Instructions in the backend types file to match the new contract
- **Files modified:** `src/types/workflow.types.ts`
- **Verification:** type-check exits 0
- **Committed in:** b52dc13

**2. [Rule 1 - Bug] Updated schema-manager.service.ts migration logic**
- **Found during:** Task 1 (type-check verification)
- **Issue:** `migrateTo1_0_0` set `instructions.guide/logic/criteria` which no longer exist on the type
- **Fix:** Updated migration defaults to `{ requirement: '', prompt: undefined }`
- **Files modified:** `src/services/schema-manager.service.ts`
- **Verification:** schema-manager tests pass (17/17)
- **Committed in:** b52dc13

**3. [Rule 1 - Bug] Updated downstream example and utility files**
- **Found during:** Task 1 (pnpm run type-check)
- **Issue:** 12 TypeScript errors in `validation-usage.example.ts`, `demo.ts`, `workflow.utils.ts` using old Instructions fields
- **Fix:** Replaced all `guide/logic/criteria` literals with `requirement` in all affected files
- **Files modified:** `src/examples/validation-usage.example.ts`, `src/services/demo.ts`, `src/utils/workflow.utils.ts`
- **Verification:** type-check exits 0
- **Committed in:** b52dc13

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs exposed by type change cascading to files not listed in plan)
**Impact on plan:** All fixes necessary for type correctness. No scope creep — all changes are direct consequences of the Instructions type rename.

## Issues Encountered

- **schema-validation.spec.ts pre-existing failure:** 3 tests fail with ENOENT because `src/data/workflow/example-project.json` does not exist. This file was never created. Tests were broken before Plan 02. Not fixed (out of scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Data model contract is fully locked: NodeStatus has 4 values, Instructions has 2 fields
- logicflow-converter is safe for round-trips — AI fields survive toLogicFlowData → fromLogicFlowData
- Phase 2 sync API can proceed with confidence that the schema contract won't change
- Blocker from STATE.md still applies: confirm MikroORM 6.6.8 exact `em.upsert()` signature before Phase 2 implementation

---
*Phase: 01-data-model*
*Completed: 2026-03-13*
