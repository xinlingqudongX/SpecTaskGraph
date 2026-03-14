/**
 * Wave 0 RED 测试桩：patchNode + showSaveStatus 行为测试
 * 覆盖 EDITOR-05
 *
 * 目标模块 frontend/src/services/node-api.service.ts 尚未实现（Wave 1 将实现），
 * vi.mock 返回空对象，所有导出均为 undefined，测试将以 RED 状态运行。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Wave 1: 直接使用真实实现（不再 mock），测试转为 GREEN
import { patchNode, showSaveStatus } from '../services/node-api.service';

// ─────────────────────────────────────────────
// EDITOR-05: patchNode — HTTP PATCH 调用
// ─────────────────────────────────────────────
describe('patchNode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends PATCH to /api/v1/node/:id (EDITOR-05)', async () => {
    // patchNode 尚未实现，断言将失败（RED）
    expect(patchNode).toBeDefined();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'node-1', requirement: 'foo' }),
    });

    await (patchNode as any)('node-1', { requirement: 'foo' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/node/node-1');
    expect(options.method).toBe('PATCH');
    expect(options.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ requirement: 'foo' });
  });

  it('returns parsed JSON on success (EDITOR-05)', async () => {
    expect(patchNode).toBeDefined();

    const responseData = { id: 'node-1', requirement: 'foo', status: 'pending' };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseData,
    });

    const result = await (patchNode as any)('node-1', { requirement: 'foo' });
    expect(result).toEqual(responseData);
  });

  it('throws on HTTP error (EDITOR-05)', async () => {
    expect(patchNode).toBeDefined();

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(
      (patchNode as any)('node-1', { requirement: 'foo' })
    ).rejects.toThrow(/500/);
  });
});

// ─────────────────────────────────────────────
// EDITOR-05: showSaveStatus — 保存状态 DOM 反馈
// ─────────────────────────────────────────────
describe('showSaveStatus', () => {
  it('shows 已保存 on success (EDITOR-05)', () => {
    // showSaveStatus 尚未实现，断言将失败（RED）
    expect(showSaveStatus).toBeDefined();

    const el = document.createElement('div');
    (showSaveStatus as any)(el, 'success');

    expect(el.textContent).toContain('已保存');
  });

  it('shows 保存失败 on error (EDITOR-05)', () => {
    expect(showSaveStatus).toBeDefined();

    const el = document.createElement('div');
    (showSaveStatus as any)(el, 'error');

    expect(el.textContent).toContain('保存失败');
  });
});
