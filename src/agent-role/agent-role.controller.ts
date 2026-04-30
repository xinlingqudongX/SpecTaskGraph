import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { AgentRoleService } from './agent-role.service';
import { CreateAgentRoleDto } from './dto/create-agent-role.dto';
import { UpdateAgentRoleDto } from './dto/update-agent-role.dto';

/** Agent 角色控制器 */
@Controller('agent-role')
export class AgentRoleController {
  constructor(private readonly agentRoleService: AgentRoleService) {}

  /** 创建角色 */
  @Post()
  create(@Body() dto: CreateAgentRoleDto) {
    return this.agentRoleService.create(dto);
  }

  /** 获取角色列表 */
  @Get()
  findAll() {
    return this.agentRoleService.findAll();
  }

  /** 获取单个角色 */
  @Get(':id')
  findOne(@Param('id', new ZodValidationPipe(z.string().uuid())) id: string) {
    return this.agentRoleService.findById(id);
  }

  /** 更新角色 */
  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(z.string().uuid())) id: string,
    @Body() dto: UpdateAgentRoleDto,
  ) {
    return this.agentRoleService.update(id, dto);
  }

  /** 删除角色 */
  @Delete(':id')
  remove(@Param('id', new ZodValidationPipe(z.string().uuid())) id: string) {
    return this.agentRoleService.remove(id);
  }
}
