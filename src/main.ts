import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { apiReference } from '@scalar/nestjs-api-reference';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter());

  // 启用WebSocket支持
  app.useWebSocketAdapter(new WsAdapter(app));

  app.setGlobalPrefix('/api/v1');
  app.useGlobalPipes(new ZodValidationPipe());

  // 创建Swagger文档配置
  const config = new DocumentBuilder()
    .setTitle('FlowInOne API')
    .setDescription('FlowInOne API文档')
    .setVersion('1.0')
    .build();

  // 创建Swagger文档
  const document = SwaggerModule.createDocument(app, config);
  app.use(
    '/api-reference',
    apiReference({
      content: document,
      withFastify: true,
    }),
  );

  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
  console.log(`应用已在端口 ${process.env.PORT ?? 5000} 上启动`);
  console.log(`前端页面: http://localhost:${process.env.PORT ?? 5000}/`);
  console.log(`WebSocket服务: ws://localhost:${process.env.PORT ?? 5000}/ws`);
  console.log(
    `API文档: http://localhost:${process.env.PORT ?? 5000}/api-reference`,
  );
  console.log(
    `MCP 端点: http://localhost:${process.env.PORT ?? 5000}/api/v1/mcp  (streamable-http)`,
  );
}
bootstrap();
