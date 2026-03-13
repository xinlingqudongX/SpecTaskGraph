# Phase 3: Workflow Export - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

实现 `GET /api/v1/workflow/:projectId/export` 端点，返回 AI IDE 可直接消费的自包含工作流 JSON。包含拓扑排序、can_execute 标志、循环依赖检测。不涉及前端面板、状态可视化或任何新数据库表。

</domain>

<decisions>
## Implementation Decisions

### Dependency Source (边依赖来源)
- 从 `ProjectEntity.workflowJson` blob 中解析边（edge）数据，**不新增** EdgeEntity 表或迁移
- 每次 export 请求重新解析 blob —— 不做缓存（v2 FEAT-05 再做 ETag 优化）
- `dependencies[]` 方向：**incoming edges** —— 节点 B 的 dependencies 是 [A] 表示 A→B（A 必须先完成才能执行 B）
- 悬空边（edge 端点节点在 NodeMetadata 中不存在）：**静默跳过**，不影响 export 执行

### Node Coverage (导出节点范围)
- **只导出有 NodeMetadata 行的节点**（经过 sync 的节点），deletedAt IS NOT NULL 的行完全排除
- 未 sync 的画布节点对 AI 不可见
- `can_execute` 计算：依赖节点若不在本次 export 范围内（未 sync 或已删除），视为**已满足**（不阻塞执行）

### Export Envelope Shape (响应结构)
- 顶层字段：`projectId`、`projectName`、`exported_at`、`total_nodes`、`nodes[]`、`execution_order[]`、`executable_now[]`
- **不包含** status_summary 统计 —— AI 可自行从 nodes[] 派生
- `execution_order[]` 使用标准 Kahn 算法输出，同层级节点不做额外排序

### Error Handling (错误处理)
- `projectId` 不存在：HTTP **404 Not Found**
- `workflowJson` 为 null（画布从未保存）：返回 HTTP 200，空 export：`{ nodes: [], execution_order: [], executable_now: [], total_nodes: 0, ... }`
- 循环依赖：HTTP **422 Unprocessable Entity**，body 格式：
  ```json
  { "error": "Cyclic dependency detected", "cycle": ["nodeA", "nodeB", "nodeA"] }
  ```

### Claude's Discretion
- WorkflowExportService 具体实现结构（是否抽取独立 service 文件）
- Kahn 算法的具体实现细节
- 单元测试用例设计（循环检测、空图、孤立节点等）

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WorkflowController` (`src/node/workflow.controller.ts`): 已有 `@Controller('workflow')`，包含 `POST :projectId/sync` 端点 — 新增 `GET :projectId/export` 路由直接加在此控制器
- `NodeService` (`src/node/node.service.ts`): 已有 `InjectRepository(NodeMetadataEntity)` 和 EntityManager — export service 可复用相同注入模式
- `ProjectService` (`src/project/project.service.ts`): 用于查找 ProjectEntity（含 workflowJson blob）

### Established Patterns
- `@InjectRepository` + `EntityManager` 注入模式（NodeService 中已有）
- `NotFoundException` 用于 404 场景（NodeService.findNodeOrFail 模式）
- Zod DTOs via `createZodDto` —— 本 phase 无 request body，不需要 DTO
- 错误响应遵循 NestJS 默认异常格式（HttpException）

### Integration Points
- `WorkflowController` 新增 `@Get(':projectId/export')` 路由
- 需要 `ProjectService` 拿到 `workflowJson` 和 `projectName`
- 需要 `NodeMetadataRepository` 查询该 project 的非删除节点
- Kahn 算法逻辑建议放在独立 service（`WorkflowExportService`）或 controller 私有方法中

### NodeMetadataEntity Fields Available for Export
- `nodeId` (PK), `nodeType`, `requirement`, `prompt`, `attributes` (JSON), `status`, `deletedAt`

### workflowJson Edge Format (LogicFlow)
- `workflowJson.edges[]` 每条边包含 `sourceNodeId` 和 `targetNodeId`
- 解析时提取所有 `{ sourceNodeId, targetNodeId }` 对，构建邻接表

</code_context>

<specifics>
## Specific Ideas

- AI IDE 消费此端点时应能直接读 `executable_now[]` 拿到当前可执行的节点 ID，无需自己遍历 nodes[]
- 循环路径描述要对 AI IDE 可解析（数组格式），便于后续自动化处理

</specifics>

<deferred>
## Deferred Ideas

- ETag 缓存优化（减少 AI 频繁轮询的重复传输）— v2 FEAT-05
- status_summary 统计字段 — 用户决定不加，AI 自行派生

</deferred>

---

*Phase: 03-workflow-export*
*Context gathered: 2026-03-13*
