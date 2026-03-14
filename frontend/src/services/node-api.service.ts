/**
 * node-api.service — Wave 1 实现
 *
 * 提供 patchNode、showSaveStatus、debounce 三个工具函数，
 * 供 NodeCardRenderer.ts 调用，实现节点字段自动保存到后端 PATCH API。
 */

/**
 * 向后端 PATCH /api/v1/node/:id 发送节点字段更新请求。
 *
 * @param nodeId 节点 ID
 * @param payload 需要更新的字段（requirement、prompt、attributes 之一或多个）
 * @returns 后端返回的 JSON 数据
 * @throws Error（含 HTTP 状态码）—— 当响应状态码非 2xx 时
 */
export async function patchNode(
  nodeId: string,
  payload: {
    requirement?: string;
    prompt?: string;
    attributes?: Array<{ key: string; value: string }>;
  },
): Promise<unknown> {
  const res = await fetch(`/api/v1/node/${nodeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errMessage: string | undefined;
    try {
      const err = await res.json();
      errMessage = (err as any).message;
    } catch {
      // json 不可用，使用默认错误消息
    }
    throw new Error(errMessage ?? `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * 在目标容器元素内显示保存状态提示文字。
 *
 * - 'success'：显示"已保存 ✓"，2 秒后自动清除
 * - 'error'：显示"保存失败"，持续显示直至下次调用
 *
 * @param containerEl 要在其中显示状态的容器元素
 * @param status 保存状态
 */
export function showSaveStatus(
  containerEl: Element,
  status: 'success' | 'error',
): void {
  // 查找或创建状态 span
  let span = containerEl.querySelector<HTMLSpanElement>('.node-card__save-status');
  if (!span) {
    span = document.createElement('span');
    containerEl.appendChild(span);
  }

  if (status === 'success') {
    span.textContent = '已保存 ✓';
    span.className = 'node-card__save-status node-card__save-status--success';
    setTimeout(() => {
      if (span) span.textContent = '';
    }, 2000);
  } else {
    span.textContent = '保存失败';
    span.className = 'node-card__save-status node-card__save-status--error';
  }
}

/**
 * 标准防抖函数实现。
 *
 * @param fn 需要防抖的函数
 * @param ms 防抖延迟毫秒数
 * @returns 防抖包装后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (...args: Parameters<T>) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, ms);
  };
}
