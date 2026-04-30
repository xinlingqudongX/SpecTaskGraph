<template>
  <div class="online-users-panel">
    <!-- 连接状态 -->
    <div class="conn-status" :class="connectionStateClass">
      <span class="conn-dot" />
      <span class="conn-text">{{ connectionStatusText }}</span>
    </div>

    <el-scrollbar max-height="280px">
      <!-- 当前用户 -->
      <div v-if="currentUser" class="user-section">
        <div class="section-label">我</div>
        <div class="user-item current-user-item">
          <el-avatar
            :size="30"
            :style="{ backgroundColor: currentUser.color, flexShrink: 0 }"
          >
            {{ getUserInitials(currentUser.displayName) }}
          </el-avatar>
          <div class="user-info">
            <div class="user-name">{{ currentUser.displayName }}</div>
            <div class="user-sub">当前用户</div>
          </div>
          <el-tooltip content="编辑用户信息" placement="top">
            <el-button :icon="'Setting'" size="small" text @click.stop="editCurrentUser" />
          </el-tooltip>
        </div>
      </div>

      <!-- 其他用户 -->
      <div v-if="otherUsers.length > 0" class="user-section">
        <div class="section-label">其他在线 ({{ otherUsers.length }})</div>
        <div
          v-for="user in otherUsers"
          :key="user.userId"
          class="user-item"
          @click="focusOnUser(user)"
        >
          <el-avatar
            :size="30"
            :style="{ backgroundColor: user.color || '#909399', flexShrink: 0 }"
          >
            {{ getUserInitials(user.displayName) }}
          </el-avatar>
          <div class="user-info">
            <div class="user-name">{{ user.displayName }}</div>
            <div class="user-sub">
              <span class="online-dot" />
              {{ getLastSeenText(user.lastSeen) }}
            </div>
          </div>
          <el-tooltip :content="user.cursorVisible ? '隐藏光标' : '显示光标'" placement="top">
            <el-button
              :icon="user.cursorVisible ? 'View' : 'Hide'"
              size="small"
              text
              @click.stop="toggleUserCursor(user)"
            />
          </el-tooltip>
        </div>
      </div>

      <!-- 空状态 -->
      <el-empty
        v-if="otherUsers.length === 0 && connectionState === 'connected'"
        description="暂无其他用户在线"
        :image-size="36"
        class="users-empty"
      />

      <!-- 断开状态 -->
      <div v-if="connectionState === 'disconnected'" class="offline-panel">
        <el-icon :size="28" style="color: #909399"><Connection /></el-icon>
        <div class="offline-text">协同功能已离线</div>
        <el-button type="primary" size="small" :loading="reconnecting" @click="reconnect">
          {{ reconnecting ? '重连中...' : '重新连接' }}
        </el-button>
      </div>
    </el-scrollbar>

    <!-- 底部快捷操作 -->
    <div v-if="connectionState === 'connected'" class="quick-actions">
      <el-button
        size="small"
        text
        :icon="showAllCursors ? 'Hide' : 'View'"
        @click="toggleAllCursors"
      >
        {{ showAllCursors ? '隐藏' : '显示' }}光标
      </el-button>
      <el-button size="small" text :icon="'Refresh'" @click="refreshUsers">刷新</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { User } from '../services/collaboration.service';
import type { ConnectionState } from '../services/websocket-manager';

interface Props {
  users: User[];
  currentUser?: User | null;
  connectionState: ConnectionState;
  showAllCursors?: boolean;
}

interface Emits {
  (e: 'edit-user'): void;
  (e: 'focus-user', user: User): void;
  (e: 'toggle-user-cursor', user: User, visible: boolean): void;
  (e: 'toggle-all-cursors', visible: boolean): void;
  (e: 'reconnect'): void;
  (e: 'refresh-users'): void;
}

const props = withDefaults(defineProps<Props>(), {
  showAllCursors: true,
});

const emit = defineEmits<Emits>();

const reconnecting = ref(false);
// 每个用户光标的显示状态
const userCursorVisibility = ref<Map<string, boolean>>(new Map());

const onlineUsers = computed(() => props.users.filter(u => u.isOnline));

const otherUsers = computed(() =>
  onlineUsers.value
    .filter(u => u.userId !== props.currentUser?.userId)
    .map(u => ({
      ...u,
      cursorVisible: userCursorVisibility.value.get(u.userId) ?? true,
    }))
);

const connectionStateClass = computed(() => {
  switch (props.connectionState) {
    case 'connected': return 'conn-ok';
    case 'connecting':
    case 'reconnecting': return 'conn-ing';
    default: return 'conn-off';
  }
});

const connectionStatusText = computed(() => {
  switch (props.connectionState) {
    case 'connected': return '协同已连接';
    case 'connecting': return '连接中...';
    case 'reconnecting': return '重连中...';
    default: return '协同已断开';
  }
});

watch(
  () => props.users,
  (newUsers) => {
    newUsers.forEach(u => {
      if (!userCursorVisibility.value.has(u.userId)) {
        userCursorVisibility.value.set(u.userId, true);
      }
    });
  },
  { immediate: true }
);

function getUserInitials(name: string): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return (words[0] || '?').charAt(0).toUpperCase();
  return words.slice(0, 2).map(w => (w || '').charAt(0).toUpperCase()).join('');
}

function getLastSeenText(lastSeen: Date): string {
  const diff = Date.now() - lastSeen.getTime();
  if (diff < 60000) return '刚刚在线';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return lastSeen.toLocaleDateString();
}

function editCurrentUser(): void { emit('edit-user'); }
function focusOnUser(user: User): void { emit('focus-user', user); }

function toggleUserCursor(user: User): void {
  const cur = userCursorVisibility.value.get(user.userId) ?? true;
  userCursorVisibility.value.set(user.userId, !cur);
  emit('toggle-user-cursor', user, !cur);
}

function toggleAllCursors(): void {
  const newVisible = !props.showAllCursors;
  otherUsers.value.forEach(u => userCursorVisibility.value.set(u.userId, newVisible));
  emit('toggle-all-cursors', newVisible);
}

async function reconnect(): Promise<void> {
  reconnecting.value = true;
  try {
    emit('reconnect');
    await new Promise(r => setTimeout(r, 2000));
  } finally {
    reconnecting.value = false;
  }
}

function refreshUsers(): void { emit('refresh-users'); }

defineExpose({ refreshUsers });
</script>

<style scoped>
.online-users-panel {
  min-width: 240px;
}

/* ─── 连接状态条 ─────────────────────────────── */
.conn-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 2px;
}

.conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.conn-ok .conn-dot { background: #67c23a; }
.conn-ok .conn-text { color: #67c23a; }

.conn-ing .conn-dot { background: #e6a23c; animation: pulse 1.5s infinite; }
.conn-ing .conn-text { color: #e6a23c; }

.conn-off .conn-dot { background: #f56c6c; }
.conn-off .conn-text { color: #f56c6c; }

/* ─── 分区 ───────────────────────────────────── */
.user-section {
  padding: 2px 0;
}

.section-label {
  padding: 4px 12px 2px;
  font-size: 11px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ─── 用户行 ─────────────────────────────────── */
.user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.user-item:hover { background: #f5f7fa; }

.current-user-item {
  background: rgba(64, 158, 255, 0.06);
  cursor: default;
}

.current-user-item:hover { background: rgba(64, 158, 255, 0.09); }

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-sub {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.online-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #67c23a;
  flex-shrink: 0;
}

/* ─── 空 / 离线 ──────────────────────────────── */
.users-empty {
  padding: 12px 0;
}

.offline-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  text-align: center;
}

.offline-text {
  font-size: 13px;
  color: #606266;
}

/* ─── 快捷操作 ───────────────────────────────── */
.quick-actions {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
  margin-top: 2px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
