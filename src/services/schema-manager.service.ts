/**
 * Schema管理服务
 * 
 * 提供JSON Schema的版本管理功能，包括：
 * - Schema版本检查
 * - Schema升级迁移
 * - Schema兼容性验证
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ValidationError } from '../errors/workflow.errors';
import { SCHEMA_VERSION } from '../constants/workflow.constants';
import type { WorkflowGraph } from '../types/workflow.types';

/**
 * Schema版本信息接口
 */
export interface SchemaVersionInfo {
  version: string;
  description: string;
  releaseDate: string;
  breaking: boolean;
}

/**
 * Schema迁移结果接口
 */
export interface SchemaMigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  changes: string[];
  warnings?: string[];
}

/**
 * Schema管理服务类
 */
export class SchemaManagerService {
  private static instance: SchemaManagerService;
  private schemaCache: Map<string, object> = new Map();

  /**
   * 支持的Schema版本列表
   */
  private readonly supportedVersions: SchemaVersionInfo[] = [
    {
      version: '1.0.0',
      description: '初始版本，包含基础工作流图结构',
      releaseDate: '2024-01-15',
      breaking: false
    }
  ];

  /**
   * 获取单例实例
   */
  public static getInstance(): SchemaManagerService {
    if (!SchemaManagerService.instance) {
      SchemaManagerService.instance = new SchemaManagerService();
    }
    return SchemaManagerService.instance;
  }

  /**
   * 私有构造函数，确保单例模式
   */
  private constructor() {}

  /**
   * 获取当前Schema版本
   * 
   * @returns string 当前版本号
   */
  public getCurrentVersion(): string {
    return SCHEMA_VERSION;
  }

  /**
   * 获取支持的所有版本
   * 
   * @returns SchemaVersionInfo[] 版本信息列表
   */
  public getSupportedVersions(): SchemaVersionInfo[] {
    return [...this.supportedVersions];
  }

  /**
   * 检查版本兼容性
   * 
   * @param version 要检查的版本号
   * @returns boolean 是否兼容
   */
  public isVersionSupported(version: string): boolean {
    return this.supportedVersions.some(v => v.version === version);
  }

  /**
   * 比较版本号
   * 
   * @param version1 版本1
   * @param version2 版本2
   * @returns number -1: version1 < version2, 0: 相等, 1: version1 > version2
   */
  public compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }

  /**
   * 检查是否需要升级
   * 
   * @param currentVersion 当前版本
   * @returns boolean 是否需要升级
   */
  public needsUpgrade(currentVersion: string): boolean {
    return this.compareVersions(currentVersion, this.getCurrentVersion()) < 0;
  }

  /**
   * 验证工作流图的Schema版本
   * 
   * @param graph 工作流图数据
   * @returns boolean 版本是否有效
   */
  public validateSchemaVersion(graph: WorkflowGraph): boolean {
    if (!graph.version) {
      return false;
    }

    return this.isVersionSupported(graph.version);
  }

  /**
   * 迁移工作流图到最新版本
   * 
   * @param graph 工作流图数据
   * @returns SchemaMigrationResult 迁移结果
   */
  public migrateToLatest(graph: WorkflowGraph): SchemaMigrationResult {
    const fromVersion = graph.version || '0.0.0';
    const toVersion = this.getCurrentVersion();

    // 如果已经是最新版本，无需迁移
    if (this.compareVersions(fromVersion, toVersion) >= 0) {
      return {
        success: true,
        fromVersion,
        toVersion,
        changes: []
      };
    }

    const changes: string[] = [];
    const warnings: string[] = [];

    try {
      // 执行版本迁移逻辑
      const migratedGraph = this.performMigration(graph, fromVersion, toVersion, changes, warnings);

      return {
        success: true,
        fromVersion,
        toVersion,
        changes,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error: any) {
      return {
        success: false,
        fromVersion,
        toVersion,
        changes,
        warnings: [`迁移失败: ${error.message}`]
      };
    }
  }

  /**
   * 执行具体的迁移逻辑
   * 
   * @param graph 原始工作流图
   * @param fromVersion 源版本
   * @param toVersion 目标版本
   * @param changes 变更记录
   * @param warnings 警告记录
   * @returns WorkflowGraph 迁移后的工作流图
   */
  private performMigration(
    graph: WorkflowGraph,
    fromVersion: string,
    toVersion: string,
    changes: string[],
    warnings: string[]
  ): WorkflowGraph {
    let migratedGraph = { ...graph };

    // 从旧版本迁移到1.0.0
    if (this.compareVersions(fromVersion, '1.0.0') < 0) {
      migratedGraph = this.migrateTo1_0_0(migratedGraph, changes, warnings);
    }

    // 更新版本号和时间戳
    migratedGraph.version = toVersion;
    migratedGraph.updatedAt = new Date().toISOString();
    changes.push(`更新版本号从 ${fromVersion} 到 ${toVersion}`);

    return migratedGraph;
  }

  /**
   * 迁移到版本1.0.0
   * 
   * @param graph 工作流图
   * @param changes 变更记录
   * @param warnings 警告记录
   * @returns WorkflowGraph 迁移后的工作流图
   */
  private migrateTo1_0_0(
    graph: WorkflowGraph,
    changes: string[],
    warnings: string[]
  ): WorkflowGraph {
    const migratedGraph = { ...graph };

    // 确保所有节点都有必需的字段
    migratedGraph.nodes = migratedGraph.nodes.map(node => {
      const migratedNode = { ...node };

      // 确保instructions字段完整
      if (!migratedNode.instructions) {
        migratedNode.instructions = {
          guide: '待补充指南',
          logic: '待补充逻辑',
          criteria: '待补充标准'
        };
        changes.push(`为节点 ${node.nodeId} 添加默认指令字段`);
        warnings.push(`节点 ${node.nodeId} 缺少指令信息，已添加默认值`);
      } else {
        // 检查指令子字段
        if (!migratedNode.instructions.guide) {
          migratedNode.instructions.guide = '待补充指南';
          changes.push(`为节点 ${node.nodeId} 添加默认指南`);
        }
        if (!migratedNode.instructions.logic) {
          migratedNode.instructions.logic = '待补充逻辑';
          changes.push(`为节点 ${node.nodeId} 添加默认逻辑`);
        }
        if (!migratedNode.instructions.criteria) {
          migratedNode.instructions.criteria = '待补充标准';
          changes.push(`为节点 ${node.nodeId} 添加默认标准`);
        }
      }

      // 确保dependencies字段存在
      if (!migratedNode.dependencies) {
        migratedNode.dependencies = [];
        changes.push(`为节点 ${node.nodeId} 添加空依赖数组`);
      }

      // 确保assets字段存在
      if (!migratedNode.assets) {
        migratedNode.assets = [];
        changes.push(`为节点 ${node.nodeId} 添加空资产数组`);
      }

      // 确保outputs字段存在
      if (!migratedNode.outputs) {
        migratedNode.outputs = [];
        changes.push(`为节点 ${node.nodeId} 添加空输出数组`);
      }

      // 确保status字段存在
      if (!migratedNode.status) {
        migratedNode.status = 'pending';
        changes.push(`为节点 ${node.nodeId} 设置默认状态为pending`);
      }

      return migratedNode;
    });

    // 确保edges字段存在
    if (!migratedGraph.edges) {
      migratedGraph.edges = [];
      changes.push('添加空边数组');
    }

    // 确保settings字段存在
    if (!migratedGraph.settings) {
      migratedGraph.settings = {
        autoSave: true,
        autoSaveInterval: 500,
        enableBackup: true,
        maxBackups: 5
      };
      changes.push('添加默认工作流设置');
    }

    return migratedGraph;
  }

  /**
   * 加载指定版本的Schema
   * 
   * @param version 版本号
   * @returns Promise<object> Schema对象
   */
  public async loadSchemaByVersion(version: string): Promise<object> {
    // 检查缓存
    if (this.schemaCache.has(version)) {
      return this.schemaCache.get(version)!;
    }

    try {
      // 尝试加载Schema文件
      const schemaPath = join(__dirname, `../schemas/workflow.schema.json`);
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      // 缓存Schema
      this.schemaCache.set(version, schema);

      return schema;
    } catch (error: any) {
      throw new ValidationError(
        `加载Schema版本 ${version} 失败: ${error.message}`,
        [],
        { version, operation: 'load_schema', originalError: error.message }
      );
    }
  }

  /**
   * 清除Schema缓存
   */
  public clearSchemaCache(): void {
    this.schemaCache.clear();
  }

  /**
   * 获取版本变更日志
   * 
   * @param fromVersion 起始版本
   * @param toVersion 目标版本
   * @returns string[] 变更日志
   */
  public getChangeLog(fromVersion: string, toVersion: string): string[] {
    const changes: string[] = [];

    // 获取版本范围内的所有变更
    const relevantVersions = this.supportedVersions.filter(v => {
      return this.compareVersions(v.version, fromVersion) > 0 &&
             this.compareVersions(v.version, toVersion) <= 0;
    });

    relevantVersions.forEach(version => {
      changes.push(`${version.version}: ${version.description}`);
    });

    return changes;
  }
}