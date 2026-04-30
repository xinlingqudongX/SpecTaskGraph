import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import type { NodeStatus } from '../entities/node-metadata.entity';

export const updateNodeStatusSchema = z.object({
  status: z.enum([
    'pending',
    'in_progress',
    'completed',
    'failed',
    'review_needed',
  ]),
});

export class UpdateNodeStatusDto extends createZodDto(updateNodeStatusSchema) {
  declare status: NodeStatus;
}
