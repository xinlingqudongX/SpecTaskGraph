/**
 * NodeCardModel — Wave 1 实现
 *
 * CardNodeModel 提供节点卡片的高度计算逻辑：
 * - expanded=false → height=80（折叠态）
 * - expanded=true  → height=EXPANDED_HEIGHT_BASE + attrCount*36（展开态）
 *
 * 该类实现了与 LogicFlow HtmlNodeModel 兼容的接口，可直接在测试中实例化，
 * 也可在 logicflow.config.ts 中通过继承 HtmlNodeModel 的包装类使用。
 */

export const COLLAPSED_HEIGHT = 80;
export const EXPANDED_HEIGHT_BASE = 300;

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
   * 根据 properties.expanded 和 properties.attributes 计算节点高度。
   * LogicFlow 在 properties 变化时自动调用此方法。
   */
  setAttributes(): void {
    this.width = 280;
    if (this.properties.expanded) {
      const attrCount = (this.properties.attributes ?? []).length;
      this.height = EXPANDED_HEIGHT_BASE + attrCount * 36;
    } else {
      this.height = COLLAPSED_HEIGHT;
    }
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
