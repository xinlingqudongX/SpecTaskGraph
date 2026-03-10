# 文件系统访问服务

本模块实现了基于File System Access API的文件系统访问功能，为AI可访问的数据存储方案提供核心服务。

## 核心特性

- 🔐 **权限管理**: 完整的文件系统访问权限管理
- 💾 **原子写入**: 安全的文件写入策略，防止数据损坏
- 🔄 **自动备份**: 自动创建和管理备份文件
- 📊 **数据验证**: JSON格式验证和完整性检查
- ⚡ **性能优化**: 大文件处理和Web Worker支持
- 🛡️ **错误恢复**: 完善的错误处理和恢复机制

## 服务架构

```
FileSystemService (主服务)
├── FileOperationsService (文件操作)
├── PermissionManager (权限管理)
└── IndexedDB (目录句柄存储)
```

## 快速开始

### 1. 基本使用

```typescript
import { FileSystemService } from './services';

const fileService = FileSystemService.getInstance();

// 请求目录访问权限
const directoryHandle = await fileService.requestDirectoryAccess();

// 保存目录句柄
await fileService.saveDirectoryHandle('my-project', directoryHandle);

// 读取工作流文件
const workflowGraph = await fileService.readWorkflowFile('my-project');

// 写入工作流文件
await fileService.writeWorkflowFile('my-project', workflowGraph);
```

### 2. 权限管理

```typescript
import { PermissionManager } from './services';

const permissionManager = PermissionManager.getInstance();

// 检查权限状态
const state = await permissionManager.getPermissionState('my-project');

// 监听权限变更
const unsubscribe = permissionManager.onPermissionChange((event) => {
  console.log(`权限变更: ${event.oldState} -> ${event.newState}`);
});

// 检查权限前置条件
await permissionManager.checkPermissionPrerequisite('my-project');
```

### 3. 高级文件操作

```typescript
import { FileOperationsService } from './services';

const fileOps = FileOperationsService.getInstance();

// 原子写入文件
const result = await fileOps.atomicWrite(
  directoryHandle,
  'data.json',
  jsonContent,
  {
    createBackup: true,
    validateJson: true,
    useWorker: true
  }
);

// 安全读取文件（包含错误恢复）
const content = await fileOps.safeReadFile(
  directoryHandle,
  'data.json',
  { validateJson: true }
);
```

## 服务详解

### FileSystemService

主要的文件系统访问服务，提供以下功能：

#### 目录管理
- `requestDirectoryAccess()`: 请求目录访问权限
- `saveDirectoryHandle()`: 保存目录句柄到IndexedDB
- `loadDirectoryHandle()`: 从IndexedDB加载目录句柄
- `revokeDirectoryAccess()`: 撤销目录访问权限

#### 文件操作
- `readWorkflowFile()`: 读取工作流图文件
- `writeWorkflowFile()`: 写入工作流图文件（原子操作）
- `createBackup()`: 创建备份文件
- `restoreFromBackup()`: 从备份文件恢复

#### 权限检查
- `checkPermission()`: 检查目录句柄权限状态
- `requestPermission()`: 请求目录句柄权限

### FileOperationsService

提供高级文件操作功能：

#### 原子写入
- 临时文件 -> 验证 -> 备份 -> 重命名
- 确保写入过程中断时原文件保持不变
- 支持大文件处理和Web Worker

#### 安全读取
- 主文件读取失败时自动尝试备份恢复
- JSON格式验证
- 完整性检查

#### 实用工具
- `formatJson()`: JSON格式化（字段排序、缩进）
- `fileExists()`: 检查文件是否存在
- `copyFile()`: 复制文件
- `deleteFile()`: 删除文件

### PermissionManager

权限管理服务：

#### 权限监控
- 定期检查权限状态
- 权限变更事件通知
- 权限状态缓存

#### 权限操作
- 权限状态查询
- 权限请求
- 权限撤销

#### 装饰器支持
- `@requirePermission`: 方法级权限检查装饰器

## 错误处理

系统定义了完整的错误类型：

- `PermissionError`: 权限相关错误
- `FileIOError`: 文件IO错误
- `ParseError`: 解析错误
- `ValidationError`: 数据验证错误
- `NetworkError`: 网络错误

每种错误都包含详细的上下文信息和处理建议。

## 性能优化

### 大文件处理
- 文件大小超过1MB时自动使用Web Worker
- 防抖写入机制（500ms延迟）
- 内存缓存管理

### 原子操作
- 临时文件策略防止数据损坏
- 备份机制确保数据安全
- 完整性验证确保数据正确

## 浏览器兼容性

需要浏览器支持以下API：
- File System Access API
- IndexedDB
- Web Workers（可选，用于大文件处理）

### 支持的浏览器
- Chrome 86+
- Edge 86+
- Opera 72+

### 检查支持性
```typescript
if (PermissionManager.isFileSystemAccessSupported()) {
  // 浏览器支持File System Access API
} else {
  // 提供降级方案
}
```

## 演示和测试

### 运行演示
```typescript
import { FileSystemDemo } from './services/demo';

const demo = new FileSystemDemo();

// 完整工作流演示
await demo.demonstrateWorkflow();

// 错误处理演示
await demo.demonstrateErrorHandling();

// 性能测试演示
await demo.demonstratePerformance();
```

### 单元测试
```bash
npm test src/services/__tests__/
```

## 最佳实践

### 1. 权限管理
- 始终在文件操作前检查权限
- 监听权限变更事件
- 提供友好的权限请求界面

### 2. 错误处理
- 使用try-catch包装所有文件操作
- 提供备份恢复机制
- 记录详细的错误日志

### 3. 性能优化
- 对大文件启用Web Worker处理
- 使用防抖机制减少写入频率
- 合理使用缓存机制

### 4. 数据安全
- 启用自动备份
- 使用原子写入策略
- 验证JSON格式和完整性

## 配置选项

### 文件操作选项
```typescript
interface FileOperationOptions {
  createBackup?: boolean;     // 是否创建备份
  validateJson?: boolean;     // 是否验证JSON格式
  timeout?: number;          // 写入超时时间
  useWorker?: boolean;       // 是否使用Web Worker
}
```

### 工作流设置
```typescript
interface WorkflowSettings {
  autoSave: boolean;         // 是否启用自动保存
  autoSaveInterval: number;  // 自动保存间隔（毫秒）
  enableBackup: boolean;     // 是否启用备份
  maxBackups: number;        // 最大备份数量
}
```

## 故障排除

### 常见问题

1. **权限被拒绝**
   - 检查浏览器是否支持File System Access API
   - 确认用户已授权目录访问
   - 检查目录是否仍然存在

2. **文件写入失败**
   - 检查磁盘空间是否充足
   - 确认文件未被其他程序锁定
   - 验证JSON数据格式是否正确

3. **备份恢复失败**
   - 检查备份文件是否存在
   - 验证备份文件格式是否正确
   - 确认权限状态正常

### 调试技巧

1. 启用详细日志
2. 检查浏览器开发者工具的控制台
3. 使用演示模式测试功能
4. 检查IndexedDB中的数据

## 更新日志

### v1.0.0
- 初始版本发布
- 实现基础文件系统访问功能
- 添加权限管理系统
- 实现原子写入和备份机制
- 添加完整的错误处理
- 提供演示和测试代码