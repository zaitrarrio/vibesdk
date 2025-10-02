/**
 * Validation utilities for common data types and formats
 */

export interface ValidationRule<T = unknown> {
  validate: (value: T) => boolean;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }>;
}

/**
 * Email validation
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Password validation
 */
export function validatePassword(password: string, options: {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
} = {}): ValidationResult {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true,
  } = options;

  const errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }> = [];

  if (password.length < minLength) {
    errors.push({
      field: 'password',
      message: `Password must be at least ${minLength} characters long`,
      code: 'PASSWORD_TOO_SHORT',
      value: password.length,
    });
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one uppercase letter',
      code: 'PASSWORD_NO_UPPERCASE',
    });
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one lowercase letter',
      code: 'PASSWORD_NO_LOWERCASE',
    });
  }

  if (requireNumbers && !/\d/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one number',
      code: 'PASSWORD_NO_NUMBERS',
    });
  }

  if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push({
      field: 'password',
      message: 'Password must contain at least one special character',
      code: 'PASSWORD_NO_SPECIAL_CHARS',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * URL validation
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * UUID validation
 */
export function validateUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Phone number validation (basic)
 */
export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

/**
 * Date validation
 */
export function validateDate(date: string | Date): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return !isNaN(dateObj.getTime());
}

/**
 * Number validation with range
 */
export function validateNumber(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): ValidationResult {
  const { min, max, integer = false } = options;
  const errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }> = [];

  const num = Number(value);

  if (isNaN(num)) {
    errors.push({
      field: 'number',
      message: 'Value must be a valid number',
      code: 'INVALID_NUMBER',
      value,
    });
    return { isValid: false, errors };
  }

  if (integer && !Number.isInteger(num)) {
    errors.push({
      field: 'number',
      message: 'Value must be an integer',
      code: 'NOT_INTEGER',
      value,
    });
  }

  if (min !== undefined && num < min) {
    errors.push({
      field: 'number',
      message: `Value must be at least ${min}`,
      code: 'NUMBER_TOO_SMALL',
      value,
    });
  }

  if (max !== undefined && num > max) {
    errors.push({
      field: 'number',
      message: `Value must be at most ${max}`,
      code: 'NUMBER_TOO_LARGE',
      value,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * String validation
 */
export function validateString(
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    required?: boolean;
  } = {}
): ValidationResult {
  const { minLength, maxLength, pattern, required = true } = options;
  const errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }> = [];

  if (required && (value === null || value === undefined || value === '')) {
    errors.push({
      field: 'string',
      message: 'Value is required',
      code: 'REQUIRED',
      value,
    });
    return { isValid: false, errors };
  }

  if (value !== null && value !== undefined && typeof value !== 'string') {
    errors.push({
      field: 'string',
      message: 'Value must be a string',
      code: 'NOT_STRING',
      value,
    });
    return { isValid: false, errors };
  }

  const str = String(value);

  if (minLength !== undefined && str.length < minLength) {
    errors.push({
      field: 'string',
      message: `String must be at least ${minLength} characters long`,
      code: 'STRING_TOO_SHORT',
      value: str.length,
    });
  }

  if (maxLength !== undefined && str.length > maxLength) {
    errors.push({
      field: 'string',
      message: `String must be at most ${maxLength} characters long`,
      code: 'STRING_TOO_LONG',
      value: str.length,
    });
  }

  if (pattern && !pattern.test(str)) {
    errors.push({
      field: 'string',
      message: 'String does not match required pattern',
      code: 'PATTERN_MISMATCH',
      value,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Object validation
 */
export function validateObject(
  value: unknown,
  schema: Record<string, (val: unknown) => ValidationResult>
): ValidationResult {
  const errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }> = [];

  if (typeof value !== 'object' || value === null) {
    errors.push({
      field: 'object',
      message: 'Value must be an object',
      code: 'NOT_OBJECT',
      value,
    });
    return { isValid: false, errors };
  }

  const obj = value as Record<string, unknown>;

  for (const [field, validator] of Object.entries(schema)) {
    const result = validator(obj[field]);
    if (!result.isValid) {
      errors.push(...result.errors.map(error => ({
        ...error,
        field: `${field}.${error.field}`,
      })));
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Array validation
 */
export function validateArray<T>(
  value: unknown,
  options: {
    minLength?: number;
    maxLength?: number;
    itemValidator?: (item: unknown) => ValidationResult;
  } = {}
): ValidationResult {
  const { minLength, maxLength, itemValidator } = options;
  const errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }> = [];

  if (!Array.isArray(value)) {
    errors.push({
      field: 'array',
      message: 'Value must be an array',
      code: 'NOT_ARRAY',
      value,
    });
    return { isValid: false, errors };
  }

  const arr = value as unknown[];

  if (minLength !== undefined && arr.length < minLength) {
    errors.push({
      field: 'array',
      message: `Array must have at least ${minLength} items`,
      code: 'ARRAY_TOO_SHORT',
      value: arr.length,
    });
  }

  if (maxLength !== undefined && arr.length > maxLength) {
    errors.push({
      field: 'array',
      message: `Array must have at most ${maxLength} items`,
      code: 'ARRAY_TOO_LONG',
      value: arr.length,
    });
  }

  if (itemValidator) {
    for (let i = 0; i < arr.length; i++) {
      const result = itemValidator(arr[i]);
      if (!result.isValid) {
        errors.push(...result.errors.map(error => ({
          ...error,
          field: `array[${i}].${error.field}`,
        })));
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate multiple fields at once
 */
export function validateFields(
  data: Record<string, unknown>,
  validators: Record<string, (value: unknown) => ValidationResult>
): ValidationResult {
  const errors: Array<{
    field: string;
    message: string;
    code: string;
    value?: unknown;
  }> = [];

  for (const [field, validator] of Object.entries(validators)) {
    const result = validator(data[field]);
    if (!result.isValid) {
      errors.push(...result.errors.map(error => ({
        ...error,
        field: error.field === field ? field : `${field}.${error.field}`,
      })));
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}