/**
 * Secure Authentication Controller
 */

import { AuthService } from '../../../database/services/AuthService';
import { SessionService } from '../../../database/services/SessionService';
import { UserService } from '../../../database/services/UserService';
import { ApiKeyService } from '../../../database/services/ApiKeyService';
import { generateApiKey } from '../../../utils/cryptoUtils';
import { 
    loginSchema, 
    registerSchema, 
    oauthProviderSchema
} from './authSchemas';
import { SecurityError } from '../../../types/security';
import { 
    formatAuthResponse,
    mapUserResponse, 
    setSecureAuthCookies, 
    clearAuthCookies, 
    extractSessionId
} from '../../../utils/authUtils';
import { RouteContext } from '../../types/route-context';
import { authMiddleware } from '../../../middleware/auth/auth';
import { CsrfService } from '../../../services/csrf/CsrfService';
import { BaseController } from '../baseController';
/**
 * Authentication Controller
 */
export class AuthController extends BaseController {
    private authService: AuthService;
    
    constructor(env: Env) {
        super(env);
        this.authService = new AuthService(this.db, env);
    }
    
    /**
     * Check if OAuth providers are configured
     */
    private hasOAuthProviders(env: Env): boolean {
        return (!!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET) || 
               (!!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET);
    }
    
    /**
     * Register a new user
     * POST /api/auth/register
     */
    async register(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Check if OAuth providers are configured - if yes, block email/password registration
            if (this.hasOAuthProviders(env)) {
                return this.createErrorResponse(
                    'Email/password registration is not available when OAuth providers are configured. Please use OAuth login instead.',
                    403
                );
            }

            const bodyResult = await this.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const validatedData = registerSchema.parse(bodyResult.data);

            if (env.ALLOWED_EMAIL && validatedData.email !== env.ALLOWED_EMAIL) {
                return this.createErrorResponse(
                    'Email Whitelisting is enabled. Please use the allowed email to register.',
                    403
                );
            }
            
            const result = await this.authService.register(validatedData, request);
            
            const response = this.createSuccessResponse(
                formatAuthResponse(result.user, undefined, result.expiresIn)
            );
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
                accessTokenExpiry: result.expiresIn
            });
            
            // Rotate CSRF token on successful registration if configured
            if (CsrfService.defaults.rotateOnAuth) {
                CsrfService.rotateToken(response);
            }
            
            return response;
        } catch (error) {
            if (error instanceof SecurityError) {
                return this.createErrorResponse(error.message, error.statusCode);
            }
            
            return this.handleError(error, 'register user');
        }
    }
    
    /**
     * Login with email and password
     * POST /api/auth/login
     */
    async login(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Check if OAuth providers are configured - if yes, block email/password login
            if (this.hasOAuthProviders(env)) {
                return this.createErrorResponse(
                    'Email/password login is not available when OAuth providers are configured. Please use OAuth login instead.',
                    403
                );
            }

            const bodyResult = await this.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const validatedData = loginSchema.parse(bodyResult.data);

            if (env.ALLOWED_EMAIL && validatedData.email !== env.ALLOWED_EMAIL) {
                return this.createErrorResponse(
                    'Email Whitelisting is enabled. Please use the allowed email to login.',
                    403
                );
            }
            
            const result = await this.authService.login(validatedData, request);
            
            const response = this.createSuccessResponse(
                formatAuthResponse(result.user, undefined, result.expiresIn)
            );
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
                accessTokenExpiry: result.expiresIn
            });
            
            // Rotate CSRF token on successful login if configured
            if (CsrfService.defaults.rotateOnAuth) {
                CsrfService.rotateToken(response);
            }
            
            return response;
        } catch (error) {
            if (error instanceof SecurityError) {
                return this.createErrorResponse(error.message, error.statusCode);
            }
            
            return this.handleError(error, 'login user');
        }
    }
    
    /**
     * Logout current user
     * POST /api/auth/logout
     */
    async logout(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const sessionId = extractSessionId(request);
			if (sessionId) {
				try {
					const sessionService = new SessionService(this.db, env);
					await sessionService.revokeSessionId(sessionId);
				} catch (error) {
					this.logger.debug(
						'Failed to properly logout session',
						error,
					);
				}
			}
            
            
            const response = this.createSuccessResponse({ 
                success: true, 
                message: 'Logged out successfully' 
            });
            
            clearAuthCookies(response);
            
            // Clear CSRF token on logout
            CsrfService.clearTokenCookie(response);
            
            return response;
        } catch (error) {
            this.logger.error('Logout failed', error);
            
            const response = this.createSuccessResponse({ 
                success: true, 
                message: 'Logged out' 
            });
            
            clearAuthCookies(response);
            
            // Clear CSRF token on logout
            CsrfService.clearTokenCookie(response);
            
            return response;
        }
    }
    
    /**
     * Get current user profile
     * GET /api/auth/profile
     */
    async getProfile(_request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            // User is provided by middleware - no need for manual authentication
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }
            
            const userService = new UserService(this.db);
            const fullUser = await userService.findUserById(user.id);
            
            if (!fullUser) {
                return this.createErrorResponse('User not found', 404);
            }
            
            return this.createSuccessResponse({
                user: mapUserResponse(fullUser),
                sessionId: user.id // Use user ID as session identifier
            });
        } catch (error) {
            return this.handleError(error, 'get profile');
        }
    }
    
    /**
     * Update user profile
     * PUT /api/auth/profile
     */
    async updateProfile(request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }
            
            const bodyResult = await this.parseJsonBody<{
                displayName?: string;
                username?: string;
                bio?: string;
                theme?: 'light' | 'dark' | 'system';
                timezone?: string;
            }>(request);
            
            if (!bodyResult.success) {
                return bodyResult.response!;
            }
            
            const updateData = bodyResult.data!;
            const userService = new UserService(this.db);
            
            if (updateData.username) {
                const isAvailable = await userService.isUsernameAvailable(updateData.username, user.id);
                if (!isAvailable) {
                    return this.createErrorResponse('Username already taken', 400);
                }
            }
            
            await userService.updateUserProfile(user.id, {
                displayName: updateData.displayName,
                username: updateData.username,
                bio: updateData.bio,
                avatarUrl: undefined,
                timezone: updateData.timezone
            });
            
            const updatedUser = await userService.findUserById(user.id);
            
            if (!updatedUser) {
                return this.createErrorResponse('User not found', 404);
            }
            
            return this.createSuccessResponse({
                user: mapUserResponse(updatedUser),
                message: 'Profile updated successfully'
            });
        } catch (error) {
            return this.handleError(error, 'update profile');
        }
    }
    
    /**
     * Initiate OAuth flow
     * GET /api/auth/oauth/:provider
     */
    async initiateOAuth(request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const validatedProvider = oauthProviderSchema.parse(routeContext.pathParams.provider);
            
            // Get intended redirect URL from query parameter
            const intendedRedirectUrl = routeContext.queryParams.get('redirect_url') || undefined;
            
            const authUrl = await this.authService.getOAuthAuthorizationUrl(
                validatedProvider,
                request,
                intendedRedirectUrl
            );
            
            return Response.redirect(authUrl, 302);
        } catch (error) {
            this.logger.error('OAuth initiation failed', error);
            
            if (error instanceof SecurityError) {
                return this.createErrorResponse(error.message, error.statusCode);
            }
            
            return this.handleError(error, 'initiate OAuth');
        }
    }
    
    /**
     * Handle OAuth callback
     * GET /api/auth/callback/:provider
     */
    async handleOAuthCallback(request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const validatedProvider = oauthProviderSchema.parse(routeContext.pathParams.provider);
            
            const code = routeContext.queryParams.get('code');
            const state = routeContext.queryParams.get('state');
            const error = routeContext.queryParams.get('error');
            
            if (error) {
                this.logger.error('OAuth provider returned error', { provider: validatedProvider, error });
                const baseUrl = new URL(request.url).origin;
                return Response.redirect(`${baseUrl}/?error=oauth_failed`, 302);
            }
            
            if (!code || !state) {
                const baseUrl = new URL(request.url).origin;
                return Response.redirect(`${baseUrl}/?error=missing_params`, 302);
            }
            
            const result = await this.authService.handleOAuthCallback(
                validatedProvider,
                code,
                state,
                request
            );
            
            const baseUrl = new URL(request.url).origin;
            
            // Use stored redirect URL or default to home page
            const redirectLocation = result.redirectUrl || `${baseUrl}/`;
            
            // Create redirect response with secure auth cookies
            const response = new Response(null, {
                status: 302,
                headers: {
                    'Location': redirectLocation
                }
            });
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
            });
            
            return response;
        } catch (error) {
            this.logger.error('OAuth callback failed', error);
            const baseUrl = new URL(request.url).origin;
            return Response.redirect(`${baseUrl}/?error=auth_failed`, 302);
        }
    }

    // GitHub integration method removed - using zero-storage OAuth flow for exports

    /**
     * Check authentication status
     * GET /api/auth/check
     */
    async checkAuth(request: Request, env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            // Use the same middleware authentication logic but don't require auth
            const user = await authMiddleware(request, env);
            
            if (!user) {
                return this.createSuccessResponse({
                    authenticated: false,
                    user: null
                });
            }
            
            return this.createSuccessResponse({
                authenticated: true,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName
                },
                sessionId: user.id
            });
        } catch (error) {
            return this.createSuccessResponse({
                authenticated: false,
                user: null
            });
        }
    }

    /**
     * Get active sessions for current user
     * GET /api/auth/sessions
     */
    async getActiveSessions(_request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }

            const sessionService = new SessionService(this.db, env);
            const sessions = await sessionService.getUserSessions(user.id);

            return this.createSuccessResponse({
                sessions: sessions
            });
        } catch (error) {
            return this.handleError(error, 'get active sessions');
        }
    }

    /**
     * Revoke a specific session
     * DELETE /api/auth/sessions/:sessionId
     */
    async revokeSession(_request: Request, env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }

            // Extract session ID from URL
            const sessionIdToRevoke = routeContext.pathParams.sessionId;

            const sessionService = new SessionService(this.db, env);
            
            await sessionService.revokeSession(sessionIdToRevoke);

            return this.createSuccessResponse({
                message: 'Session revoked successfully'
            });
        } catch (error) {
            return this.handleError(error, 'revoke session');
        }
    }

    /**
     * Get API keys for current user
     * GET /api/auth/api-keys
     */
    async getApiKeys(_request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }

            const apiKeyService = new ApiKeyService(this.db);
            const keys = await apiKeyService.getUserApiKeys(user.id);

            return this.createSuccessResponse({
                keys: keys.map(key => ({
                    id: key.id,
                    name: key.name,
                    keyPreview: key.keyPreview,
                    createdAt: key.createdAt,
                    lastUsed: key.lastUsed,
                    isActive: !!key.isActive
                }))
            });
        } catch (error) {
            return this.handleError(error, 'get API keys');
        }
    }

    /**
     * Create a new API key
     * POST /api/auth/api-keys
     */
    async createApiKey(request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }

            const bodyResult = await this.parseJsonBody<{ name?: string }>(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const { name } = bodyResult.data!;

            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return this.createErrorResponse('API key name is required', 400);
            }

            const sanitizedName = name.trim().substring(0, 100);

            const { key, keyHash, keyPreview } = await generateApiKey();
            
            const apiKeyService = new ApiKeyService(this.db);
            await apiKeyService.createApiKey({
                userId: user.id,
                name: sanitizedName,
                keyHash,
                keyPreview
            });

            this.logger.info('API key created', { userId: user.id, name: sanitizedName });

            return this.createSuccessResponse({
                key, // Return the actual key only once
                keyPreview,
                name: sanitizedName,
                message: 'API key created successfully'
            });
        } catch (error) {
            return this.handleError(error, 'create API key');
        }
    }

    /**
     * Revoke an API key
     * DELETE /api/auth/api-keys/:keyId
     */
    async revokeApiKey(_request: Request, _env: Env, _ctx: ExecutionContext, routeContext: RouteContext): Promise<Response> {
        try {
            const user = routeContext.user;
            if (!user) {
                return this.createErrorResponse('Unauthorized', 401);
            }

            const keyId = routeContext.pathParams.keyId;            
            
            const apiKeyService = new ApiKeyService(this.db);
            await apiKeyService.revokeApiKey(keyId, user.id);

            this.logger.info('API key revoked', { userId: user.id, keyId });

            return this.createSuccessResponse({
                message: 'API key revoked successfully'
            });
        } catch (error) {
            return this.handleError(error, 'revoke API key');
        }
    }

    /**
     * Verify email with OTP
     * POST /api/auth/verify-email
     */
    async verifyEmail(request: Request, _env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const bodyResult = await this.parseJsonBody<{ email: string; otp: string }>(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const { email, otp } = bodyResult.data!;

            if (!email || !otp) {
                return this.createErrorResponse('Email and OTP are required', 400);
            }

            const result = await this.authService.verifyEmailWithOtp(email, otp, request);
            
            const response = this.createSuccessResponse(
                formatAuthResponse(result.user, undefined, result.expiresIn)
            );
            
            setSecureAuthCookies(response, {
                accessToken: result.accessToken,
                accessTokenExpiry: result.expiresIn
            });
            
            return response;
        } catch (error) {
            if (error instanceof SecurityError) {
                return this.createErrorResponse(error.message, error.statusCode);
            }
            
            return this.handleError(error, 'verify email');
        }
    }

    /**
     * Resend verification OTP
     * POST /api/auth/resend-verification
     */
    async resendVerificationOtp(request: Request, _env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const bodyResult = await this.parseJsonBody<{ email: string }>(request);
            if (!bodyResult.success) {
                return bodyResult.response!;
            }

            const { email } = bodyResult.data!;

            if (!email) {
                return this.createErrorResponse('Email is required', 400);
            }

            await this.authService.resendVerificationOtp(email);
            
            return this.createSuccessResponse({
                message: 'Verification code sent successfully'
            });
        } catch (error) {
            if (error instanceof SecurityError) {
                return this.createErrorResponse(error.message, error.statusCode);
            }
            
            return this.handleError(error, 'resend verification OTP');
        }
    }

    /**
     * Get CSRF token with proper expiration and rotation
     * GET /api/auth/csrf-token
     */
    async getCsrfToken(request: Request, _env: Env, _ctx: ExecutionContext, _routeContext: RouteContext): Promise<Response> {
        try {
            const token = CsrfService.getOrGenerateToken(request, false);
            
            const response = this.createSuccessResponse({ 
                token,
                headerName: CsrfService.defaults.headerName,
                expiresIn: Math.floor(CsrfService.defaults.tokenTTL / 1000)
            });
            
            // Set the token in cookie with proper expiration
            const maxAge = Math.floor(CsrfService.defaults.tokenTTL / 1000);
            CsrfService.setTokenCookie(response, token, maxAge);
            
            return response;
        } catch (error) {
            return this.handleError(error, 'get CSRF token');
        }
    }
    
    /**
     * Get available authentication providers
     * GET /api/auth/providers
     */
    async getAuthProviders(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        _context: RouteContext
    ): Promise<Response> {
        try {
            const providers = {
                google: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
                github: !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET,
                email: true
            };
            
            // Include CSRF token with provider info
            const csrfToken = CsrfService.getOrGenerateToken(request, false);
            
            const response = this.createSuccessResponse({
                providers,
                hasOAuth: providers.google || providers.github,
                requiresEmailAuth: !providers.google && !providers.github,
                csrfToken,
                csrfExpiresIn: Math.floor(CsrfService.defaults.tokenTTL / 1000)
            });
            
            // Set CSRF token cookie with proper expiration
            const maxAge = Math.floor(CsrfService.defaults.tokenTTL / 1000);
            CsrfService.setTokenCookie(response, csrfToken, maxAge);
            
            return response;
        } catch (error) {
            console.error('Get auth providers error:', error);
            return this.createErrorResponse('Failed to get authentication providers', 500);
        }
    }
}
