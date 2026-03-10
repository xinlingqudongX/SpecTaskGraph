/**
 * 工作流图谱系统错误类定义
 * 
 * 定义系统中使用的各种错误类型，提供结构化的错误处理机制。
 * 每种错误类型都包含特定的错误信息和处理建议。
 */

import { ERROR_TYPES } from '../constants/workflow.constants';

/**
 * 基础工作流错误类
 */
export abstract class WorkflowError extends Error {
  public readonly type: string;
  public readonly timestamp: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    type: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.timestamp = new Date().toISOString();
    this.context = context;
    
    // 确保错误堆栈正确显示
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 获取错误的JSON表示
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * 权限错误类
 * 用于处理文件系统访问权限相关的错误
 */
export class PermissionError extends WorkflowError {
  constructor(
    message: string = '文件系统访问权限被拒绝',
    context?: Record<string, unknown>
  ) {
    super(message, ERROR_TYPES.PERMISSION_ERROR, context);
  }

  /**
   * 创建权限被拒绝错误
   */
  static denied(path?: string): PermissionError {
    return new PermissionError(
      '用户拒绝了文件系统访问权限',
      { path, action: 'permission_request' }
    );
  }

  /**
   * 创建权限被撤销错误
   */
  static revoked(message?: string): PermissionError {
    return new PermissionError(
      message || '文件系统访问权限已被撤销',
      { action: 'permission_check' }
    );
  }

  /**
   * 创建无权限访问错误
   */
  static unauthorized(path: string): PermissionError {
    return new PermissionError(
      `无权限访问路径: ${path}`,
      { path, action: 'file_access' }
    );
  }
}

/**
 * 文件IO错误类
 * 用于处理文件读写操作相关的错误
 */
export class FileIOError extends WorkflowError {
  constructor(
    message: string = '文件操作失败',
    context?: Record<string, unknown>
  ) {
    super(message, ERROR_TYPES.FILE_IO_ERROR, context);
  }

  /**
   * 创建文件不存在错误
   */
  static notFound(filePath: string): FileIOError {
    return new FileIOError(
      `文件不存在: ${filePath}`,
      { filePath, operation: 'read' }
    );
  }

  /**
   * 创建磁盘空间不足错误
   */
  static diskFull(filePath: string): FileIOError {
    return new FileIOError(
      '磁盘空间不足，无法写入文件',
      { filePath, operation: 'write', reason: 'disk_full' }
    );
  }

  /**
   * 创建文件被锁定错误
   */
  static fileLocked(filePath: string): FileIOError {
    return new FileIOError(
      `文件被其他程序锁定: ${filePath}`,
      { filePath, operation: 'write', reason: 'file_locked' }
    );
  }

  /**
   * 创建写入失败错误
   */
  static writeFailed(filePath: string, reason?: string): FileIOError {
    return new FileIOError(
      `文件写入失败: ${filePath}${reason ? ` (${reason})` : ''}`,
      { filePath, operation: 'write', reason }
    );
  }

  /**
   * 创建读取失败错误
   */
  static readFailed(filePath: string, reason?: string): FileIOError {
    return new FileIOError(
      `文件读取失败: ${filePath}${reason ? ` (${reason})` : ''}`,
      { filePath, operation: 'read', reason }
    );
  }
}

/**
 * 数据验证错误类
 * 用于处理数据格式和Schema验证相关的错误
 */
export class ValidationError extends WorkflowError {
  public readonly errors: Array<{
    path: string;
    message: string;
    code?: string;
  }>;

  constructor(
    message: string = '数据验证失败',
    errors: Array<{ path: string; message: string; code?: string }> = [],
    context?: Record<string, unknown>
  ) {
    super(message, ERROR_TYPES.VALIDATION_ERROR, context);
    this.errors = errors;
  }

  /**
   * 创建Schema验证失败错误
   */
  static schemaValidationFailed(
    errors: Array<{ path: string; message: string; code?: string }>
  ): ValidationError {
    return new ValidationError(
      '数据不符合Schema规范',
      errors,
      { validationType: 'schema' }
    );
  }

  /**
   * 创建引用完整性错误
   */
  static referenceIntegrityFailed(missingRefs: string[]): ValidationError {
    return new ValidationError(
      '引用完整性检查失败',
      missingRefs.map(ref => ({ path: 'references', message: ref })),
      { validationType: 'reference_integrity' }
    );
  }

  /**
   * 创建循环依赖错误
   */
  static circularDependency(nodeId: string): ValidationError {
    return new ValidationError(
      '检测到循环依赖',
      [{ path: `nodes.${nodeId}.dependencies`, message: '存在循环依赖' }],
      { validationType: 'circular_dependency', nodeId }
    );
  }

  /**
   * 创建必需字段缺失错误
   */
  static requiredFieldMissing(fieldPath: string, fieldName: string): ValidationError {
    return new ValidationError(
      `必需字段缺失: ${fieldName}`,
      [{ path: fieldPath, message: `字段 ${fieldName} 是必需的` }],
      { validationType: 'required_field', fieldPath, fieldName }
    );
  }
}

/**
 * 解析错误类
 * 用于处理JSON解析和数据格式相关的错误
 */
export class ParseError extends WorkflowError {
  public readonly line?: number;
  public readonly column?: number;

  constructor(
    message: string = '数据解析失败',
    line?: number,
    column?: number,
    context?: Record<string, unknown>
  ) {
    super(message, ERROR_TYPES.PARSE_ERROR, context);
    this.line = line;
    this.column = column;
  }

  /**
   * 创建JSON语法错误
   */
  static jsonSyntaxError(
    filePath: string,
    line?: number,
    column?: number
  ): ParseError {
    return new ParseError(
      `JSON语法错误${line ? ` (第${line}行)` : ''}`,
      line,
      column,
      { filePath, parseType: 'json' }
    );
  }

  /**
   * 创建文件编码错误
   */
  static encodingError(filePath: string): ParseError {
    return new ParseError(
      '文件编码格式不支持',
      undefined,
      undefined,
      { filePath, parseType: 'encoding' }
    );
  }

  /**
   * 创建文件损坏错误
   */
  static corruptedFile(filePath: string): ParseError {
    return new ParseError(
      '文件内容已损坏',
      undefined,
      undefined,
      { filePath, parseType: 'corruption' }
    );
  }
}

/**
 * 网络错误类
 * 用于处理后端服务通信相关的错误
 */
export class NetworkError extends WorkflowError {
  public readonly statusCode?: number;
  public readonly url?: string;

  constructor(
    message: string = '网络请求失败',
    statusCode?: number,
    url?: string,
    context?: Record<string, unknown>
  ) {
    super(message, ERROR_TYPES.NETWORK_ERROR, context);
    this.statusCode = statusCode;
    this.url = url;
  }

  /**
   * 创建服务不可用错误
   */
  static serviceUnavailable(url: string): NetworkError {
    return new NetworkError(
      '后端服务不可用',
      503,
      url,
      { networkType: 'service_unavailable' }
    );
  }

  /**
   * 创建连接超时错误
   */
  static timeout(url: string): NetworkError {
    return new NetworkError(
      '请求超时',
      408,
      url,
      { networkType: 'timeout' }
    );
  }

  /**
   * 创建网络连接错误
   */
  static connectionFailed(url: string): NetworkError {
    return new NetworkError(
      '网络连接失败',
      undefined,
      url,
      { networkType: 'connection_failed' }
    );
  }
}

/**
 * 错误工厂类
 * 提供统一的错误创建接口
 */
export class ErrorFactory {
  /**
   * 从原生错误创建工作流错误
   */
  static fromNativeError(error: Error, context?: Record<string, unknown>): WorkflowError {
    // 根据错误消息判断错误类型
    const message = error.message.toLowerCase();
    
    if (message.includes('permission') || message.includes('denied')) {
      return new PermissionError(error.message, context);
    }
    
    if (message.includes('enoent') || message.includes('not found')) {
      return FileIOError.notFound(context?.filePath as string || 'unknown');
    }
    
    if (message.includes('enospc') || message.includes('no space')) {
      return FileIOError.diskFull(context?.filePath as string || 'unknown');
    }
    
    if (message.includes('json') || message.includes('parse')) {
      return new ParseError(error.message, undefined, undefined, context);
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return new NetworkError(error.message, undefined, undefined, context);
    }
    
    // 默认返回文件IO错误
    return new FileIOError(error.message, context);
  }

  /**
   * 创建聚合错误（包含多个子错误）
   */
  static createAggregateError(
    message: string,
    errors: WorkflowError[]
  ): WorkflowError {
    return new ValidationError(
      message,
      errors.map(err => ({
        path: err.type,
        message: err.message,
        code: err.name
      })),
      { aggregateErrors: errors.map(err => err.toJSON()) }
    );
  }
}