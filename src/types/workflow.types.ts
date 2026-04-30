/**
 * 工作流图谱数据类型定义
 *
 * 本文件定义了工作流图谱系统的核心数据类型，包括：
 * - WorkflowGraph: 完整的工作流图数据结构
 * - TaskNode: 任务节点定义
 * - Edge: 节点连接关系
 * - 相关的枚举类型和辅助接口
 */

/**
 * 节点类型枚举
 */
export type NodeType =
  | 'start' // 起始节点
  | 'task' // 普通任务节点
  | 'decision' // 决策节点
  | 'parallel' // 并行节点
  | 'end'; // 结束节点

/**
 * 节点执行状态枚举
 */
export type NodeStatus =
  | 'pending' // 待执行
  | 'in_progress' // 执行中
  | 'completed' // 已完成
  | 'failed' // 失败
  | 'review_needed'; // 需要审核

/**
 * 资产角色枚举
 */
export type AssetRole =
  | 'input' // 输入文件
  | 'output' // 输出文件
  | 'reference' // 参考文件
  | 'template'; // 模板文件

/**
 * 输出类型枚举
 */
export type OutputType =
  | 'file' // 文件输出
  | 'data' // 数据输出
  | 'artifact'; // 构建产物

/**
 * 边类型枚举
 */
export type EdgeType =
  | 'sequence' // 顺序执行
  | 'conditional' // 条件执行
  | 'parallel'; // 并行执行

/**
 * 任务指令接口
 * 包含任务执行的详细指导信息
 */
export interface Instructions {
  /** 需求描述：任务的需求说明 */
  requirement: string;
  /** AI提示词（可选） */
  prompt?: string;
}

/**
 * 文件资产接口
 * 描述与任务节点关联的文件资源
 */
export interface Asset {
  /** 资产唯一标识符 */
  assetId: string;
  /** 文件相对路径 */
  path: string;
  /** 资产在任务中的角色 */
  role: AssetRole;
  /** 资产描述（可选） */
  description?: string;
}

/**
 * 节点输出接口
 * 定义任务节点的输出规范
 */
export interface Output {
  /** 输出唯一标识符 */
  outputId: string;
  /** 输出名称 */
  name: string;
  /** 输出类型 */
  type: OutputType;
  /** 输出文件路径（可选） */
  path?: string;
  /** 输出描述（可选） */
  description?: string;
}

/**
 * 节点位置接口
 * 用于UI渲染时的节点位置信息
 */
export interface Position {
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
}

/**
 * 任务节点接口
 * 工作流图中的单个任务单元
 */
export interface TaskNode {
  /** 节点唯一标识符 */
  nodeId: string;
  /** 节点类型 */
  type: NodeType;
  /** 节点名称 */
  name: string;
  /** 节点描述（可选） */
  description?: string;
  /** 任务执行指令 */
  instructions: Instructions;
  /** 依赖的前置节点ID列表 */
  dependencies: string[];
  /** 关联的文件资产列表 */
  assets: Asset[];
  /** 节点输出定义列表 */
  outputs: Output[];
  /** 节点当前执行状态 */
  status: NodeStatus;
  /** 节点在画布上的位置（可选） */
  position?: Position;
  /** 扩展元数据（可选） */
  metadata?: Record<string, unknown>;
}

/**
 * 边连接接口
 * 描述节点之间的连接关系
 */
export interface Edge {
  /** 边唯一标识符 */
  edgeId: string;
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边类型 */
  type: EdgeType;
  /** 条件表达式（用于决策节点，可选） */
  condition?: string;
  /** 边标签（可选） */
  label?: string;
}

/**
 * 工作流配置接口
 * 工作流的全局配置选项
 */
export interface WorkflowSettings {
  /** 是否启用自动保存 */
  autoSave: boolean;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval: number;
  /** 是否启用备份 */
  enableBackup: boolean;
  /** 最大备份数量 */
  maxBackups: number;
}

/**
 * 工作流图接口
 * 完整的工作流图数据结构
 */
export interface WorkflowGraph {
  /** 项目唯一标识符 */
  projectId: string;
  /** 项目名称 */
  projectName: string;
  /** Schema版本号 */
  version: string;
  /** 创建时间（ISO 8601格式） */
  createdAt: string;
  /** 更新时间（ISO 8601格式） */
  updatedAt: string;
  /** 任务节点列表 */
  nodes: TaskNode[];
  /** 边连接列表 */
  edges: Edge[];
  /** 工作流配置（可选） */
  settings?: WorkflowSettings;
}

/**
 * Kiro配置接口
 * AI代理读取的配置文件结构
 */
export interface KiroConfig {
  /** 当前活动项目ID */
  currentProject: string;
  /** 工作流文件路径 */
  workflowPath: string;
  /** Schema版本 */
  schemaVersion: string;
  /** 最后修改时间 */
  lastModified: string;
}

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  /** 验证错误列表（如果有） */
  errors?: ValidationError[];
}

/**
 * 验证错误接口
 */
export interface ValidationError {
  /** 错误字段路径 */
  path: string;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code?: string;
}

/**
 * 完整性检查结果接口
 */
export interface IntegrityResult {
  /** 完整性检查是否通过 */
  valid: boolean;
  /** 发现的问题列表 */
  issues: IntegrityIssue[];
}

/**
 * 完整性问题接口
 */
export interface IntegrityIssue {
  /** 问题类型 */
  type:
    | 'missing_reference'
    | 'circular_dependency'
    | 'orphaned_node'
    | 'invalid_edge';
  /** 问题描述 */
  message: string;
  /** 相关节点ID */
  nodeId?: string;
  /** 相关边ID */
  edgeId?: string;
}

/**
 * 引用检查结果接口
 */
export interface ReferenceResult {
  /** 引用检查是否通过 */
  valid: boolean;
  /** 缺失的引用列表 */
  missingReferences: string[];
  /** 孤立的节点列表 */
  orphanedNodes: string[];
}
