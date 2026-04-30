import {
  All,
  Controller,
  Logger,
  OnModuleInit,
  Req,
  Res,
} from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { McpService } from './mcp.service';

/**
 * MCP HTTP 端点（Streamable HTTP 传输）
 *
 * 架构说明：
 *  - 所有请求统一进入 transport.handleRequest()，由 transport 负责 session 路由
 *
 * 客户端配置（Claude Desktop / Kiro 等）：
 *   { "url": "http://localhost:8000/api/v1/mcp", "type": "streamable-http" }
 */
@Controller('mcp')
export class McpController implements OnModuleInit {
  private readonly logger = new Logger(McpController.name);
  private readonly sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: McpServer }
  >();
  private readonly sseTestedSessions = new Set<string>();

  constructor(private readonly mcpService: McpService) {}

  async onModuleInit() {
    this.logger.log('MCP server ready');
  }

  private getSessionId(req: FastifyRequest): string | undefined {
    const header = req.headers['mcp-session-id'];
    if (Array.isArray(header)) return header[0];
    return header;
  }

  private getParsedBody(req: FastifyRequest): unknown {
    const body = req.body;
    if (typeof body === 'string' && body.length > 0) {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }

  private logRequest(
    sessionId: string | undefined,
    parsedBody: unknown,
    isInit: boolean,
  ): void {
    const body = parsedBody as any;
    const method: string = body?.method ?? '(unknown)';
    const params = body?.params;

    if (isInit) {
      const clientInfo = params?.clientInfo;
      const capabilities = params?.capabilities;
      this.logger.log(
        `[init] session=new method=${method} client=${clientInfo?.name ?? '?'}/${clientInfo?.version ?? '?'} capabilities=${JSON.stringify(capabilities ?? {})}`,
      );
      return;
    }

    const sid = sessionId ?? 'stateless';
    // 对 params 做精简输出：截断大字段防止日志爆炸
    const summary = params ? JSON.stringify(params).slice(0, 200) : '';
    this.logger.debug(
      `[req] session=${sid} method=${method} params=${summary}`,
    );
  }

  private async createStatefulSession(
    clientInfo?: { name: string; version: string },
  ): Promise<{
    transport: StreamableHTTPServerTransport;
    server: McpServer;
  }> {
    const server = this.mcpService.createServer();
    let transport!: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        this.sessions.set(id, { transport, server });
        this.mcpService.onSessionInitialized(server, id, clientInfo);
      },
      onsessionclosed: (id) => {
        this.sessions.delete(id);
        this.mcpService
          .onSessionClosed(id)
          .catch((err) =>
            this.logger.warn(
              `Session close failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        this.logger.log(`Session closed: ${id}`);
      },
    });
    await server.connect(transport);
    return { transport, server };
  }

  private async recoverSession(
    sessionId: string,
  ): Promise<
    | { transport: StreamableHTTPServerTransport; server: McpServer }
    | undefined
  > {
    const session = await this.mcpService.getRegisteredSession(sessionId);
    if (!session) {
      return undefined;
    }

    const server = this.mcpService.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessionclosed: (id) => {
        this.sessions.delete(id);
        this.mcpService
          .onSessionClosed(id)
          .catch((err) =>
            this.logger.warn(
              `Session close failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        this.logger.log(`Session closed: ${id}`);
      },
    });
    await server.connect(transport);

    const innerTransport = (transport as any)._webStandardTransport;
    innerTransport.sessionId = sessionId;
    innerTransport._initialized = true;

    this.sessions.set(sessionId, { transport, server });
    this.mcpService.onSessionInitialized(server, sessionId, {
      name: session.clientName,
      version: session.clientVersion,
    });
    this.logger.warn(`Recovered MCP session from persistence: ${sessionId}`);
    return { transport, server };
  }

  private triggerSseTestRequest(sessionId: string): void {
    if (this.sseTestedSessions.has(sessionId)) {
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.sseTestedSessions.add(sessionId);
    setTimeout(() => {
      void session.server.server
        .ping()
        .then((result) => {
          this.logger.log(
            `[sse-test] session=${sessionId} ping request acknowledged: ${JSON.stringify(result ?? {})}`,
          );
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `[sse-test] session=${sessionId} ping request failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }, 300);
  }

  @All()
  async handleMcp(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.logger.log(`Received MCP request: ${req.method} ${req.url}`);
    if (!req.headers.accept) {
      req.headers.accept = 'application/json, text/event-stream';
    }
    reply.hijack();
    try {
      const sessionId = this.getSessionId(req);
      const parsedBody = this.getParsedBody(req);
      const isInit = isInitializeRequest(parsedBody);

      this.logRequest(sessionId, parsedBody, isInit);
      if (req.method === 'GET') {
        this.logger.log(
          `[sse] session=${sessionId ?? 'stateless'} accept=${req.headers.accept ?? ''} opening streamable-http GET stream`,
        );
      }

      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId && this.sessions.has(sessionId)) {
        transport = this.sessions.get(sessionId)?.transport;
      } else if (!sessionId && isInit) {
        const clientInfo = (parsedBody as any)?.params?.clientInfo;
        const created = await this.createStatefulSession(clientInfo);
        transport = created.transport;
      } else {
        if (sessionId) {
          const recovered = await this.recoverSession(sessionId);
          if (recovered) {
            transport = recovered.transport;
          }
        }

        if (transport) {
          await transport.handleRequest(req.raw, reply.raw, parsedBody);
          return;
        }

        reply.raw.writeHead(400, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message:
                sessionId && !this.sessions.has(sessionId)
                  ? `Unknown mcp-session-id: ${sessionId}. Please re-initialize the MCP session.`
                  : 'Missing mcp-session-id. Initialize first and reuse the returned MCP session header on all subsequent requests.',
            },
            id: (parsedBody as any)?.id ?? null,
          }),
        );
        return;
      }

      await transport?.handleRequest(req.raw, reply.raw, parsedBody);
      if (req.method === 'GET' && sessionId) {
        this.triggerSseTestRequest(sessionId);
      }
    } catch (err) {
      this.logger.error('MCP request failed', err);
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  }
}
