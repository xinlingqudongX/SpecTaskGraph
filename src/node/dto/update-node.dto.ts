import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const updateNodeSchema = z.object({
  requirement: z.string().optional(),
  prompt: z.string().optional(),
  attributes: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
});

export class UpdateNodeDto extends createZodDto(updateNodeSchema) {}
