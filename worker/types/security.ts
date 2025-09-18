/**
 * Security-related TypeScript types for the application
 */
import type { AuthUser, AuthSession, OAuthProvider } from './auth-types';

/**
 * Security context passed through middleware
 */
export interface SecurityContext {
    user?: AuthUser;
    session?: AuthSession;
    requestId: string;
    clientIp: string;
}


/**
 * OAuth state for CSRF protection
 */
export interface OAuthState {
    provider: OAuthProvider;
    state: string;
    codeVerifier?: string; // For PKCE
    redirectUri: string;
    createdAt: Date;
}

