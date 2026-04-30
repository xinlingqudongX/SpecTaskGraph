import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/** 项目信息表 */
@Entity({ tableName: 'project', comment: '项目信息' })
export class ProjectEntity {
  /** 项目ID（UUID） */
  @PrimaryKey({ type: 'uuid', comment: '项目ID（UUID）' })
  id!: string;

  /** 项目名称，全局唯一 */
  @Property({ type: 'string', unique: true, comment: '项目名称，全局唯一' })
  name!: string;

  /** 项目描述 */
  @Property({ type: 'string', comment: '项目描述', default: '' })
  description!: string;

  /** 项目在本地文件系统的根目录路径 */
  @Property({ type: 'string', comment: '项目本地根目录路径' })
  basePath!: string;

  /** 技术栈信息（JSON） */
  @Property({ type: 'json', comment: '技术栈信息（JSON）' })
  techStack!: Record<string, any>;

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
