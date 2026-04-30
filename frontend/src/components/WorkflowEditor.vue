<template>
  <div class="workflow-editor">
    <!-- 用户配置对话框 -->
    <UserConfigDialog
      v-if="collaborationManager"
      :visible="showUserConfig"
      :user-manager="collaborationManager.getUserManager()"
      @close="showUserConfig = false"
      @save="handleUserConfigSave"
    />

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <!-- 节点添加按钮组 -->
        <el-tooltip content="文本节点" placement="bottom">
          <el-button size="small" :icon="Document" @click="addNode('text')">文本</el-button>
        </el-tooltip>
        <el-tooltip content="图片节点" placement="bottom">
          <el-button size="small" :icon="Picture" @click="addNode('image')">图片</el-button>
        </el-tooltip>
        <el-tooltip content="音频节点" placement="bottom">
          <el-button size="small" :icon="Headset" @click="addNode('audio')">音频</el-button>
        </el-tooltip>
        <el-tooltip content="视频节点" placement="bottom">
          <el-button size="small" :icon="VideoPlay" @click="addNode('video')">视频</el-button>
        </el-tooltip>
        <el-tooltip content="文件节点" placement="bottom">
          <el-button size="small" :icon="FolderOpened" @click="addNode('file')">文件</el-button>
        </el-tooltip>
        <el-tooltip content="属性节点" placement="bottom">
          <el-button size="small" :icon="List" @click="addNode('property')">属性</el-button>
        </el-tooltip>
      </div>

      <div class="toolbar-right">
        <!-- 协同状态 -->
        <template v-if="collaborationEnabled">
          <!-- 连接状态标签 -->
          <el-tag
            :type="connectionClass === 'connected' ? 'success' : connectionClass === 'connecting' ? 'warning' : 'danger'"
            size="small"
            class="conn-tag"
          >
            <span class="conn-dot" />
            {{ connectionText }}
          </el-tag>

          <!-- 当前用户设置 -->
          <el-tooltip :content="`当前用户: ${collaborationState.currentUser?.displayName || '未设置'}`" placement="bottom">
            <el-button size="small" :icon="UserIcon" circle @click="showUserConfig = true" />
          </el-tooltip>

          <!-- 在线用户 Popover -->
          <el-popover
            placement="bottom-end"
            :width="270"
            trigger="click"
            popper-class="online-users-popover"
          >
            <template #reference>
              <el-tooltip content="在线用户" placement="bottom">
                <el-button size="small" circle>
                  <el-badge
                    :value="collaborationState.onlineUsers.length"
                    :hidden="collaborationState.onlineUsers.length === 0"
                    type="success"
                  >
                    <el-icon><UserFilled /></el-icon>
                  </el-badge>
                </el-button>
              </el-tooltip>
            </template>

            <OnlineUsersList
              :users="collaborationState.onlineUsers"
              :current-user="currentUserForList"
              :connection-state="collaborationState.connectionState"
              @edit-user="showUserConfig = true"
              @focus-user="focusOnUser"
              @reconnect="reconnectCollaboration"
              @refresh-users="refreshUsers"
            />
          </el-popover>

          <el-divider direction="vertical" />
        </template>

        <!-- 操作按钮 -->
        <!-- <el-tooltip content="保存 (Ctrl+S)" placement="bottom">
          <el-button size="small" type="primary" :icon="DocumentChecked" @click="saveGraph">保存</el-button>
        </el-tooltip>
        <el-tooltip content="导出 JSON" placement="bottom">
          <el-button size="small" :icon="Download" @click="downloadJson">导出</el-button>
        </el-tooltip> -->

        <el-tooltip content="整理为从上到下" placement="bottom">
          <el-button size="small" @click="organizeGraph">整理</el-button>
        </el-tooltip>
        <el-tooltip content="清空画布" placement="bottom">
          <el-button size="small" type="danger" plain :icon="Delete" @click="clearGraph" />
        </el-tooltip>
      </div>
    </div>

    <!-- LogicFlow 编辑器容器 -->
    <div class="editor-container">
      <div ref="container" class="logicflow-container"></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import {
  Document, Picture, Headset, VideoPlay, FolderOpened, List,
  DocumentChecked, Download, Delete,
  User as UserIcon, UserFilled,
} from '@element-plus/icons-vue';
import LogicFlow from '@logicflow/core';
// CSS 已在 main.ts 统一导入，此处不重复引入
import OnlineUsersList from './OnlineUsersList.vue';
import UserConfigDialog from './UserConfigDialog.vue';
import { CollaborationManagerService } from '../services/collaboration-manager.service';
import type { CollaborationState } from '../services/collaboration-manager.service';
import type { User, CollaborationOperation } from '../services/collaboration.service';
import type { UserConfig } from '../services/user-manager.service';
import { getWebSocketUrl } from '../config/websocket.config';
import { createLogicFlowInstance } from '../config/logicflow.config';
import { resetNodeCardRenderState } from '../nodes/NodeCardRenderer';
import { logicFlowConverter } from '../utils/logicflow-converter';
import '../nodes/node-card.css';
import { workflowLogger, logicflowLogger } from '../utils/logger';
import type { 
  NodeType, 
  NodeStatus, 
  ExtendedNodeConfig, 
  ExtendedEdgeConfig,
  WorkflowData 
} from '../types/logicflow.types';

// 确保LogicFlow正确导入
workflowLogger.group('模块导入检查');
workflowLogger.info('LogicFlow导入状态', {
  LogicFlow: typeof LogicFlow,
  LogicFlowConstructor: LogicFlow,
  createLogicFlowInstance: typeof createLogicFlowInstance,
  logicFlowConverter: typeof logicFlowConverter,
  hasLogicFlowPrototype: LogicFlow.prototype ? '存在' : '不存在',
  hasLogicFlowMethods: LogicFlow.prototype ? Object.getOwnPropertyNames(LogicFlow.prototype).length > 0 : false
});
workflowLogger.groupEnd();

const props = defineProps<{
  workflowData?: any | null;
  projectName?: string;
  collaborationEnabled?: boolean;
  projectId?: string;
}>();

const emit = defineEmits<{
  (e: 'save', payload: { elements: unknown[]; timestamp: string }): void;
}>();

// LogicFlow 实例和容器
const container = ref<HTMLDivElement | null>(null);
const logicFlowInstance = ref<LogicFlow | null>(null);

// 协同功能相关
const collaborationManager = ref<CollaborationManagerService | null>(null);
const collaborationState = ref<CollaborationState>({
  isEnabled: false,
  isConnected: false,
  connectionState: 'disconnected',
  currentUser: null,
  onlineUsers: [],
});
const showUserConfig = ref(false);

// 应用远端更新期间置为 true，防止将收到的操作再次广播出去（回声循环）
const isApplyingRemoteUpdate = ref(false);

// 已处理的 operationId 集合，防止同一操作被应用两次
const appliedOperationIds = new Set<string>();
// 每 5 分钟清空一次，防止内存无限增长
setInterval(() => appliedOperationIds.clear(), 5 * 60 * 1000);


// 防抖定时器：节点属性/内容变更后延迟 400ms 再广播全量画布
let propChangeSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** 延迟广播全量 canvas-sync，400ms 内多次触发只发一次 */
function schedulePropChangeSync(): void {
  if (propChangeSyncTimer) clearTimeout(propChangeSyncTimer);
  propChangeSyncTimer = setTimeout(() => {
    propChangeSyncTimer = null;
    if (!logicFlowInstance.value) return;
    const graphData = logicFlowInstance.value.getGraphData();
    broadcastOperation({ type: 'canvas-sync', data: { graphData } });
  }, 400);
}

// userId → displayName 缓存，用于离开通知时取名字
const userDisplayNames = new Map<string, string>();

// 生成唯一ID的工具函数
const generateUniqueId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
};

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
// 组件挂载时初始化
onMounted(async () => {
  workflowLogger.group('组件挂载初始化');
  workflowLogger.info('WorkflowEditor组件已挂载', {
    props: {
      workflowData: props.workflowData ? '存在' : '不存在',
      projectName: props.projectName,
      collaborationEnabled: props.collaborationEnabled,
      projectId: props.projectId
    }
  });
  
  workflowLogger.time('DOM渲染等待');
  // 等待DOM完全渲染
  await nextTick();
  workflowLogger.timeEnd('DOM渲染等待');
  workflowLogger.info('DOM渲染完成，开始检查容器元素');
  
  // 检查容器元素状态
  workflowLogger.debug('容器元素检查', {
    containerRef: container.value ? '存在' : '不存在',
    containerElement: container.value,
    containerTagName: container.value?.tagName,
    containerClientWidth: container.value?.clientWidth,
    containerClientHeight: container.value?.clientHeight,
    containerParent: container.value?.parentElement?.tagName
  });
  
  // 再次确保容器元素存在
  if (!container.value) {
    workflowLogger.warn('挂载后容器元素仍然不存在，等待延迟重试...');
    setTimeout(async () => {
      await nextTick();
      workflowLogger.debug('延迟重试后容器检查', {
        containerExists: !!container.value,
        containerElement: container.value
      });
      
      if (container.value) {
        workflowLogger.success('延迟后找到容器元素，开始初始化LogicFlow');
        initializeLogicFlow();
      } else {
        workflowLogger.error('延迟后仍然找不到容器元素，LogicFlow初始化失败');
      }
    }, 100);
  } else {
    workflowLogger.success('容器元素已就绪，立即初始化LogicFlow');
    initializeLogicFlow();
  }
  
  // 初始化协同功能
  if (props.collaborationEnabled && props.projectId) {
    workflowLogger.info('开始初始化协同功能', {
      projectId: props.projectId,
      collaborationEnabled: props.collaborationEnabled
    });
    initializeCollaboration();
  } else {
    workflowLogger.info('跳过协同功能初始化', {
      collaborationEnabled: props.collaborationEnabled,
      hasProjectId: !!props.projectId
    });
  }
  
  workflowLogger.groupEnd();
});

// 组件卸载前清理
onBeforeUnmount(() => {
  if (propChangeSyncTimer) { clearTimeout(propChangeSyncTimer); propChangeSyncTimer = null; }
  resetNodeCardRenderState();
  if (logicFlowInstance.value) {
    logicFlowInstance.value.destroy();
  }
  if (collaborationManager.value) {
    collaborationManager.value.destroy();
  }
});

// 监听工作流数据变化
watch(
  () => props.workflowData,
  (newData) => {
    if (newData && logicFlowInstance.value) {
      loadWorkflowData(newData);
    }
  },
  { immediate: true }
);

// 切换项目时重置协同状态，防止旧房间的 canvas-snapshot 污染新项目画布
watch(
  () => props.projectId,
  (newId, oldId) => {
    if (!newId || newId === oldId) return;
    appliedOperationIds.clear();
    // 销毁旧协同连接，重新加入新项目房间
    if (collaborationManager.value) {
      collaborationManager.value.destroy();
      collaborationManager.value = null;
    }
    if (props.collaborationEnabled) {
      initializeCollaboration();
    }
  }
);

/**
 * 初始化LogicFlow实例
 */
function initializeLogicFlow() {
  logicflowLogger.group('LogicFlow实例初始化');
  logicflowLogger.time('LogicFlow初始化总耗时');
  
  logicflowLogger.info('开始初始化LogicFlow实例');
  
  // 容器元素检查
  if (!container.value) {
    logicflowLogger.error('LogicFlow容器未找到', {
      containerRef: container.value,
      containerExists: !!container.value
    });
    logicflowLogger.groupEnd();
    return;
  }

  logicflowLogger.success('容器元素检查通过', {
    containerElement: container.value,
    tagName: container.value.tagName,
    className: container.value.className,
    clientWidth: container.value.clientWidth,
    clientHeight: container.value.clientHeight,
    offsetWidth: container.value.offsetWidth,
    offsetHeight: container.value.offsetHeight,
    parentElement: container.value.parentElement?.tagName
  });

  try {
    // 创建LogicFlow实例
    logicflowLogger.info('正在创建LogicFlow实例...');
    logicflowLogger.time('LogicFlow实例创建');
    
    logicFlowInstance.value = createLogicFlowInstance(container.value);
    
    logicflowLogger.timeEnd('LogicFlow实例创建');
    logicflowLogger.success('LogicFlow实例创建成功', {
      instance: logicFlowInstance.value,
      instanceType: typeof logicFlowInstance.value,
      instanceMethods: logicFlowInstance.value ? Object.getOwnPropertyNames(Object.getPrototypeOf(logicFlowInstance.value)) : '无',
      hasAddNode: typeof logicFlowInstance.value?.addNode,
      hasGetGraphData: typeof logicFlowInstance.value?.getGraphData,
      hasRender: typeof logicFlowInstance.value?.render,
      hasRegister: typeof logicFlowInstance.value?.register
    });
    
    // 验证节点是否注册成功
    if (logicFlowInstance.value) {
      const graphModel = (logicFlowInstance.value as any).graphModel;
      if (graphModel && graphModel.modelMap) {
        logicflowLogger.debug('已注册的节点类型', {
          registeredTypes: Object.keys(graphModel.modelMap),
          modelMapSize: Object.keys(graphModel.modelMap).length
        });
      }
    }
    
    // 设置事件监听器
    logicflowLogger.info('正在设置事件监听器...');
    logicflowLogger.time('事件监听器设置');
    setupLogicFlowEvents();
    logicflowLogger.timeEnd('事件监听器设置');
    
    // 如果有 workflowData prop，直接加载；否则确保根节点存在
    if (props.workflowData) {
      logicflowLogger.info('初始化后加载工作流数据');
      loadWorkflowData(props.workflowData);
    } else {
      logicflowLogger.info('正在确保根节点存在...');
      logicflowLogger.time('根节点创建');
      ensureRootNode();
      logicflowLogger.timeEnd('根节点创建');
    }

    logicflowLogger.timeEnd('LogicFlow初始化总耗时');
    logicflowLogger.success('LogicFlow初始化完成');
    logicflowLogger.groupEnd();
    
  } catch (error) {
    logicflowLogger.timeEnd('LogicFlow初始化总耗时');
    logicflowLogger.error('LogicFlow初始化失败', error);
    logicflowLogger.groupEnd();
  }
}

// 拖拽节流时间戳，80ms 内只广播一次全量快照
let lastDragBroadcast = 0;

/**
 * 立即广播全量画布快照。
 * 用于需要实时同步的操作（节点新增、拖拽中、拖拽结束）。
 */
function broadcastCanvasSync(): void {
  if (!logicFlowInstance.value) return;
  const graphData = logicFlowInstance.value.getGraphData();
  broadcastOperation({ type: 'canvas-sync', data: { graphData } });
}

/**
 * 设置LogicFlow事件监听器
 */
function setupLogicFlowEvents() {
  if (!logicFlowInstance.value) return;

  const lf = logicFlowInstance.value;

  const expandNodeAndFocusRequirement = (nodeId: string) => {
    const model = lf.getNodeModelById(nodeId);
    if (!model) return;
    const current = model.getProperties();
    if (!current.expanded) {
      model.setProperties({ expanded: true });
      schedulePropChangeSync();
    }

    // 先触发节点展开重绘，再聚焦到需求说明输入框
    nextTick(() => {
      requestAnimationFrame(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.node-card'));
        const card = cards.find((item) => item.dataset.nodeId === nodeId);
        const textarea = card?.querySelector<HTMLTextAreaElement>('.node-card__requirement-textarea');
        if (!textarea) return;
        textarea.focus();
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      });
    });
  };

  // 节点点击事件：只负责展开（收起由卡片 header 内部处理，避免点击表单元素时误触）
  lf.on('node:click', ({ data }) => {
    if (isApplyingRemoteUpdate.value) return;
    // 跳过 RootNode，不展开编辑区
    if (data.type === 'root' || data.type === 'RootNode') return;
    const model = lf.getNodeModelById(data.id);
    if (!model) return;
    const current = model.getProperties();
    // 仅当折叠时才展开；展开态的收起由卡片 header 按钮处理
    if (!current.expanded) {
      model.setProperties({ expanded: true });
      schedulePropChangeSync();
    }
  });

  // 节点双击事件
  lf.on('node:dblclick', ({ data }) => {
    if (isApplyingRemoteUpdate.value) return;
    if (data.type === 'root' || data.type === 'RootNode') return;
    expandNodeAndFocusRequirement(data.id);
  });

  // 拖拽中：节流广播全量画布，让协作者实时看到节点移动
  lf.on('node:drag', () => {
    if (isApplyingRemoteUpdate.value) return;
    const now = Date.now();
    if (now - lastDragBroadcast < 80) return;
    lastDragBroadcast = now;
    broadcastCanvasSync();
  });

  // 拖拽结束：广播最终位置的全量画布
  lf.on('node:dragend', () => {
    if (isApplyingRemoteUpdate.value) return;
    broadcastCanvasSync();
  });

  // 节点添加：直接广播全量画布，确保接收方与本地画布状态完全一致（避免坐标/类型映射偏差）
  lf.on('node:add', () => {
    if (isApplyingRemoteUpdate.value) return;
    broadcastCanvasSync();
  });

  // 节点/边删除、连线变化：使用防抖，避免批量操作时多次广播
  lf.on('node:delete', () => {
    if (isApplyingRemoteUpdate.value) return;
    schedulePropChangeSync();
  });

  lf.on('edge:add', () => {
    if (isApplyingRemoteUpdate.value) return;
    schedulePropChangeSync();
  });

  lf.on('edge:delete', () => {
    if (isApplyingRemoteUpdate.value) return;
    schedulePropChangeSync();
  });

  lf.on('text:update', () => {
    if (isApplyingRemoteUpdate.value) return;
    schedulePropChangeSync();
  });

  // 节点属性/内容变更（展开/收起/字段编辑）：由 NodeCardRenderer 通过 window 事件通知
  const handleNodeChangedEvent = () => {
    if (isApplyingRemoteUpdate.value) return;
    schedulePropChangeSync();
  };
  const handleEditNodeContentEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
    if (!detail?.nodeId) return;
    expandNodeAndFocusRequirement(detail.nodeId);
  };
  const handleAddChildNodeEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
    if (!detail?.nodeId) return;
    addChildNode(detail.nodeId, 'text');
  };
  // 边样式变更后触发保存同步（由 logicflow.config.ts 的右键菜单 dispatch）
  const handleEdgeStyleChangedEvent = () => {
    if (!isApplyingRemoteUpdate.value) schedulePropChangeSync();
  };

  window.addEventListener('lf:node-changed', handleNodeChangedEvent);
  window.addEventListener('lf:edit-node-content', handleEditNodeContentEvent);
  window.addEventListener('lf:add-child-node', handleAddChildNodeEvent);
  window.addEventListener('lf:edge-style-changed', handleEdgeStyleChangedEvent);
  // 组件卸载时移除监听
  const _removeNodeChangedListener = () => window.removeEventListener('lf:node-changed', handleNodeChangedEvent);
  const _removeEditNodeContentListener = () => window.removeEventListener('lf:edit-node-content', handleEditNodeContentEvent);
  const _removeAddChildNodeListener = () => window.removeEventListener('lf:add-child-node', handleAddChildNodeEvent);
  const _removeEdgeStyleChangedListener = () => window.removeEventListener('lf:edge-style-changed', handleEdgeStyleChangedEvent);
  onBeforeUnmount(_removeNodeChangedListener);
  onBeforeUnmount(_removeEditNodeContentListener);
  onBeforeUnmount(_removeAddChildNodeListener);
  onBeforeUnmount(_removeEdgeStyleChangedListener);
}

/**
 * 确保有根节点
 */
function ensureRootNode() {
  if (!logicFlowInstance.value) {
    logicflowLogger.warn('无法创建根节点：LogicFlow实例不存在');
    return;
  }

  logicflowLogger.group('根节点创建');
  const lf = logicFlowInstance.value;
  
  try {
    const graphData = lf.getGraphData();
    logicflowLogger.debug('当前图形数据', {
      nodesCount: graphData.nodes.length,
      edgesCount: graphData.edges.length,
      nodes: graphData.nodes
    });
    
    // 检查是否已有根节点
    const hasRootNode = graphData.nodes.some(node => 
      node.type === 'RootNode' || node.properties?.nodeType === 'root'
    );

    if (!hasRootNode) {
      logicflowLogger.info('未找到根节点，开始创建...');

      const cx = Math.round((container.value?.clientWidth ?? 800) / 2);
      const cy = Math.round((container.value?.clientHeight ?? 600) / 2);

      // 创建根节点
      const rootNode = {
        id: 'node_root',
        type: 'RootNode',
        x: cx,
        y: cy,
        text: { value: '', x: cx, y: cy },
        properties: {
          title: props.projectName || '项目根节点',
          nodeType: 'root',
          status: 'pending',
        },
      };

      logicflowLogger.debug('根节点配置', rootNode);

        try {
        const addedNode = lf.addNode(rootNode);
        logicflowLogger.success('根节点创建成功', {
          nodeId: addedNode?.id || rootNode.id,
          addedNode
        });

        
        // 验证节点是否真的被添加
        const updatedGraphData = lf.getGraphData();
        logicflowLogger.info('创建后的图形数据', {
          nodesCount: updatedGraphData.nodes.length,
          nodes: updatedGraphData.nodes
        });
        
        // 检查SVG元素是否被渲染
        if (container.value) {
          const svgElement = container.value.querySelector('svg');
          const nodeElements = container.value.querySelectorAll('[data-node-id], .lf-node');
          logicflowLogger.debug('DOM渲染检查', {
            hasSvg: !!svgElement,
            svgSize: svgElement ? {
              width: svgElement.getAttribute('width'),
              height: svgElement.getAttribute('height'),
              viewBox: svgElement.getAttribute('viewBox')
            } : null,
            nodeElementsCount: nodeElements.length,
            containerChildren: container.value.children.length
          });
        }
        
      } catch (error) {
        logicflowLogger.error('根节点创建失败', error);
      }
    } else {
      logicflowLogger.info('根节点已存在，跳过创建');
    }
  } catch (error) {
    logicflowLogger.error('ensureRootNode执行失败', error);
  }
  
  logicflowLogger.groupEnd();
}

/**
 * 加载工作流数据
 */
function loadWorkflowData(workflowData: WorkflowData) {
  if (!logicFlowInstance.value || !workflowData) return;

  try {
    const logicFlowData = logicFlowConverter.toLogicFlowData(workflowData);
    // 画布整体重绘前必须丢弃旧节点签名，避免跨项目复用时首屏误判为“无需更新”
    resetNodeCardRenderState();
    logicFlowInstance.value.render(logicFlowData);
  } catch (error) {
    console.error('加载工作流数据失败:', error);
  }

  // 无论数据加载成功或失败都确保根节点存在
  ensureRootNode();

  // 保留用户手动调整过的坐标，打开时只做居中，不自动重排
  nextTick(() => {
    const lf = logicFlowInstance.value;
    if (!lf) return;
    lf.fitView(80);
  });
}

/**
 * 通用 Dagre 布局执行器。
 * 供打开项目自动调用，以及工具栏"整理"按钮调用。
 */
function applyDagreLayout(lf: InstanceType<typeof LogicFlow>): boolean {
  const dagreLayout = (lf as any).extension?.dagre;
  if (!dagreLayout || typeof dagreLayout.layout !== 'function') return false;

  try {
    // Dagre 内部会重建节点与边数据，先清空渲染缓存，避免首帧被旧签名跳过
    resetNodeCardRenderState();
    dagreLayout.layout({
      rankdir: 'TB',
      ranker: 'tight-tree',
      align: 'UL',
      ranksep: 180,
      nodesep: 100,
      marginx: 120,
      marginy: 80,
      isDefaultAnchor: true,
    });
    nextTick(() => lf.fitView(80));
    return true;
  } catch (err) {
    console.error('Dagre 布局执行失败:', err);
    return false;
  }
}

/**
 * 添加节点
 */
function getNodeSize(nodeType: NodeType): { width: number; height: number } {
  const sizeMap: Record<NodeType, { width: number; height: number }> = {
    root: { width: 180, height: 70 },
    text: { width: 420, height: 260 },
    property: { width: 440, height: 260 },
    file: { width: 420, height: 260 },
    image: { width: 420, height: 260 },
    video: { width: 420, height: 260 },
    audio: { width: 420, height: 260 },
  };

  return sizeMap[nodeType] || { width: 420, height: 260 };
}

function organizeGraph() {
  if (!logicFlowInstance.value) return;

  const lf = logicFlowInstance.value;
  const graphData = lf.getGraphData() as { nodes?: unknown[] };
  if ((graphData.nodes?.length ?? 0) <= 1) {
    ElMessage.info('当前节点数量不足，无需整理');
    return;
  }

  if (!applyDagreLayout(lf)) {
    ElMessage.error('官方布局插件未就绪，暂时无法整理画布');
    return;
  }

  broadcastCanvasSync();
  ElMessage.success('画布已按官方布局整理为从上到下结构');
}

function addNode(nodeType: NodeType, position?: { x: number; y: number }) {
  workflowLogger.group(`添加${nodeType}节点`);
  workflowLogger.info(`尝试添加${nodeType}节点`, {
    nodeType,
    position,
    timestamp: new Date().toISOString()
  });
  
  // 检查LogicFlow实例状态
  const instanceStatus = {
    exists: !!logicFlowInstance.value,
    container: !!container.value,
    containerElement: container.value,
    instanceType: typeof logicFlowInstance.value,
    hasAddNodeMethod: logicFlowInstance.value ? typeof logicFlowInstance.value.addNode : '无实例'
  };
  
  workflowLogger.debug('LogicFlow实例状态检查', instanceStatus);

  if (!logicFlowInstance.value) {
    workflowLogger.warn('LogicFlow实例未初始化，尝试重新初始化...');
    
    // 尝试重新初始化LogicFlow
    if (container.value) {
      workflowLogger.info('容器存在，重新初始化LogicFlow...');
      initializeLogicFlow();
      
      // 等待一小段时间后重试
      setTimeout(() => {
        if (logicFlowInstance.value) {
          workflowLogger.success('重新初始化成功，重试添加节点...');
          addNode(nodeType, position);
        } else {
          workflowLogger.error('重新初始化失败，无法添加节点');
        }
        workflowLogger.groupEnd();
      }, 100);
    } else {
      workflowLogger.error('容器元素不存在，无法初始化LogicFlow');
      workflowLogger.groupEnd();
    }
    return;
  }

  const lf = logicFlowInstance.value;
  const pos = position || {
    x: 200 + Math.random() * 400,
    y: 200 + Math.random() * 300,
  };

  workflowLogger.debug('节点位置计算', {
    originalPosition: position,
    finalPosition: pos,
    isRandomPosition: !position
  });

  // 映射节点类型到LogicFlow类型
  // root → RootNode（保留 RectNode 注册）；其他 6 种使用小写类型（CardNode）
  const typeMap: Record<NodeType, string> = {
    root: 'RootNode',
    text: 'text',
    property: 'property',
    file: 'file',
    image: 'image',
    video: 'video',
    audio: 'audio',
  };

  const logicFlowType = typeMap[nodeType] || 'TextNode';
  const nodeId = generateUniqueId('node');

  const { width, height } = getNodeSize(nodeType);
  const nodeConfig = {
    id: nodeId,
    type: logicFlowType,
    x: pos.x,
    y: pos.y,
    width,
    height,
    text: { value: '', x: pos.x, y: pos.y },
    properties: {
      title: `${nodeType.toUpperCase()} 节点`,
      nodeType: nodeType,
      expanded: true,
      status: 'pending' as NodeStatus,
      textContent: '',
      resourceUrl: '',
      resourceName: '',
      properties: nodeType === 'property' ? [{ key: '', value: '' }] : [],
    },
  };

  workflowLogger.debug('节点配置生成', {
    nodeId,
    nodeType,
    logicFlowType,
    nodeConfig,
    configKeys: Object.keys(nodeConfig)
  });

  try {
    workflowLogger.time(`${nodeType}节点添加`);
    lf.addNode(nodeConfig);
    workflowLogger.timeEnd(`${nodeType}节点添加`);

    // 将新节点同步到后端，使 PATCH /api/v1/node/:id 可用
    if (props.projectId) {
      fetch(`/api/v1/workflow/${props.projectId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [{
            nodeId,
            nodeType,
            parentNodeId: null,
            sortOrder: 0,
            dependencies: [],
            status: nodeConfig.properties.status,
            attributes: {
              name: nodeConfig.properties.title,
              _visualType: nodeType,
              position: { x: pos.x, y: pos.y },
            },
          }],
        }),
      }).catch((err) => {
        workflowLogger.warn('节点同步到后端失败', { nodeId, err });
      });
    }

  } catch (error) {
    workflowLogger.error(`添加${nodeType}节点失败`, {
      error,
      nodeConfig,
      logicFlowInstance: !!lf,
      addNodeMethod: typeof lf.addNode
    });
  }

  workflowLogger.groupEnd();
}

function addChildNode(parentNodeId: string, childNodeType: NodeType = 'text') {
  if (!logicFlowInstance.value) return;

  const lf = logicFlowInstance.value;
  const parentNode = lf.getNodeModelById(parentNodeId) as any;
  if (!parentNode) return;

  const { width: childWidth, height: childHeight } = getNodeSize(childNodeType);
  const graphData = lf.getGraphData() as any;
  const childCount = (graphData?.edges ?? []).filter((edge: any) => edge.sourceNodeId === parentNodeId).length;
  const horizontalGap = 120;
  const verticalGap = 120;
  const baseX = parentNode.x;
  const offsetX = childCount === 0 ? 0 : childCount * (childWidth / 2 + horizontalGap);
  const childPosition = {
    x: Math.round(baseX + offsetX),
    y: Math.round(parentNode.y + parentNode.height / 2 + childHeight / 2 + verticalGap),
  };

  const typeMap: Record<NodeType, string> = {
    root: 'RootNode',
    text: 'text',
    property: 'property',
    file: 'file',
    image: 'image',
    video: 'video',
    audio: 'audio',
  };
  const childNodeId = generateUniqueId('node');
  const logicFlowType = typeMap[childNodeType] || 'text';

  // 右键菜单的“添加节点”直接表达父子意图：在当前节点下方创建并连线
  lf.addNode({
    id: childNodeId,
    type: logicFlowType,
    x: childPosition.x,
    y: childPosition.y,
    width: childWidth,
    height: childHeight,
    text: { value: '', x: childPosition.x, y: childPosition.y },
    properties: {
      title: `${childNodeType.toUpperCase()} 节点`,
      nodeType: childNodeType,
      expanded: true,
      status: 'pending' as NodeStatus,
      textContent: '',
      resourceUrl: '',
      resourceName: '',
      properties: childNodeType === 'property' ? [{ key: '', value: '' }] : [],
    },
  });

  lf.addEdge({
    id: generateUniqueId('edge'),
    type: 'styled-polyline',
    sourceNodeId: parentNodeId,
    targetNodeId: childNodeId,
  });

  if (props.projectId) {
    fetch(`/api/v1/workflow/${props.projectId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [{
          nodeId: childNodeId,
          nodeType: childNodeType,
          parentNodeId,
          sortOrder: childCount,
          dependencies: [parentNodeId],
          status: 'pending',
          attributes: {
            name: `${childNodeType.toUpperCase()} 节点`,
            _visualType: childNodeType,
            position: { x: childPosition.x, y: childPosition.y },
          },
        }],
      }),
    }).catch((err) => {
      workflowLogger.warn('子节点同步到后端失败', { childNodeId, parentNodeId, err });
    });
  }
}

/**
 * 保存图形数据
 */
function saveGraph() {
  if (!logicFlowInstance.value) return;

  try {
    const logicFlowData = logicFlowInstance.value.getGraphData();
    const workflowData = logicFlowConverter.fromLogicFlowData(logicFlowData);
    
    emit('save', { 
      elements: workflowData.elements, 
      timestamp: new Date().toISOString() 
    });
    
    console.log('图形数据保存成功');
  } catch (error) {
    console.error('保存图形数据失败:', error);
  }
}

/**
 * 清空图形
 */
async function clearGraph() {
  if (!logicFlowInstance.value) return;

  try {
    await ElMessageBox.confirm('确定要清空所有节点吗？此操作不可撤销。', '清空确认', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }

  // 广播清空操作
  broadcastOperation({
    type: 'node-delete',
    data: { clearAll: true },
  });

  logicFlowInstance.value.clearData();
  ensureRootNode();
}

/**
 * 导出JSON
 */
function downloadJson() {
  if (!logicFlowInstance.value) return;

  try {
    const logicFlowData = logicFlowInstance.value.getGraphData();
    const workflowData = logicFlowConverter.fromLogicFlowData(logicFlowData);
    
    // 构建导出数据
    const exportData = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      project: {
        name: props.projectName || 'Workflow Project',
        exportTime: new Date().toISOString(),
        totalNodes: logicFlowData.nodes.length,
        totalEdges: logicFlowData.edges.length,
        description: '工作流自动化与项目拆解图谱 (LogicFlow版本)',
      },
      data: workflowData,
      logicFlowData: logicFlowData,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.projectName || 'workflow'}_logicflow_schema.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('JSON导出成功');
  } catch (error) {
    console.error('导出JSON失败:', error);
  }
}
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

  // 状态变化：同步更新 UI 状态，并刷新用户名缓存
  collaborationManager.value.onStateChange((state) => {
    collaborationState.value = state;
    state.onlineUsers.forEach(u => userDisplayNames.set(u.userId, u.displayName));
  });

  // 用户加入：弹出绿色通知
  collaborationManager.value.onUserJoin((user) => {
    userDisplayNames.set(user.userId, user.displayName);
    ElNotification({
      title: '新协作者加入',
      message: `${user.displayName} 加入了本项目的协作`,
      type: 'success',
      duration: 3000,
      position: 'bottom-right',
    });
  });

  // 用户离开：弹出通知
  collaborationManager.value.onUserLeave((userId) => {
    const name = userDisplayNames.get(userId) || userId;
    ElNotification({
      title: '协作者离开',
      message: `${name} 离开了协作`,
      type: 'info',
      duration: 3000,
      position: 'bottom-right',
    });
  });

  // 操作接收
  collaborationManager.value.onOperation((operation) => {
    handleRemoteOperation(operation);
  });

  // 监听服务端推送的画布快照：画布已有节点时忽略，
  // 避免异步到达的快照覆盖刚从 API 渲染的正确内容
  collaborationManager.value.onCanvasSnapshot((graphData) => {
    const lf = logicFlowInstance.value;
    if (!lf) return;
    if (lf.getGraphData().nodes.length > 0) return;
    handleRemoteCanvasSync(graphData, lf);
  });
}

/**
 * 处理远程操作
 */
function handleRemoteOperation(operation: CollaborationOperation): void {
  if (!logicFlowInstance.value) return;

  // operationId 去重：同一操作只应用一次（网络重传 / 多路由场景）
  if (operation.operationId) {
    if (appliedOperationIds.has(operation.operationId)) return;
    appliedOperationIds.add(operation.operationId);
  }

  const lf = logicFlowInstance.value;

  // 标记正在应用远端更新，防止本地事件监听器重复广播
  isApplyingRemoteUpdate.value = true;

  switch (operation.type) {
    case 'canvas-sync': {
      const syncData = operation.data as any;
      if (syncData?.graphData) {
        // handleRemoteCanvasSync 内部通过 nextTick 异步清除标志
        handleRemoteCanvasSync(syncData.graphData, lf);
        return;
      }
      break;
    }
    case 'node-create':
      handleRemoteNodeCreate(operation, lf);
      break;
    case 'node-update': {
      const opData = operation.data as any;
      if (opData?.isDragging !== true) {
        handleRemoteNodeUpdate(operation, lf);
      }
      break;
    }
    case 'node-delete':
      handleRemoteNodeDelete(operation, lf);
      break;
    case 'edge-create':
      handleRemoteEdgeCreate(operation, lf);
      break;
    case 'edge-delete':
      handleRemoteEdgeDelete(operation, lf);
      break;
  }

  isApplyingRemoteUpdate.value = false;
}

/**
 * 处理远程节点创建
 */
function handleRemoteNodeCreate(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  if (!data || !operation.nodeId) return;

  // 映射节点类型：必须与 registerCardNodes 中注册的类型名完全一致
  const typeMap: Record<string, string> = {
    root: 'RootNode',
    text: 'text',
    property: 'property',
    file: 'file',
    image: 'image',
    video: 'video',
    audio: 'audio',
  };

  const logicFlowType = typeMap[data.type] || 'text';
  const nodeType = (data.type as NodeType) || 'text';
  const { width, height } = getNodeSize(nodeType);

  const existingNode = lf.getNodeModelById(operation.nodeId);
  if (existingNode) {
    // 节点已存在：直接覆盖属性，不重复创建
    if (data.position) {
      const dx = data.position.x - (existingNode as any).x;
      const dy = data.position.y - (existingNode as any).y;
      if (dx !== 0 || dy !== 0) (existingNode as any).moveTo(data.position.x, data.position.y);
    }
    existingNode.setProperties({
      ...data.properties,
      nodeType: data.type,
      expanded: data.type === 'root' ? undefined : true,
    });
    return;
  }

  lf.addNode({
    id: operation.nodeId,
    type: logicFlowType,
    x: data.position?.x || 100,
    y: data.position?.y || 100,
    width,
    height,
    text: { value: '', x: data.position?.x || 100, y: data.position?.y || 100 },
    properties: {
      ...data.properties,
      nodeType: data.type,
      expanded: data.type === 'root' ? undefined : true,
    },
  });

  syncNodeEdgesFromPayload(operation.nodeId, data, lf);
}

/**
 * 处理远程节点更新
 */
function handleRemoteNodeUpdate(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  if (!data || !operation.nodeId) return;

  const nodeModel = lf.getNodeModelById(operation.nodeId);
  if (!nodeModel) return;

  // moveNode 语义是增量（delta），需换算成绝对坐标的差值
  if (data.position) {
    const dx = data.position.x - (nodeModel as any).x;
    const dy = data.position.y - (nodeModel as any).y;
    if (dx !== 0 || dy !== 0) {
      if (typeof nodeModel.moveTo === 'function') {
        nodeModel.moveTo(data.position.x, data.position.y);
      } else if (typeof (nodeModel as any).x === 'number' && typeof (nodeModel as any).y === 'number') {
        (nodeModel as any).x = data.position.x;
        (nodeModel as any).y = data.position.y;
      }
    }
  }

  // 更新节点文本
  if (data.text !== undefined) {
    nodeModel.updateText(data.text);
  }

  // 更新节点属性：既支持前端协作消息里的 data.properties，
  // 也支持后端系统广播直接放在顶层的 status / executor* 字段。
  const propertyPatch = {
    ...(data.properties ?? {}),
    ...(data.parentNodeId !== undefined ? { parentNodeId: data.parentNodeId } : {}),
    ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    ...(data.dependencies !== undefined ? { dependencies: data.dependencies } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.updatedAt !== undefined ? { updatedAt: data.updatedAt } : {}),
    ...(data.executorSessionId !== undefined
      ? { executorSessionId: data.executorSessionId }
      : {}),
    ...(data.executorAgentName !== undefined
      ? { executorAgentName: data.executorAgentName }
      : {}),
    ...(data.executorTodo !== undefined ? { executorTodo: data.executorTodo } : {}),
    ...(data.executorLockedAt !== undefined
      ? { executorLockedAt: data.executorLockedAt }
      : {}),
    ...(data.agentRoleId !== undefined ? { agentRoleId: data.agentRoleId } : {}),
  };

  if (Object.keys(propertyPatch).length > 0) {
    nodeModel.setProperties({
      ...nodeModel.getProperties(),
      ...propertyPatch,
      expanded: (data.type ?? nodeModel.getProperties()?.nodeType) === 'root' ? undefined : true,
    });
  }

  syncNodeEdgesFromPayload(operation.nodeId, data, lf);
}

/**
 * 用全量画布数据同步，同时保留本地视口（缩放 / 平移不受影响）。
 * lf.render() 会重置 transformModel，需在下一帧手动恢复。
 */
function handleRemoteCanvasSync(graphData: any, lf: LogicFlow): void {
  const tm = (lf as any).graphModel?.transformModel;
  const savedVP = tm
    ? { SCALE_X: tm.SCALE_X, SCALE_Y: tm.SCALE_Y, transformX: tm.transformX, transformY: tm.transformY }
    : null;

  // 全量快照会替换整张画布，旧节点缓存继续参与判断会把新 DOM 首次渲染跳掉
  resetNodeCardRenderState();
  lf.render(graphData);

  // render 后下一帧：恢复视口，并解除防回声标志
  nextTick(() => {
    if (savedVP && tm) {
      tm.SCALE_X = savedVP.SCALE_X;
      tm.SCALE_Y = savedVP.SCALE_Y ?? savedVP.SCALE_X;
      tm.transformX = savedVP.transformX;
      tm.transformY = savedVP.transformY;
    }
    isApplyingRemoteUpdate.value = false;
  });
}

/**
 * 处理远程节点删除
 */
function handleRemoteNodeDelete(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  
  // 处理清空所有节点
  if (data?.clearAll) {
    lf.clearData();
    ensureRootNode();
    return;
  }

  if (Array.isArray(data?.deletedNodeIds) && data.deletedNodeIds.length > 0) {
    for (const deletedNodeId of data.deletedNodeIds) {
      const nodeModel = lf.getNodeModelById(deletedNodeId);
      if (nodeModel) {
        lf.deleteNode(deletedNodeId);
      }
    }
    return;
  }

  if (!operation.nodeId) return;

  const nodeModel = lf.getNodeModelById(operation.nodeId);
  if (nodeModel) {
    lf.deleteNode(operation.nodeId);
  }
}

/**
 * 根据后端返回的 dependencies / parentNodeId，同步当前节点的输入边。
 */
function syncNodeEdgesFromPayload(nodeId: string, data: any, lf: LogicFlow): void {
  const dependencyIds = Array.isArray(data?.dependencies)
    ? data.dependencies.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    : (typeof data?.parentNodeId === 'string' && data.parentNodeId.length > 0 ? [data.parentNodeId] : []);

  const graphData = lf.getGraphData();
  const existingIncomingEdges = (graphData?.edges ?? []).filter((edge: any) => edge.targetNodeId === nodeId);
  const desiredSources = new Set(dependencyIds);

  for (const edge of existingIncomingEdges) {
    if (!desiredSources.has(edge.sourceNodeId)) {
      lf.deleteEdge(edge.id);
    }
  }

  for (const dependencyId of dependencyIds) {
    const edgeId = `${dependencyId}->${nodeId}`;
    const existingEdge = lf.getEdgeModelById(edgeId);
    if (!existingEdge) {
      lf.addEdge({
        id: edgeId,
        type: 'styled-polyline',
        sourceNodeId: dependencyId,
        targetNodeId: nodeId,
      });
    }
  }
}

/**
 * 处理远程边创建
 */
function handleRemoteEdgeCreate(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  if (!data || !data.source || !data.target) return;

  const edgeId = operation.edgeId || generateUniqueId('edge');

  // 边已存在则先删后建，确保源/目标节点始终与远端一致
  const existingEdge = lf.getEdgeModelById(edgeId);
  if (existingEdge) lf.deleteEdge(edgeId);

  lf.addEdge({ id: edgeId, type: 'styled-polyline', sourceNodeId: data.source, targetNodeId: data.target });
}

/**
 * 处理远程边删除
 */
function handleRemoteEdgeDelete(operation: CollaborationOperation, lf: LogicFlow): void {
  if (!operation.edgeId) return;

  const edgeModel = lf.getEdgeModelById(operation.edgeId);
  if (edgeModel) {
    lf.deleteEdge(operation.edgeId);
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
  console.log('聚焦到用户:', user.displayName);
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
  console.log('刷新用户列表');
}

// 暴露给父组件调用：从画布读取最新状态并触发保存
defineExpose({ triggerSave: saveGraph });

</script>
<style scoped>
/* height:100% 而非 100vh，避免与父级 flex:1 容器叠加导致溢出 */
.workflow-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
  position: relative;
}

/* ─── 工具栏 ─────────────────────────────────── */
.toolbar {
  background: #fff;
  padding: 8px 16px;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

/* 协同连接状态标签中的圆点 */
.conn-tag {
  display: flex;
  align-items: center;
  gap: 5px;
}

.conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}


/* ─── 画布容器 ───────────────────────────────── */
.editor-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

.logicflow-container {
  width: 100%;
  height: 100%;
  background: #fafafa;
  overflow: hidden;
  position: relative;
}

/* ─── 响应式 ─────────────────────────────────── */
@media (max-width: 768px) {
  .toolbar {
    padding: 6px 12px;
  }

  .toolbar-left,
  .toolbar-right {
    justify-content: center;
  }
}
</style>
