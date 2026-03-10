/**
 * 文件操作服务
 * 
 * 提供高级文件操作功能，包括：
 * - 原子写入策略
 * - 文件完整性验证
 * - 错误恢复机制
 * - 性能优化
 */

import { FileIOError, ParseError, ValidationError } from '../errors/workflow.errors';
import { FILE_EXTENSIONS, PERFORMANCE_CONFIG } from '../constants/workflow.constants';
import type { WorkflowGraph } from '../types/workflow.types';

/**
 * 文件操作选项接口
 */
export interface FileOperationOptions {
  /** 是否创建备份 */
  createBackup?: boolean;
  /** 是否验证JSON格式 */
  validateJson?: boolean;
  /** 写入超时时间（毫秒） */
  timeout?: number;
  /** 是否使用Web Worker处理大文件 */
  useWorker?: boolean;
}

/**
 * 原子写入结果接口
 */
export interface AtomicWriteResult {
  /** 是否成功 */
  success: boolean;
  /** 文件大小（字节） */
  fileSize: number;
  /** 写入耗时（毫秒） */
  duration: number;
  /** 是否创建了备份 */
  backupCreated: boolean;
}

/**
 * 文件操作服务类
 */
export class FileOperationsService {
  private static instance: FileOperationsService;

  /**
   * 获取单例实例
   */
  public static getInstance(): FileOperationsService {
    if (!FileOperationsService.instance) {
      FileOperationsService.instance = new FileOperationsService();
    }
    return FileOperationsService.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {}

  /**
   * 原子写入文件
   * 
   * 实现原子写入策略：临时文件 -> 验证 -> 备份 -> 重命名
   * 
   * @param directoryHandle 目录句柄
   * @param fileName 文件名
   * @param content 文件内容
   * @param options 操作选项
   * @returns Promise<AtomicWriteResult> 写入结果
   */
  public async atomicWrite(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string,
    content: string,
    options: FileOperationOptions = {}
  ): Promise<AtomicWriteResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      validateJson = true,
      timeout = 30000,
      useWorker = content.length > PERFORMANCE_CONFIG.LARGE_FILE_THRESHOLD
    } = options;

    const tempFileName = this.getTempFileName(fileName);
    const backupFileName = this.getBackupFileName(fileName);
    let backupCreated = false;

    try {
      // 1. 预处理内容（如果需要使用Web Worker）
      const processedContent = useWorker 
        ? await this.processContentWithWorker(content)
        : content;

      // 2. 验证JSON格式（如果启用）
      if (validateJson) {
        await this.validateJsonContent(processedContent, fileName);
      }

      // 3. 写入临时文件
      await this.writeFileContent(directoryHandle, tempFileName, processedContent, timeout);

      // 4. 验证临时文件完整性
      await this.verifyFileIntegrity(directoryHandle, tempFileName, processedContent);

      // 5. 创建备份文件（如果原文件存在且启用备份）
      if (createBackup) {
        backupCreated = await this.createBackupIfExists(
          directoryHandle,
          fileName,
          backupFileName
        );
      }

      // 6. 原子替换：删除原文件 -> 重命名临时文件
      await this.atomicReplace(directoryHandle, fileName, tempFileName);

      // 7. 清理临时文件（如果还存在）
      await this.cleanupTempFile(directoryHandle, tempFileName);

      const duration = Date.now() - startTime;
      const fileSize = new TextEncoder().encode(processedContent).length;

      return {
        success: true,
        fileSize,
        duration,
        backupCreated
      };

    } catch (error: any) {
      // 清理临时文件
      await this.cleanupTempFile(directoryHandle, tempFileName);
      
      if (error instanceof FileIOError || error instanceof ParseError || error instanceof ValidationError) {
        throw error;
      }

      throw new FileIOError(
        `原子写入失败: ${error.message}`,
        { 
          fileName, 
          operation: 'atomic_write',
          duration: Date.now() - startTime,
          originalError: error.message 
        }
      );
    }
  }

  /**
   * 安全读取文件
   * 
   * 包含错误恢复机制，如果主文件损坏会尝试从备份恢复
   * 
   * @param directoryHandle 目录句柄
   * @param fileName 文件名
   * @param options 操作选项
   * @returns Promise<string> 文件内容
   */
  public async safeReadFile(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string,
    options: FileOperationOptions = {}
  ): Promise<string> {
    const { validateJson = true, useWorker = false } = options;

    try {
      // 1. 尝试读取主文件
      const content = await this.readFileContent(directoryHandle, fileName);

      // 2. 验证内容（如果启用）
      if (validateJson) {
        await this.validateJsonContent(content, fileName);
      }

      // 3. 处理内容（如果需要使用Web Worker）
      return useWorker 
        ? await this.processContentWithWorker(content)
        : content;

    } catch (error: any) {
      // 4. 如果主文件读取失败，尝试从备份恢复
      console.warn(`主文件读取失败，尝试从备份恢复: ${error.message}`);
      
      try {
        const backupFileName = this.getBackupFileName(fileName);
        const backupContent = await this.readFileContent(directoryHandle, backupFileName);

        if (validateJson) {
          await this.validateJsonContent(backupContent, backupFileName);
        }

        // 记录从备份恢复的事件
        console.info(`已从备份文件恢复: ${fileName}`);

        return useWorker 
          ? await this.processContentWithWorker(backupContent)
          : backupContent;

      } catch (backupError: any) {
        throw new FileIOError(
          `文件读取失败，备份文件也无法访问: ${fileName}`,
          { 
            fileName,
            operation: 'safe_read',
            primaryError: error.message,
            backupError: backupError.message
          }
        );
      }
    }
  }

  /**
   * 检查文件是否存在
   * 
   * @param directoryHandle 目录句柄
   * @param fileName 文件名
   * @returns Promise<boolean> 文件是否存在
   */
  public async fileExists(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<boolean> {
    try {
      await directoryHandle.getFileHandle(fileName);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 获取文件信息
   * 
   * @param directoryHandle 目录句柄
   * @param fileName 文件名
   * @returns Promise<File> 文件对象
   */
  public async getFileInfo(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<File> {
    try {
      const fileHandle = await directoryHandle.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw FileIOError.notFound(fileName);
      }
      throw new FileIOError(
        `获取文件信息失败: ${error.message}`,
        { fileName, operation: 'get_info' }
      );
    }
  }

  /**
   * 删除文件
   * 
   * @param directoryHandle 目录句柄
   * @param fileName 文件名
   */
  public async deleteFile(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<void> {
    try {
      await directoryHandle.removeEntry(fileName);
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        // 文件不存在，视为成功
        return;
      }
      throw new FileIOError(
        `删除文件失败: ${error.message}`,
        { fileName, operation: 'delete' }
      );
    }
  }

  /**
   * 复制文件
   * 
   * @param directoryHandle 目录句柄
   * @param sourceFileName 源文件名
   * @param targetFileName 目标文件名
   */
  public async copyFile(
    directoryHandle: FileSystemDirectoryHandle,
    sourceFileName: string,
    targetFileName: string
  ): Promise<void> {
    try {
      const content = await this.readFileContent(directoryHandle, sourceFileName);
      await this.writeFileContent(directoryHandle, targetFileName, content);
    } catch (error: any) {
      throw new FileIOError(
        `复制文件失败: ${error.message}`,
        { 
          sourceFileName, 
          targetFileName, 
          operation: 'copy',
          originalError: error.message 
        }
      );
    }
  }

  /**
   * 获取临时文件名
   */
  private getTempFileName(fileName: string): string {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const extension = fileName.substring(baseName.length);
    return `${baseName}${FILE_EXTENSIONS.TEMP}`;
  }

  /**
   * 获取备份文件名
   */
  private getBackupFileName(fileName: string): string {
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    const extension = fileName.substring(baseName.length);
    return `${baseName}${FILE_EXTENSIONS.BACKUP}`;
  }

  /**
   * 写入文件内容
   */
  private async writeFileContent(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string,
    content: string,
    timeout: number = 30000
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new FileIOError(`写入超时: ${fileName}`, { fileName, timeout }));
      }, timeout);

      try {
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        
        clearTimeout(timeoutId);
        resolve();
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'QuotaExceededError') {
          reject(FileIOError.diskFull(fileName));
        } else {
          reject(new FileIOError(
            `写入文件失败: ${error.message}`,
            { fileName, operation: 'write', originalError: error.message }
          ));
        }
      }
    });
  }

  /**
   * 读取文件内容
   */
  private async readFileContent(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<string> {
    try {
      const fileHandle = await directoryHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        throw FileIOError.notFound(fileName);
      }
      throw new FileIOError(
        `读取文件失败: ${error.message}`,
        { fileName, operation: 'read', originalError: error.message }
      );
    }
  }

  /**
   * 验证JSON内容
   */
  private async validateJsonContent(content: string, fileName: string): Promise<void> {
    try {
      JSON.parse(content);
    } catch (error: any) {
      // 尝试提取行号信息
      const match = error.message.match(/at position (\d+)/);
      let line: number | undefined;
      
      if (match) {
        const position = parseInt(match[1]);
        const lines = content.substring(0, position).split('\n');
        line = lines.length;
      }

      throw ParseError.jsonSyntaxError(fileName, line);
    }
  }

  /**
   * 验证文件完整性
   */
  private async verifyFileIntegrity(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string,
    expectedContent: string
  ): Promise<void> {
    try {
      const actualContent = await this.readFileContent(directoryHandle, fileName);
      
      if (actualContent !== expectedContent) {
        throw new FileIOError(
          `文件完整性验证失败: ${fileName}`,
          { 
            fileName, 
            operation: 'integrity_check',
            expectedSize: expectedContent.length,
            actualSize: actualContent.length
          }
        );
      }
    } catch (error: any) {
      if (error instanceof FileIOError) {
        throw error;
      }
      throw new FileIOError(
        `完整性验证失败: ${error.message}`,
        { fileName, operation: 'integrity_check', originalError: error.message }
      );
    }
  }

  /**
   * 创建备份文件（如果原文件存在）
   */
  private async createBackupIfExists(
    directoryHandle: FileSystemDirectoryHandle,
    fileName: string,
    backupFileName: string
  ): Promise<boolean> {
    try {
      if (await this.fileExists(directoryHandle, fileName)) {
        await this.copyFile(directoryHandle, fileName, backupFileName);
        return true;
      }
      return false;
    } catch (error: any) {
      console.warn(`创建备份文件失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 原子替换文件
   */
  private async atomicReplace(
    directoryHandle: FileSystemDirectoryHandle,
    targetFileName: string,
    tempFileName: string
  ): Promise<void> {
    try {
      // 删除目标文件（如果存在）
      if (await this.fileExists(directoryHandle, targetFileName)) {
        await this.deleteFile(directoryHandle, targetFileName);
      }

      // 复制临时文件到目标位置
      await this.copyFile(directoryHandle, tempFileName, targetFileName);

    } catch (error: any) {
      throw new FileIOError(
        `原子替换失败: ${error.message}`,
        { 
          targetFileName, 
          tempFileName, 
          operation: 'atomic_replace',
          originalError: error.message 
        }
      );
    }
  }

  /**
   * 清理临时文件
   */
  private async cleanupTempFile(
    directoryHandle: FileSystemDirectoryHandle,
    tempFileName: string
  ): Promise<void> {
    try {
      await this.deleteFile(directoryHandle, tempFileName);
    } catch (error: any) {
      // 静默失败，不影响主要操作
      console.warn(`清理临时文件失败: ${error.message}`);
    }
  }

  /**
   * 使用Web Worker处理内容
   * 
   * 注意：这里是占位实现，实际需要创建Web Worker
   */
  private async processContentWithWorker(content: string): Promise<string> {
    // TODO: 实现Web Worker处理逻辑
    // 目前直接返回原内容
    return content;
  }

  /**
   * 格式化JSON内容
   * 
   * @param data 要格式化的数据
   * @param indent 缩进空格数
   * @returns 格式化后的JSON字符串
   */
  public formatJson(data: any, indent: number = 2): string {
    try {
      // 确保字段按字母顺序排序
      const sortedData = this.sortObjectKeys(data);
      return JSON.stringify(sortedData, null, indent);
    } catch (error: any) {
      throw new ParseError(
        `JSON格式化失败: ${error.message}`,
        undefined,
        undefined,
        { operation: 'format', originalError: error.message }
      );
    }
  }

  /**
   * 递归排序对象键
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sortedObj: any = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sortedObj[key] = this.sortObjectKeys(obj[key]);
    }

    return sortedObj;
  }
}