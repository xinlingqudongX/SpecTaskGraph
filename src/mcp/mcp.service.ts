import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ProjectService } from '../project/project.service';
import { NodeService } from '../node/node.service';
import { WorkflowExportService } from '../node/workflow-export.service';
import { NodeStatus } from '../node/entities/node-metadata.entity';

/** 统一工具返回格式 */
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `错误: ${msg}` }], isError: true };
}

@Injectable()
export class McpService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly nodeService: NodeService,
    private readonly workflowExportService: WorkflowExportService,
  ) {}

  /**
   * 每次 HTTP 请求创建一个新的 McpServer（无状态模式）。
   * 使用 `(server as any).tool()` 绕过 MCP SDK 深层泛型导致的 TS2589。
   */
  createServer(): McpServer {
    const server = new McpServer({ name: 'FlowInOne', version: '1.0.0' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = server as any;

    // ── list_projects ────────────────────────────────────────────
    s.tool(
      'list_projects',
      '列出所有项目，返回 id、name、description、updatedAt',
      {},
      async (): Promise<ToolResult> => {
        try {
          const projects = await this.projectService.findAll();
          return ok(
            projects.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description ?? null,
              updatedAt: p.updatedAt,
            })),
          );
        } catch (err) {
          return fail(err);
        }
      },
    );

    // ── get_project ──────────────────────────────────────────────
    s.tool(
      'get_project',
      '根据项目 ID 获取项目完整信息，包含 workflowJson（节点和边）',
      { projectId: z.string().describe('项目 ID') },
      async ({ projectId }: { projectId: string }): Promise<ToolResult> => {
        try {
          const project = await this.projectService.findOne(projectId);
          return ok(project);
        } catch (err) {
          return fail(err);
        }
      },
    );

    // ── get_workflow_export ──────────────────────────────────────
    s.tool(
      'get_workflow_export',
      '导出项目工作流，包含拓扑执行顺序、每个节点的 can_execute 状态，适合 AI 消费',
      { projectId: z.string().describe('项目 ID') },
      async ({ projectId }: { projectId: string }): Promise<ToolResult> => {
        try {
          const data = await this.workflowExportService.exportWorkflow(projectId);
          return ok(data);
        } catch (err) {
          return fail(err);
        }
      },
    );

    // ── update_node_status ───────────────────────────────────────
    s.tool(
      'update_node_status',
      '更新工作流节点的执行状态，自动记录执行历史快照',
      {
        nodeId: z.string().describe('节点 ID'),
        status: z
          .enum(['pending', 'completed', 'failed', 'review_needed'])
          .describe('新状态：pending / completed / failed / review_needed'),
      },
      async ({
        nodeId,
        status,
      }: {
        nodeId: string;
        status: string;
      }): Promise<ToolResult> => {
        try {
          const node = await this.nodeService.updateStatus(nodeId, status as NodeStatus);
          return ok({ nodeId: node.nodeId, status: node.status, updatedAt: node.updatedAt });
        } catch (err) {
          return fail(err);
        }
      },
    );

    // ── get_node_history ─────────────────────────────────────────
    s.tool(
      'get_node_history',
      '获取指定节点的执行历史记录（最近 20 条），包含 requirement/prompt 快照和执行结果',
      { nodeId: z.string().describe('节点 ID') },
      async ({ nodeId }: { nodeId: string }): Promise<ToolResult> => {
        try {
          const history = await this.nodeService.getHistory(nodeId);
          return ok(history);
        } catch (err) {
          return fail(err);
        }
      },
    );

    return server;
  }
}
