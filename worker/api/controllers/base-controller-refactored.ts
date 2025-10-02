import { Context } from 'hono';
import { StructuredLogger } from '@worker/logger';
import { ErrorHandlerService } from '@worker/services/error-handler/error-handler-service';
import { ApplicationError, ErrorCategory, ErrorSeverity } from '@shared/types/error-types';

export interface ControllerConfig {
  logger: StructuredLogger;
  errorHandler: ErrorHandlerService;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export abstract class BaseControllerRefactored {
  protected readonly logger: StructuredLogger;
  protected readonly errorHandler: ErrorHandlerService;

  constructor(config: ControllerConfig) {
    this.logger = config.logger;
    this.errorHandler = config.errorHandler;
  }

  /**
   * Send success response
   */
  protected success<T>(c: Context, data: T, message?: string, meta?: Record<string, unknown>): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      meta,
    };

    this.logger.debug('Sending success response', { 
      path: c.req.path,
      method: c.req.method,
      data: typeof data === 'object' ? 'object' : typeof data,
    });

    return c.json(response);
  }

  /**
   * Send error response
   */
  protected error(c: Context, error: Error | string, statusCode: number = 500): Response {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    const response: ApiResponse = {
      success: false,
      error: errorMessage,
    };

    this.logger.error('Sending error response', {
      path: c.req.path,
      method: c.req.method,
      error: errorMessage,
      statusCode,
    });

    return c.json(response, statusCode);
  }

  /**
   * Send paginated response
   */
  protected paginated<T>(
    c: Context,
    data: T[],
    pagination: PaginationMeta,
    message?: string
  ): Response {
    const response: PaginatedResponse<T> = {
      success: true,
      data,
      pagination,
      message,
    };

    this.logger.debug('Sending paginated response', {
      path: c.req.path,
      method: c.req.method,
      itemCount: data.length,
      page: pagination.page,
      totalPages: pagination.totalPages,
    });

    return c.json(response);
  }

  /**
   * Handle controller errors
   */
  protected async handleError(c: Context, error: unknown): Promise<Response> {
    if (error instanceof ApplicationError) {
      return this.error(c, error, this.getStatusCodeForError(error));
    }

    if (error instanceof Error) {
      // Log the error
      await this.errorHandler.handleError(error, {
        endpoint: c.req.path,
        method: c.req.method,
        userAgent: c.req.header('User-Agent'),
      });

      return this.error(c, error);
    }

    // Handle unknown errors
    const unknownError = new ApplicationError(
      ErrorCategory.INTERNAL,
      ErrorSeverity.HIGH,
      'An unexpected error occurred',
      'UNKNOWN_ERROR',
      {
        endpoint: c.req.path,
        method: c.req.method,
      }
    );

    await this.errorHandler.handleError(unknownError);
    return this.error(c, unknownError);
  }

  /**
   * Validate request body
   */
  protected validateBody<T>(c: Context, schema?: unknown): T {
    try {
      const body = c.req.json();
      // Add schema validation here if needed
      return body as T;
    } catch (error) {
      throw new ApplicationError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'Invalid request body',
        'INVALID_BODY',
        {
          endpoint: c.req.path,
          method: c.req.method,
        }
      );
    }
  }

  /**
   * Get query parameters
   */
  protected getQueryParams(c: Context): Record<string, string> {
    const url = new URL(c.req.url);
    const params: Record<string, string> = {};
    
    for (const [key, value] of url.searchParams.entries()) {
      params[key] = value;
    }
    
    return params;
  }

  /**
   * Get pagination parameters
   */
  protected getPaginationParams(c: Context): { page: number; limit: number } {
    const params = this.getQueryParams(c);
    const page = Math.max(1, parseInt(params.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit || '10', 10)));
    
    return { page, limit };
  }

  /**
   * Get user ID from context
   */
  protected getUserId(c: Context): string | null {
    // This would be set by authentication middleware
    return c.get('userId') || null;
  }

  /**
   * Require authentication
   */
  protected requireAuth(c: Context): string {
    const userId = this.getUserId(c);
    if (!userId) {
      throw new ApplicationError(
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'Authentication required',
        'AUTH_REQUIRED',
        {
          endpoint: c.req.path,
          method: c.req.method,
        }
      );
    }
    return userId;
  }

  /**
   * Get HTTP status code for error category
   */
  private getStatusCodeForError(error: ApplicationError): number {
    switch (error.category) {
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
        return 403;
      case ErrorCategory.VALIDATION:
        return 400;
      case ErrorCategory.NOT_FOUND:
        return 404;
      case ErrorCategory.RATE_LIMIT:
        return 429;
      case ErrorCategory.CONFIGURATION:
        return 500;
      case ErrorCategory.INTERNAL:
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.NETWORK:
      case ErrorCategory.TIMEOUT:
      default:
        return 500;
    }
  }

  /**
   * Log request
   */
  protected logRequest(c: Context, data?: Record<string, unknown>): void {
    this.logger.debug('API request', {
      path: c.req.path,
      method: c.req.method,
      userAgent: c.req.header('User-Agent'),
      ...data,
    });
  }

  /**
   * Log response
   */
  protected logResponse(c: Context, statusCode: number, data?: Record<string, unknown>): void {
    this.logger.debug('API response', {
      path: c.req.path,
      method: c.req.method,
      statusCode,
      ...data,
    });
  }

  /**
   * Create not found error
   */
  protected notFound(resource: string): ApplicationError {
    return new ApplicationError(
      ErrorCategory.NOT_FOUND,
      ErrorSeverity.MEDIUM,
      `${resource} not found`,
      'NOT_FOUND'
    );
  }

  /**
   * Create validation error
   */
  protected validationError(message: string, details?: Record<string, unknown>): ApplicationError {
    return new ApplicationError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      message,
      'VALIDATION_FAILED',
      {},
      undefined,
      false,
      details
    );
  }

  /**
   * Create authorization error
   */
  protected authorizationError(message: string): ApplicationError {
    return new ApplicationError(
      ErrorCategory.AUTHORIZATION,
      ErrorSeverity.HIGH,
      message,
      'AUTHORIZATION_FAILED'
    );
  }

  /**
   * Create internal error
   */
  protected internalError(message: string, cause?: Error): ApplicationError {
    return new ApplicationError(
      ErrorCategory.INTERNAL,
      ErrorSeverity.HIGH,
      message,
      'INTERNAL_ERROR',
      {},
      cause,
      true
    );
  }
}