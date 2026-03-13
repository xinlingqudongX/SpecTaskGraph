import { Migration } from '@mikro-orm/migrations';

export class Migration20260313054108 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`node_metadata\` (\`node_id\` text not null, \`project_id\` text not null, \`node_type\` text not null, \`requirement\` text not null default '', \`prompt\` text null, \`attributes\` json null, \`status\` text not null default 'pending', \`deleted_at\` datetime null, \`created_at\` datetime not null, \`updated_at\` datetime not null, primary key (\`node_id\`));`);
    this.addSql(`create index \`node_metadata_project_id_index\` on \`node_metadata\` (\`project_id\`);`);

    this.addSql(`create table \`node_execution_history\` (\`id\` text not null, \`node_node_id\` text not null, \`prompt_snapshot\` text null, \`requirement_snapshot\` text null, \`result\` text null, \`executed_at\` datetime not null, \`created_by\` text null, \`created_at\` datetime not null, primary key (\`id\`));`);
    this.addSql(`create index \`node_execution_history_node_node_id_index\` on \`node_execution_history\` (\`node_node_id\`);`);
  }

}
