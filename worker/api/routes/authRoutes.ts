/**
 * Authentication Routes
 */
import { AuthController } from '../controllers/auth/controller';
// import { RateLimitService } from '../../services/rate-limit/rateLimits';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup authentication routes
 */
export function setupAuthRoutes(env: Env, app: Hono<AppEnv>): void {
    const authController = new AuthController(env);
    
    // Create a sub-router for auth routes
    const authRouter = new Hono<AppEnv>();
    
    // Public authentication routes
    authRouter.get('/csrf-token', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.getCsrfToken));
    authRouter.get('/providers', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.getAuthProviders));
    authRouter.post('/register', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.register));
    authRouter.post('/login', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.login));
    authRouter.post('/verify-email', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.verifyEmail));
    authRouter.post('/resend-verification', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.resendVerificationOtp));
    authRouter.get('/check', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.checkAuth));
    
    // Protected routes (require authentication) - must come before dynamic OAuth routes
    authRouter.get('/profile', routeAuthMiddleware(AuthConfig.authenticated), adaptController(authController, authController.getProfile));
    authRouter.put('/profile', routeAuthMiddleware(AuthConfig.authenticated), adaptController(authController, authController.updateProfile));
    authRouter.post('/logout', routeAuthMiddleware(AuthConfig.authenticated), adaptController(authController, authController.logout));
    
    // Session management routes
    authRouter.get('/sessions', routeAuthMiddleware(AuthConfig.authenticated), adaptController(authController, authController.getActiveSessions));
    authRouter.delete('/sessions/:sessionId', routeAuthMiddleware(AuthConfig.authenticated), adaptController(authController, authController.revokeSession));
    
    // // API Keys management routes
    // authRouter.get('/api-keys', createHandler('getApiKeys'), AuthConfig.authenticated);
    // authRouter.post('/api-keys', createHandler('createApiKey'), AuthConfig.authenticated);
    // authRouter.delete('/api-keys/:keyId', createHandler('revokeApiKey'), AuthConfig.authenticated);
    
    // OAuth routes (under /oauth path to avoid conflicts)
    authRouter.get('/oauth/:provider', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.initiateOAuth));
    authRouter.get('/callback/:provider', routeAuthMiddleware(AuthConfig.public), adaptController(authController, authController.handleOAuthCallback));
    
    // Mount the auth router under /api/auth
    app.route('/api/auth', authRouter);
}
