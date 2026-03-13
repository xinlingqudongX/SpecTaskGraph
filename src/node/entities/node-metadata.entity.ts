import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { ProjectEntity } from '../../project/entities/project.entity';

export type NodeStatus = 'pending' | 'completed' | 'failed' | 'review_needed';

@Entity({ tableName: 'node_metadata' })
export class NodeMetadataEntity {
  @PrimaryKey()
  nodeId!: string;

  @ManyToOne(() => ProjectEntity)
  project!: ProjectEntity;

  @Property()
  nodeType!: string;

  @Property()
  requirement: string = '';

  @Property({ nullable: true })
  prompt?: string;

  @Property({ type: 'json', nullable: true })
  attributes?: Array<{ key: string; value: string }>;

  @Property()
  status: NodeStatus = 'pending';

  @Property({ nullable: true })
  deletedAt?: Date;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
