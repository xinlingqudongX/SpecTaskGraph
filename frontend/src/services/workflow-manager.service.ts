/**
 * 工作流管理服务（无缓存版）
 *
 * 始终以服务器数据为准，不在本地维护任何缓存。
 * 保存操作直接写入服务器，不做本地状态对比。
 */

import { ProjectApiService } from './project-api.service';
import type { WorkflowGraph } from '../types/workflow.types';

export class WorkflowManagerService {
  private static instance: WorkflowManagerService;
  private projectApi: ProjectApiService;

  public static getInstance(): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService();
    }
    return WorkflowManagerService.instance;
  }

  private constructor() {
    this.projectApi = ProjectApiService.getInstance();
  }

  /** 从服务器加载项目 */
  public async openProject(projectId: string): Promise<WorkflowGraph> {
    const serverProject = await this.projectApi.getProject(projectId);
    return this.projectApi.extractWorkflowGraph(serverProject);
  }

  /** 保存项目到服务器 */
  public async saveProject(projectId: string, graph: WorkflowGraph): Promise<void> {
    await this.projectApi.saveWorkflow(projectId, graph);
  }
}
