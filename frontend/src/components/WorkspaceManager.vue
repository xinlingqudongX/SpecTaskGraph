<template>
  <div class="workspace-selector">
    <!-- 已选择工作区 -->
    <div v-if="currentWorkspace" class="workspace-active">
      <div class="workspace-path-row">
        <el-icon class="folder-icon"><Folder /></el-icon>
        <span class="workspace-name" :title="currentWorkspace.path">{{ currentWorkspace.path }}</span>
        <el-tooltip content="切换工作区" placement="right">
          <el-button link size="small" class="change-btn" @click="selectWorkspace">
            <el-icon><Switch /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
      <div class="permission-badge" :class="permissionClass">
        {{ permissionText }}
      </div>
      <!-- 降级模式提示 -->
      <div v-if="currentWorkspace.isFallback" class="fallback-notice">
        只读模式：修改将保存到服务器
      </div>
    </div>

    <!-- 未选择工作区 -->
    <div v-else class="workspace-empty">
      <el-icon :size="32" class="empty-icon"><FolderOpened /></el-icon>
      <p class="empty-text">未选择本地工作区</p>
      <el-button type="primary" size="small" @click="selectWorkspace">
        <el-icon><FolderOpened /></el-icon>
        选择目录
      </el-button>

      <!-- 当前环境不支持 FSAPI 时的说明 -->
      <p v-if="!fsapiSupported" class="fallback-tip">
        当前访问地址非 localhost/HTTPS，将以只读方式读取目录中的工作流文件
      </p>

      <!-- 最近使用的工作区（仅 FSAPI 模式支持持久化） -->
      <div v-if="fsapiSupported && recentWorkspaces.length" class="recent-list">
        <p class="recent-label">最近使用</p>
        <div
          v-for="ws in recentWorkspaces"
          :key="ws.id"
          class="recent-item"
          @click="loadWorkspace(ws.id)"
        >
          <el-icon class="recent-folder-icon"><Folder /></el-icon>
          <div class="recent-info">
            <span class="recent-name">{{ ws.path }}</span>
            <span class="recent-date">{{ formatDate(ws.lastAccessed) }}</span>
          </div>
          <el-button link size="small" class="recent-remove" @click.stop="removeWorkspace(ws.id)">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 隐藏的目录选择 input（降级模式用） -->
    <input
      ref="fileInputRef"
      type="file"
      style="display: none"
      webkitdirectory
      multiple
      @change="handleFileInputChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Folder, FolderOpened, Switch, Close } from '@element-plus/icons-vue';
import { FileSystemService } from '../services/filesystem.service';
import type { PermissionState } from '../types/workflow.types';

export interface FallbackFileInfo {
  name: string;
  content: string;
  size: number;
  lastModified: Date;
}

export interface WorkspaceInfo {
  id: string;
  path: string;
  lastAccessed: Date;
  permissions: PermissionState;
  handle: FileSystemDirectoryHandle | null;
  isFallback?: boolean;
  fallbackFiles?: FallbackFileInfo[];
}

const emit = defineEmits<{
  (e: 'workspace-selected', workspace: WorkspaceInfo): void;
  (e: 'workspace-closed'): void;
}>();

const fileSystemService = FileSystemService.getInstance();

const fsapiSupported = FileSystemService.isSupported();
const fileInputRef = ref<HTMLInputElement | null>(null);

const currentWorkspace = ref<WorkspaceInfo | null>(null);
const recentWorkspaces = ref<WorkspaceInfo[]>([]);

const permissionClass = computed(() => {
  if (!currentWorkspace.value) return '';
  if (currentWorkspace.value.isFallback) return 'permission-prompt';
  return {
    granted: 'permission-granted',
    denied: 'permission-denied',
    prompt: 'permission-prompt',
  }[currentWorkspace.value.permissions] ?? '';
});

const permissionText = computed(() => {
  if (!currentWorkspace.value) return '';
  if (currentWorkspace.value.isFallback) return '只读';
  return { granted: '已授权', denied: '已拒绝', prompt: '待授权' }[currentWorkspace.value.permissions] ?? '未知';
});

async function selectWorkspace() {
  error.value = '';
  if (fsapiSupported) {
    await selectWithFSAPI();
  } else {
    // 当前环境不支持 FSAPI（非 localhost / 非 HTTPS），降级到 input[webkitdirectory]
    fileInputRef.value?.click();
  }
}

async function selectWithFSAPI() {
  try {
    const handle = await fileSystemService.requestDirectoryAccess();
    const projectId = handle.name.replace(/[^a-zA-Z0-9-_]/g, '-');

    await fileSystemService.saveDirectoryHandle(projectId, handle, handle.name);
    const permission = await fileSystemService.checkPermission(handle);

    currentWorkspace.value = {
      id: projectId,
      path: handle.name,
      lastAccessed: new Date(),
      permissions: permission,
      handle,
    };

    await loadRecentWorkspaces();
    emit('workspace-selected', currentWorkspace.value);
  } catch (err: any) {
    // AbortError 表示用户主动取消，不提示错误
    if (err?.name !== 'AbortError') {
      ElMessage.error(err.message || '选择工作区失败');
    }
  }
}

// 降级模式：读取 input[webkitdirectory] 选中的目录中的工作流 JSON 文件
async function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const allFiles = Array.from(input.files);

  // 工作流文件位于 src/data/workflow/*.json，过滤出符合路径的文件
  const workflowFiles = allFiles.filter((f) => {
    const rel = (f as any).webkitRelativePath as string || f.name;
    return (
      rel.includes('/src/data/workflow/') &&
      f.name.endsWith('.json') &&
      !f.name.endsWith('.bak') &&
      !f.name.endsWith('.tmp')
    );
  });

  // 若找不到规范路径，退而求其次：取顶层 .json 文件
  const targetFiles = workflowFiles.length > 0 ? workflowFiles : allFiles.filter(
    (f) => f.name.endsWith('.json') && !f.name.endsWith('.bak') && !f.name.endsWith('.tmp')
  );

  if (targetFiles.length === 0) {
    ElMessage.warning('所选目录中没有找到工作流 JSON 文件（应位于 src/data/workflow/）');
    input.value = '';
    return;
  }

  const fallbackFiles: FallbackFileInfo[] = await Promise.all(
    targetFiles.map(async (f) => ({
      name: f.name,
      content: await f.text(),
      size: f.size,
      lastModified: new Date(f.lastModified),
    }))
  );

  // 取目录名作为工作区名称（webkitRelativePath 第一段）
  const firstRel = (targetFiles[0] as any).webkitRelativePath as string || '';
  const dirName = firstRel.split('/')[0] || targetFiles[0].name;
  const workspaceId = dirName.replace(/[^a-zA-Z0-9-_]/g, '-');

  currentWorkspace.value = {
    id: workspaceId,
    path: dirName,
    lastAccessed: new Date(),
    permissions: 'granted',
    handle: null,
    isFallback: true,
    fallbackFiles,
  };

  emit('workspace-selected', currentWorkspace.value);
  // 重置 input，允许重复选择同一目录
  input.value = '';
}

async function loadWorkspace(projectId: string) {
  try {
    const handle = await fileSystemService.loadDirectoryHandle(projectId);
    if (!handle) {
      ElMessage.error('工作区记录已失效，请重新选择');
      return;
    }

    let permission = await fileSystemService.checkPermission(handle);
    if (permission !== 'granted') {
      permission = await fileSystemService.requestPermission(handle);
      if (permission !== 'granted') {
        ElMessage.error('文件访问权限不足，请重新授权');
        return;
      }
    }

    currentWorkspace.value = {
      id: projectId,
      path: handle.name,
      lastAccessed: new Date(),
      permissions: permission,
      handle,
    };

    emit('workspace-selected', currentWorkspace.value);
  } catch (err: any) {
    ElMessage.error(err.message || '加载工作区失败');
  }
}

async function removeWorkspace(projectId: string) {
  try {
    await fileSystemService.revokeDirectoryAccess(projectId);
    if (currentWorkspace.value?.id === projectId) {
      currentWorkspace.value = null;
      emit('workspace-closed');
    }
    await loadRecentWorkspaces();
  } catch (err: any) {
    ElMessage.error(err.message || '移除工作区失败');
  }
}

async function loadRecentWorkspaces() {
  try {
    const handles = await fileSystemService.listDirectoryHandles();
    recentWorkspaces.value = handles
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
      .slice(0, 5);
  } catch {
    // 加载失败时静默处理
  }
}

function formatDate(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

onMounted(loadRecentWorkspaces);
</script>

<style scoped>
.workspace-selector {
  padding: 12px;
  color: #c0cfe0;
}

/* 已选中状态 */
.workspace-active {
  background: rgba(64, 158, 255, 0.08);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 6px;
  padding: 8px 10px;
}

.workspace-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.folder-icon {
  color: #e6a23c;
  font-size: 14px;
  flex-shrink: 0;
}

.workspace-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #e8eaf0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-btn {
  color: #5a6a82 !important;
  flex-shrink: 0;
}

.change-btn:hover {
  color: #409eff !important;
}

.permission-badge {
  margin-top: 4px;
  font-size: 11px;
  padding-left: 20px;
}

.permission-granted { color: #67c23a; }
.permission-denied  { color: #f56c6c; }
.permission-prompt  { color: #e6a23c; }

/* 未选中状态 */
.workspace-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  gap: 10px;
}

.empty-icon {
  color: #3a4a60;
}

.empty-text {
  margin: 0;
  font-size: 12px;
  color: #5a6a82;
}

/* 最近工作区列表 */
.recent-list {
  width: 100%;
  margin-top: 4px;
  border-top: 1px solid #2d3148;
  padding-top: 10px;
}

.recent-label {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 600;
  color: #3a4a60;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.recent-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.recent-folder-icon {
  color: #3a4a60;
  font-size: 13px;
  flex-shrink: 0;
}

.recent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.recent-name {
  font-size: 12px;
  color: #8b9cb3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-date {
  font-size: 10px;
  color: #3a4a60;
}

.recent-remove {
  color: #3a4a60 !important;
  opacity: 0;
  transition: opacity 0.15s;
}

.recent-item:hover .recent-remove {
  opacity: 1;
}

.fallback-notice {
  margin-top: 4px;
  padding-left: 20px;
  font-size: 11px;
  color: #e6a23c;
}

.fallback-tip {
  margin: 0;
  padding: 6px 8px;
  font-size: 11px;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.08);
  border-radius: 4px;
  line-height: 1.5;
  text-align: center;
}
</style>
