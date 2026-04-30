import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  McpSessionEntity,
  McpSessionStatus,
} from './entities/mcp-session.entity';
import { ProjectService } from '../project/project.service';
import { NodeService } from '../node/node.service';

@Injectable()
export class McpSessionService {
  constructor(
    @InjectRepository(McpSessionEntity)
    private readonly repo: EntityRepository<McpSessionEntity>,
    private readonly em: EntityManager,
    private readonly projectService: ProjectService,
    private readonly nodeService: NodeService,
  ) {}

  async upsertSession(
    sessionId: string,
    clientInfo?: { name: string; version: string },
  ): Promise<McpSessionEntity> {
    let session = await this.repo.findOne({ sessionId });
    if (!session) {
      session = this.em.create(McpSessionEntity, {
        sessionId,
        clientName: clientInfo?.name ?? '',
        clientVersion: clientInfo?.version ?? '',
        status: McpSessionStatus.Active,
        lastSeenAt: new Date(),
        createdAt: new Date(),
        ide: '',
        model: '',
        agentName: '',
        workspacePath: '',
        perceptionMode: 'local',
      });
      await this.em.persist(session).flush();
      return session;
    }

    session.clientName = clientInfo?.name ?? session.clientName;
    session.clientVersion = clientInfo?.version ?? session.clientVersion;
    session.status = McpSessionStatus.Active;
    session.lastSeenAt = new Date();
    session.closedAt = null;
    await this.em.flush();
    return session;
  }

  async registerClient(
    sessionId: string,
    clientInfo: { name?: string; version?: string } | undefined,
    payload: {
      workspacePath: string;
      ide?: string;
      model: string;
      agentName: string;
      extra?: Record<string, unknown>;
    },
  ): Promise<McpSessionEntity> {
    let session = await this.repo.findOne({ sessionId });
    if (!session) {
      session = this.em.create(McpSessionEntity, {
        sessionId,
        clientName: clientInfo?.name ?? '',
        clientVersion: clientInfo?.version ?? '',
        status: McpSessionStatus.Active,
        createdAt: new Date(),
        ide: payload.ide ?? '',
        model: payload.model,
        agentName: payload.agentName,
        workspacePath: payload.workspacePath,
        perceptionMode: 'local',
        lastSeenAt: new Date(),
      });
      this.em.persist(session);
    }
    session.clientName = clientInfo?.name ?? session.clientName;
    session.clientVersion = clientInfo?.version ?? session.clientVersion;
    session.status = McpSessionStatus.Active;
    session.closedAt = null;
    session.workspacePath = payload.workspacePath;
    session.ide = payload.ide ?? '';
    session.model = payload.model;
    session.agentName = payload.agentName;
    session.extra = payload.extra ?? session.extra ?? {};
    session.lastSeenAt = new Date();
    await this.em.flush();
    return session;
  }

  async confirmScope(
    sessionId: string,
    projectId: string,
    startNodeId: string,
  ): Promise<McpSessionEntity> {
    await this.projectService.findOne(projectId);
    const nodes = await this.nodeService.findByNodeIds([startNodeId]);
    const node = nodes[0];
    if (!node || (node.project as any).id !== projectId) {
      throw new NotFoundException(
        `Start node not found in project: ${startNodeId}`,
      );
    }
    const session = await this.repo.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException(`McpSession not found: ${sessionId}`);
    }
    session.confirmedProjectId = projectId;
    session.confirmedStartNodeId = startNodeId;
    session.perceptionMode = 'local';
    session.lastSeenAt = new Date();
    await this.em.flush();
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = await this.repo.findOne({ sessionId });
    if (!session) return;
    session.status = McpSessionStatus.Closed;
    session.closedAt = new Date();
    session.lastSeenAt = new Date();
    await this.em.flush();
  }

  async getSession(sessionId: string): Promise<McpSessionEntity | null> {
    return this.repo.findOne({ sessionId });
  }

  async touchSession(sessionId: string): Promise<void> {
    const session = await this.repo.findOne({ sessionId });
    if (!session) {
      return;
    }
    session.status = McpSessionStatus.Active;
    session.closedAt = null;
    session.lastSeenAt = new Date();
    await this.em.flush();
  }

  async isSessionAlive(
    sessionId: string,
    staleThresholdMs: number,
  ): Promise<boolean> {
    const session = await this.repo.findOne({ sessionId });
    if (!session) {
      return false;
    }
    if (session.status !== McpSessionStatus.Active) {
      return false;
    }
    return Date.now() - session.lastSeenAt.getTime() <= staleThresholdMs;
  }

  async listActiveSessions(projectId?: string): Promise<McpSessionEntity[]> {
    if (!projectId) {
      return this.repo.find({ status: McpSessionStatus.Active });
    }
    return this.repo.find({
      status: McpSessionStatus.Active,
      confirmedProjectId: projectId,
    });
  }
}
