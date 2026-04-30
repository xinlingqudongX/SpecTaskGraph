import { PostgreSqlDriver, defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { ProjectEntity } from './project/entities/project.entity';
import { ProjectAsset } from './project/entities/project-asset.entity';
import { NodeMetadataEntity } from './node/entities/node-metadata.entity';
import { McpSessionEntity } from './mcp/entities/mcp-session.entity';
import { AgentRoleEntity } from './agent-role/entities/agent-role.entity';
import { loadConfig } from './config/config.loader';

const cfg = loadConfig();

export default defineConfig({
  driver: PostgreSqlDriver,
  host: cfg.postgres.host,
  port: cfg.postgres.port,
  user: cfg.postgres.username,
  password: cfg.postgres.password,
  dbName: cfg.postgres.database,
  schema: cfg.postgres.schema,
  entities: [
    ProjectEntity,
    ProjectAsset,
    NodeMetadataEntity,
    McpSessionEntity,
    AgentRoleEntity,
  ],
  extensions: [Migrator],
  dynamicImportProvider: (id) => require(id),
  migrations: {
    transactional: true,
    snapshot: false,
  },
  schemaGenerator: {
    disableForeignKeys: false,
    createForeignKeyConstraints: true,
  },
  debug: false,
  logger: (message) => console.log(message),
  allowGlobalContext: true,
});
