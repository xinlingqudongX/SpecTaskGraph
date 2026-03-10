# 工作流图谱数据格式说明 - AI读取指南

## 概述

本文档为AI代理提供工作流图谱数据的读取指南。工作流图谱数据以JSON格式存储在本地文件系统中，AI可以直接读取这些文件来理解项目结构和任务执行流程。

## 文件位置

### 配置文件
- **路径**: `./.kiro/config.json`
- **用途**: 记录当前活动项目信息
- **格式**: 
```json
{
  "currentProject": "项目ID",
  "workflowPath": "./src/data/workflow/项目ID.json",
  "schemaVersion": "1.0.0",
  "lastModified": "2024-01-15T10:30:00.000Z"
}
```

### 工作流图文件
- **路径**: `./src/data/workflow/{projectId}.json`
- **用途**: 存储完整的工作流图谱数据
- **格式**: 遵循本文档定义的JSON Schema

### Schema文件
- **路径**: `./src/schemas/schema.json`
- **用途**: 数据结构规范定义
- **格式**: JSON Schema Draft 2020-12

## 数据结构说明

### 顶层结构

```json
{
  "projectId": "项目唯一标识符",
  "projectName": "项目名称",
  "version": "1.0.0",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "nodes": [...],
  "edges": [...],
  "settings": {...}
}
```

### 任务节点结构 (TaskNode)

每个任务节点包含以下关键信息：

```json
{
  "nodeId": "task-001",
  "type": "task",
  "name": "实现用户认证",
  "description": "实现JWT基础的用户认证系统",
  "instructions": {
    "guide": "任务的总体指导说明",
    "logic": "具体的执行步骤和逻辑",
    "criteria": "任务完成的验收标准"
  },
  "dependencies": ["task-000"],
  "assets": [
    {
      "assetId": "asset-001",
      "path": "./src/auth/auth.service.ts",
      "role": "output",
      "description": "认证服务实现文件"
    }
  ],
  "outputs": [
    {
      "outputId": "output-001",
      "name": "认证服务",
      "type": "file",
      "path": "./src/auth/auth.service.ts"
    }
  ],
  "status": "pending",
  "position": { "x": 100, "y": 200 },
  "metadata": {}
}
```

### 连接关系结构 (Edge)

```json
{
  "edgeId": "edge-001",
  "source": "task-000",
  "target": "task-001",
  "type": "sequence",
  "condition": null,
  "label": "完成后执行"
}
```

## 节点类型说明

- **start**: 起始节点，标记工作流开始
- **task**: 普通任务节点，包含具体的执行任务
- **decision**: 决策节点，根据条件选择执行路径
- **parallel**: 并行节点，可以同时执行多个分支
- **end**: 结束节点，标记工作流完成

## 节点状态说明

- **pending**: 待执行
- **running**: 执行中
- **completed**: 已完成
- **failed**: 执行失败
- **skipped**: 已跳过

## AI读取建议

### 1. 读取流程

1. **读取配置**: 首先读取 `./.kiro/config.json` 获取当前项目信息
2. **读取工作流**: 根据配置中的 `workflowPath` 读取工作流图文件
3. **验证数据**: 可选择读取Schema文件进行数据验证
4. **解析结构**: 解析节点和边的关系，构建执行图

### 2. 关键信息提取

- **项目概览**: 从 `projectName` 和顶层 `description` 了解项目目标
- **任务列表**: 遍历 `nodes` 数组获取所有任务
- **执行顺序**: 通过 `dependencies` 和 `edges` 确定任务执行顺序
- **文件关联**: 通过 `assets` 了解任务相关的文件
- **执行状态**: 通过 `status` 了解任务当前状态

### 3. 依赖关系分析

```javascript
// 示例：查找节点的前置依赖
function findDependencies(nodeId, graph) {
  const node = graph.nodes.find(n => n.nodeId === nodeId);
  return node ? node.dependencies : [];
}

// 示例：查找节点的后续任务
function findSuccessors(nodeId, graph) {
  return graph.nodes.filter(node => 
    node.dependencies.includes(nodeId)
  );
}
```

### 4. 执行路径规划

AI可以根据依赖关系构建任务执行的拓扑排序：

1. 找到所有没有依赖的起始节点
2. 按依赖关系逐层展开
3. 识别可以并行执行的任务
4. 构建完整的执行计划

## 数据完整性检查

AI在读取数据时应该验证：

1. **引用完整性**: 所有 `dependencies` 中的节点ID都存在于 `nodes` 中
2. **边的有效性**: 所有 `edges` 的 `source` 和 `target` 都指向有效节点
3. **循环依赖**: 检查依赖关系中是否存在循环
4. **孤立节点**: 识别没有任何连接的节点

## 错误处理

如果遇到以下情况，AI应该：

1. **文件不存在**: 提示用户检查项目配置
2. **JSON格式错误**: 提示数据文件可能损坏
3. **Schema不匹配**: 提示数据格式版本不兼容
4. **引用错误**: 提示数据完整性问题

## 示例代码

```javascript
// AI读取工作流图的示例代码
async function readWorkflowGraph() {
  try {
    // 1. 读取配置
    const config = JSON.parse(
      await fs.readFile('./.kiro/config.json', 'utf8')
    );
    
    // 2. 读取工作流图
    const graph = JSON.parse(
      await fs.readFile(config.workflowPath, 'utf8')
    );
    
    // 3. 基本验证
    if (!graph.nodes || !Array.isArray(graph.nodes)) {
      throw new Error('无效的工作流图格式');
    }
    
    // 4. 分析任务结构
    const pendingTasks = graph.nodes.filter(n => n.status === 'pending');
    const readyTasks = pendingTasks.filter(n => 
      n.dependencies.every(depId => 
        graph.nodes.find(dep => dep.nodeId === depId)?.status === 'completed'
      )
    );
    
    console.log(`项目: ${graph.projectName}`);
    console.log(`总任务数: ${graph.nodes.length}`);
    console.log(`待执行任务: ${pendingTasks.length}`);
    console.log(`可立即执行: ${readyTasks.length}`);
    
    return graph;
  } catch (error) {
    console.error('读取工作流图失败:', error.message);
    throw error;
  }
}
```

## 版本兼容性

当前Schema版本: **1.0.0**

AI在读取数据时应该检查 `version` 字段，确保兼容性。如果版本不匹配，可能需要：

1. 提示用户升级数据格式
2. 使用兼容模式读取
3. 建议使用对应版本的工具

## 更新通知

工作流图文件的 `updatedAt` 字段记录了最后修改时间。AI可以：

1. 监控文件变化
2. 缓存读取结果
3. 在文件更新时重新加载
4. 提供增量更新机制

---

**注意**: 本文档随系统版本更新，请确保使用最新版本的读取指南。