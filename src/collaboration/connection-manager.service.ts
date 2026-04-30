import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { RoomManagerService } from './room-manager.service';
import { UserManagerService } from './user-manager.service';
import { COLLABORATION_CONFIG } from './types/collaboration.types';

/**
 * 连接管理服务
 * 负责管理WebSocket连接、检测僵尸连接、实现心跳机制和资源保护
 */
@Injectable()
export class ConnectionManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionManagerService.name);
  private server: any | null = null;
  private heartbeatInterval: any | null = null;
  private cleanupInterval: any | null = null;
  private connectionLimits = new Map<string, number>(); // IP -> 连接数
  private userHeartbeats = new Map<string, Date>(); // userId -> 最后心跳时间
  private maxConnectionsPerIP = 10; // 单个IP最大连接数
  private maxTotalConnections = 1000; // 服务器最大总连接数

  constructor(
    private readonly roomManager: RoomManagerService,
    private readonly userManager: UserManagerService,
  ) {}

  /**
   * 模块初始化
   */
  onModuleInit() {
    this.startHeartbeatMonitoring();
    this.startCleanupTask();
    this.logger.log('连接管理服务已启动');
  }

  /**
   * 模块销毁
   */
  onModuleDestroy() {
    this.stopHeartbeatMonitoring();
    this.stopCleanupTask();
    this.logger.log('连接管理服务已停止');
  }

  /**
   * 设置WebSocket服务器实例
   */
  setServer(server: any) {
    this.server = server;
  }

  /**
   * 处理新连接
   */
  handleConnection(client: any, request: any): boolean {
    try {
      const clientIP = this.getClientIP(request);

      // 检查总连接数限制
      if (
        this.server &&
        this.getConnectedClientsCount() >= this.maxTotalConnections
      ) {
        this.logger.warn(
          `服务器连接数已达上限 (${this.maxTotalConnections})，拒绝新连接: ${this.getClientId(client)}`,
        );
        this.sendErrorMessage(client, {
          message: '服务器连接数已满，请稍后重试',
          code: 'SERVER_FULL',
        });
        client.close();
        return false;
      }

      // 检查单IP连接数限制
      const currentConnections = this.connectionLimits.get(clientIP) || 0;
      if (currentConnections >= this.maxConnectionsPerIP) {
        this.logger.warn(
          `IP ${clientIP} 连接数已达上限 (${this.maxConnectionsPerIP})，拒绝新连接: ${this.getClientId(client)}`,
        );
        this.sendErrorMessage(client, {
          message: '单个IP连接数已达上限',
          code: 'IP_LIMIT_EXCEEDED',
        });
        client.close();
        return false;
      }

      // 更新连接计数
      this.connectionLimits.set(clientIP, currentConnections + 1);

      // 设置连接元数据
      (client as any).connectedAt = new Date();
      (client as any).clientIP = clientIP;
      (client as any).lastHeartbeat = new Date();
      (client as any).id = this.generateClientId();

      // 设置连接超时
      this.setupConnectionTimeout(client);

      this.logger.log(
        `新连接建立: ${this.getClientId(client)} (IP: ${clientIP}), ` +
          `当前总连接数: ${this.getConnectedClientsCount()}`,
      );

      return true;
    } catch (error: any) {
      this.logger.error(`处理新连接失败: ${error.message}`, error.stack);
      client.close();
      return false;
    }
  }

  /**
   * 处理连接断开
   */
  handleDisconnection(client: any) {
    try {
      const clientIP = (client as any).clientIP;
      const connectedAt = (client as any).connectedAt;
      const sessionDuration = connectedAt
        ? Date.now() - connectedAt.getTime()
        : 0;

      // 更新连接计数
      if (clientIP) {
        const currentConnections = this.connectionLimits.get(clientIP) || 0;
        if (currentConnections > 1) {
          this.connectionLimits.set(clientIP, currentConnections - 1);
        } else {
          this.connectionLimits.delete(clientIP);
        }
      }

      // 清理用户数据
      const user = this.userManager.getUserByClientId(this.getClientId(client));
      if (user) {
        // 从所有房间中移除用户
        const rooms = this.roomManager.getUserRooms(user.userId);
        for (const projectId of rooms) {
          this.roomManager.removeUserFromRoom(projectId, user.userId);

          // 通知房间内其他用户
          if (this.server) {
            this.broadcastToRoom(projectId, {
              type: 'user-leave',
              projectId,
              userId: user.userId,
              timestamp: new Date().toISOString(),
              data: {
                displayName: user.displayName,
                userId: user.userId,
                reason: 'disconnected',
              },
            });
          }
        }

        // 移除用户
        this.userManager.removeUser(user.userId);
        this.userHeartbeats.delete(user.userId);
      }

      this.logger.log(
        `连接断开: ${this.getClientId(client)} (IP: ${clientIP}), ` +
          `会话时长: ${Math.round(sessionDuration / 1000)}秒, ` +
          `剩余连接数: ${this.getConnectedClientsCount()}`,
      );
    } catch (error: any) {
      this.logger.error(`处理连接断开失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 处理心跳消息
   */
  handleHeartbeat(client: any, userId?: string) {
    try {
      const now = new Date();
      (client as any).lastHeartbeat = now;

      if (userId) {
        this.userHeartbeats.set(userId, now);
        this.userManager.updateUserActivity(userId);
      }

      // 回复心跳确认
      this.sendMessage(client, {
        type: 'heartbeat-ack',
        projectId: '',
        userId: userId || '',
        timestamp: now.toISOString(),
        data: {
          timestamp: now.toISOString(),
          userId,
        },
      });
    } catch (error: any) {
      this.logger.error(`处理心跳失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 启动心跳监控
   */
  private startHeartbeatMonitoring() {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, COLLABORATION_CONFIG.HEARTBEAT_INTERVAL);

    this.logger.log(
      `心跳监控已启动，间隔: ${COLLABORATION_CONFIG.HEARTBEAT_INTERVAL}ms`,
    );
  }

  /**
   * 停止心跳监控
   */
  private stopHeartbeatMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 检查心跳状态
   */
  private checkHeartbeats() {
    if (!this.server) return;

    const now = Date.now();
    const timeoutThreshold = COLLABORATION_CONFIG.HEARTBEAT_INTERVAL * 3; // 3个心跳周期
    const zombieClients: any[] = [];

    // 检查所有连接的心跳状态
    if (this.server.clients) {
      this.server.clients.forEach((client: any) => {
        const lastHeartbeat = (client as any).lastHeartbeat;

        if (
          !lastHeartbeat ||
          now - lastHeartbeat.getTime() > timeoutThreshold
        ) {
          zombieClients.push(client);
        }
      });
    }

    // 断开僵尸连接
    for (const client of zombieClients) {
      this.logger.warn(`检测到僵尸连接，强制断开: ${this.getClientId(client)}`);
      this.sendErrorMessage(client, {
        message: '心跳超时，连接已断开',
        code: 'HEARTBEAT_TIMEOUT',
      });
      client.close();
    }

    if (zombieClients.length > 0) {
      this.logger.log(`清理了 ${zombieClients.length} 个僵尸连接`);
    }
  }

  /**
   * 启动清理任务
   */
  private startCleanupTask() {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, COLLABORATION_CONFIG.CLEANUP_INTERVAL);

    this.logger.log(
      `清理任务已启动，间隔: ${COLLABORATION_CONFIG.CLEANUP_INTERVAL}ms`,
    );
  }

  /**
   * 停止清理任务
   */
  private stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 执行清理操作
   */
  private performCleanup() {
    try {
      // 清理断开连接的用户
      this.userManager.cleanupDisconnectedUsers();

      // 清理不活跃的用户
      this.userManager.cleanupInactiveUsers(
        COLLABORATION_CONFIG.INACTIVE_USER_TIMEOUT,
      );

      // 清理不活跃的房间
      this.roomManager.cleanupInactiveRooms(
        COLLABORATION_CONFIG.INACTIVE_ROOM_TIMEOUT,
      );

      // 清理过期的心跳记录
      this.cleanupExpiredHeartbeats();

      // 清理连接限制记录
      this.cleanupConnectionLimits();
    } catch (error:any) {
      this.logger.error(`清理任务执行失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 清理过期的心跳记录
   */
  private cleanupExpiredHeartbeats() {
    const now = Date.now();
    const expiredUsers: string[] = [];

    for (const [userId, lastHeartbeat] of this.userHeartbeats.entries()) {
      if (
        now - lastHeartbeat.getTime() >
        COLLABORATION_CONFIG.INACTIVE_USER_TIMEOUT
      ) {
        expiredUsers.push(userId);
      }
    }

    for (const userId of expiredUsers) {
      this.userHeartbeats.delete(userId);
    }

    if (expiredUsers.length > 0) {
      this.logger.debug(`清理了 ${expiredUsers.length} 个过期心跳记录`);
    }
  }

  /**
   * 清理连接限制记录
   */
  private cleanupConnectionLimits() {
    if (!this.server) return;

    const activeIPs = new Set<string>();

    // 收集当前活跃的IP地址
    if (this.server.clients) {
      this.server.clients.forEach((client: any) => {
        const clientIP = (client as any).clientIP;
        if (clientIP) {
          activeIPs.add(clientIP);
        }
      });
    }

    // 移除不活跃的IP记录
    const inactiveIPs: string[] = [];
    for (const ip of this.connectionLimits.keys()) {
      if (!activeIPs.has(ip)) {
        inactiveIPs.push(ip);
      }
    }

    for (const ip of inactiveIPs) {
      this.connectionLimits.delete(ip);
    }

    if (inactiveIPs.length > 0) {
      this.logger.debug(
        `清理了 ${inactiveIPs.length} 个不活跃IP的连接限制记录`,
      );
    }
  }

  /**
   * 设置连接超时
   */
  private setupConnectionTimeout(client: any) {
    // 设置连接空闲超时（30分钟）
    const timeout = setTimeout(
      () => {
        this.logger.warn(`连接空闲超时，断开连接: ${this.getClientId(client)}`);
        this.sendErrorMessage(client, {
          message: '连接空闲超时',
          code: 'IDLE_TIMEOUT',
        });
        client.close();
      },
      30 * 60 * 1000,
    ); // 30分钟

    // 在连接断开时清理超时
    client.on('close', () => {
      clearTimeout(timeout);
    });
  }

  /**
   * 获取客户端IP地址
   */
  private getClientIP(request: any): string {
    const forwarded = request.headers['x-forwarded-for'];
    const realIP = request.headers['x-real-ip'];

    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }

    if (typeof realIP === 'string') {
      return realIP;
    }

    return request.socket?.remoteAddress || 'unknown';
  }

  /**
   * 强制断开用户连接
   */
  forceDisconnectUser(userId: string, reason: string = '管理员操作') {
    const user = this.userManager.getUser(userId);
    if (user && user.client.readyState === 1) {
      // 1 = OPEN
      this.logger.log(
        `强制断开用户连接: ${user.displayName} (${userId}) - ${reason}`,
      );

      this.sendErrorMessage(user.client, {
        message: `连接被断开: ${reason}`,
        code: 'FORCE_DISCONNECT',
      });

      user.client.close();
      return true;
    }
    return false;
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats() {
    const totalConnections = this.server?.clients?.size || 0;
    const totalUsers = this.userManager.getTotalUserCount();
    const totalRooms = this.roomManager.getRoomCount();
    const ipConnections = Array.from(this.connectionLimits.entries());

    return {
      totalConnections,
      totalUsers,
      totalRooms,
      maxConnectionsPerIP: this.maxConnectionsPerIP,
      maxTotalConnections: this.maxTotalConnections,
      ipConnections: ipConnections.map(([ip, count]) => ({
        ip,
        connections: count,
      })),
      heartbeatInterval: COLLABORATION_CONFIG.HEARTBEAT_INTERVAL,
      cleanupInterval: COLLABORATION_CONFIG.CLEANUP_INTERVAL,
    };
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    const stats = this.getConnectionStats();
    const memoryUsage = (process as any)?.memoryUsage?.() || {};

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const issues: string[] = [];

    // 检查连接数
    if (stats.totalConnections > stats.maxTotalConnections * 0.9) {
      status = 'warning';
      issues.push('连接数接近上限');
    }

    // 检查内存使用
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) {
      // 500MB
      status = 'warning';
      issues.push('内存使用较高');
    }

    // 检查服务状态
    if (!this.heartbeatInterval || !this.cleanupInterval) {
      status = 'critical';
      issues.push('监控服务未运行');
    }

    return {
      status,
      issues,
      stats,
      memoryUsage,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 设置连接限制
   */
  setConnectionLimits(maxPerIP: number, maxTotal: number) {
    if (maxPerIP > 0 && maxPerIP <= 100) {
      this.maxConnectionsPerIP = maxPerIP;
    }

    if (maxTotal > 0 && maxTotal <= 10000) {
      this.maxTotalConnections = maxTotal;
    }

    this.logger.log(
      `连接限制已更新: 单IP最大 ${this.maxConnectionsPerIP}, 总计最大 ${this.maxTotalConnections}`,
    );
  }

  /**
   * 广播服务器消息
   */
  broadcastServerMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
  ) {
    if (!this.server) return;

    const serverMessage = {
      type: 'server-message',
      projectId: '',
      userId: 'system',
      timestamp: new Date().toISOString(),
      data: {
        message,
        level,
        timestamp: new Date().toISOString(),
      },
    };

    if (this.server.clients) {
      this.server.clients.forEach((client: any) => {
        if (client.readyState === 1) {
          // 1 = OPEN
          this.sendMessage(client, serverMessage);
        }
      });
    }

    this.logger.log(`服务器消息广播: [${level.toUpperCase()}] ${message}`);
  }

  /**
   * 获取连接的客户端数量
   */
  getConnectedClientsCount(): number {
    return this.server?.clients?.size || 0;
  }

  /**
   * 发送错误消息
   */
  sendErrorMessage(
    client: any,
    error: { message: string; code: string },
  ): void {
    this.sendMessage(client, {
      type: 'error',
      projectId: '',
      userId: '',
      timestamp: new Date().toISOString(),
      data: error,
    });
  }

  /**
   * 生成客户端ID
   */
  generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取客户端ID
   */
  getClientId(client: any): string {
    return (client as any).id || 'unknown';
  }

  /**
   * 发送消息到客户端
   */
  private sendMessage(client: any, message: any): void {
    try {
      if (client.readyState === 1) {
        // 1 = OPEN
        client.send(JSON.stringify(message));
      }
    } catch (error:any) {
      this.logger.error(`发送消息失败: ${error.message}`);
    }
  }

  /**
   * 广播消息到房间
   */
  private broadcastToRoom(projectId: string, message: any): void {
    const room = this.roomManager.getRoom(projectId);
    if (!room) return;

    for (const user of room.users.values()) {
      if (user.client.readyState === 1) {
        // 1 = OPEN
        this.sendMessage(user.client, message);
      }
    }
  }
}
