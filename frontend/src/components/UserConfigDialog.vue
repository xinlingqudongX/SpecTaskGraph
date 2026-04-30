<template>
  <el-dialog
    v-model="dialogVisible"
    title="用户设置"
    width="480px"
    :close-on-click-modal="true"
    @close="close"
  >
    <el-form :model="formData" label-width="80px" size="default">
      <!-- 显示名称 -->
      <el-form-item label="显示名称">
        <el-input
          v-model="formData.displayName"
          placeholder="请输入您的显示名称"
          maxlength="50"
          show-word-limit
          clearable
          @input="validateForm"
        />
        <div class="form-hint">其他用户将看到此名称</div>
      </el-form-item>

      <!-- 光标颜色 -->
      <el-form-item label="光标颜色">
        <div class="color-picker">
          <div class="color-options">
            <button
              v-for="color in availableColors"
              :key="color"
              class="color-option"
              :class="{ active: formData.color === color }"
              :style="{ backgroundColor: color }"
              @click="selectColor(color)"
              :title="color"
            />
          </div>
          <div class="custom-color">
            <el-color-picker
              v-model="formData.color"
              size="small"
              @change="validateForm"
            />
            <code class="color-value">{{ formData.color }}</code>
          </div>
        </div>
      </el-form-item>

      <!-- 协同偏好 -->
      <el-form-item label="协同偏好">
        <div class="preferences">
          <el-checkbox v-model="formData.preferences!.showCursor">
            显示我的光标给其他用户
          </el-checkbox>
          <el-checkbox v-model="formData.preferences!.showUserNames">
            显示其他用户的名称
          </el-checkbox>
        </div>
      </el-form-item>

      <!-- 用户ID -->
      <el-form-item label="用户 ID">
        <el-input v-model="formData.userId" readonly>
          <template #append>
            <el-button :icon="'CopyDocument'" @click="copyUserId" :title="copyTooltip" />
          </template>
        </el-input>
        <div class="form-hint">系统自动生成，用于识别您的身份</div>
      </el-form-item>

      <!-- 错误提示 -->
      <el-alert
        v-if="errors.length > 0"
        type="error"
        :title="`请修正以下错误：${errors.join('；')}`"
        :closable="false"
        show-icon
      />
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <el-button size="small" @click="resetToDefault">重置默认</el-button>
          <el-button size="small" @click="exportConfig">导出配置</el-button>
          <el-button size="small" @click="showImportDialog">导入配置</el-button>
        </div>
        <div class="footer-right">
          <el-button @click="close">取消</el-button>
          <el-button
            type="primary"
            :disabled="!isValid || saving"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <!-- 导入配置弹窗 -->
  <el-dialog
    v-model="showImport"
    title="导入用户配置"
    width="400px"
    append-to-body
  >
    <el-input
      v-model="importData"
      type="textarea"
      :rows="8"
      placeholder="请粘贴用户配置 JSON 数据..."
      style="font-family: monospace; font-size: 13px;"
    />
    <el-alert
      v-if="importError"
      type="error"
      :title="importError"
      :closable="false"
      show-icon
      style="margin-top: 8px;"
    />
    <template #footer>
      <el-button @click="hideImportDialog">取消</el-button>
      <el-button type="primary" :disabled="!importData.trim()" @click="importConfig">导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UserManagerService } from '../services/user-manager.service';
import type { UserConfig } from '../services/user-manager.service';

interface Props {
  visible: boolean;
  userManager: UserManagerService;
}

interface Emits {
  (e: 'close'): void;
  (e: 'save', userConfig: UserConfig): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => { if (!v) close(); },
});

const formData = reactive<UserConfig>({
  userId: '',
  displayName: '',
  color: '#FF6B6B',
  preferences: {
    showCursor: true,
    showUserNames: true,
  },
});

const saving = ref(false);
const errors = ref<string[]>([]);
const availableColors = ref<string[]>([]);
const copyTooltip = ref('复制');

const showImport = ref(false);
const importData = ref('');
const importError = ref('');

const isValid = computed(() => errors.value.length === 0);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadUserConfig();
      loadAvailableColors();
    }
  },
  { immediate: true }
);

function loadUserConfig(): void {
  const currentUser = props.userManager.getCurrentUser();
  if (currentUser) {
    Object.assign(formData, {
      ...currentUser,
      preferences: {
        showCursor: true,
        showUserNames: true,
        ...currentUser.preferences,
      },
    });
  }
  validateForm();
}

function loadAvailableColors(): void {
  availableColors.value = props.userManager.getAvailableColors();
}

function validateForm(): void {
  const validation = props.userManager.validateUserInfo(formData);
  errors.value = validation.errors;
}

function selectColor(color: string): void {
  formData.color = color;
  if (formData.preferences) {
    formData.preferences.cursorColor = color;
  }
  validateForm();
}

async function copyUserId(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formData.userId);
    copyTooltip.value = '已复制';
    ElMessage.success('用户 ID 已复制');
    setTimeout(() => { copyTooltip.value = '复制'; }, 2000);
  } catch {
    ElMessage.error('复制失败');
  }
}

async function resetToDefault(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要重置为默认配置吗？这将清除所有自定义设置。', '重置确认', {
      confirmButtonText: '重置',
      cancelButtonText: '取消',
      type: 'warning',
    });
    const defaultUser = props.userManager.resetUserConfig();
    Object.assign(formData, defaultUser);
    validateForm();
  } catch {
    // 用户取消
  }
}

function exportConfig(): void {
  try {
    const configJson = props.userManager.exportUserConfig();
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowinone-user-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error('导出配置失败');
  }
}

function showImportDialog(): void {
  showImport.value = true;
  importData.value = '';
  importError.value = '';
}

function hideImportDialog(): void {
  showImport.value = false;
  importData.value = '';
  importError.value = '';
}

function importConfig(): void {
  try {
    importError.value = '';
    const importedUser = props.userManager.importUserConfig(importData.value);
    Object.assign(formData, importedUser);
    validateForm();
    hideImportDialog();
    ElMessage.success('配置导入成功');
  } catch (error) {
    importError.value = error instanceof Error ? error.message : '导入失败';
  }
}

async function save(): Promise<void> {
  if (!isValid.value) return;
  saving.value = true;
  try {
    const updatedUser = props.userManager.setUserInfo(formData);
    emit('save', updatedUser);
    close();
  } catch {
    ElMessage.error('保存失败，请稍后重试');
  } finally {
    saving.value = false;
  }
}

function close(): void {
  emit('close');
}
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

/* ─── 颜色选择器 ─────────────────────────────── */
.color-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-option {
  width: 30px;
  height: 30px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  padding: 0;
  position: relative;
}

.color-option:hover {
  transform: scale(1.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.color-option.active {
  border-color: #303133;
  transform: scale(1.1);
}

.color-option.active::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 700;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}

.custom-color {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-value {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #606266;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

/* ─── 协同偏好 ────────────────────────────────── */
.preferences {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ─── 底部操作栏 ─────────────────────────────── */
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 8px;
}
</style>
