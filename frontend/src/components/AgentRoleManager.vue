<template>
  <div class="role-manager">
    <div class="list-toolbar">
      <el-button
        type="primary"
        size="small"
        :icon="'Plus'"
        class="btn-new"
        @click="showCreateForm = !showCreateForm"
      >
        新增角色
      </el-button>
      <el-button
        size="small"
        :icon="'Refresh'"
        circle
        :loading="loading"
        title="刷新"
        @click="loadRoles"
      />
    </div>

    <transition name="slide-down">
      <div v-if="showCreateForm" class="create-form">
        <div class="form-group">
          <label>名字 <span class="required">*</span></label>
          <el-input v-model="draft.name" placeholder="角色名称" size="small" />
        </div>
        <div class="form-group">
          <label>介绍</label>
          <el-input
            v-model="draft.description"
            type="textarea"
            :rows="2"
            placeholder="角色介绍"
            size="small"
          />
        </div>
        <div class="form-group">
          <label>提示词</label>
          <el-input
            v-model="draft.prompt"
            type="textarea"
            :rows="3"
            placeholder="System Prompt"
            size="small"
          />
        </div>
        <div class="form-actions">
          <el-button
            type="primary"
            size="small"
            :loading="creating"
            :disabled="!draft.name.trim()"
            @click="handleCreate"
          >
            确认创建
          </el-button>
          <el-button size="small" @click="cancelCreate">取消</el-button>
        </div>
      </div>
    </transition>

    <div v-if="loading && roles.length === 0" class="skeleton-wrap">
      <el-skeleton :rows="3" animated />
    </div>

    <el-empty
      v-else-if="!loading && roles.length === 0"
      description="暂无角色"
      :image-size="60"
      class="empty-state"
    />

    <ul v-else class="role-list">
      <li
        v-for="role in roles"
        :key="role.id"
        class="role-item"
        :class="{ active: drawerVisible && activeRoleId === role.id }"
      >
        <button type="button" class="role-summary" @click="openDrawer(role)">
          <span class="role-icon">⬡</span>
          <div class="role-info">
            <div class="role-title-row">
              <span class="role-name">{{ role.name }}</span>
              <span v-if="drawerVisible && activeRoleId === role.id" class="role-badge">编辑中</span>
            </div>
            <span class="role-desc">{{ role.description || '暂无介绍' }}</span>
            <span class="role-meta">{{ getPromptMeta(role.prompt) }}</span>
          </div>
          <span class="open-arrow">›</span>
        </button>
      </li>
    </ul>

    <el-drawer
      v-model="drawerVisible"
      direction="rtl"
      append-to-body
      destroy-on-close
      :modal="false"
      :lock-scroll="false"
      :size="'min(760px, calc(100vw - 16px))'"
      :show-close="false"
      class="role-drawer"
      @closed="resetEditState"
    >
      <template #header>
        <div class="drawer-header">
          <div class="drawer-header__text">
            <span class="drawer-header__eyebrow">Agent Role Editor</span>
            <h3>编辑角色</h3>
            <p>{{ activeRole?.name || '未选择角色' }}</p>
          </div>
          <el-button text class="drawer-header__close" @click="closeDrawer">关闭</el-button>
        </div>
      </template>

      <div v-if="activeRole" class="drawer-layout">
        <div class="drawer-scroll">
          <section class="drawer-card">
            <div class="drawer-card__title">基础信息</div>
            <div class="form-grid">
              <div class="form-group">
                <label>名字 <span class="required">*</span></label>
                <el-input v-model="editDraft.name" size="large" placeholder="角色名称" />
              </div>
              <div class="form-group">
                <label>介绍</label>
                <el-input
                  v-model="editDraft.description"
                  type="textarea"
                  :rows="3"
                  resize="none"
                  placeholder="一句话描述角色能力与职责"
                />
              </div>
            </div>
          </section>

          <section class="drawer-card drawer-card--editor">
            <div class="drawer-card__title">提示词</div>
            <p class="drawer-card__hint">使用 Monaco 编辑器维护系统提示词，适合长文本、多段落和结构化 Prompt。</p>
            <MonacoPromptEditor v-model="editDraft.prompt" />
          </section>
        </div>

        <footer class="drawer-footer">
          <div class="drawer-footer__left">
            <el-button
              type="danger"
              plain
              size="large"
              :loading="deletingId === activeRole.id"
              @click="handleDelete(activeRole)"
            >
              删除角色
            </el-button>
          </div>
          <div class="drawer-footer__right">
            <el-button size="large" @click="closeDrawer">取消</el-button>
            <el-button
              type="primary"
              size="large"
              :loading="savingId === activeRole.id"
              :disabled="!editDraft.name.trim()"
              @click="handleSave"
            >
              保存修改
            </el-button>
          </div>
        </footer>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import MonacoPromptEditor from './MonacoPromptEditor.vue';
import { AgentRoleApiService, type AgentRole } from '../services/agent-role-api.service';

const api = AgentRoleApiService.getInstance();

const loading = ref(false);
const roles = ref<AgentRole[]>([]);
const showCreateForm = ref(false);
const creating = ref(false);
const draft = ref(createEmptyDraft());
const drawerVisible = ref(false);
const activeRoleId = ref<string | null>(null);
const editDraft = ref(createEmptyDraft());
const savingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);

const activeRole = computed(() => roles.value.find((role) => role.id === activeRoleId.value) ?? null);

function createEmptyDraft() {
  return { name: '', description: '', prompt: '' };
}

function hydrateEditDraft(role: AgentRole): void {
  editDraft.value = {
    name: role.name,
    description: role.description,
    prompt: role.prompt,
  };
}

function resetEditState(): void {
  activeRoleId.value = null;
  editDraft.value = createEmptyDraft();
}

function getPromptMeta(prompt: string): string {
  const lineCount = prompt ? prompt.split(/\r?\n/).length : 0;
  return lineCount > 0 ? `${lineCount} 行提示词` : '未设置提示词';
}

async function loadRoles() {
  loading.value = true;
  try {
    roles.value = await api.listRoles();
  } catch {
    ElMessage.error('加载角色列表失败');
  } finally {
    loading.value = false;
  }
}

function openDrawer(role: AgentRole): void {
  activeRoleId.value = role.id;
  hydrateEditDraft(role);
  drawerVisible.value = true;
}

function closeDrawer(): void {
  drawerVisible.value = false;
}

async function handleCreate() {
  if (!draft.value.name.trim()) return;
  creating.value = true;
  try {
    const created = await api.createRole(draft.value);
    roles.value.unshift(created);
    ElMessage.success('角色已创建');
    cancelCreate();
  } catch {
    ElMessage.error('创建失败，请重试');
  } finally {
    creating.value = false;
  }
}

function cancelCreate() {
  showCreateForm.value = false;
  draft.value = createEmptyDraft();
}

async function handleSave() {
  if (!activeRole.value) return;

  savingId.value = activeRole.value.id;
  try {
    const updated = await api.updateRole(activeRole.value.id, editDraft.value);
    const index = roles.value.findIndex((role) => role.id === updated.id);
    if (index !== -1) {
      roles.value[index] = updated;
    }
    ElMessage.success('保存成功');
    closeDrawer();
  } catch {
    ElMessage.error('保存失败，请重试');
  } finally {
    savingId.value = null;
  }
}

async function handleDelete(role: AgentRole) {
  try {
    await ElMessageBox.confirm(`确认删除角色「${role.name}」？此操作不可撤销。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }

  deletingId.value = role.id;
  try {
    await api.deleteRole(role.id);
    roles.value = roles.value.filter((item) => item.id !== role.id);
    if (activeRoleId.value === role.id) {
      closeDrawer();
    }
    ElMessage.success('角色已删除');
  } catch {
    ElMessage.error('删除失败，请重试');
  } finally {
    deletingId.value = null;
  }
}

onMounted(loadRoles);
</script>

<style scoped>
.role-manager {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  color: #c8d0e0;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 10px;
}

.btn-new {
  flex: 1;
}

.create-form {
  background: linear-gradient(180deg, rgba(34, 38, 58, 0.98), rgba(24, 28, 44, 0.98));
  border: 1px solid #2d3148;
  border-radius: 12px;
  padding: 12px;
  margin: 0 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group label {
  font-size: 11px;
  color: #5a6a82;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.required {
  color: #f56c6c;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.empty-state {
  padding: 32px 0;
  color: #5a6a82;
}

.skeleton-wrap {
  padding: 12px;
}

.role-list {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-item {
  border-radius: 14px;
  border: 1px solid transparent;
  background: linear-gradient(180deg, rgba(30, 34, 53, 0.7), rgba(20, 23, 42, 0.86));
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.role-item:hover {
  transform: translateY(-1px);
  border-color: rgba(64, 158, 255, 0.3);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
}

.role-item.active {
  border-color: rgba(64, 158, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.16), 0 14px 28px rgba(12, 16, 28, 0.28);
}

.role-summary {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  color: inherit;
  border: none;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.role-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  font-size: 16px;
  color: #66b1ff;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.22), rgba(51, 126, 204, 0.08));
  flex-shrink: 0;
}

.role-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.role-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.role-name {
  font-size: 13px;
  font-weight: 700;
  color: #e8eaf0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  color: #66b1ff;
  background: rgba(64, 158, 255, 0.16);
  border: 1px solid rgba(64, 158, 255, 0.18);
}

.role-desc,
.role-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-desc {
  font-size: 11px;
  color: #9ca8bd;
}

.role-meta {
  font-size: 10px;
  color: #5a6a82;
  letter-spacing: 0.3px;
}

.open-arrow {
  font-size: 20px;
  color: #5a6a82;
  flex-shrink: 0;
  transition: transform 0.18s ease, color 0.18s ease;
}

.role-item:hover .open-arrow,
.role-item.active .open-arrow {
  color: #66b1ff;
  transform: translateX(2px);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.drawer-header__text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer-header__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #66b1ff;
}

.drawer-header h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #e8eaf0;
}

.drawer-header p {
  margin: 0;
  font-size: 13px;
  color: #8fa0bb;
}

.drawer-header__close {
  color: #8fa0bb;
}

.drawer-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #1a1d27 0%, #14172a 100%);
}

.drawer-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.drawer-card {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(45, 49, 72, 0.95);
  background:
    linear-gradient(180deg, rgba(30, 34, 53, 0.96) 0%, rgba(20, 23, 42, 0.98) 100%),
    linear-gradient(135deg, rgba(64, 158, 255, 0.1), rgba(102, 177, 255, 0.02));
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.24);
}

.drawer-card--editor {
  min-height: 420px;
}

.drawer-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #e8eaf0;
  margin-bottom: 14px;
}

.drawer-card__hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: #7f90ab;
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px 24px;
  border-top: 1px solid rgba(45, 49, 72, 0.9);
  background: linear-gradient(180deg, rgba(26, 29, 39, 0.78), rgba(20, 23, 42, 0.98));
  backdrop-filter: blur(14px);
}

.drawer-footer__left,
.drawer-footer__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

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
  max-height: 400px;
  opacity: 1;
}

:deep(.el-input__wrapper),
:deep(.el-textarea__inner) {
  background: #14172a;
  border-color: #2d3148;
  color: #c8d0e0;
  box-shadow: none;
}

:deep(.el-input__wrapper:hover),
:deep(.el-textarea__inner:hover) {
  border-color: #409eff66;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-textarea__inner:focus) {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

:deep(.el-input__inner),
:deep(.el-textarea__inner) {
  color: #c8d0e0;
}

:deep(.el-input__inner::placeholder),
:deep(.el-textarea__inner::placeholder) {
  color: #3d4d65;
}

:deep(.el-skeleton) {
  --el-skeleton-color: #1e2235;
  --el-skeleton-to-color: #2a2f48;
}

:deep(.el-empty__description p) {
  color: #5a6a82;
}

:deep(.role-drawer) {
  --el-drawer-bg-color: #14172a;
  --el-color-primary: #409eff;
}

:deep(.role-drawer .el-drawer) {
  background: linear-gradient(180deg, #1a1d27 0%, #14172a 100%);
}

:deep(.role-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 24px 24px 18px;
  border-bottom: 1px solid rgba(45, 49, 72, 0.95);
  background: linear-gradient(180deg, rgba(30, 34, 53, 0.95), rgba(20, 23, 42, 0.92));
}

:deep(.role-drawer .el-drawer__body) {
  padding: 0;
}

@media (max-width: 768px) {
  .drawer-scroll,
  .drawer-footer,
  :deep(.role-drawer .el-drawer__header) {
    padding-left: 16px;
    padding-right: 16px;
  }

  .drawer-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .drawer-footer__left,
  .drawer-footer__right {
    width: 100%;
  }

  .drawer-footer__right :deep(.el-button),
  .drawer-footer__left :deep(.el-button) {
    flex: 1;
  }
}
</style>

