import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** 创建 Agent 角色 DTO Schema */
export const createAgentRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
});

/** 创建 Agent 角色 DTO */
export class CreateAgentRoleDto extends createZodDto(createAgentRoleSchema) {}
