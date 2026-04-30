import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { AgentRoleEntity } from './entities/agent-role.entity';

/** Agent 角色服务 */
@Injectable()
export class AgentRoleService {
  constructor(
    @InjectRepository(AgentRoleEntity)
    private readonly agentRoleRepo: EntityRepository<AgentRoleEntity>,
  ) {}

  /** 根据角色 ID 列表查询角色 */
  async findByIds(roleIds: string[]): Promise<AgentRoleEntity[]> {
    if (roleIds.length === 0) {
      return [];
    }
    return this.agentRoleRepo.find({ id: { $in: roleIds } });
  }

  /** 根据角色 ID 查询单个角色 */
  async findById(roleId: string): Promise<AgentRoleEntity | null> {
    if (!roleId) {
      return null;
    }
    return this.agentRoleRepo.findOne({ id: roleId });
  }

  /** 创建角色 */
  async create(input: {
    name: string;
    description?: string;
    prompt: string;
  }): Promise<AgentRoleEntity> {
    const now = new Date();
    const entity = this.agentRoleRepo.create({
      name: input.name,
      description: input.description ?? '',
      prompt: input.prompt,
      createdAt: now,
      updatedAt: now,
    });
    const em = this.agentRoleRepo.getEntityManager();
    await em.persist(entity).flush();
    return entity;
  }

  /** 查询全部角色 */
  async findAll(): Promise<AgentRoleEntity[]> {
    return this.agentRoleRepo.findAll({ orderBy: { updatedAt: 'desc' } });
  }

  /** 更新角色 */
  async update(
    roleId: string,
    input: {
      name?: string;
      description?: string;
      prompt?: string;
    },
  ): Promise<AgentRoleEntity> {
    const entity = await this.agentRoleRepo.findOneOrFail({ id: roleId });
    this.agentRoleRepo.assign(entity, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.prompt !== undefined && { prompt: input.prompt }),
    });
    await this.agentRoleRepo.getEntityManager().persist(entity).flush();
    return entity;
  }

  /** 删除角色 */
  async remove(roleId: string): Promise<{ id: string }> {
    const entity = await this.agentRoleRepo.findOneOrFail({ id: roleId });
    await this.agentRoleRepo.getEntityManager().remove(entity).flush();
    return { id: roleId };
  }
}
