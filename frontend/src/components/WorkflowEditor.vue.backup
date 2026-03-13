<template>
  <div class="workflow-editor">
    <!-- 协同功能组件 -->
    <CollaborativeCursors
      ref="cursorsRef"
      :show-user-names="collaborationState.currentUser?.preferences?.showUserNames ?? true"
      :container="container || undefined"
      @cursor-click="handleCursorClick"
    />
    
    <OnlineUsersList
      v-if="collaborationEnabled"
      :users="collaborationState.onlineUsers"
      :current-user="currentUserForList"
      :connection-state="collaborationState.connectionState"
      :show-all-cursors="showAllCursors"
      class="online-users-panel"
      @edit-user="showUserConfig = true"
      @focus-user="focusOnUser"
      @toggle-user-cursor="toggleUserCursor"
      @toggle-all-cursors="toggleAllCursors"
      @reconnect="reconnectCollaboration"
      @refresh-users="refreshUsers"
    />

    <!-- 用户配置对话框 -->
    <UserConfigDialog
      v-if="collaborationManager"
      :visible="showUserConfig"
      :user-manager="collaborationManager.getUserManager()"
      @close="showUserConfig = false"
      @save="handleUserConfigSave"
    />

    <div class="toolbar">
      <h3>工作流图编辑器</h3>
      <div class="tool-buttons">
        <!-- 协同功能按钮 -->
        <button
          v-if="collaborationEnabled"
          @click="showUserConfig = true"
          class="btn btn-info"
          :title="`当前用户: ${collaborationState.currentUser?.displayName || '未设置'}`"
        >
          <span class="icon">👤</span> {{ collaborationState.currentUser?.displayName || '设置用户' }}
        </button>
        <div v-if="collaborationEnabled" class="connection-indicator" :class="connectionClass">
          <span class="connection-dot"></span>
          {{ connectionText }}
        </div>
        <div class="divider"></div>
        <button @click="addNode('text')" class="btn btn-secondary">
          <span class="icon">📝</span> 文本节点
        </button>
        <button @click="addNode('image')" class="btn btn-info">
          <span class="icon">🖼️</span> 图片节点
        </button>
        <button @click="addNode('audio')" class="btn btn-info">
          <span class="icon">🔊</span> 音频节点
        </button>
        <button @click="addNode('video')" class="btn btn-info">
          <span class="icon">🎬</span> 视频节点
        </button>
        <button @click="addNode('file')" class="btn btn-info">
          <span class="icon">📁</span> 文件节点
        </button>
        <button @click="addNode('property')" class="btn btn-info">
          <span class="icon">🏷️</span> 属性节点
        </button>
        <div class="divider"></div>
        <button @click="saveGraph" class="btn btn-info">
          <span class="icon">💾</span> 保存
        </button>
        <button @click="loadGraph" class="btn btn-info">
          <span class="icon">📂</span> 加载
        </button>
        <button @click="downloadJson" class="btn btn-success">
          <span class="icon">⬇️</span> 导出JSON
        </button>
        <button @click="clearGraph" class="btn btn-danger">
          <span class="icon">🗑️</span>清空
        </button>
      </div>
    </div>

    <div class="editor-container">
      <div class="graph-container" @contextmenu.prevent>
        <div
          ref="container"
          class="cytoplasm-container"
          @click="clearSelection"
        >
          <!-- SVG layer for edges -->
          <svg
            class="edge-layer"
            :width="containerSize.width"
            :height="containerSize.height"
          >
            <defs>
              <marker
                id="arrow"
                markerWidth="16"
                markerHeight="16"
                refX="14"
                refY="8"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M1,3 L14,8 L1,13 L4,8 z" fill="#5aa6e6" />
              </marker>
            </defs>
            <path
              v-for="edge in edges"
              :key="edge.id"
              :d="getEdgePath(edge.source, edge.target)"
              stroke="#5aa6e6"
              stroke-width="3"
              fill="none"
              marker-end="url(#arrow)"
            />
          </svg>

          <!-- Node overlays -->
          <div class="node-overlay-layer">
            <div
              v-for="node in nodes"
              :key="node.id"
              class="node-overlay"
              :id="'node_' + node.id"
              :class="`node-${node.type}`"
              :style="getNodeStyle(node)"
              v-resize="(w: number, h: number) => updateNodeSize(node, w, h)"
              @mousedown.stop="startDrag(node.id, $event)"
              @contextmenu.prevent.stop="openContext($event, node.id)"
            >
              <div v-if="node.type === 'root'" class="node-card node-card-root">
                <div class="node-root-label">
                  {{ formatRootTitle(node.title) }}
                </div>
              </div>

              <div v-else class="node-card">
                <div class="node-card-header">
                  <input
                    class="node-title-input"
                    v-model="node.title"
                    placeholder="节点标题"
                  />
                  <div class="node-header-actions">
                    <select class="node-status-select" v-model="node.status">
                      <option value="pending">⏳ 待执行</option>
                      <option value="running">🏃 执行中</option>
                      <option value="completed">✅ 已完成</option>
                      <option value="failed">❌ 执行失败</option>
                    </select>
                    <select
                      class="node-type-select"
                      v-model="node.type"
                      @change="updateNodeType(node)"
                    >
                      <option value="text">文本(Text)</option>
                      <option value="property">属性(Property)</option>
                      <option value="image">图片(Image)</option>
                      <option value="video">视频(Video)</option>
                      <option value="audio">音频(Audio)</option>
                      <option value="file">文件资源(File)</option>
                    </select>
                  </div>
                </div>

                <div class="node-card-body">
                  <textarea
                    v-if="node.type !== 'property'"
                    class="node-textarea"
                    v-model="node.config.textContent"
                    maxlength="2000"
                    placeholder="请输入提示词或描述..."
                  ></textarea>
                  <div v-if="node.type !== 'property'" class="node-text-count">
                    {{ (node.config.textContent || '').length }} / 2000
                  </div>

                  <div v-if="node.type === 'file'" class="additional-input">
                    <input
                      type="text"
                      class="node-file-input"
                      v-model="node.config.resourceUrl"
                      placeholder="关联文件路径..."
                    />
                  </div>

                  <div
                    v-if="node.type === 'property'"
                    class="property-list-container"
                  >
                    <div class="property-list">
                      <div
                        v-for="(prop, index) in node.config.properties"
                        :key="index"
                        class="property-row"
                      >
                        <input
                          v-model="prop.key"
                          class="prop-input prop-key"
                          placeholder="属性名"
                        />
                        <input
                          v-model="prop.value"
                          class="prop-input prop-val"
                          placeholder="属性值"
                        />
                        <button
                          class="remove-prop-btn"
                          @click="removeProperty(node, index)"
                        >
                          ✖
                        </button>
                      </div>
                    </div>
                    <button class="add-prop-btn" @click="addProperty(node)">
                      + 添加属性
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="contextMenu.visible"
          class="context-menu"
          :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        >
          <div class="context-menu-group">添加子节点</div>
          <button class="context-menu-item" @click="handleContextAdd('text')">
            增加文本节点
          </button>
          <button
            class="context-menu-item"
            @click="handleContextAdd('property')"
          >
            增加属性节点
          </button>
          <button class="context-menu-item" @click="handleContextAdd('file')">
            增加文件节点
          </button>
          <button class="context-menu-item" @click="handleContextAdd('image')">
            增加图片节点
          </button>
          <button class="context-menu-item" @click="handleContextAdd('video')">
            增加视频节点
          </button>
          <button class="context-menu-item" @click="handleContextAdd('audio')">
            增加音频节点
          </button>

          <div class="context-menu-divider"></div>
          <div class="context-menu-group">连线操作</div>
          <button class="context-menu-item" @click="setConnectionSource">
            设为连线起点
          </button>
          <button
            v-if="
              connectingSourceId && connectingSourceId !== contextMenu.nodeId
            "
            class="context-menu-item highlight-item"
            @click="connectFromSource"
          >
            🔌 连接至此节点
          </button>
          <button class="context-menu-item" @click="removeIncomingEdges">
            删除所有输入连线
          </button>
          <button class="context-menu-item" @click="removeOutgoingEdges">
            删除所有输出连线
          </button>

          <div class="context-menu-divider"></div>
          <button class="context-menu-item danger" @click="handleContextDelete">
            删除当前节点
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue';
import CollaborativeCursors from './CollaborativeCursors.vue';
import OnlineUsersList from './OnlineUsersList.vue';
import UserConfigDialog from './UserConfigDialog.vue';
import { CollaborationManagerService } from '../services/collaboration-manager.service';
import type { CollaborationState } from '../services/collaboration-manager.service';
import type { User, CollaborationOperation } from '../services/collaboration.service';
import type { UserConfig } from '../services/user-manager.service';
import type { OperationConflict } from '../services/operation-sync.service';
import { getWebSocketUrl } from '../config/websocket.config';

type NodeType =
  | 'root'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'property';
type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

interface NodeConfig {
  typeKey?: NodeType;
  textContent?: string;
  resourceName?: string;
  resourceUrl?: string;
  properties?: { key: string; value: string }[];
}

interface NodeItem {
  id: string;
  title: string;
  type: NodeType;
  status: NodeStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  config: NodeConfig;
}

interface EdgeItem {
  id: string;
  source: string;
  target: string;
}

const props = defineProps<{
  workflowData?: any | null;
  projectName?: string;
  collaborationEnabled?: boolean;
  projectId?: string;
}>();

const emit = defineEmits<{
  (e: 'save', payload: { elements: unknown[]; timestamp: string }): void;
}>();

const container = ref<HTMLDivElement | null>(null);
const containerSize = ref({ width: 1200, height: 800 });
const nodes = ref<NodeItem[]>([]);
const edges = ref<EdgeItem[]>([]);

// 协同功能相关
const collaborationManager = ref<CollaborationManagerService | null>(null);
const collaborationState = ref<CollaborationState>({
  isEnabled: false,
  isConnected: false,
  connectionState: 'disconnected',
  currentUser: null,
  onlineUsers: [],
  pendingOperations: 0,
  conflicts: 0,
});
const showUserConfig = ref(false);
const showAllCursors = ref(true);
const cursorsRef = ref<InstanceType<typeof CollaborativeCursors> | null>(null);

const generateUniqueId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
};

const dragging = reactive({ 
  id: '', 
  offsetX: 0, 
  offsetY: 0, 
  active: false,
  lastBroadcastTime: 0,
  broadcastThrottle: 100, // 100ms节流，避免过于频繁的广播
});
const contextMenu = reactive({ visible: false, x: 0, y: 0, nodeId: '' });

const connectingSourceId = ref<string>('');

// 协同功能计算属性
const currentUserForList = computed(() => {
  const currentUser = collaborationState.value.currentUser;
  if (!currentUser) return null;
  
  return {
    userId: currentUser.userId,
    displayName: currentUser.displayName,
    color: currentUser.color,
    isOnline: true,
    lastSeen: new Date(),
  } as User;
});

const connectionClass = computed(() => {
  switch (collaborationState.value.connectionState) {
    case 'connected':
      return 'connected';
    case 'connecting':
    case 'reconnecting':
      return 'connecting';
    case 'disconnected':
      return 'disconnected';
    default:
      return 'unknown';
  }
});

const connectionText = computed(() => {
  const onlineCount = collaborationState.value.onlineUsers.length;
  
  switch (collaborationState.value.connectionState) {
    case 'connected':
      return `已连接 (${onlineCount}人在线)`;
    case 'connecting':
      return '连接中...';
    case 'reconnecting':
      return '重连中...';
    case 'disconnected':
      return '离线模式';
    default:
      return '未知状态';
  }
});

const vResize = {
  mounted(el: HTMLElement, binding: any) {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const target = entry?.target as HTMLElement;
      binding.value(target.offsetWidth, target.offsetHeight);
    });
    observer.observe(el);
    (el as any)._resizeObserver = observer;
  },
  unmounted(el: HTMLElement) {
    if ((el as any)._resizeObserver) {
      (el as any)._resizeObserver.disconnect();
    }
  },
};

const updateNodeSize = (node: NodeItem, w: number, h: number) => {
  if (Math.abs(node.width - w) > 2 || Math.abs(node.height - h) > 2) {
    node.width = w;
    node.height = h;
  }
};

const getNodeSize = (type: NodeType) => {
  switch (type) {
    case 'root':
      return { width: 180, height: 70 };
    case 'property':
      return { width: 440, height: 260 };
    case 'text':
    case 'file':
    case 'image':
    case 'video':
    case 'audio':
      return { width: 420, height: 260 };
    default:
      return { width: 420, height: 260 };
  }
};

const formatRootTitle = (title: string) => (title || '项目').toUpperCase();

const ensureRoot = () => {
  if (nodes.value.find((n) => n.type === 'root')) return;
  const size = getNodeSize('root');
  nodes.value.push({
    id: 'node_root',
    title: props.projectName || '项目',
    type: 'root',
    status: 'pending',
    x: 200,
    y: 120,
    width: size.width,
    height: size.height,
    zIndex: 10,
    config: { typeKey: 'root' },
  });
};

const updateContainerSize = () => {
  if (!container.value) return;
  const r = container.value.getBoundingClientRect();
  containerSize.value.width = Math.max(r.width, 1);
  containerSize.value.height = Math.max(r.height, 1);
};

onMounted(() => {
  updateContainerSize();
  window.addEventListener('resize', updateContainerSize);
  ensureRoot();
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('click', () => {
    contextMenu.visible = false;
  });

  // 初始化协同功能
  if (props.collaborationEnabled && props.projectId) {
    initializeCollaboration();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateContainerSize);
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);

  // 清理协同功能
  if (collaborationManager.value) {
    collaborationManager.value.destroy();
  }
});

watch(
  () => props.workflowData,
  (value) => {
    if (!value || !Array.isArray(value.elements)) return;
    nodes.value = [];
    edges.value = [];
    value.elements.forEach((el: any) => {
      if (el.group === 'nodes') {
        const pos = el.position || { x: 100, y: 100 };
        const type: NodeType = el.data?.type || 'text';
        const size = getNodeSize(type);
        nodes.value.push({
          id: el.data?.id || generateUniqueId('node'),
          title: el.data?.title || el.data?.name || '节点',
          type,
          status: el.data?.status || 'pending',
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
          zIndex: 10,
          config: el.data?.config || {},
        });
      }
      if (el.group === 'edges') {
        edges.value.push({
          id: el.data?.id || generateUniqueId('edge'),
          source: el.data?.source,
          target: el.data?.target,
        });
      }
    });
    ensureRoot();
  },
  { immediate: true },
);

const getNodeById = (id: string) => nodes.value.find((n) => n.id === id);

const getEdgePath = (sourceId: string, targetId: string) => {
  const sourceNode = getNodeById(sourceId);
  const targetNode = getNodeById(targetId);
  if (!sourceNode || !targetNode) return '';

  const x1 = sourceNode.x;
  const y1 = sourceNode.y;
  const x2 = targetNode.x;
  const y2 = targetNode.y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return '';

  const tw = targetNode.width / 2 + 8; // padding for arrow marker visibility
  const th = targetNode.height / 2 + 8;
  const txScale = dx !== 0 ? Math.abs(tw / dx) : Infinity;
  const tyScale = dy !== 0 ? Math.abs(th / dy) : Infinity;
  const tScale = Math.min(txScale, tyScale, 1);

  const tx = x2 - dx * tScale;
  const ty = y2 - dy * tScale;

  const sw = sourceNode.width / 2;
  const sh = sourceNode.height / 2;
  const sxScale = dx !== 0 ? Math.abs(sw / dx) : Infinity;
  const syScale = dy !== 0 ? Math.abs(sh / dy) : Infinity;
  const sScale = Math.min(sxScale, syScale, 1);

  const sx = x1 + dx * sScale;
  const sy = y1 + dy * sScale;

  return `M ${sx},${sy} L ${tx},${ty}`;
};

const getNodeStyle = (node: NodeItem) => {
  const isProp = node.type === 'property';
  const isRoot = node.type === 'root';
  return {
    left: `${node.x}px`,
    top: `${node.y}px`,
    transform: 'translate(-50%, -50%)',
    width: isProp ? 'fit-content' : isRoot ? '180px' : '420px',
    height: isProp ? 'fit-content' : isRoot ? '70px' : '260px',
    minWidth: isProp ? '440px' : 'auto',
    minHeight: isProp ? '260px' : 'auto',
    zIndex: node.zIndex || 10,
  };
};

const startDrag = (id: string, e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const tagName = target.tagName;

  if (
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'INPUT' ||
    tagName === 'BUTTON' ||
    target.closest('.prop-input')
  ) {
    return;
  }

  e.preventDefault();

  const n = getNodeById(id);
  if (!n || !container.value) return;
  const rect = container.value.getBoundingClientRect();
  dragging.id = id;
  dragging.active = true;
  dragging.offsetX = e.clientX - rect.left - n.x;
  dragging.offsetY = e.clientY - rect.top - n.y;
  dragging.lastBroadcastTime = 0;

  // Bring to front
  nodes.value.forEach((node) => {
    node.zIndex = node.id === id ? 20 : 10;
  });

  // 广播拖拽开始
  broadcastOperation({
    type: 'node-update',
    nodeId: id,
    data: {
      position: { x: n.x, y: n.y },
      isDragging: true,
      dragStart: true, // 标记为拖拽开始
    },
  });
};

const onMouseMove = (e: MouseEvent) => {
  if (!dragging.active) return;
  const n = getNodeById(dragging.id);
  if (!n || !container.value) return;
  
  const rect = container.value.getBoundingClientRect();
  const newX = e.clientX - rect.left - dragging.offsetX;
  const newY = e.clientY - rect.top - dragging.offsetY;
  
  // 更新节点位置
  n.x = newX;
  n.y = newY;
  
  // 节流广播拖拽中的位置更新
  const now = Date.now();
  if (now - dragging.lastBroadcastTime > dragging.broadcastThrottle) {
    broadcastOperation({
      type: 'node-update',
      nodeId: dragging.id,
      data: {
        position: { x: newX, y: newY },
        isDragging: true, // 标记为拖拽中的更新
      },
    });
    dragging.lastBroadcastTime = now;
  }
};

const onMouseUp = () => {
  if (dragging.active && dragging.id) {
    const node = getNodeById(dragging.id);
    if (node) {
      // 广播节点位置更新（拖拽结束）
      broadcastOperation({
        type: 'node-update',
        nodeId: dragging.id,
        data: {
          position: { x: node.x, y: node.y },
          isDragging: false, // 标记为拖拽结束
        },
      });
    }
  }
  
  dragging.active = false;
  dragging.id = '';
  dragging.lastBroadcastTime = 0;
};

const addNode = (
  type: NodeType,
  position?: { x: number; y: number },
  parentId?: string,
) => {
  const id = generateUniqueId('node');
  const size = getNodeSize(type);
  const pos = position ?? {
    x: 150 + Math.random() * 300,
    y: 150 + Math.random() * 300,
  };
  
  const newNode: NodeItem = {
    id,
    title: `${type.toUpperCase()} ${id}`,
    type,
    status: 'pending',
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
    zIndex: 10,
    config: getDefaultConfig(type) as any,
  };
  
  nodes.value.push(newNode);
  
  if (parentId) {
    createEdge(parentId, id);
  }

  // 广播节点创建操作
  broadcastOperation({
    type: 'node-create',
    nodeId: id,
    data: {
      title: newNode.title,
      type: newNode.type,
      status: newNode.status,
      position: { x: pos.x, y: pos.y },
      config: newNode.config,
      parentId,
    },
  });
};

const addProperty = (node: NodeItem) => {
  if (!node.config.properties) {
    node.config.properties = [];
  }
  node.config.properties.push({ key: '', value: '' });
};

const removeProperty = (node: NodeItem, index: number) => {
  if (node.config.properties) {
    node.config.properties.splice(index, 1);
  }
};

const createEdge = (source: string, target: string) => {
  if (edges.value.find((e) => e.source === source && e.target === target))
    return;
  
  const edgeId = generateUniqueId('edge');
  const newEdge = { id: edgeId, source, target };
  edges.value.push(newEdge);
  
  // 广播边创建操作
  broadcastOperation({
    type: 'edge-create',
    edgeId: edgeId,
    data: { source, target },
  });
};

const getDefaultConfig = (type: NodeType) => {
  switch (type) {
    case 'text':
      return { typeKey: 'text', textContent: '' };
    case 'property':
      return {
        typeKey: 'property',
        textContent: '',
        properties: [{ key: '', value: '' }],
      };
    case 'image':
      return { typeKey: 'image', resourceName: '', resourceUrl: '' };
    case 'video':
      return { typeKey: 'video', resourceName: '', resourceUrl: '' };
    case 'audio':
      return { typeKey: 'audio', resourceName: '', resourceUrl: '' };
    default:
      return { typeKey: type };
  }
};

const handleContextAdd = (type: NodeType) => {
  if (!contextMenu.nodeId) return;
  const parent = contextMenu.nodeId;
  addNode(type, undefined, parent);
  contextMenu.visible = false;
};

const handleContextDelete = () => {
  if (!contextMenu.nodeId) return;
  const id = contextMenu.nodeId;
  const n = getNodeById(id);
  if (!n) return;
  if (n.type === 'root') {
    alert('根节点不可删除');
    contextMenu.visible = false;
    return;
  }
  
  // 删除节点和相关连接
  nodes.value = nodes.value.filter((i) => i.id !== id);
  edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
  
  // 广播删除操作
  broadcastOperation({
    type: 'node-delete',
    nodeId: id,
    data: {},
  });
  
  contextMenu.visible = false;
};

const setConnectionSource = () => {
  if (!contextMenu.nodeId) return;
  connectingSourceId.value = contextMenu.nodeId;
  contextMenu.visible = false;
};

const connectFromSource = () => {
  if (!connectingSourceId.value || !contextMenu.nodeId) return;
  createEdge(connectingSourceId.value, contextMenu.nodeId);
  connectingSourceId.value = '';
  contextMenu.visible = false;
};

const removeIncomingEdges = () => {
  if (!contextMenu.nodeId) return;
  edges.value = edges.value.filter((e) => e.target !== contextMenu.nodeId);
  contextMenu.visible = false;
};

const removeOutgoingEdges = () => {
  if (!contextMenu.nodeId) return;
  edges.value = edges.value.filter((e) => e.source !== contextMenu.nodeId);
  contextMenu.visible = false;
};

const openContext = (e: MouseEvent, nodeId: string) => {
  if (container.value && container.value.parentElement) {
    const rect = container.value.parentElement.getBoundingClientRect();
    contextMenu.x = e.clientX - rect.left;
    contextMenu.y = e.clientY - rect.top;
  } else {
    contextMenu.x = e.clientX;
    contextMenu.y = e.clientY;
  }
  contextMenu.visible = true;
  contextMenu.nodeId = nodeId;
};

const clearSelection = () => {
  contextMenu.visible = false;
};

const saveGraph = () => {
  const elements: any[] = [];
  nodes.value.forEach((n) =>
    elements.push({
      group: 'nodes',
      data: {
        id: n.id,
        name: n.title,
        title: n.title,
        type: n.type,
        status: n.status,
        config: n.config,
      },
      position: { x: n.x, y: n.y },
    }),
  );
  edges.value.forEach((e) =>
    elements.push({
      group: 'edges',
      data: { id: e.id, source: e.source, target: e.target },
    }),
  );
  emit('save', { elements, timestamp: new Date().toISOString() });
};

const updateNodeType = (node: NodeItem) => {
  const size = getNodeSize(node.type);
  node.width = size.width;
  node.height = size.height;
  node.config = getDefaultConfig(node.type) as any;
};

const loadGraph = () => {
  // watcher will handle reloading from props.workflowData
};

const downloadJson = () => {
  if (nodes.value.length === 0) return;

  // Build a map for easy lookup
  const nodeMap = new Map();
  nodes.value.forEach((n) => nodeMap.set(n.id, n));

  // Determine root nodes (nodes with no incoming edges or strictly type 'root')
  const rootNode = nodes.value.find((n) => n.type === 'root');

  const structNodes = nodes.value.map((n) => {
    const incomingEdges = edges.value.filter((e) => e.target === n.id);
    const parentId = incomingEdges.length > 0 ? incomingEdges[0]?.source || null : null;
    const outgoing = edges.value
      .filter((e) => e.source === n.id)
      .map((e) => e.target);
    const contentText = n.config.textContent || '';
    const fileUrl = n.config.resourceUrl || '';

    return {
      id: n.id,
      title: n.title,
      type: n.type,
      status: n.status,
      description: contentText,
      fileResource: fileUrl,
      properties: n.config.properties || [],
      dependsOn: parentId,
      nextNodes: outgoing,
      metadata: {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      },
    };
  });

  // Extract separate workflow pipelines (paths originating from root)
  const pipelines: any[] = [];
  if (rootNode) {
    const rootEdges = edges.value.filter((e) => e.source === rootNode.id);
    rootEdges.forEach((e) => {
      // Each outgoing edge from root is a top-level feature pipeline
      const targetNode = nodeMap.get(e.target);
      if (targetNode) {
        pipelines.push({
          pipelineStartId: e.target,
          featureName: targetNode.title,
          description: targetNode.config?.textContent || '',
        });
      }
    });
  }

  const exportData = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    project: {
      name: props.projectName || 'Workflow Project',
      exportTime: new Date().toISOString(),
      totalNodes: nodes.value.length,
      totalEdges: edges.value.length,
      description: '工作流自动化与项目拆解图谱',
    },
    pipelines: pipelines,
    nodes: structNodes,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.projectName || 'workflow'}_schema.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const clearGraph = () => {
  if (!confirm('确定要清空所有节点吗？')) return;
  
  // 广播清空操作
  if (collaborationManager.value && collaborationState.value.isConnected) {
    broadcastOperation({
      type: 'node-delete',
      data: { clearAll: true },
    });
  }
  
  nodes.value = [];
  edges.value = [];
  ensureRoot();
};

// ==================== 协同功能方法 ====================

/**
 * 初始化协同功能
 */
async function initializeCollaboration(): Promise<void> {
  if (!props.projectId) {
    console.warn('无法初始化协同功能：缺少项目ID');
    return;
  }

  try {
    console.log('开始初始化协同功能...');
    
    collaborationManager.value = new CollaborationManagerService({
      serverUrl: getWebSocketUrl(),
      enabled: true,
      autoConnect: true,
    });

    // 设置事件监听器
    setupCollaborationEventHandlers();

    // 等待DOM渲染完成
    await nextTick();
    
    if (container.value) {
      console.log('启动协同功能，项目ID:', props.projectId);
      await collaborationManager.value.start(props.projectId, container.value);
      console.log('协同功能启动成功');
    } else {
      console.error('容器元素未找到');
    }

  } catch (error) {
    console.error('协同功能初始化失败:', error);
  }
}

/**
 * 设置协同功能事件处理器
 */
function setupCollaborationEventHandlers(): void {
  if (!collaborationManager.value) return;

  // 状态变化
  collaborationManager.value.onStateChange((state) => {
    console.log('协同状态更新:', {
      isConnected: state.isConnected,
      connectionState: state.connectionState,
      onlineUsersCount: state.onlineUsers.length,
      currentUser: state.currentUser?.displayName,
    });
    collaborationState.value = state;
  });

  // 用户加入
  collaborationManager.value.onUserJoin((user) => {
    console.log(`用户 ${user.displayName} 加入协作`);
  });

  // 用户离开
  collaborationManager.value.onUserLeave((userId) => {
    // 移除该用户的光标
    if (cursorsRef.value) {
      cursorsRef.value.removeCursor(userId);
    }
    console.log(`用户 ${userId} 离开协作`);
  });

  // 光标更新
  collaborationManager.value.onCursorUpdate((userId, position) => {
    const user = collaborationState.value.onlineUsers.find(u => u.userId === userId);
    if (user && cursorsRef.value) {
      cursorsRef.value.updateCursor(
        userId,
        user.displayName,
        user.color || '#999',
        position
      );
    }
  });

  // 操作接收
  collaborationManager.value.onOperation((operation) => {
    handleRemoteOperation(operation);
  });

  // 冲突检测
  collaborationManager.value.onConflict((conflict) => {
    handleOperationConflict(conflict);
  });
}

/**
 * 处理远程操作
 */
function handleRemoteOperation(operation: CollaborationOperation): void {
  console.log('收到远程操作:', operation);

  switch (operation.type) {
    case 'node-create':
      handleRemoteNodeCreate(operation);
      break;
    case 'node-update':
      handleRemoteNodeUpdate(operation);
      break;
    case 'node-delete':
      handleRemoteNodeDelete(operation);
      break;
    case 'edge-create':
      handleRemoteEdgeCreate(operation);
      break;
    case 'edge-delete':
      handleRemoteEdgeDelete(operation);
      break;
  }
}

/**
 * 处理远程节点创建
 */
function handleRemoteNodeCreate(operation: CollaborationOperation): void {
  const data = operation.data as any;
  if (!data || !operation.nodeId) return;

  // 检查节点是否已存在
  if (getNodeById(operation.nodeId)) return;

  const size = getNodeSize(data.type || 'text');
  const newNode: NodeItem = {
    id: operation.nodeId,
    title: data.title || data.name || '远程节点',
    type: data.type || 'text',
    status: data.status || 'pending',
    x: data.position?.x || 100,
    y: data.position?.y || 100,
    width: size.width,
    height: size.height,
    zIndex: 10,
    config: data.config || getDefaultConfig(data.type || 'text'),
  };

  nodes.value.push(newNode);

  // 如果有父节点，创建连接
  if (data.parentId) {
    createEdge(data.parentId, operation.nodeId);
  }
}

/**
 * 处理远程节点更新
 */
function handleRemoteNodeUpdate(operation: CollaborationOperation): void {
  const data = operation.data as any;
  if (!data || !operation.nodeId) return;

  const node = getNodeById(operation.nodeId);
  if (!node) return;

  // 如果当前正在拖拽这个节点，忽略远程更新避免冲突
  if (dragging.active && dragging.id === operation.nodeId) {
    console.log(`忽略正在拖拽节点 ${operation.nodeId} 的远程更新`);
    return;
  }

  // 更新节点属性
  if (data.title !== undefined) node.title = data.title;
  if (data.status !== undefined) node.status = data.status;
  if (data.type !== undefined) node.type = data.type;
  if (data.config !== undefined) node.config = { ...node.config, ...data.config };
  
  // 更新节点位置
  if (data.position) {
    node.x = data.position.x;
    node.y = data.position.y;
    
    // 如果是拖拽相关的更新，添加视觉反馈
    if (data.isDragging) {
      const nodeElement = document.getElementById(`node_${operation.nodeId}`);
      if (nodeElement) {
        if (data.dragStart) {
          // 拖拽开始
          nodeElement.classList.add('remote-drag-start');
          setTimeout(() => {
            nodeElement.classList.remove('remote-drag-start');
            nodeElement.classList.add('remote-dragging');
          }, 200);
        } else {
          // 拖拽中
          nodeElement.classList.add('remote-dragging');
        }
        
        // 拖拽结束时移除样式
        if (!data.isDragging) {
          nodeElement.classList.remove('remote-dragging', 'remote-drag-start');
        }
      }
    } else {
      // 非拖拽更新，移除拖拽样式
      const nodeElement = document.getElementById(`node_${operation.nodeId}`);
      if (nodeElement) {
        nodeElement.classList.remove('remote-dragging', 'remote-drag-start');
      }
    }
    
    const dragStatus = data.dragStart ? ' [开始拖拽]' : data.isDragging ? ' [拖拽中]' : ' [拖拽结束]';
    console.log(`远程更新节点 ${operation.nodeId} 位置: (${data.position.x}, ${data.position.y})${data.isDragging || data.dragStart ? dragStatus : ''}`);
  }
}

/**
 * 处理远程节点删除
 */
function handleRemoteNodeDelete(operation: CollaborationOperation): void {
  const data = operation.data as any;
  
  // 处理清空所有节点
  if (data?.clearAll) {
    nodes.value = [];
    edges.value = [];
    ensureRoot();
    return;
  }

  if (!operation.nodeId) return;

  // 删除节点
  nodes.value = nodes.value.filter(n => n.id !== operation.nodeId);
  
  // 删除相关连接
  edges.value = edges.value.filter(e => 
    e.source !== operation.nodeId && e.target !== operation.nodeId
  );
}

/**
 * 处理远程边创建
 */
function handleRemoteEdgeCreate(operation: CollaborationOperation): void {
  const data = operation.data as any;
  if (!data || !data.source || !data.target) return;

  // 检查边是否已存在
  if (edges.value.find(e => e.source === data.source && e.target === data.target)) {
    return;
  }

  edges.value.push({
    id: operation.edgeId || generateUniqueId('edge'),
    source: data.source,
    target: data.target,
  });
}

/**
 * 处理远程边删除
 */
function handleRemoteEdgeDelete(operation: CollaborationOperation): void {
  if (!operation.edgeId) return;

  edges.value = edges.value.filter(e => e.id !== operation.edgeId);
}

/**
 * 处理操作冲突
 */
function handleOperationConflict(conflict: OperationConflict): void {
  console.warn('操作冲突:', conflict);
  
  // 这里可以显示冲突解决界面
  // 目前简单地接受远程操作
  if (collaborationManager.value) {
    collaborationManager.value.resolveConflict(conflict, 'accept-remote');
  }
}

/**
 * 广播操作
 */
function broadcastOperation(operation: Omit<CollaborationOperation, 'userId' | 'timestamp'>): void {
  if (collaborationManager.value && collaborationState.value.isConnected) {
    collaborationManager.value.broadcastOperation(operation);
  }
}

/**
 * 处理用户配置保存
 */
function handleUserConfigSave(userConfig: UserConfig): void {
  if (collaborationManager.value) {
    collaborationManager.value.updateUserInfo(userConfig);
  }
  showUserConfig.value = false;
}

/**
 * 聚焦到用户
 */
function focusOnUser(user: User): void {
  // 这里可以实现聚焦到用户光标的逻辑
  console.log('聚焦到用户:', user.displayName);
}

/**
 * 切换用户光标显示
 */
function toggleUserCursor(user: User, visible: boolean): void {
  if (cursorsRef.value) {
    if (visible) {
      cursorsRef.value.showCursor(user.userId);
    } else {
      cursorsRef.value.hideCursor(user.userId);
    }
  }
}

/**
 * 切换所有光标显示
 */
function toggleAllCursors(visible: boolean): void {
  showAllCursors.value = visible;
  
  if (cursorsRef.value) {
    collaborationState.value.onlineUsers.forEach(user => {
      if (visible) {
        cursorsRef.value!.showCursor(user.userId);
      } else {
        cursorsRef.value!.hideCursor(user.userId);
      }
    });
  }
}

/**
 * 重新连接协同服务
 */
async function reconnectCollaboration(): Promise<void> {
  if (collaborationManager.value) {
    try {
      await collaborationManager.value.reconnect();
    } catch (error) {
      console.error('重连失败:', error);
    }
  }
}

/**
 * 刷新用户列表
 */
function refreshUsers(): void {
  // 这里可以实现刷新用户列表的逻辑
  console.log('刷新用户列表');
}

/**
 * 处理光标点击
 */
function handleCursorClick(userId: string): void {
  const user = collaborationState.value.onlineUsers.find(u => u.userId === userId);
  if (user) {
    console.log(`点击了 ${user.displayName} 的光标`);
  }
}
</script>

<style scoped>
.workflow-editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  position: relative;
}

.online-users-panel {
  position: absolute;
  top: 80px;
  right: 20px;
  z-index: 1000;
}

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
}

.connection-indicator.connected {
  background: rgba(40, 167, 69, 0.1);
  color: #28a745;
}

.connection-indicator.connecting {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
}

.connection-indicator.disconnected {
  background: rgba(220, 53, 69, 0.1);
  color: #dc3545;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.connection-indicator.connecting .connection-dot {
  animation: pulse 1.5s infinite;
}

.toolbar {
  background: #fff;
  padding: 1rem;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar h3 {
  margin: 0;
  color: #333;
}

.tool-buttons {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.btn-primary {
  background: #667eea;
  color: white;
}
.btn-secondary {
  background: #2196f3;
  color: white;
}
.btn-warning {
  background: #ff9800;
  color: white;
}
.btn-success {
  background: #4caf50;
  color: white;
}
.btn-info {
  background: #00bcd4;
  color: white;
}
.btn-danger {
  background: #f44336;
  color: white;
}

.btn-block {
  width: 100%;
  justify-content: center;
}

.icon {
  font-size: 1.1rem;
}

.divider {
  width: 1px;
  height: 24px;
  background: #ddd;
  margin: 0 0.5rem;
}

.editor-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 600px;
  width: 100%;
  max-width: 100%;
}

.graph-container {
  flex: 1;
  position: relative;
  min-height: 600px;
  width: 100%;
  max-width: 100%;
}

.cytoplasm-container {
  width: 100%;
  height: 100%;
  background: #fafafa;
  border: 2px solid #ddd;
  border-radius: 4px;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  min-height: 600px;
}

.edge-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.node-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.node-overlay {
  position: absolute;
  pointer-events: auto;
  transition: all 0.1s ease-out;
}

.node-overlay.remote-drag-start {
  animation: dragStartPulse 0.3s ease-out;
}

.node-overlay.remote-dragging {
  box-shadow: 0 0 20px rgba(102, 126, 234, 0.6);
  transform: scale(1.02);
  z-index: 999;
}

.node-overlay.remote-dragging .node-card {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.05);
}

@keyframes dragStartPulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 rgba(102, 126, 234, 0.6);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 30px rgba(102, 126, 234, 0.8);
  }
  100% {
    transform: scale(1.02);
    box-shadow: 0 0 20px rgba(102, 126, 234, 0.6);
  }
}

.node-overlay,
.node-card {
  box-sizing: border-box;
}

.node-card {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: #ffffff;
  border: 2px solid #2e73b2;
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.node-card-header {
  background: linear-gradient(180deg, #5aa6e6 0%, #2f7bbd 100%);
  color: #fff;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.node-title-input {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex: 1;
  margin-right: 8px;
  outline: none;
}
.node-title-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.node-header-actions {
  display: flex;
  gap: 4px;
}

.node-type-select,
.node-status-select {
  background: #ffffff;
  border: 1px solid #c9d7ea;
  border-radius: 6px;
  padding: 4px;
  font-size: 11px;
  color: #2c3e50;
  width: auto;
  min-width: 60px;
}

.node-card-body {
  flex: 1;
  padding: 10px;
  background: #f9fbfd;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-textarea {
  flex: 1;
  border: 1px solid #cfd8e3;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  resize: none;
  background: #ffffff;
  color: #2c3e50;
}

.node-text-count {
  text-align: right;
  font-size: 11px;
  color: #7b8794;
}

.additional-input {
  margin-top: 4px;
}
.node-file-input {
  width: 100%;
  border: 1px solid #d4deea;
  border-radius: 6px;
  padding: 6px;
  font-size: 12px;
  background: #ffffff;
  color: #2c3e50;
  box-sizing: border-box;
}

.property-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.property-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 8px;
}

.property-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
  align-items: center;
}

.prop-input {
  flex: 1;
  border: 1px solid #cfd8e3;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 11px;
  min-width: 0;
}

.prop-key {
  flex: 0.8;
  font-weight: 500;
}

.remove-prop-btn {
  background: transparent;
  border: none;
  color: #f44336;
  cursor: pointer;
  padding: 0 4px;
  font-size: 12px;
}

.add-prop-btn {
  background: #e9f0f7;
  border: 1px dashed #b1c5d8;
  color: #2e73b2;
  border-radius: 4px;
  padding: 4px;
  font-size: 11px;
  cursor: pointer;
  text-align: center;
  width: 100%;
}
.add-prop-btn:hover {
  background: #dfe8f2;
}

.node-media-body {
  align-items: center;
  justify-content: center;
}

.node-media-icon {
  width: 70px;
  height: 55px;
  border-radius: 12px;
  border: 2px solid #cfd8e3;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #6b7c93;
  background: #ffffff;
}

.node-card-root {
  background: linear-gradient(180deg, #1f5d98 0%, #0e3f6f 100%);
  border-radius: 14px;
  border: 2px solid #0b3c66;
  box-shadow: 0 14px 26px rgba(0, 0, 0, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}

.node-root-label {
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
}

.context-menu {
  position: absolute;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  z-index: 30;
  min-width: 140px;
}

.context-menu-item {
  border: none;
  background: transparent;
  padding: 0.6rem 0.9rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
  color: #333;
}

.context-menu-item:hover {
  background: rgba(102, 126, 234, 0.08);
}
.context-menu-item.danger {
  color: #f44336;
}
.context-menu-divider {
  height: 1px;
  background: #eee;
  margin: 4px 0;
}
.context-menu-group {
  font-size: 0.75rem;
  color: #999;
  padding: 4px 14px;
  text-transform: uppercase;
}
.highlight-item {
  color: #2196f3;
  font-weight: bold;
}
</style>
