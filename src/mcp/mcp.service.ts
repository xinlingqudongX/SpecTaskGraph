import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ProjectService } from '../project/project.service';
import { NodeService } from '../node/node.service';
import { WorkflowExportService } from '../node/workflow-export.service';
import { NodeStatus } from '../node/entities/node-metadata.entity';

@Injectable()
export class McpService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly nodeService: NodeService,
    private readonly workflowExportService: WorkflowExportService,
  ) {}

  /**
   * 每次请求创建一个新的 McpServer 实例（无状态模式）。
   * 工具闭包捕获注入的 Service，保持对数据库的访问能力。
   */
  createServer(): McpServer {
    const server = new McpServer({
      name: 'FlowInOne',
      version: '1.0.0',
    });

    // ── 工具：列出所有项目 ───────────────────────────────────────
    server.tool(
      'list_projects',
      '列出所有项目，返回 id、name、description、updatedAt',
      {},
      async () => {
        try {
          const projects = await this.projectService.findAll();
          const result = projects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? null,
            updatedAt: p.updatedAt,
          }));
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `错误: ${err.message}` }], isError: true };
        }
      },
    );

    // ── 工具：获取项目详情（含工作流图） ────────────────────────
    server.tool(
      'get_project',
      '根据项目 ID 获取项目完整信息，包含 workflowJson（节点和边）',
      { projectId: z.string().describe('项目 ID') },
      async ({ projectId }) => {
        try {
          const project = await this.projectService.findOne(projectId);
          return { content: [{ type: 'text' as const, text: JSON.stringify(project, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `错误: ${err.message}` }], isError: true };
        }
      },
    );

    // ── 工具：导出工作流（拓扑排序 + 可执行分析） ────────────────
    server.tool(
      'get_workflow_export',
      '导出项目工作流，包含拓扑执行顺序、每个节点的 can_execute 状态，适合 AI 消费',
      { projectId: z.string().describe('项目 ID') },
      async ({ projectId }) => {
        try {
          const data = await this.workflowExportService.exportWorkflow(projectId);
          return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `错误: ${err.message}` }], isError: true };
        }
      },
    );

    // ── 工具：更新节点状态 ────────────────────────────────────────
    server.tool(
      'update_node_status',
      '更新工作流节点的执行状态，并自动记录执行历史快照',
      {
        nodeId: z.string().describe('节点 ID'),
        status: z
          .enum(['pending', 'completed', 'failed', 'review_needed'])
          .describe('新状态：pending（待执行）/ completed（完成）/ failed（失败）/ review_needed（待审查）'),
      },
      async ({ nodeId, status }) => {
        try {
          const node = await this.nodeService.updateStatus(nodeId, status as NodeStatus);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ nodeId: node.nodeId, status: node.status, updatedAt: node.updatedAt }, null, 2),
              },
            ],
          };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `错误: ${err.message}` }], isError: true };
        }
      },
    );

    // ── 工具：获取节点执行历史 ────────────────────────────────────
    server.tool(
      'get_node_history',
      '获取指定节点的执行历史记录（最近 20 条），包含 requirement/prompt 快照和执行结果',
      { nodeId: z.string().describe('节点 ID') },
      async ({ nodeId }) => {
        try {
          const history = await this.nodeService.getHistory(nodeId);
          return { content: [{ type: 'text' as const, text: JSON.stringify(history, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: 'text' as const, text: `错误: ${err.message}` }], isError: true };
        }
      },
    );

    return server;
  }
}
