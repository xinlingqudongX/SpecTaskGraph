import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ProjectEntity } from './entities/project.entity';
import { NodeMetadataEntity } from '../node/entities/node-metadata.entity';

@Module({
  imports: [MikroOrmModule.forFeature([ProjectEntity, NodeMetadataEntity])],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
