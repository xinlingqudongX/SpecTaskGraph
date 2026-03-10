/**
 * 服务模块导出
 * 
 * 统一导出所有服务类，方便其他模块使用
 */

export { FileSystemService } from './filesystem.service';
export { FileOperationsService } from './file-operations.service';
export { PermissionManager } from './permission-manager.service';

export type { 
  PermissionState,
  DirectoryHandleRecord 
} from './filesystem.service';

export type {
  FileOperationOptions,
  AtomicWriteResult
} from './file-operations.service';

export type {
  PermissionChangeEvent,
  PermissionRecord
} from './permission-manager.service';