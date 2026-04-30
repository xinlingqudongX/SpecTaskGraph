import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createProjectSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  basePath: z.string().optional(),
  techStack: z.record(z.unknown()).optional(),
});

export class CreateProjectDto extends createZodDto(createProjectSchema) {}
