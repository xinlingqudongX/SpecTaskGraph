/**
 * FileSystemService 单元测试
 * 
 * 测试文件系统访问服务的核心功能
 */

import { FileSystemService } from '../filesystem.service';
import { PermissionError, FileIOError, ParseError } from '../../errors/workflow.errors';
import type { WorkflowGraph } from '../../types/workflow.types';

// Mock File System Access API
const mockDirectoryHandle = {
  name: 'test-project',
  queryPermission: jest.fn(),
  requestPermission: jest.fn(),
  getDirectoryHandle: jest.fn(),
  getFileHandle: jest.fn(),
  removeEntry: jest.fn()
};

const mockFileHandle = {
  getFile: jest.fn(),
  createWritable: jest.fn()
};

const mockWritable = {
  write: jest.fn(),
  close: jest.fn()
};

const mockFile = {
  text: jest.fn(),
  size: 1024,
  lastModified: Date.now()
};

// Mock IndexedDB
const mockIDBRequest = {
  onsuccess: null as any,
  onerror: null as any,
  result: null as any
};

const mockIDBTransaction = {
  objectStore: jest.fn()
};

const mockIDBObjectStore = {
  put: jest.fn(() => mockIDBRequest),
  get: jest.fn(() => mockIDBRequest),
  delete: jest.fn(() => mockIDBRequest),
  getAll: jest.fn(() => mockIDBRequest)
};

const mockIDBDatabase = {
  transaction: jest.fn(() => mockIDBTransaction),
  objectStoreNames: {
    contains: jest.fn(() => false)
  },
  createObjectStore: jest.fn(() => mockIDBObjectStore)
};

// Mock window.showDirectoryPicker
(global as any).window = {
  showDirectoryPicker: jest.fn(),
  indexedDB: {
    open: jest.fn(() => ({
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: mockIDBDatabase
    }))
  }
};

describe('FileSystemService', () => {
  let fileSystemService: FileSystemService;

  beforeEach(() => {
    jest.clearAllMocks();
    fileSystemService = FileSystemService.getInstance();
    
    // 设置默认的mock返回值
    mockDirectoryHandle.queryPermission.mockResolvedValue('granted');
    mockDirectoryHandle.requestPermission.mockResolvedValue('granted');
    mockDirectoryHandle.getDirectoryHandle.mockResolvedValue(mockDirectoryHandle);
    mockDirectoryHandle.getFileHandle.mockResolvedValue(mockFileHandle);
    mockFileHandle.getFile.mockResolvedValue(mockFile);
    mockFileHandle.createWritable.mockResolvedValue(mockWritable);
    mockWritable.write.mockResolvedValue(undefined);
    mockWritable.close.mockResolvedValue(undefined);
    
    mockIDBTransaction.objectStore.mockReturnValue(mockIDBObjectStore);
  });

  describe('requestDirectoryAccess', () => {
    it('应该成功请求目录访问权限', async () => {
      (window.showDirectoryPicker as jest.Mock).mockResolvedValue(mockDirectoryHandle);

      const result = await fileSystemService.requestDirectoryAccess();

      expect(result).toBe(mockDirectoryHandle);
      expect(window.showDirectoryPicker).toHaveBeenCalledWith({
        mode: 'readwrite',
        startIn: 'documents'
      });
    });

    it('当用户拒绝权限时应该抛出PermissionError', async () => {
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      (window.showDirectoryPicker as jest.Mock).mockRejectedValue(abortError);

      await expect(fileSystemService.requestDirectoryAccess())
        .rejects.toThrow(PermissionError);
    });

    it('当浏览器不支持API时应该抛出错误', async () => {
      delete (window as any).showDirectoryPicker;

      await expect(fileSystemService.requestDirectoryAccess())
        .rejects.toThrow('浏览器不支持File System Access API');
    });
  });

  describe('checkPermission', () => {
    it('应该返回正确的权限状态', async () => {
      mockDirectoryHandle.queryPermission.mockResolvedValue('granted');

      const result = await fileSystemService.checkPermission(mockDirectoryHandle as any);

      expect(result).toBe('granted');
      expect(mockDirectoryHandle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    });

    it('当权限检查失败时应该返回denied', async () => {
      mockDirectoryHandle.queryPermission.mockRejectedValue(new Error('Permission check failed'));

      const result = await fileSystemService.checkPermission(mockDirectoryHandle as any);

      expect(result).toBe('denied');
    });
  });

  describe('requestPermission', () => {
    it('应该成功请求权限', async () => {
      mockDirectoryHandle.requestPermission.mockResolvedValue('granted');

      const result = await fileSystemService.requestPermission(mockDirectoryHandle as any);

      expect(result).toBe('granted');
      expect(mockDirectoryHandle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    });

    it('当权限请求失败时应该返回denied', async () => {
      mockDirectoryHandle.requestPermission.mockRejectedValue(new Error('Permission request failed'));

      const result = await fileSystemService.requestPermission(mockDirectoryHandle as any);

      expect(result).toBe('denied');
    });
  });

  describe('readWorkflowFile', () => {
    const mockWorkflowGraph: WorkflowGraph = {
      projectId: 'test-project',
      projectName: '测试项目',
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      nodes: [],
      edges: []
    };

    beforeEach(() => {
      // Mock loadDirectoryHandle to return a handle
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(mockDirectoryHandle);
      
      mockFile.text.mockResolvedValue(JSON.stringify(mockWorkflowGraph));
    });

    it('应该成功读取工作流文件', async () => {
      const result = await fileSystemService.readWorkflowFile('test-project');

      expect(result).toEqual(mockWorkflowGraph);
      expect(mockDirectoryHandle.getDirectoryHandle).toHaveBeenCalledWith('src', { create: true });
    });

    it('当项目目录句柄不存在时应该抛出FileIOError', async () => {
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(null);

      await expect(fileSystemService.readWorkflowFile('test-project'))
        .rejects.toThrow(FileIOError);
    });

    it('当权限不足时应该抛出PermissionError', async () => {
      mockDirectoryHandle.queryPermission.mockResolvedValue('denied');

      await expect(fileSystemService.readWorkflowFile('test-project'))
        .rejects.toThrow(PermissionError);
    });

    it('当文件不存在时应该抛出FileIOError', async () => {
      const notFoundError = new Error('File not found');
      notFoundError.name = 'NotFoundError';
      mockDirectoryHandle.getFileHandle.mockRejectedValue(notFoundError);

      await expect(fileSystemService.readWorkflowFile('test-project'))
        .rejects.toThrow(FileIOError);
    });

    it('当JSON格式错误时应该抛出ParseError', async () => {
      mockFile.text.mockResolvedValue('invalid json');

      await expect(fileSystemService.readWorkflowFile('test-project'))
        .rejects.toThrow(ParseError);
    });
  });

  describe('writeWorkflowFile', () => {
    const mockWorkflowGraph: WorkflowGraph = {
      projectId: 'test-project',
      projectName: '测试项目',
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      nodes: [],
      edges: []
    };

    beforeEach(() => {
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(mockDirectoryHandle);
    });

    it('应该成功写入工作流文件', async () => {
      await fileSystemService.writeWorkflowFile('test-project', mockWorkflowGraph);

      expect(mockDirectoryHandle.getDirectoryHandle).toHaveBeenCalledWith('src', { create: true });
      expect(mockWritable.write).toHaveBeenCalled();
      expect(mockWritable.close).toHaveBeenCalled();
    });

    it('应该自动更新updatedAt时间戳', async () => {
      const originalUpdatedAt = mockWorkflowGraph.updatedAt;
      
      await fileSystemService.writeWorkflowFile('test-project', mockWorkflowGraph);

      // 验证write被调用时，updatedAt已经更新
      const writeCall = mockWritable.write.mock.calls[0][0];
      const writtenData = JSON.parse(writeCall);
      expect(writtenData.updatedAt).not.toBe(originalUpdatedAt);
      expect(new Date(writtenData.updatedAt)).toBeInstanceOf(Date);
    });

    it('当项目目录句柄不存在时应该抛出FileIOError', async () => {
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(null);

      await expect(fileSystemService.writeWorkflowFile('test-project', mockWorkflowGraph))
        .rejects.toThrow(FileIOError);
    });

    it('当权限不足时应该抛出PermissionError', async () => {
      mockDirectoryHandle.queryPermission.mockResolvedValue('denied');

      await expect(fileSystemService.writeWorkflowFile('test-project', mockWorkflowGraph))
        .rejects.toThrow(PermissionError);
    });

    it('当磁盘空间不足时应该抛出FileIOError', async () => {
      const quotaError = new Error('Quota exceeded');
      quotaError.name = 'QuotaExceededError';
      mockWritable.write.mockRejectedValue(quotaError);

      await expect(fileSystemService.writeWorkflowFile('test-project', mockWorkflowGraph))
        .rejects.toThrow(FileIOError);
    });
  });

  describe('createBackup', () => {
    beforeEach(() => {
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(mockDirectoryHandle);
    });

    it('应该成功创建备份文件', async () => {
      await fileSystemService.createBackup('test-project');

      expect(mockDirectoryHandle.getDirectoryHandle).toHaveBeenCalled();
    });

    it('当项目目录句柄不存在时应该抛出FileIOError', async () => {
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(null);

      await expect(fileSystemService.createBackup('test-project'))
        .rejects.toThrow(FileIOError);
    });
  });

  describe('restoreFromBackup', () => {
    const mockWorkflowGraph: WorkflowGraph = {
      projectId: 'test-project',
      projectName: '测试项目',
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      nodes: [],
      edges: []
    };

    beforeEach(() => {
      jest.spyOn(fileSystemService as any, 'loadDirectoryHandle')
        .mockResolvedValue(mockDirectoryHandle);
      
      mockFile.text.mockResolvedValue(JSON.stringify(mockWorkflowGraph));
    });

    it('应该成功从备份恢复', async () => {
      const result = await fileSystemService.restoreFromBackup('test-project');

      expect(result).toEqual(mockWorkflowGraph);
    });

    it('当备份文件不存在时应该抛出FileIOError', async () => {
      const notFoundError = new Error('Backup not found');
      notFoundError.name = 'NotFoundError';
      mockDirectoryHandle.getFileHandle.mockRejectedValue(notFoundError);

      await expect(fileSystemService.restoreFromBackup('test-project'))
        .rejects.toThrow(FileIOError);
    });

    it('当备份文件JSON格式错误时应该抛出ParseError', async () => {
      mockFile.text.mockResolvedValue('invalid json');

      await expect(fileSystemService.restoreFromBackup('test-project'))
        .rejects.toThrow(ParseError);
    });
  });
});