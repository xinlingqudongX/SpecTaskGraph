import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createNodeHistorySchema = z.object({
  result: z.string().optional(),
  executedBy: z.string().optional(),
  executedAt: z.coerce.date().optional(),
  intent: z.string().optional(),
  sessionId: z.string().optional(),
});

export class CreateNodeHistoryDto extends createZodDto(createNodeHistorySchema) {}
