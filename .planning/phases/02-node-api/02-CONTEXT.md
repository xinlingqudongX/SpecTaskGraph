# Phase 2: Node API - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

实现所有节点级别的后端 API 端点：AI 元数据 CRUD、状态更新、执行历史记录/查询、画布同步。前端面板和状态可视化在后续阶段实现。

</domain>

<decisions>
## Implementation Decisions

### Sync 触发时机
- 每次自动保存（500ms 防抖）时同步触发 `POST /api/v1/workflow/:projectId/sync`
- 与现有 `WorkflowManagerService` 的保存逻辑集成，在同一防抖周期内调用
- sync 只 upsert 节点结构（nodeId、type、projectId），**跳过** status/requirement/prompt/attributes

### 状态转换规则
- **任意转换允许**：不设状态机限制，PATCH 可将状态设为枚举中任意值
- 状态枚举：`pending | completed | failed | review_needed`（来自 Phase 1 决策）
- 每次调用 `PATCH /api/v1/node/:id/status` 时，自动将当前 prompt+requirement 快照写入 history

### 执行历史身份
- `POST /api/v1/node/:id/history` 的 body 包含 `executedBy` 字段（字符串，如 `"claude-code"`）
- 无需认证，信任调用方自报身份
- body 还包含：`result`（执行结果描述）、`status`（执行后节点状态）

### API 路由设计
- `PATCH /api/v1/node/:id` — 更新 requirement/prompt/attributes（不改 status）
- `PATCH /api/v1/node/:id/status` — 仅更新 status，自动写入 history 快照
- `POST /api/v1/node/:id/history` — AI 手动记录执行结果
- `GET /api/v1/node/:id/history` — 返回历史记录，按 createdAt 倒序
- `POST /api/v1/workflow/:projectId/sync` — upsert 批量节点结构

### Claude's Discretion
- `GET /api/v1/node/:id/history` 的分页实现（默认返回最近 20 条）
- 错误响应格式（遵循 NestJS 默认异常格式）
- `PATCH /api/v1/node/:id` 响应体（返回更新后完整实体）

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProjectController` — 模式：`@Controller('project')`，`ZodValidationPipe` 校验参数，所有路由加 `api/v1` 前缀
- `ProjectService` — 模式：`@InjectRepository`，`persistAndFlush`，`assign(entity, updates)`，`NotFoundException`
- `CreateProjectDto` / `UpdateProjectDto` — 模式：`createZodDto(z.object({...}))`，所有 DTO 用 Zod schema 生成

### Established Patterns
- 控制器路由前缀在 `AppModule` 中配置（需确认 `api/v1` 前缀位置）
- MikroORM `em.assign()` + `persistAndFlush()` 用于更新
- `NotFoundException('message')` 用于 404 场景
- Zod DTOs 通过 `nestjs-zod` 的 `createZodDto` 创建

### Integration Points
- 新增 `src/node/` 模块：`NodeController`、`NodeService`、两个 entity
- `AppModule` 需导入 `NodeModule`
- `NodeService` 在 `PATCH status` 时需调用 `CollaborationGateway` 广播 `node:status:changed` 事件（WebSocket，Phase 5 实现；Phase 2 预留接口即可）
- sync 端点需要 `ProjectService` 验证 projectId 存在

</code_context>

<specifics>
## Specific Ideas

- `PATCH /node/:id/status` 的快照逻辑：先读当前 NodeMetadata 的 prompt+requirement，写入 NodeExecutionHistory，再更新 status
- history 记录字段：`id`、`nodeId`、`promptSnapshot`、`requirementSnapshot`、`result`、`executedBy`、`createdAt`

</specifics>

<deferred>
## Deferred Ideas

- API Key 认证 AI 执行者 — v2 (FEAT-04)
- history ETag 缓存优化 — v2 (FEAT-05)

</deferred>

---

*Phase: 02-node-api*
*Context gathered: 2026-03-13*
