/**
 * Authentication Middleware
 * Handles JWT validation and session management
 */

import { AuthUser } from '../../types/auth-types';
import { createLogger } from '../../logger';
import { AuthService } from '../../database/services/AuthService';
import { extractToken } from '../../utils/authUtils';

const logger = createLogger('AuthMiddleware');
/**
 * Validate JWT token and return user
 */
export async function validateToken(
    token: string,
    env: Env
): Promise<AuthUser | null> {
    try {
        // Use AuthService for token validation and user retrieval
        const authService = new AuthService(env);
        return authService.validateTokenAndGetUser(token, env);
    } catch (error) {
        logger.error('Token validation error', error);
        return null;
    }
}

/**
 * Authentication middleware
 */
export async function authMiddleware(
    request: Request,
    env: Env
): Promise<AuthUser | null> {
    try {
        // Extract token
        const token = extractToken(request);
        
        if (token) {
            const user = await validateToken(token, env);
            if (user) {
                logger.debug('User authenticated', { userId: user.id });
                return user;
            }
        }
        
        logger.debug('No authentication found');
        return null;
    } catch (error) {
        logger.error('Auth middleware error', error);
        return null;
    }
}