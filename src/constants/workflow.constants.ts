/**
 * 工作流图谱系统常量定义
 * 
 * 包含系统中使用的各种常量值，如默认配置、文件路径、版本信息等。
 */

/**
 * Schema版本常量
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * 默认工作流配置
 */
export const DEFAULT_WORKFLOW_SETTINGS = {
  autoSave: true,
  autoSaveInterval: 500,
  enableBackup: true,
  maxBackups: 5
} as const;

/**
 * 文件路径常量
 */
export const FILE_PATHS = {
  /** 工作流数据目录 */
  WORKFLOW_DATA_DIR: './',
  /** Schema文件路径 */
  SCHEMA_FILE: './src/schemas/schema.json',
  /** Kiro配置文件路径 */
  KIRO_CONFIG: './.kiro/config.json',
  /** AI读取指南文件路径 */
  AI_GUIDE: './src/workflow/README.md'
} as const;

/**
 * 文件扩展名常量
 */
export const FILE_EXTENSIONS = {
  /** 工作流图文件扩展名 */
  WORKFLOW: '.json',
  /** 临时文件扩展名 */
  TEMP: '.tmp',
  /** 备份文件扩展名 */
  BACKUP: '.bak'
} as const;

/**
 * 节点类型常量
 */
export const NODE_TYPES = {
  START: 'start',
  TASK: 'task',
  DECISION: 'decision',
  PARALLEL: 'parallel',
  END: 'end'
} as const;

/**
 * 节点状态常量
 */
export const NODE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
} as const;

/**
 * 资产角色常量
 */
export const ASSET_ROLES = {
  INPUT: 'input',
  OUTPUT: 'output',
  REFERENCE: 'reference',
  TEMPLATE: 'template'
} as const;

/**
 * 输出类型常量
 */
export const OUTPUT_TYPES = {
  FILE: 'file',
  DATA: 'data',
  ARTIFACT: 'artifact'
} as const;

/**
 * 边类型常量
 */
export const EDGE_TYPES = {
  SEQUENCE: 'sequence',
  CONDITIONAL: 'conditional',
  PARALLEL: 'parallel'
} as const;

/**
 * 错误类型常量
 */
export const ERROR_TYPES = {
  PERMISSION_ERROR: 'PermissionError',
  FILE_IO_ERROR: 'FileIOError',
  VALIDATION_ERROR: 'ValidationError',
  PARSE_ERROR: 'ParseError',
  NETWORK_ERROR: 'NetworkError'
} as const;

/**
 * 完整性问题类型常量
 */
export const INTEGRITY_ISSUE_TYPES = {
  MISSING_REFERENCE: 'missing_reference',
  CIRCULAR_DEPENDENCY: 'circular_dependency',
  ORPHANED_NODE: 'orphaned_node',
  INVALID_EDGE: 'invalid_edge'
} as const;

/**
 * 默认项目配置
 */
export const DEFAULT_PROJECT_CONFIG = {
  version: SCHEMA_VERSION,
  settings: DEFAULT_WORKFLOW_SETTINGS
} as const;

/**
 * 验证规则常量
 */
export const VALIDATION_RULES = {
  /** 项目ID正则表达式 */
  PROJECT_ID_PATTERN: /^[a-zA-Z0-9-_]+$/,
  /** 版本号正则表达式 */
  VERSION_PATTERN: /^\d+\.\d+\.\d+$/,
  /** 节点ID正则表达式 */
  NODE_ID_PATTERN: /^[a-zA-Z0-9-_]+$/,
  /** 最大项目名称长度 */
  MAX_PROJECT_NAME_LENGTH: 100,
  /** 最大节点名称长度 */
  MAX_NODE_NAME_LENGTH: 100,
  /** 最小自动保存间隔 */
  MIN_AUTO_SAVE_INTERVAL: 100,
  /** 最小备份数量 */
  MIN_BACKUP_COUNT: 1
} as const;

/**
 * 性能配置常量
 */
export const PERFORMANCE_CONFIG = {
  /** 大文件阈值（字节） */
  LARGE_FILE_THRESHOLD: 1024 * 1024, // 1MB
  /** 防抖延迟（毫秒） */
  DEBOUNCE_DELAY: 500,
  /** 最大节点数量阈值 */
  MAX_NODES_THRESHOLD: 100,
  /** 渲染超时时间（毫秒） */
  RENDER_TIMEOUT: 2000
} as const;

/**
 * 日志级别常量
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
} as const;