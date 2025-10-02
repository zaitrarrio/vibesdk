import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CsrfService } from './csrf-service';
import { SecurityError, SecurityErrorType } from '@shared/types/errors';

// Mock dependencies
vi.mock('@worker/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@worker/utils/crypto-utils', () => ({
  generateSecureToken: vi.fn(() => 'mock-token-123'),
}));

vi.mock('@worker/utils/auth-utils', () => ({
  parseCookies: vi.fn((cookieHeader: string) => {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });
    return cookies;
  }),
  createSecureCookie: vi.fn(({ name, value, sameSite, maxAge }) => 
    `${name}=${value}; SameSite=${sameSite}; Max-Age=${maxAge}`
  ),
}));

vi.mock('@worker/config/security', () => ({
  getCSRFConfig: vi.fn(() => ({
    tokenTTL: 7200000, // 2 hours
    cookieName: 'csrf-token',
    headerName: 'X-CSRF-Token',
  })),
}));

vi.mock('@worker/observability/sentry', () => ({
  captureSecurityEvent: vi.fn(),
}));

describe('CsrfService', () => {
  let csrfService: CsrfService;

  beforeEach(() => {
    csrfService = new CsrfService();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const service = new CsrfService();
      expect(service).toBeInstanceOf(CsrfService);
    });

    it('should allow custom configuration', () => {
      const customConfig = {
        tokenTTL: 3600000,
        cookieName: 'custom-csrf-token',
        headerName: 'X-Custom-CSRF-Token',
      };
      const service = new CsrfService(customConfig);
      expect(service).toBeInstanceOf(CsrfService);
    });
  });

  describe('generateToken', () => {
    it('should generate a secure token', () => {
      const token = csrfService.generateToken();
      expect(token).toBe('mock-token-123');
    });
  });

  describe('setTokenCookie', () => {
    it('should set CSRF token cookie with timestamp', () => {
      const response = new Response();
      const token = 'test-token';
      
      csrfService.setTokenCookie(response, token);
      
      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain('csrf-token=');
      expect(setCookieHeader).toContain('SameSite=Strict');
    });

    it('should set cookie with custom max age', () => {
      const response = new Response();
      const token = 'test-token';
      const maxAge = 3600;
      
      csrfService.setTokenCookie(response, token, maxAge);
      
      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain(`Max-Age=${maxAge}`);
    });
  });

  describe('getTokenFromCookie', () => {
    it('should extract valid token from cookie', () => {
      const tokenData = {
        token: 'valid-token',
        timestamp: Date.now(),
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
        },
      });

      const token = csrfService.getTokenFromCookie(request);
      expect(token).toBe('valid-token');
    });

    it('should return null for expired token', () => {
      const tokenData = {
        token: 'expired-token',
        timestamp: Date.now() - 8000000, // Older than 2 hours
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
        },
      });

      const token = csrfService.getTokenFromCookie(request);
      expect(token).toBeNull();
    });

    it('should return null for missing cookie', () => {
      const request = new Request('https://example.com');
      const token = csrfService.getTokenFromCookie(request);
      expect(token).toBeNull();
    });

    it('should handle legacy token format', () => {
      const request = new Request('https://example.com', {
        headers: {
          Cookie: 'csrf-token=legacy-token',
        },
      });

      const token = csrfService.getTokenFromCookie(request);
      expect(token).toBe('legacy-token');
    });
  });

  describe('getTokenFromHeader', () => {
    it('should extract token from header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'X-CSRF-Token': 'header-token',
        },
      });

      const token = csrfService.getTokenFromHeader(request);
      expect(token).toBe('header-token');
    });

    it('should return null for missing header', () => {
      const request = new Request('https://example.com');
      const token = csrfService.getTokenFromHeader(request);
      expect(token).toBeNull();
    });
  });

  describe('validateToken', () => {
    it('should validate matching tokens', () => {
      const tokenData = {
        token: 'valid-token',
        timestamp: Date.now(),
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
          'X-CSRF-Token': 'valid-token',
        },
      });

      const isValid = csrfService.validateToken(request);
      expect(isValid).toBe(true);
    });

    it('should reject mismatched tokens', () => {
      const tokenData = {
        token: 'cookie-token',
        timestamp: Date.now(),
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
          'X-CSRF-Token': 'header-token',
        },
      });

      const isValid = csrfService.validateToken(request);
      expect(isValid).toBe(false);
    });

    it('should skip validation for safe methods', () => {
      const request = new Request('https://example.com', {
        method: 'GET',
      });

      const isValid = csrfService.validateToken(request);
      expect(isValid).toBe(true);
    });

    it('should skip validation for WebSocket upgrades', () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          Upgrade: 'websocket',
        },
      });

      const isValid = csrfService.validateToken(request);
      expect(isValid).toBe(true);
    });
  });

  describe('enforce', () => {
    it('should generate token for GET requests', async () => {
      const request = new Request('https://example.com', {
        method: 'GET',
      });
      const response = new Response();

      await csrfService.enforce(request, response);

      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain('csrf-token=');
    });

    it('should validate token for POST requests', async () => {
      const tokenData = {
        token: 'valid-token',
        timestamp: Date.now(),
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
          'X-CSRF-Token': 'valid-token',
        },
      });

      await expect(csrfService.enforce(request)).resolves.not.toThrow();
    });

    it('should throw SecurityError for invalid tokens', async () => {
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'invalid-token',
        },
      });

      await expect(csrfService.enforce(request)).rejects.toThrow(SecurityError);
    });
  });

  describe('getOrGenerateToken', () => {
    it('should return existing token if valid', () => {
      const tokenData = {
        token: 'existing-token',
        timestamp: Date.now(),
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
        },
      });

      const token = csrfService.getOrGenerateToken(request);
      expect(token).toBe('existing-token');
    });

    it('should generate new token if none exists', () => {
      const request = new Request('https://example.com');
      const token = csrfService.getOrGenerateToken(request);
      expect(token).toBe('mock-token-123');
    });

    it('should force generate new token', () => {
      const tokenData = {
        token: 'existing-token',
        timestamp: Date.now(),
      };
      const cookieValue = JSON.stringify(tokenData);
      const request = new Request('https://example.com', {
        headers: {
          Cookie: `csrf-token=${encodeURIComponent(cookieValue)}`,
        },
      });

      const token = csrfService.getOrGenerateToken(request, true);
      expect(token).toBe('mock-token-123');
    });
  });

  describe('rotateToken', () => {
    it('should generate new token and set cookie', () => {
      const response = new Response();
      const newToken = csrfService.rotateToken(response);

      expect(newToken).toBe('mock-token-123');
      
      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain('csrf-token=');
    });
  });

  describe('clearTokenCookie', () => {
    it('should clear CSRF token cookie', () => {
      const response = new Response();
      csrfService.clearTokenCookie(response);

      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain('csrf-token=; Max-Age=0');
    });
  });
});