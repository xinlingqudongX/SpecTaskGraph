import {
  Entity,
  PrimaryKey,
  Property,
  Index,
} from '@mikro-orm/decorators/legacy';

export const McpSessionStatus = {
  /** 会话活跃中 */
  Active: 'ACTIVE',
  /** 会话已关闭 */
  Closed: 'CLOSED',
} as const;
export type McpSessionStatus =
  (typeof McpSessionStatus)[keyof typeof McpSessionStatus];

/** MCP 会话客户端信息 */
@Entity({ tableName: 'mcp_sessions', comment: 'MCP 会话客户端信息表' })
export class McpSessionEntity {
  /** MCP Session ID */
  @PrimaryKey({ type: 'string', comment: 'MCP 会话 ID' })
  sessionId!: string;

  /** 客户端名称 */
  @Property({ type: 'string', default: '', comment: '客户端名称' })
  clientName: string = '';

  /** 客户端版本 */
  @Property({ type: 'string', default: '', comment: '客户端版本' })
  clientVersion: string = '';

  /** IDE 名称 */
  @Property({ type: 'string', default: '', comment: 'IDE 或客户端名称' })
  ide: string = '';

  /** 模型名称 */
  @Property({ type: 'string', default: '', comment: '模型名称' })
  model: string = '';

  /** AI Agent 名称 */
  @Property({ type: 'string', default: '', comment: 'AI 名称/代理名称' })
  agentName: string = '';

  /** 工作区路径 */
  @Property({ type: 'string', default: '', comment: '工作区路径' })
  workspacePath: string = '';

  /** 已确认的项目 ID（执行前必须确认） */
  @Index()
  @Property({ type: 'string', nullable: true, comment: '确认项目 ID' })
  confirmedProjectId?: string | null;

  /** 已确认的起始节点 ID（执行前必须确认） */
  @Property({ type: 'string', nullable: true, comment: '确认起始节点 ID' })
  confirmedStartNodeId?: string | null;

  /** 感知模式（当前仅支持 local） */
  @Property({ type: 'string', default: 'local', comment: '感知模式' })
  perceptionMode: string = 'local';

  /** 额外信息（JSON） */
  @Property({
    type: 'json',
    nullable: true,
    comment: '额外信息（JSON）',
    defaultRaw: `'{}'`,
  })
  extra?: Record<string, unknown>;

  /** 会话状态 */
  @Property({
    type: 'string',
    default: McpSessionStatus.Active,
    comment: '会话状态：ACTIVE/CLOSED',
  })
  status: McpSessionStatus = McpSessionStatus.Active;

  /** 最后心跳时间 */
  @Property({
    type: 'datetime',
    onUpdate: () => new Date(),
    comment: '最后心跳时间',
  })
  lastSeenAt: Date = new Date();

  /** 关闭时间 */
  @Property({ type: 'datetime', nullable: true, comment: '关闭时间' })
  closedAt?: Date | null;

  /** 记录创建时间 */
  @Property({ type: 'datetime', comment: '创建时间' })
  createdAt: Date = new Date();
}
