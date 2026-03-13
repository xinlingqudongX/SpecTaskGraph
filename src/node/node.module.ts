import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { NodeMetadataEntity } from './entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './entities/node-execution-history.entity';
import { NodeController } from './node.controller';
import { WorkflowController } from './workflow.controller';
import { NodeService } from './node.service';
import { WorkflowExportService } from './workflow-export.service';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([NodeMetadataEntity, NodeExecutionHistoryEntity]),
    ProjectModule,
  ],
  controllers: [NodeController, WorkflowController],
  providers: [NodeService, WorkflowExportService],
  exports: [NodeService],
})
export class NodeModule {}
