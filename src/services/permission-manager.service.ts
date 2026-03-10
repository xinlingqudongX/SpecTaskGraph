/**
 * 权限管理服务
 * 
 * 提供文件系统权限管理功能，包括：
 * - 权限状态监听
 * - 权限撤销和重新授权
 * - 权限状态持久化
 * - 权限变更通知
 */

import { PermissionError } from '../errors/workflow.errors';

/**
 * 权限状态类型
 */
export type PermissionState = 'granted' | 'denied' | 'prompt';

/**
 * 权限变更事件接口
 */
export interface PermissionChangeEvent {
  projectId: string;
  oldState: PermissionState;
  newState: PermissionState;
  timestamp: Date;
}

/**
 * 权限状态记录接口
 */
export interface PermissionRecord {
  projectId: string;
  state: PermissionState;
  lastChecked: Date;
  handle?: FileSystemDirectoryHandle;
}

/**
 * 权限管理器类
 */
export class PermissionManager {
  private static instance: PermissionManager;
  private permissionCache = new Map<string, PermissionRecord>();
  private listeners = new Set<(event: PermissionChangeEvent) => void>();
  private checkInterval: number | null = null;

  /**
   * 获取单例实例
   */
  public static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {
    // 在浏览器环境中启动定期检查
    if (typeof window !== 'undefined') {
      this.startPeriodicCheck();
    }
  }

  /**
   * 获取权限状态
   * 
   * @param projectId 项目ID
   * @param handle 目录句柄（可选）
   * @returns Promise<PermissionState> 权限状态
   */
  public async getPermissionState(
    projectId: string,
    handle?: FileSystemDirectoryHandle
  ): Promise<PermissionState> {
    try {
      // 如果没有提供句柄，尝试从缓存获取
      if (!handle) {
        const cached = this.permissionCache.get(projectId);
        if (cached?.handle) {
          handle = cached.handle;
        } else {
          // 无法获取句柄，返回未知状态
          return 'prompt';
        }
      }

      // 查询权限状态
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      const state = permission as PermissionState;

      // 更新缓存
      this.updatePermissionCache(projectId, state, handle);

      return state;
    } catch (error: any) {
      console.warn(`获取权限状态失败: ${error.message}`);
      return 'denied';
    }
  }

  /**
   * 请求权限
   * 
   * @param projectId 项目ID
   * @param handle 目录句柄
   * @returns Promise<boolean> 是否获得权限
   */
  public async requestPermission(
    projectId: string,
    handle: FileSystemDirectoryHandle
  ): Promise<boolean> {
    try {
      const oldState = await this.getPermissionState(projectId, handle);
      
      // 请求权限
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      const newState = permission as PermissionState;

      // 更新缓存
      this.updatePermissionCache(projectId, newState, handle);

      // 触发权限变更事件
      if (oldState !== newState) {
        this.notifyPermissionChange(projectId, oldState, newState);
      }

      return newState === 'granted';
    } catch (error: any) {
      console.warn(`请求权限失败: ${error.message}`);
      
      // 更新缓存为拒绝状态
      this.updatePermissionCache(projectId, 'denied', handle);
      
      return false;
    }
  }

  /**
   * 撤销权限
   * 
   * @param projectId 项目ID
   */
  public async revokePermission(projectId: string): Promise<void> {
    try {
      const cached = this.permissionCache.get(projectId);
      if (cached) {
        const oldState = cached.state;
        
        // 更新缓存状态
        this.updatePermissionCache(projectId, 'denied');
        
        // 触发权限变更事件
        if (oldState !== 'denied') {
          this.notifyPermissionChange(projectId, oldState, 'denied');
        }
      }
    } catch (error: any) {
      throw new PermissionError(
        `撤销权限失败: ${error.message}`,
        { projectId, operation: 'revoke' }
      );
    }
  }

  /**
   * 检查权限前置条件
   * 
   * @param projectId 项目ID
   * @param handle 目录句柄（可选）
   * @throws PermissionError 当权限不足时
   */
  public async checkPermissionPrerequisite(
    projectId: string,
    handle?: FileSystemDirectoryHandle
  ): Promise<void> {
    const state = await this.getPermissionState(projectId, handle);
    
    if (state !== 'granted') {
      throw PermissionError.revoked(`项目 ${projectId} 的文件访问权限不足`);
    }
  }

  /**
   * 监听权限变更
   * 
   * @param callback 权限变更回调函数
   * @returns 取消监听的函数
   */
  public onPermissionChange(
    callback: (event: PermissionChangeEvent) => void
  ): () => void {
    this.listeners.add(callback);
    
    // 返回取消监听的函数
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 开始定期权限检查
   * 
   * @param interval 检查间隔（毫秒），默认30秒
   */
  public startPeriodicCheck(interval: number = 30000): void {
    if (typeof window === 'undefined') {
      return; // 非浏览器环境不启动定期检查
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = window.setInterval(async () => {
      await this.checkAllPermissions();
    }, interval);
  }

  /**
   * 停止定期权限检查
   */
  public stopPeriodicCheck(): void {
    if (this.checkInterval && typeof window !== 'undefined') {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 获取所有权限状态
   * 
   * @returns Map<string, PermissionRecord> 权限状态映射
   */
  public getAllPermissionStates(): Map<string, PermissionRecord> {
    return new Map(this.permissionCache);
  }

  /**
   * 清除权限缓存
   * 
   * @param projectId 项目ID（可选，不提供则清除所有）
   */
  public clearPermissionCache(projectId?: string): void {
    if (projectId) {
      this.permissionCache.delete(projectId);
    } else {
      this.permissionCache.clear();
    }
  }

  /**
   * 检查浏览器是否支持File System Access API
   * 
   * @returns boolean 是否支持
   */
  public static isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window && 'FileSystemDirectoryHandle' in window;
  }

  /**
   * 获取权限状态的用户友好描述
   * 
   * @param state 权限状态
   * @returns string 描述文本
   */
  public static getPermissionStateDescription(state: PermissionState): string {
    switch (state) {
      case 'granted':
        return '已授权';
      case 'denied':
        return '已拒绝';
      case 'prompt':
        return '待授权';
      default:
        return '未知状态';
    }
  }

  /**
   * 更新权限缓存
   */
  private updatePermissionCache(
    projectId: string,
    state: PermissionState,
    handle?: FileSystemDirectoryHandle
  ): void {
    const existing = this.permissionCache.get(projectId);
    
    this.permissionCache.set(projectId, {
      projectId,
      state,
      lastChecked: new Date(),
      handle: handle || existing?.handle
    });
  }

  /**
   * 通知权限变更
   */
  private notifyPermissionChange(
    projectId: string,
    oldState: PermissionState,
    newState: PermissionState
  ): void {
    const event: PermissionChangeEvent = {
      projectId,
      oldState,
      newState,
      timestamp: new Date()
    };

    // 异步通知所有监听器
    setTimeout(() => {
      this.listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('权限变更监听器执行失败:', error);
        }
      });
    }, 0);
  }

  /**
   * 检查所有缓存的权限状态
   */
  private async checkAllPermissions(): Promise<void> {
    const promises = Array.from(this.permissionCache.entries()).map(
      async ([projectId, record]) => {
        if (record.handle) {
          try {
            // 直接查询权限状态，不更新缓存
            const permission = await record.handle.queryPermission({ mode: 'readwrite' });
            const currentState = permission as PermissionState;
            
            // 如果状态发生变化，触发事件并更新缓存
            if (currentState !== record.state) {
              this.notifyPermissionChange(projectId, record.state, currentState);
              this.updatePermissionCache(projectId, currentState, record.handle);
            } else {
              // 即使状态没变，也更新最后检查时间
              this.updatePermissionCache(projectId, currentState, record.handle);
            }
          } catch (error) {
            console.warn(`检查项目 ${projectId} 权限状态失败:`, error);
          }
        }
      }
    );

    await Promise.allSettled(promises);
  }

  /**
   * 销毁权限管理器
   */
  public destroy(): void {
    this.stopPeriodicCheck();
    this.listeners.clear();
    this.permissionCache.clear();
  }
}

/**
 * 权限管理器装饰器
 * 用于自动检查方法执行前的权限状态
 */
export function requirePermission(projectIdParam: string = 'projectId') {
  return function (
    _target: any,
    _propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const permissionManager = PermissionManager.getInstance();
      
      // 从参数中获取项目ID
      const projectId = this[projectIdParam] || args[0];
      
      if (typeof projectId === 'string') {
        await permissionManager.checkPermissionPrerequisite(projectId);
      }

      return method.apply(this, args);
    };

    return descriptor;
  };
}