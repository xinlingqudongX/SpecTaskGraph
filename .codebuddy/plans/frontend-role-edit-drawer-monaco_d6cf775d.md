---
name: frontend-role-edit-drawer-monaco
overview: 将前端角色编辑交互从列表内展开改为右侧 Element Plus 抽屉，并把角色提示词编辑区升级为 Monaco 编辑器，保持现有角色列表与保存/删除流程可用。
design:
  architecture:
    framework: vue
  styleKeywords:
    - 深色控制台
    - 右侧抽屉
    - 代码编辑感
    - 紧凑侧栏
    - 高对比层级
  fontSystem:
    fontFamily: Helvetica Neue
    heading:
      size: 22px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 13px
      weight: 400
  colorSystem:
    primary:
      - "#409EFF"
      - "#66B1FF"
      - "#337ECC"
    background:
      - "#1A1D27"
      - "#1E2235"
      - "#14172A"
    text:
      - "#E8EAF0"
      - "#C8D0E0"
      - "#5A6A82"
    functional:
      - "#67C23A"
      - "#F56C6C"
      - "#E6A23C"
      - "#409EFF"
todos:
  - id: review-impact
    content: 使用 [subagent:code-explorer] 复核角色编辑链路与缓存影响
    status: completed
  - id: build-monaco-editor
    content: 新建 MonacoPromptEditor 并引入 monaco-editor 依赖
    status: completed
    dependencies:
      - review-impact
  - id: refactor-role-manager
    content: 改造 AgentRoleManager 为右侧抽屉编辑并接入 Monaco
    status: completed
    dependencies:
      - build-monaco-editor
  - id: sync-role-cache
    content: 统一 agent-role-api 与 NodeCardRenderer 的角色缓存刷新
    status: completed
    dependencies:
      - refactor-role-manager
  - id: verify-role-ui
    content: 新增角色管理测试并执行 frontend 类型检查
    status: completed
    dependencies:
      - refactor-role-manager
      - sync-role-cache
---

## 用户需求

- 在前端角色管理中，改造“编辑已有角色”的交互方式。
- 点击角色后，不再在列表内联展开编辑，而是从页面右侧滑出独立编辑面板。
- 提示词输入区改为更适合长文本与结构化 Prompt 编写的编辑器样式。
- 角色的保存、删除、关闭反馈仍需保留，列表展示与当前页面结构保持可用。
- 当前重点是编辑流程；新增角色可继续沿用现有展示方式。

## 产品概览

- 角色列表继续留在左侧侧栏，负责浏览和选择角色。
- 选中角色后，右侧出现独立抽屉，集中展示名称、介绍、提示词和操作按钮。
- 视觉效果从“列表内展开”调整为“左侧列表 + 右侧编辑面板”，编辑区域更完整，列表更紧凑。

## 核心功能

- 从角色列表打开右侧抽屉，并回填当前角色数据
- 在抽屉中编辑名称、介绍和提示词后保存
- 使用更适合 Prompt 编辑的代码风格编辑区处理提示词
- 在抽屉内保留删除、取消、保存等操作，并在保存后同步列表显示

## 技术栈选型

- 现有前端：Vue 3 + TypeScript + Vite + Element Plus
- 新增编辑器能力：Monaco Editor，封装为本地可复用组件
- 现有校验方式：沿用 pnpm workspace 与 frontend 的 vue-tsc / Vitest 能力

## 实现方案

- 保持 App.vue 当前“左侧角色列表挂载在侧栏”结构不变，仅在 AgentRoleManager.vue 中把“编辑已有角色”的内联展开改为右侧抽屉，避免改动主布局和后端接口。
- 新增 MonacoPromptEditor.vue 作为轻量封装层，通过懒加载方式初始化 Monaco，仅在抽屉打开时挂载，减少首屏包体与非编辑场景开销；组件销毁时释放 editor/model，控制内存占用。
- 角色 CRUD 继续复用 agent-role-api.service.ts 现有接口；同时统一角色列表缓存策略，避免 NodeCardRenderer.ts 中的角色下拉继续显示旧名称或已删除角色。建议把角色列表缓存与失效入口收敛到 agent-role-api.service.ts，由角色管理与节点渲染共同复用。
- 保存与删除后的本地列表同步复杂度为 O(n)，n 为角色数；当前角色规模下可接受。主要性能风险来自 Monaco 体积与实例创建，使用懒加载、按需挂载和关闭即释放可有效降低影响。

## 实施说明

- 仅改造“编辑已有角色”，新增角色表单先保持现状，控制影响面。
- 抽屉打开时按当前角色初始化草稿；关闭时重置当前 roleId、草稿与编辑器状态，避免不同角色数据串写。
- Prompt 编辑区优先使用深色主题、自动换行、关闭小地图等轻量配置；若 Monaco 初始化失败，组件内应提供文本域兜底，避免编辑能力不可用。
- 继续沿用 ElMessage 与 ElMessageBox 反馈，不新增无关日志与全局状态。
- 不改动角色 API 契约，不涉及后端接口和 App.vue 挂载位置调整。

## 架构设计

- AgentRoleManager.vue：负责角色列表、抽屉开关、编辑草稿、保存/删除结果同步
- MonacoPromptEditor.vue：负责 Monaco 实例生命周期、v-model 同步、失败兜底
- agent-role-api.service.ts：负责角色 CRUD 与共享角色列表缓存/失效
- NodeCardRenderer.ts：消费共享角色列表，确保节点卡片中的角色选项与最新角色数据一致

数据流：
角色列表点击 → 打开右侧抽屉并回填草稿 → Monaco 编辑提示词 → 保存/删除调用角色 API → 更新本地 roles → 失效共享角色缓存 → 节点卡片下次渲染读取最新角色列表

## 目录结构

- `frontend/package.json` [MODIFY]  
新增 Monaco 相关依赖。保持前端 workspace 现有依赖管理方式，不引入与项目无关的额外 UI 框架。

- `frontend/src/components/AgentRoleManager.vue` [MODIFY]  
将现有列表内联展开编辑改为右侧抽屉编辑；保留角色列表、新增表单、刷新、保存、删除逻辑；处理抽屉状态、草稿初始化、关闭重置与用户反馈。

- `frontend/src/components/MonacoPromptEditor.vue` [NEW]  
封装 Prompt 编辑器，提供受控值同步、按需初始化、主题/选项配置、销毁清理以及失败兜底文本域，避免业务组件直接处理 Monaco 生命周期。

- `frontend/src/services/agent-role-api.service.ts` [MODIFY]  
补充共享角色列表缓存与失效方法，供角色管理和节点卡片统一使用；保持现有 REST 调用路径不变。

- `frontend/src/nodes/NodeCardRenderer.ts` [MODIFY]  
去掉局部角色缓存或改为使用共享缓存与失效入口，确保角色名称编辑、删除后，节点卡片中的角色下拉能读取新数据。

- `frontend/src/tests/agent-role-manager.spec.ts` [NEW]  
新增组件测试，覆盖抽屉打开、草稿回填、保存调用、删除确认后的列表同步，以及 Monaco 封装的挂载替身策略。

## 关键说明

- 不需要新增后端文件。
- 不建议引入新的状态管理方案；当前需求可由组件状态 + 现有 service 完成。
- 验证以 frontend 类型检查和前端测试为主，遵循项目“无需执行 eslint”的现有约定。

## 设计方案

沿用现有深色控制台风格，保留左侧角色列表的紧凑浏览体验，把编辑能力提升到页面右侧抽屉中完成。

### 页面结构

- 侧栏工具栏：保持“新增角色/刷新”位置不变，减少操作迁移成本。
- 角色列表区：列表项只展示摘要信息，hover 与当前编辑项高亮，不再撑开列表高度。
- 右侧抽屉头部：显示“编辑角色”、角色名、关闭操作，形成明确上下文。
- 基础信息区：名称与介绍采用纵向表单，间距紧凑，延续现有深色输入框风格。
- 提示词编辑区：Monaco 占据抽屉主体，使用深色主题、行号、自动换行，突出长文本编辑体验。
- 底部操作区：左侧删除，右侧取消/保存，主操作按钮高亮，危险操作弱分离但清晰可见。

### 交互与响应式

- 抽屉从页面右侧滑入，桌面端保持较宽编辑区，小屏时提升为接近全宽。
- 保存中按钮显示 loading，关闭抽屉后重置内容，避免残留草稿。
- Monaco 区域与表单区域形成明显层级，整体观感更像“配置面板”而非临时弹层。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 复核 frontend 中与角色编辑、Monaco 接入、角色缓存同步相关的受影响文件与调用链
- Expected outcome: 明确完整改动范围，避免遗漏 NodeCardRenderer 等依赖模块