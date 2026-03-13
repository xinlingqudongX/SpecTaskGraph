# 工作区文件系统功能说明

## 概述

本项目实现了基于浏览器 File System Access API 的本地文件读写功能，允许用户直接在本地文件系统中编辑工作流图谱文件，无需后端数据库。

## 核心功能

### 1. 工作区管理 (WorkspaceManager.vue)

- 选择本地项目目录作为工作区
- 管理文件访问权限
- 查看最近使用的工作区
- 支持多个工作区切换

### 2. 文件浏览器 (FileBrowser.vue)

- 浏览工作区中的工作流文件
- 创建新的工作流文件
- 打开和编辑现有文件
- 删除文件

### 3. 文件系统服务 (filesystem.service.ts)

- 目录句柄管理（IndexedDB存储）
- 原子文件写入（临时文件 + 重命名）
- 自动备份机制
- 权限状态检查

### 4. 工作流管理服务 (workflow-manager.service.ts)

- 内存缓存管理
- 自动保存机制（防抖500ms）
- 变更追踪（dirty标记）
- 项目打开/保存/关闭

## 文件结构

```
项目根目录/
├── src/
│   └── data/
│       └── workflow/
│           ├── project-id.json      # 工作流图文件
│           ├── project-id.json.bak  # 备份文件
│           └── project-id.json.tmp  # 临时文件（写入时）
```

## 使用流程

### 1. 选择工作区

```typescript
// 用户点击"选择工作区"按钮
const handle = await fileSystemService.requestDirectoryAccess();
await fileSystemService.saveDirectoryHandle(projectId, handle);
```

### 2. 浏览文件

```typescript
// 获取工作流数据目录
const workflowDir = await getWorkflowDataDirectory(rootHandle);

// 遍历文件
for await (const entry of workflowDir.values()) {
  if (entry.kind === 'file' && entry.name.endsWith('.json')) {
    // 处理文件
  }
}
```

### 3. 读取文件

```typescript
// 读取工作流图
const graph = await fileSystemService.readWorkflowFile(projectId);
```

### 4. 写入文件

```typescript
// 保存工作流图（原子操作）
await fileSystemService.writeWorkflowFile(projectId, graph);
```

### 5. 自动保存

```typescript
// 启用自动保存（500ms防抖）
workflowManager.enableAutoSave(projectId, 500);

// 标记为有变更
workflowManager.markDirty(projectId);

// 自动保存会在500ms后触发
```

## 数据格式

### 工作流图 JSON 格式

```json
{
  "projectId": "my-project",
  "projectName": "我的项目",
  "version": "1.0.0",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "nodes": [
    {
      "nodeId": "start",
      "type": "start",
      "name": "开始",
      "instructions": {
        "guide": "项目起始节点",
        "logic": "定义项目流程",
        "criteria": "确保目标明确"
      },
      "dependencies": [],
      "assets": [],
      "outputs": [],
      "status": "pending",
      "position": { "x": 100, "y": 100 }
    }
  ],
  "edges": [],
  "settings": {
    "autoSave": true,
    "autoSaveInterval": 500,
    "enableBackup": true,
    "maxBackups": 5
  }
}
```

## 浏览器兼容性

File System Access API 支持情况：

- ✅ Chrome 86+
- ✅ Edge 86+
- ✅ Opera 72+
- ❌ Firefox（需要启用实验性功能）
- ❌ Safari（不支持）

## 权限管理

### 权限状态

- `granted`: 已授权，可以读写文件
- `denied`: 已拒绝，无法访问文件
- `prompt`: 待授权，需要用户确认

### 权限检查

```typescript
// 检查权限
const permission = await fileSystemService.checkPermission(handle);

if (permission !== 'granted') {
  // 请求权限
  const newPermission = await fileSystemService.requestPermission(handle);
}
```

## 错误处理

### 常见错误

1. **用户取消选择**
   ```
   错误: 用户取消了目录选择
   处理: 提示用户重新选择
   ```

2. **权限不足**
   ```
   错误: 文件访问权限不足
   处理: 请求用户重新授权
   ```

3. **文件不存在**
   ```
   错误: 工作流文件不存在
   处理: 提示用户创建新文件或从备份恢复
   ```

4. **磁盘空间不足**
   ```
   错误: 磁盘空间不足
   处理: 提示用户清理磁盘空间
   ```

## 安全性

### 文件访问限制

- 只能访问用户明确授权的目录
- 无法访问系统目录或其他敏感位置
- 权限在浏览器会话间持久化（IndexedDB）

### 数据完整性

- 原子写入操作（临时文件 + 重命名）
- 自动备份机制（.bak文件）
- JSON格式验证

## 性能优化

### 内存缓存

- 打开的项目缓存在内存中
- 避免频繁的文件IO操作
- 仅在数据变更时写入文件

### 防抖写入

- 自动保存使用500ms防抖
- 避免过于频繁的文件写入
- 减少磁盘IO开销

### 变更检测

- 深度比较数据是否真的变化
- 跳过无变更的保存操作
- 提高性能和用户体验

## 离线支持

### PWA 功能

- Service Worker 缓存应用资源
- 离线状态下完全可用
- 无需网络连接即可编辑

### 本地优先

- 所有数据存储在本地文件系统
- 无需数据库同步
- 支持 Git 版本控制

## 开发指南

### 添加新的文件操作

```typescript
// 1. 在 FileSystemService 中添加方法
public async customFileOperation(projectId: string): Promise<void> {
  const rootHandle = await this.loadDirectoryHandle(projectId);
  // 实现文件操作逻辑
}

// 2. 在 WorkflowManagerService 中封装业务逻辑
public async performCustomOperation(projectId: string): Promise<void> {
  // 添加缓存管理、错误处理等
  await this.fileSystemService.customFileOperation(projectId);
}

// 3. 在组件中调用
const result = await workflowManager.performCustomOperation(projectId);
```

### 测试文件系统功能

由于 File System Access API 是浏览器原生功能，建议：

1. 使用最新版 Chrome/Edge 浏览器
2. 在本地开发环境测试
3. 准备测试用的项目目录
4. 测试各种边界情况（权限拒绝、文件不存在等）

## 常见问题

### Q: 为什么选择 File System Access API 而不是数据库？

A: 
- 简化架构，无需后端数据库
- 支持离线工作
- 文件可以纳入 Git 版本控制
- 用户完全控制自己的数据

### Q: 如何处理多用户协同编辑？

A: 
- 使用 WebSocket 实时同步操作
- 文件系统仅用于持久化存储
- 协同功能不依赖文件系统

### Q: 如何备份数据？

A: 
- 自动备份到 .bak 文件
- 用户可以手动复制整个项目目录
- 支持导出为 JSON 文件

### Q: 浏览器不支持怎么办？

A: 
- 检测浏览器支持情况
- 提示用户使用支持的浏览器
- 或提供降级方案（如文件上传/下载）

## 未来改进

- [ ] 支持多文件批量操作
- [ ] 实现文件搜索功能
- [ ] 添加文件历史记录
- [ ] 支持文件导入/导出
- [ ] 实现文件对比功能
- [ ] 添加文件加密选项
