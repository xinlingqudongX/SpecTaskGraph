/**
 * NodeCardRenderer — Wave 1 实现
 *
 * CardNodeView：节点卡片视图，实现 setHtml(rootEl) 渲染内联编辑区。
 * CardNodeModel：从 NodeCardModel.ts 重新导出，供统一导入。
 *
 * 使用纯 DOM API（无 Vue 3），在 setHtml 回调中直接构建 HTML 结构，
 * 支持 requirement/prompt/attributes 字段编辑，防抖自动保存。
 */

import { CardNodeModel } from './NodeCardModel';
import { patchNode, showSaveStatus, debounce, updateNodeStatus } from '../services/node-api.service';
import { AgentRoleApiService, type AgentRole } from '../services/agent-role-api.service';

export { CardNodeModel };

const editingNodeIds = new Set<string>();

export function resetNodeCardRenderState(): void {
  editingNodeIds.clear();
}

export function shouldNodeCardUpdate(nodeId: string, properties: Record<string, any>): boolean {

  void properties;
  // HtmlNode 在大画布和局部渲染场景下会频繁重新挂载。
  // 这里如果再用签名缓存拦截更新，就可能把首次挂载误判成“无需渲染”，最终出现节点可命中但内容为空。
  // 只在真实编辑态阻止重建，其他情况一律允许渲染，优先保证节点始终可见。
  return !editingNodeIds.has(nodeId);
}

function isFormInteractiveElement(element: HTMLElement | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'TEXTAREA' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'BUTTON' ||
    tag === 'TD' ||
    tag === 'TH' ||
    tag === 'TABLE' ||
    tag === 'THEAD' ||
    tag === 'TBODY'
  );
}

function setNodeEditing(nodeId: string, editing: boolean): void {
  if (editing) {
    editingNodeIds.add(nodeId);
    return;
  }
  editingNodeIds.delete(nodeId);
}

async function loadAgentRoles(): Promise<AgentRole[]> {
  return AgentRoleApiService.getInstance().getCachedRoles();
}


function getNodeStatusMeta(status: unknown): {
  label: string;
  cardClassName: string;
  badgeClassName: string;
} {
  switch (status) {
    case 'in_progress':
      return {
        label: '执行中',
        cardClassName: 'node-card--status-in-progress',
        badgeClassName: 'node-card__status-tag--in-progress',
      };
    case 'completed':
      return {
        label: '已完成',
        cardClassName: 'node-card--status-completed',
        badgeClassName: 'node-card__status-tag--completed',
      };
    case 'failed':
      return {
        label: '失败',
        cardClassName: 'node-card--status-failed',
        badgeClassName: 'node-card__status-tag--failed',
      };
    case 'review_needed':
      return {
        label: '待复核',
        cardClassName: 'node-card--status-review-needed',
        badgeClassName: 'node-card__status-tag--review-needed',
      };
    case 'pending':
    default:
      return {
        label: '待处理',
        cardClassName: 'node-card--status-pending',
        badgeClassName: 'node-card__status-tag--pending',
      };
  }
}

// 可手动切换的状态选项（in_progress 由后端控制，不出现在下拉中）
const SELECTABLE_STATUSES = [
  { value: 'pending', label: '待处理', dotColor: '#409eff' },
  { value: 'completed', label: '已完成', dotColor: '#67c23a' },
  { value: 'failed', label: '失败', dotColor: '#f56c6c' },
  { value: 'review_needed', label: '待复核', dotColor: '#e6a23c' },
] as const;

/**
 * 在状态 tag 下方显示全局单例状态选择 popover。
 * 点击选项后调用 updateNodeStatus 更新后端，并同步模型属性触发画布刷新。
 */
function showStatusDropdown(
  tagEl: HTMLElement,
  model: { id: string; setProperties?: (p: Record<string, any>) => void },
  notifyChange: () => void,
): void {
  // 销毁已有 popover，防止重复叠加
  document.getElementById('lf-status-dropdown')?.remove();

  const ul = document.createElement('ul');
  ul.id = 'lf-status-dropdown';
  ul.className = 'lf-status-dropdown';

  SELECTABLE_STATUSES.forEach(({ value, label, dotColor }) => {
    const li = document.createElement('li');
    li.className = 'lf-status-dropdown__item';

    const dot = document.createElement('span');
    dot.className = 'lf-status-dropdown__dot';
    dot.style.background = dotColor;

    const text = document.createElement('span');
    text.textContent = label;

    li.appendChild(dot);
    li.appendChild(text);

    li.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      ul.remove();
      updateNodeStatus(model.id, value).catch(() => {});
      model.setProperties?.({ status: value });
      notifyChange();
    });

    ul.appendChild(li);
  });

  // 定位到 tag 正下方
  const rect = tagEl.getBoundingClientRect();
  ul.style.top = `${rect.bottom + window.scrollY + 4}px`;
  ul.style.left = `${rect.left + window.scrollX}px`;
  document.body.appendChild(ul);

  // 点击外部关闭
  const onOutside = (e: MouseEvent) => {
    if (!ul.contains(e.target as Node)) {
      ul.remove();
      document.removeEventListener('mousedown', onOutside);
    }
  };
  // 延迟一帧注册，避免当前 click 事件立即触发关闭
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
}

// 将执行者名称稳定哈希到 0-359 的色相值，保证同一名字始终对应同一颜色
function hashToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

// 返回执行者头部的背景渐变，无名时回退主题蓝
function getExecutorHeaderBg(name: string): string {
  if (!name || name === '未登记') {
    return 'linear-gradient(90deg, #3a8ee6 0%, #409eff 100%)';
  }
  const hue = hashToHue(name);
  const h2 = (hue + 18) % 360;
  return `linear-gradient(90deg, hsl(${hue},62%,36%) 0%, hsl(${h2},56%,44%) 100%)`;
}

function isExecutionActive(props: Record<string, any>): boolean {
  return props.status === 'in_progress';
}

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
}, card: HTMLElement, notifyChange: () => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'node-card__edit-form';

  const props = model.properties;

  // ── agent role 字段（置于表单最顶部，便于快速指定）────────────
  const roleField = document.createElement('div');
  roleField.className = 'node-card__field node-card__field--agent-role';

  const roleLabel = document.createElement('label');
  roleLabel.textContent = 'Agent 角色';

  const roleSelect = document.createElement('select');
  roleSelect.className = 'node-card__role-select';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '未指定角色';
  roleSelect.appendChild(emptyOption);

  const currentRoleId =
    typeof props.agentRoleId === 'string' ? props.agentRoleId : '';
  roleSelect.value = currentRoleId;

  void loadAgentRoles()
    .then((roles) => {
      roles.forEach((role) => {
        const option = document.createElement('option');
        option.value = role.id;
        option.textContent = role.name;
        if (role.id === currentRoleId) {
          option.selected = true;
        }
        roleSelect.appendChild(option);
      });
    })
    .catch(() => {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '角色加载失败';
      roleSelect.appendChild(option);
    });

  roleSelect.addEventListener('change', async () => {
    const nextRoleId = roleSelect.value || null;
    try {
      await patchNode(model.id, { agentRoleId: nextRoleId });
      model.setProperties?.({ agentRoleId: nextRoleId });
      showSaveStatus(card, 'success');
      notifyChange();
    } catch {
      showSaveStatus(card, 'error');
    }
  });

  roleField.appendChild(roleLabel);
  roleField.appendChild(roleSelect);
  section.appendChild(roleField);

  // ── requirement 字段 ──────────────────────────────────────
  const reqField = document.createElement('div');
  reqField.className = 'node-card__field node-card__field--requirement';

  const reqLabel = document.createElement('label');
  reqLabel.textContent = '需求说明';

  const reqTextarea = document.createElement('textarea');
  reqTextarea.className = 'node-card__requirement-textarea';
  reqTextarea.rows = 4;
  reqTextarea.value = props.requirement ?? '';
  let isReqComposing = false;

  const debouncedSaveReq = debounce(async (val: string) => {
    try {
      await patchNode(model.id, { requirement: val });
      showSaveStatus(card, 'success');
    } catch {
      showSaveStatus(card, 'error');
    }
  }, 500);

  reqTextarea.addEventListener('compositionstart', () => { isReqComposing = true; });
  reqTextarea.addEventListener('compositionend', () => {
    isReqComposing = false;
    debouncedSaveReq(reqTextarea.value);
  });
  reqTextarea.addEventListener('input', () => {
    if (isReqComposing) return;
    debouncedSaveReq(reqTextarea.value);
  });
  // blur 时将最新内容写入模型，确保 getGraphData 能拿到最新值
  reqTextarea.addEventListener('blur', () => {
    if (model.setProperties) model.setProperties({ requirement: reqTextarea.value });
    notifyChange();
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
  let isPromptComposing = false;

  const debouncedSavePrompt = debounce(async (val: string) => {
    try {
      await patchNode(model.id, { prompt: val });
      showSaveStatus(card, 'success');
    } catch {
      showSaveStatus(card, 'error');
    }
  }, 500);

  promptTextarea.addEventListener('compositionstart', () => { isPromptComposing = true; });
  promptTextarea.addEventListener('compositionend', () => {
    isPromptComposing = false;
    debouncedSavePrompt(promptTextarea.value);
  });
  promptTextarea.addEventListener('input', () => {
    if (isPromptComposing) return;
    debouncedSavePrompt(promptTextarea.value);
  });
  // blur 时将最新内容写入模型
  promptTextarea.addEventListener('blur', () => {
    if (model.setProperties) model.setProperties({ prompt: promptTextarea.value });
    notifyChange();
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

  const tableWrap = document.createElement('div');
  tableWrap.className = 'node-card__attributes-wrap';

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
        current[idx] = { key: inputKey.value, value: current[idx]?.value ?? '' };
        if (model.setProperties) model.setProperties({ attributes: current });
        notifyChange();
      });
      tdKey.appendChild(inputKey);
      tr.appendChild(tdKey);

      const tdVal = document.createElement('td');
      const inputVal = document.createElement('input');
      inputVal.type = 'text';
      inputVal.value = attr.value;
      inputVal.addEventListener('change', () => {
        const current: Array<{ key: string; value: string }> = [...(model.properties.attributes ?? [])];
        current[idx] = { key: current[idx]?.key ?? '', value: inputVal.value };
        if (model.setProperties) model.setProperties({ attributes: current });
        notifyChange();
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
        notifyChange();
        renderRows();
      });
      tdOp.appendChild(delBtn);
      tr.appendChild(tdOp);

      tbody.appendChild(tr);
    });
  };

  renderRows();
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  attrField.appendChild(tableWrap);

  // + 添加行 按钮
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'node-card__add-attribute';
  addBtn.textContent = '+ 添加行';
  addBtn.addEventListener('click', () => {
    const current: Array<{ key: string; value: string }> = [...(model.properties.attributes ?? [])];
    current.push({ key: '', value: '' });
    if (model.setProperties) model.setProperties({ attributes: current });
    notifyChange();
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
   * 仅在节点关键属性发生变化时重绘。
   * 组合输入期间如果每次更新都重建 textarea，Windows/macOS 中文输入法都会直接失焦。
   */
  shouldUpdate(): boolean {
    return shouldNodeCardUpdate(this.props.model.id, this.props.model.properties ?? {});
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
    const isExpanded = true;
    const statusMeta = getNodeStatusMeta(props.status);
    const executionActive = isExecutionActive(props);
    const panelCollapsed = props.executorPanelCollapsed !== false;

    // 派发节点变更事件，通知 WorkflowEditor 广播 canvas-sync（防回声由 WorkflowEditor 侧控制）
    const notifyChange = () => {
      window.dispatchEvent(new CustomEvent('lf:node-changed', { detail: { nodeId: model.id } }));
    };

    // 卡片根容器
    const card = document.createElement('div');
    card.className = 'node-card';
    if (isExpanded) {
      card.classList.add('node-card--expanded');
    }
    card.classList.add(statusMeta.cardClassName);
    card.dataset.nodeId = model.id;

    card.addEventListener('focusin', (e) => {
      if (isFormInteractiveElement(e.target as HTMLElement | null)) {
        setNodeEditing(model.id, true);
      }
    });
    card.addEventListener('focusout', (e) => {
      const nextTarget = (e as FocusEvent).relatedTarget as HTMLElement | null;
      if (nextTarget && card.contains(nextTarget) && isFormInteractiveElement(nextTarget)) {
        return;
      }
      setNodeEditing(model.id, false);
    });

    // 表单交互元素阻断鼠标事件冒泡，避免误触节点点击/拖拽。
    const stopFormEvents = (e: Event) => {
      if (isFormInteractiveElement(e.target as HTMLElement | null)) {
        e.stopPropagation();
      }
    };
    card.addEventListener('mousedown', stopFormEvents);
    card.addEventListener('click', stopFormEvents);

    // 卡片内的滚轮事件全部拦截，阻止冒泡到 LogicFlow 画布触发缩放；
    // 卡片 body 本身设置了 overflow-y: auto，浏览器会处理内容滚动
    card.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });

    const stopDeleteShortcut = (e: KeyboardEvent) => {
      if (!isFormInteractiveElement(e.target as HTMLElement | null)) return;
      // 防止 Delete/Backspace 冒泡到 LogicFlow 误删节点
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation();
        return;
      }
      // 防止 Ctrl/Cmd + 剪贴板/撤销组合键被 LogicFlow 内置快捷键拦截，
      // 导致 textarea/input 无法正常粘贴、复制、剪切、全选、撤销
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'v' || k === 'c' || k === 'x' || k === 'a' || k === 'z') {
          e.stopPropagation();
        }
      }
    };
    card.addEventListener('keydown', stopDeleteShortcut);
    card.addEventListener('keyup', stopDeleteShortcut);

    // 顶部 header：显示节点类型
    const header = document.createElement('div');
    header.className = 'node-card__header';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'node-card__type';
    typeLabel.textContent = props.nodeType ?? props.title ?? '节点';
    header.appendChild(typeLabel);

    const statusTag = document.createElement('span');
    statusTag.className = `node-card__status-tag ${statusMeta.badgeClassName}`;

    if (props.status !== 'in_progress') {
      // 执行中状态由后端控制，其余状态允许手动切换
      statusTag.classList.add('node-card__status-tag--clickable');
      statusTag.innerHTML = `${statusMeta.label}<span class="node-card__status-chevron">▾</span>`;
      statusTag.addEventListener('click', (e) => {
        e.stopPropagation();
        showStatusDropdown(statusTag, model, notifyChange);
      });
    } else {
      statusTag.textContent = statusMeta.label;
    }

    header.appendChild(statusTag);

    card.appendChild(header);

    // header 以下的内容统一放入可滚动 body，避免字段增加时挤压 header
    const body = document.createElement('div');
    body.className = 'node-card__body';

    const statusBorder = document.createElement('div');
    statusBorder.className = 'node-card__status-border';
    body.appendChild(statusBorder);

    // 自定义节点始终展示编辑表单，避免用户在收起态和展开态之间来回切换。
    if (isExpanded) {
      const form = buildEditForm(model, card, notifyChange);
      body.appendChild(form);
    }

    card.appendChild(body);

    if (executionActive) {
      // 执行计划侧边板始终挂载，通过 display 控制显隐，避免依赖 LogicFlow 重渲染
      const planPanel = document.createElement('aside');
      planPanel.className = 'node-card-execution-shell__panel';
      planPanel.style.display = panelCollapsed ? 'none' : 'block';

      const planTitle = document.createElement('div');
      planTitle.className = 'node-card-execution-shell__panel-title';
      planTitle.textContent = '执行计划';
      planPanel.appendChild(planTitle);

      const planContent = document.createElement('div');
      planContent.className = 'node-card-execution-shell__panel-content';
      planContent.textContent = props.executorTodo || '当前未声明执行计划';
      planPanel.appendChild(planContent);

      // 执行者 banner 内嵌于卡片顶部
      const banner = document.createElement('div');
      banner.className = 'node-card__executor-banner';
      banner.style.background = getExecutorHeaderBg(props.executorAgentName || '');
      // banner 整体可点击，直接操作 DOM 切换面板，不依赖 LogicFlow 重渲染
      banner.style.cursor = 'pointer';

      const bannerDot = document.createElement('span');
      bannerDot.className = 'node-card__executor-banner-dot';
      banner.appendChild(bannerDot);

      const bannerName = document.createElement('span');
      bannerName.className = 'node-card__executor-banner-agent';
      bannerName.textContent = `执行者：${props.executorAgentName || '未登记'}`;
      banner.appendChild(bannerName);

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'node-card__executor-banner-toggle';

      let isCollapsed = panelCollapsed;
      const syncToggleState = () => {
        toggleBtn.textContent = isCollapsed ? '▶' : '◀';
        toggleBtn.title = isCollapsed ? '展开执行计划' : '收起执行计划';
        planPanel.style.display = isCollapsed ? 'none' : 'block';
      };
      syncToggleState();

      // banner 整体处理点击，button 的点击通过冒泡触发此处，无需单独绑定
      banner.addEventListener('click', (e) => {
        e.stopPropagation();
        isCollapsed = !isCollapsed;
        syncToggleState();
        if (model.setProperties) {
          model.setProperties({ executorPanelCollapsed: isCollapsed });
        }
        notifyChange();
      });

      banner.appendChild(toggleBtn);

      // 插到卡片最顶部，在 header 之前
      card.insertBefore(banner, card.firstChild);

      // rootEl 末尾挂载侧边板（绝对定位，超出卡片边界）
      rootEl.appendChild(planPanel);
    }

    // rootEl 需要 relative + overflow:visible 才能让侧边板绝对定位超出节点范围
    (rootEl as HTMLElement).style.position = 'relative';
    (rootEl as HTMLElement).style.overflow = 'visible';
    rootEl.appendChild(card);
  }
}
