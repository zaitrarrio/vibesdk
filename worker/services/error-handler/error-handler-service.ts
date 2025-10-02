import { ApplicationError, ErrorCategory, ErrorSeverity } from '@shared/types/error-types';
import { createLogger } from '@worker/logger';
import { captureSecurityEvent } from '@worker/observability/sentry';

export interface ErrorHandlerConfig {
  enableLogging: boolean;
  enableMetrics: boolean;
  enableSentry: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ErrorHandlerService {
  private readonly logger = createLogger('ErrorHandlerService');
  private readonly config: ErrorHandlerConfig;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
      enableMetrics: config.enableMetrics ?? true,
      enableSentry: config.enableSentry ?? true,
      logLevel: config.logLevel ?? 'error',
    };
  }

  /**
   * Handle and process an error
   */
  async handleError(error: Error, context?: Record<string, unknown>): Promise<void> {
    try {
      // Log the error
      if (this.config.enableLogging) {
        this.logError(error, context);
      }

      // Send to Sentry if enabled
      if (this.config.enableSentry && this.shouldSendToSentry(error)) {
        await this.sendToSentry(error, context);
      }

      // Record metrics if enabled
      if (this.config.enableMetrics) {
        await this.recordMetrics(error);
      }
    } catch (handlerError) {
      // Fallback logging to prevent infinite loops
      console.error('Error in error handler:', handlerError);
      console.error('Original error:', error);
    }
  }

  /**
   * Create a standardized error response
   */
  createErrorResponse(error: Error, includeDetails: boolean = false): Response {
    if (error instanceof ApplicationError) {
      return this.createApplicationErrorResponse(error, includeDetails);
    }

    // Handle unknown errors
    return this.createUnknownErrorResponse(error, includeDetails);
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(error: Error, attemptCount: number, maxRetries: number = 3): boolean {
    if (attemptCount >= maxRetries) {
      return false;
    }

    if (error instanceof ApplicationError) {
      return error.isRetryable();
    }

    // Default retry logic for unknown errors
    return this.isRetryableError(error);
  }

  /**
   * Get retry delay for an error
   */
  getRetryDelay(error: Error, attemptCount: number): number {
    if (error instanceof ApplicationError) {
      // Check if error has specific retry delay
      const retryAfter = error.details?.retryAfter as number;
      if (retryAfter) {
        return retryAfter;
      }
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attemptCount), 30000);
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: Error, context?: Record<string, unknown>): void {
    const logData = {
      error: error.message,
      stack: error.stack,
      name: error.name,
      ...context,
    };

    if (error instanceof ApplicationError) {
      const appError = error as ApplicationError;
      
      switch (appError.severity) {
        case ErrorSeverity.CRITICAL:
          this.logger.error('Critical error occurred', { ...logData, ...appError.toJSON() });
          break;
        case ErrorSeverity.HIGH:
          this.logger.error('High severity error', { ...logData, ...appError.toJSON() });
          break;
        case ErrorSeverity.MEDIUM:
          this.logger.warn('Medium severity error', { ...logData, ...appError.toJSON() });
          break;
        case ErrorSeverity.LOW:
          this.logger.info('Low severity error', { ...logData, ...appError.toJSON() });
          break;
      }
    } else {
      this.logger.error('Unknown error occurred', logData);
    }
  }

  /**
   * Send error to Sentry
   */
  private async sendToSentry(error: Error, context?: Record<string, unknown>): Promise<void> {
    try {
      if (error instanceof ApplicationError) {
        const appError = error as ApplicationError;
        await captureSecurityEvent('application_error', {
          category: appError.category,
          severity: appError.severity,
          code: appError.code,
          message: appError.message,
          context: appError.context,
          details: appError.details,
          ...context,
        });
      } else {
        await captureSecurityEvent('unknown_error', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          ...context,
        });
      }
    } catch (sentryError) {
      this.logger.warn('Failed to send error to Sentry', { sentryError });
    }
  }

  /**
   * Record error metrics
   */
  private async recordMetrics(error: Error): Promise<void> {
    try {
      // This would integrate with your metrics system
      // For now, just log the metric data
      if (error instanceof ApplicationError) {
        this.logger.debug('Recording error metrics', {
          category: error.category,
          severity: error.severity,
          code: error.code,
          retryable: error.isRetryable(),
        });
      }
    } catch (metricsError) {
      this.logger.warn('Failed to record error metrics', { metricsError });
    }
  }

  /**
   * Create response for ApplicationError
   */
  private createApplicationErrorResponse(error: ApplicationError, includeDetails: boolean): Response {
    const statusCode = this.getStatusCodeForError(error);
    const responseData: Record<string, unknown> = {
      error: {
        code: error.code,
        message: error.message,
        category: error.category,
      },
    };

    if (includeDetails) {
      responseData.details = error.details;
      responseData.context = error.context;
    }

    return new Response(JSON.stringify(responseData), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create response for unknown errors
   */
  private createUnknownErrorResponse(error: Error, includeDetails: boolean): Response {
    const responseData: Record<string, unknown> = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      },
    };

    if (includeDetails) {
      responseData.details = {
        name: error.name,
        message: error.message,
      };
    }

    return new Response(JSON.stringify(responseData), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
   * Check if error should be sent to Sentry
   */
  private shouldSendToSentry(error: Error): boolean {
    if (error instanceof ApplicationError) {
      return error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL;
    }
    return true; // Send unknown errors to Sentry
  }

  /**
   * Check if error is retryable based on error type
   */
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'NetworkError',
      'TimeoutError',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
    ];

    return retryableErrors.some(errorType => 
      error.name.includes(errorType) || error.message.includes(errorType)
    );
  }
}