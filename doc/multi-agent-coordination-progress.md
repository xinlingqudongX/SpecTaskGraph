# 多 Agent 协作等待机制 — 进展文档

> 最后更新：2026-04-02 11:21

## 任务背景
当多个 Agent 通过 MCP 协作完成一个大项目时，Agent A 不会等待 Agent B 的前置任务完成就直接执行，且角色提示词 (rolePrompt) 被 Agent 当作数据忽略。

## 已完成的改动

### ✅ 阶段 1：依赖感知 + 服务端长轮询（`mcp.service.ts`）

1. **新增依赖等待常量**：
   - `DEP_WAIT_MAX_MS = 120_000`（依赖等待最长 2 分钟）
   - `DEP_WAIT_POLL_MS = 3_000`（每 3 秒检查一次）

2. **新增 `classifyTasksByDependency()` 私有方法**：
   - 批量查询依赖节点状态
   - 将 pending 任务分为 `ready`（可执行）和 `blocked`（被依赖阻塞）

3. **改造 `get_pending_tasks`**：
   - 第一级轮询（已有）：等待 pending 任务出现（15 秒）
   - **新增第二级轮询**：当 ready 为空但 blocked 不为空时，长轮询等待依赖完成（最长 120 秒）
   - 返回结构增加 `blockedTasks`、`depWaitedMs`、`depTimedOut` 字段
   - 返回结构增加 `roleInstructions` 字段，将角色提示词从被动数据提升为主动执行指令
   - `nextStep` 引导根据依赖状态和角色状态动态生成

### ✅ 阶段 2：改造 `declare_intent`（`mcp.service.ts`）

1. **依赖未满足时返回结构化 `blocked` 响应**（而非抛出 Error）：
   - 返回 `{ blocked: true, taskId, blockingDependencies, message }`
   - `nextStep` 明确引导调用 `get_pending_tasks` 等待

2. **新增 `roleInstruction` 字段**：
   - 当节点绑定角色时，返回 `roleInstruction`：`【强制执行指令】你现在必须以「角色名」的身份执行此任务...`
   - `nextStep` 根据是否有角色动态生成，有角色时强调必须遵守

### ✅ 阶段 3：提示词强化（`mcp.contain.ts`）

1. **`toolPrompt`（单节点执行 SOP）**：
   - 字段语义约束中强化：`rolePrompt` 是执行指令而非参考信息
   - Step 4 增加：选择有角色的任务时必须在 intent 中声明角色身份
   - Step 5 增加：代码实现必须遵守角色提示词全部约束

2. **`multiAgentProtocolPrompt`（多 Agent 协作协议）**：
   - 新增 **Rule 5 — 自律等待（依赖感知）**
   - 新增 **Rule 6 — 角色遵守（强制执行）**

3. **`aiIdeTaskProtocolPrompt`（MCP 联动指南）**：
   - 获取任务部分：增加 `tasks`/`blockedTasks` 分类说明和依赖等待机制
   - 协作执行部分：增加 `blocked: true` 处理、`roleInstruction` 强制遵守

## TypeScript 编译状态
✅ `npx tsc --noEmit` 通过，无报错

## 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/mcp/mcp.service.ts` | 修改 | 依赖分类、长轮询、blocked 响应、roleInstruction |
| `src/mcp/mcp.contain.ts` | 修改 | 提示词强化角色遵守和依赖等待 |

## 未改动（不需要改）

- 数据库结构 / Entity — 无变更
- `node.service.ts` — 无变更
- `mcp-session.service.ts` — 无变更
- Schema 定义 — 无新增工具，仅增强现有返回结构
