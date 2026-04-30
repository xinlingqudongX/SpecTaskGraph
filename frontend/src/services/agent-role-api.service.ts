/** Agent 角色信息 */
export interface AgentRole {
  id: string;
  name: string;
  description: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRolePayload {
  name: string;
  description: string;
  prompt: string;
}

/** Agent 角色 API 服务 */
export class AgentRoleApiService {
  private static instance: AgentRoleApiService;

  private rolesCache: AgentRole[] | null = null;

  private rolesPromise: Promise<AgentRole[]> | null = null;

  static getInstance(): AgentRoleApiService {
    if (!AgentRoleApiService.instance) {
      AgentRoleApiService.instance = new AgentRoleApiService();
    }
    return AgentRoleApiService.instance;
  }

  private cloneRoles(roles: AgentRole[]): AgentRole[] {
    return roles.map((role) => ({ ...role }));
  }

  private async requestRoles(): Promise<AgentRole[]> {
    const res = await fetch('/api/v1/agent-role');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const roles = await (res.json() as Promise<AgentRole[]>);
    this.rolesCache = this.cloneRoles(roles);
    return this.cloneRoles(roles);
  }

  /** 查询角色列表 */
  async listRoles(): Promise<AgentRole[]> {
    return this.requestRoles();
  }

  /** 查询共享缓存角色列表 */
  async getCachedRoles(options: { force?: boolean } = {}): Promise<AgentRole[]> {
    if (!options.force && this.rolesCache) {
      return this.cloneRoles(this.rolesCache);
    }

    if (!this.rolesPromise) {
      this.rolesPromise = this.requestRoles().finally(() => {
        this.rolesPromise = null;
      });
    }

    const roles = await this.rolesPromise;
    return this.cloneRoles(roles);
  }

  /** 失效角色缓存 */
  invalidateRoleCache(): void {
    this.rolesCache = null;
    this.rolesPromise = null;
  }

  /** 创建角色 */
  async createRole(data: AgentRolePayload): Promise<AgentRole> {
    const res = await fetch('/api/v1/agent-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const role = await (res.json() as Promise<AgentRole>);
    this.invalidateRoleCache();
    return role;
  }

  /** 更新角色（部分字段） */
  async updateRole(id: string, data: Partial<AgentRolePayload>): Promise<AgentRole> {
    const res = await fetch(`/api/v1/agent-role/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const role = await (res.json() as Promise<AgentRole>);
    this.invalidateRoleCache();
    return role;
  }

  /** 删除角色 */
  async deleteRole(id: string): Promise<void> {
    const res = await fetch(`/api/v1/agent-role/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    this.invalidateRoleCache();
  }
}
