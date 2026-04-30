<template>
  <div class="project-list">
    <!-- 操作栏 -->
    <div class="list-toolbar">
      <el-button
        type="primary"
        size="small"
        :icon="'Plus'"
        class="btn-new"
        @click="showCreateForm = true"
      >
        新建项目
      </el-button>
      <el-button
        size="small"
        :icon="'Refresh'"
        circle
        :loading="loading"
        @click="loadProjects"
        title="刷新"
      />
    </div>

    <!-- 创建表单 -->
    <transition name="slide-down">
      <div v-if="showCreateForm" class="create-form">
        <el-input
          v-model="newProjectName"
          placeholder="项目名称"
          size="small"
          ref="nameInputRef"
          @keyup.enter="createProject"
          @keyup.esc="cancelCreate"
          clearable
        />
        <el-input
          v-model="newProjectDesc"
          placeholder="描述（可选）"
          size="small"
          @keyup.enter="createProject"
          @keyup.esc="cancelCreate"
          clearable
        />
        <div class="form-actions">
          <el-button
            type="primary"
            size="small"
            :disabled="!newProjectName.trim()"
            @click="createProject"
          >
            创建
          </el-button>
          <el-button size="small" @click="cancelCreate">取消</el-button>
        </div>
      </div>
    </transition>

    <!-- 加载骨架 -->
    <div v-if="loading && projects.length === 0" class="skeleton-wrap">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- 空状态 -->
    <el-empty
      v-else-if="!loading && projects.length === 0"
      description="暂无项目"
      :image-size="60"
      class="empty-state"
    />

    <!-- 项目列表 -->
    <ul v-else class="projects">
      <li
        v-for="project in projects"
        :key="project.id"
        class="project-item"
        :class="{ active: currentProjectId === project.id }"
        @click="openProject(project)"
      >
        <div class="project-info">
          <el-icon class="project-icon"><Document /></el-icon>
          <div class="project-text">
            <div class="project-name">{{ project.name }}</div>
            <div class="project-meta">{{ formatDate(project.updatedAt) }}</div>
          </div>
        </div>
        <el-button
          class="btn-delete"
          :icon="'Close'"
          size="small"
          text
          title="删除项目"
          @click.stop="confirmDelete(project)"
        />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ProjectApiService } from '../services/project-api.service';
import type { ServerProject } from '../services/project-api.service';
import type { WorkflowGraph } from '../types/workflow.types';

const props = defineProps<{ currentProjectId?: string }>();

const emit = defineEmits<{
  (
    e: 'project-opened',
    graph: WorkflowGraph,
    projectId: string,
    projectName: string,
  ): void;
}>();

const projectApi = ProjectApiService.getInstance();

const projects = ref<ServerProject[]>([]);
const loading = ref(false);
const showCreateForm = ref(false);
const newProjectName = ref('');
const newProjectDesc = ref('');
const nameInputRef = ref<any>(null);

// 忽略 error 变量的 linter 警告，保留变量便于后续扩展
const _error = ref<string | null>(null);

async function loadProjects() {
  loading.value = true;
  _error.value = null;
  try {
    projects.value = (await projectApi.listProjects()) as ServerProject[];
  } catch (err: any) {
    ElMessage.error(`加载项目失败: ${err.message}`);
    _error.value = err.message;
  } finally {
    
    loading.value = false;
  }
}

async function openProject(project: ServerProject) {
  try {
    const full = await projectApi.getProject(project.id);
    console.log('full', full);
    /**{
    "id": "031c2d4d-d514-41c7-9981-7dced11d6a59",
    "name": "AI驱动开发",
    "description": null,
    "basePath": "",
    "techStack": {},
    "createdAt": "2026-03-18T02:28:54.759Z",
    "updatedAt": "2026-03-18T02:28:54.759Z",
    "nodes": [
        {
            "nodeId": "node_root",
            "nodeType": "start",
            "parentNodeId": null,
            "requirement": "",
            "prompt": null,
            "attributes": {
                "name": "AI驱动开发",
                "position": {
                    "x": 1140,
                    "y": 236
                }
            },
            "status": "pending",
            "createdAt": "2026-03-18T02:28:54.759Z",
            "updatedAt": "2026-03-18T02:28:58.941Z",
            "children": [
                {
                    "nodeId": "project_management",
                    "nodeType": "feature",
                    "parentNodeId": "node_root",
                    "requirement": "实现项目的创建、编辑、删除功能，维护项目名称、修改时间，提供项目列表展示",
                    "prompt": "创建项目管理模块，包括项目CRUD操作、项目资产关联、API端点设计。使用NestJS框架，MikroORM作为ORM，实现RESTful API设计规范。",
                    "attributes": {
                        "apis": [
                            "POST /api/projects",
                            "GET /api/projects",
                            "GET /api/projects/:id",
                            "PATCH /api/projects/:id",
                            "DELETE /api/projects/:id"
                        ],
                        "name": "项目管理模块",
                        "module": "src/project/",
                        "priority": "P0"
                    },
                    "status": "pending",
                    "createdAt": "2026-03-18T02:30:24.941Z",
                    "updatedAt": "2026-03-18T02:30:24.962Z",
                    "children": [
                        {
                            "nodeId": "project_crud",
                            "nodeType": "task",
                            "parentNodeId": "project_management",
                            "requirement": "创建项目实体和项目资产实体，实现完整的CRUD操作，包括项目名称、描述、创建时间、更新时间等字段",
                            "prompt": "实现项目的基本增删改查操作，包括创建项目、读取项目列表、更新项目信息、删除项目、查询单个项目详情。使用MikroORM实现数据持久化。",
                            "attributes": {
                                "name": "项目CRUD操作",
                                "entities": [
                                    "project.entity.ts",
                                    "project-asset.entity.ts"
                                ],
                                "priority": "P0"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:30:47.743Z",
                            "updatedAt": "2026-03-18T02:30:47.754Z",
                            "children": []
                        },
                        {
                            "nodeId": "project_api_endpoints",
                            "nodeType": "task",
                            "parentNodeId": "project_management",
                            "requirement": "实现项目管理的所有API端点，包括创建、获取列表、获取详情、更新和删除操作",
                            "prompt": "设计和实现项目管理的RESTful API端点，使用NestJS控制器和服务层。实现统一的响应格式，使用Zod进行请求和响应验证。",
                            "attributes": {
                                "apis": [
                                    "POST /api/projects",
                                    "GET /api/projects",
                                    "GET /api/projects/:id",
                                    "PATCH /api/projects/:id",
                                    "DELETE /api/projects/:id"
                                ],
                                "name": "API端点设计",
                                "priority": "P0"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:30:47.743Z",
                            "updatedAt": "2026-03-18T02:30:47.754Z",
                            "children": []
                        },
                        {
                            "nodeId": "project_asset_management",
                            "nodeType": "task",
                            "parentNodeId": "project_management",
                            "requirement": "实现项目与文件资源的关联，项目资产的上传、删除、查询功能",
                            "prompt": "实现项目与文件资源的关联管理，包括项目资产的上传、删除、查询功能。支持多种文件类型，实现文件元数据管理。",
                            "attributes": {
                                "name": "项目资产关联",
                                "priority": "P1",
                                "operations": [
                                    "上传资产",
                                    "删除资产",
                                    "查询资产"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:30:47.743Z",
                            "updatedAt": "2026-03-18T02:30:47.754Z",
                            "children": []
                        }
                    ]
                },
                {
                    "nodeId": "workflow_editor",
                    "nodeType": "feature",
                    "parentNodeId": "node_root",
                    "requirement": "实现工作流图编辑功能，包括画布上创建节点、配置节点属性、添加/删除节点，通过连线定义节点依赖关系与执行顺序",
                    "prompt": "开发工作流图编辑器，使用Vue3和LogicFlow实现画布编辑功能。支持节点拖拽、连线、分组、缩放、撤销重做等操作。导出结构化图数据供AI解析。",
                    "attributes": {
                        "name": "工作流图编辑模块",
                        "library": "LogicFlow",
                        "priority": "P0",
                        "backend_module": "src/node/",
                        "frontend_component": "WorkflowEditor.vue"
                    },
                    "status": "pending",
                    "createdAt": "2026-03-18T02:30:24.941Z",
                    "updatedAt": "2026-03-18T02:30:24.962Z",
                    "children": [
                        {
                            "nodeId": "canvas_editor",
                            "nodeType": "task",
                            "parentNodeId": "workflow_editor",
                            "requirement": "实现工作流图的基本编辑功能，包括节点拖拽、连线、画布缩放、撤销重做等操作",
                            "prompt": "使用Vue3和LogicFlow开发工作流画布编辑器。实现节点拖拽、连线、画布缩放、撤销重做等基本编辑功能。配置自定义节点样式和交互行为。",
                            "attributes": {
                                "name": "画布编辑器",
                                "library": "LogicFlow",
                                "priority": "P0",
                                "component": "WorkflowEditor.vue",
                                "operations": [
                                    "节点拖拽",
                                    "连线",
                                    "缩放",
                                    "撤销重做"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:15.332Z",
                            "updatedAt": "2026-03-18T02:31:15.343Z",
                            "children": []
                        },
                        {
                            "nodeId": "node_management_integration",
                            "nodeType": "task",
                            "parentNodeId": "workflow_editor",
                            "requirement": "在画布编辑器中集成节点管理功能，实现与后端节点API的数据同步",
                            "prompt": "在工作流编辑器中集成节点管理功能，连接后端节点API。实现节点的创建、更新、删除操作，同步前后端节点数据。",
                            "attributes": {
                                "name": "节点管理集成",
                                "priority": "P0",
                                "operations": [
                                    "创建节点",
                                    "更新节点",
                                    "删除节点"
                                ],
                                "backend_api": "src/node/"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:15.332Z",
                            "updatedAt": "2026-03-18T02:31:15.343Z",
                            "children": []
                        },
                        {
                            "nodeId": "workflow_export",
                            "nodeType": "task",
                            "parentNodeId": "workflow_editor",
                            "requirement": "实现工作流图的导出功能，将图结构转换为多种格式供AI解析使用",
                            "prompt": "实现工作流图的多格式导出功能，包括JSON、DAG、知识图谱等格式。为AI解析提供结构化数据，实现数据格式转换和验证。",
                            "attributes": {
                                "name": "工作流导出",
                                "priority": "P1",
                                "export_formats": [
                                    "JSON",
                                    "DAG",
                                    "知识图谱"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:15.332Z",
                            "updatedAt": "2026-03-18T02:31:15.343Z",
                            "children": []
                        },
                        {
                            "nodeId": "context_menu",
                            "nodeType": "task",
                            "parentNodeId": "workflow_editor",
                            "requirement": "鼠标右键点击节点时出现菜单，提供增加子节点、删除节点等操作",
                            "prompt": "实现节点右键菜单功能，包括添加子节点、删除节点、编辑属性等操作。提供直观的交互体验，支持快捷键操作。",
                            "attributes": {
                                "name": "右键菜单功能",
                                "priority": "P1",
                                "menu_items": [
                                    "添加子节点",
                                    "删除节点",
                                    "编辑属性"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:15.332Z",
                            "updatedAt": "2026-03-18T02:31:15.343Z",
                            "children": []
                        }
                    ]
                },
                {
                    "nodeId": "node_management",
                    "nodeType": "feature",
                    "parentNodeId": "node_root",
                    "requirement": "实现任务节点管理，支持多种节点类型（文本、音频、视频、文件资源），节点可通过增加子级方式扩展，提供右键菜单操作",
                    "prompt": "创建任务节点管理系统，实现节点CRUD操作、多种节点类型支持、节点层级关系管理、节点属性配置。使用MCP工具提供的节点API进行数据同步。",
                    "attributes": {
                        "name": "任务节点模块",
                        "priority": "P0",
                        "node_types": [
                            "文本节点",
                            "音频节点",
                            "视频节点",
                            "文件资源节点"
                        ],
                        "operations": [
                            "添加子节点",
                            "删除节点",
                            "配置属性"
                        ]
                    },
                    "status": "pending",
                    "createdAt": "2026-03-18T02:30:24.941Z",
                    "updatedAt": "2026-03-18T02:30:24.962Z",
                    "children": [
                        {
                            "nodeId": "node_types_implementation",
                            "nodeType": "task",
                            "parentNodeId": "node_management",
                            "requirement": "支持多种节点类型，包括文本节点、音频节点、视频节点、文件资源节点，每种节点类型有不同的属性和功能",
                            "prompt": "实现多种节点类型的支持，包括文本节点、音频节点、视频节点、文件资源节点等。为每种节点类型定义特定的属性和渲染方式，实现节点类型的扩展机制。",
                            "attributes": {
                                "name": "节点类型实现",
                                "priority": "P0",
                                "node_types": [
                                    "文本节点",
                                    "音频节点",
                                    "视频节点",
                                    "文件资源节点"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:44.970Z",
                            "updatedAt": "2026-03-18T02:31:44.983Z",
                            "children": []
                        },
                        {
                            "nodeId": "node_hierarchy_management",
                            "nodeType": "task",
                            "parentNodeId": "node_management",
                            "requirement": "节点可以通过增加子级的方式进行扩展，支持树状结构的节点关系管理",
                            "prompt": "实现节点的层级关系管理，支持添加子节点、删除子节点、移动节点位置、查询节点树结构等操作。维护节点的父子关系和依赖关系。",
                            "attributes": {
                                "name": "节点层级关系管理",
                                "priority": "P0",
                                "operations": [
                                    "添加子节点",
                                    "删除子节点",
                                    "移动节点位置",
                                    "查询节点树结构"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:44.970Z",
                            "updatedAt": "2026-03-18T02:31:44.983Z",
                            "children": []
                        },
                        {
                            "nodeId": "node_attributes_config",
                            "nodeType": "task",
                            "parentNodeId": "node_management",
                            "requirement": "节点属性配置包括标题、提示词等，支持节点的详细配置和自定义",
                            "prompt": "实现节点属性的配置功能，包括节点标题、提示词、输入输出配置、元数据等。提供属性编辑界面，支持属性的验证和保存。",
                            "attributes": {
                                "name": "节点属性配置",
                                "priority": "P1",
                                "attributes": [
                                    "节点标题",
                                    "节点提示词",
                                    "节点输入输出配置",
                                    "节点元数据"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:44.970Z",
                            "updatedAt": "2026-03-18T02:31:44.983Z",
                            "children": []
                        },
                        {
                            "nodeId": "node_output_management",
                            "nodeType": "task",
                            "parentNodeId": "node_management",
                            "requirement": "管理节点的执行产出，包括产出记录、文件关联和历史追踪",
                            "prompt": "实现节点产出的管理功能，记录节点执行的产出结果，关联产出文件，维护产出历史记录。支持产出的版本管理和追溯。",
                            "attributes": {
                                "name": "节点产出管理",
                                "features": [
                                    "记录节点执行产出",
                                    "关联产出文件",
                                    "产出历史记录"
                                ],
                                "priority": "P1"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:31:44.970Z",
                            "updatedAt": "2026-03-18T02:31:44.983Z",
                            "children": []
                        }
                    ]
                },
                {
                    "nodeId": "filesystem_integration",
                    "nodeType": "feature",
                    "parentNodeId": "node_root",
                    "requirement": "前端使用File System API加载本地目录作为工作区，将流程文档写入本地文件，支持本地文件的上传、读取、删除",
                    "prompt": "实现本地文件系统集成，使用浏览器File System Access API管理工作区。提供文件浏览、上传、删除、重命名功能，实现工作流文档的本地持久化。",
                    "attributes": {
                        "api": "File System Access API",
                        "name": "本地文件系统模块",
                        "priority": "P0",
                        "components": [
                            "FileBrowser.vue",
                            "WorkspaceManager.vue"
                        ],
                        "frontend_service": "filesystem.service.ts"
                    },
                    "status": "pending",
                    "createdAt": "2026-03-18T02:30:24.941Z",
                    "updatedAt": "2026-03-18T02:30:24.962Z",
                    "children": [
                        {
                            "nodeId": "workspace_management",
                            "nodeType": "task",
                            "parentNodeId": "filesystem_integration",
                            "requirement": "前端使用File System API加载本地目录作为工作区，支持工作区的选择和管理",
                            "prompt": "使用浏览器File System Access API实现工作区管理功能。允许用户选择本地目录作为工作区，读取工作区文件列表，监听文件变化，保存工作区配置。",
                            "attributes": {
                                "api": "File System Access API",
                                "name": "工作区管理",
                                "priority": "P0",
                                "component": "WorkspaceManager.vue",
                                "operations": [
                                    "选择本地目录",
                                    "读取文件列表",
                                    "监听文件变化"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:08.199Z",
                            "updatedAt": "2026-03-18T02:32:08.210Z",
                            "children": []
                        },
                        {
                            "nodeId": "file_operations",
                            "nodeType": "task",
                            "parentNodeId": "filesystem_integration",
                            "requirement": "支持本地文件的上传、读取、删除等操作，提供文件浏览功能",
                            "prompt": "实现本地文件的基本操作功能，包括文件上传、读取、删除、重命名和目录浏览。提供直观的文件管理界面，支持拖拽上传和批量操作。",
                            "attributes": {
                                "name": "文件操作",
                                "priority": "P0",
                                "component": "FileBrowser.vue",
                                "operations": [
                                    "文件上传",
                                    "文件读取",
                                    "文件删除",
                                    "文件重命名",
                                    "文件目录浏览"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:08.199Z",
                            "updatedAt": "2026-03-18T02:32:08.210Z",
                            "children": []
                        },
                        {
                            "nodeId": "workflow_persistence",
                            "nodeType": "task",
                            "parentNodeId": "filesystem_integration",
                            "requirement": "将流程文档写入本地文件，支持工作流文档的本地保存和加载",
                            "prompt": "实现工作流文档的本地持久化功能。将工作流图保存为JSON格式的本地文件，支持从本地文件加载工作流图，实现文件的版本管理。",
                            "attributes": {
                                "name": "工作流文档持久化",
                                "priority": "P0",
                                "operations": [
                                    "保存为本地文件",
                                    "从本地文件加载",
                                    "文件版本管理"
                                ],
                                "file_format": "JSON"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:08.199Z",
                            "updatedAt": "2026-03-18T02:32:08.210Z",
                            "children": []
                        }
                    ]
                },
                {
                    "nodeId": "collaboration_features",
                    "nodeType": "feature",
                    "parentNodeId": "node_root",
                    "requirement": "实现协作功能，每个用户根据浏览器信息生成唯一标识，通过WebSocket发送鼠标轨迹，其他用户实时显示在画板上",
                    "prompt": "开发实时协作功能，使用WebSocket实现多用户协同编辑。包括用户标识生成、鼠标轨迹同步、在线用户列表、操作冲突解决等功能。",
                    "attributes": {
                        "name": "协作功能模块",
                        "priority": "P1",
                        "components": [
                            "CollaborativeCursors.vue",
                            "OnlineUsersList.vue"
                        ],
                        "technology": "WebSocket",
                        "backend_module": "src/collaboration/"
                    },
                    "status": "pending",
                    "createdAt": "2026-03-18T02:30:24.941Z",
                    "updatedAt": "2026-03-18T02:30:24.962Z",
                    "children": [
                        {
                            "nodeId": "user_identity_management",
                            "nodeType": "task",
                            "parentNodeId": "collaboration_features",
                            "requirement": "每个打开网页的用户都根据浏览器信息生成唯一标识作为用户标识",
                            "prompt": "实现用户标识管理系统，根据浏览器信息生成唯一用户标识。管理用户的基本信息和在线状态，提供在线用户列表显示。",
                            "attributes": {
                                "name": "用户标识管理",
                                "priority": "P1",
                                "component": "OnlineUsersList.vue",
                                "operations": [
                                    "生成唯一标识",
                                    "用户信息管理",
                                    "在线状态管理"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:36.332Z",
                            "updatedAt": "2026-03-18T02:32:36.357Z",
                            "children": []
                        },
                        {
                            "nodeId": "cursor_tracking",
                            "nodeType": "task",
                            "parentNodeId": "collaboration_features",
                            "requirement": "用户在操作画板时，当显示鼠标的配置开启时，通过WebSocket发送当前的鼠标轨迹，其他用户会收到并在画板上显示",
                            "prompt": "实现实时鼠标轨迹同步功能。当用户在操作画板时，通过WebSocket发送当前鼠标轨迹，其他用户会收到并在画板上实时显示。",
                            "attributes": {
                                "name": "鼠标轨迹同步",
                                "priority": "P1",
                                "component": "CollaborativeCursors.vue",
                                "operations": [
                                    "鼠标位置发送",
                                    "鼠标轨迹接收",
                                    "实时显示"
                                ],
                                "technology": "WebSocket"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:36.332Z",
                            "updatedAt": "2026-03-18T02:32:36.357Z",
                            "children": []
                        },
                        {
                            "nodeId": "websocket_communication",
                            "nodeType": "task",
                            "parentNodeId": "collaboration_features",
                            "requirement": "使用WebSocket实现实时通信，支持多用户协同编辑和数据同步",
                            "prompt": "实现WebSocket通信系统，支持多用户实时协作。实现连接管理、消息广播、房间管理等功能，支持用户加入和离开房间。",
                            "attributes": {
                                "name": "WebSocket通信",
                                "priority": "P1",
                                "operations": [
                                    "连接管理",
                                    "消息广播",
                                    "房间管理"
                                ],
                                "technology": "WebSocket",
                                "backend_module": "src/collaboration/"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:36.332Z",
                            "updatedAt": "2026-03-18T02:32:36.357Z",
                            "children": []
                        },
                        {
                            "nodeId": "conflict_resolution",
                            "nodeType": "task",
                            "parentNodeId": "collaboration_features",
                            "requirement": "实现多用户协作时的操作冲突检测和解决机制",
                            "prompt": "实现协作编辑中的操作冲突解决机制。检测用户操作冲突，实现冲突解决策略，记录操作日志以便追溯和恢复。",
                            "attributes": {
                                "name": "操作冲突解决",
                                "priority": "P2",
                                "operations": [
                                    "冲突检测",
                                    "冲突解决策略",
                                    "操作日志"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:32:36.332Z",
                            "updatedAt": "2026-03-18T02:32:36.357Z",
                            "children": []
                        }
                    ]
                },
                {
                    "nodeId": "ai_integration",
                    "nodeType": "feature",
                    "parentNodeId": "node_root",
                    "requirement": "将工作流图导出为AI可消费的结构化数据，提供AI解析与执行工作流的能力，使用Zod进行数据验证",
                    "prompt": "实现AI能力集成，将工作流图导出为多种格式（DAG、知识图谱、JSON Schema、AI Prompt）。使用Zod验证AI生成数据的合法性，提供AI数据转换功能。",
                    "attributes": {
                        "name": "AI能力集成模块",
                        "priority": "P1",
                        "validation": "Zod",
                        "backend_module": "src/mcp/",
                        "export_formats": [
                            "DAG格式",
                            "知识图谱格式",
                            "JSON Schema格式",
                            "AI Prompt格式"
                        ]
                    },
                    "status": "pending",
                    "createdAt": "2026-03-18T02:30:24.941Z",
                    "updatedAt": "2026-03-18T02:30:24.963Z",
                    "children": [
                        {
                            "nodeId": "data_export",
                            "nodeType": "task",
                            "parentNodeId": "ai_integration",
                            "requirement": "将工作流图导出为AI可消费的结构化数据，支持多种导出格式",
                            "prompt": "实现工作流数据的多格式导出功能。将工作流图转换为DAG格式、知识图谱格式、JSON Schema格式和AI Prompt格式，为AI解析提供结构化数据。",
                            "attributes": {
                                "name": "数据导出功能",
                                "priority": "P1",
                                "export_formats": [
                                    "DAG格式",
                                    "知识图谱格式",
                                    "JSON Schema格式",
                                    "AI Prompt格式"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:33:03.186Z",
                            "updatedAt": "2026-03-18T02:33:03.203Z",
                            "children": []
                        },
                        {
                            "nodeId": "ai_data_parsing",
                            "nodeType": "task",
                            "parentNodeId": "ai_integration",
                            "requirement": "接收和解析AI生成的工作流数据，使用Zod验证数据合法性",
                            "prompt": "实现AI数据解析功能，接收AI生成的工作流数据。使用Zod验证AI生成数据的合法性，将AI数据转换为工作流图结构。",
                            "attributes": {
                                "name": "AI数据解析",
                                "priority": "P1",
                                "operations": [
                                    "接收AI生成的工作流",
                                    "数据合法性验证",
                                    "数据转换"
                                ],
                                "validation": "Zod",
                                "backend_module": "src/mcp/"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:33:03.186Z",
                            "updatedAt": "2026-03-18T02:33:03.203Z",
                            "children": []
                        },
                        {
                            "nodeId": "mcp_tools_integration",
                            "nodeType": "task",
                            "parentNodeId": "ai_integration",
                            "requirement": "使用ai-spec-devlop工具集成，实现与当前项目的数据同步和管理",
                            "prompt": "集成MCP工具功能，实现与当前项目的数据同步。使用MCP工具管理节点状态、导出工作流、同步节点数据，为AI驱动开发提供支持。",
                            "attributes": {
                                "name": "MCP工具集成",
                                "priority": "P0",
                                "operations": [
                                    "节点状态管理",
                                    "工作流导出",
                                    "数据同步"
                                ],
                                "backend_module": "src/mcp/"
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:33:03.186Z",
                            "updatedAt": "2026-03-18T02:33:03.203Z",
                            "children": []
                        },
                        {
                            "nodeId": "ai_prompt_optimization",
                            "nodeType": "task",
                            "parentNodeId": "ai_integration",
                            "requirement": "优化MCP工具实现和提示词，让AI在调用相关功能时更加智能",
                            "prompt": "优化AI提示词生成和管理功能。根据节点类型和属性生成适合的AI提示词，提供提示词模板，优化上下文信息传递。",
                            "attributes": {
                                "name": "AI提示词优化",
                                "priority": "P2",
                                "operations": [
                                    "提示词生成",
                                    "提示词模板",
                                    "上下文优化"
                                ]
                            },
                            "status": "pending",
                            "createdAt": "2026-03-18T02:33:03.186Z",
                            "updatedAt": "2026-03-18T02:33:03.203Z",
                            "children": []
                        }
                    ]
                }
            ]
        }
    ]
} */
    const graph = projectApi.extractWorkflowGraph(full);
    emit('project-opened', graph, project.id, project.name);
  } catch (err: any) {
    ElMessage.error(`打开项目失败: ${err.message}`);
  }
}

async function createProject() {
  const name = newProjectName.value.trim();
  if (!name) return;
  try {
    const created = await projectApi.createProject(
      name,
      newProjectDesc.value.trim() || undefined,
    );
    projects.value.unshift(created as ServerProject);
    cancelCreate();
    const graph = projectApi.extractWorkflowGraph(created);
    emit('project-opened', graph, created.id, created.name);
    ElMessage.success(`项目"${created.name}"已创建`);
  } catch (err: any) {
    ElMessage.error(`创建项目失败: ${err.message}`);
  }
}

async function confirmDelete(project: ServerProject) {
  try {
    await ElMessageBox.confirm(
      `确定删除项目"${project.name}"？此操作不可撤销。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
    await projectApi.deleteProject(project.id);
    projects.value = projects.value.filter((p) => p.id !== project.id);
    ElMessage.success(`已删除项目"${project.name}"`);
  } catch (err: any) {
    // 用户取消时 ElMessageBox 会 reject，不提示错误
    if (err !== 'cancel') {
      ElMessage.error(`删除项目失败: ${err.message}`);
    }
  }
}

function cancelCreate() {
  showCreateForm.value = false;
  newProjectName.value = '';
  newProjectDesc.value = '';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

watch(showCreateForm, async (val) => {
  if (val) {
    await nextTick();
    nameInputRef.value?.focus();
  }
});

onMounted(loadProjects);

defineExpose({ loadProjects });
</script>

<style scoped>
.project-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 0 0;
}

/* ─── 操作栏 ─────────────────────────────────── */
.list-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 10px;
  border-bottom: 1px solid #2d3148;
}

.btn-new {
  flex: 1;
}

/* ─── 创建表单 ────────────────────────────────── */
.create-form {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid #2d3148;
  background: rgba(255, 255, 255, 0.03);
}

.form-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

/* ─── 过渡动画 ────────────────────────────────── */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 200px;
  opacity: 1;
}

/* ─── 骨架/空状态 ─────────────────────────────── */
.skeleton-wrap {
  padding: 16px 12px;
}

.empty-state {
  padding: 24px 0;
  --el-empty-description-color: #5a6a82;
}

/* ─── 项目列表 ────────────────────────────────── */
.projects {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  overflow-y: auto;
  flex: 1;
}

.project-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s;
  gap: 8px;
}

.project-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.project-item.active {
  background: rgba(64, 158, 255, 0.1);
  border-left-color: #409eff;
}

/* 悬浮时右侧渐隐遮罩，让截断文字与删除按钮过渡自然
.project-item:hover::after {
  content: '';
  position: absolute;
  right: 30px;
  top: 0;
  bottom: 0;
  width: 24px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.05));
  pointer-events: none;
} */

.project-item.active:hover::after {
  background: linear-gradient(to right, transparent, rgba(64, 158, 255, 0.10));
}

.project-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 为绝对定位的删除按钮预留右侧最小间距（仅悬浮时才需要，非悬浮时文字可占满） */
  overflow: hidden;
}

.project-icon {
  color: #5a6a82;
  font-size: 14px;
  flex-shrink: 0;
}

.project-item.active .project-icon {
  color: #409eff;
}

.project-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  color: #c8d0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-item.active .project-name {
  color: #fff;
}

.project-meta {
  font-size: 11px;
  color: #5a6a82;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 删除按钮绝对定位，不再占据 flex 空间，侧边栏再窄也不挤压文字 */
.btn-delete {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  color: #5a6a82 !important;
  opacity: 0;
  flex-shrink: 0;
  flex-shrink: 0;
  transition:
    opacity 0.15s,
    color 0.15s !important;
}

.project-item:hover .btn-delete {
  opacity: 1;
}

.btn-delete:hover {
  color: #f56c6c !important;
}
</style>
