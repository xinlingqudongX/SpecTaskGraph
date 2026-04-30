import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TaskSchedulerService } from './task-scheduler.service';
import { ProjectModule } from '../project/project.module';
import { NodeModule } from '../node/node.module';

/**
 * 服务模块
 * 包含定时任务和事件监听相关的服务
 */
@Module({
  imports: [
    ScheduleModule.forRoot(), // 启用定时任务功能
    ProjectModule,
    NodeModule,
  ],
  controllers: [],
  providers: [
    TaskSchedulerService,
  ],
  exports: [
    TaskSchedulerService,
  ],
})
export class ServicesModule {}