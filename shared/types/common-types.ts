/**
 * Common types used across the application
 */

export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  isEmailVerified: boolean;
  lastLoginAt?: number;
  isActive: boolean;
  preferences?: Record<string, unknown>;
}

export interface App extends BaseEntity {
  name: string;
  description?: string;
  userId: string;
  isPublic: boolean;
  isStarred: boolean;
  isFavorite: boolean;
  previewUrl?: string;
  deploymentUrl?: string;
  status: 'draft' | 'deployed' | 'failed';
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface ModelConfig extends BaseEntity {
  name: string;
  provider: string;
  model: string;
  apiKey?: string;
  isDefault: boolean;
  userId: string;
  settings?: Record<string, unknown>;
}

export interface Session extends BaseEntity {
  userId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  lastActive: number;
  isActive: boolean;
  expiresAt: number;
}

export interface Secret extends BaseEntity {
  name: string;
  provider: string;
  encryptedValue: string;
  userId: string;
  isActive: boolean;
}

export interface Analytics extends BaseEntity {
  userId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  sessionId?: string;
  timestamp: number;
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  content?: string;
  children?: FileNode[];
  lastModified?: number;
}

export interface CodeIssue {
  id: string;
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
  rule?: string;
}

export interface DeploymentConfig {
  name: string;
  environment: 'development' | 'staging' | 'production';
  region: string;
  resources: {
    cpu: string;
    memory: string;
    storage: string;
  };
  env: Record<string, string>;
  secrets: string[];
}

export interface DeploymentResult {
  deploymentId: string;
  status: 'pending' | 'success' | 'failed';
  url?: string;
  logs?: string[];
  createdAt: number;
  completedAt?: number;
  error?: string;
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
  id?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SearchParams {
  query?: string;
  filters?: Record<string, unknown>;
  pagination?: PaginationParams;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface CacheConfig {
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'lfu' | 'fifo';
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface MetricsData {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  details?: Record<string, unknown>;
  dependencies?: HealthCheck[];
}

export interface Configuration {
  environment: 'development' | 'staging' | 'production';
  version: string;
  features: Record<string, boolean>;
  limits: {
    maxFileSize: number;
    maxFilesPerApp: number;
    maxAppsPerUser: number;
    rateLimitPerMinute: number;
  };
  services: {
    database: {
      url: string;
      maxConnections: number;
    };
    cache: {
      url: string;
      ttl: number;
    };
    storage: {
      bucket: string;
      region: string;
    };
  };
}

export interface EventData {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationData {
  id: string;
  userId: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: number;
  readAt?: number;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLog extends BaseEntity {
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: number;
}