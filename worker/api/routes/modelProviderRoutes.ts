/**
 * Model Provider Routes
 * Routes for custom model provider management
 */

import { ModelProvidersController } from '../controllers/modelProviders/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

export function setupModelProviderRoutes(env: Env, app: Hono<AppEnv>): void {
    const controller = new ModelProvidersController(env);

    // Custom model provider routes
    app.get('/api/user/providers', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.getProviders));
    app.get('/api/user/providers/:id', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.getProvider));
    app.post('/api/user/providers', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.createProvider));
    app.put('/api/user/providers/:id', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.updateProvider));
    app.delete('/api/user/providers/:id', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.deleteProvider));
    app.post('/api/user/providers/test', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.testProvider));
}