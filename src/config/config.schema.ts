import { z } from 'zod';

export const configSchema = z.object({
  app: z.object({
    port: z
      .number({ message: '缺少port配置' })
      .int()
      .min(1)
      .max(65535)
      .default(9000),
    host: z.string({ message: '缺少host配置' }).default('0.0.0.0'),
  }),
  postgres: z.object({
    host: z.string({ message: '缺少host配置' }),
    port: z.number({ message: '缺少port配置' }).int().min(1).max(65535),
    username: z.string({ message: '缺少username配置' }),
    password: z.string({ message: '缺少password配置' }),
    schema: z.string({ message: '缺少schema配置' }).default('public'),
    database: z.string({ message: '缺少database配置' }),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
