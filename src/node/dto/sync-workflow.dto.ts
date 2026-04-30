import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { NodeStatus } from '../entities/node-metadata.entity';

export const syncWorkflowSchema = z.object({
  nodes: z.array(
    z.object({
      nodeId: z.string().min(1),
      nodeType: z.string().min(1),
      parentNodeId: z.string().min(1).nullable().optional(),
      sortOrder: z.number().int().nonnegative().optional(),
      dependencies: z.array(z.string()).optional(),
      attributes: z.record(z.unknown()).optional(),
      requirement: z.string().optional(),
      prompt: z.string().optional(),
      agentRoleId: z.string().uuid().nullable().optional(),
      status: z.nativeEnum(NodeStatus),
    }),
  ),
});

export class SyncWorkflowDto extends createZodDto(syncWorkflowSchema) {}
