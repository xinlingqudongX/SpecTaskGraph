<template>
  <el-container class="app-root">
    <!-- 顶部 Header -->
    <el-header class="app-header" height="52px">
      <div class="header-left">
        <el-button
          class="sidebar-toggle-btn"
          :icon="showSidebar ? 'Fold' : 'Expand'"
          text
          @click="showSidebar = !showSidebar"
          title="切换侧边栏 (Ctrl+B)"
        />
        <span class="app-title">FlowInOne</span>
        <span v-if="currentProject" class="project-badge">
          {{ currentProject.projectName }}
        </span>
      </div>
      <div class="header-right">
        <template v-if="currentProject">
          <el-button
            type="primary"
            plain
            size="small"
            :icon="'Download'"
            @click="exportProject"
          >
            导出
          </el-button>
          <el-button
            type="success"
            size="small"
            :icon="'DocumentChecked'"
            @click="saveCurrentProject"
          >
            保存
          </el-button>
        </template>
      </div>
    </el-header>

    <el-container class="main-body">
      <!-- 移动端遮罩 -->
      <div
        v-if="isMobileScreen && showSidebar"
        class="mobile-overlay"
        @click="showSidebar = false"
      />

      <!-- 左侧面板 -->
      <el-aside
        class="app-sidebar"
        :class="{ collapsed: !showSidebar }"
        :style="showSidebar ? { width: sidebarWidth + 'px' } : { width: '0px' }"
      >
        <!-- 侧边栏 Tab 切换 -->
        <div class="sidebar-tabs">
          <button
            class="sidebar-tab"
            :class="{ active: activeTab === 'server' }"
            @click="activeTab = 'server'"
          >在线项目</button>
          <button
            class="sidebar-tab"
            :class="{ active: activeTab === 'local' }"
            @click="activeTab = 'local'"
          >本地工作区</button>
          <button
            class="sidebar-tab"
            :class="{ active: activeTab === 'roles' }"
            @click="activeTab = 'roles'"
          >角色</button>
        </div>

        <!-- 面板拖拽调整手柄 -->
        <div class="panel-resizer" @mousedown="startResize" />

        <!-- 在线项目面板 -->
        <el-scrollbar v-if="activeTab === 'server'" class="sidebar-scroll">
          <ProjectList
            ref="projectListRef"
            :current-project-id="currentProject?.projectId"
            @project-opened="handleProjectOpened"
          />
        </el-scrollbar>

        <!-- 角色管理面板 -->
        <el-scrollbar v-else-if="activeTab === 'roles'" class="sidebar-scroll">
          <AgentRoleManager />
        </el-scrollbar>

        <!-- 本地工作区面板 -->
        <div v-else class="local-workspace-panel">
          <!-- 工作区选择器 -->
          <WorkspaceManager
            @workspace-selected="handleWorkspaceSelected"
            @workspace-closed="handleWorkspaceClosed"
          />

          <!-- 文件浏览器（选择工作区后显示，支持 FSAPI 和降级两种模式） -->
          <div v-if="currentWorkspaceHandle || currentWorkspaceFallbackFiles" class="file-browser-wrapper">
            <div class="file-browser-header">
              <span>工作流文件</span>
              <el-button link size="small" @click="fileBrowserRef?.refreshFiles()">
                <el-icon><Refresh /></el-icon>
              </el-button>
            </div>
            <FileBrowser
              ref="fileBrowserRef"
              :workspace-handle="currentWorkspaceHandle ?? undefined"
              :fallback-files="currentWorkspaceFallbackFiles ?? undefined"
              @file-opened="handleLocalFileOpened"
            />
          </div>
        </div>
      </el-aside>

      <!-- 右侧主区域 -->
      <el-main class="editor-main">
        <!-- 欢迎页 -->
        <div v-if="!currentProject" class="welcome-screen">
          <div class="welcome-card">
            <el-icon class="welcome-icon" :size="64"><Promotion /></el-icon>
            <h2>欢迎使用 FlowInOne</h2>
            <p>从左侧选择项目，或新建项目开始设计工作流</p>
            <el-button
              type="primary"
              size="large"
              :icon="'FolderOpened'"
              @click="showSidebar = true"
            >
              打开项目列表
            </el-button>
          </div>
        </div>

        <!-- 编辑器 -->
        <div v-else class="editor-container">
          <WorkflowEditor
            ref="workflowEditorRef"
            :workflow-data="currentWorkflowData"
            :project-name="currentProject.projectName"
            :project-id="currentProject.projectId"
            :collaboration-enabled="true"
            @save="handleWorkflowSave"
          />
        </div>
      </el-main>
    </el-container>

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-left">
        <span class="status-dot" />
        <span>{{ currentProject ? currentProject.projectName : '未打开项目' }}</span>
      </div>
      <div class="status-center">
        <template v-if="activeTab === 'roles'">
          <el-icon class="status-icon-ok"><CircleCheck /></el-icon>
          <span>角色管理</span>
        </template>
        <template v-else-if="activeTab === 'local' && currentWorkspaceHandle">
          <el-icon class="status-icon-ok"><FolderOpened /></el-icon>
          <span>本地工作区：{{ currentWorkspaceName }}</span>
        </template>
        <template v-else-if="activeTab === 'local' && currentWorkspaceFallbackFiles">
          <el-icon class="status-icon-ok"><FolderOpened /></el-icon>
          <span>本地工作区（只读）：{{ currentWorkspaceName }}</span>
        </template>
        <template v-else>
          <el-icon class="status-icon-ok"><CircleCheck /></el-icon>
          <span>数据存储于服务器</span>
        </template>
      </div>
      <div class="status-right">
        <template v-if="autoSaveEnabled">
          <el-icon class="status-icon-ok"><Clock /></el-icon>
          <span>自动保存已启用</span>
        </template>
        <template v-else>
          <el-icon class="status-icon-warn"><Warning /></el-icon>
          <span>自动保存已禁用</span>
        </template>
      </div>
    </div>
  </el-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, FolderOpened } from '@element-plus/icons-vue';
import ProjectList from './components/ProjectList.vue';
import WorkflowEditor from './components/WorkflowEditor.vue';
import WorkspaceManager from './components/WorkspaceManager.vue';
import FileBrowser from './components/FileBrowser.vue';
import AgentRoleManager from './components/AgentRoleManager.vue';
import { WorkflowManagerService } from './services/workflow-manager.service';
import type { WorkflowGraph } from './types/workflow.types';
import { keyboardShortcuts } from './services/keyboard-shortcuts.service';

const workflowManager = WorkflowManagerService.getInstance();

const isMobileScreen = computed(() => window.innerWidth <= 768);
const showSidebar = ref(window.innerWidth > 768);
const sidebarWidth = ref(280);
const currentProject = ref<WorkflowGraph | null>(null);
const currentWorkflowData = ref<any>(null);
const autoSaveEnabled = ref(true);
const projectListRef = ref<InstanceType<typeof ProjectList> | null>(null);
const fileBrowserRef = ref<InstanceType<typeof FileBrowser> | null>(null);
const workflowEditorRef = ref<{ triggerSave: () => void } | null>(null);

// 侧边栏 Tab
const activeTab = ref<'server' | 'local' | 'roles'>('server');

// 本地工作区状态
const currentWorkspaceHandle = ref<FileSystemDirectoryHandle | null>(null);
const currentWorkspaceFallbackFiles = ref<Array<{ name: string; content: string; size: number; lastModified: Date }> | null>(null);
const currentWorkspaceName = ref('');
// 本地模式下当前文件 ID，用于保存时回写
const currentLocalProjectId = ref('');

// ─── 本地工作区操作 ─────────────────────────────────────────

function handleWorkspaceSelected(workspace: { handle: FileSystemDirectoryHandle | null; path: string; isFallback?: boolean; fallbackFiles?: Array<{ name: string; content: string; size: number; lastModified: Date }> }) {
  currentWorkspaceHandle.value = workspace.handle;
  currentWorkspaceFallbackFiles.value = workspace.fallbackFiles ?? null;
  currentWorkspaceName.value = workspace.path;
}

function handleWorkspaceClosed() {
  currentWorkspaceHandle.value = null;
  currentWorkspaceFallbackFiles.value = null;
  currentWorkspaceName.value = '';
  // 若当前打开的是本地文件，关闭工作区时清空编辑器
  if (activeTab.value === 'local') {
    currentProject.value = null;
    currentWorkflowData.value = null;
    currentLocalProjectId.value = '';
  }
}

function handleLocalFileOpened(graph: WorkflowGraph) {
  currentProject.value = graph;
  currentWorkflowData.value = convertToEditorFormat(graph);
  currentLocalProjectId.value = graph.projectId;
  ElMessage.success(`已打开：${graph.projectName}`);
}

// ─── 项目操作 ──────────────────────────────────────────────

function handleProjectOpened(graph: WorkflowGraph, _id: string, _name: string) {
  currentProject.value = graph;
  currentWorkflowData.value = convertToEditorFormat(graph);
  ElMessage.success(`项目已打开: ${graph.projectName}`);
}

async function handleWorkflowSave(payload: { elements: unknown[]; timestamp: string }) {
  if (!currentProject.value) return;

  try {
    const updatedGraph = convertFromEditorFormat(currentProject.value, payload.elements);

    if (activeTab.value === 'local' && currentWorkspaceHandle.value) {
      // 本地工作区模式：写回本地 JSON 文件
      await saveToLocalFile(updatedGraph);
    } else {
      // 服务器模式：走 REST API
      await workflowManager.saveProject(currentProject.value.projectId, updatedGraph);
    }

    currentProject.value = updatedGraph;
    ElMessage.success('项目已保存');
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`);
  }
}

/** 将工作流图写入本地工作区目录 src/data/workflow/{id}.json */
async function saveToLocalFile(graph: WorkflowGraph) {
  if (!currentWorkspaceHandle.value) throw new Error('未选择工作区');
  const srcHandle = await currentWorkspaceHandle.value.getDirectoryHandle('src', { create: true });
  const dataHandle = await srcHandle.getDirectoryHandle('data', { create: true });
  const workflowHandle = await dataHandle.getDirectoryHandle('workflow', { create: true });
  const fileHandle = await workflowHandle.getFileHandle(`${graph.projectId}.json`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(graph, null, 2));
  await writable.close();
}

function saveCurrentProject() {
  if (!currentProject.value) return;
  // 优先通过编辑器从 LogicFlow 画布读取最新状态再保存，
  // 避免直接发送旧快照导致已删除节点被重新提交
  if (workflowEditorRef.value) {
    workflowEditorRef.value.triggerSave();
  }
}

function exportProject() {
  if (!currentProject.value) return;
  const json = JSON.stringify(currentProject.value, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentProject.value.projectName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 格式转换 ──────────────────────────────────────────────

function convertToEditorFormat(graph: WorkflowGraph): any {
  const elements: any[] = [];

  graph.nodes.forEach(node => {
    const metadata = (node.metadata ?? {}) as Record<string, unknown>;
    // 读取后端 attributes._visualType（保存时写入），恢复正确的画布渲染类型
    // 若不存在则 fallback 到 workflow NodeType → logicflow NodeType 的语义映射
    const visualType = (metadata._visualType as string | undefined) ?? mapNodeType(node.type);
    const attributeList = Array.isArray(metadata.attributes)
      ? metadata.attributes
          .filter((item): item is { key?: unknown; value?: unknown } => typeof item === 'object' && item !== null)
          .map((item) => ({ key: String(item.key ?? ''), value: String(item.value ?? '') }))
      : [];
    const propertyList = Array.isArray(metadata.properties)
      ? metadata.properties
          .filter((item): item is { key?: unknown; value?: unknown } => typeof item === 'object' && item !== null)
          .map((item) => ({ key: String(item.key ?? ''), value: String(item.value ?? '') }))
      : Object.entries(metadata)
          .filter(([key]) => ![
            '_visualType',
            'resourceUrl',
            'resourceName',
            'attributes',
            'properties',
            'expanded',
            'width',
            'height',
            'agentRoleId',
          ].includes(key))
          .map(([key, value]) => ({ key, value: String(value) }));

    elements.push({
      group: 'nodes',
      data: {
        id: node.nodeId,
        name: node.name,
        title: node.name,
        type: visualType,
        status: node.status,
        config: {
          textContent: node.instructions.requirement,
          requirement: node.instructions.requirement,
          prompt: node.instructions.prompt ?? null,
          agentRoleId: typeof metadata.agentRoleId === 'string' ? metadata.agentRoleId : null,
          resourceUrl: typeof metadata.resourceUrl === 'string' ? metadata.resourceUrl : '',
          resourceName: typeof metadata.resourceName === 'string' ? metadata.resourceName : '',
          properties: propertyList,
          attributes: attributeList,
        },
      },
      position: node.position || { x: 100, y: 100 },
    });
  });

  graph.edges.forEach(edge => {
    elements.push({
      group: 'edges',
      data: {
        id: edge.edgeId,
        source: edge.source,
        target: edge.target,
        style: edge.style,
        pointsList: edge.pointsList,
        startPoint: edge.startPoint,
        endPoint: edge.endPoint,
      },
    });
  });

  return { elements };
}

function convertFromEditorFormat(originalGraph: WorkflowGraph, elements: unknown[]): WorkflowGraph {
  const rawNodes: any[] = [];
  const edges: any[] = [];

  (elements as any[]).forEach(el => {
    if (el.group === 'nodes') {
      const config = el.data.config ?? {};
      const normalizedProperties = Array.isArray(config.properties)
        ? config.properties.map((prop: any) => ({
            key: String(prop?.key ?? ''),
            value: String(prop?.value ?? ''),
          }))
        : [];
      const normalizedAttributes = Array.isArray(config.attributes)
        ? config.attributes.map((attr: any) => ({
            key: String(attr?.key ?? ''),
            value: String(attr?.value ?? ''),
          }))
        : [];

      rawNodes.push({
        nodeId: el.data.id,
        type: mapEditorNodeType(el.data.type),
        name: el.data.title || el.data.name,
        description: config.textContent || config.requirement || '',
        instructions: {
          requirement: config.requirement ?? config.textContent ?? '',
          prompt: config.prompt ?? undefined,
        },
        assets: [],
        outputs: [],
        status: el.data.status || 'pending',
        position: el.position,
        metadata: {
          // 保留视觉类型，加载时用于恢复正确的节点渲染类型（image/video/audio/file 等）
          _visualType: el.data.type,
          ...(typeof config.agentRoleId === 'string' ? { agentRoleId: config.agentRoleId } : {}),
          resourceUrl: config.resourceUrl ?? '',
          resourceName: config.resourceName ?? '',
          properties: normalizedProperties,
          attributes: normalizedAttributes,
        },
      });
    } else if (el.group === 'edges') {
      edges.push({
        edgeId: el.data.id,
        source: el.data.source,
        target: el.data.target,
        type: 'sequence',
        style: (el.data as any).style,
        pointsList: (el.data as any).pointsList,
        startPoint: (el.data as any).startPoint,
        endPoint: (el.data as any).endPoint,
      });
    }
  });

  const dependenciesMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const current = dependenciesMap.get(edge.target) ?? [];
    current.push(edge.source);
    dependenciesMap.set(edge.target, current);
  });

  const nodes = rawNodes.map((node) => ({
    ...node,
    // 连线关系以边为准重建 dependencies，保存时再映射到 parentNodeId
    dependencies: dependenciesMap.get(node.nodeId) ?? [],
  }));

  return { ...originalGraph, nodes, edges, updatedAt: new Date().toISOString() };
}

// workflow.types NodeType → logicflow.types NodeType
function mapNodeType(type: string): string {
  const m: Record<string, string> = {
    start: 'root', task: 'text', decision: 'property', parallel: 'text', end: 'text',
    // logicflow.types 自身（透传，防止二次错误转换）
    root: 'root', text: 'text', property: 'property',
    // LogicFlow 注册类名兜底
    RootNode: 'root', TextNode: 'text', PropertyNode: 'property',
  };
  return m[type] || 'text';
}

// logicflow.types / 注册类名 / workflow.types → workflow.types NodeType
function mapEditorNodeType(type: string): string {
  const m: Record<string, string> = {
    // logicflow.types NodeType（正常路径）
    root: 'start', text: 'task', property: 'decision',
    file: 'task', image: 'task', video: 'task', audio: 'task',
    // LogicFlow 注册类名（异常路径兜底）
    RootNode: 'start', TextNode: 'task', PropertyNode: 'decision',
    FileNode: 'task', ImageNode: 'task', VideoNode: 'task', AudioNode: 'task',
    // workflow.types 自身（透传）
    start: 'start', task: 'task', decision: 'decision', parallel: 'parallel', end: 'end',
  };
  return m[type] || 'task';
}

// ─── 面板宽度拖拽 ──────────────────────────────────────────

function startResize(event: MouseEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = sidebarWidth.value;

  function onMove(e: MouseEvent) {
    sidebarWidth.value = Math.max(220, Math.min(500, startWidth + (e.clientX - startX)));
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

// ─── 生命周期 ──────────────────────────────────────────────

onMounted(() => {
  keyboardShortcuts.registerMultiple([
    { key: 's', ctrlKey: true, description: '保存项目', action: saveCurrentProject },
    { key: 'b', ctrlKey: true, description: '切换侧边栏', action: () => { showSidebar.value = !showSidebar.value; } },
    { key: 'e', ctrlKey: true, description: '导出 JSON', action: exportProject },
  ]);
});

onBeforeUnmount(() => {
  keyboardShortcuts.destroy();
});
</script>

<style scoped>
/* ─── 根容器 ─────────────────────────────────── */
.app-root {
  height: 100vh;
  flex-direction: column;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* ─── Header ─────────────────────────────────── */
.app-header {
  background: #1a1d27;
  color: #e8eaf0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #2d3148;
  flex-shrink: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-toggle-btn {
  color: #8b9cb3 !important;
  font-size: 16px;
}

.sidebar-toggle-btn:hover {
  color: #fff !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

.app-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.project-badge {
  font-size: 12px;
  color: #8b9cb3;
  background: rgba(255, 255, 255, 0.07);
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid #2d3148;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ─── 主体 ───────────────────────────────────── */
.main-body {
  flex: 1;
  overflow: hidden;
}

.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

/* ─── 侧边栏 ─────────────────────────────────── */
.app-sidebar {
  background: #1a1d27;
  border-right: 1px solid #2d3148;
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
  overflow: visible;
  position: relative;
  flex-shrink: 0;
}

.app-sidebar.collapsed {
  width: 0 !important;
  overflow: hidden;
}

/* ─── 侧边栏 Tab ─────────────────────────────── */
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #2d3148;
  flex-shrink: 0;
}

.sidebar-tab {
  flex: 1;
  padding: 10px 0;
  font-size: 11px;
  font-weight: 600;
  color: #5a6a82;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s, border-bottom 0.2s;
  border-bottom: 2px solid transparent;
}

.sidebar-tab:hover {
  color: #8b9cb3;
}

.sidebar-tab.active {
  color: #409eff;
  border-bottom-color: #409eff;
}

/* ─── 本地工作区面板 ─────────────────────────── */
.local-workspace-panel {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.file-browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #5a6a82;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  border-top: 1px solid #2d3148;
}

.file-browser-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-title {
  padding: 12px 16px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #5a6a82;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid #2d3148;
  flex-shrink: 0;
}

.panel-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 20;
  background: transparent;
}

.panel-resizer:hover {
  background: #409eff44;
}

.sidebar-scroll {
  flex: 1;
  height: 0;
}

/* ─── 主区域 ─────────────────────────────────── */
.editor-main {
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f0f2f5;
}

/* ─── 欢迎页 ─────────────────────────────────── */
.welcome-screen {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f0f2f5;
}

.welcome-card {
  background: #fff;
  border-radius: 16px;
  padding: 60px 48px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  max-width: 420px;
}

.welcome-icon {
  color: #409eff;
  margin-bottom: 20px;
}

.welcome-card h2 {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 600;
  color: #1a1d27;
}

.welcome-card p {
  margin: 0 0 28px;
  color: #8b9cb3;
  font-size: 14px;
  line-height: 1.6;
}

/* ─── 编辑器容器 ─────────────────────────────── */
.editor-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ─── 状态栏 ─────────────────────────────────── */
.status-bar {
  background: #1a1d27;
  color: #8b9cb3;
  padding: 0 20px;
  height: 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  border-top: 1px solid #2d3148;
  flex-shrink: 0;
  z-index: 100;
}

.status-left,
.status-center,
.status-right {
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: #409eff;
  border-radius: 50%;
}

.status-icon-ok {
  color: #67c23a;
  font-size: 12px;
}

.status-icon-warn {
  color: #e6a23c;
  font-size: 12px;
}

/* ─── 响应式 ─────────────────────────────────── */
@media (max-width: 768px) {
  .app-sidebar {
    position: fixed;
    top: 52px;
    left: 0;
    height: calc(100vh - 52px - 28px);
    z-index: 1000;
    box-shadow: 2px 0 16px rgba(0, 0, 0, 0.3);
  }

  .project-badge { display: none; }
}
</style>
