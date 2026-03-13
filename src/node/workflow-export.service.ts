import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import {
  NodeMetadataEntity,
  NodeStatus,
} from './entities/node-metadata.entity';
import { ProjectService } from '../project/project.service';

// ---------------------------------------------------------------------------
// Local interfaces
// ---------------------------------------------------------------------------

export interface ExportNode {
  nodeId: string;
  type: string;
  requirement: string;
  prompt: string | null;
  attributes: Array<{ key: string; value: string }> | null;
  status: NodeStatus;
  dependencies: string[];
  can_execute: boolean;
}

export interface WorkflowExportResponse {
  projectId: string;
  projectName: string;
  exported_at: string;
  total_nodes: number;
  nodes: ExportNode[];
  execution_order: string[];
  executable_now: string[];
}

// ---------------------------------------------------------------------------
// Pure helper functions (module-level)
// ---------------------------------------------------------------------------

function emptyExport(
  projectId: string,
  projectName: string,
): WorkflowExportResponse {
  return {
    projectId,
    projectName,
    exported_at: new Date().toISOString(),
    total_nodes: 0,
    nodes: [],
    execution_order: [],
    executable_now: [],
  };
}

function buildDependencyMap(
  nodes: NodeMetadataEntity[],
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
  nodeIds: Set<string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // Initialize every node with empty deps
  for (const node of nodes) {
    map.set(node.nodeId, []);
  }

  // For each edge, only record if both endpoints are in scope
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue; // dangling edge — skip
    }
    // edge A->B means B depends on A (incoming dependency for B)
    map.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  }

  return map;
}

function kahnSort(
  nodeIds: Set<string>,
  dependencyMap: Map<string, string[]>,
): { order: string[]; cycle: string[] | null } {
  // Initialize inDegree for ALL nodeIds (isolated nodes get 0)
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    const deps = (dependencyMap.get(id) ?? []).filter((d) => nodeIds.has(d));
    inDegree.set(id, deps.length);
  }

  // Queue starts with all zero in-degree nodes
  const queue: string[] = [...nodeIds].filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);

    // Reduce in-degree of nodes that depend on curr
    for (const id of nodeIds) {
      const deps = dependencyMap.get(id) ?? [];
      if (deps.includes(curr)) {
        const newDeg = (inDegree.get(id) ?? 0) - 1;
        inDegree.set(id, newDeg);
        if (newDeg === 0) {
          queue.push(id);
        }
      }
    }
  }

  if (order.length < nodeIds.size) {
    // Cycle detected
    return { order: [], cycle: findCyclePath(nodeIds, dependencyMap, order) };
  }

  return { order, cycle: null };
}

function findCyclePath(
  nodeIds: Set<string>,
  dependencyMap: Map<string, string[]>,
  processedOrder: string[],
): string[] {
  const color = new Map<string, 'white' | 'gray' | 'black'>();
  for (const id of nodeIds) {
    color.set(id, 'white');
  }

  const path: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, 'gray');
    path.push(node);

    for (const dep of dependencyMap.get(node) ?? []) {
      if (!nodeIds.has(dep)) continue;

      if (color.get(dep) === 'gray') {
        const cycleStart = path.indexOf(dep);
        return [...path.slice(cycleStart), dep]; // starts and ends with dep
      }

      if (color.get(dep) === 'white') {
        const result = dfs(dep);
        if (result) return result;
      }
    }

    path.pop();
    color.set(node, 'black');
    return null;
  }

  const remaining = [...nodeIds].filter((id) => !processedOrder.includes(id));
  for (const start of remaining) {
    if (color.get(start) === 'white') {
      path.length = 0;
      const result = dfs(start);
      if (result) return result;
    }
  }

  // Fallback (unreachable in a properly cyclic graph)
  return [remaining[0], remaining[1] ?? remaining[0], remaining[0]];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class WorkflowExportService {
  constructor(
    @InjectRepository(NodeMetadataEntity)
    private readonly nodeRepo: EntityRepository<NodeMetadataEntity>,
    private readonly projectService: ProjectService,
    private readonly em: EntityManager,
  ) {}

  async exportWorkflow(projectId: string): Promise<WorkflowExportResponse> {
    // 1. Fetch project — throws NotFoundException on miss (delegated to ProjectService)
    const project = await this.projectService.findOne(projectId);

    // 2. Early return if no workflow data
    if (!project.workflowJson) {
      return emptyExport(projectId, project.name);
    }

    // 3. Fetch active (non-deleted) nodes for the project
    const nodes = await this.nodeRepo.find(
      { project: { id: projectId }, deletedAt: null },
      { orderBy: { createdAt: 'asc' } },
    );

    // 4. Early return if no synced nodes
    if (nodes.length === 0) {
      return emptyExport(projectId, project.name);
    }

    // 5. Parse edges from workflowJson
    const rawEdges = ((project.workflowJson as any).edges ?? []) as Array<{
      sourceNodeId: string;
      targetNodeId: string;
    }>;

    // 6. Build in-scope node ID set
    const nodeIds = new Set(nodes.map((n) => n.nodeId));

    // 7. Build dependency map (incoming deps per node)
    const dependencyMap = buildDependencyMap(nodes, rawEdges, nodeIds);

    // 8. Build nodeMap for status lookups
    const nodeMap = new Map<string, NodeMetadataEntity>();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }

    // 9. Topological sort (Kahn's algorithm)
    const { order, cycle } = kahnSort(nodeIds, dependencyMap);

    // 10. Handle cyclic graph
    if (cycle) {
      throw new UnprocessableEntityException({
        error: 'Cyclic dependency detected',
        cycle,
      });
    }

    // 11. Build export nodes
    const exportNodes: ExportNode[] = nodes.map((n) => {
      const deps = dependencyMap.get(n.nodeId) ?? [];
      const can_execute = deps.every(
        (depId) =>
          // Out-of-scope dep (not in nodeIds) is treated as satisfied
          !nodeIds.has(depId) || nodeMap.get(depId)?.status === 'completed',
      );

      return {
        nodeId: n.nodeId,
        type: n.nodeType,
        requirement: n.requirement,
        prompt: n.prompt ?? null,
        attributes: n.attributes ?? null,
        status: n.status,
        dependencies: deps,
        can_execute,
      };
    });

    // 12. Assemble response
    const executable_now = exportNodes
      .filter((n) => n.can_execute)
      .map((n) => n.nodeId);

    return {
      projectId,
      projectName: project.name,
      exported_at: new Date().toISOString(),
      total_nodes: nodes.length,
      nodes: exportNodes,
      execution_order: order,
      executable_now,
    };
  }
}
