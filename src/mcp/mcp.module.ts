import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { ProjectModule } from '../project/project.module';
import { NodeModule } from '../node/node.module';
import { WorkflowExportService } from '../node/workflow-export.service';
import { NodeMetadataEntity } from '../node/entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from '../node/entities/node-execution-history.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([NodeMetadataEntity, NodeExecutionHistoryEntity]),
    ProjectModule,
    NodeModule,
  ],
  controllers: [McpController],
  providers: [McpService, WorkflowExportService],
})
export class McpModule {}
