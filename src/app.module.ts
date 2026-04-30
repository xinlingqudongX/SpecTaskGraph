import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProjectModule } from './project/project.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { NodeModule } from './node/node.module';
import { McpModule } from './mcp/mcp.module';
import { ServicesModule } from './services/services.module';
import { AgentRoleModule } from './agent-role/agent-role.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MikroOrmModule, MikroOrmModuleSyncOptions } from '@mikro-orm/nestjs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MikroORM } from '@mikro-orm/postgresql';
import mikroOrmConfig from './mikro-orm.config';
import { loadConfig } from './config/config.loader';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig],
    }),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    MikroOrmModule.forRoot(mikroOrmConfig as MikroOrmModuleSyncOptions),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api/v1/*'],
      // serve static files at application root so assets are available at `/assets/...`
      serveRoot: '/',
    }),
    ProjectModule,
    CollaborationModule,
    NodeModule,
    AgentRoleModule,
    McpModule,
    ServicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly orm: MikroORM) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'production') return;
    this.logger.log('开始后台同步数据库 Schema');
    void this.orm.schema
      .update()
      .then(() => {
        this.logger.log('数据库 Schema 已同步');
      })
      .catch((err) => {
        this.logger.error(
          `数据库 Schema 同步失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
