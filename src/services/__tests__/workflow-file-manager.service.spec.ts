/**
 * WorkflowFileManager 服务单元测试
 * 
 * 测试工作流文件管理器的核心功能：
 * - 项目打开、保存、关闭
 * - 内存缓存管理
 * - 变更追踪（dirty标记）
 * - 自动保存机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowFileManager } from '../workflow-file-manager.service';
import { FileSystemService } from '../filesystem.service';
import { ValidationService } from '../validation.service';
import { FileIOError, ValidationError } from '../../errors/workflow.errors';
import type { WorkflowGraph } from '../../types/workflow.types';

// Mock依赖服务
vi.mock('../filesystem.service');
vi.mock('../validation.service');

describe('WorkflowFileManager', () => {
  let manager: WorkflowFileManager;
  let mockFileSystemService: any;
  let mockValidationService: any;

  // 测试数据
  const testProjectId = 'test-project-001';
  const testWorkflowGraph: WorkflowGraph = {
    projectId: testProjectId,
    projectName: '测试项目',
    version: '1.0.0',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    nodes: [
      {
        nodeId: 'start-001',
        type: 'start',
        name: '开始',
        instructions: {
          guide: '开始指南',
          logic: '开始逻辑',
          criteria: '开始标准'
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: 'completed'
      }
    ],
    edges: [],
    settings: {
      autoSave: true,
      autoSaveInterval: 500,
      enableBackup: true,
      maxBackups: 5
    }
  };

  beforeEach(() => {
    // 重置单例实例
    (WorkflowFileManager as any).instance = undefined;
    manager = WorkflowFileManager.getInstance();

    // 创建mock服务
    mockFileSystemService = {
      readWorkflowFile: vi.fn(),
      writeWorkflowFile: vi.fn()
    };

    mockValidationService = {
      validateWorkflowGraph: vi.fn(),
      checkDataIntegrity: vi.fn()
    };

    // 注入mock服务
    (manager as any).fileSystemService = mockFileSystemService;
    (manager as any).validationService = mockValidationService;
  });

  afterEach(() => {
    // 清理所有缓存和定时器
    manager.clearAllCache();
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = WorkflowFileManager.getInstance();
      const instance2 = WorkflowFileManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('openProject', () => {
    it('应该成功打开项目并缓存数据', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      // 执行
      const result = await manager.openProject(testProjectId);

      // 验证
      expect(result).toEqual(testWorkflowGraph);
      expect(mockFileSystemService.readWorkflowFile).toHaveBeenCalledWith(testProjectId);
      expect(mockValidationService.validateWorkflowGraph).toHaveBeenCalledWith(testWorkflowGraph);
      expect(manager.getCachedGraph(testProjectId)).toEqual(testWorkflowGraph);
      expect(manager.isDirty(testProjectId)).toBe(false);
    });

    it('应该从缓存返回数据而不读取文件', async () => {
      // 准备 - 第一次打开
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 清除mock调用记录
      mockFileSystemService.readWorkflowFile.mockClear();

      // 执行 - 第二次打开
      const result = await manager.openProject(testProjectId);

      // 验证 - 应该从缓存返回，不调用文件系统
      expect(result).toEqual(testWorkflowGraph);
      expect(mockFileSystemService.readWorkflowFile).not.toHaveBeenCalled();
    });

    it('当数据验证失败时应该抛出ValidationError', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({
        valid: false,
        errors: [{ path: 'projectId', message: '项目ID无效', code: 'INVALID_ID' }]
      });

      // 执行并验证
      await expect(manager.openProject(testProjectId)).rejects.toThrow(ValidationError);
    });

    it('当文件读取失败时应该抛出FileIOError', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockRejectedValue(
        new FileIOError('文件不存在', { projectId: testProjectId })
      );

      // 执行并验证
      await expect(manager.openProject(testProjectId)).rejects.toThrow(FileIOError);
    });

    it('应该记录完整性问题但不阻止打开', async () => {
      // 准备
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({
        valid: false,
        issues: [{ type: 'orphaned_node', message: '孤立节点', nodeId: 'node-001' }]
      });

      // 执行
      const result = await manager.openProject(testProjectId);

      // 验证
      expect(result).toEqual(testWorkflowGraph);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('saveProject', () => {
    it('应该成功保存项目并更新缓存', async () => {
      // 准备
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockFileSystemService.writeWorkflowFile.mockResolvedValue(undefined);

      // 执行
      await manager.saveProject(testProjectId, testWorkflowGraph);

      // 验证
      expect(mockValidationService.validateWorkflowGraph).toHaveBeenCalledWith(testWorkflowGraph);
      expect(mockFileSystemService.writeWorkflowFile).toHaveBeenCalledWith(testProjectId, testWorkflowGraph);
      expect(manager.getCachedGraph(testProjectId)).toEqual(testWorkflowGraph);
      expect(manager.isDirty(testProjectId)).toBe(false);
    });

    it('当数据未变更时应该跳过保存', async () => {
      // 准备 - 先打开项目
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 清除mock调用记录
      mockFileSystemService.writeWorkflowFile.mockClear();

      // 执行 - 保存相同的数据
      await manager.saveProject(testProjectId, testWorkflowGraph);

      // 验证 - 应该跳过保存
      expect(mockFileSystemService.writeWorkflowFile).not.toHaveBeenCalled();
    });

    it('当数据有变更时应该执行保存', async () => {
      // 准备 - 先打开项目
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 修改数据
      const modifiedGraph = {
        ...testWorkflowGraph,
        projectName: '修改后的项目名称'
      };

      // 清除mock调用记录
      mockFileSystemService.writeWorkflowFile.mockClear();

      // 执行 - 保存修改后的数据
      await manager.saveProject(testProjectId, modifiedGraph);

      // 验证 - 应该执行保存
      expect(mockFileSystemService.writeWorkflowFile).toHaveBeenCalledWith(testProjectId, modifiedGraph);
    });

    it('当数据验证失败时应该抛出ValidationError', async () => {
      // 准备
      mockValidationService.validateWorkflowGraph.mockReturnValue({
        valid: false,
        errors: [{ path: 'nodes', message: '节点列表不能为空', code: 'EMPTY_NODES' }]
      });

      // 执行并验证
      await expect(manager.saveProject(testProjectId, testWorkflowGraph)).rejects.toThrow(ValidationError);
      expect(mockFileSystemService.writeWorkflowFile).not.toHaveBeenCalled();
    });

    it('当文件写入失败时应该抛出FileIOError', async () => {
      // 准备
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockFileSystemService.writeWorkflowFile.mockRejectedValue(
        new FileIOError('磁盘空间不足', { projectId: testProjectId })
      );

      // 执行并验证
      await expect(manager.saveProject(testProjectId, testWorkflowGraph)).rejects.toThrow(FileIOError);
    });
  });

  describe('closeProject', () => {
    it('应该成功关闭项目并清除缓存', async () => {
      // 准备 - 先打开项目
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 执行
      await manager.closeProject(testProjectId);

      // 验证
      expect(manager.getCachedGraph(testProjectId)).toBeNull();
    });

    it('当有未保存的变更时应该抛出错误', async () => {
      // 准备 - 先打开项目并标记为dirty
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);
      manager.markDirty(testProjectId);

      // 执行并验证
      await expect(manager.closeProject(testProjectId)).rejects.toThrow(FileIOError);
      await expect(manager.closeProject(testProjectId)).rejects.toThrow('未保存的变更');
    });

    it('应该停止自动保存', async () => {
      // 准备 - 先打开项目并启用自动保存
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);
      manager.enableAutoSave(testProjectId, 1000);

      // 执行
      await manager.closeProject(testProjectId);

      // 验证 - 自动保存应该被停止
      const stats = manager.getCacheStats();
      expect(stats.autoSaveEnabled).toBe(0);
    });
  });

  describe('缓存管理', () => {
    it('getCachedGraph应该返回缓存的数据', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 执行
      const cached = manager.getCachedGraph(testProjectId);

      // 验证
      expect(cached).toEqual(testWorkflowGraph);
    });

    it('getCachedGraph对不存在的项目应该返回null', () => {
      const cached = manager.getCachedGraph('non-existent-project');
      expect(cached).toBeNull();
    });

    it('invalidateCache应该清除指定项目的缓存', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 执行
      manager.invalidateCache(testProjectId);

      // 验证
      expect(manager.getCachedGraph(testProjectId)).toBeNull();
    });

    it('clearAllCache应该清除所有缓存', async () => {
      // 准备 - 打开多个项目
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject('project-1');
      await manager.openProject('project-2');

      // 执行
      manager.clearAllCache();

      // 验证
      expect(manager.getCachedGraph('project-1')).toBeNull();
      expect(manager.getCachedGraph('project-2')).toBeNull();
      expect(manager.getOpenProjects()).toHaveLength(0);
    });
  });

  describe('变更追踪', () => {
    it('markDirty应该标记项目为dirty', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);

      // 执行
      manager.markDirty(testProjectId);

      // 验证
      expect(manager.isDirty(testProjectId)).toBe(true);
    });

    it('isDirty对不存在的项目应该返回false', () => {
      expect(manager.isDirty('non-existent-project')).toBe(false);
    });

    it('保存后应该清除dirty标记', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });
      mockFileSystemService.writeWorkflowFile.mockResolvedValue(undefined);

      await manager.openProject(testProjectId);
      manager.markDirty(testProjectId);

      // 执行
      const modifiedGraph = { ...testWorkflowGraph, projectName: '修改后' };
      await manager.saveProject(testProjectId, modifiedGraph);

      // 验证
      expect(manager.isDirty(testProjectId)).toBe(false);
    });
  });

  describe('自动保存', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('enableAutoSave应该启动自动保存定时器', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });
      mockFileSystemService.writeWorkflowFile.mockResolvedValue(undefined);

      await manager.openProject(testProjectId);
      manager.markDirty(testProjectId);

      // 执行
      manager.enableAutoSave(testProjectId, 1000);

      // 快进时间
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // 验证 - 应该触发保存
      expect(mockFileSystemService.writeWorkflowFile).toHaveBeenCalled();
    });

    it('自动保存不应该保存未标记为dirty的项目', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });
      mockFileSystemService.writeWorkflowFile.mockResolvedValue(undefined);

      await manager.openProject(testProjectId);
      // 不标记为dirty

      // 执行
      manager.enableAutoSave(testProjectId, 1000);

      // 快进时间
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // 验证 - 不应该触发保存
      expect(mockFileSystemService.writeWorkflowFile).not.toHaveBeenCalled();
    });

    it('disableAutoSave应该停止自动保存', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject(testProjectId);
      manager.enableAutoSave(testProjectId, 1000);

      // 执行
      manager.disableAutoSave(testProjectId);

      // 验证
      const stats = manager.getCacheStats();
      expect(stats.autoSaveEnabled).toBe(0);
    });

    it('自动保存失败时应该记录错误但不中断', async () => {
      // 准备
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });
      mockFileSystemService.writeWorkflowFile.mockRejectedValue(new Error('保存失败'));

      await manager.openProject(testProjectId);
      manager.markDirty(testProjectId);

      // 执行
      manager.enableAutoSave(testProjectId, 1000);

      // 快进时间
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // 验证 - 应该记录错误
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('统计信息', () => {
    it('getOpenProjects应该返回所有打开的项目ID', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject('project-1');
      await manager.openProject('project-2');

      // 执行
      const openProjects = manager.getOpenProjects();

      // 验证
      expect(openProjects).toHaveLength(2);
      expect(openProjects).toContain('project-1');
      expect(openProjects).toContain('project-2');
    });

    it('getCacheStats应该返回正确的统计信息', async () => {
      // 准备
      mockFileSystemService.readWorkflowFile.mockResolvedValue(testWorkflowGraph);
      mockValidationService.validateWorkflowGraph.mockReturnValue({ valid: true });
      mockValidationService.checkDataIntegrity.mockReturnValue({ valid: true, issues: [] });

      await manager.openProject('project-1');
      await manager.openProject('project-2');
      manager.markDirty('project-1');
      manager.enableAutoSave('project-1', 1000);

      // 执行
      const stats = manager.getCacheStats();

      // 验证
      expect(stats.totalProjects).toBe(2);
      expect(stats.dirtyProjects).toBe(1);
      expect(stats.autoSaveEnabled).toBe(1);
    });
  });
});
