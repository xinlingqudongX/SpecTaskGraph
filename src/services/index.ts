/**
 * 服务模块导出
 * 
 * 统一导出所有服务类，方便其他模块使用
 */

// 文件系统相关服务
export { FileSystemService } from './filesystem.service';
export { FileOperationsService } from './file-operations.service';
export { PermissionManager } from './permission-manager.service';

// 数据验证相关服务
export { ValidationService } from './validation.service';
export { SchemaManagerService } from './schema-manager.service';

// 类型导出
export type { 
  PermissionState,
  DirectoryHandleRecord 
} from './filesystem.service';

export type {
  FileOperationOptions,
  AtomicWriteResult
} from './file-operations.service';

export type {
  SchemaVersionInfo,
  SchemaMigrationResult
} from './schema-manager.service';