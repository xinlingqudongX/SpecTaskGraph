/**
 * Wave 0 RED 测试桩：CardNodeModel + CardNodeView 行为测试
 * 覆盖 EDITOR-01, EDITOR-02, EDITOR-03, EDITOR-04
 *
 * 目标模块 frontend/src/nodes/NodeCardRenderer.ts 尚未创建（Wave 1 将实现），
 * 所以这些测试将以 RED 状态运行——CardNodeModel/CardNodeView 均为 undefined。
 */

import { describe, it, expect, vi } from 'vitest';

// Wave 1: 直接使用真实实现（不再 mock），测试转为 GREEN
import { CardNodeModel, CardNodeView } from '../nodes/NodeCardRenderer';

// ─────────────────────────────────────────────
// EDITOR-01: CardNodeModel 高度与展开逻辑
// ─────────────────────────────────────────────
describe('CardNodeModel', () => {
  it('custom nodes force expanded height (EDITOR-01)', () => {
    expect(CardNodeModel).toBeDefined();
    const model = new (CardNodeModel as any)({ properties: { expanded: false } });
    expect(model.properties.expanded).toBe(true);
    expect(model.height).toBeGreaterThanOrEqual(420);
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

  it('renders node status tag from backend status enum', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: true, requirement: '', prompt: null, attributes: [], status: 'review_needed' },
      id: 'test-node-status',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const statusTag = rootEl.querySelector('.node-card__status-tag');
    expect(statusTag).not.toBeNull();
    expect((statusTag as HTMLElement).textContent).toContain('待复核');
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

  it('always renders edit form even if incoming data is collapsed (EDITOR-01)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: false, requirement: '需求描述', prompt: null, attributes: [] },
      id: 'test-node-5',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const form = rootEl.querySelector('.node-card__edit-form');
    expect(form).not.toBeNull();
  });

  it('does not render collapsed summary anymore (EDITOR-01)', () => {
    expect(CardNodeView).toBeDefined();

    const rootEl = document.createElement('div');
    const mockModel = {
      properties: { expanded: false, requirement: '', prompt: null, attributes: [] },
      id: 'test-node-6',
    };

    const view = new (CardNodeView as any)({ model: mockModel });
    view.setHtml(rootEl);

    const summary = rootEl.querySelector('.node-card__summary');
    expect(summary).toBeNull();
  });
});
