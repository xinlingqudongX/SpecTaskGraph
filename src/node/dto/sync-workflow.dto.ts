import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const syncWorkflowSchema = z.object({
  nodes: z.array(
    z.object({
      nodeId: z.string().min(1),
      nodeType: z.string().min(1),
    }),
  ),
});

export class SyncWorkflowDto extends createZodDto(syncWorkflowSchema) {}
