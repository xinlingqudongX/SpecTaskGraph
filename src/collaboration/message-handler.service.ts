import { Injectable, Logger } from '@nestjs/common';
import { 
  WebSocketMessage, 
  MessageType,
  ConnectedUser,
  CursorPosition,
  CollaborationOperation,
  UserInfoUpdate,
  WS_EVENTS
} from './types/collaboration.types';
import { RoomManagerService } from './room-manager.service';
import { UserManagerService } from './user-manager.service';

/**
 * 消息处理服务
 * 负责处理各种协同消息的业务逻辑
 */
@Injectable()
export class MessageHandlerService {
  private readonly logger = new Logger(MessageHandlerService.name);

  constructor(
    private readonly roomManager: RoomManagerService,
    private readonly userManager: UserManagerService,
  ) {}

  /**
   * 处理用户加入消息
   */
  async handleUserJoin(
    server: any,
    client: any,
    projectId: string,
    userInfo: { userId: string; displayName: string }
  ): Promise<void> {
    try {
      this.logger.log(`处理用户加入: ${userInfo.displayName} -> ${projectId}`);

      // 检查显示名称是否重复
      let displayName = userInfo.displayName;
      if (this.userManager.isDisplayNameTaken(displayName, userInfo.userId)) {
        displayName = this.userManager.generateUniqueDisplayName(displayName);
        this.logger.log(`显示名称重复，生成唯一名称: ${displayName}`);
      }

      // 创建连接用户对象
      const connectedUser: ConnectedUser = {
        userId: userInfo.userId,
        displayName,
        client,
        joinedAt: new Date(),
        lastActivity: new Date(),
      };

      // 添加用户到房间和用户管理器
      this.roomManager.addUserToRoom(projectId, connectedUser);
      this.userManager.addUser(connectedUser);

      // 创建用户加入消息
      const joinMessage: WebSocketMessage = {
        type: 'user-join',
        projectId,
        userId: userInfo.userId,
        timestamp: new Date().toISOString(),
        data: {
          displayName,
          userId: userInfo.userId,
          joinedAt: connectedUser.joinedAt,
        },
      };

      // 广播给房间内其他用户
      this.broadcastToRoom(server, projectId, joinMessage, client);

      // 向新用户发送当前在线用户列表（包含所有用户，包括自己）
      const allUsersInRoom = this.roomManager.getUsersInRoom(projectId);
      const onlineUsers = allUsersInRoom.map(u => ({
        userId: u.userId,
        displayName: u.displayName,
        isOnline: true,
        lastSeen: u.lastActivity,
      }));

      this.sendMessage(client, {
        type: 'online-users',
        projectId,
        userId: userInfo.userId,
        timestamp: new Date().toISOString(),
        data: {
          users: onlineUsers,
          timestamp: new Date().toISOString(),
        },
      });

      // 向房间内所有用户（包括新加入的用户）广播更新后的在线用户列表
      const updatedOnlineUsers = this.roomManager.getUsersInRoom(projectId).map(u => ({
        userId: u.userId,
        displayName: u.displayName,
        isOnline: true,
        lastSeen: u.lastActivity,
      }));

      this.broadcastToRoom(server, projectId, {
        type: 'online-users',
        projectId,
        userId: 'system',
        timestamp: new Date().toISOString(),
        data: {
          users: updatedOnlineUsers,
          timestamp: new Date().toISOString(),
        },
      });

      // 发送加入成功确认
      this.sendMessage(client, {
        type: 'room-joined',
        projectId,
        userId: userInfo.userId,
        timestamp: new Date().toISOString(),
        data: {
          projectId,
          userCount: this.roomManager.getUsersInRoom(projectId).length,
          assignedDisplayName: displayName, // 返回实际分配的显示名称
          timestamp: new Date().toISOString(),
        },
      });

      // 若房间有历史画布快照，发送给新加入的用户以同步当前画布状态
      const currentRoom = this.roomManager.getRoom(projectId);
      if (currentRoom?.canvasSnapshot) {
        try {
          const graphData = JSON.parse(currentRoom.canvasSnapshot);
          this.sendMessage(client, {
            type: 'canvas-snapshot',
            projectId,
            userId: 'system',
            timestamp: new Date().toISOString(),
            data: { graphData },
          });
        } catch {
          this.logger.warn(`发送画布快照失败，快照数据无效: ${projectId}`);
        }
      }

      // 记录操作日志
      this.logOperation('user-join', userInfo.userId, projectId, {
        displayName,
        userCount: this.roomManager.getUsersInRoom(projectId).length,
      });

    } catch (error) {
      this.logger.error(`处理用户加入失败: ${error.message}`, error.stack);
      this.sendErrorMessage(client, {
        message: '加入房间失败',
        error: error.message,
        code: 'JOIN_ROOM_FAILED',
      });
    }
  }

  /**
   * 处理用户离开消息
   */
  async handleUserLeave(
    server: any,
    client: any,
    projectId: string
  ): Promise<void> {
    try {
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (!user) {
        this.logger.warn(`尝试离开房间但用户不存在: ${this.getClientId(client)}`);
        return;
      }

      this.logger.log(`处理用户离开: ${user.displayName} <- ${projectId}`);

      // 从房间中移除用户
      this.roomManager.removeUserFromRoom(projectId, user.userId);

      // 创建用户离开消息
      const leaveMessage: WebSocketMessage = {
        type: 'user-leave',
        projectId,
        userId: user.userId,
        timestamp: new Date().toISOString(),
        data: {
          displayName: user.displayName,
          userId: user.userId,
          leftAt: new Date(),
        },
      };

      // 广播给房间内其他用户
      this.broadcastToRoom(server, projectId, leaveMessage, client);

      // 向房间内剩余用户广播更新后的在线用户列表
      const remainingUsers = this.roomManager.getUsersInRoom(projectId).map(u => ({
        userId: u.userId,
        displayName: u.displayName,
        isOnline: true,
        lastSeen: u.lastActivity,
      }));

      this.broadcastToRoom(server, projectId, {
        type: 'online-users',
        projectId,
        userId: 'system',
        timestamp: new Date().toISOString(),
        data: {
          users: remainingUsers,
          timestamp: new Date().toISOString(),
        },
      });

      // 发送离开确认
      this.sendMessage(client, {
        type: 'room-left',
        projectId,
        userId: user.userId,
        timestamp: new Date().toISOString(),
        data: {
          projectId,
          timestamp: new Date().toISOString(),
        },
      });

      // 记录操作日志
      this.logOperation('user-leave', user.userId, projectId, {
        displayName: user.displayName,
        sessionTime: Date.now() - user.joinedAt.getTime(),
      });

    } catch (error) {
      this.logger.error(`处理用户离开失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 处理光标位置同步消息
   */
  async handleCursorMove(
    server: any,
    client: any,
    projectId: string,
    position: CursorPosition
  ): Promise<void> {
    try {
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (!user) {
        this.logger.warn(`光标移动但用户不存在: ${this.getClientId(client)}`);
        return;
      }

      // 更新用户活动时间
      this.userManager.updateUserActivity(user.userId);

      // 验证光标位置数据
      if (!this.isValidCursorPosition(position)) {
        this.logger.warn(`无效的光标位置数据: ${JSON.stringify(position)}`);
        return;
      }

      // 创建光标移动消息
      const cursorMessage: WebSocketMessage = {
        type: 'cursor-move',
        projectId,
        userId: user.userId,
        timestamp: new Date().toISOString(),
        data: {
          position: {
            ...position,
            timestamp: new Date(), // 使用服务器时间戳
          },
          displayName: user.displayName,
          userId: user.userId,
        },
      };

      // 广播给房间内其他用户（不包括发送者）
      this.broadcastToRoom(server, projectId, cursorMessage, client);

      // 记录详细日志（仅在调试模式下）
      if ((process as any)?.env?.NODE_ENV === 'development') {
        this.logger.debug(
          `光标移动: ${user.displayName} (${position.x}, ${position.y}) in ${projectId}`
        );
      }

    } catch (error) {
      this.logger.error(`处理光标移动失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 处理节点操作同步消息
   */
  async handleNodeOperation(
    server: any,
    client: any,
    projectId: string,
    operation: CollaborationOperation
  ): Promise<void> {
    try {
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (!user) {
        this.logger.warn(`节点操作但用户不存在: ${this.getClientId(client)}`);
        return;
      }

      // 更新用户活动时间
      this.userManager.updateUserActivity(user.userId);

      // 验证操作数据
      if (!this.isValidNodeOperation(operation)) {
        this.logger.warn(`无效的节点操作数据: ${JSON.stringify(operation)}`);
        this.sendErrorMessage(client, {
          message: '无效的节点操作数据',
          code: 'INVALID_OPERATION',
        });
        return;
      }

      // 分配单调递增的服务端序号
      const room = this.roomManager.getRoom(projectId);
      const serverSeq = room ? ++room.seq : 0;

      // canvas-sync 类型操作存储画布快照，供新加入用户同步
      if (operation.type === 'canvas-sync' && room) {
        const graphData = (operation.data as any)?.graphData;
        if (graphData) {
          room.canvasSnapshot = typeof graphData === 'string'
            ? graphData
            : JSON.stringify(graphData);
        }
      }

      // 创建节点操作消息，注入 serverSeq 供客户端去重排序
      const operationMessage: WebSocketMessage = {
        type: 'node-operation',
        projectId,
        userId: user.userId,
        timestamp: new Date().toISOString(),
        data: {
          operation: {
            ...operation,
            userId: user.userId, // 确保使用服务器端的用户ID
            timestamp: new Date(), // 使用服务器时间戳
          },
          displayName: user.displayName,
          operationId: this.generateOperationId(), // 唯一操作ID，用于客户端去重
          serverSeq,                               // 服务端序号
        },
      };

      // 广播给房间内其他用户（不包括发送者）
      this.broadcastToRoom(server, projectId, operationMessage, client);

      // 记录操作日志
      this.logOperation('node-operation', user.userId, projectId, {
        operationType: operation.type,
        nodeId: operation.nodeId,
        edgeId: operation.edgeId,
        displayName: user.displayName,
      });

    } catch (error) {
      this.logger.error(`处理节点操作失败: ${error.message}`, error.stack);
      this.sendErrorMessage(client, {
        message: '节点操作处理失败',
        error: error.message,
        code: 'OPERATION_FAILED',
      });
    }
  }

  /**
   * 处理用户信息更新消息
   */
  async handleUserInfoUpdate(
    server: any,
    client: any,
    projectId: string,
    userInfo: UserInfoUpdate
  ): Promise<void> {
    try {
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (!user) {
        this.logger.warn(`用户信息更新但用户不存在: ${this.getClientId(client)}`);
        return;
      }

      const oldDisplayName = user.displayName;

      // 验证并处理显示名称更新
      if (userInfo.displayName) {
        let newDisplayName = userInfo.displayName.trim();
        
        // 检查名称长度
        if (newDisplayName.length === 0 || newDisplayName.length > 50) {
          this.sendErrorMessage(client, {
            message: '显示名称长度必须在1-50个字符之间',
            code: 'INVALID_DISPLAY_NAME',
          });
          return;
        }

        // 检查名称是否重复
        if (this.userManager.isDisplayNameTaken(newDisplayName, user.userId)) {
          newDisplayName = this.userManager.generateUniqueDisplayName(newDisplayName);
        }

        // 更新用户信息
        this.userManager.updateUserInfo(user.userId, {
          displayName: newDisplayName,
        });

        // 创建用户信息更新消息
        const updateMessage: WebSocketMessage = {
          type: 'user-info-update',
          projectId,
          userId: user.userId,
          timestamp: new Date().toISOString(),
          data: {
            displayName: newDisplayName,
            oldDisplayName,
            userId: user.userId,
          },
        };

        // 广播给房间内所有用户（包括发送者，用于确认）
        this.broadcastToRoom(server, projectId, updateMessage);

        // 记录操作日志
        this.logOperation('user-info-update', user.userId, projectId, {
          oldDisplayName,
          newDisplayName,
        });
      }

    } catch (error) {
      this.logger.error(`处理用户信息更新失败: ${error.message}`, error.stack);
      this.sendErrorMessage(client, {
        message: '用户信息更新失败',
        error: error.message,
        code: 'UPDATE_FAILED',
      });
    }
  }

  /**
   * 处理心跳消息
   */
  async handleHeartbeat(client: any): Promise<void> {
    try {
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (user) {
        this.userManager.updateUserActivity(user.userId);
      }

      // 回复心跳确认
      this.sendMessage(client, {
        type: 'heartbeat-ack',
        projectId: '',
        userId: user?.userId || '',
        timestamp: new Date().toISOString(),
        data: {
          timestamp: new Date().toISOString(),
          userId: user?.userId,
        },
      });

    } catch (error) {
      this.logger.error(`处理心跳失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 广播系统消息到房间
   */
  async broadcastSystemMessage(
    server: any,
    projectId: string,
    messageType: string,
    data: any
  ): Promise<void> {
    try {
      const systemMessage: WebSocketMessage = {
        type: messageType as MessageType,
        projectId,
        userId: 'system',
        timestamp: new Date().toISOString(),
        data,
      };

      this.broadcastToRoom(server, projectId, systemMessage);

      this.logger.log(`系统消息广播到房间 ${projectId}: ${messageType}`);

    } catch (error) {
      this.logger.error(`广播系统消息失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 验证光标位置数据
   */
  private isValidCursorPosition(position: CursorPosition): boolean {
    return (
      typeof position.x === 'number' &&
      typeof position.y === 'number' &&
      !isNaN(position.x) &&
      !isNaN(position.y) &&
      position.x >= 0 &&
      position.y >= 0 &&
      position.x <= 10000 && // 合理的画布大小限制
      position.y <= 10000
    );
  }

  /**
   * 验证节点操作数据
   */
  private isValidNodeOperation(operation: CollaborationOperation): boolean {
    const validTypes = ['node-create', 'node-update', 'node-delete', 'edge-create', 'edge-delete', 'canvas-sync'];
    
    if (!validTypes.includes(operation.type)) {
      return false;
    }

    // canvas-sync 只需要 data.graphData，不需要 nodeId / edgeId
    if (operation.type === 'canvas-sync') {
      return true;
    }

    // 节点操作必须有nodeId
    if (operation.type.startsWith('node-') && !operation.nodeId) {
      return false;
    }

    // 边操作必须有edgeId
    if (operation.type.startsWith('edge-') && !operation.edgeId) {
      return false;
    }

    return true;
  }

  /**
   * 生成唯一操作ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录操作日志
   */
  private logOperation(
    operation: string,
    userId: string,
    projectId: string,
    details: any
  ): void {
    this.logger.log(
      `操作记录: ${operation} | 用户: ${userId} | 项目: ${projectId} | 详情: ${JSON.stringify(details)}`
    );
  }

  /**
   * 获取房间内用户的光标位置快照
   */
  async getCursorSnapshot(projectId: string): Promise<Array<{
    userId: string;
    displayName: string;
    lastActivity: Date;
  }>> {
    const users = this.roomManager.getUsersInRoom(projectId);
    
    return users.map(user => ({
      userId: user.userId,
      displayName: user.displayName,
      lastActivity: user.lastActivity,
    }));
  }

  /**
   * 检查用户是否有权限执行操作
   */
  private hasPermission(userId: string, operation: string, projectId: string): boolean {
    // 这里可以实现更复杂的权限检查逻辑
    // 目前简单返回true，允许所有操作
    return true;
  }

  /**
   * 限制消息频率（防止垃圾消息）
   */
  private rateLimitCheck(userId: string, messageType: string): boolean {
    // 这里可以实现消息频率限制
    // 例如：光标移动消息每秒最多50次
    // 目前简单返回true，不限制
    return true;
  }

  /**
   * 发送消息到客户端
   */
  private sendMessage(client: any, message: WebSocketMessage): void {
    try {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(JSON.stringify(message));
      }
    } catch (error) {
      this.logger.error(`发送消息失败: ${error.message}`);
    }
  }

  /**
   * 发送错误消息
   */
  private sendErrorMessage(client: any, error: { message: string; code: string; error?: string }): void {
    this.sendMessage(client, {
      type: 'error',
      projectId: '',
      userId: '',
      timestamp: new Date().toISOString(),
      data: error,
    });
  }

  /**
   * 广播消息到房间
   */
  private broadcastToRoom(server: any, projectId: string, message: WebSocketMessage, excludeClient?: any): void {
    const room = this.roomManager.getRoom(projectId);
    if (!room) return;

    for (const user of room.users.values()) {
      if (user.client !== excludeClient && user.client.readyState === 1) { // 1 = OPEN
        this.sendMessage(user.client, message);
      }
    }
  }

  /**
   * 处理节点选中/取消选中，广播给房间内其他用户。
   * 其他用户收到后可在画布上显示彩色选中框，感知协作者的焦点。
   */
  async handleNodeSelect(
    server: any,
    client: any,
    projectId: string,
    data: { nodeIds: string[]; selected: boolean; color?: string; displayName?: string }
  ): Promise<void> {
    try {
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (!user) return;

      this.broadcastToRoom(server, projectId, {
        type: 'node-select',
        projectId,
        userId: user.userId,
        timestamp: new Date().toISOString(),
        data: {
          nodeIds: data.nodeIds,
          selected: data.selected,
          color: data.color || '#409eff',
          displayName: user.displayName,
          userId: user.userId,
        },
      }, client);

    } catch (error) {
      this.logger.error(`处理节点选中失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 获取客户端ID
   */
  private getClientId(client: any): string {
    // 为WebSocket客户端生成唯一ID
    if (!client._clientId) {
      client._clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return client._clientId;
  }
}