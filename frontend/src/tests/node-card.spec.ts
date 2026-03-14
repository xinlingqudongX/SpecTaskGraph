/**
 * Wave 0 RED 测试桩：CardNodeModel + CardNodeView 行为测试
 * 覆盖 EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04
 *
 * 目标模块 frontend/src/nodes/NodeCardRenderer.ts 尚未创建（Wave 1 将实现），
 * 所以这些测试将以 RED 状态运行——CardNodeModel/CardNodeView 均为 undefined。
 */

import { describe, it, expect, vi } from 'vitest';

// Wave 1 将创建真实模块；此处 mock 返回空对象，使 CardNodeModel/CardNodeView 为 undefined，
// 所有 expect(...).toBeDefined() 和行为断言均将失败（RED）。
vi.mock('../nodes/NodeCardRenderer', () => ({}));

import { CardNodeModel, CardNodeView } from '../nodes/NodeCardRenderer';

// ─────────────────────────────────────────────
// EDITOR-01: CardNodeModel 高度与展开逻辑
// ─────────────────────────────────────────────
describe('CardNodeModel', () => {
  it('collapsed height=80 (EDITOR-01)', () => {
    // CardNodeModel 尚未实现，expect 将失败（RED）
    expect(CardNodeModel).toBeDefined();
    const model = new (CardNodeModel as any)({ properties: { expanded: false } });
    expect(model.height).toBe(80);
  });

  it('expanded height>=300 (EDITOR-01)', () => {
    expect(CardNodeModel).toBeDefined();
    const model = new (CardNodeModel as any)({ properties: { expanded: true } });
    expect(model.height).toBeGreaterThanOrEqual(300);
  });

  it('node:click 切换 expanded 后 model.properties.expanded 为 true (EDITOR-01)', () => {
    expect(CardNodeModel).toBeDefined();
    const model = new (CardNodeModel as any)({ properties: { expanded: false } });
    model.setProperties({ expanded: true });
    expect(model.properties.expanded).toBe(true);
  });
});

// ─────────────────────────────────────────────
// EDITOR-02: CardNodeView 渲染 requirement 字段
// ─────────────────────────────────────────────
describe('CardNodeView', () => {
  it('renders requirement textarea when expanded (EDITOR-02)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: true, requirement: '需求描述', prompt: null, attributes: [] },
      id: 'test-node-1',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const textarea = rootEl.querySelector('.node-card__field--requirement textarea');
    expect(textarea).not.toBeNull();
  });

  // ─────────────────────────────────────────────
  // EDITOR-03: CardNodeView 渲染 prompt 字段
  // ─────────────────────────────────────────────
  it('renders prompt textarea when expanded (EDITOR-03)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: true, requirement: '需求描述', prompt: 'AI 提示词', attributes: [] },
      id: 'test-node-2',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const textarea = rootEl.querySelector('.node-card__field--prompt textarea');
    expect(textarea).not.toBeNull();
  });

  // ─────────────────────────────────────────────
  // EDITOR-04: CardNodeView 渲染 attributes 表格
  // ─────────────────────────────────────────────
  it('renders attributes table when expanded (EDITOR-04)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: true, requirement: '', prompt: null, attributes: [{ key: 'version', value: '1.0' }] },
      id: 'test-node-3',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const table = rootEl.querySelector('.node-card__attributes');
    expect(table).not.toBeNull();
    const rows = rootEl.querySelectorAll('.node-card__attributes tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('add row button click increments model.properties.attributes length (EDITOR-04)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const attrs = [{ key: 'k1', value: 'v1' }];
    const mockModel = {
      properties: { expanded: true, requirement: '', prompt: null, attributes: attrs },
      id: 'test-node-4',
      setProperties: vi.fn(function (this: any, props: any) {
        if (props.attributes) this.properties.attributes = props.attributes;
      }),
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const addBtn = rootEl.querySelector('.node-card__add-attribute');
    expect(addBtn).not.toBeNull();

    const initialLength = mockModel.properties.attributes.length;
    (addBtn as HTMLElement).click();
    expect(mockModel.properties.attributes.length).toBe(initialLength + 1);
  });

  // ─────────────────────────────────────────────
  // EDITOR-01: collapsed 状态显示截断文本
  // ─────────────────────────────────────────────
  it('shows truncated requirement in summary when collapsed (EDITOR-01)', () => {
    expect(CardNodeView).toBeDefined();

    const longReq = '这是一段超过五十个字符的需求描述文字，用于测试截断显示功能是否正确工作，确保不超过限制。';
    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: false, requirement: longReq, prompt: null, attributes: [] },
      id: 'test-node-5',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const summary = rootEl.querySelector('.node-card__summary');
    expect(summary).not.toBeNull();
    const text = (summary as HTMLElement).textContent || '';
    expect(text.length).toBeLessThanOrEqual(53); // 50 chars + "..."
  });

  it('shows 未填写 when requirement is empty (EDITOR-01)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: false, requirement: '', prompt: null, attributes: [] },
      id: 'test-node-6',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const summary = rootEl.querySelector('.node-card__summary');
    expect(summary).not.toBeNull();
    expect((summary as HTMLElement).textContent).toContain('未填写');
  });
});
