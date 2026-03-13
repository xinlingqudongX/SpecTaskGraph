<template>
  <div class="workspace-manager">
    <div class="workspace-header">
      <h2>工作区管理</h2>
      <button @click="selectWorkspace" class="btn-primary">
        {{ currentWorkspace ? '切换工作区' : '选择工作区' }}
      </button>
    </div>

    <div v-if="currentWorkspace" class="workspace-info">
      <div class="info-item">
        <span class="label">当前工作区:</span>
        <span class="value">{{ currentWorkspace.path }}</span>
      </div>
      <div class="info-item">
        <span class="label">项目ID:</span>
        <span class="value">{{ currentWorkspace.id }}</span>
      </div>
      <div class="info-item">
        <span class="label">权限状态:</span>
        <span class="value" :class="permissionClass">
          {{ permissionText }}
        </span>
      </div>
      <div class="info-item">
        <span class="label">最后访问:</span>
        <span class="value">{{ formatDate(currentWorkspace.lastAccessed) }}</span>
      </div>
    </div>

    <div v-else class="no-workspace">
      <p>尚未选择工作区</p>
      <p class="hint">请点击上方按钮选择项目目录</p>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <div v-if="recentWorkspaces.length > 0" class="recent-workspaces">
      <h3>最近使用的工作区</h3>
      <ul>
        <li v-for="workspace in recentWorkspaces" :key="workspace.id" class="workspace-item">
          <div class="workspace-item-info">
            <span class="workspace-name">{{ workspace.path }}</span>
            <span class="workspace-date">{{ formatDate(workspace.lastAccessed) }}</span>
          </div>
          <div class="workspace-actions">
            <button @click="loadWorkspace(workspace.id)" class="btn-small">打开</button>
            <button @click="removeWorkspace(workspace.id)" class="btn-small btn-danger">删除</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { FileSystemService } from '../services/filesystem.service';
import type { PermissionState } from '../types/workflow.types';

interface WorkspaceInfo {
  id: string;
  path: string;
  lastAccessed: Date;
  permissions: PermissionState;
  handle: FileSystemDirectoryHandle;
}

// 定义事件
interface Emits {
  (e: 'workspace-selected', workspace: WorkspaceInfo): void;
  (e: 'workspace-closed'): void;
}

const emit = defineEmits<Emits>();

const fileSystemService = FileSystemService.getInstance();

const currentWorkspace = ref<WorkspaceInfo | null>(null);
const recentWorkspaces = ref<WorkspaceInfo[]>([]);
const error = ref<string>('');

const permissionClass = computed(() => {
  if (!currentWorkspace.value) return '';
  switch (currentWorkspace.value.permissions) {
    case 'granted':
      return 'permission-granted';
    case 'denied':
      return 'permission-denied';
    case 'prompt':
      return 'permission-prompt';
    default:
      return '';
  }
});

const permissionText = computed(() => {
  if (!currentWorkspace.value) return '';
  switch (currentWorkspace.value.permissions) {
    case 'granted':
      return '已授权';
    case 'denied':
      return '已拒绝';
    case 'prompt':
      return '待授权';
    default:
      return '未知';
  }
});

/**
 * 选择工作区
 */
async function selectWorkspace() {
  try {
    error.value = '';
    console.log('开始选择工作区...');
    
    // 检查浏览器支持
    if (!FileSystemService.isSupported()) {
      error.value = '您的浏览器不支持文件系统访问功能，请使用最新版本的Chrome、Edge或其他支持的浏览器';
      console.error('浏览器不支持File System Access API');
      return;
    }

    console.log('浏览器支持File System Access API，请求目录访问...');
    
    // 请求目录访问
    const handle = await fileSystemService.requestDirectoryAccess();
    console.log('目录访问成功，目录名称:', handle.name);
    
    // 生成项目ID（使用目录名称）
    const projectId = handle.name.replace(/[^a-zA-Z0-9-_]/g, '-');
    console.log('生成项目ID:', projectId);
    
    // 保存目录句柄
    await fileSystemService.saveDirectoryHandle(projectId, handle, handle.name);
    console.log('目录句柄保存成功');
    
    // 检查权限
    const permission = await fileSystemService.checkPermission(handle);
    console.log('权限状态:', permission);
    
    // 更新当前工作区
    currentWorkspace.value = {
      id: projectId,
      path: handle.name,
      lastAccessed: new Date(),
      permissions: permission,
      handle
    };
    
    console.log('当前工作区已更新:', currentWorkspace.value);
    
    // 刷新最近使用列表
    await loadRecentWorkspaces();
    
    // 触发事件通知父组件
    console.log('触发workspace-selected事件');
    emit('workspace-selected', currentWorkspace.value);
    
    console.info('工作区选择成功:', projectId);
  } catch (err: any) {
    error.value = err.message || '选择工作区失败';
    console.error('选择工作区失败:', err);
  }
}

/**
 * 加载工作区
 */
async function loadWorkspace(projectId: string) {
  try {
    error.value = '';
    
    const handle = await fileSystemService.loadDirectoryHandle(projectId);
    if (!handle) {
      error.value = '无法加载工作区，请重新选择';
      return;
    }
    
    // 检查权限
    let permission = await fileSystemService.checkPermission(handle);
    if (permission !== 'granted') {
      permission = await fileSystemService.requestPermission(handle);
      if (permission !== 'granted') {
        error.value = '文件访问权限不足';
        return;
      }
    }
    
    currentWorkspace.value = {
      id: projectId,
      path: handle.name,
      lastAccessed: new Date(),
      permissions: permission,
      handle
    };
    
    // 触发事件通知父组件
    emit('workspace-selected', currentWorkspace.value);
    
    console.info('工作区加载成功:', projectId);
  } catch (err: any) {
    error.value = err.message || '加载工作区失败';
    console.error('加载工作区失败:', err);
  }
}

/**
 * 移除工作区
 */
async function removeWorkspace(projectId: string) {
  try {
    if (confirm('确定要从列表中移除此工作区吗？')) {
      await fileSystemService.revokeDirectoryAccess(projectId);
      
      if (currentWorkspace.value?.id === projectId) {
        currentWorkspace.value = null;
        // 触发工作区关闭事件
        emit('workspace-closed');
      }
      
      await loadRecentWorkspaces();
      console.info('工作区已移除:', projectId);
    }
  } catch (err: any) {
    error.value = err.message || '移除工作区失败';
    console.error('移除工作区失败:', err);
  }
}

/**
 * 加载最近使用的工作区
 */
async function loadRecentWorkspaces() {
  try {
    const handles = await fileSystemService.listDirectoryHandles();
    recentWorkspaces.value = handles
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
      .slice(0, 5);
  } catch (err) {
    console.error('加载最近工作区失败:', err);
  }
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN');
}

// 组件挂载时加载最近工作区
onMounted(() => {
  loadRecentWorkspaces();
});
</script>

<style scoped>
.workspace-manager {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.workspace-header h2 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.btn-primary {
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.btn-primary:hover {
  background-color: #45a049;
}

.workspace-info {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  margin-bottom: 12px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item .label {
  font-weight: bold;
  color: #666;
  min-width: 100px;
}

.info-item .value {
  color: #333;
}

.permission-granted {
  color: #4CAF50;
  font-weight: bold;
}

.permission-denied {
  color: #f44336;
  font-weight: bold;
}

.permission-prompt {
  color: #ff9800;
  font-weight: bold;
}

.no-workspace {
  text-align: center;
  padding: 40px;
  background-color: #f9f9f9;
  border-radius: 8px;
  color: #666;
}

.no-workspace p {
  margin: 10px 0;
}

.no-workspace .hint {
  font-size: 14px;
  color: #999;
}

.error-message {
  background-color: #ffebee;
  color: #c62828;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
  border-left: 4px solid #c62828;
}

.recent-workspaces {
  margin-top: 30px;
}

.recent-workspaces h3 {
  font-size: 18px;
  color: #333;
  margin-bottom: 15px;
}

.recent-workspaces ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.workspace-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 8px;
  transition: background-color 0.2s;
}

.workspace-item:hover {
  background-color: #f5f5f5;
}

.workspace-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.workspace-name {
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.workspace-date {
  font-size: 12px;
  color: #999;
}

.workspace-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #2196F3;
  color: white;
  transition: background-color 0.3s;
}

.btn-small:hover {
  background-color: #1976D2;
}

.btn-danger {
  background-color: #f44336;
}

.btn-danger:hover {
  background-color: #d32f2f;
}
</style>
