import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectService } from '../project/project.service';
import { NodeService } from '../node/node.service';
import { NodeStatus } from '../node/entities/node-metadata.entity';

/**
 * 定时任务服务
 * 负责检查MCP订阅项目的任务状态，并通过事件通知下发节点数据给AI
 */
@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name);

  constructor(
    private readonly projectService: ProjectService,
    private readonly nodeService: NodeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 每5分钟检查一次未完成的任务
   * 可以根据需要调整频率
   */
//   @Cron(CronExpression.EVERY_5_MINUTES)
  async checkPendingTasks() {
    this.logger.debug('开始检查待处理任务...');
    
    try {
      // 获取所有项目
      const projects = await this.projectService.findAll();
      
      for (const project of projects) {
        await this.checkProjectTasks(project.id);
      }
      
      this.logger.debug('任务检查完成');
    } catch (error) {
      this.logger.error('检查任务时发生错误:', error);
    }
  }

  /**
   * 检查单个项目的任务状态
   */
  private async checkProjectTasks(projectId: string) {
    try {
      // 获取项目中的所有节点
      const nodes = await this.nodeService.findByProject(projectId);
      
      // 筛选出未完成的节点（pending 和 review_needed 状态）
      const pendingNodes = nodes.filter(
        node => node.status === NodeStatus.Pending || 
                node.status === NodeStatus.ReviewNeeded
      );

      if (pendingNodes.length > 0) {
        this.logger.log(
          `项目 ${projectId} 有 ${pendingNodes.length} 个待处理任务`
        );

        // 通过事件通知下发节点数据给AI
        this.eventEmitter.emit('ai.pending.tasks', {
          projectId,
          taskCount: pendingNodes.length,
          tasks: pendingNodes.map(node => ({
            nodeId: node.nodeId,
            nodeType: node.nodeType,
            status: node.status,
            requirement: node.requirement,
            prompt: node.prompt,
            parentNodeId: node.parentNodeId,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
          })),
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error(`检查项目 ${projectId} 任务时发生错误:`, error);
    }
  }

  /**
   * 手动触发任务检查（用于测试或立即检查）
   */
  async triggerTaskCheck() {
    this.logger.log('手动触发任务检查');
    await this.checkPendingTasks();
  }
}