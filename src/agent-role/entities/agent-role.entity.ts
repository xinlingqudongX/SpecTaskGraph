import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'crypto';

/** Agent 角色表 */
@Entity({ tableName: 'agent_role', comment: 'Agent 角色定义表' })
export class AgentRoleEntity {
  /** 角色 ID */
  @PrimaryKey({ type: 'uuid', comment: '角色ID（UUID）' })
  id: string = randomUUID();

  /** 角色名称 */
  @Property({
    type: 'string',
    unique: true,
    comment: '角色名称',
  })
  name!: string;

  /** 角色简介 */
  @Property({
    type: 'text',
    comment: '角色简介',
    default: '',
  })
  description: string = '';

  /** 角色提示词 */
  @Property({
    type: 'text',
    comment: '角色提示词',
    default: '',
  })
  prompt: string = '';

  /** 创建时间 */
  @Property({ type: 'datetime', comment: '创建时间' })
  createdAt: Date = new Date();

  /** 更新时间 */
  @Property({
    type: 'datetime',
    onUpdate: () => new Date(),
    comment: '更新时间',
  })
  updatedAt: Date = new Date();
}
