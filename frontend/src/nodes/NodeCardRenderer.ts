/**
 * NodeCardRenderer — Wave 1 实现
 *
 * CardNodeView：节点卡片视图，实现 setHtml(rootEl) 渲染内联编辑区。
 * CardNodeModel：从 NodeCardModel.ts 重新导出，供统一导入。
 *
 * 使用纯 DOM API（无 Vue 3），在 setHtml 回调中直接构建 HTML 结构，
 * 支持展开/折叠、requirement/prompt/attributes 字段编辑，防抖自动保存。
 */

import { CardNodeModel } from './NodeCardModel';
import { patchNode, showSaveStatus, debounce } from '../services/node-api.service';

export { CardNodeModel };

/**
 * 构建展开态的编辑表单并挂载到卡片容器内。
 *
 * @param model 节点数据模型（需提供 id、properties、setProperties）
 * @param card  卡片容器 DOM 元素（供 showSaveStatus 找到状态 span）
 */
function buildEditForm(model: {
  id: string;
  properties: Record<string, any>;
  setProperties?: (props: Record<string, any>) => void;
}, card: HTMLElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'node-card__edit-form';

  const props = model.properties;

  // ── requirement 字段 ──────────────────────────────────────
  const reqField = document.createElement('div');
  reqField.className = 'node-card__field node-card__field--requirement';

  const reqLabel = document.createElement('label');
  reqLabel.textContent = '需求说明';

  const reqTextarea = document.createElement('textarea');
  reqTextarea.rows = 4;
  reqTextarea.value = props.requirement ?? '';

  // 防抖保存 requirement
  const debouncedSaveReq = debounce(async (val: string) => {
    try {
      await patchNode(model.id, { requirement: val });
      showSaveStatus(card, 'success');
    } catch {
      showSaveStatus(card, 'error');
    }
  }, 500);

  reqTextarea.addEventListener('input', () => {
    debouncedSaveReq(reqTextarea.value);
  });

  reqField.appendChild(reqLabel);
  reqField.appendChild(reqTextarea);
  section.appendChild(reqField);

  // ── prompt 字段 ───────────────────────────────────────────
  const promptField = document.createElement('div');
  promptField.className = 'node-card__field node-card__field--prompt';

  const promptLabel = document.createElement('label');
  promptLabel.textContent = 'AI 提示词';

  const promptTextarea = document.createElement('textarea');
  promptTextarea.rows = 6;
  promptTextarea.value = props.prompt ?? '';

  // 防抖保存 prompt
  const debouncedSavePrompt = debounce(async (val: string) => {
    try {
      await patchNode(model.id, { prompt: val });
      showSaveStatus(card, 'success');
    } catch {
      showSaveStatus(card, 'error');
    }
  }, 500);

  promptTextarea.addEventListener('input', () => {
    debouncedSavePrompt(promptTextarea.value);
  });

  promptField.appendChild(promptLabel);
  promptField.appendChild(promptTextarea);
  section.appendChild(promptField);

  // ── attributes 字段（键值对表格）────────────────────────────
  const attrField = document.createElement('div');
  attrField.className = 'node-card__field node-card__field--attributes';

  const attrLabel = document.createElement('label');
  attrLabel.textContent = '属性';
  attrField.appendChild(attrLabel);

  const table = document.createElement('table');
  table.className = 'node-card__attributes';

  // 表头
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['key', 'value', '操作'].forEach((text) => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // 表体：每行对应一个 attribute
  const tbody = document.createElement('tbody');

  const renderRows = () => {
    tbody.innerHTML = '';
    const attrs: Array<{ key: string; value: string }> = model.properties.attributes ?? [];
    attrs.forEach((attr, idx) => {
      const tr = document.createElement('tr');

      const tdKey = document.createElement('td');
      const inputKey = document.createElement('input');
      inputKey.type = 'text';
      inputKey.value = attr.key;
      inputKey.addEventListener('change', () => {
        const current: Array<{ key: string; value: string }> = [...(model.properties.attributes ?? [])];
        current[idx] = { ...current[idx], key: inputKey.value };
        if (model.setProperties) model.setProperties({ attributes: current });
      });
      tdKey.appendChild(inputKey);
      tr.appendChild(tdKey);

      const tdVal = document.createElement('td');
      const inputVal = document.createElement('input');
      inputVal.type = 'text';
      inputVal.value = attr.value;
      inputVal.addEventListener('change', () => {
        const current: Array<{ key: string; value: string }> = [...(model.properties.attributes ?? [])];
        current[idx] = { ...current[idx], value: inputVal.value };
        if (model.setProperties) model.setProperties({ attributes: current });
      });
      tdVal.appendChild(inputVal);
      tr.appendChild(tdVal);

      const tdOp = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'node-card__delete-attribute';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => {
        const current: Array<{ key: string; value: string }> = [...(model.properties.attributes ?? [])];
        current.splice(idx, 1);
        if (model.setProperties) model.setProperties({ attributes: current });
        renderRows();
      });
      tdOp.appendChild(delBtn);
      tr.appendChild(tdOp);

      tbody.appendChild(tr);
    });
  };

  renderRows();
  table.appendChild(tbody);
  attrField.appendChild(table);

  // + 添加行 按钮
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'node-card__add-attribute';
  addBtn.textContent = '+ 添加行';
  addBtn.addEventListener('click', () => {
    const current: Array<{ key: string; value: string }> = [...(model.properties.attributes ?? [])];
    current.push({ key: '', value: '' });
    if (model.setProperties) model.setProperties({ attributes: current });
    renderRows();
  });
  attrField.appendChild(addBtn);

  section.appendChild(attrField);

  return section;
}

/**
 * CardNodeView：节点卡片视图渲染器。
 *
 * 接口与 LogicFlow HtmlNode 兼容：构造函数接受 { model }，提供 setHtml(rootEl) 和 shouldUpdate()。
 * 作为独立类实现，可在测试中直接实例化，也可通过 logicflow.config.ts 包装类注册到 LogicFlow。
 */
export class CardNodeView {
  protected props: { model: { id: string; properties: Record<string, any>; setProperties?: (p: Record<string, any>) => void } };

  constructor(props: { model: { id: string; properties: Record<string, any>; setProperties?: (p: Record<string, any>) => void } }) {
    this.props = props;
  }

  /**
   * 始终返回 true，确保 setProperties 后卡片内容重绘。
   */
  shouldUpdate(): boolean {
    return true;
  }

  /**
   * 将节点卡片 HTML 渲染到 rootEl 中。
   *
   * @param rootEl 容器元素（SVGForeignObjectElement 或 HTMLElement）
   */
  setHtml(rootEl: Element): void {
    rootEl.innerHTML = '';

    const model = this.props.model;
    const props = model.properties;

    // 卡片根容器
    const card = document.createElement('div');
    card.className = 'node-card';

    // 仅阻止表单交互元素（textarea/input/button）的 mousedown 冒泡，
    // 防止在编辑区内操作时误触 LogicFlow 的拖拽或 node:click。
    // 卡片容器本身不阻断，保证 LogicFlow 能接收 mousedown 启动节点拖拽。
    card.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON'
      ) {
        e.stopPropagation();
      }
    });

    // 顶部 header：显示节点类型
    const header = document.createElement('div');
    header.className = 'node-card__header';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'node-card__type';
    typeLabel.textContent = props.nodeType ?? props.title ?? '节点';
    header.appendChild(typeLabel);
    card.appendChild(header);

    // 折叠态摘要（始终显示）
    const summary = document.createElement('div');
    summary.className = 'node-card__summary';
    const reqText = props.requirement ?? '';
    if (reqText) {
      const truncated = reqText.slice(0, 50);
      summary.textContent = truncated.length < reqText.length ? truncated + '...' : truncated;
    } else {
      summary.textContent = '未填写';
    }
    card.appendChild(summary);

    // Phase 5 颜色逻辑占位
    const statusBorder = document.createElement('div');
    statusBorder.className = 'node-card__status-border';
    card.appendChild(statusBorder);

    // 展开态：追加编辑表单
    if (props.expanded) {
      const form = buildEditForm(model, card);
      card.appendChild(form);
    }

    rootEl.appendChild(card);
  }
}
