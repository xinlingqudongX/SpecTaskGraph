/**
 * 基于Pino的日志工具类
 * 用于在开发环境中提供结构化的调试信息
 */

import pino from 'pino';

// 浏览器环境的Pino配置
const pinoConfig = {
  level: import.meta.env.DEV ? 'debug' : 'info',
  browser: {
    asObject: true,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    serialize: true,
  },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
};

// 创建基础logger实例
const baseLogger = pino(pinoConfig);

export class Logger {
  private logger: pino.Logger;
  private prefix: string;
  private isEnabled: boolean;

  constructor(prefix: string) {
    this.prefix = prefix;
    this.isEnabled = import.meta.env.DEV || localStorage.getItem('debug') === 'true';
    
    // 创建子logger，包含模块前缀
    this.logger = baseLogger.child({ module: prefix });
  }

  info(message: string, data?: any) {
    if (!this.isEnabled) return;
    
    if (data !== undefined) {
      this.logger.info({ data, emoji: '📊' }, `[${this.prefix}] ${message}`);
    } else {
      this.logger.info(`[${this.prefix}] ${message}`);
    }
  }

  success(message: string, data?: any) {
    if (!this.isEnabled) return;
    
    if (data !== undefined) {
      this.logger.info({ data, emoji: '✅', type: 'success' }, `[${this.prefix}] ✅ ${message}`);
    } else {
      this.logger.info({ type: 'success' }, `[${this.prefix}] ✅ ${message}`);
    }
  }

  warn(message: string, data?: any) {
    if (!this.isEnabled) return;
    
    if (data !== undefined) {
      this.logger.warn({ data, emoji: '⚠️' }, `[${this.prefix}] ${message}`);
    } else {
      this.logger.warn(`[${this.prefix}] ${message}`);
    }
  }

  error(message: string, error?: any) {
    if (!this.isEnabled) return;
    
    const errorData: any = { emoji: '❌' };
    
    if (error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...error
      };
    }
    
    this.logger.error(errorData, `[${this.prefix}] ${message}`);
  }

  debug(message: string, data?: any) {
    if (!this.isEnabled) return;
    
    if (data !== undefined) {
      this.logger.debug({ data, emoji: '🔍' }, `[${this.prefix}] ${message}`);
    } else {
      this.logger.debug(`[${this.prefix}] ${message}`);
    }
  }

  // 模拟console.group功能
  group(title: string) {
    if (!this.isEnabled) return;
    this.logger.info({ type: 'group-start', emoji: '🔧' }, `[${this.prefix}] === ${title} ===`);
  }

  groupEnd() {
    if (!this.isEnabled) return;
    this.logger.info({ type: 'group-end', emoji: '🔧' }, `[${this.prefix}] === 结束 ===`);
  }

  // 计时功能
  private timers = new Map<string, number>();

  time(label: string) {
    if (!this.isEnabled) return;
    const startTime = performance.now();
    this.timers.set(label, startTime);
    this.logger.debug({ type: 'timer-start', emoji: '⏱️' }, `[${this.prefix}] 开始计时: ${label}`);
  }

  timeEnd(label: string) {
    if (!this.isEnabled) return;
    const startTime = this.timers.get(label);
    if (startTime !== undefined) {
      const duration = performance.now() - startTime;
      this.timers.delete(label);
      this.logger.info({ 
        type: 'timer-end', 
        emoji: '⏱️', 
        duration: `${duration.toFixed(2)}ms` 
      }, `[${this.prefix}] ${label}: ${duration.toFixed(2)}ms`);
    }
  }

  // 表格数据展示
  table(data: any) {
    if (!this.isEnabled) return;
    this.logger.info({ 
      type: 'table', 
      emoji: '📋', 
      tableData: data 
    }, `[${this.prefix}] 表格数据`);
    
    // 同时使用console.table以获得更好的可视化
    console.table(data);
  }

  // 获取原始pino logger实例，用于高级用法
  getRawLogger() {
    return this.logger;
  }
}

// 创建全局日志实例
export const createLogger = (prefix: string) => new Logger(prefix);

// 预定义的日志实例
export const workflowLogger = createLogger('WorkflowEditor');
export const logicflowLogger = createLogger('LogicFlow');
export const appLogger = createLogger('App');

// 导出基础logger供其他模块使用
export { baseLogger };