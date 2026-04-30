import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  JSONRPCMessageSchema,
  isInitializeRequest,
  type JSONRPCMessage,
  type MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage } from 'http';
import type WebSocket from 'ws';

type InitializeCallback = (clientInfo?: {
  name: string;
  version: string;
}) => void;

/**
 * MCP WebSocket 自定义传输层。
 * 仅用于实验性接入，协议消息体仍保持 JSON-RPC。
 */
export class McpWebSocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  sessionId?: string;

  private started = false;
  private initializeSeen = false;
  private readonly requestInfo: MessageExtraInfo['requestInfo'];

  constructor(
    private readonly socket: WebSocket,
    request: IncomingMessage,
    options: {
      sessionId: string;
      onInitialize?: InitializeCallback;
    },
  ) {
    this.sessionId = options.sessionId;
    this.onInitialize = options.onInitialize;
    this.requestInfo = this.buildRequestInfo(request, options.sessionId);
  }

  private readonly onInitialize?: InitializeCallback;

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('WebSocket transport already started');
    }
    this.started = true;

    this.socket.on('message', (data) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        const message = JSONRPCMessageSchema.parse(JSON.parse(raw));
        if (!this.initializeSeen && isInitializeRequest(message)) {
          this.initializeSeen = true;
          const clientInfo = (message as any)?.params?.clientInfo;
          this.onInitialize?.(
            clientInfo &&
              typeof clientInfo.name === 'string' &&
              typeof clientInfo.version === 'string'
              ? {
                  name: clientInfo.name,
                  version: clientInfo.version,
                }
              : undefined,
          );
        }
        this.onmessage?.(message, { requestInfo: this.requestInfo });
      } catch (error) {
        this.onerror?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });

    this.socket.on('close', () => {
      this.onclose?.();
    });

    this.socket.on('error', (error) => {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
    });
  }

  async send(
    message: JSONRPCMessage,
    _options?: TransportSendOptions,
  ): Promise<void> {
    if (this.socket.readyState !== this.socket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    await new Promise<void>((resolve, reject) => {
      this.socket.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (
      this.socket.readyState === this.socket.CLOSING ||
      this.socket.readyState === this.socket.CLOSED
    ) {
      return;
    }
    this.socket.close();
  }

  private buildRequestInfo(
    request: IncomingMessage,
    sessionId: string,
  ): MessageExtraInfo['requestInfo'] {
    const headers: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        headers[key] = value;
      } else if (typeof value === 'string') {
        headers[key] = value;
      }
    }
    if (!headers['mcp-session-id']) {
      headers['mcp-session-id'] = sessionId;
    }

    const host = request.headers.host ?? 'localhost';
    const protocol =
      request.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const path = request.url ?? '/api/v1/mcp/ws';

    return {
      headers,
      url: new URL(path, `${protocol}://${host}`),
    };
  }
}
