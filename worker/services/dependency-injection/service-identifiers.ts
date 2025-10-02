import { createServiceIdentifier } from './service-container';
import { CsrfService } from '@worker/services/csrf/csrf-service';
import { ErrorHandlerService } from '@worker/services/error-handler/error-handler-service';
import { RateLimitService } from '@worker/services/rate-limit/rate-limits';

/**
 * Service identifiers for dependency injection
 */

// Security services
export const CSRF_SERVICE = createServiceIdentifier<CsrfService>('CsrfService');
export const RATE_LIMIT_SERVICE = createServiceIdentifier<RateLimitService>('RateLimitService');

// Error handling
export const ERROR_HANDLER_SERVICE = createServiceIdentifier<ErrorHandlerService>('ErrorHandlerService');

// Logger service identifier
export interface LoggerService {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

export const LOGGER_SERVICE = createServiceIdentifier<LoggerService>('LoggerService');

// Database services
export interface DatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

export const DATABASE_SERVICE = createServiceIdentifier<DatabaseService>('DatabaseService');

// Cache services
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const CACHE_SERVICE = createServiceIdentifier<CacheService>('CacheService');

// External service interfaces
export interface SandboxService {
  createSandbox(config: unknown): Promise<unknown>;
  destroySandbox(id: string): Promise<void>;
  executeCommand(id: string, command: string): Promise<unknown>;
}

export const SANDBOX_SERVICE = createServiceIdentifier<SandboxService>('SandboxService');

export interface GitHubService {
  createRepository(name: string, config: unknown): Promise<unknown>;
  pushCode(repoId: string, files: unknown[]): Promise<unknown>;
  getRepository(id: string): Promise<unknown>;
}

export const GITHUB_SERVICE = createServiceIdentifier<GitHubService>('GitHubService');

// Configuration service
export interface ConfigurationService {
  get<T>(key: string): T | undefined;
  getRequired<T>(key: string): T;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
}

export const CONFIGURATION_SERVICE = createServiceIdentifier<ConfigurationService>('ConfigurationService');