import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { randomUUID } from 'crypto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectEntity } from './entities/project.entity';
import {
  NodeMetadataEntity,
  NodeStatus,
} from '../node/entities/node-metadata.entity';

// ---------------------------------------------------------------------------
// 节点树节点类型
// ---------------------------------------------------------------------------

export interface NodeTreeItem {
  nodeId: string;
  nodeType: string;
  parentNodeId: string | null;
  sortOrder: number;
  requirement: string;
  prompt: string | undefined;
  agentRoleId: string | null;
  attributes: Record<string, any>;
  status: NodeStatus;
  createdAt: Date;
  updatedAt: Date;
  children: NodeTreeItem[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: EntityRepository<ProjectEntity>,
    @InjectRepository(NodeMetadataEntity)
    private readonly nodeRepository: EntityRepository<NodeMetadataEntity>,
  ) {}

  async create(createProjectDto: CreateProjectDto) {
    const now = new Date();
    const em = this.projectRepository.getEntityManager();

    const projectUUID = createProjectDto.id ?? randomUUID();
    const project = this.projectRepository.create({
      id: projectUUID,
      name: createProjectDto.name,
      description: createProjectDto.description ?? '',
      basePath: createProjectDto.basePath ?? '',
      techStack: createProjectDto.techStack ?? {},
      createdAt: now,
      updatedAt: now,
    });

    const rootNode = this.nodeRepository.create({
      nodeId: `${projectUUID}_root`,
      project,
      title: project.name,
      nodeType: 'start',
      parentNodeId: null,
      sortOrder: 0,
      dependencies: [],
      requirement: '',
      prompt: '',
      agentRoleId: null,
      attributes: { name: project.name, position: { x: 0, y: 0 } },
      status: NodeStatus.Pending,
      createdAt: now,
      updatedAt: now,
    });

    await em.persist([project, rootNode]).flush();
    return project;
  }

  async findAll(nameKeywords?: string[]) {
    const keywords = (nameKeywords ?? [])
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);
    if (keywords.length === 0) {
      return this.projectRepository.findAll({ orderBy: { updatedAt: 'desc' } });
    }
    return this.projectRepository.find(
      {
        $or: keywords.map((keyword) => ({
          name: { $ilike: `%${keyword}%` },
        })),
      },
      { orderBy: { updatedAt: 'desc' } },
    );
  }

  async findOne(id: string) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    const nodes = await this.nodeRepository.find(
      { project: { id } },
      { orderBy: { sortOrder: 'asc', createdAt: 'asc' } },
    );

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      basePath: project.basePath,
      techStack: project.techStack,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      nodes: buildNodeTree(nodes),
    };
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) throw new NotFoundException('项目不存在');
    this.projectRepository.assign(project, {
      name: updateProjectDto.name ?? project.name,
      description: updateProjectDto.description ?? project.description,
      basePath: updateProjectDto.basePath ?? project.basePath,
      techStack: updateProjectDto.techStack ?? project.techStack,
    });
    await this.projectRepository.getEntityManager().persist(project).flush();
    return project;
  }

  async remove(id: string) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) throw new NotFoundException('项目不存在');
    const em = this.projectRepository.getEntityManager();
    await this.nodeRepository.nativeDelete({ project: { id } });
    await em.remove(project).flush();
    return { id };
  }
}

// ---------------------------------------------------------------------------
// 纯函数：将平铺节点列表构建为上下级树结构
// ---------------------------------------------------------------------------

function buildNodeTree(nodes: NodeMetadataEntity[]): NodeTreeItem[] {
  const map = new Map<string, NodeTreeItem>();

  // 第一遍：全部转为 NodeTreeItem 并存入 map
  for (const n of nodes) {
    map.set(n.nodeId, {
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      parentNodeId: n.parentNodeId ?? null,
      sortOrder: n.sortOrder ?? 0,
      requirement: n.requirement,
      prompt: n.prompt,
      agentRoleId: n.agentRoleId ?? null,
      attributes: n.attributes,
      status: n.status,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      children: [],
    });
  }

  // 第二遍：按 parentNodeId 挂载到父节点；无父节点或父不在范围内的作为根节点
  const roots: NodeTreeItem[] = [];
  for (const item of map.values()) {
    if (item.parentNodeId && map.has(item.parentNodeId)) {
      map.get(item.parentNodeId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  const sortNodes = (items: NodeTreeItem[]) => {
    items.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    for (const item of items) {
      sortNodes(item.children);
    }
  };
  sortNodes(roots);

  return roots;
}
