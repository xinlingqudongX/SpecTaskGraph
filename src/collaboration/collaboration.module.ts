import { Module } from '@nestjs/common';
import { CollaborationGateway } from './collaboration.gateway';
import { RoomManagerService } from './room-manager.service';
import { UserManagerService } from './user-manager.service';
import { MessageHandlerService } from './message-handler.service';
import { ConnectionManagerService } from './connection-manager.service';
import { OperationLoggerService } from './operation-logger.service';
import { MessageValidatorService } from './message-validator.service';
import { CollaborationController } from './collaboration.controller';
import { HeartbeatService } from './heartbeat.service';

/**
 * 协同功能模块
 * 提供实时协同编辑功能，包括WebSocket连接管理、房间管理、用户管理等
 */
@Module({
  providers: [
    CollaborationGateway,
    RoomManagerService,
    UserManagerService,
    MessageHandlerService,
    ConnectionManagerService,
    OperationLoggerService,
    MessageValidatorService,
    HeartbeatService,
  ],
  controllers: [CollaborationController],
  exports: [
    CollaborationGateway,
    RoomManagerService,
    UserManagerService,
    MessageHandlerService,
    ConnectionManagerService,
    OperationLoggerService,
    MessageValidatorService,
    HeartbeatService,
  ],
})
export class CollaborationModule {}
