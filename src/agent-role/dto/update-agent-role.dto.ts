import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** 更新 Agent 角色 DTO Schema */
export const updateAgentRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  prompt: z.string().min(1).optional(),
});

/** 更新 Agent 角色 DTO */
export class UpdateAgentRoleDto extends createZodDto(updateAgentRoleSchema) {}
