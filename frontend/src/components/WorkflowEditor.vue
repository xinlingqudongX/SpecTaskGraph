<template>
  <div class="workflow-editor">
    <!-- 协同功能组件 -->
    <CollaborativeCursors
      ref="cursorsRef"
      :show-user-names="collaborationState.currentUser?.preferences?.showUserNames ?? true"
      :container="container || undefined"
      @cursor-click="handleCursorClick"
    />
    
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
        <h3>工作流图编辑器 (LogicFlow)</h3>
      </div>
      <div class="toolbar-right">
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
        
        <!-- 节点创建按钮 -->
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
        
        <!-- 操作按钮 -->
        <button @click="saveGraph" class="btn btn-info">
          <span class="icon">💾</span> 保存
        </button>
        <button @click="downloadJson" class="btn btn-success">
          <span class="icon">⬇️</span> 导出JSON
        </button>
        <button @click="clearGraph" class="btn btn-danger">
          <span class="icon">🗑️</span> 清空
        </button>
      </div>
      <div v-if="collaborationEnabled" class="toolbar-users">
        <OnlineUsersList
          :users="collaborationState.onlineUsers"
          :current-user="currentUserForList"
          :connection-state="collaborationState.connectionState"
          :show-all-cursors="showAllCursors"
          :default-collapsed="true"
          class="online-users-inline"
          @edit-user="showUserConfig = true"
          @focus-user="focusOnUser"
          @toggle-user-cursor="toggleUserCursor"
          @toggle-all-cursors="toggleAllCursors"
          @reconnect="reconnectCollaboration"
          @refresh-users="refreshUsers"
        />
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
import LogicFlow, { RectNode, RectNodeModel, HtmlNode, HtmlNodeModel } from '@logicflow/core';
import '@logicflow/core/dist/index.css'; // 导入LogicFlow核心样式
import '@logicflow/extension/dist/index.css'; // 导入LogicFlow扩展样式
import CollaborativeCursors from './CollaborativeCursors.vue';
import OnlineUsersList from './OnlineUsersList.vue';
import UserConfigDialog from './UserConfigDialog.vue';
import { CollaborationManagerService } from '../services/collaboration-manager.service';
import type { CollaborationState } from '../services/collaboration-manager.service';
import type { User, CollaborationOperation } from '../services/collaboration.service';
import type { UserConfig } from '../services/user-manager.service';
import type { OperationConflict } from '../services/operation-sync.service';
import { getWebSocketUrl } from '../config/websocket.config';
import { createLogicFlowInstance } from '../config/logicflow.config';
import { logicFlowConverter } from '../utils/logicflow-converter';
import '../nodes/node-card.css';
import { workflowLogger, logicflowLogger } from '../utils/logger';
import type { 
  NodeType, 
  NodeStatus, 
  ExtendedNodeConfig, 
  ExtendedEdgeConfig,
  LogicFlowGraphData,
  WorkflowData 
} from '../types/logicflow.types';

// 确保LogicFlow正确导入
workflowLogger.group('模块导入检查');
workflowLogger.info('LogicFlow导入状态', {
  LogicFlow: typeof LogicFlow,
  LogicFlowConstructor: LogicFlow,
  RectNode: typeof RectNode,
  RectNodeModel: typeof RectNodeModel,
  createLogicFlowInstance: typeof createLogicFlowInstance,
  logicFlowConverter: typeof logicFlowConverter,
  hasLogicFlowPrototype: LogicFlow.prototype ? '存在' : '不存在',
  hasRectNodePrototype: RectNode.prototype ? '存在' : '不存在'
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
  pendingOperations: 0,
  conflicts: 0,
});
const showUserConfig = ref(false);
const showAllCursors = ref(true);
const cursorsRef = ref<InstanceType<typeof CollaborativeCursors> | null>(null);

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
  if (logicFlowInstance.value) {
    logicFlowInstance.value.destroy();
  }
  
  // 清理协同功能
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
    
    // 注册自定义节点类型（必须在addNode之前完成）
    logicflowLogger.info('正在注册自定义节点类型...');
    logicflowLogger.time('自定义节点注册');
    registerCustomNodes();
    logicflowLogger.timeEnd('自定义节点注册');
    
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

/**
 * 注册自定义节点类型
 */
function registerCustomNodes() {
  if (!logicFlowInstance.value) {
    logicflowLogger.error('无法注册自定义节点：LogicFlow实例不存在');
    return;
  }

  logicflowLogger.group('自定义节点注册');
  const lf = logicFlowInstance.value;

  try {
    logicflowLogger.info('开始注册节点类型', {
      logicFlowInstance: !!lf,
      RectNode: typeof RectNode,
      RectNodeModel: typeof RectNodeModel,
      registerMethod: typeof lf.register
    });

    // 定义所有自定义节点类（包含View和Model）
    const nodeConfigs: Array<{ type: string; view: any; model: any }> = [];

    // 1. 根节点（HtmlNode，避免 LogicFlow 默认 SVG text 与节点框分离）
    class RootNodeModel extends HtmlNodeModel {
      setAttributes() {
        this.width = 180;
        this.height = 70;
      }
    }
    class RootNodeView extends HtmlNode {
      setHtml(rootEl: SVGForeignObjectElement) {
        rootEl.innerHTML = '';
        const model = this.props.model as any;
        const title: string = model.properties?.title || model.text?.value || '开始';

        const wrap = document.createElement('div');
        wrap.style.cssText = [
          'width:100%', 'height:100%', 'box-sizing:border-box',
          'background:linear-gradient(160deg,#1f5d98 0%,#0e3f6f 100%)',
          'border-radius:8px', 'border:2px solid #0b3c66',
          'display:flex', 'flex-direction:column',
          'align-items:center', 'justify-content:flex-start',
          'overflow:hidden',
        ].join(';');

        // 顶部标签栏
        const tag = document.createElement('div');
        tag.style.cssText = [
          'width:100%', 'padding:4px 8px 2px', 'box-sizing:border-box',
          'font-size:10px', 'font-weight:700', 'letter-spacing:1px',
          'color:rgba(255,255,255,0.6)', 'text-transform:uppercase',
          'border-bottom:1px solid rgba(255,255,255,0.15)',
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        ].join(';');
        tag.textContent = 'START';

        // 标题行
        const label = document.createElement('div');
        label.style.cssText = [
          'flex:1', 'width:100%', 'display:flex', 'align-items:center',
          'justify-content:center', 'padding:0 10px', 'box-sizing:border-box',
          'color:#fff', 'font-weight:700', 'font-size:14px',
          'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        ].join(';');
        label.textContent = title;

        wrap.appendChild(tag);
        wrap.appendChild(label);
        rootEl.appendChild(wrap);
      }
      shouldUpdate() { return true; }
    }

    nodeConfigs.push({
      type: 'RootNode',
      view: RootNodeView,
      model: RootNodeModel
    });

    // 2. 文本节点
    class TextNodeModel extends RectNodeModel {
      initNodeData(data: any) {
        super.initNodeData(data);
        const textValue = data?.properties?.textContent ?? data?.text?.value;
        if (textValue && this.text) {
          this.text.value = textValue;
        }

        const width = data?.width ?? data?.properties?.width;
        const height = data?.height ?? data?.properties?.height;
        if (typeof width === 'number' && typeof height === 'number') {
          this.width = width;
          this.height = height;
        }
      }
    }
    class TextNodeView extends RectNode {}
    
    nodeConfigs.push({ 
      type: 'TextNode', 
      view: TextNodeView,
      model: TextNodeModel
    });

    // 3. 属性节点
    class PropertyNodeModel extends RectNodeModel {}
    class PropertyNodeView extends RectNode {}
    
    nodeConfigs.push({ 
      type: 'PropertyNode', 
      view: PropertyNodeView,
      model: PropertyNodeModel
    });

    // 4. 文件节点
    class FileNodeModel extends RectNodeModel {}
    class FileNodeView extends RectNode {}
    
    nodeConfigs.push({ 
      type: 'FileNode', 
      view: FileNodeView,
      model: FileNodeModel
    });

    // 5. 图片节点
    class ImageNodeModel extends RectNodeModel {}
    class ImageNodeView extends RectNode {}
    
    nodeConfigs.push({ 
      type: 'ImageNode', 
      view: ImageNodeView,
      model: ImageNodeModel
    });

    // 6. 视频节点
    class VideoNodeModel extends RectNodeModel {}
    class VideoNodeView extends RectNode {}
    
    nodeConfigs.push({ 
      type: 'VideoNode', 
      view: VideoNodeView,
      model: VideoNodeModel
    });

    // 7. 音频节点
    class AudioNodeModel extends RectNodeModel {}
    class AudioNodeView extends RectNode {}
    
    nodeConfigs.push({ 
      type: 'AudioNode', 
      view: AudioNodeView,
      model: AudioNodeModel
    });

    // 批量注册所有节点
    const registeredNodes: string[] = [];
    const failedNodes: Array<{ name: string; error: any }> = [];

    nodeConfigs.forEach((config) => {
      try {
        logicflowLogger.debug(`正在注册节点: ${config.type}`, {
          type: config.type,
          hasView: !!config.view,
          hasModel: !!config.model,
          viewPrototype: !!config.view.prototype,
          modelPrototype: !!config.model.prototype
        });
        
        lf.register(config);
        registeredNodes.push(config.type);
        logicflowLogger.success(`${config.type} 注册成功`);
      } catch (error) {
        failedNodes.push({ name: config.type, error });
        logicflowLogger.error(`${config.type} 注册失败`, error);
      }
    });
    
    // 注册完成后验证
    logicflowLogger.info('节点注册完成统计', {
      totalNodes: nodeConfigs.length,
      successCount: registeredNodes.length,
      failedCount: failedNodes.length,
      registeredNodes,
      failedNodes: failedNodes.map(f => f.name)
    });

    // 验证节点是否真正注册到LogicFlow中
    const graphModel = (lf as any).graphModel;
    if (graphModel && graphModel.modelMap) {
      const registeredTypes = Object.keys(graphModel.modelMap);
      logicflowLogger.success('LogicFlow内部已注册的节点类型', {
        types: registeredTypes,
        count: registeredTypes.length,
        hasRootNode: registeredTypes.includes('RootNode'),
        hasTextNode: registeredTypes.includes('TextNode')
      });
    } else {
      logicflowLogger.warn('无法访问LogicFlow的modelMap进行验证');
    }
    
    if (failedNodes.length > 0) {
      throw new Error(`部分节点注册失败: ${failedNodes.map(f => f.name).join(', ')}`);
    }
    
  } catch (error) {
    logicflowLogger.error('自定义节点注册过程中发生错误', error);
    throw error; // 重新抛出错误，阻止后续初始化
  }
  
  logicflowLogger.groupEnd();
}
/**
 * 设置LogicFlow事件监听器
 */
function setupLogicFlowEvents() {
  if (!logicFlowInstance.value) return;

  const lf = logicFlowInstance.value;

  // 节点点击事件：只负责展开（收起由卡片 header 内部处理，避免点击表单元素时误触）
  lf.on('node:click', ({ data }) => {
    console.log('节点点击:', data);
    // 跳过 RootNode，不展开编辑区
    if (data.type === 'root' || data.type === 'RootNode') return;
    const model = lf.getNodeModelById(data.id);
    if (!model) return;
    const current = model.getProperties();
    // 仅当折叠时才展开；展开态的收起由卡片 header 按钮处理
    if (!current.expanded) {
      model.setProperties({ expanded: true });
    }
  });

  // 节点双击事件
  lf.on('node:dblclick', ({ data }) => {
    console.log('节点双击:', data);
    // 可以在这里打开节点编辑对话框
  });

  // 节点拖拽事件
  lf.on('node:dragstart', ({ data }) => {
    broadcastOperation({
      type: 'node-update',
      nodeId: data.id,
      data: {
        position: { x: data.x, y: data.y },
        isDragging: true,
        dragStart: true,
      },
    });
  });

  lf.on('node:drag', ({ data }) => {
    // 节流广播拖拽位置更新
    broadcastOperation({
      type: 'node-update',
      nodeId: data.id,
      data: {
        position: { x: data.x, y: data.y },
        isDragging: true,
      },
    });
  });

  lf.on('node:dragend', ({ data }) => {
    broadcastOperation({
      type: 'node-update',
      nodeId: data.id,
      data: {
        position: { x: data.x, y: data.y },
        isDragging: false,
      },
    });
  });

  // 节点添加事件
  lf.on('node:add', ({ data }) => {
    console.log('节点添加:', data);
    broadcastOperation({
      type: 'node-create',
      nodeId: data.id,
      data: {
        type: data.type,
        position: { x: data.x, y: data.y },
        text: data.text?.value || '',
        properties: data.properties || {},
      },
    });
  });

  // 节点删除事件
  lf.on('node:delete', ({ data }) => {
    console.log('节点删除:', data);
    broadcastOperation({
      type: 'node-delete',
      nodeId: data.id,
      data: {},
    });
  });

  // 边添加事件
  lf.on('edge:add', ({ data }) => {
    console.log('边添加:', data);
    broadcastOperation({
      type: 'edge-create',
      edgeId: data.id,
      data: {
        source: data.sourceNodeId,
        target: data.targetNodeId,
      },
    });
  });

  // 边删除事件
  lf.on('edge:delete', ({ data }) => {
    console.log('边删除:', data);
    broadcastOperation({
      type: 'edge-delete',
      edgeId: data.id,
      data: {},
    });
  });

  // 文本更新事件
  lf.on('text:update', ({ id, value }) => {
    console.log('文本更新:', id, value);
    broadcastOperation({
      type: 'node-update',
      nodeId: id,
      data: {
        text: value,
      },
    });
  });
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
    // 转换数据格式
    const logicFlowData = logicFlowConverter.toLogicFlowData(workflowData);

    // 渲染数据
    logicFlowInstance.value.render(logicFlowData);

    // 确保有根节点
    ensureRootNode();

    // 居中视图以显示所有节点
    nextTick(() => {
      logicFlowInstance.value?.fitView(20);
    });

    console.log('工作流数据加载成功');
  } catch (error) {
    console.error('加载工作流数据失败:', error);
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
    text: {
      value: `${nodeType.toUpperCase()} 节点`,
      x: pos.x,
      y: pos.y,
    },
    properties: {
      title: `${nodeType.toUpperCase()} 节点`,
      nodeType: nodeType,
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
          nodes: [{ nodeId, nodeType }],
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
function clearGraph() {
  if (!logicFlowInstance.value) return;
  
  if (!confirm('确定要清空所有节点吗？')) return;

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

  if (!logicFlowInstance.value) return;

  const lf = logicFlowInstance.value;

  switch (operation.type) {
    case 'node-create':
      handleRemoteNodeCreate(operation, lf);
      break;
    case 'node-update':
      handleRemoteNodeUpdate(operation, lf);
      break;
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
}

/**
 * 处理远程节点创建
 */
function handleRemoteNodeCreate(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  if (!data || !operation.nodeId) return;

  // 检查节点是否已存在
  const existingNode = lf.getNodeModelById(operation.nodeId);
  if (existingNode) return;

  // 映射节点类型
  const typeMap: Record<string, string> = {
    root: 'RootNode',
    text: 'TextNode',
    property: 'PropertyNode',
    file: 'FileNode',
    image: 'ImageNode',
    video: 'VideoNode',
    audio: 'AudioNode',
  };

  const logicFlowType = typeMap[data.type] || 'TextNode';

  const nodeType = (data.type as NodeType) || 'text';
  const { width, height } = getNodeSize(nodeType);
  const nodeConfig = {
    id: operation.nodeId,
    type: logicFlowType,
    x: data.position?.x || 100,
    y: data.position?.y || 100,
    width,
    height,
    text: {
      value: data.text || '远程节点',
      x: data.position?.x || 100,
      y: data.position?.y || 100,
    },
    properties: {
      ...data.properties,
      nodeType: data.type,
    },
  };

  lf.addNode(nodeConfig);
}

/**
 * 处理远程节点更新
 */
function handleRemoteNodeUpdate(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  if (!data || !operation.nodeId) return;

  const nodeModel = lf.getNodeModelById(operation.nodeId);
  if (!nodeModel) return;

  // 更新节点位置
  if (data.position) {
    lf.moveNode(operation.nodeId, data.position.x, data.position.y);
  }

  // 更新节点文本
  if (data.text !== undefined) {
    nodeModel.updateText(data.text);
  }

  // 更新节点属性
  if (data.properties) {
    nodeModel.setProperties({
      ...nodeModel.getProperties(),
      ...data.properties,
    });
  }
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

  if (!operation.nodeId) return;

  const nodeModel = lf.getNodeModelById(operation.nodeId);
  if (nodeModel) {
    lf.deleteNode(operation.nodeId);
  }
}

/**
 * 处理远程边创建
 */
function handleRemoteEdgeCreate(operation: CollaborationOperation, lf: LogicFlow): void {
  const data = operation.data as any;
  if (!data || !data.source || !data.target) return;

  // 检查边是否已存在
  const existingEdge = lf.getEdgeModelById(operation.edgeId || '');
  if (existingEdge) return;

  const edgeConfig = {
    id: operation.edgeId || generateUniqueId('edge'),
    type: 'polyline',
    sourceNodeId: data.source,
    targetNodeId: data.target,
  };

  lf.addEdge(edgeConfig);
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
  z-index: 10;
  gap: 1rem;
  flex-wrap: wrap;
}

.toolbar h3 {
  margin: 0;
  color: #333;
  font-size: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-users {
  display: flex;
  align-items: center;
}

.online-users-inline {
  min-width: 260px;
  max-width: 320px;
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
  position: relative;
}

.logicflow-container {
  width: 100%;
  height: 100%;
  background: #fafafa;
  border-radius: 4px;
  overflow: hidden;
  /* 添加边界框以便调试 */
  border: 2px solid #e0e0e0;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05);
  position: relative;
}

/* 添加调试信息显示 */
.logicflow-container::before {
  content: 'LogicFlow画布区域';
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 8px;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 4px;
  font-size: 12px;
  color: #667eea;
  z-index: 1;
  pointer-events: none;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .toolbar {
    padding: 0.75rem;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .toolbar h3 {
    font-size: 14px;
  }
  
  .toolbar-right {
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .btn {
    padding: 0.4rem 0.8rem;
    font-size: 0.8rem;
  }
  
  .toolbar-users {
    width: 100%;
    justify-content: center;
  }
}
</style>
