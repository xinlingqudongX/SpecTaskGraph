<template>
  <div id="app">
    <!-- 应用头部 -->
    <div class="app-header">
      <h1>工作流图谱编辑器</h1>
      <div class="header-actions">
        <button v-if="currentProject" @click="exportProject" class="btn-header btn-export">
          ⬇ 导出 JSON
        </button>
        <button v-if="currentProject" @click="saveCurrentProject" class="btn-header btn-save">
          💾 保存项目
        </button>
      </div>
    </div>

    <!-- IDE 风格主容器 -->
    <div class="ide-container" :class="{ 'ide-layout': true }">
      <!-- 移动端遮罩层 -->
      <div
        v-if="isMobile && showSidebar"
        class="mobile-overlay"
        @click="showSidebar = false"
      ></div>

      <!-- 左侧项目面板 -->
      <div
        class="workspace-sidebar left-panel"
        :class="{ collapsed: !showSidebar }"
        :style="{ '--sidebar-width': sidebarWidth + 'px' }"
      >
        <div class="sidebar-header">
          <h3 v-if="showSidebar">项目列表</h3>
          <div class="header-controls">
            <button @click="showSidebar = !showSidebar" class="btn-toggle" :title="showSidebar ? '收起侧边栏' : '展开侧边栏'">
              {{ showSidebar ? '◀' : '▶' }}
            </button>
          </div>
        </div>

        <!-- 面板调整器 -->
        <div v-if="showSidebar && isDesktop" class="panel-resizer" @mousedown="startResize"></div>

        <div v-if="showSidebar" class="sidebar-content">
          <ProjectList
            ref="projectListRef"
            :current-project-id="currentProject?.projectId"
            @project-opened="handleProjectOpened"
          />
        </div>
      </div>

      <!-- 右侧编辑器区域 -->
      <div class="editor-area right-panel">
        <!-- 欢迎界面（无项目时） -->
        <div v-if="!currentProject" class="welcome-screen">
          <div class="welcome-content">
            <div class="welcome-icon">🚀</div>
            <h2>欢迎使用工作流图谱编辑器</h2>
            <p>从左侧选择项目，或点击"新建项目"开始设计工作流</p>
            <button @click="showSidebar = true" class="btn-large btn-primary">
              📋 打开项目列表
            </button>
          </div>
        </div>

        <!-- 工作流编辑器 -->
        <div v-else class="editor-container">
          <WorkflowEditor
            :workflow-data="currentWorkflowData"
            :project-name="currentProject.projectName"
            :project-id="currentProject.projectId"
            :collaboration-enabled="true"
            @save="handleWorkflowSave"
          />
        </div>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-item">
        <span v-if="currentProject">项目: {{ currentProject.projectName }}</span>
        <span v-else>未打开项目</span>
      </div>
      <div class="status-item">
        <span class="status-success">✓ 数据存储于服务器</span>
      </div>
      <div class="status-item">
        <span v-if="autoSaveEnabled" class="status-success">✓ 自动保存已启用</span>
        <span v-else class="status-warning">⚠ 自动保存已禁用</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useToast } from 'vue-toastification';
import ProjectList from './components/ProjectList.vue';
import WorkflowEditor from './components/WorkflowEditor.vue';
import { WorkflowManagerService } from './services/workflow-manager.service';
import type { WorkflowGraph } from './types/workflow.types';
import { useResponsive, responsiveUtils } from './utils/responsive.utils';
import { keyboardShortcuts } from './services/keyboard-shortcuts.service';

const toast = useToast();
const workflowManager = WorkflowManagerService.getInstance();
const { isMobile, isDesktop, getPanelWidth } = useResponsive();

const showSidebar = ref(!isMobile);
const sidebarWidth = ref(getPanelWidth());
const currentProject = ref<WorkflowGraph | null>(null);
const currentWorkflowData = ref<any>(null);
const autoSaveEnabled = ref(true);
const projectListRef = ref<InstanceType<typeof ProjectList> | null>(null);

// ─── 项目操作 ──────────────────────────────────────────────

function handleProjectOpened(graph: WorkflowGraph, _id: string, _name: string) {
  currentProject.value = graph;
  currentWorkflowData.value = convertToEditorFormat(graph);

  if (autoSaveEnabled.value) {
    workflowManager.enableAutoSave(graph.projectId, 500);
  }

  toast.success(`项目已打开: ${graph.projectName}`);
}

async function handleWorkflowSave(payload: { elements: unknown[]; timestamp: string }) {
  if (!currentProject.value) return;

  try {
    const updatedGraph = convertFromEditorFormat(currentProject.value, payload.elements);
    workflowManager.updateCachedGraph(currentProject.value.projectId, updatedGraph);
    await workflowManager.saveProject(currentProject.value.projectId, updatedGraph);
    currentProject.value = updatedGraph;
    toast.success('项目已保存');
  } catch (error: any) {
    toast.error(`保存失败: ${error.message}`);
  }
}

async function saveCurrentProject() {
  if (!currentProject.value) return;
  try {
    await workflowManager.saveProject(currentProject.value.projectId, currentProject.value);
    toast.success('项目已保存');
  } catch (error: any) {
    toast.error(`保存失败: ${error.message}`);
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

// ─── 格式转换（与原 App.vue 保持一致） ──────────────────────

function convertToEditorFormat(graph: WorkflowGraph): any {
  const elements: any[] = [];

  graph.nodes.forEach(node => {
    elements.push({
      group: 'nodes',
      data: {
        id: node.nodeId,
        name: node.name,
        title: node.name,
        type: mapNodeType(node.type),
        status: node.status,
        config: {
          textContent: node.instructions.requirement,
          properties: node.metadata
            ? Object.entries(node.metadata).map(([key, value]) => ({ key, value: String(value) }))
            : [],
        },
      },
      position: node.position || { x: 100, y: 100 },
    });
  });

  graph.edges.forEach(edge => {
    elements.push({
      group: 'edges',
      data: { id: edge.edgeId, source: edge.source, target: edge.target },
    });
  });

  return { elements };
}

function convertFromEditorFormat(originalGraph: WorkflowGraph, elements: unknown[]): WorkflowGraph {
  const nodes: any[] = [];
  const edges: any[] = [];

  (elements as any[]).forEach(el => {
    if (el.group === 'nodes') {
      nodes.push({
        nodeId: el.data.id,
        type: mapEditorNodeType(el.data.type),
        name: el.data.title || el.data.name,
        description: el.data.config?.textContent || '',
        instructions: {
          requirement: el.data.config?.textContent || '',
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: el.data.status || 'pending',
        position: el.position,
        metadata: el.data.config?.properties?.reduce((acc: any, prop: any) => {
          acc[prop.key] = prop.value;
          return acc;
        }, {}),
      });
    } else if (el.group === 'edges') {
      edges.push({
        edgeId: el.data.id,
        source: el.data.source,
        target: el.data.target,
        type: 'sequence',
      });
    }
  });

  return { ...originalGraph, nodes, edges, updatedAt: new Date().toISOString() };
}

function mapNodeType(type: string): string {
  const m: Record<string, string> = { start: 'root', task: 'text', decision: 'property', parallel: 'text', end: 'text' };
  return m[type] || 'text';
}

function mapEditorNodeType(type: string): string {
  const m: Record<string, string> = { root: 'start', text: 'task', property: 'decision', file: 'task', image: 'task', video: 'task', audio: 'task' };
  return m[type] || 'task';
}

// ─── 面板宽度调整 ──────────────────────────────────────────

function startResize(event: MouseEvent) {
  if (!isDesktop) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = sidebarWidth.value;

  function onMove(e: MouseEvent) {
    sidebarWidth.value = Math.max(240, Math.min(500, startWidth + (e.clientX - startX)));
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

function handleViewportChange(newViewport: any) {
  sidebarWidth.value = getPanelWidth();
  if (newViewport.isMobile && showSidebar.value) showSidebar.value = false;
}

onMounted(() => {
  keyboardShortcuts.registerMultiple([
    { key: 's', ctrlKey: true, description: '保存项目', action: saveCurrentProject },
    { key: 'b', ctrlKey: true, description: '切换侧边栏', action: () => { showSidebar.value = !showSidebar.value; } },
    { key: 'e', ctrlKey: true, description: '导出 JSON', action: exportProject },
  ]);
  responsiveUtils.addListener(handleViewportChange);
});

onBeforeUnmount(() => {
  workflowManager.clearAllCache();
  keyboardShortcuts.destroy();
  responsiveUtils.removeListener(handleViewportChange);
});
</script>

<style scoped>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f5f5f5;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.app-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-header {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s;
}

.btn-header:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.btn-save {
  background: rgba(76, 175, 80, 0.3);
  border-color: rgba(76, 175, 80, 0.5);
}

.btn-save:hover { background: rgba(76, 175, 80, 0.5); }

.btn-export {
  background: rgba(33, 150, 243, 0.3);
  border-color: rgba(33, 150, 243, 0.5);
}

.btn-export:hover { background: rgba(33, 150, 243, 0.5); }

.ide-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: #f5f5f5;
  position: relative;
}

.mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

.workspace-sidebar {
  width: var(--sidebar-width, 300px);
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  z-index: 10;
  position: relative;
}

.workspace-sidebar.collapsed { width: 50px; }

@media (max-width: 768px) {
  .workspace-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 1000;
    transform: translateX(-100%);
    width: 280px !important;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
  }
  .workspace-sidebar:not(.collapsed) { transform: translateX(0); }
  .workspace-sidebar.collapsed { transform: translateX(-100%); }
}

.sidebar-header {
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.header-controls { display: flex; align-items: center; gap: 8px; }

.btn-toggle {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 12px;
  transition: all 0.2s;
}

.btn-toggle:hover { background: #e0e0e0; color: #333; }

.panel-resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  z-index: 10;
}

.panel-resizer:hover { background: #2196f3; }

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
}

.welcome-screen {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.welcome-content {
  text-align: center;
  padding: 60px 40px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  max-width: 480px;
}

.welcome-icon { font-size: 64px; margin-bottom: 24px; }

.welcome-content h2 {
  margin: 0 0 16px;
  color: #333;
  font-size: 26px;
  font-weight: 600;
}

.welcome-content p {
  margin: 0 0 32px;
  color: #666;
  font-size: 15px;
  line-height: 1.6;
}

.btn-large {
  padding: 14px 28px;
  font-size: 15px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

.editor-container { flex: 1; overflow: hidden; }

.status-bar {
  background: #2c3e50;
  color: white;
  padding: 6px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-top: 1px solid #34495e;
  z-index: 100;
}

.status-item { display: flex; align-items: center; gap: 8px; }
.status-success { color: #4caf50; }
.status-warning { color: #ff9800; }


@media (max-width: 768px) {
  .app-header { padding: 10px 16px; }
  .app-header h1 { font-size: 18px; }
  .btn-header { padding: 5px 10px; font-size: 12px; }
  .status-bar { padding: 4px 16px; font-size: 11px; }
}
</style>
