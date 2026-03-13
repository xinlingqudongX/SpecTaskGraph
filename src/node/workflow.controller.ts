import { Controller, Post, Param, Body } from '@nestjs/common';
import { NodeService } from './node.service';
import { SyncWorkflowDto } from './dto/sync-workflow.dto';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly nodeService: NodeService) {}

  @Post(':projectId/sync')
  async sync(
    @Param('projectId') projectId: string,
    @Body() dto: SyncWorkflowDto,
  ) {
    await this.nodeService.sync(projectId, dto.nodes);
    return { synced: true };
  }
}
