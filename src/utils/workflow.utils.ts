/**
 * 工作流图谱工具函数
 * 
 * 提供工作流图谱数据处理的通用工具函数，包括ID生成、时间戳处理、
 * 数据转换、验证辅助等功能。
 */

import { WorkflowGraph, TaskNode, Edge, KiroConfig } from '../types/workflow.types';
import { SCHEMA_VERSION, DEFAULT_WORKFLOW_SETTINGS } from '../constants/workflow.constants';

/**
 * 生成唯一ID
 * @param prefix ID前缀
 * @returns 唯一ID字符串
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * 生成项目ID
 * @param projectName 项目名称
 * @returns 项目ID
 */
export function generateProjectId(projectName: string): string {
  const sanitized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 20);
  return `${sanitized}-${Date.now().toString(36)}`;
}

/**
 * 生成节点ID
 * @param nodeType 节点类型
 * @returns 节点ID
 */
export function generateNodeId(nodeType: string): string {
  return generateId(nodeType);
}

/**
 * 生成边ID
 * @param source 源节点ID
 * @param target 目标节点ID
 * @returns 边ID
 */
export function generateEdgeId(source: string, target: string): string {
  return `edge-${source}-${target}-${Date.now().toString(36)}`;
}

/**
 * 获取当前ISO时间戳
 * @returns ISO 8601格式的时间戳字符串
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 创建空的工作流图
 * @param projectId 项目ID
 * @param projectName 项目名称
 * @returns 空的工作流图对象
 */
export function createEmptyWorkflowGraph(
  projectId: string,
  projectName: string
): WorkflowGraph {
  const now = getCurrentTimestamp();
  
  return {
    projectId,
    projectName,
    version: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
    settings: { ...DEFAULT_WORKFLOW_SETTINGS }
  };
}

/**
 * 创建起始节点
 * @param name 节点名称
 * @returns 起始节点对象
 */
export function createStartNode(name: string = '开始'): TaskNode {
  return {
    nodeId: generateNodeId('start'),
    type: 'start',
    name,
    instructions: {
      guide: '工作流的起始点',
      logic: '标记工作流开始执行',
      criteria: '无需验收标准'
    },
    dependencies: [],
    assets: [],
    outputs: [],
    status: 'pending'
  };
}

/**
 * 创建结束节点
 * @param name 节点名称
 * @returns 结束节点对象
 */
export function createEndNode(name: string = '结束'): TaskNode {
  return {
    nodeId: generateNodeId('end'),
    type: 'end',
    name,
    instructions: {
      guide: '工作流的结束点',
      logic: '标记工作流执行完成',
      criteria: '所有前置任务已完成'
    },
    dependencies: [],
    assets: [],
    outputs: [],
    status: 'pending'
  };
}

/**
 * 更新工作流图的时间戳
 * @param graph 工作流图对象
 * @returns 更新后的工作流图对象
 */
export function updateTimestamp(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    updatedAt: getCurrentTimestamp()
  };
}

/**
 * 检查节点ID是否唯一
 * @param nodes 节点列表
 * @param nodeId 要检查的节点ID
 * @param excludeIndex 排除的索引（用于编辑时检查）
 * @returns 是否唯一
 */
export function isNodeIdUnique(
  nodes: TaskNode[],
  nodeId: string,
  excludeIndex?: number
): boolean {
  return !nodes.some((node, index) => 
    node.nodeId === nodeId && index !== excludeIndex
  );
}

/**
 * 检查边ID是否唯一
 * @param edges 边列表
 * @param edgeId 要检查的边ID
 * @param excludeIndex 排除的索引（用于编辑时检查）
 * @returns 是否唯一
 */
export function isEdgeIdUnique(
  edges: Edge[],
  edgeId: string,
  excludeIndex?: number
): boolean {
  return !edges.some((edge, index) => 
    edge.edgeId === edgeId && index !== excludeIndex
  );
}

/**
 * 查找节点依赖关系
 * @param graph 工作流图
 * @param nodeId 节点ID
 * @returns 依赖的节点列表
 */
export function findNodeDependencies(
  graph: WorkflowGraph,
  nodeId: string
): TaskNode[] {
  const node = graph.nodes.find(n => n.nodeId === nodeId);
  if (!node) return [];
  
  return node.dependencies
    .map(depId => graph.nodes.find(n => n.nodeId === depId))
    .filter((n): n is TaskNode => n !== undefined);
}

/**
 * 查找节点的后续节点
 * @param graph 工作流图
 * @param nodeId 节点ID
 * @returns 后续节点列表
 */
export function findNodeSuccessors(
  graph: WorkflowGraph,
  nodeId: string
): TaskNode[] {
  const successorIds = graph.nodes
    .filter(node => node.dependencies.includes(nodeId))
    .map(node => node.nodeId);
    
  return successorIds
    .map(id => graph.nodes.find(n => n.nodeId === id))
    .filter((n): n is TaskNode => n !== undefined);
}

/**
 * 检查是否存在循环依赖
 * @param graph 工作流图
 * @returns 是否存在循环依赖
 */
export function hasCircularDependency(graph: WorkflowGraph): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function dfs(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const node = graph.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        if (dfs(depId)) return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  }
  
  for (const node of graph.nodes) {
    if (!visited.has(node.nodeId)) {
      if (dfs(node.nodeId)) return true;
    }
  }
  
  return false;
}

/**
 * 查找孤立节点（没有连接的节点）
 * @param graph 工作流图
 * @returns 孤立节点列表
 */
export function findOrphanedNodes(graph: WorkflowGraph): TaskNode[] {
  const connectedNodes = new Set<string>();
  
  // 从边中收集连接的节点
  graph.edges.forEach(edge => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });
  
  // 从依赖关系中收集连接的节点
  graph.nodes.forEach(node => {
    if (node.dependencies.length > 0) {
      connectedNodes.add(node.nodeId);
      node.dependencies.forEach(depId => connectedNodes.add(depId));
    }
  });
  
  // 查找未连接的节点
  return graph.nodes.filter(node => !connectedNodes.has(node.nodeId));
}

/**
 * 验证引用完整性
 * @param graph 工作流图
 * @returns 缺失的引用列表
 */
export function findMissingReferences(graph: WorkflowGraph): string[] {
  const nodeIds = new Set(graph.nodes.map(node => node.nodeId));
  const missingRefs: string[] = [];
  
  // 检查节点依赖引用
  graph.nodes.forEach(node => {
    node.dependencies.forEach(depId => {
      if (!nodeIds.has(depId)) {
        missingRefs.push(`节点 ${node.nodeId} 依赖不存在的节点 ${depId}`);
      }
    });
  });
  
  // 检查边引用
  graph.edges.forEach(edge => {
    if (!nodeIds.has(edge.source)) {
      missingRefs.push(`边 ${edge.edgeId} 的源节点 ${edge.source} 不存在`);
    }
    if (!nodeIds.has(edge.target)) {
      missingRefs.push(`边 ${edge.edgeId} 的目标节点 ${edge.target} 不存在`);
    }
  });
  
  return missingRefs;
}

/**
 * 深度克隆工作流图对象
 * @param graph 工作流图
 * @returns 克隆的工作流图对象
 */
export function cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
  return JSON.parse(JSON.stringify(graph));
}

/**
 * 比较两个工作流图是否相等
 * @param graph1 工作流图1
 * @param graph2 工作流图2
 * @returns 是否相等
 */
export function isWorkflowGraphEqual(
  graph1: WorkflowGraph,
  graph2: WorkflowGraph
): boolean {
  // 忽略updatedAt字段的比较
  const { updatedAt: _, ...g1 } = graph1;
  const { updatedAt: __, ...g2 } = graph2;
  
  return JSON.stringify(g1) === JSON.stringify(g2);
}

/**
 * 创建Kiro配置对象
 * @param projectId 项目ID
 * @param workflowPath 工作流文件路径
 * @returns Kiro配置对象
 */
export function createKiroConfig(
  projectId: string,
  workflowPath: string
): KiroConfig {
  return {
    currentProject: projectId,
    workflowPath,
    schemaVersion: SCHEMA_VERSION,
    lastModified: getCurrentTimestamp()
  };
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}