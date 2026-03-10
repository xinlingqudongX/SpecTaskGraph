/**
 * 工作流文件管理器服务
 * 
 * 提供业务级别的工作流文件操作接口，包括：
 * - 项目打开、保存、关闭功能
 * - 内存缓存管理
 * - 变更追踪（dirty标记）
 * - 自动保存机制
 * 
 * 验证需求: 9.1, 9.5
 */

import { FileSystemService } from './filesystem.service';
import { ValidationService } from './validation.service';
import { FileIOError, ValidationError } from '../errors/workflow.errors';
import type { WorkflowGraph } from '../types/workflow.types';

/**
 * 缓存的工作流图项
 */
interface CachedWorkflowGraph {
  /** 项目ID */
  projectId: string;
  /** 工作流图数据 */
  data: WorkflowGraph;
  /** 缓存时间戳 */
  timestamp: Date;
  /** 是否有未保存的变更 */
  dirty: boolean;
}

/**
 * 自动保存配置
 */
interface AutoSaveConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 保存间隔（毫秒） */
  interval: number;
  /** 定时器ID */
  timerId?: NodeJS.Timeout;
}

/**
 * 工作流文件管理器类
 */
export class WorkflowFileManager {
  private static instance: WorkflowFileManager;
  
  /** 文件系统服务 */
  private fileSystemService: FileSystemService;
  
  /** 验证服务 */
  private validationService: ValidationService;
  
  /** 内存缓存 */
  private cache: Map<string, CachedWorkflowGraph>;
  
  /** 自动保存配置 */
  private autoSaveConfigs: Map<string, AutoSaveConfig>;

  /**
   * 获取单例实例
   */
  public static getInstance(): WorkflowFileManager {
    if (!WorkflowFileManager.instance) {
      WorkflowFileManager.instance = new WorkflowFileManager();
    }
    return WorkflowFileManager.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    this.fileSystemService = FileSystemService.getInstance();
    this.validationService = ValidationService.getInstance();
    this.cache = new Map();
    this.autoSaveConfigs = new Map();
  }

  /**
   * 打开项目
   * 
   * @param projectId 项目ID
   * @returns Promise<WorkflowGraph> 工作流图数据
   * @throws FileIOError 当文件读取失败时
   * @throws ValidationError 当数据验证失败时
   */
  public async openProject(projectId: string): Promise<WorkflowGraph> {
    try {
      // 1. 检查缓存
      const cached = this.cache.get(projectId);
      if (cached && !cached.dirty) {
        console.info(`从缓存加载项目: ${projectId}`);
        return cached.data;
      }

      // 2. 从文件系统读取
      console.info(`从文件系统加载项目: ${projectId}`);
      const workflowGraph = await this.fileSystemService.readWorkflowFile(projectId);

      // 3. 验证数据
      const validationResult = this.validationService.validateWorkflowGraph(workflowGraph);
      if (!validationResult.valid) {
        throw new ValidationError(
          '工作流图数据验证失败',
          validationResult.errors || [],
          { projectId, operation: 'open_project' }
        );
      }

      // 4. 检查数据完整性
      const integrityResult = this.validationService.checkDataIntegrity(workflowGraph);
      if (!integrityResult.valid) {
        console.warn(`项目 ${projectId} 存在完整性问题:`, integrityResult.issues);
        // 不阻止打开，但记录警告
      }

      // 5. 缓存数据
      this.cache.set(projectId, {
        projectId,
        data: workflowGraph,
        timestamp: new Date(),
        dirty: false
      });

      console.info(`项目 ${projectId} 打开成功`);
      return workflowGraph;

    } catch (error: any) {
      if (error instanceof FileIOError || error instanceof ValidationError) {
        throw error;
      }

      throw new FileIOError(
        `打开项目失败: ${error.message}`,
        { projectId, operation: 'open_project', originalError: error.message }
      );
    }
  }

  /**
   * 保存项目
   * 
   * @param projectId 项目ID
   * @param graph 工作流图数据
   * @throws FileIOError 当文件写入失败时
   * @throws ValidationError 当数据验证失败时
   */
  public async saveProject(projectId: string, graph: WorkflowGraph): Promise<void> {
    try {
      // 1. 验证数据
      const validationResult = this.validationService.validateWorkflowGraph(graph);
      if (!validationResult.valid) {
        throw new ValidationError(
          '工作流图数据验证失败',
          validationResult.errors || [],
          { projectId, operation: 'save_project' }
        );
      }

      // 2. 检查是否有实际变更
      const cached = this.cache.get(projectId);
      if (cached && !cached.dirty) {
        // 深度比较数据是否真的变化了
        if (this.isDataEqual(cached.data, graph)) {
          console.info(`项目 ${projectId} 数据未变更，跳过保存`);
          return;
        }
      }

      // 3. 写入文件
      console.info(`保存项目: ${projectId}`);
      await this.fileSystemService.writeWorkflowFile(projectId, graph);

      // 4. 更新缓存
      this.cache.set(projectId, {
        projectId,
        data: graph,
        timestamp: new Date(),
        dirty: false
      });

      console.info(`项目 ${projectId} 保存成功`);

    } catch (error: any) {
      if (error instanceof FileIOError || error instanceof ValidationError) {
        throw error;
      }

      throw new FileIOError(
        `保存项目失败: ${error.message}`,
        { projectId, operation: 'save_project', originalError: error.message }
      );
    }
  }

  /**
   * 关闭项目
   * 
   * @param projectId 项目ID
   * @throws FileIOError 当有未保存的变更时
   */
  public async closeProject(projectId: string): Promise<void> {
    try {
      // 1. 检查是否有未保存的变更
      const cached = this.cache.get(projectId);
      if (cached && cached.dirty) {
        throw new FileIOError(
          '项目有未保存的变更，请先保存或放弃变更',
          { projectId, operation: 'close_project', dirty: true }
        );
      }

      // 2. 停止自动保存
      this.disableAutoSave(projectId);

      // 3. 清除缓存
      this.cache.delete(projectId);

      console.info(`项目 ${projectId} 已关闭`);

    } catch (error: any) {
      if (error instanceof FileIOError) {
        throw error;
      }

      throw new FileIOError(
        `关闭项目失败: ${error.message}`,
        { projectId, operation: 'close_project', originalError: error.message }
      );
    }
  }

  /**
   * 启用自动保存
   * 
   * @param projectId 项目ID
   * @param interval 保存间隔（毫秒）
   */
  public enableAutoSave(projectId: string, interval: number): void {
    // 先停止现有的自动保存
    this.disableAutoSave(projectId);

    // 创建新的自动保存配置
    const config: AutoSaveConfig = {
      enabled: true,
      interval,
      timerId: setInterval(async () => {
        try {
          const cached = this.cache.get(projectId);
          if (cached && cached.dirty) {
            console.info(`自动保存项目: ${projectId}`);
            await this.saveProject(projectId, cached.data);
          }
        } catch (error: any) {
          console.error(`自动保存失败: ${error.message}`);
        }
      }, interval)
    };

    this.autoSaveConfigs.set(projectId, config);
    console.info(`项目 ${projectId} 启用自动保存，间隔: ${interval}ms`);
  }

  /**
   * 禁用自动保存
   * 
   * @param projectId 项目ID
   */
  public disableAutoSave(projectId: string): void {
    const config = this.autoSaveConfigs.get(projectId);
    if (config && config.timerId) {
      clearInterval(config.timerId);
      this.autoSaveConfigs.delete(projectId);
      console.info(`项目 ${projectId} 禁用自动保存`);
    }
  }

  /**
   * 获取缓存的工作流图
   * 
   * @param projectId 项目ID
   * @returns WorkflowGraph | null 缓存的工作流图或null
   */
  public getCachedGraph(projectId: string): WorkflowGraph | null {
    const cached = this.cache.get(projectId);
    return cached ? cached.data : null;
  }

  /**
   * 使缓存失效
   * 
   * @param projectId 项目ID
   */
  public invalidateCache(projectId: string): void {
    this.cache.delete(projectId);
    console.info(`项目 ${projectId} 缓存已失效`);
  }

  /**
   * 标记为有变更
   * 
   * @param projectId 项目ID
   */
  public markDirty(projectId: string): void {
    const cached = this.cache.get(projectId);
    if (cached) {
      cached.dirty = true;
      console.debug(`项目 ${projectId} 标记为dirty`);
    }
  }

  /**
   * 检查是否有未保存的变更
   * 
   * @param projectId 项目ID
   * @returns boolean 是否有未保存的变更
   */
  public isDirty(projectId: string): boolean {
    const cached = this.cache.get(projectId);
    return cached ? cached.dirty : false;
  }

  /**
   * 深度比较两个工作流图数据是否相等
   * 
   * @param data1 第一个工作流图
   * @param data2 第二个工作流图
   * @returns boolean 是否相等
   */
  private isDataEqual(data1: WorkflowGraph, data2: WorkflowGraph): boolean {
    try {
      // 使用JSON序列化进行深度比较
      // 注意：这会忽略updatedAt字段的差异
      const json1 = JSON.stringify(this.normalizeForComparison(data1));
      const json2 = JSON.stringify(this.normalizeForComparison(data2));
      return json1 === json2;
    } catch (error) {
      // 如果序列化失败，认为不相等
      return false;
    }
  }

  /**
   * 标准化数据用于比较（移除时间戳等动态字段）
   * 
   * @param data 工作流图数据
   * @returns 标准化后的数据
   */
  private normalizeForComparison(data: WorkflowGraph): Partial<WorkflowGraph> {
    const { updatedAt, ...rest } = data;
    return rest;
  }

  /**
   * 获取所有打开的项目ID列表
   * 
   * @returns string[] 项目ID列表
   */
  public getOpenProjects(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存统计信息
   * 
   * @returns 缓存统计信息
   */
  public getCacheStats(): {
    totalProjects: number;
    dirtyProjects: number;
    autoSaveEnabled: number;
  } {
    const dirtyProjects = Array.from(this.cache.values()).filter(c => c.dirty).length;
    const autoSaveEnabled = this.autoSaveConfigs.size;

    return {
      totalProjects: this.cache.size,
      dirtyProjects,
      autoSaveEnabled
    };
  }

  /**
   * 清除所有缓存
   */
  public clearAllCache(): void {
    // 停止所有自动保存
    this.autoSaveConfigs.forEach((_, projectId) => {
      this.disableAutoSave(projectId);
    });

    // 清除缓存
    this.cache.clear();
    console.info('所有缓存已清除');
  }
}
