# Requirements: FlowInOne

**Defined:** 2026-03-13
**Core Value:** 用可视化工作流驱动 AI 并行实现功能——开发者设计一次流程，AI 按节点依次实现，人工逐节审核。

## v1 Requirements

### Data Model

- [x] **DATA-01**: 创建 `NodeMetadataEntity`，字段：nodeId (PK, 对应 LogicFlow node id)、requirement (TEXT)、prompt (TEXT)、attributes (JSON)、status (ENUM: pending/completed/failed/review_needed)、projectId (FK)
- [x] **DATA-02**: 创建 `NodeExecutionHistoryEntity`，字段：id、nodeId (FK)、promptSnapshot (TEXT)、requirementSnapshot (TEXT)、result (TEXT)、executedAt、createdBy
- [x] **DATA-03**: 生成并运行 MikroORM 迁移脚本，创建 `node_metadata` 和 `node_execution_history` 两张表
- [ ] **DATA-04**: 确定规范：节点状态仅存储于 `NodeMetadataEntity`，不写入 `ProjectEntity.workflowJson` blob；sync 端点跳过 status/requirement/prompt 字段覆盖
- [ ] **DATA-05**: 修复 `logicflow-converter.ts` 中的 spread 运算符问题，将 AI 字段（requirement、prompt、attributes）加入 `standardProps` 排除集，并在两个方向的转换函数中显式映射

### Node API

- [ ] **API-01**: `PATCH /api/v1/node/:id` — 更新节点 AI 元数据（requirement、prompt、attributes），不影响 status
- [ ] **API-02**: `PATCH /api/v1/node/:id/status` — 更新节点状态（pending/completed/failed/review_needed），写入时快照当前 prompt 和 requirement 到 history 记录
- [ ] **API-03**: `POST /api/v1/node/:id/history` — AI 代理执行完成后记录执行结果（result、executedAt、createdBy）
- [ ] **API-04**: `GET /api/v1/node/:id/history` — 获取节点历史执行记录列表（按时间倒序）
- [ ] **API-05**: `POST /api/v1/workflow/:projectId/sync` — 将画布节点结构同步到 `NodeMetadataEntity`（upsert；跳过 status、requirement、prompt、attributes 字段）

### Workflow Export

- [ ] **EXPORT-01**: `GET /api/v1/workflow/:projectId/export` — 返回 AI 可解析的工作流 JSON，合并画布拓扑与 NodeMetadataEntity 数据
- [ ] **EXPORT-02**: 导出 JSON 中每个节点包含：nodeId、type、requirement、prompt、attributes、status、dependencies[]
- [ ] **EXPORT-03**: 导出 JSON 中每个节点包含 `can_execute` 布尔值（依赖节点全部为 completed 时为 true）
- [ ] **EXPORT-04**: 导出 JSON 包含顶层 `execution_order` 数组（服务端 Kahn 算法预计算拓扑排序）
- [ ] **EXPORT-05**: 导出 JSON 包含顶层 `executable_now` 数组（当前 can_execute=true 的节点 ID 列表）
- [ ] **EXPORT-06**: 导出端点检测循环依赖（cyclic DAG），存在时返回 422 错误及循环路径描述

### Frontend Edit Panel

- [ ] **EDITOR-01**: 新建 `NodeEditPanel.vue` 组件，点击节点时从右侧滑入显示
- [ ] **EDITOR-02**: 面板包含 requirement 文本域（多行），展示/编辑需求说明
- [ ] **EDITOR-03**: 面板包含 prompt 文本域（多行），展示/编辑 AI 提示词
- [ ] **EDITOR-04**: 面板包含 attributes 键值对表格，支持动态增删行
- [ ] **EDITOR-05**: 面板保存按钮调用 `PATCH /api/v1/node/:id`，保存成功后显示反馈

### Status Visualization

- [ ] **VISUAL-01**: 节点边框颜色反映状态：灰色(pending)、绿色(completed)、红色(failed)、橙色(review_needed)
- [ ] **VISUAL-02**: 画布加载时调用导出端点，对所有节点应用 `lf.setProperties(nodeId, { status })` 初始化颜色
- [ ] **VISUAL-03**: WebSocket 接收 `node:status:changed` 事件后实时更新画布节点颜色，无需刷新页面

### Review Workflow

- [ ] **REVIEW-01**: `NodeEditPanel` 中显示"审核通过"按钮，点击调用 `PATCH /api/v1/node/:id/status` 设为 completed
- [ ] **REVIEW-02**: "拒绝"按钮触发输入拒绝原因（必填），调用接口将状态设为 review_needed 并记录原因
- [ ] **REVIEW-03**: review_needed 状态下可修改 prompt，保存后重置状态为 pending（支持 AI 重新执行）
- [ ] **REVIEW-04**: 面板底部显示执行历史列表（最近 5 条），每条展示：时间、执行者、结果摘要

## v2 Requirements

### Advanced Features

- **FEAT-01**: 执行历史 diff 视图（对比两次 prompt 快照的差异）
- **FEAT-02**: 节点 AI 字段批量导入/导出（CSV/JSON）
- **FEAT-03**: DAG 完整度评分（已填写 requirement+prompt 的节点比例）
- **FEAT-04**: AI 代理身份认证（API Key 机制，区分不同 AI 执行者）
- **FEAT-05**: 导出端点 ETag 缓存优化（AI 代理轮询时减少重复传输）

## Out of Scope

| Feature | Reason |
|---------|--------|
| 节点加锁机制（running 状态互斥） | 功能按节点划分天然隔离，v1 无需加锁 |
| AI 直接内嵌到应用内执行 | AI 通过外部 IDE 读取导出 JSON 执行，不内嵌 |
| criteria（验收标准）字段 | v1 由 requirement 覆盖，v2 再分离 |
| 移动端/响应式布局 | Web 桌面优先 |
| 实时 AI 执行进度监控 | v1 使用状态轮询或 WebSocket 推送即可 |
| 多 AI 代理协调（claimed_by） | 无并发冲突，不需要 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| API-04 | Phase 2 | Pending |
| API-05 | Phase 2 | Pending |
| EXPORT-01 | Phase 3 | Pending |
| EXPORT-02 | Phase 3 | Pending |
| EXPORT-03 | Phase 3 | Pending |
| EXPORT-04 | Phase 3 | Pending |
| EXPORT-05 | Phase 3 | Pending |
| EXPORT-06 | Phase 3 | Pending |
| EDITOR-01 | Phase 4 | Pending |
| EDITOR-02 | Phase 4 | Pending |
| EDITOR-03 | Phase 4 | Pending |
| EDITOR-04 | Phase 4 | Pending |
| EDITOR-05 | Phase 4 | Pending |
| VISUAL-01 | Phase 5 | Pending |
| VISUAL-02 | Phase 5 | Pending |
| VISUAL-03 | Phase 5 | Pending |
| REVIEW-01 | Phase 6 | Pending |
| REVIEW-02 | Phase 6 | Pending |
| REVIEW-03 | Phase 6 | Pending |
| REVIEW-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation — phase assignments confirmed*
