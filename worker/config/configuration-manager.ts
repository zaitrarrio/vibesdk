import { StructuredLogger } from '@worker/logger';
import { Configuration } from '@shared/types/common-types';

export interface ConfigValue {
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  defaultValue?: unknown;
  validator?: (value: unknown) => boolean;
}

export interface ConfigurationManagerConfig {
  logger: StructuredLogger;
  environment: 'development' | 'staging' | 'production';
  enableValidation: boolean;
  enableCaching: boolean;
  cacheTimeout: number;
}

export class ConfigurationManager {
  private readonly logger: StructuredLogger;
  private readonly config: ConfigurationManagerConfig;
  private readonly schema: Map<string, ConfigValue> = new Map();
  private readonly cache: Map<string, { value: unknown; timestamp: number }> = new Map();
  private readonly env: Env;

  constructor(env: Env, config: ConfigurationManagerConfig) {
    this.env = env;
    this.config = config;
    this.logger = config.logger;
    this.initializeSchema();
  }

  /**
   * Initialize configuration schema
   */
  private initializeSchema(): void {
    // Database configuration
    this.schema.set('DATABASE_URL', {
      value: this.env.DATABASE_URL,
      type: 'string',
      required: true,
      validator: (value) => typeof value === 'string' && value.length > 0,
    });

    this.schema.set('DATABASE_MAX_CONNECTIONS', {
      value: this.env.DATABASE_MAX_CONNECTIONS,
      type: 'number',
      required: false,
      defaultValue: 10,
      validator: (value) => typeof value === 'number' && value > 0,
    });

    // Authentication configuration
    this.schema.set('JWT_SECRET', {
      value: this.env.JWT_SECRET,
      type: 'string',
      required: true,
      validator: (value) => typeof value === 'string' && value.length >= 32,
    });

    this.schema.set('JWT_EXPIRES_IN', {
      value: this.env.JWT_EXPIRES_IN,
      type: 'string',
      required: false,
      defaultValue: '24h',
      validator: (value) => typeof value === 'string' && value.length > 0,
    });

    // API configuration
    this.schema.set('API_BASE_URL', {
      value: this.env.API_BASE_URL,
      type: 'string',
      required: false,
      defaultValue: '/api',
      validator: (value) => typeof value === 'string' && value.startsWith('/'),
    });

    this.schema.set('API_RATE_LIMIT', {
      value: this.env.API_RATE_LIMIT,
      type: 'number',
      required: false,
      defaultValue: 100,
      validator: (value) => typeof value === 'number' && value > 0,
    });

    // Sandbox configuration
    this.schema.set('SANDBOX_URL', {
      value: this.env.SANDBOX_URL,
      type: 'string',
      required: true,
      validator: (value) => typeof value === 'string' && value.length > 0,
    });

    this.schema.set('SANDBOX_TIMEOUT', {
      value: this.env.SANDBOX_TIMEOUT,
      type: 'number',
      required: false,
      defaultValue: 30000,
      validator: (value) => typeof value === 'number' && value > 0,
    });

    // Storage configuration
    this.schema.set('STORAGE_BUCKET', {
      value: this.env.STORAGE_BUCKET,
      type: 'string',
      required: false,
      defaultValue: 'default-bucket',
      validator: (value) => typeof value === 'string' && value.length > 0,
    });

    this.schema.set('STORAGE_REGION', {
      value: this.env.STORAGE_REGION,
      type: 'string',
      required: false,
      defaultValue: 'us-east-1',
      validator: (value) => typeof value === 'string' && value.length > 0,
    });

    // Feature flags
    this.schema.set('ENABLE_ANALYTICS', {
      value: this.env.ENABLE_ANALYTICS,
      type: 'boolean',
      required: false,
      defaultValue: true,
      validator: (value) => typeof value === 'boolean',
    });

    this.schema.set('ENABLE_DEBUG', {
      value: this.env.ENABLE_DEBUG,
      type: 'boolean',
      required: false,
      defaultValue: this.config.environment === 'development',
      validator: (value) => typeof value === 'boolean',
    });

    // Security configuration
    this.schema.set('CORS_ORIGINS', {
      value: this.env.CORS_ORIGINS,
      type: 'array',
      required: false,
      defaultValue: ['http://localhost:3000'],
      validator: (value) => Array.isArray(value) && value.every(item => typeof item === 'string'),
    });

    this.schema.set('CSRF_SECRET', {
      value: this.env.CSRF_SECRET,
      type: 'string',
      required: false,
      defaultValue: this.env.JWT_SECRET,
      validator: (value) => typeof value === 'string' && value.length >= 16,
    });
  }

  /**
   * Get configuration value
   */
  get<T = unknown>(key: string): T | undefined {
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
        return cached.value as T;
      }
    }

    const configValue = this.schema.get(key);
    if (!configValue) {
      this.logger.warn('Configuration key not found', { key });
      return undefined;
    }

    let value = configValue.value;

    // Use default value if not set
    if (value === undefined || value === null) {
      value = configValue.defaultValue;
    }

    // Validate value if validation is enabled
    if (this.config.enableValidation && value !== undefined && configValue.validator) {
      if (!configValue.validator(value)) {
        this.logger.error('Configuration validation failed', { key, value });
        throw new Error(`Invalid configuration value for key: ${key}`);
      }
    }

    // Cache the value
    if (this.config.enableCaching) {
      this.cache.set(key, { value, timestamp: Date.now() });
    }

    return value as T;
  }

  /**
   * Get required configuration value
   */
  getRequired<T = unknown>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined || value === null) {
      const configValue = this.schema.get(key);
      if (configValue?.required) {
        throw new Error(`Required configuration key not found: ${key}`);
      }
    }
    return value as T;
  }

  /**
   * Set configuration value
   */
  set<T = unknown>(key: string, value: T): void {
    const configValue = this.schema.get(key);
    if (!configValue) {
      this.logger.warn('Attempting to set unknown configuration key', { key });
      return;
    }

    // Validate value if validation is enabled
    if (this.config.enableValidation && configValue.validator) {
      if (!configValue.validator(value)) {
        this.logger.error('Configuration validation failed', { key, value });
        throw new Error(`Invalid configuration value for key: ${key}`);
      }
    }

    // Update the schema
    this.schema.set(key, { ...configValue, value });

    // Update cache
    if (this.config.enableCaching) {
      this.cache.set(key, { value, timestamp: Date.now() });
    }

    this.logger.debug('Configuration value updated', { key });
  }

  /**
   * Check if configuration key exists
   */
  has(key: string): boolean {
    return this.schema.has(key);
  }

  /**
   * Get all configuration keys
   */
  getKeys(): string[] {
    return Array.from(this.schema.keys());
  }

  /**
   * Get configuration as object
   */
  getAll(): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    
    for (const [key, configValue] of this.schema.entries()) {
      let value = configValue.value;
      if (value === undefined || value === null) {
        value = configValue.defaultValue;
      }
      config[key] = value;
    }
    
    return config;
  }

  /**
   * Validate all configuration
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [key, configValue] of this.schema.entries()) {
      let value = configValue.value;
      
      if (value === undefined || value === null) {
        if (configValue.required) {
          errors.push(`Required configuration key missing: ${key}`);
        }
        continue;
      }

      if (configValue.validator && !configValue.validator(value)) {
        errors.push(`Invalid configuration value for key: ${key}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Configuration cache cleared');
  }

  /**
   * Get configuration statistics
   */
  getStats(): {
    totalKeys: number;
    requiredKeys: number;
    optionalKeys: number;
    cachedKeys: number;
    validationEnabled: boolean;
  } {
    const totalKeys = this.schema.size;
    let requiredKeys = 0;
    let optionalKeys = 0;

    for (const configValue of this.schema.values()) {
      if (configValue.required) {
        requiredKeys++;
      } else {
        optionalKeys++;
      }
    }

    return {
      totalKeys,
      requiredKeys,
      optionalKeys,
      cachedKeys: this.cache.size,
      validationEnabled: this.config.enableValidation,
    };
  }

  /**
   * Export configuration (excluding sensitive values)
   */
  export(excludeSensitive: boolean = true): Record<string, unknown> {
    const sensitiveKeys = ['JWT_SECRET', 'DATABASE_URL', 'API_KEY', 'SECRET'];
    const config: Record<string, unknown> = {};

    for (const [key, configValue] of this.schema.entries()) {
      if (excludeSensitive && sensitiveKeys.some(sensitive => key.includes(sensitive))) {
        config[key] = '***';
        continue;
      }

      let value = configValue.value;
      if (value === undefined || value === null) {
        value = configValue.defaultValue;
      }
      config[key] = value;
    }

    return config;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const validation = this.validate();
      if (!validation.isValid) {
        this.logger.error('Configuration validation failed', { errors: validation.errors });
        return false;
      }

      // Check critical configurations
      const criticalKeys = ['JWT_SECRET', 'DATABASE_URL'];
      for (const key of criticalKeys) {
        const value = this.get(key);
        if (!value) {
          this.logger.error('Critical configuration missing', { key });
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Configuration health check failed', { error });
      return false;
    }
  }
}