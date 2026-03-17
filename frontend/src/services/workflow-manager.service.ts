/**
 * 工作流管理服务
 *
 * 提供工作流图的高级管理功能，包括：
 * - 项目打开、保存、关闭
 * - 内存缓存管理
 * - 自动保存机制
 * - 变更追踪
 *
 * 数据存储：工作流 JSON 保存在服务器端 SQLite（通过 ProjectApiService）。
 */

import { ProjectApiService } from './project-api.service';
import type { WorkflowGraph } from '../types/workflow.types';

interface CachedWorkflowGraph {
  projectId: string;
  data: WorkflowGraph;
  timestamp: Date;
  dirty: boolean;
}

interface AutoSaveConfig {
  enabled: boolean;
  interval: number;
  timerId?: number;
}

export class WorkflowManagerService {
  private static instance: WorkflowManagerService;
  private projectApi: ProjectApiService;
  private cache: Map<string, CachedWorkflowGraph>;
  private autoSaveConfigs: Map<string, AutoSaveConfig>;

  public static getInstance(): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService();
    }
    return WorkflowManagerService.instance;
  }

  private constructor() {
    this.projectApi = ProjectApiService.getInstance();
    this.cache = new Map();
    this.autoSaveConfigs = new Map();
  }

  /** 打开项目（从缓存或服务器加载） */
  public async openProject(projectId: string): Promise<WorkflowGraph> {
    const cached = this.cache.get(projectId);
    if (cached && !cached.dirty) {
      console.info(`从缓存加载项目: ${projectId}`);
      return cached.data;
    }

    console.info(`从服务器加载项目: ${projectId}`);
    const serverProject = await this.projectApi.getProject(projectId);
    const workflowGraph = this.projectApi.extractWorkflowGraph(serverProject);

    this.cache.set(projectId, {
      projectId,
      data: workflowGraph,
      timestamp: new Date(),
      dirty: false,
    });

    return workflowGraph;
  }

  /** 保存项目到服务器 */
  public async saveProject(projectId: string, graph: WorkflowGraph): Promise<void> {
    const cached = this.cache.get(projectId);
    if (cached && !cached.dirty && this.isDataEqual(cached.data, graph)) {
      console.info(`项目 ${projectId} 数据未变更，跳过保存`);
      return;
    }

    console.info(`保存项目到服务器: ${projectId}`);
    await this.projectApi.saveWorkflow(projectId, graph);

    this.cache.set(projectId, {
      projectId,
      data: graph,
      timestamp: new Date(),
      dirty: false,
    });
  }

  /** 关闭项目 */
  public async closeProject(projectId: string): Promise<void> {
    const cached = this.cache.get(projectId);
    if (cached && cached.dirty) {
      throw new Error('项目有未保存的变更，请先保存或放弃变更');
    }
    this.disableAutoSave(projectId);
    this.cache.delete(projectId);
    console.info(`项目 ${projectId} 已关闭`);
  }

  /** 启用自动保存 */
  public enableAutoSave(projectId: string, interval = 500): void {
    this.disableAutoSave(projectId);

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

    this.autoSaveConfigs.set(projectId, { enabled: true, interval, timerId });
    console.info(`项目 ${projectId} 启用自动保存，间隔: ${interval}ms`);
  }

  /** 禁用自动保存 */
  public disableAutoSave(projectId: string): void {
    const config = this.autoSaveConfigs.get(projectId);
    if (config?.timerId) {
      clearInterval(config.timerId);
      this.autoSaveConfigs.delete(projectId);
    }
  }

  public getCachedGraph(projectId: string): WorkflowGraph | null {
    return this.cache.get(projectId)?.data ?? null;
  }

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
        dirty: true,
      });
    }
  }

  public markDirty(projectId: string): void {
    const cached = this.cache.get(projectId);
    if (cached) cached.dirty = true;
  }

  public isDirty(projectId: string): boolean {
    return this.cache.get(projectId)?.dirty ?? false;
  }

  public invalidateCache(projectId: string): void {
    this.cache.delete(projectId);
  }

  public getOpenProjects(): string[] {
    return Array.from(this.cache.keys());
  }

  public clearAllCache(): void {
    this.autoSaveConfigs.forEach((_, id) => this.disableAutoSave(id));
    this.cache.clear();
  }

  private isDataEqual(data1: WorkflowGraph, data2: WorkflowGraph): boolean {
    try {
      const j1 = JSON.stringify(this.normalizeForComparison(data1));
      const j2 = JSON.stringify(this.normalizeForComparison(data2));
      return j1 === j2;
    } catch {
      return false;
    }
  }

  private normalizeForComparison(data: WorkflowGraph): Partial<WorkflowGraph> {
    const { updatedAt, ...rest } = data;
    return rest;
  }
}
