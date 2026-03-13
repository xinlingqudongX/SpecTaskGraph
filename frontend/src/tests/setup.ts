/**
 * 测试环境设置文件
 * 为测试环境提供必要的全局对象和模拟
 */

import { vi } from 'vitest';

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          clear: vi.fn(),
        })),
      })),
    },
  })),
  deleteDatabase: vi.fn(),
};

// Mock crypto.randomUUID
const mockCrypto = {
  randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substring(2, 9)),
};

// Mock FileSystemDirectoryHandle and related APIs
const mockFileSystemHandle = {
  kind: 'directory',
  name: 'mock-directory',
  getFileHandle: vi.fn(),
  getDirectoryHandle: vi.fn(),
  removeEntry: vi.fn(),
  resolve: vi.fn(),
  isSameEntry: vi.fn(),
  keys: vi.fn(),
  values: vi.fn(),
  entries: vi.fn(),
};

// Mock window.showDirectoryPicker
const mockShowDirectoryPicker = vi.fn(() => Promise.resolve(mockFileSystemHandle));

// 设置全局对象
Object.defineProperty(globalThis, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

Object.defineProperty(globalThis, 'crypto', {
  value: mockCrypto,
  writable: true,
});

Object.defineProperty(globalThis, 'showDirectoryPicker', {
  value: mockShowDirectoryPicker,
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// Mock console methods to reduce noise in tests
console.log = vi.fn();
console.warn = vi.fn();
console.error = vi.fn();

// 导出mock对象供测试使用
export {
  mockIndexedDB,
  mockCrypto,
  mockFileSystemHandle,
  mockShowDirectoryPicker,
  localStorageMock,
  sessionStorageMock,
};