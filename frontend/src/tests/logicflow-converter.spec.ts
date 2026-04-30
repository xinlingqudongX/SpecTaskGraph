import { describe, it, expect } from 'vitest';
import { logicFlowConverter } from '../utils/logicflow-converter';
import type { NodeData } from '../types/logicflow.types';

describe('LogicFlowDataConverter — AI field round-trip (DATA-05)', () => {
  const baseNode: NodeData = {
    id: 'text_abc123',
    title: 'Test Node',
    type: 'text',
    status: 'pending',
    x: 100,
    y: 200,
    config: {
      typeKey: 'text',
      textContent: 'hello',
      resourceUrl: '',
      resourceName: '',
      properties: [],
    },
  };

  it('requirement survives round-trip', () => {
    const nodeWithReq: NodeData = {
      ...baseNode,
      config: { ...baseNode.config, requirement: 'req text' },
    };
    const lfData = logicFlowConverter.toLogicFlowData({
      elements: [{ group: 'nodes', data: nodeWithReq, position: { x: 100, y: 200 } }],
    });
    const back = logicFlowConverter.fromLogicFlowData(lfData);
    const roundTripped = back.elements[0].data as NodeData;
    expect(roundTripped.config.requirement).toBe('req text');
  });

  it('prompt survives round-trip', () => {
    const nodeWithPrompt: NodeData = {
      ...baseNode,
      config: { ...baseNode.config, prompt: 'AI prompt here' },
    };
    const lfData = logicFlowConverter.toLogicFlowData({
      elements: [{ group: 'nodes', data: nodeWithPrompt, position: { x: 100, y: 200 } }],
    });
    const back = logicFlowConverter.fromLogicFlowData(lfData);
    const roundTripped = back.elements[0].data as NodeData;
    expect(roundTripped.config.prompt).toBe('AI prompt here');
  });

  it('agentRoleId survives round-trip', () => {
    const nodeWithAgentRole: NodeData = {
      ...baseNode,
      config: {
        ...baseNode.config,
        agentRoleId: '11111111-1111-4111-8111-111111111111',
      },
    };
    const lfData = logicFlowConverter.toLogicFlowData({
      elements: [{ group: 'nodes', data: nodeWithAgentRole, position: { x: 100, y: 200 } }],
    });
    const back = logicFlowConverter.fromLogicFlowData(lfData);
    const roundTripped = back.elements[0].data as NodeData;
    expect(roundTripped.config.agentRoleId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('attributes array survives round-trip without corruption', () => {

    const nodeWithAttrs: NodeData = {
      ...baseNode,
      config: { ...baseNode.config, attributes: [{ key: 'env', value: 'prod' }] },
    };
    const lfData = logicFlowConverter.toLogicFlowData({
      elements: [{ group: 'nodes', data: nodeWithAttrs, position: { x: 100, y: 200 } }],
    });
    const back = logicFlowConverter.fromLogicFlowData(lfData);
    const roundTripped = back.elements[0].data as NodeData;
    expect(Array.isArray(roundTripped.config.attributes)).toBe(true);
    expect(roundTripped.config.attributes).toEqual([{ key: 'env', value: 'prod' }]);
  });

  it('properties array is not corrupted by spread', () => {
    const nodeWithProps: NodeData = {
      ...baseNode,
      type: 'property',
      config: { ...baseNode.config, properties: [{ key: 'k1', value: 'v1' }] },
    };
    const lfData = logicFlowConverter.toLogicFlowData({
      elements: [{ group: 'nodes', data: nodeWithProps, position: { x: 100, y: 200 } }],
    });
    const back = logicFlowConverter.fromLogicFlowData(lfData);
    const roundTripped = back.elements[0].data as NodeData;
    expect(Array.isArray(roundTripped.config.properties)).toBe(true);
    expect(roundTripped.config.properties).toEqual([{ key: 'k1', value: 'v1' }]);
  });

  it('empty requirement defaults gracefully', () => {
    const nodeNoReq: NodeData = { ...baseNode, config: { ...baseNode.config } };
    const lfData = logicFlowConverter.toLogicFlowData({
      elements: [{ group: 'nodes', data: nodeNoReq, position: { x: 100, y: 200 } }],
    });
    const back = logicFlowConverter.fromLogicFlowData(lfData);
    const roundTripped = back.elements[0].data as NodeData;
    // requirement should be '' (empty string) or undefined, NOT the string 'undefined'
    expect(roundTripped.config.requirement).not.toBe('undefined');
    expect(
      roundTripped.config.requirement === '' || roundTripped.config.requirement === undefined,
    ).toBe(true);
  });
});
