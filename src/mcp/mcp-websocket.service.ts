import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Server as HttpServer, IncomingMessage } from 'http';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { McpService } from './mcp.service';
import { McpWebSocketTransport } from './mcp-websocket.transport';

/**
 * MCP WebSocket 自定义传输入口。
 * 官方兼容基线仍是 Streamable HTTP，此处仅提供并行实验端点。
 */
@Injectable()
export class McpWebSocketService implements OnModuleDestroy {
  private readonly logger = new Logger(McpWebSocketService.name);
  private server?: WebSocketServer;
  private readonly sessions = new Map<
    string,
    {
      socket: WebSocket;
      transport: McpWebSocketTransport;
      server: ReturnType<McpService['createServer']>;
    }
  >();

  constructor(private readonly mcpService: McpService) {}

  attach(httpServer: HttpServer): void {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({
      server: httpServer,
      path: '/api/v1/mcp/ws',
      handleProtocols: (protocols) => (protocols.has('mcp') ? 'mcp' : false),
    });

    this.server.on('connection', (socket, request) => {
      void this.handleConnection(socket, request);
    });

    this.server.on('listening', () => {
      this.logger.log('MCP WebSocket transport ready at ws://localhost:9000/api/v1/mcp/ws');
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const { server } of this.sessions.values()) {
      await server.close().catch(() => undefined);
    }
    this.sessions.clear();
    this.server?.close();
    this.server = undefined;
  }

  private async handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): Promise<void> {
    const header = request.headers['mcp-session-id'];
    const sessionId = Array.isArray(header)
      ? (header[0] ?? randomUUID())
      : (header ?? randomUUID());

    const mcpServer = this.mcpService.createServer();
    const transport = new McpWebSocketTransport(socket, request, {
      sessionId,
      onInitialize: (clientInfo) => {
        this.mcpService.onSessionInitialized(mcpServer, sessionId, clientInfo);
      },
    });

    transport.onclose = () => {
      this.sessions.delete(sessionId);
      void mcpServer.close().catch((err) =>
        this.logger.warn(
          `MCP WebSocket session close failed [${sessionId}]: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      this.logger.log(`MCP WebSocket session closed: ${sessionId}`);
    };

    transport.onerror = (error) => {
      this.logger.warn(
        `MCP WebSocket transport error [${sessionId}]: ${error.message}`,
      );
    };

    await mcpServer.connect(transport);
    this.sessions.set(sessionId, { socket, transport, server: mcpServer });
    this.logger.log(
      `MCP WebSocket session connected: ${sessionId} path=${request.url ?? '/api/v1/mcp/ws'}`,
    );
  }
}
