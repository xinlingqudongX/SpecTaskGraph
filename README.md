# FlowInOne

FlowInOne 是一个工作流程图编辑器，用于将业务功能拆解为有依赖关系的节点图谱，并导出为 AI 可消费的结构化数据。

## 业务概述

### 核心目标

- 将项目的功能与依赖关系抽象为工作流图谱（DAG/知识图谱）
- 前端基于 File System API 加载本地目录作为工作区，并将流程文档写回本地
- 后端负责数据记录与 AI 能力提供

### 用户角色

- 无需登录即可使用
- 主要面向开发人员、产品经理、业务架构师

### 核心业务流程

- 创建/管理项目，维护项目名称与更新时间
- 在画布上创建节点、配置节点属性、添加/删除节点
- 节点类型包括文本、音频、视频、文件资源等，可按子级扩展
- 通过连线定义节点依赖关系与执行顺序
- 导出结构化图数据供 AI 解析与执行

### 功能模块

- 画布编辑：拖拽、连线、分组、缩放、撤销/重做
- 节点配置面板：根据节点类型提供属性与输入输出配置
- 编译与导出：将画布 JSON 编译为图结构指令集
- 项目与协作：团队空间、版本控制、多角色协作

## 技术栈

- **后端**: NestJS + TypeScript
- **HTTP引擎**: Fastify
- **数据库**: SQLite + MikroORM (可选)
- **API文档**: Scalar API Reference
- **数据验证**: zod
- **前端框架**: Vue 3
- **前端流程图组件**: logicflow 参考：http://logicflow.cn/tutorial/about
- **包管理**: pnpm

## 快速开始

### 安装依赖

```bash
$ pnpm install
```

### 开发模式

```bash
# 开发模式
$ pnpm run start:dev

# Fastify开发模式
$ pnpm run start:fastify:dev
```

### 生产模式

```bash
# 生产模式
$ pnpm run start:prod

# Fastify生产模式
$ pnpm run start:fastify
```

## 功能特性

- ✅ 基于 Fastify 的高性能引擎
- ✅ 集成 Scalar API 文档生成
- ✅ MikroORM 数据库操作（可选）
- ✅ zod 数据验证
- ✅ 前端可视化流程图编辑与导出
- ✅ 完整的 TypeScript 支持
- ✅ 单元测试和端到端测试

## API文档

启动应用后，访问 [http://localhost:3000/api-reference](http://localhost:3000/api-reference) 查看交互式API文档。

## 开发工具

```bash
# 代码格式化
$ pnpm run format

# 类型检查
$ pnpm run type-check

# 运行测试
$ pnpm test

# 监听模式运行测试
$ pnpm run test:watch

# 生成测试覆盖率报告
$ pnpm run test:cov

# 调试模式运行测试
$ pnpm run test:debug

# 运行端到端测试
$ pnpm run test:e2e
```

## 项目结构

```
src/
├── project/               # 项目管理模块
│  └── entities/         # 项目相关实体
│       ├── project.entity.ts      # 项目实体
│      └── project-asset.entity.ts # 项目资产实体
├── workflow-graph/        #工流图模块
│   └── entities/         #工作流图相关实体
│       └── workflow-graph.entity.ts #工作流图实体
├── task-node/             # 任务节点模块
│   └── entities/         # 任务节点相关实体
│       ├── task-node.entity.ts    # 任务节点实体
│       └── task-output.entity.ts   # 任务产出实体
├── entities/              #基础数据库实体
│  └── user.entity.ts
├── services/              # 业务服务
│   └── user.service.ts
├── adapter-factory.ts     # HTTP适配器工厂
├── app.controller.spec.ts # 控制器测试
├── app.controller.ts      # 主控制器
├── app.module.ts          #根模块
├── app.service.ts         # 主服务
├── mikro-orm.config.ts    # MikroORM配置
├── mikro-orm.module.ts    # MikroORM模块
└── main.ts               #应用入口

frontend/                 # 前端工程（构建产物输出到 src/public）

doc/
├── 项目元数据.md          # 项目文档
└── 项目结构.md            # 详细项目结构文档
```

## 文档

- [详细项目文档](./doc/项目元数据.md) -包含完整的技术说明和配置指南
- [项目结构详细说明](./doc/项目结构说明.md) -包含各模块详细功能说明
- [数据库配置示例](./doc/数据库配置示例.md) - 如需启用数据库功能，请参考此指南
- [业务与功能需求](./doc/需求/业务与功能需求.md) - 业务目标与流程说明
- [技术栈与工程规范](./doc/需求/技术栈和工程规范.md) - 技术选型与目录约定

### 创建项目SKILL
```cmd
# 创建kiro的skills
mkdir -j .kiro/skills skills

# 创建qoder的skills
mkdir -j .qoder/skills skills

# 创建trae的skills
mkdir -j .trae/skills skills

```
