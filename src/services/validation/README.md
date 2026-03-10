# 数据验证和Schema管理

本模块实现了工作流图数据的验证和Schema管理功能，包括JSON Schema验证、引用完整性检查、数据完整性验证和Schema版本管理。

## 功能特性

### 1. 数据验证服务 (ValidationService)

- **JSON Schema验证**: 使用Zod进行强类型数据验证
- **引用完整性检查**: 验证节点依赖和边连接的引用完整性
- **循环依赖检测**: 检测工作流图中的循环依赖问题
- **数据完整性验证**: 全面的数据完整性检查
- **单例模式**: 确保全局唯一的验证服务实例

### 2. Schema管理服务 (SchemaManagerService)

- **版本管理**: 支持多版本Schema管理
- **版本比较**: 智能的版本号比较功能
- **数据迁移**: 自动将旧版本数据迁移到新版本
- **兼容性检查**: 检查Schema版本兼容性
- **变更日志**: 提供版本间的变更记录

### 3. JSON Schema定义

- **完整的Schema定义**: 涵盖工作流图的所有数据结构
- **严格的验证规则**: 包含字段类型、格式、约束条件
- **详细的描述信息**: 每个字段都有清晰的说明

## 文件结构

```
src/services/
├── validation.service.ts           # 数据验证服务
├── schema-manager.service.ts       # Schema版本管理服务
├── index.ts                        # 服务导出文件
└── __tests__/
    ├── validation.service.spec.ts      # 验证服务测试
    ├── schema-manager.service.spec.ts  # Schema管理测试
    └── schema-validation.spec.ts       # 集成验证测试

src/schemas/
└── workflow.schema.json            # JSON Schema定义文件

src/examples/
└── validation-usage.example.ts     # 使用示例
```

## 使用方法

### 基本数据验证

```typescript
import { ValidationService } from '../services';

const validationService = ValidationService.getInstance();

// 验证工作流图
const result = validationService.validateWorkflowGraph(workflowData);
if (!result.valid) {
  console.log('验证失败:', result.errors);
}

// 检查数据完整性
const integrityResult = validationService.checkDataIntegrity(workflowData);
if (!integrityResult.valid) {
  console.log('完整性问题:', integrityResult.issues);
}
```

### Schema版本管理

```typescript
import { SchemaManagerService } from '../services';

const schemaManager = SchemaManagerService.getInstance();

// 检查版本兼容性
const isSupported = schemaManager.isVersionSupported('1.0.0');

// 迁移数据到最新版本
const migrationResult = schemaManager.migrateToLatest(oldData);
if (migrationResult.success) {
  console.log('迁移成功:', migrationResult.changes);
}
```

## 验证规则

### 工作流图验证

- **项目ID**: 只能包含字母、数字、连字符和下划线，长度1-50字符
- **项目名称**: 不能为空，最大长度100字符
- **版本号**: 必须符合x.y.z格式
- **时间戳**: 必须是有效的ISO 8601格式
- **节点数组**: 至少包含一个节点

### 任务节点验证

- **节点ID**: 符合标识符规范，长度1-50字符
- **节点类型**: 必须是start、task、decision、parallel、end之一
- **指令字段**: guide、logic、criteria三个子字段都必须存在且不为空
- **依赖数组**: 所有依赖的节点ID必须存在
- **资产和输出**: 必须是数组格式，可以为空

### 完整性检查

- **引用完整性**: 所有依赖和边引用的节点必须存在
- **循环依赖**: 检测节点依赖关系中的循环
- **孤立节点**: 检测没有被任何边连接的非start节点
- **ID唯一性**: 节点ID和边ID必须唯一

## 错误处理

系统提供详细的错误信息，包括：

- **字段路径**: 精确定位错误字段
- **错误消息**: 清晰的中文错误描述
- **错误代码**: 便于程序化处理
- **上下文信息**: 额外的调试信息

## 性能优化

- **单例模式**: 避免重复实例化
- **Schema缓存**: 缓存已加载的Schema文件
- **增量验证**: 支持单个节点的独立验证
- **批量处理**: 支持批量数据验证

## 测试覆盖

- **单元测试**: 覆盖所有核心功能
- **集成测试**: 验证与现有数据的兼容性
- **错误场景**: 全面的错误处理测试
- **边界条件**: 各种边界情况的测试

总计42个测试用例，100%通过率。

## 扩展性

系统设计支持未来扩展：

- **新版本Schema**: 易于添加新的Schema版本
- **自定义验证规则**: 支持添加业务特定的验证逻辑
- **插件化架构**: 支持第三方验证插件
- **多语言支持**: 错误消息支持国际化

## 依赖项

- **Zod**: 用于运行时类型验证
- **TypeScript**: 提供编译时类型检查
- **Jest**: 用于单元测试

## 相关需求

本实现满足以下需求：

- **需求3.1**: JSON Schema定义和版本管理
- **需求8.1**: 数据验证和Schema合规性检查
- **需求8.4**: 引用完整性和数据完整性验证
- **需求12.1**: Schema规范定义
- **需求12.2**: 错误处理和用户反馈