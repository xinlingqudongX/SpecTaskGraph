import { CollaborationService } from './collaboration.service';
import type { User, CursorPosition, CollaborationOperation } from './collaboration.service';
import { UserManagerService } from './user-manager.service';
import type { UserConfig } from './user-manager.service';
import { CursorTrackerService } from './cursor-tracker.service';
import type { ConnectionState } from './websocket-manager';

/**
 * 协同管理器配置
 */
interface CollaborationManagerConfig {
  serverUrl: string;
  enabled: boolean;
  autoConnect: boolean;
  cursorTracking: {
    enabled: boolean;
    throttleInterval: number;
    minMovementDistance: number;
  };
}

/**
 * 协同状态（移除了 pendingOperations / conflicts，不再做客户端冲突检测）
 */
export interface CollaborationState {
  isEnabled: boolean;
  isConnected: boolean;
  connectionState: ConnectionState;
  currentUser: UserConfig | null;
  onlineUsers: User[];
}

/**
 * 协同管理器
 * 整合协同服务、用户管理、光标追踪，不再使用 OperationSyncService。
 * 所有操作直接透传给 CollaborationService 广播，冲突由 LWW + 全量快照解决。
 */
export class CollaborationManagerService {
  private config: CollaborationManagerConfig;
  private collaborationService!: CollaborationService;
  private userManager!: UserManagerService;
  private cursorTracker!: CursorTrackerService;

  private currentProjectId: string = '';
  private isInitialized = false;

  private onlineUsers: User[] = [];
  private connectionState: ConnectionState = 'disconnected';

  // 事件回调
  private stateChangeCallbacks: ((state: CollaborationState) => void)[] = [];
  private userJoinCallbacks: ((user: User) => void)[] = [];
  private userLeaveCallbacks: ((userId: string) => void)[] = [];
  private cursorUpdateCallbacks: ((userId: string, position: CursorPosition) => void)[] = [];
  private operationCallbacks: ((operation: CollaborationOperation) => void)[] = [];
  private canvasSnapshotCallbacks: ((graphData: any) => void)[] = [];

  constructor(config: Partial<CollaborationManagerConfig> = {}) {
    this.config = {
      serverUrl: 'ws://localhost:3000',
      enabled: true,
      autoConnect: true,
      cursorTracking: {
        enabled: true,
        throttleInterval: 50,
        minMovementDistance: 2,
      },
      ...config,
    };

    this.initializeServices();
  }

  private initializeServices(): void {
    this.userManager = new UserManagerService();
    this.collaborationService = new CollaborationService();
    this.cursorTracker = new CursorTrackerService({
      enabled: this.config.cursorTracking.enabled,
      throttleInterval: this.config.cursorTracking.throttleInterval,
      minMovementDistance: this.config.cursorTracking.minMovementDistance,
    });

    this.setupEventHandlers();
    this.isInitialized = true;
  }

  private setupEventHandlers(): void {
    this.collaborationService.onConnectionStateChange((state) => {
      this.connectionState = state;
      this.notifyStateChange();
    });

    this.collaborationService.onUserJoin((user) => {
      this.userJoinCallbacks.forEach(cb => cb(user));
    });

    this.collaborationService.onUserLeave((userId) => {
      this.userLeaveCallbacks.forEach(cb => cb(userId));
    });

    this.collaborationService.onCursorUpdate((userId, position) => {
      this.cursorUpdateCallbacks.forEach(cb => cb(userId, position));
    });

    // 远端操作直接转发给 WorkflowEditor，不经过冲突检测
    this.collaborationService.onOperationReceived((operation) => {
      this.operationCallbacks.forEach(cb => cb(operation));
    });

    this.collaborationService.onOnlineUsersUpdate((users) => {
      this.onlineUsers = users;
      this.notifyStateChange();
    });

    // 画布快照：新用户加入时服务端推送的当前画布状态
    this.collaborationService.onCanvasSnapshot((graphData) => {
      this.canvasSnapshotCallbacks.forEach(cb => cb(graphData));
    });

    this.cursorTracker.onPositionUpdate((position) => {
      this.collaborationService.broadcastCursorPosition(position);
    });
  }

  async start(projectId: string, container?: HTMLElement): Promise<void> {
    if (!this.config.enabled) {
      console.log('协同功能已禁用');
      return;
    }

    if (!this.isInitialized) {
      throw new Error('协同管理器未初始化');
    }

    this.currentProjectId = projectId;

    try {
      let currentUser = this.userManager.getCurrentUser();
      if (!currentUser) {
        currentUser = this.userManager.setUserInfo({ userId: '', displayName: '' });
      }

      await this.collaborationService.connect(
        projectId,
        {
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          color: currentUser.color,
        },
        this.config.serverUrl
      );

      if (this.config.cursorTracking.enabled && container) {
        this.cursorTracker.startTracking(container);
      }

      this.notifyStateChange();
    } catch (error) {
      console.error('启动协同功能失败:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.cursorTracker.stopTracking();
      await this.collaborationService.disconnect();
      this.onlineUsers = [];
      this.currentProjectId = '';
      this.connectionState = 'disconnected';
      this.notifyStateChange();
    } catch (error) {
      console.error('停止协同功能失败:', error);
    }
  }

  async reconnect(): Promise<void> {
    if (!this.currentProjectId) {
      throw new Error('无法重连：未设置项目ID');
    }
    await this.collaborationService.reconnect();
  }

  updateUserInfo(userInfo: Partial<UserConfig>): UserConfig {
    const updatedUser = this.userManager.setUserInfo(userInfo);
    if (this.connectionState === 'connected') {
      this.collaborationService.setUserInfo({
        userId: updatedUser.userId,
        displayName: updatedUser.displayName,
        color: updatedUser.color,
      });
    }
    this.notifyStateChange();
    return updatedUser;
  }

  /**
   * 广播操作。生成唯一 operationId 用于客户端去重，不再做冲突检测。
   */
  broadcastOperation(operation: Omit<CollaborationOperation, 'userId' | 'timestamp'>): void {
    const currentUser = this.userManager.getCurrentUser();
    if (!currentUser) {
      console.warn('无法广播操作：用户信息不存在');
      return;
    }

    const operationId = this.generateOperationId();
    const fullOperation: CollaborationOperation = {
      ...operation,
      operationId,
      userId: currentUser.userId,
      timestamp: new Date(),
    };

    this.collaborationService.broadcastOperation(fullOperation);
  }

  getState(): CollaborationState {
    return {
      isEnabled: this.config.enabled,
      isConnected: this.connectionState === 'connected',
      connectionState: this.connectionState,
      currentUser: this.userManager.getCurrentUser(),
      onlineUsers: this.onlineUsers,
    };
  }

  getOnlineUsers(): User[] {
    return [...this.onlineUsers];
  }

  getCurrentUser(): UserConfig | null {
    return this.userManager.getCurrentUser();
  }

  getUserManager(): UserManagerService {
    return this.userManager;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled && this.connectionState === 'connected') {
      this.stop();
    }
    this.notifyStateChange();
  }

  setCursorTrackingEnabled(enabled: boolean): void {
    this.config.cursorTracking.enabled = enabled;
    this.cursorTracker.updateConfig({ enabled });
    if (!enabled) {
      this.cursorTracker.stopTracking();
    }
  }

  updateConfig(config: Partial<CollaborationManagerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.cursorTracking) {
      this.cursorTracker.updateConfig(config.cursorTracking);
    }
  }

  // ── 事件监听注册 ──────────────────────────────────────────────────────────

  onStateChange(callback: (state: CollaborationState) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  onUserJoin(callback: (user: User) => void): void {
    this.userJoinCallbacks.push(callback);
  }

  onUserLeave(callback: (userId: string) => void): void {
    this.userLeaveCallbacks.push(callback);
  }

  onCursorUpdate(callback: (userId: string, position: CursorPosition) => void): void {
    this.cursorUpdateCallbacks.push(callback);
  }

  onOperation(callback: (operation: CollaborationOperation) => void): void {
    this.operationCallbacks.push(callback);
  }

  /** 注册画布快照回调：新用户加入时服务端推送当前画布状态 */
  onCanvasSnapshot(callback: (graphData: any) => void): void {
    this.canvasSnapshotCallbacks.push(callback);
  }

  private notifyStateChange(): void {
    const state = this.getState();
    this.stateChangeCallbacks.forEach(cb => {
      try {
        cb(state);
      } catch (error) {
        console.error('状态变化回调执行失败:', error);
      }
    });
  }

  /** 生成唯一 operationId，用于接收方去重 */
  private generateOperationId(): string {
    const currentUser = this.userManager.getCurrentUser();
    const base = `${currentUser?.userId ?? 'unknown'}-${Date.now()}`;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${base}-${crypto.randomUUID()}`;
    }
    return `${base}-${Math.random().toString(36).slice(2, 9)}`;
  }

  destroy(): void {
    this.stop();
    this.collaborationService.destroy();
    this.cursorTracker.destroy();
    this.stateChangeCallbacks.length = 0;
    this.userJoinCallbacks.length = 0;
    this.userLeaveCallbacks.length = 0;
    this.cursorUpdateCallbacks.length = 0;
    this.operationCallbacks.length = 0;
    this.canvasSnapshotCallbacks.length = 0;
    this.isInitialized = false;
  }
}
