/**
 * Secrets Routes
 * API routes for user secrets management
 */

import { SecretsController } from '../controllers/secrets/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup secrets-related routes
 */
export function setupSecretsRoutes(env: Env, app: Hono<AppEnv>): void {
    const secretsController = new SecretsController(env);
    
    // Create a sub-router for secrets routes
    const secretsRouter = new Hono<AppEnv>();
    
    // Secrets management routes
    secretsRouter.get('/', routeAuthMiddleware(AuthConfig.authenticated), adaptController(secretsController, secretsController.getAllSecrets));
    secretsRouter.post('/', routeAuthMiddleware(AuthConfig.authenticated), adaptController(secretsController, secretsController.storeSecret));
    secretsRouter.patch('/:secretId/toggle', routeAuthMiddleware(AuthConfig.authenticated), adaptController(secretsController, secretsController.toggleSecret));
    secretsRouter.delete('/:secretId', routeAuthMiddleware(AuthConfig.authenticated), adaptController(secretsController, secretsController.deleteSecret));
    
    // Templates route
    secretsRouter.get('/templates', routeAuthMiddleware(AuthConfig.authenticated), adaptController(secretsController, secretsController.getTemplates));
    
    // Mount the router under /api/secrets
    app.route('/api/secrets', secretsRouter);
}