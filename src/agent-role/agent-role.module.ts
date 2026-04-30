import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AgentRoleEntity } from './entities/agent-role.entity';
import { AgentRoleService } from './agent-role.service';
import { AgentRoleController } from './agent-role.controller';

/** Agent 角色模块 */
@Module({
  imports: [MikroOrmModule.forFeature([AgentRoleEntity])],
  controllers: [AgentRoleController],
  providers: [AgentRoleService],
  exports: [AgentRoleService],
})
export class AgentRoleModule {}
