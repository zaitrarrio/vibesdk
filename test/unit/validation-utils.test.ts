import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePassword,
  validateUrl,
  validateUuid,
  validatePhoneNumber,
  validateDate,
  validateNumber,
  validateString,
  validateObject,
  validateArray,
  validateFields,
} from '@shared/utils/validation-utils';

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('user123@sub.domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@domain')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const result = validatePassword('StrongPass123!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak passwords', () => {
      const result = validatePassword('weak');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.code === 'PASSWORD_TOO_SHORT')).toBe(true);
    });

    it('should validate with custom options', () => {
      const result = validatePassword('simple', {
        minLength: 4,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
      });
      expect(result.isValid).toBe(true);
    });

    it('should check for uppercase requirement', () => {
      const result = validatePassword('lowercase123!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PASSWORD_NO_UPPERCASE')).toBe(true);
    });

    it('should check for lowercase requirement', () => {
      const result = validatePassword('UPPERCASE123!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PASSWORD_NO_LOWERCASE')).toBe(true);
    });

    it('should check for numbers requirement', () => {
      const result = validatePassword('NoNumbers!');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PASSWORD_NO_NUMBERS')).toBe(true);
    });

    it('should check for special characters requirement', () => {
      const result = validatePassword('NoSpecial123');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PASSWORD_NO_SPECIAL_CHARS')).toBe(true);
    });
  });

  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://subdomain.example.com/path')).toBe(true);
      expect(validateUrl('https://example.com:8080/path?query=value')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://invalid')).toBe(false);
      expect(validateUrl('')).toBe(false);
    });
  });

  describe('validateUuid', () => {
    it('should validate correct UUIDs', () => {
      expect(validateUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(validateUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(validateUuid('not-a-uuid')).toBe(false);
      expect(validateUuid('550e8400-e29b-41d4-a716')).toBe(false);
      expect(validateUuid('')).toBe(false);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should validate correct phone numbers', () => {
      expect(validatePhoneNumber('+1234567890')).toBe(true);
      expect(validatePhoneNumber('(123) 456-7890')).toBe(true);
      expect(validatePhoneNumber('123-456-7890')).toBe(true);
      expect(validatePhoneNumber('123 456 7890')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhoneNumber('123')).toBe(false);
      expect(validatePhoneNumber('abc-def-ghij')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
    });
  });

  describe('validateDate', () => {
    it('should validate correct dates', () => {
      expect(validateDate('2023-12-25')).toBe(true);
      expect(validateDate('2023-12-25T10:30:00Z')).toBe(true);
      expect(validateDate(new Date())).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(validateDate('invalid-date')).toBe(false);
      expect(validateDate('2023-13-45')).toBe(false);
      expect(validateDate('')).toBe(false);
    });
  });

  describe('validateNumber', () => {
    it('should validate correct numbers', () => {
      const result = validateNumber(42);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate with range constraints', () => {
      const result = validateNumber(5, { min: 1, max: 10 });
      expect(result.isValid).toBe(true);
    });

    it('should reject numbers outside range', () => {
      const result = validateNumber(15, { min: 1, max: 10 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NUMBER_TOO_LARGE')).toBe(true);
    });

    it('should validate integers', () => {
      const result = validateNumber(5.5, { integer: true });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NOT_INTEGER')).toBe(true);
    });

    it('should reject non-numbers', () => {
      const result = validateNumber('not-a-number');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NUMBER')).toBe(true);
    });
  });

  describe('validateString', () => {
    it('should validate correct strings', () => {
      const result = validateString('hello world');
      expect(result.isValid).toBe(true);
    });

    it('should validate with length constraints', () => {
      const result = validateString('hello', { minLength: 3, maxLength: 10 });
      expect(result.isValid).toBe(true);
    });

    it('should reject strings that are too short', () => {
      const result = validateString('hi', { minLength: 5 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'STRING_TOO_SHORT')).toBe(true);
    });

    it('should reject strings that are too long', () => {
      const result = validateString('very long string', { maxLength: 5 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'STRING_TOO_LONG')).toBe(true);
    });

    it('should validate with pattern', () => {
      const result = validateString('hello123', { pattern: /^[a-z0-9]+$/ });
      expect(result.isValid).toBe(true);
    });

    it('should reject strings that don\'t match pattern', () => {
      const result = validateString('hello-123', { pattern: /^[a-z0-9]+$/ });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PATTERN_MISMATCH')).toBe(true);
    });

    it('should handle required validation', () => {
      const result = validateString('', { required: true });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'REQUIRED')).toBe(true);
    });

    it('should handle optional validation', () => {
      const result = validateString('', { required: false });
      expect(result.isValid).toBe(true);
    });

    it('should reject non-strings', () => {
      const result = validateString(123);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NOT_STRING')).toBe(true);
    });
  });

  describe('validateObject', () => {
    it('should validate objects with schema', () => {
      const schema = {
        name: (val: unknown) => validateString(val, { minLength: 1 }),
        age: (val: unknown) => validateNumber(val, { min: 0 }),
      };

      const result = validateObject({ name: 'John', age: 25 }, schema);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid objects', () => {
      const schema = {
        name: (val: unknown) => validateString(val, { minLength: 1 }),
        age: (val: unknown) => validateNumber(val, { min: 0 }),
      };

      const result = validateObject({ name: '', age: -5 }, schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject non-objects', () => {
      const schema = {
        name: (val: unknown) => validateString(val),
      };

      const result = validateObject('not-an-object', schema);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NOT_OBJECT')).toBe(true);
    });
  });

  describe('validateArray', () => {
    it('should validate arrays', () => {
      const result = validateArray([1, 2, 3]);
      expect(result.isValid).toBe(true);
    });

    it('should validate with length constraints', () => {
      const result = validateArray([1, 2, 3], { minLength: 2, maxLength: 5 });
      expect(result.isValid).toBe(true);
    });

    it('should reject arrays that are too short', () => {
      const result = validateArray([1], { minLength: 2 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'ARRAY_TOO_SHORT')).toBe(true);
    });

    it('should reject arrays that are too long', () => {
      const result = validateArray([1, 2, 3], { maxLength: 2 });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'ARRAY_TOO_LONG')).toBe(true);
    });

    it('should validate with item validator', () => {
      const result = validateArray([1, 2, 3], {
        itemValidator: (item) => validateNumber(item, { min: 0 }),
      });
      expect(result.isValid).toBe(true);
    });

    it('should reject arrays with invalid items', () => {
      const result = validateArray([1, -2, 3], {
        itemValidator: (item) => validateNumber(item, { min: 0 }),
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field.includes('array[1]'))).toBe(true);
    });

    it('should reject non-arrays', () => {
      const result = validateArray('not-an-array');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'NOT_ARRAY')).toBe(true);
    });
  });

  describe('validateFields', () => {
    it('should validate multiple fields', () => {
      const data = {
        name: 'John',
        age: 25,
        email: 'john@example.com',
      };

      const validators = {
        name: (val: unknown) => validateString(val, { minLength: 1 }),
        age: (val: unknown) => validateNumber(val, { min: 0 }),
        email: (val: unknown) => ({ isValid: validateEmail(val as string), errors: [] }),
      };

      const result = validateFields(data, validators);
      expect(result.isValid).toBe(true);
    });

    it('should collect errors from multiple fields', () => {
      const data = {
        name: '',
        age: -5,
        email: 'invalid-email',
      };

      const validators = {
        name: (val: unknown) => validateString(val, { minLength: 1 }),
        age: (val: unknown) => validateNumber(val, { min: 0 }),
        email: (val: unknown) => ({ isValid: validateEmail(val as string), errors: [] }),
      };

      const result = validateFields(data, validators);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});