/**
 * Jest 测试环境设置文件
 * 
 * 用于配置测试环境，包括：
 * - 模拟浏览器 API
 * - 设置全局变量
 * - 配置测试工具
 */

// 模拟浏览器环境
(global as any).window = {
  setInterval: global.setInterval.bind(global),
  clearInterval: global.clearInterval.bind(global),
  setTimeout: global.setTimeout.bind(global),
  clearTimeout: global.clearTimeout.bind(global),
  showDirectoryPicker: jest.fn(),
  FileSystemDirectoryHandle: class MockFileSystemDirectoryHandle {
    name: string;
    kind = 'directory' as const;

    constructor(name: string = 'mock-directory') {
      this.name = name;
    }

    async queryPermission(): Promise<PermissionState> {
      return 'granted';
    }

    async requestPermission(): Promise<PermissionState> {
      return 'granted';
    }

    async getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
      return new MockFileSystemDirectoryHandle() as any;
    }

    async getFileHandle(): Promise<FileSystemFileHandle> {
      return {} as FileSystemFileHandle;
    }

    async removeEntry(): Promise<void> {
      return;
    }

    async resolve(): Promise<string[] | null> {
      return null;
    }

    async isSameEntry(): Promise<boolean> {
      return false;
    }

    // 添加缺失的方法
    async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
      // 空的异步迭代器
    }

    async *keys(): AsyncIterableIterator<string> {
      // 空的异步迭代器
    }

    async *values(): AsyncIterableIterator<FileSystemHandle> {
      // 空的异步迭代器
    }

    [Symbol.asyncIterator]() {
      return {
        async next() {
          return { done: true, value: undefined };
        }
      };
    }
  }
};

class MockFileSystemDirectoryHandle {
  name: string;
  kind = 'directory' as const;

  constructor(name: string = 'mock-directory') {
    this.name = name;
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    return new MockFileSystemDirectoryHandle() as any;
  }

  async getFileHandle(): Promise<FileSystemFileHandle> {
    return {} as FileSystemFileHandle;
  }

  async removeEntry(): Promise<void> {
    return;
  }

  async resolve(): Promise<string[] | null> {
    return null;
  }

  async isSameEntry(): Promise<boolean> {
    return false;
  }

  // 添加缺失的方法
  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    // 空的异步迭代器
  }

  async *keys(): AsyncIterableIterator<string> {
    // 空的异步迭代器
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    // 空的异步迭代器
  }

  [Symbol.asyncIterator]() {
    return {
      async next() {
        return { done: true, value: undefined };
      }
    };
  }
}

(global as any).FileSystemDirectoryHandle = MockFileSystemDirectoryHandle;

// 模拟 IndexedDB
const mockIndexedDB = {
  open: jest.fn().mockImplementation(() => {
    const request: any = {
      result: {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            put: jest.fn().mockImplementation(() => ({
              onsuccess: null,
              onerror: null
            })),
            get: jest.fn().mockImplementation(() => ({
              result: null,
              onsuccess: null,
              onerror: null
            })),
            delete: jest.fn().mockImplementation(() => ({
              onsuccess: null,
              onerror: null
            })),
            getAll: jest.fn().mockImplementation(() => ({
              result: [],
              onsuccess: null,
              onerror: null
            })),
            createIndex: jest.fn()
          })
        }),
        objectStoreNames: {
          contains: jest.fn().mockReturnValue(false)
        },
        createObjectStore: jest.fn().mockReturnValue({
          createIndex: jest.fn()
        })
      },
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any
    };
    
    // 模拟异步成功
    setTimeout(() => {
      if (request.onsuccess && typeof request.onsuccess === 'function') {
        request.onsuccess({ target: request });
      }
    }, 0);
    
    return request;
  })
};

(global as any).indexedDB = mockIndexedDB;

// 设置控制台输出级别
console.warn = jest.fn();
console.error = jest.fn();

// 全局测试超时
jest.setTimeout(10000);