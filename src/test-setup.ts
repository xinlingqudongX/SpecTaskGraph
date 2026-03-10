/**
 * 测试设置文件
 * 
 * 用于验证类型定义和基础功能是否正常工作
 */

import {
  WorkflowGraph,
  TaskNode,
  createEmptyWorkflowGraph,
  createStartNode,
  createEndNode,
  generateProjectId,
  updateTimestamp,
  WorkflowGraphSchema
} from './index';

/**
 * 测试基础类型定义和工具函数
 */
function testBasicFunctionality() {
  console.log('开始测试基础功能...');

  // 测试项目ID生成
  const projectId = generateProjectId('测试项目');
  console.log('生成的项目ID:', projectId);

  // 测试创建空工作流图
  const graph = createEmptyWorkflowGraph(projectId, '测试项目');
  console.log('创建的空工作流图:', {
    projectId: graph.projectId,
    projectName: graph.projectName,
    version: graph.version,
    nodesCount: graph.nodes.length,
    edgesCount: graph.edges.length
  });

  // 测试创建节点
  const startNode = createStartNode('项目开始');
  const endNode = createEndNode('项目结束');
  
  console.log('创建的起始节点:', {
    nodeId: startNode.nodeId,
    type: startNode.type,
    name: startNode.name
  });

  console.log('创建的结束节点:', {
    nodeId: endNode.nodeId,
    type: endNode.type,
    name: endNode.name
  });

  // 测试添加节点到工作流图
  graph.nodes.push(startNode, endNode);
  
  // 测试更新时间戳
  const updatedGraph = updateTimestamp(graph);
  console.log('更新后的时间戳:', updatedGraph.updatedAt);

  // 测试Schema验证
  try {
    const validationResult = WorkflowGraphSchema.safeParse(updatedGraph);
    if (validationResult.success) {
      console.log('✅ Schema验证通过');
    } else {
      console.log('❌ Schema验证失败:', validationResult.error.issues);
    }
  } catch (error) {
    console.log('Schema验证出错:', error);
  }

  console.log('基础功能测试完成！');
  return updatedGraph;
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  testBasicFunctionality();
}

export { testBasicFunctionality };