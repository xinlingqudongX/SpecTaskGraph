import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from '@mikro-orm/decorators/legacy';
import { ProjectEntity } from '../../project/entities/project.entity';

/** 节点状态 */
export const NodeStatus = {
  /** 未开始执行 */
  Pending: 'pending',
  /** 正在执行 */
  InProgress: 'in_progress',
  /** 已完成 */
  Completed: 'completed',
  /** 执行失败 */
  Failed: 'failed',
  /** 待人工复核 */
  ReviewNeeded: 'review_needed',
} as const;
export type NodeStatus = (typeof NodeStatus)[keyof typeof NodeStatus];

/** 节点类型 */
export const NodeType = {
  /** 起始节点 */
  Start: 'start',
  /** 文本节点 */
  Text: 'text',
} as const;
export type NodeType = (typeof NodeType)[keyof typeof NodeType];

/** 工作流节点元数据表 */
@Entity({ tableName: 'node_metadata', comment: '工作流节点元数据' })
export class NodeMetadataEntity {
  /** 节点ID（与前端 LogicFlow 节点 ID 保持一致） */
  @PrimaryKey({ type: 'string', comment: '节点ID（与前端保持一致）' })
  nodeId!: string;

  /** 所属项目 */
  @ManyToOne(() => ProjectEntity, { comment: '所属项目ID' })
  project!: ProjectEntity;

  /** 标题 */
  @Property({
    type: 'string',
    comment: '标题',
    default: '',
  })
  title!: string;

  /** 节点类型（text/image/video/audio/file/decision/parallel） */
  @Property({
    type: 'string',
    comment: '节点类型（text/image/video/audio/file/decision/parallel）',
  })
  nodeType!: string;

  /** 父节点ID，仅用于层级树展示与局部结构归属，不表示执行依赖 */
  @Index()
  @Property({
    type: 'string',
    nullable: true,
    comment: '父节点ID，仅用于层级树展示，不表示执行依赖',
    default: null,
  })
  parentNodeId?: string | null;

  /** 同级排序值，数值越小越靠前 */
  @Property({
    type: 'number',
    comment: '同级排序值，数值越小越靠前',
    default: 0,
  })
  sortOrder: number = 0;

  /** 依赖节点 ID 列表，支持多依赖 DAG（JSON 数组） */
  @Property({
    type: 'json',
    defaultRaw: `'[]'`,
    comment: '依赖节点 ID 列表（多依赖 DAG，JSON 数组）',
  })
  dependencies: string[] = [];

  /** 业务视角需求描述，供非技术人员和 AI 理解业务目标 */
  @Property({
    type: 'text',
    comment: '业务视角需求描述，说明该节点完成什么业务目标',
    default: '',
  })
  requirement: string = '';

  /** 技术视角执行提示词，说明实现方式、接口和代码改动方向 */
  @Property({
    type: 'text',
    comment: '技术视角执行提示词，说明实现方案和技术约束',
    default: '',
  })
  prompt!: string;

  /** 关联的 Agent 角色 ID */
  @Index()
  @Property({
    type: 'uuid',
    nullable: true,
    comment: '关联的 Agent 角色ID',
    default: null,
  })
  agentRoleId?: string | null;

  /** 当前执行会话 ID（唯一锁） */
  @Index()
  @Property({
    type: 'string',
    nullable: true,
    comment: '当前执行会话 ID（唯一锁）',
    default: null,
  })
  executorSessionId?: string | null;

  /** 当前执行者名称（Agent / 用户标识） */
  @Property({
    type: 'string',
    comment: '当前执行者名称',
    default: '',
  })
  executorAgentName?: string;

  /** 当前执行计划 / TODO */
  @Property({
    type: 'text',
    nullable: true,
    comment: '当前执行计划 / TODO',
    default: null,
  })
  executorTodo?: string | null;

  /** 执行锁定时间 */
  @Property({
    type: 'datetime',
    nullable: true,
    comment: '执行锁定时间',
    default: null,
  })
  executorLockedAt?: Date | null;

  /** 自定义属性列表（key-value 对） */
  @Property({
    type: 'json',
    nullable: true,
    comment: '自定义属性列表（JSON）',
    defaultRaw: `'{}'`,
  })
  attributes!: Record<string, any>;

  /** 节点执行状态 */
  @Property({
    type: 'string',
    comment: '执行状态：pending/in_progress/completed/failed/review_needed',
  })
  status: NodeStatus = NodeStatus.Pending;

  /** 记录创建时间 */
  @Property({ type: 'datetime', comment: '创建时间' })
  createdAt: Date = new Date();

  /** 记录最后更新时间 */
  @Property({
    type: 'datetime',
    onUpdate: () => new Date(),
    comment: '最后更新时间',
  })
  updatedAt: Date = new Date();
}
