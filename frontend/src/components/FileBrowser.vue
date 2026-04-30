<template>
  <div class="file-browser">
    <div class="browser-header">
      <h3>文件浏览器</h3>
      <div class="header-actions">
        <button @click="refreshFiles" class="btn-icon" title="刷新">
          🔄
        </button>
        <button v-if="!isFallbackMode" @click="createNewFile" class="btn-icon" title="新建文件">
          ➕
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      加载中...
    </div>

    <div v-else-if="error" class="error">
      {{ error }}
    </div>

    <div v-else-if="files.length === 0" class="empty">
      <div class="empty-icon">📁</div>
      <h4>工作区中没有项目</h4>
      <p>开始创建您的第一个工作流项目</p>
      <div v-if="!isFallbackMode" class="empty-actions">
        <button @click="createNewFile" class="btn-primary btn-large">
          ➕ 创建新项目
        </button>
        <button @click="showTemplateDialog = true" class="btn-secondary btn-large">
          📋 从模板创建
        </button>
      </div>
      <p v-else class="fallback-empty-tip">只读模式下请通过「在线项目」标签创建新项目</p>
    </div>

    <div v-else class="file-list">
      <div class="list-header">
        <span class="list-title">项目列表 ({{ files.length }})</span>
        <div class="list-actions">
          <button @click="sortBy = sortBy === 'name' ? 'date' : 'name'" class="btn-sort">
            {{ sortBy === 'name' ? '📅 按日期' : '🔤 按名称' }}
          </button>
        </div>
      </div>
      
      <div
        v-for="file in sortedFiles"
        :key="file.name"
        class="file-item"
        :class="{ active: selectedFile === file.name }"
        @click="selectFile(file.name)"
        @dblclick="openFile(file.name)"
      >
        <div class="file-icon">
          <span class="project-icon">🚀</span>
          <span v-if="file.isRecent" class="recent-badge">新</span>
        </div>
        <div class="file-info">
          <div class="file-name">{{ getProjectDisplayName(file.name) }}</div>
          <div class="file-description">{{ getProjectDescription(file.name) }}</div>
          <div class="file-meta">
            <span class="file-size">{{ formatSize(file.size) }}</span>
            <span class="file-date">{{ formatDate(file.lastModified) }}</span>
            <span v-if="file.isRecent" class="recent-text">最近创建</span>
          </div>
        </div>
        <div class="file-actions">
          <button @click.stop="openFile(file.name)" class="btn-action btn-open" title="打开项目">
            📂
          </button>
          <button v-if="!isFallbackMode" @click.stop="duplicateFile(file.name)" class="btn-action" title="复制项目">
            📋
          </button>
          <button v-if="!isFallbackMode" @click.stop="deleteFile(file.name)" class="btn-action btn-danger" title="删除项目">
            🗑️
          </button>
        </div>
      </div>
    </div>

    <!-- 新建文件对话框 -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click="closeCreateDialog">
      <div class="dialog" @click.stop>
        <h3>创建新的工作流项目</h3>
        <div class="form-group">
          <label>项目ID:</label>
          <input
            v-model="newProjectId"
            type="text"
            placeholder="例如: my-project"
            pattern="[a-zA-Z0-9-_]+"
            @input="validateProjectId"
          />
          <span v-if="projectIdError" class="error-text">{{ projectIdError }}</span>
          <span v-else class="help-text">只能包含字母、数字、连字符和下划线</span>
        </div>
        <div class="form-group">
          <label>项目名称:</label>
          <input
            v-model="newProjectName"
            type="text"
            placeholder="例如: 我的项目"
          />
        </div>
        <div class="form-group">
          <label>项目描述:</label>
          <textarea
            v-model="newProjectDescription"
            placeholder="简要描述这个项目的用途..."
            rows="3"
          ></textarea>
        </div>
        <div class="dialog-actions">
          <button @click="confirmCreate" class="btn-primary" :disabled="!isValidProjectId || !newProjectName">
            创建项目
          </button>
          <button @click="closeCreateDialog" class="btn-secondary">
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- 模板选择对话框 -->
    <div v-if="showTemplateDialog" class="dialog-overlay" @click="closeTemplateDialog">
      <div class="dialog dialog-large" @click.stop>
        <h3>选择项目模板</h3>
        <div class="template-grid">
          <div
            v-for="template in projectTemplates"
            :key="template.id"
            class="template-item"
            :class="{ selected: selectedTemplate === template.id }"
            @click="selectedTemplate = template.id"
          >
            <div class="template-icon">{{ template.icon }}</div>
            <div class="template-info">
              <h4>{{ template.name }}</h4>
              <p>{{ template.description }}</p>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>项目ID:</label>
          <input
            v-model="templateProjectId"
            type="text"
            placeholder="例如: my-project"
            pattern="[a-zA-Z0-9-_]+"
            @input="validateTemplateProjectId"
          />
          <span v-if="templateProjectIdError" class="error-text">{{ templateProjectIdError }}</span>
        </div>
        <div class="form-group">
          <label>项目名称:</label>
          <input
            v-model="templateProjectName"
            type="text"
            placeholder="例如: 我的项目"
          />
        </div>
        <div class="dialog-actions">
          <button 
            @click="createFromTemplate" 
            class="btn-primary" 
            :disabled="!selectedTemplate || !isValidTemplateProjectId || !templateProjectName"
          >
            从模板创建
          </button>
          <button @click="closeTemplateDialog" class="btn-secondary">
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { WorkflowGraph } from '../types/workflow.types';

interface FileInfo {
  name: string;
  size: number;
  lastModified: Date;
  isRecent?: boolean;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  nodes: any[];
  edges: any[];
}

interface FallbackFileInfo {
  name: string;
  content: string;
  size: number;
  lastModified: Date;
}

interface Props {
  workspaceHandle?: FileSystemDirectoryHandle;
  // 降级模式：由父组件预先读取好的文件列表（无 FSAPI 时使用）
  fallbackFiles?: FallbackFileInfo[];
}

interface Emits {
  (e: 'file-selected', fileName: string): void;
  (e: 'file-opened', graph: WorkflowGraph): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 降级模式下不支持写操作
const isFallbackMode = computed(() => !!props.fallbackFiles && !props.workspaceHandle);

const files = ref<FileInfo[]>([]);
const selectedFile = ref<string>('');
const loading = ref(false);
const error = ref('');
const showCreateDialog = ref(false);
const showTemplateDialog = ref(false);
const newProjectId = ref('');
const newProjectName = ref('');
const newProjectDescription = ref('');
const projectIdError = ref('');
const sortBy = ref<'name' | 'date'>('date');

// 模板相关状态
const selectedTemplate = ref<string>('');
const templateProjectId = ref('');
const templateProjectName = ref('');
const templateProjectIdError = ref('');

// 项目模板定义
const projectTemplates: ProjectTemplate[] = [
  {
    id: 'blank',
    name: '空白项目',
    description: '从头开始创建工作流',
    icon: '📄',
    nodes: [
      {
        nodeId: 'start',
        type: 'start',
        name: '开始',
        description: '项目起始节点',
        instructions: {
          guide: '这是项目的起始节点',
          logic: '从这里开始定义项目流程',
          criteria: '确保项目目标明确'
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 400, y: 100 }
      }
    ],
    edges: []
  },
  {
    id: 'simple-workflow',
    name: '简单工作流',
    description: '包含基本节点的简单工作流模板',
    icon: '🔄',
    nodes: [
      {
        nodeId: 'start',
        type: 'start',
        name: '开始',
        description: '项目起始节点',
        instructions: {
          guide: '项目开始',
          logic: '定义项目目标和范围',
          criteria: '明确项目需求'
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 200, y: 100 }
      },
      {
        nodeId: 'task1',
        type: 'task',
        name: '任务1',
        description: '第一个任务节点',
        instructions: {
          guide: '执行主要任务',
          logic: '按照既定流程执行',
          criteria: '确保质量标准'
        },
        dependencies: ['start'],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 400, y: 100 }
      },
      {
        nodeId: 'end',
        type: 'end',
        name: '结束',
        description: '项目结束节点',
        instructions: {
          guide: '项目完成',
          logic: '总结和归档',
          criteria: '验收标准达成'
        },
        dependencies: ['task1'],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 600, y: 100 }
      }
    ],
    edges: [
      {
        edgeId: 'edge1',
        source: 'start',
        target: 'task1',
        type: 'sequence'
      },
      {
        edgeId: 'edge2',
        source: 'task1',
        target: 'end',
        type: 'sequence'
      }
    ]
  },
  {
    id: 'complex-workflow',
    name: '复杂工作流',
    description: '包含决策节点和并行处理的复杂工作流',
    icon: '🌐',
    nodes: [
      {
        nodeId: 'start',
        type: 'start',
        name: '项目启动',
        description: '项目启动节点',
        instructions: {
          guide: '项目启动阶段',
          logic: '制定项目计划',
          criteria: '计划完整可行'
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 200, y: 100 }
      },
      {
        nodeId: 'decision1',
        type: 'decision',
        name: '需求评估',
        description: '评估项目需求',
        instructions: {
          guide: '评估项目复杂度',
          logic: '根据需求选择路径',
          criteria: '评估准确'
        },
        dependencies: ['start'],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 400, y: 100 }
      },
      {
        nodeId: 'task1',
        type: 'task',
        name: '简单实现',
        description: '简单需求实现',
        instructions: {
          guide: '快速实现',
          logic: '使用标准方案',
          criteria: '功能完整'
        },
        dependencies: ['decision1'],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 300, y: 250 }
      },
      {
        nodeId: 'task2',
        type: 'task',
        name: '复杂实现',
        description: '复杂需求实现',
        instructions: {
          guide: '详细设计',
          logic: '分阶段实现',
          criteria: '质量保证'
        },
        dependencies: ['decision1'],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 500, y: 250 }
      },
      {
        nodeId: 'end',
        type: 'end',
        name: '项目完成',
        description: '项目完成节点',
        instructions: {
          guide: '项目交付',
          logic: '验收和部署',
          criteria: '满足所有要求'
        },
        dependencies: ['task1', 'task2'],
        assets: [],
        outputs: [],
        status: 'pending',
        position: { x: 400, y: 400 }
      }
    ],
    edges: [
      {
        edgeId: 'edge1',
        source: 'start',
        target: 'decision1',
        type: 'sequence'
      },
      {
        edgeId: 'edge2',
        source: 'decision1',
        target: 'task1',
        type: 'condition'
      },
      {
        edgeId: 'edge3',
        source: 'decision1',
        target: 'task2',
        type: 'condition'
      },
      {
        edgeId: 'edge4',
        source: 'task1',
        target: 'end',
        type: 'sequence'
      },
      {
        edgeId: 'edge5',
        source: 'task2',
        target: 'end',
        type: 'sequence'
      }
    ]
  }
];

const isValidProjectId = computed(() => {
  return /^[a-zA-Z0-9-_]+$/.test(newProjectId.value) && newProjectId.value.length > 0;
});

const isValidTemplateProjectId = computed(() => {
  return /^[a-zA-Z0-9-_]+$/.test(templateProjectId.value) && templateProjectId.value.length > 0;
});

const sortedFiles = computed(() => {
  const sorted = [...files.value];
  if (sortBy.value === 'name') {
    return sorted.sort((a, b) => getProjectDisplayName(a.name).localeCompare(getProjectDisplayName(b.name)));
  } else {
    return sorted.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }
});

// 工作区切换时自动刷新文件列表
// 降级模式：fallbackFiles prop 变化时直接刷新列表
watch(
  () => props.fallbackFiles,
  (list) => {
    if (list) refreshFiles();
  },
  { immediate: true }
);

watch(
  () => props.workspaceHandle,
  (handle) => {
    if (handle) {
      refreshFiles();
    } else if (!props.fallbackFiles) {
      files.value = [];
      selectedFile.value = '';
    }
  },
  { immediate: true }
);

/**
 * 刷新文件列表
 */
async function refreshFiles() {
  // 降级模式：直接从 prop 提供的文件列表渲染，无需读取本地目录
  if (props.fallbackFiles) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    files.value = props.fallbackFiles.map((f) => ({
      name: f.name,
      size: f.size,
      lastModified: f.lastModified,
      isRecent: f.lastModified > oneDayAgo,
    }));
    return;
  }

  if (!props.workspaceHandle) {
    error.value = '请先选择工作区';
    return;
  }

  loading.value = true;
  error.value = '';
  files.value = [];

  try {
    // 获取工作流数据目录
    const srcHandle = await props.workspaceHandle.getDirectoryHandle('src', { create: true });
    const dataHandle = await srcHandle.getDirectoryHandle('data', { create: true });
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow', { create: true });

    // 遍历目录中的文件
    const fileList: FileInfo[] = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    for await (const entry of workflowHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.json') && !entry.name.endsWith('.bak') && !entry.name.endsWith('.tmp')) {
        const fileHandle = await workflowHandle.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        const lastModified = new Date(file.lastModified);
        
        fileList.push({
          name: entry.name,
          size: file.size,
          lastModified: lastModified,
          isRecent: lastModified > oneDayAgo
        });
      }
    }

    files.value = fileList.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  } catch (err: any) {
    error.value = `加载文件列表失败: ${err.message}`;
    console.error('加载文件列表失败:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 选择文件
 */
function selectFile(fileName: string) {
  selectedFile.value = fileName;
  emit('file-selected', fileName);
}

/**
 * 打开文件
 */
async function openFile(fileName: string) {
  // 降级模式：直接解析内存中已存储的文件内容
  if (props.fallbackFiles) {
    const fileData = props.fallbackFiles.find((f) => f.name === fileName);
    if (!fileData) {
      error.value = `文件 ${fileName} 未找到`;
      return;
    }
    try {
      const graph = JSON.parse(fileData.content) as WorkflowGraph;
      emit('file-opened', graph);
    } catch {
      error.value = `文件解析失败：${fileName}`;
    }
    return;
  }

  if (!props.workspaceHandle) {
    error.value = '请先选择工作区';
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    // 获取工作流数据目录
    const srcHandle = await props.workspaceHandle.getDirectoryHandle('src');
    const dataHandle = await srcHandle.getDirectoryHandle('data');
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow');

    // 读取文件
    const fileHandle = await workflowHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const content = await file.text();
    const graph = JSON.parse(content) as WorkflowGraph;

    emit('file-opened', graph);
    console.info('文件打开成功:', fileName);
  } catch (err: any) {
    error.value = `打开文件失败: ${err.message}`;
    console.error('打开文件失败:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 删除文件
 */
async function deleteFile(fileName: string) {
  if (!props.workspaceHandle) {
    error.value = '请先选择工作区';
    return;
  }

  if (!confirm(`确定要删除文件 ${fileName} 吗？此操作不可恢复。`)) {
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    // 获取工作流数据目录
    const srcHandle = await props.workspaceHandle.getDirectoryHandle('src');
    const dataHandle = await srcHandle.getDirectoryHandle('data');
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow');

    // 删除文件
    await workflowHandle.removeEntry(fileName);

    // 刷新列表
    await refreshFiles();

    console.info('文件删除成功:', fileName);
  } catch (err: any) {
    error.value = `删除文件失败: ${err.message}`;
    console.error('删除文件失败:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 创建新文件
 */
function createNewFile() {
  newProjectId.value = '';
  newProjectName.value = '';
  newProjectDescription.value = '';
  projectIdError.value = '';
  showCreateDialog.value = true;
}

/**
 * 获取项目显示名称
 */
function getProjectDisplayName(fileName: string): string {
  return fileName.replace('.json', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * 获取项目描述
 */
function getProjectDescription(fileName: string): string {
  // 这里可以从文件内容中读取描述，暂时返回默认描述
  return '工作流项目';
}

/**
 * 复制项目文件
 */
async function duplicateFile(fileName: string) {
  if (!props.workspaceHandle) {
    error.value = '请先选择工作区';
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    // 获取工作流数据目录
    const srcHandle = await props.workspaceHandle.getDirectoryHandle('src');
    const dataHandle = await srcHandle.getDirectoryHandle('data');
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow');

    // 读取原文件
    const originalFileHandle = await workflowHandle.getFileHandle(fileName);
    const originalFile = await originalFileHandle.getFile();
    const originalContent = await originalFile.text();
    const originalGraph = JSON.parse(originalContent) as WorkflowGraph;

    // 生成新的文件名
    const baseName = fileName.replace('.json', '');
    const copyName = `${baseName}-copy`;
    const newFileName = `${copyName}.json`;

    // 创建副本
    const duplicatedGraph: WorkflowGraph = {
      ...originalGraph,
      projectId: copyName,
      projectName: `${originalGraph.projectName} (副本)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 写入新文件
    const newFileHandle = await workflowHandle.getFileHandle(newFileName, { create: true });
    const writable = await newFileHandle.createWritable();
    await writable.write(JSON.stringify(duplicatedGraph, null, 2));
    await writable.close();

    // 刷新列表
    await refreshFiles();

    console.info('项目复制成功:', newFileName);
  } catch (err: any) {
    error.value = `复制项目失败: ${err.message}`;
    console.error('复制项目失败:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 从模板创建项目
 */
async function createFromTemplate() {
  if (!selectedTemplate.value || !isValidTemplateProjectId.value || !templateProjectName.value) {
    return;
  }

  if (!props.workspaceHandle) {
    error.value = '请先选择工作区';
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    const template = projectTemplates.find(t => t.id === selectedTemplate.value);
    if (!template) {
      throw new Error('模板不存在');
    }

    // 创建新的工作流图
    const newGraph: WorkflowGraph = {
      projectId: templateProjectId.value,
      projectName: templateProjectName.value,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: template.nodes,
      edges: template.edges,
      settings: {
        autoSave: true,
        autoSaveInterval: 500,
        enableBackup: true,
        maxBackups: 5
      }
    };

    // 获取工作流数据目录
    const srcHandle = await props.workspaceHandle.getDirectoryHandle('src', { create: true });
    const dataHandle = await srcHandle.getDirectoryHandle('data', { create: true });
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow', { create: true });

    // 写入文件
    const fileName = `${templateProjectId.value}.json`;
    const fileHandle = await workflowHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(newGraph, null, 2));
    await writable.close();

    // 关闭对话框
    closeTemplateDialog();

    // 刷新列表
    await refreshFiles();

    // 自动打开新文件
    emit('file-opened', newGraph);

    console.info('从模板创建项目成功:', fileName);
  } catch (err: any) {
    error.value = `从模板创建项目失败: ${err.message}`;
    console.error('从模板创建项目失败:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 验证模板项目ID
 */
function validateTemplateProjectId() {
  if (!templateProjectId.value) {
    templateProjectIdError.value = '';
    return;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(templateProjectId.value)) {
    templateProjectIdError.value = '项目ID只能包含字母、数字、连字符和下划线';
  } else {
    templateProjectIdError.value = '';
  }
}

/**
 * 关闭模板对话框
 */
function closeTemplateDialog() {
  showTemplateDialog.value = false;
  selectedTemplate.value = '';
  templateProjectId.value = '';
  templateProjectName.value = '';
  templateProjectIdError.value = '';
}

/**
 * 验证项目ID
 */
function validateProjectId() {
  if (!newProjectId.value) {
    projectIdError.value = '';
    return;
  }

  if (!/^[a-zA-Z0-9-_]+$/.test(newProjectId.value)) {
    projectIdError.value = '项目ID只能包含字母、数字、连字符和下划线';
  } else {
    projectIdError.value = '';
  }
}

/**
 * 确认创建
 */
async function confirmCreate() {
  if (!isValidProjectId.value || !newProjectName.value) {
    return;
  }

  if (!props.workspaceHandle) {
    error.value = '请先选择工作区';
    return;
  }

  try {
    loading.value = true;
    error.value = '';

    // 创建新的工作流图
    const newGraph: WorkflowGraph = {
      projectId: newProjectId.value,
      projectName: newProjectName.value,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          nodeId: 'start',
          type: 'start',
          name: '开始',
          description: newProjectDescription.value || '项目起始节点',
          instructions: {
            guide: '这是项目的起始节点',
            logic: '从这里开始定义项目流程',
            criteria: '确保项目目标明确'
          },
          dependencies: [],
          assets: [],
          outputs: [],
          status: 'pending',
          position: { x: 400, y: 100 }
        }
      ],
      edges: [],
      settings: {
        autoSave: true,
        autoSaveInterval: 500,
        enableBackup: true,
        maxBackups: 5
      }
    };

    // 获取工作流数据目录
    const srcHandle = await props.workspaceHandle.getDirectoryHandle('src', { create: true });
    const dataHandle = await srcHandle.getDirectoryHandle('data', { create: true });
    const workflowHandle = await dataHandle.getDirectoryHandle('workflow', { create: true });

    // 写入文件
    const fileName = `${newProjectId.value}.json`;
    const fileHandle = await workflowHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(newGraph, null, 2));
    await writable.close();

    // 关闭对话框
    closeCreateDialog();

    // 刷新列表
    await refreshFiles();

    // 自动打开新文件
    emit('file-opened', newGraph);

    console.info('项目创建成功:', fileName);
  } catch (err: any) {
    error.value = `创建项目失败: ${err.message}`;
    console.error('创建项目失败:', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 关闭创建对话框
 */
function closeCreateDialog() {
  showCreateDialog.value = false;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 暴露方法
defineExpose({
  refreshFiles,
  createNewProject: createNewFile
});
</script>

<style scoped>
/* ─── 容器 ───────────────────────────────────────────────── */
.file-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

/* ─── 头部 ───────────────────────────────────────────────── */
.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #2d3148;
  flex-shrink: 0;
}

.browser-header h3 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #5a6a82;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #2d3148;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #5a6a82;
  line-height: 1;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: #3d4a64;
  color: #8b9cb3;
}

/* ─── 空/加载/错误状态 ───────────────────────────────────── */
.loading,
.error,
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
  color: #5a6a82;
  text-align: center;
}

.error {
  color: #f56c6c;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.4;
}

.empty h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #8b9cb3;
}

.empty p {
  margin: 0 0 24px;
  font-size: 12px;
  line-height: 1.6;
  color: #5a6a82;
}

.empty-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-large {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.fallback-empty-tip {
  margin: 0;
  font-size: 11px;
  color: #e6a23c;
  line-height: 1.5;
}

/* ─── 文件列表 ───────────────────────────────────────────── */
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.file-list::-webkit-scrollbar {
  width: 4px;
}

.file-list::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb {
  background: #2d3148;
  border-radius: 2px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid #2d3148;
  font-size: 11px;
}

.list-title {
  font-weight: 600;
  color: #5a6a82;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.btn-sort {
  background: transparent;
  border: 1px solid #2d3148;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #5a6a82;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sort:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #8b9cb3;
  border-color: #3d4a64;
}

/* ─── 文件条目 ───────────────────────────────────────────── */
.file-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #2d3148;
  cursor: pointer;
  transition: background-color 0.15s;
  overflow: hidden;
}

.file-item:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.file-item.active {
  background-color: rgba(64, 158, 255, 0.10);
  border-left: 3px solid #409eff;
  padding-left: 9px;
}

.file-icon {
  position: relative;
  margin-right: 8px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.project-icon {
  font-size: 20px;
  opacity: 0.85;
}

.recent-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  background: #67c23a;
  color: #fff;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 6px;
  font-weight: 700;
  line-height: 1.4;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 500;
  color: #c0cfe0;
  margin-bottom: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.file-description {
  font-size: 11px;
  color: #5a6a82;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: #3a4a60;
  align-items: center;
}

.recent-text {
  color: #67c23a;
  font-weight: 500;
}

/* 操作按钮绝对定位在右侧，不占 flex 布局空间 */
.file-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  /* 渐变遮罩让按钮出现时不与文字硬叠 */
  background: linear-gradient(to right, transparent 0%, #1e2030 28%);
}

.file-item:hover .file-actions {
  opacity: 1;
  pointer-events: auto;
}

.file-item.active .file-actions {
  background: linear-gradient(to right, transparent 0%, rgba(25, 35, 60, 0.95) 28%);
}

/* ─── 操作按钮 ───────────────────────────────────────────── */
.btn-action {
  padding: 3px 6px;
  background: transparent;
  border: 1px solid #2d3148;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #5a6a82;
  line-height: 1;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-action:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: #3d4a64;
  color: #8b9cb3;
}

.btn-action.btn-open {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
  border-color: rgba(64, 158, 255, 0.3);
}

.btn-action.btn-open:hover {
  background: rgba(64, 158, 255, 0.28);
  border-color: #409eff;
}

.btn-action.btn-danger:hover {
  background: rgba(245, 108, 108, 0.12);
  border-color: rgba(245, 108, 108, 0.4);
  color: #f56c6c;
}

/* ─── 对话框 ─────────────────────────────────────────────── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: #232536;
  border: 1px solid #2d3148;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.dialog-large {
  min-width: 600px;
  max-width: 800px;
}

.dialog h3 {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 600;
  color: #e8eaf0;
}

/* ─── 模板选择 ───────────────────────────────────────────── */
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.template-item {
  border: 1px solid #2d3148;
  border-radius: 6px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.template-item:hover {
  border-color: rgba(64, 158, 255, 0.4);
  background: rgba(64, 158, 255, 0.06);
}

.template-item.selected {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.12);
}

.template-icon {
  font-size: 28px;
  flex-shrink: 0;
  opacity: 0.9;
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-info h4 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #c0cfe0;
}

.template-info p {
  margin: 0;
  font-size: 12px;
  color: #5a6a82;
  line-height: 1.4;
}

/* ─── 表单 ───────────────────────────────────────────────── */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #8b9cb3;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2d3148;
  border-radius: 4px;
  font-size: 13px;
  color: #c0cfe0;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: #3a4a60;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.04);
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.error-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #f56c6c;
}

.help-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #3a4a60;
}

/* ─── 对话框按钮 ─────────────────────────────────────────── */
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-primary,
.btn-secondary {
  padding: 7px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.btn-primary {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.btn-primary:hover:not(:disabled) {
  background: #66b1ff;
  border-color: #66b1ff;
}

.btn-primary:disabled {
  background: rgba(64, 158, 255, 0.2);
  border-color: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  color: #8b9cb3;
  border-color: #2d3148;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: #3d4a64;
  color: #c0cfe0;
}
</style>
