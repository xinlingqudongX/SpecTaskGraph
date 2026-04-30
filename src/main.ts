import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { apiReference } from '@scalar/nestjs-api-reference';
import { ZodValidationPipe } from 'nestjs-zod';
import { McpWebSocketService } from './mcp/mcp-websocket.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());

  const cfg = app.get(ConfigService);
  const port = cfg.get<number>('app.port') ?? 9000;
  const host = cfg.get<string>('app.host') ?? '0.0.0.0';

  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('/api/v1');
  app.useGlobalPipes(new ZodValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlowInOne API')
    .setDescription('FlowInOne API文档')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  app.use(
    '/api-reference',
    apiReference({ content: document, withFastify: true }),
  );

  const mcpWebSocketService = app.get(McpWebSocketService);
//   mcpWebSocketService.attach(app.getHttpServer());

  await app.listen(port, host);
  console.log(`应用已在端口 ${port} 上启动`);
  console.log(`前端页面: http://localhost:${port}/`);
  console.log(`WebSocket服务: ws://localhost:${port}/ws`);
  console.log(`API文档: http://localhost:${port}/api-reference`);
  console.log(
    `MCP 端点: http://localhost:${port}/api/v1/mcp  (streamable-http)`,
  );
}
bootstrap();
