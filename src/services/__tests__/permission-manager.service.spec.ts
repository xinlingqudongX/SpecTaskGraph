/**
 * PermissionManager 单元测试
 * 
 * 测试权限管理服务的核心功能，包括：
 * - 权限状态查询
 * - 权限请求
 * - 权限撤销
 * - 权限变化监听
 * - 权限状态持久化
 */

import { PermissionManager, PermissionState, PermissionChangeEvent } from '../permission-manager.service';
import { PermissionError } from '../../errors/workflow.errors';

// Mock FileSystemDirectoryHandle
const createMockDirectoryHandle = (name: string = 'test-project') => ({
  name,
  kind: 'directory' as const,
  queryPermission: jest.fn(),
  requestPermission: jest.fn(),
  getDirectoryHandle: jest.fn(),
  getFileHandle: jest.fn(),
  removeEntry: jest.fn(),
  resolve: jest.fn(),
  isSameEntry: jest.fn(),
  [Symbol.asyncIterator]: jest.fn()
});

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;
  let mockHandle: ReturnType<typeof createMockDirectoryHandle>;

  beforeEach(() => {
    // 重置单例实例
    (PermissionManager as any).instance = undefined;
    
    // 获取新的实例
    permissionManager = PermissionManager.getInstance();
    
    // 清除缓存和监听器
    permissionManager.clearPermissionCache();
    permissionManager.stopPeriodicCheck();
    
    // 创建新的mock句柄
    mockHandle = createMockDirectoryHandle();
    
    // 设置默认的mock返回值
    mockHandle.queryPermission.mockResolvedValue('granted');
    mockHandle.requestPermission.mockResolvedValue('granted');
  });

  afterEach(() => {
    // 清理
    permissionManager.stopPeriodicCheck();
    permissionManager.clearPermissionCache();
    permissionManager.destroy();
    
    // 重置单例实例
    (PermissionManager as any).instance = undefined;
  });

  describe('getPermissionState', () => {
    it('应该返回正确的权限状态', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');

      const state = await permissionManager.getPermissionState('test-project', mockHandle as any);

      expect(state).toBe('granted');
      expect(mockHandle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    });

    it('应该缓存权限状态', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');

      await permissionManager.getPermissionState('test-project', mockHandle as any);
      
      const cachedStates = permissionManager.getAllPermissionStates();
      const cachedState = cachedStates.get('test-project');

      expect(cachedState).toBeDefined();
      expect(cachedState?.state).toBe('granted');
      expect(cachedState?.projectId).toBe('test-project');
      expect(cachedState?.handle).toBe(mockHandle);
    });

    it('当没有提供句柄时应该从缓存获取', async () => {
      // 先缓存一个句柄
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      // 清除mock调用记录
      mockHandle.queryPermission.mockClear();

      // 不提供句柄，应该使用缓存的句柄
      const state = await permissionManager.getPermissionState('test-project');

      expect(state).toBe('granted');
      expect(mockHandle.queryPermission).toHaveBeenCalled();
    });

    it('当没有句柄且缓存为空时应该返回prompt', async () => {
      const state = await permissionManager.getPermissionState('unknown-project');

      expect(state).toBe('prompt');
    });

    it('当查询权限失败时应该返回denied', async () => {
      mockHandle.queryPermission.mockRejectedValue(new Error('Permission query failed'));

      const state = await permissionManager.getPermissionState('test-project', mockHandle as any);

      expect(state).toBe('denied');
    });

    it('应该支持不同的权限状态', async () => {
      const states: PermissionState[] = ['granted', 'denied', 'prompt'];

      for (const expectedState of states) {
        mockHandle.queryPermission.mockResolvedValue(expectedState);
        const state = await permissionManager.getPermissionState(`project-${expectedState}`, mockHandle as any);
        expect(state).toBe(expectedState);
      }
    });
  });

  describe('requestPermission', () => {
    it('应该成功请求权限', async () => {
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');

      const result = await permissionManager.requestPermission('test-project', mockHandle as any);

      expect(result).toBe(true);
      expect(mockHandle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    });

    it('应该更新缓存中的权限状态', async () => {
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');

      await permissionManager.requestPermission('test-project', mockHandle as any);

      const cachedStates = permissionManager.getAllPermissionStates();
      const cachedState = cachedStates.get('test-project');

      expect(cachedState?.state).toBe('granted');
    });

    it('当用户拒绝权限时应该返回false', async () => {
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('denied');

      const result = await permissionManager.requestPermission('test-project', mockHandle as any);

      expect(result).toBe(false);
    });

    it('当权限请求失败时应该返回false', async () => {
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockRejectedValue(new Error('Request failed'));

      const result = await permissionManager.requestPermission('test-project', mockHandle as any);

      expect(result).toBe(false);
    });

    it('当权限状态改变时应该触发变更事件', async () => {
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');

      const listener = jest.fn();
      permissionManager.onPermissionChange(listener);

      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待异步事件触发
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project',
          oldState: 'prompt',
          newState: 'granted'
        })
      );
    });

    it('当权限状态未改变时不应该触发变更事件', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');
      mockHandle.requestPermission.mockResolvedValue('granted');

      const listener = jest.fn();
      permissionManager.onPermissionChange(listener);

      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待可能的异步事件
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('revokePermission', () => {
    it('应该成功撤销权限', async () => {
      // 先设置一个已授权的项目
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      await permissionManager.revokePermission('test-project');

      const cachedStates = permissionManager.getAllPermissionStates();
      const cachedState = cachedStates.get('test-project');

      expect(cachedState?.state).toBe('denied');
    });

    it('应该触发权限变更事件', async () => {
      // 先设置一个已授权的项目
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      const listener = jest.fn();
      permissionManager.onPermissionChange(listener);

      await permissionManager.revokePermission('test-project');

      // 等待异步事件触发
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project',
          oldState: 'granted',
          newState: 'denied'
        })
      );
    });

    it('当项目不在缓存中时应该静默成功', async () => {
      await expect(permissionManager.revokePermission('unknown-project'))
        .resolves.not.toThrow();
    });

    it('当权限已经是denied时不应该触发变更事件', async () => {
      // 先设置一个已拒绝的项目
      mockHandle.queryPermission.mockResolvedValue('denied');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      const listener = jest.fn();
      permissionManager.onPermissionChange(listener);

      await permissionManager.revokePermission('test-project');

      // 等待可能的异步事件
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('checkPermissionPrerequisite', () => {
    it('当权限为granted时应该成功', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');

      await expect(
        permissionManager.checkPermissionPrerequisite('test-project', mockHandle as any)
      ).resolves.not.toThrow();
    });

    it('当权限为denied时应该抛出PermissionError', async () => {
      mockHandle.queryPermission.mockResolvedValue('denied');

      await expect(
        permissionManager.checkPermissionPrerequisite('test-project', mockHandle as any)
      ).rejects.toThrow(PermissionError);
    });

    it('当权限为prompt时应该抛出PermissionError', async () => {
      mockHandle.queryPermission.mockResolvedValue('prompt');

      await expect(
        permissionManager.checkPermissionPrerequisite('test-project', mockHandle as any)
      ).rejects.toThrow(PermissionError);
    });

    it('抛出的错误应该包含项目ID信息', async () => {
      mockHandle.queryPermission.mockResolvedValue('denied');

      try {
        await permissionManager.checkPermissionPrerequisite('test-project', mockHandle as any);
        fail('应该抛出错误');
      } catch (error: any) {
        expect(error.message).toContain('test-project');
      }
    });
  });

  describe('onPermissionChange', () => {
    it('应该注册权限变更监听器', async () => {
      const listener = jest.fn();
      const unsubscribe = permissionManager.onPermissionChange(listener);

      expect(typeof unsubscribe).toBe('function');

      // 触发一个权限变更
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');
      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待异步事件触发
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalled();
    });

    it('应该支持多个监听器', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      permissionManager.onPermissionChange(listener1);
      permissionManager.onPermissionChange(listener2);

      // 触发权限变更
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');
      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待异步事件触发
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('取消订阅后不应该再收到事件', async () => {
      const listener = jest.fn();
      const unsubscribe = permissionManager.onPermissionChange(listener);

      // 取消订阅
      unsubscribe();

      // 触发权限变更
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');
      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待可能的异步事件
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });

    it('监听器抛出错误不应该影响其他监听器', async () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      permissionManager.onPermissionChange(errorListener);
      permissionManager.onPermissionChange(normalListener);

      // 触发权限变更
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');
      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待异步事件触发
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });

    it('权限变更事件应该包含完整信息', async () => {
      let capturedEvent: PermissionChangeEvent | undefined;
      
      permissionManager.onPermissionChange((event) => {
        capturedEvent = event;
      });

      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');
      await permissionManager.requestPermission('test-project', mockHandle as any);

      // 等待异步事件触发
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(capturedEvent).toBeDefined();
      expect(capturedEvent!.projectId).toBe('test-project');
      expect(capturedEvent!.oldState).toBe('prompt');
      expect(capturedEvent!.newState).toBe('granted');
      expect(capturedEvent!.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getAllPermissionStates', () => {
    it('应该返回所有缓存的权限状态', async () => {
      const handle1 = createMockDirectoryHandle('project-1');
      const handle2 = createMockDirectoryHandle('project-2');

      handle1.queryPermission.mockResolvedValue('granted');
      handle2.queryPermission.mockResolvedValue('denied');

      await permissionManager.getPermissionState('project-1', handle1 as any);
      await permissionManager.getPermissionState('project-2', handle2 as any);

      const states = permissionManager.getAllPermissionStates();

      expect(states.size).toBe(2);
      expect(states.get('project-1')?.state).toBe('granted');
      expect(states.get('project-2')?.state).toBe('denied');
    });

    it('应该返回权限记录的副本', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      const states1 = permissionManager.getAllPermissionStates();
      const states2 = permissionManager.getAllPermissionStates();

      expect(states1).not.toBe(states2);
      expect(states1.size).toBe(states2.size);
    });
  });

  describe('clearPermissionCache', () => {
    it('应该清除指定项目的缓存', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      permissionManager.clearPermissionCache('test-project');

      const states = permissionManager.getAllPermissionStates();
      expect(states.has('test-project')).toBe(false);
    });

    it('应该清除所有缓存', async () => {
      const handle1 = createMockDirectoryHandle('project-1');
      const handle2 = createMockDirectoryHandle('project-2');

      handle1.queryPermission.mockResolvedValue('granted');
      handle2.queryPermission.mockResolvedValue('granted');

      await permissionManager.getPermissionState('project-1', handle1 as any);
      await permissionManager.getPermissionState('project-2', handle2 as any);

      permissionManager.clearPermissionCache();

      const states = permissionManager.getAllPermissionStates();
      expect(states.size).toBe(0);
    });
  });

  describe('静态方法', () => {
    describe('isFileSystemAccessSupported', () => {
      it('应该检测File System Access API支持', () => {
        // 在测试环境中，这些API已经被模拟
        expect(PermissionManager.isFileSystemAccessSupported()).toBe(true);
      });

      it('当API不存在时应该返回false', () => {
        // 临时移除API
        const originalShowDirectoryPicker = (global as any).window.showDirectoryPicker;
        const originalFileSystemDirectoryHandle = (global as any).FileSystemDirectoryHandle;

        delete (global as any).window.showDirectoryPicker;
        delete (global as any).FileSystemDirectoryHandle;

        expect(PermissionManager.isFileSystemAccessSupported()).toBe(false);

        // 恢复API
        (global as any).window.showDirectoryPicker = originalShowDirectoryPicker;
        (global as any).FileSystemDirectoryHandle = originalFileSystemDirectoryHandle;
      });
    });

    describe('getPermissionStateDescription', () => {
      it('应该返回权限状态的中文描述', () => {
        expect(PermissionManager.getPermissionStateDescription('granted')).toBe('已授权');
        expect(PermissionManager.getPermissionStateDescription('denied')).toBe('已拒绝');
        expect(PermissionManager.getPermissionStateDescription('prompt')).toBe('待授权');
      });
    });
  });

  describe('定期权限检查', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.skip('应该定期检查所有缓存的权限', async () => {
      // 先添加一个项目到缓存
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      // 清除之前的调用记录
      mockHandle.queryPermission.mockClear();

      // 启动定期检查
      permissionManager.startPeriodicCheck(1000);

      // 快进时间并等待异步操作
      jest.advanceTimersByTime(1000);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockHandle.queryPermission).toHaveBeenCalled();
    });

    it.skip('应该在权限状态改变时触发事件', async () => {
      // 先添加一个项目到缓存
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      const listener = jest.fn();
      permissionManager.onPermissionChange(listener);

      // 改变权限状态
      mockHandle.queryPermission.mockResolvedValue('denied');

      // 启动定期检查
      permissionManager.startPeriodicCheck(1000);

      // 快进时间并等待异步操作
      jest.advanceTimersByTime(1000);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'test-project',
          oldState: 'granted',
          newState: 'denied'
        })
      );
    });

    it('应该能够停止定期检查', async () => {
      // 这个测试不依赖定时器触发，只测试方法调用
      permissionManager.startPeriodicCheck(1000);
      expect(permissionManager['checkInterval']).not.toBeNull();
      
      permissionManager.stopPeriodicCheck();
      expect(permissionManager['checkInterval']).toBeNull();
    });
  });

  describe('单例模式', () => {
    it('应该返回相同的实例', () => {
      const instance1 = PermissionManager.getInstance();
      const instance2 = PermissionManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('destroy', () => {
    it('应该清理所有资源', async () => {
      mockHandle.queryPermission.mockResolvedValue('granted');
      await permissionManager.getPermissionState('test-project', mockHandle as any);

      const listener = jest.fn();
      permissionManager.onPermissionChange(listener);

      permissionManager.destroy();

      const states = permissionManager.getAllPermissionStates();
      expect(states.size).toBe(0);

      // 触发权限变更，监听器不应该被调用
      mockHandle.queryPermission.mockResolvedValue('prompt');
      mockHandle.requestPermission.mockResolvedValue('granted');
      await permissionManager.requestPermission('test-project', mockHandle as any);

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
