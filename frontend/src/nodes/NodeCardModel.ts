/**
 * NodeCardModel — Wave 1 实现
 *
 * CardNodeModel 提供节点卡片的高度计算逻辑。
 * 当前业务约束下自定义节点始终保持展开态，不再提供折叠视图。
 *
 * 该类实现了与 LogicFlow HtmlNodeModel 兼容的接口，可直接在测试中实例化，
 * 也可在 logicflow.config.ts 中通过继承 HtmlNodeModel 的包装类使用。
 */

export const COLLAPSED_HEIGHT = 80;
export const EXPANDED_HEIGHT_BASE = 420;
export const ATTRIBUTE_ROW_HEIGHT = 44;
export const ATTRIBUTE_SECTION_EXTRA_HEIGHT = 72;
export const EXECUTION_HEADER_HEIGHT = 38;
export const EXECUTION_SHELL_WIDTH = 500;
export const EXECUTION_SHELL_COLLAPSED_WIDTH = 300;

/**
 * CardNodeModel：节点卡片数据模型。
 *
 * 独立实现（不继承 HtmlNodeModel），满足测试可直接实例化的要求。
 * 在 LogicFlow 注册时通过适配包装类（logicflow.config.ts）挂载。
 */
export class CardNodeModel {
  width: number = 280;
  height: number = COLLAPSED_HEIGHT;
  id: string = '';
  properties: Record<string, any> = {};

  constructor(data?: { properties?: Record<string, any>; id?: string; width?: number; height?: number }) {
    if (data) {
      if (data.id != null) this.id = data.id;
      if (data.width != null) this.width = data.width;
      if (data.properties != null) {
        this.properties = { ...data.properties };
      }
    }
    // 初始化时根据 properties 设置高度
    this.setAttributes();
  }

  /**
   * 自定义节点统一按展开态计算高度。
   * 这里强制写回 expanded=true，避免旧数据或远端同步把节点带回收起态。
   */
  setAttributes(): void {
    this.properties.expanded = true;
    const attrCount = (this.properties.attributes ?? []).length;
    const baseHeight =
      EXPANDED_HEIGHT_BASE +
      ATTRIBUTE_SECTION_EXTRA_HEIGHT +
      attrCount * ATTRIBUTE_ROW_HEIGHT;
    const isInProgress = this.properties.status === 'in_progress';
    const panelCollapsed = this.properties.executorPanelCollapsed !== false;

    this.width = isInProgress
      ? panelCollapsed
        ? EXECUTION_SHELL_COLLAPSED_WIDTH
        : EXECUTION_SHELL_WIDTH
      : 280;
    this.height = isInProgress ? baseHeight + EXECUTION_HEADER_HEIGHT : baseHeight;
  }

  /**
   * 更新 properties 并重新计算高度。
   * 兼容 LogicFlow HtmlNodeModel.setProperties 接口。
   */
  setProperties(props: Record<string, any>): void {
    this.properties = { ...this.properties, ...props };
    this.setAttributes();
  }

  /**
   * 返回当前 properties 对象。
   * 兼容 LogicFlow HtmlNodeModel.getProperties 接口。
   */
  getProperties(): Record<string, any> {
    return { ...this.properties };
  }
}
