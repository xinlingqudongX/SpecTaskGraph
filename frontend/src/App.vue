<template>
  <div id="app">
    <!-- 应用头部 -->
    <div class="app-header">
      <h1>工作流图谱编辑器</h1>
      <div class="header-actions">
        <button v-if="currentProject" @click="saveCurrentProject" class="btn-header btn-save">
          💾 保存项目
        </button>
      </div>
    </div>

    <!-- IDE风格主容器 -->
    <div class="ide-container app-layout" :class="{ 'ide-layout': currentWorkspace }">
      <!-- 移动端遮罩层 -->
      <div 
        v-if="isMobile && showWorkspaceSidebar" 
        class="mobile-overlay"
        @click="showWorkspaceSidebar = false"
      ></div>
      <!-- 左侧工作区面板 -->
      <div 
        class="workspace-sidebar left-panel" 
        :class="{ 'collapsed': !showWorkspaceSidebar }"
        :style="{ '--sidebar-width': sidebarWidth + 'px' }"
      >
        <div class="sidebar-header">
          <h3 v-if="showWorkspaceSidebar">工作区</h3>
          <div class="header-controls">
            <button @click="toggleWorkspaceSidebar" class="btn-toggle" :title="showWorkspaceSidebar ? '收起侧边栏' : '展开侧边栏'">
              {{ showWorkspaceSidebar ? '◀' : '▶' }}
            </button>
          </div>
        </div>
        
        <!-- 面板调整器 -->
        <div 
          v-if="showWorkspaceSidebar && isDesktop" 
          class="panel-resizer"
          @mousedown="startResize"
        ></div>
        
        <div v-if="showWorkspaceSidebar" class="sidebar-content">
          <!-- 工作区管理区域 -->
          <div class="workspace-section">
            <div class="section-header">
              <h4>工作区管理</h4>
              <button @click="showWorkspaceManager = !showWorkspaceManager" class="btn-section">
                {{ showWorkspaceManager ? '收起' : '展开' }}
              </button>
            </div>
            
            <div v-if="showWorkspaceManager || !currentWorkspace" class="section-content">
              <WorkspaceManager
                @workspace-selected="handleWorkspaceSelected"
                @workspace-closed="handleWorkspaceClosed"
              />
            </div>
            
            <div v-else-if="currentWorkspace" class="workspace-info">
              <div class="current-workspace">
                <span class="workspace-icon">📁</span>
                <div class="workspace-details">
                  <div class="workspace-name">{{ getWorkspaceName(currentWorkspace) }}</div>
                  <div class="workspace-path">{{ currentWorkspace.path }}</div>
                </div>
                <button @click="showWorkspaceManager = true" class="btn-change">切换</button>
              </div>
            </div>
          </div>

          <!-- 文件浏览器区域 -->
          <div v-if="currentWorkspace" class="file-browser-section">
            <div class="section-header">
              <h4>项目文件</h4>
              <button @click="refreshFiles" class="btn-section">刷新</button>
            </div>
            
            <div class="section-content">
              <FileBrowser
                ref="fileBrowserRef"
                :workspace-handle="currentWorkspace.handle"
                @file-selected="handleFileSelected"
                @file-opened="handleFileOpened"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧编辑器区域 -->
      <div class="editor-area right-panel">
        <!-- 欢迎界面 -->
        <div v-if="!currentWorkspace" class="welcome-screen workspace-selection">
          <div class="welcome-content">
            <div class="welcome-icon">🚀</div>
            <h2>欢迎使用工作流图谱编辑器</h2>
            <p>开始您的工作流设计之旅</p>
            <div class="welcome-actions">
              <button @click="openWorkspaceManager" class="btn-large btn-primary">
                📁 选择工作区
              </button>
            </div>
          </div>
        </div>

        <!-- 工作区已选择但无项目打开 -->
        <div v-else-if="!currentProject" class="project-welcome-screen welcome-screen">
          <div class="project-welcome-content">
            <div class="welcome-icon">📋</div>
            <h2>选择或创建项目</h2>
            <p>从左侧文件浏览器中选择现有项目，或创建新的工作流项目</p>
            <div class="quick-actions">
              <button @click="createNewProject" class="btn-large btn-success">
                ➕ 创建新项目
              </button>
            </div>
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
        <span v-if="currentWorkspace">
          工作区: {{ getWorkspaceName(currentWorkspace) }}
        </span>
        <span v-else>
          未选择工作区
        </span>
      </div>
      <div class="status-item">
        <span v-if="currentProject">
          项目: {{ currentProject.projectName }}
        </span>
        <span v-else>
          未打开项目
        </span>
      </div>
      <div class="status-item">
        <span v-if="autoSaveEnabled" class="status-success">
          ✓ 自动保存已启用
        </span>
        <span v-else class="status-warning">
          ⚠ 自动保存已禁用
        </span>
      </div>
    </div>

    <!-- 通知提示 -->
    <div v-if="notification" class="notification" :class="`notification-${notification.type}`">
      {{ notification.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import WorkspaceManager from './components/WorkspaceManager.vue';
import FileBrowser from './components/FileBrowser.vue';
import WorkflowEditor from './components/WorkflowEditor.vue';
import { WorkflowManagerService } from './services/workflow-manager.service';
import { FileSystemService } from './services/filesystem.service';
import type { WorkflowGraph } from './types/workflow.types';
import { useResponsive, responsiveUtils } from './utils/responsive.utils';
import { keyboardShortcuts } from './services/keyboard-shortcuts.service';

interface WorkspaceInfo {
  id: string;
  path: string;
  handle: FileSystemDirectoryHandle;
}

interface Notification {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const workflowManager = WorkflowManagerService.getInstance();
const fileSystemService = FileSystemService.getInstance();

// 响应式设计
const { viewport, isMobile, isTablet, isDesktop, getPanelWidth } = useResponsive();

const showWorkspaceManager = ref(false);
const showWorkspaceSidebar = ref(!isMobile);
const currentWorkspace = ref<WorkspaceInfo | null>(null);
const currentProject = ref<WorkflowGraph | null>(null);
const currentWorkflowData = ref<any>(null);
const autoSaveEnabled = ref(true);
const notification = ref<Notification | null>(null);
const fileBrowserRef = ref<InstanceType<typeof FileBrowser> | null>(null);

// 响应式面板宽度
const sidebarWidth = ref(getPanelWidth());

/**
 * 处理项目创建完成
 */
async function handleProjectCreated(projectId: string) {
  if (!currentWorkspace.value) {
    showNotification('error', '请先选择工作区');
    return;
  }

  try {
    // 加载新创建的项目
    const project = await workflowManager.loadProject(projectId);
    if (project) {
      await handleFileOpened(project);
      showNotification('success', `项目已创建并打开: ${project.projectName}`);
    }
  } catch (error: any) {
    showNotification('error', `加载新项目失败: ${error.message}`);
  }
}

/**
 * 处理工作区选择
 */
function handleWorkspaceSelected(workspace: WorkspaceInfo) {
  console.log('App.vue: 收到workspace-selected事件', workspace);
  
  currentWorkspace.value = workspace;
  showWorkspaceManager.value = false;
  
  showNotification('success', `工作区已选择: ${getWorkspaceName(workspace)}`);
  
  // 自动刷新文件列表
  refreshFiles();
}

/**
 * 处理工作区关闭
 */
function handleWorkspaceClosed() {
  currentWorkspace.value = null;
  currentProject.value = null;
  currentWorkflowData.value = null;
  showWorkspaceManager.value = true; // 显示工作区管理器让用户选择新工作区
  
  showNotification('info', '工作区已关闭');
}

/**
 * 切换工作区侧边栏显示状态
 */
function toggleWorkspaceSidebar() {
  showWorkspaceSidebar.value = !showWorkspaceSidebar.value;
}

/**
 * 打开工作区管理器
 */
function openWorkspaceManager() {
  showWorkspaceManager.value = true;
  showWorkspaceSidebar.value = true;
}

/**
 * 刷新文件列表
 */
function refreshFiles() {
  if (fileBrowserRef.value) {
    fileBrowserRef.value.refreshFiles();
  } else {
    console.warn('fileBrowserRef.value 为空，无法刷新文件列表');
  }
}

/**
 * 创建新项目
 */
async function createNewProject() {
  if (!currentWorkspace.value) {
    showNotification('error', '请先选择工作区');
    return;
  }

  try {
    // 这里可以调用文件浏览器的创建项目方法
    if (fileBrowserRef.value && typeof fileBrowserRef.value.createNewProject === 'function') {
      await fileBrowserRef.value.createNewProject();
    } else {
      showNotification('info', '请使用左侧文件浏览器创建新项目');
    }
  } catch (error: any) {
    showNotification('error', `创建项目失败: ${error.message}`);
  }
}

/**
 * 获取工作区名称（优先使用name属性，否则从路径中提取）
 */
function getWorkspaceName(pathOrWorkspace: string | WorkspaceInfo): string {
  if (typeof pathOrWorkspace === 'object' && pathOrWorkspace.name) {
    return pathOrWorkspace.name;
  }
  
  const path = typeof pathOrWorkspace === 'string' ? pathOrWorkspace : pathOrWorkspace.path;
  if (!path) return '未知工作区';
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || parts[parts.length - 2] || '工作区';
}

/**
 * 初始化键盘快捷键
 */
function initializeKeyboardShortcuts() {
  keyboardShortcuts.registerMultiple([
    // 工作区管理快捷键
    {
      key: 'o',
      ctrlKey: true,
      description: '打开工作区管理器',
      action: () => openWorkspaceManager(),
    },
    {
      key: 'w',
      ctrlKey: true,
      description: '切换工作区侧边栏',
      action: () => toggleWorkspaceSidebar(),
    },
    
    // 项目管理快捷键
    {
      key: 'n',
      ctrlKey: true,
      description: '创建新项目',
      action: () => createNewProject(),
    },
    {
      key: 's',
      ctrlKey: true,
      description: '保存当前项目',
      action: () => saveCurrentProject(),
    },
    {
      key: 'r',
      ctrlKey: true,
      description: '刷新文件列表',
      action: () => refreshFiles(),
    },
    
    // 界面控制快捷键
    {
      key: 'b',
      ctrlKey: true,
      description: '切换侧边栏显示',
      action: () => toggleWorkspaceSidebar(),
    },
    {
      key: 'Escape',
      description: '关闭对话框/取消操作',
      action: () => handleEscapeKey(),
    },
    
    // 帮助快捷键
    {
      key: '?',
      shiftKey: true,
      description: '显示快捷键帮助',
      action: () => showKeyboardShortcutsHelp(),
    },
  ]);
}

/**
 * 处理视口变化
 */
function handleViewportChange(newViewport: any) {
  // 更新面板宽度
  sidebarWidth.value = getPanelWidth();
  
  // 在移动设备上自动收起侧边栏
  if (newViewport.isMobile && showWorkspaceSidebar.value) {
    showWorkspaceSidebar.value = false;
  }
  
  // 在桌面设备上自动展开侧边栏
  if (newViewport.isDesktop && !showWorkspaceSidebar.value && currentWorkspace.value) {
    showWorkspaceSidebar.value = true;
  }
  
  console.log('视口变化:', {
    breakpoint: newViewport.breakpoint,
    isMobile: newViewport.isMobile,
    sidebarWidth: sidebarWidth.value,
  });
}

/**
 * 处理ESC键
 */
function handleEscapeKey() {
  // 关闭工作区管理器
  if (showWorkspaceManager.value) {
    showWorkspaceManager.value = false;
    return;
  }
  
  // 其他ESC处理逻辑可以在这里添加
}

/**
 * 显示键盘快捷键帮助
 */
function showKeyboardShortcutsHelp() {
  const shortcuts = keyboardShortcuts.getShortcuts();
  const helpText = shortcuts
    .map(shortcut => `${keyboardShortcuts.constructor.formatShortcut(shortcut)}: ${shortcut.description}`)
    .join('\n');
  
  showNotification('info', '键盘快捷键帮助已在控制台显示');
  console.log('键盘快捷键帮助:\n' + helpText);
}

/**
 * 开始调整面板大小
 */
function startResize(event: MouseEvent) {
  if (!isDesktop) return;
  
  event.preventDefault();
  
  const startX = event.clientX;
  const startWidth = sidebarWidth.value;
  
  function handleMouseMove(e: MouseEvent) {
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(280, Math.min(500, startWidth + deltaX));
    sidebarWidth.value = newWidth;
  }
  
  function handleMouseUp() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

/**
 * 处理向右滑动手势
 */
function handleSwipeRight() {
  if (isMobile && !showWorkspaceSidebar.value && currentWorkspace.value) {
    showWorkspaceSidebar.value = true;
  }
}

/**
 * 处理向左滑动手势
 */
function handleSwipeLeft() {
  if (isMobile && showWorkspaceSidebar.value) {
    showWorkspaceSidebar.value = false;
  }
}

/**
 * 处理文件选择
 */
function handleFileSelected(fileName: string) {
  console.log('文件已选择:', fileName);
}

/**
 * 处理文件打开
 */
async function handleFileOpened(graph: WorkflowGraph) {
  try {
    currentProject.value = graph;
    
    // 转换为编辑器需要的格式
    currentWorkflowData.value = convertToEditorFormat(graph);

    // 绑定项目ID到当前工作区句柄，确保保存可用
    // 先删除 WorkspaceManager 用目录名存的旧记录，避免重复显示
    if (currentWorkspace.value) {
      const oldId = currentWorkspace.value.handle.name.replace(/[^a-zA-Z0-9-_]/g, '-');
      if (oldId !== graph.projectId) {
        await fileSystemService.revokeDirectoryAccess(oldId).catch(() => {});
      }
      await fileSystemService.saveDirectoryHandle(
        graph.projectId,
        currentWorkspace.value.handle,
        currentWorkspace.value.path
      );
    } else {
      showNotification('warning', '未选择工作区，项目保存可能失败');
    }
    
    // 启用自动保存
    if (autoSaveEnabled.value) {
      workflowManager.enableAutoSave(graph.projectId, 500);
    }
    
    // 自动收起工作区管理器，专注于编辑
    showWorkspaceManager.value = false;
    
    showNotification('success', `项目已打开: ${graph.projectName}`);
  } catch (error: any) {
    showNotification('error', `打开项目失败: ${error.message}`);
  }
}

/**
 * 处理工作流保存
 */
async function handleWorkflowSave(payload: { elements: unknown[]; timestamp: string }) {
  if (!currentProject.value) {
    showNotification('error', '没有打开的项目');
    return;
  }

  try {
    // 转换为工作流图格式
    const updatedGraph = convertFromEditorFormat(
      currentProject.value,
      payload.elements
    );

    // 更新缓存
    workflowManager.updateCachedGraph(currentProject.value.projectId, updatedGraph);
    
    // 保存到文件
    await workflowManager.saveProject(currentProject.value.projectId, updatedGraph);
    
    currentProject.value = updatedGraph;
    showNotification('success', '项目已保存');
  } catch (error: any) {
    showNotification('error', `保存失败: ${error.message}`);
  }
}

/**
 * 保存当前项目
 */
async function saveCurrentProject() {
  if (!currentProject.value) {
    showNotification('error', '没有打开的项目');
    return;
  }

  try {
    await workflowManager.saveProject(
      currentProject.value.projectId,
      currentProject.value
    );
    showNotification('success', '项目已保存');
  } catch (error: any) {
    showNotification('error', `保存失败: ${error.message}`);
  }
}

/**
 * 转换为编辑器格式
 */
function convertToEditorFormat(graph: WorkflowGraph): any {
  const elements: any[] = [];

  // 转换节点
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
          textContent: node.instructions.guide,
          properties: node.metadata ? Object.entries(node.metadata).map(([key, value]) => ({
            key,
            value: String(value)
          })) : []
        }
      },
      position: node.position || { x: 100, y: 100 }
    });
  });

  // 转换边
  graph.edges.forEach(edge => {
    elements.push({
      group: 'edges',
      data: {
        id: edge.edgeId,
        source: edge.source,
        target: edge.target
      }
    });
  });

  return { elements };
}

/**
 * 从编辑器格式转换
 */
function convertFromEditorFormat(
  originalGraph: WorkflowGraph,
  elements: unknown[]
): WorkflowGraph {
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
          guide: el.data.config?.textContent || '',
          logic: '待补充',
          criteria: '待补充'
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: el.data.status || 'pending',
        position: el.position,
        metadata: el.data.config?.properties?.reduce((acc: any, prop: any) => {
          acc[prop.key] = prop.value;
          return acc;
        }, {})
      });
    } else if (el.group === 'edges') {
      edges.push({
        edgeId: el.data.id,
        source: el.data.source,
        target: el.data.target,
        type: 'sequence'
      });
    }
  });

  return {
    ...originalGraph,
    nodes,
    edges,
    updatedAt: new Date().toISOString()
  };
}

/**
 * 映射节点类型（工作流图 -> 编辑器）
 */
function mapNodeType(type: string): string {
  const typeMap: Record<string, string> = {
    'start': 'root',
    'task': 'text',
    'decision': 'property',
    'parallel': 'text',
    'end': 'text'
  };
  return typeMap[type] || 'text';
}

/**
 * 映射节点类型（编辑器 -> 工作流图）
 */
function mapEditorNodeType(type: string): string {
  const typeMap: Record<string, string> = {
    'root': 'start',
    'text': 'task',
    'property': 'decision',
    'file': 'task',
    'image': 'task',
    'video': 'task',
    'audio': 'task'
  };
  return typeMap[type] || 'task';
}

/**
 * 显示通知
 */
function showNotification(type: Notification['type'], message: string) {
  notification.value = { type, message };
  setTimeout(() => {
    notification.value = null;
  }, 3000);
}

// 组件挂载时的初始化
onMounted(() => {
  console.log('应用已启动');
  
  // 初始化键盘快捷键
  initializeKeyboardShortcuts();
  
  // 监听响应式变化
  responsiveUtils.addListener(handleViewportChange);
  
  // 监听滑动手势
  window.addEventListener('swipe-right', handleSwipeRight);
  window.addEventListener('swipe-left', handleSwipeLeft);
});

// 组件卸载前的清理
onBeforeUnmount(() => {
  // 清理工作流管理器
  workflowManager.clearAllCache();
  
  // 清理键盘快捷键
  keyboardShortcuts.destroy();
  
  // 清理响应式监听器
  responsiveUtils.removeListener(handleViewportChange);
  
  // 清理滑动手势监听器
  window.removeEventListener('swipe-right', handleSwipeRight);
  window.removeEventListener('swipe-left', handleSwipeLeft);
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

.btn-save:hover {
  background: rgba(76, 175, 80, 0.5);
}

/* IDE风格主容器 */
.ide-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: #f5f5f5;
  position: relative;
}

/* 移动端遮罩层 */
.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: none;
}

@media (max-width: 768px) {
  .mobile-overlay {
    display: block;
  }
}

/* 左侧工作区面板 */
.workspace-sidebar {
  width: var(--sidebar-width, 350px);
  background: white;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, transform 0.3s ease;
  z-index: 10;
  position: relative;
}

.workspace-sidebar.collapsed {
  width: 50px;
}

/* 移动端响应式处理 */
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
  
  .workspace-sidebar:not(.collapsed) {
    transform: translateX(0);
  }
  
  .workspace-sidebar.collapsed {
    transform: translateX(-100%);
    width: 280px !important;
  }
}

/* 平板响应式处理 */
@media (min-width: 769px) and (max-width: 1024px) {
  .workspace-sidebar {
    width: 300px;
  }
}

/* 大屏幕响应式处理 */
@media (min-width: 1200px) {
  .workspace-sidebar {
    width: 380px;
  }
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

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

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

.btn-toggle:hover {
  background: #e0e0e0;
  color: #333;
}

/* 面板调整器 */
.panel-resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  z-index: 10;
  transition: background-color 0.2s;
}

.panel-resizer:hover {
  background: #2196f3;
}

.panel-resizer::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 40px;
  background: #ccc;
  border-radius: 1px;
  opacity: 0;
  transition: opacity 0.2s;
}

.panel-resizer:hover::after {
  opacity: 1;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* 工作区管理区域 */
.workspace-section {
  border-bottom: 1px solid #e0e0e0;
}

.section-header {
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.btn-section {
  background: none;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-section:hover {
  background: rgba(102, 126, 234, 0.1);
}

.section-content {
  padding: 16px;
}

.workspace-info {
  padding: 16px;
}

.current-workspace {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.workspace-icon {
  font-size: 20px;
}

.workspace-details {
  flex: 1;
  min-width: 0;
}

.workspace-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  margin-bottom: 2px;
}

.workspace-path {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-change {
  background: #667eea;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-change:hover {
  background: #5a67d8;
  transform: translateY(-1px);
}

/* 文件浏览器区域 */
.file-browser-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-browser-section .section-content {
  flex: 1;
  padding: 0;
  overflow: hidden;
}

/* 右侧编辑器区域 */
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
}

/* 欢迎界面 */
.welcome-screen,
.project-welcome-screen {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.welcome-content,
.project-welcome-content {
  text-align: center;
  padding: 60px 40px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  max-width: 500px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.welcome-content h2,
.project-welcome-content h2 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 28px;
  font-weight: 600;
}

.welcome-content p,
.project-welcome-content p {
  margin: 0 0 32px 0;
  color: #666;
  font-size: 16px;
  line-height: 1.6;
}

.welcome-actions,
.quick-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.btn-large {
  padding: 14px 28px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

.btn-success {
  background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
  color: white;
}

.btn-success:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(76, 175, 80, 0.4);
}

/* 编辑器容器 */
.editor-container {
  flex: 1;
  overflow: hidden;
}

/* 状态栏 */
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

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-success {
  color: #4caf50;
}

.status-warning {
  color: #ff9800;
}

/* 通知提示 */
.notification {
  position: fixed;
  top: 80px;
  right: 24px;
  padding: 16px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
  max-width: 400px;
}

.notification-success {
  background: #4caf50;
  color: white;
}

.notification-error {
  background: #f44336;
  color: white;
}

.notification-warning {
  background: #ff9800;
  color: white;
}

.notification-info {
  background: #2196f3;
  color: white;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .workspace-sidebar {
    width: 300px;
  }
  
  .welcome-content,
  .project-welcome-content {
    padding: 40px 30px;
    max-width: 400px;
  }
  
  .welcome-content h2,
  .project-welcome-content h2 {
    font-size: 24px;
  }
  
  .btn-large {
    padding: 12px 24px;
    font-size: 14px;
  }
}

@media (max-width: 768px) {
  .workspace-sidebar {
    width: 280px;
  }
  
  .workspace-sidebar.collapsed {
    width: 0;
    border-right: none;
  }
  
  .app-header {
    padding: 10px 16px;
  }
  
  .app-header h1 {
    font-size: 18px;
  }
  
  .btn-header {
    padding: 5px 10px;
    font-size: 12px;
  }
  
  .welcome-content,
  .project-welcome-content {
    padding: 30px 20px;
    margin: 20px;
  }
  
  .welcome-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  
  .welcome-content h2,
  .project-welcome-content h2 {
    font-size: 20px;
  }
  
  .welcome-content p,
  .project-welcome-content p {
    font-size: 14px;
  }
  
  .status-bar {
    padding: 4px 16px;
    font-size: 11px;
  }
}

/* 深色主题支持 */
@media (prefers-color-scheme: dark) {
  #app {
    background: #1a1a1a;
  }
  
  .workspace-sidebar {
    background: #2d2d2d;
    border-right-color: #404040;
  }
  
  .sidebar-header {
    background: #333;
    border-bottom-color: #404040;
  }
  
  .sidebar-header h3 {
    color: #e0e0e0;
  }
  
  .section-header {
    background: #333;
    border-bottom-color: #404040;
  }
  
  .section-header h4 {
    color: #b0b0b0;
  }
  
  .current-workspace {
    background: #333;
    border-color: #404040;
  }
  
  .workspace-name {
    color: #e0e0e0;
  }
  
  .workspace-path {
    color: #b0b0b0;
  }
  
  .editor-area {
    background: #1a1a1a;
  }
  
  .welcome-content,
  .project-welcome-content {
    background: #2d2d2d;
    color: #e0e0e0;
  }
  
  .welcome-content h2,
  .project-welcome-content h2 {
    color: #e0e0e0;
  }
  
  .welcome-content p,
  .project-welcome-content p {
    color: #b0b0b0;
  }
}
</style>
