import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import AgentRoleManager from '../components/AgentRoleManager.vue';

const mocks = vi.hoisted(() => ({
  listRolesMock: vi.fn(),
  createRoleMock: vi.fn(),
  updateRoleMock: vi.fn(),
  deleteRoleMock: vi.fn(),
  messageSuccessMock: vi.fn(),
  messageErrorMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock('../services/agent-role-api.service', () => ({
  AgentRoleApiService: {
    getInstance: () => ({
      listRoles: mocks.listRolesMock,
      createRole: mocks.createRoleMock,
      updateRole: mocks.updateRoleMock,
      deleteRole: mocks.deleteRoleMock,
    }),
  },
}));

vi.mock('../components/MonacoPromptEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoPromptEditor',
    props: {
      modelValue: {
        type: String,
        default: '',
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('textarea', {
        class: 'mock-monaco',
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
      });
    },
  }),
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: mocks.messageSuccessMock,
      error: mocks.messageErrorMock,
    },
    ElMessageBox: {
      confirm: mocks.confirmMock,
    },
  };
});

class ResizeObserverMock {
  observe = vi.fn();

  unobserve = vi.fn();

  disconnect = vi.fn();
}

const roleList = [
  {
    id: 'role-1',
    name: '产品经理',
    description: '负责需求梳理',
    prompt: '你是一名产品经理',
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
  {
    id: 'role-2',
    name: '设计专家',
    description: '负责界面设计',
    prompt: '你是一名设计专家',
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
  },
];

function mountComponent() {
  return mount(AgentRoleManager, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        transition: false,
      },
    },
    attachTo: document.body,
  });
}

function getRoleSummaryButton(wrapper: ReturnType<typeof mountComponent>, index: number) {
  const buttons = wrapper.findAll('.role-summary');
  const button = buttons[index];
  expect(button).toBeDefined();
  return button!;
}

function getDrawerElement<T extends Element>(selector: string): T {
  const element = document.body.querySelector(selector);
  expect(element).toBeTruthy();
  return element as T;
}

function clickDrawerButton(text: string): void {
  const button = Array.from(document.body.querySelectorAll('button')).find((item) => item.textContent?.includes(text));
  expect(button).toBeTruthy();
  (button as HTMLButtonElement).click();
}

describe('AgentRoleManager', () => {
  beforeEach(() => {
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    mocks.listRolesMock.mockResolvedValue(roleList.map((role) => ({ ...role })));
    mocks.createRoleMock.mockResolvedValue(roleList[0]);
    mocks.updateRoleMock.mockImplementation(async (id: string, payload: Record<string, string>) => ({
      ...roleList.find((role) => role.id === id),
      ...payload,
      id,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T01:00:00.000Z',
    }));
    mocks.deleteRoleMock.mockResolvedValue(undefined);
    mocks.confirmMock.mockResolvedValue('confirm');
    mocks.messageSuccessMock.mockReset();
    mocks.messageErrorMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('点击角色后打开抽屉并回填表单', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    await getRoleSummaryButton(wrapper, 0).trigger('click');
    await flushPromises();

    const nameInput = getDrawerElement<HTMLInputElement>('.drawer-layout .el-input__inner');
    const promptInput = getDrawerElement<HTMLTextAreaElement>('.mock-monaco');

    expect(mocks.listRolesMock).toHaveBeenCalledTimes(1);
    expect(nameInput.value).toBe('产品经理');
    expect(promptInput.value).toBe('你是一名产品经理');
    expect(document.body.textContent).toContain('编辑角色');
  });

  it('在抽屉中保存编辑后的角色', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    await getRoleSummaryButton(wrapper, 0).trigger('click');
    await flushPromises();

    const nameInput = getDrawerElement<HTMLInputElement>('.drawer-layout .el-input__inner');
    nameInput.value = '高级产品经理';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));

    const descriptionInput = getDrawerElement<HTMLTextAreaElement>('.drawer-layout .el-textarea__inner');
    descriptionInput.value = '负责产品路线与需求拆解';
    descriptionInput.dispatchEvent(new Event('input', { bubbles: true }));

    const promptInput = getDrawerElement<HTMLTextAreaElement>('.mock-monaco');
    promptInput.value = '你是一名高级产品经理';
    promptInput.dispatchEvent(new Event('input', { bubbles: true }));

    await flushPromises();
    clickDrawerButton('保存修改');
    await flushPromises();

    expect(mocks.updateRoleMock).toHaveBeenCalledWith('role-1', {
      name: '高级产品经理',
      description: '负责产品路线与需求拆解',
      prompt: '你是一名高级产品经理',
    });
    expect(wrapper.text()).toContain('高级产品经理');
    expect(mocks.messageSuccessMock).toHaveBeenCalledWith('保存成功');
  });

  it('在抽屉中删除角色后同步列表', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    await getRoleSummaryButton(wrapper, 1).trigger('click');
    await flushPromises();

    clickDrawerButton('删除角色');
    await flushPromises();

    expect(mocks.confirmMock).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRoleMock).toHaveBeenCalledWith('role-2');
    expect(wrapper.text()).not.toContain('设计专家');
    expect(mocks.messageSuccessMock).toHaveBeenCalledWith('角色已删除');
  });
});
