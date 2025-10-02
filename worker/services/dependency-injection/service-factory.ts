import { serviceContainer } from './service-container';
import {
  CSRF_SERVICE,
  ERROR_HANDLER_SERVICE,
  RATE_LIMIT_SERVICE,
  LOGGER_SERVICE,
  DATABASE_SERVICE,
  CACHE_SERVICE,
  SANDBOX_SERVICE,
  GITHUB_SERVICE,
  CONFIGURATION_SERVICE,
  LoggerService,
  DatabaseService,
  CacheService,
  SandboxService,
  GitHubService,
  ConfigurationService,
} from './service-identifiers';
import { CsrfService } from '@worker/services/csrf/csrf-service';
import { ErrorHandlerService } from '@worker/services/error-handler/error-handler-service';
import { RateLimitService } from '@worker/services/rate-limit/rate-limits';
import { createLogger } from '@worker/logger';

/**
 * Service factory for registering all services with the DI container
 */
export class ServiceFactory {
  /**
   * Register all services with the container
   */
  static registerServices(env: Env): void {
    // Register logger service
    serviceContainer.registerSingleton<LoggerService>(
      LOGGER_SERVICE,
      () => ({
        debug: (message: string, data?: Record<string, unknown>) => {
          const logger = createLogger('ServiceLogger');
          logger.debug(message, data);
        },
        info: (message: string, data?: Record<string, unknown>) => {
          const logger = createLogger('ServiceLogger');
          logger.info(message, data);
        },
        warn: (message: string, data?: Record<string, unknown>) => {
          const logger = createLogger('ServiceLogger');
          logger.warn(message, data);
        },
        error: (message: string, data?: Record<string, unknown>) => {
          const logger = createLogger('ServiceLogger');
          logger.error(message, data);
        },
      })
    );

    // Register configuration service
    serviceContainer.registerSingleton<ConfigurationService>(
      CONFIGURATION_SERVICE,
      () => ({
        get: <T>(key: string): T | undefined => {
          // Access environment variables
          return (env as Record<string, unknown>)[key] as T | undefined;
        },
        getRequired: <T>(key: string): T => {
          const value = (env as Record<string, unknown>)[key] as T | undefined;
          if (value === undefined) {
            throw new Error(`Required configuration key '${key}' not found`);
          }
          return value;
        },
        set: <T>(key: string, value: T): void => {
          // In a real implementation, this might update a configuration store
          (env as Record<string, unknown>)[key] = value;
        },
        has: (key: string): boolean => {
          return key in env;
        },
      })
    );

    // Register CSRF service
    serviceContainer.registerSingleton<CsrfService>(
      CSRF_SERVICE,
      () => new CsrfService()
    );

    // Register error handler service
    serviceContainer.registerSingleton<ErrorHandlerService>(
      ERROR_HANDLER_SERVICE,
      () => new ErrorHandlerService({
        enableLogging: true,
        enableMetrics: true,
        enableSentry: true,
        logLevel: 'error',
      })
    );

    // Register rate limit service
    serviceContainer.registerSingleton<RateLimitService>(
      RATE_LIMIT_SERVICE,
      () => new RateLimitService()
    );

    // Register database service (mock implementation)
    serviceContainer.registerSingleton<DatabaseService>(
      DATABASE_SERVICE,
      () => ({
        connect: async () => {
          console.log('Database connected');
        },
        disconnect: async () => {
          console.log('Database disconnected');
        },
        query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
          console.log('Executing query:', sql, params);
          return [] as T[];
        },
        transaction: async <T>(callback: () => Promise<T>): Promise<T> => {
          console.log('Starting transaction');
          try {
            const result = await callback();
            console.log('Transaction committed');
            return result;
          } catch (error) {
            console.log('Transaction rolled back');
            throw error;
          }
        },
      })
    );

    // Register cache service (mock implementation)
    serviceContainer.registerSingleton<CacheService>(
      CACHE_SERVICE,
      () => ({
        get: async <T>(key: string): Promise<T | null> => {
          console.log('Cache get:', key);
          return null;
        },
        set: async <T>(key: string, value: T, ttl?: number): Promise<void> => {
          console.log('Cache set:', key, value, ttl);
        },
        delete: async (key: string): Promise<void> => {
          console.log('Cache delete:', key);
        },
        clear: async (): Promise<void> => {
          console.log('Cache clear');
        },
      })
    );

    // Register sandbox service (mock implementation)
    serviceContainer.registerSingleton<SandboxService>(
      SANDBOX_SERVICE,
      () => ({
        createSandbox: async (config: unknown) => {
          console.log('Creating sandbox:', config);
          return { id: 'mock-sandbox-id' };
        },
        destroySandbox: async (id: string) => {
          console.log('Destroying sandbox:', id);
        },
        executeCommand: async (id: string, command: string) => {
          console.log('Executing command in sandbox:', id, command);
          return { output: 'Mock output', exitCode: 0 };
        },
      })
    );

    // Register GitHub service (mock implementation)
    serviceContainer.registerSingleton<GitHubService>(
      GITHUB_SERVICE,
      () => ({
        createRepository: async (name: string, config: unknown) => {
          console.log('Creating GitHub repository:', name, config);
          return { id: 'mock-repo-id', url: 'https://github.com/mock/repo' };
        },
        pushCode: async (repoId: string, files: unknown[]) => {
          console.log('Pushing code to repository:', repoId, files.length, 'files');
          return { success: true };
        },
        getRepository: async (id: string) => {
          console.log('Getting repository:', id);
          return { id, name: 'mock-repo' };
        },
      })
    );
  }

  /**
   * Clear all registered services (useful for testing)
   */
  static clearServices(): void {
    serviceContainer.clear();
  }

  /**
   * Get a service from the container
   */
  static getService<T>(identifier: { symbol: symbol }): T {
    return serviceContainer.resolve<T>(identifier as any);
  }
}