import { BetterSqliteDriver, defineConfig } from '@mikro-orm/better-sqlite';
import { Migrator } from '@mikro-orm/migrations';
import { ProjectEntity } from './project/entities/project.entity';
import { ProjectAsset } from './project/entities/project-asset.entity';
import { NodeMetadataEntity } from './node/entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './node/entities/node-execution-history.entity';

export default defineConfig({
  allowGlobalContext: true,
  driver: BetterSqliteDriver,
  dbName: 'database.sqlite',
  entities: [
    ProjectEntity,
    ProjectAsset,
    NodeMetadataEntity,
    NodeExecutionHistoryEntity,
  ],
  extensions: [Migrator],
  dynamicImportProvider: (id) => require(id),
  migrations: {
    transactional: true,
    snapshot: false,
  },
  schemaGenerator: {
    disableForeignKeys: true,
    createForeignKeyConstraints: false,
  },
});
