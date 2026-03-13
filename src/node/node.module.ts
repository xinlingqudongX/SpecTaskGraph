import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { NodeMetadataEntity } from './entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './entities/node-execution-history.entity';
import { NodeController } from './node.controller';
import { NodeService } from './node.service';
import { ProjectModule } from '../project/project.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([NodeMetadataEntity, NodeExecutionHistoryEntity]),
    ProjectModule,
  ],
  controllers: [NodeController],
  providers: [NodeService],
  exports: [NodeService],
})
export class NodeModule {}
