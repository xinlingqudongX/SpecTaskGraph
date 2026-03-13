/**
 * 工作区相关类型定义
 */

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  permissions: 'granted' | 'denied' | 'prompt';
  lastAccessed: Date;
  handle: FileSystemDirectoryHandle;
}

export interface WorkspaceSelectionEvent {
  workspaceSelected: boolean;
  permissionGranted: boolean;
  workspaceInfo: WorkspaceInfo;
}