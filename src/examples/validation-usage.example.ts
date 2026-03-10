/**
 * ValidationService 使用示例
 * 
 * 展示如何使用数据验证服务进行工作流图数据的验证和完整性检查
 */

import { ValidationService, SchemaManagerService } from '../services';
import type { WorkflowGraph } from '../types/workflow.types';

/**
 * 示例：基本数据验证
 */
export async function basicValidationExample() {
  const validationService = ValidationService.getInstance();

  // 示例工作流图数据
  const workflowGraph: WorkflowGraph = {
    projectId: 'example-validation',
    projectName: '验证示例项目',
    version: '1.0.0',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:30:00.000Z',
    nodes: [
      {
        nodeId: 'start-001',
        type: 'start',
        name: '项目开始',
        instructions: {
          guide: '标记项目工作流的开始',
          logic: '初始化项目环境和依赖',
          criteria: '项目环境准备就绪'
        },
        dependencies: [],
        assets: [],
        outputs: [],
        status: 'completed'
      },
      {
        nodeId: 'task-001',
        type: 'task',
        name: '数据验证任务',
        instructions: {
          guide: '实现数据验证功能',
          logic: '使用Zod进行Schema验证',
          criteria: '所有验证测试通过'
        },
        dependencies: ['start-001'],
        assets: [
          {
            assetId: 'asset-001',
            path: './src/services/validation.service.ts',
            role: 'output',
            description: '验证服务实现文件'
          }
        ],
        outputs: [
          {
            outputId: 'output-001',
            name: '验证服务',
            type: 'file',
            path: './src/services/validation.service.ts',
            description: '完整的数据验证服务'
          }
        ],
        status: 'completed'
      }
    ],
    edges: [
      {
        edgeId: 'edge-001',
        source: 'start-001',
        target: 'task-001',
        type: 'sequence',
        label: '开始后执行验证任务'
      }
    ],
    settings: {
      autoSave: true,
      autoSaveInterval: 500,
      enableBackup: true,
      maxBackups: 5
    }
  };

  console.log('=== 基本数据验证示例 ===');

  // 1. 验证工作流图
  const validationResult = validationService.validateWorkflowGraph(workflowGraph);
  console.log('工作流图验证结果:', validationResult.valid ? '通过' : '失败');
  
  if (!validationResult.valid) {
    console.log('验证错误:');
    validationResult.errors?.forEach(error => {
      console.log(`  - ${error.path}: ${error.message}`);
    });
  }

  // 2. 检查数据完整性
  const integrityResult = validationService.checkDataIntegrity(workflowGraph);
  console.log('数据完整性检查:', integrityResult.valid ? '通过' : '失败');
  
  if (!integrityResult.valid) {
    console.log('完整性问题:');
    integrityResult.issues.forEach(issue => {
      console.log(`  - ${issue.type}: ${issue.message}`);
    });
  }

  // 3. 检查引用完整性
  const referenceResult = validationService.checkNodeReferences(workflowGraph);
  console.log('引用完整性检查:', referenceResult.valid ? '通过' : '失败');
  
  if (!referenceResult.valid) {
    console.log('引用问题:');
    console.log('  缺失引用:', referenceResult.missingReferences);
    console.log('  孤立节点:', referenceResult.orphanedNodes);
  }

  return {
    validation: validationResult,
    integrity: integrityResult,
    reference: referenceResult
  };
}

/**
 * 示例：Schema版本管理
 */
export async function schemaManagementExample() {
  const schemaManager = SchemaManagerService.getInstance();

  console.log('\n=== Schema版本管理示例 ===');

  // 1. 获取当前版本信息
  const currentVersion = schemaManager.getCurrentVersion();
  console.log('当前Schema版本:', currentVersion);

  // 2. 获取支持的版本列表
  const supportedVersions = schemaManager.getSupportedVersions();
  console.log('支持的版本:');
  supportedVersions.forEach(version => {
    console.log(`  - ${version.version}: ${version.description} (${version.releaseDate})`);
  });

  // 3. 版本兼容性检查
  console.log('版本兼容性检查:');
  console.log('  1.0.0:', schemaManager.isVersionSupported('1.0.0') ? '支持' : '不支持');
  console.log('  0.9.0:', schemaManager.isVersionSupported('0.9.0') ? '支持' : '不支持');
  console.log('  2.0.0:', schemaManager.isVersionSupported('2.0.0') ? '支持' : '不支持');

  // 4. 版本比较
  console.log('版本比较:');
  console.log('  1.0.0 vs 1.0.1:', schemaManager.compareVersions('1.0.0', '1.0.1'));
  console.log('  1.0.1 vs 1.0.0:', schemaManager.compareVersions('1.0.1', '1.0.0'));
  console.log('  1.0.0 vs 1.0.0:', schemaManager.compareVersions('1.0.0', '1.0.0'));

  // 5. 升级检查
  console.log('升级检查:');
  console.log('  0.9.0 需要升级:', schemaManager.needsUpgrade('0.9.0') ? '是' : '否');
  console.log('  1.0.0 需要升级:', schemaManager.needsUpgrade('1.0.0') ? '是' : '否');

  return {
    currentVersion,
    supportedVersions
  };
}

/**
 * 示例：数据迁移
 */
export async function dataMigrationExample() {
  const schemaManager = SchemaManagerService.getInstance();

  console.log('\n=== 数据迁移示例 ===');

  // 模拟旧版本的工作流图数据
  const oldWorkflowGraph: any = {
    projectId: 'migration-example',
    projectName: '迁移示例项目',
    version: '0.9.0',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:30:00.000Z',
    nodes: [
      {
        nodeId: 'old-node-001',
        type: 'task',
        name: '旧版本节点'
        // 缺少一些必需字段，如instructions、dependencies等
      }
    ],
    edges: []
    // 缺少settings字段
  };

  console.log('原始数据版本:', oldWorkflowGraph.version);

  // 执行迁移
  const migrationResult = schemaManager.migrateToLatest(oldWorkflowGraph);

  console.log('迁移结果:', migrationResult.success ? '成功' : '失败');
  console.log('从版本:', migrationResult.fromVersion);
  console.log('到版本:', migrationResult.toVersion);

  if (migrationResult.changes.length > 0) {
    console.log('迁移变更:');
    migrationResult.changes.forEach(change => {
      console.log(`  - ${change}`);
    });
  }

  if (migrationResult.warnings && migrationResult.warnings.length > 0) {
    console.log('迁移警告:');
    migrationResult.warnings.forEach(warning => {
      console.log(`  - ${warning}`);
    });
  }

  // 获取变更日志
  const changeLog = schemaManager.getChangeLog('0.9.0', '1.0.0');
  if (changeLog.length > 0) {
    console.log('版本变更日志:');
    changeLog.forEach(log => {
      console.log(`  - ${log}`);
    });
  }

  return migrationResult;
}

/**
 * 示例：错误处理
 */
export async function errorHandlingExample() {
  const validationService = ValidationService.getInstance();

  console.log('\n=== 错误处理示例 ===');

  // 1. 无效的工作流图数据
  const invalidGraph = {
    projectId: 'invalid project id!', // 包含无效字符
    projectName: '', // 空名称
    version: '1.0', // 无效版本格式
    createdAt: 'invalid-date', // 无效日期
    updatedAt: '2024-01-15T10:30:00.000Z',
    nodes: [], // 空节点数组
    edges: []
  };

  const result = validationService.validateWorkflowGraph(invalidGraph);
  console.log('无效数据验证结果:', result.valid ? '通过' : '失败');

  if (!result.valid && result.errors) {
    console.log('发现的错误:');
    result.errors.forEach(error => {
      console.log(`  - 字段 "${error.path}": ${error.message}`);
    });
  }

  // 2. 循环依赖检测
  const circularGraph: WorkflowGraph = {
    projectId: 'circular-example',
    projectName: '循环依赖示例',
    version: '1.0.0',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:30:00.000Z',
    nodes: [
      {
        nodeId: 'node-a',
        type: 'task',
        name: '节点A',
        instructions: { guide: 'g', logic: 'l', criteria: 'c' },
        dependencies: ['node-b'], // 依赖节点B
        assets: [],
        outputs: [],
        status: 'pending'
      },
      {
        nodeId: 'node-b',
        type: 'task',
        name: '节点B',
        instructions: { guide: 'g', logic: 'l', criteria: 'c' },
        dependencies: ['node-a'], // 依赖节点A，形成循环
        assets: [],
        outputs: [],
        status: 'pending'
      }
    ],
    edges: []
  };

  const integrityResult = validationService.checkDataIntegrity(circularGraph);
  console.log('循环依赖检测:', integrityResult.valid ? '无问题' : '发现问题');

  if (!integrityResult.valid) {
    console.log('发现的问题:');
    integrityResult.issues.forEach(issue => {
      console.log(`  - ${issue.type}: ${issue.message}`);
    });
  }

  return {
    invalidValidation: result,
    circularDependency: integrityResult
  };
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  try {
    await basicValidationExample();
    await schemaManagementExample();
    await dataMigrationExample();
    await errorHandlingExample();
    
    console.log('\n=== 所有示例执行完成 ===');
  } catch (error) {
    console.error('示例执行失败:', error);
  }
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples();
}