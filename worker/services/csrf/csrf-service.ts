/**
 * CSRF Protection Service
 * Implements double-submit cookie pattern for CSRF protection
 */

import { createLogger } from '@worker/logger';
import { SecurityError, SecurityErrorType } from '@shared/types/errors';
import { generateSecureToken } from '@worker/utils/crypto-utils';
import { parseCookies, createSecureCookie } from '@worker/utils/auth-utils';
import { getCSRFConfig } from '@worker/config/security';
import { captureSecurityEvent } from '@worker/observability/sentry';
import { env } from 'cloudflare:workers'

const logger = createLogger('CsrfService');

interface CSRFTokenData {
    token: string;
    timestamp: number;
}

interface CSRFConfig {
    tokenTTL: number;
    cookieName: string;
    headerName: string;
}

export class CsrfService {
    private readonly config: CSRFConfig;
    private readonly logger = createLogger('CsrfService');

    constructor(config?: Partial<CSRFConfig>) {
        const defaultConfig = getCSRFConfig(env);
        this.config = {
            tokenTTL: config?.tokenTTL ?? defaultConfig.tokenTTL,
            cookieName: config?.cookieName ?? 'csrf-token',
            headerName: config?.headerName ?? 'X-CSRF-Token',
        };
    }
    
    /**
     * Generate a cryptographically secure CSRF token
     */
    generateToken(): string {
        return generateSecureToken(32);
    }
    
    /**
     * Set CSRF token cookie with timestamp
     */
    setTokenCookie(response: Response, token: string, maxAge: number = 7200): void {
        const tokenData: CSRFTokenData = {
            token,
            timestamp: Date.now()
        };
        
        const cookie = createSecureCookie({
            name: this.config.cookieName,
            value: JSON.stringify(tokenData),
            sameSite: 'Strict',
            maxAge
        });
        response.headers.append('Set-Cookie', cookie);
    }
    
    /**
     * Extract CSRF token from cookies with validation
     */
    getTokenFromCookie(request: Request): string | null {
        const cookieHeader = request.headers.get('Cookie');
        if (!cookieHeader) return null;
        
        const cookies = parseCookies(cookieHeader);
        const cookieValue = cookies[this.config.cookieName];
        
        if (!cookieValue) return null;
        
        try {
            const tokenData: CSRFTokenData = JSON.parse(cookieValue);
            
            const now = Date.now();
            const tokenAge = now - tokenData.timestamp;
            
            if (tokenAge > this.config.tokenTTL) {
                this.logger.debug('CSRF token expired', {
                    tokenAge,
                    maxAge: this.config.tokenTTL
                });
                return null;
            }
            return tokenData.token;
        } catch (error) {
            // Handle legacy tokens (plain string) for backward compatibility
            if (typeof cookieValue === 'string' && cookieValue.length > 0) {
                this.logger.debug('Using legacy CSRF token format');
                return cookieValue;
            }
            
            this.logger.warn('Invalid CSRF token format', error);
            return null;
        }
    }
    
    /**
     * Extract CSRF token from request header
     */
    getTokenFromHeader(request: Request): string | null {
        return request.headers.get(this.config.headerName);
    }
    
    /**
     * Validate CSRF token (double-submit cookie pattern)
     */
    validateToken(request: Request): boolean {
        const method = request.method.toUpperCase();
        
        // Skip validation for safe methods
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return true;
        }
        
        // Skip for WebSocket upgrades
        const upgradeHeader = request.headers.get('upgrade');
        if (upgradeHeader?.toLowerCase() === 'websocket') {
            return true;
        }
        
        const cookieToken = this.getTokenFromCookie(request);
        const headerToken = this.getTokenFromHeader(request);
        
        // Both tokens must exist and match
        if (!cookieToken || !headerToken) {
            this.logger.warn('CSRF validation failed: missing token', {
                hasCookie: !!cookieToken,
                hasHeader: !!headerToken,
                method,
                path: new URL(request.url).pathname,
                userAgent: request.headers.get('User-Agent')?.substring(0, 100),
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer')
            });
            captureSecurityEvent('csrf_violation', {
                reason: 'missing_token',
                hasCookie: !!cookieToken,
                hasHeader: !!headerToken,
                method,
                path: new URL(request.url).pathname,
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer'),
            });
            return false;
        }
        
        if (cookieToken !== headerToken) {
            this.logger.warn('CSRF validation failed: token mismatch', {
                method,
                path: new URL(request.url).pathname,
                userAgent: request.headers.get('User-Agent')?.substring(0, 100),
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer'),
                cookieTokenPrefix: cookieToken.substring(0, 8),
                headerTokenPrefix: headerToken.substring(0, 8)
            });
            captureSecurityEvent('csrf_violation', {
                reason: 'token_mismatch',
                method,
                path: new URL(request.url).pathname,
                origin: request.headers.get('Origin'),
                referer: request.headers.get('Referer'),
                cookieTokenPrefix: cookieToken.substring(0, 8),
                headerTokenPrefix: headerToken.substring(0, 8)
            });
            return false;
        }
        
        this.logger.debug('CSRF validation successful', {
            method,
            path: new URL(request.url).pathname
        });
        
        return true;
    }
    
    /**
     * Middleware to enforce CSRF protection with configuration
     */
    async enforce(
        request: Request, 
        response?: Response
    ): Promise<void> {
        // Generate and set token for GET requests (to establish cookie)
        if (request.method === 'GET' && response) {
            const existingToken = this.getTokenFromCookie(request);
            if (!existingToken) {
                const newToken = this.generateToken();
                const maxAge = Math.floor(this.config.tokenTTL / 1000);
                this.setTokenCookie(response, newToken, maxAge);
                this.logger.debug('New CSRF token generated for GET request');
            }
            return;
        }
        
        // Validate token for state-changing requests
        if (!this.validateToken(request)) {
            throw new SecurityError(
                SecurityErrorType.CSRF_VIOLATION,
                'CSRF token validation failed',
                403
            );
        }
    }
    
    /**
     * Get or generate CSRF token for a request with proper rotation
     */
    getOrGenerateToken(
        request: Request, 
        forceNew: boolean = false
    ): string {
        if (forceNew) {
            const newToken = this.generateToken();
            this.logger.debug('Forced generation of new CSRF token');
            return newToken;
        }
        
        const existingToken = this.getTokenFromCookie(request);
        if (existingToken) {
            this.logger.debug('Using existing valid CSRF token');
            return existingToken;
        }
        
        const newToken = this.generateToken();
        this.logger.debug('Generated new CSRF token due to missing/expired token');
        return newToken;
    }
    
    /**
     * Rotate CSRF token (generate new token and invalidate old one)
     */
    rotateToken(response: Response): string {
        const newToken = this.generateToken();
        const maxAge = Math.floor(this.config.tokenTTL / 1000);
        
        this.setTokenCookie(response, newToken, maxAge);
        this.logger.info('CSRF token rotated');
        
        return newToken;
    }
    
    /**
     * Clear CSRF token cookie
     */
    clearTokenCookie(response: Response): void {
        const cookie = createSecureCookie({
            name: this.config.cookieName,
            value: '',
            sameSite: 'Strict',
            maxAge: 0
        });
        response.headers.append('Set-Cookie', cookie);
    }
}
