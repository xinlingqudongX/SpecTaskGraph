/**
 * LogicFlow 配置文件
 * 定义LogicFlow的基础配置、主题和样式
 */

import LogicFlow from '@logicflow/core';
import { HtmlNode, HtmlNodeModel, PolylineEdge, PolylineEdgeModel } from '@logicflow/core';
import { Control, Menu, SelectionSelect, Snapshot } from '@logicflow/extension';
import { Dagre } from '@logicflow/layout';
import { logicflowLogger } from '../utils/logger';
import { CardNodeView } from '../nodes/NodeCardRenderer';
import {
  COLLAPSED_HEIGHT,
  EXPANDED_HEIGHT_BASE,
  ATTRIBUTE_ROW_HEIGHT,
  ATTRIBUTE_SECTION_EXTRA_HEIGHT,
  EXECUTION_HEADER_HEIGHT,
} from '../nodes/NodeCardModel';

/**
 * LogicFlow-compatible wrappers that extend the proper base classes.
 * CardNodeView/CardNodeModel are pure TS classes for unit testing.
 * These wrappers bridge them into the LogicFlow rendering pipeline.
 */
class LFCardNodeView extends HtmlNode {
  setHtml(rootEl: SVGForeignObjectElement): void {
    const view = new CardNodeView({ model: this.props.model as any });
    view.setHtml(rootEl);
  }
  shouldUpdate(): boolean {
    const view = new CardNodeView({ model: this.props.model as any });
    return view.shouldUpdate();
  }
}

class LFRootNodeModel extends HtmlNodeModel {
  setAttributes(): void {
    this.width = 180;
    this.height = 70;
    if (this.text) {
      // 节点名称已在 HTML 内部渲染，不需要 LogicFlow 的浮动文字标签
      this.text.value = '';
      this.text.draggable = false;
      this.text.editable = false;
    }
  }
}

class LFRootNodeView extends HtmlNode {
  setHtml(rootEl: SVGForeignObjectElement): void {
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

    const tag = document.createElement('div');
    tag.style.cssText = [
      'width:100%', 'padding:4px 8px 2px', 'box-sizing:border-box',
      'font-size:10px', 'font-weight:700', 'letter-spacing:1px',
      'color:rgba(255,255,255,0.6)', 'text-transform:uppercase',
      'border-bottom:1px solid rgba(255,255,255,0.15)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    tag.textContent = 'START';

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

  shouldUpdate(): boolean {
    return true;
  }
}

class LFCardNodeModel extends HtmlNodeModel {
  initNodeData(data: Record<string, any>): void {
    super.initNodeData(data);
    if (this.text) {
      this.text.draggable = false;
      this.text.editable = false;
    }
  }

  getDefaultAnchor(): Array<{ x: number; y: number; id: string; name: string }> {
    const { x, y, width, height, id } = this;
    // 卡片节点显式提供锚点，避免首次加载带边数据时 HtmlNodeModel 缺少 anchors 导致边渲染报错
    return [
      { x, y: y - height / 2, id: `${id}_top`, name: 'top' },
      { x: x + width / 2, y, id: `${id}_right`, name: 'right' },
      { x, y: y + height / 2, id: `${id}_bottom`, name: 'bottom' },
      { x: x - width / 2, y, id: `${id}_left`, name: 'left' },
    ];
  }

  setAttributes(): void {
    this.width = 280;
    // 节点名称已在卡片 HTML 内部渲染，不需要 LogicFlow 的浮动文字标签
    if (this.text) {
      this.text.value = '';
      this.text.draggable = false;
      this.text.editable = false;
    }
    const props = this.properties as Record<string, any>;
    props.expanded = true;
    // 自定义节点使用卡片表单承载编辑，不走 LogicFlow 默认文本输入框
    this.menu = [
      {
        text: '添加节点',
        callback: (node: { id: string }) => {
          window.dispatchEvent(new CustomEvent('lf:add-child-node', { detail: { nodeId: node.id } }));
        },
      },
      {
        text: '编辑文本',
        callback: (node: { id: string }) => {
          window.dispatchEvent(new CustomEvent('lf:edit-node-content', { detail: { nodeId: node.id } }));
        },
      },
      {
        text: '删除',
        callback: (node: { id: string }) => {
          this.graphModel.deleteNode(node.id);
        },
      },
    ];
    const attrCount = Array.isArray(props.attributes) ? props.attributes.length : 0;
    const baseHeight = EXPANDED_HEIGHT_BASE + ATTRIBUTE_SECTION_EXTRA_HEIGHT + attrCount * ATTRIBUTE_ROW_HEIGHT;
    // banner 内嵌于卡片顶部，需在原有内容高度之上额外预留 38px，避免挤压表单区域
    this.height = props.status === 'in_progress'
      ? baseHeight + EXECUTION_HEADER_HEIGHT
      : baseHeight;
  }
}

// LogicFlow基础配置
export const logicFlowConfig = {
  // 网格配置
  grid: {
    size: 20,
    visible: true,
    type: 'dot' as const,
    config: {
      color: '#ababab',
      thickness: 1,
    },
  },
  
  // 背景配置
  background: {
    backgroundImage: 'none',
    backgroundColor: '#fafafa',
  },
  
  // 键盘快捷键
  keyboard: {
    enabled: true,
  },
  
  // 样式配置
  style: {
    rect: {
      rx: 8,
      ry: 8,
      strokeWidth: 2,
    },
    circle: {
      strokeWidth: 2,
    },
    ellipse: {
      strokeWidth: 2,
    },
    polygon: {
      strokeWidth: 2,
    },
    polyline: {
      strokeWidth: 2,
    },
    text: {
      color: '#333',
      fontSize: 12,
    },
    nodeText: {
      color: '#333',
      fontSize: 12,
    },
    edgeText: {
      textWidth: 100,
      color: '#333',
      fontSize: 12,
    },
  },
  
  // 边的配置（使用支持样式切换的自定义折线边）
  edgeType: 'styled-polyline',
  
  // 是否开启历史记录
  history: true,
  
  // HtmlNode 使用 foreignObject 挂载真实 DOM。
  // 节点较多时局部渲染会让节点反复卸载/挂载，叠加 shouldUpdate 判定容易出现“命中区还在但内容没挂上”的假透明。
  // 这里关闭 partial，优先保证所有节点都稳定渲染。
  partial: false,
  
  // 动画配置
  animation: true,
  
  // 是否开启拖拽
  isSilentMode: false,
  
  // 停靠配置
  stopScrollGraph: true,
  stopZoomGraph: false,
  stopMoveGraph: false,
  
  // 调整边的配置
  adjustEdge: true,
  adjustEdgeMiddle: true,
  adjustNodePosition: true,
  
  // 连线规则
  allowRotate: false,
  allowResize: false,
  
  // 多选配置
  multipleSelectKey: 'meta',
  
  // 自动对齐
  snapline: true,
  
  // 插件配置
  plugins: [Control, Menu, SelectionSelect, Snapshot, Dagre],
};

// 主题配置
export const logicFlowTheme = {
  // 基础颜色
  baseNode: {
    fill: '#ffffff',
    stroke: '#2e73b2',
    strokeWidth: 2,
  },
  
  // 根节点样式
  rootNode: {
    fill: 'linear-gradient(180deg, #1f5d98 0%, #0e3f6f 100%)',
    stroke: '#0b3c66',
    strokeWidth: 2,
    color: '#ffffff',
  },
  
  // 文本节点样式
  textNode: {
    fill: '#ffffff',
    stroke: '#2196f3',
    strokeWidth: 2,
  },
  
  // 属性节点样式
  propertyNode: {
    fill: '#ffffff',
    stroke: '#00bcd4',
    strokeWidth: 2,
  },
  
  // 文件节点样式
  fileNode: {
    fill: '#ffffff',
    stroke: '#4caf50',
    strokeWidth: 2,
  },
  
  // 图片节点样式
  imageNode: {
    fill: '#ffffff',
    stroke: '#ff9800',
    strokeWidth: 2,
  },
  
  // 视频节点样式
  videoNode: {
    fill: '#ffffff',
    stroke: '#9c27b0',
    strokeWidth: 2,
  },
  
  // 音频节点样式
  audioNode: {
    fill: '#ffffff',
    stroke: '#e91e63',
    strokeWidth: 2,
  },
  
  // 边的样式
  edge: {
    stroke: '#5aa6e6',
    strokeWidth: 3,
    strokeDasharray: 'none',
  },
  
  // 选中状态样式
  selected: {
    stroke: '#667eea',
    strokeWidth: 3,
    shadowColor: 'rgba(102, 126, 234, 0.3)',
    shadowBlur: 10,
  },
  
  // 悬停状态样式
  hover: {
    stroke: '#667eea',
    strokeWidth: 2.5,
  },
  
  // 文本样式
  text: {
    color: '#333',
    fontSize: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  
  // 节点文本样式
  nodeText: {
    color: '#333',
    fontSize: 12,
    fontWeight: 'normal',
  },
  
  // 边文本样式
  edgeText: {
    color: '#666',
    fontSize: 11,
    fontWeight: 'normal',
    textWidth: 100,
  },
};

/**
 * 初始化LogicFlow实例
 * @param container DOM容器元素
 * @returns LogicFlow实例
 */
export function createLogicFlowInstance(container: HTMLElement): LogicFlow {
  logicflowLogger.group('createLogicFlowInstance');
  logicflowLogger.info('开始创建LogicFlow实例', {
    container,
    containerTagName: container.tagName,
    containerClientRect: container.getBoundingClientRect(),
    containerStyles: {
      width: getComputedStyle(container).width,
      height: getComputedStyle(container).height,
      display: getComputedStyle(container).display,
      position: getComputedStyle(container).position
    }
  });
  
  // 检查LogicFlow构造函数
  logicflowLogger.debug('LogicFlow构造函数检查', {
    LogicFlowType: typeof LogicFlow,
    LogicFlowConstructor: LogicFlow,
    LogicFlowPrototype: LogicFlow.prototype ? '存在' : '不存在',
    LogicFlowName: LogicFlow.name,
    isFunction: typeof LogicFlow === 'function'
  });
  
  logicflowLogger.debug('配置对象检查', {
    logicFlowConfig,
    configKeys: Object.keys(logicFlowConfig),
    pluginsCount: logicFlowConfig.plugins.length,
    pluginTypes: logicFlowConfig.plugins.map(p => p.name || p.constructor?.name || 'Unknown')
  });
  
  try {
    logicflowLogger.time('LogicFlow构造函数调用');
    
    // 创建LogicFlow实例，包含插件配置
    const lf = new LogicFlow({
      container,
      ...logicFlowConfig,
      // 在LogicFlow 2.x中，插件通过配置对象的plugins数组传入
      plugins: logicFlowConfig.plugins,
    });
    
    logicflowLogger.timeEnd('LogicFlow构造函数调用');
    logicflowLogger.success('LogicFlow实例创建成功', {
      instance: lf,
      instanceType: typeof lf,
      instanceConstructor: lf.constructor.name,
      instanceMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(lf)).slice(0, 15), // 显示前15个方法
      hasRequiredMethods: {
        addNode: typeof lf.addNode,
        register: typeof lf.register,
        render: typeof lf.render,
        getGraphData: typeof lf.getGraphData,
        setTheme: typeof lf.setTheme
      }
    });
    
    // LogicFlow 2.x中插件已经通过构造函数配置自动注册
    logicflowLogger.info('插件已通过构造函数配置自动注册', {
      pluginCount: logicFlowConfig.plugins.length,
      plugins: logicFlowConfig.plugins.map(p => p.name || p.constructor?.name || 'Unknown')
    });
    
    // 注册自定义边类型（必须在 render 之前）
    registerStyledEdge(lf);

    // 注册卡片节点类型（必须在 render 之前）
    logicflowLogger.info('开始注册卡片节点类型...');
    registerCardNodes(lf);
    logicflowLogger.success('卡片节点类型注册完成');

    // 应用主题
    logicflowLogger.info('开始应用主题...');
    logicflowLogger.time('主题应用');
    applyTheme(lf);
    logicflowLogger.timeEnd('主题应用');
    logicflowLogger.success('主题应用完成');
    
    logicflowLogger.groupEnd();
    return lf;
    
  } catch (error: any) {
    logicflowLogger.error('创建LogicFlow实例时发生错误', {
      error,
      errorMessage: error?.message,
      errorStack: error?.stack,
      container,
      config: logicFlowConfig
    });
    logicflowLogger.groupEnd();
    throw error;
  }
}

/**
 * 应用主题到LogicFlow实例
 * @param lf LogicFlow实例
 */
export function applyTheme(lf: LogicFlow): void {
  // 设置基础主题样式
  lf.setTheme({
    rect: logicFlowTheme.baseNode,
    text: logicFlowTheme.text,
    nodeText: logicFlowTheme.nodeText,
    edgeText: {
      ...logicFlowTheme.edgeText,
      textWidth: 100,
    },
    polyline: logicFlowTheme.edge,
  });
}

// strokeStyle → SVG strokeDasharray 映射
const STROKE_DASH_MAP: Record<string, string> = {
  dashed: '8 4',
  dotted: '2 4',
};

// 可自定义样式的折线边 Model，根据 properties.strokeStyle 返回对应虚线样式
class StyledPolylineEdgeModel extends PolylineEdgeModel {
  getEdgeStyle() {
    const style = super.getEdgeStyle();
    const dash = STROKE_DASH_MAP[this.properties.strokeStyle as string];
    if (dash) style.strokeDasharray = dash;
    return style;
  }
}

/**
 * 注册自定义边并配置右键菜单。
 * 必须在 LogicFlow 实例创建后、render 之前调用。
 */
export function registerStyledEdge(lf: LogicFlow): void {
  lf.register({ type: 'styled-polyline', view: PolylineEdge, model: StyledPolylineEdgeModel });

  // 边样式右键菜单：切换实线/虚线/点线，并触发保存同步
  const dispatchEdgeChange = () => {
    window.dispatchEvent(new CustomEvent('lf:edge-style-changed'));
  };

  try {
    (lf.extension as any).menu?.addMenuConfig({
      edgeMenu: [
        {
          text: '实线',
          callback: (edge: { id: string }) => {
            lf.setProperties(edge.id, { strokeStyle: 'solid' });
            dispatchEdgeChange();
          },
        },
        {
          text: '虚线',
          callback: (edge: { id: string }) => {
            lf.setProperties(edge.id, { strokeStyle: 'dashed' });
            dispatchEdgeChange();
          },
        },
        {
          text: '点线',
          callback: (edge: { id: string }) => {
            lf.setProperties(edge.id, { strokeStyle: 'dotted' });
            dispatchEdgeChange();
          },
        },
        {
          text: '删除',
          callback: (edge: { id: string }) => {
            lf.deleteEdge(edge.id);
          },
        },
      ],
    });
  } catch {
    // 部分版本 Menu 插件挂载时机不同，容错处理
  }
}

/**
 * 注册项目使用的全部自定义节点类型到 LogicFlow 实例。
 * 根节点使用 RootNode，其余业务节点统一使用小写类型。
 */
export function registerCardNodes(lf: LogicFlow): void {
  lf.register({ type: 'RootNode', view: LFRootNodeView, model: LFRootNodeModel });
  const CARD_NODE_TYPES = ['text', 'image', 'audio', 'video', 'file', 'property'];
  for (const type of CARD_NODE_TYPES) {
    lf.register({ type, view: LFCardNodeView, model: LFCardNodeModel });
  }
}

/**
 * 获取节点类型对应的样式
 * @param nodeType 节点类型
 * @returns 节点样式配置
 */
export function getNodeStyle(nodeType: string) {
  const styleMap: Record<string, any> = {
    root: logicFlowTheme.rootNode,
    text: logicFlowTheme.textNode,
    property: logicFlowTheme.propertyNode,
    file: logicFlowTheme.fileNode,
    image: logicFlowTheme.imageNode,
    video: logicFlowTheme.videoNode,
    audio: logicFlowTheme.audioNode,
  };
  
  return styleMap[nodeType] || logicFlowTheme.baseNode;
}