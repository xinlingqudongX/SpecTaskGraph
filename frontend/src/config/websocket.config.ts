/**
 * WebSocket连接配置
 */

/**
 * 获取WebSocket服务器URL
 */
export function getWebSocketUrl(): string {
  // 在开发环境中，使用环境变量或默认值
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_WS_URL || 'ws://localhost:9000/ws';
  }
  
  // 在生产环境中，使用当前域名和端口
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

/**
 * WebSocket连接选项
 */
export const WEBSOCKET_OPTIONS = {
  transports: ['websocket'] as const,
  timeout: 10000,
  reconnection: false, // 我们自己处理重连
  autoConnect: false,
};

/**
 * 重连配置
 */
export const RECONNECT_CONFIG = {
  maxAttempts: 5,
  initialInterval: 3000, // 3秒
  maxInterval: 30000, // 30秒
  backoffMultiplier: 2,
} as const;

/**
 * 心跳配置
 */
export const HEARTBEAT_CONFIG = {
  interval: 30000, // 30秒
  timeout: 10000, // 10秒
} as const;