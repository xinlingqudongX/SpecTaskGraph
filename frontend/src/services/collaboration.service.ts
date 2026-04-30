import { WebSocketManager } from './websocket-manager';
import type { ConnectionState, WebSocketMessage } from './websocket-manager';
import { getWebSocketUrl, HEARTBEAT_CONFIG } from '../config/websocket.config';

/**
 * 用户信息
 */
export interface UserInfo {
  userId: string;
  displayName: string;
  color?: string;
}

/**
 * 在线用户
 */
export interface User extends UserInfo {
  isOnline: boolean;
  lastSeen: Date;
}

/**
 * 光标位置
 */
export interface CursorPosition {
  x: number;
  y: number;
  timestamp: Date;
}

/**
 * 协同操作类型（含 node-select 用于多人选中感知）
 */
export type CollaborationOperationType = 
  | 'node-create'
  | 'node-update'
  | 'node-delete'
  | 'edge-create'
  | 'edge-delete'
  | 'node-select'
  | 'canvas-sync';

/**
 * 协同操作
 */
export interface CollaborationOperation {
  type: CollaborationOperationType;
  nodeId?: string;
  edgeId?: string;
  data?: unknown;
  userId: string;
  displayName?: string;
  timestamp: Date;
  // 客户端生成的唯一 ID，用于接收方去重，防止重复应用
  operationId?: string;
  // 服务端分配的单调递增序号，用于排序和去重
  serverSeq?: number;
}

/**
 * 协同服务
 * 管理WebSocket连接和实时协同功能的高级接口
 */
export class CollaborationService {
  private wsManager: WebSocketManager;
  private currentProjectId: string = '';
  private currentUserInfo: UserInfo | null = null;
  private onlineUsers: Map<string, User> = new Map();
  private heartbeatTimer: number | null = null;

  // 事件回调
  private cursorUpdateCallbacks: ((userId: string, position: CursorPosition) => void)[] = [];
  private operationCallbacks: ((operation: CollaborationOperation) => void)[] = [];
  private userJoinCallbacks: ((user: User) => void)[] = [];
  private userLeaveCallbacks: ((userId: string) => void)[] = [];
  private connectionStateCallbacks: ((state: ConnectionState) => void)[] = [];
  private onlineUsersUpdateCallbacks: ((users: User[]) => void)[] = [];
  // 服务端推送的画布快照回调（新用户加入时触发）
  private canvasSnapshotCallbacks: ((graphData: any) => void)[] = [];

  constructor() {
    this.wsManager = new WebSocketManager();
    this.setupMessageHandlers();
  }

  /**
   * 连接到协同服务器
   */
  async connect(projectId: string, userInfo: UserInfo, serverUrl?: string): Promise<void> {
    this.currentProjectId = projectId;
    this.currentUserInfo = userInfo;

    const wsUrl = serverUrl || getWebSocketUrl();

    try {
      // 建立WebSocket连接
      await this.wsManager.connect(wsUrl);
      
      // 加入项目房间
      await this.joinRoom(projectId, userInfo);
      
      console.log(`已连接到协同服务器并加入项目: ${projectId}`);
    } catch (error) {
      console.error('连接协同服务器失败:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.currentProjectId && this.wsManager.getConnectionState() === 'connected') {
      // 离开项目房间
      this.wsManager.send({
        type: 'leave-room',
        projectId: this.currentProjectId,
        userId: this.currentUserInfo?.userId || '',
        timestamp: new Date().toISOString(),
        data: { projectId: this.currentProjectId },
      });
    }

    this.wsManager.disconnect();
    this.onlineUsers.clear();
    this.currentProjectId = '';
    this.currentUserInfo = null;
    
    console.log('已断开协同服务器连接');
  }

  /**
   * 重连
   */
  async reconnect(): Promise<void> {
    if (!this.currentProjectId || !this.currentUserInfo) {
      throw new Error('无法重连：缺少项目ID或用户信息');
    }

    await this.wsManager.reconnect();
    
    // 重新加入房间
    await this.joinRoom(this.currentProjectId, this.currentUserInfo);
  }

  /**
   * 设置用户信息
   */
  setUserInfo(userInfo: UserInfo): void {
    this.currentUserInfo = userInfo;
    
    // 如果已连接，更新服务器上的用户信息
    if (this.wsManager.getConnectionState() === 'connected' && this.currentProjectId) {
      this.wsManager.send({
        type: 'user-info-update',
        projectId: this.currentProjectId,
        userId: userInfo.userId,
        timestamp: new Date().toISOString(),
        data: {
          displayName: userInfo.displayName,
          color: userInfo.color,
        },
      });
    }
  }

  /**
   * 获取在线用户列表
   */
  getOnlineUsers(): User[] {
    return Array.from(this.onlineUsers.values());
  }

  /**
   * 广播光标位置
   */
  broadcastCursorPosition(position: CursorPosition): void {
    if (!this.currentUserInfo || !this.currentProjectId) return;

    this.wsManager.send({
      type: 'cursor-move',
      projectId: this.currentProjectId,
      userId: this.currentUserInfo.userId,
      timestamp: new Date().toISOString(),
      // projectId 必须在 data 内，否则后端 @MessageBody() 中 data.projectId 为 undefined
      data: { projectId: this.currentProjectId, position },
    });
  }

  /**
   * 广播操作
   */
  broadcastOperation(operation: CollaborationOperation): void {
    if (!this.currentUserInfo || !this.currentProjectId) return;

    this.wsManager.send({
      type: 'node-operation',
      projectId: this.currentProjectId,
      userId: this.currentUserInfo.userId,
      timestamp: new Date().toISOString(),
      data: { projectId: this.currentProjectId, operation },
    });
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): ConnectionState {
    return this.wsManager.getConnectionState();
  }

  /**
   * 启用自动重连
   */
  enableAutoReconnect(enabled: boolean): void {
    this.wsManager.enableAutoReconnect(enabled);
  }

  /**
   * 设置重连间隔
   */
  setReconnectInterval(interval: number): void {
    this.wsManager.setReconnectInterval(interval);
  }

  // 事件监听器注册方法
  onCursorUpdate(callback: (userId: string, position: CursorPosition) => void): void {
    this.cursorUpdateCallbacks.push(callback);
  }

  onOperationReceived(callback: (operation: CollaborationOperation) => void): void {
    this.operationCallbacks.push(callback);
  }

  onUserJoin(callback: (user: User) => void): void {
    this.userJoinCallbacks.push(callback);
  }

  onUserLeave(callback: (userId: string) => void): void {
    this.userLeaveCallbacks.push(callback);
  }

  onConnectionStateChange(callback: (state: ConnectionState) => void): void {
    this.connectionStateCallbacks.push(callback);
    this.wsManager.onStateChange(callback);
  }

  onOnlineUsersUpdate(callback: (users: User[]) => void): void {
    this.onlineUsersUpdateCallbacks.push(callback);
  }

  /**
   * 加入项目房间
   */
  private async joinRoom(projectId: string, userInfo: UserInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.wsManager.offMessage(handleRoomJoined);
        reject(new Error('加入房间超时'));
      }, 10000);

      // 监听房间加入成功事件
      // message.projectId 来自 payload，做宽松匹配（兼容 projectId 在 data 内部的情况）
      const handleRoomJoined = (message: WebSocketMessage) => {
        const msgData = message.data as any;
        const msgProjectId = message.projectId || msgData?.projectId || msgData?.roomId || '';
        if (message.type === 'room-joined' && (msgProjectId === projectId || msgProjectId === '')) {
          clearTimeout(timeout);
          this.wsManager.offMessage(handleRoomJoined);
          console.log(`已加入项目房间: ${projectId}`, message.data);
          resolve();
        }
      };

      // 临时监听器，只监听一次
      this.wsManager.onMessage(handleRoomJoined);

      // 发送加入房间请求
      console.log('发送加入房间请求:', { projectId, userInfo });
      this.wsManager.send({
        type: 'join-room',
        projectId,
        userId: userInfo.userId,
        timestamp: new Date().toISOString(),
        data: { projectId, userInfo },
      });
    });
  }

  /**
   * 设置消息处理器
   */
  private setupMessageHandlers(): void {
    this.wsManager.onMessage((message) => {
      this.handleMessage(message);
    });

    // 定期发送心跳
    this.heartbeatTimer = window.setInterval(() => {
      if (this.wsManager.getConnectionState() === 'connected') {
        this.wsManager.sendHeartbeat();
      }
    }, HEARTBEAT_CONFIG.interval);
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: WebSocketMessage): void {
    try {
      console.log('收到协同消息:', message.type, message.data);
      
      switch (message.type) {
        case 'user-join':
          this.handleUserJoin(message);
          break;
        case 'user-leave':
          this.handleUserLeave(message);
          break;
        case 'cursor-move':
          this.handleCursorMove(message);
          break;
        case 'node-operation':
          this.handleNodeOperation(message);
          break;
        case 'online-users':
          this.handleOnlineUsers(message);
          break;
        case 'room-joined':
          console.log('房间加入成功:', message.data);
          break;
        case 'room-left':
          console.log('已离开房间');
          break;
        case 'connection-established':
          console.log('连接已建立:', message.data);
          break;
        case 'node-select':
          this.handleNodeSelectMessage(message);
          break;
        case 'canvas-snapshot':
          this.handleCanvasSnapshot(message);
          break;
        case 'heartbeat-ack':
          // 心跳确认，不需要特殊处理
          break;
        default:
          console.log('收到未知消息类型:', message.type, message.data);
      }
    } catch (error) {
      console.error('处理消息失败:', error);
    }
  }

  /**
   * 处理用户加入
   */
  private handleUserJoin(message: WebSocketMessage): void {
    const data = message.data as any;
    if (!data || !data.userId || !data.displayName) return;

    const user: User = {
      userId: data.userId,
      displayName: data.displayName,
      color: data.color,
      isOnline: true,
      lastSeen: new Date(),
    };

    this.onlineUsers.set(user.userId, user);
    
    // 通知用户加入回调
    this.userJoinCallbacks.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error('用户加入回调执行失败:', error);
      }
    });

    this.notifyOnlineUsersUpdate();
  }

  /**
   * 处理用户离开
   */
  private handleUserLeave(message: WebSocketMessage): void {
    const data = message.data as any;
    if (!data || !data.userId) return;

    this.onlineUsers.delete(data.userId);
    
    // 通知用户离开回调
    this.userLeaveCallbacks.forEach(callback => {
      try {
        callback(data.userId);
      } catch (error) {
        console.error('用户离开回调执行失败:', error);
      }
    });

    this.notifyOnlineUsersUpdate();
  }

  /**
   * 处理光标移动
   */
  private handleCursorMove(message: WebSocketMessage): void {
    const data = message.data as any;
    if (!data || !data.position) return;

    const position: CursorPosition = {
      x: data.position.x,
      y: data.position.y,
      timestamp: new Date(data.position.timestamp || message.timestamp),
    };

    // userId 优先取 payload 内部字段，其次取消息顶层字段
    const userId = message.userId || data.userId || data.clientId || '';

    this.cursorUpdateCallbacks.forEach(callback => {
      try {
        callback(userId, position);
      } catch (error) {
        console.error('光标更新回调执行失败:', error);
      }
    });
  }

  /**
   * 处理节点操作
   */
  private handleNodeOperation(message: WebSocketMessage): void {
    const data = message.data as any;
    if (!data || !data.operation) return;

    const operation: CollaborationOperation = {
      type: data.operation.type,
      nodeId: data.operation.nodeId,
      edgeId: data.operation.edgeId,
      data: data.operation.data,
      userId: message.userId || data.userId || data.clientId || '',
      displayName: data.displayName || '',
      timestamp: new Date(data.operation.timestamp || message.timestamp),
      // 透传后端生成的唯一 ID 和序号，供客户端去重
      operationId: data.operationId,
      serverSeq: data.serverSeq,
    };

    // 通知操作回调
    this.operationCallbacks.forEach(callback => {
      try {
        callback(operation);
      } catch (error) {
        console.error('操作回调执行失败:', error);
      }
    });
  }

  /**
   * 将 node-select 消息转换为 operation 并通知订阅者，
   * 复用 operationCallbacks 通道避免新增回调类型。
   */
  private handleNodeSelectMessage(message: WebSocketMessage): void {
    const data = message.data as any;
    const operation: CollaborationOperation = {
      type: 'node-select',
      nodeId: data?.nodeIds?.[0],
      data,
      userId: message.userId || data?.userId || '',
      timestamp: new Date(message.timestamp),
    };
    this.operationCallbacks.forEach(cb => {
      try { cb(operation); } catch (err) { console.error('node-select 回调失败:', err); }
    });
  }

  /**
   * 处理服务端推送的画布快照（新用户加入时接收当前画布状态）
   */
  private handleCanvasSnapshot(message: WebSocketMessage): void {
    const data = message.data as any;
    if (!data?.graphData) return;
    this.canvasSnapshotCallbacks.forEach(cb => {
      try { cb(data.graphData); } catch (err) { console.error('canvas-snapshot 回调失败:', err); }
    });
  }

  /** 注册画布快照回调，新用户加入时由服务端触发一次 */
  onCanvasSnapshot(callback: (graphData: any) => void): void {
    this.canvasSnapshotCallbacks.push(callback);
  }

  /**
   * 广播节点选中/取消选中状态给其他协作者
   */
  broadcastNodeSelect(nodeIds: string[], selected: boolean, color?: string): void {
    if (!this.currentUserInfo || !this.currentProjectId) return;
    this.wsManager.send({
      type: 'node-select',
      projectId: this.currentProjectId,
      userId: this.currentUserInfo.userId,
      timestamp: new Date().toISOString(),
      data: { projectId: this.currentProjectId, nodeIds, selected, color },
    });
  }

  /**
   * 处理在线用户列表
   */
  private handleOnlineUsers(message: WebSocketMessage): void {
    const data = message.data as any;
    // NestJS 可能把 users 放在 data.users，也可能直接是数组
    const userList: any[] = data?.users ?? (Array.isArray(data) ? data : []);
    if (!userList.length && !data?.users) return;

    this.onlineUsers.clear();

    userList.forEach((userData: any) => {
      if (userData.userId && userData.displayName) {
        const user: User = {
          userId: userData.userId,
          displayName: userData.displayName,
          color: userData.color,
          isOnline: userData.isOnline !== false,
          lastSeen: new Date(userData.lastSeen || Date.now()),
        };
        this.onlineUsers.set(user.userId, user);
      }
    });

    console.log(`更新在线用户列表: ${this.onlineUsers.size} 人在线`);
    this.notifyOnlineUsersUpdate();
  }

  /**
   * 通知在线用户列表更新
   */
  private notifyOnlineUsersUpdate(): void {
    const users = this.getOnlineUsers();
    this.onlineUsersUpdateCallbacks.forEach(callback => {
      try {
        callback(users);
      } catch (error) {
        console.error('在线用户更新回调执行失败:', error);
      }
    });
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.disconnect();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.wsManager.destroy();
    
    // 清空所有回调
    this.cursorUpdateCallbacks.length = 0;
    this.operationCallbacks.length = 0;
    this.userJoinCallbacks.length = 0;
    this.userLeaveCallbacks.length = 0;
    this.connectionStateCallbacks.length = 0;
    this.onlineUsersUpdateCallbacks.length = 0;
  }
}
