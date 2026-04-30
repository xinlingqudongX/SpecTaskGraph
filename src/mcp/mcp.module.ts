import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { McpSessionEntity } from './entities/mcp-session.entity';
import { McpSessionService } from './mcp-session.service';
import { McpWebSocketService } from './mcp-websocket.service';
import { ProjectModule } from '../project/project.module';
import { NodeModule } from '../node/node.module';
import { AgentRoleModule } from '../agent-role/agent-role.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([McpSessionEntity]),
    ProjectModule,
    NodeModule,
    AgentRoleModule,
  ],
  controllers: [McpController],
  providers: [
    McpService,
    McpSessionService,
    McpWebSocketService,
  ],
  exports: [McpWebSocketService],
})
export class McpModule {}
