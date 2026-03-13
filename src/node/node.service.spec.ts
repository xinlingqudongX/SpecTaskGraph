import { NotFoundException } from '@nestjs/common';
import { NodeService } from './node.service';
import { NodeMetadataEntity } from './entities/node-metadata.entity';
import { NodeExecutionHistoryEntity } from './entities/node-execution-history.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<NodeMetadataEntity> = {}): NodeMetadataEntity {
  return Object.assign(new NodeMetadataEntity(), {
    nodeId: 'node-1',
    nodeType: 'text',
    requirement: '',
    prompt: undefined,
    attributes: undefined,
    status: 'pending' as const,
    project: { id: 'proj-1' } as any,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeNodeRepo(node: NodeMetadataEntity | null = makeNode()) {
  return {
    findOne: jest.fn().mockResolvedValue(node),
    assign: jest.fn((entity: any, patch: any) => Object.assign(entity, patch)),
    getEntityManager: jest.fn(),
  } as any;
}

function makeHistoryRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeEm() {
  return {
    persist: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    persistAndFlush: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    upsertMany: jest.fn().mockResolvedValue(undefined),
    getReference: jest.fn((EntityClass: any, id: string) => ({ id })),
  } as any;
}

function makeProjectService(project: any = { id: 'proj-1' }) {
  return {
    findOne: jest.fn().mockResolvedValue(project),
  } as any;
}

// ---------------------------------------------------------------------------
// updateNode
// ---------------------------------------------------------------------------

describe('NodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateNode', () => {
    it('updates requirement and leaves status unchanged', async () => {
      const node = makeNode({ requirement: '', status: 'completed' });
      const nodeRepo = makeNodeRepo(node);
      const historyRepo = makeHistoryRepo();
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, historyRepo, makeProjectService(), em);

      const result = await service.updateNode('node-1', { requirement: 'req1' });

      expect(result.requirement).toBe('req1');
      expect(result.status).toBe('completed'); // status untouched
      expect(em.persistAndFlush).toHaveBeenCalledWith(node);
    });

    it('UpdateNodeDto has no status field (structural type check)', () => {
      // This test verifies at the TypeScript level that UpdateNodeDto cannot carry status.
      // We assert by checking the keys of the zod schema shape.
      const { updateNodeSchema } = require('./dto/update-node.dto');
      const shape = updateNodeSchema.shape;
      expect('status' in shape).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('creates history with snapshots and sets node.status atomically', async () => {
      const node = makeNode({ prompt: 'p1', requirement: 'r1', status: 'pending' });
      const nodeRepo = makeNodeRepo(node);
      const historyRepo = makeHistoryRepo();
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, historyRepo, makeProjectService(), em);
      await service.updateStatus('node-1', 'completed');

      // The em.persist should have been called twice: once for history, once for node
      expect(em.persist).toHaveBeenCalledTimes(2);
      // em.flush should have been called exactly once
      expect(em.flush).toHaveBeenCalledTimes(1);

      // Node status should be set to 'completed'
      expect(node.status).toBe('completed');

      // Check the history row passed to persist
      const historyArg = em.persist.mock.calls[0][0] as NodeExecutionHistoryEntity;
      expect(historyArg.promptSnapshot).toBe('p1');
      expect(historyArg.requirementSnapshot).toBe('r1');
    });

    it('calls em.persist twice and em.flush once (atomic write)', async () => {
      const node = makeNode();
      const nodeRepo = makeNodeRepo(node);
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, makeHistoryRepo(), makeProjectService(), em);
      await service.updateStatus('node-1', 'failed');

      expect(em.persist).toHaveBeenCalledTimes(2);
      expect(em.flush).toHaveBeenCalledTimes(1);
      // persistAndFlush must NOT be used here
      expect(em.persistAndFlush).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // createHistory
  // ---------------------------------------------------------------------------

  describe('createHistory', () => {
    it('creates history with createdBy mapped from executedBy and correct result', async () => {
      const node = makeNode();
      const nodeRepo = makeNodeRepo(node);
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, makeHistoryRepo(), makeProjectService(), em);
      await service.createHistory('node-1', { result: 'done', executedBy: 'claude-code' });

      expect(em.persistAndFlush).toHaveBeenCalledTimes(1);
      const historyArg = em.persistAndFlush.mock.calls[0][0] as NodeExecutionHistoryEntity;
      expect(historyArg.createdBy).toBe('claude-code');
      expect(historyArg.result).toBe('done');
    });

    it('history record has a non-empty string UUID id', async () => {
      const node = makeNode();
      const nodeRepo = makeNodeRepo(node);
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, makeHistoryRepo(), makeProjectService(), em);
      await service.createHistory('node-1', {});

      const historyArg = em.persistAndFlush.mock.calls[0][0] as NodeExecutionHistoryEntity;
      expect(typeof historyArg.id).toBe('string');
      expect(historyArg.id.length).toBeGreaterThan(0);
      // UUID format: 8-4-4-4-12
      expect(historyArg.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getHistory
  // ---------------------------------------------------------------------------

  describe('getHistory', () => {
    it('returns array ordered by createdAt desc with limit 20', async () => {
      const node = makeNode();
      const nodeRepo = makeNodeRepo(node);
      const historyRows = [{ id: 'h1' }, { id: 'h2' }] as any[];
      const em = makeEm();
      em.find.mockResolvedValue(historyRows);
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, makeHistoryRepo(), makeProjectService(), em);
      const result = await service.getHistory('node-1');

      expect(em.find).toHaveBeenCalledWith(
        NodeExecutionHistoryEntity,
        { node: { nodeId: 'node-1' } },
        { orderBy: { createdAt: 'desc' }, limit: 20 },
      );
      expect(result).toBe(historyRows);
    });

    it('throws NotFoundException when node does not exist', async () => {
      const nodeRepo = makeNodeRepo(null);
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);

      const service = new NodeService(nodeRepo, makeHistoryRepo(), makeProjectService(), em);
      await expect(service.getHistory('missing-node')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // sync
  // ---------------------------------------------------------------------------

  describe('sync', () => {
    it('calls em.upsertMany with onConflictExcludeFields containing exactly the 4 protected fields', async () => {
      const node = makeNode();
      const nodeRepo = makeNodeRepo(node);
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);
      const projectService = makeProjectService();

      const service = new NodeService(nodeRepo, makeHistoryRepo(), projectService, em);
      await service.sync('proj-1', [{ nodeId: 'n1', nodeType: 'text' }]);

      expect(em.upsertMany).toHaveBeenCalledTimes(1);
      const callArgs = em.upsertMany.mock.calls[0];
      const options = callArgs[2];
      const excluded: string[] = options.onConflictExcludeFields;
      expect(excluded).toEqual(
        expect.arrayContaining(['status', 'requirement', 'prompt', 'attributes']),
      );
      expect(excluded).toHaveLength(4);
    });

    it('calls projectService.findOne(projectId) to validate project existence', async () => {
      const nodeRepo = makeNodeRepo(makeNode());
      const em = makeEm();
      nodeRepo.getEntityManager.mockReturnValue(em);
      const projectService = makeProjectService();

      const service = new NodeService(nodeRepo, makeHistoryRepo(), projectService, em);
      await service.sync('proj-1', []);

      expect(projectService.findOne).toHaveBeenCalledWith('proj-1');
    });
  });
});
