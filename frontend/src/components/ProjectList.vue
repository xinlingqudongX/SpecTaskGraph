<template>
  <div class="project-list">
    <!-- 新建项目 -->
    <div class="project-list-header">
      <button @click="showCreateForm = true" class="btn-create">
        ＋ 新建项目
      </button>
      <button @click="loadProjects" class="btn-refresh" title="刷新">↺</button>
    </div>

    <!-- 创建表单 -->
    <div v-if="showCreateForm" class="create-form">
      <input
        v-model="newProjectName"
        placeholder="项目名称"
        class="input-name"
        @keyup.enter="createProject"
        @keyup.esc="cancelCreate"
        ref="nameInputRef"
      />
      <input
        v-model="newProjectDesc"
        placeholder="描述（可选）"
        class="input-desc"
        @keyup.enter="createProject"
        @keyup.esc="cancelCreate"
      />
      <div class="create-actions">
        <button @click="createProject" class="btn-confirm" :disabled="!newProjectName.trim()">创建</button>
        <button @click="cancelCreate" class="btn-cancel">取消</button>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-tip">加载中...</div>

    <!-- 项目列表 -->
    <div v-if="!loading && projects.length === 0 && !error" class="empty-tip">
      暂无项目，点击"新建项目"开始
    </div>

    <ul v-else class="projects">
      <li
        v-for="project in projects"
        :key="project.id"
        class="project-item"
        :class="{ active: currentProjectId === project.id }"
        @click="openProject(project)"
      >
        <div class="project-info">
          <div class="project-name">{{ project.name }}</div>
          <div class="project-meta">{{ formatDate(project.updatedAt) }}</div>
        </div>
        <button
          class="btn-delete"
          title="删除项目"
          @click.stop="deleteProject(project)"
        >✕</button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import { useToast } from 'vue-toastification';
import { ProjectApiService } from '../services/project-api.service';
import type { WorkflowGraph } from '../types/workflow.types';

interface ServerProject {
  id: string;
  name: string;
  description?: string;
  workflowJson?: Record<string, unknown>;
  updatedAt: string;
}

const props = defineProps<{ currentProjectId?: string }>();

const emit = defineEmits<{
  (e: 'project-opened', graph: WorkflowGraph, projectId: string, projectName: string): void;
}>();

const toast = useToast();
const projectApi = ProjectApiService.getInstance();

const projects = ref<ServerProject[]>([]);
const loading = ref(false);
const showCreateForm = ref(false);
const newProjectName = ref('');
const newProjectDesc = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);

async function loadProjects() {
  loading.value = true;
  try {
    projects.value = await projectApi.listProjects() as ServerProject[];
  } catch (err: any) {
    toast.error(`加载项目失败: ${err.message}`);
  } finally {
    loading.value = false;
  }
}

async function openProject(project: ServerProject) {
  try {
    const full = await projectApi.getProject(project.id);
    const graph = projectApi.extractWorkflowGraph(full);
    emit('project-opened', graph, project.id, project.name);
  } catch (err: any) {
    toast.error(`打开项目失败: ${err.message}`);
  }
}

async function createProject() {
  const name = newProjectName.value.trim();
  if (!name) return;
  try {
    const created = await projectApi.createProject(name, newProjectDesc.value.trim() || undefined);
    projects.value.unshift(created as ServerProject);
    cancelCreate();
    const graph = projectApi.extractWorkflowGraph(created);
    emit('project-opened', graph, created.id, created.name);
  } catch (err: any) {
    toast.error(`创建项目失败: ${err.message}`);
  }
}

async function deleteProject(project: ServerProject) {
  if (!confirm(`确定删除项目"${project.name}"？此操作不可撤销。`)) return;
  try {
    await projectApi.deleteProject(project.id);
    projects.value = projects.value.filter(p => p.id !== project.id);
    toast.success(`已删除项目"${project.name}"`);
  } catch (err: any) {
    toast.error(`删除项目失败: ${err.message}`);
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
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 显示创建表单时自动聚焦
watch(showCreateForm, async (val) => {
  if (val) {
    await nextTick();
    nameInputRef.value?.focus();
  }
});

onMounted(loadProjects);

// 暴露刷新方法供父组件调用
defineExpose({ loadProjects });
</script>

<style scoped>
.project-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 0;
}

.project-list-header {
  display: flex;
  gap: 8px;
  padding: 0 12px 8px;
  align-items: center;
}

.btn-create {
  flex: 1;
  background: #667eea;
  color: white;
  border: none;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-create:hover {
  background: #5a67d8;
}

.btn-refresh {
  background: none;
  border: 1px solid #ddd;
  color: #666;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #f0f0f0;
  color: #333;
}

.create-form {
  padding: 0 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-name,
.input-desc {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s;
}

.input-name:focus,
.input-desc:focus {
  border-color: #667eea;
}

.create-actions {
  display: flex;
  gap: 6px;
}

.btn-confirm {
  flex: 1;
  background: #4caf50;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-confirm:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-confirm:not(:disabled):hover {
  background: #388e3c;
}

.btn-cancel {
  background: none;
  border: 1px solid #ddd;
  color: #666;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: #f0f0f0;
}

.loading-tip,
.empty-tip {
  padding: 16px 12px;
  color: #999;
  font-size: 13px;
  text-align: center;
}

.projects {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.project-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s;
  gap: 8px;
}

.project-item:hover {
  background: #f5f5f5;
}

.project-item.active {
  background: rgba(102, 126, 234, 0.08);
  border-left: 3px solid #667eea;
  padding-left: 9px;
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-meta {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.btn-delete {
  background: none;
  border: none;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.2s, background 0.2s;
}

.btn-delete:hover {
  color: #f44336;
  background: rgba(244, 67, 54, 0.08);
}
</style>
