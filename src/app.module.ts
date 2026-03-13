import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProjectModule } from './project/project.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { NodeModule } from './node/node.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './mikro-orm.config';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api/v1/*'],
      // serve static files at application root so assets are available at `/assets/...`
      serveRoot: '/',
    }),
    ProjectModule,
    CollaborationModule,
    NodeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
