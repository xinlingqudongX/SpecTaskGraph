import { getWebSocketUrl, RECONNECT_CONFIG, HEARTBEAT_CONFIG } from '../config/websocket.config';

/**
 * WebSocket连接状态
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * WebSocket消息类型
 */
export interface WebSocketMessage {
  type: string;
  projectId: string;
  userId: string;
  timestamp: string;
  data: unknown;
}

/**
 * WebSocket管理器
 * 负责底层WebSocket连接管理、自动重连和消息收发
 */
export class WebSocketManager {
  private socket: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number = RECONNECT_CONFIG.maxAttempts;
  private reconnectInterval: number = RECONNECT_CONFIG.initialInterval;
  private autoReconnectEnabled = true;
  private reconnectTimer: number | null = null;
  private lastConnectionUrl: string = '';
  private heartbeatTimer: number | null = null;

  // 事件监听器
  private messageHandlers: ((message: WebSocketMessage) => void)[] = [];
  private stateChangeHandlers: ((state: ConnectionState) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];

  /**
   * 连接到WebSocket服务器
   */
  async connect(url: string = getWebSocketUrl()): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket已连接，跳过重复连接');
      return;
    }

    this.lastConnectionUrl = url;
    this.setConnectionState('connecting');
    
    try {
      // 直接使用提供的URL，因为配置中已经包含了完整路径
      const wsUrl = url;
      
      this.socket = new WebSocket(wsUrl);
      this.setupEventListeners();
      
      // 等待连接建立
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.offStateChange(handleStateChange);
          this.offError(handleError);
          reject(new Error('连接超时'));
        }, 10000);

        const handleStateChange = (state: ConnectionState) => {
          if (state === 'connected') {
            clearTimeout(timeout);
            this.offStateChange(handleStateChange);
            this.offError(handleError);
            console.log(`WebSocket连接已建立: ${wsUrl}`);
            resolve();
          }
        };

        const handleError = (error: Error) => {
          clearTimeout(timeout);
          this.offStateChange(handleStateChange);
          this.offError(handleError);
          console.error('WebSocket连接失败:', error);
          reject(error);
        };

        this.onStateChange(handleStateChange);
        this.onError(handleError);
      });

    } catch (error) {
      console.error('WebSocket连接失败:', error);
      this.setConnectionState('disconnected');
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * 断开WebSocket连接
   */
  disconnect(): void {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.setConnectionState('disconnected');
    console.log('WebSocket连接已断开');
  }

  /**
   * 发送消息
   */
  send(message: WebSocketMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket未连接，无法发送消息:', message);
      return;
    }

    // 转换为NestJS WebSocket期望的格式
    const nestjsMessage = {
      event: message.type,
      data: message.data
    };

    this.socket.send(JSON.stringify(nestjsMessage));
  }

  /**
   * 获取连接状态
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * 获取WebSocket连接状态
   */
  getReadyState(): number {
    if (!this.socket) return WebSocket.CLOSED;
    return this.socket.readyState;
  }

  /**
   * 启用/禁用自动重连
   */
  enableAutoReconnect(enabled: boolean): void {
    this.autoReconnectEnabled = enabled;
    if (!enabled) {
      this.clearReconnectTimer();
    }
  }

  /**
   * 设置重连间隔
   */
  setReconnectInterval(interval: number): void {
    this.reconnectInterval = Math.max(RECONNECT_CONFIG.initialInterval, interval);
  }

  /**
   * 设置最大重连次数
   */
  setMaxReconnectAttempts(attempts: number): void {
    this.maxReconnectAttempts = Math.max(0, attempts);
  }

  /**
   * 手动触发重连
   */
  async reconnect(): Promise<void> {
    if (this.connectionState === 'connecting' || this.connectionState === 'reconnecting') {
      console.log('正在连接中，跳过重连');
      return;
    }

    this.disconnect();
    
    // 使用上次的连接URL
    if (this.lastConnectionUrl) {
      await this.connect(this.lastConnectionUrl);
    } else {
      await this.connect();
    }
  }

  /**
   * 添加消息监听器
   */
  onMessage(callback: (message: WebSocketMessage) => void): void {
    this.messageHandlers.push(callback);
  }

  /**
   * 移除消息监听器
   */
  offMessage(callback: (message: WebSocketMessage) => void): void {
    const index = this.messageHandlers.indexOf(callback);
    if (index > -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * 添加连接状态变化监听器
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateChangeHandlers.push(callback);
  }

  /**
   * 移除连接状态变化监听器
   */
  offStateChange(callback: (state: ConnectionState) => void): void {
    const index = this.stateChangeHandlers.indexOf(callback);
    if (index > -1) {
      this.stateChangeHandlers.splice(index, 1);
    }
  }

  /**
   * 添加错误监听器
   */
  onError(callback: (error: Error) => void): void {
    this.errorHandlers.push(callback);
  }

  /**
   * 移除错误监听器
   */
  offError(callback: (error: Error) => void): void {
    const index = this.errorHandlers.indexOf(callback);
    if (index > -1) {
      this.errorHandlers.splice(index, 1);
    }
  }

  /**
   * 设置WebSocket事件监听器
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // 连接建立
    this.socket.onopen = () => {
      console.log('WebSocket连接已建立');
      this.reconnectAttempts = 0;
      this.setConnectionState('connected');
      this.startHeartbeat();
    };

    // 连接断开
    this.socket.onclose = (event) => {
      console.log('WebSocket连接断开:', event.reason);
      this.setConnectionState('disconnected');
      this.stopHeartbeat();
      
      // 如果不是主动断开，尝试重连
      if (this.autoReconnectEnabled && event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    // 连接错误
    this.socket.onerror = (error) => {
      console.error('WebSocket连接错误:', error);
      this.handleConnectionError(new Error('WebSocket连接错误'));
      
      if (this.autoReconnectEnabled) {
        this.scheduleReconnect();
      }
    };

    // 接收消息
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('消息解析失败:', error);
      }
    };
  }

  /**
   * 处理接收到的消息
   * NestJS WS 网关发送的格式为 { event: string, data: any }
   * 同时兼容旧格式 { type: string, ... }
   */
  private handleMessage(data: any): void {
    try {
      // NestJS 格式：{ event, data } —— data 内部包含 userId/projectId 等字段
      const payload = data.data ?? data;
      const message: WebSocketMessage = {
        type: data.event || data.type || 'unknown',
        projectId: payload.projectId || data.projectId || '',
        userId: payload.userId || data.userId || '',
        timestamp: payload.timestamp || data.timestamp || new Date().toISOString(),
        data: payload,
      };

      // 通知所有消息监听器
      this.messageHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('消息处理器执行失败:', error);
        }
      });
    } catch (error) {
      console.error('消息解析失败:', error);
    }
  }

  /**
   * 设置连接状态
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      
      // 通知所有状态变化监听器
      this.stateChangeHandlers.forEach(handler => {
        try {
          handler(state);
        } catch (error) {
          console.error('状态变化处理器执行失败:', error);
        }
      });
    }
  }

  /**
   * 处理连接错误
   */
  private handleConnectionError(error: Error): void {
    this.setConnectionState('disconnected');
    this.handleError(error);
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (err) {
        console.error('错误处理器执行失败:', err);
      }
    });
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (!this.autoReconnectEnabled || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('已达到最大重连次数或自动重连已禁用');
      return;
    }

    this.clearReconnectTimer();
    this.setConnectionState('reconnecting');
    
    // 使用指数退避算法，但不超过最大间隔
    const delay = Math.min(
      this.reconnectInterval * Math.pow(RECONNECT_CONFIG.backoffMultiplier, this.reconnectAttempts),
      RECONNECT_CONFIG.maxInterval
    );
    
    console.log(`${delay}ms后尝试第${this.reconnectAttempts + 1}次重连`);
    
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectAttempts++;
      
      try {
        if (this.lastConnectionUrl) {
          await this.connect(this.lastConnectionUrl);
        } else {
          await this.connect();
        }
      } catch (error) {
        console.error('重连失败:', error);
        // scheduleReconnect会在connect失败时自动调用
      }
    }, delay);
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // 先停止之前的心跳
    
    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_CONFIG.interval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 发送心跳
   */
  sendHeartbeat(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({
        type: 'heartbeat',
        projectId: '',
        userId: '',
        timestamp: new Date().toISOString(),
        data: {},
      });
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.disconnect();
    this.stopHeartbeat();
    this.messageHandlers.length = 0;
    this.stateChangeHandlers.length = 0;
    this.errorHandlers.length = 0;
  }
}
