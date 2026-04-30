import { Injectable, Logger } from '@nestjs/common';
import { 
  WebSocketMessage, 
  CursorPosition, 
  CollaborationOperation,
  UserInfoUpdate 
} from './types/collaboration.types';

/**
 * 消息验证服务
 * 负责验证WebSocket消息的格式和内容
 */
@Injectable()
export class MessageValidatorService {
  private readonly logger = new Logger(MessageValidatorService.name);

  /**
   * 验证WebSocket消息格式
   */
  validateMessage(message: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查必需字段
    if (!message.type) {
      errors.push('消息类型不能为空');
    }

    if (!message.projectId) {
      errors.push('项目ID不能为空');
    }

    if (!message.userId) {
      errors.push('用户ID不能为空');
    }

    if (!message.timestamp) {
      errors.push('时间戳不能为空');
    }

    // 验证消息类型
    const validTypes = ['user-join', 'user-leave', 'cursor-move', 'node-operation', 'user-info-update', 'heartbeat'];
    if (message.type && !validTypes.includes(message.type)) {
      errors.push(`无效的消息类型: ${message.type}`);
    }

    // 验证项目ID格式
    if (message.projectId && !this.isValidProjectId(message.projectId)) {
      errors.push('项目ID格式无效');
    }

    // 验证用户ID格式
    if (message.userId && !this.isValidUserId(message.userId)) {
      errors.push('用户ID格式无效');
    }

    // 验证时间戳格式
    if (message.timestamp && !this.isValidTimestamp(message.timestamp)) {
      errors.push('时间戳格式无效');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证光标位置数据
   */
  validateCursorPosition(position: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof position !== 'object' || position === null) {
      errors.push('光标位置必须是对象');
      return { valid: false, errors };
    }

    // 检查坐标
    if (typeof position.x !== 'number' || isNaN(position.x)) {
      errors.push('X坐标必须是有效数字');
    } else if (position.x < 0 || position.x > 60000) {
      errors.push('X坐标超出有效范围 (0-60000)');
    }

    if (typeof position.y !== 'number' || isNaN(position.y)) {
      errors.push('Y坐标必须是有效数字');
    } else if (position.y < 0 || position.y > 60000) {
      errors.push('Y坐标超出有效范围 (0-60000)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证节点操作数据
   */
  validateNodeOperation(operation: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof operation !== 'object' || operation === null) {
      errors.push('节点操作必须是对象');
      return { valid: false, errors };
    }

    // 验证操作类型
    const validTypes = ['node-create', 'node-update', 'node-delete', 'edge-create', 'edge-delete'];
    if (!operation.type || !validTypes.includes(operation.type)) {
      errors.push(`无效的操作类型: ${operation.type}`);
    }

    // 验证节点ID（节点操作时必需）
    if (operation.type && operation.type.startsWith('node-')) {
      if (!operation.nodeId || typeof operation.nodeId !== 'string') {
        errors.push('节点操作必须包含有效的节点ID');
      } else if (!this.isValidNodeId(operation.nodeId)) {
        errors.push('节点ID格式无效');
      }
    }

    // 验证边ID（边操作时必需）
    if (operation.type && operation.type.startsWith('edge-')) {
      if (!operation.edgeId || typeof operation.edgeId !== 'string') {
        errors.push('边操作必须包含有效的边ID');
      } else if (!this.isValidEdgeId(operation.edgeId)) {
        errors.push('边ID格式无效');
      }
    }

    // 验证用户ID
    if (!operation.userId || typeof operation.userId !== 'string') {
      errors.push('操作必须包含有效的用户ID');
    }

    // 验证时间戳
    if (!operation.timestamp || !this.isValidDate(operation.timestamp)) {
      errors.push('操作必须包含有效的时间戳');
    }

    // 验证操作数据大小
    if (operation.data) {
      const dataSize = JSON.stringify(operation.data).length;
      if (dataSize > 100000) { // 100KB限制
        errors.push('操作数据过大，超过100KB限制');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证用户信息更新数据
   */
  validateUserInfoUpdate(userInfo: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof userInfo !== 'object' || userInfo === null) {
      errors.push('用户信息必须是对象');
      return { valid: false, errors };
    }

    // 验证显示名称
    if (userInfo.displayName !== undefined) {
      if (typeof userInfo.displayName !== 'string') {
        errors.push('显示名称必须是字符串');
      } else {
        const trimmedName = userInfo.displayName.trim();
        if (trimmedName.length === 0) {
          errors.push('显示名称不能为空');
        } else if (trimmedName.length > 50) {
          errors.push('显示名称长度不能超过50个字符');
        } else if (!this.isValidDisplayName(trimmedName)) {
          errors.push('显示名称包含无效字符');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证房间加入数据
   */
  validateJoinRoomData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof data !== 'object' || data === null) {
      errors.push('加入房间数据必须是对象');
      return { valid: false, errors };
    }

    // 验证项目ID
    if (!data.projectId || typeof data.projectId !== 'string') {
      errors.push('项目ID不能为空');
    } else if (!this.isValidProjectId(data.projectId)) {
      errors.push('项目ID格式无效');
    }

    // 验证用户信息
    if (!data.userInfo || typeof data.userInfo !== 'object') {
      errors.push('用户信息不能为空');
    } else {
      if (!data.userInfo.userId || typeof data.userInfo.userId !== 'string') {
        errors.push('用户ID不能为空');
      } else if (!this.isValidUserId(data.userInfo.userId)) {
        errors.push('用户ID格式无效');
      }

      if (!data.userInfo.displayName || typeof data.userInfo.displayName !== 'string') {
        errors.push('显示名称不能为空');
      } else {
        const trimmedName = data.userInfo.displayName.trim();
        if (trimmedName.length === 0) {
          errors.push('显示名称不能为空');
        } else if (trimmedName.length > 50) {
          errors.push('显示名称长度不能超过50个字符');
        } else if (!this.isValidDisplayName(trimmedName)) {
          errors.push('显示名称包含无效字符');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证项目ID格式
   */
  private isValidProjectId(projectId: string): boolean {
    // 项目ID应该是字母数字和连字符的组合，长度3-50
    const regex = /^[a-zA-Z0-9-_]{3,50}$/;
    return regex.test(projectId);
  }

  /**
   * 验证用户ID格式
   */
  private isValidUserId(userId: string): boolean {
    // 用户ID应该是字母数字和连字符的组合，长度3-50
    const regex = /^[a-zA-Z0-9-_]{3,50}$/;
    return regex.test(userId);
  }

  /**
   * 验证节点ID格式
   */
  private isValidNodeId(nodeId: string): boolean {
    // 节点ID应该是字母数字和连字符的组合，长度1-50
    const regex = /^[a-zA-Z0-9-_]{1,50}$/;
    return regex.test(nodeId);
  }

  /**
   * 验证边ID格式
   */
  private isValidEdgeId(edgeId: string): boolean {
    // 边ID应该是字母数字和连字符的组合，长度1-50
    const regex = /^[a-zA-Z0-9-_]{1,50}$/;
    return regex.test(edgeId);
  }

  /**
   * 验证显示名称格式
   */
  private isValidDisplayName(displayName: string): boolean {
    // 显示名称可以包含中文、英文、数字、空格和常见符号
    const regex = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-_()（）【】\[\].,。，！!？?]+$/;
    return regex.test(displayName);
  }

  /**
   * 验证时间戳格式
   */
  private isValidTimestamp(timestamp: string): boolean {
    try {
      const date = new Date(timestamp);
      return !isNaN(date.getTime()) && date.toISOString() === timestamp;
    } catch {
      return false;
    }
  }

  /**
   * 验证日期对象
   */
  private isValidDate(date: any): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * 清理和标准化显示名称
   */
  sanitizeDisplayName(displayName: string): string {
    return displayName
      .trim()
      .replace(/\s+/g, ' ') // 将多个空格替换为单个空格
      .substring(0, 50); // 截断到最大长度
  }

  /**
   * 清理和标准化项目ID
   */
  sanitizeProjectId(projectId: string): string {
    return projectId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '') // 移除无效字符
      .substring(0, 50); // 截断到最大长度
  }

  /**
   * 检查消息频率限制
   */
  checkRateLimit(userId: string, messageType: string): { allowed: boolean; reason?: string } {
    // 这里可以实现更复杂的频率限制逻辑
    // 例如：每个用户每秒最多发送50条光标移动消息
    
    // 目前简单返回允许
    return { allowed: true };
  }

  /**
   * 验证消息大小
   */
  validateMessageSize(message: any): { valid: boolean; size: number; maxSize: number } {
    const messageStr = JSON.stringify(message);
    const size = Buffer.byteLength(messageStr, 'utf8');
    const maxSize = 1024 * 1024; // 1MB限制
    
    return {
      valid: size <= maxSize,
      size,
      maxSize,
    };
  }

  /**
   * 记录验证错误
   */
  private logValidationError(context: string, errors: string[]): void {
    this.logger.warn(`${context} 验证失败: ${errors.join(', ')}`);
  }
}