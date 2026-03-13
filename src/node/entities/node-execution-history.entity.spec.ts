import { NodeExecutionHistoryEntity } from './node-execution-history.entity';
import { NodeMetadataEntity } from './node-metadata.entity';

describe('NodeExecutionHistoryEntity', () => {
  it('can be instantiated', () => {
    const entity = new NodeExecutionHistoryEntity();
    expect(entity).toBeDefined();
  });

  it('id must be set by caller (no auto-assign)', () => {
    const entity = new NodeExecutionHistoryEntity();
    expect(entity.id).toBeUndefined();
    entity.id = 'some-uuid-1234';
    expect(entity.id).toBe('some-uuid-1234');
  });

  it('node property accepts a NodeMetadataEntity reference', () => {
    const nodeMetadata = new NodeMetadataEntity();
    nodeMetadata.nodeId = 'lf-node-abc';

    const entity = new NodeExecutionHistoryEntity();
    entity.node = nodeMetadata;

    expect(entity.node).toBe(nodeMetadata);
    expect(entity.node.nodeId).toBe('lf-node-abc');
  });

  it('promptSnapshot is nullable / undefined by default', () => {
    const entity = new NodeExecutionHistoryEntity();
    expect(entity.promptSnapshot).toBeUndefined();
  });

  it('requirementSnapshot is nullable / undefined by default', () => {
    const entity = new NodeExecutionHistoryEntity();
    expect(entity.requirementSnapshot).toBeUndefined();
  });

  it('result is nullable / undefined by default', () => {
    const entity = new NodeExecutionHistoryEntity();
    expect(entity.result).toBeUndefined();
  });

  it('executedAt defaults to current time', () => {
    const before = new Date();
    const entity = new NodeExecutionHistoryEntity();
    const after = new Date();
    expect(entity.executedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entity.executedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('createdBy is optional / undefined by default', () => {
    const entity = new NodeExecutionHistoryEntity();
    expect(entity.createdBy).toBeUndefined();
  });

  it('createdAt defaults to current time', () => {
    const before = new Date();
    const entity = new NodeExecutionHistoryEntity();
    const after = new Date();
    expect(entity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entity.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
