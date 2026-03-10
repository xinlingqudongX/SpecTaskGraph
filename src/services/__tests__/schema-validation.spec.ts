/**
 * Schema验证集成测试
 * 
 * 测试现有的示例数据是否符合我们定义的Schema
 */

import { ValidationService } from '../validation.service';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Schema验证集成测试', () => {
  let validationService: ValidationService;

  beforeEach(() => {
    validationService = ValidationService.getInstance();
  });

  describe('示例数据验证', () => {
    it('应该验证example-project.json符合Schema', () => {
      // 读取示例数据文件
      const exampleDataPath = join(__dirname, '../../data/workflow/example-project.json');
      const exampleDataContent = readFileSync(exampleDataPath, 'utf-8');
      const exampleData = JSON.parse(exampleDataContent);

      // 验证数据
      const result = validationService.validateWorkflowGraph(exampleData);
      
      if (!result.valid) {
        console.log('验证错误:', result.errors);
      }

      expect(result.valid).toBe(true);
    });

    it('应该通过示例数据的完整性检查', () => {
      // 读取示例数据文件
      const exampleDataPath = join(__dirname, '../../data/workflow/example-project.json');
      const exampleDataContent = readFileSync(exampleDataPath, 'utf-8');
      const exampleData = JSON.parse(exampleDataContent);

      // 检查完整性
      const result = validationService.checkDataIntegrity(exampleData);
      
      if (!result.valid) {
        console.log('完整性问题:', result.issues);
      }

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('应该通过示例数据的引用完整性检查', () => {
      // 读取示例数据文件
      const exampleDataPath = join(__dirname, '../../data/workflow/example-project.json');
      const exampleDataContent = readFileSync(exampleDataPath, 'utf-8');
      const exampleData = JSON.parse(exampleDataContent);

      // 检查引用完整性
      const result = validationService.checkNodeReferences(exampleData);
      
      if (!result.valid) {
        console.log('引用问题:', {
          missingReferences: result.missingReferences,
          orphanedNodes: result.orphanedNodes
        });
      }

      expect(result.valid).toBe(true);
      expect(result.missingReferences).toHaveLength(0);
      expect(result.orphanedNodes).toHaveLength(0);
    });
  });
});