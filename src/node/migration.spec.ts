import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('Migration: node tables', () => {
  it('migration file contains node_metadata table DDL', () => {
    const migrationsDir = join(__dirname, '../migrations');
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const latest = files.sort().pop()!;
    const content = readFileSync(join(migrationsDir, latest), 'utf-8');
    expect(content).toContain('node_metadata');
    expect(content).toContain('node_execution_history');
  });

  it('migration contains required columns for node_metadata', () => {
    const migrationsDir = join(__dirname, '../migrations');
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.ts'));
    const latest = files.sort().pop()!;
    const content = readFileSync(join(migrationsDir, latest), 'utf-8');
    expect(content).toContain('node_id');
    expect(content).toContain('project_id');
    expect(content).toContain('requirement');
    expect(content).toContain('status');
    expect(content).toContain('deleted_at');
  });
});
