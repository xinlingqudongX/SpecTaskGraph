import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { NodeService } from './node.service';
import { SyncWorkflowDto } from './dto/sync-workflow.dto';

@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly nodeService: NodeService,
  ) {}

  @Post(':projectId/sync')
  async sync(
    @Param('projectId') projectId: string,
    @Body() dto: SyncWorkflowDto,
  ) {
    const validNodes = dto.nodes.filter(
      (node) =>
        node.nodeId === 'node_root' ||
        (typeof node.parentNodeId === 'string' && node.parentNodeId.trim().length > 0),
    );
    const removedNodeIds = dto.nodes
      .filter((node) => !validNodes.some((validNode) => validNode.nodeId === node.nodeId))
      .map((node) => node.nodeId);

    await this.nodeService.sync(projectId, validNodes, { replaceAll: true });
    return {
      synced: true,
      nodeCount: validNodes.length,
      removedNodeIds,
    };
  }
}
