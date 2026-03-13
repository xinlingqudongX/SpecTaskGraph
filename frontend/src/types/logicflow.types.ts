/**
 * LogicFlow 类型定义文件
 * 定义LogicFlow相关的TypeScript类型和接口
 */

// 节点类型枚举
export type NodeType = 'root' | 'text' | 'image' | 'video' | 'audio' | 'file' | 'property';

// 节点状态枚举
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

// 基础节点配置接口
export interface BaseNodeConfig {
  id: string;
  type: string;
  x: number;
  y: number;
  text?: {
    value: string;
    x: number;
    y: number;
  };
  properties?: {
    [key: string]: any;
  };
}

// 扩展的节点配置接口
export interface ExtendedNodeConfig extends BaseNodeConfig {
  properties?: {
    title?: string;
    status?: NodeStatus;
    textContent?: string;
    resourceUrl?: string;
    resourceName?: string;
    properties?: Array<{ key: string; value: string }>;
    nodeType?: NodeType;
    width?: number;
    height?: number;
    [key: string]: any;
  };
}

// 基础边配置接口
export interface BaseEdgeConfig {
  id: string;
  type: string;
  sourceNodeId: string;
  targetNodeId: string;
  startPoint?: {
    x: number;
    y: number;
  };
  endPoint?: {
    x: number;
    y: number;
  };
  text?: {
    value: string;
    x: number;
    y: number;
  };
  properties?: {
    [key: string]: any;
  };
}

// 扩展的边配置接口
export interface ExtendedEdgeConfig extends BaseEdgeConfig {
  properties?: {
    edgeType?: string;
    [key: string]: any;
  };
}

// LogicFlow图数据接口
export interface LogicFlowGraphData {
  nodes: ExtendedNodeConfig[];
  edges: ExtendedEdgeConfig[];
}

// 节点数据接口（用于与现有系统兼容）
export interface NodeData {
  id: string;
  title: string;
  type: NodeType;
  status: NodeStatus;
  x: number;
  y: number;
  width?: number;
  height?: number;
  config: {
    typeKey?: NodeType;
    textContent?: string;
    resourceName?: string;
    resourceUrl?: string;
    properties?: Array<{ key: string; value: string }>;
    [key: string]: any;
  };
}

// 边数据接口（用于与现有系统兼容）
export interface EdgeData {
  id: string;
  source: string;
  target: string;
  type?: string;
}

// 工作流数据接口（用于与现有系统兼容）
export interface WorkflowData {
  elements: Array<{
    group: 'nodes' | 'edges';
    data: NodeData | EdgeData;
    position?: { x: number; y: number };
  }>;
}

// LogicFlow事件类型
export interface LogicFlowEvents {
  'node:click': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:dblclick': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:mousedown': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:mouseup': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:mousemove': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:mouseenter': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:mouseleave': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:contextmenu': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:dragstart': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:drag': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:dragend': (data: { data: ExtendedNodeConfig; e: MouseEvent }) => void;
  'node:add': (data: { data: ExtendedNodeConfig }) => void;
  'node:delete': (data: { data: ExtendedNodeConfig }) => void;
  'node:properties:change': (data: { data: ExtendedNodeConfig }) => void;
  
  'edge:click': (data: { data: ExtendedEdgeConfig; e: MouseEvent }) => void;
  'edge:dblclick': (data: { data: ExtendedEdgeConfig; e: MouseEvent }) => void;
  'edge:contextmenu': (data: { data: ExtendedEdgeConfig; e: MouseEvent }) => void;
  'edge:add': (data: { data: ExtendedEdgeConfig }) => void;
  'edge:delete': (data: { data: ExtendedEdgeConfig }) => void;
  'edge:adjust': (data: { data: ExtendedEdgeConfig }) => void;
  
  'blank:click': (data: { e: MouseEvent }) => void;
  'blank:contextmenu': (data: { e: MouseEvent }) => void;
  'blank:dragstart': (data: { e: MouseEvent }) => void;
  'blank:drag': (data: { e: MouseEvent }) => void;
  'blank:dragend': (data: { e: MouseEvent }) => void;
  
  'graph:transform': (data: { transform: any }) => void;
  'graph:rendered': () => void;
  'selection:selected': (data: { isMultiple: boolean; elements: any[] }) => void;
  'text:update': (data: { id: string; value: string }) => void;
  'anchor:dragstart': (data: { data: any; e: MouseEvent }) => void;
  'anchor:drag': (data: { data: any; e: MouseEvent }) => void;
  'anchor:dragend': (data: { data: any; e: MouseEvent }) => void;
}

// 节点样式配置接口
export interface NodeStyleConfig {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  rx?: number;
  ry?: number;
  width?: number;
  height?: number;
  [key: string]: any;
}

// 边样式配置接口
export interface EdgeStyleConfig {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  fill?: string;
  [key: string]: any;
}

// 文本样式配置接口
export interface TextStyleConfig {
  color?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontFamily?: string;
  textAnchor?: string;
  dominantBaseline?: string;
  [key: string]: any;
}

// LogicFlow主题配置接口
export interface LogicFlowThemeConfig {
  baseNode?: NodeStyleConfig;
  rootNode?: NodeStyleConfig;
  textNode?: NodeStyleConfig;
  propertyNode?: NodeStyleConfig;
  fileNode?: NodeStyleConfig;
  imageNode?: NodeStyleConfig;
  videoNode?: NodeStyleConfig;
  audioNode?: NodeStyleConfig;
  edge?: EdgeStyleConfig;
  selected?: NodeStyleConfig & EdgeStyleConfig;
  hover?: NodeStyleConfig & EdgeStyleConfig;
  text?: TextStyleConfig;
  nodeText?: TextStyleConfig;
  edgeText?: TextStyleConfig;
}

// 工具栏按钮配置接口
export interface ToolbarButtonConfig {
  key: string;
  title: string;
  icon: string;
  action: () => void;
  disabled?: boolean;
  visible?: boolean;
  type?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
}

// 右键菜单项配置接口
export interface ContextMenuItemConfig {
  key: string;
  title: string;
  icon?: string;
  action: (data: any) => void;
  disabled?: boolean;
  visible?: boolean;
  divider?: boolean;
  danger?: boolean;
}

// LogicFlow配置选项接口
export interface LogicFlowOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
  background?: {
    backgroundImage?: string;
    backgroundColor?: string;
  };
  grid?: {
    size?: number;
    visible?: boolean;
    type?: 'dot' | 'mesh';
    config?: {
      color?: string;
      thickness?: number;
    };
  };
  keyboard?: {
    enabled?: boolean;
  };
  style?: {
    rect?: NodeStyleConfig;
    circle?: NodeStyleConfig;
    ellipse?: NodeStyleConfig;
    polygon?: NodeStyleConfig;
    polyline?: EdgeStyleConfig;
    text?: TextStyleConfig;
    nodeText?: TextStyleConfig;
    edgeText?: TextStyleConfig;
  };
  edgeType?: string;
  history?: boolean;
  partial?: boolean;
  animation?: boolean;
  isSilentMode?: boolean;
  stopScrollGraph?: boolean;
  stopZoomGraph?: boolean;
  stopMoveGraph?: boolean;
  adjustEdge?: boolean;
  adjustEdgeMiddle?: boolean;
  adjustNodePosition?: boolean;
  allowRotate?: boolean;
  allowResize?: boolean;
  multipleSelectKey?: string;
  snapline?: boolean;
  plugins?: any[];
}

// 数据转换器接口
export interface DataConverter {
  // 将现有工作流数据转换为LogicFlow格式
  toLogicFlowData(workflowData: WorkflowData): LogicFlowGraphData;
  
  // 将LogicFlow数据转换为现有工作流格式
  fromLogicFlowData(logicFlowData: LogicFlowGraphData): WorkflowData;
  
  // 转换单个节点数据
  convertNodeData(nodeData: NodeData): ExtendedNodeConfig;
  
  // 转换单个边数据
  convertEdgeData(edgeData: EdgeData): ExtendedEdgeConfig;
}

// 协同编辑操作类型
export interface CollaborationOperation {
  type: 'node-create' | 'node-update' | 'node-delete' | 'edge-create' | 'edge-delete';
  nodeId?: string;
  edgeId?: string;
  data: any;
  userId?: string;
  timestamp?: number;
}