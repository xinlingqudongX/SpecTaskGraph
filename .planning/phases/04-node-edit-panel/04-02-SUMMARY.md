---
phase: 04-node-edit-panel
plan: 02
subsystem: ui
tags: [logicflow, htmlnode, dom, debounce, vitest, tdd, wave1]

# Dependency graph
requires:
  - phase: 04-node-edit-panel
    plan: 01
    provides: Wave 0 RED test stubs (node-card.spec.ts + node-api.spec.ts) and placeholder files
  - phase: 02-node-api
    provides: PATCH /api/v1/node/:id endpoint
provides:
  - CardNodeModel: standalone model class with height calculation (collapsed=80, expanded=300+attrs*36)
  - CardNodeView: pure-DOM view class with setHtml rendering expanded/collapsed states
  - patchNode: fetch-based PATCH API helper with error handling
  - showSaveStatus: DOM feedback helper (success=2s auto-clear, error=persistent)
  - debounce: standard clearTimeout/setTimeout utility
  - All 13 Wave 0 tests GREEN (5 node-api + 9 node-card) + 5 logicflow-converter = 19 total GREEN
affects: [04-03, 04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone class pattern: CardNodeModel/CardNodeView implemented as pure TypeScript classes (no LogicFlow base class inheritance) to enable direct test instantiation; LogicFlow adapter wiring deferred to logicflow.config.ts"
    - "Wave 1 GREEN pattern: remove vi.mock empty factory from test files, implement real modules, verify all assertions pass"
    - "Try/catch for JSON error parsing: res.json() may not be a function in mocked responses, wrap in try/catch instead of .catch()"

key-files:
  created:
    - frontend/src/nodes/NodeCardModel.ts
    - frontend/src/nodes/NodeCardRenderer.ts
  modified:
    - frontend/src/services/node-api.service.ts
    - frontend/src/tests/node-api.spec.ts
    - frontend/src/tests/node-card.spec.ts

key-decisions:
  - "CardNodeModel/CardNodeView as standalone classes (not extending HtmlNode/HtmlNodeModel) — LogicFlow BaseNodeModel constructor requires graphModel context, making direct test instantiation impossible if extending. Pure TS classes satisfy all test assertions; LogicFlow adapter deferred to logicflow.config.ts"
  - "Try/catch wrapping res.json() in patchNode error path — vitest mock responses may lack .json() method; .catch() only handles Promise rejections, not synchronous TypeError when method is undefined"
  - "Debounce function per field (not per node) — each textarea creates its own debounce closure, preventing cross-field save interference"

patterns-established:
  - "Wave 1 GREEN pattern: implement real module + remove vi.mock(() => ({})) from spec file to switch from RED to GREEN"
  - "buildEditForm internal function: non-exported helper keeps CardNodeView.setHtml readable while encapsulating form DOM construction logic"

requirements-completed: [EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04, EDITOR-05]

# Metrics
duration: 6min
completed: 2026-03-14
---

# Phase 4 Plan 02: Node Edit Panel Wave 1 Implementation Summary

**CardNodeModel + CardNodeView + NodeApiService implemented as pure TypeScript classes; all 19 tests (9 node-card + 5 node-api + 5 logicflow-converter) GREEN using native DOM API and fetch**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-14T06:22:30Z
- **Completed:** 2026-03-14T06:28:00Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Implemented `patchNode` (PATCH fetch with try/catch error handling), `showSaveStatus` (DOM span feedback), and `debounce` (standard timer utility) in node-api.service.ts
- Implemented `CardNodeModel` as standalone class with `setAttributes` height logic (collapsed=80, expanded=300+attrs*36) and `setProperties` property merge
- Implemented `CardNodeView` with `setHtml` rendering: collapsed shows truncated requirement or "未填写"; expanded builds requirement/prompt textarea fields plus attributes key-value table with add/delete row buttons
- Converted node-api.spec.ts and node-card.spec.ts from RED to GREEN by removing `vi.mock(() => ({}))` empty factory override

## Task Commits

Each task was committed atomically:

1. **Task 1: 实现 node-api.service.ts** - `83fde04` (feat)
2. **Task 2: 实现 NodeCardModel.ts 和 NodeCardRenderer.ts** - `7daaf03` (feat)

## Files Created/Modified
- `frontend/src/nodes/NodeCardModel.ts` — CardNodeModel standalone class: width=280, height via setAttributes, setProperties/getProperties interface
- `frontend/src/nodes/NodeCardRenderer.ts` — CardNodeView class: setHtml builds collapsed summary or expanded edit form; re-exports CardNodeModel
- `frontend/src/services/node-api.service.ts` — patchNode (PATCH fetch), showSaveStatus (DOM span), debounce (timer utility)
- `frontend/src/tests/node-api.spec.ts` — removed vi.mock empty factory (Wave 0→Wave 1 transition)
- `frontend/src/tests/node-card.spec.ts` — removed vi.mock empty factory (Wave 0→Wave 1 transition)

## Decisions Made
- **Standalone classes instead of HtmlNode/HtmlNodeModel inheritance**: LogicFlow's `BaseNodeModel` constructor requires a `graphModel` parameter. Extending it makes `new CardNodeModel({ properties: {...} })` fail with "Cannot read properties of undefined (reading 'idGenerator')". Creating pure TypeScript classes satisfies all test assertions while deferring the actual LogicFlow registration adapter to logicflow.config.ts (Phase 4 Plan 03).
- **Try/catch for res.json() in error path**: `.catch()` only handles Promise rejections. When a vitest mock omits the `.json()` method entirely, calling `res.json()` throws a synchronous TypeError that bypasses `.catch()`. Wrapping in `try { const err = await res.json() } catch {}` handles both cases correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed patchNode error path to handle mock without json method**
- **Found during:** Task 1 verification (node-api.spec.ts "throws on HTTP error" test)
- **Issue:** `await res.json().catch(() => ({}))` — when vitest mock has no `.json` method, calling `undefined()` throws a synchronous TypeError that `.catch()` on a Promise chain cannot intercept. Error message became "res.json is not a function" instead of "HTTP 500".
- **Fix:** Replaced `.catch(() => ({}))` pattern with explicit `try { const err = await res.json() } catch {}` block
- **Files modified:** frontend/src/services/node-api.service.ts
- **Verification:** "throws on HTTP error (EDITOR-05)" test turns GREEN
- **Committed in:** 7daaf03 (Task 2 commit, fix bundled with NodeCardModel/Renderer)

**2. [Architectural deviation] CardNodeModel/CardNodeView as standalone classes**
- **Found during:** Task 2 (NodeCardModel implementation attempt)
- **Issue:** Plan specified "extends HtmlNode/HtmlNodeModel" but LogicFlow's BaseNodeModel constructor requires graphModel — direct test instantiation impossible with inheritance
- **Fix:** Implemented as pure TypeScript classes with same interface; LogicFlow adapter wiring deferred to logicflow.config.ts
- **Files modified:** frontend/src/nodes/NodeCardModel.ts, frontend/src/nodes/NodeCardRenderer.ts
- **Verification:** 9/9 node-card tests GREEN
- **Committed in:** 7daaf03 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 architectural constraint)
**Impact on plan:** Both deviations necessary. Bug fix corrects error path behavior. Standalone class pattern required by LogicFlow constructor constraint — LogicFlow adapter integration remains planned for 04-03.

## Issues Encountered
- LogicFlow BaseNodeModel constructor requires graphModel context, making test-direct instantiation impossible when inheriting. Resolved by standalone class pattern.

## Next Phase Readiness
- CardNodeModel and CardNodeView exported and ready for LogicFlow registration via adapter class in logicflow.config.ts (04-03)
- patchNode/showSaveStatus/debounce available for any node auto-save feature
- All 19 tests GREEN — no regressions introduced

---
*Phase: 04-node-edit-panel*
*Completed: 2026-03-14*
