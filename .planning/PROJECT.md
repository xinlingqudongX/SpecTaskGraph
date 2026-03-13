# FlowInOne

## What This Is

FlowInOne 是一个面向开发团队的 AI 驱动功能开发流水线工具。开发者通过可视化流程图编辑器将项目功能拆解为有依赖关系的节点，每个节点内嵌需求说明和 AI 提示词，系统导出标准化的 JSON Schema 工作流文件，AI IDE 读取后按依赖顺序自动实现功能，人工审核确认后完成交付。

## Core Value

用可视化工作流驱动 AI 并行实现功能——开发者设计一次流程，AI 按节点依次实现，人工逐节审核。

## Requirements

### Validated

- ✓ 可视化工作流编辑器（LogicFlow 画布） — existing
- ✓ 本地文件系统读写（File System Access API） — existing
- ✓ 基础节点类型（text, image, video, audio, file, decision, parallel） — existing
- ✓ WebSocket 实时协作 — existing
- ✓ NestJS 后端 + SQLite 项目元数据存储 — existing

### Active

- [ ] 节点内嵌 AI 内容字段：需求说明、提示词（Prompt）、属性数据
- [ ] 属性节点类型：支持结构化属性键值对（如表字段定义）
- [ ] 节点状态管理：pending / completed / failed / review_needed
- [ ] 节点状态 API：PATCH /api/v1/node/:id/status
- [ ] 节点执行历史 API：POST/GET /api/v1/node/:id/history（记录时间、AI执行者、结果）
- [ ] 工作流 JSON Schema 导出：AI 可解析的标准格式，包含节点内容、属性、依赖关系
- [ ] 人工审核工作流：审核通过→completed，拒绝→review_needed（可更新提示词后重新触发）
- [ ] 前端节点编辑面板：支持填写需求说明、提示词、属性数据
- [ ] 前端节点状态可视化：节点颜色/图标反映当前状态
- [ ] 前端执行历史查看：展示节点历次执行记录

### Out of Scope

- 节点加锁机制（运行中状态互斥） — 功能按节点划分，天然隔离，无需加锁
- AI 直接集成到应用内 — AI 通过外部 IDE 读取导出的 JSON 执行，不内嵌
- 移动端 — Web 优先
- 实时 AI 执行监控 — v1 使用轮询或手动刷新状态即可

## Context

- 项目已有完整的画布编辑器（LogicFlow 2.x）和协作后端
- 现有节点类型以媒体类型划分（文本、图片、视频等），v1 目标是在节点上叠加 AI 所需的元数据字段
- AI IDE（如 Claude Code、Cursor）通过调用导出的工作流 API 获取任务，完成后调用 history API 记录结果
- 工作流 JSON Schema 需要明确定义依赖关系（DAG），AI 按拓扑顺序决定可执行的节点

## Constraints

- **Tech Stack**: Vue 3 + LogicFlow 2.x（前端）、NestJS 11 + Fastify + SQLite（后端）— 保持现有栈
- **API 规范**: 所有后端接口前缀 `/api/v1`
- **文件格式**: 工作流导出为 `.json`，向后兼容现有 LogicFlow JSON 结构
- **存储**: 节点内容（含 AI 字段）持久化到后端 SQLite，保持本地文件作为工作流快照

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 不做节点加锁 | 功能节点天然隔离，无并发冲突 | — Pending |
| AI 字段叠加到现有节点类型 | 避免重构现有节点系统，复用画布能力 | — Pending |
| 执行历史存后端 | 本地文件只是快照，历史记录需要跨会话持久化 | — Pending |
| 工作流 JSON 独立导出端点 | AI IDE 通过 API 拉取，不依赖文件系统权限 | — Pending |

---
*Last updated: 2026-03-13 after initialization*
