/**
 * Comprehensive error type definitions for the application
 */

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  RATE_LIMIT = 'rate_limit',
  INTERNAL = 'internal',
  EXTERNAL_SERVICE = 'external_service',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  CONFIGURATION = 'configuration',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  timestamp: number;
  userAgent?: string;
  ipAddress?: string;
  endpoint?: string;
  method?: string;
  additionalData?: Record<string, unknown>;
}

export interface BaseError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  code: string;
  context: ErrorContext;
  cause?: Error;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class ApplicationError extends Error implements BaseError {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly context: ErrorContext;
  public readonly cause?: Error;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string,
    code: string,
    context: Partial<ErrorContext> = {},
    cause?: Error,
    retryable: boolean = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApplicationError';
    
    this.category = category;
    this.severity = severity;
    this.code = code;
    this.context = {
      timestamp: Date.now(),
      ...context,
    };
    this.cause = cause;
    this.retryable = retryable;
    this.details = details;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      code: this.code,
      context: this.context,
      cause: this.cause?.message,
      retryable: this.retryable,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Check if error is critical
   */
  isCritical(): boolean {
    return this.severity === ErrorSeverity.CRITICAL;
  }
}

// Specific error types
export class AuthenticationError extends ApplicationError {
  constructor(message: string, context: Partial<ErrorContext> = {}, cause?: Error) {
    super(
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.HIGH,
      message,
      'AUTH_REQUIRED',
      context,
      cause,
      false
    );
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message: string, context: Partial<ErrorContext> = {}, cause?: Error) {
    super(
      ErrorCategory.AUTHORIZATION,
      ErrorSeverity.HIGH,
      message,
      'AUTHZ_FAILED',
      context,
      cause,
      false
    );
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends ApplicationError {
  constructor(
    message: string,
    context: Partial<ErrorContext> = {},
    details?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      message,
      'VALIDATION_FAILED',
      context,
      cause,
      false,
      details
    );
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string, context: Partial<ErrorContext> = {}, cause?: Error) {
    super(
      ErrorCategory.NOT_FOUND,
      ErrorSeverity.MEDIUM,
      `${resource} not found`,
      'NOT_FOUND',
      context,
      cause,
      false
    );
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends ApplicationError {
  constructor(
    message: string,
    context: Partial<ErrorContext> = {},
    retryAfter?: number,
    cause?: Error
  ) {
    super(
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      message,
      'RATE_LIMIT_EXCEEDED',
      context,
      cause,
      true,
      retryAfter ? { retryAfter } : undefined
    );
    this.name = 'RateLimitError';
  }
}

export class InternalError extends ApplicationError {
  constructor(message: string, context: Partial<ErrorContext> = {}, cause?: Error) {
    super(
      ErrorCategory.INTERNAL,
      ErrorSeverity.HIGH,
      message,
      'INTERNAL_ERROR',
      context,
      cause,
      true
    );
    this.name = 'InternalError';
  }
}

export class ExternalServiceError extends ApplicationError {
  constructor(
    service: string,
    message: string,
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super(
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorSeverity.MEDIUM,
      `${service}: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      context,
      cause,
      true,
      { service }
    );
    this.name = 'ExternalServiceError';
  }
}

export class NetworkError extends ApplicationError {
  constructor(message: string, context: Partial<ErrorContext> = {}, cause?: Error) {
    super(
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      message,
      'NETWORK_ERROR',
      context,
      cause,
      true
    );
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ApplicationError {
  constructor(
    operation: string,
    timeoutMs: number,
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super(
      ErrorCategory.TIMEOUT,
      ErrorSeverity.MEDIUM,
      `${operation} timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      context,
      cause,
      true,
      { operation, timeoutMs }
    );
    this.name = 'TimeoutError';
  }
}

export class ConfigurationError extends ApplicationError {
  constructor(message: string, context: Partial<ErrorContext> = {}, cause?: Error) {
    super(
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.CRITICAL,
      message,
      'CONFIGURATION_ERROR',
      context,
      cause,
      false
    );
    this.name = 'ConfigurationError';
  }
}