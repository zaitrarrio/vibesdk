import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorHandler, ErrorFactory } from './error-handling';
import { SecurityError, SecurityErrorType } from '@shared/types/errors';

describe('ErrorHandler', () => {
  describe('requireAuthentication', () => {
    it('should throw authentication error for null user', () => {
      expect(() => {
        ErrorHandler.requireAuthentication(null);
      }).toThrow(SecurityError);
    });

    it('should throw authentication error for undefined user', () => {
      expect(() => {
        ErrorHandler.requireAuthentication(undefined);
      }).toThrow(SecurityError);
    });

    it('should not throw for valid user', () => {
      expect(() => {
        ErrorHandler.requireAuthentication({ id: 'user123' });
      }).not.toThrow();
    });
  });

  describe('requireResourceOwnership', () => {
    it('should throw not found error for null resource', () => {
      expect(() => {
        ErrorHandler.requireResourceOwnership(null, 'user123', 'resource');
      }).toThrow();
    });

    it('should throw not found error for undefined resource', () => {
      expect(() => {
        ErrorHandler.requireResourceOwnership(undefined, 'user123', 'resource');
      }).toThrow();
    });

    it('should throw authorization error for mismatched user ID', () => {
      const resource = { userId: 'user456' };
      expect(() => {
        ErrorHandler.requireResourceOwnership(resource, 'user123', 'resource');
      }).toThrow();
    });

    it('should not throw for matching user ID', () => {
      const resource = { userId: 'user123' };
      expect(() => {
        ErrorHandler.requireResourceOwnership(resource, 'user123', 'resource');
      }).not.toThrow();
    });
  });

  describe('parseJsonBody', () => {
    it('should parse valid JSON body', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await ErrorHandler.parseJsonBody<{ test: string }>(request);
      expect(result).toEqual({ test: 'data' });
    });

    it('should throw validation error for invalid JSON', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      await expect(ErrorHandler.parseJsonBody(request)).rejects.toThrow();
    });
  });

  describe('validateRequiredFields', () => {
    it('should not throw for valid data', () => {
      const data = { name: 'test', email: 'test@example.com' };
      const requiredFields = ['name', 'email'];

      expect(() => {
        ErrorHandler.validateRequiredFields(data, requiredFields);
      }).not.toThrow();
    });

    it('should throw validation error for missing field', () => {
      const data = { name: 'test' };
      const requiredFields = ['name', 'email'];

      expect(() => {
        ErrorHandler.validateRequiredFields(data, requiredFields);
      }).toThrow();
    });

    it('should throw validation error for null field', () => {
      const data = { name: 'test', email: null };
      const requiredFields = ['name', 'email'];

      expect(() => {
        ErrorHandler.validateRequiredFields(data, requiredFields);
      }).toThrow();
    });

    it('should throw validation error for undefined field', () => {
      const data = { name: 'test', email: undefined };
      const requiredFields = ['name', 'email'];

      expect(() => {
        ErrorHandler.validateRequiredFields(data, requiredFields);
      }).toThrow();
    });

    it('should throw validation error for empty string field', () => {
      const data = { name: 'test', email: '' };
      const requiredFields = ['name', 'email'];

      expect(() => {
        ErrorHandler.validateRequiredFields(data, requiredFields);
      }).toThrow();
    });
  });
});

describe('ErrorFactory', () => {
  describe('authenticationError', () => {
    it('should create authentication error', () => {
      const error = ErrorFactory.authenticationError();
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.type).toBe(SecurityErrorType.AUTHENTICATION_REQUIRED);
    });

    it('should create authentication error with custom message', () => {
      const message = 'Custom auth message';
      const error = ErrorFactory.authenticationError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('authorizationError', () => {
    it('should create authorization error', () => {
      const error = ErrorFactory.authorizationError();
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.type).toBe(SecurityErrorType.AUTHORIZATION_FAILED);
    });

    it('should create authorization error with custom message', () => {
      const message = 'Custom authz message';
      const error = ErrorFactory.authorizationError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('validationError', () => {
    it('should create validation error', () => {
      const error = ErrorFactory.validationError();
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.type).toBe(SecurityErrorType.VALIDATION_FAILED);
    });

    it('should create validation error with custom message', () => {
      const message = 'Custom validation message';
      const error = ErrorFactory.validationError(message);
      expect(error.message).toBe(message);
    });

    it('should create validation error with details', () => {
      const message = 'Field is required';
      const details = { field: 'email' };
      const error = ErrorFactory.validationError(message, details);
      expect(error.message).toBe(message);
      expect(error.details).toEqual(details);
    });
  });

  describe('notFoundError', () => {
    it('should create not found error', () => {
      const error = ErrorFactory.notFoundError();
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.type).toBe(SecurityErrorType.NOT_FOUND);
    });

    it('should create not found error with custom message', () => {
      const message = 'Resource not found';
      const error = ErrorFactory.notFoundError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('rateLimitError', () => {
    it('should create rate limit error', () => {
      const error = ErrorFactory.rateLimitError();
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.type).toBe(SecurityErrorType.RATE_LIMIT_EXCEEDED);
    });

    it('should create rate limit error with custom message', () => {
      const message = 'Rate limit exceeded';
      const error = ErrorFactory.rateLimitError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('internalError', () => {
    it('should create internal error', () => {
      const error = ErrorFactory.internalError();
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.type).toBe(SecurityErrorType.INTERNAL_ERROR);
    });

    it('should create internal error with custom message', () => {
      const message = 'Internal server error';
      const error = ErrorFactory.internalError(message);
      expect(error.message).toBe(message);
    });
  });
});