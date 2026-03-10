/**
 * ValidationService 测试文件
 * 
 * 测试数据验证服务的各种功能，包括：
 * - Schema验证
 * - 引用完整性检查
 * - 循环依赖检测
 * - 数据完整性验证
 */

import { ValidationService } from '../validation.service';
import type { WorkflowGraph, TaskNode } from '../../types/workflow.types';

describe('ValidationService', () => {
  let validationService: ValidationService;

  beforeEach(() => {
    validationService = ValidationService.getInstance();
  });

  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = ValidationService.getInstance();
      const instance2 = ValidationService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('validateWorkflowGraph', () => {
    const validWorkflowGraph: WorkflowGraph = {
      projectId: 'test-project',
      projectName: '测试项目',
      version: '1.0.0',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:30:00.000Z',
      nodes: [
        {
          nodeId: 'start-001',
          type: 'start',
          name: '开始节点',
          instructions: {
            guide: '项目开始',
            logic: '初始化项目',
            criteria: '环境准备完成'
          },
          dependencies: [],
          assets: [],
          outputs: [],
          status: 'completed'
        },
        {
          nodeId: 'task-001',
          type: 'task',
          name: '任务节点',
          instructions: {
            guide: '执行任务',
            logic: '按步骤执行',
            criteria: '任务完成'
          },
          dependencies: ['start-001'],
          assets: [],
          outputs: [],
          status: 'pending'
        }
      ],
      edges: [
        {
          edgeId: 'edge-001',
          source: 'start-001',
          target: 'task-001',
          type: 'sequence'
        }
      ]
    };

    it('应该验证有效的工作流图', () => {
      const result = validationService.validateWorkflowGraph(validWorkflowGraph);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('应该拒绝缺少必需字段的工作流图', () => {
      const invalidGraph = { ...validWorkflowGraph };
      delete (invalidGraph as any).projectId;

      const result = validationService.validateWorkflowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'projectId')).toBe(true);
    });

    it('应该拒绝无效的项目ID格式', () => {
      const invalidGraph = {
        ...validWorkflowGraph,
        projectId: 'invalid project id!' // 包含空格和特殊字符
      };

      const result = validationService.validateWorkflowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'projectId')).toBe(true);
    });

    it('应该拒绝无效的版本号格式', () => {
      const invalidGraph = {
        ...validWorkflowGraph,
        version: '1.0' // 不符合x.y.z格式
      };

      const result = validationService.validateWorkflowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'version')).toBe(true);
    });

    it('应该拒绝空的节点数组', () => {
      const invalidGraph = {
        ...validWorkflowGraph,
        nodes: []
      };

      const result = validationService.validateWorkflowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'nodes')).toBe(true);
    });

    it('应该拒绝无效的日期时间格式', () => {
      const invalidGraph = {
        ...validWorkflowGraph,
        createdAt: 'invalid-date'
      };

      const result = validationService.validateWorkflowGraph(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'createdAt')).toBe(true);
    });
  });

  describe('validateTaskNode', () => {
    const validTaskNode: TaskNode = {
      nodeId: 'task-001',
      type: 'task',
      name: '测试任务',
      instructions: {
        guide: '任务指南',
        logic: '执行逻辑',
        criteria: '验收标准'
      },
      dependencies: [],
      assets: [],
      outputs: [],
      status: 'pending'
    };

    it('应该验证有效的任务节点', () => {
      const result = validationService.validateTaskNode(validTaskNode);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('应该拒绝缺少指令的节点', () => {
      const invalidNode = { ...validTaskNode };
      delete (invalidNode as any).instructions;

      const result = validationService.validateTaskNode(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'instructions')).toBe(true);
    });

    it('应该拒绝指令字段不完整的节点', () => {
      const invalidNode = {
        ...validTaskNode,
        instructions: {
          guide: '指南',
          logic: '逻辑'
          // 缺少criteria字段
        }
      };

      const result = validationService.validateTaskNode(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path.includes('criteria'))).toBe(true);
    });

    it('应该拒绝无效的节点类型', () => {
      const invalidNode = {
        ...validTaskNode,
        type: 'invalid-type' as any
      };

      const result = validationService.validateTaskNode(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'type')).toBe(true);
    });

    it('应该拒绝无效的节点状态', () => {
      const invalidNode = {
        ...validTaskNode,
        status: 'invalid-status' as any
      };

      const result = validationService.validateTaskNode(invalidNode);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(err => err.path === 'status')).toBe(true);
    });
  });

  describe('checkNodeReferences', () => {
    it('应该通过有效引用的检查', () => {
      const validGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '节点1',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          },
          {
            nodeId: 'node-2',
            type: 'task',
            name: '节点2',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: ['node-1'],
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: [
          {
            edgeId: 'edge-1',
            source: 'node-1',
            target: 'node-2',
            type: 'sequence'
          }
        ]
      };

      const result = validationService.checkNodeReferences(validGraph);
      expect(result.valid).toBe(true);
      expect(result.missingReferences).toHaveLength(0);
      expect(result.orphanedNodes).toHaveLength(0);
    });

    it('应该检测到缺失的依赖引用', () => {
      const invalidGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'task',
            name: '节点1',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: ['missing-node'], // 引用不存在的节点
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: []
      };

      const result = validationService.checkNodeReferences(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.missingReferences).toContain('missing-node');
    });

    it('应该检测到边引用的缺失节点', () => {
      const invalidGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '节点1',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          }
        ],
        edges: [
          {
            edgeId: 'edge-1',
            source: 'node-1',
            target: 'missing-node', // 引用不存在的节点
            type: 'sequence'
          }
        ]
      };

      const result = validationService.checkNodeReferences(invalidGraph);
      expect(result.valid).toBe(false);
      expect(result.missingReferences).toContain('missing-node');
    });

    it('应该检测到孤立节点', () => {
      const graphWithOrphan: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'start-node',
            type: 'start',
            name: '开始节点',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          },
          {
            nodeId: 'orphan-node',
            type: 'task',
            name: '孤立节点',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: [] // 没有边连接孤立节点
      };

      const result = validationService.checkNodeReferences(graphWithOrphan);
      expect(result.valid).toBe(false);
      expect(result.orphanedNodes).toContain('orphan-node');
      expect(result.orphanedNodes).not.toContain('start-node'); // start节点不算孤立
    });
  });

  describe('checkDataIntegrity', () => {
    it('应该通过完整性检查', () => {
      const validGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'start-1',
            type: 'start',
            name: '开始',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          },
          {
            nodeId: 'task-1',
            type: 'task',
            name: '任务',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: ['start-1'],
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: [
          {
            edgeId: 'edge-1',
            source: 'start-1',
            target: 'task-1',
            type: 'sequence'
          }
        ]
      };

      const result = validationService.checkDataIntegrity(validGraph);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('应该检测到循环依赖', () => {
      const circularGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'task',
            name: '节点1',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: ['node-2'], // 依赖node-2
            assets: [],
            outputs: [],
            status: 'pending'
          },
          {
            nodeId: 'node-2',
            type: 'task',
            name: '节点2',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: ['node-1'], // 依赖node-1，形成循环
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: []
      };

      const result = validationService.checkDataIntegrity(circularGraph);
      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => issue.type === 'circular_dependency')).toBe(true);
    });

    it('应该检测到重复的节点ID', () => {
      const duplicateGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'duplicate-id',
            type: 'start',
            name: '节点1',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          },
          {
            nodeId: 'duplicate-id', // 重复的ID
            type: 'task',
            name: '节点2',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: []
      };

      const result = validationService.checkDataIntegrity(duplicateGraph);
      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => 
        issue.type === 'missing_reference' && 
        issue.message.includes('重复的节点ID')
      )).toBe(true);
    });

    it('应该检测到重复的边ID', () => {
      const duplicateEdgeGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '节点1',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          },
          {
            nodeId: 'node-2',
            type: 'task',
            name: '节点2',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'pending'
          }
        ],
        edges: [
          {
            edgeId: 'duplicate-edge',
            source: 'node-1',
            target: 'node-2',
            type: 'sequence'
          },
          {
            edgeId: 'duplicate-edge', // 重复的边ID
            source: 'node-1',
            target: 'node-2',
            type: 'parallel'
          }
        ]
      };

      const result = validationService.checkDataIntegrity(duplicateEdgeGraph);
      expect(result.valid).toBe(false);
      expect(result.issues.some(issue => 
        issue.type === 'invalid_edge' && 
        issue.message.includes('重复的边ID')
      )).toBe(true);
    });
  });

  describe('getSchemaVersion', () => {
    it('应该返回正确的Schema版本', () => {
      const version = validationService.getSchemaVersion();
      expect(version).toBe('1.0.0');
    });
  });

  describe('loadSchema', () => {
    it('应该加载Schema对象', async () => {
      const schema = await validationService.loadSchema();
      expect(schema).toBeDefined();
      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('title', 'WorkflowGraph');
    });
  });
});