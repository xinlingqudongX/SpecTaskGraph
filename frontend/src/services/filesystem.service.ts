/**
 * 前端文件系统访问服务
 * 
 * 基于File System Access API实现本地文件读写功能
 */

import type { WorkflowGraph, PermissionState } from '../types/workflow.types';

/**
 * 目录句柄记录
 */
interface DirectoryHandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
  path: string;
  lastAccessed: Date;
  permissions: PermissionState;
}

/**
 * 文件操作选项
 */
interface FileOperationOptions {
  createBackup?: boolean;
  validateJson?: boolean;
}

/**
 * 文件系统服务类
 */
export class FileSystemService {
  private static instance: FileSystemService;
  private dbName = 'workflow-storage';
  private storeName = 'directory-handles';
  private db: IDBDatabase | null = null;

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
   * 私有构造函数
   */
  private constructor() {
    this.initializeDB();
  }

  /**
   * 初始化IndexedDB
   */
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(new Error('无法打开IndexedDB'));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
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
   * 检查浏览器是否支持File System Access API
   */
  public static isSupported(): boolean {
    return 'showDirectoryPicker' in window;
  }

  /**
   * 请求目录访问权限
   */
  public async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
    if (!FileSystemService.isSupported()) {
      throw new Error('浏览器不支持File System Access API');
    }

    try {
      const directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });
      return directoryHandle;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('用户取消了目录选择');
      }
      throw new Error(`请求目录访问失败: ${error.message}`);
    }
  }

  /**
   * 保存目录句柄
   */
  public async saveDirectoryHandle(
    id: string,
    handle: FileSystemDirectoryHandle,
    displayPath?: string
  ): Promise<void> {
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

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 加载目录句柄
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
    } catch (error) {
      console.warn('加载目录句柄失败:', error);
      return null;
    }
  }

  /**
   * 检查权限状态
   */
  public async checkPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    try {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      return permission as PermissionState;
    } catch (error) {
      console.warn('检查权限失败:', error);
      return 'denied';
    }
  }

  /**
   * 请求权限
   */
  public async requestPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      return permission as PermissionState;
    } catch (error) {
      console.warn('请求权限失败:', error);
      return 'denied';
    }
  }

  /**
   * 获取工作流数据目录
   */
  private async getWorkflowDataDirectory(
    rootHandle: FileSystemDirectoryHandle
  ): Promise<FileSystemDirectoryHandle> {
    const srcHandle = await rootHandle.getDirectoryHandle('src', { create: true });
    const dataHandle = await srcHandle.getDirectoryHandle('data', { create: true });
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow', { create: true });
    return workflowHandle;
  }

  /**
   * 读取工作流文件
   */
  public async readWorkflowFile(projectId: string): Promise<WorkflowGraph> {
    const rootHandle = await this.loadDirectoryHandle(projectId);
    if (!rootHandle) {
      throw new Error(`项目 ${projectId} 的目录句柄不存在`);
    }

    // 检查权限
    const permission = await this.checkPermission(rootHandle);
    if (permission !== 'granted') {
      const newPermission = await this.requestPermission(rootHandle);
      if (newPermission !== 'granted') {
        throw new Error('文件访问权限不足');
      }
    }

    const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
    const fileName = `${projectId}.json`;

    try {
      const fileHandle = await workflowDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return JSON.parse(content) as WorkflowGraph;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw new Error(`工作流文件不存在: ${fileName}`);
      }
      throw new Error(`读取工作流文件失败: ${error.message}`);
    }
  }

  /**
   * 写入工作流文件（原子操作）
   */
  public async writeWorkflowFile(
    projectId: string,
    data: WorkflowGraph,
    options: FileOperationOptions = {}
  ): Promise<void> {
    const { createBackup = true } = options;

    const rootHandle = await this.loadDirectoryHandle(projectId);
    if (!rootHandle) {
      throw new Error(`项目 ${projectId} 的目录句柄不存在`);
    }

    // 检查权限
    const permission = await this.checkPermission(rootHandle);
    if (permission !== 'granted') {
      throw new Error('文件访问权限不足');
    }

    const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
    const fileName = `${projectId}.json`;
    const tempFileName = `${projectId}.json.tmp`;
    const backupFileName = `${projectId}.json.bak`;

    // 更新时间戳
    const updatedData = {
      ...data,
      updatedAt: new Date().toISOString()
    };

    // 格式化JSON
    const jsonContent = JSON.stringify(updatedData, null, 2);

    try {
      // 1. 写入临时文件
      const tempFileHandle = await workflowDir.getFileHandle(tempFileName, { create: true });
      const writable = await tempFileHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();

      // 2. 创建备份（如果原文件存在）
      if (createBackup) {
        try {
          const originalFileHandle = await workflowDir.getFileHandle(fileName);
          const originalFile = await originalFileHandle.getFile();
          const originalContent = await originalFile.text();
          
          const backupFileHandle = await workflowDir.getFileHandle(backupFileName, { create: true });
          const backupWritable = await backupFileHandle.createWritable();
          await backupWritable.write(originalContent);
          await backupWritable.close();
        } catch (error) {
          // 原文件不存在，跳过备份
          console.info('原文件不存在，跳过备份');
        }
      }

      // 3. 复制临时文件到目标文件
      const targetFileHandle = await workflowDir.getFileHandle(fileName, { create: true });
      const targetWritable = await targetFileHandle.createWritable();
      await targetWritable.write(jsonContent);
      await targetWritable.close();

      // 4. 删除临时文件
      try {
        await workflowDir.removeEntry(tempFileName);
      } catch (error) {
        console.warn('清理临时文件失败:', error);
      }

      console.info(`工作流文件写入成功: ${fileName}`);
    } catch (error: any) {
      // 清理临时文件
      try {
        await workflowDir.removeEntry(tempFileName);
      } catch (e) {
        // 忽略清理错误
      }
      throw new Error(`写入工作流文件失败: ${error.message}`);
    }
  }

  /**
   * 从备份恢复
   */
  public async restoreFromBackup(projectId: string): Promise<WorkflowGraph> {
    const rootHandle = await this.loadDirectoryHandle(projectId);
    if (!rootHandle) {
      throw new Error(`项目 ${projectId} 的目录句柄不存在`);
    }

    const workflowDir = await this.getWorkflowDataDirectory(rootHandle);
    const backupFileName = `${projectId}.json.bak`;

    try {
      const fileHandle = await workflowDir.getFileHandle(backupFileName);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return JSON.parse(content) as WorkflowGraph;
    } catch (error: any) {
      throw new Error(`从备份恢复失败: ${error.message}`);
    }
  }

  /**
   * 撤销目录访问
   */
  public async revokeDirectoryAccess(id: string): Promise<void> {
    const db = await this.ensureDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 列出所有保存的目录句柄
   */
  public async listDirectoryHandles(): Promise<DirectoryHandleRecord[]> {
    const db = await this.ensureDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 更新最后访问时间
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
    } catch (error) {
      console.warn('更新访问时间失败:', error);
    }
  }
}

// 扩展Window接口
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
