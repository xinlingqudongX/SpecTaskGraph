import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { ProjectEntity } from './project.entity';

/** 项目资产文件记录表 */
@Entity({ tableName: 'project_asset', comment: '项目资产文件记录' })
export class ProjectAsset {
  /** 资产ID（UUID） */
  @PrimaryKey({ type: 'uuid', comment: '资产ID（UUID）' })
  id!: string;

  /** 资产文件相对路径 */
  @Property({ type: 'string', comment: '资产文件相对路径' })
  filePath!: string;

  /** 文件角色（如 spec、impl、test 等） */
  @Property({ type: 'string', comment: '文件角色（如 spec/impl/test）' })
  fileRole!: string;

  /** 文件内容哈希，用于变更检测 */
  @Property({ type: 'string', nullable: true, comment: '文件内容哈希，用于变更检测' })
  lastHash?: string;

  /** 所属项目 */
  @ManyToOne(() => ProjectEntity, { comment: '所属项目ID' })
  project!: ProjectEntity;
}
