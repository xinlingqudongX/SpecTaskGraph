import { Injectable, Logger } from '@nestjs/common';
import { Room, ConnectedUser } from './types/collaboration.types';

/**
 * 房间管理服务
 * 负责管理项目房间和用户会话
 */
@Injectable()
export class RoomManagerService {
  private readonly logger = new Logger(RoomManagerService.name);
  private readonly rooms = new Map<string, Room>();
  private readonly maxUsersPerRoom = 50; // 单个房间最大用户数限制

  /**
   * 创建或获取房间
   */
  createRoom(projectId: string): Room {
    if (!this.rooms.has(projectId)) {
      const room: Room = {
        projectId,
        users: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
        seq: 0,
      };
      
      this.rooms.set(projectId, room);
      this.logger.log(`创建新房间: ${projectId}`);
    }
    
    return this.rooms.get(projectId)!;
  }

  /**
   * 获取房间
   */
  getRoom(projectId: string): Room | null {
    return this.rooms.get(projectId) || null;
  }

  /**
   * 删除房间
   */
  deleteRoom(projectId: string): void {
    if (this.rooms.has(projectId)) {
      const room = this.rooms.get(projectId)!;
      
      // 记录房间统计信息
      this.logger.log(
        `删除房间 ${projectId}: 存在时长 ${Date.now() - room.createdAt.getTime()}ms, ` +
        `最后活动 ${Date.now() - room.lastActivity.getTime()}ms前`
      );
      
      this.rooms.delete(projectId);
    }
  }

  /**
   * 添加用户到房间
   */
  addUserToRoom(projectId: string, user: ConnectedUser): void {
    // 检查房间用户数限制
    const room = this.getRoom(projectId);
    if (room && room.users.size >= this.maxUsersPerRoom) {
      throw new Error(`房间 ${projectId} 已达到最大用户数限制 (${this.maxUsersPerRoom})`);
    }
    
    // 创建或获取房间
    const targetRoom = this.createRoom(projectId);
    
    // 添加用户
    targetRoom.users.set(user.userId, user);
    targetRoom.lastActivity = new Date();
    
    this.logger.log(
      `用户 ${user.displayName} (${user.userId}) 加入房间 ${projectId}, ` +
      `当前用户数: ${targetRoom.users.size}`
    );
  }

  /**
   * 从房间中移除用户
   */
  removeUserFromRoom(projectId: string, userId: string): void {
    const room = this.getRoom(projectId);
    if (!room) {
      return;
    }
    
    const user = room.users.get(userId);
    if (user) {
      room.users.delete(userId);
      room.lastActivity = new Date();
      
      this.logger.log(
        `用户 ${user.displayName} (${userId}) 离开房间 ${projectId}, ` +
        `剩余用户数: ${room.users.size}`
      );
      
      // 如果房间为空，延迟删除房间（给重连机会）
      if (room.users.size === 0) {
        setTimeout(() => {
          const currentRoom = this.getRoom(projectId);
          if (currentRoom && currentRoom.users.size === 0) {
            this.deleteRoom(projectId);
          }
        }, 30000); // 30秒后删除空房间
      }
    }
  }

  /**
   * 获取房间内的所有用户
   */
  getUsersInRoom(projectId: string): ConnectedUser[] {
    const room = this.getRoom(projectId);
    return room ? Array.from(room.users.values()) : [];
  }

  /**
   * 获取用户所在的所有房间
   */
  getUserRooms(userId: string): string[] {
    const userRooms: string[] = [];
    
    for (const [projectId, room] of this.rooms.entries()) {
      if (room.users.has(userId)) {
        userRooms.push(projectId);
      }
    }
    
    return userRooms;
  }

  /**
   * 获取房间数量
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * 获取总用户数
   */
  getTotalUserCount(): number {
    let totalUsers = 0;
    for (const room of this.rooms.values()) {
      totalUsers += room.users.size;
    }
    return totalUsers;
  }

  /**
   * 清理不活跃的房间
   */
  cleanupInactiveRooms(maxInactiveTime: number = 3600000): void { // 默认1小时
    const now = Date.now();
    const roomsToDelete: string[] = [];
    
    for (const [projectId, room] of this.rooms.entries()) {
      const inactiveTime = now - room.lastActivity.getTime();
      
      if (inactiveTime > maxInactiveTime) {
        roomsToDelete.push(projectId);
      }
    }
    
    for (const projectId of roomsToDelete) {
      this.logger.log(`清理不活跃房间: ${projectId}`);
      this.deleteRoom(projectId);
    }
    
    if (roomsToDelete.length > 0) {
      this.logger.log(`清理了 ${roomsToDelete.length} 个不活跃房间`);
    }
  }

  /**
   * 获取房间统计信息
   */
  getRoomStats(): Array<{
    projectId: string;
    userCount: number;
    createdAt: Date;
    lastActivity: Date;
    inactiveTime: number;
  }> {
    const now = Date.now();
    const stats: Array<{
      projectId: string;
      userCount: number;
      createdAt: Date;
      lastActivity: Date;
      inactiveTime: number;
    }> = [];
    
    for (const [projectId, room] of this.rooms.entries()) {
      stats.push({
        projectId,
        userCount: room.users.size,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        inactiveTime: now - room.lastActivity.getTime(),
      });
    }
    
    return stats.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * 强制清空所有房间（用于测试或维护）
   */
  clearAllRooms(): void {
    const roomCount = this.rooms.size;
    this.rooms.clear();
    this.logger.warn(`强制清空了所有房间 (${roomCount} 个)`);
  }

  /**
   * 检查房间是否存在且有活跃用户
   */
  isRoomActive(projectId: string): boolean {
    const room = this.getRoom(projectId);
    return room !== null && room.users.size > 0;
  }

  /**
   * 获取房间的最后活动时间
   */
  getRoomLastActivity(projectId: string): Date | null {
    const room = this.getRoom(projectId);
    return room ? room.lastActivity : null;
  }

  /**
   * 更新房间活动时间
   */
  updateRoomActivity(projectId: string): void {
    const room = this.getRoom(projectId);
    if (room) {
      room.lastActivity = new Date();
    }
  }
}