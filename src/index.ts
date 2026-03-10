/**
 * 工作流图谱系统主入口文件
 * 
 * 导出所有公共API，包括类型定义、Schema、工具函数、常量和错误类。
 * 这是外部模块使用本系统的统一入口点。
 */

// 类型定义导出
export * from './types/workflow.types';

// Schema导出（仅导出Schema对象，避免类型冲突）
export {
  NodeTypeSchema,
  NodeStatusSchema,
  AssetRoleSchema,
  OutputTypeSchema,
  EdgeTypeSchema,
  InstructionsSchema,
  AssetSchema,
  OutputSchema,
  PositionSchema,
  TaskNodeSchema,
  EdgeSchema,
  WorkflowSettingsSchema,
  WorkflowGraphSchema,
  KiroConfigSchema,
  ValidationErrorSchema,
  ValidationResultSchema,
  IntegrityIssueSchema,
  IntegrityResultSchema,
  ReferenceResultSchema
} from './schemas/workflow.schema';

// 常量导出
export * from './constants/workflow.constants';

// 工具函数导出
export * from './utils/workflow.utils';

// 错误类导出（仅导出错误类，避免ValidationError类型冲突）
export {
  WorkflowError,
  PermissionError,
  FileIOError,
  ValidationError as WorkflowValidationError,
  ParseError,
  NetworkError,
  ErrorFactory
} from './errors/workflow.errors';

// 版本信息
export const VERSION = '1.0.0';

// 系统信息
export const SYSTEM_INFO = {
  name: 'AI可访问的数据存储方案',
  version: VERSION,
  description: '基于纯文件存储的工作流图谱数据管理系统',
  author: 'Flow-in-One Team',
  license: 'UNLICENSED'
} as const;