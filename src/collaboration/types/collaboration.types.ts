/**
 * WebSocket消息类型
 */
export type MessageType = 
  | 'user-join'           // 用户加入
  | 'user-leave'          // 用户离开
  | 'cursor-move'         // 光标移动
  | 'node-operation'      // 节点增删改
  | 'node-select'         // 节点选中/取消选中（感知其他用户选中状态）
  | 'user-info-update'    // 用户信息更新
  | 'heartbeat'           // 心跳
  | 'connection-established' // 连接建立
  | 'room-joined'         // 房间加入成功
  | 'room-left'           // 房间离开
  | 'online-users'        // 在线用户列表
  | 'heartbeat-ack'       // 心跳确认
  | 'canvas-snapshot'     // 服务端推送给新用户的画布快照
  | 'error';              // 错误消息

/**
 * WebSocket消息结构
 */
export interface WebSocketMessage {
  type: MessageType;
  projectId: string;
  userId: string;
  timestamp: string;
  data: unknown;
}

/**
 * 连接的用户信息
 */
export interface ConnectedUser {
  userId: string;           // 用户唯一标识符
  displayName: string;      // 用户显示名称
  client: any;              // WebSocket客户端连接
  joinedAt: Date;          // 加入时间
  lastActivity: Date;      // 最后活动时间
}

/**
 * 用户信息（用于前端显示）
 */
export interface User {
  userId: string;
  displayName: string;
  isOnline: boolean;
  lastSeen: Date;
}

/**
 * 光标位置信息
 */
export interface CursorPosition {
  x: number;               // X坐标
  y: number;               // Y坐标
  timestamp: Date;         // 时间戳
}

/**
 * 协同操作类型
 */
export type CollaborationOperationType = 
  | 'node-create'         // 创建节点
  | 'node-update'         // 更新节点
  | 'node-delete'         // 删除节点
  | 'edge-create'         // 创建边
  | 'edge-delete'         // 删除边
  | 'canvas-sync';        // 全量画布同步（LWW 策略）

/**
 * 协同操作信息
 */
export interface CollaborationOperation {
  type: CollaborationOperationType;
  nodeId?: string;         // 节点ID（节点操作时使用）
  edgeId?: string;         // 边ID（边操作时使用）
  data?: unknown;          // 操作数据
  userId: string;          // 操作用户ID
  timestamp: Date;         // 操作时间戳
}

/**
 * 项目房间信息
 */
export interface Room {
  projectId: string;                    // 项目ID
  users: Map<string, ConnectedUser>;    // 房间内的用户
  createdAt: Date;                      // 房间创建时间
  lastActivity: Date;                   // 最后活动时间
  // 服务端维护的最新画布快照（JSON 字符串），用于新用户加入时同步
  canvasSnapshot?: string;
  // 单调递增的操作序号，用于客户端去重
  seq: number;
}

/**
 * 连接状态
 */
export type ConnectionState = 
  | 'connecting'          // 连接中
  | 'connected'           // 已连接
  | 'disconnected'        // 已断开
  | 'reconnecting';       // 重连中

/**
 * 用户信息更新数据
 */
export interface UserInfoUpdate {
  displayName?: string;
  color?: string;
}

/**
 * 房间统计信息
 */
export interface RoomStats {
  projectId: string;
  userCount: number;
  createdAt: Date;
  lastActivity: Date;
  inactiveTime: number;
}

/**
 * 用户统计信息
 */
export interface UserStats {
  totalUsers: number;
  connectedUsers: number;
  disconnectedUsers: number;
  averageSessionTime: number;
}

/**
 * 服务器统计信息
 */
export interface ServerStats {
  totalRooms: number;
  totalUsers: number;
  connectedClients: number;
  uptime: number;
  memoryUsage: any;
}

/**
 * 心跳消息
 */
export interface HeartbeatMessage {
  timestamp: string;
  userId?: string;
}

/**
 * 错误消息
 */
export interface ErrorMessage {
  message: string;
  error?: string;
  code?: string;
}

/**
 * 房间加入成功响应
 */
export interface RoomJoinedResponse {
  projectId: string;
  userCount: number;
  timestamp: string;
}

/**
 * 房间离开响应
 */
export interface RoomLeftResponse {
  projectId: string;
  timestamp: string;
}

/**
 * 连接建立响应
 */
export interface ConnectionEstablishedResponse {
  clientId: string;
  timestamp: string;
}

/**
 * 在线用户列表响应
 */
export interface OnlineUsersResponse {
  users: User[];
  timestamp: string;
}

/**
 * 光标移动消息数据
 */
export interface CursorMoveData {
  position: CursorPosition;
  displayName: string;
}

/**
 * 节点操作消息数据
 */
export interface NodeOperationData {
  operation: CollaborationOperation;
  displayName: string;
}

/**
 * 用户加入消息数据
 */
export interface UserJoinData {
  userId: string;
  displayName: string;
}

/**
 * 用户离开消息数据
 */
export interface UserLeaveData {
  userId: string;
  displayName: string;
}

/**
 * 用户信息更新消息数据
 */
export interface UserInfoUpdateData {
  displayName: string;
}

/**
 * WebSocket事件名称常量
 */
export const WS_EVENTS = {
  // 客户端发送的事件
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  CURSOR_MOVE: 'cursor-move',
  NODE_OPERATION: 'node-operation',
  USER_INFO_UPDATE: 'user-info-update',
  HEARTBEAT: 'heartbeat',
  
  // 服务器发送的事件
  MESSAGE: 'message',
  CONNECTION_ESTABLISHED: 'connection-established',
  ROOM_JOINED: 'room-joined',
  ROOM_LEFT: 'room-left',
  ONLINE_USERS: 'online-users',
  HEARTBEAT_ACK: 'heartbeat-ack',
  ERROR: 'error',
} as const;

/**
 * 配置常量
 */
export const COLLABORATION_CONFIG = {
  MAX_USERS_PER_ROOM: 50,           // 单个房间最大用户数
  HEARTBEAT_INTERVAL: 30000,        // 心跳间隔（毫秒）
  INACTIVE_USER_TIMEOUT: 1800000,   // 不活跃用户超时时间（30分钟）
  INACTIVE_ROOM_TIMEOUT: 3600000,   // 不活跃房间超时时间（1小时）
  CLEANUP_INTERVAL: 300000,         // 清理任务间隔（5分钟）
} as const;