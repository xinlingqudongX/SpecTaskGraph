import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { randomUUID } from 'crypto';
import { NodeMetadataEntity, NodeStatus } from './entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './entities/node-execution-history.entity';
import { ProjectService } from '../project/project.service';
import { ProjectEntity } from '../project/entities/project.entity';
import { UpdateNodeDto } from './dto/update-node.dto';
import { CreateNodeHistoryDto } from './dto/create-node-history.dto';

@Injectable()
export class NodeService {
  constructor(
    @InjectRepository(NodeMetadataEntity)
    private readonly nodeRepo: EntityRepository<NodeMetadataEntity>,
    @InjectRepository(NodeExecutionHistoryEntity)
    private readonly historyRepo: EntityRepository<NodeExecutionHistoryEntity>,
    private readonly projectService: ProjectService,
    private readonly em: EntityManager,
  ) {}

  private async findNodeOrFail(nodeId: string): Promise<NodeMetadataEntity> {
    const node = await this.nodeRepo.findOne({ nodeId });
    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }
    return node;
  }

  async updateNode(nodeId: string, dto: UpdateNodeDto): Promise<NodeMetadataEntity> {
    const node = await this.findNodeOrFail(nodeId);
    // Only assign content fields — never touch status
    this.nodeRepo.assign(node, {
      ...(dto.requirement !== undefined && { requirement: dto.requirement }),
      ...(dto.prompt !== undefined && { prompt: dto.prompt }),
      ...(dto.attributes !== undefined && { attributes: dto.attributes }),
    });
    await this.em.persistAndFlush(node);
    return node;
  }

  async updateStatus(nodeId: string, newStatus: NodeStatus): Promise<NodeMetadataEntity> {
    const node = await this.findNodeOrFail(nodeId);

    // Create a history snapshot capturing the current state before the status change
    const history = new NodeExecutionHistoryEntity();
    history.id = randomUUID();
    history.node = node;
    history.promptSnapshot = node.prompt;
    history.requirementSnapshot = node.requirement;
    history.executedAt = new Date();

    // Stage both changes, then flush once (atomic write)
    this.em.persist(history);
    node.status = newStatus;
    this.em.persist(node);
    await this.em.flush();

    // TODO Phase 5: broadcast node:status:changed via CollaborationGateway

    return node;
  }

  async createHistory(
    nodeId: string,
    dto: CreateNodeHistoryDto,
  ): Promise<NodeExecutionHistoryEntity> {
    const node = await this.findNodeOrFail(nodeId);

    const history = new NodeExecutionHistoryEntity();
    history.id = randomUUID();
    history.node = node;
    history.result = dto.result;
    history.createdBy = dto.executedBy; // caller-facing name mapped to entity field
    history.executedAt = dto.executedAt ?? new Date();

    await this.em.persistAndFlush(history);
    return history;
  }

  async getHistory(nodeId: string): Promise<NodeExecutionHistoryEntity[]> {
    // Verify node exists first
    await this.findNodeOrFail(nodeId);

    return this.em.find(
      NodeExecutionHistoryEntity,
      { node: { nodeId } },
      { orderBy: { createdAt: 'desc' }, limit: 20 },
    );
  }

  async sync(
    projectId: string,
    nodes: Array<{ nodeId: string; nodeType: string }>,
  ): Promise<void> {
    // Validate project existence
    await this.projectService.findOne(projectId);

    await this.em.upsertMany(
      NodeMetadataEntity,
      nodes.map((n) => ({
        nodeId: n.nodeId,
        project: this.em.getReference(ProjectEntity, projectId),
        nodeType: n.nodeType,
      })),
      {
        onConflictFields: ['nodeId'],
        onConflictAction: 'merge',
        // Never overwrite backend-owned fields during sync
        onConflictExcludeFields: ['status', 'requirement', 'prompt', 'attributes'],
      },
    );
  }
}
