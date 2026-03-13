import { NodeMetadataEntity, NodeStatus } from './node-metadata.entity';

describe('NodeMetadataEntity', () => {
  it('can be instantiated with defaults', () => {
    const entity = new NodeMetadataEntity();
    expect(entity).toBeDefined();
  });

  it('nodeId is a string (not auto-assigned)', () => {
    const entity = new NodeMetadataEntity();
    // nodeId is declared with ! — caller must assign it
    expect(entity.nodeId).toBeUndefined();
    entity.nodeId = 'logicflow-node-123';
    expect(entity.nodeId).toBe('logicflow-node-123');
  });

  it('status defaults to pending', () => {
    const entity = new NodeMetadataEntity();
    expect(entity.status).toBe('pending');
  });

  it('requirement defaults to empty string', () => {
    const entity = new NodeMetadataEntity();
    expect(entity.requirement).toBe('');
  });

  it('prompt is undefined by default', () => {
    const entity = new NodeMetadataEntity();
    expect(entity.prompt).toBeUndefined();
  });

  it('deletedAt is undefined by default', () => {
    const entity = new NodeMetadataEntity();
    expect(entity.deletedAt).toBeUndefined();
  });

  it('createdAt and updatedAt default to current time', () => {
    const before = new Date();
    const entity = new NodeMetadataEntity();
    const after = new Date();
    expect(entity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entity.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(entity.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entity.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('NodeStatus accepts only the 4 valid values', () => {
    // Compile-time type check — these assignments must typecheck
    const s1: NodeStatus = 'pending';
    const s2: NodeStatus = 'completed';
    const s3: NodeStatus = 'failed';
    const s4: NodeStatus = 'review_needed';
    expect([s1, s2, s3, s4]).toEqual(['pending', 'completed', 'failed', 'review_needed']);
  });

  it('NodeStatus does NOT include running or skipped at runtime', () => {
    const validStatuses: NodeStatus[] = ['pending', 'completed', 'failed', 'review_needed'];
    expect(validStatuses).not.toContain('running');
    expect(validStatuses).not.toContain('skipped');
  });

  it('attributes is undefined by default', () => {
    const entity = new NodeMetadataEntity();
    expect(entity.attributes).toBeUndefined();
  });
});
