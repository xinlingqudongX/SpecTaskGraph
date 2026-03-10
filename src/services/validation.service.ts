/**
 * 数据验证服务
 * 
 * 提供工作流图数据的验证功能，包括：
 * - JSON Schema验证
 * - 引用完整性检查
 * - 数据完整性验证
 * - 循环依赖检测
 */

import { z } from 'zod';
import { ValidationError } from '../errors/workflow.errors';
import { VALIDATION_RULES, SCHEMA_VERSION } from '../constants/workflow.constants';
import type { 
  WorkflowGraph, 
  TaskNode, 
  ValidationResult, 
  IntegrityResult, 
  ReferenceResult,
  IntegrityIssue 
} from '../types/workflow.types';

/**
 * Zod Schema定义
 */
const PositionSchema = z.object({
  x: z.number(),
  y: z.number()
});

const InstructionsSchema = z.object({
  guide: z.string().min(1, '指南不能为空'),
  logic: z.string().min(1, '逻辑不能为空'),
  criteria: z.string().min(1, '标准不能为空')
});

const AssetSchema = z.object({
  assetId: z.string().min(1, '资产ID不能为空').max(50, '资产ID长度不能超过50个字符'),
  path: z.string().min(1, '路径不能为空'),
  role: z.enum(['input', 'output', 'reference', 'template'], {
    errorMap: () => ({ message: '资产角色必须是input、output、reference或template之一' })
  }),
  description: z.string().optional()
});

const OutputSchema = z.object({
  outputId: z.string().min(1, '输出ID不能为空').max(50, '输出ID长度不能超过50个字符'),
  name: z.string().min(1, '输出名称不能为空').max(100, '输出名称长度不能超过100个字符'),
  type: z.enum(['file', 'data', 'artifact'], {
    errorMap: () => ({ message: '输出类型必须是file、data或artifact之一' })
  }),
  path: z.string().optional(),
  description: z.string().optional()
});

const TaskNodeSchema = z.object({
  nodeId: z.string()
    .min(1, '节点ID不能为空')
    .max(50, '节点ID长度不能超过50个字符')
    .regex(VALIDATION_RULES.NODE_ID_PATTERN, '节点ID只能包含字母、数字、连字符和下划线'),
  type: z.enum(['start', 'task', 'decision', 'parallel', 'end'], {
    errorMap: () => ({ message: '节点类型必须是start、task、decision、parallel或end之一' })
  }),
  name: z.string().min(1, '节点名称不能为空').max(100, '节点名称长度不能超过100个字符'),
  description: z.string().optional(),
  instructions: InstructionsSchema,
  dependencies: z.array(z.string().regex(VALIDATION_RULES.NODE_ID_PATTERN, '依赖节点ID格式无效')),
  assets: z.array(AssetSchema),
  outputs: z.array(OutputSchema),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped'], {
    errorMap: () => ({ message: '节点状态必须是pending、running、completed、failed或skipped之一' })
  }),
  position: PositionSchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

const EdgeSchema = z.object({
  edgeId: z.string().min(1, '边ID不能为空').max(50, '边ID长度不能超过50个字符'),
  source: z.string().regex(VALIDATION_RULES.NODE_ID_PATTERN, '源节点ID格式无效'),
  target: z.string().regex(VALIDATION_RULES.NODE_ID_PATTERN, '目标节点ID格式无效'),
  type: z.enum(['sequence', 'conditional', 'parallel'], {
    errorMap: () => ({ message: '边类型必须是sequence、conditional或parallel之一' })
  }),
  condition: z.string().optional(),
  label: z.string().optional()
});

const WorkflowSettingsSchema = z.object({
  autoSave: z.boolean().default(true),
  autoSaveInterval: z.number().min(VALIDATION_RULES.MIN_AUTO_SAVE_INTERVAL, '自动保存间隔不能小于100毫秒').default(500),
  enableBackup: z.boolean().default(true),
  maxBackups: z.number().min(VALIDATION_RULES.MIN_BACKUP_COUNT, '备份数量不能小于1').default(5)
});

const WorkflowGraphSchema = z.object({
  projectId: z.string()
    .min(1, '项目ID不能为空')
    .max(50, '项目ID长度不能超过50个字符')
    .regex(VALIDATION_RULES.PROJECT_ID_PATTERN, '项目ID只能包含字母、数字、连字符和下划线'),
  projectName: z.string()
    .min(1, '项目名称不能为空')
    .max(VALIDATION_RULES.MAX_PROJECT_NAME_LENGTH, `项目名称长度不能超过${VALIDATION_RULES.MAX_PROJECT_NAME_LENGTH}个字符`),
  version: z.string().regex(VALIDATION_RULES.VERSION_PATTERN, '版本号格式必须为x.y.z'),
  createdAt: z.string().datetime('创建时间必须是有效的ISO 8601格式'),
  updatedAt: z.string().datetime('更新时间必须是有效的ISO 8601格式'),
  nodes: z.array(TaskNodeSchema).min(1, '工作流图至少需要包含一个节点'),
  edges: z.array(EdgeSchema),
  settings: WorkflowSettingsSchema.optional()
});

/**
 * 数据验证服务类
 */
export class ValidationService {
  private static instance: ValidationService;

  /**
   * 获取单例实例
   */
  public static getInstance(): ValidationService {
    if (!ValidationService.instance) {
      ValidationService.instance = new ValidationService();
    }
    return ValidationService.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {}

  /**
   * 验证工作流图数据
   * 
   * @param data 待验证的数据
   * @returns ValidationResult 验证结果
   */
  public validateWorkflowGraph(data: unknown): ValidationResult {
    try {
      // 使用Zod进行Schema验证
      const result = WorkflowGraphSchema.safeParse(data);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return {
          valid: false,
          errors
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          path: 'root',
          message: `验证过程中发生错误: ${error.message}`,
          code: 'VALIDATION_ERROR'
        }]
      };
    }
  }

  /**
   * 验证任务节点数据
   * 
   * @param data 待验证的节点数据
   * @returns ValidationResult 验证结果
   */
  public validateTaskNode(data: unknown): ValidationResult {
    try {
      const result = TaskNodeSchema.safeParse(data);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return {
          valid: false,
          errors
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          path: 'root',
          message: `节点验证过程中发生错误: ${error.message}`,
          code: 'VALIDATION_ERROR'
        }]
      };
    }
  }

  /**
   * 检查数据完整性
   * 
   * @param graph 工作流图数据
   * @returns IntegrityResult 完整性检查结果
   */
  public checkDataIntegrity(graph: WorkflowGraph): IntegrityResult {
    const issues: IntegrityIssue[] = [];

    try {
      // 1. 检查引用完整性
      const referenceResult = this.checkNodeReferences(graph);
      if (!referenceResult.valid) {
        // 添加缺失引用问题
        referenceResult.missingReferences.forEach(ref => {
          issues.push({
            type: 'missing_reference',
            message: `引用的节点不存在: ${ref}`,
            nodeId: ref
          });
        });

        // 添加孤立节点问题
        referenceResult.orphanedNodes.forEach(nodeId => {
          issues.push({
            type: 'orphaned_node',
            message: `孤立节点（没有被任何边连接）: ${nodeId}`,
            nodeId
          });
        });
      }

      // 2. 检查循环依赖
      const circularDeps = this.detectCircularDependencies(graph);
      circularDeps.forEach(nodeId => {
        issues.push({
          type: 'circular_dependency',
          message: `检测到循环依赖: ${nodeId}`,
          nodeId
        });
      });

      // 3. 检查边的有效性
      const invalidEdges = this.validateEdges(graph);
      invalidEdges.forEach(edge => {
        issues.push({
          type: 'invalid_edge',
          message: `无效的边连接: ${edge.source} -> ${edge.target}`,
          edgeId: edge.edgeId
        });
      });

      // 4. 检查节点ID唯一性
      const duplicateNodeIds = this.findDuplicateNodeIds(graph);
      duplicateNodeIds.forEach(nodeId => {
        issues.push({
          type: 'missing_reference',
          message: `重复的节点ID: ${nodeId}`,
          nodeId
        });
      });

      // 5. 检查边ID唯一性
      const duplicateEdgeIds = this.findDuplicateEdgeIds(graph);
      duplicateEdgeIds.forEach(edgeId => {
        issues.push({
          type: 'invalid_edge',
          message: `重复的边ID: ${edgeId}`,
          edgeId
        });
      });

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error: any) {
      issues.push({
        type: 'missing_reference',
        message: `完整性检查过程中发生错误: ${error.message}`
      });

      return {
        valid: false,
        issues
      };
    }
  }

  /**
   * 检查节点引用完整性
   * 
   * @param graph 工作流图数据
   * @returns ReferenceResult 引用检查结果
   */
  public checkNodeReferences(graph: WorkflowGraph): ReferenceResult {
    const nodeIds = new Set(graph.nodes.map(node => node.nodeId));
    const missingReferences: string[] = [];
    const referencedNodes = new Set<string>();

    // 检查节点依赖引用
    graph.nodes.forEach(node => {
      node.dependencies.forEach(depId => {
        referencedNodes.add(depId);
        if (!nodeIds.has(depId)) {
          missingReferences.push(depId);
        }
      });
    });

    // 检查边引用
    graph.edges.forEach(edge => {
      referencedNodes.add(edge.source);
      referencedNodes.add(edge.target);
      
      if (!nodeIds.has(edge.source)) {
        missingReferences.push(edge.source);
      }
      if (!nodeIds.has(edge.target)) {
        missingReferences.push(edge.target);
      }
    });

    // 查找孤立节点（没有被任何边连接的节点）
    const orphanedNodes = graph.nodes
      .filter(node => !referencedNodes.has(node.nodeId) && node.type !== 'start')
      .map(node => node.nodeId);

    return {
      valid: missingReferences.length === 0 && orphanedNodes.length === 0,
      missingReferences: [...new Set(missingReferences)], // 去重
      orphanedNodes
    };
  }

  /**
   * 检测循环依赖
   * 
   * @param graph 工作流图数据
   * @returns string[] 存在循环依赖的节点ID列表
   */
  private detectCircularDependencies(graph: WorkflowGraph): string[] {
    const circularNodes: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // 构建依赖图
    const dependencyMap = new Map<string, string[]>();
    graph.nodes.forEach(node => {
      dependencyMap.set(node.nodeId, node.dependencies);
    });

    // 深度优先搜索检测循环
    const dfs = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        circularNodes.push(nodeId);
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = dependencyMap.get(nodeId) || [];
      for (const depId of dependencies) {
        if (dfs(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    // 检查所有节点
    graph.nodes.forEach(node => {
      if (!visited.has(node.nodeId)) {
        dfs(node.nodeId);
      }
    });

    return [...new Set(circularNodes)]; // 去重
  }

  /**
   * 验证边的有效性
   * 
   * @param graph 工作流图数据
   * @returns 无效边列表
   */
  private validateEdges(graph: WorkflowGraph): Array<{ edgeId: string; source: string; target: string }> {
    const nodeIds = new Set(graph.nodes.map(node => node.nodeId));
    const invalidEdges: Array<{ edgeId: string; source: string; target: string }> = [];

    graph.edges.forEach(edge => {
      // 检查源节点和目标节点是否存在
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        invalidEdges.push({
          edgeId: edge.edgeId,
          source: edge.source,
          target: edge.target
        });
      }

      // 检查自环（节点指向自己）
      if (edge.source === edge.target) {
        invalidEdges.push({
          edgeId: edge.edgeId,
          source: edge.source,
          target: edge.target
        });
      }
    });

    return invalidEdges;
  }

  /**
   * 查找重复的节点ID
   * 
   * @param graph 工作流图数据
   * @returns 重复的节点ID列表
   */
  private findDuplicateNodeIds(graph: WorkflowGraph): string[] {
    const nodeIds: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();

    graph.nodes.forEach(node => {
      if (seen.has(node.nodeId)) {
        duplicates.push(node.nodeId);
      } else {
        seen.add(node.nodeId);
      }
    });

    return duplicates;
  }

  /**
   * 查找重复的边ID
   * 
   * @param graph 工作流图数据
   * @returns 重复的边ID列表
   */
  private findDuplicateEdgeIds(graph: WorkflowGraph): string[] {
    const edgeIds: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();

    graph.edges.forEach(edge => {
      if (seen.has(edge.edgeId)) {
        duplicates.push(edge.edgeId);
      } else {
        seen.add(edge.edgeId);
      }
    });

    return duplicates;
  }

  /**
   * 获取Schema版本
   * 
   * @returns string Schema版本号
   */
  public getSchemaVersion(): string {
    return SCHEMA_VERSION;
  }

  /**
   * 加载JSON Schema（从文件）
   * 
   * @returns Promise<object> JSON Schema对象
   */
  public async loadSchema(): Promise<object> {
    try {
      // 这里应该从文件系统加载schema.json
      // 目前返回一个基础的schema对象
      return {
        type: 'object',
        title: 'WorkflowGraph',
        version: this.getSchemaVersion(),
        description: '工作流图谱数据结构定义'
      };
    } catch (error: any) {
      throw new ValidationError(
        `加载Schema失败: ${error.message}`,
        [],
        { operation: 'load_schema', originalError: error.message }
      );
    }
  }

  /**
   * 创建验证错误
   * 
   * @param message 错误消息
   * @param errors 详细错误列表
   * @returns ValidationError 验证错误对象
   */
  public static createValidationError(
    message: string,
    errors: Array<{ path: string; message: string; code?: string }>
  ): ValidationError {
    return new ValidationError(message, errors, { validationType: 'schema' });
  }
}