/**
 * 文件系统服务使用演示
 * 
 * 展示如何使用FileSystemService进行文件操作
 */

import { FileSystemService, PermissionManager } from './index';
import type { WorkflowGraph } from '../types/workflow.types';
import { SCHEMA_VERSION } from '../constants/workflow.constants';

/**
 * 演示基本的文件系统操作
 */
export class FileSystemDemo {
  private fileSystemService: FileSystemService;
  private permissionManager: PermissionManager;

  constructor() {
    this.fileSystemService = FileSystemService.getInstance();
    this.permissionManager = PermissionManager.getInstance();
  }

  /**
   * 演示完整的工作流程
   */
  public async demonstrateWorkflow(): Promise<void> {
    console.log('🚀 开始文件系统服务演示...');

    try {
      // 1. 检查浏览器支持
      if (!PermissionManager.isFileSystemAccessSupported()) {
        throw new Error('浏览器不支持File System Access API');
      }
      console.log('✅ 浏览器支持File System Access API');

      // 2. 请求目录访问权限
      console.log('📁 请求目录访问权限...');
      const directoryHandle = await this.fileSystemService.requestDirectoryAccess();
      console.log(`✅ 获得目录访问权限: ${directoryHandle.name}`);

      // 3. 保存目录句柄
      const projectId = 'demo-project';
      await this.fileSystemService.saveDirectoryHandle(projectId, directoryHandle);
      console.log('✅ 目录句柄已保存到IndexedDB');

      // 4. 设置权限监听
      const unsubscribe = this.permissionManager.onPermissionChange((event) => {
        console.log(`🔐 权限变更: ${event.projectId} ${event.oldState} -> ${event.newState}`);
      });

      // 5. 创建示例工作流图数据
      const workflowGraph: WorkflowGraph = this.createSampleWorkflowGraph(projectId);
      console.log('📋 创建示例工作流图数据');

      // 6. 写入文件
      console.log('💾 写入工作流文件...');
      await this.fileSystemService.writeWorkflowFile(projectId, workflowGraph);
      console.log('✅ 工作流文件写入成功');

      // 7. 读取文件
      console.log('📖 读取工作流文件...');
      const readData = await this.fileSystemService.readWorkflowFile(projectId);
      console.log('✅ 工作流文件读取成功');
      console.log(`📊 数据验证: 节点数量 ${readData.nodes.length}, 边数量 ${readData.edges.length}`);

      // 8. 创建备份
      console.log('🔄 创建备份文件...');
      await this.fileSystemService.createBackup(projectId);
      console.log('✅ 备份文件创建成功');

      // 9. 测试备份恢复
      console.log('🔄 测试备份恢复...');
      const backupData = await this.fileSystemService.restoreFromBackup(projectId);
      console.log('✅ 备份恢复成功');
      console.log(`📊 备份数据验证: 项目名称 ${backupData.projectName}`);

      // 10. 检查权限状态
      const permissionState = await this.permissionManager.getPermissionState(projectId, directoryHandle);
      console.log(`🔐 当前权限状态: ${PermissionManager.getPermissionStateDescription(permissionState)}`);

      // 11. 列出所有目录句柄
      const handles = await this.fileSystemService.listDirectoryHandles();
      console.log(`📂 已保存的目录句柄数量: ${handles.length}`);

      console.log('🎉 文件系统服务演示完成！');

      // 清理监听器
      unsubscribe();

    } catch (error: any) {
      console.error('❌ 演示过程中发生错误:', error);
      throw error;
    }
  }

  /**
   * 演示错误处理
   */
  public async demonstrateErrorHandling(): Promise<void> {
    console.log('🚨 开始错误处理演示...');

    try {
      // 尝试读取不存在的项目
      await this.fileSystemService.readWorkflowFile('non-existent-project');
    } catch (error: any) {
      console.log(`✅ 正确捕获错误: ${error.constructor.name} - ${error.message}`);
    }

    try {
      // 尝试从不存在的备份恢复
      await this.fileSystemService.restoreFromBackup('non-existent-project');
    } catch (error: any) {
      console.log(`✅ 正确捕获错误: ${error.constructor.name} - ${error.message}`);
    }

    console.log('✅ 错误处理演示完成');
  }

  /**
   * 演示性能测试
   */
  public async demonstratePerformance(): Promise<void> {
    console.log('⚡ 开始性能测试演示...');

    const projectId = 'performance-test-project';
    
    try {
      // 创建大型工作流图数据
      const largeWorkflowGraph = this.createLargeWorkflowGraph(projectId, 100);
      console.log(`📊 创建大型工作流图: ${largeWorkflowGraph.nodes.length} 个节点`);

      // 测试写入性能
      const writeStart = performance.now();
      await this.fileSystemService.writeWorkflowFile(projectId, largeWorkflowGraph);
      const writeTime = performance.now() - writeStart;
      console.log(`💾 写入耗时: ${writeTime.toFixed(2)}ms`);

      // 测试读取性能
      const readStart = performance.now();
      const readData = await this.fileSystemService.readWorkflowFile(projectId);
      const readTime = performance.now() - readStart;
      console.log(`📖 读取耗时: ${readTime.toFixed(2)}ms`);

      // 验证数据完整性
      const isDataIntact = readData.nodes.length === largeWorkflowGraph.nodes.length;
      console.log(`🔍 数据完整性: ${isDataIntact ? '✅ 通过' : '❌ 失败'}`);

      console.log('✅ 性能测试演示完成');

    } catch (error: any) {
      console.error('❌ 性能测试过程中发生错误:', error);
    }
  }

  /**
   * 创建示例工作流图数据
   */
  private createSampleWorkflowGraph(projectId: string): WorkflowGraph {
    const now = new Date().toISOString();

    return {
      projectId,
      projectName: '演示项目',
      version: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          nodeId: 'start-node',
          type: 'start',
          name: '开始节点',
          description: '工作流的起始点',
          instructions: {
            guide: '这是工作流的起始节点',
            logic: '初始化工作流执行环境',
            criteria: '成功初始化即可继续'
          },
          dependencies: [],
          assets: [],
          outputs: [
            {
              outputId: 'init-output',
              name: '初始化输出',
              type: 'data',
              description: '初始化完成标志'
            }
          ],
          status: 'completed',
          position: { x: 100, y: 100 }
        },
        {
          nodeId: 'task-node-1',
          type: 'task',
          name: '任务节点1',
          description: '执行第一个任务',
          instructions: {
            guide: '执行数据处理任务',
            logic: '读取输入数据并进行处理',
            criteria: '数据处理完成且格式正确'
          },
          dependencies: ['start-node'],
          assets: [
            {
              assetId: 'input-data',
              path: './data/input.json',
              role: 'input',
              description: '输入数据文件'
            }
          ],
          outputs: [
            {
              outputId: 'processed-data',
              name: '处理后的数据',
              type: 'file',
              path: './data/processed.json',
              description: '处理完成的数据文件'
            }
          ],
          status: 'pending',
          position: { x: 300, y: 100 }
        },
        {
          nodeId: 'end-node',
          type: 'end',
          name: '结束节点',
          description: '工作流的结束点',
          instructions: {
            guide: '完成工作流执行',
            logic: '清理资源并生成报告',
            criteria: '所有任务完成且资源清理完毕'
          },
          dependencies: ['task-node-1'],
          assets: [],
          outputs: [
            {
              outputId: 'final-report',
              name: '最终报告',
              type: 'file',
              path: './reports/final-report.pdf',
              description: '工作流执行报告'
            }
          ],
          status: 'pending',
          position: { x: 500, y: 100 }
        }
      ],
      edges: [
        {
          edgeId: 'edge-1',
          source: 'start-node',
          target: 'task-node-1',
          type: 'sequence',
          label: '开始执行'
        },
        {
          edgeId: 'edge-2',
          source: 'task-node-1',
          target: 'end-node',
          type: 'sequence',
          label: '任务完成'
        }
      ],
      settings: {
        autoSave: true,
        autoSaveInterval: 500,
        enableBackup: true,
        maxBackups: 5
      }
    };
  }

  /**
   * 创建大型工作流图数据（用于性能测试）
   */
  private createLargeWorkflowGraph(projectId: string, nodeCount: number): WorkflowGraph {
    const now = new Date().toISOString();
    const nodes = [];
    const edges = [];

    // 创建起始节点
    nodes.push({
      nodeId: 'start',
      type: 'start' as const,
      name: '起始节点',
      description: '大型工作流的起始点',
      instructions: {
        guide: '开始大型工作流',
        logic: '初始化大量任务',
        criteria: '成功初始化'
      },
      dependencies: [],
      assets: [],
      outputs: [],
      status: 'completed' as const,
      position: { x: 0, y: 0 }
    });

    // 创建任务节点
    for (let i = 1; i <= nodeCount; i++) {
      nodes.push({
        nodeId: `task-${i}`,
        type: 'task' as const,
        name: `任务节点 ${i}`,
        description: `第 ${i} 个任务节点`,
        instructions: {
          guide: `执行第 ${i} 个任务`,
          logic: `处理数据集 ${i}`,
          criteria: `任务 ${i} 完成标准`
        },
        dependencies: i === 1 ? ['start'] : [`task-${i - 1}`],
        assets: [
          {
            assetId: `asset-${i}`,
            path: `./data/input-${i}.json`,
            role: 'input' as const,
            description: `第 ${i} 个输入文件`
          }
        ],
        outputs: [
          {
            outputId: `output-${i}`,
            name: `输出 ${i}`,
            type: 'file' as const,
            path: `./data/output-${i}.json`,
            description: `第 ${i} 个输出文件`
          }
        ],
        status: 'pending' as const,
        position: { x: (i % 10) * 150, y: Math.floor(i / 10) * 100 }
      });

      // 创建边
      if (i === 1) {
        edges.push({
          edgeId: `edge-start-${i}`,
          source: 'start',
          target: `task-${i}`,
          type: 'sequence' as const,
          label: '开始执行'
        });
      } else {
        edges.push({
          edgeId: `edge-${i - 1}-${i}`,
          source: `task-${i - 1}`,
          target: `task-${i}`,
          type: 'sequence' as const,
          label: '继续执行'
        });
      }
    }

    // 创建结束节点
    nodes.push({
      nodeId: 'end',
      type: 'end' as const,
      name: '结束节点',
      description: '大型工作流的结束点',
      instructions: {
        guide: '完成大型工作流',
        logic: '汇总所有结果',
        criteria: '所有任务完成'
      },
      dependencies: [`task-${nodeCount}`],
      assets: [],
      outputs: [],
      status: 'pending' as const,
      position: { x: 500, y: Math.floor(nodeCount / 10) * 100 + 100 }
    });

    edges.push({
      edgeId: `edge-${nodeCount}-end`,
      source: `task-${nodeCount}`,
      target: 'end',
      type: 'sequence' as const,
      label: '完成'
    });

    return {
      projectId,
      projectName: `大型演示项目 (${nodeCount} 个任务)`,
      version: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      nodes,
      edges,
      settings: {
        autoSave: true,
        autoSaveInterval: 500,
        enableBackup: true,
        maxBackups: 5
      }
    };
  }
}

// 如果直接运行此文件，执行演示
if (typeof window !== 'undefined') {
  const demo = new FileSystemDemo();
  
  // 添加到全局对象，方便在浏览器控制台中调用
  (window as any).fileSystemDemo = demo;
  
  console.log('📋 文件系统服务演示已准备就绪');
  console.log('💡 在浏览器控制台中运行以下命令开始演示:');
  console.log('   fileSystemDemo.demonstrateWorkflow()');
  console.log('   fileSystemDemo.demonstrateErrorHandling()');
  console.log('   fileSystemDemo.demonstratePerformance()');
}