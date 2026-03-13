# NodeMetadataEntity Schema Contract

This document is required by ROADMAP Phase 1 success criterion 4. It defines the authoritative schema for `NodeMetadataEntity` and enforces the architectural boundary between the backend AI-metadata store and the local workflow file format (`WorkflowGraph`).

See also: `src/node/entities/node-metadata.entity.ts`, `src/node/node-metadata.contract.spec.ts`

---

## nodeId is the Primary Key

- **Field:** `nodeId: string`
- **Constraint:** `@PrimaryKey()` — unique per row, never re-generated
- **Source:** The `nodeId` value is the LogicFlow canvas node ID, copied verbatim when the sync endpoint upserts a row. It is NEVER re-mapped, slugified, or replaced by a surrogate key.
- **Implication:** If the user renames a node on the canvas (changing its display label but not its ID), the existing `NodeMetadataEntity` row is preserved and all AI fields remain intact.

---

## Status is Backend-Only

- **Field:** `status: NodeStatus` — one of `'pending' | 'completed' | 'failed' | 'review_needed'`
- **Lives in:** `NodeMetadataEntity` table (SQLite, column `status`)
- **MUST NOT appear in:** `WorkflowGraph`, any local `.json` workflow file, or any frontend payload written by `WorkflowManagerService.saveProject`
- **Updated by:** Backend services only (node execution pipeline, review endpoints)
- **Read by:** Frontend via the sync/status API — never inferred from the local file

`running` and `skipped` are explicitly excluded from `NodeStatus`. The locked enum is:

```
pending | completed | failed | review_needed
```

---

## Sync Skips AI Fields

The sync endpoint (`POST /api/v1/node/sync` or equivalent) performs an `em.upsert()` that writes **only** the following fields from the incoming canvas payload:

| Written on sync | Source |
|---|---|
| `nodeId` | WorkflowGraph node `nodeId` |
| `project` (FK) | Route param / session |
| `nodeType` | WorkflowGraph node `type` |

The following fields are **explicitly excluded** from the upsert write set and MUST NOT be overwritten by any sync operation:

| Protected field | Reason |
|---|---|
| `status` | Set by execution pipeline; sync must not reset to `pending` |
| `requirement` | Human-authored; sync must not blank it |
| `prompt` | Human-authored; sync must not blank it |
| `attributes` | Key-value pairs set by AI/human review; sync must not clear them |
| `deletedAt` | Soft-delete marker; sync sets this only when nodeId is absent from canvas |

---

## WorkflowGraph Isolation

`WorkflowGraph` (the JSON saved to the user's local filesystem by `WorkflowManagerService`) intentionally does NOT carry:

- `status` as a top-level field on nodes (the canvas has a local display state, but it is not the AI execution status stored in `NodeMetadataEntity`)
- `requirement` as a top-level field (it lives inside `instructions.requirement` for canvas display; the backend `NodeMetadataEntity.requirement` is the authoritative value)
- `prompt` as a top-level field (same rule — lives inside `instructions.prompt`)
- `attributes` (purely backend concern)

This isolation guarantees that the auto-save path (`WorkflowManagerService.saveProject` → File System Access API → local `.json`) can never silently overwrite or corrupt backend AI metadata.

---

## Soft Delete

- **Field:** `deletedAt: Date | null` — nullable timestamp
- **Set by:** Sync endpoint when a `nodeId` that previously existed in the DB is absent from the current canvas payload; sets `deletedAt = now()`
- **Cleared by:** If the node reappears on the canvas (user undoes deletion), sync sets `deletedAt = null`
- **Export behavior:** The export endpoint filters out rows where `deletedAt IS NOT NULL` — soft-deleted nodes are excluded from the AI-readable export
- **Hard delete:** Not performed automatically; data is retained for audit and recovery purposes
