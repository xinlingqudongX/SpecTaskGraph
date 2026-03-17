/**
 * 项目 API 服务
 *
 * 封装后端 /api/v1/project 的 REST 调用，提供统一的服务端项目管理接口。
 */

import type { WorkflowGraph } from '../types/workflow.types';

interface ServerProject {
  id: string;
  name: string;
  description?: string;
  basePath: string;
  techStack: Record<string, unknown>;
  workflowJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class ProjectApiService {
  private static instance: ProjectApiService;
  private readonly baseUrl = '/api/v1/project';

  public static getInstance(): ProjectApiService {
    if (!ProjectApiService.instance) {
      ProjectApiService.instance = new ProjectApiService();
    }
    return ProjectApiService.instance;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const hasBody = options?.body != null;
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`API 请求失败 (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  /** 获取所有项目列表（按更新时间倒序） */
  async listProjects(): Promise<ServerProject[]> {
    return this.request<ServerProject[]>(this.baseUrl);
  }

  /** 获取单个项目（含 workflowJson） */
  async getProject(id: string): Promise<ServerProject> {
    return this.request<ServerProject>(`${this.baseUrl}/${id}`);
  }

  /** 创建新项目，带空白 workflowJson 初始值 */
  async createProject(name: string, description?: string): Promise<ServerProject> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const workflowJson: WorkflowGraph = {
      projectId: id,
      projectName: name,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    };
    return this.request<ServerProject>(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({ id, name, description, workflowJson }),
    });
  }

  /** 保存工作流数据到服务器 */
  async saveWorkflow(id: string, graph: WorkflowGraph): Promise<void> {
    await this.request(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ workflowJson: graph }),
    });
  }

  /** 删除项目 */
  async deleteProject(id: string): Promise<void> {
    await this.request(`${this.baseUrl}/${id}`, { method: 'DELETE' });
  }

  /**
   * 从 ServerProject 中提取 WorkflowGraph。
   * 若 workflowJson 为空则返回以服务端数据补全的空白图。
   */
  extractWorkflowGraph(project: ServerProject): WorkflowGraph {
    if (project.workflowJson && typeof project.workflowJson === 'object') {
      return project.workflowJson as unknown as WorkflowGraph;
    }
    const now = new Date().toISOString();
    return {
      projectId: project.id,
      projectName: project.name,
      version: '1.0.0',
      createdAt: project.createdAt ?? now,
      updatedAt: project.updatedAt ?? now,
      nodes: [],
      edges: [],
    };
  }
}
