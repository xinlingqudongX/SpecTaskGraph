/**
 * 工作流管理服务
 * 
 * 提供工作流图的高级管理功能，包括：
 * - 项目打开、保存、关闭
 * - 内存缓存管理
 * - 自动保存机制
 * - 变更追踪
 */

import { FileSystemService } from './filesystem.service';
import type { WorkflowGraph } from '../types/workflow.types';

/**
 * 缓存的工作流图
 */
interface CachedWorkflowGraph {
  projectId: string;
  data: WorkflowGraph;
  timestamp: Date;
  dirty: boolean;
}

/**
 * 自动保存配置
 */
interface AutoSaveConfig {
  enabled: boolean;
  interval: number;
  timerId?: number;
}

/**
 * 工作流管理服务类
 */
export class WorkflowManagerService {
  private static instance: WorkflowManagerService;
  private fileSystemService: FileSystemService;
  private cache: Map<string, CachedWorkflowGraph>;
  private autoSaveConfigs: Map<string, AutoSaveConfig>;

  /**
   * 获取单例实例
   */
  public static getInstance(): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService();
    }
    return WorkflowManagerService.instance;
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this.fileSystemService = FileSystemService.getInstance();
    this.cache = new Map();
    this.autoSaveConfigs = new Map();
  }

  /**
   * 打开项目
   */
  public async openProject(projectId: string): Promise<WorkflowGraph> {
    // 检查缓存
    const cached = this.cache.get(projectId);
    if (cached && !cached.dirty) {
      console.info(`从缓存加载项目: ${projectId}`);
      return cached.data;
    }

    // 从文件系统读取
    console.info(`从文件系统加载项目: ${projectId}`);
    const workflowGraph = await this.fileSystemService.readWorkflowFile(projectId);

    // 缓存数据
    this.cache.set(projectId, {
      projectId,
      data: workflowGraph,
      timestamp: new Date(),
      dirty: false
    });

    return workflowGraph;
  }

  /**
   * 保存项目
   */
  public async saveProject(projectId: string, graph: WorkflowGraph): Promise<void> {
    // 检查是否有实际变更
    const cached = this.cache.get(projectId);
    if (cached && !cached.dirty && this.isDataEqual(cached.data, graph)) {
      console.info(`项目 ${projectId} 数据未变更，跳过保存`);
      return;
    }

    // 写入文件
    console.info(`保存项目: ${projectId}`);
    await this.fileSystemService.writeWorkflowFile(projectId, graph);

    // 更新缓存
    this.cache.set(projectId, {
      projectId,
      data: graph,
      timestamp: new Date(),
      dirty: false
    });
  }

  /**
   * 关闭项目
   */
  public async closeProject(projectId: string): Promise<void> {
    // 检查未保存的变更
    const cached = this.cache.get(projectId);
    if (cached && cached.dirty) {
      throw new Error('项目有未保存的变更，请先保存或放弃变更');
    }

    // 停止自动保存
    this.disableAutoSave(projectId);

    // 清除缓存
    this.cache.delete(projectId);
    console.info(`项目 ${projectId} 已关闭`);
  }

  /**
   * 启用自动保存
   */
  public enableAutoSave(projectId: string, interval: number = 500): void {
    // 停止现有的自动保存
    this.disableAutoSave(projectId);

    // 创建新的自动保存配置
    const timerId = window.setInterval(async () => {
      try {
        const cached = this.cache.get(projectId);
        if (cached && cached.dirty) {
          console.info(`自动保存项目: ${projectId}`);
          await this.saveProject(projectId, cached.data);
        }
      } catch (error: any) {
        console.error(`自动保存失败: ${error.message}`);
      }
    }, interval);

    this.autoSaveConfigs.set(projectId, {
      enabled: true,
      interval,
      timerId
    });

    console.info(`项目 ${projectId} 启用自动保存，间隔: ${interval}ms`);
  }

  /**
   * 禁用自动保存
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
   */
  public getCachedGraph(projectId: string): WorkflowGraph | null {
    const cached = this.cache.get(projectId);
    return cached ? cached.data : null;
  }

  /**
   * 更新缓存的工作流图
   */
  public updateCachedGraph(projectId: string, graph: WorkflowGraph): void {
    const cached = this.cache.get(projectId);
    if (cached) {
      cached.data = graph;
      cached.dirty = true;
      cached.timestamp = new Date();
    } else {
      this.cache.set(projectId, {
        projectId,
        data: graph,
        timestamp: new Date(),
        dirty: true
      });
    }
  }

  /**
   * 标记为有变更
   */
  public markDirty(projectId: string): void {
    const cached = this.cache.get(projectId);
    if (cached) {
      cached.dirty = true;
    }
  }

  /**
   * 检查是否有未保存的变更
   */
  public isDirty(projectId: string): boolean {
    const cached = this.cache.get(projectId);
    return cached ? cached.dirty : false;
  }

  /**
   * 使缓存失效
   */
  public invalidateCache(projectId: string): void {
    this.cache.delete(projectId);
    console.info(`项目 ${projectId} 缓存已失效`);
  }

  /**
   * 获取所有打开的项目
   */
  public getOpenProjects(): string[] {
    return Array.from(this.cache.keys());
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

  /**
   * 深度比较两个工作流图
   */
  private isDataEqual(data1: WorkflowGraph, data2: WorkflowGraph): boolean {
    try {
      const json1 = JSON.stringify(this.normalizeForComparison(data1));
      const json2 = JSON.stringify(this.normalizeForComparison(data2));
      return json1 === json2;
    } catch (error) {
      return false;
    }
  }

  /**
   * 标准化数据用于比较
   */
  private normalizeForComparison(data: WorkflowGraph): Partial<WorkflowGraph> {
    const { updatedAt, ...rest } = data;
    return rest;
  }
}
