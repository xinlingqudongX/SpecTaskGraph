/**
 * 工作流图谱数据验证Schema
 * 
 * 使用Zod库定义工作流图谱数据的验证规则，确保数据结构的正确性和完整性。
 * 这些Schema用于运行时数据验证，防止无效数据的存储和处理。
 */

import { z } from 'zod';

/**
 * 节点类型Schema
 */
export const NodeTypeSchema = z.enum([
  'start',
  'task', 
  'decision',
  'parallel',
  'end'
]);

/**
 * 节点状态Schema
 */
export const NodeStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped'
]);

/**
 * 资产角色Schema
 */
export const AssetRoleSchema = z.enum([
  'input',
  'output',
  'reference',
  'template'
]);

/**
 * 输出类型Schema
 */
export const OutputTypeSchema = z.enum([
  'file',
  'data',
  'artifact'
]);

/**
 * 边类型Schema
 */
export const EdgeTypeSchema = z.enum([
  'sequence',
  'conditional',
  'parallel'
]);

/**
 * 任务指令Schema
 */
export const InstructionsSchema = z.object({
  guide: z.string().min(1, '指南不能为空'),
  logic: z.string().min(1, '执行逻辑不能为空'),
  criteria: z.string().min(1, '验收标准不能为空')
});

/**
 * 文件资产Schema
 */
export const AssetSchema = z.object({
  assetId: z.string().min(1, '资产ID不能为空'),
  path: z.string().min(1, '文件路径不能为空'),
  role: AssetRoleSchema,
  description: z.string().optional()
});

/**
 * 节点输出Schema
 */
export const OutputSchema = z.object({
  outputId: z.string().min(1, '输出ID不能为空'),
  name: z.string().min(1, '输出名称不能为空'),
  type: OutputTypeSchema,
  path: z.string().optional(),
  description: z.string().optional()
});

/**
 * 节点位置Schema
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number()
});

/**
 * 任务节点Schema
 */
export const TaskNodeSchema = z.object({
  nodeId: z.string()
    .min(1, '节点ID不能为空')
    .regex(/^[a-zA-Z0-9-_]+$/, '节点ID只能包含字母、数字、连字符和下划线'),
  type: NodeTypeSchema,
  name: z.string()
    .min(1, '节点名称不能为空')
    .max(100, '节点名称不能超过100个字符'),
  description: z.string().optional(),
  instructions: InstructionsSchema,
  dependencies: z.array(z.string()).default([]),
  assets: z.array(AssetSchema).default([]),
  outputs: z.array(OutputSchema).default([]),
  status: NodeStatusSchema.default('pending'),
  position: PositionSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

/**
 * 边连接Schema
 */
export const EdgeSchema = z.object({
  edgeId: z.string().min(1, '边ID不能为空'),
  source: z.string().min(1, '源节点ID不能为空'),
  target: z.string().min(1, '目标节点ID不能为空'),
  type: EdgeTypeSchema,
  condition: z.string().optional(),
  label: z.string().optional()
});

/**
 * 工作流配置Schema
 */
export const WorkflowSettingsSchema = z.object({
  autoSave: z.boolean().default(true),
  autoSaveInterval: z.number().min(100, '自动保存间隔不能少于100毫秒').default(500),
  enableBackup: z.boolean().default(true),
  maxBackups: z.number().min(1, '最大备份数量不能少于1').default(5)
});

/**
 * 工作流图Schema
 */
export const WorkflowGraphSchema = z.object({
  projectId: z.string()
    .min(1, '项目ID不能为空')
    .regex(/^[a-zA-Z0-9-_]+$/, '项目ID只能包含字母、数字、连字符和下划线'),
  projectName: z.string()
    .min(1, '项目名称不能为空')
    .max(100, '项目名称不能超过100个字符'),
  version: z.string()
    .regex(/^\d+\.\d+\.\d+$/, '版本号必须符合语义化版本格式（如1.0.0）'),
  createdAt: z.string().datetime('创建时间必须是有效的ISO 8601格式'),
  updatedAt: z.string().datetime('更新时间必须是有效的ISO 8601格式'),
  nodes: z.array(TaskNodeSchema).min(1, '工作流图至少需要包含一个节点'),
  edges: z.array(EdgeSchema).default([]),
  settings: WorkflowSettingsSchema.optional()
}).refine((data) => {
  // 验证引用完整性：所有边的source和target必须指向存在的节点
  const nodeIds = new Set(data.nodes.map(node => node.nodeId));
  const invalidEdges = data.edges.filter(edge => 
    !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
  );
  return invalidEdges.length === 0;
}, {
  message: '边的源节点或目标节点不存在',
  path: ['edges']
}).refine((data) => {
  // 验证依赖关系：所有dependencies必须指向存在的节点
  const nodeIds = new Set(data.nodes.map(node => node.nodeId));
  const invalidDependencies = data.nodes.some(node =>
    node.dependencies.some(depId => !nodeIds.has(depId))
  );
  return !invalidDependencies;
}, {
  message: '节点依赖引用了不存在的节点',
  path: ['nodes']
}).refine((data) => {
  // 验证节点ID唯一性
  const nodeIds = data.nodes.map(node => node.nodeId);
  const uniqueNodeIds = new Set(nodeIds);
  return nodeIds.length === uniqueNodeIds.size;
}, {
  message: '节点ID必须唯一',
  path: ['nodes']
}).refine((data) => {
  // 验证边ID唯一性
  const edgeIds = data.edges.map(edge => edge.edgeId);
  const uniqueEdgeIds = new Set(edgeIds);
  return edgeIds.length === uniqueEdgeIds.size;
}, {
  message: '边ID必须唯一',
  path: ['edges']
});

/**
 * Kiro配置Schema
 */
export const KiroConfigSchema = z.object({
  currentProject: z.string().min(1, '当前项目ID不能为空'),
  workflowPath: z.string().min(1, '工作流文件路径不能为空'),
  schemaVersion: z.string()
    .regex(/^\d+\.\d+\.\d+$/, 'Schema版本号必须符合语义化版本格式'),
  lastModified: z.string().datetime('最后修改时间必须是有效的ISO 8601格式')
});

/**
 * 验证错误Schema
 */
export const ValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional()
});

/**
 * 验证结果Schema
 */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema).optional()
});

/**
 * 完整性问题Schema
 */
export const IntegrityIssueSchema = z.object({
  type: z.enum(['missing_reference', 'circular_dependency', 'orphaned_node', 'invalid_edge']),
  message: z.string(),
  nodeId: z.string().optional(),
  edgeId: z.string().optional()
});

/**
 * 完整性检查结果Schema
 */
export const IntegrityResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(IntegrityIssueSchema)
});

/**
 * 引用检查结果Schema
 */
export const ReferenceResultSchema = z.object({
  valid: z.boolean(),
  missingReferences: z.array(z.string()),
  orphanedNodes: z.array(z.string())
});

// 导出类型推断
export type NodeType = z.infer<typeof NodeTypeSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type AssetRole = z.infer<typeof AssetRoleSchema>;
export type OutputType = z.infer<typeof OutputTypeSchema>;
export type EdgeType = z.infer<typeof EdgeTypeSchema>;
export type Instructions = z.infer<typeof InstructionsSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Output = z.infer<typeof OutputSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type TaskNode = z.infer<typeof TaskNodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type WorkflowSettings = z.infer<typeof WorkflowSettingsSchema>;
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type KiroConfig = z.infer<typeof KiroConfigSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type IntegrityIssue = z.infer<typeof IntegrityIssueSchema>;
export type IntegrityResult = z.infer<typeof IntegrityResultSchema>;
export type ReferenceResult = z.infer<typeof ReferenceResultSchema>;