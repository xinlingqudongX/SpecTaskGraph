/**
 * 项目 API 服务
 *
 * 封装后端 /api/v1/project 的 REST 调用，提供统一的服务端项目管理接口。
 */

import type { WorkflowGraph, TaskNode, Edge, NodeStatus } from '../types/workflow.types';

// crypto.randomUUID 在非 HTTPS / 非 localhost 环境下可能不存在，降级使用随机数
function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface NodeTreeItem {
  nodeId: string;
  nodeType: string;
  parentNodeId: string | null;
  sortOrder: number;
  requirement: string;
  prompt?: string;
  agentRoleId: string | null;
  attributes: Record<string, unknown>;
  status: NodeStatus;
  createdAt: string;
  updatedAt: string;
  children: NodeTreeItem[];
}

export interface ServerProject {
  id: string;
  name: string;
  description?: string;
  basePath: string;
  techStack: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  nodes?: NodeTreeItem[];
}

export class ProjectApiService {
  private static instance: ProjectApiService;
  private readonly baseUrl = '/api/v1/project';
  private readonly workflowUrl = '/api/v1/workflow';

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

  /** 获取单个项目（含节点树） */
  async getProject(id: string): Promise<ServerProject> {
    return this.request<ServerProject>(`${this.baseUrl}/${id}`);
  }

  /** 创建新项目，并自动同步一个默认根节点 */
  async createProject(
    name: string,
    description?: string,
  ): Promise<ServerProject> {
    const id = generateId();
    const project = await this.request<ServerProject>(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({ id, name, description }),
    });
    return project;
  }

  /** 同步工作流节点到服务器（upsert），payload 结构与 NodeTreeItem 对齐 */
  async syncWorkflow(
    projectId: string,
    nodes: Array<
      Pick<
        NodeTreeItem,
        | 'nodeId'
        | 'nodeType'
        | 'parentNodeId'
        | 'sortOrder'
        | 'requirement'
        | 'agentRoleId'
        | 'attributes'
        | 'status'
      > & { prompt?: string }
    >,
  ): Promise<void> {
    await this.request(`${this.workflowUrl}/${projectId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ nodes }),
    });
  }

  /** 保存工作流数据到服务器，将画布 graph 转换为符合 NodeTreeItem 结构的 payload */
  async saveWorkflow(projectId: string, graph: WorkflowGraph): Promise<void> {
    // 优先使用 _visualType 保留具体节点类型；没有时再退回到 workflow 语义类型
    const toBackendType = (type: string, visualType?: string): string => {
      const m: Record<string, string> = {
        // workflow.types NodeType（缺少视觉类型时的兜底）
        start: 'start', task: 'text', decision: 'decision', parallel: 'parallel', end: 'text',
        // logicflow.types NodeType / 视觉类型
        root: 'start', text: 'text', property: 'decision', file: 'file',
        image: 'image', video: 'video', audio: 'audio',
        // LogicFlow 注册类名（异常路径兜底）
        RootNode: 'start', TextNode: 'text', PropertyNode: 'decision',
        FileNode: 'file', ImageNode: 'image', VideoNode: 'video', AudioNode: 'audio',
      };
      return m[visualType ?? ''] ?? m[type] ?? 'text';
    };

    // 将完整边数据（含样式和路径点）存入根节点 attributes，加载时通过 extractWorkflowGraph 还原
    const rootNodeId =
      graph.nodes.find(n => n.dependencies.length === 0)?.nodeId ??
      graph.nodes[0]?.nodeId;

    const nodes = graph.nodes.map((n) => ({
      nodeId: n.nodeId,
      nodeType: toBackendType(n.type, typeof n.metadata?._visualType === 'string' ? n.metadata._visualType : undefined),
      parentNodeId: n.dependencies[0] ?? null,
      sortOrder: typeof n.metadata?.sortOrder === 'number' ? n.metadata.sortOrder : 0,
      requirement: n.instructions.requirement ?? '',
      prompt: n.instructions.prompt,
      agentRoleId: typeof n.metadata?.agentRoleId === 'string' ? n.metadata.agentRoleId : null,
      status: n.status ?? 'pending',
      attributes: {
        name: n.name,
        ...(n.metadata ?? {}),
        ...(n.position
          ? { position: { x: n.position.x, y: n.position.y } }
          : {}),
        // 根节点承载全图边数据（样式+路径点），后覆盖 metadata 中的旧值
        ...(n.nodeId === rootNodeId ? { _graphEdges: graph.edges } : {}),
      },
    }));
    await this.syncWorkflow(projectId, nodes);
  }

  /** 删除项目 */
  async deleteProject(id: string): Promise<void> {
    await this.request(`${this.baseUrl}/${id}`, { method: 'DELETE' });
  }

  /**
   * 从 ServerProject 中提取 WorkflowGraph。
   * 将后端返回的 NodeTreeItem 树结构展平为 TaskNode[] + Edge[]。
   * 对没有保存位置的节点使用 Reingold-Tilford 子树布局，避免节点重叠。
   */
  extractWorkflowGraph(project: ServerProject): WorkflowGraph {
    const now = new Date().toISOString();
    const nodes: TaskNode[] = [];
    const edges: Edge[] = [];
    const existingNodeIds = new Set<string>();
    // 自动布局计算出的坐标，只在 attributes.position 为空时使用
    const computedPositions = new Map<string, { x: number; y: number }>();

    const H_SPACING = 200; // 相邻叶子节点的水平间距
    const V_SPACING = 160; // 层级间垂直间距

    // 计算子树的叶子节点数量，用于均匀分布父节点下的子节点
    function subtreeLeafCount(item: NodeTreeItem): number {
      if (!item.children?.length) return 1;
      return item.children.reduce((sum, c) => sum + subtreeLeafCount(c), 0);
    }

    /**
     * 自顶向下分配坐标。
     * centerX 是这一批节点整体的水平中心，y 是当前层的纵坐标。
     * 已有 attributes.position 的节点保留原坐标，并以其实际 x 作为子树的中心。
     */
    function layoutSubtree(items: NodeTreeItem[], centerX: number, y: number) {
      const totalLeaves = items.reduce((sum, item) => sum + subtreeLeafCount(item), 0);
      // 最左侧叶子的起始 x
      let curX = centerX - ((totalLeaves - 1) / 2) * H_SPACING;

      for (const item of items) {
        const leaves = subtreeLeafCount(item);
        const computedX = curX + ((leaves - 1) / 2) * H_SPACING;
        const savedPos = (item.attributes as any)?.position as { x: number; y: number } | undefined;

        if (!savedPos) {
          computedPositions.set(item.nodeId, { x: Math.round(computedX), y });
        }

        if (item.children?.length) {
          // 子节点以本节点实际 x 为中心向下展开
          const actualX = savedPos ? savedPos.x : computedX;
          const actualY = savedPos ? savedPos.y : y;
          layoutSubtree(item.children, actualX, actualY + V_SPACING);
        }

        curX += leaves * H_SPACING;
      }
    }

    // 后端 nodeType → workflow.types.ts NodeType 映射
    // 覆盖所有可能出现的值：后端语义类型、logicflow.types 类型、LogicFlow 注册类名
    const typeMap: Record<string, TaskNode['type']> = {
      // 后端原始语义类型
      start: 'start', feature: 'task', task: 'task',
      decision: 'decision', parallel: 'parallel', end: 'end',
      // logicflow.types NodeType（曾被错误保存到服务器的中间态）
      root: 'start', text: 'task', property: 'decision',
      file: 'task', image: 'task', video: 'task', audio: 'task',
      // LogicFlow 注册类名（曾被错误保存到服务器的异常态）
      RootNode: 'start', TextNode: 'task', PropertyNode: 'decision',
      FileNode: 'task', ImageNode: 'task', VideoNode: 'task', AudioNode: 'task',
    };
    const visualTypeMap: Record<string, string | undefined> = {
      start: 'root',
      decision: 'property',
      text: 'text',
      file: 'file',
      image: 'image',
      video: 'video',
      audio: 'audio',
      root: 'root',
      property: 'property',
      RootNode: 'root',
      TextNode: 'text',
      PropertyNode: 'property',
      FileNode: 'file',
      ImageNode: 'image',
      VideoNode: 'video',
      AudioNode: 'audio',
    };

    if (project.nodes?.length) {
      // 确定布局原点：优先取第一个根节点已有的位置，否则使用默认坐标
      const firstRoot = project.nodes[0];
      const rootSavedPos = (firstRoot?.attributes as any)?.position as { x: number; y: number } | undefined;
      const originX = rootSavedPos?.x ?? 600;
      const originY = rootSavedPos?.y ?? 100;
      layoutSubtree(project.nodes, originX, originY);
    }

    function flatten(items: NodeTreeItem[]) {
      for (const item of items) {
        // 优先从根节点提取保存的边快照；_graphEdges 不存入节点 metadata 避免污染
        if ((item.attributes as any)._graphEdges && !savedEdgesRef) {
          savedEdgesRef = (item.attributes as any)._graphEdges as Edge[];
        }
        // 显式提取 _visualType：保存时写入的 logicflow 视觉类型（image/video/audio/file/text/root）
        const { position, name: attrName, _visualType, _graphEdges: _ignored, ...restAttrs } = item.attributes as any;
        // 优先使用手动保存的位置，其次使用布局算法计算的坐标
        const resolvedPosition = (position as { x: number; y: number } | undefined)
          ?? computedPositions.get(item.nodeId);

        const resolvedVisualType = (_visualType as string | undefined) ?? visualTypeMap[item.nodeType];
        nodes.push({
          nodeId: item.nodeId,
          type: typeMap[item.nodeType] ?? 'task',
          name: (attrName as string) || item.nodeId,
          instructions: {
            requirement: item.requirement ?? '',
            prompt: item.prompt ?? undefined,
          },
          dependencies: item.parentNodeId ? [item.parentNodeId] : [],
          assets: [],
          outputs: [],
          status: (item.status as NodeStatus) ?? 'pending',
          position: resolvedPosition,
          // _visualType 显式保留，convertToEditorFormat 用它恢复正确的渲染类型
          metadata: {
            sortOrder: item.sortOrder ?? 0,
            ...(item.agentRoleId ? { agentRoleId: item.agentRoleId } : {}),
            ...(resolvedVisualType ? { _visualType: resolvedVisualType } : {}),
            ...restAttrs,
          },
        });
        existingNodeIds.add(item.nodeId);

        if (item.parentNodeId) {
          edges.push({
            edgeId: `${item.parentNodeId}->${item.nodeId}`,
            source: item.parentNodeId,
            target: item.nodeId,
            type: 'sequence',
          });
        }

        if (item.children?.length) {
          flatten(item.children);
        }
      }
    }

    // 遍历节点时收集根节点存储的边快照，flatten 结束后用于还原样式和路径点
    let savedEdgesRef: Edge[] | undefined;

    if (project.nodes?.length) {
      flatten(project.nodes);
    }

    // 按 source→target 匹配，将保存的 style/pointsList/startPoint/endPoint 还原到重建的边上
    if (savedEdgesRef) {
      const edgeMap = new Map((savedEdgesRef as Edge[]).map(e => [`${e.source}->${e.target}`, e]));
      for (const edge of edges) {
        const saved = edgeMap.get(`${edge.source}->${edge.target}`);
        if (saved) {
          edge.style = saved.style;
          edge.pointsList = saved.pointsList;
          edge.startPoint = saved.startPoint;
          edge.endPoint = saved.endPoint;
        }
      }
    }

    const missingParentIds = Array.from(
      new Set(
        nodes
          .flatMap((node) => node.dependencies)
          .filter((parentId) => !existingNodeIds.has(parentId)),
      ),
    );

    for (const missingParentId of missingParentIds) {
      const childNodes = nodes.filter((node) => node.dependencies.includes(missingParentId));
      const avgChildX = childNodes.length > 0
        ? childNodes.reduce((sum, node) => sum + (node.position?.x ?? 600), 0) / childNodes.length
        : 600;
      const topChildY = childNodes.length > 0
        ? Math.min(...childNodes.map((node) => node.position?.y ?? 260))
        : 260;
      const isRootLike = missingParentId === 'node_root' || /root/i.test(missingParentId);

      // 后端偶发返回“子节点引用父节点，但父节点缺失”的脏数据。
      // 这里补一个占位节点，保证边渲染时 source/target 都存在，避免 LogicFlow 读取 anchors 报错。
      nodes.push({
        nodeId: missingParentId,
        type: isRootLike ? 'start' : 'task',
        name: isRootLike ? (project.name || '项目根节点') : missingParentId,
        instructions: {
          requirement: '',
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: 'pending',
        position: {
          x: Math.round(avgChildX),
          y: Math.round(topChildY - V_SPACING),
        },
        metadata: {
          _visualType: isRootLike ? 'root' : 'text',
          _generatedFromMissingParent: true,
        },
      });
      existingNodeIds.add(missingParentId);
    }

    return {
      projectId: project.id,
      projectName: project.name,
      version: '1.0.0',
      createdAt: project.createdAt ?? now,
      updatedAt: project.updatedAt ?? now,
      nodes,
      edges,
    };
  }
}
