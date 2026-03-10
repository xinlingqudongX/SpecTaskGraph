/**
 * 文件系统访问服务
 * 
 * 提供基于File System Access API的文件系统访问功能，包括：
 * - 目录选择和权限管理
 * - DirectoryHandle存储到IndexedDB
 * - 文件读写操作
 * - 备份和恢复机制
 */

import { PermissionError, FileIOError, ParseError } from '../errors/workflow.errors';
import { FILE_PATHS, FILE_EXTENSIONS } from '../constants/workflow.constants';
import type { WorkflowGraph } from '../types/workflow.types';
import { FileOperationsService } from './file-operations.service';

/**
 * 权限状态类型
 */
export type PermissionState = 'granted' | 'denied' | 'prompt';

/**
 * 目录句柄记录接口
 */
export interface DirectoryHandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
  path: string;
  lastAccessed: Date;
  permissions: PermissionState;
}

/**
 * 文件系统服务类
 */
export class FileSystemService {
  private static instance: FileSystemService;
  private dbName = 'workflow-storage';
  private storeName = 'directory-handles';
  private db: IDBDatabase | null = null;
  private fileOps: FileOperationsService;

  /**
   * 获取单例实例
   */
  public static getInstance(): FileSystemService {
    if (!FileSystemService.instance) {
      FileSystemService.instance = new FileSystemService();
    }
    return FileSystemService.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    this.fileOps = FileOperationsService.getInstance();
    this.initializeDB();
  }

  /**
   * 初始化IndexedDB数据库
   */
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error('无法打开IndexedDB数据库'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initializeDB();
    }
    if (!this.db) {
      throw new Error('数据库初始化失败');
    }
    return this.db;
  }

  /**
   * 请求目录访问权限
   * 
   * @returns Promise<FileSystemDirectoryHandle> 目录句柄
   * @throws PermissionError 当用户拒绝权限时
   */
  public async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
    try {
      // 检查浏览器支持
      if (!('showDirectoryPicker' in window)) {
        throw new Error('浏览器不支持File System Access API');
      }

      // 显示目录选择器
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });

      return directoryHandle;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw PermissionError.denied();
      }
      throw new PermissionError(
        `请求目录访问失败: ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * 保存目录句柄到IndexedDB
   * 
   * @param id 项目ID
   * @param handle 目录句柄
   * @param displayPath 显示路径
   */
  public async saveDirectoryHandle(
    id: string,
    handle: FileSystemDirectoryHandle,
    displayPath?: string
  ): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const record: DirectoryHandleRecord = {
        id,
        handle,
        path: displayPath || handle.name,
        lastAccessed: new Date(),
        permissions: 'granted'
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error: any) {
      throw new FileIOError(
        `保存目录句柄失败: ${error.message}`,
        { projectId: id, operation: 'save_handle' }
      );
    }
  }

  /**
   * 从IndexedDB加载目录句柄
   * 
   * @param id 项目ID
   * @returns Promise<FileSystemDirectoryHandle | null> 目录句柄或null
   */
  public async loadDirectoryHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const record = await new Promise<DirectoryHandleRecord | null>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });

      if (!record) {
        return null;
      }

      // 更新最后访问时间
      await this.updateLastAccessed(id);

      return record.handle;
    } catch (error: any) {
      console.warn(`加载目录句柄失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 撤销目录访问权限
   * 
   * @param id 项目ID
   */
  public async revokeDirectoryAccess(id: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error: any) {
      throw new FileIOError(
        `撤销目录访问失败: ${error.message}`,
        { projectId: id, operation: 'revoke_access' }
      );
    }
  }

  /**
   * 检查目录句柄的权限状态
   * 
   * @param handle 目录句柄
   * @returns Promise<PermissionState> 权限状态
   */
  public async checkPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    try {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      return permission as PermissionState;
    } catch (error: any) {
      console.warn(`检查权限失败: ${error.message}`);
      return 'denied';
    }
  }

  /**
   * 请求目录句柄的权限
   * 
   * @param handle 目录句柄
   * @returns Promise<PermissionState> 权限状态
   */
  public async requestPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      return permission as PermissionState;
    } catch (error: any) {
      console.warn(`请求权限失败: ${error.message}`);
      return 'denied';
    }
  }

  /**
   * 更新最后访问时间
   * 
   * @param id 项目ID
   */
  private async updateLastAccessed(id: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.lastAccessed = new Date();
          store.put(record);
        }
      };
    } catch (error: any) {
      // 静默失败，不影响主要功能
      console.warn(`更新访问时间失败: ${error.message}`);
    }
  }

  /**
   * 获取工作流数据目录
   * 
   * @param rootHandle 项目根目录句柄
   * @returns Promise<FileSystemDirectoryHandle> 工作流数据目录句柄
   */
  private async getWorkflowDataDirectory(
    rootHandle: FileSystemDirectoryHandle
  ): Promise<FileSystemDirectoryHandle> {
    try {
      // 创建或获取 src 目录
      const srcHandle = await rootHandle.getDirectoryHandle('src', { create: true });
      
      // 创建或获取 data 目录
      const dataHandle = await srcHandle.getDirectoryHandle('data', { create: true });
      
      // 创建或获取 workflow 目录
      const workflowHandle = await dataHandle.getDirectoryHandle('workflow', { create: true });
      
      return workflowHandle;
    } catch (error: any) {
      throw new FileIOError(
        `创建工作流数据目录失败: ${error.message}`,
        { operation: 'create_directory', path: FILE_PATHS.WORKFLOW_DATA_DIR }
      );
    }
  }

  /**
   * 读取工作流图文件
   * 
   * @param projectId 项目ID
   * @returns Promise<WorkflowGraph> 工作流图数据
   * @throws FileIOError 当文件读取失败时
   * @throws ParseError 当JSON解析失败时
   */
  public async readWorkflowFile(projectId: string): Promise<WorkflowGraph> {
    try {
      // 加载目录句柄
      const rootHandle = await this.loadDirectoryHandle(projectId);
      if (!rootHandle) {
        throw FileIOError.notFound(`项目 ${projectId} 的目录句柄不存在`);
      }

      // 检查权限
      const permission = await this.checkPermission(rootHandle);
      if (permission !== 'granted') {
        throw PermissionError.revoked();
      }

      // 获取工作流数据目录
      const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
      
      // 构建文件名
      const fileName = `${projectId}${FILE_EXTENSIONS.WORKFLOW}`;
      
      // 使用安全读取方法
      const content = await this.fileOps.safeReadFile(workflowDir, fileName, {
        validateJson: true,
        useWorker: true
      });
      
      // 解析JSON
      const workflowGraph = JSON.parse(content) as WorkflowGraph;
      return workflowGraph;
      
    } catch (error: any) {
      if (error instanceof FileIOError || error instanceof ParseError || error instanceof PermissionError) {
        throw error;
      }
      
      throw new FileIOError(
        `读取工作流文件失败: ${error.message}`,
        { projectId, operation: 'read', originalError: error.message }
      );
    }
  }

  /**
   * 写入工作流图文件（原子操作）
   * 
   * @param projectId 项目ID
   * @param data 工作流图数据
   * @throws FileIOError 当文件写入失败时
   */
  public async writeWorkflowFile(projectId: string, data: WorkflowGraph): Promise<void> {
    try {
      // 加载目录句柄
      const rootHandle = await this.loadDirectoryHandle(projectId);
      if (!rootHandle) {
        throw FileIOError.notFound(`项目 ${projectId} 的目录句柄不存在`);
      }

      // 检查权限
      const permission = await this.checkPermission(rootHandle);
      if (permission !== 'granted') {
        throw PermissionError.revoked();
      }

      // 获取工作流数据目录
      const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
      
      // 构建文件名
      const fileName = `${projectId}${FILE_EXTENSIONS.WORKFLOW}`;
      
      // 更新时间戳
      const updatedData = {
        ...data,
        updatedAt: new Date().toISOString()
      };
      
      // 格式化JSON内容
      const jsonContent = this.fileOps.formatJson(updatedData, 2);
      
      // 使用原子写入
      const result = await this.fileOps.atomicWrite(workflowDir, fileName, jsonContent, {
        createBackup: true,
        validateJson: true,
        useWorker: true
      });
      
      console.info(`工作流文件写入成功: ${fileName}`, {
        fileSize: result.fileSize,
        duration: result.duration,
        backupCreated: result.backupCreated
      });
      
    } catch (error: any) {
      if (error instanceof FileIOError || error instanceof ParseError || error instanceof PermissionError) {
        throw error;
      }
      
      throw new FileIOError(
        `写入工作流文件失败: ${error.message}`,
        { projectId, operation: 'write', originalError: error.message }
      );
    }
  }

  /**
   * 创建备份文件
   * 
   * @param projectId 项目ID
   */
  public async createBackup(projectId: string): Promise<void> {
    try {
      // 加载目录句柄
      const rootHandle = await this.loadDirectoryHandle(projectId);
      if (!rootHandle) {
        throw FileIOError.notFound(`项目 ${projectId} 的目录句柄不存在`);
      }

      // 获取工作流数据目录
      const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
      
      // 构建文件名
      const fileName = `${projectId}${FILE_EXTENSIONS.WORKFLOW}`;
      const backupFileName = `${projectId}${FILE_EXTENSIONS.BACKUP}`;
      
      // 使用文件操作服务复制文件
      await this.fileOps.copyFile(workflowDir, fileName, backupFileName);
      
    } catch (error: any) {
      throw new FileIOError(
        `创建备份文件失败: ${error.message}`,
        { projectId, operation: 'backup', originalError: error.message }
      );
    }
  }

  /**
   * 从备份文件恢复
   * 
   * @param projectId 项目ID
   * @returns Promise<WorkflowGraph> 恢复的工作流图数据
   */
  public async restoreFromBackup(projectId: string): Promise<WorkflowGraph> {
    try {
      // 加载目录句柄
      const rootHandle = await this.loadDirectoryHandle(projectId);
      if (!rootHandle) {
        throw FileIOError.notFound(`项目 ${projectId} 的目录句柄不存在`);
      }

      // 获取工作流数据目录
      const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
      
      // 构建备份文件名
      const backupFileName = `${projectId}${FILE_EXTENSIONS.BACKUP}`;
      
      // 使用安全读取方法
      const content = await this.fileOps.safeReadFile(workflowDir, backupFileName, {
        validateJson: true,
        useWorker: true
      });
      
      // 解析JSON
      const workflowGraph = JSON.parse(content) as WorkflowGraph;
      return workflowGraph;
      
    } catch (error: any) {
      if (error instanceof ParseError || error instanceof FileIOError) {
        throw error;
      }
      
      throw new FileIOError(
        `从备份恢复失败: ${error.message}`,
        { projectId, operation: 'restore', originalError: error.message }
      );
    }
  }

  /**
   * 列出所有保存的目录句柄
   * 
   * @returns Promise<DirectoryHandleRecord[]> 目录句柄记录列表
   */
  public async listDirectoryHandles(): Promise<DirectoryHandleRecord[]> {
    try {
      const db = await this.ensureDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise<DirectoryHandleRecord[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error: any) {
      throw new FileIOError(
        `列出目录句柄失败: ${error.message}`,
        { operation: 'list_handles' }
      );
    }
  }
}

// 扩展Window接口以支持File System Access API
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemDirectoryHandle {
    queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}