import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  ElicitResultSchema,
  McpError,
  ErrorCode,
  type ServerRequest,
  type ServerNotification,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ProjectService } from '../project/project.service';
import { NodeService } from '../node/node.service';
import {
  NodeStatus,
  NodeType,
  NodeMetadataEntity,
} from '../node/entities/node-metadata.entity';
import { aiIdeTaskProtocolPrompt } from './mcp.contain';
import { McpSessionService } from './mcp-session.service';
import { AgentRoleService } from '../agent-role/agent-role.service';
import { AgentRoleEntity } from '../agent-role/entities/agent-role.entity';

/** 统一工具返回格式 */
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type ToolGuidance = {
  usage: string;
  nextStep: string;
};

type McpRequestExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const PENDING_TASK_WAIT_MS = 15_000;
const PENDING_TASK_POLL_MS = 1_000;
const EXECUTOR_STALE_MS = 60_000;

/** 依赖等待最长时间（毫秒），用于 get_pending_tasks 第二级轮询 */
const DEP_WAIT_MAX_MS = 120_000;
/** 依赖等待轮询间隔（毫秒） */
const DEP_WAIT_POLL_MS = 3_000;

const syncWorkflowNodeItemSchema = z.object({
  nodeId: z.string().describe('节点 ID'),
  nodeType: z
    .nativeEnum(NodeType)
    .describe(`节点类型 ${Object.values(NodeType).join(',')}`),
  parentNodeId: z
    .string()
    .nullable()
    .optional()
    .describe('父节点 ID，根节点传 null'),
  sortOrder: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('同级排序值，数值越小越靠前'),
  dependencies: z
    .array(z.string())
    .optional()
    .describe('依赖节点 ID 列表，支持多依赖 DAG；优先级高于 parentNodeId'),
  requirement: z.string().optional().describe('业务视角需求描述'),
  prompt: z.string().optional().describe('技术视角执行提示词'),
  agentRoleId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe('可选：关联的 Agent 角色 ID'),
  attributes: z
    .record(z.unknown())
    .optional()
    .describe('节点自定义属性（键值对对象）'),
});

const registerClientActionSchema = z.object({
  action: z
    .literal('register_client')
    .describe('注册或更新当前 MCP 会话的客户端信息'),
  workspacePath: z.string().describe('当前实际工作区绝对路径'),
  workspaceName: z.string().optional().describe('当前工作区名称'),
  ide: z.string().optional().describe('当前 IDE 或客户端名称'),
  model: z.string().describe('当前实际使用的模型名称'),
  agentName: z.string().describe('当前执行 Agent 名称'),
  extra: z.record(z.string(), z.unknown()).optional().describe('其他扩展信息'),
});

const listProjectsActionSchema = z.object({
  action: z.literal('list_projects').describe('列出全部项目'),
  projectNames: z
    .array(z.string())
    .optional()
    .describe('可选：项目名称关键词列表，按分词模糊筛选'),
});

const getProjectActionSchema = z.object({
  action: z.literal('get_project').describe('获取项目详情'),
  projectId: z.string().describe('项目 ID'),
});

const testElicitationActionSchema = z.object({
  action: z
    .literal('test_elicitation')
    .describe(
      '仅用于测试客户端是否支持 elicitation/create，不参与正式任务流转',
    ),
  elicitationMode: z
    .enum(['form', 'url'])
    .optional()
    .describe('测试模式：form 或 url，默认 form'),
  message: z.string().optional().describe('elicitation 提示消息'),
  url: z.string().optional().describe('url 模式下使用的目标地址'),
});

const projectToolSchema = z.union([
  registerClientActionSchema,
  listProjectsActionSchema,
  getProjectActionSchema,
  testElicitationActionSchema,
]);
type ProjectToolInput = z.infer<typeof projectToolSchema>;

const getPendingTasksActionSchema = z.object({
  action: z.literal('get_pending_tasks').describe('获取当前范围内待处理任务'),
  projectId: z.string().describe('项目 ID'),
  taskNodeId: z.string().describe('当前功能节点 ID（作为局部范围根节点）'),
});

const declareIntentActionSchema = z.object({
  action: z.literal('declare_intent').describe('声明任务执行意图并获取执行权'),
  projectId: z.string().describe('项目 ID'),
  taskId: z.string().describe('任务节点 ID'),
  agentName: z.string().describe('你的AI Agent 名称'),
  intent: z.string().describe('执行计划或当前 todo 声明'),
});

const taskToolSchema = z.union([
  getPendingTasksActionSchema,
  declareIntentActionSchema,
]);
type TaskToolInput = z.infer<typeof taskToolSchema>;

const updateNodeStatusActionSchema = z.object({
  action: z.literal('update_node_status').describe('批量更新节点状态'),
  updates: z
    .array(
      z.object({
        nodeId: z.string().describe('节点 ID'),
        status: z
          .nativeEnum(NodeStatus)
          .describe(`节点状态：${Object.values(NodeStatus).join(', ')}`),
      }),
    )
    .min(1)
    .describe('节点状态更新列表'),
});

const syncWorkflowNodesActionSchema = z.object({
  action: z.literal('sync_workflow_nodes').describe('同步工作流节点结构'),
  projectId: z.string().describe('项目 ID'),
  replaceAll: z.boolean().optional().describe('是否全量替换节点结构'),
  nodes: z.array(syncWorkflowNodeItemSchema).describe('节点列表'),
});

const nodeToolSchema = z.union([
  updateNodeStatusActionSchema,
  syncWorkflowNodesActionSchema,
]);
type NodeToolInput = z.infer<typeof nodeToolSchema>;

const projectToolCompatSchema = z.object({
  action: z
    .enum([
      'register_client',
      'list_projects',
      'get_project',
      'test_elicitation',
    ])
    .optional()
    .describe('项目类动作名称'),
  workspacePath: z
    .string()
    .optional()
    .describe('register_client：当前实际工作区绝对路径'),
  workspaceName: z
    .string()
    .optional()
    .describe('register_client：当前工作区名称'),
  ide: z.string().optional().describe('register_client：当前 IDE 或客户端名称'),
  model: z
    .string()
    .optional()
    .describe('register_client：当前实际使用的模型名称'),
  agentName: z
    .string()
    .optional()
    .describe('register_client：当前执行 Agent 名称'),
  extra: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('register_client：其他扩展信息'),
  projectId: z
    .string()
    .optional()
    .describe(
      '项目 ID',
    ),
  projectNames: z
    .array(z.string())
    .optional()
    .describe('list_projects：项目名称关键词列表，按分词模糊筛选'),
  message: z.string().optional().describe('test_elicitation：提示消息'),
  url: z.string().optional().describe('test_elicitation：url 模式地址'),
});
type ProjectToolCompatInput = z.infer<typeof projectToolCompatSchema>;

const taskToolCompatSchema = z.object({
  action: z
    .enum(['get_pending_tasks', 'declare_intent'])
    .optional()
    .describe('任务类动作名称'),
  projectId: z.string().optional(),
  taskNodeId: z.string().optional(),
  taskId: z.string().optional(),
  agentName: z.string().optional(),
  intent: z.string().optional(),
});
type TaskToolCompatInput = z.infer<typeof taskToolCompatSchema>;

const nodeToolCompatSchema = z.object({
  action: z
    .enum(['update_node_status', 'sync_workflow_nodes'])
    .optional()
    .describe('节点类动作名称'),
  nodeId: z.string().optional(),
  updates: z
    .array(
      z.object({
        nodeId: z.string(),
        status: z.nativeEnum(NodeStatus),
      }),
    )
    .optional(),
  projectId: z.string().optional(),
  replaceAll: z.boolean().optional(),
  nodes: z.array(syncWorkflowNodeItemSchema).optional(),
});
type NodeToolCompatInput = z.infer<typeof nodeToolCompatSchema>;

function unwrapToolInput<T extends Record<string, unknown>>(
  input: T,
): Record<string, unknown> {
  const properties = input.properties;
  if (
    properties &&
    typeof properties === 'object' &&
    !Array.isArray(properties)
  ) {
    return properties as Record<string, unknown>;
  }
  return input;
}

function ok(data: unknown, guidance?: ToolGuidance): ToolResult {
  const payload = guidance ? { data, guidance } : data;
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `错误: ${msg}` }], isError: true };
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  /** 会话元数据：McpServer → { sessionId, clientInfo } */
  private readonly sessionMeta = new WeakMap<
    McpServer,
    {
      sessionId?: string;
      clientInfo?: { name: string; version: string };
      perceptionMode?: string;
    }
  >();

  constructor(
    private readonly projectService: ProjectService,
    private readonly nodeService: NodeService,
    private readonly sessionService: McpSessionService,
    private readonly agentRoleService: AgentRoleService,
  ) {}

  /** controller 在 onsessioninitialized 后调用，补充 sessionId 和 clientInfo 并记录日志 */
  onSessionInitialized(
    server: McpServer,
    sessionId: string,
    clientInfo?: { name: string; version: string },
  ): void {
    const meta = this.sessionMeta.get(server) ?? {};
    meta.sessionId = sessionId;
    meta.clientInfo = clientInfo;
    this.sessionMeta.set(server, meta);
    this.sessionService
      .upsertSession(sessionId, clientInfo)
      .catch((err) =>
        this.logger.warn(
          `Session upsert failed [${sessionId}]: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.logger.log(
      `Session initialized [${sessionId}] handshakeClient=${clientInfo?.name ?? 'unknown'}/${clientInfo?.version ?? '?'} business registration pending`,
    );
  }

  async onSessionClosed(sessionId: string): Promise<void> {
    await this.sessionService.closeSession(sessionId);
  }

  async getRegisteredSession(sessionId: string) {
    return this.sessionService.getSession(sessionId);
  }

  private async ensureTaskNodeInProject(
    projectId: string,
    taskNodeId: string,
  ): Promise<NodeMetadataEntity> {
    const [node] = await this.nodeService.findByNodeIds([taskNodeId]);
    if (!node) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Task node not found: ${taskNodeId}`,
      );
    }
    const nodeProjectId = (node.project as any).id as string;
    if (nodeProjectId !== projectId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `节点 ${taskNodeId} 不属于项目 ${projectId}`,
      );
    }
    return node;
  }

  private resolveSessionId(extra?: {
    sessionId?: string;
    requestInfo?: { headers?: Record<string, string | string[] | undefined> };
  }): string | undefined {
    if (extra?.sessionId) {
      return extra.sessionId;
    }
    const header = extra?.requestInfo?.headers?.['mcp-session-id'];
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  }

  private async ensureTaskInScope(
    projectId: string,
    scopeRootId: string,
    taskId: string,
  ): Promise<void> {
    await this.ensureTaskNodeInProject(projectId, scopeRootId);
    const subtree = await this.nodeService.findSubtreeNodes(scopeRootId);
    const allowed = new Set(subtree.map((n) => n.nodeId));
    if (!allowed.has(taskId)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Task "${taskId}" not in current scope (${scopeRootId})`,
      );
    }
  }

  private async buildSessionProgress(
    projectId: string,
    scopeRootId?: string,
  ): Promise<
    Array<{
      sessionId: string;
      agentName: string;
      clientName: string;
      ide: string;
      model: string;
      lastSeenAt: Date;
      nodes: Array<{
        nodeId: string;
        status: NodeStatus;
        intent: string;
      }>;
      message: string;
    }>
  > {
    const sessions = await this.sessionService.listActiveSessions(projectId);
    const nodes = scopeRootId
      ? await this.nodeService.findSubtreeNodes(scopeRootId)
      : await this.nodeService.findByProject(projectId);
    return sessions.map((s) => {
      const ownedNodes = nodes
        .filter((n) => n.executorSessionId === s.sessionId)
        .map((n) => ({
          nodeId: n.nodeId,
          status: n.status,
          intent: n.executorTodo ?? '',
        }));
      const message =
        ownedNodes.length > 0
          ? `会话 ${s.sessionId} 正在执行 ${ownedNodes
              .map((n) => `${n.nodeId}(${n.intent || '无意图'})`)
              .join(', ')}`
          : `会话 ${s.sessionId} 暂无执行中的节点`;
      return {
        sessionId: s.sessionId,
        agentName: s.agentName,
        clientName: s.clientName,
        ide: s.ide,
        model: s.model,
        lastSeenAt: s.lastSeenAt,
        nodes: ownedNodes,
        message,
      };
    });
  }

  private async buildAgentRoleMap(
    nodes: Array<Pick<NodeMetadataEntity, 'agentRoleId'>>,
  ): Promise<Map<string, AgentRoleEntity>> {
    const roleIds = [
      ...new Set(
        nodes
          .map((node) => node.agentRoleId)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    ];
    const roles = await this.agentRoleService.findByIds(roleIds);
    return new Map(roles.map((role) => [role.id, role]));
  }

  private async touchSessionHeartbeat(sessionId?: string): Promise<void> {
    if (!sessionId) {
      return;
    }
    await this.sessionService.touchSession(sessionId);
  }

  private toAgentRolePayload(
    role?: AgentRoleEntity | null,
  ): { id: string; name: string; description: string; prompt: string } | null {
    if (!role) {
      return null;
    }
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      prompt: role.prompt,
    };
  }

  private buildRolePromptSection(role?: AgentRoleEntity | null): string {
    if (!role) {
      return '';
    }
    return `\n\n# Agent Role\n当前节点已绑定执行角色，请严格按该角色职责完成任务。\n- 角色名称：${role.name}\n- 角色简介：${role.description || '无'}\n- 角色提示词：${role.prompt || '无'}\n`;
  }

  /**
   * 将 pending/review_needed 任务按依赖状态分类
   * - ready: 无依赖或所有依赖已 completed，可以被 Agent 立即执行
   * - blocked: 存在未完成的依赖，需要等待
   */
  private async classifyTasksByDependency(
    tasks: NodeMetadataEntity[],
  ): Promise<{
    ready: NodeMetadataEntity[];
    blocked: Array<{
      node: NodeMetadataEntity;
      blockingDependencies: Array<{ nodeId: string; status: NodeStatus | 'missing' }>;
    }>;
  }> {
    // 收集所有任务的依赖 ID
    const allDepIds = [
      ...new Set(tasks.flatMap((t) => t.dependencies ?? [])),
    ];
    // 批量查询依赖节点
    const depNodes =
      allDepIds.length > 0
        ? await this.nodeService.findByNodeIds(allDepIds)
        : [];
    const depMap = new Map(depNodes.map((n) => [n.nodeId, n]));

    const ready: NodeMetadataEntity[] = [];
    const blocked: Array<{
      node: NodeMetadataEntity;
      blockingDependencies: Array<{ nodeId: string; status: NodeStatus | 'missing' }>;
    }> = [];

    for (const task of tasks) {
      const deps = task.dependencies ?? [];
      if (deps.length === 0) {
        ready.push(task);
        continue;
      }
      const unmet = deps
        .map((depId) => {
          const dep = depMap.get(depId);
          if (dep && dep.status === NodeStatus.Completed) {
            return null;
          }
          return { nodeId: depId, status: (dep?.status ?? 'missing') as NodeStatus | 'missing' };
        })
        .filter(
          (d): d is { nodeId: string; status: NodeStatus | 'missing' } =>
            d !== null,
        );
      if (unmet.length === 0) {
        ready.push(task);
      } else {
        blocked.push({ node: task, blockingDependencies: unmet });
      }
    }
    return { ready, blocked };
  }

  createServer(): McpServer {
    const server = new McpServer(
      { name: 'Mcp', version: '1.0.0', title: '', description: '' },
      {
        instructions: aiIdeTaskProtocolPrompt,
        capabilities: {
          logging: {},
          prompts: { listChanged: true },
          //   resources: { listChanged: true, subscribe: true },
          tools: { listChanged: true },
        },
      },
    );
    // 直接复用实例方法，工具入参类型由独立 schema 常量和 z.infer 提供
    const registerTool = server.registerTool.bind(server);
    // const registerPrompt = server.registerPrompt.bind(server);
    const projectToolHandler = async (
      input: ProjectToolCompatInput,
      extra: McpRequestExtra,
    ): Promise<ToolResult> => {
      try {
        const normalized = projectToolSchema.parse(
          unwrapToolInput(input as Record<string, unknown>),
        );
        const sessionId = this.resolveSessionId(extra);
        await this.touchSessionHeartbeat(sessionId);
        switch (normalized.action) {
          case 'register_client': {
            const params = registerClientActionSchema.parse(normalized);
            if (!sessionId) {
              throw new Error('缺少 sessionId，无法注册客户端');
            }
            this.logger.log(`MCP client register: ${JSON.stringify(input)}`);
            const clientInfo = this.sessionMeta.get(server)?.clientInfo;
            const session = await this.sessionService.registerClient(
              sessionId,
              clientInfo,
              {
                workspacePath: params.workspacePath,
                ide: params.ide,
                model: params.model,
                agentName: params.agentName,
                extra: params.extra,
              },
            );
            return ok(
              {
                registered: true,
                sessionId: session.sessionId,
                storedFields: {
                  autoFromSession: {
                    sessionId: session.sessionId,
                    clientName: session.clientName,
                    clientVersion: session.clientVersion,
                    status: session.status,
                  },
                  submittedByTool: {
                    ide: session.ide,
                    model: session.model,
                    agentName: session.agentName,
                    workspacePath: session.workspacePath,
                    extra: session.extra ?? {},
                  },
                },
              },
              {
                usage:
                  '项目工具的 register_client 动作用于第二阶段业务注册补全；握手阶段只自动登记 sessionId、clientName、clientVersion',
                nextStep:
                  '调用 task_tool，action=get_pending_tasks，并传入 projectId 与 taskNodeId 获取任务范围',
              },
            );
          }
          case 'list_projects': {
            const params = listProjectsActionSchema.parse(normalized);
            const projects = await this.projectService.findAll(
              params.projectNames,
            );
            return ok(
              projects.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description ?? null,
                updatedAt: p.updatedAt,
              })),
              {
                usage:
                  '项目工具用于项目级动作；list_projects 可列出全部项目，也可按 projectNames 关键词列表进行模糊筛选',
                nextStep:
                  '调用 project_tool，action=get_project 查看项目详情，或调用 task_tool，action=get_pending_tasks 获取任务',
              },
            );
          }
          case 'get_project': {
            const params = getProjectActionSchema.parse(normalized);
            return ok(await this.projectService.findOne(params.projectId), {
              usage: '项目工具的 get_project 用于读取项目详情',
              nextStep:
                '调用 task_tool，action=get_pending_tasks，并传入 projectId 与 taskNodeId 获取局部任务',
            });
          }
          case 'test_elicitation': {
            const params = testElicitationActionSchema.parse(normalized);
            const mode = params.elicitationMode ?? 'form';
            const message =
              params.message ?? 'MCP elicitation support test from server.';

            this.logger.log(
              `[mcp-elicitation-test] session=${sessionId ?? 'unknown'} mode=${mode}`,
            );

            const result = await extra.sendRequest(
              mode === 'url'
                ? ({
                    method: 'elicitation/create',
                    params: {
                      mode: 'url',
                      message,
                      elicitationId: `mcp-test-${Date.now()}`,
                      url:
                        params.url ??
                        'https://modelcontextprotocol.io/docs/learn/architecture',
                    },
                  } as ServerRequest)
                : ({
                    method: 'elicitation/create',
                    params: {
                      mode: 'form',
                      message,
                      requestedSchema: {
                        type: 'object',
                        properties: {
                          acknowledged: {
                            type: 'boolean',
                            title: 'Acknowledge',
                            description:
                              'Confirm the client received the elicitation request',
                            default: true,
                          },
                          note: {
                            type: 'string',
                            title: 'Optional Note',
                            description:
                              'Optional note for MCP elicitation test',
                          },
                        },
                        required: ['acknowledged'],
                      },
                    },
                  } as ServerRequest),
              ElicitResultSchema,
            );

            return ok(
              {
                supported: true,
                mode,
                result,
              },
              {
                usage:
                  '项目工具的 test_elicitation 仅用于验证客户端是否支持 elicitation/create（form/url），不参与正式任务协作流程',
                nextStep:
                  '无论测试结果如何，正式任务仍应通过 get_pending_tasks、declare_intent 和 node_tool 完成协作',
              },
            );
          }
        }
      } catch (err) {
        return fail(err);
      }
    };

    const taskToolHandler = async (
      input: TaskToolCompatInput,
      extra: McpRequestExtra,
    ): Promise<ToolResult> => {
      try {
        const normalized = taskToolSchema.parse(
          unwrapToolInput(input as Record<string, unknown>),
        );
        const sessionId = this.resolveSessionId(extra);
        await this.touchSessionHeartbeat(sessionId);
        switch (normalized.action) {
          case 'get_pending_tasks': {
            const params = getPendingTasksActionSchema.parse(normalized);
            await this.ensureTaskNodeInProject(params.projectId, params.taskNodeId);
            if (sessionId) {
              await this.sessionService.confirmScope(
                sessionId,
                params.projectId,
                params.taskNodeId,
              );
            }

            // ── 第一级轮询：等待 pending 任务出现 ──
            let waitedMs = 0;
            let delayed = false;
            let nodes = await this.nodeService.findSubtreeNodes(params.taskNodeId);
            let tasks = nodes.filter(
              (n) =>
                n.status === NodeStatus.Pending ||
                n.status === NodeStatus.ReviewNeeded,
            );
            while (tasks.length === 0 && waitedMs < PENDING_TASK_WAIT_MS) {
              delayed = true;
              await new Promise((resolve) =>
                setTimeout(resolve, PENDING_TASK_POLL_MS),
              );
              waitedMs += PENDING_TASK_POLL_MS;
              if (sessionId) {
                await this.touchSessionHeartbeat(sessionId);
              }
              nodes = await this.nodeService.findSubtreeNodes(params.taskNodeId);
              tasks = nodes.filter(
                (n) =>
                  n.status === NodeStatus.Pending ||
                  n.status === NodeStatus.ReviewNeeded,
              );
            }

            // ── 对 pending 任务进行依赖分类 ──
            let classified = await this.classifyTasksByDependency(tasks);

            // ── 第二级轮询：当 ready 为空但 blocked 不为空时，等待依赖完成 ──
            let depWaitedMs = 0;
            while (
              classified.ready.length === 0 &&
              classified.blocked.length > 0 &&
              depWaitedMs < DEP_WAIT_MAX_MS
            ) {
              delayed = true;
              await new Promise((resolve) =>
                setTimeout(resolve, DEP_WAIT_POLL_MS),
              );
              depWaitedMs += DEP_WAIT_POLL_MS;
              waitedMs += DEP_WAIT_POLL_MS;
              if (sessionId) {
                await this.touchSessionHeartbeat(sessionId);
              }
              // 重新获取子树节点并过滤 pending 任务
              nodes = await this.nodeService.findSubtreeNodes(params.taskNodeId);
              tasks = nodes.filter(
                (n) =>
                  n.status === NodeStatus.Pending ||
                  n.status === NodeStatus.ReviewNeeded,
              );
              classified = await this.classifyTasksByDependency(tasks);
            }

            const roleMap = await this.buildAgentRoleMap(nodes);
            const sessionProgress = await this.buildSessionProgress(
              params.projectId,
              params.taskNodeId,
            );

            // 构建可执行任务列表（仅 ready 的任务）
            const taskPayload = classified.ready.map((n) => ({
              nodeId: n.nodeId,
              nodeType: n.nodeType,
              status: n.status,
              requirement: n.requirement,
              prompt: n.prompt,
              dependencies: n.dependencies ?? [],
              agentRoleId: n.agentRoleId ?? null,
              agentRole: this.toAgentRolePayload(
                n.agentRoleId ? roleMap.get(n.agentRoleId) : null,
              ),
              rolePrompt:
                (n.agentRoleId ? roleMap.get(n.agentRoleId)?.prompt : null) ??
                null,
              parentNodeId: n.parentNodeId ?? null,
            }));

            // 构建被依赖阻塞的任务列表
            const blockedTaskPayload = classified.blocked.map((b) => ({
              nodeId: b.node.nodeId,
              nodeType: b.node.nodeType,
              status: b.node.status,
              requirement: b.node.requirement,
              dependencies: b.node.dependencies ?? [],
              blockingDependencies: b.blockingDependencies,
              parentNodeId: b.node.parentNodeId ?? null,
            }));

            const hasBlocked = blockedTaskPayload.length > 0;
            const depTimedOut =
              hasBlocked &&
              classified.ready.length === 0 &&
              depWaitedMs >= DEP_WAIT_MAX_MS;

            // 为包含角色的可执行任务生成强制执行指令
            const roleInstructions = taskPayload
              .filter((t) => t.rolePrompt)
              .map((t) => ({
                nodeId: t.nodeId,
                roleName: t.agentRole?.name ?? '未命名角色',
                instruction: `【强制】执行节点 ${t.nodeId} 时，你必须以「${t.agentRole?.name ?? '指定角色'}」的身份完成任务。角色要求如下：\n${t.rolePrompt}\n你的所有实现决策、代码风格、接口设计都必须遵守以上角色提示词的约束。`,
              }));

            const hasRoleTask = roleInstructions.length > 0;

            return ok(
              {
                tasks: taskPayload,
                blockedTasks: blockedTaskPayload,
                roleInstructions,
                delayed,
                waitedMs,
                depWaitedMs,
                depTimedOut,
                sessionProgress,
                communication: sessionProgress.map((s) => s.message),
              },
              {
                usage:
                  '任务工具的 get_pending_tasks 用于获取当前范围内待办任务；服务端自动区分可执行任务（tasks）和被依赖阻塞的任务（blockedTasks）；若全部任务被阻塞，服务端会长轮询等待依赖完成后再返回',
                nextStep: depTimedOut
                  ? 'tasks 为空且等待超时，所有任务仍被依赖阻塞；请稍后重新调用 get_pending_tasks 继续等待'
                  : taskPayload.length > 0
                    ? hasRoleTask
                      ? '【重要】部分任务绑定了角色提示词（见 roleInstructions），执行这些任务时必须严格遵守角色提示词中的全部约束；选择任务后调用 task_tool，action=declare_intent 声明执行计划'
                      : '选择一个待办节点后调用 task_tool，action=declare_intent 声明执行计划'
                    : '当前无可执行任务，请稍后重新调用 get_pending_tasks',
              },
            );
          }
          case 'declare_intent': {
            const params = declareIntentActionSchema.parse(normalized);
            const node = await this.ensureTaskNodeInProject(
              params.projectId,
              params.taskId,
            );
            const role = node.agentRoleId
              ? await this.agentRoleService.findById(node.agentRoleId)
              : null;
            const dependencyIds = node.dependencies ?? [];
            if (dependencyIds.length > 0) {
              const dependencyNodes = await this.nodeService.findByNodeIds(dependencyIds);
              const dependencyMap = new Map(
                dependencyNodes.map((dependencyNode) => [
                  dependencyNode.nodeId,
                  dependencyNode,
                ]),
              );
              const blockedDependencies = dependencyIds
                .map((dependencyId) => {
                  const dependencyNode = dependencyMap.get(dependencyId);
                  if (
                    dependencyNode &&
                    dependencyNode.status === NodeStatus.Completed
                  ) {
                    return null;
                  }
                  return {
                    nodeId: dependencyNode?.nodeId ?? dependencyId,
                    status: (dependencyNode?.status ?? 'missing') as NodeStatus | 'missing',
                  };
                })
                .filter(
                  (
                    dependency,
                  ): dependency is { nodeId: string; status: NodeStatus | 'missing' } =>
                    dependency !== null,
                );
              if (blockedDependencies.length > 0) {
                // 返回结构化阻塞信息而非抛出异常，引导 Agent 正确等待
                return ok(
                  {
                    blocked: true,
                    taskId: params.taskId,
                    blockingDependencies: blockedDependencies,
                    message: `存在未完成依赖，无法声明执行：${blockedDependencies
                      .map((d) => `${d.nodeId}(${d.status})`)
                      .join(', ')}`,
                  },
                  {
                    usage:
                      'declare_intent 在依赖未满足时返回 blocked 信息，不视为错误',
                    nextStep:
                      '请重新调用 task_tool，action=get_pending_tasks 等待依赖完成后再重试 declare_intent；服务端会自动长轮询直到有可执行任务',
                  },
                );
              }
            }
            let takeoverOf: string | null = null;
            if (
              node.executorSessionId &&
              node.executorSessionId !== sessionId
            ) {
              const alive = await this.sessionService.isSessionAlive(
                node.executorSessionId,
                EXECUTOR_STALE_MS,
              );
              if (alive) {
                throw new Error(
                  `节点已被活跃会话 ${node.executorSessionId} 锁定，当前执行者=${node.executorAgentName ?? ''}`,
                );
              }
              takeoverOf = node.executorSessionId;
            }
            const { node: lockedNode, takenOver } =
              await this.nodeService.claimExecutor(
                params.taskId,
                sessionId ?? '',
                params.agentName,
                params.intent,
                takeoverOf ? { takeoverSessionId: takeoverOf } : undefined,
              );
            if (lockedNode.status !== NodeStatus.InProgress) {
              await this.nodeService.updateStatus(
                params.taskId,
                NodeStatus.InProgress,
              );
            }
            return ok(
              {
                taskId: lockedNode.nodeId,
                nodeStatus: NodeStatus.InProgress,
                executorSessionId: lockedNode.executorSessionId ?? null,
                executorAgentName: lockedNode.executorAgentName ?? '',
                executorTodo: lockedNode.executorTodo ?? null,
                agentRoleId: node.agentRoleId ?? null,
                agentRole: this.toAgentRolePayload(role),
                rolePrompt: role?.prompt ?? null,
                roleInstruction: role
                  ? `【强制执行指令】你现在必须以「${role.name}」的身份执行此任务。以下是你的角色约束，所有实现决策必须遵守：\n${role.prompt}`
                  : null,
                takenOver,
                takeoverOf,
                message: takenOver
                  ? `意图已登记，已接管僵尸锁 ${takeoverOf}，节点切换为 in_progress`
                  : '意图已登记，节点已锁定并切换为 in_progress',
              },
              {
                usage: '任务工具的 declare_intent 用于锁定当前任务执行权',
                nextStep: role
                  ? `【必须遵守】节点已绑定角色「${role.name}」，你的全部实现必须严格遵守 roleInstruction 字段中的角色提示词约束；开始实现任务，完成后通过 node_tool 更新节点状态`
                  : '开始实现任务；完成后通过 node_tool 更新节点状态，并按需写入节点历史',
              },
            );
          }
        }
      } catch (err) {
        return fail(err);
      }
    };

    const nodeToolHandler = async (
      input: NodeToolCompatInput,
      extra: McpRequestExtra,
    ): Promise<ToolResult> => {
      try {
        const normalized = nodeToolSchema.parse(
          unwrapToolInput(input as Record<string, unknown>),
        );
        const sessionId = this.resolveSessionId(extra);
        await this.touchSessionHeartbeat(sessionId);
        switch (normalized.action) {
          case 'update_node_status': {
            const params = updateNodeStatusActionSchema.parse(normalized);
            const nodeIds = params.updates.map((u) => u.nodeId);
            const updatedNodes = await this.nodeService.batchUpdateStatus(
              params.updates.map((u) => ({
                nodeId: u.nodeId,
                status: u.status as NodeStatus,
              })),
            );
            return ok(
              updatedNodes.map((node) => ({
                nodeId: node.nodeId,
                status: node.status,
                updatedAt: node.updatedAt,
              })),
              {
                usage: '节点工具的 update_node_status 用于批量更新节点状态',
                nextStep: '如需继续工作，回到 task_tool 获取下一待办',
              },
            );
          }
          case 'sync_workflow_nodes': {
            const params = syncWorkflowNodesActionSchema.parse(normalized);
            const existingSubmittedNodes = await this.nodeService.findByNodeIds(
              params.nodes.map((node) => node.nodeId),
            );
            const existingSubmittedNodeMap = new Map(
              existingSubmittedNodes.map((node) => [node.nodeId, node]),
            );
            const parentNodeIds = [
              ...new Set(
                params.nodes
                  .map(
                    (node) =>
                      node.parentNodeId ??
                      existingSubmittedNodeMap.get(node.nodeId)?.parentNodeId ??
                      null,
                  )
                  .filter((nodeId): nodeId is string => Boolean(nodeId)),
              ),
            ];
            const parentNodes = parentNodeIds.length
              ? await this.nodeService.findByNodeIds(parentNodeIds)
              : [];
            const parentRoleMap = await this.buildAgentRoleMap(parentNodes);
            const roleConstraints = parentNodes
              .filter((parentNode) => parentNode.agentRoleId)
              .map((parentNode) => {
                const role = parentRoleMap.get(parentNode.agentRoleId!);
                return {
                  nodeId: parentNode.nodeId,
                  roleName: role?.name ?? null,
                  rolePrompt: role?.prompt ?? null,
                };
              });
            await this.nodeService.sync(
              params.projectId,
              params.nodes.map((n) => ({
                nodeId: n.nodeId,
                nodeType: n.nodeType,
                ...(Object.prototype.hasOwnProperty.call(n, 'parentNodeId')
                  ? { parentNodeId: n.parentNodeId ?? null }
                  : {}),
                ...(Object.prototype.hasOwnProperty.call(n, 'sortOrder')
                  ? { sortOrder: n.sortOrder ?? 0 }
                  : {}),
                dependencies: n.dependencies,
                ...(Object.prototype.hasOwnProperty.call(n, 'agentRoleId')
                  ? { agentRoleId: n.agentRoleId ?? null }
                  : {}),
                attributes: n.attributes,
                requirement: n.requirement,
                prompt: n.prompt,
              })),
              { replaceAll: params.replaceAll ?? false },
            );
            return ok(
              {
                synced: true,
                nodeCount: params.nodes.length,
                roleConstraints,
              },
              {
                usage:
                  '节点工具的 sync_workflow_nodes 用于同步节点结构；若父节点已配置角色，拆分子节点时必须遵守该角色提示词',
                nextStep:
                  roleConstraints.length > 0
                    ? '已返回父节点角色提示词，继续补齐子节点 requirement/prompt/dependencies/sortOrder 时必须体现这些角色约束'
                    : '必要时调用 node_tool，action=update_node_status 更新执行状态',
              },
            );
          }
        }
      } catch (err) {
        return fail(err);
      }
    };

    // 提示词没有太大作用了
    // // ── prompt：节点执行提示词 ────────────────────────────────────────
    // registerPrompt(
    //   'start_task',
    //   {
    //     title: '开启任务执行提示词',
    //     description:
    //       '开始执行任务，需要项目名称和功能节点ID',
    //     argsSchema: {
    //       nodeId: z.string().describe('需要执行的节点 ID'),
    //       projectName: z.string().describe('项目名称'),
    //     },
    //   },
    //   async ({ nodeId }) => {
    //     const [node] = await this.nodeService.findByNodeIds([nodeId]);
    //     const role = node?.agentRoleId
    //       ? await this.agentRoleService.findById(node.agentRoleId)
    //       : null;
    //     return {
    //       messages: [
    //         {
    //           role: 'user',
    //           content: {
    //             type: 'text',
    //             text:
    //               toolPrompt
    //                 .replace(/\{\{\s*nodeId\s*\}\}/g, nodeId)
    //                 .replace(/\{nodeId\}/g, nodeId) +
    //               this.buildRolePromptSection(role),
    //           },
    //         },
    //       ],
    //     };
    //   },
    // );

    // // ── prompt：AI IDE 联动指南 ─────────────────────────────────────
    // registerPrompt(
    //   'ai_ide_tasks_guide',
    //   {
    //     title: 'AI IDE 联动指南',
    //     description: '说明 MCP Tasks 协议与工具如何联动完成任务闭环',
    //   },
    //   () => ({
    //     messages: [
    //       {
    //         role: 'user',
    //         content: { type: 'text', text: aiIdeTaskProtocolPrompt },
    //       },
    //     ],
    //   }),
    // );

    registerTool(
      'project_tool',
      {
        description:
          `项目类统一工具。通过 action 参数执行 register_client、list_projects、get_project、test_elicitation。其中 test_elicitation 仅用于能力测试，不参与正式任务流转。`,
        inputSchema: projectToolCompatSchema,
      },
      projectToolHandler,
    );

    // ── 资源相关能力已移除（AI IDE 不支持） ────────────────────────
    this.sessionMeta.set(server, {});

    registerTool(
      'task_tool',
      {
        description:
          '任务类统一工具。通过 action 参数执行 get_pending_tasks、declare_intent。',
        inputSchema: taskToolCompatSchema,
      },
      taskToolHandler,
    );

    registerTool(
      'node_tool',
      {
        description:
          '节点类统一工具。通过 action 参数执行 update_node_status、sync_workflow_nodes。',
        inputSchema: nodeToolCompatSchema,
      },
      nodeToolHandler,
    );

    return server;
  }
}
