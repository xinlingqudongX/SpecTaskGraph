import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { NodeMetadataEntity } from './node-metadata.entity';

@Entity({ tableName: 'node_execution_history' })
export class NodeExecutionHistoryEntity {
  @PrimaryKey()
  id!: string;

  @ManyToOne(() => NodeMetadataEntity)
  node!: NodeMetadataEntity;

  @Property({ type: 'text', nullable: true })
  promptSnapshot?: string;

  @Property({ type: 'text', nullable: true })
  requirementSnapshot?: string;

  @Property({ type: 'text', nullable: true })
  result?: string;

  @Property()
  executedAt: Date = new Date();

  @Property({ nullable: true })
  createdBy?: string;

  @Property()
  createdAt: Date = new Date();
}
