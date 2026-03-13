import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { NodeService } from './node.service';
import { SyncWorkflowDto } from './dto/sync-workflow.dto';
import { WorkflowExportService } from './workflow-export.service';

@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly nodeService: NodeService,
    private readonly workflowExportService: WorkflowExportService,
  ) {}

  @Post(':projectId/sync')
  async sync(
    @Param('projectId') projectId: string,
    @Body() dto: SyncWorkflowDto,
  ) {
    await this.nodeService.sync(projectId, dto.nodes);
    return { synced: true };
  }

  @Get(':projectId/export')
  async export(@Param('projectId') projectId: string) {
    return this.workflowExportService.exportWorkflow(projectId);
  }
}
