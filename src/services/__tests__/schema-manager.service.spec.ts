/**
 * SchemaManagerService 测试文件
 * 
 * 测试Schema版本管理服务的各种功能
 */

import { SchemaManagerService } from '../schema-manager.service';
import type { WorkflowGraph } from '../../types/workflow.types';

describe('SchemaManagerService', () => {
  let schemaManager: SchemaManagerService;

  beforeEach(() => {
    schemaManager = SchemaManagerService.getInstance();
    schemaManager.clearSchemaCache();
  });

  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = SchemaManagerService.getInstance();
      const instance2 = SchemaManagerService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('版本管理', () => {
    it('应该返回当前版本', () => {
      const version = schemaManager.getCurrentVersion();
      expect(version).toBe('1.0.0');
    });

    it('应该返回支持的版本列表', () => {
      const versions = schemaManager.getSupportedVersions();
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('1.0.0');
    });

    it('应该检查版本支持情况', () => {
      expect(schemaManager.isVersionSupported('1.0.0')).toBe(true);
      expect(schemaManager.isVersionSupported('2.0.0')).toBe(false);
      expect(schemaManager.isVersionSupported('0.9.0')).toBe(false);
    });
  });

  describe('版本比较', () => {
    it('应该正确比较版本号', () => {
      expect(schemaManager.compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(schemaManager.compareVersions('1.0.0', '1.0.1')).toBe(-1);
      expect(schemaManager.compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(schemaManager.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(schemaManager.compareVersions('2.0.0', '1.0.0')).toBe(1);
    });

    it('应该检查是否需要升级', () => {
      expect(schemaManager.needsUpgrade('0.9.0')).toBe(true);
      expect(schemaManager.needsUpgrade('1.0.0')).toBe(false);
      expect(schemaManager.needsUpgrade('1.1.0')).toBe(false);
    });
  });

  describe('Schema版本验证', () => {
    it('应该验证有效的Schema版本', () => {
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
            name: '开始',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          }
        ],
        edges: []
      };

      expect(schemaManager.validateSchemaVersion(validGraph)).toBe(true);
    });

    it('应该拒绝无效的Schema版本', () => {
      const invalidGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '2.0.0', // 不支持的版本
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '开始',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          }
        ],
        edges: []
      };

      expect(schemaManager.validateSchemaVersion(invalidGraph)).toBe(false);
    });

    it('应该拒绝缺少版本的工作流图', () => {
      const noVersionGraph = {
        projectId: 'test',
        projectName: '测试',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [],
        edges: []
      } as unknown as WorkflowGraph;

      expect(schemaManager.validateSchemaVersion(noVersionGraph)).toBe(false);
    });
  });

  describe('Schema迁移', () => {
    it('应该成功迁移旧版本到最新版本', () => {
      const oldGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '0.9.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '开始',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          }
        ],
        edges: []
      };

      const result = schemaManager.migrateToLatest(oldGraph);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe('0.9.0');
      expect(result.toVersion).toBe('1.0.0');
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('应该处理缺少字段的节点迁移', () => {
      const incompleteGraph: any = {
        projectId: 'test',
        projectName: '测试',
        version: '0.9.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '开始'
            // 缺少instructions, dependencies, assets, outputs, status
          }
        ],
        edges: []
      };

      const result = schemaManager.migrateToLatest(incompleteGraph);

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.changes.some(change => change.includes('添加默认指令字段'))).toBe(true);
    });

    it('应该跳过已经是最新版本的迁移', () => {
      const currentGraph: WorkflowGraph = {
        projectId: 'test',
        projectName: '测试',
        version: '1.0.0',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
        nodes: [
          {
            nodeId: 'node-1',
            type: 'start',
            name: '开始',
            instructions: { guide: 'g', logic: 'l', criteria: 'c' },
            dependencies: [],
            assets: [],
            outputs: [],
            status: 'completed'
          }
        ],
        edges: []
      };

      const result = schemaManager.migrateToLatest(currentGraph);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe('1.0.0');
      expect(result.toVersion).toBe('1.0.0');
      expect(result.changes).toHaveLength(0);
    });
  });

  describe('变更日志', () => {
    it('应该返回版本变更日志', () => {
      const changeLog = schemaManager.getChangeLog('0.9.0', '1.0.0');
      expect(changeLog).toHaveLength(1);
      expect(changeLog[0]).toContain('1.0.0');
      expect(changeLog[0]).toContain('初始版本');
    });

    it('应该返回空变更日志当版本相同时', () => {
      const changeLog = schemaManager.getChangeLog('1.0.0', '1.0.0');
      expect(changeLog).toHaveLength(0);
    });
  });

  describe('Schema加载', () => {
    it('应该加载Schema文件', async () => {
      const schema = await schemaManager.loadSchemaByVersion('1.0.0');
      expect(schema).toBeDefined();
      expect(schema).toHaveProperty('type', 'object');
    });

    it('应该缓存加载的Schema', async () => {
      // 第一次加载
      const schema1 = await schemaManager.loadSchemaByVersion('1.0.0');
      
      // 第二次加载应该从缓存返回
      const schema2 = await schemaManager.loadSchemaByVersion('1.0.0');
      
      expect(schema1).toBe(schema2);
    });

    it('应该清除Schema缓存', async () => {
      // 加载Schema到缓存
      await schemaManager.loadSchemaByVersion('1.0.0');
      
      // 清除缓存
      schemaManager.clearSchemaCache();
      
      // 再次加载应该重新读取文件
      const schema = await schemaManager.loadSchemaByVersion('1.0.0');
      expect(schema).toBeDefined();
    });
  });
});