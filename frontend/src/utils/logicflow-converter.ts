/**
 * LogicFlow 数据转换器
 * 负责在现有工作流数据格式和LogicFlow数据格式之间进行转换
 */

import type {
  NodeData,
  EdgeData,
  WorkflowData,
  ExtendedNodeConfig,
  ExtendedEdgeConfig,
  LogicFlowGraphData,
  NodeType,
  NodeStatus,
  DataConverter,
} from '../types/logicflow.types';

/**
 * LogicFlow数据转换器实现
 */
export class LogicFlowDataConverter implements DataConverter {
  /**
   * 将现有工作流数据转换为LogicFlow格式
   */
  toLogicFlowData(workflowData: WorkflowData): LogicFlowGraphData {
    const nodes: ExtendedNodeConfig[] = [];
    const edges: ExtendedEdgeConfig[] = [];

    workflowData.elements.forEach((element) => {
      if (element.group === 'nodes') {
        const raw = element.data as NodeData;
        // element.position 是 App.vue 写入坐标的字段，需合并进 nodeData
        const nodeData: NodeData = {
          ...raw,
          x: element.position?.x ?? raw.x ?? 100,
          y: element.position?.y ?? raw.y ?? 100,
        };
        nodes.push(this.convertNodeData(nodeData));
      } else if (element.group === 'edges') {
        const edgeData = element.data as EdgeData;
        const logicFlowEdge = this.convertEdgeData(edgeData);
        edges.push(logicFlowEdge);
      }
    });

    const nodeIds = new Set(nodes.map((node) => node.id));
    const validEdges = edges.filter((edge) =>
      nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId),
    );

    return { nodes, edges: validEdges };
  }

  /**
   * 将LogicFlow数据转换为现有工作流格式
   */
  fromLogicFlowData(logicFlowData: LogicFlowGraphData): WorkflowData {
    const elements: WorkflowData['elements'] = [];

    // 转换节点
    logicFlowData.nodes.forEach((node) => {
      const nodeData = this.convertLogicFlowNodeToNodeData(node);
      elements.push({
        group: 'nodes',
        data: nodeData,
        position: { x: node.x, y: node.y },
      });
    });

    // 转换边
    logicFlowData.edges.forEach((edge) => {
      const edgeData = this.convertLogicFlowEdgeToEdgeData(edge);
      elements.push({
        group: 'edges',
        data: edgeData,
      });
    });

    return { elements };
  }

  /**
   * 转换单个节点数据（现有格式 -> LogicFlow格式）
   */
  convertNodeData(nodeData: NodeData): ExtendedNodeConfig {
    const { width, height } = this.getNodeSize(nodeData.type);
    
    return {
      id: nodeData.id,
      type: this.mapNodeTypeToLogicFlow(nodeData.type),
      x: nodeData.x,
      y: nodeData.y,
      width,
      height,
      // 对所有节点清空 text.value，避免 LogicFlow 在节点外渲染浮动 SVG 文字；
      // 标题由各节点的 HtmlNode setHtml 内部渲染。
      text: { value: '', x: nodeData.x, y: nodeData.y },
      properties: {
        title: nodeData.title,
        status: nodeData.status,
        textContent: nodeData.config.textContent || '',
        resourceUrl: nodeData.config.resourceUrl || '',
        resourceName: nodeData.config.resourceName || '',
        properties: nodeData.config.properties || [],
        nodeType: nodeData.type,
        width,
        height,
        expanded: nodeData.type === 'root' ? undefined : true,
        requirement: nodeData.config.requirement ?? '',
        prompt: nodeData.config.prompt ?? null,
        attributes: nodeData.config.attributes ?? [],
        ...this.extractCustomProperties(nodeData.config),
      },
    };
  }

  /**
   * 转换单个边数据（现有格式 -> LogicFlow格式）
   */
  convertEdgeData(edgeData: EdgeData): ExtendedEdgeConfig {
    return {
      id: edgeData.id,
      type: 'styled-polyline',
      sourceNodeId: edgeData.source,
      targetNodeId: edgeData.target,
      properties: {
        edgeType: edgeData.type || 'sequence',
        strokeStyle: edgeData.style?.strokeStyle ?? 'solid',
      },
      // 还原 Dagre 整理后的折线路径点，精确回显边的走向
      pointsList: edgeData.pointsList,
      startPoint: edgeData.startPoint,
      endPoint: edgeData.endPoint,
    };
  }

  /**
   * 转换LogicFlow节点数据为现有格式
   */
  private convertLogicFlowNodeToNodeData(node: ExtendedNodeConfig): NodeData {
    // 优先从properties.nodeType获取节点类型，否则从LogicFlow类型映射
    const nodeType = (node.properties?.nodeType as NodeType) || this.mapLogicFlowTypeToNodeType(node.type);
    const { width, height } = this.getNodeSize(nodeType);

    return {
      id: node.id,
      title: node.properties?.title || node.text?.value || '节点',
      type: nodeType,
      status: (node.properties?.status as NodeStatus) || 'pending',
      x: node.x,
      y: node.y,
      width,
      height,
      config: {
        typeKey: nodeType,
        textContent: node.properties?.textContent || '',
        resourceUrl: node.properties?.resourceUrl || '',
        resourceName: node.properties?.resourceName || '',
        properties: node.properties?.properties || [],
        requirement: node.properties?.requirement ?? '',
        prompt: node.properties?.prompt ?? null,
        attributes: node.properties?.attributes ?? [],
        ...this.extractCustomProperties(node.properties || {}),
      },
    };
  }

  /**
   * 转换LogicFlow边数据为现有格式
   */
  private convertLogicFlowEdgeToEdgeData(edge: ExtendedEdgeConfig): EdgeData {
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      type: edge.properties?.edgeType || 'sequence',
      style: {
        strokeStyle: (edge.properties?.strokeStyle as string) || 'solid',
      },
      // 保存折线路径点，Dagre 整理后的走向可精确回显
      pointsList: edge.pointsList,
      startPoint: edge.startPoint,
      endPoint: edge.endPoint,
    };
  }

  /**
   * 映射节点类型（现有格式 -> LogicFlow格式）
   */
  private mapNodeTypeToLogicFlow(nodeType: NodeType): string {
    const typeMap: Record<NodeType, string> = {
      root: 'RootNode',
      // 画布层统一使用小写类型，避免再次回流成 TextNode / ImageNode 这类历史值
      text: 'text',
      property: 'property',
      file: 'file',
      image: 'image',
      video: 'video',
      audio: 'audio',
    };
    return typeMap[nodeType] || 'text';
  }

  /**
   * 映射节点类型（LogicFlow格式 -> 现有格式）
   */
  private mapLogicFlowTypeToNodeType(logicFlowType: string): NodeType {
    // 兼容两类历史数据：旧的 PascalCase 注册名，以及现在统一的小写类型
    const typeMap: Record<string, NodeType> = {
      'root': 'root',
      'text': 'text',
      'property': 'property',
      'file': 'file',
      'image': 'image',
      'video': 'video',
      'audio': 'audio',
      'RootNode': 'root',
      'TextNode': 'text',
      'PropertyNode': 'property',
      'FileNode': 'file',
      'ImageNode': 'image',
      'VideoNode': 'video',
      'AudioNode': 'audio',
      'rect': 'text', // LogicFlow基础矩形节点默认为文本节点
    };
    return typeMap[logicFlowType] || 'text';
  }

  /**
   * 获取节点尺寸
   */
  private getNodeSize(nodeType: NodeType): { width: number; height: number } {
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

  /**
   * 提取自定义属性（排除已知的标准属性）
   */
  private extractCustomProperties(properties: Record<string, any>): Record<string, any> {
    const standardProps = new Set([
      'title',
      'status',
      'textContent',
      'resourceUrl',
      'resourceName',
      'properties',
      'nodeType',
      'width',
      'height',
      'typeKey',
      'requirement',
      'prompt',
      'attributes',
    ]);

    const customProps: Record<string, any> = {};
    Object.keys(properties).forEach((key) => {
      if (!standardProps.has(key)) {
        customProps[key] = properties[key];
      }
    });

    return customProps;
  }

  /**
   * 创建新节点数据
   */
  createNodeData(
    type: NodeType,
    position: { x: number; y: number },
    title?: string
  ): ExtendedNodeConfig {
    const id = this.generateUniqueId('node');
    const { width, height } = this.getNodeSize(type);

    return {
      id,
      type: this.mapNodeTypeToLogicFlow(type),
      x: position.x,
      y: position.y,
      width,
      height,
      text: { value: '', x: position.x, y: position.y },
      properties: {
        title: title || `${type.toUpperCase()} ${id}`,
        status: 'pending' as NodeStatus,
        textContent: '',
        resourceUrl: '',
        resourceName: '',
        properties: type === 'property' ? [{ key: '', value: '' }] : [],
        nodeType: type,
        width,
        height,
        expanded: type === 'root' ? undefined : true,
      },
    };
  }

  /**
   * 创建新边数据
   */
  createEdgeData(sourceId: string, targetId: string): ExtendedEdgeConfig {
    const id = this.generateUniqueId('edge');

    return {
      id,
      type: 'styled-polyline',
      sourceNodeId: sourceId,
      targetNodeId: targetId,
      properties: {
        edgeType: 'sequence',
        strokeStyle: 'solid',
      },
    };
  }

  /**
   * 生成唯一ID
   */
  private generateUniqueId(prefix: string): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  }

  /**
   * 验证数据格式
   */
  validateWorkflowData(data: WorkflowData): boolean {
    if (!data || !Array.isArray(data.elements)) {
      return false;
    }

    return data.elements.every((element) => {
      if (!element.group || !element.data) {
        return false;
      }

      if (element.group === 'nodes') {
        const nodeData = element.data as NodeData;
        return !!(nodeData.id && nodeData.type && nodeData.title);
      }

      if (element.group === 'edges') {
        const edgeData = element.data as EdgeData;
        return !!(edgeData.id && edgeData.source && edgeData.target);
      }

      return false;
    });
  }

  /**
   * 验证LogicFlow数据格式
   */
  validateLogicFlowData(data: LogicFlowGraphData): boolean {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      return false;
    }

    const nodeIds = new Set(data.nodes.map((node) => node.id));

    // 验证节点
    const nodesValid = data.nodes.every((node) => {
      return !!(
        node.id &&
        node.type &&
        typeof node.x === 'number' &&
        typeof node.y === 'number'
      );
    });

    // 验证边
    const edgesValid = data.edges.every((edge) => {
      return !!(
        edge.id &&
        edge.sourceNodeId &&
        edge.targetNodeId &&
        nodeIds.has(edge.sourceNodeId) &&
        nodeIds.has(edge.targetNodeId)
      );
    });

    return nodesValid && edgesValid;
  }
}

// 导出单例实例
export const logicFlowConverter = new LogicFlowDataConverter();
