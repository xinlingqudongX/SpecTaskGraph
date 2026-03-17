import { Controller, Post, Req, Res } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { McpService } from './mcp.service';

/**
 * MCP（Model Context Protocol）HTTP 端点。
 *
 * 使用无状态模式（stateless）：每次 POST 请求独立处理，无需 session 管理。
 * 端点：POST /api/v1/mcp
 *
 * MCP 客户端（如 Claude Desktop）连接时使用：
 *   URL:  http://<host>:5000/api/v1/mcp
 *   Type: streamable-http
 */
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post()
  async handleMcp(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const server = this.mcpService.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // 无状态：不分配 session ID
    });

    try {
      await server.connect(transport);
      // req.raw / reply.raw 是底层 Node.js IncomingMessage / ServerResponse
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } finally {
      await server.close().catch(() => {});
    }
  }
}
