import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as YAML from 'yaml';
import { configSchema } from './config.schema';

export function loadConfig() {
  const env = process.env.NODE_ENV ?? 'development';
  const filePath = resolve(__dirname, `./${env}.yml`);

  let raw: unknown;
  try {
    raw = YAML.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(
      `读取配置文件失败 [${filePath}]: ${(err as Error).message}`,
    );
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`配置文件校验失败 [${env}.yml]:\n${issues}`);
  }

  return result.data;
}
