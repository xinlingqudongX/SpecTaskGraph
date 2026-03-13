# Phase 1: Data Model - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

创建 `NodeMetadataEntity` 和 `NodeExecutionHistoryEntity` 两张新数据库表，运行 MikroORM migration，修复 `logicflow-converter.ts` 中 AI 字段的 spread 运算符问题，锁定架构契约文档。画布渲染、API 端点、前端面板均在后续阶段实现。

</domain>

<decisions>
## Implementation Decisions

### 字段命名 (Instructions Fields)
- `NodeMetadataEntity` 使用 `requirement` (TEXT, NOT NULL, 默认空字符串) 和 `prompt` (TEXT, nullable) 两个字段
- 不使用现有 `workflow.schema.ts` 的三字段结构 (guide/logic/criteria)
- 同步更新 `workflow.schema.ts`：将 guide → requirement，logic → prompt，删除 criteria 字段
- `requirement` 在 DB 层 NOT NULL（默认 `""`），`prompt` 可为 NULL

### 数据迁移策略
- **按需创建**：首次 sync 时为画布上的节点 upsert NodeMetadata 行，不在 migration 中解析 workflowJson
- 新创建的 NodeMetadata 行默认：`requirement = ""`，`prompt = NULL`，`status = "pending"`
- sync 端点只写入 nodeId、projectId、type 等画布结构字段，**跳过** status、requirement、prompt、attributes（由前端面板或 AI 写入）

### 节点删除处理
- **Soft delete**：NodeMetadataEntity 加 `deletedAt` 字段（nullable DateTime）
- 画布 sync 时若画布已不含某节点 ID，设置 `deletedAt = now()`
- 导出端点过滤掉 `deletedAt IS NOT NULL` 的行

### NodeStatus 枚举
- 统一枚举：`pending | completed | failed | review_needed`（删除 `running`，新增 `review_needed`）
- 同步更新 `logicflow.types.ts` 的 `NodeStatus` 类型
- 遇到遗留 `running` 值（历史数据）：**自动重置为 pending**（在 sync/load 时处理）
- Canvas 颜色映射（在后续 Phase 5 实现，但此处锁定）：
  - `pending` → 灰色
  - `completed` → 绿色
  - `failed` → 红色
  - `review_needed` → 橙色/琅珀色

### Claude's Discretion
- `NodeExecutionHistoryEntity` 的精确字段排列（额外索引、排序键等）
- MikroORM migration 文件命名约定（遵循现有项目规范）
- `attributes` 字段的精确存储格式（JSON array `[{key, value}]` 与现有 property node 一致）

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProjectEntity` (src/project/entities/project.entity.ts): 展示了现有 MikroORM 实体模式 — `@Property({ type: 'json' })`，`onUpdate: () => new Date()`，string PK，nullable 字段用 `nullable: true`
- `mikro-orm.config.ts`: 手动注册实体数组，新实体需要显式加入 `entities: [...]`

### Established Patterns
- MikroORM 使用 `@Property({ type: 'json' })` 存储 JSON 字段（用于 `attributes`）
- `onUpdate: () => new Date()` 自动更新 `updatedAt` 字段
- 实体文件放在对应模块的 `entities/` 目录下

### Key Conflicts to Resolve
- `logicflow.types.ts` NodeStatus: `'pending' | 'running' | 'completed' | 'failed'` → 需改为 `'pending' | 'completed' | 'failed' | 'review_needed'`
- `workflow.types.ts` NodeType: `'start' | 'task' | 'decision' | 'parallel' | 'end'` — 与 canvas NodeType 不同，**不需要修改**，导出端点使用 LogicFlow canvas 类型
- `workflow.schema.ts` instructions `{ guide, logic, criteria }` → 需更新为 `{ requirement, prompt }`
- `logicflow-converter.ts` 的 spread `...nodeData.config` 会损坏数组类型字段 → `requirement`、`prompt`、`attributes` 必须加入 `standardProps` 排除集并显式映射

### Integration Points
- 新增 `NodeModule` 模块：`src/node/` 目录，包含 `node.controller.ts`、`node.service.ts`、`entities/node-metadata.entity.ts`、`entities/node-execution-history.entity.ts`
- `mikro-orm.config.ts` 的 `entities` 数组需加入两个新实体
- `frontend/src/types/logicflow.types.ts` 的 `NodeStatus` 类型需同步修改

</code_context>

<specifics>
## Specific Ideas

- `NodeMetadataEntity.nodeId` 使用 LogicFlow 生成的原始 ID（如 `text_uuid`）作为 PK，不做任何转换
- `projectId` 作为外键关联 `ProjectEntity`，便于按项目查询所有节点元数据
- `NodeExecutionHistoryEntity` 必须存储 `promptSnapshot` 和 `requirementSnapshot`（执行前的快照），供人工审核时比对历史

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-model*
*Context gathered: 2026-03-13*
