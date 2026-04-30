import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { randomUUID } from 'crypto';
import {
  NodeMetadataEntity,
  NodeStatus,
} from './entities/node-metadata.entity';
import { ProjectService } from '../project/project.service';
import { ProjectEntity } from '../project/entities/project.entity';
import { UpdateNodeDto } from './dto/update-node.dto';
import { CreateNodeHistoryDto } from './dto/create-node-history.dto';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NodeUpdatedEvent,
  NodeStatusChange,
} from './events/node-updated.event';
import { computeTbLayout } from './layout.util';

@Injectable()
export class NodeService {
  constructor(
    @InjectRepository(NodeMetadataEntity)
    private readonly nodeRepo: EntityRepository<NodeMetadataEntity>,
    private readonly projectService: ProjectService,
    private readonly em: EntityManager,
    private readonly collaborationGateway: CollaborationGateway,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async findNodeOrFail(nodeId: string): Promise<NodeMetadataEntity> {
    const node = await this.nodeRepo.findOne({ nodeId });
    if (!node) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }
    return node;
  }

  private broadcastNodeState(node: NodeMetadataEntity): void {
    const projectId = (node.project as any).id as string;
    this.collaborationGateway.broadcastNodeChange(
      projectId,
      'node-update',
      this.buildBroadcastNodePayload(node),
    );
  }

  private toCollaborationNodeType(nodeType: string): string {
    switch (nodeType) {
      case 'start':
        return 'root';
      case 'decision':
        return 'property';
      default:
        return nodeType || 'text';
    }
  }

  private buildBroadcastNodePayload(
    node: NodeMetadataEntity,
  ): Record<string, unknown> {
    const rawAttributes =
      node.attributes && typeof node.attributes === 'object'
        ? node.attributes
        : {};
    const position =
      rawAttributes &&
      typeof (rawAttributes as Record<string, unknown>).position === 'object'
        ? (rawAttributes as Record<string, unknown>).position
        : undefined;

    return {
      nodeId: node.nodeId,
      type: this.toCollaborationNodeType(node.nodeType),
      position,
      properties: {
        ...rawAttributes,
        requirement: node.requirement,
        prompt: node.prompt ?? null,
        agentRoleId: node.agentRoleId ?? null,
        parentNodeId: node.parentNodeId ?? null,
        sortOrder: node.sortOrder ?? 0,
        dependencies: node.dependencies ?? [],
        status: node.status,
      },
      parentNodeId: node.parentNodeId ?? null,
      sortOrder: node.sortOrder ?? 0,
      dependencies: node.dependencies ?? [],
      status: node.status,
      updatedAt: node.updatedAt,
      executorSessionId: node.executorSessionId ?? null,
      executorAgentName: node.executorAgentName ?? '',
      executorTodo: node.executorTodo ?? null,
      executorLockedAt: node.executorLockedAt ?? null,
    };
  }

  async updateNode(
    nodeId: string,
    dto: UpdateNodeDto,
  ): Promise<NodeMetadataEntity> {
    const node = await this.findNodeOrFail(nodeId);
    // Only assign content fields — never touch status
    this.nodeRepo.assign(node, {
      ...(dto.requirement !== undefined && { requirement: dto.requirement }),
      ...(dto.prompt !== undefined && { prompt: dto.prompt }),
      ...(dto.agentRoleId !== undefined && { agentRoleId: dto.agentRoleId }),
      ...(dto.attributes !== undefined && { attributes: dto.attributes }),
    });
    await this.em.persist(node).flush();
    const projectId = (node.project as any).id as string;
    this.collaborationGateway.broadcastNodeChange(
      projectId,
      'node-update',
      this.buildBroadcastNodePayload(node),
    );
    return node;
  }

  async updateStatus(
    nodeId: string,
    newStatus: NodeStatus,
  ): Promise<NodeMetadataEntity> {
    const [result] = await this.batchUpdateStatus([
      { nodeId, status: newStatus },
    ]);
    return result;
  }

  async batchUpdateStatus(
    updates: Array<{ nodeId: string; status: NodeStatus }>,
  ): Promise<NodeMetadataEntity[]> {
    const nodes = await Promise.all(
      updates.map(({ nodeId }) => this.findNodeOrFail(nodeId)),
    );

    const now = new Date();
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      node.status = updates[i].status;
      if (
        updates[i].status === NodeStatus.Completed ||
        updates[i].status === NodeStatus.Failed
      ) {
        // 任务结束后释放执行锁
        node.executorSessionId = null;
        node.executorAgentName = '';
        node.executorTodo = null;
        node.executorLockedAt = null;
      }
      this.em.persist(node);
    }

    await this.em.flush();

    for (const node of nodes) {
      this.broadcastNodeState(node);
    }

    return nodes;
  }

  async findByProject(projectId: string): Promise<NodeMetadataEntity[]> {
    return this.nodeRepo.find(
      { project: { id: projectId } },
      { orderBy: { sortOrder: 'asc', createdAt: 'asc' } },
    );
  }

  async findByNodeIds(nodeIds: string[]): Promise<NodeMetadataEntity[]> {
    return this.nodeRepo.find({ nodeId: { $in: nodeIds } });
  }

  async sync(
    projectId: string,
    nodes: Array<{
      nodeId: string;
      nodeType: string;
      parentNodeId?: string | null;
      sortOrder?: number;
      dependencies?: string[];
      attributes?: Record<string, unknown>;
      requirement?: string;
      prompt?: string;
      agentRoleId?: string | null;
    }>,
    options: { replaceAll?: boolean } = {},
  ): Promise<void> {
    // Validate project existence
    await this.projectService.findOne(projectId);

    const now = new Date();
    const existingProjectNodes = options.replaceAll
      ? await this.nodeRepo.find(
          { project: { id: projectId } },
          { fields: ['nodeId'] },
        )
      : [];
    const existingNodes = await this.nodeRepo.find({
      nodeId: { $in: nodes.map((n) => n.nodeId) },
    });
    const existingMap = new Map(
      existingNodes.map((node) => [node.nodeId, node]),
    );

    // 对缺少 position 的节点执行 TB 自动布局
    const needsLayout = nodes.some((n) => !(n.attributes as any)?.position);
    if (needsLayout) {
      const positions = computeTbLayout(nodes);
      for (const n of nodes) {
        if (!(n.attributes as any)?.position) {
          const p = positions.get(n.nodeId);
          if (p) {
            n.attributes = { ...(n.attributes ?? {}), position: p };
          }
        }
      }
    }

    // Step 1: upsert structural fields — requirement/prompt remain protected
    await this.em.upsertMany(
      NodeMetadataEntity,
      nodes.map((n) => ({
        ...(existingMap.get(n.nodeId)
          ? {
              parentNodeId: Object.prototype.hasOwnProperty.call(
                n,
                'parentNodeId',
              )
                ? (n.parentNodeId ?? null)
                : (existingMap.get(n.nodeId)!.parentNodeId ?? null),
              sortOrder: Object.prototype.hasOwnProperty.call(n, 'sortOrder')
                ? (n.sortOrder ?? 0)
                : (existingMap.get(n.nodeId)!.sortOrder ?? 0),
              dependencies: Object.prototype.hasOwnProperty.call(
                n,
                'dependencies',
              )
                ? (n.dependencies ?? [])
                : (existingMap.get(n.nodeId)!.dependencies ?? []),
              agentRoleId: Object.prototype.hasOwnProperty.call(
                n,
                'agentRoleId',
              )
                ? (n.agentRoleId ?? null)
                : (existingMap.get(n.nodeId)!.agentRoleId ?? null),
              attributes: Object.prototype.hasOwnProperty.call(n, 'attributes')
                ? (n.attributes ?? {})
                : (existingMap.get(n.nodeId)!.attributes ?? {}),
            }
          : {
              parentNodeId: n.parentNodeId ?? null,
              sortOrder: n.sortOrder ?? 0,
              dependencies: n.dependencies ?? [],
              agentRoleId: n.agentRoleId ?? null,
              attributes: n.attributes ?? {},
            }),
        nodeId: n.nodeId,
        project: this.em.getReference(ProjectEntity, projectId),
        nodeType: n.nodeType,
        createdAt: now,
        updatedAt: now,
      })),
      {
        onConflictFields: ['nodeId'],
        onConflictAction: 'merge',
        onConflictExcludeFields: [
          'status',
          'requirement',
          'prompt',
          'createdAt',
        ],
      },
    );

    // Step 2: selectively update requirement/prompt for nodes that provide them
    const toUpdate = nodes.filter(
      (n) => n.requirement !== undefined || n.prompt !== undefined,
    );
    if (toUpdate.length > 0) {
      const entities = await this.nodeRepo.find({
        nodeId: { $in: toUpdate.map((n) => n.nodeId) },
      });
      const entityMap = new Map(entities.map((e) => [e.nodeId, e]));
      for (const n of toUpdate) {
        const entity = entityMap.get(n.nodeId);
        if (!entity) continue;
        if (n.requirement !== undefined) entity.requirement = n.requirement;
        if (n.prompt !== undefined) entity.prompt = n.prompt;
        this.em.persist(entity);
      }
      await this.em.flush();
    }

    // Step 3: 仅在 replaceAll=true 时删除不在本次提交列表中的节点
    // 前端全量快照调用时传 true；AI IDE 分批 upsert 时保持 false（默认）
    const deletedNodeIds =
      options.replaceAll && existingProjectNodes.length > 0
        ? existingProjectNodes
            .map((node) => node.nodeId)
            .filter((nodeId) => !nodes.some((node) => node.nodeId === nodeId))
        : [];
    if (options.replaceAll && nodes.length > 0) {
      const submittedIds = nodes.map((n) => n.nodeId);
      await this.nodeRepo.nativeDelete({
        project: { id: projectId },
        nodeId: { $nin: submittedIds },
      });
    }

    const syncedNodes = await this.nodeRepo.find({
      nodeId: { $in: nodes.map((node) => node.nodeId) },
    });
    for (const syncedNode of syncedNodes) {
      this.collaborationGateway.broadcastNodeChange(
        projectId,
        existingMap.has(syncedNode.nodeId) ? 'node-update' : 'node-create',
        this.buildBroadcastNodePayload(syncedNode),
      );
    }
    if (deletedNodeIds.length > 0) {
      this.collaborationGateway.broadcastNodeChange(projectId, 'node-delete', {
        deletedNodeIds,
      });
    }
    this.eventEmitter.emit('node.updated', new NodeUpdatedEvent(projectId));
  }

  async lockExecutor(
    nodeId: string,
    sessionId: string,
    agentName: string,
    todo: string,
  ): Promise<NodeMetadataEntity> {
    const node = await this.findNodeOrFail(nodeId);
    if (node.executorSessionId && node.executorSessionId !== sessionId) {
      throw new Error(
        `节点已被会话 ${node.executorSessionId} 锁定，当前执行者=${node.executorAgentName ?? ''}`,
      );
    }
    node.executorSessionId = sessionId;
    node.executorAgentName = agentName;
    node.executorTodo = todo;
    node.executorLockedAt = new Date();
    await this.em.persist(node).flush();
    this.broadcastNodeState(node);
    return node;
  }

  async claimExecutor(
    nodeId: string,
    sessionId: string,
    agentName: string,
    todo: string,
    options?: { takeoverSessionId?: string },
  ): Promise<{ node: NodeMetadataEntity; takenOver: boolean }> {
    const now = new Date();
    const where = options?.takeoverSessionId
      ? {
          nodeId,
          executorSessionId: options.takeoverSessionId,
        }
      : {
          nodeId,
          $or: [{ executorSessionId: null }, { executorSessionId: sessionId }],
        };

    const affected = await this.nodeRepo.nativeUpdate(where as any, {
      executorSessionId: sessionId,
      executorAgentName: agentName,
      executorTodo: todo,
      executorLockedAt: now,
      updatedAt: now,
    });

    if (!affected) {
      throw new Error(`节点执行权抢占失败: ${nodeId}`);
    }

    const node = await this.findNodeOrFail(nodeId);
    this.broadcastNodeState(node);
    return { node, takenOver: Boolean(options?.takeoverSessionId) };
  }

  async unlockExecutors(nodeIds: string[]): Promise<NodeMetadataEntity[]> {
    if (nodeIds.length === 0) {
      return [];
    }
    const nodes = await this.nodeRepo.find({ nodeId: { $in: nodeIds } });
    for (const node of nodes) {
      node.executorSessionId = null;
      node.executorAgentName = '';
      node.executorTodo = null;
      node.executorLockedAt = null;
      this.em.persist(node);
    }
    await this.em.flush();

    for (const node of nodes) {
      this.broadcastNodeState(node);
    }

    return nodes;
  }

  async findSubtreeNodes(rootId: string): Promise<NodeMetadataEntity[]> {
    const ids = await this.collectSubtree(rootId);
    return this.nodeRepo.find({ nodeId: { $in: ids } });
  }

  /** 删除节点及其所有子孙节点 */
  async deleteNode(nodeId: string): Promise<{ deletedNodeIds: string[] }> {
    const root = await this.findNodeOrFail(nodeId);
    const projectId = (root.project as any).id as string;
    const allIds = await this.collectSubtree(nodeId);
    await this.nodeRepo.nativeDelete({ nodeId: { $in: allIds } });
    this.collaborationGateway.broadcastNodeChange(projectId, 'node-delete', {
      deletedNodeIds: allIds,
    });
    return { deletedNodeIds: allIds };
  }

  private async collectSubtree(rootId: string): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      result.push(currentId);
      const children = await this.nodeRepo.find(
        { parentNodeId: currentId },
        { fields: ['nodeId'] },
      );
      queue.push(...children.map((c) => c.nodeId));
    }
    return result;
  }
}
