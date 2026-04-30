import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { NodeMetadataEntity } from './entities/node-metadata.entity';
import { NodeController } from './node.controller';
import { WorkflowController } from './workflow.controller';
import { NodeService } from './node.service';
import { ProjectModule } from '../project/project.module';
import { CollaborationModule } from '../collaboration/collaboration.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([NodeMetadataEntity]),
    ProjectModule,
    CollaborationModule,
  ],
  controllers: [NodeController, WorkflowController],
  providers: [NodeService],
  exports: [NodeService],
})
export class NodeModule {}
