/**
 * 工作流图谱类型定义
 */

/**
 * 权限状态类型
 */
export type PermissionState = 'granted' | 'denied' | 'prompt';

/**
 * 节点类型
 */
export type NodeType = 'start' | 'task' | 'decision' | 'parallel' | 'end';

/**
 * 节点状态
 */
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * 边类型
 */
export type EdgeType = 'sequence' | 'conditional' | 'parallel';

/**
 * 资产角色
 */
export type AssetRole = 'input' | 'output' | 'reference' | 'template';

/**
 * 输出类型
 */
export type OutputType = 'file' | 'data' | 'artifact';

/**
 * 位置信息
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * 指令信息
 */
export interface Instructions {
  guide: string;
  logic: string;
  criteria: string;
}

/**
 * 资产信息
 */
export interface Asset {
  assetId: string;
  path: string;
  role: AssetRole;
  description?: string;
}

/**
 * 输出信息
 */
export interface Output {
  outputId: string;
  name: string;
  type: OutputType;
  path?: string;
  description?: string;
}

/**
 * 任务节点
 */
export interface TaskNode {
  nodeId: string;
  type: NodeType;
  name: string;
  description?: string;
  instructions: Instructions;
  dependencies: string[];
  assets: Asset[];
  outputs: Output[];
  status: NodeStatus;
  position?: Position;
  metadata?: Record<string, unknown>;
}

/**
 * 边连接
 */
export interface Edge {
  edgeId: string;
  source: string;
  target: string;
  type: EdgeType;
  condition?: string;
  label?: string;
}

/**
 * 工作流设置
 */
export interface WorkflowSettings {
  autoSave: boolean;
  autoSaveInterval: number;
  enableBackup: boolean;
  maxBackups: number;
}

/**
 * 工作流图
 */
export interface WorkflowGraph {
  projectId: string;
  projectName: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  nodes: TaskNode[];
  edges: Edge[];
  settings?: WorkflowSettings;
}

/**
 * 验证错误
 */
export interface ValidationError {
  path: string;
  message: string;
  code?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}
